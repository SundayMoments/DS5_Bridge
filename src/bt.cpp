//
// Created by awalol on 2026/3/4.
// Modified for DS5 Bridge companion firmware and app integration.
//

#include <algorithm>
#include <cstdio>
#include <cstring>

#include "bt.h"

#include <queue>
#include <unordered_map>
#include <utility>
#include <vector>

#include "audio.h"
#include "controller_packet_compositor.h"
#include "controller_output_policy.h"
#include "controller_output_rumble_state.h"
#include "controller_output_state.h"
#include "output_scheduler.h"
#ifdef ENABLE_COMPANION
#include "companion.h"
#endif
#include "btstack_event.h"
#include "controller_report.h"
#include "gap.h"
#include "l2cap.h"
#include "pico/cyw43_arch.h"
#include "pico/stdio.h"
#include "usb.h"
#include "utils.h"
#include "bsp/board_api.h"
#include "hardware/watchdog.h"
#include "pico/sync.h"
#include "pico/time.h"
#include "classic/sdp_server.h"

#define MTU_CONTROL 256
#define MTU_INTERRUPT 1691
#define DS_OUTPUT_REPORT_BT 0x31
#define DS_OUTPUT_REPORT_BT_SIZE 78
#define DS_OUTPUT_REPORT_COMMON_SIZE 47
#define DS_OUTPUT_TAG 0x10
#define DS_OUTPUT_VALID_FLAG0_COMPATIBLE_VIBRATION 0x01
#define DS_OUTPUT_VALID_FLAG0_HAPTICS_SELECT 0x02
#define DS_OUTPUT_VALID_FLAG0_RIGHT_TRIGGER_EFFECT 0x04
#define DS_OUTPUT_VALID_FLAG0_LEFT_TRIGGER_EFFECT 0x08
#define DS_OUTPUT_VALID_FLAG0_SPEAKER_VOLUME_ENABLE 0x20
#define DS_OUTPUT_VALID_FLAG0_MIC_VOLUME_ENABLE 0x40
#define DS_OUTPUT_VALID_FLAG0_AUDIO_CONTROL_ENABLE 0x80
#define DS_OUTPUT_VALID_FLAG1_MIC_MUTE_LED_CONTROL_ENABLE 0x01
#define DS_OUTPUT_VALID_FLAG1_POWER_SAVE_CONTROL_ENABLE 0x02
#define DS_OUTPUT_VALID_FLAG1_LIGHTBAR_CONTROL_ENABLE 0x04
#define DS_OUTPUT_VALID_FLAG1_RELEASE_LEDS 0x08
#define DS_OUTPUT_VALID_FLAG1_PLAYER_INDICATOR_CONTROL_ENABLE 0x10
#define DS_OUTPUT_VALID_FLAG1_HAPTIC_LOW_PASS_FILTER_ENABLE 0x20
#define DS_OUTPUT_VALID_FLAG1_MOTOR_POWER_LEVEL_ENABLE 0x40
#define DS_OUTPUT_VALID_FLAG1_AUDIO_CONTROL2_ENABLE 0x80
#define DS_OUTPUT_VALID_FLAG2_LIGHTBAR_SETUP_CONTROL_ENABLE 0x02
#define DS_OUTPUT_VALID_FLAG2_ENABLE_IMPROVED_RUMBLE_EMULATION 0x04
#define DS_OUTPUT_VALID_FLAG2_USE_RUMBLE_NOT_HAPTICS2 0x08
#define DS_OUTPUT_AUDIO_FLAGS_OUTPUT_PATH_HEADPHONES 0x00
#define DS_OUTPUT_AUDIO_FLAGS_OUTPUT_PATH_SPEAKER 0x30
#define DS_OUTPUT_POWER_SAVE_CONTROL_MIC_MUTE 0x10
#define DS_OUTPUT_HEADPHONE_VOLUME_MAX 0x7f
#define DS_OUTPUT_SPEAKER_VOLUME_MAX 0x64
#define DS_OUTPUT_MIC_VOLUME_MAX 0x40
#define DS_OUTPUT_AUDIO_FLAGS2_SPEAKER_PREAMP_GAIN 0x04
#define DS_OUTPUT_LIGHTBAR_SETUP_LIGHT_OUT 0x02
#define DS_TRIGGER_EFFECT_SIZE 11
#define DS_TRIGGER_EFFECT_RIGHT_OFFSET 10
#define DS_TRIGGER_EFFECT_LEFT_OFFSET 21
#define DS_TRIGGER_EFFECT_POWER_OFFSET 36
#define DS_TRIGGER_EFFECT_OFF 0x05
#define DS_TRIGGER_EFFECT_FEEDBACK 0x21
#define DS_TRIGGER_EFFECT_WEAPON 0x25
#define DS_TRIGGER_EFFECT_VIBRATION 0x26
#define DS_TRIGGER_TARGET_BOTH 0
#define DS_TRIGGER_TARGET_LEFT 1
#define DS_TRIGGER_TARGET_RIGHT 2
#define AUDIO_SEND_QUEUE_MAX_DEPTH 4
#define URGENT_SEND_QUEUE_MAX_DEPTH 16
#define OUTPUT_AUDIO_MAX_AGE_US 3000
#define OUTPUT_MAX_CONSECUTIVE_NON_AUDIO_SENDS 1
#define CONTROL_SEND_QUEUE_MAX_DEPTH 8
#define CONTROL_SEND_HEADSET_AUDIO_SAFE_WINDOW_US 6000
#define CONTROL_SEND_HEADSET_AUDIO_IDLE_US 20000
#define CYW43_POWER_CYCLE_HOLD_MS 750
#define CONTROLLER_DISCONNECT_REBOOT_DELAY_MS 25
#define DEFAULT_IDLE_DISCONNECT_TIMEOUT_MINUTES 15
#define MIN_IDLE_DISCONNECT_TIMEOUT_MINUTES 1
#define MAX_IDLE_DISCONNECT_TIMEOUT_MINUTES 120
#define OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET 0
#define OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET 1
#define OUTPUT_PAYLOAD_MOTOR_RIGHT_OFFSET 2
#define OUTPUT_PAYLOAD_MOTOR_LEFT_OFFSET 3
#define OUTPUT_PAYLOAD_HEADPHONE_VOLUME_OFFSET 4
#define OUTPUT_PAYLOAD_SPEAKER_VOLUME_OFFSET 5
#define OUTPUT_PAYLOAD_MIC_VOLUME_OFFSET 6
#define OUTPUT_PAYLOAD_AUDIO_CONTROL_OFFSET 7
#define OUTPUT_PAYLOAD_MUTE_LED_OFFSET 8
#define OUTPUT_PAYLOAD_POWER_SAVE_CONTROL_OFFSET 9
#define OUTPUT_PAYLOAD_TRIGGER_POWER_OFFSET 36
#define OUTPUT_PAYLOAD_AUDIO_CONTROL2_OFFSET 37
#define OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET 38
#define OUTPUT_PAYLOAD_HAPTIC_LOW_PASS_FILTER_OFFSET 39
#define OUTPUT_PAYLOAD_LED_BRIGHTNESS_OFFSET 42
#define OUTPUT_PAYLOAD_PLAYER_LEDS_OFFSET 43
#define OUTPUT_PAYLOAD_LIGHTBAR_RED_OFFSET 44
#define OUTPUT_PAYLOAD_LIGHTBAR_GREEN_OFFSET 45
#define OUTPUT_PAYLOAD_LIGHTBAR_BLUE_OFFSET 46
#define RSSI_POLL_INTERVAL_US 2000000u
#define RSSI_REQUEST_TIMEOUT_US 1000000u
#define INQUIRY_RETRY_DELAY_US 2000000u
#define ACL_CONNECTION_PENDING_TIMEOUT_US 10000000u
#define HID_CHANNEL_RECOVERY_DELAY_US 2000000u
#define HID_CHANNEL_RECOVERY_MAX_ATTEMPTS 5

#define HCI_SEND_CMD_LOGGED(cmd, ...) do { \
    const uint8_t err = hci_send_cmd((cmd), ##__VA_ARGS__); \
    if (err != 0) { \
        DS5_LOG("[HCI] %s failed err=0x%02X\n", opcode_to_str((cmd)->opcode), err); \
    } \
} while (0)

using std::unordered_map;
using std::vector;
using std::queue;

enum OutputPacketClass : uint8_t {
    OutputPacketUrgent = 1,
    OutputPacketAudio = 2,
    OutputPacketState = 3,
};

enum OutputClassificationReason : uint8_t {
    OutputReasonUnknown = 0,
    OutputReasonCriticalDirect = 1,
    OutputReasonAudioStream = 2,
    OutputReasonStateOnly = 3,
    OutputReasonCriticalFlags = 4,
    OutputReasonCriticalPayload = 5,
    OutputReasonStateNoop = 6,
    OutputReasonClassicRumbleImmediate = 7,
};

enum BtAudioDebugKind : uint8_t {
    BtAudioDebugLateAudio = 1,
    BtAudioDebugNonAudioAheadOfQueuedAudio = 2,
    BtAudioDebugControlSend = 3,
};

enum OutputTraceFlag : uint8_t {
    OutputTraceStatePending = 0x01,
    OutputTraceAudioProtected = 0x02,
    OutputTraceAudioRecent = 0x04,
    OutputTraceUsbSpeakerActive = 0x10,
    OutputTraceClassicRumbleActive = 0x20,
    OutputTraceSelectedAudio = 0x40,
    OutputTraceSelectedNonAudio = 0x80,
};

enum OutputTraceTransform : uint8_t {
    OutputTraceTransformStrippedZeroRumble = 0x01,
    OutputTraceTransformSplitState = 0x02,
    OutputTraceTransformAudioProtected = 0x04,
    OutputTraceTransformClassicRumble = 0x08,
    OutputTraceTransformFeedbackState = 0x10,
    OutputTraceTransformState = 0x20,
};

struct output_packet {
    vector<uint8_t> data;
    uint32_t enqueue_time_us;
    uint8_t packet_class;
    uint8_t report_id;
    uint8_t reason;
    uint8_t trace_detail0;
    uint8_t trace_detail1;
    uint8_t trace_detail2;
    uint8_t trace_detail3;
};

struct control_packet {
    vector<uint8_t> data;
    uint32_t enqueue_time_us;
    uint8_t report_id;
    bool coalescible;
};

struct output_scheduler_counters {
    uint32_t audio_queue_depth;
    uint32_t audio_queue_max_depth;
    uint32_t audio_0x36_max_age_us;
    uint32_t audio_0x36_send_gap_max_us;
    uint32_t audio_0x36_late_count_over_12000_us;
    uint32_t state_pending_age_us;
    uint32_t state_coalesce_count;
    uint32_t consecutive_state_sends;
    uint32_t audio_drop_oldest_count;
    uint32_t audio_0x36_sent_count;
    uint32_t audio_0x36_enqueued_count;
    uint32_t normal_0x31_rx_count;
    uint32_t normal_0x31_sent_count;
    uint32_t non_audio_reports_between_audio_max;
    uint32_t bt_send_gap_max_us;
};

static void hci_packet_handler(uint8_t packet_type, uint16_t channel, uint8_t *packet, uint16_t size);
static void l2cap_packet_handler(uint8_t packet_type, uint16_t channel, uint8_t *packet, uint16_t size);
static bool build_interrupt_output_packet(uint8_t *data, uint16_t len, vector<uint8_t> &packet);
static bool enqueue_urgent_output(uint8_t *data, uint16_t len, uint8_t reason);
static bool enqueue_state_output(uint8_t *data, uint16_t len, uint8_t reason);
static bool enqueue_feedback_state_output(uint8_t *data, uint16_t len, uint8_t reason);
static bool enqueue_control_packet(uint8_t const *data, uint16_t len, bool coalescible);
static bool select_next_control_packet_locked(control_packet &packet, uint32_t now);
static void request_can_send_if_needed(bool should_request_send);
static void request_control_can_send_if_needed(bool should_request_send);
static bool headset_audio_send_window_closed_locked(uint32_t now);
static bool state_send_blocked_by_audio_locked(uint32_t now);
static void request_control_if_audio_window_open_locked(uint32_t now, bool &should_request_control);
static void init_state_report(uint8_t *report);
static bool select_next_output_packet_locked(output_packet &packet, uint32_t now);
static bool audio_output_route_protected();
static bool output_report_payload(
    uint8_t const *data,
    uint16_t len,
    uint8_t const *&payload,
    uint16_t &payload_len
);
static void mirror_pending_classic_rumble_locked(uint8_t const *data, uint16_t len);

static btstack_packet_callback_registration_t hci_event_callback_registration, l2cap_event_callback_registration;
static bd_addr_t current_device_addr;
static bool device_found = false; // Outbound inquiry target found; do not set for incoming ACL requests.
static bool new_pair = false; // Only newly paired devices create channels; auto-reconnect uses the services.
static bool inquiry_active = false;
static uint32_t inquiry_retry_at_us = 0;
static bool acl_connection_pending = false;
static uint32_t acl_connection_pending_at_us = 0;
static hci_con_handle_t acl_handle = HCI_CON_HANDLE_INVALID;
static uint16_t hid_control_cid;
static uint16_t hid_interrupt_cid;
static bt_data_callback_t bt_data_callback = nullptr;
static uint8_t controller_type = ControllerTypeUnknown;
static bool controller_type_check_pending = false;
static bool hid_control_ready = false;
static bool hid_interrupt_ready = false;
static bool hid_channel_recovery_pending = false;
static uint32_t hid_channel_recovery_at_us = 0;
static uint8_t hid_channel_recovery_attempts = 0;
static int8_t bt_rssi = 0;
static bool bt_rssi_known = false;
static bool bt_rssi_request_pending = false;
static uint32_t bt_rssi_last_request_us = 0;
unordered_map<uint8_t, vector<uint8_t> > feature_data;
static bool feature_prefetch_active = false;
static queue<output_packet> urgent_queue;
static queue<output_packet> audio_queue;
static vector<control_packet> control_queue;
static uint8_t state_pending_report[DS_OUTPUT_REPORT_BT_SIZE];
static bool state_pending = false;
static uint32_t state_pending_since_us = 0;
static uint8_t state_pending_reason = OutputReasonStateOnly;
static output_scheduler_counters output_counters{};
static uint32_t last_bt_send_us = 0;
static uint32_t last_audio_0x36_send_us = 0;
static uint32_t non_audio_reports_since_audio = 0;
static uint8_t consecutive_non_audio_sends = 0;
static critical_section_t queue_lock;
uint32_t inactive_time = 0; // Tracks long controller inactivity.
static uint16_t idle_disconnect_timeout_minutes = DEFAULT_IDLE_DISCONNECT_TIMEOUT_MINUTES;
static uint8_t saved_lightbar_red = 0xff;
static uint8_t saved_lightbar_green = 0xd7;
static uint8_t saved_lightbar_blue = 0x00;
static uint8_t saved_lightbar_brightness = 100;
static bool player_led_enabled = true;
static bool lightbar_restore_pending = false;
static uint32_t lightbar_restore_at_us = 0;
static uint8_t state_report_seq = 0;
static bool speaker_output_enabled = false;
static bool speaker_output_headset_route = false;
static uint8_t speaker_output_gain = DS_OUTPUT_AUDIO_FLAGS2_SPEAKER_PREAMP_GAIN;
static uint8_t companion_mic_volume_percent = 100;
static ControllerOutputRumbleStateMachine classic_rumble_state{};

static void update_max_u32(uint32_t &current, uint32_t candidate) {
    if (candidate > current) {
        current = candidate;
    }
}

static void clear_packet_queue(queue<output_packet> &packets) {
    while (!packets.empty()) {
        packets.pop();
    }
}

static bool control_pending_locked() {
    return !control_queue.empty();
}

static void clear_output_queues_locked() {
    clear_packet_queue(urgent_queue);
    clear_packet_queue(audio_queue);
    control_queue.clear();
    state_pending = false;
    memset(state_pending_report, 0, sizeof(state_pending_report));
    consecutive_non_audio_sends = 0;
    non_audio_reports_since_audio = 0;
    last_bt_send_us = 0;
    last_audio_0x36_send_us = 0;
    output_counters.audio_queue_depth = 0;
    output_counters.consecutive_state_sends = 0;
    classic_rumble_state = ControllerOutputRumbleStateMachine{};
}

static void reset_controller_output_session_locked() {
    clear_output_queues_locked();
    controller_output_state_clear_classic_rumble();
    state_report_seq = 0;
    speaker_output_enabled = false;
    speaker_output_headset_route = false;
    lightbar_restore_pending = false;
    lightbar_restore_at_us = 0;
}

