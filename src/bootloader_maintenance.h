#ifndef DS5_BRIDGE_BOOTLOADER_MAINTENANCE_H
#define DS5_BRIDGE_BOOTLOADER_MAINTENANCE_H

#include <cstdint>

#include "bootloader_authorization.h"

// Portable bootloader authorization commands, ported from Kitsune Input. The
// companion binds the ports to Pico primitives; host tests bind fakes.

namespace ds5::bootloader_maintenance {

// Wire values shared with the companion protocol.
enum CommandId : uint8_t {
    CommandEnterBootloader = 0x33,
    CommandEnrollBegin = 0x50,
    CommandEnrollCommit = 0x51,
    CommandChallenge = 0x52,
    CommandRevoke = 0x53,
    CommandConfirmationCancel = 0x54,
    CommandPhysicalBegin = 0x55,
};

enum Ack : uint8_t {
    AckOk = 0x00,
    AckInvalidValue = 0x04,
    AckNotConnected = 0x06,
    AckBusy = 0x07,
    AckPersistenceFailed = 0x08,
    AckUnauthorized = 0x09,
};

struct Ports {
    bool (*controller_connected)() = nullptr;
    uint64_t (*now_ms)() = nullptr;
    bool (*random_bytes)(uint8_t *output, uint16_t size) = nullptr;
    bool (*hmac_sha256)(
        uint8_t const key[bootloader_authorization::kSecretSize],
        uint8_t const *message,
        uint16_t message_size,
        uint8_t output[bootloader_authorization::kTagSize]
    ) = nullptr;
    bool (*read_unique_id)(uint8_t output[8]) = nullptr;
    bool (*load_record)(bootloader_authorization::PersistentRecord *record) = nullptr;
    bool (*store_record)(bootloader_authorization::PersistentRecord const *record) = nullptr;
    bool (*erase_record)() = nullptr;
};

struct Context {
    bootloader_authorization::State *state = nullptr;
    Ports ports{};
};

struct Request {
    uint8_t command_id = 0;
    uint16_t value = 0;
    uint8_t const *payload = nullptr;
    uint16_t payload_size = 0;
};

struct Result {
    bool handled = false;
    uint8_t ack = AckOk;
    // BOOTSEL reset must wait until the ACK is visible to the transport.
    bool enter_bootloader_after_ack = false;
};

bool is_maintenance_command(uint8_t command_id);
Result execute(Context const &context, Request const &request);

void initialize(Context const &context);
// True while a face-button sequence is being entered. Cheap when idle.
bool physical_confirmation_pending(Context const &context);
bool confirm_physical(Context const &context);
void cancel_physical_confirmation(Context const &context);

} // namespace ds5::bootloader_maintenance

#endif // DS5_BRIDGE_BOOTLOADER_MAINTENANCE_H
