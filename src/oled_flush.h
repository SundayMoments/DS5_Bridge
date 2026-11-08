// The SH1107 frame transfer as a byte stream, kept free of the Pico SDK so the
// host tests (tests/host) can check it against the old one-byte-per-transaction
// flush: same command and data bytes, same order, only fewer chip-select frames.
#ifndef DS5_BRIDGE_OLED_FLUSH_H
#define DS5_BRIDGE_OLED_FLUSH_H

#include <stdint.h>
#include <string.h>

namespace oled_flush {

constexpr int kW = 128;
constexpr int kH = 64;
constexpr int kRowBytes = kW / 8;
constexpr int kFbBytes = kRowBytes * kH;

// The framebuffer is MSB = leftmost pixel; the panel wants LSB first.
struct BitReverseTable {
    uint8_t v[256];
    constexpr BitReverseTable() : v{} {
        // loop: NOT-WORTH — constexpr: the 256-entry bit-reverse table is built at compile time
        for (int i = 0; i < 256; i++) {
            uint8_t b = static_cast<uint8_t>(i);
            b = static_cast<uint8_t>(((b & 0x55) << 1) | ((b & 0xAA) >> 1));
            b = static_cast<uint8_t>(((b & 0x33) << 2) | ((b & 0xCC) >> 2));
            b = static_cast<uint8_t>(((b & 0x0F) << 4) | ((b & 0xF0) >> 4));
            v[i] = b;
        }
    }
};
inline constexpr BitReverseTable kBitReverse{};

// One frame: page 0, then for each changed framebuffer row (a panel column, the
// display is mounted rotated) the two column-address commands and the row's
// 16 bytes. Sink needs cmd(const uint8_t*, int) and data(const uint8_t*, int);
// each call is one chip-select frame with D/C held (0 = command, 1 = data).
// previous == nullptr forces a full frame (boot and periodic panel recovery).
template <class Sink>
void stream_frame(const uint8_t *fb, Sink &sink, const uint8_t *previous = nullptr) {
    bool started = false;
    // loop: HOT-PATH-OK — 64 rows; unchanged rows send nothing, at most 129 SPI frames
    for (int j = 0; j < kH; j++) {
        const uint8_t *src = fb + j * kRowBytes;
        if (previous && memcmp(src, previous + j * kRowBytes, kRowBytes) == 0) continue;
        if (!started) {
            const uint8_t page = 0xB0;
            sink.cmd(&page, 1);
            started = true;
        }
        const uint8_t col = static_cast<uint8_t>(kH - 1 - j);
        const uint8_t addr[2] = {static_cast<uint8_t>(0x00 + (col & 0x0F)),
                                 static_cast<uint8_t>(0x10 + (col >> 4))};
        sink.cmd(addr, 2);
        uint8_t row[kRowBytes];
        // loop: HOT-PATH-OK — 16 bytes bit-reversed per row, only when the frame changed
        for (int i = 0; i < kRowBytes; i++) row[i] = kBitReverse.v[src[i]];
        sink.data(row, kRowBytes);
    }
}

}  // namespace oled_flush

#endif  // DS5_BRIDGE_OLED_FLUSH_H
