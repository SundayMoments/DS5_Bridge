// Checks the Bluetooth-to-USB controller input handoff: the per-poll receive
// batch, the transition-preserving delivery queue, and the submission rules
// interrupt_loop applies while received input waits to be processed. Uses the
// production DualSense decoder and DualSense persona encoder.

#include <array>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <vector>

#include "controller_input_delivery_queue.h"
#include "controller_input_receive_batch.h"
#include "dualsense_input_decoder.h"
#include "persona/dualsense_persona.h"

namespace {

#define CHECK(condition) \
    do { \
        if (!(condition)) { \
            std::fprintf(stderr, "controller input handoff check failed at %d: %s\n", __LINE__, #condition); \
            std::exit(1); \
        } \
    } while (0)

using Batch = ds5::ControllerInputReceiveBatch<2>;
using Packet = ds5::ReceivedControllerInputPacket;
using Queue = ds5::ControllerInputDeliveryQueue<8>;
using ds5::ControllerInputPushResult;
using Report = std::array<uint8_t, kDualSenseUsbInputReportSize>;

constexpr uint8_t kCrossPressed = 0x28;  // neutral hat + Cross
constexpr uint8_t kNoButtons = 0x08;     // neutral hat

Report neutral_report() {
    Report report{};
    report[0] = report[1] = report[2] = report[3] = 0x80;
    report[7] = kNoButtons;
    report[32] = 0x80;  // both touch slots inactive
    report[36] = 0x80;
    return report;
}

BridgeControllerState decode(Report const &report) {
    BridgeControllerState state{};
    CHECK(dualsense_decode_usb_input_report(report.data(), static_cast<uint16_t>(report.size()), state));
    return state;
}

BridgeControllerState state_with(uint8_t buttons, uint8_t left_x) {
    Report report = neutral_report();
    report[7] = buttons;
    report[0] = left_x;
    return decode(report);
}

void test_batch_storage_and_bounds() {
    Batch batch;
    Report report{};
    report.fill(0xa5);
    CHECK(!batch.push(nullptr) && batch.empty());
    CHECK(batch.push(report.data()));
    report.fill(0x42);  // BTstack reuses its buffer straight after the callback.
    CHECK(batch.push(report.data()));
    report.fill(0xff);
    CHECK(!batch.push(report.data()) && batch.size() == 2);

    Packet packet;
    CHECK(batch.pop_front(packet) && packet.report[0] == 0xa5 && packet.report[62] == 0xa5);
    CHECK(batch.pop_front(packet) && packet.report[0] == 0x42);
    CHECK(!batch.pop_front(packet) && batch.empty());
}

void test_batch_interleaving_and_resets() {
    Batch batch;
    Report report{};
    report[0] = 1;
    CHECK(batch.push(report.data()));
    report[0] = 2;
    CHECK(batch.push(report.data()));
    std::vector<int> events;
    batch.drain([&](Packet const &packet) { events.push_back(packet.report[0]); },
                [&] { events.push_back(100); });
    // A USB opportunity follows every report, including the last one.
    CHECK((events == std::vector<int>{1, 100, 2, 100}) && batch.empty());

    CHECK(batch.push(report.data()));
    Packet in_flight;
    CHECK(batch.pop_front(in_flight) && batch.current(in_flight));
    CHECK(batch.push(report.data()));
    batch.clear();
    // A disconnect or persona change discards staged reports and invalidates
    // one already popped, even after the next session's first report.
    CHECK(batch.empty() && !batch.current(in_flight));
    CHECK(batch.push(report.data()) && !batch.current(in_flight));
    CHECK(batch.push(report.data()));
    unsigned processed = 0;
    batch.drain([&](Packet const &) { ++processed; }, [&] { batch.clear(); });
    CHECK(processed == 1 && batch.empty());

    // A reset triggered while processing a packet invalidates that packet.
    CHECK(batch.push(report.data()));
    batch.drain([&](Packet const &packet) {
        CHECK(batch.current(packet));
        batch.clear();
        CHECK(!batch.current(packet));
    }, [] {});

    // Input admitted during a yield cannot turn one drain into an unbounded loop.
    CHECK(batch.push(report.data()));
    processed = 0;
    batch.drain([&](Packet const &) { ++processed; }, [&] { CHECK(batch.push(report.data())); });
    CHECK(processed == Batch::capacity() && batch.size() == 1);
}

void test_queue_merges_motion_and_keeps_edges() {
    Queue queue;
    CHECK(queue.push(state_with(kNoButtons, 10)) == ControllerInputPushResult::Enqueued);
    CHECK(queue.push(state_with(kNoButtons, 20)) == ControllerInputPushResult::CoalescedContinuousState);
    CHECK(queue.push(state_with(kNoButtons, 30)) == ControllerInputPushResult::CoalescedContinuousState);
    CHECK(queue.size() == 1 && queue.front()->left_stick_x == 30);

    CHECK(queue.push(state_with(kCrossPressed, 40)) == ControllerInputPushResult::Enqueued);
    CHECK(queue.push(state_with(kCrossPressed, 50)) == ControllerInputPushResult::CoalescedContinuousState);
    CHECK(queue.push(state_with(kNoButtons, 60)) == ControllerInputPushResult::Enqueued);
    CHECK(queue.size() == 3);

    BridgeControllerState out{};
    CHECK(queue.pop_front(out) && !out.cross && out.left_stick_x == 30);
    CHECK(queue.pop_front(out) && out.cross && out.left_stick_x == 50);
    CHECK(queue.pop_front(out) && !out.cross && out.left_stick_x == 60);
    CHECK(queue.empty() && queue.front() == nullptr);
}

void test_queue_overflow_drops_the_oldest_edge() {
    Queue queue;
    for (unsigned index = 0; index < Queue::capacity(); ++index) {
        const uint8_t buttons = index % 2 == 0 ? kCrossPressed : kNoButtons;
        CHECK(queue.push(state_with(buttons, static_cast<uint8_t>(index))) == ControllerInputPushResult::Enqueued);
    }
    // A differing state never overwrites the full tail's edge.
    CHECK(queue.push(state_with(kCrossPressed, 200)) == ControllerInputPushResult::DroppedOldestTransition);
    CHECK(queue.size() == Queue::capacity());
    BridgeControllerState out{};
    CHECK(queue.pop_front(out) && out.left_stick_x == 1);
    BridgeControllerState last{};
    while (queue.pop_front(out)) {
        last = out;
    }
    CHECK(last.cross && last.left_stick_x == 200);
}

void test_touch_contacts_are_transitions() {
    Report base = neutral_report();
    Report touching = base;
    touching[32] = 0x05;  // slot 0 active, contact 5
    touching[33] = 0x10;
    Report moved = touching;
    moved[33] = 0x90;      // same contact, new coordinates
    Report new_contact = touching;
    new_contact[32] = 0x06;
    Report inactive_churn = base;
    inactive_churn[32] = 0x87;  // still inactive, stale contact ID changed

    CHECK(!ds5::controller_input_transition_equivalent(decode(base), decode(touching)));
    CHECK(ds5::controller_input_transition_equivalent(decode(touching), decode(moved)));
    CHECK(!ds5::controller_input_transition_equivalent(decode(touching), decode(new_contact)));
    CHECK(ds5::controller_input_transition_equivalent(decode(base), decode(inactive_churn)));

    Report l2_digital = base;
    l2_digital[8] = 0x04;
    Report l2_analog = base;
    l2_analog[4] = 0xff;  // analog travel alone is continuous
    CHECK(!ds5::controller_input_transition_equivalent(decode(base), decode(l2_digital)));
    CHECK(ds5::controller_input_transition_equivalent(decode(base), decode(l2_analog)));
}

void test_retry_refresh_never_crosses_an_edge() {
    Queue queue;
    BridgeControllerState retry = state_with(kCrossPressed, 10);
    CHECK(queue.refresh_retry(retry, state_with(kCrossPressed, 20)) && retry.left_stick_x == 20);
    CHECK(!queue.refresh_retry(retry, state_with(kNoButtons, 30)) && retry.cross && retry.left_stick_x == 20);
    CHECK(queue.push(state_with(kNoButtons, 30)) == ControllerInputPushResult::Enqueued);
    // With a transition queued behind the retry, even equivalent input queues.
    CHECK(!queue.refresh_retry(retry, state_with(kCrossPressed, 40)) && retry.left_stick_x == 20);
}

void test_sticks_refresh_in_both_representations() {
    BridgeControllerState pending = state_with(kCrossPressed, 10);
    pending.left_trigger = 99;
    pending.dualsense_report[4] = 99;
    Report latest_report = neutral_report();
    latest_report[0] = 240;
    latest_report[1] = 15;
    latest_report[2] = 200;
    latest_report[3] = 25;
    latest_report[4] = 7;
    const BridgeControllerState latest = decode(latest_report);

    ds5::controller_input_refresh_analog_sticks(pending, latest);
    CHECK(pending.left_stick_x == 240 && pending.left_stick_y == 15);
    CHECK(pending.right_stick_x == 200 && pending.right_stick_y == 25);
    // The edge keeps its own buttons and triggers.
    CHECK(pending.cross && pending.left_trigger == 99);

    HostPersonaInputReport encoded{};
    CHECK(dualsense_persona_encode_input(pending, encoded));
    CHECK(encoded.bytes[0] == 240 && encoded.bytes[1] == 15 && encoded.bytes[2] == 200 && encoded.bytes[3] == 25);
    CHECK(encoded.bytes[4] == 99 && encoded.bytes[7] == kCrossPressed);
}

// The submission rules of interrupt_loop, modeled over the production batch,
// decoder and queue; the source contract test pins them in main.cpp.
struct HandoffModel {
    Batch batch;
    Queue queue;
    BridgeControllerState latest{};
    BridgeControllerState accepted{};
    bool have_accepted = false;
    bool ready = true;
    std::vector<BridgeControllerState> submitted;

    void submit() {
        if (!ready) {
            return;
        }
        if (!batch.empty()) {
            BridgeControllerState const *pending = queue.front();
            if (!have_accepted || pending == nullptr
                || ds5::controller_input_transition_equivalent(accepted, *pending)) {
                return;
            }
        }
        BridgeControllerState out{};
        if (!queue.pop_front(out)) {
            return;
        }
        ds5::controller_input_refresh_analog_sticks(out, latest);
        submitted.push_back(out);
        accepted = out;
        have_accepted = true;
        ready = false;
    }

    void complete() {
        ready = true;
        submit();
    }

    void process(Packet const &packet) {
        BridgeControllerState state{};
        if (!dualsense_decode_usb_input_report(packet.report, sizeof(packet.report), state)) {
            return;
        }
        latest = state;
        (void)queue.push(state);
    }
};

void test_submission_waits_for_received_input() {
    for (const bool edges : {false, true}) {
        for (unsigned completion_phase = 0; completion_phase < 4; ++completion_phase) {
            HandoffModel model;
            model.ready = completion_phase == 0;
            model.accepted = state_with(kNoButtons, 0x80);
            model.have_accepted = true;
            // An older queued report is waiting when a new batch arrives.
            (void)model.queue.push(state_with(kNoButtons, 5));
            Report report = neutral_report();
            report[0] = 30;
            report[7] = edges ? kCrossPressed : kNoButtons;
            CHECK(model.batch.push(report.data()));
            report[0] = 240;
            report[7] = kNoButtons;
            CHECK(model.batch.push(report.data()));

            model.submit();  // interrupt_loop straight after the poll
            if (completion_phase == 1) {
                model.complete();  // USB service before the drain
            }
            CHECK(model.submitted.empty());
            unsigned processed = 0;
            model.batch.drain([&](Packet const &packet) {
                model.process(packet);
                ++processed;
            }, [&] {
                model.submit();
                if (processed == 1 && completion_phase == 2) {
                    model.complete();
                }
                if (processed == 1) {
                    // The first packet cannot beat the already-received second one.
                    CHECK(model.submitted.empty());
                }
            });
            if (completion_phase == 3) {
                model.complete();
            }
            CHECK(processed == 2 && model.submitted.size() == 1);
            while (!model.queue.empty()) {
                model.complete();
            }
            for (auto const &out : model.submitted) {
                CHECK(out.left_stick_x == 240 && out.dualsense_report[0] == 240);
            }
            if (edges) {
                // The press and its release both reach the host, with fresh aim.
                CHECK(model.submitted.size() == 3);
                CHECK(!model.submitted[0].cross && model.submitted[1].cross && !model.submitted[2].cross);
            } else {
                // A continuous burst takes exactly one slot: the latest report.
                CHECK(model.submitted.size() == 1 && !model.submitted[0].cross);
            }
        }
    }
}

void test_queued_edge_goes_first_while_input_waits() {
    HandoffModel model;
    model.accepted = state_with(kNoButtons, 0x80);
    model.have_accepted = true;
    model.ready = false;
    (void)model.queue.push(state_with(kCrossPressed, 10));
    Report report = neutral_report();
    report[0] = 90;
    report[7] = kCrossPressed;
    CHECK(model.batch.push(report.data()));
    // The queued press is a real edge, so a free endpoint takes it at once.
    model.complete();
    CHECK(model.submitted.size() == 1 && model.submitted[0].cross);
    // Nothing else is sent until the received report has been processed.
    model.complete();
    CHECK(model.submitted.size() == 1);
}

void test_invalid_final_packet_does_not_strand_input() {
    HandoffModel model;
    Report report = neutral_report();
    report[0] = 240;
    CHECK(model.batch.push(report.data()));
    CHECK(model.batch.push(report.data()));
    unsigned decoded = 0;
    model.batch.drain([&](Packet const &packet) {
        // The second packet is rejected during processing, like a stale one.
        if (decoded == 1) {
            return;
        }
        model.process(packet);
        ++decoded;
    }, [&] { model.submit(); });
    CHECK(decoded == 1 && model.submitted.size() == 1 && model.submitted[0].left_stick_x == 240);
}

} // namespace

int main() {
    test_batch_storage_and_bounds();
    test_batch_interleaving_and_resets();
    test_queue_merges_motion_and_keeps_edges();
    test_queue_overflow_drops_the_oldest_edge();
    test_touch_contacts_are_transitions();
    test_retry_refresh_never_crosses_an_edge();
    test_sticks_refresh_in_both_representations();
    test_submission_waits_for_received_input();
    test_queued_edge_goes_first_while_input_waits();
    test_invalid_final_packet_does_not_strand_input();
    std::printf("controller input handoff tests passed\n");
    return 0;
}