static bool output_pending_locked() {
    return !urgent_queue.empty() || !audio_queue.empty() || state_pending;
}

static void power_down_cyw43_for_reboot() {
#ifdef CYW43_PIN_RFSW_VDD
    cyw43_hal_pin_config(CYW43_PIN_RFSW_VDD, CYW43_HAL_PIN_MODE_OUTPUT, CYW43_HAL_PIN_PULL_NONE, 0);
    cyw43_hal_pin_low(CYW43_PIN_RFSW_VDD);
#endif
#ifdef CYW43_PIN_WL_REG_ON
    cyw43_hal_pin_config(CYW43_PIN_WL_REG_ON, CYW43_HAL_PIN_MODE_OUTPUT, CYW43_HAL_PIN_PULL_NONE, 0);
    cyw43_hal_pin_low(CYW43_PIN_WL_REG_ON);
#endif
    sleep_ms(CYW43_POWER_CYCLE_HOLD_MS);
}

static void update_queue_depth_counters_locked() {
    output_counters.audio_queue_depth = static_cast<uint32_t>(audio_queue.size());
    update_max_u32(output_counters.audio_queue_max_depth, output_counters.audio_queue_depth);
}

static uint32_t packet_age_us(uint32_t now, uint32_t enqueue_time_us) {
    return static_cast<uint32_t>(now - enqueue_time_us);
}

static bool bt_time_reached(uint32_t now, uint32_t target) {
    return static_cast<int32_t>(now - target) >= 0;
}

static void clear_acl_connection_pending() {
    acl_connection_pending = false;
    acl_connection_pending_at_us = 0;
}

static void mark_acl_connection_pending() {
    acl_connection_pending = true;
    acl_connection_pending_at_us = time_us_32();
}

static void clear_outbound_inquiry_target() {
    device_found = false;
    new_pair = false;
}

static void schedule_inquiry_retry(uint32_t delay_us = INQUIRY_RETRY_DELAY_US) {
    inquiry_active = false;
    inquiry_retry_at_us = time_us_32() + delay_us;
}

static void start_inquiry_if_needed() {
    if (
        inquiry_active
        || device_found
        || acl_connection_pending
        || acl_handle != HCI_CON_HANDLE_INVALID
    ) {
        return;
    }

    DS5_LOG("[HCI] Start inquiry\n");
    gap_connectable_control(1);
    gap_discoverable_control(1);
    gap_inquiry_start(30);
    inquiry_active = true;
}

static uint8_t clamp_output_trace_u8(uint32_t value) {
    return static_cast<uint8_t>(value > 255 ? 255 : value);
}

static uint8_t output_trace_route_flags_locked() {
    uint8_t flags = state_pending ? OutputTraceStatePending : 0;
    if (audio_output_route_protected()) {
        flags |= OutputTraceAudioProtected;
    }
    if (audio_recent()) {
        flags |= OutputTraceAudioRecent;
    }
    if (usb_speaker_streaming_active()) {
        flags |= OutputTraceUsbSpeakerActive;
    }
    if (classic_rumble_state.classic_rumble_active) {
        flags |= OutputTraceClassicRumbleActive;
    }
    return flags;
}

static uint8_t output_trace_selected_flag(uint8_t packet_class) {
    return packet_class == OutputPacketAudio ? OutputTraceSelectedAudio : OutputTraceSelectedNonAudio;
}

static void set_output_trace_details_locked(
    output_packet &packet,
    uint32_t now,
    uint8_t critical_depth,
    uint8_t audio_depth,
    uint8_t route_flags
) {
    packet.trace_detail0 = critical_depth;
    packet.trace_detail1 = audio_depth;
    packet.trace_detail2 = route_flags | output_trace_selected_flag(packet.packet_class);
    packet.trace_detail3 = clamp_output_trace_u8(packet_age_us(now, packet.enqueue_time_us) / 1000);
}

static void output_trace_queue_details_locked(
    uint8_t &critical_depth,
    uint8_t &audio_depth,
    uint8_t &route_flags
) {
    critical_depth = clamp_output_trace_u8(static_cast<uint32_t>(urgent_queue.size()));
    audio_depth = clamp_output_trace_u8(static_cast<uint32_t>(audio_queue.size()));
    route_flags = output_trace_route_flags_locked();
}

static void output_trace_queue_details(
    uint8_t &critical_depth,
    uint8_t &audio_depth,
    uint8_t &route_flags
) {
    critical_section_enter_blocking(&queue_lock);
    output_trace_queue_details_locked(critical_depth, audio_depth, route_flags);
    critical_section_exit(&queue_lock);
}

void bt_register_data_callback(bt_data_callback_t callback) {
    bt_data_callback = callback;
}

bool bt_is_controller_connected() {
    return hid_interrupt_ready;
}

uint8_t bt_controller_type() {
    return controller_type;
}

int8_t bt_get_signal_strength() {
    return bt_rssi;
}

bool bt_has_signal_strength() {
    return bt_rssi_known;
}

void bt_set_classic_rumble_gain(uint16_t gain_percent) {
    controller_output_policy_set_classic_rumble_gain(gain_percent);
}

uint16_t bt_classic_rumble_gain() {
    return controller_output_policy_classic_rumble_gain();
}

void bt_set_classic_rumble_v1_enabled(bool enabled) {
    controller_output_policy_set_classic_rumble_v1_enabled(enabled);
}

bool bt_classic_rumble_v1_enabled() {
    return controller_output_policy_classic_rumble_v1_enabled();
}

bool bt_apply_classic_rumble_gain_payload(uint8_t *payload, uint16_t len) {
    return controller_output_policy_apply_classic_rumble_gain_payload(payload, len);
}

static bool apply_classic_rumble_gain(uint8_t *data, uint16_t len) {
    if (data == nullptr || len < 3 + DS_OUTPUT_REPORT_COMMON_SIZE) {
        return false;
    }
    if (data[0] != DS_OUTPUT_REPORT_BT || data[2] != DS_OUTPUT_TAG) {
        return false;
    }

    return bt_apply_classic_rumble_gain_payload(data + 3, len - 3);
}

static void remember_classic_rumble_state_from_output(uint8_t const *data, uint16_t len) {
    uint8_t const *payload = nullptr;
    uint16_t payload_len = 0;
    if (!output_report_payload(data, len, payload, payload_len)) {
        return;
    }

    controller_output_rumble_state_apply_payload(classic_rumble_state, payload, payload_len);
}

void bt_set_classic_rumble_output(uint8_t right, uint8_t left) {
    if (hid_interrupt_cid == 0) {
        return;
    }

    uint8_t report[DS_OUTPUT_REPORT_BT_SIZE];
    init_state_report(report);
    controller_output_policy_render_classic_rumble_payload(report + 3, DS_OUTPUT_REPORT_COMMON_SIZE, right, left);
    if (bt_write_classified_output(report, sizeof(report))) {
        controller_output_state_apply_host_payload(report + 3, DS_OUTPUT_REPORT_COMMON_SIZE);
    }
}

static uint8_t scale_lightbar_channel(uint8_t channel, uint8_t brightness_percent) {
    return static_cast<uint8_t>((static_cast<uint16_t>(channel) * brightness_percent + 50) / 100);
}

static void init_state_report(uint8_t *report) {
    controller_packet_init_bt_output_report(report, state_report_seq);
}

static uint8_t trigger_strength_from_percent(uint8_t intensity_percent) {
    if (intensity_percent == 0) {
        return 0;
    }
    const uint8_t clamped = intensity_percent > 100 ? 100 : intensity_percent;
    const uint8_t strength = static_cast<uint8_t>((clamped * 8 + 99) / 100);
    return strength == 0 ? 1 : strength;
}

static uint8_t trigger_position_from_percent(uint8_t percent) {
    const uint8_t clamped = percent > 100 ? 100 : percent;
    return static_cast<uint8_t>(std::min<uint16_t>(9, (static_cast<uint16_t>(clamped) + 5) / 10));
}

static uint8_t trigger_frequency_from_percent(uint8_t percent) {
    const uint8_t clamped = percent > 100 ? 100 : percent;
    const uint8_t frequency = static_cast<uint8_t>((static_cast<uint16_t>(clamped) * 28 + 50) / 100);
    return frequency == 0 ? 1 : frequency;
}

static void set_trigger_off(uint8_t *trigger) {
    memset(trigger, 0, DS_TRIGGER_EFFECT_SIZE);
    trigger[0] = DS_TRIGGER_EFFECT_OFF;
}

static void set_trigger_feedback(uint8_t *trigger, uint8_t position, uint8_t strength) {
    if (strength == 0) {
        set_trigger_off(trigger);
        return;
    }

    memset(trigger, 0, DS_TRIGGER_EFFECT_SIZE);
    position = position > 9 ? 9 : position;
    strength = strength > 8 ? 8 : strength;

    const uint8_t force_value = (strength - 1) & 0x07;
    uint16_t active_zones = 0;
    uint32_t force_zones = 0;
    for (uint8_t zone = position; zone < 10; zone++) {
        active_zones |= static_cast<uint16_t>(1 << zone);
        force_zones |= static_cast<uint32_t>(force_value) << (3 * zone);
    }

    trigger[0] = DS_TRIGGER_EFFECT_FEEDBACK;
    trigger[1] = static_cast<uint8_t>(active_zones & 0xff);
    trigger[2] = static_cast<uint8_t>((active_zones >> 8) & 0xff);
    trigger[3] = static_cast<uint8_t>(force_zones & 0xff);
    trigger[4] = static_cast<uint8_t>((force_zones >> 8) & 0xff);
    trigger[5] = static_cast<uint8_t>((force_zones >> 16) & 0xff);
    trigger[6] = static_cast<uint8_t>((force_zones >> 24) & 0xff);
}

static void set_trigger_weapon(uint8_t *trigger, uint8_t start_position, uint8_t end_position, uint8_t strength) {
    if (strength == 0 || end_position <= start_position) {
        set_trigger_off(trigger);
        return;
    }

    memset(trigger, 0, DS_TRIGGER_EFFECT_SIZE);
    start_position = start_position < 2 ? 2 : start_position;
    start_position = start_position > 7 ? 7 : start_position;
    end_position = end_position > 8 ? 8 : end_position;
    strength = strength > 8 ? 8 : strength;

    const uint16_t start_and_stop_zones = static_cast<uint16_t>((1 << start_position) | (1 << end_position));
    trigger[0] = DS_TRIGGER_EFFECT_WEAPON;
    trigger[1] = static_cast<uint8_t>(start_and_stop_zones & 0xff);
    trigger[2] = static_cast<uint8_t>((start_and_stop_zones >> 8) & 0xff);
    trigger[3] = static_cast<uint8_t>((strength - 1) & 0x07);
}

static void set_trigger_vibration(uint8_t *trigger, uint8_t position, uint8_t amplitude, uint8_t frequency) {
    if (amplitude == 0 || frequency == 0) {
        set_trigger_off(trigger);
        return;
    }

    memset(trigger, 0, DS_TRIGGER_EFFECT_SIZE);
    position = position > 9 ? 9 : position;
    amplitude = amplitude > 8 ? 8 : amplitude;

    const uint8_t strength_value = (amplitude - 1) & 0x07;
    uint16_t active_zones = 0;
    uint32_t amplitude_zones = 0;
    for (uint8_t zone = position; zone < 10; zone++) {
        active_zones |= static_cast<uint16_t>(1 << zone);
        amplitude_zones |= static_cast<uint32_t>(strength_value) << (3 * zone);
    }

    trigger[0] = DS_TRIGGER_EFFECT_VIBRATION;
    trigger[1] = static_cast<uint8_t>(active_zones & 0xff);
    trigger[2] = static_cast<uint8_t>((active_zones >> 8) & 0xff);
    trigger[3] = static_cast<uint8_t>(amplitude_zones & 0xff);
    trigger[4] = static_cast<uint8_t>((amplitude_zones >> 8) & 0xff);
    trigger[5] = static_cast<uint8_t>((amplitude_zones >> 16) & 0xff);
    trigger[6] = static_cast<uint8_t>((amplitude_zones >> 24) & 0xff);
    trigger[9] = frequency;
}

static void reset_lightbar_setup() {
    if (hid_interrupt_cid == 0) {
        return;
    }

    uint8_t report[DS_OUTPUT_REPORT_BT_SIZE];
    init_state_report(report);
    report[3 + 38] = DS_OUTPUT_VALID_FLAG2_LIGHTBAR_SETUP_CONTROL_ENABLE;
    report[3 + 41] = DS_OUTPUT_LIGHTBAR_SETUP_LIGHT_OUT;
    bt_write(report, sizeof(report));
}

void bt_set_adaptive_trigger_effect(uint8_t mode, uint8_t intensity_percent, uint8_t target) {
    if (hid_interrupt_cid == 0) {
        return;
    }

    const uint8_t strength = trigger_strength_from_percent(intensity_percent);
    uint8_t report[DS_OUTPUT_REPORT_BT_SIZE];
    init_state_report(report);
    report[3] = 0x04 | 0x08;
    uint8_t *right_trigger = report + 3 + DS_TRIGGER_EFFECT_RIGHT_OFFSET;
    uint8_t *left_trigger = report + 3 + DS_TRIGGER_EFFECT_LEFT_OFFSET;
    set_trigger_off(right_trigger);
    set_trigger_off(left_trigger);

    auto apply_effect = [&](uint8_t *trigger) {
        if (strength == 0) {
            set_trigger_off(trigger);
        } else if (mode == 1) {
            set_trigger_weapon(trigger, 2, 7, strength);
        } else if (mode == 2) {
            set_trigger_vibration(trigger, 3, strength, 18);
        } else {
            set_trigger_feedback(trigger, 3, strength);
        }
    };

    if (target == DS_TRIGGER_TARGET_LEFT || target == DS_TRIGGER_TARGET_BOTH) {
        apply_effect(left_trigger);
    }
    if (target == DS_TRIGGER_TARGET_RIGHT || target == DS_TRIGGER_TARGET_BOTH) {
        apply_effect(right_trigger);
    }
    bt_write(report, sizeof(report));
}

static void set_custom_trigger_effect(
    uint8_t *trigger,
    uint8_t mode,
    uint8_t start_percent,
    uint8_t wall_percent,
    uint8_t force_percent
) {
    const uint8_t strength = trigger_strength_from_percent(force_percent);
    uint8_t start_position = trigger_position_from_percent(start_percent);
    uint8_t wall_position = trigger_position_from_percent(wall_percent);
    const uint8_t frequency = trigger_frequency_from_percent(wall_percent);

    if (strength == 0) {
        set_trigger_off(trigger);
    } else if (mode == 1) {
        start_position = std::min<uint8_t>(std::max<uint8_t>(start_position, 2), 7);
        wall_position = std::min<uint8_t>(std::max<uint8_t>(wall_position, static_cast<uint8_t>(start_position + 1)), 8);
        set_trigger_weapon(trigger, start_position, wall_position, strength);
    } else if (mode == 2) {
        set_trigger_vibration(trigger, start_position, strength, frequency);
    } else {
        set_trigger_feedback(trigger, start_position, strength);
    }
}

void bt_set_custom_adaptive_trigger_effects(
    uint8_t right_mode,
    uint8_t right_start_percent,
    uint8_t right_wall_percent,
    uint8_t right_force_percent,
    bool right_active,
    uint8_t left_mode,
    uint8_t left_start_percent,
    uint8_t left_wall_percent,
    uint8_t left_force_percent,
    bool left_active
) {
    if (hid_interrupt_cid == 0) {
        return;
    }

    uint8_t report[DS_OUTPUT_REPORT_BT_SIZE];
    init_state_report(report);
    report[3] = 0x04 | 0x08;
    uint8_t *right_trigger = report + 3 + DS_TRIGGER_EFFECT_RIGHT_OFFSET;
    uint8_t *left_trigger = report + 3 + DS_TRIGGER_EFFECT_LEFT_OFFSET;

    right_active
        ? set_custom_trigger_effect(right_trigger, right_mode, right_start_percent, right_wall_percent, right_force_percent)
        : set_trigger_off(right_trigger);
    left_active
        ? set_custom_trigger_effect(left_trigger, left_mode, left_start_percent, left_wall_percent, left_force_percent)
        : set_trigger_off(left_trigger);

    bt_write(report, sizeof(report));
}

void bt_set_custom_adaptive_trigger_effect(
    uint8_t mode,
    uint8_t start_percent,
    uint8_t wall_percent,
    uint8_t force_percent,
    uint8_t target
) {
    const bool left_active = target == DS_TRIGGER_TARGET_LEFT || target == DS_TRIGGER_TARGET_BOTH;
    const bool right_active = target == DS_TRIGGER_TARGET_RIGHT || target == DS_TRIGGER_TARGET_BOTH;
    bt_set_custom_adaptive_trigger_effects(
        mode,
        start_percent,
        wall_percent,
        force_percent,
        right_active,
        mode,
        start_percent,
        wall_percent,
        force_percent,
        left_active
    );
}

