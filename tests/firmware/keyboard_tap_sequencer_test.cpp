#include <cstdint>
#include <cstdlib>
#include <initializer_list>
#include <iostream>
#include <vector>

#include "keyboard_tap_sequencer.h"

// Ported from Kitsune Input's keyboard tap sequencer tests.

namespace {

using ds5::BootKeyboardOutputReport;
using ds5::KeyboardTapSequencer;
using ds5::kKeyboardTapDeliveryTimeoutUs;
using ds5::kKeyboardTapHoldUs;
using ds5::kKeyboardTapModifierLeadUs;
using ds5::kKeyboardTapModifierTrailUs;

[[noreturn]] void fail(char const *message) {
    std::cerr << message << '\n';
    std::exit(1);
}

void require(bool condition, char const *message) {
    if (!condition) {
        fail(message);
    }
}

BootKeyboardOutputReport report(uint8_t modifiers, std::initializer_list<uint8_t> usages = {}) {
    BootKeyboardOutputReport result{};
    result.bytes[0] = modifiers;
    std::size_t index = 2;
    for (uint8_t usage : usages) {
        result.bytes[index++] = usage;
    }
    return result;
}

// Accepts every report the sequencer asks for and hands it to the host in the
// same pass, so the next pass sees it delivered. A test can clear `delivered`
// to hold one pass back.
struct Transport {
    KeyboardTapSequencer &taps;
    uint32_t now = 1'000'000;
    bool delivered = true;
    std::vector<BootKeyboardOutputReport> host{};

    bool step() {
        BootKeyboardOutputReport next{};
        const bool changed = taps.next_report(now, delivered, next);
        delivered = true;
        if (!changed) {
            return false;
        }
        taps.accept_report(now);
        host.push_back(next);
        return true;
    }

