//
// Created by awalol on 2026/3/4.
// Modified for DS5 Bridge companion firmware and app integration.
//

#include <algorithm>
#include <cstdio>
#include "bsp/board_api.h"
#include "button_functions.h"
#include "bt.h"
#include "controller_packet_compositor.h"
#include "controller_output_policy.h"
#include "controller_output_submit.h"
#include "utils.h"
#include "resample.h"
#include "audio.h"
#include "usb.h"
#include "host_input.h"
#include "controller_report.h"
#include "dualsense_input_decoder.h"
#include "dualsense_output.h"
#include "persona/ds4_persona.h"
#include "persona/dualsense_persona.h"
#include "persona/host_persona.h"
#include "persona/xusb360_usb.h"
#include "hardware/clocks.h"
#include "hardware/vreg.h"
#include "hardware/watchdog.h"
#include "pico/cyw43_arch.h"
#include "pico/time.h"
#ifdef ENABLE_COMPANION
#include "companion.h"
#endif

// Pico SDK support for waiting on conditions.
#include "pico/critical_section.h"

int reportSeqCounter = 0;
static constexpr uint32_t HOST_LIGHTBAR_RESTORE_DELAY_MS = 3000;
static constexpr uint32_t HOST_PERSONA_SWITCH_INPUT_FALLBACK_US = 3'000'000;

enum HidDebugKind : uint8_t {
    HidDebugGetReport = 1,
    HidDebugSetReport = 2,
    HidDebugInputReport = 3,
};

static uint32_t last_input_debug_us = 0;
static uint8_t input_debug_burst_remaining = 0;

static void note_usb_input_report(uint8_t const *report, uint16_t len) {
#if !DS5_AUDIO_DEBUG_ENABLED
    (void)report;
    (void)len;
    return;
#else
    const uint32_t now = time_us_32();
    if (last_input_debug_us == 0 || static_cast<uint32_t>(now - last_input_debug_us) > 250000) {
        input_debug_burst_remaining = 8;
    }
    last_input_debug_us = now;
    if (input_debug_burst_remaining == 0) {
        return;
    }
    input_debug_burst_remaining--;
    audio_debug_note_hid_event(
        HidDebugInputReport,
        0x01,
        0,
        len,
        len > 7 && report != nullptr ? report[7] : 0
    );
#endif
}

static bool companion_lightbar_override_active() {
#ifdef ENABLE_COMPANION
    return companion_lightbar_override_enabled();
#else
    return false;
#endif
}

