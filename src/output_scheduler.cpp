#include "output_scheduler.h"

OutputSchedulerChoice output_scheduler_choose_interrupt_packet(
    OutputSchedulerInputs const &inputs,
    OutputSchedulerConfig const &config
) {
    // Audio wins by default, but a pending state packet gets a bounded turn.
    // This keeps continuous speaker/haptics audio from starving companion
    // trigger, rumble, and lighting updates.
    const bool state_starved = inputs.coalesced_state_available
        && (
            inputs.consecutive_audio_sends >= config.max_consecutive_audio_sends
            || inputs.state_age_us >= config.state_max_age_us
        );
    if (state_starved) {
        return OutputSchedulerChoice::CoalescedState;
    }
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

bool output_scheduler_classic_rumble_can_bypass_audio(
    bool audio_available,
    bool terminal_stop,
    uint8_t consecutive_stop_sends,
    uint8_t consecutive_non_audio_sends
) {
    if (!audio_available) {
        return true;
    }
    if (terminal_stop && consecutive_stop_sends == 0) {
        return true;
    }
    return consecutive_non_audio_sends == 0;
}
