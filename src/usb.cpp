//
// Created by awalol on 2026/3/4.
// Modified for DS5 Bridge companion firmware and app integration.
//

#include "tusb.h"
#include "bsp/board_api.h"
#include "hardware/watchdog.h"
#include "pico/time.h"
#include <algorithm>
#include <cmath>

#include "audio.h"
#include "bt.h"
#include "host_input.h"
#include "persona/host_persona.h"
#include "usb.h"
#include "wolwifi.h"

uint8_t mute[2]; // 0: speaker/LED fallback, 1: mic/idle-disconnect fallback
float volume[2] = {DEFAULT_COMPANION_SPEAKER_GAIN, 1.0f}; // 0: companion speaker gain 0-1, 1: haptics gain 0-5
uint8_t usb_host_volume_percent[3] = {100, 100, 100};
uint8_t usb_host_mute[3] = {0, 0, 0};
uint32_t usb_host_volume_set_count[3] = {0, 0, 0};
float usb_host_speaker_gain = 1.0f;
static uint32_t usb_last_hid_output_us = 0;
static uint8_t usb_hid_polling_rate = 2;
static bool usb_suspend_disconnect = true;
static volatile bool usb_speaker_streaming = false;
static volatile bool usb_mic_streaming = false;
static volatile bool usb_line_streaming = false;
static bool usb_reconnect_requested = false;
static bool usb_reconnect_connect_pending = false;
static uint32_t usb_reconnect_at_us = 0;
static bool usb_controller_transport_ready = false;
static bool usb_controller_transport_transition_pending = false;
static bool usb_controller_transport_attached = false;
static uint32_t usb_controller_transport_disconnect_not_before_us = 0;
static volatile bool usb_mounted = false;
static volatile bool usb_host_suspended = false;
static volatile uint32_t usb_suspend_at_us = 0;
static volatile uint32_t usb_reconnect_grace_until_us = 0;
static volatile bool usb_remote_wakeup_armed = false;
static volatile bool usb_remote_wakeup_pending = false;
static volatile bool usb_wake_on_connect = true;

extern "C" {
uint8_t usb_hid_polling_interval_ms_value = 1;
}

#define UAC1_ENTITY_SPK_FEATURE_UNIT    0x02
#define UAC1_ENTITY_MIC_FEATURE_UNIT    0x05
#define UAC1_ENTITY_LINE_FEATURE_UNIT   0x08
#define HID_OUTPUT_ACTIVE_US            500000
#define USB_RECONNECT_DELAY_US          50000
#define USB_RECONNECT_HOLD_US           100000
#define USB_SUSPEND_POWEROFF_DEBOUNCE_US 3000000
#define USB_RECONNECT_GRACE_US          5000000
#define USB_EXPECTED_DISCONNECT_GRACE_US 1500000

enum UsbAudioDebugKind : uint8_t {
    UsbAudioDebugSetInterface = 1,
    UsbAudioDebugGetEntity = 2,
    UsbAudioDebugSetEntity = 3,
};

struct UsbAudioVolumeRange {
    int16_t min;
    int16_t max;
    int16_t res;
};

static constexpr UsbAudioVolumeRange kUsbAudioVolumeRanges[3] = {
    {-100 * 256, 0, 1 * 256},
    {0, 48 * 256, 0x007a},
    {0, 48 * 256, 0x007a},
};

static bool time_reached(uint32_t now, uint32_t target) {
    return static_cast<int32_t>(now - target) >= 0;
}

static void sleep_ms_with_watchdog(uint32_t total_ms) {
    while (total_ms > 0) {
        watchdog_update();
        const uint32_t chunk_ms = std::min<uint32_t>(total_ms, 10);
        sleep_ms(chunk_ms);
        total_ms -= chunk_ms;
    }
    watchdog_update();
}

static bool reconnect_grace_active(uint32_t now) {
    return usb_reconnect_grace_until_us != 0
        && !time_reached(now, usb_reconnect_grace_until_us);
}

static bool usb_bus_suspended() {
    return usb_host_suspended || (tud_inited() && tud_suspended());
}

