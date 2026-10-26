#include "runtime_fail_fast.h"

#include <cstring>

#include "hardware/watchdog.h"
#include "pico/platform.h"

// A zero-delay watchdog_enable triggers the same immediate reset as a
// zero-delay watchdog reboot but also writes the SCRATCH4 marker, so the next
// boot keeps the retained breadcrumb instead of looking like a clean boot.
[[noreturn]] __attribute__((cold, noinline)) void runtime_fail_fast(WatchdogResetReason reason) {
    watchdog_telemetry_record_reset_reason(reason);
    watchdog_enable(0, false);
    while (true) {
        tight_loop_contents();
    }
}

// Selected by PICO_PANIC_FUNCTION. The SDK default prints through stdio (which
// release builds do not have) and then halts, which before watchdog_enable()
// left the bridge dead until it was unplugged. Pico's malloc wrapper panics
// before a failed allocation can reach a caller's NULL check.
extern "C" [[noreturn]] void ds5_runtime_panic(char const *message, ...) {
    WatchdogResetReason reason = WatchdogResetReason::Panic;
    if (message != nullptr && std::strcmp(message, "Out of memory") == 0) {
        reason = WatchdogResetReason::OutOfMemory;
    }
    runtime_fail_fast(reason);
}

// Exceptions are disabled in the firmware. Allocation and container contract
// failures cannot be recovered from, so reset without linking libstdc++'s
// exception construction, demangling and verbose termination machinery.
namespace std {

[[noreturn]] void __throw_bad_alloc() {
    runtime_fail_fast(WatchdogResetReason::OutOfMemory);
}

[[noreturn]] void __throw_bad_array_new_length() {
    runtime_fail_fast(WatchdogResetReason::OutOfMemory);
}

[[noreturn]] void __throw_length_error(char const *) {
    runtime_fail_fast(WatchdogResetReason::ContainerContract);
}

[[noreturn]] void __throw_out_of_range_fmt(char const *, ...) {
    runtime_fail_fast(WatchdogResetReason::ContainerContract);
}

} // namespace std

// Production Opus objects are compiled with cmake/opus_fatal_override.h, which
// rewrites celt_fatal(message, file, line) to this argument-free hook so the
// diagnostic strings are never emitted. Hardening checks still run.
extern "C" [[noreturn]] void ds5_celt_fatal_noargs() {
    runtime_fail_fast(WatchdogResetReason::CodecFatal);
}

// audio.cpp creates its encoder with OPUS_APPLICATION_RESTRICTED_CELT, which
// never allocates, initializes or runs the SILK encoder. The link wraps both
// SILK entry points here so --gc-sections can discard that encoder tree from
// SRAM. Reaching either stub means the codec configuration regressed. The SILK
// decoder stays for the microphone path.
extern "C" [[noreturn]] void __wrap_silk_Encode() {
    runtime_fail_fast(WatchdogResetReason::CodecFatal);
}

extern "C" [[noreturn]] void __wrap_silk_InitEncoder() {
    runtime_fail_fast(WatchdogResetReason::CodecFatal);
}

// The encoder runs at complexity 0, below the threshold at which Opus runs its
// tonality analysis, so the analysis code and its MLP weights are retired the
// same way. Initialization and reset are reached on every encoder create and
// OPUS_RESET_STATE; they only touched the analysis state, which stays zeroed.
// tonality_get_info is only called after a completed analysis frame and leaves
// the caller's AnalysisInfo at its "not valid" default.
extern "C" [[noreturn]] void __wrap_run_analysis() {
    runtime_fail_fast(WatchdogResetReason::CodecFatal);
}

// These three run from the SRAM codec on core 1, so they stay beside it.
extern "C" void __not_in_flash_func(__wrap_tonality_analysis_init)(void *, int) {}

extern "C" void __not_in_flash_func(__wrap_tonality_analysis_reset)(void *) {}

extern "C" void __not_in_flash_func(__wrap_tonality_get_info)(void *, void *, int) {}
