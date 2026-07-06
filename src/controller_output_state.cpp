#include "controller_output_state.h"

#include <algorithm>
#include <cstring>

#include "dualsense_output.h"

using namespace ds5::output;

namespace {

uint8_t state_data[kAudioStateSnapshotSize] = {
    0xfd, 0xf7, 0x0, 0x0,
    0x7f, 0x64,
    0xff, 0x9, 0x0, 0x0F, 0x0, 0x0, 0x0, 0x0,
    0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0,
    0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0,
    0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x2,
    0x7, 0x0, 0x0, 0x2, 0x1,
    0x00,
    0x00, 0x00, 0xff,
};

uint8_t cached_right_trigger[kTriggerEffectSize]{};
uint8_t cached_left_trigger[kTriggerEffectSize]{};
bool cached_right_trigger_valid = false;
bool cached_left_trigger_valid = false;
uint8_t cached_trigger_power = 0;
bool cached_trigger_power_valid = false;
bool player_led_enabled = true;
uint8_t cached_player_leds = 0;
bool cached_player_leds_valid = false;

uint8_t normalize_speaker_gain(uint8_t gain) {
    return std::min<uint8_t>(7, std::max<uint8_t>(1, gain));
}

void clamp_speaker_volume() {
    if (state_data[kSpeakerVolumeOffset] > kSpeakerVolumeMax) {
        state_data[kSpeakerVolumeOffset] = kSpeakerVolumeMax;
    }
}

void clear_mic_control(uint8_t *payload) {
    if (payload == nullptr) {
        return;
    }

    payload[kValidFlag0Offset] = static_cast<uint8_t>(
        payload[kValidFlag0Offset] & static_cast<uint8_t>(~kFlag0MicVolumeEnable)
    );
    payload[kValidFlag1Offset] = static_cast<uint8_t>(
        payload[kValidFlag1Offset] & static_cast<uint8_t>(~kFlag1MicMuteLedControlEnable)
    );
    if ((payload[kValidFlag1Offset] & kFlag1PowerSaveControlEnable) != 0) {
        payload[kPowerSaveControlOffset] = static_cast<uint8_t>(
            payload[kPowerSaveControlOffset] & static_cast<uint8_t>(~kPowerSaveControlMicMute)
        );
        if (payload[kPowerSaveControlOffset] == 0) {
            payload[kValidFlag1Offset] = static_cast<uint8_t>(
                payload[kValidFlag1Offset] & static_cast<uint8_t>(~kFlag1PowerSaveControlEnable)
            );
        }
    }
    payload[kMicVolumeOffset] = 0;
    payload[kMuteLedOffset] = 0;
}

uint8_t scale_lightbar_channel(uint8_t channel, uint8_t brightness_percent) {
    return scaled_percent(channel, brightness_percent);
}

void apply_player_led_policy(uint8_t *payload) {
    if (payload == nullptr) {
        return;
    }
    if (player_led_enabled) {
        return;
    }
    payload[kValidFlag1Offset] |= kFlag1PlayerIndicatorControlEnable;
    payload[kPlayerLedsOffset] = 0;
}

void cache_player_leds_from_payload(uint8_t const *payload, uint8_t len) {
    if (payload == nullptr || len <= kValidFlag1Offset) {
        return;
    }
    const uint8_t flag1 = payload[kValidFlag1Offset];
    if ((flag1 & kFlag1ReleaseLeds) != 0) {
        cached_player_leds = 0;
        cached_player_leds_valid = false;
        return;
    }
    if (len <= kPlayerLedsOffset || (flag1 & kFlag1PlayerIndicatorControlEnable) == 0) {
        return;
    }

    cached_player_leds = payload[kPlayerLedsOffset];
    cached_player_leds_valid = true;
}

void release_player_led_policy(uint8_t *payload) {
    if (payload == nullptr) {
        return;
    }
    payload[kValidFlag1Offset] = static_cast<uint8_t>(
        payload[kValidFlag1Offset] & static_cast<uint8_t>(~kFlag1PlayerIndicatorControlEnable)
    );
    payload[kPlayerLedsOffset] = 0;
}

void restore_player_led_policy(uint8_t *payload) {
    if (payload == nullptr) {
        return;
    }
    if (!cached_player_leds_valid) {
        release_player_led_policy(payload);
        return;
    }

    payload[kValidFlag1Offset] = static_cast<uint8_t>(
        (payload[kValidFlag1Offset] & static_cast<uint8_t>(~kFlag1ReleaseLeds))
        | kFlag1PlayerIndicatorControlEnable
    );
    payload[kPlayerLedsOffset] = cached_player_leds;
}

void apply_current_player_led_policy(uint8_t *payload) {
    if (player_led_enabled) {
        restore_player_led_policy(payload);
    } else {
        apply_player_led_policy(payload);
    }
}

void clear_adaptive_trigger_effects(uint8_t *payload) {
    if (payload == nullptr) {
        return;
    }

    payload[kValidFlag0Offset] = static_cast<uint8_t>(
        payload[kValidFlag0Offset]
        & static_cast<uint8_t>(~(kFlag0RightTriggerEffect | kFlag0LeftTriggerEffect))
    );
    std::memset(payload + kTriggerEffectRightOffset, 0, kTriggerEffectSize);
    std::memset(payload + kTriggerEffectLeftOffset, 0, kTriggerEffectSize);
}

bool payload_uses_classic_rumble(uint8_t const *payload, uint8_t len) {
    if (payload == nullptr || len <= kValidFlag1Offset) {
        return false;
    }

    const uint8_t flag0 = payload[kValidFlag0Offset];
    const uint8_t flag2 = len > kValidFlag2Offset ? payload[kValidFlag2Offset] : 0;
    return (flag0 & kFlag0HapticsSelect) != 0
        || (flag2 & kFlag2UseRumbleNotHaptics2) != 0;
}

void copy_payload_range_if_allowed(
    uint8_t const *source,
    uint8_t source_len,
    bool allowed,
    uint8_t offset,
    uint8_t length
) {
    const uint16_t end = static_cast<uint16_t>(offset) + length;
    if (!allowed || source == nullptr || end > source_len || end > sizeof(state_data)) {
        return;
    }

    std::memcpy(state_data + offset, source + offset, length);
}

} // namespace

