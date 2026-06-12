# DS5 Bridge

<p align="center">
  <img src="assets/controllers/ds5-bridge_mark.png" width="180" alt="DS5 Bridge mark">
</p>

<p align="center">
  <a href="https://github.com/SundayMoments/DS5_Bridge/actions/workflows/build.yml"><img src="https://github.com/SundayMoments/DS5_Bridge/actions/workflows/build.yml/badge.svg" alt="Build firmware status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0--only-blue.svg" alt="License: AGPL-3.0-only"></a>
  <a href="https://github.com/SundayMoments/DS5_Bridge/releases/latest"><img src="https://img.shields.io/github/v/release/SundayMoments/DS5_Bridge?label=release" alt="Latest release"></a>
  <br>
  <img src="https://img.shields.io/badge/platform-Windows%20companion%20app%20%7C%20Pico%202%20W%20firmware-287cff" alt="Platform: Windows companion app and Raspberry Pi Pico 2 W firmware">
</p>

<p align="center">
  <a href="https://ko-fi.com/sundaymoments"><img src="assets/readme/support_me_on_kofi_blue.png" width="220" alt="Support me on Ko-fi"></a>
</p>

<p align="center">
  <strong>DS5 Bridge 1.0 is live.</strong><br>
  The first stable release includes the Windows companion app, Pico 2 W firmware,
  profiles, visual button remapping, microphone support, and headphone-jack audio.
</p>

DS5 Bridge lets you use a real Sony DualSense or DualSense Edge controller
wirelessly on a Windows PC through a Raspberry Pi Pico 2 W. The controller pairs
to the Pico over Bluetooth, and the Pico plugs into your PC over USB.

The companion app gives you a clean place to adjust audio, haptics, trigger
strength, lighting, button remaps, shortcuts, and other controller behavior
without reflashing the Pico.