static bool usb_wake_retention_enabled_for_persona() {
    return usb_wake_on_connect
        && host_persona_active() != HostPersonaModeXusb360;
}

static uint8_t hid_polling_interval_for_mode(uint8_t mode) {
    switch (mode) {
        case 0:
            return 4;
        case 1:
            return 2;
        case 2:
        default:
            return 1;
    }
}

static void usb_schedule_reconnect() {
    usb_reconnect_requested = true;
    usb_reconnect_at_us = time_us_32() + USB_RECONNECT_DELAY_US;
}

static void usb_note_reconnect_disconnect(uint32_t now) {
    usb_reconnect_grace_until_us = now + USB_RECONNECT_GRACE_US;
    usb_suspend_at_us = 0;
}

void usb_request_reconnect() {
    usb_schedule_reconnect();
}

static void usb_reset_audio_class_state() {
    usb_last_hid_output_us = 0;
    usb_speaker_streaming = false;
    usb_mic_streaming = false;
    usb_line_streaming = false;
    for (uint8_t i = 0; i < 3; i++) {
        usb_host_volume_percent[i] = 100;
        usb_host_mute[i] = 0;
        usb_host_volume_set_count[i] = 0;
    }
    usb_host_speaker_gain = 1.0f;
    if (tud_inited()) {
        tud_audio_clear_ep_out_ff();
        tud_audio_n_clear_ep_in_ff(0);
        tud_audio_n_clear_ep_in_ff(1);
    }
}

void usb_device_stack_init_disconnected() {
    const bool initialized_now = !tud_inited();
    if (!tud_inited()) {
        tusb_rhport_init_t dev_init = {
            .role = TUSB_ROLE_DEVICE,
            .speed = TUSB_SPEED_FULL
        };
        tusb_init(BOARD_TUD_RHPORT, &dev_init);
        // TinyUSB connects during initialization. Detach immediately so the
        // host never observes a half-settled controller descriptor topology.
        tud_disconnect();
    }
    usb_mounted = false;
    usb_reset_audio_class_state();
    if (initialized_now) {
        sleep_ms_with_watchdog(150);
    }
    if (!initialized_now) {
        tud_disconnect();
    }
}

static void usb_connect_controller_transport(uint32_t now) {
    (void)now;
    usb_controller_transport_ready = true;
    if (usb_controller_transport_attached) {
        return;
    }
    usb_device_stack_init_disconnected();
    tud_connect();
    usb_controller_transport_attached = true;
}

uint8_t usb_hid_polling_rate_mode() {
    return usb_hid_polling_rate;
}

bool usb_set_hid_polling_rate_mode(uint8_t mode) {
    if (mode > 2) {
        return false;
    }

    const bool changed = usb_hid_polling_rate != mode;
    usb_hid_polling_rate = mode;
    usb_hid_polling_interval_ms_value = hid_polling_interval_for_mode(mode);
    if (changed) {
        usb_schedule_reconnect();
    }
    return true;
}

void usb_note_hid_output() {
    usb_last_hid_output_us = time_us_32();
}

bool usb_host_hid_output_recent() {
    return usb_last_hid_output_us != 0
        && static_cast<uint32_t>(time_us_32() - usb_last_hid_output_us) < HID_OUTPUT_ACTIVE_US;
}

void usb_set_suspend_disconnect_enabled(bool enabled) {
    usb_suspend_disconnect = enabled;
}

bool usb_suspend_disconnect_enabled() {
    return usb_suspend_disconnect;
}

bool usb_host_suspended_active() {
    return usb_bus_suspended();
}

// True only while the host is both enumerated and awake -- i.e. actually
// running, not merely powered enough to keep the bus alive. Used by
// wolwifi.cpp to skip sending WOL (and the lightbar's in-progress pulse)
// when the target PC this board is plugged into is already on; see
// WOL_ALWAYS in CMakeLists.txt for the escape hatch on boards where this
// heuristic can't distinguish "off" from "on" (USB stays active in S5, or
// Modern Standby).
bool usb_host_active() {
    return usb_mounted && !usb_bus_suspended();
}