void bt_replay_adaptive_trigger_effect(
    uint8_t const *right_trigger,
    bool right_valid,
    uint8_t const *left_trigger,
    bool left_valid,
    uint8_t motor_power,
    bool motor_power_valid
) {
    right_valid = right_valid && right_trigger != nullptr;
    left_valid = left_valid && left_trigger != nullptr;
    if ((!right_valid && !left_valid) || hid_interrupt_cid == 0) {
        return;
    }

    audio_set_adaptive_trigger_state(
        right_trigger,
        right_valid,
        left_trigger,
        left_valid,
        motor_power,
        motor_power_valid
    );

    uint8_t report[DS_OUTPUT_REPORT_BT_SIZE];
    init_state_report(report);
    uint8_t *payload = report + 3;
    if (right_valid) {
        payload[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET] |= DS_OUTPUT_VALID_FLAG0_RIGHT_TRIGGER_EFFECT;
        memcpy(payload + DS_TRIGGER_EFFECT_RIGHT_OFFSET, right_trigger, DS_TRIGGER_EFFECT_SIZE);
    }
    if (left_valid) {
        payload[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET] |= DS_OUTPUT_VALID_FLAG0_LEFT_TRIGGER_EFFECT;
        memcpy(payload + DS_TRIGGER_EFFECT_LEFT_OFFSET, left_trigger, DS_TRIGGER_EFFECT_SIZE);
    }
    if (motor_power_valid) {
        payload[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET] |= DS_OUTPUT_VALID_FLAG1_MOTOR_POWER_LEVEL_ENABLE;
        payload[OUTPUT_PAYLOAD_TRIGGER_POWER_OFFSET] = motor_power;
    }
    enqueue_feedback_state_output(report, sizeof(report), OutputReasonStateOnly);
}

void bt_reset_adaptive_triggers() {
    bt_set_adaptive_trigger_effect(0, 0);
}

void bt_set_lightbar_color(uint8_t red, uint8_t green, uint8_t blue, uint8_t brightness_percent) {
    saved_lightbar_red = red;
    saved_lightbar_green = green;
    saved_lightbar_blue = blue;
    saved_lightbar_brightness = brightness_percent > 100 ? 100 : brightness_percent;
    lightbar_restore_pending = false;
    audio_set_lightbar_state(
        saved_lightbar_red,
        saved_lightbar_green,
        saved_lightbar_blue,
        saved_lightbar_brightness
    );

    if (hid_interrupt_cid == 0) {
        return;
    }

    uint8_t report[DS_OUTPUT_REPORT_BT_SIZE];
    init_state_report(report);
    report[3 + 1] = DS_OUTPUT_VALID_FLAG1_LIGHTBAR_CONTROL_ENABLE;
    if (!player_led_enabled) {
        report[3 + 1] |= DS_OUTPUT_VALID_FLAG1_PLAYER_INDICATOR_CONTROL_ENABLE;
        report[3 + 43] = 0;
    }
    report[3 + OUTPUT_PAYLOAD_LED_BRIGHTNESS_OFFSET] = 0x01;
    report[3 + 44] = scale_lightbar_channel(saved_lightbar_red, saved_lightbar_brightness);
    report[3 + 45] = scale_lightbar_channel(saved_lightbar_green, saved_lightbar_brightness);
    report[3 + 46] = scale_lightbar_channel(saved_lightbar_blue, saved_lightbar_brightness);
    bt_write(report, sizeof(report));
}

void bt_set_player_led_enabled(bool enabled) {
    player_led_enabled = enabled;
    controller_output_state_set_player_led_enabled(enabled);

    if (hid_interrupt_cid == 0) {
        return;
    }

    uint8_t report[DS_OUTPUT_REPORT_BT_SIZE];
    init_state_report(report);
    if (!controller_output_state_copy_player_led_report(report + 3, DS_OUTPUT_REPORT_COMMON_SIZE)) {
        return;
    }
    enqueue_feedback_state_output(report, sizeof(report), OutputReasonStateOnly);
    bt_write(report, sizeof(report));
}

void bt_set_mute_led(bool enabled) {
    if (hid_interrupt_cid == 0) {
        return;
    }

    uint8_t report[DS_OUTPUT_REPORT_BT_SIZE];
    init_state_report(report);
    report[3 + 1] = DS_OUTPUT_VALID_FLAG1_MIC_MUTE_LED_CONTROL_ENABLE;
    report[3 + 8] = enabled ? 1 : 0;
    bt_write(report, sizeof(report));
}

void bt_set_microphone_state(uint8_t volume_percent, bool muted, bool control_mute_led, bool mute_led) {
    companion_mic_volume_percent = volume_percent > 100 ? 100 : volume_percent;

    if (hid_interrupt_cid == 0) {
        return;
    }

    uint8_t report[DS_OUTPUT_REPORT_BT_SIZE];
    init_state_report(report);
    report[3 + OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET] = DS_OUTPUT_VALID_FLAG0_MIC_VOLUME_ENABLE;
    report[3 + OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET] = DS_OUTPUT_VALID_FLAG1_POWER_SAVE_CONTROL_ENABLE;
    if (control_mute_led) {
        report[3 + OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET] |= DS_OUTPUT_VALID_FLAG1_MIC_MUTE_LED_CONTROL_ENABLE;
        report[3 + OUTPUT_PAYLOAD_MUTE_LED_OFFSET] = mute_led ? 1 : 0;
    }
    report[3 + OUTPUT_PAYLOAD_MIC_VOLUME_OFFSET] = muted
        ? 0
        : static_cast<uint8_t>((companion_mic_volume_percent * DS_OUTPUT_MIC_VOLUME_MAX + 50) / 100);
    report[3 + OUTPUT_PAYLOAD_POWER_SAVE_CONTROL_OFFSET] = muted ? DS_OUTPUT_POWER_SAVE_CONTROL_MIC_MUTE : 0;
    bt_write(report, sizeof(report));
}

static void send_speaker_output_state(bool enabled, bool headset_plugged) {
    uint8_t report[DS_OUTPUT_REPORT_BT_SIZE];
    init_state_report(report);
    report[3] = DS_OUTPUT_VALID_FLAG0_AUDIO_CONTROL_ENABLE;

    if (enabled) {
        if (headset_plugged) {
            report[3 + OUTPUT_PAYLOAD_HEADPHONE_VOLUME_OFFSET] = DS_OUTPUT_HEADPHONE_VOLUME_MAX;
            report[3 + OUTPUT_PAYLOAD_AUDIO_CONTROL_OFFSET] = DS_OUTPUT_AUDIO_FLAGS_OUTPUT_PATH_HEADPHONES;
        } else {
            report[3] |= DS_OUTPUT_VALID_FLAG0_SPEAKER_VOLUME_ENABLE;
            report[3 + 1] = DS_OUTPUT_VALID_FLAG1_AUDIO_CONTROL2_ENABLE;
            report[3 + OUTPUT_PAYLOAD_SPEAKER_VOLUME_OFFSET] = DS_OUTPUT_SPEAKER_VOLUME_MAX;
            report[3 + OUTPUT_PAYLOAD_AUDIO_CONTROL_OFFSET] = DS_OUTPUT_AUDIO_FLAGS_OUTPUT_PATH_SPEAKER;
            report[3 + OUTPUT_PAYLOAD_AUDIO_CONTROL2_OFFSET] = speaker_output_gain;
        }
    } else {
        report[3 + OUTPUT_PAYLOAD_AUDIO_CONTROL_OFFSET] = DS_OUTPUT_AUDIO_FLAGS_OUTPUT_PATH_HEADPHONES;
    }
    bt_write(report, sizeof(report));
}

static uint8_t normalize_speaker_output_gain(uint8_t gain) {
    return std::min<uint8_t>(7, std::max<uint8_t>(1, gain));
}

void bt_set_speaker_output_gain(uint8_t gain) {
    const uint8_t next_gain = normalize_speaker_output_gain(gain);
    const bool changed = speaker_output_gain != next_gain;
    speaker_output_gain = next_gain;
    controller_output_state_set_speaker_gain(next_gain);
    if (changed) {
        bt_refresh_speaker_output();
    }
}

uint8_t bt_speaker_output_gain() {
    return speaker_output_gain;
}

void bt_set_speaker_output_enabled(bool enabled, bool headset_plugged, bool force) {
    if (hid_interrupt_cid == 0) {
        speaker_output_enabled = false;
        speaker_output_headset_route = false;
        return;
    }

    if (!force && speaker_output_enabled == enabled && (!enabled || speaker_output_headset_route == headset_plugged)) {
        return;
    }

    speaker_output_enabled = enabled;
    speaker_output_headset_route = enabled && headset_plugged;
    send_speaker_output_state(enabled, headset_plugged);
}

void bt_rearm_speaker_output_route(bool headset_plugged) {
    if (hid_interrupt_cid == 0) {
        speaker_output_enabled = false;
        speaker_output_headset_route = false;
        return;
    }

    if (headset_plugged) {
        send_speaker_output_state(true, false);
    }
    speaker_output_enabled = true;
    speaker_output_headset_route = headset_plugged;
    send_speaker_output_state(true, headset_plugged);
}

void bt_refresh_speaker_output() {
    if (hid_interrupt_cid == 0) {
        speaker_output_enabled = false;
        speaker_output_headset_route = false;
        return;
    }

    if (speaker_output_enabled) {
        send_speaker_output_state(true, speaker_output_headset_route);
    }
}

void bt_schedule_lightbar_restore(uint32_t delay_ms) {
    if (hid_interrupt_cid == 0) {
        return;
    }

    lightbar_restore_pending = true;
    lightbar_restore_at_us = time_us_32() + delay_ms * 1000;
}

void bt_lightbar_loop() {
    if (!lightbar_restore_pending || hid_interrupt_cid == 0) {
        return;
    }

    if (static_cast<int32_t>(time_us_32() - lightbar_restore_at_us) < 0) {
        return;
    }

    bt_set_lightbar_color(
        saved_lightbar_red,
        saved_lightbar_green,
        saved_lightbar_blue,
        saved_lightbar_brightness
    );
}

void bt_signal_strength_loop() {
    if (acl_handle == HCI_CON_HANDLE_INVALID || hid_interrupt_cid == 0) {
        bt_rssi = 0;
        bt_rssi_known = false;
        bt_rssi_request_pending = false;
        bt_rssi_last_request_us = 0;
        return;
    }

    const uint32_t now = time_us_32();
    if (bt_rssi_request_pending) {
        if (packet_age_us(now, bt_rssi_last_request_us) < RSSI_REQUEST_TIMEOUT_US) {
            return;
        }
        bt_rssi_request_pending = false;
    }

    if (bt_rssi_last_request_us != 0 && packet_age_us(now, bt_rssi_last_request_us) < RSSI_POLL_INTERVAL_US) {
        return;
    }

    if (gap_read_rssi(acl_handle) != 0) {
        bt_rssi_request_pending = true;
        bt_rssi_last_request_us = now;
    }
}

bool bt_disconnect() {
    if (acl_handle == HCI_CON_HANDLE_INVALID) {
        return false;
    }

    // 0x13 = remote user terminated connection
    HCI_SEND_CMD_LOGGED(&hci_disconnect, acl_handle, 0x13);
    return true;
}

bool bt_power_off_controller() {
    if (hid_control_cid == 0) {
        return false;
    }

    uint8_t set_feature[49]{};
    // DualSense Bluetooth control feature report 0x08: 1 = on, 2 = off.
    set_feature[0] = 0x53;
    set_feature[1] = 0x08;
    set_feature[2] = 0x02;
    if (!fill_feature_report_checksum(set_feature + 1, sizeof(set_feature) - 1)) {
        return false;
    }

    const uint8_t status = l2cap_send(hid_control_cid, set_feature, sizeof(set_feature));
    if (status != 0) {
        DS5_LOG("[L2CAP] Power-off feature send failed status=0x%02X\n", status);
        enqueue_control_packet(set_feature, sizeof(set_feature), false);
        return false;
    }
    return true;
}

bool bt_set_idle_disconnect_timeout_minutes(uint16_t minutes) {
    if (
        minutes < MIN_IDLE_DISCONNECT_TIMEOUT_MINUTES
        || minutes > MAX_IDLE_DISCONNECT_TIMEOUT_MINUTES
    ) {
        return false;
    }
    idle_disconnect_timeout_minutes = minutes;
    inactive_time = time_us_32();
    return true;
}

uint16_t bt_idle_disconnect_timeout_minutes() {
    return idle_disconnect_timeout_minutes;
}

void bt_l2cap_init() {
    l2cap_event_callback_registration.callback = &l2cap_packet_handler;
    l2cap_add_event_handler(&l2cap_event_callback_registration);
    // Required to avoid automatic disconnects after reconnecting.
    sdp_init();
    l2cap_register_service(l2cap_packet_handler, PSM_HID_CONTROL, MTU_CONTROL, LEVEL_2);
    l2cap_register_service(l2cap_packet_handler, PSM_HID_INTERRUPT, MTU_INTERRUPT, LEVEL_2);

    l2cap_init();
}

static void open_next_hid_channel_if_needed() {
    if (acl_handle == HCI_CON_HANDLE_INVALID) {
        return;
    }

    if (!hid_control_ready && hid_control_cid == 0) {
        DS5_LOG("[L2CAP] Open missing HID Control channel\n");
        l2cap_create_channel(l2cap_packet_handler, current_device_addr, PSM_HID_CONTROL, MTU_CONTROL,
                             &hid_control_cid);
        return;
    }

    if (!hid_interrupt_ready && hid_interrupt_cid == 0) {
        DS5_LOG("[L2CAP] Open missing HID Interrupt channel\n");
        l2cap_create_channel(l2cap_packet_handler, current_device_addr, PSM_HID_INTERRUPT, MTU_INTERRUPT,
                             &hid_interrupt_cid);
    }
}

static void schedule_hid_channel_recovery() {
    hid_channel_recovery_pending = true;
    hid_channel_recovery_at_us = time_us_32() + HID_CHANNEL_RECOVERY_DELAY_US;
}

static void cancel_hid_channel_recovery_if_ready() {
    if (hid_control_ready && hid_interrupt_ready) {
        hid_channel_recovery_pending = false;
        hid_channel_recovery_attempts = 0;
    }
}

void bt_connection_recovery_loop() {
    if (!hid_channel_recovery_pending || acl_handle == HCI_CON_HANDLE_INVALID) {
        return;
    }
    if (static_cast<int32_t>(time_us_32() - hid_channel_recovery_at_us) < 0) {
        return;
    }
    if (hid_control_ready && hid_interrupt_ready) {
        hid_channel_recovery_pending = false;
        hid_channel_recovery_attempts = 0;
        return;
    }
    if (hid_channel_recovery_attempts >= HID_CHANNEL_RECOVERY_MAX_ATTEMPTS) {
        DS5_LOG("[L2CAP] HID channel recovery failed, disconnecting stale ACL\n");
        hid_channel_recovery_pending = false;
        hid_channel_recovery_attempts = 0;
        bt_disconnect();
        return;
    }

    hid_channel_recovery_attempts++;
    DS5_LOG("[L2CAP] HID channel recovery opening missing channel(s), attempt=%u\n",
            hid_channel_recovery_attempts);
    open_next_hid_channel_if_needed();
    schedule_hid_channel_recovery();
}

void bt_inquiry_loop() {
    const uint32_t now = time_us_32();
    if (
        acl_connection_pending
        && acl_handle == HCI_CON_HANDLE_INVALID
        && bt_time_reached(now, acl_connection_pending_at_us + ACL_CONNECTION_PENDING_TIMEOUT_US)
    ) {
        DS5_LOG("[HCI] ACL connection pending timed out, restart inquiry\n");
        clear_outbound_inquiry_target();
        clear_acl_connection_pending();
        schedule_inquiry_retry(0);
    }

    if (
        inquiry_active
        || device_found
        || acl_connection_pending
        || acl_handle != HCI_CON_HANDLE_INVALID
    ) {
        return;
    }

    if (inquiry_retry_at_us == 0 || bt_time_reached(now, inquiry_retry_at_us)) {
        start_inquiry_if_needed();
    }
}

