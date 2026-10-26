#ifndef DS5_TEST_STUB_PICO_H
#define DS5_TEST_STUB_PICO_H

// Host builds compile src/ram_mem.c under renamed symbols; placement
// attributes have no meaning there.
#define __not_in_flash_func(name) name
#if defined(_MSC_VER) && !defined(__clang__)
#define __attribute__(attributes)
#endif

#endif