bool __not_in_flash_func(usb_speaker_streaming_active)() {
    return usb_speaker_streaming;
}

bool __not_in_flash_func(usb_mic_streaming_active)() {
    return usb_mic_streaming;
}

bool usb_line_streaming_active() {
    return usb_line_streaming;
}

void usb_wake_host_if_suspended() {
    // This function is called from BTstack callbacks. Publish the request here,
    // then let usb_pm_poll issue it from the normal TinyUSB task context.
    if (
        usb_bus_suspended()
        && usb_wake_retention_enabled_for_persona()
        && usb_remote_wakeup_armed
    ) {
        usb_remote_wakeup_pending = true;
    }
}

void usb_set_wake_on_connect(bool enabled) {
    usb_wake_on_connect = enabled;
    if (!enabled) {
        usb_remote_wakeup_pending = false;
        if (!usb_controller_transport_ready && usb_controller_transport_attached) {
            usb_controller_transport_transition_pending = true;
        }
    }
}

bool usb_wake_on_connect_enabled() {
    return usb_wake_on_connect;
}

bool usb_controller_transport_retained_for_wake() {
    return usb_controller_transport_attached
        && !usb_controller_transport_ready
        && usb_wake_retention_enabled_for_persona();
}

void usb_handle_controller_transport_disconnect(bool expected_disconnect) {
    usb_reconnect_requested = false;
    usb_reconnect_connect_pending = false;
    usb_controller_transport_ready = false;
    usb_controller_transport_disconnect_not_before_us = expected_disconnect
        ? time_us_32() + USB_EXPECTED_DISCONNECT_GRACE_US
        : 0;
    // Bluetooth callbacks only publish desired state. TinyUSB is reconciled
    // from usb_pm_poll at the top level, so a controller loss can never tear
    // the USB stack down from inside cyw43_arch_poll or a TinyUSB callback.
    usb_controller_transport_transition_pending = true;
}

void usb_handle_controller_transport_ready() {
    usb_wake_host_if_suspended();
    if (
        usb_controller_transport_ready
        && !usb_controller_transport_transition_pending
    ) {
        return;
    }
    usb_controller_transport_disconnect_not_before_us = 0;
    usb_controller_transport_ready = true;
    usb_controller_transport_transition_pending = true;
}

extern "C" void tud_mount_cb(void) {
    usb_mounted = true;
    usb_host_suspended = false;
    usb_remote_wakeup_armed = false;
    usb_remote_wakeup_pending = false;
    usb_suspend_at_us = 0;
    usb_reconnect_grace_until_us = 0;
    host_input_note_usb_mounted();
}

extern "C" void tud_umount_cb(void) {
    usb_mounted = false;
    usb_remote_wakeup_armed = false;
    usb_remote_wakeup_pending = false;
    usb_speaker_streaming = false;
    usb_mic_streaming = false;
    usb_line_streaming = false;
}

extern "C" bool tud_audio_set_itf_cb(uint8_t rhport, tusb_control_request_t const *p_request) {
    (void)rhport;
    const uint8_t itf = tu_u16_low(p_request->wIndex);
    const uint8_t alt = tu_u16_low(p_request->wValue);

    if (itf == 1) {
        usb_speaker_streaming = alt != 0;
    } else if (itf == 2) {
        usb_mic_streaming = alt != 0;
    } else if (itf == 4) {
        usb_line_streaming = alt != 0;
    }
    audio_debug_note_usb_event(
        UsbAudioDebugSetInterface,
        itf,
        alt,
        usb_speaker_streaming ? 1 : 0,
        static_cast<uint8_t>((usb_mic_streaming ? 1 : 0) | (usb_line_streaming ? 2 : 0))
    );

    return true;
}

extern "C" void tud_suspend_cb(bool remote_wakeup_en) {
    usb_remote_wakeup_armed = remote_wakeup_en;
    const uint32_t now = time_us_32();
    if (reconnect_grace_active(now)) {
        usb_suspend_at_us = 0;
        return;
    }
    usb_host_suspended = true;
    if (usb_suspend_disconnect) {
        usb_suspend_at_us = now;
    } else {
        usb_suspend_at_us = 0;
    }
    usb_speaker_streaming = false;
    usb_mic_streaming = false;
    usb_line_streaming = false;
}

