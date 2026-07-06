# Persona Emulation Profile Research

Date: 2026-06-02

Sources inspected:

- joypad-ai/joypad-os at `be4dce65213f8f8d9460d079cf72138f5b346dfb`
  - Switch HID output profile: https://github.com/joypad-ai/joypad-os/blob/be4dce65213f8f8d9460d079cf72138f5b346dfb/src/usb/usbd/descriptors/switch_descriptors.h
  - Switch USB mode encoder: https://github.com/joypad-ai/joypad-os/blob/be4dce65213f8f8d9460d079cf72138f5b346dfb/src/usb/usbd/modes/switch_mode.c
  - Switch Pro USB host protocol reference: https://github.com/joypad-ai/joypad-os/blob/be4dce65213f8f8d9460d079cf72138f5b346dfb/src/usb/usbh/hid/devices/vendors/nintendo/switch_pro.c
  - Switch Pro report structs and commands: https://github.com/joypad-ai/joypad-os/blob/be4dce65213f8f8d9460d079cf72138f5b346dfb/src/usb/usbh/hid/devices/vendors/nintendo/switch_pro.h
  - PS4/DS4 descriptors: https://github.com/joypad-ai/joypad-os/blob/be4dce65213f8f8d9460d079cf72138f5b346dfb/src/usb/usbd/descriptors/ps4_descriptors.h
  - PS4/DS4 encoder and output handling: https://github.com/joypad-ai/joypad-os/blob/be4dce65213f8f8d9460d079cf72138f5b346dfb/src/usb/usbd/modes/ps4_mode.c
  - Xbox One descriptors: https://github.com/joypad-ai/joypad-os/blob/be4dce65213f8f8d9460d079cf72138f5b346dfb/src/usb/usbd/descriptors/xbone_descriptors.h
  - Xbox One mode: https://github.com/joypad-ai/joypad-os/blob/be4dce65213f8f8d9460d079cf72138f5b346dfb/src/usb/usbd/modes/xbone_mode.c
  - Xbox One TinyUSB/XGIP driver: https://github.com/joypad-ai/joypad-os/blob/be4dce65213f8f8d9460d079cf72138f5b346dfb/src/usb/usbd/drivers/tud_xbone.c
- Alia5/VIIPER at `6b71b148a2243fab77ee1a46f4e22e00bd7d5a04`
  - DS4 descriptor: https://github.com/Alia5/VIIPER/blob/6b71b148a2243fab77ee1a46f4e22e00bd7d5a04/device/dualshock4/descriptor.go
  - DS4 device/control handling: https://github.com/Alia5/VIIPER/blob/6b71b148a2243fab77ee1a46f4e22e00bd7d5a04/device/dualshock4/device.go
  - DS4 constants: https://github.com/Alia5/VIIPER/blob/6b71b148a2243fab77ee1a46f4e22e00bd7d5a04/device/dualshock4/const.go
  - Switch 2 Pro descriptor and command handling: https://github.com/Alia5/VIIPER/tree/6b71b148a2243fab77ee1a46f4e22e00bd7d5a04/device/ns2pro

## Executive Summary

We have enough information to add strong emulation profiles for:

- DualShock 4 on Windows/Steam/PC games.
- Xbox One controller on Windows, but it needs a custom XGIP class driver, not only a HID encoder.
- Switch-compatible HID mode using the HORI Pokken profile from Joypad OS.

We do not yet have enough from these two repos alone to confidently present as an exact, official Nintendo Switch Pro Controller USB device (`057E:2009`) without more descriptor verification. Joypad OS gives useful Switch Pro host-side protocol data, but its ready-to-use USB device profile is HORI Pokken (`0F0D:0092`) rather than official Nintendo Pro Controller.

## DS5 Bridge Integration Surface

The current persona architecture is the right place for this work:

- Add new enum values in `src/persona/host_persona.h`.
- Dispatch them in `src/persona/host_persona.cpp`.
- Add per-profile encoders under `src/persona/`, matching the existing `xusb360_persona.*` shape.
- Add descriptor selection in `src/usb_descriptors.c`.
- Add custom USB class drivers only where needed. DS4 and basic Switch HID can stay on TinyUSB HID. Xbox One needs a vendor-specific XGIP driver similar to Joypad OS's `tud_xbone`.
- Update `src/main.cpp` report send routing so HID personas use `tud_hid_report(...)`, while vendor-specific personas use their own send function.
- Update companion protocol/UI host persona values and labels.
- Update firmware tests in `tests/firmware/firmware_logic_tests.cpp` and descriptor guard tests in `tests/firmware/usb_descriptor_migration_test.cpp`.

The bridge/audio/companion interfaces can remain routed through the base DS5 Bridge composite device, but each new game-facing persona should be tested against Windows driver matching because DS4/Switch/XGIP drivers may be more sensitive to composite layout than XUSB360 was.

## Target: DualShock 4

Status: enough for a first implementation.