    void run_until_idle() {
        for (int guard = 0; guard < 100000 && !taps.idle(); ++guard) {
            step();
            now += 1000;
        }
        step();
        require(taps.idle(), "The sequencer must finish its taps");
    }
};

void test_plain_key_holds_then_releases() {
    KeyboardTapSequencer taps{};
    taps.enqueue(report(0, {0x04}));
    BootKeyboardOutputReport next{};
    const uint32_t start = 0u - kKeyboardTapHoldUs / 2;
    require(taps.next_report(start, true, next) && next == report(0, {0x04}),
        "A key without modifiers must press at once");
    taps.accept_report(start);
    require(!taps.next_report(start + kKeyboardTapHoldUs, false, next),
        "Nothing may change before transport takes the press");
    const uint32_t delivered_at = start + 1000;
    require(!taps.next_report(delivered_at, true, next), "The hold runs from delivery");
    require(!taps.next_report(delivered_at + kKeyboardTapHoldUs - 1, true, next),
        "The key must stay down for the full hold across a wrapped clock");
    require(taps.next_report(delivered_at + kKeyboardTapHoldUs, true, next) && next == BootKeyboardOutputReport{},
        "The key must release after its hold");
    taps.accept_report(delivered_at + kKeyboardTapHoldUs);
    require(!taps.idle(), "The release must be delivered before the tap ends");
    require(!taps.next_report(delivered_at + kKeyboardTapHoldUs + 1000, true, next) && taps.idle(),
        "A delivered release must end the tap");
}

void test_shortcut_host_order() {
    KeyboardTapSequencer taps{};
    Transport transport{taps};
    taps.enqueue(report(0x04, {0x28}));
    taps.enqueue(report(0x01, {0x06}));
    taps.enqueue(report(0x08));
    transport.run_until_idle();
    const std::vector<BootKeyboardOutputReport> expected{
        report(0x04), report(0x04, {0x28}), report(0x04), {},
        report(0x01), report(0x01, {0x06}), report(0x01), {},
        report(0x08), {},
    };
    require(transport.host == expected,
        "Modifiers must lead and trail each key; a modifier-only tap needs no stages");
}

void test_stage_durations() {
    KeyboardTapSequencer taps{};
    Transport transport{taps};
    taps.enqueue(report(0x04, {0x28}));
    std::vector<uint32_t> changes{};
    while (!taps.idle() || changes.empty()) {
        if (transport.step()) {
            changes.push_back(transport.now);
        }
        transport.now += 100;
    }
    require(changes.size() == 4, "A shortcut must take four stages");
    // Each stage is delivered one pass (100 us) after it is accepted.
    require(changes[1] - changes[0] == kKeyboardTapModifierLeadUs + 100, "The modifier lead must run from delivery");
    require(changes[2] - changes[1] == kKeyboardTapHoldUs + 100, "The hold must run from delivery");
    require(changes[3] - changes[2] == kKeyboardTapModifierTrailUs + 100, "The trail must run from delivery");
}

void test_queued_tap_ends_hold_after_release_delivery() {
    KeyboardTapSequencer taps{};
    Transport transport{taps};
    taps.enqueue(report(0, {0x0f}));
    transport.step();
    transport.now += 1000;
    transport.step();
    taps.enqueue(report(0, {0x0f}));
    require(transport.step() && transport.host.back() == BootKeyboardOutputReport{},
        "A queued repeat must end the hold early");
    transport.delivered = false;
    BootKeyboardOutputReport next{};
    require(!taps.next_report(transport.now, false, next),
        "The repeat must wait until the release is delivered");
    transport.delivered = true;
    require(transport.step() && transport.host.back() == report(0, {0x0f}),
        "The repeat must press once the release is delivered");
    transport.run_until_idle();
    const std::vector<BootKeyboardOutputReport> expected{
        report(0, {0x0f}), {}, report(0, {0x0f}), {},
    };
    require(transport.host == expected, "Every repeat must reach the host as its own press");
}

void test_full_queue_drops_oldest_waiting_tap() {
    KeyboardTapSequencer taps{};
    Transport transport{taps};
    taps.enqueue(report(0, {0x04}));
    transport.step();
    for (uint8_t usage = 0x05; usage <= 0x09; ++usage) {
        taps.enqueue(report(0, {usage}));
    }
    require(taps.queued() == ds5::kKeyboardTapQueueDepth, "The queue must stay bounded");
    transport.run_until_idle();
    std::vector<uint8_t> pressed{};
    for (auto const &sent : transport.host) {
        if (sent.bytes[2] != 0) {
            pressed.push_back(sent.bytes[2]);
        }
    }
    require(pressed == std::vector<uint8_t>{0x04, 0x06, 0x07, 0x08, 0x09},
        "A full queue must drop its oldest waiting tap, never the current one");
}

void test_cancel_releases_at_once_and_drops_waiting_taps() {
    for (int stage = 0; stage < 3; ++stage) {
        KeyboardTapSequencer taps{};
        Transport transport{taps};
        taps.enqueue(report(0x01, {0x06}));
        taps.enqueue(report(0, {0x04}));
        transport.step();
        for (int advance = 0; advance < stage; ++advance) {
            // Deliver, then wait out the current stage.
            transport.step();
            transport.now += kKeyboardTapHoldUs;
            transport.step();
        }
        BootKeyboardOutputReport next{};
        taps.cancel();
        require(taps.queued() == 0, "Cancel must drop waiting taps");
        require(taps.next_report(transport.now, false, next) && next == BootKeyboardOutputReport{},
            "Cancel must release everything at once, even before the stage is delivered");
        taps.accept_report(transport.now);
        require(!taps.next_report(transport.now, false, next), "The release must still be delivered");
        require(!taps.next_report(transport.now + 1000, true, next) && taps.idle(),
            "A delivered release must leave the sequencer idle");
    }
}

void test_stalled_transport_abandons_taps() {
    KeyboardTapSequencer taps{};
    taps.enqueue(report(0, {0x04}));
    taps.enqueue(report(0, {0x05}));
    BootKeyboardOutputReport next{};
    const uint32_t start = 0u - kKeyboardTapDeliveryTimeoutUs / 2;
    require(taps.next_report(start, true, next), "A tap must start");
    taps.accept_report(start);
    require(!taps.next_report(start + kKeyboardTapDeliveryTimeoutUs - 1, false, next),
        "An undelivered stage must wait until the delivery timeout");
    require(taps.next_report(start + kKeyboardTapDeliveryTimeoutUs, false, next) && next == BootKeyboardOutputReport{},
        "A stalled stage must abandon its tap");
    taps.accept_report(start + kKeyboardTapDeliveryTimeoutUs);
    require(taps.idle(), "Abandoning a tap must drop the queue so nothing replays late");
}

void test_rejected_report_is_offered_again() {
    KeyboardTapSequencer taps{};
    taps.enqueue(report(0, {0x04}));
    BootKeyboardOutputReport first{};
    BootKeyboardOutputReport second{};
    require(taps.next_report(1000, true, first), "A tap must be offered");
    require(taps.next_report(2000, true, second) && second == first && taps.queued() == 1,
        "An owner that rejects a report must be offered the same one again");
    taps.accept_report(2000);
    require(taps.queued() == 0 && !taps.idle(), "Accepting must start the tap");
}

void test_held_tap_waits_for_release() {
    KeyboardTapSequencer taps{};
    Transport transport{taps};
    taps.enqueue(report(0x01, {0x68}), true);
    transport.step();
    transport.step();
    transport.now += kKeyboardTapModifierLeadUs;
    transport.step();
    transport.step();
    taps.enqueue(report(0, {0x04}));
    transport.now += 10 * kKeyboardTapHoldUs;
    require(!transport.step() && transport.host.back() == report(0x01, {0x68}),
        "A held tap must outlast its hold and a queued tap");
    taps.release();
    transport.run_until_idle();
    const std::vector<BootKeyboardOutputReport> expected{
        report(0x01), report(0x01, {0x68}), report(0x01), {},
        report(0, {0x04}), {},
    };
    require(transport.host == expected, "Release must end a held tap through its stages, then run the queue");
}

void test_held_tap_released_early_keeps_the_minimum_hold() {
    KeyboardTapSequencer taps{};
    Transport transport{taps};
    taps.enqueue(report(0, {0x68}), true);
    taps.release();
    transport.step();
    transport.step();
    const uint32_t delivered_at = transport.now;
    transport.now = delivered_at + kKeyboardTapHoldUs - 1;
    require(!transport.step(), "A held tap released before it started must last the minimum hold");
    transport.now = delivered_at + kKeyboardTapHoldUs;
    require(transport.step() && transport.host.back() == BootKeyboardOutputReport{},
        "A held tap released before it started must then release");
}

void test_reset_forgets_everything() {
    KeyboardTapSequencer taps{};
    Transport transport{taps};
    taps.enqueue(report(0x02, {0x14}));
    taps.enqueue(report(0, {0x04}));
    transport.step();
    taps.reset();
    BootKeyboardOutputReport next{};
    require(taps.idle() && !taps.next_report(transport.now, true, next),
        "Reset must forget the current and waiting taps");
}

} // namespace

int main() {
    test_plain_key_holds_then_releases();
    test_shortcut_host_order();
    test_stage_durations();
    test_queued_tap_ends_hold_after_release_delivery();
    test_full_queue_drops_oldest_waiting_tap();
    test_cancel_releases_at_once_and_drops_waiting_taps();
    test_stalled_transport_abandons_taps();
    test_rejected_report_is_offered_again();
    test_held_tap_waits_for_release();
    test_held_tap_released_early_keeps_the_minimum_hold();
    test_reset_forgets_everything();
    std::cout << "Keyboard tap sequencer tests passed\n";
    return 0;
}
