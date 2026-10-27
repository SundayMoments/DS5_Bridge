# Wake-on-LAN

Ported from Kitsune Input. The bridge wakes a sleeping or shut-down PC when an
already-bonded controller reconnects. It tries USB remote wakeup first, then
joins the saved WPA2 network and sends a magic packet: a raw Ethernet frame,
EtherType `0x0842`, with no IP stack. The companion app only sets the network
up. Arming and the wake attempt run on the bridge alone.

Sources:
- `src/wake_on_lan_domain.*`: record validation, the magic frame, radio marker.
- `src/wake_on_lan_engine.*`: the state machine.
- `src/wake_on_lan_store.*`: A/B flash storage.
- `src/wake_on_lan.*`: the CYW43, flash and watchdog adapter.
- `cmake/patches/cyw43_wol_*.inc`: CYW43 driver hardening.
- `companion/src/shared/wake-on-lan-protocol.ts` and
  `companion/src/main/wake-on-lan-service.ts`: the app side.
- `companion/src/renderer/features/settings/WakeOnLanSettings.tsx`: the
  Settings panel, ported from Kitsune Input with its "Before you rely on it"
  checklist.
- `companion/src/main/wake-on-lan-readiness.ts`,
  `companion/src/main/wake-on-lan-targets.ts` and
  `companion/native/AudioHelper/{WakeOnLanReadiness,PhysicalEthernetAdapters}.cs`:
  the read-only Windows checks.

Host tests:
- `wake_on_lan_test` covers the engine and store against `tests/firmware/fixtures`.
- `cyw43_wol_guards_test` and `cyw43_wol_join_test` cover the driver fragments.
- `cyw43_wol_patch_contract` checks the generated driver copies.

## Arming and the attempt

An enabled record arms itself under these conditions:
- the host has stayed enumerated outside its firmware for 45 s since the last attempt;
- the host has then left the USB bus (suspend, unmount, or an unconfigured idle bus) for 3 s;
- the controller has been quiet for 1 s.

With **Disconnect controller when PC sleeps** on (the default), the bridge powers
the controller off on suspend, so arming follows. With it off, the controller
must be turned off by hand.

A BIOS/UEFI session never counts as a returned host. The bridge detects one
because the host selects the HID boot protocol.

Only an encrypted reconnect of a bonded controller can trigger an attempt. A new
pairing never does, and pages are refused while the bridge prepares to arm.
After a packet, the bridge treats the PC as starting for up to 5 minutes, or
until it has been enumerated for 45 s. During that time the sleep-disconnect
policy is suspended.

While Wi-Fi owns the radio, a quiet gate holds the following:
- Bluetooth scans are off, confirmed by HCI Read Scan Enable before WLAN starts.
- Controller input, output and microphone audio are dropped.
- USB audio streams are cleared.
- Companion commands other than Wake-on-LAN return Busy.

The gate is one always-inlined load in the SRAM paths and is false whenever
Wake-on-LAN is idle. The service pass runs as watchdog phase 18, `wake-on-lan`.

If Wi-Fi teardown cannot be verified, the bridge reboots instead of resuming
gameplay with the radio on. Watchdog scratch registers 5-7 then carry the
interrupted attempt, so the next status reports Failed/RadioTeardown.

## Windows readiness checks

The checklist reads this PC's settings through two audio helper commands.
They match Kitsune Input's Windows host output. Neither command opens a
bridge, HID device or audio endpoint, and neither changes a setting.

- `--list-physical-ethernet-adapters` prints the physical Ethernet adapters
  (GetIfTable2, regardless of link state) as Get-NetAdapter-shaped JSON, plus
  `EnumeratorName`, `InLocalMachineContainer` and `DefaultRoute`. The app
  falls back to PowerShell only when the helper is missing.