extern "C" void tud_resume_cb(void) {
    usb_host_suspended = false;
    usb_remote_wakeup_armed = false;
    usb_remote_wakeup_pending = false;
    usb_suspend_at_us = 0;
}

void usb_pm_poll() {
    const uint32_t now = time_us_32();
    if (usb_reconnect_grace_until_us != 0 && time_reached(now, usb_reconnect_grace_until_us)) {
        usb_reconnect_grace_until_us = 0;
    }

    if (
        usb_suspend_at_us != 0
        && usb_host_suspended
        && static_cast<uint32_t>(now - usb_suspend_at_us) >= USB_SUSPEND_POWEROFF_DEBOUNCE_US
    ) {
        // A WOL send needs the controller connection kept alive long enough
        // to actually wake the PC back up -- powering the controller off
        // here (its normal battery-saving behavior once the host has been
        // suspended for a few seconds) would cut that attempt short before
        // it has a chance to succeed. Defer the power-off while a wake is
        // in progress (leave usb_suspend_at_us set so this re-checks every
        // tick and fires as soon as the wake finishes, confirmed or timed
        // out, instead of being skipped outright).
        if (!wolwifi_wake_in_progress()) {
            (void)bt_power_off_controller();
            usb_suspend_at_us = 0;
        }
    }

    if (usb_remote_wakeup_pending) {
        usb_remote_wakeup_pending = false;
        if (
            usb_wake_on_connect
            && usb_remote_wakeup_armed
            && usb_bus_suspended()
            && tud_inited()
        ) {
            (void)tud_remote_wakeup();
        }
    }

    if (usb_bus_suspended()) {
        return;
    }

    if (
        !usb_controller_transport_ready
        && usb_controller_transport_attached
        && !usb_wake_retention_enabled_for_persona()
        && !usb_controller_transport_transition_pending
        && !usb_reconnect_connect_pending
        && !usb_reconnect_requested
    ) {
        usb_controller_transport_transition_pending = true;
    }

    if (usb_controller_transport_transition_pending) {
        if (
            !usb_controller_transport_ready
            && usb_controller_transport_disconnect_not_before_us != 0
            && !time_reached(now, usb_controller_transport_disconnect_not_before_us)
        ) {
            return;
        }
        usb_controller_transport_transition_pending = false;
        usb_controller_transport_disconnect_not_before_us = 0;
        if (usb_controller_transport_ready) {
            if (usb_controller_transport_attached) {
                return;
            }
            usb_mounted = false;
            usb_reset_audio_class_state();
            // The stack is initialized once before Bluetooth starts. Keep the
            // defensive initializer for an exceptional recovery path, but it
            // now runs only from this top-level poll, never a packet callback.
            usb_connect_controller_transport(now);
        } else if (usb_controller_transport_attached && tud_inited()) {
            usb_reset_audio_class_state();
            if (usb_wake_retention_enabled_for_persona()) {
                // Keep the full native controller persona enumerated as the
                // wake target after the physical controller goes to sleep.
                // Controller state is still reported as disconnected, and a
                // neutral input report clears any held controls.
                return;
            }
            // Wake is disabled or unsupported by this persona. A soft detach
            // hides the emulated controller while preserving TinyUSB state.
            usb_controller_transport_attached = false;
            usb_mounted = false;
            tud_disconnect();
        }
        return;
    }

    if (usb_reconnect_connect_pending && time_reached(now, usb_reconnect_at_us)) {
        usb_reconnect_connect_pending = false;
        tud_connect();
    }
    if (usb_reconnect_requested && time_reached(now, usb_reconnect_at_us)) {
        usb_reconnect_requested = false;
        usb_reconnect_connect_pending = true;
        usb_reconnect_at_us = now + USB_RECONNECT_HOLD_US;
        usb_note_reconnect_disconnect(now);
        tud_disconnect();
        return;
    }

}

