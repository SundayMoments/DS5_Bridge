// Wake-on-PS for DS5_Bridge. Ported from awalol/DS5Dongle (src/wake.cpp),
// stripped of that project's config gating, ps_shortcut, and controller
// power-off (DS5_Bridge already power-manages the controller in usb_pm_poll()).
//
// Mechanism: while the host is USB-suspended (S3), a controller button press --
// observed either as a change in the DualSense button bytes or as a fresh BT
// reconnect (the pad powers off during a real sleep) -- calls
// tud_remote_wakeup() and then taps a keyboard key on the existing HID keyboard
// interface (instance KEYBOARD_HID_INSTANCE = 1) so Windows registers a wake.
#include "wake.h"

#ifdef ENABLE_WAKE_HID

#include <cstring>
#include "tusb.h"
#include "device/dcd.h"
#include "pico/sync.h"
#include "pico/time.h"

#define WAKE_KBD_INSTANCE       1        // KEYBOARD_HID_INSTANCE (companion.h)
#define WAKE_KEYCODE            0x6A     // HID Usage: F15 (distinct from the F13 mute shortcut)
#define WAKE_SETTLE_US          150000   // let the host finish USB re-init after resume
#define WAKE_KEY_HOLD_US         80000   // keydown -> keyup gap
#define WAKE_KEY_UP_SETTLE_US   200000   // between attempts / before DONE
#define WAKE_REQUEST_TIMEOUT_US 5000000
#define WAKE_KEY_ATTEMPTS       2

typedef enum {
    WAKE_IDLE,
    WAKE_PENDING_PRESS,
    WAKE_REQUESTED,
    WAKE_KEY_DOWN,
    WAKE_KEY_UP_SENT,
    WAKE_DONE,
} wake_state_t;

static critical_section_t wake_cs;
static volatile bool wake_enabled = true;   // runtime toggle (companion app)
static volatile bool host_suspended = false;
static volatile bool host_resumed_event = false;
static wake_state_t state = WAKE_IDLE;
static uint64_t state_entered_us = 0;
static uint8_t key_attempts = 0;
// Last-seen DualSense button bytes. Idle defaults: byte 7 = 0x08 (D-pad
// released), bytes 8/9 = 0 (no shoulders, no PS/touchpad/mute).
static uint8_t prev_b7 = 0x08;
static uint8_t prev_b8 = 0x00;
static uint8_t prev_b9 = 0x00;

static void enter_state(wake_state_t s) {
    state = s;
    state_entered_us = time_us_64();
}

static void request_host_wake(void) {
    if (!wake_enabled) return;   // disabled via companion app: never wake the host
    bool ok = tud_remote_wakeup();
    // Linux/edge quirk: if we are suspended but TinyUSB refuses, force the DCD
    // wake signal directly.
    if (!ok && host_suspended) {
        dcd_remote_wakeup(0);
        ok = true;
    }
    if (ok) {
        critical_section_enter_blocking(&wake_cs);
        state = WAKE_REQUESTED;
        state_entered_us = time_us_64();
        critical_section_exit(&wake_cs);
    }
}

void wake_init(void) {
    critical_section_init(&wake_cs);
}

void wake_set_enabled(bool enabled) {
    wake_enabled = enabled;
}

bool wake_is_enabled(void) {
    return wake_enabled;
}

void wake_note_suspend(void) {
    host_suspended = true;
    host_resumed_event = false;
    // Re-arm on every genuine suspend so a previous hung attempt cannot wedge us.
    state = WAKE_PENDING_PRESS;
    state_entered_us = time_us_64();
    prev_b7 = 0x08; prev_b8 = 0x00; prev_b9 = 0x00;
    key_attempts = 0;
}

void wake_note_resume(void) {
    host_suspended = false;
    host_resumed_event = true;
}

void wake_on_bt_connect(void) {
    critical_section_enter_blocking(&wake_cs);
    const bool should_wake = host_suspended &&
        (state == WAKE_IDLE || state == WAKE_DONE || state == WAKE_PENDING_PRESS);
    critical_section_exit(&wake_cs);
    if (should_wake) {
        request_host_wake();
    }
}