void controller_output_submit_usb_payload(uint8_t const *payload, uint16_t payload_len) {
    uint8_t outputData[78]{};
    controller_packet_init_bt_output_report(outputData, reportSeqCounter);
    uint16_t payloadLen = payload_len;
    if (payloadLen > sizeof(outputData) - 3) {
        payloadLen = sizeof(outputData) - 3;
    }
    if (payloadLen > 0) {
        if (payload == nullptr) {
            payloadLen = 0;
        } else {
            memcpy(outputData + 3, payload, payloadLen);
        }
    }

    const bool lightbarOverride = companion_lightbar_override_active();
    const bool hostClearsLeds = controller_output_policy_host_output_clears_leds(outputData + 3, payloadLen);
#ifdef ENABLE_COMPANION
    const bool triggerIntensityChanged = companion_apply_trigger_effect_intensity(outputData + 3, payloadLen);
    uint8_t companionOutput[sizeof(outputData)]{};
    memcpy(companionOutput, outputData, sizeof(companionOutput));
    bool sanitizedHostOutput = triggerIntensityChanged || controller_output_policy_sanitize_host_lightbar_payload(
        companionOutput + 3,
        payloadLen,
        lightbarOverride
    );
    sanitizedHostOutput = controller_output_policy_sanitize_host_speaker_amp_report(companionOutput, sizeof(companionOutput))
        || sanitizedHostOutput;
    sanitizedHostOutput = controller_output_policy_sanitize_host_mic_report(companionOutput, sizeof(companionOutput))
        || sanitizedHostOutput;
    if (sanitizedHostOutput) {
        uint8_t forwardedHostReport[48]{};
        uint16_t forwardedLen = static_cast<uint16_t>(payloadLen + 1);
        if (forwardedLen > sizeof(forwardedHostReport)) {
            forwardedLen = sizeof(forwardedHostReport);
        }
        if (forwardedLen > 0) {
            forwardedHostReport[0] = 0x02;
            if (forwardedLen > 1) {
                memcpy(forwardedHostReport + 1, companionOutput + 3, forwardedLen - 1);
            }
            companion_note_host_output_report(forwardedHostReport, forwardedLen);
        }
    }
    uint8_t audioStateData[sizeof(outputData) - 3]{};
    if (payloadLen > 0) {
        memcpy(audioStateData, outputData + 3, payloadLen);
    }
    // 0x36 carries an audio-state snapshot while speaker streaming. Strip
    // game LEDs only when the companion lightbar override is explicitly on.
    controller_output_policy_sanitize_host_lightbar_payload(
        audioStateData,
        payloadLen,
        lightbarOverride
    );
    controller_output_policy_sanitize_host_speaker_amp_payload(audioStateData, payloadLen);
    controller_output_policy_sanitize_host_mic_payload(audioStateData, payloadLen);
    controller_output_policy_apply_classic_rumble_gain_payload(audioStateData, payloadLen);
    audio_set_state_data(audioStateData, static_cast<uint8_t>(payloadLen));
#else
    uint8_t audioStateData[sizeof(outputData) - 3]{};
    if (payloadLen > 0) {
        memcpy(audioStateData, outputData + 3, payloadLen);
    }
    controller_output_policy_sanitize_host_lightbar_payload(audioStateData, payloadLen, false);
    controller_output_policy_sanitize_host_speaker_amp_payload(audioStateData, payloadLen);
    controller_output_policy_sanitize_host_mic_payload(audioStateData, payloadLen);
    controller_output_policy_apply_classic_rumble_gain_payload(audioStateData, payloadLen);
    audio_set_state_data(audioStateData, static_cast<uint8_t>(payloadLen));
#endif
    // Keep app-controlled lighting authoritative when override is active.
    controller_output_policy_sanitize_host_lightbar_payload(outputData + 3, payloadLen, lightbarOverride);
    controller_output_policy_sanitize_host_mic_report(outputData, sizeof(outputData));
    // Haptics gain is applied to audio samples. Output report motor
    // bytes are classic rumble and must follow the rumble setting.
    bt_write_classified_output(outputData, sizeof(outputData));
    if (hostClearsLeds && !lightbarOverride) {
        bt_schedule_lightbar_restore(HOST_LIGHTBAR_RESTORE_DELAY_MS);
    }
}

uint8_t interrupt_in_data[63] = {
    0x7f, 0x7d, 0x7f, 0x7e, 0x00, 0x00, 0xa7,
    0x08, 0x00, 0x00, 0x00, 0x52, 0x43, 0x30, 0x41,
    0x01, 0x00, 0x0e, 0x00, 0xef, 0xff, 0x03, 0x03,
    0x7b, 0x1b, 0x18, 0xf0, 0xcc, 0x9c, 0x60, 0x00,
    0xfc, 0x80, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00,
    0x00, 0x00, 0x09, 0x09, 0x00, 0x00, 0x00, 0x00,
    0x00, 0xa7, 0xad, 0x60, 0x00, 0x29, 0x18, 0x00,
    0x53, 0x9f, 0x28, 0x35, 0xa5, 0xa8, 0x0c, 0x8b
};

critical_section_t report_cs;
volatile bool report_dirty = false;
BridgeControllerState interrupt_in_state{};
static volatile bool host_input_waiting_for_mount = false;
static volatile uint32_t host_input_fallback_until_us = 0;

static constexpr uint8_t kNeutralDualSenseUsbInputReport[63] = {
    0x7f, 0x7d, 0x7f, 0x7e, 0x00, 0x00, 0xa7,
    0x08, 0x00, 0x00, 0x00, 0x52, 0x43, 0x30, 0x41,
    0x01, 0x00, 0x0e, 0x00, 0xef, 0xff, 0x03, 0x03,
    0x7b, 0x1b, 0x18, 0xf0, 0xcc, 0x9c, 0x60, 0x00,
    0xfc, 0x80, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00,
    0x00, 0x00, 0x09, 0x09, 0x00, 0x00, 0x00, 0x00,
    0x00, 0xa7, 0xad, 0x60, 0x00, 0x29, 0x18, 0x00,
    0x53, 0x9f, 0x28, 0x35, 0xa5, 0xa8, 0x0c, 0x8b
};

static bool time_reached_u32(uint32_t now, uint32_t target) {
    return static_cast<int32_t>(now - target) >= 0;
}

