//
// BOOTSEL button gestures.
//

#include "button_functions.h"

#include <cstdint>

#include "utils.h"

#include "hardware/gpio.h"
#include "hardware/structs/ioqspi.h"
#include "hardware/structs/sio.h"
#include "hardware/sync.h"
#if PICO_RP2350
#include "hardware/regs/sio.h"
#endif
#include "pico/bootrom.h"
#include "pico/flash.h"
#include "pico/time.h"

// Gesture thresholds, in samples at the 100 ms poll cadence.
static constexpr uint32_t BUTTON_POLL_INTERVAL_MS = 100;
static constexpr int CLICK_WINDOW_SAMPLES = 5;      // ~500 ms allowed between clicks.
static constexpr int LONG_PRESS_IGNORE_SAMPLES = 15; // Ignore holds instead of treating them as clicks.

enum class ButtonState : uint8_t {
    Idle,
    Pressing,
    IgnoringHold,
    WaitingForNextClick,
};

static ButtonState button_state = ButtonState::Idle;
static int button_press_samples = 0;
static int button_wait_samples = 0;
static int button_click_count = 0;
static uint32_t button_last_check_ms = 0;

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

static bool button_read_bootsel() {
    bool pressed = false;
    const int rc = flash_safe_execute(button_read_cb, &pressed, 100);
    if (rc != PICO_OK) {
        return false;
    }
    return pressed;
}

static void button_dispatch(const int clicks) {
    if (clicks < 3) {
        return;
    }

    DS5_LOG("[BTN] BOOTSEL triple click - reboot to BOOTSEL\n");
    reset_usb_boot(0, 0);
    while (true) {
        tight_loop_contents();
    }
}

void button_check() {
    const uint32_t now = to_ms_since_boot(get_absolute_time());
    if (static_cast<uint32_t>(now - button_last_check_ms) < BUTTON_POLL_INTERVAL_MS) {
        return;
    }
    button_last_check_ms = now;

    const bool pressed = button_read_bootsel();

    switch (button_state) {
        case ButtonState::Idle:
            if (pressed) {
                button_state = ButtonState::Pressing;
                button_press_samples = 1;
            }
            break;

        case ButtonState::Pressing:
            if (pressed) {
                if (++button_press_samples >= LONG_PRESS_IGNORE_SAMPLES) {
                    button_click_count = 0;
                    button_state = ButtonState::IgnoringHold;
                }
            } else {
                button_click_count++;
                button_state = ButtonState::WaitingForNextClick;
                button_wait_samples = 0;
            }
            break;

        case ButtonState::IgnoringHold:
            if (!pressed) {
                button_state = ButtonState::Idle;
                button_press_samples = 0;
                button_wait_samples = 0;
                button_click_count = 0;
            }
            break;

        case ButtonState::WaitingForNextClick:
            if (pressed) {
                button_state = ButtonState::Pressing;
                button_press_samples = 1;
            } else if (++button_wait_samples >= CLICK_WINDOW_SAMPLES) {
                const int clicks = button_click_count;
                button_click_count = 0;
                button_state = ButtonState::Idle;
                button_press_samples = 0;
                button_wait_samples = 0;
                button_dispatch(clicks);
            }
            break;
    }
}
