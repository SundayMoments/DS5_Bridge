#ifndef DS5_BRIDGE_RADIAL_DEADZONE_H
#define DS5_BRIDGE_RADIAL_DEADZONE_H

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace ds5::radial_deadzone {

inline constexpr uint8_t kMaxPercent = 50;
inline constexpr uint8_t kNeutral = 128;

struct StickPosition {
    uint8_t x;
    uint8_t y;
};

inline float byte_to_unit(uint8_t value) {
    return value >= kNeutral
        ? static_cast<float>(static_cast<int16_t>(value) - kNeutral) / 127.0f
        : static_cast<float>(static_cast<int16_t>(value) - kNeutral) / 128.0f;
}

inline uint8_t unit_to_byte(float value) {
    const float clamped = std::clamp(value, -1.0f, 1.0f);
    const int32_t scaled = clamped >= 0.0f
        ? static_cast<int32_t>(std::lround(kNeutral + clamped * 127.0f))
        : static_cast<int32_t>(std::lround(kNeutral + clamped * 128.0f));
    return static_cast<uint8_t>(std::clamp<int32_t>(scaled, 0, 255));
}

inline StickPosition apply(uint8_t raw_x, uint8_t raw_y, uint8_t deadzone_percent) {
    const uint8_t percent = std::min(deadzone_percent, kMaxPercent);
    if (percent == 0) {
        return {raw_x, raw_y};
    }

    float x = byte_to_unit(raw_x);
    float y = byte_to_unit(raw_y);
    const float magnitude = std::min(1.0f, std::sqrt(x * x + y * y));
    const float deadzone = static_cast<float>(percent) / 100.0f;
    if (magnitude <= deadzone) {
        return {kNeutral, kNeutral};
    }

    const float output_magnitude = std::clamp(
        (magnitude - deadzone) / std::max(0.0001f, 1.0f - deadzone),
        0.0f,
        1.0f
    );
    const float scale = output_magnitude / magnitude;
    return {
        unit_to_byte(x * scale),
        unit_to_byte(y * scale)
    };
}

} // namespace ds5::radial_deadzone

#endif // DS5_BRIDGE_RADIAL_DEADZONE_H
