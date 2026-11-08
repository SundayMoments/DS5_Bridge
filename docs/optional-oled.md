# Optional SH1107 OLED display

This is the first, deliberately read-only OLED integration for DS5 Bridge. It does not change Bluetooth reports, USB descriptors, host persona switching, or Companion commands. Without `ENABLE_OLED`, the OLED driver is not compiled or linked.

## Supported display and wiring

- **Display:** Waveshare Pico-OLED-1.3, SPI SH1107, 128 x 64 (not the I2C SSD1306 variant).
- **Boards:** Raspberry Pi Pico 2 W and Waveshare RP2350B-Plus-W, each with an explicitly supported OLED build preset. Both use the RP2350 and the same SPI1/GPIO pin assignments when the SH1107 module is wired as below.
- **Pins on either board:** DC GP8, CS GP9, SPI1 SCK GP10, SPI1 MOSI GP11, RST GP12, KEY0 GP15, KEY1 GP17. Logic is **3.3 V**; match the display's documented supply voltage. The standard 40-pin Raspberry Pi Pico 2 W header exposes these GPIOs.
- The Pico-OLED-1.3 pinout was taken from [MarcelineVPQ/DS5Dongle-OLED-Edition](https://github.com/MarcelineVPQ/DS5Dongle-OLED-Edition); confirm physical wiring before powering a different carrier board. The default SPI0 pins in the Waveshare board header are unrelated; this display uses SPI1 explicitly.

## Build

Set `PICO_SDK_PATH` to Pico SDK **2.3.0** and add ARM GNU Toolchain
**15.2.Rel1** plus Ninja to `PATH`. Use the same TinyUSB revision as CI:
`2d56dc533e45e4e91b15e93fdab5e22e964f328d`.

From the repository root (Bash or PowerShell), select the target board:

```sh
# Raspberry Pi Pico 2 W + OLED
cmake --preset pico2-w-oled-release
cmake --build --preset pico2-w-oled-release --parallel 2

# Waveshare RP2350B-Plus-W + OLED
cmake --preset waveshare-rp2350b-plus-w-oled-release
cmake --build --preset waveshare-rp2350b-plus-w-oled-release --parallel 2
```

Both OLED presets enable `ENABLE_OLED=ON`, `ENABLE_COMPANION=ON`,
`CMAKE_BUILD_TYPE=Release`, and `DS5_DIAGNOSTICS_PRESET=off`. The Waveshare preset
also enables `WAVESHARE_RP2350B_PLUS_W_BUILD=ON`; the Pico 2 W preset leaves it OFF.
Each preset has an isolated build directory to prevent stale board settings.

Local firmware:
- Pico 2 W: `build/pico2-w-oled-release/ds5-bridge.uf2`
- Waveshare: `build/waveshare-rp2350b-plus-w-oled-release/ds5-bridge.uf2`

For a downloadable build, open **Actions → Build firmware → Run workflow**,
select a branch containing this change and run it. The firmware CI builds four combinations in one job: Pico 2 W and Waveshare,
each with and without OLED. Download **`ds5-bridge-companion-pico2-w-oled.uf2`**
for Raspberry Pi Pico 2 W or **`ds5-bridge-companion-waveshare-oled.uf2`**
for Waveshare. The standard non-OLED UF2 artifacts do not enable the display. This is an optimized
Release build for hardware testing, not a published stable release.

The Waveshare RP2350B-Plus-W + OLED configuration has been hardware-tested. The new Pico 2 W + OLED target uses the same driver and GPIOs and is CI-build-tested; physical Pico 2 W + OLED operation still needs verification.

## Behavior

- **Screen 1:** connected controller type (DualSense/Edge), battery percentage, Bluetooth RSSI, host persona (DS5/Edge/DS4/Xbox), USB mount state.
- **Screen 2:** board target, Bluetooth connection, pairing state, USB state, firmware version.
- KEY0 / KEY1 switch screens (no settings or host persona changes). A keypress wakes the display before it changes screens.
- Refresh rate is limited to 10 Hz; unchanged frames produce no SPI output. Screen dims after 2 minutes and shuts off after 15 minutes of inactivity; connection/mount changes or a keypress wake it.
- This first iteration does **not** include changing the polling rate, mirroring the OLED to the Companion app, or the full OLED Edition menus.

## Provenance

The SH1107 initialization, Pico-compatible GPIO mapping, tested framebuffer transfer in `src/oled_flush.h`, and public-domain 5x7 font in `src/oled_font.h` are adapted from [MarcelineVPQ/DS5Dongle-OLED-Edition](https://github.com/MarcelineVPQ/DS5Dongle-OLED-Edition) (AGPL-3.0 project). The OLED status integration and Bridge data bindings are specific to DS5 Bridge.
