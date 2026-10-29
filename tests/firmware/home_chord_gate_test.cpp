// The PS/Home chord gate: taps replay once, holds stay held, and a PS chord
// never also reaches the host as a PS press (GitHub #163).

#include <cstdint>
#include <cstdio>
#include <cstdlib>

#include "home_chord_gate.h"

#define CHECK(condition) \
    do { \
        if (!(condition)) { \
            std::fprintf(stderr, "home chord gate check failed at %d: %s\n", __LINE__, #condition); \
            std::exit(1); \
        } \
    } while (0)

namespace gate = ds5::home_chord_gate;

namespace {

constexpr uint32_t kReportUs = 4000;

struct Run {
    gate::State state{};
    uint32_t now = 0;
    unsigned host_presses = 0;
    bool host_pressed = false;

    // Feeds reports for duration_us and returns how many reports showed PS.
    unsigned feed(uint32_t duration_us, bool physical, bool consumed = false, bool enabled = true) {
        unsigned shown = 0;
        for (uint32_t t = 0; t < duration_us; t += kReportUs) {
            const bool pressed = gate::step(state, enabled, physical, consumed, now);
            if (pressed) {
                ++shown;
            }
            if (pressed && !host_pressed) {
                ++host_presses;
            }
            host_pressed = pressed;
            now += kReportUs;
        }
        return shown;
    }
};

} // namespace

int main() {
    // Gate off: PS passes straight through.
    {
        Run run;
        CHECK(run.feed(100000, true, false, false) == 100000 / kReportUs);
        CHECK(run.feed(20000, false, false, false) == 0);
        CHECK(run.host_presses == 1);
    }

    // A tap inside the window is hidden, then replayed once on release.
    {
        Run run;
        CHECK(run.feed(100000, true) == 0);
        const unsigned replayed = run.feed(200000, false);
        CHECK(replayed > 0);
        CHECK(replayed * kReportUs <= gate::kFallbackReplayUs + kReportUs);
        CHECK(run.host_presses == 1);
    }

    // A long hold is hidden for the window, then held continuously until
    // release. 1.6.3-2.0.0 re-armed the window every report after it expired,
    // blinking PS about four times a second and replaying it on release.
    {
        Run run;
        CHECK(run.feed(gate::kSuppressUs, true) == 0);
        const unsigned held = run.feed(2000000, true);
        CHECK(held == 2000000 / kReportUs);
        CHECK(run.feed(200000, false) == 0);
        CHECK(run.host_presses == 1);
    }

    // A chord while PS is held: PS stays hidden even when the other button is
    // released first, and nothing replays after the chord.
    {
        Run run;
        CHECK(run.feed(60000, true) == 0);
        CHECK(run.feed(120000, true, true) == 0);
        CHECK(run.feed(100000, true) == 0);
        CHECK(run.feed(200000, false) == 0);
        CHECK(run.host_presses == 0);
    }

    // Holding PS after a chord, well past the window, still never shows it.
    {
        Run run;
        CHECK(run.feed(40000, true, true) == 0);
        CHECK(run.feed(1000000, true) == 0);
        CHECK(run.feed(100000, false) == 0);
        CHECK(run.host_presses == 0);
    }

    // After a chord, the next separate tap behaves like a fresh tap.
    {
        Run run;
        run.feed(40000, true, true);
        run.feed(100000, false);
        CHECK(run.feed(60000, true) == 0);
        CHECK(run.feed(200000, false) > 0);
        CHECK(run.host_presses == 1);
    }

    // A shortcut chord after the window: PS was held by then, so it is
    // released for the chord and stays hidden until PS is let go.
    {
        Run run;
        run.feed(gate::kSuppressUs + 100000, true);
        CHECK(run.host_pressed);
        CHECK(run.feed(80000, true, true) == 0);
        CHECK(run.feed(400000, true) == 0);
        CHECK(run.feed(100000, false) == 0);
        CHECK(run.host_presses == 1);
    }

    // The window is wrap-safe across the 32-bit microsecond counter.
    {
        Run run;
        run.now = 0xFFFFFFFFu - 100000u;
        CHECK(run.feed(gate::kSuppressUs, true) == 0);
        CHECK(run.feed(100000, true) == 100000 / kReportUs);
    }

    std::printf("Home chord gate checks passed\n");
    return 0;
}
