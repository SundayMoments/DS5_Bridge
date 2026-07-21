#ifndef DS5_BRIDGE_KITSUNE_BUTTON_GESTURE_H
#define DS5_BRIDGE_KITSUNE_BUTTON_GESTURE_H

#include <cstdint>

namespace kitsune {

enum class ButtonGestureEvent : uint8_t {
    None = 0,
    Click,
    DoubleClick,
    TripleClick,
    Hold,
    ReleaseAfterHold,
};

struct ButtonGestureConfig {
    uint32_t click_max_samples = 5;
    uint32_t multi_click_window_samples = 3;
    uint32_t hold_samples = 15;
};

class ButtonGesture {
public:
    explicit ButtonGesture(ButtonGestureConfig config = {});

    ButtonGestureEvent update(bool pressed);
    void reset();

private:
    enum class State : uint8_t {
        Idle,
        Pressed,
        WaitingForSecondClick,
        WaitingForThirdClick,
        Held,
    };

    ButtonGestureConfig config_{};
    State state_ = State::Idle;
    uint32_t press_samples_ = 0;
    uint32_t release_wait_samples_ = 0;
    uint8_t click_count_ = 0;
};

} // namespace kitsune

#endif // DS5_BRIDGE_KITSUNE_BUTTON_GESTURE_H