static UsbAudioVolumeRange const &usb_volume_range(uint8_t index) {
    return kUsbAudioVolumeRanges[index < 3 ? index : 1];
}

static int16_t usb_volume_units_from_buffer(uint8_t index, uint8_t const *buffer) {
    UsbAudioVolumeRange const &range = usb_volume_range(index);
    const int16_t raw_units = static_cast<int16_t>(tu_unaligned_read16(buffer));
    return std::clamp(raw_units, range.min, range.max);
}

static int16_t percent_to_usb_volume_units(uint8_t index, float percent) {
    UsbAudioVolumeRange const &range = usb_volume_range(index);
    const float clamped_percent = std::clamp(percent, 0.0f, 100.0f);
    return static_cast<int16_t>(
        static_cast<float>(range.min)
            + (static_cast<float>(range.max - range.min) * clamped_percent / 100.0f)
    );
}

static float usb_volume_units_to_percent(uint8_t index, uint8_t const *buffer) {
    UsbAudioVolumeRange const &range = usb_volume_range(index);
    const int16_t clamped_units = usb_volume_units_from_buffer(index, buffer);
    const float span = static_cast<float>(range.max - range.min);
    if (span <= 0.0f) {
        return 100.0f;
    }
    return std::clamp(
        (static_cast<float>(clamped_units - range.min) * 100.0f) / span,
        0.0f,
        100.0f
    );
}

static float usb_volume_units_to_gain(uint8_t index, uint8_t const *buffer) {
    const int16_t clamped_units = usb_volume_units_from_buffer(index, buffer);
    const float db = static_cast<float>(clamped_units) / 256.0f;
    return index == 0 ? std::pow(10.0f, db / 20.0f) : 1.0f;
}

static float current_host_volume_percent(uint8_t index) {
    return usb_host_volume_percent[index < 3 ? index : 1];
}

static uint8_t usb_audio_control_index_for_entity(uint8_t entityID) {
    if (entityID == UAC1_ENTITY_SPK_FEATURE_UNIT) {
        return 0;
    }
    if (entityID == UAC1_ENTITY_LINE_FEATURE_UNIT) {
        return 2;
    }
    return 1;
}

//--------------------------------------------------------------------+
// Audio Callback Functions
//--------------------------------------------------------------------+

//--------------------------------------------------------------------+
// UAC1 Helper Functions
//--------------------------------------------------------------------+

static bool audio10_set_req_entity(tusb_control_request_t const *p_request, uint8_t *pBuff) {
    uint8_t ctrlSel = TU_U16_HIGH(p_request->wValue);
    uint8_t entityID = TU_U16_HIGH(p_request->wIndex);
    uint8_t index = usb_audio_control_index_for_entity(entityID);
    audio_debug_note_usb_event(
        UsbAudioDebugSetEntity,
        entityID,
        ctrlSel,
        p_request->bRequest,
        p_request->wLength
    );

    // If request is for our speaker feature unit
    if (
        entityID == UAC1_ENTITY_SPK_FEATURE_UNIT
        || entityID == UAC1_ENTITY_MIC_FEATURE_UNIT
        || entityID == UAC1_ENTITY_LINE_FEATURE_UNIT
    ) {
        switch (ctrlSel) {
            case AUDIO10_FU_CTRL_MUTE:
                switch (p_request->bRequest) {
                    case AUDIO10_CS_REQ_SET_CUR:
                        // Only 1st form is supported
                        TU_VERIFY(p_request->wLength == 1);

                        usb_host_mute[index] = pBuff[0] ? 1 : 0;

                        TU_LOG2("    Set Mute: %d of entity: %u\r\n", usb_host_mute[index], entityID);
                        return true;

                    default:
                        return false; // not supported
                }

            case AUDIO10_FU_CTRL_VOLUME:
                switch (p_request->bRequest) {
                    case AUDIO10_CS_REQ_SET_CUR: {
                        // Only 1st form is supported
                        TU_VERIFY(p_request->wLength == 2);

                        const float host_percent = usb_volume_units_to_percent(index, pBuff);
                        usb_host_volume_percent[index] = static_cast<uint8_t>(host_percent);
                        usb_host_volume_set_count[index]++;
                        if (index == 0) {
                            usb_host_speaker_gain = usb_volume_units_to_gain(index, pBuff);
                        }

                        TU_LOG2("    Set Volume: %u%% of entity: %u\r\n", static_cast<uint8_t>(host_percent), entityID);
                        return true;
                    }

                    default:
                        return false; // not supported
                }

            // Unknown/Unsupported control
            default:
                TU_BREAKPOINT();
                return false;
        }
    }

    return false;
}

