// Checks the fixed-capacity containers that replaced heap-backed Bluetooth
// output storage, including a differential run of the classic-rumble
// admission policy against std::deque.

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <deque>
#include <vector>

#include "bounded_containers.h"
#include "classic_rumble_delivery_policy.h"

namespace {

#define CHECK(condition) \
    do { \
        if (!(condition)) { \
            std::fprintf(stderr, "bounded container check failed at %d: %s\n", __LINE__, #condition); \
            std::exit(1); \
        } \
    } while (0)

using ds5::BoundedDeque;
using ds5::InlineBytes;
using ds5::classic_rumble::AdmissionResult;
using ds5::classic_rumble::DeliveryKind;

void test_inline_bytes() {
    InlineBytes<8> bytes;
    CHECK(bytes.empty() && bytes.size() == 0);
    const uint8_t source[] = {1, 2, 3, 4, 5};
    CHECK(bytes.assign(source, sizeof(source)));
    CHECK(bytes.size() == 5 && bytes[0] == 1 && bytes[4] == 5);
    CHECK(bytes.end() - bytes.begin() == 5);

    // Oversized input is rejected and leaves the buffer empty, never truncated.
    const uint8_t oversized[9] = {};
    CHECK(!bytes.assign(oversized, sizeof(oversized)));
    CHECK(bytes.empty());
    CHECK(!bytes.assign(nullptr, 1));
    CHECK(bytes.assign(nullptr, 0) && bytes.empty());

    CHECK(bytes.assign_fill(8, 0xAB));
    CHECK(bytes.size() == 8 && bytes[7] == 0xAB);
    CHECK(!bytes.assign_fill(9, 0));
    CHECK(bytes.empty());
}

void test_deque_basics_and_wraparound() {
    BoundedDeque<int, 4> deque;
    CHECK(deque.empty());
    CHECK(deque.push_back(1) && deque.push_back(2) && deque.push_back(3));
    deque.pop_front();
    deque.pop_front();
    // Wrap the ring: head is now at slot 2.
    CHECK(deque.push_back(4) && deque.push_back(5) && deque.push_back(6));
    CHECK(deque.full());
    CHECK(!deque.push_back(7));
    CHECK(!deque.push_front(0));
    CHECK(deque.front() == 3 && deque.back() == 6);

    std::vector<int> seen;
    for (int value : deque) {
        seen.push_back(value);
    }
    CHECK((seen == std::vector<int>{3, 4, 5, 6}));

    // Reverse iteration from end(), as the coalescing policy does.
    seen.clear();
    for (auto it = deque.end(); it != deque.begin();) {
        --it;
        seen.push_back(*it);
    }
    CHECK((seen == std::vector<int>{6, 5, 4, 3}));

    // Erase from the middle, the front and the back.
    auto it = deque.begin();
    ++it;
    it = deque.erase(it);
    CHECK(*it == 5);
    CHECK(deque.size() == 3);
    deque.erase(deque.begin());
    CHECK(deque.front() == 5);
    auto last = deque.begin();
    ++last;
    deque.erase(last);
    CHECK(deque.size() == 1 && deque.front() == 5 && deque.back() == 5);
    CHECK(deque.erase(deque.end()) == deque.end());

    CHECK(deque.push_front(9));
    CHECK(deque.front() == 9 && deque.back() == 5);
    deque.clear();
    CHECK(deque.empty() && deque.begin() == deque.end());
    deque.pop_front();
    CHECK(deque.empty());
}

struct Packet {
    uint8_t kind;
    uint8_t id;

    bool operator==(Packet const &other) const { return kind == other.kind && id == other.id; }
};

DeliveryKind kind_of(Packet const &packet) {
    return static_cast<DeliveryKind>(packet.kind);
}

template <typename Queue>
std::vector<Packet> contents(Queue const &queue) {
    std::vector<Packet> out;
    for (auto const &packet : queue) {
        out.push_back(packet);
    }
    return out;
}

// Applies the same pseudo-random admissions, coalescing, requeues and drains
// to std::deque and BoundedDeque and requires identical results throughout.
void test_policy_differential() {
    constexpr std::size_t kSoftCap = 6;
    constexpr std::size_t kHardCap = 10;
    std::deque<Packet> reference;
    BoundedDeque<Packet, kHardCap> bounded;
    uint32_t state = 0x12345678u;
    auto next = [&]() {
        state = state * 1664525u + 1013904223u;
        return state >> 8;
    };
    for (unsigned step = 0; step < 20000; ++step) {
        const unsigned action = next() % 10;
        const Packet packet{static_cast<uint8_t>(next() % 4), static_cast<uint8_t>(step)};
        if (action < 6) {
            Packet reference_packet = packet;
            Packet bounded_packet = packet;
            const bool reference_coalesced = ds5::classic_rumble::coalesce_latest_managed_active(
                reference, std::move(reference_packet), kind_of);
            const bool bounded_coalesced = ds5::classic_rumble::coalesce_latest_managed_active(
                bounded, std::move(bounded_packet), kind_of);
            CHECK(reference_coalesced == bounded_coalesced);
            if (!reference_coalesced) {
                const AdmissionResult reference_result = ds5::classic_rumble::enqueue_with_soft_cap(
                    reference, packet, kSoftCap, kHardCap, kind_of);
                const AdmissionResult bounded_result = ds5::classic_rumble::enqueue_with_soft_cap(
                    bounded, packet, kSoftCap, kHardCap, kind_of);
                CHECK(reference_result == bounded_result);
            }
        } else if (action < 9) {
            CHECK(reference.empty() == bounded.empty());
            if (!reference.empty()) {
                CHECK(reference.front() == bounded.front());
                reference.pop_front();
                bounded.pop_front();
            }
        } else if (reference.size() < kHardCap) {
            ds5::classic_rumble::requeue_failed_front(reference, packet);
            ds5::classic_rumble::requeue_failed_front(bounded, packet);
        }
        CHECK(reference.size() == bounded.size());
        CHECK(contents(reference) == contents(bounded));
    }
}

} // namespace

int main() {
    test_inline_bytes();
    test_deque_basics_and_wraparound();
    test_policy_differential();
    std::printf("Bounded container checks passed\n");
    return 0;
}
