#include "firmware_log.h"

#include <cstdarg>
#include <cstdio>
#include <cstring>

#include "hardware/uart.h"
#include "hci_dump.h"
#include "pico/critical_section.h"
#include "pico/platform/sections.h"
#include "pico/rand.h"

namespace {

critical_section_t firmware_log_cs;
bool firmware_log_ready = false;

#if DS5_DEBUG_LOGS_ENABLED
// Retain only the recent diagnostic tail across watchdog/software resets.
// UART streams the complete live history to the persistent PC collector. The
// 8 KiB size matches Kitsune Input's RAM-safe revision; its earlier 32 KiB
// buffer left too little heap for audio and Bluetooth diagnostic builds.
constexpr uint32_t kFirmwareLogRingSize = 8u * 1024u;
constexpr uint32_t kFirmwareLogMetadataMagic = 0x444c4f47u; // "DLOG"
constexpr uint16_t kFirmwareLogMetadataVersion = 1;

struct FirmwareLogMetadata {
    uint32_t magic;
    uint16_t version;
    uint16_t size;
    uint32_t capacity;
    uint32_t generation;
    uint32_t tail;
    uint32_t count;
    uint32_t sequence;
    uint32_t stream_id;
    uint32_t dropped_count;
    uint32_t boot_count;
    uint32_t checksum;
};

struct FirmwareLogRetainedState {
    FirmwareLogMetadata metadata[2];
    char ring[kFirmwareLogRingSize];
};

static FirmwareLogRetainedState __uninitialized_ram(firmware_log_retained);

uint32_t firmware_log_tail = 0;
uint32_t firmware_log_count = 0;
uint32_t firmware_log_sequence = 0;
uint32_t firmware_log_stream_id = 0;
uint32_t firmware_log_dropped_count = 0;
uint32_t firmware_log_boot_count = 0;
uint32_t firmware_log_metadata_generation = 0;
uint8_t firmware_log_active_metadata = 1;
uint32_t firmware_log_uart_cursor = 0;

uint32_t checksum_mix_u32(uint32_t hash, uint32_t value) {
    for (uint8_t shift = 0; shift < 32; shift += 8) {
        hash ^= static_cast<uint8_t>(value >> shift);
        hash *= 16777619u;
    }
    return hash;
}

uint32_t firmware_log_metadata_checksum(FirmwareLogMetadata const &metadata) {
    uint32_t hash = 2166136261u;
    hash = checksum_mix_u32(hash, metadata.version);
    hash = checksum_mix_u32(hash, metadata.size);
    hash = checksum_mix_u32(hash, metadata.capacity);
    hash = checksum_mix_u32(hash, metadata.generation);
    hash = checksum_mix_u32(hash, metadata.tail);
    hash = checksum_mix_u32(hash, metadata.count);
    hash = checksum_mix_u32(hash, metadata.sequence);
    hash = checksum_mix_u32(hash, metadata.stream_id);
    hash = checksum_mix_u32(hash, metadata.dropped_count);
    hash = checksum_mix_u32(hash, metadata.boot_count);
    return hash;
}

bool firmware_log_metadata_valid(FirmwareLogMetadata const &metadata) {
    return metadata.magic == kFirmwareLogMetadataMagic
        && metadata.version == kFirmwareLogMetadataVersion
        && metadata.size == sizeof(FirmwareLogMetadata)
        && metadata.capacity == kFirmwareLogRingSize
        && metadata.tail < kFirmwareLogRingSize
        && metadata.count <= kFirmwareLogRingSize
        && metadata.stream_id != 0
        && metadata.checksum == firmware_log_metadata_checksum(metadata);
}

bool firmware_log_generation_newer(uint32_t candidate, uint32_t baseline) {
    return static_cast<int32_t>(candidate - baseline) > 0;
}

void firmware_log_commit_metadata_locked() {
    const uint8_t next_slot = firmware_log_active_metadata ^ 1u;
    FirmwareLogMetadata &metadata = firmware_log_retained.metadata[next_slot];

    // Alternating slots guarantee that a watchdog reset during this commit
    // leaves the previous complete header available. Publish magic last.
    metadata.magic = 0;
    metadata.version = kFirmwareLogMetadataVersion;
    metadata.size = sizeof(FirmwareLogMetadata);
    metadata.capacity = kFirmwareLogRingSize;
    metadata.generation = firmware_log_metadata_generation + 1u;
    metadata.tail = firmware_log_tail;
    metadata.count = firmware_log_count;
    metadata.sequence = firmware_log_sequence;
    metadata.stream_id = firmware_log_stream_id;
    metadata.dropped_count = firmware_log_dropped_count;
    metadata.boot_count = firmware_log_boot_count;
    metadata.checksum = firmware_log_metadata_checksum(metadata);
    __asm volatile("" ::: "memory");
    metadata.magic = kFirmwareLogMetadataMagic;
    __asm volatile("" ::: "memory");

    firmware_log_metadata_generation = metadata.generation;
    firmware_log_active_metadata = next_slot;
}

uint32_t generate_firmware_log_stream_id() {
    uint32_t stream_id = 0;
    while (stream_id == 0) {
        stream_id = get_rand_32();
    }
    return stream_id;
}

void append_log_bytes(const char *text, int length) {
    if (!firmware_log_ready || text == nullptr || length <= 0) {
        return;
    }

    critical_section_enter_blocking(&firmware_log_cs);
    for (int index = 0; index < length; ++index) {
        const uint32_t head =
            (firmware_log_tail + firmware_log_count) % kFirmwareLogRingSize;
        firmware_log_retained.ring[head] = text[index];
        if (firmware_log_count < kFirmwareLogRingSize) {
            ++firmware_log_count;
        } else {
            firmware_log_tail =
                (firmware_log_tail + 1u) % kFirmwareLogRingSize;
            ++firmware_log_dropped_count;
        }
        ++firmware_log_sequence;
    }
    firmware_log_commit_metadata_locked();
    critical_section_exit(&firmware_log_cs);
}

uint16_t copy_live_bytes_locked(
    uint32_t &cursor,
    uint8_t *destination,
    uint16_t max_length
) {
    const uint32_t oldest_sequence =
        firmware_log_sequence - firmware_log_count;
    uint32_t offset = cursor - oldest_sequence;
    if (offset > firmware_log_count) {
        // This sink fell behind a rolling overwrite or firmware restored a
        // retained tail. Resume from the oldest byte that still exists.
        cursor = oldest_sequence;
        offset = 0;
    }
    const uint32_t available = firmware_log_count - offset;
    const uint16_t copy_length = static_cast<uint16_t>(
        available < max_length ? available : max_length
    );
    for (uint16_t index = 0; index < copy_length; ++index) {
        destination[index] = static_cast<uint8_t>(
            firmware_log_retained.ring[
                (firmware_log_tail + offset + index) % kFirmwareLogRingSize
            ]
        );
    }
    return copy_length;
}

void firmware_log_hci_reset() {
}

void firmware_log_hci_packet(uint8_t, uint8_t, uint8_t *, uint16_t) {
    // Raw HCI packets are high-volume and can contain pairing material.
    // Retain only BTstack's formatted info/error messages.
}

void firmware_log_hci_message(
    int log_level,
    const char *format,
    va_list args
) {
    if (format == nullptr) {
        return;
    }

    const char *level = log_level == HCI_DUMP_LOG_LEVEL_ERROR
        ? "error"
        : (log_level == HCI_DUMP_LOG_LEVEL_INFO ? "info" : "debug");
    char line[256];
    const int prefix_length =
        std::snprintf(line, sizeof(line), "[BTstack:%s] ", level);
    if (
        prefix_length < 0
        || prefix_length >= static_cast<int>(sizeof(line))
    ) {
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
    append_log_bytes(line, captured);
}

const hci_dump_t firmware_log_hci_dump = {
    firmware_log_hci_reset,
    firmware_log_hci_packet,
    firmware_log_hci_message,
};
#endif

} // namespace

void firmware_log_init() {
    if (firmware_log_ready) {
        return;
    }

    critical_section_init(&firmware_log_cs);
#if DS5_DEBUG_LOGS_ENABLED
    const bool metadata0_valid =
        firmware_log_metadata_valid(firmware_log_retained.metadata[0]);
    const bool metadata1_valid =
        firmware_log_metadata_valid(firmware_log_retained.metadata[1]);
    const bool retained = metadata0_valid || metadata1_valid;
    if (retained) {
        firmware_log_active_metadata = metadata1_valid
            && (
                !metadata0_valid
                || firmware_log_generation_newer(
                    firmware_log_retained.metadata[1].generation,
                    firmware_log_retained.metadata[0].generation
                )
            )
            ? 1u
            : 0u;
        FirmwareLogMetadata const &metadata =
            firmware_log_retained.metadata[firmware_log_active_metadata];
        firmware_log_tail = metadata.tail;
        firmware_log_count = metadata.count;
        firmware_log_sequence = metadata.sequence;
        firmware_log_stream_id = metadata.stream_id;
        firmware_log_dropped_count = metadata.dropped_count;
        firmware_log_boot_count = metadata.boot_count;
        firmware_log_metadata_generation = metadata.generation;
    } else {
        std::memset(
            &firmware_log_retained,
            0,
            sizeof(firmware_log_retained)
        );
        firmware_log_tail = 0;
        firmware_log_count = 0;
        firmware_log_sequence = 0;
        firmware_log_stream_id = generate_firmware_log_stream_id();
        firmware_log_dropped_count = 0;
        firmware_log_boot_count = 0;
        firmware_log_metadata_generation = 0;
        firmware_log_active_metadata = 1;
    }
    ++firmware_log_boot_count;
    firmware_log_uart_cursor =
        firmware_log_sequence - firmware_log_count;
#endif
    firmware_log_ready = true;

#if DS5_DEBUG_LOGS_ENABLED
    char boot_marker[192];
    const int marker_length = std::snprintf(
        boot_marker,
        sizeof(boot_marker),
        "\n[FirmwareLog] boot=%lu retained=%u stream=%08lx bytes=%lu "
        "sequence=%lu dropped=%lu capacity=%lu\n",
        static_cast<unsigned long>(firmware_log_boot_count),
        retained ? 1u : 0u,
        static_cast<unsigned long>(firmware_log_stream_id),
        static_cast<unsigned long>(firmware_log_count),
        static_cast<unsigned long>(firmware_log_sequence),
        static_cast<unsigned long>(firmware_log_dropped_count),
        static_cast<unsigned long>(kFirmwareLogRingSize)
    );
    if (marker_length > 0) {
        append_log_bytes(
            boot_marker,
            marker_length < static_cast<int>(sizeof(boot_marker))
                ? marker_length
                : static_cast<int>(sizeof(boot_marker) - 1)
        );
    }
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
        append_log_bytes(line, captured);
    }
}