static bool host_input_quiet_active(uint32_t now) {
    if (!host_input_waiting_for_mount) {
        return false;
    }
    if (host_input_fallback_until_us != 0 && time_reached_u32(now, host_input_fallback_until_us)) {
        host_input_waiting_for_mount = false;
        host_input_fallback_until_us = 0;
        return false;
    }
    return true;
}

static BridgeControllerState neutral_controller_state() {
    BridgeControllerState state{};
    (void)dualsense_decode_usb_input_report(
        kNeutralDualSenseUsbInputReport,
        sizeof(kNeutralDualSenseUsbInputReport),
        state
    );
    return state;
}

static bool host_input_ready_for_persona(HostPersonaMode persona) {
    return persona == HostPersonaModeXusb360 ? xusb360_usb_ready() : tud_hid_ready();
}

static bool host_input_send_report_for_persona(HostPersonaMode persona, BridgeControllerState const &state) {
    if (!host_input_ready_for_persona(persona)) {
        return false;
    }

    HostPersonaInputReport report{};
    if (!host_persona_encode_input(persona, state, report)) {
        return false;
    }

    note_usb_input_report(report.bytes, report.len);
    return persona == HostPersonaModeXusb360
        ? xusb360_usb_send_report(report.bytes, report.len)
        : tud_hid_report(report.report_id, report.bytes, report.len);
}

static uint16_t ds4_copy_input_report_payload(uint8_t report_id, uint8_t *buffer, uint16_t reqlen) {
    if (report_id != kDs4InputReportId || buffer == nullptr) {
        return 0;
    }

    BridgeControllerState safe_state{};
    critical_section_enter_blocking(&report_cs);
    safe_state = interrupt_in_state;
    critical_section_exit(&report_cs);

    HostPersonaInputReport report{};
    if (!host_persona_encode_input(HostPersonaModeDs4, safe_state, report)) {
        return 0;
    }

    const uint16_t copy_len = std::min<uint16_t>(report.len, reqlen);
    if (copy_len > 0) {
        memcpy(buffer, report.bytes, copy_len);
    }
    return copy_len;
}

static bool dualsense_feature_report_may_use_bt_passthrough(uint8_t report_id) {
    if (report_id != 0x20 && report_id != 0x22) {
        return true;
    }

    // We never enumerate as DualSense Edge. Do not leak DSE firmware or
    // hardware identity through stock DualSense identity feature reports.
    return bt_controller_type() != ControllerTypeDualSenseEdge;
}

void host_input_prepare_persona_switch() {
    const HostPersonaMode current_persona = host_persona_active();
    const BridgeControllerState neutral_state = neutral_controller_state();
    const uint32_t now = time_us_32();

    critical_section_enter_blocking(&report_cs);
    memcpy(interrupt_in_data, kNeutralDualSenseUsbInputReport, sizeof(interrupt_in_data));
    interrupt_in_state = neutral_state;
    report_dirty = false;
    host_input_waiting_for_mount = true;
    host_input_fallback_until_us = now + HOST_PERSONA_SWITCH_INPUT_FALLBACK_US;
    critical_section_exit(&report_cs);

    (void)host_input_send_report_for_persona(current_persona, neutral_state);
}

void host_input_note_usb_mounted() {
    host_input_waiting_for_mount = false;
    host_input_fallback_until_us = 0;
}

void reset_controller_input_report_cache() {
    BridgeControllerState default_state{};
    (void)dualsense_decode_usb_input_report(
        kNeutralDualSenseUsbInputReport,
        sizeof(kNeutralDualSenseUsbInputReport),
        default_state
    );

    critical_section_enter_blocking(&report_cs);
    memcpy(interrupt_in_data, kNeutralDualSenseUsbInputReport, sizeof(interrupt_in_data));
    interrupt_in_state = default_state;
    report_dirty = false;
    critical_section_exit(&report_cs);
}

