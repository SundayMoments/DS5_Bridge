#ifndef DS5_BRIDGE_KEYBOARD_TAP_SEQUENCER_H
#define DS5_BRIDGE_KEYBOARD_TAP_SEQUENCER_H

#include <array>
#include <cstddef>
#include <cstdint>

// Ported from Kitsune Input's keyboard tap sequencer.

namespace ds5 {

inline constexpr std::size_t kBootKeyboardReportSize = 8;
inline constexpr std::size_t kBootKeyboardUsageOffset = 2;

struct BootKeyboardOutputReport {
    std::array<uint8_t, kBootKeyboardReportSize> bytes{};

    [[nodiscard]] bool operator==(BootKeyboardOutputReport const &) const = default;
};

inline constexpr std::size_t kKeyboardTapQueueDepth = 4;
// A person presses a shortcut's modifiers before its key and releases the key
// first. The lead and trail each span a 60 fps frame, so a game that samples
// key state once per frame also sees the modifier held across the key's edge.
inline constexpr uint32_t kKeyboardTapModifierLeadUs = 20000;
inline constexpr uint32_t kKeyboardTapHoldUs = 60000;
inline constexpr uint32_t kKeyboardTapModifierTrailUs = 20000;
// A stage transport has not taken by then (keyboard interface not polled)
// abandons its tap and the queue, so nothing replays late.
inline constexpr uint32_t kKeyboardTapDeliveryTimeoutUs = 250000;

// Types boot-keyboard taps one at a time: modifiers, then modifiers and keys,
// then modifiers, then nothing. A tap without modifiers or without keys skips
// the modifier stages. Each stage starts only after transport has taken the
// previous one, so the host receives every stage in its own report, and the
// stage times run from that delivery. A queued tap ends the current hold early,
// but the release still reaches the host before the next press. A held tap
// keeps its keys down until release(), and still lasts at least the hold.
class KeyboardTapSequencer {
public:
    // Queues a tap. A full queue drops its oldest waiting tap.
    void enqueue(BootKeyboardOutputReport const &report, bool held = false);
    // Lets every held tap finish like an ordinary tap.
    void release();
    // Drops waiting taps and releases the current one at once.
    void cancel();
    // Forgets every tap, for an owner that has already cleared its output.
    void reset();

    // Called on every loop pass. `delivered` is true once transport has taken
    // the last accepted report. Returns true with the report to send next; the
    // caller then calls accept_report() once transport holds it, or asks again
    // on the next pass.
    [[nodiscard]] bool next_report(
        uint32_t now_us,
        bool delivered,
        BootKeyboardOutputReport &report
    );
    void accept_report(uint32_t now_us);

    [[nodiscard]] bool idle() const;
    [[nodiscard]] std::size_t queued() const;

private:
    enum class Stage : uint8_t {
        Idle,
        ModifierLead,
        Held,
        KeyRelease,
        Releasing,
    };

    [[nodiscard]] bool stage_elapsed(uint32_t now_us, uint32_t duration_us) const;
    [[nodiscard]] bool propose(
        Stage stage,
        BootKeyboardOutputReport const &report,
        BootKeyboardOutputReport &out
    );

    std::array<BootKeyboardOutputReport, kKeyboardTapQueueDepth> queue_{};
    std::array<bool, kKeyboardTapQueueDepth> queue_held_{};
    BootKeyboardOutputReport tap_{};
    // The stage's acceptance time until transport takes it, then its delivery time.
    uint32_t stage_since_us_ = 0;
    Stage stage_ = Stage::Idle;
    Stage proposed_ = Stage::Idle;
    uint8_t queue_head_ = 0;
    uint8_t queue_count_ = 0;
    bool stage_delivered_ = false;
    bool tap_held_ = false;
    bool cancel_ = false;
};

} // namespace ds5

#endif // DS5_BRIDGE_KEYBOARD_TAP_SEQUENCER_H
