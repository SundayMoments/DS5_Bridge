//
// BOOTSEL button gestures.
//

#include "button_functions.h"

#include <algorithm>
#include <cstdint>

#include "bt.h"
#include "kitsune_button_gesture.h"
#include "utils.h"

#include "hardware/gpio.h"
#include "hardware/structs/ioqspi.h"
#include "hardware/structs/sio.h"
#include "hardware/sync.h"
#include "hardware/watchdog.h"
#if PICO_RP2350
#include "hardware/regs/sio.h"
#endif
#include "pico/bootrom.h"
#include "pico/flash.h"
#include "pico/time.h"

// Gesture thresholds, in samples at the 100 ms poll cadence.
static constexpr uint32_t BUTTON_POLL_INTERVAL_MS = 100;
static constexpr uint32_t BUTTON_FLASH_SAFE_TIMEOUT_MS = 100;
#if DS5_DEBUG_LOGS_ENABLED
static constexpr uint32_t BUTTON_DIAGNOSTIC_INTERVAL_MS = 5000;
#endif
static kitsune::ButtonGesture button_gesture({
    5,  // ~500 ms max press for a click.
    10, // ~1000 ms allowed between clicks before a single click dispatches.
    15, // ~1500 ms hold threshold.
});
static uint32_t button_last_check_ms = 0;
#if DS5_DEBUG_LOGS_ENABLED
static uint32_t button_sample_count = 0;
static uint32_t button_sample_failures = 0;
static uint32_t button_sample_last_us = 0;
static uint32_t button_sample_max_us = 0;
static uint32_t button_diagnostic_last_ms = 0;
#endif

static void __no_inline_not_in_flash_func(button_read_cb)(void *param) {
    bool *pressed = static_cast<bool *>(param);
    constexpr uint CS_PIN_INDEX = 1;

    hw_write_masked(
        &ioqspi_hw->io[CS_PIN_INDEX].ctrl,
        GPIO_OVERRIDE_LOW << IO_QSPI_GPIO_QSPI_SS_CTRL_OEOVER_LSB,
        IO_QSPI_GPIO_QSPI_SS_CTRL_OEOVER_BITS
    );

    for (int i = 0; i < 1000; ++i) {
        __asm volatile("nop");
    }

#if PICO_RP2350
    *pressed = !(sio_hw->gpio_hi_in & SIO_GPIO_HI_IN_QSPI_CSN_BITS);
#else
    *pressed = !(sio_hw->gpio_hi_in & (1u << CS_PIN_INDEX));
#endif

    hw_write_masked(
        &ioqspi_hw->io[CS_PIN_INDEX].ctrl,
        GPIO_OVERRIDE_NORMAL << IO_QSPI_GPIO_QSPI_SS_CTRL_OEOVER_LSB,
        IO_QSPI_GPIO_QSPI_SS_CTRL_OEOVER_BITS
    );
}

static bool button_read_bootsel(bool &pressed) {
    return flash_safe_execute(
        button_read_cb,
        &pressed,
        BUTTON_FLASH_SAFE_TIMEOUT_MS
    ) == PICO_OK;
}

static void button_dispatch(kitsune::ButtonGestureEvent event) {
    switch (event) {
        case kitsune::ButtonGestureEvent::Click:
            if (bt_is_controller_connected()) {
                DS5_LOG("[BTN] BOOTSEL click - disconnect controller and preserve pairing\n");
                (void)bt_disconnect_with_intent(BtControllerDisconnectIntentSleep);
                return;
            }
            DS5_LOG("[BTN] BOOTSEL click - request controller scan\n");
            (void)bt_request_scan();
            return;

        case kitsune::ButtonGestureEvent::DoubleClick:
            DS5_LOG("[BTN] BOOTSEL double click - reboot\n");
            watchdog_reboot(0, 0, 0);
            while (true) {
                tight_loop_contents();
            }

        case kitsune::ButtonGestureEvent::TripleClick:
            DS5_LOG("[BTN] BOOTSEL triple click - reboot to BOOTSEL\n");
            reset_usb_boot(0, 0);
            while (true) {
                tight_loop_contents();
            }

        case kitsune::ButtonGestureEvent::Hold:
            DS5_LOG("[BTN] BOOTSEL hold - forget controller pairings\n");
            (void)bt_forget_pairings();
            return;

        default:
            return;
    }
}

void button_check() {
    const uint32_t now = to_ms_since_boot(get_absolute_time());
    if (static_cast<uint32_t>(now - button_last_check_ms) < BUTTON_POLL_INTERVAL_MS) {
        return;
    }
    button_last_check_ms = now;

    bool pressed = false;
#if DS5_DEBUG_LOGS_ENABLED
    const uint32_t sample_started_us = time_us_32();
#endif
    const bool sample_succeeded = button_read_bootsel(pressed);
#if DS5_DEBUG_LOGS_ENABLED
    button_sample_last_us = static_cast<uint32_t>(time_us_32() - sample_started_us);
    button_sample_max_us = std::max(button_sample_max_us, button_sample_last_us);
    button_sample_count++;
    if (!sample_succeeded) {
        button_sample_failures++;
    }
    if (
        button_diagnostic_last_ms == 0
        || static_cast<uint32_t>(now - button_diagnostic_last_ms)
            >= BUTTON_DIAGNOSTIC_INTERVAL_MS
    ) {
        button_diagnostic_last_ms = now;
        DS5_LOG(
            "[BTN] sampler samples=%lu failures=%lu last_us=%lu max_us=%lu\n",
            static_cast<unsigned long>(button_sample_count),
            static_cast<unsigned long>(button_sample_failures),
            static_cast<unsigned long>(button_sample_last_us),
            static_cast<unsigned long>(button_sample_max_us)
        );
    }
#endif
    if (!sample_succeeded) {
        // Failure to park the other core is not a physical button release.
        // Preserve the gesture and retry on the next sample boundary.
        return;
    }
    button_dispatch(button_gesture.update(pressed));
}
