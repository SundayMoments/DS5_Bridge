#ifndef DS5_BRIDGE_COMPANION_H
#define DS5_BRIDGE_COMPANION_H

#include <cstdint>
#include "tusb.h"
#include "debug_config.h"

#define KEYBOARD_HID_INSTANCE 1
#define COMPANION_REPORT_STATUS 0x01
#define COMPANION_REPORT_COMMAND 0x02
#define COMPANION_REPORT_ACK 0x03
#define COMPANION_REPORT_INPUT 0x04
#define COMPANION_REPORT_AUDIO_DEBUG 0x05
#define COMPANION_REPORT_AUDIO_STATS 0x06
#define COMPANION_REPORT_AUDIO_STATUS 0x08
#define COMPANION_REPORT_TRIGGER_TRACE 0x09
#define COMPANION_REPORT_FEEDBACK_TRACE 0x0A
#define COMPANION_PAYLOAD_SIZE 63

enum CompanionTriggerTraceStage : uint8_t {
    CompanionTriggerTraceHost = 1,
    CompanionTriggerTraceBridgeIn = 2,
    CompanionTriggerTraceBridgeOut = 3,
    CompanionTriggerTraceBt = 4,
    CompanionTriggerTraceDrop = 5,
};

enum CompanionFeedbackTraceStage : uint8_t {
    CompanionFeedbackTraceHost = 1,
    CompanionFeedbackTraceBridgeIn = 2,
    CompanionFeedbackTraceBridgeOut = 3,
    CompanionFeedbackTraceBt = 4,
    CompanionFeedbackTraceDrop = 5,
    CompanionFeedbackTraceAudioEnqueue = 8,
    CompanionFeedbackTraceAudioDrop = 9,
    CompanionFeedbackTraceLocalAudio = 10,
};

void companion_init();
void companion_loop();
void companion_process_controller_report(uint8_t *report, uint16_t len);
void companion_update_controller_report(uint8_t const *report, uint16_t len);
void companion_note_host_output_report(uint8_t const *report, uint16_t len);
#if DS5_TRIGGER_TRACE_ENABLED
void companion_note_trigger_trace_report(
    uint8_t stage,
    uint8_t const *report,
    uint16_t len,
    uint8_t decision = 0
);
#else
static inline void companion_note_trigger_trace_report(
    uint8_t,
    uint8_t const *,
    uint16_t,
    uint8_t = 0
) {
}
#endif
#if DS5_FEEDBACK_TRACE_ENABLED
void companion_note_feedback_trace_report(
    uint8_t stage,
    uint8_t const *report,
    uint16_t len,
    uint8_t decision = 0,
    uint8_t detail0 = 0,
    uint8_t detail1 = 0,
    uint8_t detail2 = 0,
    uint8_t detail3 = 0
);
void companion_note_feedback_trace_samples(
    uint8_t stage,
    uint8_t const *samples,
    uint16_t len,
    uint8_t detail0 = 0,
    uint8_t detail1 = 0,
    uint8_t detail2 = 0,
    uint8_t detail3 = 0
);
#else
static inline void companion_note_feedback_trace_report(
    uint8_t,
    uint8_t const *,
    uint16_t,
    uint8_t = 0,
    uint8_t = 0,
    uint8_t = 0,
    uint8_t = 0,
    uint8_t = 0
) {
}
static inline void companion_note_feedback_trace_samples(
    uint8_t,
    uint8_t const *,
    uint16_t,
    uint8_t = 0,
    uint8_t = 0,
    uint8_t = 0,
    uint8_t = 0
) {
}
#endif
bool companion_apply_trigger_effect_intensity(uint8_t *payload, uint16_t len);
bool companion_lightbar_override_enabled();
uint16_t companion_get_report(uint8_t report_id, hid_report_type_t report_type, uint8_t *buffer, uint16_t reqlen);
void companion_set_report(uint8_t report_id, hid_report_type_t report_type, uint8_t const *buffer, uint16_t bufsize);

#endif // DS5_BRIDGE_COMPANION_H