int bt_init() {
    critical_section_init(&queue_lock);

    bt_l2cap_init();

    // SSP (Secure Simple Pairing)
    gap_ssp_set_enable(true);
    gap_secure_connections_enable(true);
    gap_ssp_set_io_capability(SSP_IO_CAPABILITY_DISPLAY_YES_NO);
    gap_ssp_set_authentication_requirement(SSP_IO_AUTHREQ_MITM_PROTECTION_NOT_REQUIRED_GENERAL_BONDING);

    gap_connectable_control(1);
    gap_discoverable_control(1);

    hci_event_callback_registration.callback = &hci_packet_handler;
    hci_add_event_handler(&hci_event_callback_registration);

    hci_power_control(HCI_POWER_ON);
    return 0;
}

static void hci_packet_handler(uint8_t packet_type, uint16_t channel, uint8_t *packet, uint16_t size) {
    (void) channel;

    const uint8_t event_type = hci_event_packet_get_type(packet);

    switch (event_type) {
        case BTSTACK_EVENT_STATE: {
            const uint8_t state = btstack_event_state_get_state(packet);
            DS5_LOG("[BT] State: %u\n", state);
            if (state == HCI_STATE_WORKING) {
                DS5_LOG("[BT] Stack ready\n");
                schedule_inquiry_retry(0);
                start_inquiry_if_needed();
            }
            break;
        }
        case HCI_EVENT_INQUIRY_RESULT:
        case HCI_EVENT_INQUIRY_RESULT_WITH_RSSI:
        case HCI_EVENT_EXTENDED_INQUIRY_RESPONSE: {
            bd_addr_t addr;
            uint32_t cod;

            if (event_type == HCI_EVENT_INQUIRY_RESULT) {
                cod = hci_event_inquiry_result_get_class_of_device(packet);
                hci_event_inquiry_result_get_bd_addr(packet, addr);
            } else if (event_type == HCI_EVENT_INQUIRY_RESULT_WITH_RSSI) {
                cod = hci_event_inquiry_result_with_rssi_get_class_of_device(packet);
                hci_event_inquiry_result_with_rssi_get_bd_addr(packet, addr);
            } else {
                cod = hci_event_extended_inquiry_response_get_class_of_device(packet);
                hci_event_extended_inquiry_response_get_bd_addr(packet, addr);
            }

            // CoD 0x002508 = Gamepad (Major: Peripheral, Minor: Gamepad)
            if (
                (cod & 0x000F00) == 0x000500
                && !acl_connection_pending
                && acl_handle == HCI_CON_HANDLE_INVALID
            ) {
                DS5_LOG("[HCI] Gamepad found: %s (CoD: 0x%06x)\n", bd_addr_to_str(addr), (unsigned int) cod);
                bd_addr_copy(current_device_addr, addr);
                device_found = true;
                inquiry_active = false;
                gap_inquiry_stop();
            }
            break;
        }

        case GAP_EVENT_INQUIRY_COMPLETE:
        case HCI_EVENT_INQUIRY_COMPLETE: {
            DS5_LOG("[HCI] Inquiry complete\n");
            inquiry_active = false;
            if (device_found && !acl_connection_pending && acl_handle == HCI_CON_HANDLE_INVALID) {
                DS5_LOG("[HCI] Connecting to %s...\n", bd_addr_to_str(current_device_addr));
                new_pair = true;
                mark_acl_connection_pending();
                HCI_SEND_CMD_LOGGED(&hci_create_connection, current_device_addr,
                             hci_usable_acl_packet_types(), 0, 0, 0, 1);
            } else if (!device_found && !acl_connection_pending && acl_handle == HCI_CON_HANDLE_INVALID) {
                schedule_inquiry_retry();
            }
            break;
        }
        case HCI_EVENT_COMMAND_STATUS: {
            const uint8_t status = hci_event_command_status_get_status(packet);
            const uint16_t opcode = hci_event_command_status_get_command_opcode(packet);
            DS5_LOG("[HCI] CmdStatus %s(0x%04X) status=0x%02X\n", opcode_to_str(opcode), opcode, status);
            if (
                (opcode == HCI_OPCODE_HCI_CREATE_CONNECTION || opcode == HCI_OPCODE_HCI_ACCEPT_CONNECTION_REQUEST)
                && status != ERROR_CODE_SUCCESS
            ) {
                clear_outbound_inquiry_target();
                clear_acl_connection_pending();
                DS5_LOG("[HCI] ACL connection command rejected, restart inquiry\n");
                schedule_inquiry_retry();
            }
            break;
        }

        case HCI_EVENT_COMMAND_COMPLETE: {
            const uint8_t status = hci_event_command_complete_get_return_parameters(packet)[0];
            const uint16_t opcode = hci_event_command_complete_get_command_opcode(packet);
            DS5_LOG("[HCI] CmdComplete %s(0x%04X) status=0x%02X\n", opcode_to_str(opcode), opcode, status);
            break;
        }

        case HCI_EVENT_CONNECTION_COMPLETE: {
            const uint8_t status = hci_event_connection_complete_get_status(packet);
            if (status == 0) {
                const hci_con_handle_t handle = hci_event_connection_complete_get_connection_handle(packet);
                acl_handle = handle;
                bt_rssi = 0;
                bt_rssi_known = false;
                bt_rssi_request_pending = false;
                bt_rssi_last_request_us = 0;
                clear_acl_connection_pending();
                device_found = false;
                hci_event_connection_complete_get_bd_addr(packet, current_device_addr);
                DS5_LOG("[HCI] ACL connected handle=0x%04X\n", handle);
                DS5_LOG("[HCI] Request authentication on handle=0x%04X\n", handle);
                HCI_SEND_CMD_LOGGED(&hci_authentication_requested, handle);
            } else {
                clear_outbound_inquiry_target();
                clear_acl_connection_pending();
                DS5_LOG("[HCI] ACL connect failed status=0x%02X, restart inquiry\n", status);
                schedule_inquiry_retry();
            }
            break;
        }

        case HCI_EVENT_LINK_KEY_REQUEST: {
            bd_addr_t addr;
            hci_event_link_key_request_get_bd_addr(packet, addr);
            link_key_t link_key;
            link_key_type_t link_key_type;
            bool link = gap_get_link_key_for_bd_addr(addr, link_key, &link_key_type);
            if (link) {
                DS5_LOG("[HCI] Link key request from %s, reply stored key type=%u\n", bd_addr_to_str(addr),
                       (unsigned int) link_key_type);
                HCI_SEND_CMD_LOGGED(&hci_link_key_request_reply, addr, link_key);
            } else {
                DS5_LOG("[HCI] Link key request from %s, no key, force re-pair\n", bd_addr_to_str(addr));
                HCI_SEND_CMD_LOGGED(&hci_link_key_request_negative_reply, addr);
            }
            break;
        }

        case HCI_EVENT_USER_CONFIRMATION_REQUEST: {
            bd_addr_t addr;
            hci_event_user_confirmation_request_get_bd_addr(packet, addr);
            DS5_LOG("[HCI] User confirmation request from %s, accept\n", bd_addr_to_str(addr));
            HCI_SEND_CMD_LOGGED(&hci_user_confirmation_request_reply, addr);
            break;
        }

        case HCI_EVENT_PIN_CODE_REQUEST: {
            bd_addr_t addr;
            hci_event_pin_code_request_get_bd_addr(packet, addr);
            DS5_LOG("[HCI] Legacy pin request from %s, reply 0000\n", bd_addr_to_str(addr));
            gap_pin_code_response(addr, "0000");
            break;
        }

        case HCI_EVENT_AUTHENTICATION_COMPLETE: {
            const uint8_t status = hci_event_authentication_complete_get_status(packet);
            const hci_con_handle_t handle = hci_event_authentication_complete_get_connection_handle(packet);
            DS5_LOG("[HCI] Authentication complete handle=0x%04X status=0x%02X\n", handle, status);
            if (status != ERROR_CODE_SUCCESS) {
                DS5_LOG("[HCI] Authentication failed, drop stored key for %s\n", bd_addr_to_str(current_device_addr));
                gap_drop_link_key_for_bd_addr(current_device_addr);
                clear_outbound_inquiry_target();
                clear_acl_connection_pending();
                schedule_inquiry_retry();
            } else {
                HCI_SEND_CMD_LOGGED(&hci_set_connection_encryption, handle, 1);
            }
            break;
        }

        case HCI_EVENT_ENCRYPTION_CHANGE: {
            const uint8_t status = hci_event_encryption_change_get_status(packet);
            const hci_con_handle_t handle = hci_event_encryption_change_get_connection_handle(packet);
            const uint8_t enabled = hci_event_encryption_change_get_encryption_enabled(packet);
            DS5_LOG("[HCI] Encryption change handle=0x%04X status=0x%02X enabled=%u\n", handle, status, enabled);
            if (status == ERROR_CODE_SUCCESS && enabled) {
                DS5_LOG("[L2CAP] Open HID channels\n");
                schedule_hid_channel_recovery();
                if (new_pair) {
                    open_next_hid_channel_if_needed();
                }
            }
            break;
        }

        case HCI_EVENT_CONNECTION_REQUEST: {
            bd_addr_t addr;
            hci_event_connection_request_get_bd_addr(packet, addr);
            const uint32_t cod = hci_event_connection_request_get_class_of_device(packet);
            DS5_LOG("[HCI] Incoming ACL request from %s cod=0x%06x\n", bd_addr_to_str(addr), (unsigned int) cod);
            if ((cod & 0x000F00) == 0x000500) {
                bd_addr_copy(current_device_addr, addr);
                clear_outbound_inquiry_target();
                mark_acl_connection_pending();
                inquiry_active = false;
                gap_inquiry_stop();
                HCI_SEND_CMD_LOGGED(&hci_accept_connection_request, addr, 0x01);
            }
            break;
        }

        case HCI_EVENT_DISCONNECTION_COMPLETE: {
            const bool host_suspended = usb_host_suspended_active();
            usb_handle_controller_transport_disconnect();
            reset_controller_input_report_cache();
            gap_connectable_control(1);
            gap_discoverable_control(1);
            const uint8_t reason = hci_event_disconnection_complete_get_reason(packet);
            clear_outbound_inquiry_target();
            clear_acl_connection_pending();
            inquiry_active = false;
            acl_handle = HCI_CON_HANDLE_INVALID;
            bt_rssi = 0;
            bt_rssi_known = false;
            bt_rssi_request_pending = false;
            bt_rssi_last_request_us = 0;
            hid_control_cid = 0;
            hid_interrupt_cid = 0;
            hid_control_ready = false;
            hid_interrupt_ready = false;
            audio_handle_controller_disconnect();
            feature_data.clear();
            controller_type = ControllerTypeUnknown;
            controller_type_check_pending = false;
            hid_channel_recovery_pending = false;
            hid_channel_recovery_attempts = 0;
            critical_section_enter_blocking(&queue_lock);
            reset_controller_output_session_locked();
            critical_section_exit(&queue_lock);
            cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, false);
            if (host_suspended) {
                DS5_LOG("[HCI] Disconnected reason=0x%02X while USB host suspended; keeping USB on bus\n", reason);
                break;
            }
            DS5_LOG("[HCI] Disconnected reason=0x%02X, power-cycle CYW43 then reboot Pico\n", reason);
            power_down_cyw43_for_reboot();
            watchdog_reboot(0, 0, CONTROLLER_DISCONNECT_REBOOT_DELAY_MS);
            break;
        }

        case GAP_EVENT_RSSI_MEASUREMENT: {
            const hci_con_handle_t handle = gap_event_rssi_measurement_get_con_handle(packet);
            if (handle == acl_handle) {
                bt_rssi = static_cast<int8_t>(gap_event_rssi_measurement_get_rssi(packet));
                bt_rssi_known = true;
                bt_rssi_request_pending = false;
            }
            break;
        }
    }
}

static void note_output_packet_sent(const output_packet &packet, uint32_t now) {
    const uint32_t age_us = packet_age_us(now, packet.enqueue_time_us);
    if (last_bt_send_us != 0) {
        update_max_u32(output_counters.bt_send_gap_max_us, packet_age_us(now, last_bt_send_us));
    }
    last_bt_send_us = now;

    if (packet.packet_class == OutputPacketAudio) {
        update_max_u32(output_counters.audio_0x36_max_age_us, age_us);
        uint32_t audio_gap_us = 0;
        if (last_audio_0x36_send_us != 0) {
            audio_gap_us = packet_age_us(now, last_audio_0x36_send_us);
            update_max_u32(output_counters.audio_0x36_send_gap_max_us, audio_gap_us);
        }
        last_audio_0x36_send_us = now;
        if (age_us > 12000) {
            output_counters.audio_0x36_late_count_over_12000_us++;
        }
        if (age_us > 12000 || audio_gap_us > 12000) {
            audio_debug_note_bt_event(
                BtAudioDebugLateAudio,
                age_us / 100,
                audio_gap_us / 100,
                non_audio_reports_since_audio,
                audio_queue.size()
            );
        }
        update_max_u32(output_counters.non_audio_reports_between_audio_max, non_audio_reports_since_audio);
        non_audio_reports_since_audio = 0;
        output_counters.audio_0x36_sent_count++;
        output_counters.consecutive_state_sends = 0;
        consecutive_non_audio_sends = 0;
        return;
    }

    output_counters.normal_0x31_sent_count++;
    if (speaker_output_headset_route && !audio_queue.empty()) {
        audio_debug_note_bt_event(
            BtAudioDebugNonAudioAheadOfQueuedAudio,
            packet.reason,
            packet_age_us(now, audio_queue.front().enqueue_time_us) / 100,
            0,
            state_pending ? 1 : 0
        );
    }
    if (non_audio_reports_since_audio != 0xffffffffu) {
        non_audio_reports_since_audio++;
    }
    if (packet.packet_class == OutputPacketState) {
        update_max_u32(output_counters.state_pending_age_us, age_us);
        output_counters.consecutive_state_sends++;
    }
    if (consecutive_non_audio_sends < 255) {
        consecutive_non_audio_sends++;
    }
}

static bool select_next_output_packet_locked(output_packet &packet, uint32_t now) {
    if (!output_pending_locked()) {
        return false;
    }

    uint8_t trace_critical_depth = 0;
    uint8_t trace_audio_depth = 0;
    uint8_t trace_route_flags = 0;
    output_trace_queue_details_locked(trace_critical_depth, trace_audio_depth, trace_route_flags);

    if (!urgent_queue.empty()) {
        packet = std::move(urgent_queue.front());
        urgent_queue.pop();
    } else {
        const bool audio_available = !audio_queue.empty();
        const uint32_t audio_age_us = audio_available
            ? packet_age_us(now, audio_queue.front().enqueue_time_us)
            : 0;
        const OutputSchedulerInputs scheduler_inputs{
            audio_available,
            state_pending,
            audio_age_us,
            static_cast<uint32_t>(audio_queue.size()),
            consecutive_non_audio_sends
        };
        constexpr OutputSchedulerConfig scheduler_config{
            OUTPUT_AUDIO_MAX_AGE_US,
            OUTPUT_MAX_CONSECUTIVE_NON_AUDIO_SENDS
        };

        const OutputSchedulerChoice choice = output_scheduler_choose_interrupt_packet(
            scheduler_inputs,
            scheduler_config
        );

        if (choice == OutputSchedulerChoice::AudioStream) {
            packet = std::move(audio_queue.front());
            audio_queue.pop();
        } else if (choice == OutputSchedulerChoice::CoalescedState) {
            if (state_send_blocked_by_audio_locked(now)) {
                return false;
            }
            uint8_t report[DS_OUTPUT_REPORT_BT_SIZE];
            memcpy(report, state_pending_report, sizeof(report));
            if (!build_interrupt_output_packet(report, sizeof(report), packet.data)) {
                state_pending = false;
                update_queue_depth_counters_locked();
                return select_next_output_packet_locked(packet, now);
            }
            packet.enqueue_time_us = state_pending_since_us;
            packet.packet_class = OutputPacketState;
            packet.report_id = DS_OUTPUT_REPORT_BT;
            packet.reason = state_pending_reason;
            state_pending = false;
        } else {
            return false;
        }
    }

    set_output_trace_details_locked(
        packet,
        now,
        trace_critical_depth,
        trace_audio_depth,
        trace_route_flags
    );
    note_output_packet_sent(packet, now);
    update_queue_depth_counters_locked();
    return true;
}

static bool select_next_control_packet_locked(control_packet &packet, uint32_t now) {
    if (!control_pending_locked()) {
        return false;
    }
    if (headset_audio_send_window_closed_locked(now)) {
        return false;
    }

    packet = std::move(control_queue.front());
    control_queue.erase(control_queue.begin());
    audio_debug_note_bt_event(
        BtAudioDebugControlSend,
        packet.data.empty() ? 0 : packet.data[0],
        packet.report_id,
        packet_age_us(now, packet.enqueue_time_us) / 100,
        control_queue.size()
    );
    return true;
}

