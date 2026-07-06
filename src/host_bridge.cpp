#include "host_bridge.h"

#ifdef ENABLE_COMPANION

#include "audio.h"
#include "companion.h"
#include "tusb.h"
#include "device/usbd_pvt.h"
#include <cstring>

static uint8_t host_bridge_ep_out = 0;
static CFG_TUD_MEM_ALIGN uint8_t host_bridge_rx_buffer[64];

static void host_bridge_process_report(uint8_t const *report, uint32_t len) {
    if (report == nullptr || len == 0) {
        return;
    }

    const uint8_t report_id = report[0];
    if (report_id == 0x07) {
        audio_handle_bridge_audio_report(report, static_cast<uint16_t>(len));
        return;
    }

    uint8_t const *payload = len > 1 ? report + 1 : report;
    const uint16_t payload_len = static_cast<uint16_t>(len > 1 ? len - 1 : 0);
    if (report_id == COMPANION_REPORT_COMMAND) {
        companion_set_report(report_id, HID_REPORT_TYPE_FEATURE, payload, payload_len);
        return;
    }

    companion_set_report(report_id, HID_REPORT_TYPE_OUTPUT, payload, payload_len);
}

static bool host_bridge_arm_out(uint8_t rhport) {
    if (host_bridge_ep_out == 0) {
        return false;
    }
    return usbd_edpt_xfer(rhport, host_bridge_ep_out, host_bridge_rx_buffer, sizeof(host_bridge_rx_buffer));
}

extern "C" uint16_t host_bridge_get_report(uint8_t report_id, uint8_t *buffer, uint16_t reqlen) {
    if (buffer == nullptr || reqlen == 0) {
        return 0;
    }

    buffer[0] = report_id;
    const uint16_t payload_len = companion_get_report(
        report_id,
        HID_REPORT_TYPE_FEATURE,
        buffer + 1,
        static_cast<uint16_t>(reqlen - 1)
    );
    if (payload_len == 0) {
        return 0;
    }
    return static_cast<uint16_t>(payload_len + 1);
}

extern "C" void host_bridge_set_report(uint8_t const *report, uint16_t len) {
    host_bridge_process_report(report, len);
}

static void host_bridge_driver_init(void) {
    host_bridge_ep_out = 0;
}

static bool host_bridge_driver_deinit(void) {
    host_bridge_ep_out = 0;
    return true;
}

static void host_bridge_driver_reset(uint8_t rhport) {
    (void)rhport;
    host_bridge_ep_out = 0;
}

static uint16_t host_bridge_driver_open(uint8_t rhport, tusb_desc_interface_t const *desc_itf, uint16_t max_len) {
    if (
        desc_itf->bInterfaceClass != TUSB_CLASS_VENDOR_SPECIFIC
        || desc_itf->bInterfaceNumber != HOST_BRIDGE_INTERFACE_NUMBER
    ) {
        return 0;
    }

    uint8_t const *desc_end = reinterpret_cast<uint8_t const *>(desc_itf) + max_len;
    uint8_t const *desc = tu_desc_next(desc_itf);
    uint16_t consumed = static_cast<uint16_t>(
        reinterpret_cast<uintptr_t>(desc) - reinterpret_cast<uintptr_t>(desc_itf)
    );

    host_bridge_ep_out = 0;
    while (tu_desc_in_bounds(desc, desc_end)) {
        const uint8_t desc_type = tu_desc_type(desc);
        if (desc_type == TUSB_DESC_INTERFACE || desc_type == TUSB_DESC_INTERFACE_ASSOCIATION) {
            break;
        }

        if (desc_type == TUSB_DESC_ENDPOINT) {
            auto const *desc_ep = reinterpret_cast<tusb_desc_endpoint_t const *>(desc);
            if (
                desc_ep->bmAttributes.xfer == TUSB_XFER_BULK
                && tu_edpt_dir(desc_ep->bEndpointAddress) == TUSB_DIR_OUT
            ) {
                TU_ASSERT(usbd_edpt_open(rhport, desc_ep), 0);
                host_bridge_ep_out = desc_ep->bEndpointAddress;
            }
        }

        desc = tu_desc_next(desc);
        consumed = static_cast<uint16_t>(
            reinterpret_cast<uintptr_t>(desc) - reinterpret_cast<uintptr_t>(desc_itf)
        );
    }

    if (host_bridge_ep_out == 0) {
        return 0;
    }

    (void)host_bridge_arm_out(rhport);
    return consumed;
}

static bool host_bridge_driver_control_xfer_cb(
    uint8_t rhport,
    uint8_t stage,
    tusb_control_request_t const *request
) {
    (void)rhport;
    (void)stage;
    (void)request;
    return false;
}

static bool host_bridge_driver_xfer_cb(
    uint8_t rhport,
    uint8_t ep_addr,
    xfer_result_t result,
    uint32_t xferred_bytes
) {
    if (ep_addr != host_bridge_ep_out) {
        return true;
    }

    if (result == XFER_RESULT_SUCCESS && xferred_bytes > 0) {
        host_bridge_process_report(host_bridge_rx_buffer, xferred_bytes);
    }
    (void)host_bridge_arm_out(rhport);
    return true;
}

extern "C" usbd_class_driver_t const *host_bridge_usb_driver(void) {
    static usbd_class_driver_t const driver = {
        .name = "HOST_BRIDGE",
        .init = host_bridge_driver_init,
        .deinit = host_bridge_driver_deinit,
        .reset = host_bridge_driver_reset,
        .open = host_bridge_driver_open,
        .control_xfer_cb = host_bridge_driver_control_xfer_cb,
        .xfer_cb = host_bridge_driver_xfer_cb,
        .xfer_isr = nullptr,
        .sof = nullptr,
    };

    return &driver;
}

#endif // ENABLE_COMPANION
