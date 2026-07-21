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

#endif // DS5_BRIDGE_OUTPUT_SCHEDULER_H
