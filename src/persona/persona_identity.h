#ifndef DS5_BRIDGE_PERSONA_IDENTITY_H
#define DS5_BRIDGE_PERSONA_IDENTITY_H

#include <cstddef>
#include <cstdint>

namespace ds5::persona_identity {

inline constexpr uint8_t kSaltDs4 = 0x04;
inline constexpr uint8_t kSaltDualSense = 0x05;

// Derives a locally administered unicast address (big-endian, 02:xx:...) from
// the bridge's unique board ID and the persona. Every bridge keeps the same
// synthetic identity across boots, and two bridges never present the same one,
// so Steam and SDL do not merge two bridges into one controller.
inline void derive_address(uint8_t const *seed, std::size_t seed_len, uint8_t salt, uint8_t out[6]) {
    uint64_t hash = 14695981039346656037ull ^ salt;
    for (std::size_t index = 0; index < seed_len; ++index) {
        hash ^= seed[index];
        hash *= 1099511628211ull;
    }
    out[0] = 0x02;
    for (std::size_t index = 1; index < 6; ++index) {
        out[index] = static_cast<uint8_t>(hash >> (8 * (index - 1)));
    }
}

} // namespace ds5::persona_identity

#endif // DS5_BRIDGE_PERSONA_IDENTITY_H
