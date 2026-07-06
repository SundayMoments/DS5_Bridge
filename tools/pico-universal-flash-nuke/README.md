# Pico Universal Flash Nuke

This is a repo-owned fork of the small Pico Universal Flash Nuke utility by
Phil Howard / Gadgetoid. It builds a no-flash SRAM UF2 for RP2040 and RP2350,
then concatenates both UF2 files into one universal nuke image.

The generated artifact used by the companion app is:

```text
companion/firmware/pico-universal-flash-nuke.uf2
```

Build it from the repository root with:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\build-pico-universal-flash-nuke.ps1
```

The fork is included under the BSD-3-Clause license in `LICENSE`.
