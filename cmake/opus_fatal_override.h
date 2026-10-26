// Forced into every Opus translation unit ahead of celt/arch.h.
//
// Opus hardening expands celt_assert() into celt_fatal(message, __FILE__,
// __LINE__). The firmware's handler ignores all three arguments and resets
// through the watchdog, so the message and source-path strings only ever
// occupied memory. Redefining the hook before Opus declares it keeps the checks
// and discards their arguments at preprocessing time. OVERRIDE_celt_fatal keeps
// arch.h from emitting its own definition.
#ifndef DS5_OPUS_FATAL_OVERRIDE_H
#define DS5_OPUS_FATAL_OVERRIDE_H

#ifdef __GNUC__
__attribute__((noreturn))
#endif
void ds5_celt_fatal_noargs(void);

#define celt_fatal(str, file, line) ds5_celt_fatal_noargs()

#endif
