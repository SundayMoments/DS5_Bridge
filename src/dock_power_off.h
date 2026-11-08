#pragma once
#include <cstdint>

// Stateful, allocation-free decoder of DualSense's dedicated DockDetect flag.
// All methods are called from the core-0 input/USB loop.
namespace ds5::dock {
class PowerOffDetector {
public:
    static constexpr uint32_t kConfirmUs = 2'000'000u;
    static constexpr uint32_t kMaxReportGapUs = 750'000u;

    void reset() {
        active_ = false;
        fired_ = false;
        first_us_ = 0;
        last_us_ = 0;
    }

    void observe(bool docked, uint32_t now_us) {
        if (!docked) {
            reset();
            return;
        }
        if (!active_ || static_cast<uint32_t>(now_us - last_us_) > kMaxReportGapUs) {
            active_ = true;
            fired_ = false;
            first_us_ = now_us;
        }
        last_us_ = now_us;
    }

    bool take_power_off(uint32_t now_us) {
        if (!active_ || fired_) return false;
        if (static_cast<uint32_t>(now_us - last_us_) > kMaxReportGapUs) {
            reset();
            return false;
        }
        if (static_cast<uint32_t>(now_us - first_us_) < kConfirmUs) return false;
        fired_ = true;
        return true;
    }

private:
    uint32_t first_us_ = 0;
    uint32_t last_us_ = 0;
    bool active_ = false;
    bool fired_ = false;
};
} // namespace ds5::dock

// Default false: automatic power-off on a charging cradle is enabled.
void dock_power_off_set_disabled(bool disabled);
bool dock_power_off_disabled();
