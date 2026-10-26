#ifndef DS5_BRIDGE_CONTROLLER_OUTPUT_POLICY_H
#define DS5_BRIDGE_CONTROLLER_OUTPUT_POLICY_H

#include <cstdint>

void controller_output_policy_set_classic_rumble_gain(uint16_t gain_percent);
uint16_t controller_output_policy_classic_rumble_gain();
void controller_output_policy_set_classic_rumble_v1_enabled(bool enabled);
bool controller_output_policy_classic_rumble_v1_enabled();
// Audio Haptics Replace owns the actuators only while a producer is actually
// delivering frames. Without a frame for this long, game rumble is restored.
inline constexpr uint32_t kAudioHapticsProducerLeaseTimeoutUs = 250'000;

void controller_output_policy_set_audio_haptics_replace_requested(bool requested);
// Returns true when this frame activated a previously idle producer.
bool controller_output_policy_note_audio_haptics_producer_frame(uint32_t now_us);
// Returns true when an expired producer lease was released.
bool controller_output_policy_poll_audio_haptics_producer(uint32_t now_us);
void controller_output_policy_reset_audio_haptics_producer();
bool controller_output_policy_audio_haptics_replace_active();
uint8_t controller_output_policy_scale_classic_rumble_byte(uint8_t value);
bool controller_output_policy_apply_classic_rumble_gain_payload(uint8_t *payload, uint16_t len);
bool controller_output_policy_render_classic_rumble_payload(
    uint8_t *payload,
    uint16_t len,
    uint8_t right,
    uint8_t left
);
bool controller_output_policy_normalize_classic_rumble_stop_payload(
    uint8_t *payload,
    uint16_t len,
    bool audio_haptics_session_active
);
bool controller_output_policy_sanitize_host_speaker_amp_payload(uint8_t *payload, uint16_t len);
bool controller_output_policy_sanitize_host_speaker_amp_report(uint8_t *report, uint16_t len);
bool controller_output_policy_sanitize_host_mic_payload(uint8_t *payload, uint16_t len);
bool controller_output_policy_sanitize_host_mic_report(uint8_t *report, uint16_t len);
bool controller_output_policy_sanitize_host_lightbar_payload(
    uint8_t *payload,
    uint16_t len,
    bool lightbar_override
);
// The host released the LEDs or blanked the lightbar, so the saved color can return.
bool controller_output_policy_host_output_clears_lightbar(uint8_t const *payload, uint16_t len);
// The host set a visible lightbar color, so the game owns the lightbar.
bool controller_output_policy_host_output_sets_lightbar(uint8_t const *payload, uint16_t len);

#endif // DS5_BRIDGE_CONTROLLER_OUTPUT_POLICY_H
