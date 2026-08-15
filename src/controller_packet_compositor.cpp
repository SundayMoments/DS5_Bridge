#include "controller_packet_compositor.h"

#include "controller_output_state.h"
#include "dualsense_output.h"
#ifdef PICO_ON_DEVICE
#include "pico.h"
#else
#define __not_in_flash_func(function_name) function_name
#endif

namespace {

void init_bt_output_report_with_sequence(uint8_t *report, uint8_t sequence_counter) {
    ds5::output::init_bt_output_report(report, static_cast<uint8_t>(sequence_counter & 0x0F));
}

} // namespace

void controller_packet_init_bt_output_report(uint8_t *report, uint8_t &sequence_counter) {
    init_bt_output_report_with_sequence(report, sequence_counter);
    sequence_counter = static_cast<uint8_t>((sequence_counter + 1) & 0x0F);
}

void controller_packet_init_bt_output_report(uint8_t *report, int &sequence_counter) {
    init_bt_output_report_with_sequence(report, static_cast<uint8_t>(sequence_counter));
    sequence_counter = (sequence_counter + 1) & 0x0F;
}

void __not_in_flash_func(controller_packet_copy_audio_snapshot)(uint8_t *destination, bool headset_plugged) {
    controller_output_state_copy_audio_snapshot(destination, headset_plugged);
}