static bool controller_input_report_is_active(uint8_t const *packet, uint16_t size) {
    if (packet == nullptr || size <= 12 || packet[1] != 0x31 || (packet[2] & 0x02) != 0) {
        return false;
    }
    return packet[3] < 120 || packet[3] > 140
        || packet[4] < 120 || packet[4] > 140
        || packet[5] < 120 || packet[5] > 140
        || packet[6] < 120 || packet[6] > 140
        || packet[7] > 0 || packet[8] > 0
        || packet[10] != 0x08 || packet[11] != 0x00
        || packet[12] != 0x00;
}

static uint64_t idle_disconnect_timeout_us() {
    return static_cast<uint64_t>(idle_disconnect_timeout_minutes) * 60ULL * 1000ULL * 1000ULL;
}

static void l2cap_packet_handler(uint8_t packet_type, uint16_t channel, uint8_t *packet, uint16_t size) {
    (void) channel;

    if (packet_type == L2CAP_DATA_PACKET) {
        if (channel == hid_interrupt_cid) {
            // DS5_LOG("[L2CAP] HID Interrupt data len=%u\n", size);
            // DS5_HEXDUMP(packet, size);
            bt_data_callback(INTERRUPT, packet, size);

            // Inactivity detection.
            if (mute[1]) { // Microphone mute is enabled.
                return;
            }
            if (controller_input_report_is_active(packet, size)) {
                inactive_time = time_us_32();
            } else if (static_cast<uint64_t>(time_us_32() - inactive_time) > idle_disconnect_timeout_us()) {
                DS5_LOG("disconnect when inactive\n");
                inactive_time = time_us_32();
                bt_disconnect();
            }
        } else if (channel == hid_control_cid) {
            if (controller_type_check_pending) {
                if (size > 1 && packet[0] == 0xA3 && packet[1] == 0x70) {
                    controller_type = ControllerTypeDualSenseEdge;
                    controller_type_check_pending = false;
                    DS5_LOG("[L2CAP] Connected controller detected as DualSense Edge\n");
                    usb_handle_controller_transport_ready();
                } else if (size > 0 && packet[0] == 0x02) {
                    controller_type = ControllerTypeDualSense;
                    controller_type_check_pending = false;
                    DS5_LOG("[L2CAP] Connected controller detected as DualSense\n");
                    usb_handle_controller_transport_ready();
                }
            }
            if (size >= 2 && packet[0] == 0xA3) {
                uint8_t report_id = packet[1];
                if (feature_data.size() < 32 || feature_data.contains(report_id)) {
                    feature_data[report_id].assign(packet + 1, packet + size);
                    DS5_LOG("[L2CAP] Stored Feature Report 0x%02X, len=%u\n", report_id, size - 1);
                }
            }
            DS5_LOG("[L2CAP] HID Control data len=%u\n", size);
            DS5_HEXDUMP(packet, size);
            bt_data_callback(CONTROL, packet, size);
        } else {
            DS5_LOG("[L2CAP] Data on unknown channel 0x%04X (Interrupt: 0x%04X, Control: 0x%04X)\n",
                   channel, hid_interrupt_cid, hid_control_cid);
        }
        return;
    }

    const uint8_t event_type = hci_event_packet_get_type(packet);
    switch (event_type) {
        case L2CAP_EVENT_CHANNEL_OPENED: {
            const uint8_t status = l2cap_event_channel_opened_get_status(packet);
            const uint16_t local_cid = l2cap_event_channel_opened_get_local_cid(packet);
            if (status == 0) {
                const uint16_t psm = l2cap_event_channel_opened_get_psm(packet);
                if (psm == PSM_HID_CONTROL) {
                    DS5_LOG("[L2CAP] HID Control opened cid=0x%04X\n", local_cid);
                    hid_control_cid = local_cid;
                    hid_control_ready = true;
                    hid_channel_recovery_attempts = 0;
                    cancel_hid_channel_recovery_if_ready();
                } else if (psm == PSM_HID_INTERRUPT) {
                    DS5_LOG("[L2CAP] HID Interrupt opened cid=0x%04X\n", local_cid);
                    hid_interrupt_cid = local_cid;
                    hid_interrupt_ready = true;
                    hid_channel_recovery_attempts = 0;
                    cancel_hid_channel_recovery_if_ready();
                    critical_section_enter_blocking(&queue_lock);
                    reset_controller_output_session_locked();
                    critical_section_exit(&queue_lock);

                    if (!mute[0]) {
                        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, true);
                    }
                    gap_connectable_control(0);
                    gap_discoverable_control(0);
                    inactive_time = time_us_32();

                    DS5_LOG("Init DualSense\n");

                    init_feature();
                    reset_lightbar_setup();
                    bt_set_lightbar_color(0x00, 0x00, 0xff, 100);
                    bt_schedule_lightbar_restore(250);

                } else {
                    DS5_LOG("[L2CAP] Unknown Channel psm: 0x%02X", psm);
                }

                /*if (hid_control_cid != 0 && hid_interrupt_cid != 0) {
                    DS5_LOG("[L2CAP] HID channels ready, request CAN_SEND_NOW for SET_PROTOCOL\n");
                    l2cap_request_can_send_now_event(hid_control_cid);
                }*/
            } else {
                const uint16_t psm = l2cap_event_channel_opened_get_psm(packet);
                hid_control_cid = 0;
                hid_interrupt_cid = 0;
                hid_control_ready = false;
                hid_interrupt_ready = false;
                hid_channel_recovery_pending = false;
                hid_channel_recovery_attempts = 0;
                clear_outbound_inquiry_target();
                DS5_LOG("[L2CAP] Open failed psm=0x%04X status=0x%02X\n", psm, status);
                bt_disconnect();
            }
            break;
        }

        case L2CAP_EVENT_INCOMING_CONNECTION: {
            const uint16_t local_cid = l2cap_event_incoming_connection_get_local_cid(packet);
            const uint16_t psm = l2cap_event_incoming_connection_get_psm(packet);
            DS5_LOG("[L2CAP] Incoming connection psm=0x%04X cid=0x%04X\n", psm, local_cid);
            l2cap_accept_connection(local_cid);
            break;
        }

        case L2CAP_EVENT_CHANNEL_CLOSED: {
            const uint16_t local_cid = l2cap_event_channel_closed_get_local_cid(packet);
            if (local_cid == hid_control_cid) {
                hid_control_cid = 0;
                hid_control_ready = false;
                DS5_LOG("[L2CAP] HID Control closed cid=0x%04X\n", local_cid);
            } else if (local_cid == hid_interrupt_cid) {
                hid_interrupt_cid = 0;
                hid_interrupt_ready = false;
                DS5_LOG("[L2CAP] HID Interrupt closed cid=0x%04X\n", local_cid);
            } else {
                DS5_LOG("[L2CAP] Channel closed cid=0x%04X\n", local_cid);
            }
            if (hid_control_cid == 0 && hid_interrupt_cid == 0) {
                bt_disconnect();
            } else {
                schedule_hid_channel_recovery();
            }
            break;
        }

        case L2CAP_EVENT_CAN_SEND_NOW: {
            // DS5_LOG("[L2CAP] L2CAP_EVENT_CAN_SEND_NOW\n");
            const uint16_t local_cid = l2cap_event_can_send_now_get_local_cid(packet);
            if (local_cid == hid_control_cid) {
                control_packet next_packet{};
                bool should_request_interrupt = false;
                const uint32_t now = time_us_32();
                critical_section_enter_blocking(&queue_lock);
                if (!select_next_control_packet_locked(next_packet, now)) {
                    should_request_interrupt = !audio_queue.empty();
                    critical_section_exit(&queue_lock);
                    request_can_send_if_needed(should_request_interrupt);
                    break;
                }
                const bool has_more_control = control_pending_locked();
                bool should_request_control = false;
                request_control_if_audio_window_open_locked(now, should_request_control);
                critical_section_exit(&queue_lock);

                uint8_t status = l2cap_send(hid_control_cid, next_packet.data.data(), next_packet.data.size());
                if (status != 0) {
                    DS5_LOG("[L2CAP] Control Error, Status: 0x%02X\n", status);
                }
                request_control_can_send_if_needed(has_more_control && should_request_control);
                break;
            }
            if (local_cid != hid_interrupt_cid) {
                break;
            }

            output_packet next_packet{};
            const uint32_t now = time_us_32();
            critical_section_enter_blocking(&queue_lock);
            if (!select_next_output_packet_locked(next_packet, now)) {
                critical_section_exit(&queue_lock);
                break;
            }
            const bool has_more = output_pending_locked();
            bool should_request_control = false;
            request_control_if_audio_window_open_locked(now, should_request_control);
            critical_section_exit(&queue_lock);

            uint8_t status = l2cap_send(hid_interrupt_cid, next_packet.data.data(), next_packet.data.size());
            if (status != 0) {
                DS5_LOG("[L2CAP] Interrupt Error, Status: 0x%02X\n", status);
            } else if (!next_packet.data.empty()) {
#ifdef ENABLE_COMPANION
                companion_note_trigger_trace_report(
                    CompanionTriggerTraceBt,
                    next_packet.data.data() + 1,
                    static_cast<uint16_t>(next_packet.data.size() - 1),
                    next_packet.reason
                );
                companion_note_feedback_trace_report(
                    CompanionFeedbackTraceBt,
                    next_packet.data.data() + 1,
                    static_cast<uint16_t>(next_packet.data.size() - 1),
                    next_packet.reason,
                    next_packet.trace_detail0,
                    next_packet.trace_detail1,
                    next_packet.trace_detail2,
                    next_packet.trace_detail3
                );
#endif
            }
            if (has_more) {
                l2cap_request_can_send_now_event(hid_interrupt_cid);
            }
            request_control_can_send_if_needed(should_request_control);
            break;
        }
    }
}

static bool build_interrupt_output_packet(uint8_t *data, uint16_t len, vector<uint8_t> &packet) {
    packet.assign(len + 1, 0);
    packet[0] = 0xA2;
    memcpy(packet.data() + 1, data, len);
    if (!fill_output_report_checksum(packet.data() + 1, len)) {
        DS5_LOG("[L2CAP bt_write] Refusing output report with invalid checksum length %u\n",
            static_cast<unsigned>(len));
        packet.clear();
        return false;
    }
    return true;
}

static void request_can_send_if_needed(bool should_request_send) {
    if (!should_request_send) {
        return;
    }
    if (hid_interrupt_cid == 0) {
        DS5_LOG("[L2CAP output] Warning: hid_interrupt_cid 0\n");
        return;
    }
    l2cap_request_can_send_now_event(hid_interrupt_cid);
}

static void request_control_can_send_if_needed(bool should_request_send) {
    if (!should_request_send) {
        return;
    }
    if (hid_control_cid == 0) {
        DS5_LOG("[L2CAP control] Warning: hid_control_cid 0\n");
        return;
    }
    l2cap_request_can_send_now_event(hid_control_cid);
}

static bool headset_audio_send_window_closed_locked(uint32_t now) {
    if (!speaker_output_headset_route) {
        return false;
    }
    if (!audio_queue.empty()) {
        return true;
    }
    if (last_audio_0x36_send_us == 0) {
        return false;
    }

    const uint32_t elapsed_us = packet_age_us(now, last_audio_0x36_send_us);
    return elapsed_us > CONTROL_SEND_HEADSET_AUDIO_SAFE_WINDOW_US
        && elapsed_us < CONTROL_SEND_HEADSET_AUDIO_IDLE_US;
}

static bool state_send_blocked_by_audio_locked(uint32_t now) {
    if (!speaker_output_enabled || !audio_queue.empty()) {
        return false;
    }
    if (last_audio_0x36_send_us == 0) {
        return false;
    }

    const uint32_t elapsed_us = packet_age_us(now, last_audio_0x36_send_us);
    return elapsed_us < CONTROL_SEND_HEADSET_AUDIO_IDLE_US;
}

static void request_control_if_audio_window_open_locked(uint32_t now, bool &should_request_control) {
    should_request_control = control_pending_locked() && !headset_audio_send_window_closed_locked(now);
}

static bool make_output_packet(
    uint8_t *data,
    uint16_t len,
    uint8_t packet_class,
    uint8_t reason,
    output_packet &packet
) {
    if (hid_interrupt_cid == 0) {
        return false;
    }
    if (!build_interrupt_output_packet(data, len, packet.data)) {
        return false;
    }
    packet.enqueue_time_us = time_us_32();
    packet.packet_class = packet_class;
    packet.report_id = len > 0 ? data[0] : 0;
    packet.reason = reason;
    return true;
}

static bool enqueue_urgent_output(uint8_t *data, uint16_t len, uint8_t reason) {
    output_packet packet{};
    if (!make_output_packet(data, len, OutputPacketUrgent, reason, packet)) {
        return false;
    }

    bool should_request_send = false;
    critical_section_enter_blocking(&queue_lock);
    should_request_send = !output_pending_locked();
    if (reason == OutputReasonClassicRumbleImmediate) {
        mirror_pending_classic_rumble_locked(data, len);
    }
    while (urgent_queue.size() >= URGENT_SEND_QUEUE_MAX_DEPTH) {
        urgent_queue.pop();
    }
    urgent_queue.push(std::move(packet));
    critical_section_exit(&queue_lock);
    request_can_send_if_needed(should_request_send);
    return true;
}

static bool make_control_packet(uint8_t const *data, uint16_t len, bool coalescible, control_packet &packet) {
    if (hid_control_cid == 0 || data == nullptr || len == 0) {
        return false;
    }

    packet.data.assign(data, data + len);
    packet.enqueue_time_us = time_us_32();
    packet.report_id = len > 1 ? data[1] : 0;
    packet.coalescible = coalescible && len > 1;
    return true;
}

static bool same_control_report_target(control_packet const &left, control_packet const &right) {
    return left.coalescible
        && right.coalescible
        && !left.data.empty()
        && !right.data.empty()
        && left.data[0] == right.data[0]
        && left.report_id == right.report_id;
}

static bool enqueue_control_packet(uint8_t const *data, uint16_t len, bool coalescible) {
    control_packet packet{};
    if (!make_control_packet(data, len, coalescible, packet)) {
        return false;
    }

    bool should_request_send = false;
    const uint32_t now = time_us_32();
    critical_section_enter_blocking(&queue_lock);
    should_request_send = !control_pending_locked();
    if (packet.coalescible) {
        for (control_packet &queued : control_queue) {
            if (same_control_report_target(queued, packet)) {
                queued = std::move(packet);
                request_control_if_audio_window_open_locked(now, should_request_send);
                critical_section_exit(&queue_lock);
                request_control_can_send_if_needed(should_request_send);
                return true;
            }
        }
    }
    while (control_queue.size() >= CONTROL_SEND_QUEUE_MAX_DEPTH) {
        control_queue.erase(control_queue.begin());
    }
    control_queue.push_back(std::move(packet));
    request_control_if_audio_window_open_locked(now, should_request_send);
    critical_section_exit(&queue_lock);
    request_control_can_send_if_needed(should_request_send);
    return true;
}

static void mark_payload_byte(bool *recognized, uint16_t payload_len, uint8_t offset) {
    if (offset < payload_len && offset < DS_OUTPUT_REPORT_COMMON_SIZE) {
        recognized[offset] = true;
    }
}

static void copy_payload_byte(uint8_t *dst, uint8_t const *src, uint16_t payload_len, uint8_t offset) {
    if (offset < payload_len && offset < DS_OUTPUT_REPORT_COMMON_SIZE) {
        dst[offset] = src[offset];
    }
}

static void clear_payload_byte(uint8_t *payload, uint16_t payload_len, uint8_t offset) {
    if (offset < payload_len && offset < DS_OUTPUT_REPORT_COMMON_SIZE) {
        payload[offset] = 0;
    }
}

static bool payload_has_classic_rumble_flags(uint8_t flag0, uint8_t flag2) {
    return (flag0 & (
        DS_OUTPUT_VALID_FLAG0_COMPATIBLE_VIBRATION
        | DS_OUTPUT_VALID_FLAG0_HAPTICS_SELECT
    )) != 0 || (flag2 & (
        DS_OUTPUT_VALID_FLAG2_ENABLE_IMPROVED_RUMBLE_EMULATION
        | DS_OUTPUT_VALID_FLAG2_USE_RUMBLE_NOT_HAPTICS2
    )) != 0;
}

static bool payload_uses_classic_rumble_selector(uint8_t flag0, uint8_t flag2) {
    return (flag0 & DS_OUTPUT_VALID_FLAG0_HAPTICS_SELECT) != 0
        || (flag2 & DS_OUTPUT_VALID_FLAG2_USE_RUMBLE_NOT_HAPTICS2) != 0;
}

