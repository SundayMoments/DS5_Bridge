#ifndef DS5_BRIDGE_HAPTICS_TEST_SIGNAL_H
#define DS5_BRIDGE_HAPTICS_TEST_SIGNAL_H

#include <cstdint>

constexpr uint16_t HAPTICS_TEST_SIGNAL_MAX_GAIN_PERCENT = 200;

uint8_t haptics_test_signal_envelope_percent(uint8_t packet_index, uint8_t packet_count);
uint8_t haptics_test_signal_amplitude(uint8_t base_amplitude, uint16_t gain_percent, uint8_t envelope_percent);
bool haptics_test_signal_packet_due(
    uint32_t now_us,
    uint32_t last_packet_us,
    uint32_t interval_us,
    bool carrier_paced
);
void haptics_test_signal_fill(
    int8_t *destination,
    uint16_t len,
    uint8_t packet_index,
    uint8_t packet_count,
    uint8_t base_amplitude,
    uint16_t gain_percent
);

#endif // DS5_BRIDGE_HAPTICS_TEST_SIGNAL_H
