#ifndef DS5_BRIDGE_CONTROLLER_OUTPUT_RUMBLE_STATE_H
#define DS5_BRIDGE_CONTROLLER_OUTPUT_RUMBLE_STATE_H

#include <cstdint>

struct ControllerOutputRumbleStateMachine {
    bool classic_rumble_active = false;
    uint8_t classic_rumble_right = 0;
    uint8_t classic_rumble_left = 0;
    uint8_t classic_rumble_flag0 = 0;
    uint8_t classic_rumble_flag2 = 0;
};

bool controller_output_rumble_payload_uses_classic_selector(uint8_t const *payload, uint16_t len);
bool controller_output_rumble_payload_requires_immediate_send(
    ControllerOutputRumbleStateMachine const &state,
    uint8_t const *payload,
    uint16_t len
);
bool controller_output_rumble_payload_is_redundant(
    ControllerOutputRumbleStateMachine const &state,
    uint8_t const *payload,
    uint16_t len
);
void controller_output_rumble_state_apply_payload(
    ControllerOutputRumbleStateMachine &state,
    uint8_t const *payload,
    uint16_t len
);

#endif // DS5_BRIDGE_CONTROLLER_OUTPUT_RUMBLE_STATE_H