static bool output_report_payload(
    uint8_t *data,
    uint16_t len,
    uint8_t *&payload,
    uint16_t &payload_len
) {
    payload = nullptr;
    payload_len = 0;
    if (data == nullptr || len < 3 + DS_OUTPUT_REPORT_COMMON_SIZE) {
        return false;
    }
    if (data[0] == DS_OUTPUT_REPORT_BT && data[2] == DS_OUTPUT_TAG) {
        payload = data + 3;
        payload_len = len - 3;
        return true;
    }
    if (data[0] == 0x36 && len >= 13 + DS_OUTPUT_REPORT_COMMON_SIZE) {
        payload = data + 13;
        payload_len = len - 13;
        return true;
    }
    return false;
}

static bool output_report_payload(
    uint8_t const *data,
    uint16_t len,
    uint8_t const *&payload,
    uint16_t &payload_len
) {
    payload = nullptr;
    payload_len = 0;
    if (data == nullptr || len < 3 + DS_OUTPUT_REPORT_COMMON_SIZE) {
        return false;
    }
    if (data[0] == DS_OUTPUT_REPORT_BT && data[2] == DS_OUTPUT_TAG) {
        payload = data + 3;
        payload_len = len - 3;
        return true;
    }
    if (data[0] == 0x36 && len >= 13 + DS_OUTPUT_REPORT_COMMON_SIZE) {
        payload = data + 13;
        payload_len = len - 13;
        return true;
    }
    return false;
}

static bool strip_redundant_classic_rumble_from_output(uint8_t *data, uint16_t len) {
    uint8_t *payload = nullptr;
    uint16_t payload_len = 0;
    if (!output_report_payload(data, len, payload, payload_len)) {
        return false;
    }
    if (!controller_output_rumble_payload_is_redundant(classic_rumble_state, payload, payload_len)) {
        return false;
    }

    payload[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET] = static_cast<uint8_t>(
        payload[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET]
        & static_cast<uint8_t>(~(
            DS_OUTPUT_VALID_FLAG0_COMPATIBLE_VIBRATION
            | DS_OUTPUT_VALID_FLAG0_HAPTICS_SELECT
        ))
    );
    payload[OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET] = static_cast<uint8_t>(
        payload[OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET]
        & static_cast<uint8_t>(~(
            DS_OUTPUT_VALID_FLAG2_ENABLE_IMPROVED_RUMBLE_EMULATION
            | DS_OUTPUT_VALID_FLAG2_USE_RUMBLE_NOT_HAPTICS2
        ))
    );
    payload[OUTPUT_PAYLOAD_MOTOR_RIGHT_OFFSET] = 0;
    payload[OUTPUT_PAYLOAD_MOTOR_LEFT_OFFSET] = 0;
    return true;
}

static bool mirror_classic_rumble_in_report(
    uint8_t *target,
    uint16_t target_len,
    uint8_t const *source,
    uint16_t source_len
) {
    uint8_t *target_payload = nullptr;
    uint16_t target_payload_len = 0;
    uint8_t const *source_payload = nullptr;
    uint16_t source_payload_len = 0;
    if (
        !output_report_payload(target, target_len, target_payload, target_payload_len)
        || !output_report_payload(source, source_len, source_payload, source_payload_len)
        || target_payload_len <= OUTPUT_PAYLOAD_MOTOR_LEFT_OFFSET
        || source_payload_len <= OUTPUT_PAYLOAD_MOTOR_LEFT_OFFSET
    ) {
        return false;
    }

    const uint8_t source_flag0 = source_payload[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET];
    const uint8_t source_flag2 = source_payload[OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET];
    const uint8_t rumble_flag0 = source_flag0 & static_cast<uint8_t>(
        DS_OUTPUT_VALID_FLAG0_COMPATIBLE_VIBRATION | DS_OUTPUT_VALID_FLAG0_HAPTICS_SELECT
    );
    const uint8_t rumble_flag2 = source_flag2 & static_cast<uint8_t>(
        DS_OUTPUT_VALID_FLAG2_ENABLE_IMPROVED_RUMBLE_EMULATION | DS_OUTPUT_VALID_FLAG2_USE_RUMBLE_NOT_HAPTICS2
    );

    target_payload[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET] = static_cast<uint8_t>(
        (target_payload[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET] & static_cast<uint8_t>(~(
            DS_OUTPUT_VALID_FLAG0_COMPATIBLE_VIBRATION | DS_OUTPUT_VALID_FLAG0_HAPTICS_SELECT
        ))) | rumble_flag0
    );
    target_payload[OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET] = static_cast<uint8_t>(
        (target_payload[OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET] & static_cast<uint8_t>(~(
            DS_OUTPUT_VALID_FLAG2_ENABLE_IMPROVED_RUMBLE_EMULATION | DS_OUTPUT_VALID_FLAG2_USE_RUMBLE_NOT_HAPTICS2
        ))) | rumble_flag2
    );
    target_payload[OUTPUT_PAYLOAD_MOTOR_RIGHT_OFFSET] = source_payload[OUTPUT_PAYLOAD_MOTOR_RIGHT_OFFSET];
    target_payload[OUTPUT_PAYLOAD_MOTOR_LEFT_OFFSET] = source_payload[OUTPUT_PAYLOAD_MOTOR_LEFT_OFFSET];
    return true;
}

static bool mirror_classic_rumble_in_packet(
    output_packet &packet,
    uint8_t const *source,
    uint16_t source_len
) {
    if (packet.data.size() < 2) {
        return false;
    }

    uint8_t *report = packet.data.data() + 1;
    const uint16_t report_len = static_cast<uint16_t>(packet.data.size() - 1);
    if (!mirror_classic_rumble_in_report(report, report_len, source, source_len)) {
        return false;
    }
    return fill_output_report_checksum(report, report_len);
}

static void mirror_packet_queue_classic_rumble_locked(
    queue<output_packet> &packets,
    uint8_t const *source,
    uint16_t source_len
) {
    queue<output_packet> scrubbed;
    while (!packets.empty()) {
        output_packet packet = std::move(packets.front());
        packets.pop();
        (void)mirror_classic_rumble_in_packet(packet, source, source_len);
        scrubbed.push(std::move(packet));
    }
    packets = std::move(scrubbed);
}

static void mirror_pending_classic_rumble_locked(uint8_t const *data, uint16_t len) {
    if (state_pending) {
        (void)mirror_classic_rumble_in_report(state_pending_report, sizeof(state_pending_report), data, len);
    }
    mirror_packet_queue_classic_rumble_locked(urgent_queue, data, len);
    mirror_packet_queue_classic_rumble_locked(audio_queue, data, len);
}

static void apply_player_led_policy_to_payload(uint8_t *payload, uint16_t payload_len) {
    if (payload == nullptr || payload_len <= OUTPUT_PAYLOAD_PLAYER_LEDS_OFFSET) {
        return;
    }
    if (player_led_enabled) {
        return;
    }
    payload[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET] |= DS_OUTPUT_VALID_FLAG1_PLAYER_INDICATOR_CONTROL_ENABLE;
    payload[OUTPUT_PAYLOAD_PLAYER_LEDS_OFFSET] = 0;
}

static bool has_unclassified_state_payload_data(uint8_t const *payload, uint16_t payload_len) {
    bool recognized[DS_OUTPUT_REPORT_COMMON_SIZE]{};
    const uint8_t flag0 = payload_len > OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET
        ? payload[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET]
        : 0;
    const uint8_t flag1 = payload_len > OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET
        ? payload[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET]
        : 0;
    const uint8_t flag2 = payload_len > OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET
        ? payload[OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET]
        : 0;
    const uint8_t led_flags = flag1 & (
        DS_OUTPUT_VALID_FLAG1_LIGHTBAR_CONTROL_ENABLE
        | DS_OUTPUT_VALID_FLAG1_RELEASE_LEDS
        | DS_OUTPUT_VALID_FLAG1_PLAYER_INDICATOR_CONTROL_ENABLE
    );
    const bool has_rumble = payload_has_classic_rumble_flags(flag0, flag2);
    const uint8_t trigger_flags = flag0 & (
        DS_OUTPUT_VALID_FLAG0_RIGHT_TRIGGER_EFFECT
        | DS_OUTPUT_VALID_FLAG0_LEFT_TRIGGER_EFFECT
    );

    mark_payload_byte(recognized, payload_len, OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET);
    mark_payload_byte(recognized, payload_len, OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET);
    mark_payload_byte(recognized, payload_len, OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET);

    if (has_rumble) {
        mark_payload_byte(recognized, payload_len, OUTPUT_PAYLOAD_MOTOR_RIGHT_OFFSET);
        mark_payload_byte(recognized, payload_len, OUTPUT_PAYLOAD_MOTOR_LEFT_OFFSET);
    }
    if (flag0 & DS_OUTPUT_VALID_FLAG0_SPEAKER_VOLUME_ENABLE) {
        mark_payload_byte(recognized, payload_len, OUTPUT_PAYLOAD_SPEAKER_VOLUME_OFFSET);
    }
    if (flag0 & DS_OUTPUT_VALID_FLAG0_MIC_VOLUME_ENABLE) {
        mark_payload_byte(recognized, payload_len, OUTPUT_PAYLOAD_MIC_VOLUME_OFFSET);
    }
    if (flag1 & DS_OUTPUT_VALID_FLAG1_MIC_MUTE_LED_CONTROL_ENABLE) {
        mark_payload_byte(recognized, payload_len, OUTPUT_PAYLOAD_MUTE_LED_OFFSET);
    }
    if (flag1 & DS_OUTPUT_VALID_FLAG1_MOTOR_POWER_LEVEL_ENABLE) {
        mark_payload_byte(recognized, payload_len, OUTPUT_PAYLOAD_TRIGGER_POWER_OFFSET);
    }
    if (flag1 & DS_OUTPUT_VALID_FLAG1_HAPTIC_LOW_PASS_FILTER_ENABLE) {
        mark_payload_byte(recognized, payload_len, OUTPUT_PAYLOAD_HAPTIC_LOW_PASS_FILTER_OFFSET);
    }
    if (trigger_flags & DS_OUTPUT_VALID_FLAG0_RIGHT_TRIGGER_EFFECT) {
        for (uint8_t i = 0; i < DS_TRIGGER_EFFECT_SIZE; i++) {
            mark_payload_byte(recognized, payload_len, DS_TRIGGER_EFFECT_RIGHT_OFFSET + i);
        }
    }
    if (trigger_flags & DS_OUTPUT_VALID_FLAG0_LEFT_TRIGGER_EFFECT) {
        for (uint8_t i = 0; i < DS_TRIGGER_EFFECT_SIZE; i++) {
            mark_payload_byte(recognized, payload_len, DS_TRIGGER_EFFECT_LEFT_OFFSET + i);
        }
    }
    if (led_flags & DS_OUTPUT_VALID_FLAG1_LIGHTBAR_CONTROL_ENABLE) {
        mark_payload_byte(recognized, payload_len, OUTPUT_PAYLOAD_LED_BRIGHTNESS_OFFSET);
        mark_payload_byte(recognized, payload_len, OUTPUT_PAYLOAD_LIGHTBAR_RED_OFFSET);
        mark_payload_byte(recognized, payload_len, OUTPUT_PAYLOAD_LIGHTBAR_GREEN_OFFSET);
        mark_payload_byte(recognized, payload_len, OUTPUT_PAYLOAD_LIGHTBAR_BLUE_OFFSET);
    }
    if (led_flags & DS_OUTPUT_VALID_FLAG1_PLAYER_INDICATOR_CONTROL_ENABLE) {
        mark_payload_byte(recognized, payload_len, OUTPUT_PAYLOAD_PLAYER_LEDS_OFFSET);
    }

    const uint16_t common_len = payload_len < DS_OUTPUT_REPORT_COMMON_SIZE
        ? payload_len
        : DS_OUTPUT_REPORT_COMMON_SIZE;
    for (uint16_t i = 0; i < common_len; i++) {
        if (!recognized[i] && payload[i] != 0) {
            return true;
        }
    }
    for (uint16_t i = DS_OUTPUT_REPORT_COMMON_SIZE; i < payload_len; i++) {
        if (payload[i] != 0) {
            return true;
        }
    }
    return false;
}

bool bt_sanitize_host_speaker_amp_ownership_payload(uint8_t *payload, uint16_t len) {
    return controller_output_policy_sanitize_host_speaker_amp_payload(payload, len);
}

bool bt_sanitize_host_speaker_amp_ownership(uint8_t *data, uint16_t len) {
    return controller_output_policy_sanitize_host_speaker_amp_report(data, len);
}

bool bt_sanitize_host_mic_ownership_payload(uint8_t *payload, uint16_t len) {
    return controller_output_policy_sanitize_host_mic_payload(payload, len);
}

bool bt_sanitize_host_mic_ownership(uint8_t *data, uint16_t len) {
    return controller_output_policy_sanitize_host_mic_report(data, len);
}

static uint8_t classify_output_report(uint8_t const *data, uint16_t len) {
    if (data == nullptr || len < 3 + DS_OUTPUT_REPORT_COMMON_SIZE) {
        return OutputReasonCriticalPayload;
    }
    if (data[0] != DS_OUTPUT_REPORT_BT || data[2] != DS_OUTPUT_TAG) {
        return OutputReasonUnknown;
    }

    const uint8_t *payload = data + 3;
    const uint16_t payload_len = len - 3;
    const uint8_t flag0 = payload[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET];
    const uint8_t flag1 = payload[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET];
    const uint8_t flag2 = payload[OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET];
    const uint8_t state_flag0 =
        DS_OUTPUT_VALID_FLAG0_COMPATIBLE_VIBRATION
        | DS_OUTPUT_VALID_FLAG0_HAPTICS_SELECT
        | DS_OUTPUT_VALID_FLAG0_RIGHT_TRIGGER_EFFECT
        | DS_OUTPUT_VALID_FLAG0_LEFT_TRIGGER_EFFECT
        | DS_OUTPUT_VALID_FLAG0_SPEAKER_VOLUME_ENABLE
        | DS_OUTPUT_VALID_FLAG0_MIC_VOLUME_ENABLE;
    const uint8_t state_flag1 =
        DS_OUTPUT_VALID_FLAG1_MIC_MUTE_LED_CONTROL_ENABLE
        | DS_OUTPUT_VALID_FLAG1_LIGHTBAR_CONTROL_ENABLE
        | DS_OUTPUT_VALID_FLAG1_RELEASE_LEDS
        | DS_OUTPUT_VALID_FLAG1_PLAYER_INDICATOR_CONTROL_ENABLE
        | DS_OUTPUT_VALID_FLAG1_HAPTIC_LOW_PASS_FILTER_ENABLE
        | DS_OUTPUT_VALID_FLAG1_MOTOR_POWER_LEVEL_ENABLE;
    const uint8_t state_flag2 =
        DS_OUTPUT_VALID_FLAG2_ENABLE_IMPROVED_RUMBLE_EMULATION
        | DS_OUTPUT_VALID_FLAG2_USE_RUMBLE_NOT_HAPTICS2;

    if ((flag0 & ~state_flag0) != 0 || (flag1 & ~state_flag1) != 0 || (flag2 & ~state_flag2) != 0) {
        return OutputReasonCriticalFlags;
    }
    if (has_unclassified_state_payload_data(payload, payload_len)) {
        return OutputReasonCriticalPayload;
    }
    if ((flag0 | flag1 | flag2) == 0) {
        return OutputReasonStateNoop;
    }
    return OutputReasonStateOnly;
}

static bool audio_output_route_protected() {
    return audio_recent()
        || usb_speaker_streaming_active();
}