void wake_on_bt_input(const uint8_t *report, uint16_t len) {
    if (len < 10) return;
    // DualSense report body (data+3 in on_bt_data): byte 7 = D-pad/face,
    // byte 8 = shoulders/share/options/L3/R3, byte 9 = PS/touchpad/mute.
    // Trigger on ANY change in those bytes -- after the BT radio leaves sniff
    // the first report is whichever button woke it; PS counts as "any" too.
    const uint8_t b7 = report[7];
    const uint8_t b8 = report[8];
    const uint8_t b9 = report[9];

    critical_section_enter_blocking(&wake_cs);
    const bool changed = (b7 != prev_b7) || (b8 != prev_b8) || (b9 != prev_b9);
    const bool armable = (state == WAKE_IDLE || state == WAKE_DONE || state == WAKE_PENDING_PRESS);
    prev_b7 = b7; prev_b8 = b8; prev_b9 = b9;
    critical_section_exit(&wake_cs);

    if (changed && armable) {
        request_host_wake();
    }
}

void wake_task(void) {
    const uint64_t now = time_us_64();

    critical_section_enter_blocking(&wake_cs);
    const wake_state_t s = state;
    const uint64_t entered = state_entered_us;
    critical_section_exit(&wake_cs);

    switch (s) {
        case WAKE_IDLE:
        case WAKE_PENDING_PRESS:
        case WAKE_DONE:
            return;

        case WAKE_REQUESTED: {
            if (host_resumed_event || !host_suspended) {
                host_resumed_event = false;
                if (now - entered < WAKE_SETTLE_US) return;
                if (!tud_hid_n_ready(WAKE_KBD_INSTANCE)) return;
                uint8_t rpt[8] = { 0, 0, WAKE_KEYCODE, 0, 0, 0, 0, 0 };
                if (tud_hid_n_report(WAKE_KBD_INSTANCE, 0, rpt, sizeof(rpt))) {
                    critical_section_enter_blocking(&wake_cs);
                    enter_state(WAKE_KEY_DOWN);
                    critical_section_exit(&wake_cs);
                }
            } else if (now - entered > WAKE_REQUEST_TIMEOUT_US) {
                critical_section_enter_blocking(&wake_cs);
                enter_state(WAKE_DONE);
                critical_section_exit(&wake_cs);
            }
            return;
        }

        case WAKE_KEY_DOWN: {
            if (now - entered < WAKE_KEY_HOLD_US) return;
            if (!tud_hid_n_ready(WAKE_KBD_INSTANCE)) return;
            uint8_t up[8] = { 0 };
            if (tud_hid_n_report(WAKE_KBD_INSTANCE, 0, up, sizeof(up))) {
                critical_section_enter_blocking(&wake_cs);
                enter_state(WAKE_KEY_UP_SENT);
                critical_section_exit(&wake_cs);
            }
            return;
        }

        case WAKE_KEY_UP_SENT: {
            if (now - entered < WAKE_KEY_UP_SETTLE_US) return;
            key_attempts++;
            if (key_attempts < WAKE_KEY_ATTEMPTS) {
                if (!tud_hid_n_ready(WAKE_KBD_INSTANCE)) return;
                uint8_t rpt[8] = { 0, 0, WAKE_KEYCODE, 0, 0, 0, 0, 0 };
                if (tud_hid_n_report(WAKE_KBD_INSTANCE, 0, rpt, sizeof(rpt))) {
                    critical_section_enter_blocking(&wake_cs);
                    enter_state(WAKE_KEY_DOWN);
                    critical_section_exit(&wake_cs);
                }
            } else {
                critical_section_enter_blocking(&wake_cs);
                enter_state(WAKE_DONE);
                key_attempts = 0;
                critical_section_exit(&wake_cs);
            }
            return;
        }
    }
}

#endif // ENABLE_WAKE_HID
