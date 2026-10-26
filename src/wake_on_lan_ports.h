// Ported from Kitsune Input's Wake-on-LAN.
#pragma once
#include "wake_on_lan_domain.h"

namespace ds5::wake_on_lan {
struct WakeOnLanPorts {
    void *context = nullptr;
    bool (*save)(const StoredRecord &, void *) = nullptr;
    Error (*start)(const Config &, void *) = nullptr;
    RadioState (*radio_state)(void *) = nullptr;
    // The last radio fault. While joining it may report NetworkUnavailable to
    // mark a re-scan after "no network" that has not reached the access point.
    Error (*radio_error)(void *) = nullptr;
    bool (*send)(const uint8_t *target, void *) = nullptr;
    void (*stop)(void *) = nullptr;
    // Stores kRadioMarkerWords reset-surviving words (all zero
    // clears the marker). Firmware uses RP2350 watchdog scratch registers.
    void (*write_marker)(const uint32_t *words, void *) = nullptr;
};
struct WakeOnLanFlashPorts {
    void *context = nullptr;
    bool (*read)(uint32_t offset, uint8_t *data, size_t length, void *) = nullptr;
    bool (*erase)(unsigned slot, void *) = nullptr;
    bool (*program)(uint32_t offset, const uint8_t *page, void *) = nullptr;
};
}