static bool output_report_has_state_flags(uint8_t const *data, uint16_t len) {
    if (data == nullptr || len < 3 + DS_OUTPUT_REPORT_COMMON_SIZE) {
        return false;
    }
    if (data[0] != DS_OUTPUT_REPORT_BT || data[2] != DS_OUTPUT_TAG) {
        return false;
    }

    const uint8_t *payload = data + 3;
    const uint8_t flag0 = payload[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET];
    const uint8_t flag1 = payload[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET];
    const uint8_t flag2 = payload[OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET];
    const uint8_t state_mask0 =
        DS_OUTPUT_VALID_FLAG0_COMPATIBLE_VIBRATION
        | DS_OUTPUT_VALID_FLAG0_HAPTICS_SELECT
        | DS_OUTPUT_VALID_FLAG0_RIGHT_TRIGGER_EFFECT
        | DS_OUTPUT_VALID_FLAG0_LEFT_TRIGGER_EFFECT
        | DS_OUTPUT_VALID_FLAG0_SPEAKER_VOLUME_ENABLE
        | DS_OUTPUT_VALID_FLAG0_MIC_VOLUME_ENABLE;
    const uint8_t state_mask1 =
        DS_OUTPUT_VALID_FLAG1_MIC_MUTE_LED_CONTROL_ENABLE
        | DS_OUTPUT_VALID_FLAG1_LIGHTBAR_CONTROL_ENABLE
        | DS_OUTPUT_VALID_FLAG1_RELEASE_LEDS
        | DS_OUTPUT_VALID_FLAG1_PLAYER_INDICATOR_CONTROL_ENABLE
        | DS_OUTPUT_VALID_FLAG1_HAPTIC_LOW_PASS_FILTER_ENABLE
        | DS_OUTPUT_VALID_FLAG1_MOTOR_POWER_LEVEL_ENABLE;
    const uint8_t state_mask2 =
        DS_OUTPUT_VALID_FLAG2_ENABLE_IMPROVED_RUMBLE_EMULATION
        | DS_OUTPUT_VALID_FLAG2_USE_RUMBLE_NOT_HAPTICS2;

    return ((flag0 & state_mask0) | (flag1 & state_mask1) | (flag2 & state_mask2)) != 0;
}

static bool output_report_has_feedback_state_flags(uint8_t const *data, uint16_t len) {
    if (data == nullptr || len < 3 + DS_OUTPUT_REPORT_COMMON_SIZE) {
        return false;
    }
    if (data[0] != DS_OUTPUT_REPORT_BT || data[2] != DS_OUTPUT_TAG) {
        return false;
    }

    const uint8_t *payload = data + 3;
    const uint8_t flag0 = payload[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET];
    const uint8_t flag1 = payload[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET];
    const uint8_t flag2 = payload[OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET];
    const uint8_t feedback_mask0 =
        DS_OUTPUT_VALID_FLAG0_COMPATIBLE_VIBRATION
        | DS_OUTPUT_VALID_FLAG0_HAPTICS_SELECT
        | DS_OUTPUT_VALID_FLAG0_RIGHT_TRIGGER_EFFECT
        | DS_OUTPUT_VALID_FLAG0_LEFT_TRIGGER_EFFECT;
    const uint8_t feedback_mask1 = DS_OUTPUT_VALID_FLAG1_MOTOR_POWER_LEVEL_ENABLE;
    const uint8_t feedback_mask2 =
        DS_OUTPUT_VALID_FLAG2_ENABLE_IMPROVED_RUMBLE_EMULATION
        | DS_OUTPUT_VALID_FLAG2_USE_RUMBLE_NOT_HAPTICS2;

    return ((flag0 & feedback_mask0) | (flag1 & feedback_mask1) | (flag2 & feedback_mask2)) != 0;
}

static bool output_report_is_classic_rumble_transition(uint8_t const *data, uint16_t len) {
    uint8_t const *payload = nullptr;
    uint16_t payload_len = 0;
    if (!output_report_payload(data, len, payload, payload_len)) {
        return false;
    }

    return controller_output_rumble_payload_requires_immediate_send(classic_rumble_state, payload, payload_len);
}

static bool enqueue_classic_rumble_immediate_or_state_output(uint8_t *data, uint16_t len, uint8_t reason) {
    if (output_report_is_classic_rumble_transition(data, len)) {
        if (!enqueue_urgent_output(data, len, OutputReasonClassicRumbleImmediate)) {
            return false;
        }
        remember_classic_rumble_state_from_output(data, len);
        return true;
    }
    return enqueue_feedback_state_output(data, len, reason);
}

static bool split_state_from_mixed_output(uint8_t *data, uint16_t len) {
    if (data == nullptr || len < 3 + DS_OUTPUT_REPORT_COMMON_SIZE) {
        return false;
    }
    if (data[0] != DS_OUTPUT_REPORT_BT || data[2] != DS_OUTPUT_TAG) {
        return false;
    }

    uint8_t *payload = data + 3;
    const uint16_t payload_len = len - 3;
    const uint8_t flag0 = payload[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET];
    const uint8_t flag1 = payload[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET];
    const uint8_t flag2 = payload[OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET];
    const uint8_t state_mask0 =
        DS_OUTPUT_VALID_FLAG0_COMPATIBLE_VIBRATION
        | DS_OUTPUT_VALID_FLAG0_HAPTICS_SELECT
        | DS_OUTPUT_VALID_FLAG0_RIGHT_TRIGGER_EFFECT
        | DS_OUTPUT_VALID_FLAG0_LEFT_TRIGGER_EFFECT
        | DS_OUTPUT_VALID_FLAG0_SPEAKER_VOLUME_ENABLE
        | DS_OUTPUT_VALID_FLAG0_MIC_VOLUME_ENABLE;
    uint8_t state_mask1 =
        DS_OUTPUT_VALID_FLAG1_MIC_MUTE_LED_CONTROL_ENABLE
        | DS_OUTPUT_VALID_FLAG1_LIGHTBAR_CONTROL_ENABLE
        | DS_OUTPUT_VALID_FLAG1_RELEASE_LEDS
        | DS_OUTPUT_VALID_FLAG1_PLAYER_INDICATOR_CONTROL_ENABLE
        | DS_OUTPUT_VALID_FLAG1_HAPTIC_LOW_PASS_FILTER_ENABLE
        | DS_OUTPUT_VALID_FLAG1_MOTOR_POWER_LEVEL_ENABLE;
    const uint8_t state_mask2 =
        DS_OUTPUT_VALID_FLAG2_ENABLE_IMPROVED_RUMBLE_EMULATION
        | DS_OUTPUT_VALID_FLAG2_USE_RUMBLE_NOT_HAPTICS2;
    const uint8_t state_flag0 = flag0 & state_mask0;
    const uint8_t state_flag1 = flag1 & state_mask1;
    const uint8_t state_flag2 = flag2 & state_mask2;
    const bool has_state = (state_flag0 | state_flag1 | state_flag2) != 0;
    const bool has_critical_flags = ((flag0 & ~state_mask0) | (flag1 & ~state_mask1) | (flag2 & ~state_mask2)) != 0;
    if (!has_state || !has_critical_flags) {
        return false;
    }

    uint8_t state_data[DS_OUTPUT_REPORT_BT_SIZE]{};
    state_data[0] = data[0];
    state_data[1] = data[1];
    state_data[2] = data[2];
    uint8_t *state_payload = state_data + 3;
    state_payload[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET] = state_flag0;
    state_payload[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET] = state_flag1;
    state_payload[OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET] = state_flag2;

    payload[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET] = flag0 & static_cast<uint8_t>(~state_flag0);
    payload[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET] = flag1 & static_cast<uint8_t>(~state_flag1);
    payload[OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET] = flag2 & static_cast<uint8_t>(~state_flag2);

    const bool state_has_rumble_flags = payload_has_classic_rumble_flags(state_flag0, state_flag2);
    const bool state_uses_classic_rumble = payload_uses_classic_rumble_selector(state_flag0, state_flag2)
        && payload_len > OUTPUT_PAYLOAD_MOTOR_LEFT_OFFSET;
    if (state_has_rumble_flags) {
        if (state_uses_classic_rumble) {
            copy_payload_byte(state_payload, payload, payload_len, OUTPUT_PAYLOAD_MOTOR_RIGHT_OFFSET);
            copy_payload_byte(state_payload, payload, payload_len, OUTPUT_PAYLOAD_MOTOR_LEFT_OFFSET);
        }
        clear_payload_byte(payload, payload_len, OUTPUT_PAYLOAD_MOTOR_RIGHT_OFFSET);
        clear_payload_byte(payload, payload_len, OUTPUT_PAYLOAD_MOTOR_LEFT_OFFSET);
    }
    if (state_flag0 & DS_OUTPUT_VALID_FLAG0_RIGHT_TRIGGER_EFFECT) {
        for (uint8_t i = 0; i < DS_TRIGGER_EFFECT_SIZE; i++) {
            copy_payload_byte(state_payload, payload, payload_len, DS_TRIGGER_EFFECT_RIGHT_OFFSET + i);
            clear_payload_byte(payload, payload_len, DS_TRIGGER_EFFECT_RIGHT_OFFSET + i);
        }
    }
    if (state_flag0 & DS_OUTPUT_VALID_FLAG0_LEFT_TRIGGER_EFFECT) {
        for (uint8_t i = 0; i < DS_TRIGGER_EFFECT_SIZE; i++) {
            copy_payload_byte(state_payload, payload, payload_len, DS_TRIGGER_EFFECT_LEFT_OFFSET + i);
            clear_payload_byte(payload, payload_len, DS_TRIGGER_EFFECT_LEFT_OFFSET + i);
        }
    }
    if (state_flag0 & DS_OUTPUT_VALID_FLAG0_SPEAKER_VOLUME_ENABLE) {
        copy_payload_byte(state_payload, payload, payload_len, OUTPUT_PAYLOAD_SPEAKER_VOLUME_OFFSET);
        clear_payload_byte(payload, payload_len, OUTPUT_PAYLOAD_HEADPHONE_VOLUME_OFFSET);
        clear_payload_byte(payload, payload_len, OUTPUT_PAYLOAD_SPEAKER_VOLUME_OFFSET);
    }
    if (state_flag0 & DS_OUTPUT_VALID_FLAG0_MIC_VOLUME_ENABLE) {
        copy_payload_byte(state_payload, payload, payload_len, OUTPUT_PAYLOAD_MIC_VOLUME_OFFSET);
        clear_payload_byte(payload, payload_len, OUTPUT_PAYLOAD_MIC_VOLUME_OFFSET);
    }
    if (state_flag1 & DS_OUTPUT_VALID_FLAG1_MIC_MUTE_LED_CONTROL_ENABLE) {
        copy_payload_byte(state_payload, payload, payload_len, OUTPUT_PAYLOAD_MUTE_LED_OFFSET);
        clear_payload_byte(payload, payload_len, OUTPUT_PAYLOAD_MUTE_LED_OFFSET);
    }
    if (state_flag1 & DS_OUTPUT_VALID_FLAG1_MOTOR_POWER_LEVEL_ENABLE) {
        copy_payload_byte(state_payload, payload, payload_len, OUTPUT_PAYLOAD_TRIGGER_POWER_OFFSET);
        clear_payload_byte(payload, payload_len, OUTPUT_PAYLOAD_TRIGGER_POWER_OFFSET);
    }
    if (state_flag1 & DS_OUTPUT_VALID_FLAG1_HAPTIC_LOW_PASS_FILTER_ENABLE) {
        copy_payload_byte(state_payload, payload, payload_len, OUTPUT_PAYLOAD_HAPTIC_LOW_PASS_FILTER_OFFSET);
        clear_payload_byte(payload, payload_len, OUTPUT_PAYLOAD_HAPTIC_LOW_PASS_FILTER_OFFSET);
    }
    if (state_flag1 & DS_OUTPUT_VALID_FLAG1_LIGHTBAR_CONTROL_ENABLE) {
        copy_payload_byte(state_payload, payload, payload_len, OUTPUT_PAYLOAD_LED_BRIGHTNESS_OFFSET);
        copy_payload_byte(state_payload, payload, payload_len, OUTPUT_PAYLOAD_LIGHTBAR_RED_OFFSET);
        copy_payload_byte(state_payload, payload, payload_len, OUTPUT_PAYLOAD_LIGHTBAR_GREEN_OFFSET);
        copy_payload_byte(state_payload, payload, payload_len, OUTPUT_PAYLOAD_LIGHTBAR_BLUE_OFFSET);
        clear_payload_byte(payload, payload_len, OUTPUT_PAYLOAD_LED_BRIGHTNESS_OFFSET);
        clear_payload_byte(payload, payload_len, OUTPUT_PAYLOAD_LIGHTBAR_RED_OFFSET);
        clear_payload_byte(payload, payload_len, OUTPUT_PAYLOAD_LIGHTBAR_GREEN_OFFSET);
        clear_payload_byte(payload, payload_len, OUTPUT_PAYLOAD_LIGHTBAR_BLUE_OFFSET);
    }
    if (state_flag1 & DS_OUTPUT_VALID_FLAG1_PLAYER_INDICATOR_CONTROL_ENABLE) {
        copy_payload_byte(state_payload, payload, payload_len, OUTPUT_PAYLOAD_PLAYER_LEDS_OFFSET);
        clear_payload_byte(payload, payload_len, OUTPUT_PAYLOAD_PLAYER_LEDS_OFFSET);
    }
    apply_player_led_policy_to_payload(state_payload, DS_OUTPUT_REPORT_COMMON_SIZE);

#ifdef ENABLE_COMPANION
    uint8_t trace_critical_depth = 0;
    uint8_t trace_audio_depth = 0;
    uint8_t trace_route_flags = 0;
    output_trace_queue_details(trace_critical_depth, trace_audio_depth, trace_route_flags);
    companion_note_trigger_trace_report(CompanionTriggerTraceBridgeOut, state_data, sizeof(state_data), OutputReasonStateOnly);
    companion_note_feedback_trace_report(
        CompanionFeedbackTraceBridgeOut,
        state_data,
        sizeof(state_data),
        OutputReasonStateOnly,
        trace_critical_depth,
        trace_audio_depth,
        trace_route_flags,
        OutputTraceTransformSplitState | OutputTraceTransformState
    );
#endif
    return enqueue_classic_rumble_immediate_or_state_output(state_data, sizeof(state_data), OutputReasonStateOnly);
}

