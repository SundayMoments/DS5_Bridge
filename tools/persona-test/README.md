# DS5 Bridge Persona Tester

Interactive host-side validation for DS5 Bridge personas.

Run DS4 mode:

```powershell
.\tools\persona-test.ps1 -Persona ds4
```

Run Xbox 360 / XInput mode:

```powershell
.\tools\persona-test.ps1 -Persona xbox
```

The tester keeps a live HID reader running so prompts use the newest input
report instead of stale buffered reports. It validates what the host sees, then
asks you to perform or confirm physical actions:

- DS4: VID/PID identity, HID open, face buttons, D-pad, shoulders, stick clicks, Options/Share/Home, touchpad click, touchpad finger swipe coordinates, L2/R2 analog, sticks, gyro movement, rumble, lightbar.
- Xbox 360: XInput slot, face buttons, D-pad, shoulders, stick clicks, Start/Back, sticks, L2/R2 analog, rumble.

Useful options:

```powershell
.\tools\persona-test.ps1 -Persona ds4 -TimeoutMs 20000
.\tools\persona-test.ps1 -Persona ds4 -SkipOutput
.\tools\persona-test.ps1 -Persona ds4 -Path '<hid device path>'
.\tools\persona-test.ps1 -Persona xbox -Json
```

Keep the companion app closed while running this tool so it does not compete for the same device paths.