void controller_output_state_clear_triggers(uint8_t *payload) {
    if (payload == nullptr) {
        return;
    }

    clear_adaptive_trigger_effects(payload);
    payload[kValidFlag1Offset] = static_cast<uint8_t>(
        payload[kValidFlag1Offset] & static_cast<uint8_t>(~kFlag1MotorPowerLevelEnable)
    );
    payload[kTriggerPowerOffset] = 0;
}

void controller_output_state_reset_cached_triggers() {
    cached_right_trigger_valid = false;
    cached_left_trigger_valid = false;
    cached_trigger_power = 0;
    cached_trigger_power_valid = false;
}

void controller_output_state_reset_cached_player_leds() {
    cached_player_leds = 0;
    cached_player_leds_valid = false;
}

void controller_output_state_reset() {
    const uint8_t defaults[kAudioStateSnapshotSize] = {
        0xfd, 0xf7, 0x0, 0x0,
        0x7f, 0x64,
        0xff, 0x9, 0x0, 0x0F, 0x0, 0x0, 0x0, 0x0,
        0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0,
        0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0,
        0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x0, 0x2,
        0x7, 0x0, 0x0, 0x2, 0x1,
        0x00,
        0x00, 0x00, 0xff,
    };
    std::memcpy(state_data, defaults, sizeof(state_data));
    controller_output_state_reset_cached_triggers();
    controller_output_state_reset_cached_player_leds();
    player_led_enabled = true;
}

bool controller_output_state_classic_rumble_active() {
    return (state_data[kMotorRightOffset] | state_data[kMotorLeftOffset]) != 0;
}

void controller_output_state_clear_classic_rumble() {
    state_data[kValidFlag0Offset] = static_cast<uint8_t>(
        state_data[kValidFlag0Offset] & static_cast<uint8_t>(~(
            kFlag0CompatibleVibration | kFlag0HapticsSelect
        ))
    );
    state_data[kValidFlag2Offset] = static_cast<uint8_t>(
        state_data[kValidFlag2Offset] & static_cast<uint8_t>(~(
            kFlag2EnableImprovedRumbleEmulation | kFlag2UseRumbleNotHaptics2
        ))
    );
    state_data[kMotorRightOffset] = 0;
    state_data[kMotorLeftOffset] = 0;
}

