#ifndef DS5_BRIDGE_TRIGGER_MOTOR_POWER_H
#define DS5_BRIDGE_TRIGGER_MOTOR_POWER_H

#include <algorithm>
#include <cstdint>

// DualSense output byte 36 (motor power level): the low nibble reduces body
// rumble and the high nibble reduces adaptive trigger force, each 0-10 in 10%
// steps. Trigger intensity must only ever touch the high nibble.
namespace ds5::trigger_power {

constexpr uint8_t trigger_motor_power_from_percent(uint8_t intensity_percent) {
    if (intensity_percent == 0 || intensity_percent >= 100) {
        return 0;
    }
    const uint8_t reduction = static_cast<uint8_t>(
        ((100 - intensity_percent) * 10 + 50) / 100
    );
    return static_cast<uint8_t>(std::min<uint8_t>(reduction, 10) << 4);
}

// Combine the bridge's trigger intensity with the game's own trigger reduction
// so a lower intensity never makes triggers stronger than the game asked for,
// and keep the game's body-rumble reduction untouched.
constexpr uint8_t with_trigger_motor_power(uint8_t motor_power, uint8_t intensity_percent) {
    const uint8_t game_reduction = std::min<uint8_t>(static_cast<uint8_t>(motor_power >> 4), 10);
    if (intensity_percent == 0 || intensity_percent >= 100 || game_reduction == 0) {
        return static_cast<uint8_t>((motor_power & 0x0f) | trigger_motor_power_from_percent(intensity_percent));
    }
    const uint32_t reduction = (
        (100u - intensity_percent) * 10u + static_cast<uint32_t>(game_reduction) * intensity_percent + 50u
    ) / 100u;
    return static_cast<uint8_t>((motor_power & 0x0f) | (std::min<uint32_t>(reduction, 10) << 4));
}

} // namespace ds5::trigger_power

#endif // DS5_BRIDGE_TRIGGER_MOTOR_POWER_H
