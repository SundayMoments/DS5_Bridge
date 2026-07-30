#include "firmware_log.h"

#include <cstdarg>
#include <cstdio>

#include "hardware/uart.h"
#include "hci_dump.h"
#include "pico/critical_section.h"

namespace {

bool firmware_log_ready = false;

#if DS5_DEBUG_LOGS_ENABLED
constexpr std::size_t kFirmwareLogRingSize = 8 * 1024;
alignas(4) uint8_t firmware_log_ring[kFirmwareLogRingSize]{};
critical_section_t firmware_log_ring_cs;
uint32_t firmware_log_write_sequence = 0;
uint32_t firmware_log_read_sequence = 0;
uint32_t firmware_log_dropped_bytes = 0;

void retain_log_bytes(const char *text, std::size_t length) {
    critical_section_enter_blocking(&firmware_log_ring_cs);
    for (std::size_t index = 0; index < length; index++) {
        if (firmware_log_write_sequence - firmware_log_read_sequence >= kFirmwareLogRingSize) {
            firmware_log_read_sequence++;
            firmware_log_dropped_bytes++;
        }
        firmware_log_ring[firmware_log_write_sequence % kFirmwareLogRingSize] =
            static_cast<uint8_t>(text[index]);
        firmware_log_write_sequence++;
    }
    critical_section_exit(&firmware_log_ring_cs);
}

void write_log_bytes(const char *text, int length) {
    if (!firmware_log_ready || text == nullptr || length <= 0) {
        return;
    }

    retain_log_bytes(text, static_cast<std::size_t>(length));

    // Keep the dedicated physical COM UART as the live diagnostic sink. The
    // companion report independently drains the retained SRAM copy.
    uart_write_blocking(
        uart_default,
        reinterpret_cast<const uint8_t *>(text),
        static_cast<size_t>(length)
    );
}

void firmware_log_hci_reset() {
}

void firmware_log_hci_packet(uint8_t, uint8_t, uint8_t *, uint16_t) {
    // Deliberately discard raw packets. They are high-volume and can contain
    // pairing material; only BTstack's formatted messages go to physical COM.
}

void firmware_log_hci_message(int log_level, const char *format, va_list args) {
    if (format == nullptr) {
        return;
    }
    const char *level = log_level == HCI_DUMP_LOG_LEVEL_ERROR
        ? "error"
        : (log_level == HCI_DUMP_LOG_LEVEL_INFO ? "info" : "debug");
    char line[256];
    const int prefix_length = std::snprintf(line, sizeof(line), "[BTstack:%s] ", level);
    if (prefix_length < 0 || prefix_length >= static_cast<int>(sizeof(line))) {
        return;
    }
    const int body_length = std::vsnprintf(
        line + prefix_length,
        sizeof(line) - static_cast<size_t>(prefix_length),
        format,
        args
    );
    if (body_length < 0) {
        return;
    }
    int captured = prefix_length + body_length;
    if (captured >= static_cast<int>(sizeof(line))) {
        captured = static_cast<int>(sizeof(line) - 1);
    }
    if (captured == 0 || line[captured - 1] != '\n') {
        if (captured < static_cast<int>(sizeof(line) - 1)) {
            line[captured++] = '\n';
        }
    }
    write_log_bytes(line, captured);
}

const hci_dump_t firmware_log_hci_dump = {
    firmware_log_hci_reset,
    firmware_log_hci_packet,
    firmware_log_hci_message
};
#endif

} // namespace

void firmware_log_init() {
    if (firmware_log_ready) {
        return;
    }

#if DS5_DEBUG_LOGS_ENABLED
    critical_section_init(&firmware_log_ring_cs);
#endif
    firmware_log_ready = true;
#if DS5_DEBUG_LOGS_ENABLED
    firmware_log_printf(
        "\n[FirmwareLog] physical UART and 8192-byte SRAM ring ready baud=921600\n"
    );
#endif
}

FirmwareLogReadResult firmware_log_read(uint8_t *destination, std::size_t capacity) {
#if DS5_DEBUG_LOGS_ENABLED
    FirmwareLogReadResult result{true, 0, 0, 0, 0};
    if (!firmware_log_ready || destination == nullptr || capacity == 0) {
        return result;
    }

    critical_section_enter_blocking(&firmware_log_ring_cs);
    result.sequence = firmware_log_read_sequence;
    result.next_sequence = firmware_log_write_sequence;
    result.dropped_bytes = firmware_log_dropped_bytes;
    const uint32_t available = firmware_log_write_sequence - firmware_log_read_sequence;
    result.length = available < capacity ? available : capacity;
    for (std::size_t index = 0; index < result.length; index++) {
        destination[index] = firmware_log_ring[
            (firmware_log_read_sequence + static_cast<uint32_t>(index)) % kFirmwareLogRingSize
        ];
    }
    firmware_log_read_sequence += static_cast<uint32_t>(result.length);
    critical_section_exit(&firmware_log_ring_cs);
    return result;
#else
    (void)destination;
    (void)capacity;
    return FirmwareLogReadResult{false, 0, 0, 0, 0};
#endif
}

#if DS5_DEBUG_LOGS_ENABLED
void firmware_log_printf(const char *format, ...) {
    if (format == nullptr) {
        return;
    }

    char line[256];
    va_list args;
    va_start(args, format);
    const int written = std::vsnprintf(line, sizeof(line), format, args);
    va_end(args);

    if (written > 0) {
        const int captured = written < static_cast<int>(sizeof(line))
            ? written
            : static_cast<int>(sizeof(line) - 1);
        write_log_bytes(line, captured);
    }
}

void firmware_log_hexdump(const void *data, std::size_t length) {
    if (data == nullptr || length == 0) {
        return;
    }

    constexpr std::size_t kBytesPerLine = 16;
    constexpr char kHexDigits[] = "0123456789abcdef";
    const auto *bytes = static_cast<const uint8_t *>(data);
    for (std::size_t offset = 0; offset < length; offset += kBytesPerLine) {
        char line[64];
        const int prefix_length = std::snprintf(
            line,
            sizeof(line),
            "[HEX %08lx]",
            static_cast<unsigned long>(offset)
        );
        if (prefix_length < 0 || prefix_length >= static_cast<int>(sizeof(line))) {
            return;
        }
        std::size_t used = static_cast<std::size_t>(prefix_length);
        const std::size_t remaining = length - offset;
        const std::size_t line_bytes = remaining < kBytesPerLine ? remaining : kBytesPerLine;
        for (std::size_t index = 0; index < line_bytes; index++) {
            const uint8_t value = bytes[offset + index];
            line[used++] = ' ';
            line[used++] = kHexDigits[value >> 4u];
            line[used++] = kHexDigits[value & 0x0fu];
        }
        line[used++] = '\n';
        write_log_bytes(line, static_cast<int>(used));
    }
}
#endif

void firmware_log_init_btstack_sink() {
#if DS5_DEBUG_LOGS_ENABLED
    hci_dump_init(&firmware_log_hci_dump);
    hci_dump_enable_packet_log(false);
    hci_dump_enable_log_level(HCI_DUMP_LOG_LEVEL_DEBUG, 0);
#endif
}

void firmware_log_flush_live() {
    // Direct physical-COM streaming has no buffered state to flush. The SRAM
    // ring is drained on demand through the companion feature report.
}
