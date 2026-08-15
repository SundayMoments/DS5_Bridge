#include "output_scheduler.h"
#ifdef PICO_ON_DEVICE
#include "pico.h"
#else
#define __not_in_flash_func(function_name) function_name
#endif

OutputSchedulerChoice __not_in_flash_func(output_scheduler_choose_interrupt_packet)(
    OutputSchedulerInputs const &inputs,
    OutputSchedulerConfig const &config
) {
    (void)config;
    // A composed audio carrier has reached its transport deadline and owns
    // this opportunity. State and rumble use every gap between carriers.
    if (inputs.audio_available) {
        return OutputSchedulerChoice::AudioStream;
    }
    if (inputs.urgent_available) {
        return OutputSchedulerChoice::Urgent;
    }
    if (inputs.coalesced_state_available) {
        return OutputSchedulerChoice::CoalescedState;
    }
    return OutputSchedulerChoice::None;
}

bool __not_in_flash_func(output_scheduler_fifo_prefers_urgent)(
    bool urgent_ready,
    uint32_t urgent_enqueue_time_us,
    bool audio_available,
    uint32_t audio_enqueue_time_us
) {
    if (!urgent_ready) {
        return false;
    }
    if (!audio_available) {
        return true;
    }
    return output_scheduler_timestamp_at_or_before(
        urgent_enqueue_time_us,
        audio_enqueue_time_us
    );
}

bool output_scheduler_timestamp_at_or_before(uint32_t timestamp, uint32_t reference) {
    return static_cast<int32_t>(timestamp - reference) <= 0;
}