void controller_output_state_strip_zero_classic_rumble(uint8_t *payload, uint16_t len) {
    if (payload == nullptr || len <= kMotorLeftOffset) {
        return;
    }

    if ((payload[kMotorRightOffset] | payload[kMotorLeftOffset]) != 0) {
        return;
    }

    payload[kValidFlag0Offset] = static_cast<uint8_t>(
        payload[kValidFlag0Offset] & static_cast<uint8_t>(~(
            kFlag0CompatibleVibration | kFlag0HapticsSelect
        ))
    );
    if (len > kValidFlag2Offset) {
        payload[kValidFlag2Offset] = static_cast<uint8_t>(
            payload[kValidFlag2Offset] & static_cast<uint8_t>(~(
                kFlag2EnableImprovedRumbleEmulation | kFlag2UseRumbleNotHaptics2
            ))
        );
    }
    payload[kMotorRightOffset] = 0;
    payload[kMotorLeftOffset] = 0;
}

void controller_output_state_apply_host_payload(uint8_t const *data, uint8_t len) {
    if (data == nullptr || len < kCommonPayloadSize) {
        return;
    }

    const uint8_t copy_len = len > sizeof(state_data) ? sizeof(state_data) : len;
    uint8_t update[kAudioStateSnapshotSize]{};
    std::memcpy(update, data, copy_len);

    if (copy_len > kValidFlag0Offset) {
        const uint8_t rumble_flags = static_cast<uint8_t>(
            update[kValidFlag0Offset] & static_cast<uint8_t>(kFlag0CompatibleVibration | kFlag0HapticsSelect)
        );
        state_data[kValidFlag0Offset] = static_cast<uint8_t>(
            (state_data[kValidFlag0Offset] & static_cast<uint8_t>(~(
                kFlag0CompatibleVibration | kFlag0HapticsSelect
            ))) | rumble_flags
        );
    }
    if (copy_len > kValidFlag2Offset) {
        state_data[kValidFlag2Offset] = static_cast<uint8_t>(
            (state_data[kValidFlag2Offset] & static_cast<uint8_t>(~(
                kFlag2EnableImprovedRumbleEmulation | kFlag2UseRumbleNotHaptics2
            )))
            | (update[kValidFlag2Offset] & static_cast<uint8_t>(
                kFlag2EnableImprovedRumbleEmulation | kFlag2UseRumbleNotHaptics2
            ))
        );
    }

    if (payload_uses_classic_rumble(update, copy_len) && copy_len > kMotorLeftOffset) {
        state_data[kMotorRightOffset] = update[kMotorRightOffset];
        state_data[kMotorLeftOffset] = update[kMotorLeftOffset];
    } else if (copy_len > kMotorLeftOffset) {
        state_data[kMotorRightOffset] = 0;
        state_data[kMotorLeftOffset] = 0;
    }
    if ((update[kValidFlag1Offset] & kFlag1ReleaseLeds) != 0) {
        state_data[kValidFlag1Offset] = static_cast<uint8_t>(
            (state_data[kValidFlag1Offset] | kFlag1ReleaseLeds)
            & static_cast<uint8_t>(~kFlag1PlayerIndicatorControlEnable)
        );
        state_data[kPlayerLedsOffset] = 0;
        cached_player_leds = 0;
        cached_player_leds_valid = false;
    }

    copy_payload_range_if_allowed(
        update,
        copy_len,
        (update[kValidFlag0Offset] & kFlag0SpeakerVolumeEnable) != 0,
        kSpeakerVolumeOffset,
        1
    );
    copy_payload_range_if_allowed(
        update,
        copy_len,
        (update[kValidFlag0Offset] & kFlag0MicVolumeEnable) != 0,
        kMicVolumeOffset,
        1
    );
    copy_payload_range_if_allowed(
        update,
        copy_len,
        (update[kValidFlag0Offset] & kFlag0AudioControlEnable) != 0,
        kAudioControlOffset,
        1
    );
    copy_payload_range_if_allowed(
        update,
        copy_len,
        (update[kValidFlag1Offset] & kFlag1MicMuteLedControlEnable) != 0,
        kMuteLedOffset,
        1
    );
    copy_payload_range_if_allowed(
        update,
        copy_len,
        (update[kValidFlag1Offset] & kFlag1PowerSaveControlEnable) != 0,
        kPowerSaveControlOffset,
        1
    );

    if (
        (update[kValidFlag0Offset] & kFlag0RightTriggerEffect) != 0
        && copy_len > kTriggerEffectRightOffset + kTriggerEffectSize - 1
    ) {
        std::memcpy(state_data + kTriggerEffectRightOffset, update + kTriggerEffectRightOffset, kTriggerEffectSize);
        state_data[kValidFlag0Offset] |= kFlag0RightTriggerEffect;
        std::memcpy(cached_right_trigger, state_data + kTriggerEffectRightOffset, sizeof(cached_right_trigger));
        cached_right_trigger_valid = true;
    }

    if (
        (update[kValidFlag0Offset] & kFlag0LeftTriggerEffect) != 0
        && copy_len > kTriggerEffectLeftOffset + kTriggerEffectSize - 1
    ) {
        std::memcpy(state_data + kTriggerEffectLeftOffset, update + kTriggerEffectLeftOffset, kTriggerEffectSize);
        state_data[kValidFlag0Offset] |= kFlag0LeftTriggerEffect;
        std::memcpy(cached_left_trigger, state_data + kTriggerEffectLeftOffset, sizeof(cached_left_trigger));
        cached_left_trigger_valid = true;
    }

    if (
        (update[kValidFlag1Offset] & kFlag1MotorPowerLevelEnable) != 0
        && copy_len > kTriggerPowerOffset
    ) {
        state_data[kValidFlag1Offset] |= kFlag1MotorPowerLevelEnable;
        state_data[kTriggerPowerOffset] = update[kTriggerPowerOffset];
        cached_trigger_power = update[kTriggerPowerOffset];
        cached_trigger_power_valid = true;
    }

    copy_payload_range_if_allowed(
        update,
        copy_len,
        (update[kValidFlag1Offset] & kFlag1HapticLowPassFilterEnable) != 0,
        kHapticLowPassFilterOffset,
        1
    );
    copy_payload_range_if_allowed(
        update,
        copy_len,
        (update[kValidFlag2Offset] & 0x02) != 0,
        kLightFadeAnimationOffset,
        1
    );
    copy_payload_range_if_allowed(
        update,
        copy_len,
        (update[kValidFlag2Offset] & 0x01) != 0,
        kLedBrightnessOffset,
        1
    );
    copy_payload_range_if_allowed(
        update,
        copy_len,
        (update[kValidFlag1Offset] & kFlag1PlayerIndicatorControlEnable) != 0,
        kPlayerLedsOffset,
        1
    );
    copy_payload_range_if_allowed(
        update,
        copy_len,
        (update[kValidFlag1Offset] & kFlag1LightbarControlEnable) != 0,
        kLightbarRedOffset,
        3
    );

    cache_player_leds_from_payload(state_data, sizeof(state_data));
    clear_mic_control(state_data);
    clamp_speaker_volume();
    apply_current_player_led_policy(state_data);
}

