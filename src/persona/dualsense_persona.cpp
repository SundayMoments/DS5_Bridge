#include "persona/dualsense_persona.h"

#include <algorithm>
#include <cstring>

namespace {

constexpr uint8_t kDualSenseFeatureCapabilities = 0x03;
constexpr uint8_t kDualSenseFeatureCalibration = 0x05;
constexpr uint8_t kDualSenseFeaturePairingInfo = 0x09;
constexpr uint8_t kDualSenseFeatureFirmwareInfo = 0x20;
constexpr uint8_t kDualSenseSyntheticMac[6] = {0x00, 0xa5, 0x19, 0xf6, 0x0b, 0x02};

void write_u16(uint8_t *data, uint16_t value) {
    data[0] = static_cast<uint8_t>(value & 0xff);
    data[1] = static_cast<uint8_t>((value >> 8) & 0xff);
}

void write_u32(uint8_t *data, uint32_t value) {
    data[0] = static_cast<uint8_t>(value & 0xff);
    data[1] = static_cast<uint8_t>((value >> 8) & 0xff);
    data[2] = static_cast<uint8_t>((value >> 16) & 0xff);
    data[3] = static_cast<uint8_t>((value >> 24) & 0xff);
}

void write_i16(uint8_t *data, int16_t value) {
    write_u16(data, static_cast<uint16_t>(value));
}

uint16_t copy_feature_payload(
    uint8_t const *report,
    uint16_t report_len,
    uint8_t *buffer,
    uint16_t reqlen
) {
    if (report == nullptr || report_len == 0 || buffer == nullptr) {
        return 0;
    }
    const uint16_t payload_len = static_cast<uint16_t>(report_len - 1);
    const uint16_t copy_len = std::min(payload_len, reqlen);
    if (copy_len > 0) {
        std::memcpy(buffer, report + 1, copy_len);
    }
    return copy_len;
}

uint16_t zero_feature_payload(uint8_t *buffer, uint16_t reqlen) {
    if (buffer == nullptr) {
        return 0;
    }
    std::memset(buffer, 0, reqlen);
    return reqlen;
}

void copy_ascii_field(uint8_t *dest, uint16_t field_len, char const *value) {
    const uint16_t value_len = static_cast<uint16_t>(std::strlen(value));
    std::memcpy(dest, value, std::min(field_len, value_len));
}

void write_calibration_feature_report(uint8_t *report) {
    constexpr int16_t fields[17] = {
        0, 0, 0,
        1024, -1024, 1024, -1024, 1024, -1024,
        64, 64,
        8192, -8192, 8192, -8192, 8192, -8192,
    };
    for (uint8_t index = 0; index < 17; index++) {
        write_i16(report + 1 + index * 2, fields[index]);
    }
}

void write_capabilities_feature_report(uint8_t *report) {
    report[2] = 0x28;
    report[4] = 0x02 | 0x04 | 0x08 | 0x40;
    report[5] = 0x00;
    report[20] = 0x01 | 0x80;
}

void write_pairing_feature_report(uint8_t *report) {
    std::memcpy(report + 1, kDualSenseSyntheticMac, sizeof(kDualSenseSyntheticMac));
}

void write_firmware_feature_report(uint8_t *report) {
    // Stock DualSense identity, not DualSense Edge. This is used when an Edge is
    // the upstream controller but USB is enumerating as a standard DualSense.
    constexpr uint16_t kFirmwareType = 0x0002;
    constexpr uint16_t kSoftwareSeries = 0x0004;
    constexpr uint32_t kHardwareInfo = 0x00000617;
    constexpr uint32_t kFirmwareVersion = 0x0110002a;
    constexpr uint16_t kUpdateVersion = 0x0630;
    constexpr uint32_t kSblFirmwareVersion = 0x0001003c;
    constexpr uint32_t kVenomFirmwareVersion = 0x0002000a;
    constexpr uint32_t kSpiderFirmwareVersion = 0x00000006;
    copy_ascii_field(report + 1, 11, "Jul  4 2025");
    copy_ascii_field(report + 12, 8, "10:10:32");
    write_u16(report + 20, kFirmwareType);
    write_u16(report + 22, kSoftwareSeries);
    write_u32(report + 24, kHardwareInfo);
    write_u32(report + 28, kFirmwareVersion);
    write_u16(report + 44, kUpdateVersion);
    write_u32(report + 48, kSblFirmwareVersion);
    write_u32(report + 52, kVenomFirmwareVersion);
    write_u32(report + 56, kSpiderFirmwareVersion);
}

} // namespace

bool dualsense_persona_encode_input(
    BridgeControllerState const &state,
    HostPersonaInputReport &report
) {
    if (state.dualsense_report_len != kDualSenseUsbInputReportSize) {
        return false;
    }

    report.report_id = 0x01;
    report.len = kDualSenseUsbInputReportSize;
    std::memcpy(report.bytes, state.dualsense_report, kDualSenseUsbInputReportSize);
    return true;
}

uint16_t dualsense_persona_get_feature_report(
    uint8_t report_id,
    uint8_t *buffer,
    uint16_t reqlen
) {
    uint8_t report[64]{};
    report[0] = report_id;

    switch (report_id) {
        case kDualSenseFeatureCapabilities:
            write_capabilities_feature_report(report);
            return copy_feature_payload(report, 48, buffer, reqlen);

        case kDualSenseFeatureCalibration:
            write_calibration_feature_report(report);
            return copy_feature_payload(report, 41, buffer, reqlen);

        case kDualSenseFeaturePairingInfo:
            write_pairing_feature_report(report);
            return copy_feature_payload(report, 20, buffer, reqlen);

        case kDualSenseFeatureFirmwareInfo:
            write_firmware_feature_report(report);
            return copy_feature_payload(report, 64, buffer, reqlen);

        default:
            return zero_feature_payload(buffer, reqlen);
    }
}

bool dualsense_persona_has_synthetic_feature_report(uint8_t report_id) {
    switch (report_id) {
        case kDualSenseFeatureCapabilities:
        case kDualSenseFeatureCalibration:
        case kDualSenseFeaturePairingInfo:
        case kDualSenseFeatureFirmwareInfo:
            return true;
        default:
            return false;
    }
}

void dualsense_persona_set_feature_report(
    uint8_t report_id,
    uint8_t const *buffer,
    uint16_t bufsize
) {
    (void)report_id;
    (void)buffer;
    (void)bufsize;
}
