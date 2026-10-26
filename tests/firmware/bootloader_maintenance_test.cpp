#include <array>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iostream>

#include "bootloader_confirmation.h"
#include "bootloader_maintenance.h"

// Security properties of the bootloader authorization ported from Kitsune
// Input: nothing reaches BOOTSEL without an enrolled key, a fresh single-use
// challenge, and a face-button sequence confirmed on the controller.

namespace {

namespace auth = ds5::bootloader_authorization;
namespace maint = ds5::bootloader_maintenance;
namespace confirm = ds5::bootloader_confirmation;

[[noreturn]] void fail(char const *message) {
    std::cerr << message << '\n';
    std::exit(1);
}

void require(bool condition, char const *message) {
    if (!condition) {
        fail(message);
    }
}

struct Fake {
    bool controller_connected = true;
    uint64_t now_ms = 1'000;
    auth::PersistentRecord stored{};
    bool stored_present = false;
    bool persistence_ok = true;
    auth::State state{};
};

Fake *fake = nullptr;

bool port_controller_connected() { return fake->controller_connected; }
uint64_t port_now_ms() { return fake->now_ms; }

bool port_random_bytes(uint8_t *output, uint16_t size) {
    static uint8_t counter = 0;
    for (uint16_t index = 0; index < size; ++index) {
        output[index] = static_cast<uint8_t>(0xa0u + index + counter);
    }
    ++counter;
    return true;
}

std::array<uint8_t, 49> last_hmac_message{};

// A keyed stand-in for HMAC-SHA256: the service only needs the port to be
// deterministic and key dependent; real HMAC runs on the Pico SHA block.
bool port_hmac(uint8_t const key[auth::kSecretSize], uint8_t const *message, uint16_t size, uint8_t out[auth::kTagSize]) {
    if (size == last_hmac_message.size()) {
        std::memcpy(last_hmac_message.data(), message, size);
    }
    for (uint8_t index = 0; index < auth::kTagSize; ++index) {
        uint8_t mixed = key[index];
        for (uint16_t at = index; at < size; at += auth::kTagSize) {
            mixed = static_cast<uint8_t>(mixed ^ message[at]);
        }
        out[index] = static_cast<uint8_t>(mixed ^ 0x5au);
    }
    return true;
}

constexpr uint8_t kBoardId[8] = {0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17};

bool port_unique_id(uint8_t out[8]) {
    std::memcpy(out, kBoardId, sizeof(kBoardId));
    return true;
}

bool port_load(auth::PersistentRecord *record) {
    if (!fake->stored_present) return false;
    *record = fake->stored;
    return true;
}

bool port_store(auth::PersistentRecord const *record) {
    if (!fake->persistence_ok) return false;
    fake->stored = *record;
    fake->stored_present = true;
    return true;
}

bool port_erase() {
    if (!fake->persistence_ok) return false;
    fake->stored = {};
    fake->stored_present = false;
    return true;
}

maint::Context context() {
    return {
        .state = &fake->state,
        .ports = {
            .controller_connected = port_controller_connected,
            .now_ms = port_now_ms,
            .random_bytes = port_random_bytes,
            .hmac_sha256 = port_hmac,
            .read_unique_id = port_unique_id,
            .load_record = port_load,
            .store_record = port_store,
            .erase_record = port_erase,
        },
    };
}

maint::Result send(uint8_t command, uint8_t const *payload = nullptr, uint16_t size = 0, uint16_t value = 0) {
    return maint::execute(context(), {.command_id = command, .value = value, .payload = payload, .payload_size = size});
}

constexpr uint8_t kKeyId[4] = {0xde, 0xad, 0xbe, 0xef};
uint8_t secret[auth::kSecretSize]{};

// What the companion app sends: key id | challenge id | HMAC over
// domain | board id | nonce | challenge id | command | key id.
std::array<uint8_t, auth::kAuthenticatedPayloadSize> authenticated_payload(uint8_t command, bool corrupt = false) {
    auto const &state = fake->state;
    static constexpr uint8_t kDomain[16] = {'D', 'S', '5', 'B', 'R', 'I', 'D', 'G', 'E', '-', 'B', 'O', 'O', 'T', '1', 0};
    uint8_t message[49]{};
    std::memcpy(message, kDomain, sizeof(kDomain));
    std::memcpy(message + 16, kBoardId, sizeof(kBoardId));
    std::memcpy(message + 24, state.nonce, sizeof(state.nonce));
    for (int index = 0; index < 4; ++index) {
        message[40 + index] = static_cast<uint8_t>(state.challenge_id >> (8 * index));
    }
    message[44] = command;
    std::memcpy(message + 45, kKeyId, sizeof(kKeyId));
    std::array<uint8_t, auth::kAuthenticatedPayloadSize> payload{};
    std::memcpy(payload.data(), kKeyId, sizeof(kKeyId));
    for (int index = 0; index < 4; ++index) {
        payload[4 + index] = static_cast<uint8_t>(state.challenge_id >> (8 * index));
    }
    port_hmac(secret, message, sizeof(message), payload.data() + 8);
    if (corrupt) {
        payload[8] ^= 0x01;
    }
    return payload;
}

maint::Result send_authenticated(uint8_t command, bool corrupt = false) {
    require(send(maint::CommandChallenge).ack == maint::AckOk, "A challenge must be issued");
    const auto payload = authenticated_payload(command, corrupt);
    return send(command, payload.data(), static_cast<uint16_t>(payload.size()));
}

void enroll() {
    uint8_t payload[auth::kEnrollmentPayloadSize]{};
    std::memcpy(payload, kKeyId, sizeof(kKeyId));
    std::memcpy(payload + 4, secret, sizeof(secret));
    require(send(maint::CommandEnrollBegin, payload, sizeof(payload)).ack == maint::AckOk, "Enrollment must start");
    require(maint::physical_confirmation_pending(context()), "Enrollment must wait for the controller sequence");
    require(send(maint::CommandEnrollCommit).ack == maint::AckBusy, "Commit must wait for the sequence");
    require(maint::confirm_physical(context()), "The sequence must confirm");
    require(send(maint::CommandEnrollCommit).ack == maint::AckOk, "Commit must succeed once confirmed");
}

void reset_fake(Fake &next) {
    fake = &next;
    for (uint8_t index = 0; index < sizeof(secret); ++index) {
        secret[index] = static_cast<uint8_t>(0x30 + index);
    }
    maint::initialize(context());
}

void test_unenrolled_bridge_refuses_bootloader_entry() {
    Fake state{};
    reset_fake(state);
    uint8_t junk[auth::kAuthenticatedPayloadSize]{1};
    require(send(maint::CommandEnterBootloader, junk, sizeof(junk)).ack == maint::AckUnauthorized,
        "An unenrolled bridge must refuse bootloader entry");
    require(send(maint::CommandChallenge).ack == maint::AckUnauthorized, "No challenge without enrollment");
    require(!send(maint::CommandEnterBootloader).enter_bootloader_after_ack, "Nothing may enter BOOTSEL");
    require(send(maint::CommandEnterBootloader, nullptr, 0, 1).ack == maint::AckInvalidValue, "A nonzero value is invalid");
}

void test_enrollment_needs_controller_and_persists() {
    Fake state{};
    reset_fake(state);
    state.controller_connected = false;
    uint8_t payload[auth::kEnrollmentPayloadSize]{};
    std::memcpy(payload, kKeyId, sizeof(kKeyId));
    std::memcpy(payload + 4, secret, sizeof(secret));
    require(send(maint::CommandEnrollBegin, payload, sizeof(payload)).ack == maint::AckNotConnected,
        "Enrollment needs a connected controller");
    state.controller_connected = true;
    uint8_t zero_secret[auth::kEnrollmentPayloadSize]{};
    std::memcpy(zero_secret, kKeyId, sizeof(kKeyId));
    require(send(maint::CommandEnrollBegin, zero_secret, sizeof(zero_secret)).ack == maint::AckInvalidValue,
        "An all-zero secret is rejected");
    enroll();
    require(state.stored_present && std::memcmp(state.stored.secret, secret, sizeof(secret)) == 0,
        "The enrolled key must be persisted");

    Fake rebooted{};
    rebooted.stored = state.stored;
    rebooted.stored_present = true;
    reset_fake(rebooted);
    require(rebooted.state.authorized, "A stored key must load at boot");
}

void test_enrollment_grant_allows_one_entry() {
    Fake state{};
    reset_fake(state);
    enroll();
    const auto result = send_authenticated(maint::CommandEnterBootloader);
    require(result.ack == maint::AckOk && result.enter_bootloader_after_ack,
        "The sequence entered for enrollment covers the entry that prompted it");
    require(send_authenticated(maint::CommandEnterBootloader).ack == maint::AckUnauthorized,
        "The grant must be used up by one entry");
}

void test_entry_requires_physical_confirmation_each_time() {
    Fake state{};
    reset_fake(state);
    enroll();
    state.now_ms += auth::kPhysicalGrantTtlMs;
    require(send_authenticated(maint::CommandEnterBootloader).ack == maint::AckUnauthorized,
        "An expired enrollment grant must not allow entry");

    require(send_authenticated(maint::CommandPhysicalBegin).ack == maint::AckOk, "Physical confirmation must start");
    require(maint::physical_confirmation_pending(context()), "The sequence must be pending");
    require(send_authenticated(maint::CommandEnterBootloader).ack == maint::AckUnauthorized,
        "Entry before the sequence is entered must fail");

    require(send_authenticated(maint::CommandPhysicalBegin).ack == maint::AckOk, "Physical confirmation must restart");
    require(maint::confirm_physical(context()), "The sequence must confirm");
    state.controller_connected = false;
    require(send_authenticated(maint::CommandEnterBootloader).ack == maint::AckUnauthorized,
        "The controller that confirmed must still be connected");

    state.controller_connected = true;
    require(send_authenticated(maint::CommandPhysicalBegin).ack == maint::AckOk, "Physical confirmation must restart");
    require(maint::confirm_physical(context()), "The sequence must confirm");
    const auto result = send_authenticated(maint::CommandEnterBootloader);
    require(result.ack == maint::AckOk && result.enter_bootloader_after_ack, "A confirmed, authenticated entry must succeed");
}

void test_challenges_are_single_use_and_expire() {
    Fake state{};
    reset_fake(state);
    enroll();
    require(send(maint::CommandChallenge).ack == maint::AckOk, "Challenge");
    const auto payload = authenticated_payload(maint::CommandRevoke);
    require(send(maint::CommandRevoke, payload.data(), payload.size()).ack == maint::AckOk, "A fresh challenge authenticates");
    reset_fake(state);
    enroll();
    require(send(maint::CommandChallenge).ack == maint::AckOk, "Challenge");
    const auto reused = authenticated_payload(maint::CommandPhysicalBegin);
    require(send(maint::CommandPhysicalBegin, reused.data(), reused.size()).ack == maint::AckOk, "First use succeeds");
    require(send(maint::CommandPhysicalBegin, reused.data(), reused.size()).ack == maint::AckUnauthorized,
        "A challenge must not authorize twice");

    require(send(maint::CommandChallenge).ack == maint::AckOk, "Challenge");
    const auto late = authenticated_payload(maint::CommandPhysicalBegin);
    state.now_ms += auth::kChallengeTtlMs;
    require(send(maint::CommandPhysicalBegin, late.data(), late.size()).ack == maint::AckUnauthorized,
        "An expired challenge must not authorize");
}

void test_repeated_failures_cool_down() {
    Fake state{};
    reset_fake(state);
    enroll();
    for (int attempt = 0; attempt < auth::kFailuresBeforeCooldown; ++attempt) {
        require(send_authenticated(maint::CommandPhysicalBegin, true).ack == maint::AckUnauthorized,
            "A wrong tag must be refused");
    }
    require(send(maint::CommandChallenge).ack == maint::AckBusy, "Three failures start a cooldown");
    state.now_ms += auth::kFailureCooldownMs;
    require(send_authenticated(maint::CommandPhysicalBegin).ack == maint::AckOk, "The cooldown must end");
}

void test_revoke_erases_the_key() {
    Fake state{};
    reset_fake(state);
    enroll();
    require(send_authenticated(maint::CommandRevoke).ack == maint::AckOk, "Revoke must succeed");
    require(!state.stored_present && !state.state.authorized, "Revoke must erase and forget the key");
    require(send(maint::CommandChallenge).ack == maint::AckUnauthorized, "A revoked bridge issues no challenge");
}

void test_cancel_clears_pending_confirmation() {
    Fake state{};
    reset_fake(state);
    enroll();
    require(send_authenticated(maint::CommandPhysicalBegin).ack == maint::AckOk, "Physical confirmation must start");
    require(send(maint::CommandConfirmationCancel).ack == maint::AckOk, "Cancel must succeed");
    require(!maint::physical_confirmation_pending(context()), "Cancel must clear the sequence");
    require(!maint::confirm_physical(context()), "A cancelled sequence cannot confirm");
}

void test_sequence_never_repeats_a_button_back_to_back() {
    Fake state{};
    reset_fake(state);
    enroll();
    for (int round = 0; round < 32; ++round) {
        require(send_authenticated(maint::CommandPhysicalBegin).ack == maint::AckOk, "Physical confirmation must start");
        auto const &sequence = state.state.physical_confirmation_sequence;
        for (uint8_t index = 0; index < auth::kSequenceLength; ++index) {
            require(confirm::valid_face_button(sequence[index]), "Every step must be a face button");
            require(index == 0 || sequence[index] != sequence[index - 1], "Steps must differ from the last one");
        }
    }
}

// The companion app MACs the same bytes; its coordinator test asserts this
// exact layout (KNOWN_MESSAGE_HEX) and computes the real HMAC over it.
void test_hmac_message_layout_matches_companion() {
    Fake state{};
    reset_fake(state);
    enroll();
    state.state.challenge_active = true;
    for (uint8_t index = 0; index < auth::kNonceSize; ++index) {
        state.state.nonce[index] = index;
    }
    state.state.challenge_id = 0x01020304u;
    state.state.challenge_expires_at_ms = state.now_ms + 1000;
    const auto payload = authenticated_payload(maint::CommandRevoke);
    require(send(maint::CommandRevoke, payload.data(), payload.size()).ack == maint::AckOk, "Revoke must authenticate");
    constexpr uint8_t kExpected[49] = {
        0x44, 0x53, 0x35, 0x42, 0x52, 0x49, 0x44, 0x47, 0x45, 0x2d, 0x42, 0x4f, 0x4f, 0x54, 0x31, 0x00,
        0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17,
        0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
        0x04, 0x03, 0x02, 0x01,
        0x53,
        0xde, 0xad, 0xbe, 0xef,
    };
    require(std::memcmp(last_hmac_message.data(), kExpected, sizeof(kExpected)) == 0,
        "The MAC'd message must match the companion app's layout");
}

void test_face_button_state_machine() {
    using confirm::FaceButton;
    using confirm::Result;
    confirm::State state{};
    // A button held when confirmation starts must be released first.
    require(confirm::update(state, confirm::kCrossBit, true, FaceButton::Cross) == Result::Consuming, "Start consumes");
    require(confirm::update(state, confirm::kCrossBit, true, FaceButton::Cross) == Result::Consuming, "Held press is not counted");
    require(confirm::update(state, 0, true, FaceButton::Cross) == Result::Consuming, "Release");
    require(confirm::update(state, confirm::kCrossBit, true, FaceButton::Cross) == Result::Correct, "A new press counts");
    require(confirm::update(state, confirm::kCrossBit, true, FaceButton::Circle) == Result::Consuming, "One count per press");
    require(confirm::update(state, 0, true, FaceButton::Circle) == Result::Consuming, "Release");
    require(confirm::update(state, confirm::kSquareBit, true, FaceButton::Circle) == Result::Incorrect, "A wrong button is a mistake");
    require(confirm::update(state, confirm::kSquareBit | confirm::kCircleBit, false, FaceButton::Circle) == Result::Consuming,
        "A press still held after confirmation ends is swallowed");
    require(confirm::update(state, 0, false, FaceButton::Circle) == Result::Idle, "Then input returns to the game");
}

} // namespace

int main() {
    test_unenrolled_bridge_refuses_bootloader_entry();
    test_enrollment_needs_controller_and_persists();
    test_enrollment_grant_allows_one_entry();
    test_entry_requires_physical_confirmation_each_time();
    test_challenges_are_single_use_and_expire();
    test_repeated_failures_cool_down();
    test_revoke_erases_the_key();
    test_cancel_clears_pending_confirmation();
    test_sequence_never_repeats_a_button_back_to_back();
    test_hmac_message_layout_matches_companion();
    test_face_button_state_machine();
    std::cout << "Bootloader maintenance tests passed\n";
    return 0;
}
