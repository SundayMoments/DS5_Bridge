#include "watchdog_telemetry.h"

#include <cstring>

#include "hardware/structs/watchdog.h"
#include "hardware/watchdog.h"
#include "pico/time.h"

namespace {

// Upper 24 bits are the schema marker; the low byte is the checksum.
constexpr uint32_t kScratchSignature = 0x44540100u; // "DT", schema 1.

WatchdogTelemetrySnapshot state{};
uint32_t current_sequence = 0;

uint32_t now_ms() {
    return static_cast<uint32_t>(time_us_64() / 1000u);
}

uint8_t crc8_update(uint8_t crc, uint8_t value) {
    crc ^= value;
    for (uint8_t bit = 0; bit < 8; ++bit) {
        crc = (crc & 0x80u) != 0
            ? static_cast<uint8_t>((crc << 1u) ^ 0x07u)
            : static_cast<uint8_t>(crc << 1u);
    }
    return crc;
}

uint8_t scratch_crc(uint32_t word1, uint32_t word2, uint32_t word3) {
    uint8_t crc = 0;
    const uint32_t words[] = {word1, word2, word3};
    for (uint32_t word : words) {
        for (uint8_t shift = 0; shift < 32; shift += 8) {
            crc = crc8_update(
                crc,
                static_cast<uint8_t>(word >> shift)
            );
        }
    }
    return crc;
}

void commit_phase(WatchdogMainLoopPhase phase) {
    const uint32_t word1 = static_cast<uint8_t>(phase);
    const uint32_t word2 = ++current_sequence;
    const uint32_t word3 = now_ms();

    // Publish the signature last. A reset during this five-register update is
    // reported as an invalid breadcrumb instead of a misleading valid phase.
    watchdog_hw->scratch[0] = 0;
    watchdog_hw->scratch[1] = word1;
    watchdog_hw->scratch[2] = word2;
    watchdog_hw->scratch[3] = word3;
    watchdog_hw->scratch[0] =
        kScratchSignature | scratch_crc(word1, word2, word3);
}

} // namespace

void watchdog_telemetry_boot_capture() {
    std::memset(&state, 0, sizeof(state));

    const bool timeout_reset = watchdog_enable_caused_reboot();
    const uint32_t word0 = watchdog_hw->scratch[0];
    const uint32_t word1 = watchdog_hw->scratch[1];
    const uint32_t word2 = watchdog_hw->scratch[2];
    const uint32_t word3 = watchdog_hw->scratch[3];
    const bool signature_valid =
        (word0 & 0xffffff00u) == kScratchSignature;
    const bool crc_valid =
        static_cast<uint8_t>(word0) == scratch_crc(word1, word2, word3);

    state.prior_watchdog_timeout = timeout_reset;
    state.prior_snapshot_valid =
        timeout_reset && signature_valid && crc_valid;
    if (state.prior_snapshot_valid) {
        state.prior_phase = static_cast<uint8_t>(word1);
        state.prior_sequence = word2;
        state.prior_phase_entered_at_ms = word3;
        current_sequence = word2;
    }

    commit_phase(WatchdogMainLoopPhase::Boot);
}

void watchdog_telemetry_note_phase(WatchdogMainLoopPhase phase) {
    commit_phase(phase);
}

void watchdog_telemetry_snapshot(WatchdogTelemetrySnapshot *snapshot) {
    if (snapshot != nullptr) {
        *snapshot = state;
    }
}

const char *watchdog_telemetry_phase_name(uint8_t phase) {
    switch (static_cast<WatchdogMainLoopPhase>(phase)) {
        case WatchdogMainLoopPhase::Boot:
            return "boot";
        case WatchdogMainLoopPhase::Cyw43:
            return "cyw43";
        case WatchdogMainLoopPhase::TinyUsb:
            return "tinyusb";
        case WatchdogMainLoopPhase::InterruptBeforeAudio:
            return "interrupt-before-audio";
        case WatchdogMainLoopPhase::UsbPower:
            return "usb-power";
        case WatchdogMainLoopPhase::Audio:
            return "audio";
        case WatchdogMainLoopPhase::Button:
            return "button";
        case WatchdogMainLoopPhase::Lightbar:
            return "lightbar";
        case WatchdogMainLoopPhase::Rssi:
            return "rssi";
        case WatchdogMainLoopPhase::Inquiry:
            return "inquiry";
        case WatchdogMainLoopPhase::ConnectionRecovery:
            return "connection-recovery";
        case WatchdogMainLoopPhase::FeaturePrefetch:
            return "feature-prefetch";
        case WatchdogMainLoopPhase::OutputRetry:
            return "output-retry";
        case WatchdogMainLoopPhase::Companion:
            return "companion";
        case WatchdogMainLoopPhase::InterruptAfterCompanion:
            return "interrupt-after-companion";
        case WatchdogMainLoopPhase::FirmwareLogFlush:
            return "firmware-log-flush";
        case WatchdogMainLoopPhase::Wolwifi:
            return "wolwifi";
        default:
            return "unknown";
    }
}
