#include "keyboard_tap_sequencer.h"

namespace ds5 {
namespace {

bool has_keys(BootKeyboardOutputReport const &report) {
    for (std::size_t index = kBootKeyboardUsageOffset; index < report.bytes.size(); ++index) {
        if (report.bytes[index] != 0) {
            return true;
        }
    }
    return false;
}

// Only a tap with both modifiers and keys has modifier stages around its keys.
bool staged(BootKeyboardOutputReport const &report) {
    return report.bytes[0] != 0 && has_keys(report);
}

BootKeyboardOutputReport modifiers_of(BootKeyboardOutputReport const &report) {
    BootKeyboardOutputReport modifiers{};
    modifiers.bytes[0] = report.bytes[0];
    return modifiers;
}

} // namespace

void KeyboardTapSequencer::enqueue(BootKeyboardOutputReport const &report, bool held) {
    if (queue_count_ == kKeyboardTapQueueDepth) {
        queue_head_ = static_cast<uint8_t>((queue_head_ + 1) % kKeyboardTapQueueDepth);
        --queue_count_;
    }
    const std::size_t tail = (queue_head_ + queue_count_) % kKeyboardTapQueueDepth;
    queue_[tail] = report;
    queue_held_[tail] = held;
    ++queue_count_;
}

void KeyboardTapSequencer::release() {
    tap_held_ = false;
    queue_held_.fill(false);
}

void KeyboardTapSequencer::cancel() {
    queue_count_ = 0;
    cancel_ = stage_ != Stage::Idle;
}

void KeyboardTapSequencer::reset() {
    *this = KeyboardTapSequencer{};
}

bool KeyboardTapSequencer::next_report(
    uint32_t now_us,
    bool delivered,
    BootKeyboardOutputReport &report
) {
    if (stage_ != Stage::Idle && !stage_delivered_ && delivered) {
        stage_delivered_ = true;
        stage_since_us_ = now_us;
    }
    if (
        cancel_
        && (stage_ == Stage::ModifierLead || stage_ == Stage::Held || stage_ == Stage::KeyRelease)
    ) {
        return propose(Stage::Releasing, {}, report);
    }
    if (stage_ != Stage::Idle && !stage_delivered_) {
        if (!stage_elapsed(now_us, kKeyboardTapDeliveryTimeoutUs)) {
            return false;
        }
        queue_count_ = 0;
        return propose(Stage::Idle, {}, report);
    }

    switch (stage_) {
    case Stage::ModifierLead:
        if (!stage_elapsed(now_us, kKeyboardTapModifierLeadUs)) {
            return false;
        }
        return propose(Stage::Held, tap_, report);
    case Stage::Held:
        // Only release() or cancel() ends a held tap; a queued tap waits.
        if (tap_held_ || (queue_count_ == 0 && !stage_elapsed(now_us, kKeyboardTapHoldUs))) {
            return false;
        }
        return staged(tap_)
            ? propose(Stage::KeyRelease, modifiers_of(tap_), report)
            : propose(Stage::Releasing, {}, report);
    case Stage::KeyRelease:
        if (!stage_elapsed(now_us, kKeyboardTapModifierTrailUs)) {
            return false;
        }
        return propose(Stage::Releasing, {}, report);
    case Stage::Releasing:
        stage_ = Stage::Idle;
        tap_ = {};
        tap_held_ = false;
        cancel_ = false;
        break;
    case Stage::Idle:
        break;
    }

    if (queue_count_ == 0) {
        return false;
    }
    BootKeyboardOutputReport const &next = queue_[queue_head_];
    return staged(next)
        ? propose(Stage::ModifierLead, modifiers_of(next), report)
        : propose(Stage::Held, next, report);
}

void KeyboardTapSequencer::accept_report(uint32_t now_us) {
    if (stage_ == Stage::Idle && proposed_ != Stage::Idle && queue_count_ > 0) {
        tap_ = queue_[queue_head_];
        tap_held_ = queue_held_[queue_head_];
        queue_head_ = static_cast<uint8_t>((queue_head_ + 1) % kKeyboardTapQueueDepth);
        --queue_count_;
    }
    stage_ = proposed_;
    if (stage_ == Stage::Idle) {
        tap_ = {};
        tap_held_ = false;
        cancel_ = false;
    }
    stage_since_us_ = now_us;
    stage_delivered_ = false;
}

bool KeyboardTapSequencer::idle() const {
    return stage_ == Stage::Idle && queue_count_ == 0;
}

std::size_t KeyboardTapSequencer::queued() const {
    return queue_count_;
}

bool KeyboardTapSequencer::stage_elapsed(uint32_t now_us, uint32_t duration_us) const {
    return static_cast<int32_t>(now_us - (stage_since_us_ + duration_us)) >= 0;
}

bool KeyboardTapSequencer::propose(
    Stage stage,
    BootKeyboardOutputReport const &report,
    BootKeyboardOutputReport &out
) {
    proposed_ = stage;
    out = report;
    return true;
}

} // namespace ds5
