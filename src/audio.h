//
// Created by awalol on 2026/3/5.
// Modified for DS5 Bridge companion firmware and app integration.
//

#ifndef DS5_BRIDGE_AUDIO_H
#define DS5_BRIDGE_AUDIO_H

#include <cstdint>
#include "debug_config.h"

enum AudioReactiveHapticsMode : uint8_t {
    AudioReactiveHapticsMix = 0,
    AudioReactiveHapticsReplace = 1,
};

enum AudioReactiveHapticsBassFocus : uint8_t {
    AudioReactiveHapticsBassDeep = 0,
    AudioReactiveHapticsBassBalanced = 1,
    AudioReactiveHapticsBassPunchy = 2,
    AudioReactiveHapticsBassWide = 3,
};

enum AudioReactiveHapticsResponse : uint8_t {
    AudioReactiveHapticsResponseSubtle = 0,
    AudioReactiveHapticsResponseBalanced = 1,
    AudioReactiveHapticsResponseStrong = 2,
};

enum AudioReactiveHapticsAttack : uint8_t {
    AudioReactiveHapticsAttackSoft = 0,
    AudioReactiveHapticsAttackBalanced = 1,
    AudioReactiveHapticsAttackFast = 2,
    AudioReactiveHapticsAttackSharp = 3,
};

enum AudioReactiveHapticsRelease : uint8_t {
    AudioReactiveHapticsReleaseTight = 0,
    AudioReactiveHapticsReleaseBalanced = 1,
    AudioReactiveHapticsReleaseSmooth = 2,
    AudioReactiveHapticsReleaseLong = 3,
};

struct audio_status {
    bool duplex_requested;
    bool duplex_active;
    bool controller_state_ready;
    bool headset_plugged;
    bool headset_audio_route;
    uint32_t mic_packets_received;
    uint32_t mic_packets_dropped;
    uint32_t mic_decode_success;
    uint32_t mic_decode_fail;
    uint32_t mic_usb_write_success;
    uint32_t mic_usb_write_short;
    uint32_t mic_usb_conceal_count;
    uint32_t mic_plc_count;
    uint16_t mic_last_decoded_samples;
    uint16_t mic_last_written_bytes;
    uint16_t mic_peak_permille;
    bool mic_usb_streaming;
};

void audio_init();
void audio_loop();
void audio_handle_bridge_audio_report(uint8_t const *report, uint16_t len);
void audio_test_haptics_loop();
bool audio_schedule_test_haptics();
bool audio_test_haptics_busy();
bool audio_test_haptics_cooldown();
bool audio_recent();
bool audio_haptics_ready();
void audio_set_quiet_mode(bool enabled);
bool audio_quiet_mode_enabled();
void audio_debug_copy_report_payload(uint8_t *buffer, uint8_t max_len);
struct audio_debug_stats {
    uint32_t usb_audio_gap_max_us;
    uint32_t usb_audio_gap_over_1500_count;
    uint32_t opus_encode_max_us;
    uint32_t opus_encode_over_budget_count;
    uint32_t audio_generation_drop_count;
};
void audio_debug_get_stats(audio_debug_stats *stats);
void audio_debug_note_usb_event(
    uint8_t kind,
    uint32_t arg1 = 0,
    uint32_t arg2 = 0,
    uint32_t arg3 = 0,
    uint32_t arg4 = 0
);
void audio_debug_note_hid_event(
    uint8_t kind,
    uint32_t report_id = 0,
    uint32_t report_type = 0,
    uint32_t len = 0,
    uint32_t first_byte = 0
);
void audio_debug_note_bt_event(
    uint8_t kind,
    uint32_t arg1 = 0,
    uint32_t arg2 = 0,
    uint32_t arg3 = 0,
    uint32_t arg4 = 0
);
void audio_set_haptics_buffer_length(uint8_t length);
uint8_t audio_haptics_buffer_length();
void audio_set_state_data(uint8_t const *data, uint8_t len);
void audio_set_adaptive_trigger_state(
    uint8_t const *right_trigger,
    bool right_valid,
    uint8_t const *left_trigger,
    bool left_valid,
    uint8_t motor_power,
    bool motor_power_valid
);
void audio_set_lightbar_state(uint8_t red, uint8_t green, uint8_t blue, uint8_t brightness_percent);
void audio_handle_controller_disconnect();
void set_headset(bool state);
bool audio_controller_state_ready();
void audio_set_duplex_requested(bool enabled);
bool audio_duplex_active();
void audio_get_status(audio_status *status);
void audio_mic_add_packet(uint8_t const *data, uint16_t len);
void audio_set_mic_output_state(uint8_t volume_percent, bool muted);
void audio_set_mic_mute_led_passthrough(bool enabled);
bool audio_set_reactive_haptics_config(
    bool enabled,
    uint8_t mode,
    uint16_t gain_percent,
    uint8_t bass_focus,
    uint8_t response,
    uint8_t attack,
    uint8_t release,
    bool suppress_classic_rumble
);
bool audio_reactive_haptics_enabled();
void audio_reactive_haptics_reset();

#endif //DS5_BRIDGE_AUDIO_H
