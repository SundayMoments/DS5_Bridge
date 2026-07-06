/**
 * Copyright (c) 2020 Raspberry Pi (Trading) Ltd.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 */

#if !PICO_NO_FLASH && !PICO_COPY_TO_RAM
#error "This utility must be built to run from SRAM."
#endif

#include "hardware/flash.h"
#include "pico/bootrom.h"
#include "pico/stdlib.h"

void flash_do_cmd(const uint8_t *txbuf, uint8_t *rxbuf, size_t count);

int main() {
    uint8_t txbuf[4] = {0};
    uint8_t rxbuf[4] = {0};
    txbuf[0] = 0x9f;

    flash_do_cmd(txbuf, rxbuf, 4);
    const uint flash_size_bytes = 1u << rxbuf[3];

    flash_range_erase(0, flash_size_bytes);

    static const uint8_t eyecatcher[FLASH_PAGE_SIZE] = "NUKE";
    flash_range_program(0, eyecatcher, FLASH_PAGE_SIZE);

#ifdef PICO_DEFAULT_LED_PIN
    gpio_init(PICO_DEFAULT_LED_PIN);
    gpio_set_dir(PICO_DEFAULT_LED_PIN, GPIO_OUT);
    for (int i = 0; i < 3; ++i) {
        gpio_put(PICO_DEFAULT_LED_PIN, 1);
        sleep_ms(100);
        gpio_put(PICO_DEFAULT_LED_PIN, 0);
        sleep_ms(100);
    }
#endif

    reset_usb_boot(0, 0);
}
