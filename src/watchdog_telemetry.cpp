#include "watchdog_telemetry.h"

#include <cstring>

#include "hardware/structs/watchdog.h"
#include "hardware/watchdog.h"
#include "pico/time.h"

namespace {

// Scratch 0 is the atomic commit marker: a "DT" schema-2 signature in the high
// 20 bits, the current main-loop phase in five bits, and a seven-bit checksum
// over scratch 1-3. Scratch 1 holds the reset reason and the consecutive
// abnormal-reset count, scratch 2 the uptime at the last heartbeat, and
// scratch 3 is reserved. Scratch 4-7 belong to the SDK's watchdog reboot mode.
constexpr uint32_t kScratchSignature = 0x44542000u;
constexpr uint32_t kScratchSignatureMask = 0xfffff000u;
constexpr uint8_t kScratchPhaseShift = 7u;
constexpr uint8_t kScratchPhaseMask = 0x1fu;
constexpr uint8_t kScratchCrcMask = 0x7fu;
constexpr uint32_t kHeartbeatIntervalUs = 1'000'000u;

struct RetainedRecord {
    WatchdogResetReason reason;
    uint8_t abnormal_reset_count;
    uint32_t uptime_ms;
};

WatchdogTelemetrySnapshot prior{};
RetainedRecord record{};
uint8_t current_phase = 0;
uint8_t current_crc = 0;
uint32_t last_heartbeat_us = 0;

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
            crc = crc8_update(crc, static_cast<uint8_t>(word >> shift));
        }
    }
    return static_cast<uint8_t>(crc & kScratchCrcMask);
}

uint32_t commit_marker() {
    return kScratchSignature
        | (static_cast<uint32_t>(current_phase & kScratchPhaseMask) << kScratchPhaseShift)
        | current_crc;
}

void commit_record() {
    const uint32_t word1 = static_cast<uint32_t>(record.reason)
        | (static_cast<uint32_t>(record.abnormal_reset_count) << 8u);
    const uint32_t word2 = record.uptime_ms;
    const uint32_t word3 = 0;
    current_crc = scratch_crc(word1, word2, word3);

    // Publish the marker last. A reset during this update is reported as an
    // invalid breadcrumb instead of a misleading valid record.
    watchdog_hw->scratch[0] = 0;
    watchdog_hw->scratch[1] = word1;
    watchdog_hw->scratch[2] = word2;
    watchdog_hw->scratch[3] = word3;
    watchdog_hw->scratch[0] = commit_marker();
}

} // namespace

void watchdog_telemetry_boot_capture() {
    std::memset(&prior, 0, sizeof(prior));

    const bool timeout_reset = watchdog_enable_caused_reboot();
    const uint32_t word0 = watchdog_hw->scratch[0];
    const uint32_t word1 = watchdog_hw->scratch[1];
    const uint32_t word2 = watchdog_hw->scratch[2];
    const uint32_t word3 = watchdog_hw->scratch[3];
    const bool signature_valid = (word0 & kScratchSignatureMask) == kScratchSignature;
    const bool crc_valid = static_cast<uint8_t>(word0 & kScratchCrcMask)
        == scratch_crc(word1, word2, word3);

    prior.prior_watchdog_timeout = timeout_reset;
    prior.prior_snapshot_valid = timeout_reset && signature_valid && crc_valid;
    uint8_t abnormal_reset_count = 0;
    if (prior.prior_snapshot_valid) {
        prior.prior_phase = static_cast<uint8_t>((word0 >> kScratchPhaseShift) & kScratchPhaseMask);
        prior.prior_reason = static_cast<WatchdogResetReason>(word1 & 0xffu);
        prior.prior_uptime_ms = word2;
        const uint8_t previous_count = static_cast<uint8_t>(word1 >> 8u);
        abnormal_reset_count = previous_count == UINT8_MAX
            ? previous_count
            : static_cast<uint8_t>(previous_count + 1u);
    } else if (timeout_reset) {
        // A watchdog reset whose breadcrumb did not survive still counts.
        abnormal_reset_count = 1;
    }
    prior.prior_abnormal_reset_count = abnormal_reset_count;

    record = RetainedRecord{
        .reason = WatchdogResetReason::None,
        .abnormal_reset_count = abnormal_reset_count,
        .uptime_ms = 0,
    };
    current_phase = static_cast<uint8_t>(WatchdogMainLoopPhase::Boot);
    commit_record();
}

void watchdog_telemetry_note_phase(WatchdogMainLoopPhase phase) {
    current_phase = static_cast<uint8_t>(phase);
    watchdog_hw->scratch[0] = commit_marker();
}

void watchdog_telemetry_heartbeat(uint32_t now_us) {
    if (static_cast<uint32_t>(now_us - last_heartbeat_us) < kHeartbeatIntervalUs) {
        return;
    }
    last_heartbeat_us = now_us;
    record.uptime_ms = static_cast<uint32_t>(time_us_64() / 1000u);
    commit_record();
}

void watchdog_telemetry_record_reset_reason(WatchdogResetReason reason) {
    record.reason = reason;
    record.uptime_ms = static_cast<uint32_t>(time_us_64() / 1000u);
    commit_record();
}

void watchdog_telemetry_snapshot(WatchdogTelemetrySnapshot *snapshot) {
    if (snapshot != nullptr) {
        *snapshot = prior;
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
        default:
            return "unknown";
    }
}

const char *watchdog_telemetry_reason_name(uint8_t reason) {
    switch (static_cast<WatchdogResetReason>(reason)) {
        case WatchdogResetReason::None:
            return "watchdog-timeout";
        case WatchdogResetReason::Panic:
            return "panic";
        case WatchdogResetReason::OutOfMemory:
            return "out-of-memory";
        case WatchdogResetReason::CodecFatal:
            return "codec-fatal";
        case WatchdogResetReason::AudioStackOverflow:
            return "audio-stack-overflow";
        case WatchdogResetReason::ContainerContract:
            return "container-contract";
        default:
            return "unknown";
    }
}
