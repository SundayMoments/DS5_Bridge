#include "persona/ds4_persona.h"

#include <algorithm>
#include <cstring>

#include "controller_output_policy.h"
#include "dualsense_output.h"

namespace {

constexpr uint8_t kDs4DpadNeutral = 0x08;

constexpr uint8_t kDs4ButtonSquare = 0x10;
constexpr uint8_t kDs4ButtonCross = 0x20;
constexpr uint8_t kDs4ButtonCircle = 0x40;
constexpr uint8_t kDs4ButtonTriangle = 0x80;

constexpr uint8_t kDs4ButtonL1 = 0x01;
constexpr uint8_t kDs4ButtonR1 = 0x02;
constexpr uint8_t kDs4ButtonL2 = 0x04;
constexpr uint8_t kDs4ButtonR2 = 0x08;
constexpr uint8_t kDs4ButtonShare = 0x10;
constexpr uint8_t kDs4ButtonOptions = 0x20;
constexpr uint8_t kDs4ButtonL3 = 0x40;
constexpr uint8_t kDs4ButtonR3 = 0x80;

constexpr uint8_t kDs4ButtonPs = 0x01;
constexpr uint8_t kDs4ButtonTouchpad = 0x02;

constexpr uint8_t kDs4BatteryFullyChargedUsb = 0x1a;
constexpr int16_t kDs4DefaultAccelZ = -5023;
constexpr uint16_t kDualSenseTouchpadHeight = 1080;
constexpr uint16_t kDs4TouchpadWidth = 1920;
constexpr uint16_t kDs4TouchpadHeight = 942;

constexpr uint8_t kDs4FeatureCapabilities = 0x03;
constexpr uint8_t kDs4FeatureCalibrationBt = 0x05;
constexpr uint8_t kDs4FeatureIdentity = 0x81;
constexpr uint8_t kDs4FeatureBoardInfo = 0xa3;
constexpr uint8_t kDs4FeatureTelemetry = 0xa4;

constexpr uint8_t kDs4SerialBytes[8] = {0x11, 0x11, 0x02, 0x0b, 0xf6, 0x19, 0xa5, 0x00};
constexpr char kDs4SerialString[] = "1111020BF619A500";
constexpr char kDs4BoardString[] = "JDM-055";
constexpr char kDs4BuildDate[] = "Sep 17 2021";
constexpr char kDs4BuildTime[] = "11:34:00";
constexpr char kDs4FirmwareVersion[] = "0001.A00B";

uint8_t ds4_report_counter = 0;
uint16_t ds4_timestamp = 188;
uint8_t ds4_probe_selector[3]{};
uint8_t ds4_telemetry_subcommand = 0;

void write_u16(uint8_t *data, uint16_t value) {
    data[0] = static_cast<uint8_t>(value & 0xff);
    data[1] = static_cast<uint8_t>((value >> 8) & 0xff);
}

void write_i16(uint8_t *data, int16_t value) {
    write_u16(data, static_cast<uint16_t>(value));
}

uint16_t clamp_u16(uint16_t value, uint16_t max_value) {
    return value > max_value ? max_value : value;
}

uint16_t scale_touch_y_to_ds4(uint16_t y) {
    const uint32_t clamped = clamp_u16(y, static_cast<uint16_t>(kDualSenseTouchpadHeight - 1));
    return static_cast<uint16_t>(
        std::min<uint32_t>(
            kDs4TouchpadHeight - 1,
            (clamped * static_cast<uint32_t>(kDs4TouchpadHeight) + kDualSenseTouchpadHeight / 2)
                / kDualSenseTouchpadHeight
        )
    );
}

void write_ds4_touch_point(uint8_t *data, BridgeTouchPoint const &point) {
    uint16_t x = 0;
    uint16_t y = 0;
    data[0] = static_cast<uint8_t>(point.contact_id & 0x7f);
    if (point.active) {
        x = clamp_u16(point.x, static_cast<uint16_t>(kDs4TouchpadWidth - 1));
        y = scale_touch_y_to_ds4(point.y);
    } else {
        data[0] |= 0x80;
    }
    data[1] = static_cast<uint8_t>(x & 0xff);
    data[2] = static_cast<uint8_t>(((x >> 8) & 0x0f) | ((y & 0x0f) << 4));
    data[3] = static_cast<uint8_t>((y >> 4) & 0xff);
}

uint8_t dpad_hat(BridgeControllerState const &state) {
    if (state.dpad_up && state.dpad_right) return 0x01;
    if (state.dpad_down && state.dpad_right) return 0x03;
    if (state.dpad_down && state.dpad_left) return 0x05;
    if (state.dpad_up && state.dpad_left) return 0x07;
    if (state.dpad_up) return 0x00;
    if (state.dpad_right) return 0x02;
    if (state.dpad_down) return 0x04;
    if (state.dpad_left) return 0x06;
    return kDs4DpadNeutral;
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

void copy_ascii(uint8_t *dest, uint16_t capacity, char const *text) {
    if (dest == nullptr || text == nullptr || capacity == 0) {
        return;
    }
    const uint16_t len = static_cast<uint16_t>(std::min<uint16_t>(
        static_cast<uint16_t>(std::strlen(text)),
        capacity
    ));
    if (len > 0) {
        std::memcpy(dest, text, len);
    }
}

void write_ds4_calibration_report(uint8_t report_id, uint8_t *report) {
    constexpr int16_t fields[17] = {
        0, 0, 0,
        1024, -1024, 1024, -1024, 1024, -1024,
        64, 64,
        8192, -8192, 8192, -8192, 8192, -8192,
    };
    report[0] = report_id;
    for (uint8_t index = 0; index < 17; index++) {
        write_i16(report + 1 + index * 2, fields[index]);
    }
}

} // namespace

bool ds4_persona_encode_input(
    BridgeControllerState const &state,
    HostPersonaInputReport &report
) {
    report.report_id = kDs4InputReportId;
    report.len = kDs4InputReportSize - 1;
    std::memset(report.bytes, 0, sizeof(report.bytes));

    report.bytes[0] = state.left_stick_x;
    report.bytes[1] = state.left_stick_y;
    report.bytes[2] = state.right_stick_x;
    report.bytes[3] = state.right_stick_y;

    uint8_t face = 0;
    if (state.square) face |= kDs4ButtonSquare;
    if (state.cross) face |= kDs4ButtonCross;
    if (state.circle) face |= kDs4ButtonCircle;
    if (state.triangle) face |= kDs4ButtonTriangle;
    report.bytes[4] = static_cast<uint8_t>(dpad_hat(state) | face);

    uint8_t buttons = 0;
    if (state.l1) buttons |= kDs4ButtonL1;
    if (state.r1) buttons |= kDs4ButtonR1;
    if (state.l2_pressed || state.left_trigger != 0) buttons |= kDs4ButtonL2;
    if (state.r2_pressed || state.right_trigger != 0) buttons |= kDs4ButtonR2;
    if (state.create) buttons |= kDs4ButtonShare;
    if (state.options) buttons |= kDs4ButtonOptions;
    if (state.l3) buttons |= kDs4ButtonL3;
    if (state.r3) buttons |= kDs4ButtonR3;
    report.bytes[5] = buttons;

    uint8_t ps_touch_counter = static_cast<uint8_t>((ds4_report_counter++ & 0x3f) << 2);
    if (state.home) ps_touch_counter |= kDs4ButtonPs;
    if (state.touchpad) ps_touch_counter |= kDs4ButtonTouchpad;
    report.bytes[6] = ps_touch_counter;

    report.bytes[7] = state.left_trigger;
    report.bytes[8] = state.right_trigger;
    write_u16(
        report.bytes + 9,
        state.motion_valid
            ? static_cast<uint16_t>(state.sensor_timestamp & 0xffff)
            : ds4_timestamp++
    );
    report.bytes[11] = 0x09;

    if (state.motion_valid) {
        write_i16(report.bytes + 12, state.gyro_x);
        write_i16(report.bytes + 14, state.gyro_y);
        write_i16(report.bytes + 16, state.gyro_z);
        write_i16(report.bytes + 18, state.accel_x);
        write_i16(report.bytes + 20, state.accel_y);
        write_i16(report.bytes + 22, state.accel_z);
    } else {
        write_i16(report.bytes + 22, kDs4DefaultAccelZ);
    }

    report.bytes[29] = kDs4BatteryFullyChargedUsb;
    report.bytes[32] = 0x01;
    report.bytes[33] = state.motion_valid
        ? static_cast<uint8_t>(state.sensor_timestamp & 0xff)
        : static_cast<uint8_t>(ds4_report_counter & 0xff);
    write_ds4_touch_point(report.bytes + 34, state.touch_points[0]);
    write_ds4_touch_point(report.bytes + 38, state.touch_points[1]);
    return true;
}

bool ds4_persona_decode_output_to_ds5_payload(
    uint8_t const *data,
    uint16_t len,
    uint8_t *payload,
    uint16_t payload_capacity,
    uint16_t &payload_len
) {
    payload_len = 0;
    if (
        data == nullptr
        || payload == nullptr
        || payload_capacity < ds5::output::kCommonPayloadSize
        || len < 11
        || data[0] != kDs4OutputReportId
    ) {
        return false;
    }

    std::memset(payload, 0, payload_capacity);
    controller_output_policy_render_classic_rumble_payload(payload, payload_capacity, data[4], data[5]);

    const bool led_requested = (data[1] & 0x02) != 0 || data[6] != 0 || data[7] != 0 || data[8] != 0;
    if (led_requested) {
        payload[ds5::output::kValidFlag1Offset] = ds5::output::kFlag1LightbarControlEnable;
        payload[ds5::output::kLedBrightnessOffset] = 0x01;
        payload[ds5::output::kLightbarRedOffset] = data[6];
        payload[ds5::output::kLightbarGreenOffset] = data[7];
        payload[ds5::output::kLightbarBlueOffset] = data[8];
    }

    payload_len = ds5::output::kCommonPayloadSize;
    return true;
}

uint16_t ds4_persona_get_feature_report(
    uint8_t report_id,
    uint8_t *buffer,
    uint16_t reqlen
) {
    uint8_t report[64]{};
    report[0] = report_id;

    switch (report_id) {
        case 0x02:
        case kDs4FeatureCalibrationBt:
            write_ds4_calibration_report(report_id, report);
            return copy_feature_payload(report, 37, buffer, reqlen);

        case kDs4FeatureCapabilities:
            report[2] = 0x27;
            report[4] = 0x02 | 0x04 | 0x08 | 0x40;
            report[5] = 0x00;
            write_u16(report + 10, 1);
            write_u16(report + 12, 16);
            write_u16(report + 14, 1);
            write_u16(report + 16, 8192);
            return copy_feature_payload(report, 48, buffer, reqlen);

        case 0x10:
            report[1] = kDs4BatteryFullyChargedUsb & 0x0f;
            report[2] = 12;
            write_u16(report + 3, 664);
            return copy_feature_payload(report, 5, buffer, reqlen);

        case 0x11:
            report[1] = ds4_probe_selector[0];
            report[2] = ds4_probe_selector[1];
            report[3] = ds4_probe_selector[2];
            if (ds4_probe_selector[0] == 0xff && ds4_probe_selector[1] == 0x00 && ds4_probe_selector[2] == 0x0c) {
                report[1] = 0x01;
            }
            return copy_feature_payload(report, 4, buffer, reqlen);

        case 0x12: {
            report[1] = kDs4SerialBytes[7];
            report[2] = kDs4SerialBytes[6];
            report[3] = kDs4SerialBytes[5];
            report[4] = kDs4SerialBytes[4];
            report[5] = kDs4SerialBytes[3];
            report[6] = kDs4SerialBytes[2];
            report[7] = kDs4SerialBytes[1];
            std::memcpy(report + 8, kDs4SerialBytes, sizeof(kDs4SerialBytes));
            return copy_feature_payload(report, 16, buffer, reqlen);
        }

        case kDs4FeatureIdentity:
            std::memcpy(report + 1, kDs4SerialBytes, sizeof(kDs4SerialBytes));
            std::memcpy(report + 10, kDs4SerialBytes, sizeof(kDs4SerialBytes));
            copy_ascii(report + 18, 16, kDs4SerialString);
            copy_ascii(report + 34, 12, kDs4BoardString);
            copy_ascii(report + 46, 11, kDs4BuildDate);
            copy_ascii(report + 57, 7, kDs4FirmwareVersion);
            return copy_feature_payload(report, 64, buffer, reqlen);

        case kDs4FeatureBoardInfo:
            copy_ascii(report + 1, 15, kDs4BuildDate);
            copy_ascii(report + 16, 16, kDs4BuildTime);
            write_u16(report + 33, 0x0001);
            write_u16(report + 35, 0xb400);
            write_u16(report + 37, 0x0001);
            write_u16(report + 39, 0x0000);
            write_u16(report + 41, 0xa00b);
            report[47] = 0x01;
            return copy_feature_payload(report, 49, buffer, reqlen);

        case kDs4FeatureTelemetry:
            if (ds4_telemetry_subcommand == 0x02) {
                report[1] = kDs4SerialBytes[3];
                report[2] = kDs4SerialBytes[2];
                report[3] = kDs4SerialBytes[1];
                report[4] = kDs4SerialBytes[0];
                report[5] = kDs4SerialBytes[7];
                report[6] = kDs4SerialBytes[6];
                report[7] = kDs4SerialBytes[5];
                report[8] = kDs4SerialBytes[4];
                return copy_feature_payload(report, 14, buffer, reqlen);
            }
            if (ds4_telemetry_subcommand == 0x0b) {
                report[1] = kDs4SerialBytes[3];
                report[2] = kDs4SerialBytes[2];
                report[3] = kDs4SerialBytes[1];
                report[4] = kDs4SerialBytes[0];
                report[5] = kDs4SerialBytes[7];
                report[6] = kDs4SerialBytes[6];
                report[7] = kDs4SerialBytes[5];
                report[8] = kDs4SerialBytes[4];
                report[9] = 0xac;
                report[10] = 0xa8;
                report[11] = 0x1b;
                return copy_feature_payload(report, 14, buffer, reqlen);
            }
            report[1] = ds4_telemetry_subcommand;
            report[2] = 0x03;
            report[3] = 0x01;
            report[5] = 0x04;
            write_u16(report + 6, 0x0a80);
            write_u16(report + 8, 0x08b6);
            return copy_feature_payload(report, 14, buffer, reqlen);

        case 0xf2:
            if (buffer != nullptr && reqlen > 0) {
                std::memset(buffer, 0, reqlen);
                if (reqlen > 1) {
                    buffer[1] = 0x10;
                }
            }
            return reqlen;

        default:
            return zero_feature_payload(buffer, reqlen);
    }
}

void ds4_persona_set_feature_report(
    uint8_t report_id,
    uint8_t const *buffer,
    uint16_t bufsize
) {
    if (buffer == nullptr) {
        return;
    }
    if (report_id == 0x08 && bufsize >= 3) {
        ds4_probe_selector[0] = buffer[0];
        ds4_probe_selector[1] = buffer[1];
        ds4_probe_selector[2] = buffer[2];
        return;
    }
    if (report_id == 0xa0 && bufsize >= 1) {
        ds4_telemetry_subcommand = buffer[0];
    }
}
