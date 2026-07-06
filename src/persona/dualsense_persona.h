#ifndef DS5_BRIDGE_DUALSENSE_PERSONA_H
#define DS5_BRIDGE_DUALSENSE_PERSONA_H

#include "persona/host_persona.h"

bool dualsense_persona_encode_input(
    BridgeControllerState const &state,
    HostPersonaInputReport &report
);

uint16_t dualsense_persona_get_feature_report(
    uint8_t report_id,
    uint8_t *buffer,
    uint16_t reqlen
);

bool dualsense_persona_has_synthetic_feature_report(uint8_t report_id);

void dualsense_persona_set_feature_report(
    uint8_t report_id,
    uint8_t const *buffer,
    uint16_t bufsize
);

#endif // DS5_BRIDGE_DUALSENSE_PERSONA_H