- `--wake-on-lan-readiness --target-mac AA-BB-CC-DD-EE-FF` prints `version: 1`
  JSON with `power` (Modern Standby, S3, hibernate, Fast Startup),
  `adapterStatus`, `adapter` (link, bus, enclosure, route, the driver's wake
  keywords, Windows wake arming, driver) and `lastWake` (newest
  Power-Troubleshooter source and Kernel-Boot 27 boot). Reads stop after
  2.8 s. Anything it cannot read is `unknown` or `null`. Bad arguments exit 2.

The app caches each adapter's result for 60 s. A missing helper, a timeout
or invalid output shows every check as Unknown.

## Wire format (companion protocol 1.24)

Command `0x57` carries the opcode in `value`. Its arguments begin at command
payload byte 10 (report byte 11) and are at most 53 bytes. The firmware queues
the command and ACKs it from its main loop, so the app re-reads a stale ACK
for up to 1.5 s.

| Opcode | Operation | Payload |
| --- | --- | --- |
| 1 | Begin | transaction u32, length u16 (112), record CRC32 u32 |
| 2 | Write | transaction u32, offset u16, length u8 (1..46), bytes |
| 3 | Test | transaction u32; asynchronous, poll the status |
| 4 | Commit | transaction u32; needs the validated record |
| 5 | Abort | transaction u32 |
| 6 | Set enabled | expected generation u32, enabled u8 |
| 7 | Forget | expected generation u32 |
| 8-10 | Prepare / commit / cancel power | Kitsune's host-prepared path; the DS5 app does not use it |

The setup commands need these conditions: no controller link, no pairing window,
no page in the last 5 s, and an active host. Otherwise they return Busy.
Staging expires after 30 s without activity.

**Configuration record (112 bytes):**

| Offset | Value |
| --- | --- |
| 0 | schema 1 |
| 1 | auth 1 (WPA2-AES; never WPA1) |
| 2 | SSID length 1..32 |
| 3 | password length 8..63 |
| 4-5 | country code |
| 6 | enabled |
| 8-13 | target MAC |
| 14-45 | SSID |
| 46-109 | password |

Countries are the 50 named CLM profiles plus `XX` (Worldwide). Finland and
Ireland have no locale in the pinned CLM. They load from a saved record but are
never accepted for a new one.

**Status report `0x1d`** (offsets include the report ID):

| Offset | Value |
| --- | --- |
| 1-6 | DS5B magic and the protocol version |
| 7 | schema 1 |
| 8 | flags: configured 1, enabled 2, credential 4, radio active 8, staging 16, validated 32 |
| 9 | stage |
| 10 | error |
| 11 | packets |
| 12-15 | generation |
| 16-19 | transaction |
| 20-25 | MAC |
| 26 | SSID length |
| 27-58 | SSID |
| 59-60 | country |
| 61 | auth |

The report never contains the password or anything derived from it.

The stage and error enums are in `src/wake_on_lan_domain.h`:
- Stages: Idle 0, Preparing 1, Armed 2, UsbFirst 3, Joining 4, Sending 5, Teardown 6, Complete 7, Failed 8, RadioFault 9, Testing 10.
- Errors: None 0 through ControllerUnavailable 13.

## Storage

The record uses two A/B sectors at `PICO_FLASH_BANK_STORAGE_OFFSET - 3 * 4096`,
directly below the bootloader authorization sector. That sector sits directly
below BTstack's storage bank. Each slot carries a CRC and a generation.

## Reset evidence (report `0x13`)

This report is separate from Wake-on-LAN. It returns what the watchdog
telemetry captured at boot. Offsets include the report ID:

| Offset | Value |
| --- | --- |
| 7 | schema 1 |
| 8 | flags: watchdog reset 1, breadcrumb valid 2 |
| 9 | phase |
| 10 | reason |
| 11 | consecutive abnormal resets |
| 12-15 | uptime before the reset, ms |
| 16-19 | detail |
| 20-23 | current uptime, ms |

The app shows it as `diagnostics.resetEvidence`.
