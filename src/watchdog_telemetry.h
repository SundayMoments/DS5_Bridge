#ifndef DS5_BRIDGE_WATCHDOG_TELEMETRY_H
#define DS5_BRIDGE_WATCHDOG_TELEMETRY_H

#include <cstdint>

enum class WatchdogMainLoopPhase : uint8_t {
    Boot = 0,
    Cyw43 = 1,
    TinyUsb = 2,
    InterruptBeforeAudio = 3,
    UsbPower = 4,
    Audio = 5,
    Button = 6,
    Lightbar = 7,
    Rssi = 8,
    Inquiry = 9,
    ConnectionRecovery = 10,
    FeaturePrefetch = 11,
    OutputRetry = 12,
    Companion = 13,
    InterruptAfterCompanion = 14,
    FirmwareLogFlush = 15,
    Cyw43Second = 16,
    InterruptAfterCyw43 = 17,
    WakeOnLan = 18,
};

// Why the firmware reset itself. A watchdog timeout with no recorded reason
// means a main-loop phase stopped returning.
enum class WatchdogResetReason : uint8_t {
    None = 0,
    Panic = 1,
    OutOfMemory = 2,
    CodecFatal = 3,
    AudioStackOverflow = 4,
    ContainerContract = 5,
    // The CYW43 Bluetooth receive ring reported fewer unread bytes than the
    // host had already accounted for; detail holds the two counts.
    Cyw43RxOverflow = 6,
};

struct WatchdogTelemetrySnapshot {
    bool prior_watchdog_timeout;
    bool prior_snapshot_valid;
    uint8_t prior_phase;
    WatchdogResetReason prior_reason;
    // Consecutive abnormal resets since the last clean boot, saturating at 255.
    uint8_t prior_abnormal_reset_count;
    // Uptime recorded by the last heartbeat before the reset (1 s resolution).
    uint32_t prior_uptime_ms;
    // Reason-specific evidence; zero when the reason carries none.
    uint32_t prior_detail;
};

// Capture must happen before watchdog_enable() overwrites the SDK reset marker.
void watchdog_telemetry_boot_capture();
// One register write; cheap enough to bracket every main-loop phase.
void watchdog_telemetry_note_phase(WatchdogMainLoopPhase phase);
// Refreshes the retained uptime at most once per second.
void watchdog_telemetry_heartbeat(uint32_t now_us);
// Called only from fail-fast paths, immediately before the reset. The first
// recorded reason wins, so a specific cause is not replaced by the generic
// panic that follows it.
void watchdog_telemetry_record_reset_reason(WatchdogResetReason reason, uint32_t detail = 0);
// Fatal CYW43 receive guard only (generated SDK transport, C linkage).
extern "C" void ds5_record_cyw43_rx_overflow(
    uint32_t previous_available,
    uint32_t published_count,
    uint32_t producer_index,
    uint32_t consumer_index
);
void watchdog_telemetry_snapshot(WatchdogTelemetrySnapshot *snapshot);
const char *watchdog_telemetry_phase_name(uint8_t phase);
const char *watchdog_telemetry_reason_name(uint8_t reason);

#endif // DS5_BRIDGE_WATCHDOG_TELEMETRY_H
