#ifndef DS5_BRIDGE_BOUNDED_CONTAINERS_H
#define DS5_BRIDGE_BOUNDED_CONTAINERS_H

#include <array>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <iterator>
#include <utility>

// Fixed-capacity storage for the Bluetooth output path. These replace
// std::vector/std::deque packet storage so no send, retry or feature request
// allocates: newlib's allocator ran on the hot path with interrupts masked and
// exposed long sessions to heap fragmentation.
namespace ds5 {

// A byte buffer with inline storage and a small subset of std::vector's API.
template <std::size_t Capacity>
class InlineBytes {
    static_assert(Capacity > 0 && Capacity <= UINT16_MAX);

public:
    static constexpr std::size_t capacity() { return Capacity; }

    uint8_t *data() { return bytes_.data(); }
    uint8_t const *data() const { return bytes_.data(); }
    std::size_t size() const { return size_; }
    bool empty() const { return size_ == 0; }
    void clear() { size_ = 0; }

    uint8_t *begin() { return bytes_.data(); }
    uint8_t *end() { return bytes_.data() + size_; }
    uint8_t const *begin() const { return bytes_.data(); }
    uint8_t const *end() const { return bytes_.data() + size_; }

    uint8_t &operator[](std::size_t index) { return bytes_[index]; }
    uint8_t const &operator[](std::size_t index) const { return bytes_[index]; }

    // Oversized input is rejected and leaves the buffer empty, never truncated.
    [[nodiscard]] bool assign(uint8_t const *source, std::size_t count) {
        if (count > Capacity || (count != 0 && source == nullptr)) {
            size_ = 0;
            return false;
        }
        if (count != 0) {
            std::memcpy(bytes_.data(), source, count);
        }
        size_ = static_cast<uint16_t>(count);
        return true;
    }

    [[nodiscard]] bool assign_fill(std::size_t count, uint8_t value) {
        if (count > Capacity) {
            size_ = 0;
            return false;
        }
        std::memset(bytes_.data(), value, count);
        size_ = static_cast<uint16_t>(count);
        return true;
    }

private:
    std::array<uint8_t, Capacity> bytes_{};
    uint16_t size_ = 0;
};

// A ring-buffer deque with fixed capacity. Supports the operations the output
// scheduler and the classic-rumble admission policy use: both-ended push/pop,
// bidirectional iteration and single-element erase.
template <typename T, std::size_t Capacity>
class BoundedDeque {
    static_assert(Capacity > 0 && Capacity <= 255);

    template <typename Owner, typename Value>
    class basic_iterator {
    public:
        using iterator_category = std::bidirectional_iterator_tag;
        using value_type = T;
        using difference_type = std::ptrdiff_t;
        using pointer = Value *;
        using reference = Value &;

        basic_iterator() = default;
        basic_iterator(Owner *owner, std::size_t position) : owner_(owner), position_(position) {}

        reference operator*() const { return owner_->at_position(position_); }
        pointer operator->() const { return &owner_->at_position(position_); }
        basic_iterator &operator++() { ++position_; return *this; }
        basic_iterator operator++(int) { basic_iterator previous = *this; ++position_; return previous; }
        basic_iterator &operator--() { --position_; return *this; }
        basic_iterator operator--(int) { basic_iterator previous = *this; --position_; return previous; }
        bool operator==(basic_iterator const &other) const { return position_ == other.position_ && owner_ == other.owner_; }
        bool operator!=(basic_iterator const &other) const { return !(*this == other); }
        std::size_t position() const { return position_; }

    private:
        Owner *owner_ = nullptr;
        std::size_t position_ = 0;
    };

public:
    using value_type = T;
    using iterator = basic_iterator<BoundedDeque, T>;
    using const_iterator = basic_iterator<BoundedDeque const, T const>;

    static constexpr std::size_t capacity() { return Capacity; }

    bool empty() const { return count_ == 0; }
    std::size_t size() const { return count_; }
    bool full() const { return count_ == Capacity; }

    T &front() { return at_position(0); }
    T const &front() const { return at_position(0); }
    T &back() { return at_position(count_ - 1); }
    T const &back() const { return at_position(count_ - 1); }

    iterator begin() { return iterator(this, 0); }
    iterator end() { return iterator(this, count_); }
    const_iterator begin() const { return const_iterator(this, 0); }
    const_iterator end() const { return const_iterator(this, count_); }

    // A full deque rejects new elements; callers enforce their own caps first.
    bool push_back(T value) {
        if (full()) {
            return false;
        }
        slots_[physical(count_)] = std::move(value);
        ++count_;
        return true;
    }

    bool push_front(T value) {
        if (full()) {
            return false;
        }
        head_ = head_ == 0 ? Capacity - 1 : head_ - 1;
        slots_[head_] = std::move(value);
        ++count_;
        return true;
    }

    // Vacated slots are not cleared; every slot is overwritten before reuse.
    void pop_front() {
        if (count_ == 0) {
            return;
        }
        head_ = (head_ + 1) % Capacity;
        --count_;
    }

    // Removes one element and returns the iterator to its successor.
    iterator erase(iterator position) {
        const std::size_t index = position.position();
        if (index >= count_) {
            return end();
        }
        if (index == 0) {
            pop_front();
            return begin();
        }
        for (std::size_t i = index; i + 1 < count_; ++i) {
            at_position(i) = std::move(at_position(i + 1));
        }
        --count_;
        return iterator(this, index);
    }

    void clear() {
        head_ = 0;
        count_ = 0;
    }

private:
    template <typename, typename>
    friend class basic_iterator;

    std::size_t physical(std::size_t position) const { return (head_ + position) % Capacity; }
    T &at_position(std::size_t position) { return slots_[physical(position)]; }
    T const &at_position(std::size_t position) const { return slots_[physical(position)]; }

    std::array<T, Capacity> slots_{};
    std::size_t head_ = 0;
    std::size_t count_ = 0;
};

} // namespace ds5

#endif // DS5_BRIDGE_BOUNDED_CONTAINERS_H
