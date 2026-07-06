#ifndef DS5_BRIDGE_OUTPUT_SCHEDULER_H
#define DS5_BRIDGE_OUTPUT_SCHEDULER_H

#include <cstdint>

enum class OutputSchedulerChoice : uint8_t {
    None = 0,
    AudioStream,
    CoalescedState,
};

struct OutputSchedulerInputs {
    bool audio_available;
    bool coalesced_state_available;
    uint32_t audio_age_us;
    uint32_t audio_depth;
    uint8_t consecutive_non_audio_sends;
};

struct OutputSchedulerConfig {
    uint32_t audio_max_age_us;
    uint8_t max_consecutive_non_audio_sends;
};

OutputSchedulerChoice output_scheduler_choose_interrupt_packet(
    OutputSchedulerInputs const &inputs,
    OutputSchedulerConfig const &config
);

#endif // DS5_BRIDGE_OUTPUT_SCHEDULER_H
