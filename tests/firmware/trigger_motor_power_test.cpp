// Trigger intensity must only change the trigger (high) nibble of DualSense
// motor power and must compose with the game's own reduction.

#include <cstdint>
#include <cstdio>
#include <cstdlib>

#include "trigger_motor_power.h"

#define CHECK(condition) \
    do { \
        if (!(condition)) { \
            std::fprintf(stderr, "trigger motor power check failed at %d: %s\n", __LINE__, #condition); \
            std::exit(1); \
        } \
    } while (0)

using ds5::trigger_power::trigger_motor_power_from_percent;
using ds5::trigger_power::with_trigger_motor_power;

int main() {
    // Full and zero intensity leave the trigger nibble alone (zero means the
    // effect is switched off instead).
    CHECK(trigger_motor_power_from_percent(100) == 0x00);
    CHECK(trigger_motor_power_from_percent(0) == 0x00);
    CHECK(trigger_motor_power_from_percent(50) == 0x50);
    CHECK(trigger_motor_power_from_percent(10) == 0x90);
    CHECK(trigger_motor_power_from_percent(1) == 0xa0);

    // Body rumble (low nibble) always survives a trigger intensity change;
    // 1.x wrote the trigger reduction into this nibble.
    for (uint8_t body = 0; body <= 0x0a; ++body) {
        for (unsigned intensity = 0; intensity <= 100; ++intensity) {
            const uint8_t power = with_trigger_motor_power(body, static_cast<uint8_t>(intensity));
            CHECK((power & 0x0f) == body);
        }
    }
    CHECK(with_trigger_motor_power(0x03, 50) == 0x53);
    CHECK(with_trigger_motor_power(0x07, 100) == 0x07);

    // A game reduction is never weakened: 50% of a game that already reduced
    // triggers by 40% lands between the two, never below the game's request.
    const uint8_t combined = with_trigger_motor_power(0x42, 50);
    CHECK((combined & 0x0f) == 0x02);
    CHECK((combined >> 4) >= 4 && (combined >> 4) <= 10);
    CHECK(combined == 0x72);
    for (uint8_t game = 1; game <= 10; ++game) {
        for (unsigned intensity = 1; intensity < 100; ++intensity) {
            const uint8_t power = with_trigger_motor_power(static_cast<uint8_t>(game << 4), static_cast<uint8_t>(intensity));
            CHECK((power >> 4) >= game);
            CHECK((power >> 4) <= 10);
        }
    }
    std::printf("Trigger motor power checks passed\n");
    return 0;
}
