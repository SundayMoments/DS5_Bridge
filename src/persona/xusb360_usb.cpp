#include "persona/xusb360_usb.h"
#include <cstring>

#include "controller_output_submit.h"
#include "dualsense_output.h"
#include "persona/host_persona.h"
#include "persona/xusb360_persona.h"
#include "tusb.h"
#include "device/usbd_pvt.h"
#include "usb.h"

namespace {

uint8_t xusb_rhport = 0;
uint8_t xusb_ep_in = 0;
uint8_t xusb_ep_out = 0;
bool xusb_in_busy = false;
CFG_TUD_MEM_ALIGN uint8_t xusb_rx_buffer[kXusb360EpSize];
CFG_TUD_MEM_ALIGN uint8_t xusb_tx_buffer[kXusb360EpSize];

bool xusb360_arm_out(uint8_t rhport) {
    if (xusb_ep_out == 0) {
        return false;
    }
    return usbd_edpt_xfer(rhport, xusb_ep_out, xusb_rx_buffer, sizeof(xusb_rx_buffer));
}

bool xusb360_send_neutral_report(uint8_t rhport) {
    if (xusb_ep_in == 0 || xusb_in_busy) {
        return false;
    }

    std::memset(xusb_tx_buffer, 0, sizeof(xusb_tx_buffer));
    xusb_tx_buffer[0] = 0x00;
    xusb_tx_buffer[1] = kXusb360InputReportSize;
    xusb_in_busy = usbd_edpt_xfer(rhport, xusb_ep_in, xusb_tx_buffer, kXusb360InputReportSize);
    return xusb_in_busy;
}

void xusb360_driver_init(void) {
    xusb_rhport = 0;
    xusb_ep_in = 0;
    xusb_ep_out = 0;
    xusb_in_busy = false;
}

bool xusb360_driver_deinit(void) {
    xusb360_driver_init();
    return true;
}

void xusb360_driver_reset(uint8_t rhport) {
    (void)rhport;
    xusb360_driver_init();
}

uint16_t xusb360_driver_open(uint8_t rhport, tusb_desc_interface_t const *desc_itf, uint16_t max_len) {
    if (
        desc_itf->bInterfaceNumber != kXusb360InterfaceNumber
        || desc_itf->bInterfaceClass != TUSB_CLASS_VENDOR_SPECIFIC
        || desc_itf->bInterfaceSubClass != 0x5d
        || desc_itf->bInterfaceProtocol != 0x01
    ) {
        return 0;
    }

    uint8_t const *desc_end = reinterpret_cast<uint8_t const *>(desc_itf) + max_len;
    uint8_t const *desc = tu_desc_next(desc_itf);
    uint16_t consumed = static_cast<uint16_t>(
        reinterpret_cast<uintptr_t>(desc) - reinterpret_cast<uintptr_t>(desc_itf)
    );

    xusb_ep_in = 0;
    xusb_ep_out = 0;
    while (tu_desc_in_bounds(desc, desc_end)) {
        const uint8_t desc_type = tu_desc_type(desc);
        if (desc_type == TUSB_DESC_INTERFACE || desc_type == TUSB_DESC_INTERFACE_ASSOCIATION) {
            break;
        }

        if (desc_type == TUSB_DESC_ENDPOINT) {
            auto const *desc_ep = reinterpret_cast<tusb_desc_endpoint_t const *>(desc);
            if (desc_ep->bmAttributes.xfer == TUSB_XFER_INTERRUPT) {
                TU_ASSERT(usbd_edpt_open(rhport, desc_ep), 0);
                if (tu_edpt_dir(desc_ep->bEndpointAddress) == TUSB_DIR_IN) {
                    xusb_ep_in = desc_ep->bEndpointAddress;
                } else {
                    xusb_ep_out = desc_ep->bEndpointAddress;
                }
            }
        }

        desc = tu_desc_next(desc);
        consumed = static_cast<uint16_t>(
            reinterpret_cast<uintptr_t>(desc) - reinterpret_cast<uintptr_t>(desc_itf)
        );
    }

    if (xusb_ep_in == 0 || xusb_ep_out == 0) {
        xusb_ep_in = 0;
        xusb_ep_out = 0;
        return 0;
    }

    xusb_rhport = rhport;
    xusb_in_busy = false;
    (void)xusb360_arm_out(rhport);
    (void)xusb360_send_neutral_report(rhport);
    return consumed;
}

bool xusb360_driver_control_xfer_cb(
    uint8_t rhport,
    uint8_t stage,
    tusb_control_request_t const *request
) {
    (void)rhport;
    (void)stage;
    (void)request;
    return false;
}

bool xusb360_driver_xfer_cb(
    uint8_t rhport,
    uint8_t ep_addr,
    xfer_result_t result,
    uint32_t xferred_bytes
) {
    if (ep_addr == xusb_ep_in) {
        xusb_in_busy = false;
        return true;
    }

    if (ep_addr != xusb_ep_out) {
        return true;
    }

    if (result == XFER_RESULT_SUCCESS && xferred_bytes > 0) {
        uint8_t payload[ds5::output::kCommonPayloadSize]{};
        uint16_t payload_len = 0;
        if (host_persona_decode_output_to_ds5_payload(
            HostPersonaModeXusb360,
            xusb_rx_buffer,
            static_cast<uint16_t>(xferred_bytes),
            payload,
            sizeof(payload),
            payload_len
        )) {
            usb_note_hid_output();
            controller_output_submit_usb_payload(payload, payload_len);
        }
    }
    (void)xusb360_arm_out(rhport);
    return true;
}

} // namespace

bool xusb360_usb_ready() {
    return xusb_ep_in != 0 && !xusb_in_busy;
}

bool xusb360_usb_send_report(uint8_t const *report, uint8_t len) {
    if (report == nullptr || len == 0 || len > sizeof(xusb_tx_buffer) || !xusb360_usb_ready()) {
        return false;
    }

    std::memset(xusb_tx_buffer, 0, sizeof(xusb_tx_buffer));
    std::memcpy(xusb_tx_buffer, report, len);
    xusb_in_busy = usbd_edpt_xfer(xusb_rhport, xusb_ep_in, xusb_tx_buffer, len);
    return xusb_in_busy;
}

extern "C" usbd_class_driver_t const *xusb360_usb_driver(void) {
    static usbd_class_driver_t const driver = {
        .name = "XUSB360",
        .init = xusb360_driver_init,
        .deinit = xusb360_driver_deinit,
        .reset = xusb360_driver_reset,
        .open = xusb360_driver_open,
        .control_xfer_cb = xusb360_driver_control_xfer_cb,
        .xfer_cb = xusb360_driver_xfer_cb,
        .xfer_isr = nullptr,
        .sof = nullptr,
    };

    return &driver;
}