void controller_output_state_set_adaptive_trigger(
    uint8_t const *right_trigger,
    bool right_valid,
    uint8_t const *left_trigger,
    bool left_valid,
    uint8_t motor_power,
    bool motor_power_valid
) {
    if (right_valid && right_trigger != nullptr) {
        std::memcpy(cached_right_trigger, right_trigger, sizeof(cached_right_trigger));
        cached_right_trigger_valid = true;
        state_data[kValidFlag0Offset] |= kFlag0RightTriggerEffect;
        std::memcpy(state_data + kTriggerEffectRightOffset, right_trigger, kTriggerEffectSize);
    }
    if (left_valid && left_trigger != nullptr) {
        std::memcpy(cached_left_trigger, left_trigger, sizeof(cached_left_trigger));
        cached_left_trigger_valid = true;
        state_data[kValidFlag0Offset] |= kFlag0LeftTriggerEffect;
        std::memcpy(state_data + kTriggerEffectLeftOffset, left_trigger, kTriggerEffectSize);
    }
    if (motor_power_valid) {
        cached_trigger_power = motor_power;
        cached_trigger_power_valid = true;
        state_data[kValidFlag1Offset] |= kFlag1MotorPowerLevelEnable;
        state_data[kTriggerPowerOffset] = motor_power;
    }
}

