#pragma once

#include <cstddef>
#include <cstdint>
#include <cstring>
#include <type_traits>

#include "hardware/sync.h"
#include "pico/critical_section.h"
#include "pico/platform.h"

// The Pico SDK queue reserves element_count + 1 heap elements to distinguish
// full from empty. Audio elements are large enough that those hidden slots cost
// more than 5 KiB. This ring tracks its count explicitly, so Capacity is both
// the usable and physical element count.
//
// Producers also remove the oldest element when full. A shared striped Pico
// spinlock preserves that cross-core behavior without consuming one of the
// scarce dynamically claimable spinlocks.
template <typename T, std::size_t Capacity>
class ExactAudioQueue {
    static_assert(Capacity > 0);
    static_assert(Capacity <= UINT16_MAX);
    static_assert(std::is_trivially_copyable_v<T>);

public:
    void init() {
        critical_section_init_with_lock_num(
            &critical_section_,
            next_striped_spin_lock_num()
        );
        read_index_ = 0;
        write_index_ = 0;
        count_ = 0;
    }

    __force_inline bool try_add(T const *element) {
        if (element == nullptr) {
            return false;
        }

        critical_section_enter_blocking(&critical_section_);
        if (count_ == Capacity) {
            critical_section_exit(&critical_section_);
            return false;
        }
        std::memcpy(&storage_[write_index_], element, sizeof(T));
        write_index_ = next_index(write_index_);
        count_++;
        critical_section_exit(&critical_section_);
        return true;
    }

    __force_inline bool try_remove(T *element) {
        critical_section_enter_blocking(&critical_section_);
        if (count_ == 0) {
            critical_section_exit(&critical_section_);
            return false;
        }
        if (element != nullptr) {
            std::memcpy(element, &storage_[read_index_], sizeof(T));
        }
        read_index_ = next_index(read_index_);
        count_--;
        critical_section_exit(&critical_section_);
        return true;
    }

    __force_inline uint16_t level() {
        critical_section_enter_blocking(&critical_section_);
        const uint16_t result = count_;
        critical_section_exit(&critical_section_);
        return result;
    }

    __force_inline bool empty() {
        return level() == 0;
    }

    __force_inline bool full() {
        return level() == Capacity;
    }

    __force_inline void clear() {
        critical_section_enter_blocking(&critical_section_);
        read_index_ = 0;
        write_index_ = 0;
        count_ = 0;
        critical_section_exit(&critical_section_);
    }

private:
    static constexpr uint16_t next_index(uint16_t index) {
        index++;
        return index == Capacity ? 0 : index;
    }

    T storage_[Capacity]{};
    critical_section_t critical_section_{};
    uint16_t read_index_ = 0;
    uint16_t write_index_ = 0;
    uint16_t count_ = 0;
};

template <typename T, std::size_t Capacity>
__force_inline bool queue_try_add(
    ExactAudioQueue<T, Capacity> *queue,
    T const *element
) {
    return queue->try_add(element);
}

template <typename T, std::size_t Capacity>
__force_inline bool queue_try_remove(
    ExactAudioQueue<T, Capacity> *queue,
    T *element
) {
    return queue->try_remove(element);
}

template <typename T, std::size_t Capacity>
__force_inline uint16_t queue_get_level(ExactAudioQueue<T, Capacity> *queue) {
    return queue->level();
}

template <typename T, std::size_t Capacity>
__force_inline bool queue_is_empty(ExactAudioQueue<T, Capacity> *queue) {
    return queue->empty();
}

template <typename T, std::size_t Capacity>
__force_inline bool queue_is_full(ExactAudioQueue<T, Capacity> *queue) {
    return queue->full();
}
