#ifndef DS5_BRIDGE_RUNTIME_FAIL_FAST_H
#define DS5_BRIDGE_RUNTIME_FAIL_FAST_H

#include "watchdog_telemetry.h"

// Record why, then reset immediately through the watchdog without formatting,
// allocating or taking locks. Safe on either core and before the main
// watchdog is armed; the next boot reports an abnormal reset.
[[noreturn]] void runtime_fail_fast(WatchdogResetReason reason);

#endif
