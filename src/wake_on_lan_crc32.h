#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

// The reflected CRC-32 (0xEDB88320) the companion app uses for Wake-on-LAN
// staging checks. Same algorithm as utils.h, but namespaced and free of Pico
// headers so the engine and its host tests share it.

namespace ds5::wake_on_lan {

inline constexpr uint32_t crc32_table_entry(uint32_t index) {
    for (unsigned bit = 0; bit < 8; ++bit) {
        index = (index >> 1) ^ (0xedb88320u & (0u - (index & 1u)));
    }
    return index;
}

inline constexpr auto make_crc32_table() {
    std::array<uint32_t, 256> table{};
    for (uint32_t i = 0; i < table.size(); ++i) {
        table[i] = crc32_table_entry(i);
    }
    return table;
}

inline constexpr std::array<uint32_t, 256> kCrc32Table = make_crc32_table();

// The seed is the finalized CRC of any preceding bytes.
inline uint32_t crc32_seeded(const uint8_t *data, std::size_t size, const uint32_t seed) {
    uint32_t crc = ~seed;
    while (size--) {
        crc = (crc >> 8) ^ kCrc32Table[(crc ^ *data++) & 0xff];
    }
    return ~crc;
}

} // namespace ds5::wake_on_lan
