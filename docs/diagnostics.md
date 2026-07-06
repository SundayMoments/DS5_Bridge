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
