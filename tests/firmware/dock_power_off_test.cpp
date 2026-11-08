#include "../../src/dock_power_off.h"
#include <cassert>
#include <cstdint>
int main() {
    ds5::dock::PowerOffDetector d{};
    const uint32_t t = 1'000'000u;
    assert(!d.take_power_off(t));
    d.observe(true, t);
    d.observe(true, t + 700'000u);
    d.observe(true, t + 1'400'000u);
    assert(!d.take_power_off(t + 1'400'000u));
    d.observe(true, t + 2'000'000u);
    assert(d.take_power_off(t + 2'000'000u));
    assert(!d.take_power_off(t + 2'000'000u)); // once per dock
    d.observe(true, t + 2'100'000u);
    assert(!d.take_power_off(t + 2'100'000u));
    d.observe(false, t + 2'200'000u);
    d.observe(true, t + 2'300'000u);
    d.observe(true, t + 3'000'000u);
    d.observe(true, t + 3'700'000u);
    d.observe(true, t + 4'300'000u);
    assert(d.take_power_off(t + 4'300'000u)); // re-dock
    d.reset(); // disconnected / opt-out
    d.observe(true, t);
    assert(!d.take_power_off(t + 2'100'000u)); // stale packets
    d.observe(true, t + 2'200'000u);
    assert(!d.take_power_off(t + 2'300'000u));

    const uint32_t wrap = 0xfffffff0u;
    d.reset();
    d.observe(true, wrap);
    d.observe(true, wrap + 700'000u);
    d.observe(true, wrap + 1'400'000u);
    d.observe(true, wrap + 2'000'000u);
    assert(d.take_power_off(wrap + 2'000'000u)); // clock wraps
}
