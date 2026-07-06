#ifndef DS5_BRIDGE_XUSB360_PERSONA_H
#define DS5_BRIDGE_XUSB360_PERSONA_H

#include <cstdint>

#include "persona/host_persona.h"

constexpr uint8_t kXusb360InputReportSize = 20;
constexpr uint8_t kXusb360RumbleOutputSize = 8;

bool xusb360_persona_encode_input(
    BridgeControllerState const &state,
    HostPersonaInputReport &report
);

bool xusb360_persona_decode_output_to_ds5_payload(
    uint8_t const *data,
    uint16_t len,
    uint8_t *payload,
    uint16_t payload_capacity,
    uint16_t &payload_len
);

#endif // DS5_BRIDGE_XUSB360_PERSONA_H
