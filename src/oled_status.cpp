// Optional SH1107 OLED display for DS5_Bridge.
// Panel init / SPI wiring and framebuffer transport adapted from
// MarcelineVPQ/DS5Dongle-OLED-Edition (AGPL-3.0).
#include "oled_status.h"

#include <cstdio>
#include <cstring>

#include "bt.h"
#include "oled_flush.h"
#include "oled_font.h"
#include "persona/host_persona.h"
#include "hardware/gpio.h"
#include "hardware/spi.h"
#include "pico/stdlib.h"
#include "pico/time.h"
#include "tusb.h"

namespace {

// Waveshare Pico-OLED-1.3: SH1107, 128x64, SPI1 on GPIO10/11.
constexpr uint kPinDc = 8;
constexpr uint kPinCs = 9;
constexpr uint kPinClk = 10;
constexpr uint kPinMosi = 11;
constexpr uint kPinReset = 12;
constexpr uint kKey0 = 15;
constexpr uint kKey1 = 17;
constexpr uint32_t kRenderIntervalMs = 100; // 10 Hz; no busy-wait
constexpr uint32_t kDimAfterMs = 2 * 60 * 1000;
constexpr uint32_t kOffAfterMs = 15 * 60 * 1000;
constexpr uint32_t kFullRefreshMs = 30 * 1000;

uint8_t framebuffer[oled_flush::kFbBytes]{};
uint8_t previous_frame[oled_flush::kFbBytes]{};
uint32_t last_render_ms = 0;
uint32_t last_full_ms = 0;
uint32_t last_activity_ms = 0;
uint8_t page = 0;
bool panel_on = false;
bool frame_valid = false;
bool link_was_connected = false;
bool usb_was_mounted = false;
bool panel_dimmed = false;

struct Key {
    uint pin;
    bool raw = false;
    bool stable = false;
    uint32_t last_change_ms = 0;
};
Key keys[] = {{kKey0}, {kKey1}};

void send_command(uint8_t byte) {
    gpio_put(kPinDc, 0);
    gpio_put(kPinCs, 0);
    spi_write_blocking(spi1, &byte, 1);
    gpio_put(kPinCs, 1);
}

// SH1107 columns in the physical 1.3" display are rotated relative to
// framebuffer rows. Preserve the tested per-row flush from OLED Edition.
struct SpiSink {
    void cmd(const uint8_t *p, int n) {
        gpio_put(kPinDc, 0);
        gpio_put(kPinCs, 0);
        spi_write_blocking(spi1, p, static_cast<size_t>(n));
        gpio_put(kPinCs, 1);
    }
    void data(const uint8_t *p, int n) {
        gpio_put(kPinDc, 1);
        gpio_put(kPinCs, 0);
        spi_write_blocking(spi1, p, static_cast<size_t>(n));
        gpio_put(kPinCs, 1);
    }
};

void panel_wake() {
    if (!panel_on) {
        send_command(0xAF);
        panel_on = true;
        frame_valid = false;
    }
    if (panel_dimmed) {
        send_command(0x81);
        send_command(0x6F);
        panel_dimmed = false;
    }
}

void mark_activity(uint32_t now) {
    last_activity_ms = now;
    panel_wake();
}

void poll_key(Key &key, uint32_t now) {
    const bool raw = gpio_get(key.pin) == 0;
    if (raw != key.raw) {
        key.raw = raw;
        key.last_change_ms = now;
    }
    if (raw == key.stable || static_cast<uint32_t>(now - key.last_change_ms) < 25) {
        return;
    }
    key.stable = raw;
    if (!raw) return; // react to a debounced press, not release

    const bool was_off = !panel_on;
    mark_activity(now);
    if (!was_off) {
        // Both keys change the page; neither changes controller settings.
        page = static_cast<uint8_t>((page + 1) % 2);
    }
    last_render_ms = now - kRenderIntervalMs;
}

void pixel(int x, int y) {
    if (x < 0 || x >= oled_flush::kW || y < 0 || y >= oled_flush::kH) return;
    framebuffer[y * oled_flush::kRowBytes + x / 8] |= static_cast<uint8_t>(0x80u >> (x % 8));
}

void line(int x0, int y, int x1) {
    for (int x = x0; x <= x1; ++x) pixel(x, y);
}

void draw_char(int x, int y, char c) {
    if (c < 0x20 || c > 0x7E) return;
    const uint8_t *glyph = kFont5x7[c - 0x20];
    for (int dx = 0; dx < kFontW; ++dx) {
        for (int dy = 0; dy < kFontH; ++dy) {
            if (glyph[dx] & (1u << dy)) pixel(x + dx, y + dy);
        }
    }
}

void draw_text(int x, int y, const char *str) {
    while (*str && x < oled_flush::kW - kFontW) {
        draw_char(x, y, *str++);
        x += kFontW + 1;
    }
}

const char *persona_label(HostPersonaMode mode) {
    switch (mode) {
        case HostPersonaModeDualSense: return "DS5";
        case HostPersonaModeDualSenseEdge: return "DS EDGE";
        case HostPersonaModeDs4: return "DS4";
        case HostPersonaModeXusb360: return "XBOX";
        default: return "UNKNOWN";
    }
}

void render_status(bool connected, bool usb_connected, uint8_t battery_percent) {
    char text[32];
    draw_text(0, 1, "DS5 BRIDGE");
    draw_text(103, 1, "1/2");
    line(0, 10, 127);
    const char *pad = !connected ? "NONE" :
        bt_controller_type() == ControllerTypeDualSenseEdge ? "DS EDGE" : "DUALSENSE";
    std::snprintf(text, sizeof(text), "PAD: %s", pad);
    draw_text(0, 13, text);
    if (connected && battery_percent <= 100) {
        std::snprintf(text, sizeof(text), "BATT: %u%%", static_cast<unsigned>(battery_percent));
    } else {
        std::snprintf(text, sizeof(text), "BATT: --");
    }
    draw_text(0, 23, text);
    if (connected && bt_has_signal_strength()) {
        std::snprintf(text, sizeof(text), "RSSI: %d dBm", static_cast<int>(bt_get_signal_strength()));
    } else {
        std::snprintf(text, sizeof(text), "RSSI: --");
    }
    draw_text(0, 33, text);
    std::snprintf(text, sizeof(text), "HOST: %s", persona_label(host_persona_active()));
    draw_text(0, 43, text);
    draw_text(0, 53, usb_connected ? "USB: CONNECTED" : "USB: DISCONNECTED");
}

void render_details(bool connected, bool usb_connected) {
    char text[32];
    draw_text(0, 1, "BRIDGE DETAILS");
    draw_text(103, 1, "2/2");
    line(0, 10, 127);
#if defined(WAVESHARE_RP2350B_PLUS_W)
    draw_text(0, 13, "BOARD: RP2350B+");
#else
    draw_text(0, 13, "BOARD: PICO 2 W");
#endif
    draw_text(0, 23, connected ? "BT: CONNECTED" : "BT: DISCONNECTED");
    draw_text(0, 33, bt_pairing_active() ? "PAIRING: ACTIVE" : "PAIRING: OFF");
    draw_text(0, 43, usb_connected ? "USB: CONNECTED" : "USB: DISCONNECTED");
    std::snprintf(text, sizeof(text), "FW: %d.%d.%d",
        DS5_FIRMWARE_VERSION_MAJOR,
        DS5_FIRMWARE_VERSION_MINOR,
        DS5_FIRMWARE_VERSION_PATCH);
    draw_text(0, 53, text);
}

void flush_frame(uint32_t now) {
    const bool full = !frame_valid ||
        static_cast<uint32_t>(now - last_full_ms) >= kFullRefreshMs;
    if (!full && std::memcmp(previous_frame, framebuffer, sizeof(framebuffer)) == 0) return;
    SpiSink sink;
    oled_flush::stream_frame(framebuffer, sink, full ? nullptr : previous_frame);
    std::memcpy(previous_frame, framebuffer, sizeof(framebuffer));
    frame_valid = true;
    if (full) last_full_ms = now;
}

} // namespace

