#ifndef DS5_BRIDGE_HOST_PERSONA_H
#define DS5_BRIDGE_HOST_PERSONA_H

#ifdef __cplusplus
#include <cstdint>
#include "controller_state.h"
extern "C" {
#else
#include <stdbool.h>
#include <stdint.h>
#endif

typedef enum HostPersonaMode {
    HostPersonaModeDualSense = 0,
    HostPersonaModeXusb360 = 1,
    HostPersonaModeDs4 = 2,
} HostPersonaMode;

HostPersonaMode host_persona_active(void);
bool host_persona_set_active(HostPersonaMode mode);
bool host_persona_is_supported(HostPersonaMode mode);
bool host_persona_descriptors_verified(HostPersonaMode mode);
bool host_persona_is_native_hid(void);
uint8_t host_persona_keyboard_hid_instance(void);

#ifdef __cplusplus
}

struct HostPersonaInputReport {
    uint8_t report_id = 0;
    uint8_t bytes[64]{};
    uint8_t len = 0;
};

bool host_persona_encode_input(
    HostPersonaMode mode,
    BridgeControllerState const &state,
    HostPersonaInputReport &report
);

bool host_persona_decode_output_to_ds5_payload(
    HostPersonaMode mode,
    uint8_t const *data,
    uint16_t len,
    uint8_t *payload,
    uint16_t payload_capacity,
    uint16_t &payload_len
);

#endif // __cplusplus

#endif // DS5_BRIDGE_HOST_PERSONA_H
