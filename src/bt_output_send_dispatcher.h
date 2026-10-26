#ifndef DS5_BRIDGE_BT_OUTPUT_SEND_DISPATCHER_H
#define DS5_BRIDGE_BT_OUTPUT_SEND_DISPATCHER_H

#include <cstdint>

#ifndef DS5_BT_SEND_REQUESTS_PER_USB_TURN
#define DS5_BT_SEND_REQUESTS_PER_USB_TURN 2
#endif

// The pump runs inside the SRAM-resident pump_output_sends; an outlined
// template instantiation would otherwise land in flash.
#if defined(__GNUC__)
#define DS5_BT_SEND_DISPATCHER_INLINE inline __attribute__((always_inline))
#else
#define DS5_BT_SEND_DISPATCHER_INLINE inline
#endif

namespace ds5::bt {

enum class BtOutputSendChannel : uint8_t { Interrupt = 0, Control = 1 };

// Core 0 task context only. BTstack can deliver CAN_SEND_NOW synchronously from
// inside l2cap_request_can_send_now_event or while releasing the other CID's
// HCI buffer, so a send callback that re-armed its own channel used to recurse
// once per free ACL credit, each level holding a full send frame on the core 0
// stack. A notification that arrives while another send callback is active is
// recorded as a pending wakeup instead, and only a top-level pump issues new
// requests, a bounded number between foreground USB service points.
class BtOutputSendDispatcher {
public:
    static constexpr unsigned kRequestsPerPump = DS5_BT_SEND_REQUESTS_PER_USB_TURN;
    static_assert(kRequestsPerPump >= 1 && kRequestsPerPump <= 8);

    // Called only after top-level USB task service, never from a send callback.
    // All immediate callers share this allowance, so repeated pump calls cannot
    // recreate an uninterrupted burst. Refill does not discard pending lanes.
    void resume_after_usb_service() {
        if (!pumping_ && !callback_active_) {
            requests_remaining_ = kRequestsPerPump;
        }
    }

    void request(BtOutputSendChannel channel) {
        pending_ |= bit(channel);
    }

    // Returns false for a nested notification; its wakeup stays pending.
    bool enter_callback(BtOutputSendChannel channel) {
        if (callback_active_) {
            request(channel);
            return false;
        }
        callback_active_ = true;
        return true;
    }

    void leave_callback() {
        callback_active_ = false;
    }

    // Reset only queued wakeups. A session can retire inside a callback, whose
    // scope still owns these guards until its stack and packet storage unwind.
    void reset_pending() {
        pending_ = 0;
    }

    bool pending(BtOutputSendChannel channel) const {
        return (pending_ & bit(channel)) != 0;
    }

    template <typename Request>
    DS5_BT_SEND_DISPATCHER_INLINE void pump(Request request_can_send) {
        if (pumping_ || callback_active_) {
            return;
        }
        pumping_ = true;
        while (requests_remaining_ != 0 && pending_ != 0) {
            const auto channel = (pending_ & bit(next_)) != 0 ? next_ : other(next_);
            pending_ &= static_cast<uint8_t>(~bit(channel));
            next_ = other(channel);
            --requests_remaining_;
            request_can_send(channel);
        }
        pumping_ = false;
    }

private:
    static constexpr uint8_t bit(BtOutputSendChannel channel) {
        return static_cast<uint8_t>(1u << static_cast<uint8_t>(channel));
    }

    static constexpr BtOutputSendChannel other(BtOutputSendChannel channel) {
        return channel == BtOutputSendChannel::Interrupt
            ? BtOutputSendChannel::Control
            : BtOutputSendChannel::Interrupt;
    }

    uint8_t pending_ = 0;
    uint8_t requests_remaining_ = kRequestsPerPump;
    BtOutputSendChannel next_ = BtOutputSendChannel::Interrupt;
    bool callback_active_ = false;
    bool pumping_ = false;
};

} // namespace ds5::bt

#endif // DS5_BRIDGE_BT_OUTPUT_SEND_DISPATCHER_H
