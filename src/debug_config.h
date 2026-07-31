//
// Central firmware diagnostics switchboard.
//
// Build-time knobs live in CMakeLists.txt. This header provides the firmware
// defaults and compatibility aliases so debug feature checks stay consistent.
//

#ifndef DS5_BRIDGE_DEBUG_CONFIG_H
#define DS5_BRIDGE_DEBUG_CONFIG_H

#ifdef DS5_ENABLE_DEBUG_LOGS
#define DS5_DEBUG_LOGS_ENABLED 1
#else
#ifndef DS5_DEBUG_LOGS_ENABLED
#define DS5_DEBUG_LOGS_ENABLED 0
#endif
#endif

#ifndef DS5_AUDIO_DEBUG_ENABLED
#define DS5_AUDIO_DEBUG_ENABLED 0
#endif

#ifndef DS5_TRIGGER_TRACE_ENABLED
#define DS5_TRIGGER_TRACE_ENABLED 0
#endif

#ifndef DS5_FEEDBACK_TRACE_ENABLED
#define DS5_FEEDBACK_TRACE_ENABLED 0
#endif

#if DS5_AUDIO_DEBUG_ENABLED || DS5_DEBUG_LOGS_ENABLED
#define DS5_AUDIO_TRANSPORT_STATS_ENABLED 1
#else
#define DS5_AUDIO_TRANSPORT_STATS_ENABLED 0
#endif

#if DS5_AUDIO_DEBUG_ENABLED || DS5_TRIGGER_TRACE_ENABLED || DS5_FEEDBACK_TRACE_ENABLED
#define DS5_COMPANION_DIAGNOSTICS_ENABLED 1
#else
#define DS5_COMPANION_DIAGNOSTICS_ENABLED 0
#endif

#endif
