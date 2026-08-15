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
  <strong>DS5 Bridge 1.7.0 is live.</strong><br>
  This release includes controller microphone support, Audio Haptics, Trigger
  Lab, controller personas, chords, and companion firmware tools.
</p>

DS5 Bridge lets you use a real Sony DualSense or DualSense Edge controller
wirelessly on a Windows PC through a Raspberry Pi Pico 2 W. The controller pairs
to the Pico over Bluetooth, and the Pico plugs into your PC over USB.

The companion app gives you a clean place to adjust audio, haptics, trigger
strength, lighting, button remaps, shortcuts, firmware tools, and other
controller behavior without rebuilding firmware.

## Quick Start

1. Download the firmware `.uf2` and Windows companion installer from
   [Releases](https://github.com/SundayMoments/DS5_Bridge/releases/latest).
2. With the Pico 2 W unplugged, hold `BOOTSEL`, then connect it to your PC.
3. Copy the `.uf2` file onto the Pico drive that appears in Windows.
4. Briefly press `BOOTSEL` once, then wait about one second for the Pico to open
   its controller pairing window.
5. Put the DualSense controller into Bluetooth pairing mode by holding `Create`
   and `PS` until the lightbar rapidly blinks blue.
6. Wait for the controller to pair to the Pico, not directly to Windows.
7. Install and open DS5 Bridge. The Overview page should show the connected
   bridge and firmware version.

Once the controller connects to the Pico, Windows sees it as a normal
DualSense-compatible USB controller.

## BOOTSEL Button Gestures

After DS5 Bridge firmware is installed, the Pico's `BOOTSEL` button controls
controller connections and firmware maintenance:

| Gesture | Action |
| --- | --- |
| One brief press | If no controller is connected, open the controller pairing window. If a controller is connected, disconnect it while preserving its saved pairing. |
| Two brief presses | Reboot the Pico normally. |
| Three brief presses | Reboot into USB firmware flashing mode. The Pico appears as a drive so you can copy a `.uf2` file onto it. |
| Hold for about 1.5 seconds | Forget all saved controller pairings, disconnect the current controller, and open a fresh pairing window. |

A one- or two-press gesture is performed after the Pico waits about one second
to make sure another press is not coming. For a new controller, briefly press
`BOOTSEL` once, wait for the pairing window to open, then hold `Create` and `PS`
on the controller until its lightbar rapidly blinks blue.

## Features

- Use a DualSense or DualSense Edge wirelessly through a Pico 2 W.
- Use the controller speaker, headset jack, microphone, and audio-driven haptics.
- Tune audio, haptics, adaptive triggers, and lighting from the Windows app.
- Use Audio Haptics to turn system or app audio into controller feedback.
- Save controller setups as profiles.
- Remap buttons and assign chord shortcuts.
- Switch the host persona between DualSense, DualSense Edge, DualShock 4, and Xbox modes.
- See Bluetooth signal quality at a glance.
- Mount, flash, or nuke Pico firmware from Bridge Settings.
- Wake your PC over Wi-Fi (Wake-on-LAN) just by connecting your controller
  (Waveshare RP2350B-Plus-W only).

## Explore Kitsune Input

DS5 Bridge is a complete, free, and open-source bridge experience. For deeper
controller customization, explore [Kitsune Input](https://kitsuneinput.com/),
with advanced stick and trigger tuning, gyro aim, touchpad gestures, per-game
profiles, multi-actions, Kitsune Game Bar, and expanded controller personas.

[Learn more](https://kitsuneinput.com/) ·
[Purchase Kitsune Input](https://ko-fi.com/s/d1f0a3b26f)

## Companion App Tour

The companion app is where you check the bridge, adjust the controller, and save
the setup you actually want to play with.

### Overview

See connection health, firmware version, battery, audio route, Bluetooth signal
quality, host persona, and the settings most likely to matter during play.

<p align="center">
  <img src="assets/readme/app-overview.png" width="680" alt="Overview dashboard in the DS5 Bridge companion app">
</p>

### Audio

Control the controller speaker, headphone-jack route, microphone level, speaker
gain, and buffer length.

<p align="center">
  <img src="assets/readme/app-audio.png" width="680" alt="Audio controls in the DS5 Bridge companion app">
</p>

### Haptics

Adjust HD haptics, classic rumble, feedback boost, and audio buffer length, then
test the feel before opening a game.

<p align="center">
  <img src="assets/readme/app-haptics.png" width="680" alt="Haptics and rumble controls in the DS5 Bridge companion app">
</p>

### Audio Haptics

Turn system audio or an app session into controller haptic feedback.

<p align="center">
  <img src="assets/readme/app-audio-haptics.png" width="680" alt="Audio Haptics controls in the DS5 Bridge companion app">
</p>

### Triggers

Set adaptive trigger strength, try effects, or open Trigger Lab for per-trigger
profiles.

<p align="center">
  <img src="assets/readme/app-triggers.png" width="680" alt="Adaptive trigger controls in the DS5 Bridge companion app">
</p>

### Trigger Lab

Build and preview adaptive trigger effects before applying them to the controller.

<p align="center">
  <img src="assets/readme/app-trigger-lab.png" width="680" alt="Trigger Lab controls in the DS5 Bridge companion app">
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

Manage profiles, mute button behavior, polling rate, host persona, diagnostics,
and device repair.

<p align="center">
  <img src="assets/readme/app-system.png" width="680" alt="System controls in the DS5 Bridge companion app">
</p>

### Chords

Create reusable keyboard, media, and controller actions, then assign them to
starter chords.

DualSense Edge reserves LFN/RFN plus the face buttons for onboard profile
switching. Enable **Block Edge Profile Switching** in Bridge Settings to use
those combinations as DS5 Bridge chords; turning it off keeps the assignments
saved but inactive.

<p align="center">
  <img src="assets/readme/app-chords.png" width="680" alt="Chord assignment controls in the DS5 Bridge companion app">
</p>

### Bridge Settings

Set theme, UI scale, tray and startup behavior, firmware maintenance, power
saving, LEDs, shortcuts, idle disconnect, PC sleep disconnect, and Wake-on-LAN.

<p align="center">
  <img src="assets/readme/app-bridge-settings.png" width="680" alt="Bridge Settings dialog in the DS5 Bridge companion app">
</p>

## Wake-on-LAN

On the Waveshare RP2350B-Plus-W board, DS5 Bridge can wake your PC over Wi-Fi
the moment your DualSense controller connects — no keyboard, mouse, or
Ethernet magic-packet utility needed. This is a separate mechanism from the
existing USB-based "Wake PC on Controller" toggle: that one relies on USB
remote wake and only works while the Pico stays connected to a PC that is
merely asleep, not fully powered off. Wake-on-LAN instead sends a real network
magic packet, so it can wake a PC that's been shut down, as long as the PC's
network adapter has Wake-on-LAN enabled.

### How it works

1. When your controller connects to the Pico, the firmware first checks
   whether the target PC already looks awake over USB (so it never sends an
   unnecessary wake packet, or interrupts you with a lightbar pulse, while
   you're already at your desk with everything on).
2. If the PC looks like it needs waking, the Pico connects to your Wi-Fi
   network using the CYW43 radio it already has onboard for Bluetooth, and
   sends a standard UDP Wake-on-LAN magic packet addressed to your PC's MAC
   address.
3. The firmware watches for the target to come back on the network (via ARP)
   and resends the magic packet a few times if needed, so a single dropped
   packet on a slow-to-associate Wi-Fi network doesn't leave your PC asleep.
4. All of this runs alongside normal Bluetooth/controller operation. A
   missing Wi-Fi network, wrong credentials, or an unreachable target PC never
   blocks or delays controller pairing, input, or audio — Wake-on-LAN is
   strictly best-effort.

### Setup

1. Open **Bridge Settings** in the companion app and find the **Wake-on-LAN**
   section.
2. Turn on **Wake PC over Wi-Fi**.
3. Enter the **Wi-Fi Network** name (SSID) and **Wi-Fi Password** the Pico
   should use to reach your PC's network. This can be the same network your
   PC is on, or any network that can route a magic packet to it.
4. Enter your PC's **Target MAC Address** (`AA:BB:CC:DD:EE:FF`) — use the MAC
   address of the network adapter you want to wake, not necessarily the one
   currently active.
5. In Windows, make sure Wake-on-LAN is enabled for that network adapter
   (Device Manager → adapter **Properties** → **Power Management** → *Allow
   this device to wake the computer*, and, for wired adapters, the matching
   *Wake on Magic Packet* option in **Advanced**) and that fast startup is
   configured in a way that's compatible with your adapter's wake support.

### Requirements

- A board with a CYW43 Wi-Fi radio: on by default for Waveshare
  RP2350B-Plus-W, or build with `-DENABLE_WOLWIFI=ON` on the default Pico
  2 W target (only tested on Waveshare so far). Boards without a radio
  simply don't show the Wake-on-LAN section in the app.
- A Wi-Fi network that can reach your PC's network segment.
- Wake-on-LAN enabled on the target PC's network adapter and in its BIOS/UEFI
  power settings, and the adapter's wake support has to survive a full
  shutdown (not just sleep) for the "wake from off" case.

## Troubleshooting

- Use the companion app and firmware from the same release when possible.
- For first-time flashing, hold `BOOTSEL` before plugging the Pico 2 W into the
  PC. The Pico should appear as a USB drive.
- Pair the controller to the Pico, not Windows. Hold `Create` and `PS` until the
  lightbar rapidly blinks blue. If the Pico is not already searching, briefly
  press `BOOTSEL` once and wait about one second first.
- If audio, mic, haptics, or flashing behave oddly, try a direct USB port and a
  data-capable micro-USB cable before using a hub.
- If controller audio sounds doubled, distorted, or too loud, restart your PC,
  reopen DS5 Bridge, and run the speaker test again.
- If Windows keeps stale or duplicate controller/audio devices, use
  [Windows device cleanup](docs/windows-device-cleanup.md) or System >
  Emergency Device Repair.
- Battery level may be inaccurate while the controller is charging.

## Requirements

- Raspberry Pi Pico 2 W.
- Sony DualSense or DualSense Edge controller.
- Data-capable USB cable with a micro-USB end for the Pico 2 W.
- Windows for the companion app.

## For Developers

See [docs/development.md](docs/development.md) for local build requirements,
firmware build commands, companion app setup, audio helper notes, and packaging
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
| `src/wolwifi.cpp` | Wake-on-LAN over Wi-Fi: host-alive gate, Wi-Fi connect, and magic-packet send/resend. On by default for Waveshare RP2350B-Plus-W, opt-in via `ENABLE_WOLWIFI` on other CYW43 boards. |
| `companion/` | Electron companion app source, protocol parser, HID service, assets, and UI. |
| `companion/native/AudioHelper/` | Windows audio helper used by the companion app for audio sessions, haptics mirroring, endpoint setup, and media integrations. |
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
