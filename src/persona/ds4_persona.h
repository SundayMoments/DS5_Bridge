#ifndef DS5_BRIDGE_DS4_PERSONA_H
#define DS5_BRIDGE_DS4_PERSONA_H

#include <cstdint>

#include "persona/host_persona.h"

constexpr uint8_t kDs4InputReportId = 0x01;
constexpr uint8_t kDs4InputReportSize = 64;
constexpr uint8_t kDs4OutputReportId = 0x05;

bool ds4_persona_encode_input(
    BridgeControllerState const &state,
    HostPersonaInputReport &report
);

bool ds4_persona_decode_output_to_ds5_payload(
    uint8_t const *data,
    uint16_t len,
    uint8_t *payload,
    uint16_t payload_capacity,
    uint16_t &payload_len
);

uint16_t ds4_persona_get_feature_report(
    uint8_t report_id,
    uint8_t *buffer,
    uint16_t reqlen
);

void ds4_persona_set_feature_report(
    uint8_t report_id,
    uint8_t const *buffer,
    uint16_t bufsize
);

#endif // DS5_BRIDGE_DS4_PERSONA_H
