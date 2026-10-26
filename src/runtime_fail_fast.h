#ifndef DS5_BRIDGE_RUNTIME_FAIL_FAST_H
#define DS5_BRIDGE_RUNTIME_FAIL_FAST_H

// Reset immediately through the watchdog without formatting, allocating or
// taking locks. Safe on either core and before the main watchdog is armed.
[[noreturn]] void runtime_fail_fast();

#endif
