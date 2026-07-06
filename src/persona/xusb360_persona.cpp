#include "persona/xusb360_persona.h"

#include <cstring>

#include "controller_output_policy.h"
#include "dualsense_output.h"

namespace {

constexpr uint16_t kButtonDpadUp = 0x0001;
constexpr uint16_t kButtonDpadDown = 0x0002;
constexpr uint16_t kButtonDpadLeft = 0x0004;
constexpr uint16_t kButtonDpadRight = 0x0008;
constexpr uint16_t kButtonStart = 0x0010;
constexpr uint16_t kButtonBack = 0x0020;
constexpr uint16_t kButtonLeftStick = 0x0040;
constexpr uint16_t kButtonRightStick = 0x0080;
constexpr uint16_t kButtonLeftShoulder = 0x0100;
constexpr uint16_t kButtonRightShoulder = 0x0200;
constexpr uint16_t kButtonGuide = 0x0400;
constexpr uint16_t kButtonA = 0x1000;
constexpr uint16_t kButtonB = 0x2000;
constexpr uint16_t kButtonX = 0x4000;
constexpr uint16_t kButtonY = 0x8000;

void write_u16(uint8_t *data, uint16_t value) {
    data[0] = static_cast<uint8_t>(value & 0xff);
    data[1] = static_cast<uint8_t>((value >> 8) & 0xff);
}

void write_i16(uint8_t *data, int16_t value) {
    write_u16(data, static_cast<uint16_t>(value));
}

int16_t axis_u8_to_xusb(uint8_t value, bool invert) {
    int32_t scaled = static_cast<int32_t>(value) * 257 - 32768;
    if (invert) {
        scaled = -scaled;
    }
    if (scaled > 32767) {
        scaled = 32767;
    }
    if (scaled < -32768) {
        scaled = -32768;
    }
    return static_cast<int16_t>(scaled);
}

} // namespace

bool xusb360_persona_encode_input(
    BridgeControllerState const &state,
    HostPersonaInputReport &report
) {
    report.report_id = 0;
    report.len = kXusb360InputReportSize;
    std::memset(report.bytes, 0, sizeof(report.bytes));

    uint16_t buttons = 0;
    if (state.dpad_up) buttons |= kButtonDpadUp;
    if (state.dpad_down) buttons |= kButtonDpadDown;
    if (state.dpad_left) buttons |= kButtonDpadLeft;
    if (state.dpad_right) buttons |= kButtonDpadRight;
    if (state.options) buttons |= kButtonStart;
    if (state.create) buttons |= kButtonBack;
    if (state.l3) buttons |= kButtonLeftStick;
    if (state.r3) buttons |= kButtonRightStick;
    if (state.l1) buttons |= kButtonLeftShoulder;
    if (state.r1) buttons |= kButtonRightShoulder;
    if (state.home) buttons |= kButtonGuide;
    if (state.cross) buttons |= kButtonA;
    if (state.circle) buttons |= kButtonB;
    if (state.square) buttons |= kButtonX;
    if (state.triangle) buttons |= kButtonY;

    report.bytes[0] = 0x00;
    report.bytes[1] = kXusb360InputReportSize;
    write_u16(report.bytes + 2, buttons);
    report.bytes[4] = state.left_trigger;
    report.bytes[5] = state.right_trigger;
    write_i16(report.bytes + 6, axis_u8_to_xusb(state.left_stick_x, false));
    write_i16(report.bytes + 8, axis_u8_to_xusb(state.left_stick_y, true));
    write_i16(report.bytes + 10, axis_u8_to_xusb(state.right_stick_x, false));
    write_i16(report.bytes + 12, axis_u8_to_xusb(state.right_stick_y, true));
    return true;
}

bool xusb360_persona_decode_output_to_ds5_payload(
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
        || len < kXusb360RumbleOutputSize
    ) {
        return false;
    }

    const bool has_rumble_header = data[0] == 0x00 && data[1] == kXusb360RumbleOutputSize;
    if (!has_rumble_header) {
        return false;
    }

    const uint8_t strong_left_motor = data[3];
    const uint8_t weak_right_motor = data[4];
    std::memset(payload, 0, payload_capacity);
    controller_output_policy_render_classic_rumble_payload(
        payload,
        payload_capacity,
        weak_right_motor,
        strong_left_motor
    );
    payload_len = ds5::output::kCommonPayloadSize;
    return true;
}
