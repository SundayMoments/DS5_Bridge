#include "persona/host_persona.h"

#include "persona/ds4_persona.h"
#include "persona/dualsense_persona.h"
#include "persona/xusb360_persona.h"

namespace {

HostPersonaMode active_persona = HostPersonaModeDualSense;

} // namespace

extern "C" HostPersonaMode host_persona_active(void) {
    return active_persona;
}

extern "C" bool host_persona_set_active(HostPersonaMode mode) {
    if (!host_persona_is_supported(mode)) {
        return false;
    }
    active_persona = mode;
    return true;
}

extern "C" bool host_persona_is_supported(HostPersonaMode mode) {
    switch (mode) {
        case HostPersonaModeDualSense:
        case HostPersonaModeXusb360:
        case HostPersonaModeDs4:
            return host_persona_descriptors_verified(mode);
        default:
            return false;
    }
}

extern "C" bool host_persona_is_native_hid(void) {
    return active_persona != HostPersonaModeXusb360;
}

extern "C" uint8_t host_persona_keyboard_hid_instance(void) {
#ifdef ENABLE_COMPANION
    return host_persona_is_native_hid() ? 1 : 0;
#else
    return 0;
#endif
}

bool host_persona_encode_input(
    HostPersonaMode mode,
    BridgeControllerState const &state,
    HostPersonaInputReport &report
) {
    if (!host_persona_is_supported(mode)) {
        return false;
    }

    switch (mode) {
        case HostPersonaModeDualSense:
            return dualsense_persona_encode_input(state, report);
        case HostPersonaModeXusb360:
            return xusb360_persona_encode_input(state, report);
        case HostPersonaModeDs4:
            return ds4_persona_encode_input(state, report);
        default:
            return false;
    }
}

bool host_persona_decode_output_to_ds5_payload(
    HostPersonaMode mode,
    uint8_t const *data,
    uint16_t len,
    uint8_t *payload,
    uint16_t payload_capacity,
    uint16_t &payload_len
) {
    if (!host_persona_is_supported(mode)) {
        payload_len = 0;
        return false;
    }

    switch (mode) {
        case HostPersonaModeXusb360:
            return xusb360_persona_decode_output_to_ds5_payload(
                data,
                len,
                payload,
                payload_capacity,
                payload_len
            );
        case HostPersonaModeDs4:
            return ds4_persona_decode_output_to_ds5_payload(
                data,
                len,
                payload,
                payload_capacity,
                payload_len
            );
        case HostPersonaModeDualSense:
        default:
            payload_len = 0;
            return false;
    }
}
