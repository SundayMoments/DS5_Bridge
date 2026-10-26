#ifndef DS5_BRIDGE_BOOTLOADER_AUTHORIZATION_H
#define DS5_BRIDGE_BOOTLOADER_AUTHORIZATION_H

#include <cstdint>

// Ported from Kitsune Input's authenticated bootloader entry. The companion
// app enrolls a per-computer secret with the bridge once; every BOOTSEL entry
// then needs an HMAC over a fresh bridge challenge and a random face-button
// sequence entered on the connected controller.

namespace ds5::bootloader_authorization {

constexpr uint8_t kPersistentRecordVersion = 1;
constexpr uint8_t kReportSchemaVersion = 3;
constexpr uint8_t kKeyIdSize = 4;
constexpr uint8_t kSecretSize = 32;
constexpr uint8_t kNonceSize = 16;
constexpr uint8_t kTagSize = 32;
constexpr uint8_t kEnrollmentPayloadSize = kKeyIdSize + kSecretSize;
constexpr uint8_t kAuthenticatedPayloadSize = kKeyIdSize + 4 + kTagSize;
constexpr uint8_t kSequenceLength = 8;
constexpr uint8_t kFaceButtonCount = 4;
constexpr uint32_t kConfirmationTtlMs = 30'000;
constexpr uint32_t kPhysicalGrantTtlMs = 10'000;
constexpr uint32_t kChallengeTtlMs = 10'000;
constexpr uint32_t kFailureCooldownMs = 30'000;
constexpr uint8_t kFailuresBeforeCooldown = 3;

// Grants can sit untouched for days while the bridge stays powered. Absolute
// deadlines use the monotonic 64-bit clock so neither an expired grant nor the
// inactive zero deadline can become valid again at a 32-bit clock rollover.
constexpr bool before_deadline(uint64_t now_ms, uint64_t deadline_ms) {
    return now_ms < deadline_ms;
}

enum class PhysicalConfirmationPurpose : uint8_t {
    None,
    Enrollment,
    BootloaderEntry,
};

struct PersistentRecord {
    uint8_t version = kPersistentRecordVersion;
    uint8_t key_id[kKeyIdSize]{};
    uint8_t secret[kSecretSize]{};
};

struct State {
    PersistentRecord active{};
    PersistentRecord pending{};
    bool authorized = false;
    bool enrollment_pending = false;
    PhysicalConfirmationPurpose physical_confirmation_purpose = PhysicalConfirmationPurpose::None;
    bool physical_confirmation_confirmed = false;
    uint64_t physical_confirmation_expires_at_ms = 0;
    uint8_t physical_confirmation_sequence[kSequenceLength]{};
    uint8_t physical_confirmation_progress = 0;
    uint8_t physical_confirmation_mistakes = 0;
    bool challenge_active = false;
    uint8_t nonce[kNonceSize]{};
    uint32_t challenge_id = 0;
    uint64_t challenge_expires_at_ms = 0;
    uint8_t consecutive_failures = 0;
    uint64_t cooldown_expires_at_ms = 0;
};

} // namespace ds5::bootloader_authorization

#endif // DS5_BRIDGE_BOOTLOADER_AUTHORIZATION_H