void firmware_log_hexdump(const void *data, std::size_t length) {
    if (data == nullptr || length == 0) {
        return;
    }

    constexpr std::size_t kBytesPerLine = 16;
    constexpr char kHexDigits[] = "0123456789abcdef";
    const auto *bytes = static_cast<const uint8_t *>(data);
    for (
        std::size_t offset = 0;
        offset < length;
        offset += kBytesPerLine
    ) {
        // A complete line is at most 63 bytes. Formatting stays local and the
        // retained logger is the only sink, so this never waits on UART.
        char line[64];
        const int prefix_length = std::snprintf(
            line,
            sizeof(line),
            "[HEX %08lx]",
            static_cast<unsigned long>(offset)
        );
        if (
            prefix_length < 0
            || prefix_length >= static_cast<int>(sizeof(line))
        ) {
            return;
        }
        std::size_t used = static_cast<std::size_t>(prefix_length);
        const std::size_t remaining = length - offset;
        const std::size_t line_bytes =
            remaining < kBytesPerLine ? remaining : kBytesPerLine;
        for (std::size_t index = 0; index < line_bytes; ++index) {
            const uint8_t value = bytes[offset + index];
            line[used++] = ' ';
            line[used++] = kHexDigits[value >> 4u];
            line[used++] = kHexDigits[value & 0x0fu];
        }
        line[used++] = '\n';
        append_log_bytes(line, static_cast<int>(used));
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
#if DS5_DEBUG_LOGS_ENABLED
    // Do not write diagnostics from Bluetooth callbacks. A main-loop pass
    // fills only currently available UART FIFO space and never waits.
    uint8_t buffer[128];
    if (!uart_is_writable(uart_default)) {
        return;
    }

    uint16_t copied = 0;
    critical_section_enter_blocking(&firmware_log_cs);
    copied = copy_live_bytes_locked(
        firmware_log_uart_cursor,
        buffer,
        sizeof(buffer)
    );
    critical_section_exit(&firmware_log_cs);

    uint16_t written = 0;
    while (written < copied && uart_is_writable(uart_default)) {
        uart_putc_raw(
            uart_default,
            static_cast<char>(buffer[written++])
        );
    }
    firmware_log_uart_cursor += written;
#endif
}
