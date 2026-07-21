#ifndef DS5_BRIDGE_CLASSIC_RUMBLE_DELIVERY_POLICY_H
#define DS5_BRIDGE_CLASSIC_RUMBLE_DELIVERY_POLICY_H

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <utility>

namespace ds5::classic_rumble {

enum class DeliveryKind : uint8_t {
    Other = 0,
    HostPassthrough,
    ManagedActive,
    ManagedStop,
};

enum class AdmissionResult : uint8_t {
    Enqueued = 0,
    SoftCapRejected,
    HardCapReached,
};

inline constexpr uint32_t kRetryBaseDelayUs = 5'000u;
inline constexpr uint32_t kRetryMaxDelayUs = 80'000u;
inline constexpr uint8_t kFailClosedRetryCount = 8;

constexpr bool is_classic_rumble(DeliveryKind kind) {
    return kind != DeliveryKind::Other;
}

constexpr bool is_terminal_stop(DeliveryKind kind) {
    return kind == DeliveryKind::ManagedStop;
}

constexpr bool tracks_delivery_state(DeliveryKind kind) {
    return kind == DeliveryKind::ManagedActive || kind == DeliveryKind::ManagedStop;
}

constexpr bool protected_from_soft_cap(DeliveryKind kind) {
    return is_terminal_stop(kind);
}

constexpr bool droppable_under_pressure(DeliveryKind kind) {
    return !protected_from_soft_cap(kind);
}

constexpr uint32_t retry_delay_us(uint8_t retry_count) {
    uint32_t delay_us = kRetryBaseDelayUs;
    uint8_t shifts = retry_count > 0 ? static_cast<uint8_t>(retry_count - 1) : 0;
    while (shifts > 0 && delay_us < kRetryMaxDelayUs) {
        delay_us = delay_us > (kRetryMaxDelayUs / 2u)
            ? kRetryMaxDelayUs
            : delay_us * 2u;
        --shifts;
    }
    return delay_us;
}

constexpr bool retry_requires_fail_closed(uint8_t retry_count) {
    return retry_count >= kFailClosedRetryCount;
}

template <typename Queue, typename Packet, typename KindOf>
AdmissionResult enqueue_with_soft_cap(
    Queue &queue,
    Packet &&packet,
    std::size_t soft_cap,
    std::size_t hard_cap,
    KindOf kind_of
) {
    if (queue.size() >= hard_cap) {
        return AdmissionResult::HardCapReached;
    }

    const DeliveryKind incoming_kind = kind_of(packet);
    if (!protected_from_soft_cap(incoming_kind)) {
        const std::size_t evictions_required = queue.size() >= soft_cap
            ? queue.size() - soft_cap + 1u
            : 0u;
        const std::size_t droppable_count = static_cast<std::size_t>(std::count_if(
            queue.begin(),
            queue.end(),
            [&](auto const &queued) {
                return droppable_under_pressure(kind_of(queued));
            }
        ));
        if (droppable_count < evictions_required) {
            return AdmissionResult::SoftCapRejected;
        }
        for (std::size_t evicted = 0; evicted < evictions_required; ++evicted) {
            const auto droppable = std::find_if(
                queue.begin(),
                queue.end(),
                [&](auto const &queued) {
                    return droppable_under_pressure(kind_of(queued));
                }
            );
            queue.erase(droppable);
        }
    }

    queue.push_back(std::forward<Packet>(packet));
    return AdmissionResult::Enqueued;
}

template <typename Queue, typename Packet>
void requeue_failed_front(Queue &queue, Packet &&packet) {
    queue.push_front(std::forward<Packet>(packet));
}

} // namespace ds5::classic_rumble

#endif // DS5_BRIDGE_CLASSIC_RUMBLE_DELIVERY_POLICY_H
