#ifndef DS5_BRIDGE_CONTROLLER_INPUT_RECEIVE_BATCH_H
#define DS5_BRIDGE_CONTROLLER_INPUT_RECEIVE_BATCH_H

#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>

#include "controller_state.h"

namespace ds5 {

struct ReceivedControllerInputPacket {
    uint32_t generation = 0;
    uint8_t report[kDualSenseUsbInputReportSize]{};
};

// Owns only the reports of one Bluetooth receive pass, not a history of
// samples. The caller drains it before polling the radio again. Receiving a
// packet copies its bytes and nothing else: no decoding, chords or USB work
// run inside the Bluetooth poll.
template <std::size_t Capacity>
class ControllerInputReceiveBatch {
    static_assert(Capacity > 0);

public:
    [[nodiscard]] bool push(uint8_t const *report) {
        if (size_ == Capacity || report == nullptr) {
            return false;
        }
        auto &entry = entries_[(head_ + size_) % Capacity];
        entry.generation = generation_;
        std::memcpy(entry.report, report, sizeof(entry.report));
        ++size_;
        return true;
    }

    [[nodiscard]] bool pop_front(ReceivedControllerInputPacket &packet) {
        if (empty()) {
            return false;
        }
        packet = entries_[head_];
        head_ = (head_ + 1) % Capacity;
        --size_;
        return true;
    }

    // Copy each packet out before either callback runs: processing can
    // disconnect the controller or change persona, which clears the batch.
    // One pass handles at most Capacity packets even if a callback admits more.
    template <typename Process, typename AfterEach>
    void drain(Process &&process, AfterEach &&after_each) {
        for (std::size_t i = 0; i < Capacity; ++i) {
            ReceivedControllerInputPacket packet;
            if (!pop_front(packet)) {
                break;
            }
            process(packet);
            after_each();
        }
    }

    // Discards staged reports and invalidates any packet already popped.
    void clear() {
        head_ = size_ = 0;
        ++generation_;
    }

    [[nodiscard]] bool current(ReceivedControllerInputPacket const &packet) const {
        return packet.generation == generation_;
    }
    [[nodiscard]] bool empty() const { return size_ == 0; }
    [[nodiscard]] std::size_t size() const { return size_; }
    [[nodiscard]] static constexpr std::size_t capacity() { return Capacity; }

private:
    std::array<ReceivedControllerInputPacket, Capacity> entries_{};
    std::size_t head_ = 0;
    std::size_t size_ = 0;
    uint32_t generation_ = 0;
};

} // namespace ds5

#endif // DS5_BRIDGE_CONTROLLER_INPUT_RECEIVE_BATCH_H
