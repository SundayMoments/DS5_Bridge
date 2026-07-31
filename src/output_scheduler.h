#ifndef DS5_BRIDGE_OUTPUT_SCHEDULER_H
#define DS5_BRIDGE_OUTPUT_SCHEDULER_H

#include <cstdint>

enum class OutputSchedulerChoice : uint8_t {
    None = 0,
    AudioStream,
    Urgent,
    CoalescedState,
};

struct OutputSchedulerInputs {
    bool audio_available;
    bool urgent_available;
    bool coalesced_state_available;
    uint8_t consecutive_audio_sends;
    uint32_t state_age_us;
};

struct OutputSchedulerConfig {
    uint8_t max_consecutive_audio_sends;
    uint32_t state_max_age_us;
};

OutputSchedulerChoice output_scheduler_choose_interrupt_packet(
    OutputSchedulerInputs const &inputs,
    OutputSchedulerConfig const &config
);

// Awalol/DS5Dongle-style ordering for the shared outgoing interrupt stream.
// When both lanes are ready, the report that entered the firmware first wins.
bool output_scheduler_fifo_prefers_urgent(
    bool urgent_ready,
    uint32_t urgent_enqueue_time_us,
    bool audio_available,
    uint32_t audio_enqueue_time_us
);

// Wrap-safe ordering for short-lived 32-bit microsecond timestamps.
// True when timestamp was captured at or before reference.
bool output_scheduler_timestamp_at_or_before(uint32_t timestamp, uint32_t reference);

#endif // DS5_BRIDGE_OUTPUT_SCHEDULER_H