void oled_status_init() {
    spi_init(spi1, 10 * 1000 * 1000);
    gpio_set_function(kPinClk, GPIO_FUNC_SPI);
    gpio_set_function(kPinMosi, GPIO_FUNC_SPI);
    gpio_init(kPinCs); gpio_put(kPinCs, 1); gpio_set_dir(kPinCs, GPIO_OUT);
    gpio_init(kPinDc); gpio_put(kPinDc, 0); gpio_set_dir(kPinDc, GPIO_OUT);
    gpio_init(kPinReset); gpio_put(kPinReset, 1); gpio_set_dir(kPinReset, GPIO_OUT);
    for (Key &key : keys) {
        gpio_init(key.pin);
        gpio_set_dir(key.pin, GPIO_IN);
        gpio_pull_up(key.pin);
    }
    gpio_put(kPinReset, 0);
    sleep_ms(10);
    gpio_put(kPinReset, 1);
    sleep_ms(100);
    const uint8_t commands[] = {
        0xAE, 0x00, 0x10, 0xB0, 0xDC, 0x00, 0x81, 0x6F, 0x21,
        0xA0, 0xC0, 0xA4, 0xA6, 0xA8, 0x3F, 0xD3, 0x60,
        0xD5, 0x41, 0xD9, 0x22, 0xDB, 0x35, 0xAD, 0x8A
    };
    for (uint8_t cmd : commands) send_command(cmd);
    sleep_ms(50);
    panel_wake();
    last_activity_ms = to_ms_since_boot(get_absolute_time());
}

void oled_status_loop(uint8_t battery_percent) {
    const uint32_t now = to_ms_since_boot(get_absolute_time());
    for (Key &key : keys) poll_key(key, now);

    if (static_cast<uint32_t>(now - last_render_ms) < kRenderIntervalMs) return;
    last_render_ms = now;

    const bool connected = bt_is_controller_connected();
    const bool usb_connected = tud_mounted();
    if (connected != link_was_connected || usb_connected != usb_was_mounted) {
        link_was_connected = connected;
        usb_was_mounted = usb_connected;
        mark_activity(now);
    }
    const uint32_t idle = static_cast<uint32_t>(now - last_activity_ms);
    if (idle >= kOffAfterMs) {
        if (panel_on) {
            send_command(0xAE);
            panel_on = false;
        }
        return; // do not refresh or wake on RSSI/battery fluctuations
    }
    if (idle >= kDimAfterMs && !panel_dimmed) {
        send_command(0x81);
        send_command(0x10);
        panel_dimmed = true;
    }
    std::memset(framebuffer, 0, sizeof(framebuffer));
    if (page == 0) render_status(connected, usb_connected, battery_percent);
    else render_details(connected, usb_connected);
    flush_frame(now);
}
