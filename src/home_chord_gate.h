#ifndef DS5_BRIDGE_HOME_CHORD_GATE_H
#define DS5_BRIDGE_HOME_CHORD_GATE_H

#include <cstdint>

// Holds PS/Home back from the host while it may still start a chord, so a
// chord never also reaches Steam as a PS press.
//
// - A tap (released inside the window) replays as a short host press.
// - A hold past the window stays pressed until release, as on a plain
//   controller. It must not re-arm while held: that blinked PS every window.
// - Once a chord or shortcut uses PS, PS stays hidden until it is released,
//   even after the other button lets go first, and never replays.
namespace ds5::home_chord_gate {

inline constexpr uint32_t kSuppressUs = 250000;
inline constexpr uint32_t kFallbackReplayUs = 80000;

enum class Phase : uint8_t {
    Idle,
    Deferring,
    Holding,
    Consumed
};

struct State {
    Phase phase = Phase::Idle;
    uint32_t until_us = 0;
    uint32_t replay_until_us = 0;
};

inline bool time_reached(uint32_t now, uint32_t target) {
    return static_cast<int32_t>(now - target) >= 0;
}

// Returns whether the host should see PS/Home pressed in this report.
inline bool step(State &state, bool enabled, bool physical_pressed, bool chord_consumed, uint32_t now) {
    if (chord_consumed) {
        state.phase = Phase::Consumed;
        state.until_us = 0;
        state.replay_until_us = 0;
        return false;
    }

    if (!enabled) {
        state = {};
        return physical_pressed;
    }

    if (physical_pressed) {
        state.replay_until_us = 0;
        switch (state.phase) {
            case Phase::Idle:
                state.phase = Phase::Deferring;
                state.until_us = now + kSuppressUs;
                return false;
            case Phase::Deferring:
                if (!time_reached(now, state.until_us)) {
                    return false;
                }
                state.phase = Phase::Holding;
                state.until_us = 0;
                return true;
            case Phase::Holding:
                return true;
            case Phase::Consumed:
                return false;
        }
        return false;
    }

    if (state.phase == Phase::Deferring) {
        state.replay_until_us = now + kFallbackReplayUs;
    }
    state.phase = Phase::Idle;
    state.until_us = 0;

    if (state.replay_until_us != 0 && !time_reached(now, state.replay_until_us)) {
        return true;
    }
    state.replay_until_us = 0;
    return false;
}

} // namespace ds5::home_chord_gate

#endif // DS5_BRIDGE_HOME_CHORD_GATE_H