void interrupt_loop() {
    const uint32_t now = time_us_32();
    if (host_input_quiet_active(now)) {
        return;
    }

    const HostPersonaMode persona = host_persona_active();
    const bool xusb = persona == HostPersonaModeXusb360;
    if (!host_input_ready_for_persona(persona)) {
        return;
    }

    bool should_send = false;
    BridgeControllerState safe_state{};


    critical_section_enter_blocking(&report_cs);
    if (report_dirty) {
        safe_state = interrupt_in_state;
        report_dirty = false;
        should_send = true;
    }
    critical_section_exit(&report_cs);

    // Only send to TinyUSB if we actually grabbed fresh data
    if (should_send) {
        HostPersonaInputReport safe_report{};
        if (!host_persona_encode_input(persona, safe_state, safe_report)) {
            return;
        }
        note_usb_input_report(safe_report.bytes, safe_report.len);
        const bool queued = xusb
            ? xusb360_usb_send_report(safe_report.bytes, safe_report.len)
            : tud_hid_report(safe_report.report_id, safe_report.bytes, safe_report.len);
        if (!queued) {
            DS5_LOG("[USBHID] tud_hid_report error\n");
            
            // If the report failed to queue, restore the dirty flag 
            // so we try again on the next loop iteration.
            critical_section_enter_blocking(&report_cs);
            report_dirty = true;
            critical_section_exit(&report_cs);
        }
    }
}

void on_bt_data(CHANNEL_TYPE channel, uint8_t *data, uint16_t len) {
    // DS5_LOG("[Main] BT data callback: channel=%u len=%u\n", channel, len);
    if (data == nullptr || channel != INTERRUPT || len <= 2 || data[1] != 0x31) {
        return;
    }

    if ((data[2] & 0x02) != 0) {
        audio_mic_add_packet(data + 4, len > 4 ? static_cast<uint16_t>(len - 4) : 0);
        return;
    }

    if (len < 3 + sizeof(interrupt_in_data)) {
        return;
    }

    uint8_t controller_report[63];
    memcpy(controller_report, data + 3, sizeof(controller_report));
    set_headset((controller_report[53] & 1) != 0);
#ifdef ENABLE_COMPANION
    companion_process_controller_report(controller_report, sizeof(controller_report));
#endif

    BridgeControllerState controller_state{};
    if (!dualsense_decode_usb_input_report(controller_report, sizeof(controller_report), controller_state)) {
        return;
    }

    // We add the critical section here to avoid any race conditions when writing to the interrupt_in_data buffer,
    // which is shared between the main loop and this callback.
    // The critical section ensures that only one thread can access the buffer at a time,
    // preventing data corruption and ensuring thread safety.
    // We also set the report_dirty flag to true to indicate that new data is available
    //  and needs to be sent in the next interrupt report.
    critical_section_enter_blocking(&report_cs);
    memcpy(interrupt_in_data, controller_report, sizeof(controller_report));
    interrupt_in_state = controller_state;
    report_dirty = true;
    critical_section_exit(&report_cs);
#ifdef ENABLE_COMPANION
    companion_update_controller_report(controller_report, sizeof(controller_report));
#endif
}

// Invoked when received GET_REPORT control request
// Application must fill buffer report's content and return its length.
// Return zero will cause the stack to STALL request
uint16_t tud_hid_get_report_cb(uint8_t itf, uint8_t report_id, hid_report_type_t report_type, uint8_t *buffer,
                               uint16_t reqlen) {
    (void) itf;
    (void) report_id;
    (void) report_type;
    (void) buffer;
    (void) reqlen;

#ifdef ENABLE_COMPANION
    if (itf == host_persona_keyboard_hid_instance()) {
        return 0;
    }
#endif

    if (host_persona_active() == HostPersonaModeDs4) {
        if (report_type == HID_REPORT_TYPE_INPUT) {
            return ds4_copy_input_report_payload(report_id, buffer, reqlen);
        }
        if (report_type == HID_REPORT_TYPE_FEATURE) {
            return ds4_persona_get_feature_report(report_id, buffer, reqlen);
        }
        return 0;
    }

    audio_debug_note_hid_event(
        HidDebugGetReport,
        report_id,
        static_cast<uint8_t>(report_type),
        reqlen,
        0
    );
    if (report_type != HID_REPORT_TYPE_FEATURE) {
        return 0;
    }

    std::vector<uint8_t> feature_data;
    if (dualsense_feature_report_may_use_bt_passthrough(report_id)) {
        feature_data = get_feature_data(report_id, reqlen);
    }
    if (!feature_data.empty() && buffer != nullptr) {
        const uint16_t available = static_cast<uint16_t>(feature_data.size() - 1);
        const uint16_t copy_len = available < reqlen ? available : reqlen;
        if (copy_len > 0) {
            memcpy(buffer, feature_data.data() + 1, copy_len);
        }

        return copy_len;
    }

    return dualsense_persona_get_feature_report(report_id, buffer, reqlen);
}

