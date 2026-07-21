//
// RAM-resident memory operations for the core-1 audio path.
//
// Adapted from the MIT-licensed awalol/DS5Dongle SRAM audio path. RP2350
// newlib memory operations execute from XIP flash; keeping these common
// operations in SRAM completes the steady-state core-1 dependency chain.
//

#include <stddef.h>
#include <stdint.h>

#include "pico.h"

void *__not_in_flash_func(memcpy)(void *restrict destination, const void *restrict source, size_t length) {
    uint8_t *dst = (uint8_t *)destination;
    const uint8_t *src = (const uint8_t *)source;

    if ((((uintptr_t)dst | (uintptr_t)src) & 3u) == 0u) {
        uint32_t *dst_words = (uint32_t *)dst;
        const uint32_t *src_words = (const uint32_t *)src;
        for (size_t words = length >> 2; words != 0; --words) {
            *dst_words++ = *src_words++;
        }
        dst = (uint8_t *)dst_words;
        src = (const uint8_t *)src_words;
        length &= 3u;
    }

    while (length-- != 0) {
        *dst++ = *src++;
    }
    return destination;
}

void *__not_in_flash_func(memset)(void *destination, int value, size_t length) {
    uint8_t *dst = (uint8_t *)destination;
    const uint8_t byte = (uint8_t)value;

    if (((uintptr_t)dst & 3u) == 0u) {
        const uint32_t word = (uint32_t)byte * 0x01010101u;
        uint32_t *dst_words = (uint32_t *)dst;
        for (size_t words = length >> 2; words != 0; --words) {
            *dst_words++ = word;
        }
        dst = (uint8_t *)dst_words;
        length &= 3u;
    }

    while (length-- != 0) {
        *dst++ = byte;
    }
    return destination;
}

void *__not_in_flash_func(memmove)(void *destination, const void *source, size_t length) {
    uint8_t *dst = (uint8_t *)destination;
    const uint8_t *src = (const uint8_t *)source;

    if (dst == src || length == 0u) {
        return destination;
    }

    if ((uintptr_t)dst < (uintptr_t)src) {
        if ((((uintptr_t)dst | (uintptr_t)src) & 3u) == 0u) {
            uint32_t *dst_words = (uint32_t *)dst;
            const uint32_t *src_words = (const uint32_t *)src;
            for (size_t words = length >> 2; words != 0; --words) {
                *dst_words++ = *src_words++;
            }
            dst = (uint8_t *)dst_words;
            src = (const uint8_t *)src_words;
            length &= 3u;
        }
        while (length-- != 0) {
            *dst++ = *src++;
        }
        return destination;
    }

    dst += length;
    src += length;
    while (length-- != 0) {
        *--dst = *--src;
    }
    return destination;
}
