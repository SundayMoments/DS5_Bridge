#include "bootloader_maintenance.h"

#include <array>
#include <cstring>

namespace ds5::bootloader_maintenance {

namespace {

using bootloader_authorization::PersistentRecord;
using bootloader_authorization::PhysicalConfirmationPurpose;
using bootloader_authorization::State;
using bootloader_authorization::before_deadline;

// Domain separation for the HMAC; the companion app uses the same 16 bytes.
constexpr std::array<uint8_t, 16> kAuthDomain{
    'D', 'S', '5', 'B', 'R', 'I', 'D', 'G', 'E', '-', 'B', 'O', 'O', 'T', '1', 0,
};

bool bytes_have_nonzero(uint8_t const *data, uint16_t size) {
    uint8_t combined = 0;
    for (uint16_t index = 0; index < size; ++index) {
        combined = static_cast<uint8_t>(combined | data[index]);
    }
    return combined != 0;
}

bool constant_time_equal(uint8_t const *left, uint8_t const *right, uint16_t size) {
    uint8_t difference = 0;
    for (uint16_t index = 0; index < size; ++index) {
        difference = static_cast<uint8_t>(difference | (left[index] ^ right[index]));
    }
    return difference == 0;
}

void write_u32_le(uint8_t *output, uint32_t value) {
    output[0] = static_cast<uint8_t>(value & 0xffu);
    output[1] = static_cast<uint8_t>((value >> 8u) & 0xffu);
    output[2] = static_cast<uint8_t>((value >> 16u) & 0xffu);
    output[3] = static_cast<uint8_t>((value >> 24u) & 0xffu);
}

uint32_t read_u32_le(uint8_t const *input) {
    return static_cast<uint32_t>(input[0])
        | (static_cast<uint32_t>(input[1]) << 8u)
        | (static_cast<uint32_t>(input[2]) << 16u)
        | (static_cast<uint32_t>(input[3]) << 24u);
}

void clear_challenge(State &state) {
    state.challenge_active = false;
    std::memset(state.nonce, 0, sizeof(state.nonce));
    state.challenge_expires_at_ms = 0;
}

void clear_physical_confirmation(State &state) {
    state.physical_confirmation_purpose = PhysicalConfirmationPurpose::None;
    state.physical_confirmation_confirmed = false;
    state.physical_confirmation_expires_at_ms = 0;
    std::memset(state.physical_confirmation_sequence, 0, sizeof(state.physical_confirmation_sequence));
    state.physical_confirmation_progress = 0;
    state.physical_confirmation_mistakes = 0;
}

void clear_enrollment(State &state) {
    state.pending = {};
    state.enrollment_pending = false;
    if (state.physical_confirmation_purpose == PhysicalConfirmationPurpose::Enrollment) {
        clear_physical_confirmation(state);
    }
}

bool start_physical_confirmation(Context const &context, PhysicalConfirmationPurpose purpose) {
    auto &state = *context.state;
    std::array<uint8_t, bootloader_authorization::kSequenceLength> random{};
    if (!context.ports.random_bytes(random.data(), static_cast<uint16_t>(random.size()))) {
        clear_physical_confirmation(state);
        return false;
    }
    clear_physical_confirmation(state);
    state.physical_confirmation_purpose = purpose;
    state.physical_confirmation_expires_at_ms =
        context.ports.now_ms() + bootloader_authorization::kConfirmationTtlMs;
    for (uint8_t index = 0; index < random.size(); ++index) {
        uint8_t button = static_cast<uint8_t>(random[index] % bootloader_authorization::kFaceButtonCount);
        // Never repeat a button back to back, so each step is a distinct press.
        if (index > 0 && button == state.physical_confirmation_sequence[index - 1]) {
            button = static_cast<uint8_t>(
                (button + 1 + ((random[index] >> 2u) % 3u)) % bootloader_authorization::kFaceButtonCount
            );
        }
        state.physical_confirmation_sequence[index] = button;
    }
    return true;
}

bool ports_complete(Ports const &ports) {
    return ports.controller_connected != nullptr
        && ports.now_ms != nullptr
        && ports.random_bytes != nullptr
        && ports.hmac_sha256 != nullptr
        && ports.read_unique_id != nullptr
        && ports.store_record != nullptr
        && ports.erase_record != nullptr;
}

bool record_valid(PersistentRecord const &record) {
    return record.version == bootloader_authorization::kPersistentRecordVersion
        && bytes_have_nonzero(record.key_id, sizeof(record.key_id))
        && bytes_have_nonzero(record.secret, sizeof(record.secret));
}

void note_authentication_failure(State &state, uint64_t now) {
    if (state.consecutive_failures < 0xff) {
        ++state.consecutive_failures;
    }
    if (state.consecutive_failures >= bootloader_authorization::kFailuresBeforeCooldown) {
        state.consecutive_failures = 0;
        state.cooldown_expires_at_ms = now + bootloader_authorization::kFailureCooldownMs;
    }
}

// Verifies the HMAC over the current challenge and consumes the challenge, so
// each challenge authorizes exactly one command.
uint8_t authenticate(Context const &context, Request const &request) {
    auto &state = *context.state;
    auto const &ports = context.ports;
    const uint64_t now = ports.now_ms();
    if (before_deadline(now, state.cooldown_expires_at_ms)) {
        return AckBusy;
    }
    if (
        !state.authorized
        || !state.challenge_active
        || !before_deadline(now, state.challenge_expires_at_ms)
        || request.payload == nullptr
        || request.payload_size < bootloader_authorization::kAuthenticatedPayloadSize
    ) {
        clear_challenge(state);
        return AckUnauthorized;
    }

    uint8_t const *payload = request.payload;
    const uint32_t requested_challenge_id = read_u32_le(payload + bootloader_authorization::kKeyIdSize);
    // domain(16) | board id(8) | nonce(16) | challenge id(4) | command(1) | key id(4)
    std::array<uint8_t, 49> message{};
    std::memcpy(message.data(), kAuthDomain.data(), kAuthDomain.size());
    if (!ports.read_unique_id(message.data() + 16)) {
        clear_challenge(state);
        return AckBusy;
    }
    std::memcpy(message.data() + 24, state.nonce, sizeof(state.nonce));
    write_u32_le(message.data() + 40, state.challenge_id);
    message[44] = request.command_id;
    std::memcpy(message.data() + 45, state.active.key_id, sizeof(state.active.key_id));

    std::array<uint8_t, bootloader_authorization::kTagSize> expected_tag{};
    const bool hmac_ready = ports.hmac_sha256(
        state.active.secret,
        message.data(),
        static_cast<uint16_t>(message.size()),
        expected_tag.data()
    );
    const bool key_matches = constant_time_equal(payload, state.active.key_id, bootloader_authorization::kKeyIdSize);
    const bool challenge_matches = requested_challenge_id == state.challenge_id;
    const bool tag_matches = constant_time_equal(
        payload + bootloader_authorization::kKeyIdSize + 4,
        expected_tag.data(),
        static_cast<uint16_t>(expected_tag.size())
    );
    clear_challenge(state);
    if (!hmac_ready || !key_matches || !challenge_matches || !tag_matches) {
        note_authentication_failure(state, now);
        return AckUnauthorized;
    }
    state.consecutive_failures = 0;
    state.cooldown_expires_at_ms = 0;
    return AckOk;
}

Result handled(uint8_t ack) {
    return {.handled = true, .ack = ack};
}

} // namespace

bool is_maintenance_command(uint8_t command_id) {
    switch (command_id) {
        case CommandEnterBootloader:
        case CommandEnrollBegin:
        case CommandEnrollCommit:
        case CommandChallenge:
        case CommandRevoke:
        case CommandConfirmationCancel:
        case CommandPhysicalBegin:
            return true;
        default:
            return false;
    }
}

Result execute(Context const &context, Request const &request) {
    if (!is_maintenance_command(request.command_id)) {
        return {};
    }
    if (context.state == nullptr || !ports_complete(context.ports)) {
        return handled(AckBusy);
    }
    if (request.value != 0) {
        return handled(AckInvalidValue);
    }

    auto &state = *context.state;
    switch (request.command_id) {
        case CommandEnrollBegin: {
            if (request.payload == nullptr || request.payload_size < bootloader_authorization::kEnrollmentPayloadSize) {
                return handled(AckInvalidValue);
            }
            if (!context.ports.controller_connected()) {
                return handled(AckNotConnected);
            }
            PersistentRecord pending{};
            std::memcpy(pending.key_id, request.payload, sizeof(pending.key_id));
            std::memcpy(pending.secret, request.payload + sizeof(pending.key_id), sizeof(pending.secret));
            if (!record_valid(pending)) {
                return handled(AckInvalidValue);
            }
            state.pending = pending;
            state.enrollment_pending = true;
            if (!start_physical_confirmation(context, PhysicalConfirmationPurpose::Enrollment)) {
                clear_enrollment(state);
                return handled(AckBusy);
            }
            clear_challenge(state);
            return handled(AckOk);
        }

        case CommandEnrollCommit: {
            const uint64_t now = context.ports.now_ms();
            if (
                !state.enrollment_pending
                || state.physical_confirmation_purpose != PhysicalConfirmationPurpose::Enrollment
                || !before_deadline(now, state.physical_confirmation_expires_at_ms)
            ) {
                clear_enrollment(state);
                return handled(AckUnauthorized);
            }
            if (!state.physical_confirmation_confirmed) {
                return handled(AckBusy);
            }
            if (!context.ports.store_record(&state.pending)) {
                return handled(AckPersistenceFailed);
            }
            state.active = state.pending;
            state.authorized = true;
            state.consecutive_failures = 0;
            state.cooldown_expires_at_ms = 0;
            state.pending = {};
            state.enrollment_pending = false;
            // The sequence just entered also covers the bootloader entry that
            // prompted enrollment.
            state.physical_confirmation_purpose = PhysicalConfirmationPurpose::BootloaderEntry;
            state.physical_confirmation_confirmed = true;
            state.physical_confirmation_expires_at_ms = now + bootloader_authorization::kPhysicalGrantTtlMs;
            return handled(AckOk);
        }

        case CommandConfirmationCancel:
            cancel_physical_confirmation(context);
            return handled(AckOk);

        case CommandPhysicalBegin: {
            const uint8_t authentication = authenticate(context, request);
            if (authentication != AckOk) {
                return handled(authentication);
            }
            if (!context.ports.controller_connected()) {
                return handled(AckNotConnected);
            }
            clear_enrollment(state);
            if (!start_physical_confirmation(context, PhysicalConfirmationPurpose::BootloaderEntry)) {
                return handled(AckBusy);
            }
            return handled(AckOk);
        }

        case CommandChallenge: {
            const uint64_t now = context.ports.now_ms();
            if (!state.authorized) {
                return handled(AckUnauthorized);
            }
            if (before_deadline(now, state.cooldown_expires_at_ms)) {
                return handled(AckBusy);
            }
            if (!context.ports.random_bytes(state.nonce, sizeof(state.nonce))) {
                clear_challenge(state);
                return handled(AckBusy);
            }
            ++state.challenge_id;
            if (state.challenge_id == 0) {
                ++state.challenge_id;
            }
            state.challenge_active = true;
            state.challenge_expires_at_ms = now + bootloader_authorization::kChallengeTtlMs;
            return handled(AckOk);
        }

        case CommandEnterBootloader: {
            const uint8_t authentication = authenticate(context, request);
            if (authentication != AckOk) {
                return handled(authentication);
            }
            const uint64_t now = context.ports.now_ms();
            const bool grant_valid = context.ports.controller_connected()
                && state.physical_confirmation_purpose == PhysicalConfirmationPurpose::BootloaderEntry
                && state.physical_confirmation_confirmed
                && before_deadline(now, state.physical_confirmation_expires_at_ms);
            clear_physical_confirmation(state);
            return {
                .handled = true,
                .ack = grant_valid ? AckOk : AckUnauthorized,
                .enter_bootloader_after_ack = grant_valid,
            };
        }

        case CommandRevoke: {
            const uint8_t authentication = authenticate(context, request);
            if (authentication != AckOk) {
                return handled(authentication);
            }
            if (!context.ports.erase_record()) {
                return handled(AckPersistenceFailed);
            }
            state = {};
            return handled(AckOk);
        }

        default:
            return {};
    }
}

void initialize(Context const &context) {
    if (context.state == nullptr) {
        return;
    }
    auto &state = *context.state;
    state = {};
    if (context.ports.load_record == nullptr) {
        return;
    }
    PersistentRecord record{};
    if (context.ports.load_record(&record) && record_valid(record)) {
        state.active = record;
        state.authorized = true;
    }
}

bool confirm_physical(Context const &context) {
    if (context.state == nullptr || context.ports.now_ms == nullptr) {
        return false;
    }
    auto &state = *context.state;
    const uint64_t now = context.ports.now_ms();
    if (
        state.physical_confirmation_purpose == PhysicalConfirmationPurpose::None
        || !before_deadline(now, state.physical_confirmation_expires_at_ms)
    ) {
        if (state.physical_confirmation_purpose != PhysicalConfirmationPurpose::None) {
            clear_physical_confirmation(state);
            clear_enrollment(state);
        }
        return false;
    }
    state.physical_confirmation_confirmed = true;
    if (state.physical_confirmation_purpose == PhysicalConfirmationPurpose::BootloaderEntry) {
        state.physical_confirmation_expires_at_ms = now + bootloader_authorization::kPhysicalGrantTtlMs;
    }
    return true;
}

bool physical_confirmation_pending(Context const &context) {
    if (context.state == nullptr || context.ports.now_ms == nullptr) {
        return false;
    }
    auto const &state = *context.state;
    // Runs per controller report; reads the clock only while one is pending.
    if (
        state.physical_confirmation_purpose == PhysicalConfirmationPurpose::None
        || state.physical_confirmation_confirmed
    ) {
        return false;
    }
    return before_deadline(context.ports.now_ms(), state.physical_confirmation_expires_at_ms);
}

void cancel_physical_confirmation(Context const &context) {
    if (context.state == nullptr) {
        return;
    }
    auto &state = *context.state;
    clear_physical_confirmation(state);
    state.pending = {};
    state.enrollment_pending = false;
}

} // namespace ds5::bootloader_maintenance
