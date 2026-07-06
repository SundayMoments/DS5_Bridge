#include <array>
#include <cstdint>
#include <exception>
#include <iostream>
#include <sstream>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>

#include "controller_output_policy.h"
#include "controller_output_rumble_state.h"
#include "controller_output_state.h"
#include "controller_packet_compositor.h"
#include "dualsense_input_decoder.h"
#include "dualsense_output.h"
#include "haptics_test_signal.h"
#include "output_scheduler.h"
#include "persona/ds4_persona.h"
#include "persona/dualsense_persona.h"
#include "persona/host_persona.h"
#include "persona/xusb360_persona.h"

using namespace ds5::output;

extern "C" bool host_persona_descriptors_verified(HostPersonaMode mode) {
    switch (mode) {
        case HostPersonaModeDualSense:
        case HostPersonaModeXusb360:
        case HostPersonaModeDs4:
            return true;
        default:
            return false;
    }
}

namespace {

struct TestFailure : std::exception {
    explicit TestFailure(std::string message) : message_(std::move(message)) {}

    char const *what() const noexcept override {
        return message_.c_str();
    }

    std::string message_;
};

template <typename Value>
auto printable_value(Value value) {
    using Decayed = std::decay_t<Value>;
    if constexpr (std::is_enum_v<Decayed>) {
        return static_cast<std::underlying_type_t<Decayed>>(value);
    } else {
        return +value;
    }
}

template <typename Actual, typename Expected>
void expect_eq(
    Actual actual,
    Expected expected,
    char const *actual_expr,
    char const *expected_expr,
    char const *file,
    int line
) {
    if (actual == expected) {
        return;
    }

    std::ostringstream stream;
    stream << file << ":" << line << " expected " << actual_expr << " == " << expected_expr
           << " but got " << +printable_value(actual)
           << " vs " << +printable_value(expected);
    throw TestFailure(stream.str());
}

void expect_true(bool condition, char const *expr, char const *file, int line) {
    if (condition) {
        return;
    }

    std::ostringstream stream;
    stream << file << ":" << line << " expected true: " << expr;
    throw TestFailure(stream.str());
}

void expect_false(bool condition, char const *expr, char const *file, int line) {
    if (!condition) {
        return;
    }

    std::ostringstream stream;
    stream << file << ":" << line << " expected false: " << expr;
    throw TestFailure(stream.str());
}

#define EXPECT_EQ(actual, expected) expect_eq((actual), (expected), #actual, #expected, __FILE__, __LINE__)
#define EXPECT_TRUE(expr) expect_true((expr), #expr, __FILE__, __LINE__)
#define EXPECT_FALSE(expr) expect_false((expr), #expr, __FILE__, __LINE__)

using Payload = std::array<uint8_t, kCommonPayloadSize>;
using AudioSnapshot = std::array<uint8_t, kAudioStateSnapshotSize>;
using BtReport = std::array<uint8_t, kBtOutputReportSize>;
using HapticFrame = std::array<int8_t, 64>;
using DualSenseInputReport = std::array<uint8_t, kDualSenseUsbInputReportSize>;

Payload empty_payload() {
    Payload payload{};
    return payload;
}

uint8_t haptic_frame_peak(HapticFrame const &frame) {
    uint8_t peak = 0;
    for (int8_t sample : frame) {
        const uint8_t magnitude = sample < 0
            ? static_cast<uint8_t>(-static_cast<int16_t>(sample))
            : static_cast<uint8_t>(sample);
        if (magnitude > peak) {
            peak = magnitude;
        }
    }
    return peak;
}

uint8_t haptic_frame_left_sign_flips(HapticFrame const &frame) {
    uint8_t flips = 0;
    int8_t previous_sign = 0;
    for (uint8_t index = 0; index < frame.size(); index += 2) {
        const int8_t sample = frame[index];
        const int8_t sign = sample > 0 ? 1 : (sample < 0 ? -1 : 0);
        if (sign == 0) {
            continue;
        }
        if (previous_sign != 0 && sign != previous_sign) {
            flips++;
        }
        previous_sign = sign;
    }
    return flips;
}

void reset_policy_state() {
    controller_output_policy_set_classic_rumble_gain(100);
    controller_output_policy_set_classic_rumble_v1_enabled(false);
    controller_output_policy_set_audio_haptics_replace_requested(false);
    controller_output_policy_set_audio_haptics_replace_producer_active(false);
}

void reset_output_state() {
    controller_output_state_reset();
}

DualSenseInputReport sample_dualsense_input_report() {
    DualSenseInputReport report{};
    report[0] = 0x00;
    report[1] = 0xff;
    report[2] = 0x80;
    report[3] = 0x40;
    report[4] = 0x22;
    report[5] = 0xcc;
    report[7] = 0x20 | 0x02; // Cross + D-pad right.
    report[8] = 0x01 | 0x08 | 0x10 | 0x80; // L1 + R2 + Create + R3.
    report[9] = 0x01 | 0x02 | 0x40; // Home + touchpad + left paddle.
    report[15] = 0x34;
    report[16] = 0x12;
    report[17] = 0x78;
    report[18] = 0x56;
    report[19] = 0xbc;
    report[20] = 0x9a;
    report[21] = 0xef;
    report[22] = 0xcd;
    report[23] = 0x57;
    report[24] = 0x13;
    report[25] = 0x68;
    report[26] = 0x24;
    report[27] = 0x44;
    report[28] = 0x33;
    report[29] = 0x22;
    report[30] = 0x11;
    report[32] = 0x05; // Touch point 0: active contact id 5.
    report[33] = 0xb0; // x = 1200.
    report[34] = 0xc4; // x high nibble + y low nibble for y = 540.
    report[35] = 0x21;
    report[36] = 0x86; // Touch point 1: inactive contact id 6.
    report[52] = 0x07;
    report[53] = 0x01 | 0x04;
    return report;
}

OutputSchedulerInputs scheduler_inputs() {
    return OutputSchedulerInputs{
        false,
        false,
        0,
        0,
        0,
    };
}

OutputSchedulerConfig scheduler_config() {
    return OutputSchedulerConfig{
        1'000,
        2,
    };
}

void scheduler_prioritizes_audio_when_non_audio_would_delay_streaming() {
    auto inputs = scheduler_inputs();
    auto config = scheduler_config();
    inputs.audio_available = true;
    inputs.audio_depth = 1;
    inputs.coalesced_state_available = true;
    EXPECT_EQ(output_scheduler_choose_interrupt_packet(inputs, config), OutputSchedulerChoice::AudioStream);
}

void scheduler_sends_coalesced_state_when_audio_is_absent() {
    auto inputs = scheduler_inputs();
    auto config = scheduler_config();
    inputs.coalesced_state_available = true;
    EXPECT_EQ(output_scheduler_choose_interrupt_packet(inputs, config), OutputSchedulerChoice::CoalescedState);
}

void scheduler_audio_due_on_age_backlog_or_fairness_limit() {
    auto inputs = scheduler_inputs();
    auto config = scheduler_config();
    inputs.audio_available = true;
    EXPECT_EQ(output_scheduler_choose_interrupt_packet(inputs, config), OutputSchedulerChoice::AudioStream);

    inputs.audio_age_us = config.audio_max_age_us;
    EXPECT_EQ(output_scheduler_choose_interrupt_packet(inputs, config), OutputSchedulerChoice::AudioStream);

    inputs.audio_age_us = 0;
    inputs.audio_depth = 2;
    EXPECT_EQ(output_scheduler_choose_interrupt_packet(inputs, config), OutputSchedulerChoice::AudioStream);

    inputs.audio_depth = 1;
    inputs.consecutive_non_audio_sends = config.max_consecutive_non_audio_sends;
    EXPECT_EQ(output_scheduler_choose_interrupt_packet(inputs, config), OutputSchedulerChoice::AudioStream);
}

void packet_compositor_initializes_bluetooth_report_and_wraps_sequence() {
    BtReport report{};
    uint8_t sequence = 0x0f;
    report.fill(0xaa);

    controller_packet_init_bt_output_report(report.data(), sequence);

    EXPECT_EQ(report[0], kBtOutputReportId);
    EXPECT_EQ(report[1], 0xf0);
    EXPECT_EQ(report[2], kBtOutputTag);
    EXPECT_EQ(sequence, 0);
    for (size_t index = 3; index < report.size(); ++index) {
        EXPECT_EQ(report[index], 0);
    }

    int int_sequence = 0x1e;
    controller_packet_init_bt_output_report(report.data(), int_sequence);
    EXPECT_EQ(report[1], 0xe0);
    EXPECT_EQ(int_sequence, 0x0f);
}

void classic_rumble_gain_clamps_rounds_and_touches_motor_payloads() {
    reset_policy_state();
    controller_output_policy_set_classic_rumble_gain(150);

    auto payload = empty_payload();
    EXPECT_FALSE(controller_output_policy_apply_classic_rumble_gain_payload(payload.data(), payload.size()));

    payload[kMotorRightOffset] = 20;
    payload[kMotorLeftOffset] = 21;
    EXPECT_TRUE(controller_output_policy_apply_classic_rumble_gain_payload(payload.data(), payload.size()));
    EXPECT_EQ(payload[kMotorRightOffset], 30);
    EXPECT_EQ(payload[kMotorLeftOffset], 32);

    payload = empty_payload();
    payload[kValidFlag0Offset] = kFlag0CompatibleVibration;
    payload[kMotorRightOffset] = 20;
    payload[kMotorLeftOffset] = 21;
    EXPECT_TRUE(controller_output_policy_apply_classic_rumble_gain_payload(payload.data(), payload.size()));
    EXPECT_EQ(payload[kMotorRightOffset], 30);
    EXPECT_EQ(payload[kMotorLeftOffset], 32);

    payload = empty_payload();
    payload[kValidFlag2Offset] = kFlag2UseRumbleNotHaptics2;
    payload[kMotorRightOffset] = 10;
    payload[kMotorLeftOffset] = 11;
    EXPECT_TRUE(controller_output_policy_apply_classic_rumble_gain_payload(payload.data(), payload.size()));
    EXPECT_EQ(payload[kMotorRightOffset], 15);
    EXPECT_EQ(payload[kMotorLeftOffset], 17);

    controller_output_policy_set_classic_rumble_gain(999);
    EXPECT_EQ(controller_output_policy_classic_rumble_gain(), 500);
    EXPECT_EQ(controller_output_policy_scale_classic_rumble_byte(60), 255);
    reset_policy_state();
}

void audio_haptics_replace_tracks_state_without_suppressing_classic_rumble() {
    reset_policy_state();
    controller_output_policy_set_classic_rumble_gain(175);
    controller_output_policy_set_audio_haptics_replace_requested(true);

    EXPECT_FALSE(controller_output_policy_audio_haptics_replace_active());
    EXPECT_EQ(controller_output_policy_scale_classic_rumble_byte(40), 70);

    controller_output_policy_set_audio_haptics_replace_producer_active(true);

    EXPECT_TRUE(controller_output_policy_audio_haptics_replace_active());
    EXPECT_EQ(controller_output_policy_classic_rumble_gain(), 175);
    EXPECT_EQ(controller_output_policy_scale_classic_rumble_byte(200), 255);

    auto payload = empty_payload();
    payload[kValidFlag0Offset] = kFlag0CompatibleVibration | kFlag0HapticsSelect | kFlag0RightTriggerEffect;
    payload[kValidFlag2Offset] = kFlag2EnableImprovedRumbleEmulation | kFlag2LightbarSetupControlEnable;
    payload[kMotorRightOffset] = 40;
    payload[kMotorLeftOffset] = 80;
    EXPECT_TRUE(controller_output_policy_apply_classic_rumble_gain_payload(payload.data(), payload.size()));
    EXPECT_EQ(payload[kValidFlag0Offset], kFlag0CompatibleVibration | kFlag0HapticsSelect | kFlag0RightTriggerEffect);
    EXPECT_EQ(payload[kValidFlag2Offset], kFlag2EnableImprovedRumbleEmulation | kFlag2LightbarSetupControlEnable);
    EXPECT_EQ(payload[kMotorRightOffset], 70);
    EXPECT_EQ(payload[kMotorLeftOffset], 140);

    controller_output_policy_set_audio_haptics_replace_producer_active(false);
    EXPECT_EQ(controller_output_policy_classic_rumble_gain(), 175);
    EXPECT_EQ(controller_output_policy_scale_classic_rumble_byte(40), 70);

    controller_output_policy_set_audio_haptics_replace_producer_active(true);
    EXPECT_TRUE(controller_output_policy_audio_haptics_replace_active());
    controller_output_policy_set_audio_haptics_replace_requested(false);
    EXPECT_FALSE(controller_output_policy_audio_haptics_replace_active());
    reset_policy_state();
}

void speaker_sanitizer_strips_host_amp_flags_and_zeroes_only_controlled_fields() {
    auto payload = empty_payload();
    payload[kValidFlag0Offset] = kFlag0SpeakerVolumeEnable | kFlag0AudioControlEnable | kFlag0CompatibleVibration;
    payload[kValidFlag1Offset] = kFlag1AudioControl2Enable | kFlag1LightbarControlEnable;
    payload[kHeadphoneVolumeOffset] = 0x44;
    payload[kSpeakerVolumeOffset] = 0x55;
    payload[kAudioControlOffset] = 0x66;
    payload[kAudioControl2Offset] = 0x77;
    payload[kLightbarRedOffset] = 0x88;

    EXPECT_TRUE(controller_output_policy_sanitize_host_speaker_amp_payload(payload.data(), payload.size()));

    EXPECT_EQ(payload[kValidFlag0Offset], kFlag0CompatibleVibration);
    EXPECT_EQ(payload[kValidFlag1Offset], kFlag1LightbarControlEnable);
    EXPECT_EQ(payload[kHeadphoneVolumeOffset], 0);
    EXPECT_EQ(payload[kSpeakerVolumeOffset], 0);
    EXPECT_EQ(payload[kAudioControlOffset], 0);
    EXPECT_EQ(payload[kAudioControl2Offset], 0);
    EXPECT_EQ(payload[kLightbarRedOffset], 0x88);
}

void mic_sanitizer_removes_mute_led_and_only_mic_power_save_bit() {
    auto payload = empty_payload();
    payload[kValidFlag0Offset] = kFlag0MicVolumeEnable | kFlag0CompatibleVibration;
    payload[kValidFlag1Offset] = kFlag1MicMuteLedControlEnable | kFlag1PowerSaveControlEnable;
    payload[kMicVolumeOffset] = kMicVolumeMax;
    payload[kMuteLedOffset] = 0x01;
    payload[kPowerSaveControlOffset] = kPowerSaveControlMicMute | 0x20;

    EXPECT_TRUE(controller_output_policy_sanitize_host_mic_payload(payload.data(), payload.size()));

    EXPECT_EQ(payload[kValidFlag0Offset], kFlag0CompatibleVibration);
    EXPECT_EQ(payload[kValidFlag1Offset], kFlag1PowerSaveControlEnable);
    EXPECT_EQ(payload[kMicVolumeOffset], 0);
    EXPECT_EQ(payload[kMuteLedOffset], 0);
    EXPECT_EQ(payload[kPowerSaveControlOffset], 0x20);

    payload[kValidFlag1Offset] = kFlag1PowerSaveControlEnable;
    payload[kPowerSaveControlOffset] = kPowerSaveControlMicMute;
    EXPECT_TRUE(controller_output_policy_sanitize_host_mic_payload(payload.data(), payload.size()));
    EXPECT_EQ(payload[kValidFlag1Offset], 0);
    EXPECT_EQ(payload[kPowerSaveControlOffset], 0);
}

void lightbar_override_removes_host_led_claims_without_mutating_color_bytes() {
    auto payload = empty_payload();
    payload[kValidFlag1Offset] = kHostLedControlMask | kFlag1AudioControl2Enable;
    payload[kValidFlag2Offset] = kHostLightbarSetupMask | kFlag2EnableImprovedRumbleEmulation;
    payload[kLightbarRedOffset] = 9;
    payload[kLightbarGreenOffset] = 8;
    payload[kLightbarBlueOffset] = 7;

    EXPECT_FALSE(controller_output_policy_sanitize_host_lightbar_payload(payload.data(), payload.size(), false));
    EXPECT_EQ(payload[kValidFlag1Offset], static_cast<uint8_t>(kHostLedControlMask | kFlag1AudioControl2Enable));
    EXPECT_EQ(payload[kValidFlag2Offset], static_cast<uint8_t>(kHostLightbarSetupMask | kFlag2EnableImprovedRumbleEmulation));

    EXPECT_TRUE(controller_output_policy_sanitize_host_lightbar_payload(payload.data(), payload.size(), true));
    EXPECT_EQ(payload[kValidFlag1Offset], kFlag1AudioControl2Enable);
    EXPECT_EQ(payload[kValidFlag2Offset], kFlag2EnableImprovedRumbleEmulation);
    EXPECT_EQ(payload[kLightbarRedOffset], 9);
    EXPECT_EQ(payload[kLightbarGreenOffset], 8);
    EXPECT_EQ(payload[kLightbarBlueOffset], 7);
}

void host_led_clear_detection_covers_release_player_and_lightbar_paths() {
    auto payload = empty_payload();
    EXPECT_FALSE(controller_output_policy_host_output_clears_leds(payload.data(), payload.size()));

    payload[kValidFlag1Offset] = kFlag1ReleaseLeds;
    EXPECT_TRUE(controller_output_policy_host_output_clears_leds(payload.data(), payload.size()));

    payload = empty_payload();
    payload[kValidFlag1Offset] = kFlag1PlayerIndicatorControlEnable;
    payload[kPlayerLedsOffset] = 0;
    EXPECT_TRUE(controller_output_policy_host_output_clears_leds(payload.data(), payload.size()));

    payload = empty_payload();
    payload[kValidFlag1Offset] = kFlag1LightbarControlEnable;
    payload[kLightbarRedOffset] = 1;
    EXPECT_FALSE(controller_output_policy_host_output_clears_leds(payload.data(), payload.size()));
    payload[kLightbarRedOffset] = 0;
    EXPECT_TRUE(controller_output_policy_host_output_clears_leds(payload.data(), payload.size()));
}

void output_state_audio_snapshot_routes_to_speaker_and_headphones_safely() {
    reset_output_state();
    auto payload = empty_payload();
    payload[kValidFlag0Offset] = kFlag0SpeakerVolumeEnable | kFlag0AudioControlEnable | kFlag0MicVolumeEnable;
    payload[kValidFlag1Offset] = kFlag1AudioControl2Enable | kFlag1MicMuteLedControlEnable;
    payload[kSpeakerVolumeOffset] = 0xff;
    payload[kMicVolumeOffset] = kMicVolumeMax;
    payload[kMuteLedOffset] = 1;
    payload[kAudioControl2Offset] = 0x03;
    controller_output_state_apply_host_payload(payload.data(), static_cast<uint8_t>(payload.size()));

    AudioSnapshot speaker{};
    controller_output_state_copy_audio_snapshot(speaker.data(), false);
    EXPECT_TRUE((speaker[kValidFlag0Offset] & kFlag0AudioControlEnable) != 0);
    EXPECT_TRUE((speaker[kValidFlag0Offset] & kFlag0SpeakerVolumeEnable) != 0);
    EXPECT_FALSE((speaker[kValidFlag0Offset] & kFlag0MicVolumeEnable) != 0);
    EXPECT_TRUE((speaker[kValidFlag1Offset] & kFlag1AudioControl2Enable) != 0);
    EXPECT_FALSE((speaker[kValidFlag1Offset] & kFlag1MicMuteLedControlEnable) != 0);
    EXPECT_EQ(speaker[kHeadphoneVolumeOffset], kHeadphoneVolumeMax);
    EXPECT_EQ(speaker[kSpeakerVolumeOffset], kSpeakerVolumeMax);
    EXPECT_EQ(speaker[kMicVolumeOffset], 0);
    EXPECT_EQ(speaker[kMuteLedOffset], 0);
    EXPECT_EQ(speaker[kAudioControlOffset], kAudioFlagsOutputPathSpeaker);
    EXPECT_EQ(speaker[kAudioControl2Offset], 0x02);

    AudioSnapshot headset{};
    controller_output_state_copy_audio_snapshot(headset.data(), true);
    EXPECT_TRUE((headset[kValidFlag0Offset] & kFlag0AudioControlEnable) != 0);
    EXPECT_FALSE((headset[kValidFlag0Offset] & kFlag0SpeakerVolumeEnable) != 0);
    EXPECT_TRUE((headset[kValidFlag1Offset] & kFlag1AudioControl2Enable) != 0);
    EXPECT_EQ(headset[kHeadphoneVolumeOffset], kHeadphoneVolumeMax);
    EXPECT_EQ(headset[kSpeakerVolumeOffset], 0);
    EXPECT_EQ(headset[kAudioControlOffset], kAudioFlagsOutputPathHeadphones);
    EXPECT_EQ(headset[kAudioControl2Offset], 0x02);

    controller_output_state_set_speaker_gain(6);
    controller_output_state_copy_audio_snapshot(speaker.data(), false);
    EXPECT_EQ(speaker[kAudioControl2Offset], 0x06);

    payload[kAudioControl2Offset] = 0x01;
    controller_output_state_apply_host_payload(payload.data(), static_cast<uint8_t>(payload.size()));
    controller_output_state_copy_audio_snapshot(speaker.data(), false);
    EXPECT_EQ(speaker[kAudioControl2Offset], 0x06);
}

void output_state_audio_snapshot_preserves_adaptive_trigger_effects_and_motor_power() {
    reset_output_state();
    auto payload = empty_payload();
    payload[kValidFlag0Offset] = kFlag0RightTriggerEffect | kFlag0LeftTriggerEffect;
    payload[kValidFlag1Offset] = kFlag1MotorPowerLevelEnable;
    payload[kTriggerPowerOffset] = 0xa5;
    std::fill_n(payload.data() + kTriggerEffectRightOffset, kTriggerEffectSize, 0x31);
    std::fill_n(payload.data() + kTriggerEffectLeftOffset, kTriggerEffectSize, 0x42);
    controller_output_state_apply_host_payload(payload.data(), static_cast<uint8_t>(payload.size()));

    AudioSnapshot snapshot{};
    controller_output_state_copy_audio_snapshot(snapshot.data(), false);

    EXPECT_TRUE((snapshot[kValidFlag0Offset] & kFlag0RightTriggerEffect) != 0);
    EXPECT_TRUE((snapshot[kValidFlag0Offset] & kFlag0LeftTriggerEffect) != 0);
    EXPECT_TRUE((snapshot[kValidFlag1Offset] & kFlag1MotorPowerLevelEnable) != 0);
    EXPECT_EQ(snapshot[kTriggerPowerOffset], 0xa5);
    for (uint8_t index = 0; index < kTriggerEffectSize; ++index) {
        EXPECT_EQ(snapshot[kTriggerEffectRightOffset + index], 0x31);
        EXPECT_EQ(snapshot[kTriggerEffectLeftOffset + index], 0x42);
    }
}

void output_state_lightbar_override_is_scaled_and_survives_audio_snapshot() {
    reset_output_state();
    controller_output_state_set_lightbar(250, 100, 50, 40);

    AudioSnapshot snapshot{};
    controller_output_state_copy_audio_snapshot(snapshot.data(), false);

    EXPECT_TRUE((snapshot[kValidFlag1Offset] & kFlag1LightbarControlEnable) != 0);
    EXPECT_FALSE((snapshot[kValidFlag1Offset] & kFlag1PlayerIndicatorControlEnable) != 0);
    EXPECT_FALSE((snapshot[kValidFlag1Offset] & kFlag1ReleaseLeds) != 0);
    EXPECT_EQ(snapshot[kValidFlag2Offset] & kLightbarSetupControlMask, 0);
    EXPECT_EQ(snapshot[kLedBrightnessOffset], 1);
    EXPECT_EQ(snapshot[kPlayerLedsOffset], 0);
    EXPECT_EQ(snapshot[kLightbarRedOffset], 100);
    EXPECT_EQ(snapshot[kLightbarGreenOffset], 40);
    EXPECT_EQ(snapshot[kLightbarBlueOffset], 20);
}

void output_state_player_led_enabled_preserves_host_indicator() {
    reset_output_state();
    auto payload = empty_payload();
    payload[kValidFlag1Offset] = kFlag1PlayerIndicatorControlEnable;
    payload[kPlayerLedsOffset] = 0x2f;
    controller_output_state_apply_host_payload(payload.data(), static_cast<uint8_t>(payload.size()));

    AudioSnapshot snapshot{};
    controller_output_state_copy_audio_snapshot(snapshot.data(), false);

    EXPECT_TRUE((snapshot[kValidFlag1Offset] & kFlag1PlayerIndicatorControlEnable) != 0);
    EXPECT_EQ(snapshot[kPlayerLedsOffset], 0x2f);
}

void output_state_player_led_disabled_suppresses_host_indicator() {
    reset_output_state();
    auto payload = empty_payload();
    payload[kValidFlag1Offset] = kFlag1PlayerIndicatorControlEnable;
    payload[kPlayerLedsOffset] = 0x2f;
    controller_output_state_apply_host_payload(payload.data(), static_cast<uint8_t>(payload.size()));
    controller_output_state_set_player_led_enabled(false);

    AudioSnapshot snapshot{};
    controller_output_state_copy_audio_snapshot(snapshot.data(), false);

    EXPECT_TRUE((snapshot[kValidFlag1Offset] & kFlag1PlayerIndicatorControlEnable) != 0);
    EXPECT_EQ(snapshot[kPlayerLedsOffset], 0);
}

void output_state_player_led_reenabled_restores_host_indicator() {
    reset_output_state();
    auto payload = empty_payload();
    payload[kValidFlag1Offset] = kFlag1PlayerIndicatorControlEnable;
    payload[kPlayerLedsOffset] = 0x2f;
    controller_output_state_apply_host_payload(payload.data(), static_cast<uint8_t>(payload.size()));
    controller_output_state_set_player_led_enabled(false);
    controller_output_state_set_player_led_enabled(true);

    AudioSnapshot snapshot{};
    controller_output_state_copy_audio_snapshot(snapshot.data(), false);

    EXPECT_TRUE((snapshot[kValidFlag1Offset] & kFlag1PlayerIndicatorControlEnable) != 0);
    EXPECT_EQ(snapshot[kPlayerLedsOffset], 0x2f);

    Payload report{};
    EXPECT_TRUE(controller_output_state_copy_player_led_report(report.data(), static_cast<uint16_t>(report.size())));
    EXPECT_TRUE((report[kValidFlag1Offset] & kFlag1PlayerIndicatorControlEnable) != 0);
    EXPECT_EQ(report[kPlayerLedsOffset], 0x2f);
}

void output_state_player_led_release_invalidates_cached_indicator() {
    reset_output_state();
    auto payload = empty_payload();
    payload[kValidFlag1Offset] = kFlag1PlayerIndicatorControlEnable;
    payload[kPlayerLedsOffset] = 0x2f;
    controller_output_state_apply_host_payload(payload.data(), static_cast<uint8_t>(payload.size()));

    auto release_payload = empty_payload();
    release_payload[kValidFlag1Offset] = kFlag1ReleaseLeds;
    controller_output_state_apply_host_payload(release_payload.data(), static_cast<uint8_t>(release_payload.size()));

    AudioSnapshot snapshot{};
    controller_output_state_copy_audio_snapshot(snapshot.data(), false);

    EXPECT_TRUE((snapshot[kValidFlag1Offset] & kFlag1ReleaseLeds) != 0);
    EXPECT_FALSE((snapshot[kValidFlag1Offset] & kFlag1PlayerIndicatorControlEnable) != 0);
    EXPECT_EQ(snapshot[kPlayerLedsOffset], 0);

    Payload report{};
    EXPECT_FALSE(controller_output_state_copy_player_led_report(report.data(), static_cast<uint16_t>(report.size())));
}

void output_state_preserves_selector_zero_and_ignores_motor_only_rumble() {
    reset_output_state();

    auto payload = empty_payload();
    payload[kValidFlag0Offset] = kFlag0CompatibleVibration | kFlag0HapticsSelect;
    payload[kValidFlag2Offset] = kFlag2EnableImprovedRumbleEmulation | kFlag2UseRumbleNotHaptics2;
    controller_output_state_apply_host_payload(payload.data(), static_cast<uint8_t>(payload.size()));

    AudioSnapshot snapshot{};
    controller_output_state_copy_audio_snapshot(snapshot.data(), false);
    EXPECT_TRUE((snapshot[kValidFlag0Offset] & kFlag0CompatibleVibration) != 0);
    EXPECT_TRUE((snapshot[kValidFlag0Offset] & kFlag0HapticsSelect) != 0);
    EXPECT_TRUE((snapshot[kValidFlag2Offset] & kFlag2EnableImprovedRumbleEmulation) != 0);
    EXPECT_TRUE((snapshot[kValidFlag2Offset] & kFlag2UseRumbleNotHaptics2) != 0);

    payload = empty_payload();
    payload[kValidFlag2Offset] = kFlag2UseRumbleNotHaptics2;
    payload[kMotorRightOffset] = 9;
    payload[kMotorLeftOffset] = 1;
    controller_output_state_apply_host_payload(payload.data(), static_cast<uint8_t>(payload.size()));
    controller_output_state_copy_audio_snapshot(snapshot.data(), false);
    EXPECT_TRUE((snapshot[kValidFlag2Offset] & kFlag2UseRumbleNotHaptics2) != 0);
    EXPECT_EQ(snapshot[kMotorRightOffset], 9);
    EXPECT_EQ(snapshot[kMotorLeftOffset], 1);

    payload = empty_payload();
    payload[kMotorRightOffset] = 7;
    payload[kMotorLeftOffset] = 3;
    controller_output_state_apply_host_payload(payload.data(), static_cast<uint8_t>(payload.size()));
    controller_output_state_copy_audio_snapshot(snapshot.data(), false);
    EXPECT_FALSE((snapshot[kValidFlag0Offset] & kFlag0HapticsSelect) != 0);
    EXPECT_FALSE((snapshot[kValidFlag2Offset] & kFlag2UseRumbleNotHaptics2) != 0);
    EXPECT_EQ(snapshot[kMotorRightOffset], 0);
    EXPECT_EQ(snapshot[kMotorLeftOffset], 0);

    payload = empty_payload();
    controller_output_state_apply_host_payload(payload.data(), static_cast<uint8_t>(payload.size()));
    controller_output_state_copy_audio_snapshot(snapshot.data(), false);
    EXPECT_FALSE((snapshot[kValidFlag0Offset] & kFlag0HapticsSelect) != 0);
    EXPECT_FALSE((snapshot[kValidFlag2Offset] & kFlag2UseRumbleNotHaptics2) != 0);
    EXPECT_EQ(snapshot[kMotorRightOffset], 0);
    EXPECT_EQ(snapshot[kMotorLeftOffset], 0);
}

void output_state_strip_zero_classic_rumble_only_removes_idle_selector() {
    Payload payload = empty_payload();
    payload[kValidFlag0Offset] = kFlag0CompatibleVibration | kFlag0HapticsSelect | kFlag0AudioControlEnable;
    payload[kValidFlag2Offset] = kFlag2EnableImprovedRumbleEmulation | kFlag2UseRumbleNotHaptics2;

    controller_output_state_strip_zero_classic_rumble(payload.data(), static_cast<uint16_t>(payload.size()));

    EXPECT_FALSE((payload[kValidFlag0Offset] & kFlag0CompatibleVibration) != 0);
    EXPECT_FALSE((payload[kValidFlag0Offset] & kFlag0HapticsSelect) != 0);
    EXPECT_TRUE((payload[kValidFlag0Offset] & kFlag0AudioControlEnable) != 0);
    EXPECT_FALSE((payload[kValidFlag2Offset] & kFlag2EnableImprovedRumbleEmulation) != 0);
    EXPECT_FALSE((payload[kValidFlag2Offset] & kFlag2UseRumbleNotHaptics2) != 0);

    payload = empty_payload();
    payload[kValidFlag0Offset] = kFlag0CompatibleVibration | kFlag0HapticsSelect;
    payload[kValidFlag2Offset] = kFlag2EnableImprovedRumbleEmulation | kFlag2UseRumbleNotHaptics2;
    payload[kMotorRightOffset] = 9;
    payload[kMotorLeftOffset] = 1;

    controller_output_state_strip_zero_classic_rumble(payload.data(), static_cast<uint16_t>(payload.size()));

    EXPECT_TRUE((payload[kValidFlag0Offset] & kFlag0CompatibleVibration) != 0);
    EXPECT_TRUE((payload[kValidFlag0Offset] & kFlag0HapticsSelect) != 0);
    EXPECT_TRUE((payload[kValidFlag2Offset] & kFlag2EnableImprovedRumbleEmulation) != 0);
    EXPECT_TRUE((payload[kValidFlag2Offset] & kFlag2UseRumbleNotHaptics2) != 0);
    EXPECT_EQ(payload[kMotorRightOffset], 9);
    EXPECT_EQ(payload[kMotorLeftOffset], 1);
}

void output_state_clear_classic_rumble_clears_cached_selector_state() {
    reset_output_state();

    auto payload = empty_payload();
    payload[kValidFlag0Offset] = kFlag0CompatibleVibration;
    payload[kValidFlag2Offset] = kFlag2EnableImprovedRumbleEmulation;
    payload[kMotorRightOffset] = 4;
    payload[kMotorLeftOffset] = 5;
    controller_output_state_apply_host_payload(payload.data(), static_cast<uint8_t>(payload.size()));
    EXPECT_FALSE(controller_output_state_classic_rumble_active());

    payload[kValidFlag0Offset] = kFlag0CompatibleVibration | kFlag0HapticsSelect;
    payload[kValidFlag2Offset] = kFlag2EnableImprovedRumbleEmulation | kFlag2UseRumbleNotHaptics2;
    controller_output_state_apply_host_payload(payload.data(), static_cast<uint8_t>(payload.size()));
    EXPECT_TRUE(controller_output_state_classic_rumble_active());

    controller_output_state_clear_classic_rumble();
    AudioSnapshot snapshot{};
    controller_output_state_copy_audio_snapshot(snapshot.data(), false);
    EXPECT_FALSE(controller_output_state_classic_rumble_active());
    EXPECT_FALSE((snapshot[kValidFlag0Offset] & kFlag0CompatibleVibration) != 0);
    EXPECT_FALSE((snapshot[kValidFlag0Offset] & kFlag0HapticsSelect) != 0);
    EXPECT_FALSE((snapshot[kValidFlag2Offset] & kFlag2EnableImprovedRumbleEmulation) != 0);
    EXPECT_FALSE((snapshot[kValidFlag2Offset] & kFlag2UseRumbleNotHaptics2) != 0);
    EXPECT_EQ(snapshot[kMotorRightOffset], 0);
    EXPECT_EQ(snapshot[kMotorLeftOffset], 0);
}

void output_state_preserves_haptic_low_pass_filter_byte() {
    reset_output_state();

    auto payload = empty_payload();
    payload[kValidFlag1Offset] = kFlag1HapticLowPassFilterEnable;
    payload[kHapticLowPassFilterOffset] = 0x81;
    controller_output_state_apply_host_payload(payload.data(), static_cast<uint8_t>(payload.size()));

    AudioSnapshot snapshot{};
    controller_output_state_copy_audio_snapshot(snapshot.data(), false);
    EXPECT_TRUE((snapshot[kValidFlag1Offset] & kFlag1HapticLowPassFilterEnable) != 0);
    EXPECT_EQ(snapshot[kHapticLowPassFilterOffset], 0x81);
}

void output_state_clear_triggers_removes_effect_bytes_flags_and_power() {
    auto payload = empty_payload();
    payload.fill(0x7b);
    payload[kValidFlag0Offset] = kFlag0RightTriggerEffect | kFlag0LeftTriggerEffect | kFlag0CompatibleVibration;
    payload[kValidFlag1Offset] = kFlag1MotorPowerLevelEnable | kFlag1LightbarControlEnable;
    payload[kTriggerPowerOffset] = 0x99;
    payload[kLightbarRedOffset] = 0x44;

    controller_output_state_clear_triggers(payload.data());

    EXPECT_EQ(payload[kValidFlag0Offset], kFlag0CompatibleVibration);
    EXPECT_EQ(payload[kValidFlag1Offset], kFlag1LightbarControlEnable);
    EXPECT_EQ(payload[kTriggerPowerOffset], 0);
    EXPECT_EQ(payload[kLightbarRedOffset], 0x44);
    for (uint8_t index = 0; index < kTriggerEffectSize; ++index) {
        EXPECT_EQ(payload[kTriggerEffectRightOffset + index], 0);
        EXPECT_EQ(payload[kTriggerEffectLeftOffset + index], 0);
    }
}

void rumble_state_machine_sends_real_stops_immediately() {
    ControllerOutputRumbleStateMachine state{};
    auto payload = empty_payload();

    EXPECT_FALSE(controller_output_rumble_payload_requires_immediate_send(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    ));

    payload[kValidFlag0Offset] = kFlag0HapticsSelect;
    payload[kValidFlag2Offset] = kFlag2EnableImprovedRumbleEmulation;
    payload[kMotorRightOffset] = 9;
    payload[kMotorLeftOffset] = 4;
    EXPECT_TRUE(controller_output_rumble_payload_requires_immediate_send(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    ));
    controller_output_rumble_state_apply_payload(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    );
    EXPECT_TRUE(state.classic_rumble_active);
    EXPECT_EQ(state.classic_rumble_right, 9);
    EXPECT_EQ(state.classic_rumble_left, 4);
    EXPECT_FALSE(controller_output_rumble_payload_requires_immediate_send(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    ));
    EXPECT_TRUE(controller_output_rumble_payload_is_redundant(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    ));

    payload[kMotorRightOffset] = 10;
    EXPECT_TRUE(controller_output_rumble_payload_requires_immediate_send(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    ));
    controller_output_rumble_state_apply_payload(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    );
    EXPECT_EQ(state.classic_rumble_right, 10);

    payload = empty_payload();
    payload[kValidFlag0Offset] = kFlag0HapticsSelect;
    payload[kValidFlag2Offset] = kFlag2EnableImprovedRumbleEmulation;
    EXPECT_TRUE(controller_output_rumble_payload_requires_immediate_send(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    ));
    controller_output_rumble_state_apply_payload(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    );
    EXPECT_FALSE(state.classic_rumble_active);
    EXPECT_FALSE(controller_output_rumble_payload_requires_immediate_send(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    ));
    EXPECT_TRUE(controller_output_rumble_payload_is_redundant(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    ));

    payload = empty_payload();
    payload[kValidFlag0Offset] = kFlag0CompatibleVibration | kFlag0HapticsSelect;
    payload[kMotorRightOffset] = 8;
    payload[kMotorLeftOffset] = 3;
    EXPECT_TRUE(controller_output_rumble_payload_requires_immediate_send(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    ));
    controller_output_rumble_state_apply_payload(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    );
    EXPECT_TRUE(state.classic_rumble_active);

    payload = empty_payload();
    EXPECT_TRUE(controller_output_rumble_payload_requires_immediate_send(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    ));
    controller_output_rumble_state_apply_payload(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    );
    EXPECT_FALSE(state.classic_rumble_active);

    payload = empty_payload();
    payload[kValidFlag0Offset] = kFlag0HapticsSelect;
    payload[kMotorRightOffset] = 6;
    payload[kMotorLeftOffset] = 2;
    controller_output_rumble_state_apply_payload(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    );
    EXPECT_TRUE(state.classic_rumble_active);

    payload = empty_payload();
    payload[kValidFlag0Offset] = kFlag0RightTriggerEffect;
    std::fill_n(payload.data() + kTriggerEffectRightOffset, kTriggerEffectSize, 0x31);
    EXPECT_TRUE(controller_output_rumble_payload_requires_immediate_send(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    ));
    controller_output_rumble_state_apply_payload(
        state,
        payload.data(),
        static_cast<uint16_t>(payload.size())
    );
    EXPECT_FALSE(state.classic_rumble_active);
}

void haptics_test_signal_matches_original_main_packet_flip_pattern() {
    HapticFrame first{};
    HapticFrame second{};
    HapticFrame boosted{};

    haptics_test_signal_fill(first.data(), first.size(), 0, 36, 72, 100);
    haptics_test_signal_fill(second.data(), second.size(), 1, 36, 72, 100);
    haptics_test_signal_fill(boosted.data(), boosted.size(), 8, 36, 72, 500);

    EXPECT_EQ(haptic_frame_peak(first), 72);
    EXPECT_EQ(haptic_frame_peak(second), 72);
    EXPECT_EQ(haptic_frame_peak(boosted), 127);
    EXPECT_EQ(first[0], -72);
    EXPECT_EQ(first[1], 72);
    EXPECT_EQ(second[0], 72);
    EXPECT_EQ(second[1], -72);
}

void haptics_test_signal_is_constant_inside_each_original_packet() {
    HapticFrame sustain{};
    haptics_test_signal_fill(sustain.data(), sustain.size(), 8, 36, 72, 100);

    EXPECT_EQ(haptic_frame_left_sign_flips(sustain), 0);
}

void haptics_test_signal_drives_left_and_right_actuators_opposite_phase() {
    HapticFrame frame{};
    haptics_test_signal_fill(frame.data(), frame.size(), 8, 36, 72, 100);

    for (uint8_t index = 0; index < frame.size(); index += 2) {
        EXPECT_EQ(frame[index], static_cast<int8_t>(-frame[index + 1]));
    }

    haptics_test_signal_fill(frame.data(), frame.size(), 8, 36, 72, 0);
    for (int8_t sample : frame) {
        EXPECT_EQ(sample, 0);
    }
}

void haptics_test_signal_allows_carrier_paced_packets_without_wall_clock_gap() {
    constexpr uint32_t interval_us = 10666;
    constexpr uint32_t last_packet_us = 100000;

    EXPECT_FALSE(haptics_test_signal_packet_due(last_packet_us + interval_us - 1, last_packet_us, interval_us, false));
    EXPECT_TRUE(haptics_test_signal_packet_due(last_packet_us + 1, last_packet_us, interval_us, true));
    EXPECT_TRUE(haptics_test_signal_packet_due(last_packet_us + interval_us, last_packet_us, interval_us, false));
    EXPECT_TRUE(haptics_test_signal_packet_due(last_packet_us + 1, 0, interval_us, false));
}

void dualsense_decoder_extracts_normalized_controller_state() {
    const auto report = sample_dualsense_input_report();
    BridgeControllerState state{};

    EXPECT_TRUE(dualsense_decode_usb_input_report(report.data(), report.size(), state));
    EXPECT_EQ(state.left_stick_x, 0x00);
    EXPECT_EQ(state.left_stick_y, 0xff);
    EXPECT_EQ(state.right_stick_x, 0x80);
    EXPECT_EQ(state.right_stick_y, 0x40);
    EXPECT_EQ(state.left_trigger, 0x22);
    EXPECT_EQ(state.right_trigger, 0xcc);
    EXPECT_FALSE(state.dpad_up);
    EXPECT_FALSE(state.dpad_down);
    EXPECT_FALSE(state.dpad_left);
    EXPECT_TRUE(state.dpad_right);
    EXPECT_TRUE(state.cross);
    EXPECT_FALSE(state.circle);
    EXPECT_TRUE(state.l1);
    EXPECT_TRUE(state.r2_pressed);
    EXPECT_TRUE(state.create);
    EXPECT_TRUE(state.r3);
    EXPECT_TRUE(state.home);
    EXPECT_TRUE(state.touchpad);
    EXPECT_TRUE(state.edge_left_paddle);
    EXPECT_EQ(state.battery_percent, 70);
    EXPECT_TRUE(state.headset_plugged);
    EXPECT_TRUE(state.microphone_muted);
    EXPECT_TRUE(state.motion_valid);
    EXPECT_EQ(state.gyro_x, 0x1234);
    EXPECT_EQ(state.gyro_y, 0x5678);
    EXPECT_EQ(state.gyro_z, static_cast<int16_t>(0x9abc));
    EXPECT_EQ(state.accel_x, static_cast<int16_t>(0xcdef));
    EXPECT_EQ(state.accel_y, 0x1357);
    EXPECT_EQ(state.accel_z, 0x2468);
    EXPECT_EQ(state.sensor_timestamp, 0x11223344u);
    EXPECT_TRUE(state.touch_points[0].active);
    EXPECT_EQ(state.touch_points[0].contact_id, 5);
    EXPECT_EQ(state.touch_points[0].x, 1200);
    EXPECT_EQ(state.touch_points[0].y, 540);
    EXPECT_FALSE(state.touch_points[1].active);
    EXPECT_EQ(state.touch_points[1].contact_id, 6);
    EXPECT_EQ(state.touch_points[1].x, 0);
    EXPECT_EQ(state.touch_points[1].y, 0);
    EXPECT_EQ(state.dualsense_report_len, kDualSenseUsbInputReportSize);
    EXPECT_EQ(state.dualsense_report[7], report[7]);
}

void dualsense_persona_preserves_native_report_bytes() {
    const auto report = sample_dualsense_input_report();
    BridgeControllerState state{};
    HostPersonaInputReport encoded{};

    EXPECT_TRUE(dualsense_decode_usb_input_report(report.data(), report.size(), state));
    EXPECT_TRUE(host_persona_encode_input(HostPersonaModeDualSense, state, encoded));
    EXPECT_EQ(encoded.report_id, 0x01);
    EXPECT_EQ(encoded.len, kDualSenseUsbInputReportSize);
    for (uint8_t index = 0; index < kDualSenseUsbInputReportSize; index++) {
        EXPECT_EQ(encoded.bytes[index], report[index]);
    }
}

void xusb360_persona_maps_standard_gamepad_fields() {
    const auto report = sample_dualsense_input_report();
    BridgeControllerState state{};
    HostPersonaInputReport encoded{};

    EXPECT_TRUE(dualsense_decode_usb_input_report(report.data(), report.size(), state));
    EXPECT_TRUE(host_persona_encode_input(HostPersonaModeXusb360, state, encoded));
    EXPECT_EQ(encoded.report_id, 0);
    EXPECT_EQ(encoded.len, kXusb360InputReportSize);
    EXPECT_EQ(encoded.bytes[0], 0x00);
    EXPECT_EQ(encoded.bytes[1], kXusb360InputReportSize);
    const uint16_t buttons = static_cast<uint16_t>(encoded.bytes[2] | (encoded.bytes[3] << 8));
    EXPECT_TRUE((buttons & 0x0008) != 0); // D-pad right.
    EXPECT_TRUE((buttons & 0x0020) != 0); // Back/View.
    EXPECT_TRUE((buttons & 0x0080) != 0); // Right stick.
    EXPECT_TRUE((buttons & 0x0100) != 0); // Left shoulder.
    EXPECT_TRUE((buttons & 0x0400) != 0); // Guide.
    EXPECT_TRUE((buttons & 0x1000) != 0); // A.
    EXPECT_FALSE((buttons & 0x2000) != 0); // B.
    EXPECT_EQ(encoded.bytes[4], 0x22);
    EXPECT_EQ(encoded.bytes[5], 0xcc);
}

void xusb360_rumble_decodes_to_ds5_classic_rumble_payload() {
    uint8_t output[kXusb360RumbleOutputSize] = {0x00, kXusb360RumbleOutputSize, 0x00, 0x90, 0x30, 0, 0, 0};
    Payload payload{};
    uint16_t payload_len = 0;

    EXPECT_TRUE(host_persona_decode_output_to_ds5_payload(
        HostPersonaModeXusb360,
        output,
        sizeof(output),
        payload.data(),
        payload.size(),
        payload_len
    ));
    EXPECT_EQ(payload_len, kCommonPayloadSize);
    EXPECT_TRUE((payload[kValidFlag0Offset] & kFlag0HapticsSelect) != 0);
    EXPECT_FALSE((payload[kValidFlag0Offset] & kFlag0CompatibleVibration) != 0);
    EXPECT_TRUE((payload[kValidFlag2Offset] & kFlag2EnableImprovedRumbleEmulation) != 0);
    EXPECT_TRUE((payload[kValidFlag2Offset] & kFlag2UseRumbleNotHaptics2) != 0);
    EXPECT_EQ(payload[kMotorLeftOffset], 0x90);
    EXPECT_EQ(payload[kMotorRightOffset], 0x30);
}

void classic_rumble_renderer_can_emit_v1_classic_rumble() {
    reset_policy_state();
    controller_output_policy_set_classic_rumble_v1_enabled(true);

    Payload payload{};
    EXPECT_TRUE(controller_output_policy_render_classic_rumble_payload(
        payload.data(),
        payload.size(),
        0x30,
        0x90
    ));
    EXPECT_TRUE((payload[kValidFlag0Offset] & kFlag0CompatibleVibration) != 0);
    EXPECT_TRUE((payload[kValidFlag0Offset] & kFlag0HapticsSelect) != 0);
    EXPECT_FALSE((payload[kValidFlag2Offset] & kFlag2EnableImprovedRumbleEmulation) != 0);
    EXPECT_FALSE((payload[kValidFlag2Offset] & kFlag2UseRumbleNotHaptics2) != 0);
    EXPECT_EQ(payload[kMotorLeftOffset], 0x90);
    EXPECT_EQ(payload[kMotorRightOffset], 0x30);

    reset_policy_state();
}

void ds4_persona_maps_standard_gamepad_fields() {
    const auto report = sample_dualsense_input_report();
    BridgeControllerState state{};
    HostPersonaInputReport encoded{};

    EXPECT_TRUE(dualsense_decode_usb_input_report(report.data(), report.size(), state));
    EXPECT_TRUE(host_persona_encode_input(HostPersonaModeDs4, state, encoded));
    EXPECT_EQ(encoded.report_id, kDs4InputReportId);
    EXPECT_EQ(encoded.len, kDs4InputReportSize - 1);
    EXPECT_EQ(encoded.bytes[0], 0x00);
    EXPECT_EQ(encoded.bytes[1], 0xff);
    EXPECT_EQ(encoded.bytes[2], 0x80);
    EXPECT_EQ(encoded.bytes[3], 0x40);
    EXPECT_EQ(encoded.bytes[4], 0x22); // D-pad right + Cross.
    EXPECT_EQ(encoded.bytes[5], 0x9d); // L1 + L2 + R2 + Share + R3.
    EXPECT_EQ(encoded.bytes[6] & 0x03, 0x03); // PS + touchpad click.
    EXPECT_EQ(encoded.bytes[7], 0x22);
    EXPECT_EQ(encoded.bytes[8], 0xcc);
    EXPECT_EQ(encoded.bytes[9], 0x44);
    EXPECT_EQ(encoded.bytes[10], 0x33);
    EXPECT_EQ(encoded.bytes[11], 0x09);
    EXPECT_EQ(encoded.bytes[12], 0x34);
    EXPECT_EQ(encoded.bytes[13], 0x12);
    EXPECT_EQ(encoded.bytes[14], 0x78);
    EXPECT_EQ(encoded.bytes[15], 0x56);
    EXPECT_EQ(encoded.bytes[16], 0xbc);
    EXPECT_EQ(encoded.bytes[17], 0x9a);
    EXPECT_EQ(encoded.bytes[18], 0xef);
    EXPECT_EQ(encoded.bytes[19], 0xcd);
    EXPECT_EQ(encoded.bytes[20], 0x57);
    EXPECT_EQ(encoded.bytes[21], 0x13);
    EXPECT_EQ(encoded.bytes[22], 0x68);
    EXPECT_EQ(encoded.bytes[23], 0x24);
    EXPECT_EQ(encoded.bytes[29], 0x1a);
    EXPECT_EQ(encoded.bytes[32], 0x01);
    EXPECT_EQ(encoded.bytes[33], 0x44);
    EXPECT_EQ(encoded.bytes[34], 0x05);
    EXPECT_EQ(encoded.bytes[35], 0xb0);
    EXPECT_EQ(encoded.bytes[36], 0x74);
    EXPECT_EQ(encoded.bytes[37], 0x1d);
    EXPECT_EQ(encoded.bytes[38], 0x86);
    EXPECT_EQ(encoded.bytes[39], 0x00);
    EXPECT_EQ(encoded.bytes[40], 0x00);
    EXPECT_EQ(encoded.bytes[41], 0x00);
}

void ds4_output_decodes_to_ds5_rumble_and_lightbar_payload() {
    uint8_t output[] = {0x05, 0x03, 0x00, 0x00, 0x12, 0xfe, 0x11, 0x22, 0x33, 0x04, 0x05};
    Payload payload{};
    uint16_t payload_len = 0;

    EXPECT_TRUE(host_persona_decode_output_to_ds5_payload(
        HostPersonaModeDs4,
        output,
        sizeof(output),
        payload.data(),
        payload.size(),
        payload_len
    ));
    EXPECT_EQ(payload_len, kCommonPayloadSize);
    EXPECT_TRUE((payload[kValidFlag0Offset] & kFlag0HapticsSelect) != 0);
    EXPECT_FALSE((payload[kValidFlag0Offset] & kFlag0CompatibleVibration) != 0);
    EXPECT_TRUE((payload[kValidFlag2Offset] & kFlag2EnableImprovedRumbleEmulation) != 0);
    EXPECT_TRUE((payload[kValidFlag2Offset] & kFlag2UseRumbleNotHaptics2) != 0);
    EXPECT_TRUE((payload[kValidFlag1Offset] & kFlag1LightbarControlEnable) != 0);
    EXPECT_EQ(payload[kMotorRightOffset], 0x12);
    EXPECT_EQ(payload[kMotorLeftOffset], 0xfe);
    EXPECT_EQ(payload[kLightbarRedOffset], 0x11);
    EXPECT_EQ(payload[kLightbarGreenOffset], 0x22);
    EXPECT_EQ(payload[kLightbarBlueOffset], 0x33);
}

void dualsense_persona_feature_reports_cover_identity_probe_surface() {
    std::array<uint8_t, 63> feature{};

    feature.fill(0xaa);
    EXPECT_EQ(dualsense_persona_get_feature_report(0x03, feature.data(), 47), 47);
    EXPECT_TRUE(dualsense_persona_has_synthetic_feature_report(0x03));
    EXPECT_EQ(feature[1], 0x28);
    EXPECT_EQ(feature[3], 0x4e);
    EXPECT_EQ(feature[19], 0x81);

    feature.fill(0xaa);
    EXPECT_EQ(dualsense_persona_get_feature_report(0x05, feature.data(), 40), 40);
    EXPECT_TRUE(dualsense_persona_has_synthetic_feature_report(0x05));
    EXPECT_EQ(feature[6], 0x00);
    EXPECT_EQ(feature[7], 0x04);
    EXPECT_EQ(feature[8], 0x00);
    EXPECT_EQ(feature[9], 0xfc);

    feature.fill(0xaa);
    EXPECT_EQ(dualsense_persona_get_feature_report(0x09, feature.data(), 19), 19);
    EXPECT_TRUE(dualsense_persona_has_synthetic_feature_report(0x09));
    EXPECT_EQ(feature[0], 0x00);
    EXPECT_EQ(feature[1], 0xa5);
    EXPECT_EQ(feature[2], 0x19);
    EXPECT_EQ(feature[3], 0xf6);
    EXPECT_EQ(feature[4], 0x0b);
    EXPECT_EQ(feature[5], 0x02);

    feature.fill(0xaa);
    EXPECT_EQ(dualsense_persona_get_feature_report(0x20, feature.data(), 63), 63);
    EXPECT_TRUE(dualsense_persona_has_synthetic_feature_report(0x20));
    EXPECT_EQ(feature[0], static_cast<uint8_t>('J'));
    EXPECT_EQ(feature[11], static_cast<uint8_t>('1'));
    EXPECT_EQ(feature[19], 0x02);
    EXPECT_EQ(feature[21], 0x04);
    EXPECT_EQ(feature[23], 0x17);
    EXPECT_EQ(feature[24], 0x06);
    EXPECT_EQ(feature[27], 0x2a);
    EXPECT_EQ(feature[29], 0x10);
    EXPECT_EQ(feature[30], 0x01);
    EXPECT_EQ(feature[43], 0x30);
    EXPECT_EQ(feature[44], 0x06);
    EXPECT_EQ(feature[47], 0x3c);
    EXPECT_EQ(feature[49], 0x01);
    EXPECT_EQ(feature[51], 0x0a);
    EXPECT_EQ(feature[53], 0x02);
    EXPECT_EQ(feature[55], 0x06);

    feature.fill(0xaa);
    EXPECT_EQ(dualsense_persona_get_feature_report(0x22, feature.data(), 63), 63);
    EXPECT_FALSE(dualsense_persona_has_synthetic_feature_report(0x22));
    for (uint8_t value : feature) {
        EXPECT_EQ(value, 0);
    }
}

void ds4_feature_reports_cover_native_probe_surface() {
    std::array<uint8_t, 64> feature{};

    EXPECT_EQ(ds4_persona_get_feature_report(0x03, feature.data(), 47), 47);
    EXPECT_EQ(feature[1], 0x27);
    EXPECT_EQ(feature[3], 0x4e);

    feature.fill(0);
    EXPECT_EQ(ds4_persona_get_feature_report(0x05, feature.data(), 36), 36);
    EXPECT_EQ(feature[7], 0x04);
    EXPECT_EQ(feature[9], 0xfc);

    feature.fill(0);
    EXPECT_EQ(ds4_persona_get_feature_report(0x81, feature.data(), 63), 63);
    EXPECT_EQ(feature[0], 0x11);
    EXPECT_EQ(feature[17], static_cast<uint8_t>('1'));
    EXPECT_EQ(feature[33], static_cast<uint8_t>('J'));

    feature.fill(0);
    EXPECT_EQ(ds4_persona_get_feature_report(0xa3, feature.data(), 48), 48);
    EXPECT_EQ(feature[0], static_cast<uint8_t>('S'));
    EXPECT_EQ(feature[32], 0x01);
    EXPECT_EQ(feature[46], 0x01);

    feature.fill(0);
    const uint8_t serial_subcommand = 0x02;
    ds4_persona_set_feature_report(0xa0, &serial_subcommand, 1);
    EXPECT_EQ(ds4_persona_get_feature_report(0xa4, feature.data(), 13), 13);
    EXPECT_EQ(feature[0], 0x0b);
    EXPECT_EQ(feature[4], 0x00);
}

struct TestCase {
    char const *name;
    void (*run)();
};

std::vector<TestCase> tests{
    {"scheduler prioritizes audio when non-audio would delay streaming", scheduler_prioritizes_audio_when_non_audio_would_delay_streaming},
    {"scheduler sends coalesced state when audio is absent", scheduler_sends_coalesced_state_when_audio_is_absent},
    {"scheduler audio due on age backlog or fairness limit", scheduler_audio_due_on_age_backlog_or_fairness_limit},
    {"packet compositor initializes bluetooth report and wraps sequence", packet_compositor_initializes_bluetooth_report_and_wraps_sequence},
    {"classic rumble gain clamps rounds and touches motor payloads", classic_rumble_gain_clamps_rounds_and_touches_motor_payloads},
    {"audio haptics replace tracks state without suppressing classic rumble", audio_haptics_replace_tracks_state_without_suppressing_classic_rumble},
    {"speaker sanitizer strips host amp flags and zeroes only controlled fields", speaker_sanitizer_strips_host_amp_flags_and_zeroes_only_controlled_fields},
    {"mic sanitizer removes mute led and only mic power save bit", mic_sanitizer_removes_mute_led_and_only_mic_power_save_bit},
    {"lightbar override removes host led claims without mutating color bytes", lightbar_override_removes_host_led_claims_without_mutating_color_bytes},
    {"host led clear detection covers release player and lightbar paths", host_led_clear_detection_covers_release_player_and_lightbar_paths},
    {"output state audio snapshot routes to speaker and headphones safely", output_state_audio_snapshot_routes_to_speaker_and_headphones_safely},
    {"output state audio snapshot preserves adaptive trigger effects and motor power", output_state_audio_snapshot_preserves_adaptive_trigger_effects_and_motor_power},
    {"output state lightbar override is scaled and survives audio snapshot", output_state_lightbar_override_is_scaled_and_survives_audio_snapshot},
    {"output state player led enabled preserves host indicator", output_state_player_led_enabled_preserves_host_indicator},
    {"output state player led disabled suppresses host indicator", output_state_player_led_disabled_suppresses_host_indicator},
    {"output state player led reenabled restores host indicator", output_state_player_led_reenabled_restores_host_indicator},
    {"output state player led release invalidates cached indicator", output_state_player_led_release_invalidates_cached_indicator},
    {"output state preserves selector zero and ignores motor only rumble", output_state_preserves_selector_zero_and_ignores_motor_only_rumble},
    {"output state strip zero classic rumble only removes idle selector", output_state_strip_zero_classic_rumble_only_removes_idle_selector},
    {"output state clear classic rumble clears cached selector state", output_state_clear_classic_rumble_clears_cached_selector_state},
    {"output state preserves haptic low pass filter byte", output_state_preserves_haptic_low_pass_filter_byte},
    {"output state clear triggers removes effect bytes flags and power", output_state_clear_triggers_removes_effect_bytes_flags_and_power},
    {"rumble state machine sends real stops immediately", rumble_state_machine_sends_real_stops_immediately},
    {"haptics test signal matches original main packet flip pattern", haptics_test_signal_matches_original_main_packet_flip_pattern},
    {"haptics test signal is constant inside each original packet", haptics_test_signal_is_constant_inside_each_original_packet},
    {"haptics test signal drives left and right actuators opposite phase", haptics_test_signal_drives_left_and_right_actuators_opposite_phase},
    {"haptics test signal allows carrier paced packets without wall clock gap", haptics_test_signal_allows_carrier_paced_packets_without_wall_clock_gap},
    {"dualsense decoder extracts normalized controller state", dualsense_decoder_extracts_normalized_controller_state},
    {"dualsense persona preserves native report bytes", dualsense_persona_preserves_native_report_bytes},
    {"xusb360 persona maps standard gamepad fields", xusb360_persona_maps_standard_gamepad_fields},
    {"xusb360 rumble decodes to ds5 classic rumble payload", xusb360_rumble_decodes_to_ds5_classic_rumble_payload},
    {"classic rumble renderer can emit v1 classic rumble", classic_rumble_renderer_can_emit_v1_classic_rumble},
    {"ds4 persona maps standard gamepad fields", ds4_persona_maps_standard_gamepad_fields},
    {"ds4 output decodes to ds5 rumble and lightbar payload", ds4_output_decodes_to_ds5_rumble_and_lightbar_payload},
    {"dualsense persona feature reports cover identity probe surface", dualsense_persona_feature_reports_cover_identity_probe_surface},
    {"ds4 feature reports cover native probe surface", ds4_feature_reports_cover_native_probe_surface},
};

} // namespace

int main() {
    int failures = 0;
    for (auto const &test : tests) {
        try {
            test.run();
            std::cout << "[PASS] " << test.name << '\n';
        } catch (std::exception const &error) {
            ++failures;
            std::cerr << "[FAIL] " << test.name << '\n' << error.what() << '\n';
        }
    }

    if (failures != 0) {
        std::cerr << failures << " firmware logic test(s) failed\n";
        return 1;
    }

    std::cout << tests.size() << " firmware logic tests passed\n";
    return 0;
}
