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

bool output_scheduler_classic_rumble_can_bypass_audio(
    bool audio_available,
    bool terminal_stop,
    uint8_t consecutive_stop_sends,
    uint8_t consecutive_non_audio_sends
);

// Reserve the final part of the expected audio period for the next batched
// carrier. The reservation expires if audio has actually gone idle.
bool output_scheduler_audio_deadline_guard_active(
    bool speaker_enabled,
    bool audio_queued,
    uint32_t last_audio_send_us,
    uint32_t now_us,
    uint32_t guard_start_us,
    uint32_t idle_us
);

#endif // DS5_BRIDGE_OUTPUT_SCHEDULER_H
