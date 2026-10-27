#ifndef DS5_BRIDGE_CONTROLLER_INPUT_DELIVERY_QUEUE_H
#define DS5_BRIDGE_CONTROLLER_INPUT_DELIVERY_QUEUE_H

#include <array>
#include <cstddef>
#include <cstdint>

#include "controller_state.h"

namespace ds5 {

inline uint32_t controller_input_button_mask(BridgeControllerState const &state) {
    const bool buttons[] = {
        state.dpad_up, state.dpad_down, state.dpad_left, state.dpad_right,
        state.square, state.cross, state.circle, state.triangle,
        state.l1, state.r1, state.l2_pressed, state.r2_pressed,
        state.create, state.options, state.l3, state.r3,
        state.home, state.touchpad, state.mute,
        state.edge_left_function, state.edge_right_function,
        state.edge_left_paddle, state.edge_right_paddle,
    };
    uint32_t mask = 0;
    for (std::size_t index = 0; index < sizeof(buttons); ++index) {
        if (buttons[index]) {
            mask |= 1u << index;
        }
    }
    return mask;
}

// Two states differ by a transition when a button or a touch contact differs.
// Sticks, triggers, motion and touch coordinates are continuous: a newer
// sample may replace an older one. An inactive touch slot has no identity, so
// its stale contact ID is ignored.
inline bool controller_input_transition_equivalent(
    BridgeControllerState const &left,
    BridgeControllerState const &right
) {
    if (controller_input_button_mask(left) != controller_input_button_mask(right)) {
        return false;
    }
    for (uint8_t index = 0; index < kBridgeTouchPointCount; ++index) {
        BridgeTouchPoint const &a = left.touch_points[index];
        BridgeTouchPoint const &b = right.touch_points[index];
        if (a.active != b.active || (a.active && a.contact_id != b.contact_id)) {
            return false;
        }
    }
    return true;
}

// A queued edge goes out with the newest stick positions. Triggers, motion and
// touch stay captured with the edge so its report remains coherent.
inline void controller_input_refresh_analog_sticks(
    BridgeControllerState &pending,
    BridgeControllerState const &latest
) {
    pending.left_stick_x = latest.left_stick_x;
    pending.left_stick_y = latest.left_stick_y;
    pending.right_stick_x = latest.right_stick_x;
    pending.right_stick_y = latest.right_stick_y;
    // The DualSense personas forward the native report; keep its sticks in step.
    if (pending.dualsense_report_len == kDualSenseUsbInputReportSize) {
        pending.dualsense_report[0] = pending.left_stick_x;
        pending.dualsense_report[1] = pending.left_stick_y;
        pending.dualsense_report[2] = pending.right_stick_x;
        pending.dualsense_report[3] = pending.right_stick_y;
    }
}

enum class ControllerInputPushResult : uint8_t {
    Enqueued = 0,
    CoalescedContinuousState,
    DroppedOldestTransition,
};

// Keeps the newest continuous state of each button/contact run. Only distinct
// transitions take another slot, so ordinary motion never builds a backlog.
template <std::size_t Capacity>
class ControllerInputDeliveryQueue {
    static_assert(Capacity > 0);

public:
    [[nodiscard]] ControllerInputPushResult push(BridgeControllerState const &state) {
        if (!empty() && controller_input_transition_equivalent(at(size_ - 1), state)) {
            at(size_ - 1) = state;
            return ControllerInputPushResult::CoalescedContinuousState;
        }
        auto result = ControllerInputPushResult::Enqueued;
        if (size_ == Capacity) {
            // The incoming state differs from the full tail. Keep the tail's
            // edge: drop the oldest report instead.
            remove_front();
            result = ControllerInputPushResult::DroppedOldestTransition;
        }
        at(size_++) = state;
        return result;
    }

    // A rejected transfer is still unsent. Refresh it only when no transition
    // is queued behind it, so press/release/press cannot collapse across a gap.
    [[nodiscard]] bool refresh_retry(
        BridgeControllerState &retry,
        BridgeControllerState const &state
    ) const {
        if (!empty() || !controller_input_transition_equivalent(retry, state)) {
            return false;
        }
        retry = state;
        return true;
    }

    [[nodiscard]] bool pop_front(BridgeControllerState &state) {
        if (empty()) {
            return false;
        }
        state = at(0);
        remove_front();
        return true;
    }

    // The caller must not keep this pointer across queue changes.
    [[nodiscard]] BridgeControllerState const *front() const {
        return empty() ? nullptr : &at(0);
    }

    void clear() {
        head_ = size_ = 0;
    }

    [[nodiscard]] bool empty() const { return size_ == 0; }
    [[nodiscard]] std::size_t size() const { return size_; }
    [[nodiscard]] static constexpr std::size_t capacity() { return Capacity; }

private:
    BridgeControllerState &at(std::size_t index) { return entries_[(head_ + index) % Capacity]; }
    BridgeControllerState const &at(std::size_t index) const { return entries_[(head_ + index) % Capacity]; }

    void remove_front() {
        head_ = (head_ + 1) % Capacity;
        --size_;
    }

    std::array<BridgeControllerState, Capacity> entries_{};
    std::size_t head_ = 0;
    std::size_t size_ = 0;
};

} // namespace ds5

#endif // DS5_BRIDGE_CONTROLLER_INPUT_DELIVERY_QUEUE_H