static void merge_state_output_locked(uint8_t const *data, uint16_t len, uint32_t now, uint8_t reason) {
    const uint8_t *src = data + 3;
    uint8_t *dst = state_pending_report + 3;
    const uint16_t payload_len = len - 3;
    const uint8_t flag0 = src[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET];
    const uint8_t flag1 = src[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET];
    const uint8_t flag2 = src[OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET];
    const uint8_t rumble_flag0 = flag0 & (
        DS_OUTPUT_VALID_FLAG0_COMPATIBLE_VIBRATION
        | DS_OUTPUT_VALID_FLAG0_HAPTICS_SELECT
    );
    const uint8_t state_flag2 = flag2 & static_cast<uint8_t>(
        DS_OUTPUT_VALID_FLAG2_ENABLE_IMPROVED_RUMBLE_EMULATION
        | DS_OUTPUT_VALID_FLAG2_USE_RUMBLE_NOT_HAPTICS2
    );
    const bool has_rumble_flags = payload_has_classic_rumble_flags(rumble_flag0, state_flag2);
    const bool uses_classic_rumble = payload_uses_classic_rumble_selector(rumble_flag0, state_flag2);
    const uint8_t trigger_flags = flag0 & (
        DS_OUTPUT_VALID_FLAG0_RIGHT_TRIGGER_EFFECT
        | DS_OUTPUT_VALID_FLAG0_LEFT_TRIGGER_EFFECT
    );
    const uint8_t led_flags = flag1 & (
        DS_OUTPUT_VALID_FLAG1_LIGHTBAR_CONTROL_ENABLE
        | DS_OUTPUT_VALID_FLAG1_RELEASE_LEDS
        | DS_OUTPUT_VALID_FLAG1_PLAYER_INDICATOR_CONTROL_ENABLE
    );

    if (!state_pending) {
        memset(state_pending_report, 0, sizeof(state_pending_report));
        state_pending_report[0] = DS_OUTPUT_REPORT_BT;
        state_pending_report[2] = DS_OUTPUT_TAG;
        state_pending_since_us = now;
    } else {
        output_counters.state_coalesce_count++;
    }

    state_pending_report[1] = data[1];
    state_pending_reason = reason;

    if (has_rumble_flags) {
        dst[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET] = static_cast<uint8_t>(
            (dst[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET] & static_cast<uint8_t>(~(
                DS_OUTPUT_VALID_FLAG0_COMPATIBLE_VIBRATION
                | DS_OUTPUT_VALID_FLAG0_HAPTICS_SELECT
            ))) | rumble_flag0
        );
        dst[OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET] = static_cast<uint8_t>(
            (dst[OUTPUT_PAYLOAD_VALID_FLAG2_OFFSET] & static_cast<uint8_t>(~(
                DS_OUTPUT_VALID_FLAG2_ENABLE_IMPROVED_RUMBLE_EMULATION
                | DS_OUTPUT_VALID_FLAG2_USE_RUMBLE_NOT_HAPTICS2
            )))
            | state_flag2
        );
        if (uses_classic_rumble && payload_len > OUTPUT_PAYLOAD_MOTOR_LEFT_OFFSET) {
            dst[OUTPUT_PAYLOAD_MOTOR_RIGHT_OFFSET] = src[OUTPUT_PAYLOAD_MOTOR_RIGHT_OFFSET];
            dst[OUTPUT_PAYLOAD_MOTOR_LEFT_OFFSET] = src[OUTPUT_PAYLOAD_MOTOR_LEFT_OFFSET];
        } else {
            dst[OUTPUT_PAYLOAD_MOTOR_RIGHT_OFFSET] = 0;
            dst[OUTPUT_PAYLOAD_MOTOR_LEFT_OFFSET] = 0;
        }
    }
    if (trigger_flags != 0) {
        dst[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET] |= trigger_flags;
        if (trigger_flags & DS_OUTPUT_VALID_FLAG0_RIGHT_TRIGGER_EFFECT) {
            for (uint8_t i = 0; i < DS_TRIGGER_EFFECT_SIZE; i++) {
                copy_payload_byte(dst, src, payload_len, DS_TRIGGER_EFFECT_RIGHT_OFFSET + i);
            }
        }
        if (trigger_flags & DS_OUTPUT_VALID_FLAG0_LEFT_TRIGGER_EFFECT) {
            for (uint8_t i = 0; i < DS_TRIGGER_EFFECT_SIZE; i++) {
                copy_payload_byte(dst, src, payload_len, DS_TRIGGER_EFFECT_LEFT_OFFSET + i);
            }
        }
    }
    if (flag0 & DS_OUTPUT_VALID_FLAG0_SPEAKER_VOLUME_ENABLE) {
        dst[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET] |= DS_OUTPUT_VALID_FLAG0_SPEAKER_VOLUME_ENABLE;
        dst[OUTPUT_PAYLOAD_SPEAKER_VOLUME_OFFSET] = src[OUTPUT_PAYLOAD_SPEAKER_VOLUME_OFFSET];
    }
    if (flag0 & DS_OUTPUT_VALID_FLAG0_MIC_VOLUME_ENABLE) {
        dst[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET] |= DS_OUTPUT_VALID_FLAG0_MIC_VOLUME_ENABLE;
        dst[OUTPUT_PAYLOAD_MIC_VOLUME_OFFSET] = src[OUTPUT_PAYLOAD_MIC_VOLUME_OFFSET];
    }
    if (flag1 & DS_OUTPUT_VALID_FLAG1_MIC_MUTE_LED_CONTROL_ENABLE) {
        dst[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET] |= DS_OUTPUT_VALID_FLAG1_MIC_MUTE_LED_CONTROL_ENABLE;
        dst[OUTPUT_PAYLOAD_MUTE_LED_OFFSET] = src[OUTPUT_PAYLOAD_MUTE_LED_OFFSET];
    }
    if (flag1 & DS_OUTPUT_VALID_FLAG1_MOTOR_POWER_LEVEL_ENABLE) {
        dst[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET] |= DS_OUTPUT_VALID_FLAG1_MOTOR_POWER_LEVEL_ENABLE;
        dst[OUTPUT_PAYLOAD_TRIGGER_POWER_OFFSET] = src[OUTPUT_PAYLOAD_TRIGGER_POWER_OFFSET];
    }
    if (flag1 & DS_OUTPUT_VALID_FLAG1_HAPTIC_LOW_PASS_FILTER_ENABLE) {
        dst[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET] |= DS_OUTPUT_VALID_FLAG1_HAPTIC_LOW_PASS_FILTER_ENABLE;
        dst[OUTPUT_PAYLOAD_HAPTIC_LOW_PASS_FILTER_OFFSET] = src[OUTPUT_PAYLOAD_HAPTIC_LOW_PASS_FILTER_OFFSET];
    }
    if (led_flags & DS_OUTPUT_VALID_FLAG1_RELEASE_LEDS) {
        dst[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET] = static_cast<uint8_t>(
            dst[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET]
            & static_cast<uint8_t>(~(
                DS_OUTPUT_VALID_FLAG1_LIGHTBAR_CONTROL_ENABLE
                | DS_OUTPUT_VALID_FLAG1_PLAYER_INDICATOR_CONTROL_ENABLE
            ))
        );
        dst[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET] |= DS_OUTPUT_VALID_FLAG1_RELEASE_LEDS;
        apply_player_led_policy_to_payload(dst, DS_OUTPUT_REPORT_COMMON_SIZE);
    } else if (led_flags != 0) {
        dst[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET] = static_cast<uint8_t>(
            dst[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET] & static_cast<uint8_t>(~DS_OUTPUT_VALID_FLAG1_RELEASE_LEDS)
        );
        dst[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET] |= led_flags;
        if (led_flags & DS_OUTPUT_VALID_FLAG1_LIGHTBAR_CONTROL_ENABLE) {
            dst[OUTPUT_PAYLOAD_LED_BRIGHTNESS_OFFSET] = src[OUTPUT_PAYLOAD_LED_BRIGHTNESS_OFFSET];
            dst[OUTPUT_PAYLOAD_LIGHTBAR_RED_OFFSET] = src[OUTPUT_PAYLOAD_LIGHTBAR_RED_OFFSET];
            dst[OUTPUT_PAYLOAD_LIGHTBAR_GREEN_OFFSET] = src[OUTPUT_PAYLOAD_LIGHTBAR_GREEN_OFFSET];
            dst[OUTPUT_PAYLOAD_LIGHTBAR_BLUE_OFFSET] = src[OUTPUT_PAYLOAD_LIGHTBAR_BLUE_OFFSET];
        }
        if (led_flags & DS_OUTPUT_VALID_FLAG1_PLAYER_INDICATOR_CONTROL_ENABLE) {
            dst[OUTPUT_PAYLOAD_PLAYER_LEDS_OFFSET] = player_led_enabled ? src[OUTPUT_PAYLOAD_PLAYER_LEDS_OFFSET] : 0;
        }
        apply_player_led_policy_to_payload(dst, DS_OUTPUT_REPORT_COMMON_SIZE);
    }
    state_pending = true;
}

static bool enqueue_state_output(uint8_t *data, uint16_t len, uint8_t reason) {
    if (hid_interrupt_cid == 0) {
        return false;
    }
    const uint32_t now = time_us_32();
    bool should_request_send = false;
    critical_section_enter_blocking(&queue_lock);
    merge_state_output_locked(data, len, now, reason);
    should_request_send = !state_send_blocked_by_audio_locked(now);
    update_queue_depth_counters_locked();
    critical_section_exit(&queue_lock);
    request_can_send_if_needed(should_request_send);
    return true;
}

static bool enqueue_feedback_state_output(uint8_t *data, uint16_t len, uint8_t reason) {
    return enqueue_state_output(data, len, reason);
}

void bt_write(uint8_t *data, uint16_t len) {
    (void)enqueue_urgent_output(data, len, OutputReasonCriticalDirect);
}

bool bt_write_classified_output(uint8_t *data, uint16_t len) {
    output_counters.normal_0x31_rx_count++;
    bt_sanitize_host_speaker_amp_ownership(data, len);
    bt_sanitize_host_mic_ownership(data, len);
    apply_classic_rumble_gain(data, len);
    uint8_t trace_critical_depth = 0;
    uint8_t trace_audio_depth = 0;
    uint8_t trace_route_flags = 0;
    output_trace_queue_details(trace_critical_depth, trace_audio_depth, trace_route_flags);
#ifdef ENABLE_COMPANION
    companion_note_trigger_trace_report(CompanionTriggerTraceBridgeIn, data, len, 0);
    companion_note_feedback_trace_report(
        CompanionFeedbackTraceBridgeIn,
        data,
        len,
        0,
        trace_critical_depth,
        trace_audio_depth,
        trace_route_flags,
        0
    );
#endif
    const bool audio_protected = audio_output_route_protected();
    const bool classic_rumble_transition = output_report_is_classic_rumble_transition(data, len);
    const bool stripped_redundant_classic_rumble =
        !classic_rumble_transition && strip_redundant_classic_rumble_from_output(data, len);
    if (speaker_output_enabled && audio_protected && !classic_rumble_transition) {
        const uint8_t reason = classify_output_report(data, len);
        uint8_t trace_transform_flags = OutputTraceTransformAudioProtected;
        if (stripped_redundant_classic_rumble) {
            trace_transform_flags |= OutputTraceTransformStrippedZeroRumble;
        }
        if (output_report_has_feedback_state_flags(data, len)) {
            trace_transform_flags |= OutputTraceTransformFeedbackState;
        }
        if (output_report_has_state_flags(data, len)) {
            trace_transform_flags |= OutputTraceTransformState;
        }
#ifdef ENABLE_COMPANION
        companion_note_trigger_trace_report(CompanionTriggerTraceBridgeOut, data, len, reason);
        companion_note_feedback_trace_report(
            CompanionFeedbackTraceBridgeOut,
            data,
            len,
            reason,
            trace_critical_depth,
            trace_audio_depth,
            trace_route_flags,
            trace_transform_flags
        );
#endif
        return true;
    }
    const bool split_state = split_state_from_mixed_output(data, len);
    const uint8_t reason = classify_output_report(data, len);
    uint8_t trace_transform_flags = 0;
    if (split_state) {
        trace_transform_flags |= OutputTraceTransformSplitState;
    }
    if (audio_protected) {
        trace_transform_flags |= OutputTraceTransformAudioProtected;
    }
    if (classic_rumble_transition) {
        trace_transform_flags |= OutputTraceTransformClassicRumble;
    }
    if (stripped_redundant_classic_rumble) {
        trace_transform_flags |= OutputTraceTransformStrippedZeroRumble;
    }
    if (output_report_has_feedback_state_flags(data, len)) {
        trace_transform_flags |= OutputTraceTransformFeedbackState;
    }
    if (output_report_has_state_flags(data, len)) {
        trace_transform_flags |= OutputTraceTransformState;
    }
#ifdef ENABLE_COMPANION
    companion_note_trigger_trace_report(CompanionTriggerTraceBridgeOut, data, len, reason);
    companion_note_feedback_trace_report(
        CompanionFeedbackTraceBridgeOut,
        data,
        len,
        reason,
        trace_critical_depth,
        trace_audio_depth,
        trace_route_flags,
        trace_transform_flags
    );
#endif
    if (reason == OutputReasonStateNoop) {
        if (!classic_rumble_transition) {
            return true;
        }
        return enqueue_classic_rumble_immediate_or_state_output(data, len, OutputReasonClassicRumbleImmediate);
    }
    if (reason != OutputReasonStateOnly) {
        if (output_report_has_state_flags(data, len)) {
            return enqueue_classic_rumble_immediate_or_state_output(data, len, OutputReasonStateOnly);
        }
        return true;
    }
    return enqueue_classic_rumble_immediate_or_state_output(data, len, reason);
}

bool bt_write_audio_stream(uint8_t *data, uint16_t len) {
    output_packet packet{};
    if (!make_output_packet(data, len, OutputPacketAudio, OutputReasonAudioStream, packet)) {
        return false;
    }

    bool should_request_send = false;
    uint8_t trace_critical_depth = 0;
    uint8_t trace_audio_depth = 0;
    uint8_t trace_route_flags = 0;
    critical_section_enter_blocking(&queue_lock);
    should_request_send = !output_pending_locked();
    while (audio_queue.size() >= AUDIO_SEND_QUEUE_MAX_DEPTH) {
#ifdef ENABLE_COMPANION
        if (!audio_queue.front().data.empty()) {
            uint8_t drop_critical_depth = 0;
            uint8_t drop_audio_depth = 0;
            uint8_t drop_route_flags = 0;
            output_trace_queue_details_locked(drop_critical_depth, drop_audio_depth, drop_route_flags);
            companion_note_feedback_trace_report(
                CompanionFeedbackTraceAudioDrop,
                audio_queue.front().data.data() + 1,
                static_cast<uint16_t>(audio_queue.front().data.size() - 1),
                OutputReasonAudioStream,
                drop_critical_depth,
                drop_audio_depth,
                drop_route_flags | OutputTraceSelectedAudio,
                clamp_output_trace_u8(packet_age_us(time_us_32(), audio_queue.front().enqueue_time_us) / 1000)
            );
        }
#endif
        audio_queue.pop();
        output_counters.audio_drop_oldest_count++;
    }
    audio_queue.push(std::move(packet));
    output_counters.audio_0x36_enqueued_count++;
    update_queue_depth_counters_locked();
    output_trace_queue_details_locked(trace_critical_depth, trace_audio_depth, trace_route_flags);
    critical_section_exit(&queue_lock);
#ifdef ENABLE_COMPANION
    companion_note_feedback_trace_report(
        CompanionFeedbackTraceAudioEnqueue,
        data,
        len,
        OutputReasonAudioStream,
        trace_critical_depth,
        trace_audio_depth,
        trace_route_flags,
        0
    );
#endif
    request_can_send_if_needed(should_request_send);
    return true;
}

void bt_drain_audio_stream() {
    critical_section_enter_blocking(&queue_lock);
    clear_packet_queue(audio_queue);
    output_counters.audio_queue_depth = 0;
    critical_section_exit(&queue_lock);
}

void bt_reset_output_debug_stats() {
    critical_section_enter_blocking(&queue_lock);
    memset(&output_counters, 0, sizeof(output_counters));
    last_bt_send_us = 0;
    last_audio_0x36_send_us = 0;
    non_audio_reports_since_audio = 0;
    consecutive_non_audio_sends = 0;
    update_queue_depth_counters_locked();
    critical_section_exit(&queue_lock);
}

void bt_get_output_debug_stats(bt_output_debug_stats *stats) {
    if (stats == nullptr) {
        return;
    }
    memset(stats, 0, sizeof(*stats));
    critical_section_enter_blocking(&queue_lock);
    stats->audio_0x36_enqueue_to_send_max_us = output_counters.audio_0x36_max_age_us;
    stats->audio_0x36_send_gap_max_us = output_counters.audio_0x36_send_gap_max_us;
    stats->audio_0x36_late_count_over_12000_us = output_counters.audio_0x36_late_count_over_12000_us;
    stats->audio_0x36_drop_oldest_count = output_counters.audio_drop_oldest_count;
    stats->non_audio_reports_between_audio_max = output_counters.non_audio_reports_between_audio_max;
    stats->bt_audio_queue_depth_max = output_counters.audio_queue_max_depth;
    stats->audio_0x36_enqueued_count = output_counters.audio_0x36_enqueued_count;
    stats->audio_0x36_sent_count = output_counters.audio_0x36_sent_count;
    critical_section_exit(&queue_lock);
}

vector<uint8_t> get_feature_data(uint8_t reportId, uint16_t len) {
    (void)len;
    // These reports must request fresh controller state; other reports can reuse cached data.
    auto ret = vector<uint8_t>{};
    const bool cached = feature_data.contains(reportId);
    if (cached) {
        ret = feature_data[reportId];
    }
    const bool requires_fresh_state = reportId == 0x81
        || reportId == 0x63
        || reportId == 0x65
        || reportId == 0x64;
    const bool should_request = !cached || requires_fresh_state;
    if (!should_request || hid_control_cid == 0) {
        return ret;
    }

    uint8_t get_feature[] = {0x43, reportId};
    enqueue_control_packet(get_feature, sizeof(get_feature), true);
    DS5_LOG("[L2CAP] Requesting Get Feature Report 0x%02X\n", reportId);
    return ret;
}

void set_feature_data(uint8_t reportId, uint8_t const* data,uint16_t len) {
    if (hid_control_cid != 0) {
        if (data == nullptr || len < 4 || len > 62) {
            DS5_LOG("[L2CAP] Set Feature Report 0x%02X rejected: len=%u\n", reportId, len);
            return;
        }
        vector<uint8_t> set_feature(len + 2);
        set_feature[0] = 0x53;
        set_feature[1] = reportId;
        memcpy(set_feature.data() + 2,data,len);
        if (!fill_feature_report_checksum(set_feature.data() + 1, len + 1)) {
            DS5_LOG("[L2CAP] Refusing Set Feature Report 0x%02X with invalid checksum length %u\n",
                reportId,
                static_cast<unsigned>(len + 1));
            return;
        }
        enqueue_control_packet(set_feature.data(), static_cast<uint16_t>(set_feature.size()), true);
        DS5_LOG("[L2CAP] Requesting Set Feature Report 0x%02X\n", reportId);
        DS5_HEXDUMP(set_feature.data(), set_feature.size());
    }
}

void init_feature() {
    controller_type = ControllerTypeUnknown;
    feature_prefetch_active = true;
    get_feature_data(0x09, 20);
    get_feature_data(0x20, 64);
    get_feature_data(0x22, 64);
    get_feature_data(0x05, 41);
    controller_type_check_pending = true;
    get_feature_data(0x70, 64);
    feature_prefetch_active = false;
}
