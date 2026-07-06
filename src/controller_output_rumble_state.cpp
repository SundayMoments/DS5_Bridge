#include "controller_output_rumble_state.h"

#include "dualsense_output.h"

using namespace ds5::output;

namespace {

bool payload_has_common_motor_bytes(uint8_t const *payload, uint16_t len) {
    return payload != nullptr && len > kMotorLeftOffset;
}

bool payload_motors_active(uint8_t const *payload, uint16_t len) {
    return payload_has_common_motor_bytes(payload, len)
        && (payload[kMotorRightOffset] | payload[kMotorLeftOffset]) != 0;
}

uint8_t classic_rumble_flag0(uint8_t const *payload) {
    return static_cast<uint8_t>(
        payload[kValidFlag0Offset] & static_cast<uint8_t>(kFlag0CompatibleVibration | kFlag0HapticsSelect)
    );
}

uint8_t classic_rumble_flag2(uint8_t const *payload, uint16_t len) {
    if (len <= kValidFlag2Offset) {
        return 0;
    }
    return static_cast<uint8_t>(
        payload[kValidFlag2Offset]
        & static_cast<uint8_t>(kFlag2EnableImprovedRumbleEmulation | kFlag2UseRumbleNotHaptics2)
    );
}

} // namespace

bool controller_output_rumble_payload_uses_classic_selector(uint8_t const *payload, uint16_t len) {
    if (payload == nullptr || len <= kValidFlag1Offset) {
        return false;
    }

    const uint8_t flag0 = payload[kValidFlag0Offset];
    const uint8_t flag2 = len > kValidFlag2Offset ? payload[kValidFlag2Offset] : 0;
    return (flag0 & kFlag0HapticsSelect) != 0
        || (flag2 & kFlag2UseRumbleNotHaptics2) != 0;
}

bool controller_output_rumble_payload_requires_immediate_send(
    ControllerOutputRumbleStateMachine const &state,
    uint8_t const *payload,
    uint16_t len
) {
    if (!payload_has_common_motor_bytes(payload, len)) {
        return false;
    }

    if (!controller_output_rumble_payload_uses_classic_selector(payload, len)) {
        return state.classic_rumble_active;
    }

    const uint8_t right = payload[kMotorRightOffset];
    const uint8_t left = payload[kMotorLeftOffset];
    const bool motors_active = (right | left) != 0;
    if (!state.classic_rumble_active) {
        return motors_active;
    }

    return right != state.classic_rumble_right
        || left != state.classic_rumble_left
        || classic_rumble_flag0(payload) != state.classic_rumble_flag0
        || classic_rumble_flag2(payload, len) != state.classic_rumble_flag2;
}

bool controller_output_rumble_payload_is_redundant(
    ControllerOutputRumbleStateMachine const &state,
    uint8_t const *payload,
    uint16_t len
) {
    return payload_has_common_motor_bytes(payload, len)
        && controller_output_rumble_payload_uses_classic_selector(payload, len)
        && !controller_output_rumble_payload_requires_immediate_send(state, payload, len);
}

void controller_output_rumble_state_apply_payload(
    ControllerOutputRumbleStateMachine &state,
    uint8_t const *payload,
    uint16_t len
) {
    if (!payload_has_common_motor_bytes(payload, len)) {
        return;
    }

    if (!controller_output_rumble_payload_uses_classic_selector(payload, len)) {
        state.classic_rumble_active = false;
        state.classic_rumble_right = 0;
        state.classic_rumble_left = 0;
        state.classic_rumble_flag0 = 0;
        state.classic_rumble_flag2 = 0;
        return;
    }

    const bool motors_active = payload_motors_active(payload, len);
    state.classic_rumble_active = motors_active;
    state.classic_rumble_right = motors_active ? payload[kMotorRightOffset] : 0;
    state.classic_rumble_left = motors_active ? payload[kMotorLeftOffset] : 0;
    state.classic_rumble_flag0 = motors_active ? classic_rumble_flag0(payload) : 0;
    state.classic_rumble_flag2 = motors_active ? classic_rumble_flag2(payload, len) : 0;
}
