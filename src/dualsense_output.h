#ifndef DS5_BRIDGE_DUALSENSE_OUTPUT_H
#define DS5_BRIDGE_DUALSENSE_OUTPUT_H

#include <cstdint>
#include <cstring>

namespace ds5::output {

constexpr uint8_t kBtOutputReportId = 0x31;
constexpr uint8_t kBtOutputReportSize = 78;
constexpr uint8_t kCommonPayloadSize = 47;
constexpr uint8_t kAudioStateSnapshotSize = 63;
constexpr uint8_t kBtOutputTag = 0x10;
constexpr uint8_t kUsbOutputReportId = 0x02;

constexpr uint8_t kFlag0CompatibleVibration = 0x01;
constexpr uint8_t kFlag0HapticsSelect = 0x02;
constexpr uint8_t kFlag0RightTriggerEffect = 0x04;
constexpr uint8_t kFlag0LeftTriggerEffect = 0x08;
constexpr uint8_t kFlag0SpeakerVolumeEnable = 0x20;
constexpr uint8_t kFlag0MicVolumeEnable = 0x40;
constexpr uint8_t kFlag0AudioControlEnable = 0x80;

constexpr uint8_t kFlag1MicMuteLedControlEnable = 0x01;
constexpr uint8_t kFlag1PowerSaveControlEnable = 0x02;
constexpr uint8_t kFlag1LightbarControlEnable = 0x04;
constexpr uint8_t kFlag1ReleaseLeds = 0x08;
constexpr uint8_t kFlag1PlayerIndicatorControlEnable = 0x10;
constexpr uint8_t kFlag1HapticLowPassFilterEnable = 0x20;
constexpr uint8_t kFlag1MotorPowerLevelEnable = 0x40;
constexpr uint8_t kFlag1AudioControl2Enable = 0x80;

constexpr uint8_t kFlag2LightbarSetupControlEnable = 0x02;
constexpr uint8_t kFlag2EnableImprovedRumbleEmulation = 0x04;
constexpr uint8_t kFlag2UseRumbleNotHaptics2 = 0x08;

constexpr uint8_t kAudioFlagsOutputPathHeadphones = 0x00;
constexpr uint8_t kAudioFlagsOutputPathSpeaker = 0x30;
constexpr uint8_t kAudioFlags2SpeakerPreampGain = 0x02;
constexpr uint8_t kPowerSaveControlMicMute = 0x10;

constexpr uint8_t kHeadphoneVolumeMax = 0x7f;
constexpr uint8_t kSpeakerVolumeMax = 0x64;
constexpr uint8_t kMicVolumeMax = 0x40;
constexpr uint8_t kLightbarSetupLightOut = 0x02;
constexpr uint8_t kPlayerLed1Instant = 0x24;

constexpr uint8_t kTriggerEffectSize = 11;
constexpr uint8_t kTriggerEffectRightOffset = 10;
constexpr uint8_t kTriggerEffectLeftOffset = 21;
constexpr uint8_t kTriggerEffectPowerOffset = 36;
constexpr uint8_t kTriggerEffectOff = 0x05;
constexpr uint8_t kTriggerEffectFeedback = 0x21;
constexpr uint8_t kTriggerEffectWeapon = 0x25;
constexpr uint8_t kTriggerEffectVibration = 0x26;
constexpr uint8_t kTriggerTargetBoth = 0;
constexpr uint8_t kTriggerTargetLeft = 1;
constexpr uint8_t kTriggerTargetRight = 2;

constexpr uint8_t kValidFlag0Offset = 0;
constexpr uint8_t kValidFlag1Offset = 1;
constexpr uint8_t kMotorRightOffset = 2;
constexpr uint8_t kMotorLeftOffset = 3;
constexpr uint8_t kHeadphoneVolumeOffset = 4;
constexpr uint8_t kSpeakerVolumeOffset = 5;
constexpr uint8_t kMicVolumeOffset = 6;
constexpr uint8_t kAudioControlOffset = 7;
constexpr uint8_t kMuteLedOffset = 8;
constexpr uint8_t kPowerSaveControlOffset = 9;
constexpr uint8_t kTriggerPowerOffset = 36;
constexpr uint8_t kAudioControl2Offset = 37;
constexpr uint8_t kValidFlag2Offset = 38;
constexpr uint8_t kHapticLowPassFilterOffset = 39;
constexpr uint8_t kLightFadeAnimationOffset = 41;
constexpr uint8_t kLedBrightnessOffset = 42;
constexpr uint8_t kPlayerLedsOffset = 43;
constexpr uint8_t kLightbarRedOffset = 44;
constexpr uint8_t kLightbarGreenOffset = 45;
constexpr uint8_t kLightbarBlueOffset = 46;

constexpr uint8_t kLightbarSetupControlMask = 0x03;
constexpr uint8_t kHostLedControlMask = 0x04 | 0x08 | 0x10;
constexpr uint8_t kHostLightbarSetupMask = 0x01 | 0x02;

inline bool payload_has_len(uint16_t len, uint8_t offset) {
    return len > offset;
}

inline bool bt_report_payload(uint8_t *report, uint16_t len, uint8_t *&payload, uint16_t &payload_len) {
    if (report == nullptr || len < 3) {
        payload = nullptr;
        payload_len = 0;
        return false;
    }
    payload = report + 3;
    payload_len = len - 3;
    return true;
}

inline bool bt_report_payload(uint8_t const *report, uint16_t len, uint8_t const *&payload, uint16_t &payload_len) {
    if (report == nullptr || len < 3) {
        payload = nullptr;
        payload_len = 0;
        return false;
    }
    payload = report + 3;
    payload_len = len - 3;
    return true;
}

inline void init_bt_output_report(uint8_t *report, uint8_t sequence_nibble) {
    if (report == nullptr) {
        return;
    }
    std::memset(report, 0, kBtOutputReportSize);
    report[0] = kBtOutputReportId;
    report[1] = static_cast<uint8_t>(sequence_nibble << 4);
    report[2] = kBtOutputTag;
}

inline uint8_t scaled_percent(uint8_t value, uint8_t percent) {
    return static_cast<uint8_t>((static_cast<uint16_t>(value) * percent + 50) / 100);
}

} // namespace ds5::output

#endif // DS5_BRIDGE_DUALSENSE_OUTPUT_H
