#include "bootloader_authorization_flash.h"

#include <array>
#include <cstddef>
#include <cstring>

#include "hardware/flash.h"
#include "hardware/regs/addressmap.h"
#include "hardware/watchdog.h"
#include "pico/btstack_flash_bank.h"
#include "pico/flash.h"
#include "pico/platform.h"
#include "utils.h"

// Ported from Kitsune Input's bootloader authorization storage.

extern "C" char __flash_binary_end;

namespace {

using ds5::bootloader_authorization::PersistentRecord;

constexpr uint32_t kFlashMagic = 0x31424244u; // 'DBB1'
constexpr uint16_t kFlashFormat = 1;
constexpr uint32_t kCrcSeed = 0x44533542u; // 'DS5B'
constexpr uint32_t kFlashOffset = PICO_FLASH_BANK_STORAGE_OFFSET - FLASH_SECTOR_SIZE;
constexpr uint32_t kFlashLockoutTimeoutMs = 500;

struct FlashEnvelope {
    uint32_t magic = kFlashMagic;
    uint16_t format = kFlashFormat;
    uint16_t record_size = sizeof(PersistentRecord);
    PersistentRecord record{};
    uint32_t checksum = 0;
};

struct FlashMutation {
    bool erase_only = false;
    alignas(4) std::array<uint8_t, FLASH_PAGE_SIZE> page{};
};

static_assert(PICO_FLASH_BANK_STORAGE_OFFSET >= FLASH_SECTOR_SIZE);
static_assert(sizeof(FlashEnvelope) <= FLASH_PAGE_SIZE);

uintptr_t flash_read_base() {
#if PICO_RP2040
    return XIP_BASE;
#else
    // Bypass the XIP cache so a just-written record reads back from flash.
    return XIP_NOCACHE_NOALLOC_NOTRANSLATE_BASE;
#endif
}

// The sector must lie past the end of the firmware image.
bool flash_region_available() {
    const uintptr_t binary_end_offset = reinterpret_cast<uintptr_t>(&__flash_binary_end) - XIP_BASE;
    return binary_end_offset <= kFlashOffset;
}

uint32_t envelope_checksum(FlashEnvelope const &envelope) {
    return crc32_seeded(
        reinterpret_cast<uint8_t const *>(&envelope),
        offsetof(FlashEnvelope, checksum),
        kCrcSeed
    );
}

void __no_inline_not_in_flash_func(flash_mutate)(void *context) {
    auto &mutation = *static_cast<FlashMutation *>(context);
    flash_range_erase(kFlashOffset, FLASH_SECTOR_SIZE);
    if (!mutation.erase_only) {
        flash_range_program(kFlashOffset, mutation.page.data(), mutation.page.size());
    }
}

bool apply_flash_mutation(FlashEnvelope const *envelope) {
    if (!flash_region_available()) {
        return false;
    }
    static FlashMutation mutation{};
    mutation.erase_only = envelope == nullptr;
    mutation.page.fill(0xff);
    if (envelope != nullptr) {
        std::memcpy(mutation.page.data(), envelope, sizeof(*envelope));
    }
    // A sector erase and one page program stay well inside the 1 s watchdog.
    watchdog_update();
    const int result = flash_safe_execute(flash_mutate, &mutation, kFlashLockoutTimeoutMs);
    watchdog_update();
    return result == PICO_OK;
}

} // namespace

bool bootloader_authorization_flash_load(PersistentRecord *record) {
    if (record == nullptr || !flash_region_available()) {
        return false;
    }
    FlashEnvelope envelope{};
    std::memcpy(
        &envelope,
        reinterpret_cast<uint8_t const *>(flash_read_base() + kFlashOffset),
        sizeof(envelope)
    );
    if (
        envelope.magic != kFlashMagic
        || envelope.format != kFlashFormat
        || envelope.record_size != sizeof(PersistentRecord)
        || envelope.record.version != ds5::bootloader_authorization::kPersistentRecordVersion
        || envelope.checksum != envelope_checksum(envelope)
    ) {
        return false;
    }
    *record = envelope.record;
    return true;
}

bool bootloader_authorization_flash_store(PersistentRecord const *record) {
    if (record == nullptr || record->version != ds5::bootloader_authorization::kPersistentRecordVersion) {
        return false;
    }
    FlashEnvelope envelope{};
    envelope.record = *record;
    envelope.checksum = envelope_checksum(envelope);
    if (!apply_flash_mutation(&envelope)) {
        return false;
    }
    PersistentRecord verified{};
    return bootloader_authorization_flash_load(&verified)
        && std::memcmp(&verified, record, sizeof(verified)) == 0;
}

bool bootloader_authorization_flash_erase() {
    if (!apply_flash_mutation(nullptr)) {
        return false;
    }
    PersistentRecord erased{};
    return !bootloader_authorization_flash_load(&erased);
}
