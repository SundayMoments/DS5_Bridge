// Wake-on-PS for DS5_Bridge. Ported from awalol/DS5Dongle (src/wake.cpp).
// Lets a PS/controller-button press wake the host from S3 sleep by advertising
// USB remote-wakeup and tapping a keyboard key on the existing HID keyboard
// interface (KEYBOARD_HID_INSTANCE). Compiled only when ENABLE_WAKE_HID is set.
#pragma once
#include <cstdint>

#ifdef ENABLE_WAKE_HID
void wake_init(void);
void wake_task(void);
void wake_on_bt_input(const uint8_t *report, uint16_t len);
void wake_on_bt_connect(void);
void wake_note_suspend(void);
void wake_note_resume(void);
#else
static inline void wake_init(void) {}
static inline void wake_task(void) {}
static inline void wake_on_bt_input(const uint8_t *, uint16_t) {}
static inline void wake_on_bt_connect(void) {}
static inline void wake_note_suspend(void) {}
static inline void wake_note_resume(void) {}
#endif
