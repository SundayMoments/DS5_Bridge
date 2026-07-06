#include "haptics_test_signal.h"

#include <cstring>

namespace {

uint8_t haptics_test_signal_amplitude_internal(uint8_t base_amplitude, uint16_t gain_percent, uint8_t envelope_percent) {
    const uint16_t clamped_gain = gain_percent > HAPTICS_TEST_SIGNAL_MAX_GAIN_PERCENT
        ? HAPTICS_TEST_SIGNAL_MAX_GAIN_PERCENT
        : gain_percent;
    const uint32_t scaled = static_cast<uint32_t>(base_amplitude) * clamped_gain * envelope_percent;
    const uint32_t rounded = scaled / 10000;
    return static_cast<uint8_t>(rounded > 127 ? 127 : rounded);
}

} // namespace

uint8_t haptics_test_signal_envelope_percent(uint8_t packet_index, uint8_t packet_count) {
    (void)packet_index;
    return packet_count == 0 ? 0 : 100;
}

uint8_t haptics_test_signal_amplitude(uint8_t base_amplitude, uint16_t gain_percent, uint8_t envelope_percent) {
    return haptics_test_signal_amplitude_internal(base_amplitude, gain_percent, envelope_percent);
}

bool haptics_test_signal_packet_due(
    uint32_t now_us,
    uint32_t last_packet_us,
    uint32_t interval_us,
    bool carrier_paced
) {
    return carrier_paced
        || last_packet_us == 0
        || static_cast<uint32_t>(now_us - last_packet_us) >= interval_us;
}

void haptics_test_signal_fill(
    int8_t *destination,
    uint16_t len,
    uint8_t packet_index,
    uint8_t packet_count,
    uint8_t base_amplitude,
    uint16_t gain_percent
) {
    if (destination == nullptr || len == 0) {
        return;
    }

    std::memset(destination, 0, len);
    const uint8_t envelope = haptics_test_signal_envelope_percent(packet_index, packet_count);
    const uint8_t amplitude = haptics_test_signal_amplitude_internal(base_amplitude, gain_percent, envelope);
    if (amplitude == 0) {
        return;
    }

    const uint8_t index = packet_index >= packet_count
        ? static_cast<uint8_t>(packet_count - 1)
        : packet_index;
    const uint8_t packets_remaining = static_cast<uint8_t>(packet_count - index);
    const bool positive_phase = (packets_remaining & 1) != 0;

    for (uint16_t i = 0; i < len; i += 2) {
        destination[i] = positive_phase ? static_cast<int8_t>(amplitude) : static_cast<int8_t>(-amplitude);
        if (i + 1 < len) {
            destination[i + 1] = positive_phase ? static_cast<int8_t>(-amplitude) : static_cast<int8_t>(amplitude);
        }
    }
}
