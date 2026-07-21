# Diagnostics

Debugging has two layers:

- Firmware diagnostics are compile-time CMake options.
- Companion diagnostics are runtime environment variables.

## Firmware Presets

Use one preset first, then add individual legacy flags only when needed:

```powershell
cmake -S . -B build-ninja -G Ninja `
  -DENABLE_COMPANION=ON `
  -DDS5_DIAGNOSTICS_PRESET=audio
cmake --build build-ninja --target ds5-bridge
```

Presets:

```text
off     Release default. No companion debug reports or UART logs.
audio   Enables audio debug/stats feature reports.
traces  Enables audio debug/stats plus trigger and feedback trace reports.
all     Enables traces plus UART/BTstack logs.
custom  Honors the individual legacy flags below.
```

Presets are authoritative, so `off` really means off even if an old build
directory has stale debug flags cached. Use `custom` only when you need the old
individual flags:

```text
ENABLE_DEBUG_LOGS
ENABLE_AUDIO_DEBUG_REPORTS
ENABLE_TRIGGER_TRACE_REPORTS
ENABLE_FEEDBACK_TRACE_REPORTS
ENABLE_COMPANION_DEBUG
```

Firmware defaults and aliases live in `src/debug_config.h`.

## Persistent Physical UART Logs

The physical UART remains available when the Pico is powered but its USB device
does not enumerate. That makes it the preferred path for diagnosing descriptor,
TinyUSB, Bluetooth, watchdog, and early companion-interface failures. The
firmware stream uses `921600` baud, 8 data bits, no parity, one stop bit, and no
flow control.

Wire a 3.3 V USB-to-UART adapter as follows:

| Pico 2 W | USB-to-UART adapter | Required |
| --- | --- | --- |
| GPIO0 / UART TX, physical pin 1 | RXD | Yes |
| GND, for example physical pin 3 | GND | Yes |
| GPIO1 / UART RX, physical pin 2 | TXD | No; reserved for future interactive diagnostics |

Do not connect the adapter's 5 V or VCC pin. Power the Pico normally over USB
and use 3.3 V UART logic.

Build the companion-enabled diagnostic firmware without changing the Pico's USB
descriptors:

```powershell
cmake --preset pico2-w-debug-uart-companion-on
cmake --build --preset pico2-w-debug-uart-companion-on
```

Flash this artifact through BOOTSEL:

```text
build/diagnostics/pico2-w-debug-uart-companion-on/ds5-bridge.uf2
```

This preset also enables the feedback trace and drains it asynchronously through
the retained UART logger. Rumble and haptic records use compact CSV-style lines:

```text
[FB] seq,t_ms,stage,report,len,tag,decision,flag0,flag1,flag2,motor_r,motor_l,haptic_peak,haptic_mean,haptic_nonzero,detail0,detail1,detail2,detail3
```

Stage values are printed in a legend at boot: host input, bridge input/output,
Bluetooth send, drop, audio enqueue/drop, and locally generated audio haptics.
`[FB] lost=N` means the diagnostic consumer fell behind the firmware trace ring;
it is an explicit trace loss marker rather than a controller-output drop.

The normal release build compiles firmware logging out, so an attached UART
adapter receives no bytes until diagnostic firmware is flashed.

Install the per-user Windows collector and start it immediately:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\windows\pico-uart-logger.ps1 install
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\windows\pico-uart-logger.ps1 status
```

The collector auto-detects the CH343 adapter, reconnects across Pico or adapter
resets, starts at Windows sign-in, and writes raw rotating logs under:

```text
%LOCALAPPDATA%\DS5 Bridge\logs\pico-uart
```

Files rotate at 32 MiB. Logs are retained for 30 days with a 512 MiB total cap.
The current file and last received-byte time are recorded in `status.json`.
Use these commands to control the background collector:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\windows\pico-uart-logger.ps1 stop
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\windows\pico-uart-logger.ps1 start
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\windows\pico-uart-logger.ps1 uninstall
```

Only one process can own a COM port. Stop the collector before opening the same
adapter in another serial terminal. Uninstalling the task preserves existing
logs.

## Companion Runtime

Launch the companion with one high-level runtime preset:

```powershell
$env:DS5_BRIDGE_DIAGNOSTICS="audio"
cd companion
npm run dev
```

Runtime presets:

```text
off         Default. No extra feature-report polling.
audio       Poll audio debug/stats reports.
traces      Poll audio debug/stats plus trigger and feedback trace reports.
helper      Enable audio helper diagnostics.
all         Enable all companion diagnostic polling and audio helper diagnostics.
```

Individual runtime flags override the preset:

```text
DS5_BRIDGE_AUDIO_DEBUG_DIAGNOSTICS=1
DS5_BRIDGE_TRIGGER_TRACE_DIAGNOSTICS=1
DS5_BRIDGE_FEEDBACK_TRACE_DIAGNOSTICS=1
DS5_BRIDGE_MIC_KEEPALIVE=1
DS5_BRIDGE_AUDIO_HELPER_DIAGNOSTICS=1
```

Companion runtime defaults and environment variable names live in
`companion/src/main/debug-config.ts`.

## Common Recipes

Audio-only firmware and companion diagnostics:

```powershell
cmake -S . -B build-ninja -G Ninja `
  -DENABLE_COMPANION=ON `
  -DDS5_DIAGNOSTICS_PRESET=audio
cmake --build build-ninja --target ds5-bridge

$env:DS5_BRIDGE_DIAGNOSTICS="audio"
cd companion
npm run dev
```

Trace-heavy firmware and companion diagnostics:

```powershell
cmake -S . -B build-ninja -G Ninja `
  -DENABLE_COMPANION=ON `
  -DDS5_DIAGNOSTICS_PRESET=traces
cmake --build build-ninja --target ds5-bridge

$env:DS5_BRIDGE_DIAGNOSTICS="traces"
cd companion
npm run dev
```

Audio helper diagnostics:

```powershell
$env:DS5_BRIDGE_DIAGNOSTICS="helper"
cd companion
npm run dev
```