Recommended identity:

- Prefer VIIPER's real DS4 identity for PC persona testing:
  - VID `0x054C`
  - PID `0x09CC`
  - manufacturer `Sony Interactive Entertainment`
  - product `Wireless Controller`
- Joypad OS uses a PS4-compatible Razer Panthera identity:
  - VID `0x1532`
  - PID `0x0401`
  - manufacturer `Razer`
  - product `Panthera`

For DS5 Bridge's PC-focused purpose, VIIPER's DS4 identity is the better starting point if we want Steam and older games to classify it as a DS4. Joypad OS's Razer Panthera profile is useful if we ever want a PS4 fightstick-compatible mode, but it is not literally DS4-branded.

Input report:

- Report ID `0x01`.
- 64-byte USB input report.
- Byte 1-4: LX, LY, RX, RY, unsigned 8-bit centered at `0x80`.
- Byte 5: hat in low nibble, Square/Cross/Circle/Triangle in high nibble.
- Byte 6: L1/R1/L2/R2/Share/Options/L3/R3.
- Byte 7: PS, touchpad click, 6-bit rolling counter.
- Byte 8-9: L2/R2 analog trigger values.
- Byte 10-11: timestamp.
- Byte 13 onward: gyro, accel, status, battery, touchpad data, padding.

Feedback:

- Output report ID `0x05`.
- Rumble and lightbar values are available.
- VIIPER parses small/large rumble plus RGB and blink values.
- Joypad OS maps left/right rumble and RGB into a generic feedback struct.

Gaps and risks:

- PS4 console authentication is not solved without DS4 passthrough. This is not a blocker for PC/Steam/older Windows games.
- The two references differ on neutral hat value. VIIPER uses `0x08`, while Joypad OS initializes DS4 neutral as `0x0F`. This should be resolved with Windows/Steam/gamepad-tester validation before finalizing the encoder.
- DS4 feature reports matter. VIIPER is much more complete than Joypad OS here and should be the main reference for:
  - serial report,
  - identity report,
  - calibration reports,
  - capabilities report,
  - battery/status,
  - telemetry.
- DS5 Bridge should provide inert/neutral gyro, accel, and touchpad values initially, then optionally map DS5 gyro/touchpad later.

Implementation shape:

- `src/persona/ds4_persona.h/.cpp`
- `ds4_persona_encode_input(BridgeControllerState, HostPersonaInputReport&)`
- `ds4_persona_decode_output_to_ds5_payload(...)` for rumble and lightbar.
- DS4 HID report descriptor and string/device descriptor branch in `src/usb_descriptors.c`.
- Feature report handling in `tud_hid_get_report_cb` and `tud_hid_set_report_cb`.

## Target: Switch Pro Controller

Status: partially enough, depending on what "Switch Pro" means.

There are two viable paths:

1. Switch-compatible HID, implementation-ready:
   - Joypad OS provides a ready USB HID output profile using HORI Pokken identity.
   - VID `0x0F0D`, PID `0x0092`.
   - Manufacturer `HORI CO.,LTD.`
   - Product `POKKEN CONTROLLER`.
   - One HID interface with interrupt IN/OUT endpoints.
   - 8-byte input report: 16 button bits, hat, four 8-bit sticks, vendor byte.
   - This is straightforward and should work as a generic Switch-compatible controller profile.

2. Official Nintendo Switch Pro Controller, not yet fully ready from these repos alone:
   - Joypad OS references official Nintendo Pro Controller VID/PID `0x057E:0x2009`, but does not provide a ready USB device descriptor/report descriptor for it.
   - Joypad OS's host-side Switch Pro driver gives the protocol behavior we need to emulate:
     - host handshake commands `0x80/0x02`, `0x80/0x04`,
     - mode command `0x01` with subcommand `0x03` and full-report mode `0x30`,
     - standard full input report `0x30`,
     - subcommand reply/input prefix report `0x21`,
     - player LED subcommand `0x30`,
     - home LED subcommand `0x38`,
     - rumble-only command `0x10`,
     - 12-bit packed sticks.
   - That is enough to design the state machine, but we still need to verify the exact official USB device/config/HID report descriptor bytes before claiming an exact Switch Pro persona.

VIIPER note:

- VIIPER's `ns2pro` is a Nintendo Switch 2 Pro Controller profile, not Switch Pro.
- It is useful as a modern Nintendo reference:
  - VID `0x057E`, PID `0x2069`,
  - product `Switch 2 Pro Controller`,
  - HID plus vendor bulk interfaces,
  - Microsoft OS 1.0 WinUSB binding for the vendor interface,
  - report IDs `0x05`, `0x09`, output report `0x02`,
  - 12-bit sticks, IMU, HD rumble, player LED commands.
- It should not be used as the Switch Pro target unless we intentionally add a "Switch 2 Pro" persona.

Recommendation:

- First implement `Switch Compatible (HORI Pokken)` if the goal is broad PC/Switch-style compatibility with low risk.
- Keep the UI label conservative unless Steam actually reports it as Switch Pro.
- For a literal `Switch Pro Controller` profile, collect one more source: exact USB descriptors from a real wired Switch Pro Controller or a trusted emulator that implements `057E:2009` as a USB device.

Implementation shape for HORI-compatible mode:

- `src/persona/switch_hori_persona.h/.cpp`
- HID descriptor branch in `src/usb_descriptors.c`.
- 8-byte input encoder.
- Optional later output parser for rumble if needed.

Implementation shape for official Switch Pro mode:

- `src/persona/switch_pro_persona.h/.cpp`
- A small HID/device state machine for handshake/full-report mode.
- Feature/output report handling for host subcommands.
- 64-byte or official-sized input reports once descriptor is confirmed.

## Target: Xbox One Controller

Status: enough to prototype for Windows, but this is not a simple HID profile.

Joypad OS provides the relevant device-side implementation:

- Vendor-specific USB class, not HID.
- VID `0x0E6F`, PID `0x02A4` for a SuperPDP-style Xbox One controller.
- Interface class `0xFF`, subclass `0x47`, protocol `0xD0`.
- Interrupt IN endpoint `0x81`, interrupt OUT endpoint `0x02`, 64-byte packets.
- Microsoft OS descriptor advertises compatible ID `XGIP10`.
- Microsoft OS string descriptor index `0xEE` uses `MSFT100`.
- GIP/XGIP commands include:
  - announce,
  - keepalive,
  - device descriptor,
  - power mode config,
  - auth,
  - final auth,
  - virtual keycode,
  - rumble,
  - input report.

Input report:

- GIP header plus button fields.
- Buttons: guide, start/menu, back/view, A/B/X/Y, dpad, shoulders, thumb clicks, sync.
- Triggers are 0-1023.
- Sticks are signed 16-bit.
- Guide button needs a separate `GIP_VIRTUAL_KEYCODE` packet with keycode `0x5B`; the normal input bit alone is not enough.

Protocol behavior:

- After enumeration, the device announces itself.
- It responds to descriptor requests with a GIP device descriptor.
- It queues ACKs where needed.
- It sends idle reports during auth and keepalive packets after auth.
- It parses rumble and power-mode commands.
- It has auth passthrough hooks.

Important caveat:

- Joypad OS intentionally waits for `xbone_auth_is_available()` before sending the announce packet. In Joypad OS that is for console/auth-dongle workflows.
- For DS5 Bridge's Windows/PC persona, we need to test whether Windows accepts the XGIP10 device without real console-style auth. If it does, we can relax or replace that gate for PC-only mode. If it does not, Xbox One requires additional auth strategy and becomes much more complex.

VIIPER note:

- VIIPER currently provides an Xbox 360 virtual device, not Xbox One.
- It does not materially help with Xbox One beyond general USBIP device construction patterns.

Implementation shape:

- `src/persona/xbone_persona.h/.cpp` for input report encoding and output decode.
- `src/persona/xbone_usb.h/.cpp` or similar for the vendor-specific TinyUSB class driver.
- Add the class driver in `src/usb_app_drivers.cpp`.
- Add descriptor branch in `src/usb_descriptors.c`.
- Add a task hook from `main.cpp` or the existing USB task path to run the XGIP state machine.
- Add output translation for rumble to DS5 haptics.

## Recommended Build Order

1. DS4 persona.
   - Highest value and lowest architectural risk.
   - Reuses TinyUSB HID callbacks.
   - Strong VIIPER reference for feature reports.
   - Rumble/lightbar feedback can map naturally onto DS5 Bridge's existing DS5 output path.

2. Switch-compatible HORI Pokken persona.
   - Simple 8-byte HID report.
   - Low implementation risk.
   - Good test case for multi-HID persona descriptors.
   - Do not overclaim it as official Switch Pro until host naming is verified.

3. Xbox One persona.
   - Highest payoff for Xbox-style PC compatibility after XUSB360, but requires a dedicated XGIP class driver.
   - Prototype on Windows first with Joypad OS descriptors and a PC-only announce path.
   - Only attempt console-grade auth after PC behavior is proven.

4. Official Switch Pro persona.
   - Use Joypad OS host-side protocol as the behavior guide.
   - Block on exact USB descriptors/report descriptor confirmation.

## Enough Information Verdict

| Persona | Enough to implement? | Confidence | Notes |
| --- | --- | --- | --- |
| DualShock 4 | Yes | High | VIIPER has real DS4 identity, descriptor, report layout, feature reports, output parsing. |
| Switch Pro Controller | Not exact official yet | Medium | Enough for HORI/Switch-compatible HID now. Official Nintendo `057E:2009` needs descriptor confirmation. |
| Xbox One Controller | Yes for prototype | Medium-high | Joypad OS has descriptors and XGIP driver. Needs Windows validation and likely PC-specific auth gating decision. |
