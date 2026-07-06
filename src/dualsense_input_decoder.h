#ifndef DS5_BRIDGE_DUALSENSE_INPUT_DECODER_H
#define DS5_BRIDGE_DUALSENSE_INPUT_DECODER_H

#include <cstdint>

#include "controller_state.h"

bool dualsense_decode_usb_input_report(
    uint8_t const *report,
    uint16_t len,
    BridgeControllerState &state
);

#endif // DS5_BRIDGE_DUALSENSE_INPUT_DECODER_H
