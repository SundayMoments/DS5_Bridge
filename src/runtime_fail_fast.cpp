#include "runtime_fail_fast.h"

#include "hardware/watchdog.h"
#include "pico/platform.h"

// watchdog_enable(0, ...) triggers the same immediate reset as
// watchdog_reboot(0, 0, 0) but also writes the SCRATCH4 marker, so the next
// boot reports an abnormal reset instead of looking like a clean boot.
[[noreturn]] __attribute__((cold, noinline)) void runtime_fail_fast() {
    watchdog_enable(0, false);
    while (true) {
        tight_loop_contents();
    }
}

// Production Opus objects are compiled with cmake/opus_fatal_override.h, which
// rewrites celt_fatal(message, file, line) to this argument-free hook so the
// diagnostic strings are never emitted. Hardening checks still run.
extern "C" [[noreturn]] void ds5_celt_fatal_noargs() {
    runtime_fail_fast();
}

// audio.cpp creates its encoder with OPUS_APPLICATION_RESTRICTED_CELT, which
// never allocates, initializes or runs the SILK encoder. The link wraps both
// SILK entry points here so --gc-sections can discard that encoder tree from
// SRAM. Reaching either stub means the codec configuration regressed. The SILK
// decoder stays for the microphone path.
extern "C" [[noreturn]] void __wrap_silk_Encode() {
    runtime_fail_fast();
}

extern "C" [[noreturn]] void __wrap_silk_InitEncoder() {
    runtime_fail_fast();
}

// The encoder runs at complexity 0, below the threshold at which Opus runs its
// tonality analysis, so the analysis code and its MLP weights are retired the
// same way. Initialization and reset are reached on every encoder create and
// OPUS_RESET_STATE; they only touched the analysis state, which stays zeroed.
// tonality_get_info is only called after a completed analysis frame and leaves
// the caller's AnalysisInfo at its "not valid" default.
extern "C" [[noreturn]] void __wrap_run_analysis() {
    runtime_fail_fast();
}

extern "C" void __wrap_tonality_analysis_init(void *, int) {}

extern "C" void __wrap_tonality_analysis_reset(void *) {}

extern "C" void __wrap_tonality_get_info(void *, void *, int) {}
