// Models BTstack delivering CAN_SEND_NOW synchronously from inside
// l2cap_request_can_send_now_event and checks that the send dispatcher never
// nests a send callback, keeps deferred wakeups, shares one bounded request
// budget between USB service points and alternates the two lanes.

#include <cstdio>
#include <cstdlib>
#include <vector>

#define DS5_BT_SEND_REQUESTS_PER_USB_TURN 2
#include "bt_output_send_dispatcher.h"

namespace {

using ds5::bt::BtOutputSendChannel;
using ds5::bt::BtOutputSendDispatcher;

#define CHECK(condition) \
    do { \
        if (!(condition)) { \
            std::fprintf(stderr, "send dispatcher check failed at %d: %s\n", __LINE__, #condition); \
            std::exit(1); \
        } \
    } while (0)

BtOutputSendDispatcher dispatcher;
std::vector<BtOutputSendChannel> requests;
unsigned callback_depth = 0;
unsigned max_callback_depth = 0;
unsigned sends = 0;
unsigned credits = 0;
bool rearm_from_callback = false;

void deliver_can_send_now(BtOutputSendChannel lane);

// BTstack: with a free ACL credit, the notification is delivered before
// l2cap_request_can_send_now_event returns.
void request_can_send(BtOutputSendChannel lane) {
    requests.push_back(lane);
    if (credits != 0) {
        deliver_can_send_now(lane);
    }
}

// The firmware's l2cap_packet_handler and send callback.
void deliver_can_send_now(BtOutputSendChannel lane) {
    if (!dispatcher.enter_callback(lane)) {
        return;
    }
    ++callback_depth;
    if (callback_depth > max_callback_depth) {
        max_callback_depth = callback_depth;
    }
    --credits;
    ++sends;
    if (rearm_from_callback) {
        // request_can_send_if_needed(has_more) inside the callback.
        dispatcher.request(lane);
        dispatcher.pump(request_can_send);
    }
    --callback_depth;
    dispatcher.leave_callback();
}

void reset(unsigned available_credits) {
    dispatcher = BtOutputSendDispatcher{};
    requests.clear();
    callback_depth = max_callback_depth = sends = 0;
    credits = available_credits;
    rearm_from_callback = false;
}

void test_rearm_never_nests() {
    reset(8);
    rearm_from_callback = true;
    dispatcher.request(BtOutputSendChannel::Interrupt);
    dispatcher.pump(request_can_send);
    // The callback's own rearm is deferred; the outer pump issues it within
    // the budget instead of recursing once per free credit.
    CHECK(max_callback_depth == 1);
    CHECK(sends == 2);
    CHECK(requests.size() == 2);
    CHECK(dispatcher.pending(BtOutputSendChannel::Interrupt));

    // The next USB service point continues from the retained wakeup.
    dispatcher.resume_after_usb_service();
    dispatcher.pump(request_can_send);
    CHECK(max_callback_depth == 1);
    CHECK(sends == 4);
}

void test_nested_other_lane_is_deferred() {
    reset(4);
    // A control notification delivered during an interrupt callback (HCI
    // buffer release) only records a wakeup.
    CHECK(dispatcher.enter_callback(BtOutputSendChannel::Interrupt));
    CHECK(!dispatcher.enter_callback(BtOutputSendChannel::Control));
    CHECK(dispatcher.pending(BtOutputSendChannel::Control));
    dispatcher.pump(request_can_send);
    CHECK(requests.empty());
    dispatcher.leave_callback();
    dispatcher.pump(request_can_send);
    CHECK(requests.size() == 1 && requests[0] == BtOutputSendChannel::Control);
}

void test_budget_is_shared_and_lanes_alternate() {
    reset(0);
    dispatcher.request(BtOutputSendChannel::Interrupt);
    dispatcher.request(BtOutputSendChannel::Control);
    dispatcher.pump(request_can_send);
    CHECK(requests.size() == 2);
    CHECK(requests[0] == BtOutputSendChannel::Interrupt);
    CHECK(requests[1] == BtOutputSendChannel::Control);

    // Immediate callers share the exhausted budget until USB is serviced.
    dispatcher.request(BtOutputSendChannel::Interrupt);
    dispatcher.pump(request_can_send);
    dispatcher.pump(request_can_send);
    CHECK(requests.size() == 2);
    CHECK(dispatcher.pending(BtOutputSendChannel::Interrupt));
    dispatcher.resume_after_usb_service();
    dispatcher.pump(request_can_send);
    CHECK(requests.size() == 3);
}

void test_refill_waits_for_callback_exit() {
    reset(0);
    CHECK(dispatcher.enter_callback(BtOutputSendChannel::Interrupt));
    dispatcher.request(BtOutputSendChannel::Interrupt);
    dispatcher.request(BtOutputSendChannel::Control);
    dispatcher.pump(request_can_send);
    dispatcher.pump(request_can_send);
    dispatcher.pump(request_can_send);
    // A refill attempted inside a callback is ignored.
    dispatcher.resume_after_usb_service();
    CHECK(requests.empty());
    dispatcher.leave_callback();
    dispatcher.pump(request_can_send);
    CHECK(requests.size() == 2);
}

void test_reset_pending_clears_wakeups_only() {
    reset(0);
    dispatcher.request(BtOutputSendChannel::Interrupt);
    dispatcher.request(BtOutputSendChannel::Control);
    dispatcher.reset_pending();
    dispatcher.pump(request_can_send);
    CHECK(requests.empty());
    dispatcher.request(BtOutputSendChannel::Control);
    dispatcher.pump(request_can_send);
    CHECK(requests.size() == 1);
}

} // namespace

int main() {
    test_rearm_never_nests();
    test_nested_other_lane_is_deferred();
    test_budget_is_shared_and_lanes_alternate();
    test_refill_waits_for_callback_exit();
    test_reset_pending_clears_wakeups_only();
    std::printf("Bluetooth send dispatcher checks passed\n");
    return 0;
}
