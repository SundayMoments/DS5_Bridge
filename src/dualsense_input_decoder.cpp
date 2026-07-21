#include "dualsense_input_decoder.h"

#include <cstring>

namespace {

constexpr uint8_t kDpadMask = 0x0f;
constexpr uint8_t kDpadUp = 0;
constexpr uint8_t kDpadUpRight = 1;
constexpr uint8_t kDpadRight = 2;
constexpr uint8_t kDpadDownRight = 3;
constexpr uint8_t kDpadDown = 4;
constexpr uint8_t kDpadDownLeft = 5;
constexpr uint8_t kDpadLeft = 6;
constexpr uint8_t kDpadUpLeft = 7;

bool dpad_has_up(uint8_t direction) {
    return direction == kDpadUp || direction == kDpadUpRight || direction == kDpadUpLeft;
}

bool dpad_has_right(uint8_t direction) {
    return direction == kDpadRight || direction == kDpadUpRight || direction == kDpadDownRight;
}

bool dpad_has_down(uint8_t direction) {
    return direction == kDpadDown || direction == kDpadDownRight || direction == kDpadDownLeft;
}

bool dpad_has_left(uint8_t direction) {
    return direction == kDpadLeft || direction == kDpadUpLeft || direction == kDpadDownLeft;
}

int16_t read_i16_le(uint8_t const *data) {
    return static_cast<int16_t>(
        static_cast<uint16_t>(data[0])
        | (static_cast<uint16_t>(data[1]) << 8)
    );
}

uint32_t read_u32_le(uint8_t const *data) {
    return static_cast<uint32_t>(data[0])
        | (static_cast<uint32_t>(data[1]) << 8)
        | (static_cast<uint32_t>(data[2]) << 16)
        | (static_cast<uint32_t>(data[3]) << 24);
}

BridgeTouchPoint read_touch_point(uint8_t const *data) {
    BridgeTouchPoint point{};
    point.active = (data[0] & 0x80) == 0;
    point.contact_id = static_cast<uint8_t>(data[0] & 0x7f);
    point.x = static_cast<uint16_t>(
        static_cast<uint16_t>(data[1])
        | (static_cast<uint16_t>(data[2] & 0x0f) << 8)
    );
    point.y = static_cast<uint16_t>(
        static_cast<uint16_t>((data[2] >> 4) & 0x0f)
        | (static_cast<uint16_t>(data[3]) << 4)
    );
    return point;
}

} // namespace

bool dualsense_decode_usb_input_report(
    uint8_t const *report,
    uint16_t len,
    BridgeControllerState &state
) {
    if (report == nullptr || len < kDualSenseUsbInputReportSize) {
        return false;
    }

    BridgeControllerState next{};
    next.left_stick_x = report[0];
    next.left_stick_y = report[1];
    next.right_stick_x = report[2];
    next.right_stick_y = report[3];
    next.left_trigger = report[4];
    next.right_trigger = report[5];

    const uint8_t dpad = report[7] & kDpadMask;
    next.dpad_up = dpad_has_up(dpad);
    next.dpad_right = dpad_has_right(dpad);
    next.dpad_down = dpad_has_down(dpad);
    next.dpad_left = dpad_has_left(dpad);

    next.square = (report[7] & 0x10) != 0;
    next.cross = (report[7] & 0x20) != 0;
    next.circle = (report[7] & 0x40) != 0;
    next.triangle = (report[7] & 0x80) != 0;

    next.l1 = (report[8] & 0x01) != 0;
    next.r1 = (report[8] & 0x02) != 0;
    next.l2_pressed = (report[8] & 0x04) != 0;
    next.r2_pressed = (report[8] & 0x08) != 0;
    next.create = (report[8] & 0x10) != 0;
    next.options = (report[8] & 0x20) != 0;
    next.l3 = (report[8] & 0x40) != 0;
    next.r3 = (report[8] & 0x80) != 0;

    next.home = (report[9] & 0x01) != 0;
    next.touchpad = (report[9] & 0x02) != 0;
    next.mute = (report[9] & 0x04) != 0;
    next.edge_left_function = (report[9] & 0x10) != 0;
    next.edge_right_function = (report[9] & 0x20) != 0;
    next.edge_left_paddle = (report[9] & 0x40) != 0;
    next.edge_right_paddle = (report[9] & 0x80) != 0;

    const uint8_t battery = report[52] & 0x0f;
    next.raw_power_state = static_cast<uint8_t>((report[52] >> 4) & 0x0f);
    if (battery <= 10) {
        next.battery_percent = static_cast<uint8_t>(battery == 10 ? 100 : battery * 10 + 5);
    }

    next.headset_plugged = (report[53] & 0x01) != 0;
    next.microphone_plugged = (report[53] & 0x02) != 0;
    next.microphone_muted = (report[53] & 0x04) != 0;

    next.motion_valid = true;
    next.gyro_x = read_i16_le(report + 15);
    next.gyro_y = read_i16_le(report + 17);
    next.gyro_z = read_i16_le(report + 19);
    next.accel_x = read_i16_le(report + 21);
    next.accel_y = read_i16_le(report + 23);
    next.accel_z = read_i16_le(report + 25);
    next.sensor_timestamp = read_u32_le(report + 27);
    for (uint8_t index = 0; index < kBridgeTouchPointCount; index++) {
        next.touch_points[index] = read_touch_point(report + 32 + index * 4);
    }

    std::memcpy(next.dualsense_report, report, kDualSenseUsbInputReportSize);
    next.dualsense_report_len = kDualSenseUsbInputReportSize;

    state = next;
    return true;
}
