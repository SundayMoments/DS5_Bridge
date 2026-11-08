# Waveshare hardware-specific adaptation of upstream PR #118

Original contribution: https://github.com/SundayMoments/DS5_Bridge/pull/118
Reviewed revision: `e205121a07cf1f451cc2e094faf2cb7850716160`

This is an intentionally narrow, hardware-focused adaptation of that
contribution for the current DS5 Bridge main branch. It is **not** a replacement
for or a complete implementation of the original PR. Keeping flash/board
metadata independent from USB transport changes makes review, regression
testing, and possible rollback more predictable.

## Changes retained from #118

- Relocate the Waveshare BTstack TLV flash banks to
  `PICO_FLASH_BANK_STORAGE_OFFSET=0x003FD000`, below the top of the advertised
  16 MiB device. The preceding sectors remain available for the current
  bootloader authorization and Wake-on-LAN persistence layout.
- Declare the Waveshare board's 16 MiB flash size through
  `pico_board_cmake_set_default(PICO_FLASH_SIZE_BYTES, ...)`, in addition to
  the C preprocessor fallback.
- Expose the on-board LED2 on GPIO23 (distinct from the CYW43-driven LED1).

All changes are gated by `WAVESHARE_RP2350B_PLUS_W_BUILD` or reside in its
board-specific header. Pico 2 W's flash layout is not altered.

## Why this PR does not cherry-pick the USB code from #118

The original PR was written against an earlier USB/Bluetooth implementation.
The current main branch includes controller type detection for DualSense Edge,
multiple host personas, a management-only USB topology, and explicit
descriptor/endpoint re-enumeration. Replacing the present USB transport
transition logic with the earlier keep-attached shortcut would bypass these
policies.

The current feature report cache is already fixed-size
(`std::array<feature_cache_entry>` with `ds5::InlineBytes`), and
`bt_copy_feature_data()` avoids the old `std::vector` allocation in
`GET_REPORT`. However, the current `GET_REPORT` callback **can still enqueue
Bluetooth control work**, and the `SET_REPORT` callback still processes some
output synchronously. The callback-deferral changes from #118 have **not**
been incorporated or proved equivalent. They merit a separate review and
performance/regression tests against the current output, audio and persona
paths; they are deliberately outside the scope of this hardware-only PR.

## Compatibility and verification

Changing the TLV bank address relocates persisted Bluetooth link keys. A
previously paired controller may need to be paired again.

- [x] Firmware CI: Pico 2 W and Waveshare RP2350B-Plus-W build targets
- [x] Companion CI: existing checks (not modified by this PR)
- [x] Hardware-tested in the cumulative integration firmware on a real
      Waveshare RP2350B-Plus-W, per the downstream tester
- [ ] Separately test this standalone branch: pairing, power-cycle,
      Bluetooth key persistence, native haptics and USB audio

The upstream author also reported hardware validation of the original
PR #118; it does not replace validation of this narrower adaptation.
