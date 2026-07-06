//
// Created by awalol on 2026/3/4.
// Modified for DS5 Bridge companion firmware and app integration.
//

#ifndef DS5_BRIDGE_USB_H
#define DS5_BRIDGE_USB_H

#define DEFAULT_COMPANION_SPEAKER_GAIN 0.30f

extern uint8_t mute[2]; // 0: speaker/LED fallback, 1: mic/idle-disconnect fallback
extern float volume[2]; // 0: companion speaker gain, 1: haptics gain
extern uint8_t usb_host_volume_percent[3]; // Speaker, mic, raw line capture.
extern uint8_t usb_host_mute[3]; // Speaker, mic, raw line capture.
extern uint32_t usb_host_volume_set_count[3];
extern float usb_host_speaker_gain; // Host UAC speaker volume as linear gain.

void usb_device_stack_init_disconnected();
uint8_t usb_hid_polling_rate_mode();
bool usb_set_hid_polling_rate_mode(uint8_t mode);
void usb_request_reconnect();
void usb_note_hid_output();
bool usb_host_hid_output_recent();
void usb_pm_poll();
void usb_set_suspend_disconnect_enabled(bool enabled);
bool usb_suspend_disconnect_enabled();
bool usb_host_suspended_active();
bool usb_speaker_streaming_active();
bool usb_mic_streaming_active();
bool usb_line_streaming_active();
void usb_handle_controller_transport_disconnect();
void usb_handle_controller_transport_ready();

#endif //DS5_BRIDGE_USB_H