static bool audio10_get_req_entity(uint8_t rhport, tusb_control_request_t const *p_request) {
    uint8_t ctrlSel = TU_U16_HIGH(p_request->wValue);
    uint8_t entityID = TU_U16_HIGH(p_request->wIndex);
    uint8_t index = usb_audio_control_index_for_entity(entityID);
    audio_debug_note_usb_event(
        UsbAudioDebugGetEntity,
        entityID,
        ctrlSel,
        p_request->bRequest,
        p_request->wLength
    );

    // If request is for our speaker feature unit
    if (
        entityID == UAC1_ENTITY_SPK_FEATURE_UNIT
        || entityID == UAC1_ENTITY_MIC_FEATURE_UNIT
        || entityID == UAC1_ENTITY_LINE_FEATURE_UNIT
    ) {
        switch (ctrlSel) {
            case AUDIO10_FU_CTRL_MUTE:
                // Audio control mute cur parameter block consists of only one byte - we thus can send it right away
                // There does not exist a range parameter block for mute
                TU_LOG2("    Get Mute of entity: %u\r\n", entityID);
                return tud_audio_buffer_and_schedule_control_xfer(rhport, p_request, &usb_host_mute[index], 1);

            case AUDIO10_FU_CTRL_VOLUME:
                switch (p_request->bRequest) {
                    case AUDIO10_CS_REQ_GET_CUR:
                        TU_LOG2("    Get Volume of entity: %u\r\n", entityID); {
                            int16_t vol = percent_to_usb_volume_units(index, current_host_volume_percent(index));
                            return tud_audio_buffer_and_schedule_control_xfer(rhport, p_request, &vol, sizeof(vol));
                        }

                    case AUDIO10_CS_REQ_GET_MIN:
                        TU_LOG2("    Get Volume min of entity: %u\r\n", entityID); {
                            int16_t min = usb_volume_range(index).min;
                            return tud_audio_buffer_and_schedule_control_xfer(rhport, p_request, &min, sizeof(min));
                        }

                    case AUDIO10_CS_REQ_GET_MAX:
                        TU_LOG2("    Get Volume max of entity: %u\r\n", entityID); {
                            int16_t max = usb_volume_range(index).max;
                            return tud_audio_buffer_and_schedule_control_xfer(rhport, p_request, &max, sizeof(max));
                        }

                    case AUDIO10_CS_REQ_GET_RES:
                        TU_LOG2("    Get Volume res of entity: %u\r\n", entityID); {
                            int16_t res = usb_volume_range(index).res;
                            return tud_audio_buffer_and_schedule_control_xfer(rhport, p_request, &res, sizeof(res));
                        }
                    // Unknown/Unsupported control
                    default:
                        TU_BREAKPOINT();
                        return false;
                }
                break;

            // Unknown/Unsupported control
            default:
                TU_BREAKPOINT();
                return false;
        }
    }

    return false;
}

// Invoked when audio class specific get request received for an entity
bool tud_audio_get_req_entity_cb(uint8_t rhport, tusb_control_request_t const *p_request) {
    (void) rhport;

    return audio10_get_req_entity(rhport, p_request);
}

// Invoked when audio class specific set request received for an entity
bool tud_audio_set_req_entity_cb(uint8_t rhport, tusb_control_request_t const *p_request, uint8_t *buf) {
    (void) rhport;

    return audio10_set_req_entity(p_request, buf);
}

void tud_hid_report_complete_cb(uint8_t instance, uint8_t const *report, uint16_t len) {
    (void) instance;
    (void) len;
}
