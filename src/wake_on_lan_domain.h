// Ported from Kitsune Input's Wake-on-LAN.
#pragma once

#include <array>
#include <cstddef>
#include <cstdint>

namespace ds5::wake_on_lan {
inline constexpr uint8_t kStatusReportId = 0x1d;
// DS5 Bridge companion protocol 1.24 introduced Wake-on-LAN.
inline constexpr uint8_t kProtocolMinor = 24;
// From this minor, an enabled bridge arms itself when its enumerated host leaves
// the USB bus; host preparation remains the preferred path when available.
inline constexpr uint8_t kStandaloneArmingMinor = 24;
// Companion ACK results (src/companion.cpp AckResult).
enum Ack : uint8_t {
    AckOk = 0x00,
    AckBadLength = 0x03,
    AckInvalidValue = 0x04,
    AckUnknownCommand = 0x05,
    AckBusy = 0x07,
    AckPersistenceFailed = 0x08,
    AckUnauthorized = 0x09,
};
inline constexpr size_t kConfigSize = 112;
inline constexpr size_t kFrameSize = 116;
using Config = std::array<uint8_t, kConfigSize>;
enum class Stage : uint8_t { Idle, Preparing, Armed, UsbFirst, Joining, Sending,
                            Teardown, Complete, Failed, RadioFault, Testing };
enum class Error : uint8_t { None, NotConfigured, Busy, InvalidConfig, BadTransaction,
    Timeout, NetworkUnavailable, Authentication, SendFailed, RadioTeardown,
    Persistence, HostMismatch, Cancelled, ControllerUnavailable };
enum class RadioState : uint8_t { Idle, Joining, Ready, Stopping, Fault };
struct StoredRecord {
    Config config{};
    uint32_t generation = 0;
    uint32_t transaction = 0;
    bool configured = false;
};
// Country codes a saved record may carry, including legacy FI and IE.
bool valid_country(uint8_t first, uint8_t second);
// Country codes a new configuration may select: those with a locale in the
// pinned radio CLM. FI and IE have none, so every join fails the region check;
// saved FI/IE records still load, but Test and Commit reject them.
bool radio_country(uint8_t first, uint8_t second);
bool valid_config(const Config &config);
bool valid_mac(const uint8_t *mac);
void magic_frame(const uint8_t *source, const uint8_t *target, uint8_t *frame);
void erase_secret(void *data, size_t length);
uint32_t read_u32(const uint8_t *data);
void write_u32(uint8_t *data, uint32_t value);

// A single join scan can miss the access point (busy channel, Bluetooth
// coexistence). After CYW43_LINK_NONET the radio adapter re-issues the join
// after a short back-off, at most twice, and only while enough of the engine's
// 8 s Joining budget remains for the new scan to finish. FAIL and BADAUTH are
// never retried. If the budget runs out after a re-scan that never reached the
// access point (no AUTH or LINK progress), the attempt reports
// NetworkUnavailable rather than a weak-signal Timeout.
class JoinRetry {
public:
    static constexpr uint8_t kMaxRetries = 2;
    static constexpr uint64_t kBackoffMs = 400;
    // The re-issued join must start within this time of radio start.
    static constexpr uint64_t kWindowMs = 6500;
    void start(uint64_t now) { started_at_ = now; retry_at_ = 0; retries_ = 0; pending_ = false; progress_ = false; }
    // True when this NONET is retryable; the re-issue is then scheduled.
    bool on_no_network(uint64_t now);
    bool pending() const { return pending_; }
    bool due(uint64_t now) const { return pending_ && now >= retry_at_; }
    void issued() { pending_ = false; progress_ = false; }
    // The join reached the access point (authentication or link).
    void note_progress() { progress_ = true; }
    // A re-scan was needed and nothing has reached the access point since.
    bool unanswered() const { return retries_ > 0 && !progress_; }
    uint8_t retries() const { return retries_; }
private:
    uint64_t started_at_ = 0, retry_at_ = 0;
    uint8_t retries_ = 0;
    bool pending_ = false, progress_ = false;
};

// Reset-surviving evidence that radio work was interrupted by a reboot (a
// RadioFault recovery or a watchdog reset during Wi-Fi). The words carry a
// magic, a version, the packets submitted so far and a check word.
inline constexpr size_t kRadioMarkerWords = 3;
void encode_radio_marker(uint8_t packets, uint32_t *words);
bool decode_radio_marker(const uint32_t *words, uint8_t &packets);
}
