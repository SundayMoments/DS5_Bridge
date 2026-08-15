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
    Wolwifi = 16,
};

struct WatchdogTelemetrySnapshot {
    bool prior_watchdog_timeout;
    bool prior_snapshot_valid;
    uint8_t prior_phase;
    uint32_t prior_sequence;
    uint32_t prior_phase_entered_at_ms;
};

// Capture must happen before watchdog_enable() overwrites the SDK reset marker.
void watchdog_telemetry_boot_capture();
void watchdog_telemetry_note_phase(WatchdogMainLoopPhase phase);
void watchdog_telemetry_snapshot(WatchdogTelemetrySnapshot *snapshot);
const char *watchdog_telemetry_phase_name(uint8_t phase);

#endif // DS5_BRIDGE_WATCHDOG_TELEMETRY_H
