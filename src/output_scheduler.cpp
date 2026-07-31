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

bool __not_in_flash_func(output_scheduler_classic_rumble_can_bypass_audio)(
    bool audio_available,
    bool terminal_stop,
    uint8_t consecutive_stop_sends,
    uint8_t consecutive_non_audio_sends
) {
    (void)consecutive_non_audio_sends;
    if (!audio_available) {
        return true;
    }
    return terminal_stop && consecutive_stop_sends == 0;
}

bool __not_in_flash_func(output_scheduler_audio_deadline_guard_active)(
    bool speaker_enabled,
    bool audio_queued,
    uint32_t last_audio_send_us,
    uint32_t now_us,
    uint32_t guard_start_us,
    uint32_t idle_us
) {
    if (!speaker_enabled || audio_queued || last_audio_send_us == 0) {
        return false;
    }
    const uint32_t elapsed_us = now_us - last_audio_send_us;
    return elapsed_us >= guard_start_us && elapsed_us < idle_us;
}