void controller_output_state_set_lightbar(uint8_t red, uint8_t green, uint8_t blue, uint8_t brightness_percent) {
    const uint8_t brightness = std::min<uint8_t>(brightness_percent, 100);
    state_data[kValidFlag1Offset] = static_cast<uint8_t>(
        (
            state_data[kValidFlag1Offset]
            & static_cast<uint8_t>(~kFlag1ReleaseLeds)
        )
        | kFlag1LightbarControlEnable
    );
    apply_current_player_led_policy(state_data);
    state_data[kValidFlag2Offset] = static_cast<uint8_t>(
        state_data[kValidFlag2Offset] & static_cast<uint8_t>(~kLightbarSetupControlMask)
    );
    state_data[kLedBrightnessOffset] = 0x01;
    state_data[kLightbarRedOffset] = scale_lightbar_channel(red, brightness);
    state_data[kLightbarGreenOffset] = scale_lightbar_channel(green, brightness);
    state_data[kLightbarBlueOffset] = scale_lightbar_channel(blue, brightness);
}

void controller_output_state_set_player_led_enabled(bool enabled) {
    player_led_enabled = enabled;
    apply_current_player_led_policy(state_data);
}

void controller_output_state_set_speaker_gain(uint8_t gain) {
    const uint8_t clamped = normalize_speaker_gain(gain);
    state_data[kValidFlag1Offset] |= kFlag1AudioControl2Enable;
    state_data[kAudioControl2Offset] = static_cast<uint8_t>(
        (state_data[kAudioControl2Offset] & 0xF8) | clamped
    );
}

uint8_t controller_output_state_speaker_gain() {
    return normalize_speaker_gain(static_cast<uint8_t>(state_data[kAudioControl2Offset] & 0x07));
}

bool controller_output_state_copy_player_led_report(uint8_t *destination, uint16_t len) {
    if (destination == nullptr || len <= kPlayerLedsOffset) {
        return false;
    }

    if (!player_led_enabled) {
        destination[kValidFlag1Offset] |= kFlag1PlayerIndicatorControlEnable;
        destination[kPlayerLedsOffset] = 0;
        return true;
    }

    if (!cached_player_leds_valid) {
        return false;
    }

    destination[kValidFlag1Offset] = static_cast<uint8_t>(
        (destination[kValidFlag1Offset] & static_cast<uint8_t>(~kFlag1ReleaseLeds))
        | kFlag1PlayerIndicatorControlEnable
    );
    destination[kPlayerLedsOffset] = cached_player_leds;
    return true;
}

void controller_output_state_copy_audio_snapshot(uint8_t *destination, bool headset_plugged) {
    if (destination == nullptr) {
        return;
    }

    std::memcpy(destination, state_data, sizeof(state_data));
    clear_mic_control(destination);
    apply_current_player_led_policy(destination);
    if (headset_plugged) {
        destination[kValidFlag0Offset] = static_cast<uint8_t>(
            (destination[kValidFlag0Offset] | kFlag0AudioControlEnable)
            & static_cast<uint8_t>(~kFlag0SpeakerVolumeEnable)
        );
        destination[kHeadphoneVolumeOffset] = kHeadphoneVolumeMax;
        destination[kSpeakerVolumeOffset] = 0x00;
        destination[kAudioControlOffset] = kAudioFlagsOutputPathHeadphones;
        return;
    }

    destination[kValidFlag0Offset] |= static_cast<uint8_t>(
        kFlag0AudioControlEnable | kFlag0SpeakerVolumeEnable
    );
    destination[kValidFlag1Offset] |= kFlag1AudioControl2Enable;
    destination[kHeadphoneVolumeOffset] = kHeadphoneVolumeMax;
    destination[kSpeakerVolumeOffset] = kSpeakerVolumeMax;
    destination[kAudioControlOffset] = kAudioFlagsOutputPathSpeaker;
    destination[kAudioControl2Offset] = static_cast<uint8_t>(
        (destination[kAudioControl2Offset] & 0xF8) | controller_output_state_speaker_gain()
    );
}