* [Quick start](#quick-start)
* [Features](#features)
* [Companion app tour](#companion-app-tour)
  * [Overview](#overview)
  * [Haptics](#haptics)
  * [Audio](#audio)
  * [Triggers](#triggers)
  * [Lighting](#lighting)
  * [Button remapping](#button-remapping)
  * [System](#system)
  * [Settings](#settings)
* [Troubleshooting](#troubleshooting)
* [Common issues](#common-issues)
* [Requirements](#requirements)
* [For developers](#for-developers)
* [Project layout](#project-layout)
* [Development notes](#development-notes)
* [License](#license)
* [References](#references)
* [Disclaimer](#disclaimer)

## Quick Start

1. Download the firmware `.uf2` and Windows companion installer from
   [Releases](https://github.com/SundayMoments/DS5_Bridge/releases/latest).
2. With the Pico 2 W unplugged, hold `BOOTSEL`, then connect it to your PC.
3. Copy the `.uf2` file onto the Pico drive that appears in Windows.
4. Put the DualSense controller into Bluetooth pairing mode.
5. After the Pico restarts from flashing, wait for the controller to pair.
6. Install and open DS5 Bridge to check the connection and adjust your settings.

Once the controller connects to the Pico, Windows sees it as a normal
DualSense-compatible USB controller.

## Features

- Use a DualSense or DualSense Edge wirelessly through a Pico 2 W.
- Tune audio, haptics, adaptive triggers, and lighting from the Windows app.
- Save controller setups as profiles.
- Remap controller buttons visually.
- See Bluetooth signal quality at a glance.
- Use Host Encoding for smoother controller speaker and headphone-jack audio.

## Companion App Tour

The companion app is where you check the bridge, adjust the controller, and save
the setup you actually want to play with.

### Overview

See the connection, battery, audio route, Bluetooth signal quality, active
profile, and the settings most likely to matter during play.

<p align="center">
  <img src="assets/readme/app-overview.png" width="680" alt="Overview dashboard in the DS5 Bridge companion app">
</p>

### Haptics

Adjust HD haptics and classic rumble strength, then test the feel before
opening a game.

<p align="center">
  <img src="assets/readme/app-haptics.png" width="680" alt="Haptics and rumble controls in the DS5 Bridge companion app">
</p>

### Audio

Control the controller speaker, headphone-jack audio, microphone level, and Host
Encoding.

<p align="center">
  <img src="assets/readme/app-audio.png" width="680" alt="Audio controls in the DS5 Bridge companion app">
</p>

### Triggers

Set adaptive trigger strength and try sample effects without leaving the app.

<p align="center">
  <img src="assets/readme/app-triggers.png" width="680" alt="Adaptive trigger controls in the DS5 Bridge companion app">
</p>

### Lighting

Choose lightbar brightness and color, or let the app manage lighting behavior
for you.

<p align="center">
  <img src="assets/readme/app-lighting.png" width="680" alt="Lighting controls in the DS5 Bridge companion app">
</p>

### Button Remapping

Change what each controller button does, then save the remap when you are happy
with it.

<p align="center">
  <img src="assets/readme/app-button-remapping.png" width="680" alt="Button remapping controls in the DS5 Bridge companion app">
</p>

### System

Manage profiles, mute button behavior, polling rate, and diagnostics.

<p align="center">
  <img src="assets/readme/app-system.png" width="680" alt="System controls in the DS5 Bridge companion app">
</p>

### Settings

Set UI scale, startup behavior, power saving, shortcuts, idle disconnect, PC
sleep disconnect, and the Pico LED.

## Troubleshooting

- Make sure you have got a **Pico 2 W** (where w stands for wireless/bluetooth capability).
- When connecting your controller, put it in pairing mode, not just turning it on. (Pairing mode: refers to the controller state where the lightbar is rapidly blinking blue, which means it's actively looking for a Bluetooth connection. To enter pairing mode, hold the `Create` button and the `PS` button on the controller until the lightbar starts blinking blue)
- Keep Host Encoding enabled if you use the controller speaker or plug
  headphones into the controller. Turning it off can cause stuttering or static.
- Headphones through the controller headphone jack work best when DS5 Bridge is
  open and Host Encoding is enabled.
- If controller audio sounds doubled, distorted, or too loud, restart your PC,
  reopen DS5 Bridge, and run the speaker test again.
- Battery level may be inaccurate while the controller is charging.

## Common issues

See [Common issues](docs/common-issues.md) for solutions to common problems.

## Requirements

- Raspberry Pi Pico 2 W.
- Sony DualSense or DualSense Edge controller.
- USB cable with a micro end from the Pico 2 W to the PC.
- Windows for the companion app.

## For Developers

See [docs/development.md](docs/development.md) for local build requirements,
firmware build commands, companion app setup, host helper notes, and packaging
steps.

## Project Layout

| Path | Purpose |
| --- | --- |
| `src/main.cpp` | Pico startup, watchdog handling, USB task loop, and HID report bridge. |
| `src/bt.cpp` | Bluetooth inquiry, pairing, L2CAP HID channels, and report queueing. |
| `src/audio.cpp` | USB audio ingestion, haptic resampling, Opus speaker encoding, and audio packet assembly. |
| `src/companion.cpp` | Vendor HID companion protocol, status reports, command ACKs, and runtime setting dispatch. |
| `src/usb.cpp` | TinyUSB audio control callbacks and runtime settings fallback. |
| `src/usb_descriptors.c` | USB device, configuration, HID report, audio, and string descriptors. |
| `companion/` | Electron companion app source, protocol parser, HID service, assets, and UI. |
| `companion/native/HostAudioHelper/` | Windows host audio helper used by the companion app for host encoded audio. |
| `.github/workflows` | CI and release builds. |

## Development Notes

- The bridge presents itself to the host as a standard DualSense-compatible USB
  controller for compatibility.
- The companion app requires firmware built with the companion HID interface
  enabled.
- The project controls runtime behavior through the bridge and does not write
  controller-side profiles.
- Battery level is not reported accurately while the controller is charging.
- During development, Windows may keep stale controller or audio endpoint
  records after descriptor testing. Use
  [docs/windows-device-cleanup.md](docs/windows-device-cleanup.md) only if you
  run into device or endpoint issues while testing.

## License

This repository is distributed as AGPL-3.0-only. See [LICENSE](LICENSE).

This project is derived from [awalol/DS5Dongle](https://github.com/awalol/DS5Dongle),
which is credited in [NOTICE](NOTICE). Third-party submodules and package
dependencies retain their own license terms.

DualSense controller overlay artwork is adapted from
[AL2009man/Gamepad-Asset-Pack](https://github.com/AL2009man/Gamepad-Asset-Pack)
and credited in [NOTICE](NOTICE).

## References

- [awalol/DS5Dongle](https://github.com/awalol/DS5Dongle), the foundation for
  this project.
- [rafaelvaloto/Pico_W-Dualsense](https://github.com/rafaelvaloto/Pico_W-Dualsense)
  for project inspiration.
- [egormanga/SAxense](https://github.com/egormanga/SAxense) for Bluetooth
  haptics proof-of-concept work.
- [Sony DualSense controller documentation](https://controllers.fandom.com/wiki/Sony_DualSense)
  for report structure notes.
- [Paliverse/DualSenseX](https://github.com/Paliverse/DualSenseX) for speaker
  report packet references.
- Alex Smith of The Cynic Project for the speaker test sound, "Crystal Cave"
  (`song18`).

## Disclaimer

This project was vibecoded, so the occasional peculiarity may show through.
That said, it has been tested and edited with care.
