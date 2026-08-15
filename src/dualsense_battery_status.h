#ifndef DS5_BRIDGE_DUALSENSE_BATTERY_STATUS_H
#define DS5_BRIDGE_DUALSENSE_BATTERY_STATUS_H

#include <cstdint>

namespace ds5::dualsense_battery {

constexpr uint8_t kUnknownPercent = 0xff;
constexpr uint8_t kPowerDischarging = 0x00;
constexpr uint8_t kPowerCharging = 0x01;
constexpr uint8_t kPowerFull = 0x02;

struct Reading {
    uint8_t percent = kUnknownPercent;
    uint8_t raw_power_state = kPowerDischarging;
};

inline Reading decode_status(uint8_t status) {
    Reading reading{};
    const uint8_t capacity = status & 0x0f;
    reading.raw_power_state = static_cast<uint8_t>((status >> 4) & 0x0f);

    switch (reading.raw_power_state) {
    case kPowerDischarging:
    case kPowerCharging:
        if (capacity <= 10) {
            reading.percent = static_cast<uint8_t>(
                capacity == 10 ? 100 : capacity * 10 + 5);
        }
        break;
    case kPowerFull:
        reading.percent = 100;
        break;
    default:
        // Fault and unknown power states do not carry a reliable capacity.
        break;
    }

    return reading;
}

} // namespace ds5::dualsense_battery

#endif // DS5_BRIDGE_DUALSENSE_BATTERY_STATUS_H
