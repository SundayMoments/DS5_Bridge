#ifndef DS5_BRIDGE_FIRMWARE_LOG_H
#define DS5_BRIDGE_FIRMWARE_LOG_H

#include <cstddef>
#include <cstdint>

#include "debug_config.h"

void firmware_log_init();
void firmware_log_init_btstack_sink();
void firmware_log_flush_live();

struct FirmwareLogReadResult {
    bool enabled;
    uint32_t sequence;
    uint32_t next_sequence;
    uint32_t dropped_bytes;
    std::size_t length;
};

FirmwareLogReadResult firmware_log_read(uint8_t *destination, std::size_t capacity);

#if DS5_DEBUG_LOGS_ENABLED
void firmware_log_printf(const char *format, ...);
void firmware_log_hexdump(const void *data, std::size_t length);
#else
static inline void firmware_log_printf(const char *, ...) {
}
static inline void firmware_log_hexdump(const void *, std::size_t) {
}
#endif

#endif // DS5_BRIDGE_FIRMWARE_LOG_H
