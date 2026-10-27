#ifndef DS5_BRIDGE_HOST_INPUT_H
#define DS5_BRIDGE_HOST_INPUT_H

void host_input_prepare_persona_switch();
void host_input_note_usb_mounted();
// The controller's IN endpoint is free again; chains any pending report.
void host_input_report_complete();

#endif // DS5_BRIDGE_HOST_INPUT_H