// Invoked when received SET_REPORT control request or
// received data on OUT endpoint ( Report ID = 0, Type = 0 )
void tud_hid_set_report_cb(uint8_t itf, uint8_t report_id, hid_report_type_t report_type, uint8_t const *buffer,
                           uint16_t bufsize) {
    (void) itf;
    (void) report_id;
    (void) report_type;
    (void) buffer;
    (void) bufsize;

#ifdef ENABLE_COMPANION
    if (itf == host_persona_keyboard_hid_instance()) {
        return;
    }
#endif

    const HostPersonaMode active_persona = host_persona_active();
    audio_debug_note_hid_event(
        HidDebugSetReport,
        report_id,
        static_cast<uint8_t>(report_type),
        bufsize,
        bufsize > 0 && buffer != nullptr ? buffer[0] : 0
    );

    if (active_persona == HostPersonaModeDs4) {
        if (report_type == HID_REPORT_TYPE_FEATURE) {
            ds4_persona_set_feature_report(report_id, buffer, bufsize);
            return;
        }

        uint8_t output_report[64]{};
        uint8_t const *output_data = buffer;
        uint16_t output_len = bufsize;
        if (report_id != 0) {
            output_report[0] = report_id;
            const uint16_t copy_len = static_cast<uint16_t>(std::min<uint16_t>(bufsize, sizeof(output_report) - 1));
            if (copy_len > 0 && buffer != nullptr) {
                memcpy(output_report + 1, buffer, copy_len);
            }
            output_data = output_report;
            output_len = static_cast<uint16_t>(copy_len + 1);
        }

        uint8_t payload[ds5::output::kCommonPayloadSize]{};
        uint16_t payload_len = 0;
        if (host_persona_decode_output_to_ds5_payload(
            active_persona,
            output_data,
            output_len,
            payload,
            sizeof(payload),
            payload_len
        )) {
            usb_note_hid_output();
#ifdef ENABLE_COMPANION
            companion_note_trigger_trace_report(CompanionTriggerTraceHost, output_data, output_len);
            companion_note_feedback_trace_report(CompanionFeedbackTraceHost, output_data, output_len);
#endif
            controller_output_submit_usb_payload(payload, payload_len);
        }
        return;
    }

    // INTERRUPT OUT
    if (report_id == 0) {
        if (buffer == nullptr || bufsize == 0) {
            return;
        }
        switch (buffer[0]) {
            case 0x02: {
                usb_note_hid_output();
#ifdef ENABLE_COMPANION
                companion_note_trigger_trace_report(CompanionTriggerTraceHost, buffer, bufsize);
                companion_note_feedback_trace_report(CompanionFeedbackTraceHost, buffer, bufsize);
#endif
                controller_output_submit_usb_payload(buffer + 1, static_cast<uint16_t>(bufsize - 1));
                break;
            }
        }
    }
    if (
        report_id == 0x80
        || report_id == 0x60
        || report_id == 0x62
        || report_id == 0x61
    ) {
        set_feature_data(report_id,buffer,bufsize);
        return;
    }
}

int main() {
#if SYS_CLOCK_KHZ != 150000
    vreg_set_voltage(VREG_VOLTAGE_1_20);
    sleep_ms(1000);
    set_sys_clock_khz(SYS_CLOCK_KHZ, true);
#endif

    board_init();
    usb_device_stack_init_disconnected();
    board_init_after_tusb();

    if (cyw43_arch_init()) {
        DS5_LOG("Failed to initialize CYW43\n");
        return 1;
    }
    cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, false);

    if (watchdog_caused_reboot()) {
        DS5_LOG("Rebooted by Watchdog!\n");
        // Blink the LED three times after a crash reboot.
        for (int i = 0;i < 6;i++) {
            if (i % 2 == 0) {
                cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, true);
            }else {
                cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, false);
            }
            sleep_ms(500);
        }
    } else {
        DS5_LOG("Clean boot\n");
    }
  
    // Initialize the critical section for the report buffer
    critical_section_init(&report_cs);
#ifdef ENABLE_COMPANION
    companion_init();
#endif

    bt_init();
    bt_register_data_callback(on_bt_data);

    audio_init();

    watchdog_enable(1000, true);

    while (1) {
        watchdog_update();
        cyw43_arch_poll();
        tud_task();
        interrupt_loop();
        usb_pm_poll();
        audio_loop();
        button_check();
        bt_lightbar_loop();
        bt_signal_strength_loop();
        bt_inquiry_loop();
        bt_connection_recovery_loop();
#ifdef ENABLE_COMPANION
        companion_loop();
#endif
        interrupt_loop();
    }
}
