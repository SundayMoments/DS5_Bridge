#include "kitsune_button_gesture.h"

namespace kitsune {

ButtonGesture::ButtonGesture(ButtonGestureConfig config) : config_(config) {
    if (config_.click_max_samples == 0) {
        config_.click_max_samples = 1;
    }
    if (config_.multi_click_window_samples == 0) {
        config_.multi_click_window_samples = 1;
    }
    if (config_.hold_samples == 0) {
        config_.hold_samples = 1;
    }
}

void ButtonGesture::reset() {
    state_ = State::Idle;
    press_samples_ = 0;
    release_wait_samples_ = 0;
    click_count_ = 0;
}

ButtonGestureEvent ButtonGesture::update(bool pressed) {
    switch (state_) {
        case State::Idle:
            if (pressed) {
                state_ = State::Pressed;
                press_samples_ = 1;
                release_wait_samples_ = 0;
                click_count_ = 0;
            }
            return ButtonGestureEvent::None;

        case State::Pressed:
            if (pressed) {
                ++press_samples_;
                if (press_samples_ >= config_.hold_samples) {
                    state_ = State::Held;
                    click_count_ = 0;
                    return ButtonGestureEvent::Hold;
                }
                return ButtonGestureEvent::None;
            }

            if (press_samples_ <= config_.click_max_samples) {
                ++click_count_;
                release_wait_samples_ = 0;
                if (click_count_ >= 3) {
                    reset();
                    return ButtonGestureEvent::TripleClick;
                }
                state_ = click_count_ == 1 ? State::WaitingForSecondClick : State::WaitingForThirdClick;
                return ButtonGestureEvent::None;
            }

            reset();
            return ButtonGestureEvent::None;

        case State::WaitingForSecondClick:
            if (pressed) {
                state_ = State::Pressed;
                press_samples_ = 1;
                return ButtonGestureEvent::None;
            }
            if (++release_wait_samples_ >= config_.multi_click_window_samples) {
                reset();
                return ButtonGestureEvent::Click;
            }
            return ButtonGestureEvent::None;

        case State::WaitingForThirdClick:
            if (pressed) {
                state_ = State::Pressed;
                press_samples_ = 1;
                return ButtonGestureEvent::None;
            }
            if (++release_wait_samples_ >= config_.multi_click_window_samples) {
                reset();
                return ButtonGestureEvent::DoubleClick;
            }
            return ButtonGestureEvent::None;

        case State::Held:
            if (!pressed) {
                reset();
                return ButtonGestureEvent::ReleaseAfterHold;
            }
            return ButtonGestureEvent::None;
    }

    reset();
    return ButtonGestureEvent::None;
}

} // namespace kitsune
