//
// Created by awalol on 2026/3/4.
// Modified for DS5 Bridge companion firmware and app integration.
//

#include <algorithm>
#include <array>
#include <cstdio>
#include <cstring>

#include "bt.h"

#include <deque>
#include <queue>
#include <unordered_map>
#include <utility>
#include <vector>

#include "audio.h"
#include "classic_rumble_delivery_policy.h"
#include "controller_packet_compositor.h"
#include "controller_output_policy.h"
#include "controller_output_rumble_state.h"
#include "controller_output_state.h"
#include "dualsense_output.h"
#include "output_scheduler.h"
#ifdef ENABLE_COMPANION
#include "companion.h"
#endif
#include "btstack_event.h"
#include "btstack_tlv.h"
#include "controller_report.h"
#include "gap.h"
#include "l2cap.h"
#include "pico/cyw43_arch.h"
#include "pico/stdio.h"
#include "usb.h"
#include "utils.h"
#include "wolwifi.h"
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
#define DS_OUTPUT_VALID_FLAG0_HEADPHONE_VOLUME_ENABLE 0x10
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
#define AUDIO_INTERRUPT_PACKET_MAX_SIZE 548
#define AUDIO_STREAM_IDLE_US 35000u
#define AUDIO_STREAM_QUEUE_LATE_US 12000u
#define AUDIO_STREAM_GAP_LATE_US 25000u
#define URGENT_SEND_QUEUE_MAX_DEPTH 16
#define URGENT_SEND_QUEUE_HARD_MAX_DEPTH 64
#define OUTPUT_MAX_CONSECUTIVE_AUDIO_SENDS 4
#define OUTPUT_STATE_MAX_AGE_US 3000
#define CONTROL_SEND_QUEUE_MAX_DEPTH 8
#define CONTROL_SEND_HEADSET_AUDIO_SAFE_WINDOW_US 6000
#define CONTROL_SEND_HEADSET_AUDIO_IDLE_US AUDIO_STREAM_IDLE_US
#define FEATURE_PREFETCH_MAX_REQUESTS 16
#define FEATURE_PREFETCH_SPACING_US 5000u
#define CONTROLLER_DISCONNECT_REBOOT_DELAY_MS 25
#define DISCONNECT_RETRY_DELAY_US 250000u
#define DISCONNECT_RETRY_EVENT_TIMEOUT_US 1000000u
#define DISCONNECT_RETRY_MAX_ATTEMPTS 3u
#define CLASSIC_LINK_SUPERVISION_TIMEOUT_SLOTS 3200u
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
#define RSSI_INPUT_IDLE_GRACE_US 5000000ull
#define RSSI_REQUEST_COOLDOWN_US 10000000ull
#define RSSI_REQUEST_TIMEOUT_US 1000000ull
#define RSSI_RETRIES_PER_IDLE_EPOCH 1u
#define INQUIRY_RETRY_DELAY_US 2000000u
#define PAIRING_WINDOW_US 30000000u
#define PAIRING_ACTIVE_ATTEMPT_EXTENSION_US 12000000u
#define PAIRING_INQUIRY_LENGTH_UNITS 24u
#define INQUIRY_LED_BLINK_INTERVAL_US 250000u
#define AUTHENTICATION_PIN_OR_KEY_MISSING 0x06u
#define ACL_CONNECTION_PENDING_TIMEOUT_US 10000000u
#define HID_CHANNEL_RECOVERY_DELAY_US 250000u
#define HID_REMOTE_INITIATION_GRACE_US 500000u
#define HID_CHANNEL_RECOVERY_MAX_ATTEMPTS 16
#define ENCRYPTION_COMPLETION_TIMEOUT_US 2500000u
#define SECURITY_PHASE_TIMEOUT_US 8000000u
#define HID_OPENING_PHASE_TIMEOUT_US 8000000u
#define HID_REMOTE_INTERRUPT_OPEN_TIMEOUT_US 10000000u
#define HID_REMOTE_INTERRUPT_FOLLOWUP_TIMEOUT_US 1000000u
#define AUTHENTICATION_COLLISION_RETRY_DELAY_US 250000u
#define AUTHENTICATION_COLLISION_MAX_RETRIES 3u
#define AUTHENTICATION_LMP_TRANSACTION_COLLISION 0x23u
#define AUTHENTICATION_DIFFERENT_TRANSACTION_COLLISION 0x2au
#define BT_BLACKLIST_TLV_TAG 0x424C434Bu // ASCII 'BLCK'
#define BT_PAIRING_TRANSACTION_TLV_TAG 0x50545832u // ASCII 'PTX2'
#define BT_PAIRING_TRANSACTION_VERSION 2u
#define BT_PAIRING_TRANSACTION_FLAG_PRIOR_KEY 0x01u
#define BT_PAIRING_TRANSACTION_SIZE (3u + BD_ADDR_LEN + LINK_KEY_LEN + 1u)

#define HCI_SEND_CMD_LOGGED(cmd, ...) do { \
    const uint8_t err = hci_send_cmd((cmd), ##__VA_ARGS__); \
    if (err != 0) { \
        DS5_LOG("[HCI] %s failed err=0x%02X\n", opcode_to_str((cmd)->opcode), err); \
    } \
} while (0)

using std::unordered_map;
using std::vector;
using std::queue;
using std::deque;

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
    OutputReasonHostPassthrough = 8,
    OutputReasonClassicRumbleManagedStop = 9,
};

static ds5::classic_rumble::DeliveryKind classic_rumble_delivery_kind(uint8_t reason) {
    using ds5::classic_rumble::DeliveryKind;
    switch (reason) {
        case OutputReasonHostPassthrough:
            return DeliveryKind::HostPassthrough;
        case OutputReasonClassicRumbleImmediate:
            return DeliveryKind::ManagedActive;
        case OutputReasonClassicRumbleManagedStop:
            return DeliveryKind::ManagedStop;
        default:
            return DeliveryKind::Other;
    }
}

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

enum class BtConnectionPhase : uint8_t {
    Listening = 0,
    Connecting,
    Securing,
    HidOpening,
    Ready,
    Disconnecting,
};

enum class HidConnectionInitiator : uint8_t {
    None = 0,
    Local,
    Remote,
};

struct output_packet {
    vector<uint8_t> data;
    uint32_t enqueue_time_us;
    uint32_t ready_at_us;
    uint8_t packet_class;
    uint8_t report_id;
    uint8_t reason;
    uint8_t retry_count;
    uint8_t trace_detail0;
    uint8_t trace_detail1;
    uint8_t trace_detail2;
    uint8_t trace_detail3;
};

struct audio_output_packet {
    std::array<uint8_t, AUDIO_INTERRUPT_PACKET_MAX_SIZE> data{};
    uint16_t data_size = 0;
    uint32_t enqueue_time_us = 0;
    uint8_t report_id = 0;
};

class fixed_audio_output_queue {
public:
    bool empty() const { return count_ == 0; }
    size_t size() const { return count_; }
    audio_output_packet &front() { return packets_[read_index_]; }
    audio_output_packet const &front() const { return packets_[read_index_]; }

    void pop() {
        if (count_ == 0) {
            return;
        }
        read_index_ = next_index(read_index_);
        count_--;
    }

    void push(audio_output_packet const &packet) {
        if (count_ == AUDIO_SEND_QUEUE_MAX_DEPTH) {
            pop();
        }
        packets_[write_index_] = packet;
        write_index_ = next_index(write_index_);
        count_++;
    }

    void clear() {
        read_index_ = 0;
        write_index_ = 0;
        count_ = 0;
    }

private:
    static constexpr uint8_t next_index(uint8_t index) {
        index++;
        return index == AUDIO_SEND_QUEUE_MAX_DEPTH ? 0 : index;
    }

    std::array<audio_output_packet, AUDIO_SEND_QUEUE_MAX_DEPTH> packets_{};
    uint8_t read_index_ = 0;
    uint8_t write_index_ = 0;
    uint8_t count_ = 0;
};

struct control_packet {
    vector<uint8_t> data;
    uint32_t enqueue_time_us;
    uint8_t report_id;
    bool coalescible;
};

struct feature_prefetch_request {
    uint8_t report_id;
    uint16_t len;
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
    uint32_t audio_l2cap_send_fail_count;
    uint32_t normal_0x31_rx_count;
    uint32_t normal_0x31_sent_count;
    uint32_t non_audio_reports_between_audio_max;
    uint32_t bt_send_gap_max_us;
};

enum class pairing_transaction_state : uint8_t {
    AwaitingKey = 1,
    KeyAccepted = 2,
};

struct pairing_transaction {
    bool valid;
    pairing_transaction_state state;
    bool prior_key_valid;
    bd_addr_t addr;
    link_key_t prior_key;
    link_key_type_t prior_type;
};

static void hci_packet_handler(uint8_t packet_type, uint16_t channel, uint8_t *packet, uint16_t size);
static void l2cap_packet_handler(uint8_t packet_type, uint16_t channel, uint8_t *packet, uint16_t size);
static void l2cap_packet_handler_cold(uint8_t packet_type, uint16_t channel, uint8_t *packet, uint16_t size);
static int classic_connection_filter(bd_addr_t addr, hci_link_type_t link_type);
static bool build_interrupt_output_packet(uint8_t *data, uint16_t len, vector<uint8_t> &packet);
static bool prepare_interrupt_output_packet_for_send(output_packet &packet);
static void commit_interrupt_output_packet_sent(output_packet const &packet);
static bool enqueue_urgent_output(uint8_t *data, uint16_t len, uint8_t reason);
static bool enqueue_state_output(uint8_t *data, uint16_t len, uint8_t reason);
static bool enqueue_feedback_state_output(uint8_t *data, uint16_t len, uint8_t reason);
static bool enqueue_classic_rumble_immediate_or_state_output(
    uint8_t *data,
    uint16_t len,
    uint8_t reason
);
static bool enqueue_control_packet(uint8_t const *data, uint16_t len, bool coalescible);
static bool select_next_control_packet_locked(control_packet &packet, uint32_t now);
static void request_can_send_if_needed(bool should_request_send);
static void request_control_can_send_if_needed(bool should_request_send);
static bool audio_send_window_closed_locked(uint32_t now);
static void request_control_if_audio_window_open_locked(uint32_t now, bool &should_request_control);
static void finish_hid_session_if_ready();
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
static bool inquiry_retry_scheduled = false;
static uint32_t inquiry_retry_at_us = 0;
static bool pairing_window_active = false;
static uint32_t pairing_window_deadline_us = 0;
static bool inquiry_led_on = false;
static uint32_t inquiry_led_last_toggle_us = 0;
static bool stored_link_key_present = false;
static bd_addr_t cleared_controller_addrs[NVM_NUM_LINK_KEYS];
static int cleared_controller_addr_count = 0;
static bool acl_connection_pending = false;
static uint32_t acl_connection_pending_at_us = 0;
static bool acl_connection_outbound = false;
static bool acl_connection_cancel_requested = false;
static bool acl_connection_cancel_sent = false;
static bool acl_disconnect_on_completion = false;
static uint8_t current_device_page_scan_repetition_mode = 0;
static uint16_t current_device_clock_offset = 0;
static bool pairing_authorized_session = false;
static bool pairing_link_key_required = false;
static bool current_link_key_persisted = false;
static bool pairing_transaction_recovery_failed = false;
static hci_con_handle_t acl_handle = HCI_CON_HANDLE_INVALID;
static uint16_t hid_control_cid;
static uint16_t hid_interrupt_cid;
static uint16_t hid_control_pending_cid;
static uint16_t hid_interrupt_pending_cid;
static bt_data_callback_t bt_data_callback = nullptr;
static uint8_t controller_type = ControllerTypeUnknown;
static bool controller_type_check_pending = false;
static bool hid_control_ready = false;
static bool hid_interrupt_ready = false;
static HidConnectionInitiator hid_connection_initiator = HidConnectionInitiator::None;
static uint32_t hid_control_opened_at_us = 0;
static bool hid_channel_recovery_pending = false;
static uint32_t hid_channel_recovery_at_us = 0;
static uint8_t hid_channel_recovery_attempts = 0;
static BtConnectionPhase connection_phase = BtConnectionPhase::Listening;
static uint32_t connection_generation = 0;
static uint32_t connection_phase_started_us = 0;
static bool encryption_completion_pending = false;
static hci_con_handle_t encryption_command_handle = HCI_CON_HANDLE_INVALID;
static uint32_t encryption_command_generation = 0;
static uint32_t encryption_command_accepted_at_us = 0;
static bool authentication_retry_pending = false;
static uint8_t authentication_retry_attempts = 0;
static uint32_t authentication_retry_at_us = 0;
static bool disconnect_retry_requested = false;
static bool disconnect_retry_waiting = false;
static uint8_t disconnect_retry_attempts = 0;
static uint32_t disconnect_retry_at_us = 0;
static BtControllerDisconnectIntent controller_disconnect_intent =
    BtControllerDisconnectIntentNone;
static int8_t bt_rssi = 0;
static bool bt_rssi_known = false;
static bool bt_rssi_request_pending = false;
static bool bt_rssi_idle_epoch_armed = false;
static uint8_t bt_rssi_retries_remaining = 0;
static uint64_t bt_rssi_idle_epoch = 0;
static uint64_t bt_rssi_pending_epoch = 0;
static uint64_t bt_rssi_last_activity_us = 0;
static uint64_t bt_rssi_last_request_us = 0;
unordered_map<uint8_t, vector<uint8_t> > feature_data;
static feature_prefetch_request feature_prefetch_queue[FEATURE_PREFETCH_MAX_REQUESTS]{};
static uint8_t feature_prefetch_count = 0;
static uint8_t feature_prefetch_index = 0;
static uint32_t feature_prefetch_next_us = 0;
static deque<output_packet> urgent_queue;
static fixed_audio_output_queue audio_queue;
static output_packet interrupt_send_packet;
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
static uint8_t consecutive_audio_sends = 0;
static uint8_t consecutive_classic_rumble_stop_sends = 0;
static bool interrupt_can_send_event_requested = false;
static critical_section_t queue_lock;
uint64_t inactive_time = 0; // Tracks long controller inactivity without 32-bit timer wrap.
static uint16_t idle_disconnect_timeout_minutes = DEFAULT_IDLE_DISCONNECT_TIMEOUT_MINUTES;
static uint8_t saved_lightbar_red = 0xff;
static uint8_t saved_lightbar_green = 0xd7;
static uint8_t saved_lightbar_blue = 0x00;
static uint8_t saved_lightbar_brightness = 100;
static bool player_led_enabled = true;
static bool lightbar_restore_enabled = true;
static bool lightbar_restore_pending = false;
static uint32_t lightbar_restore_at_us = 0;

// WOL indicator state: a pulsing/solid green sequence overlaid on the
// lightbar while wolwifi.cpp resends a magic packet, independent of the
// normal restore-to-last-set-color mechanism above (bt_set_lightbar_color()
// overwrites saved_lightbar_* immediately, so it can't itself remember
// "what was showing before the indicator started" -- this snapshot exists
// for exactly that purpose).
enum class WolIndicatorPhase : uint8_t { Idle, Pulsing, Confirmed };
static WolIndicatorPhase wol_indicator_phase = WolIndicatorPhase::Idle;
static uint8_t wol_indicator_pre_red = 0;
static uint8_t wol_indicator_pre_green = 0;
static uint8_t wol_indicator_pre_blue = 0;
static uint8_t wol_indicator_pre_brightness = 0;
static uint32_t wol_indicator_phase_started_us = 0;
static constexpr uint32_t WOL_INDICATOR_PULSE_PERIOD_MS = 1500;
static constexpr uint32_t WOL_INDICATOR_CONFIRMED_HOLD_MS = 2000;
// "Dark"/"light" green endpoints of the pulse, and the solid confirmed
// color -- distinct from the existing blue (0x00,0x00,0xff) controller-wake
// flash used elsewhere, so the two signals don't look alike.
static constexpr uint8_t WOL_INDICATOR_DARK_GREEN = 0x20;
static constexpr uint8_t WOL_INDICATOR_LIGHT_GREEN = 0xff;
static constexpr uint8_t WOL_INDICATOR_BRIGHTNESS = 100;
static uint8_t state_report_seq = 0;
static bool edge_profile_switching_blocked = false;
static bool edge_profile_switching_mode_applied = false;
static bool edge_profile_switching_mode_applied_value = false;
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

static void clear_packet_queue(deque<output_packet> &packets) {
    packets.clear();
}

static void clear_packet_queue(fixed_audio_output_queue &packets) {
    packets.clear();
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
    consecutive_audio_sends = 0;
    consecutive_classic_rumble_stop_sends = 0;
    interrupt_can_send_event_requested = false;
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
    edge_profile_switching_mode_applied = false;
    speaker_output_enabled = false;
    speaker_output_headset_route = false;
    lightbar_restore_pending = false;
    lightbar_restore_at_us = 0;
}

static bool output_pending_locked() {
    return !urgent_queue.empty() || !audio_queue.empty() || state_pending;
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

static void clear_feature_prefetch_queue() {
    feature_prefetch_count = 0;
    feature_prefetch_index = 0;
    feature_prefetch_next_us = 0;
}

static void schedule_feature_prefetch(uint8_t report_id, uint16_t len) {
    if (feature_prefetch_count >= FEATURE_PREFETCH_MAX_REQUESTS) {
        DS5_LOG("[L2CAP] Feature prefetch queue full, dropping report 0x%02X\n", report_id);
        return;
    }
    feature_prefetch_queue[feature_prefetch_count++] = feature_prefetch_request{
        report_id,
        len
    };
}

static void clear_encryption_completion() {
    encryption_completion_pending = false;
    encryption_command_handle = HCI_CON_HANDLE_INVALID;
    encryption_command_generation = 0;
    encryption_command_accepted_at_us = 0;
}

static void clear_authentication_retry() {
    authentication_retry_pending = false;
    authentication_retry_attempts = 0;
    authentication_retry_at_us = 0;
}

static void note_connection_phase_started() {
    connection_phase_started_us = time_us_32();
}

static void reset_signal_strength_session() {
    bt_rssi = 0;
    bt_rssi_known = false;
    bt_rssi_request_pending = false;
    bt_rssi_idle_epoch_armed = false;
    bt_rssi_retries_remaining = 0;
    bt_rssi_idle_epoch = 0;
    bt_rssi_pending_epoch = 0;
    bt_rssi_last_activity_us = 0;
    bt_rssi_last_request_us = 0;
}

static void arm_signal_strength_idle_epoch(uint64_t now_us) {
    bt_rssi_idle_epoch++;
    if (bt_rssi_idle_epoch == 0) {
        bt_rssi_idle_epoch = 1;
    }
    bt_rssi_last_activity_us = now_us;
    bt_rssi_idle_epoch_armed = true;
    bt_rssi_retries_remaining = RSSI_RETRIES_PER_IDLE_EPOCH;
}

static bool begin_connection_attempt() {
    if (connection_phase != BtConnectionPhase::Listening) {
        return false;
    }
    if (pairing_transaction_recovery_failed) {
        return false;
    }
    controller_disconnect_intent = BtControllerDisconnectIntentNone;
    pairing_authorized_session = false;
    pairing_link_key_required = false;
    current_link_key_persisted = false;
    connection_phase = BtConnectionPhase::Connecting;
    connection_generation++;
    if (connection_generation == 0) {
        connection_generation++;
    }
    connection_phase_started_us = time_us_32();
    clear_encryption_completion();
    clear_authentication_retry();
    return true;
}

static bool connection_handle_is_current(hci_con_handle_t handle) {
    return handle != HCI_CON_HANDLE_INVALID && handle == acl_handle;
}

static bool note_acl_connected(hci_con_handle_t handle) {
    if (
        connection_phase != BtConnectionPhase::Connecting
        || handle == HCI_CON_HANDLE_INVALID
    ) {
        return false;
    }
    acl_handle = handle;
    connection_phase = BtConnectionPhase::Securing;
    note_connection_phase_started();
    clear_encryption_completion();
    return true;
}

static void fail_pending_connection_attempt() {
    if (
        connection_phase == BtConnectionPhase::Connecting
        && acl_handle == HCI_CON_HANDLE_INVALID
    ) {
        connection_phase = BtConnectionPhase::Listening;
        connection_phase_started_us = 0;
        pairing_authorized_session = false;
        pairing_link_key_required = false;
        current_link_key_persisted = false;
        clear_encryption_completion();
        clear_authentication_retry();
    }
}

static bool begin_hid_opening(hci_con_handle_t handle) {
    if (!connection_handle_is_current(handle)) {
        return false;
    }
    if (connection_phase == BtConnectionPhase::HidOpening) {
        return true;
    }
    if (connection_phase != BtConnectionPhase::Securing) {
        return false;
    }
    connection_phase = BtConnectionPhase::HidOpening;
    note_connection_phase_started();
    clear_encryption_completion();
    return true;
}

static bool begin_connection_disconnect() {
    if (acl_handle == HCI_CON_HANDLE_INVALID) {
        return false;
    }
    if (connection_phase == BtConnectionPhase::Disconnecting) {
        return true;
    }
    connection_phase = BtConnectionPhase::Disconnecting;
    note_connection_phase_started();
    clear_encryption_completion();
    clear_authentication_retry();
    return true;
}

static void reset_connection_session() {
    connection_phase = BtConnectionPhase::Listening;
    connection_phase_started_us = 0;
    pairing_authorized_session = false;
    pairing_link_key_required = false;
    current_link_key_persisted = false;
    clear_encryption_completion();
    clear_authentication_retry();
}

static bool current_link_security_ready(hci_con_handle_t handle) {
    return connection_handle_is_current(handle)
        && gap_security_level(handle) >= LEVEL_2;
}

static void clear_acl_connection_pending() {
    acl_connection_pending = false;
    acl_connection_pending_at_us = 0;
    acl_connection_cancel_requested = false;
    acl_connection_cancel_sent = false;
}

static void mark_acl_connection_pending() {
    acl_connection_pending = true;
    acl_connection_pending_at_us = time_us_32();
    acl_connection_cancel_requested = false;
    acl_connection_cancel_sent = false;
}

static void clear_outbound_inquiry_target() {
    device_found = false;
    new_pair = false;
    current_device_page_scan_repetition_mode = 0;
    current_device_clock_offset = 0;
}

static bool bt_has_stored_link_key() {
    btstack_link_key_iterator_t iterator;
    if (!gap_link_key_iterator_init(&iterator)) {
        return false;
    }

    bd_addr_t addr;
    link_key_t key;
    link_key_type_t type;
    const bool has_key = gap_link_key_iterator_get_next(&iterator, addr, key, &type);
    gap_link_key_iterator_done(&iterator);
    return has_key;
}

static bool bt_blacklist_persist() {
    const btstack_tlv_t *tlv = nullptr;
    void *tlv_context = nullptr;
    btstack_tlv_get_instance(&tlv, &tlv_context);
    if (tlv == nullptr) {
        DS5_LOG("[BLACKLIST] No TLV instance available, not persisting\n");
        return false;
    }

    if (cleared_controller_addr_count == 0) {
        tlv->delete_tag(tlv_context, BT_BLACKLIST_TLV_TAG);
        const bool deleted =
            tlv->get_tag(tlv_context, BT_BLACKLIST_TLV_TAG, nullptr, 0) == 0;
        DS5_LOG("[BLACKLIST] Empty, deleted from flash verified=%u\n", deleted ? 1u : 0u);
        return deleted;
    }

    const uint32_t bytes =
        static_cast<uint32_t>(cleared_controller_addr_count) * sizeof(bd_addr_t);
    const int rc = tlv->store_tag(
        tlv_context,
        BT_BLACKLIST_TLV_TAG,
        reinterpret_cast<const uint8_t *>(cleared_controller_addrs),
        bytes
    );
    bd_addr_t verified_addrs[NVM_NUM_LINK_KEYS]{};
    const int verified_len = tlv->get_tag(
        tlv_context,
        BT_BLACKLIST_TLV_TAG,
        reinterpret_cast<uint8_t *>(verified_addrs),
        sizeof(verified_addrs)
    );
    const bool verified =
        rc == 0
        && verified_len == static_cast<int>(bytes)
        && memcmp(verified_addrs, cleared_controller_addrs, bytes) == 0;
    DS5_LOG(
        "[BLACKLIST] Persisted %d entries (%lu bytes), rc=%d verified=%u\n",
        cleared_controller_addr_count,
        static_cast<unsigned long>(bytes),
        rc,
        verified ? 1u : 0u
    );
    return verified;
}

static void bt_blacklist_load() {
    const btstack_tlv_t *tlv = nullptr;
    void *tlv_context = nullptr;
    btstack_tlv_get_instance(&tlv, &tlv_context);
    if (tlv == nullptr) {
        cleared_controller_addr_count = 0;
        return;
    }

    const int len = tlv->get_tag(
        tlv_context,
        BT_BLACKLIST_TLV_TAG,
        reinterpret_cast<uint8_t *>(cleared_controller_addrs),
        sizeof(cleared_controller_addrs)
    );
    if (len <= 0 || (len % static_cast<int>(sizeof(bd_addr_t))) != 0) {
        cleared_controller_addr_count = 0;
        DS5_LOG("[BLACKLIST] No persisted entries\n");
        return;
    }

    cleared_controller_addr_count = len / static_cast<int>(sizeof(bd_addr_t));
    if (cleared_controller_addr_count > NVM_NUM_LINK_KEYS) {
        cleared_controller_addr_count = NVM_NUM_LINK_KEYS;
    }
    DS5_LOG("[BLACKLIST] Loaded %d entries from flash\n", cleared_controller_addr_count);
}

static bool bt_blacklist_contains(bd_addr_t addr) {
    for (int i = 0; i < cleared_controller_addr_count; i++) {
        if (bd_addr_cmp(addr, cleared_controller_addrs[i]) == 0) {
            return true;
        }
    }
    return false;
}

static bool bt_blacklist_add_unique(bd_addr_t addr) {
    if (bt_blacklist_contains(addr)) {
        return true;
    }
    if (cleared_controller_addr_count >= NVM_NUM_LINK_KEYS) {
        DS5_LOG("[BLACKLIST] Full, cannot add %s\n", bd_addr_to_str(addr));
        return false;
    }
    bd_addr_copy(cleared_controller_addrs[cleared_controller_addr_count++], addr);
    DS5_LOG("[BLACKLIST] Added %s\n", bd_addr_to_str(addr));
    return true;
}

static bool bt_blacklist_remove(bd_addr_t addr) {
    for (int i = 0; i < cleared_controller_addr_count; i++) {
        if (bd_addr_cmp(addr, cleared_controller_addrs[i]) != 0) {
            continue;
        }

        bd_addr_t previous_addrs[NVM_NUM_LINK_KEYS]{};
        const int previous_count = cleared_controller_addr_count;
        memcpy(previous_addrs, cleared_controller_addrs, sizeof(previous_addrs));
        for (int j = i; j < cleared_controller_addr_count - 1; j++) {
            bd_addr_copy(cleared_controller_addrs[j], cleared_controller_addrs[j + 1]);
        }
        cleared_controller_addr_count--;
        memset(cleared_controller_addrs[cleared_controller_addr_count], 0, sizeof(bd_addr_t));
        if (!bt_blacklist_persist()) {
            memcpy(cleared_controller_addrs, previous_addrs, sizeof(previous_addrs));
            cleared_controller_addr_count = previous_count;
            DS5_LOG(
                "[BLACKLIST] Failed durable removal for %s; keep policy fail-closed\n",
                bd_addr_to_str(addr)
            );
            return false;
        }
        DS5_LOG(
            "[BLACKLIST] Durably removed %s after explicit pairing, %d remaining\n",
            bd_addr_to_str(addr),
            cleared_controller_addr_count
        );
        return true;
    }
    return true;
}

static bool link_key_material_is_valid(uint8_t const *key, link_key_type_t type) {
    if (type == INVALID_LINK_KEY || gap_security_level_for_link_key_type(type) < LEVEL_2) {
        return false;
    }
    for (uint8_t i = 0; i < LINK_KEY_LEN; ++i) {
        if (key[i] != 0) {
            return true;
        }
    }
    return false;
}

static bool pairing_transaction_equal(
    pairing_transaction const &left,
    pairing_transaction const &right
) {
    return left.valid == right.valid
        && left.state == right.state
        && left.prior_key_valid == right.prior_key_valid
        && bd_addr_cmp(left.addr, right.addr) == 0
        && (!left.prior_key_valid || (
            memcmp(left.prior_key, right.prior_key, LINK_KEY_LEN) == 0
            && left.prior_type == right.prior_type
        ));
}

static bool pairing_transaction_storage_status(bool &present) {
    present = false;
    const btstack_tlv_t *tlv = nullptr;
    void *tlv_context = nullptr;
    btstack_tlv_get_instance(&tlv, &tlv_context);
    if (tlv == nullptr) {
        return false;
    }
    present =
        tlv->get_tag(tlv_context, BT_PAIRING_TRANSACTION_TLV_TAG, nullptr, 0) > 0;
    return true;
}

static bool read_pairing_transaction(pairing_transaction &transaction) {
    transaction = {};
    const btstack_tlv_t *tlv = nullptr;
    void *tlv_context = nullptr;
    btstack_tlv_get_instance(&tlv, &tlv_context);
    if (tlv == nullptr) {
        return false;
    }

    uint8_t record[BT_PAIRING_TRANSACTION_SIZE]{};
    const int len = tlv->get_tag(
        tlv_context,
        BT_PAIRING_TRANSACTION_TLV_TAG,
        record,
        sizeof(record)
    );
    if (
        len != static_cast<int>(sizeof(record))
        || record[0] != BT_PAIRING_TRANSACTION_VERSION
        || (record[2] & ~BT_PAIRING_TRANSACTION_FLAG_PRIOR_KEY) != 0
    ) {
        return false;
    }
    if (
        record[1] != static_cast<uint8_t>(pairing_transaction_state::AwaitingKey)
        && record[1] != static_cast<uint8_t>(pairing_transaction_state::KeyAccepted)
    ) {
        return false;
    }

    transaction.state = static_cast<pairing_transaction_state>(record[1]);
    transaction.prior_key_valid =
        (record[2] & BT_PAIRING_TRANSACTION_FLAG_PRIOR_KEY) != 0;
    bd_addr_copy(transaction.addr, &record[3]);
    memcpy(transaction.prior_key, &record[3 + BD_ADDR_LEN], LINK_KEY_LEN);
    transaction.prior_type = static_cast<link_key_type_t>(
        record[3 + BD_ADDR_LEN + LINK_KEY_LEN]
    );
    if (
        transaction.prior_key_valid
        && !link_key_material_is_valid(transaction.prior_key, transaction.prior_type)
    ) {
        return false;
    }
    transaction.valid = true;
    return true;
}

static bool write_pairing_transaction(pairing_transaction const &transaction) {
    if (!transaction.valid) {
        return false;
    }
    const btstack_tlv_t *tlv = nullptr;
    void *tlv_context = nullptr;
    btstack_tlv_get_instance(&tlv, &tlv_context);
    if (tlv == nullptr) {
        return false;
    }

    uint8_t record[BT_PAIRING_TRANSACTION_SIZE]{};
    record[0] = BT_PAIRING_TRANSACTION_VERSION;
    record[1] = static_cast<uint8_t>(transaction.state);
    record[2] =
        transaction.prior_key_valid ? BT_PAIRING_TRANSACTION_FLAG_PRIOR_KEY : 0;
    memcpy(&record[3], transaction.addr, BD_ADDR_LEN);
    if (transaction.prior_key_valid) {
        memcpy(&record[3 + BD_ADDR_LEN], transaction.prior_key, LINK_KEY_LEN);
        record[3 + BD_ADDR_LEN + LINK_KEY_LEN] =
            static_cast<uint8_t>(transaction.prior_type);
    }
    if (
        tlv->store_tag(
            tlv_context,
            BT_PAIRING_TRANSACTION_TLV_TAG,
            record,
            sizeof(record)
        ) != 0
    ) {
        return false;
    }

    pairing_transaction verified{};
    return read_pairing_transaction(verified)
        && pairing_transaction_equal(verified, transaction);
}

static bool discard_pairing_transaction() {
    const btstack_tlv_t *tlv = nullptr;
    void *tlv_context = nullptr;
    btstack_tlv_get_instance(&tlv, &tlv_context);
    if (tlv == nullptr) {
        return false;
    }
    tlv->delete_tag(tlv_context, BT_PAIRING_TRANSACTION_TLV_TAG);
    return tlv->get_tag(
        tlv_context,
        BT_PAIRING_TRANSACTION_TLV_TAG,
        nullptr,
        0
    ) == 0;
}

static bool stage_pairing_transaction(
    bd_addr_t addr,
    uint8_t const *prior_key,
    link_key_type_t prior_type
) {
    bool transaction_present = false;
    if (
        !pairing_transaction_storage_status(transaction_present)
        || transaction_present
    ) {
        DS5_LOG("[HCI] Refuse to overwrite unfinished pairing transaction\n");
        pairing_transaction_recovery_failed = true;
        return false;
    }

    pairing_transaction transaction{};
    transaction.valid = true;
    transaction.state = pairing_transaction_state::AwaitingKey;
    transaction.prior_key_valid =
        prior_key != nullptr && link_key_material_is_valid(prior_key, prior_type);
    bd_addr_copy(transaction.addr, addr);
    if (transaction.prior_key_valid) {
        memcpy(transaction.prior_key, prior_key, LINK_KEY_LEN);
        transaction.prior_type = prior_type;
    }
    const bool staged = write_pairing_transaction(transaction);
    pairing_transaction_recovery_failed = !staged;
    return staged;
}

static bool mark_pairing_transaction_key_accepted(bd_addr_t addr) {
    pairing_transaction transaction{};
    if (
        !read_pairing_transaction(transaction)
        || bd_addr_cmp(transaction.addr, addr) != 0
    ) {
        return false;
    }
    transaction.state = pairing_transaction_state::KeyAccepted;
    return write_pairing_transaction(transaction);
}

static bool invalidate_rejected_pairing_transaction_prior_key(bd_addr_t addr) {
    bool transaction_present = false;
    if (!pairing_transaction_storage_status(transaction_present)) {
        pairing_transaction_recovery_failed = true;
        return false;
    }
    if (!transaction_present) {
        return true;
    }

    pairing_transaction transaction{};
    if (!read_pairing_transaction(transaction)) {
        pairing_transaction_recovery_failed = true;
        return false;
    }
    if (bd_addr_cmp(transaction.addr, addr) != 0) {
        DS5_LOG(
            "[HCI] Rejected key does not match staged pairing transaction for %s\n",
            bd_addr_to_str(addr)
        );
        pairing_transaction_recovery_failed = true;
        return false;
    }
    if (
        transaction.state != pairing_transaction_state::AwaitingKey
        || !transaction.prior_key_valid
    ) {
        return true;
    }

    // A PIN_OR_KEY_MISSING response proves the controller no longer accepts
    // the key saved before explicit re-pairing. Persist that fact before
    // deleting the live BTstack copy so disconnect and boot recovery cannot
    // resurrect the rejected key.
    transaction.prior_key_valid = false;
    memset(transaction.prior_key, 0, sizeof(transaction.prior_key));
    transaction.prior_type = INVALID_LINK_KEY;
    if (!write_pairing_transaction(transaction)) {
        // Deleting the transaction is also safe after an explicit rejection:
        // there is no valid prior bond left to roll back to.
        if (discard_pairing_transaction()) {
            DS5_LOG("[HCI] Discarded rejected pairing transaction after rewrite failure\n");
            return true;
        }
        pairing_transaction_recovery_failed = true;
        return false;
    }

    DS5_LOG("[HCI] Invalidated rejected prior pairing key for %s\n", bd_addr_to_str(addr));
    return true;
}

static bool restore_uncommitted_pairing_key(char const *reason) {
    bool transaction_present = false;
    if (!pairing_transaction_storage_status(transaction_present)) {
        pairing_transaction_recovery_failed = true;
        return false;
    }
    if (!transaction_present) {
        pairing_transaction_recovery_failed = false;
        return true;
    }

    pairing_transaction transaction{};
    if (!read_pairing_transaction(transaction)) {
        pairing_transaction_recovery_failed = true;
        return false;
    }
    if (transaction.state == pairing_transaction_state::KeyAccepted) {
        if (
            !bt_blacklist_remove(transaction.addr)
            || !discard_pairing_transaction()
        ) {
            pairing_transaction_recovery_failed = true;
            return false;
        }
        stored_link_key_present = bt_has_stored_link_key();
        pairing_transaction_recovery_failed = false;
        return true;
    }

    link_key_t stored_key;
    link_key_type_t stored_type;
    const bool has_current_key = gap_get_link_key_for_bd_addr(
        transaction.addr,
        stored_key,
        &stored_type
    );
    if (transaction.prior_key_valid) {
        const bool prior_is_current =
            has_current_key
            && memcmp(stored_key, transaction.prior_key, LINK_KEY_LEN) == 0
            && stored_type == transaction.prior_type;
        if (!prior_is_current) {
            if (has_current_key) {
                gap_drop_link_key_for_bd_addr(transaction.addr);
            }
            gap_store_link_key_for_bd_addr(
                transaction.addr,
                transaction.prior_key,
                transaction.prior_type
            );
        }
        if (
            !gap_get_link_key_for_bd_addr(transaction.addr, stored_key, &stored_type)
            || memcmp(stored_key, transaction.prior_key, LINK_KEY_LEN) != 0
            || stored_type != transaction.prior_type
        ) {
            DS5_LOG("[HCI] Failed to restore prior pairing key during %s\n", reason);
            pairing_transaction_recovery_failed = true;
            return false;
        }
        DS5_LOG("[HCI] Restored prior pairing key after %s\n", reason);
    } else {
        if (has_current_key) {
            gap_drop_link_key_for_bd_addr(transaction.addr);
        }
        if (gap_get_link_key_for_bd_addr(transaction.addr, stored_key, &stored_type)) {
            DS5_LOG("[HCI] Failed to clear partial pairing key during %s\n", reason);
            pairing_transaction_recovery_failed = true;
            return false;
        }
    }

    stored_link_key_present = bt_has_stored_link_key();
    if (!discard_pairing_transaction()) {
        pairing_transaction_recovery_failed = true;
        return false;
    }
    pairing_transaction_recovery_failed = false;
    return true;
}

static bool finalize_pairing_policy_for_addr(bd_addr_t addr) {
    return bt_blacklist_remove(addr);
}

static bool recover_pairing_transaction_on_boot() {
    bool transaction_present = false;
    if (!pairing_transaction_storage_status(transaction_present)) {
        return false;
    }
    if (!transaction_present) {
        pairing_transaction_recovery_failed = false;
        return true;
    }

    pairing_transaction transaction{};
    if (!read_pairing_transaction(transaction)) {
        return false;
    }

    link_key_t stored_key;
    link_key_type_t stored_type;
    const bool has_current_key = gap_get_link_key_for_bd_addr(
        transaction.addr,
        stored_key,
        &stored_type
    );
    if (transaction.state == pairing_transaction_state::KeyAccepted) {
        if (
            !has_current_key
            || !link_key_material_is_valid(stored_key, stored_type)
        ) {
            return false;
        }
        DS5_LOG(
            "[HCI] Resume accepted pairing policy commit for %s\n",
            bd_addr_to_str(transaction.addr)
        );
        if (!finalize_pairing_policy_for_addr(transaction.addr)) {
            return false;
        }
    } else if (transaction.prior_key_valid) {
        const bool prior_is_current =
            has_current_key
            && memcmp(stored_key, transaction.prior_key, LINK_KEY_LEN) == 0
            && stored_type == transaction.prior_type;
        if (!prior_is_current) {
            if (has_current_key) {
                gap_drop_link_key_for_bd_addr(transaction.addr);
            }
            gap_store_link_key_for_bd_addr(
                transaction.addr,
                transaction.prior_key,
                transaction.prior_type
            );
        }
        if (
            !gap_get_link_key_for_bd_addr(transaction.addr, stored_key, &stored_type)
            || memcmp(stored_key, transaction.prior_key, LINK_KEY_LEN) != 0
            || stored_type != transaction.prior_type
        ) {
            return false;
        }
        DS5_LOG("[HCI] Boot restored prior pairing key\n");
    } else {
        if (has_current_key) {
            gap_drop_link_key_for_bd_addr(transaction.addr);
        }
        if (gap_get_link_key_for_bd_addr(transaction.addr, stored_key, &stored_type)) {
            return false;
        }
    }

    stored_link_key_present = bt_has_stored_link_key();
    return discard_pairing_transaction();
}

static bool cancel_pairing_transaction_before_forget(
    bool forget_all,
    uint8_t const *target_addr
) {
    bool transaction_present = false;
    if (!pairing_transaction_storage_status(transaction_present)) {
        return false;
    }
    if (!transaction_present) {
        pairing_transaction_recovery_failed = false;
        return true;
    }

    pairing_transaction transaction{};
    const bool transaction_readable = read_pairing_transaction(transaction);
    if (!transaction_readable && !forget_all) {
        return false;
    }
    if (
        transaction_readable
        && !forget_all
        && target_addr != nullptr
        && bd_addr_cmp(transaction.addr, target_addr) != 0
    ) {
        return true;
    }
    const bool discarded = discard_pairing_transaction();
    if (discarded) {
        pairing_transaction_recovery_failed = false;
    }
    return discarded;
}

static bool bt_blacklist_add_stored_link_keys() {
    btstack_link_key_iterator_t iterator;
    if (!gap_link_key_iterator_init(&iterator)) {
        return false;
    }

    bool added = true;
    bd_addr_t addr;
    link_key_t key;
    link_key_type_t type;
    while (gap_link_key_iterator_get_next(&iterator, addr, key, &type)) {
        added = bt_blacklist_add_unique(addr) && added;
    }
    gap_link_key_iterator_done(&iterator);
    return added;
}

static bool bt_current_address_known() {
    return bt_is_controller_connected()
        || device_found
        || acl_connection_pending
        || acl_handle != HCI_CON_HANDLE_INVALID;
}

static bool persist_notified_link_key(
    uint8_t const *packet,
    bd_addr_t addr,
    bool explicit_pairing_session,
    bool existing_link_is_secured
) {
    link_key_t notified_key;
    memcpy(notified_key, packet + 8, LINK_KEY_LEN);

    link_key_t stored_key;
    link_key_type_t stored_type;
    const bool had_stored_key =
        gap_get_link_key_for_bd_addr(addr, stored_key, &stored_type);
    const link_key_type_t notified_type =
        static_cast<link_key_type_t>(packet[24]);
    const link_key_type_t effective_type =
        notified_type == CHANGED_COMBINATION_KEY
        ? (had_stored_key ? stored_type : INVALID_LINK_KEY)
        : notified_type;
    const bool update_authorized =
        explicit_pairing_session
        || (
            had_stored_key
            && notified_type == CHANGED_COMBINATION_KEY
            && existing_link_is_secured
        );

    bool key_has_material = false;
    for (uint8_t byte : notified_key) {
        key_has_material = key_has_material || byte != 0;
    }
    if (
        !update_authorized
        || !key_has_material
        || effective_type == INVALID_LINK_KEY
    ) {
        return false;
    }

    const bool stored_matches =
        had_stored_key
        && memcmp(stored_key, notified_key, LINK_KEY_LEN) == 0
        && stored_type == effective_type;
    if (stored_matches) {
        return true;
    }

    link_key_t prior_key;
    link_key_type_t prior_type = INVALID_LINK_KEY;
    if (had_stored_key) {
        memcpy(prior_key, stored_key, LINK_KEY_LEN);
        prior_type = stored_type;
    }
    gap_store_link_key_for_bd_addr(addr, notified_key, effective_type);
    const bool persisted =
        gap_get_link_key_for_bd_addr(addr, stored_key, &stored_type)
        && memcmp(stored_key, notified_key, LINK_KEY_LEN) == 0
        && stored_type == effective_type;
    if (persisted) {
        return true;
    }

    // Fail closed. A first-time partial write must not enable passive scan on
    // reboot, while a failed rotation should restore the previously verified
    // key instead of stranding an otherwise valid bond.
    gap_drop_link_key_for_bd_addr(addr);
    if (had_stored_key) {
        gap_store_link_key_for_bd_addr(addr, prior_key, prior_type);
    }
    return false;
}

static void restore_passive_reconnect_scan() {
    const bool reconnect_allowed = stored_link_key_present
        && !pairing_transaction_recovery_failed
        && !pairing_window_active
        && !inquiry_active
        && !acl_connection_pending
        && acl_handle == HCI_CON_HANDLE_INVALID;
    gap_connectable_control(reconnect_allowed ? 1 : 0);
    gap_discoverable_control(0);
    gap_set_bondable_mode(
        pairing_window_active && !pairing_transaction_recovery_failed ? 1 : 0
    );
}

static void stop_inquiry_led() {
    if (inquiry_led_on) {
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, false);
    }
    inquiry_led_on = false;
    inquiry_led_last_toggle_us = 0;
}

static void close_pairing_window(bool stop_inquiry) {
    pairing_window_active = false;
    pairing_window_deadline_us = 0;
    inquiry_retry_scheduled = false;
    inquiry_retry_at_us = 0;
    if (stop_inquiry && inquiry_active) {
        gap_inquiry_stop();
    }
    inquiry_active = false;
    stop_inquiry_led();
    restore_passive_reconnect_scan();
}

static void schedule_inquiry_retry(uint32_t delay_us = INQUIRY_RETRY_DELAY_US) {
    inquiry_active = false;
    if (!pairing_window_active || pairing_transaction_recovery_failed) {
        inquiry_retry_scheduled = false;
        inquiry_retry_at_us = 0;
        restore_passive_reconnect_scan();
        return;
    }
    inquiry_retry_scheduled = true;
    inquiry_retry_at_us = time_us_32() + delay_us;
}

static void start_inquiry_if_needed() {
    if (
        !pairing_window_active
        || pairing_transaction_recovery_failed
        || inquiry_active
        || device_found
        || acl_connection_pending
        || acl_handle != HCI_CON_HANDLE_INVALID
    ) {
        return;
    }

    DS5_LOG("[HCI] Start inquiry\n");
    gap_connectable_control(0);
    gap_discoverable_control(0);
    gap_set_bondable_mode(1);
    const int status = gap_inquiry_start(PAIRING_INQUIRY_LENGTH_UNITS);
    if (status == ERROR_CODE_SUCCESS) {
        inquiry_active = true;
        inquiry_retry_scheduled = false;
        inquiry_retry_at_us = 0;
        return;
    }
    DS5_LOG("[HCI] Inquiry start deferred status=0x%02X\n", status);
    schedule_inquiry_retry();
}

static void update_inquiry_led(uint32_t now) {
    if (!pairing_window_active || !inquiry_active || mute[0]) {
        stop_inquiry_led();
        return;
    }
    if (
        inquiry_led_last_toggle_us == 0
        || bt_time_reached(now, inquiry_led_last_toggle_us + INQUIRY_LED_BLINK_INTERVAL_US)
    ) {
        inquiry_led_last_toggle_us = now;
        inquiry_led_on = !inquiry_led_on;
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, inquiry_led_on);
    }
}

static bool classic_acl_connection_allowed(bd_addr_t addr, bool log_reject) {
    if (connection_phase != BtConnectionPhase::Listening) {
        if (log_reject) {
            DS5_LOG("[HCI] Rejecting controller %s while connection phase=%u is busy\n",
                    bd_addr_to_str(addr),
                    static_cast<unsigned int>(connection_phase));
        }
        return false;
    }
    if (pairing_transaction_recovery_failed) {
        if (log_reject) {
            DS5_LOG(
                "[HCI] Rejecting controller %s while pairing recovery is incomplete\n",
                bd_addr_to_str(addr)
            );
        }
        return false;
    }
    if (
        acl_connection_pending
        || acl_handle != HCI_CON_HANDLE_INVALID
        || (device_found && bd_addr_cmp(addr, current_device_addr) != 0)
    ) {
        if (log_reject) {
            DS5_LOG("[HCI] Rejecting controller %s while another Classic transaction owns the radio\n",
                    bd_addr_to_str(addr));
        }
        return false;
    }
    if (pairing_window_active) {
        if (log_reject) {
            DS5_LOG("[HCI] Rejecting incoming page from %s while outbound pairing owns the radio\n",
                    bd_addr_to_str(addr));
        }
        return false;
    }
    if (bt_blacklist_contains(addr)) {
        if (log_reject) {
            DS5_LOG(
                "[HCI] Rejecting cleared controller %s until an explicit scan is requested\n",
                bd_addr_to_str(addr)
            );
        }
        return false;
    }

    link_key_t key;
    link_key_type_t type;
    const bool known_controller = gap_get_link_key_for_bd_addr(addr, key, &type);
    if (!known_controller && log_reject) {
        DS5_LOG("[HCI] Rejecting unknown controller %s outside pairing window\n", bd_addr_to_str(addr));
    }
    return known_controller;
}

static int classic_connection_filter(bd_addr_t addr, hci_link_type_t link_type) {
    return link_type == HCI_LINK_TYPE_ACL && classic_acl_connection_allowed(addr, true);
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

static void __not_in_flash_func(output_trace_queue_details_locked)(
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

bool __not_in_flash_func(bt_is_controller_connected)() {
    return hid_interrupt_ready;
}

bool bt_expected_disconnect_pending() {
    return controller_disconnect_intent != BtControllerDisconnectIntentNone;
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

bool bt_pairing_active() {
    return pairing_window_active;
}

bool bt_get_device_identity(BtDeviceIdentitySnapshot *snapshot) {
    if (snapshot == nullptr) {
        return false;
    }

    memset(snapshot, 0, sizeof(*snapshot));
    snapshot->address_known = bt_current_address_known();
    snapshot->controller_connected = bt_is_controller_connected();
    snapshot->pairing_active = pairing_window_active;
    if (!snapshot->address_known) {
        return false;
    }

    strncpy(snapshot->address, bd_addr_to_str(current_device_addr), sizeof(snapshot->address) - 1);
    snapshot->address[sizeof(snapshot->address) - 1] = '\0';
    switch (controller_type) {
        case ControllerTypeDualSense:
            strncpy(snapshot->name, "DualSense", sizeof(snapshot->name) - 1);
            snapshot->vendor_id = 0x054c;
            snapshot->product_id = 0x0ce6;
            break;
        case ControllerTypeDualSenseEdge:
            strncpy(snapshot->name, "DualSense Edge", sizeof(snapshot->name) - 1);
            snapshot->vendor_id = 0x054c;
            snapshot->product_id = 0x0df2;
            break;
        default:
            strncpy(snapshot->name, "Controller", sizeof(snapshot->name) - 1);
            break;
    }
    snapshot->name[sizeof(snapshot->name) - 1] = '\0';

    link_key_t link_key;
    link_key_type_t link_key_type;
    snapshot->link_key_known =
        gap_get_link_key_for_bd_addr(current_device_addr, link_key, &link_key_type);
    snapshot->link_key_type =
        snapshot->link_key_known ? static_cast<uint8_t>(link_key_type) : 0;
    return true;
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
    apply_classic_rumble_gain(report, sizeof(report));
    if (enqueue_classic_rumble_immediate_or_state_output(
            report,
            sizeof(report),
            OutputReasonStateOnly
        )) {
        controller_output_state_apply_host_payload(report + 3, DS_OUTPUT_REPORT_COMMON_SIZE);
    }
}

static uint8_t scale_lightbar_channel(uint8_t channel, uint8_t brightness_percent) {
    return static_cast<uint8_t>((static_cast<uint16_t>(channel) * brightness_percent + 50) / 100);
}

static void init_state_report(uint8_t *report) {
    // Sequence is shared with 0x39 audio and assigned immediately before the
    // report reaches L2CAP.
    ds5::output::init_bt_output_report(report, 0);
}

static void service_edge_profile_switching_mode() {
    if (
        !bt_is_controller_connected()
        || controller_type != ControllerTypeDualSenseEdge
        || (
            edge_profile_switching_mode_applied
            && edge_profile_switching_mode_applied_value
                == edge_profile_switching_blocked
        )
    ) {
        return;
    }

    uint8_t report[DS_OUTPUT_REPORT_BT_SIZE];
    init_state_report(report);
    if (
        ds5::output::render_edge_profile_switching_payload(
            report + 3,
            DS_OUTPUT_REPORT_COMMON_SIZE,
            edge_profile_switching_blocked
        )
        && enqueue_urgent_output(report, sizeof(report), OutputReasonCriticalDirect)
    ) {
        edge_profile_switching_mode_applied = true;
        edge_profile_switching_mode_applied_value = edge_profile_switching_blocked;
    }
}

void bt_set_edge_profile_switching_blocked(bool blocked) {
    if (edge_profile_switching_blocked != blocked) {
        edge_profile_switching_blocked = blocked;
        edge_profile_switching_mode_applied = false;
    }
    service_edge_profile_switching_mode();
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

static uint8_t adaptive_trigger_motor_power_for_intensity(uint8_t intensity_percent) {
    if (intensity_percent == 0 || intensity_percent >= 100) {
        return 0;
    }
    const uint8_t clamped = intensity_percent > 100 ? 100 : intensity_percent;
    const uint8_t reduction = static_cast<uint8_t>(((100 - clamped) * 8 + 50) / 100);
    return std::min<uint8_t>(reduction, 7);
}

static void queue_adaptive_trigger_state_report(uint8_t *report, uint8_t motor_power) {
    uint8_t *payload = report + 3;
    payload[OUTPUT_PAYLOAD_VALID_FLAG1_OFFSET] |= DS_OUTPUT_VALID_FLAG1_MOTOR_POWER_LEVEL_ENABLE;
    payload[OUTPUT_PAYLOAD_TRIGGER_POWER_OFFSET] = motor_power;
    audio_set_adaptive_trigger_state(
        payload + DS_TRIGGER_EFFECT_RIGHT_OFFSET,
        (payload[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET] & DS_OUTPUT_VALID_FLAG0_RIGHT_TRIGGER_EFFECT) != 0,
        payload + DS_TRIGGER_EFFECT_LEFT_OFFSET,
        (payload[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET] & DS_OUTPUT_VALID_FLAG0_LEFT_TRIGGER_EFFECT) != 0,
        motor_power,
        true
    );
    enqueue_feedback_state_output(report, DS_OUTPUT_REPORT_BT_SIZE, OutputReasonStateOnly);
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
    queue_adaptive_trigger_state_report(
        report,
        adaptive_trigger_motor_power_for_intensity(intensity_percent)
    );
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

    queue_adaptive_trigger_state_report(report, 0);
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
        : ds5::output::mic_volume_from_percent(companion_mic_volume_percent);
    report[3 + OUTPUT_PAYLOAD_POWER_SAVE_CONTROL_OFFSET] = muted ? DS_OUTPUT_POWER_SAVE_CONTROL_MIC_MUTE : 0;
    bt_write(report, sizeof(report));
}

static void send_speaker_output_state(bool enabled, bool headset_plugged) {
    uint8_t report[DS_OUTPUT_REPORT_BT_SIZE];
    init_state_report(report);
    report[3] = DS_OUTPUT_VALID_FLAG0_AUDIO_CONTROL_ENABLE;

    if (enabled) {
        if (headset_plugged) {
            report[3] |= DS_OUTPUT_VALID_FLAG0_HEADPHONE_VOLUME_ENABLE;
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

void bt_set_lightbar_restore_enabled(bool enabled) {
    lightbar_restore_enabled = enabled;
    if (!enabled) {
        lightbar_restore_pending = false;
        lightbar_restore_at_us = 0;
    }
}

void bt_schedule_lightbar_restore(uint32_t delay_ms) {
    if (!lightbar_restore_enabled || hid_interrupt_cid == 0) {
        return;
    }

    lightbar_restore_pending = true;
    lightbar_restore_at_us = time_us_32() + delay_ms * 1000;
}

void bt_lightbar_loop() {
    if (!lightbar_restore_enabled || !lightbar_restore_pending || hid_interrupt_cid == 0) {
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

// Called once when a WOL resend cycle starts sending (see wolwifi.cpp
// begin_resend_cycle()). Snapshots the color showing right now -- not
// necessarily saved_lightbar_*'s eventual restore target, but literally
// what's on the controller at this instant -- so it can be restored
// exactly once the indicator sequence ends, regardless of what the normal
// restore-pending mechanism above is doing at the same time.
void bt_wol_indicator_begin() {
    if (hid_interrupt_cid == 0) {
        return;
    }
    wol_indicator_pre_red = saved_lightbar_red;
    wol_indicator_pre_green = saved_lightbar_green;
    wol_indicator_pre_blue = saved_lightbar_blue;
    wol_indicator_pre_brightness = saved_lightbar_brightness;
    wol_indicator_phase = WolIndicatorPhase::Pulsing;
    wol_indicator_phase_started_us = time_us_32();
    // A WOL-triggered indicator always takes priority over any pending
    // ordinary restore (e.g. a wake-flash from the same connect event) --
    // cancel it so bt_lightbar_loop() doesn't fight the pulse.
    lightbar_restore_pending = false;
}

// Called once when the target confirms it's awake (ARP reply seen). Ends
// the pulse and holds solid light green for WOL_INDICATOR_CONFIRMED_HOLD_MS
// before restoring the pre-indicator color.
void bt_wol_indicator_confirm() {
    if (wol_indicator_phase != WolIndicatorPhase::Pulsing) {
        return;
    }
    wol_indicator_phase = WolIndicatorPhase::Confirmed;
    wol_indicator_phase_started_us = time_us_32();
    bt_set_lightbar_color(0x00, WOL_INDICATOR_LIGHT_GREEN, 0x00, WOL_INDICATOR_BRIGHTNESS);
}

// Called if the resend budget runs out with no confirmation. Restores
// immediately, no distinct failure color (kept as a purely positive
// signal, matching the decision not to add extra complexity for the
// unconfirmed case -- see decisions.md).
void bt_wol_indicator_cancel() {
    if (wol_indicator_phase == WolIndicatorPhase::Idle) {
        return;
    }
    wol_indicator_phase = WolIndicatorPhase::Idle;
    bt_set_lightbar_color(
        wol_indicator_pre_red, wol_indicator_pre_green, wol_indicator_pre_blue,
        wol_indicator_pre_brightness
    );
}

// Drives the pulse animation and the confirmed-hold-then-restore timing;
// polled every main-loop iteration alongside bt_lightbar_loop().
void bt_wol_indicator_loop() {
    if (wol_indicator_phase == WolIndicatorPhase::Idle || hid_interrupt_cid == 0) {
        return;
    }

    const uint32_t elapsed_ms = (time_us_32() - wol_indicator_phase_started_us) / 1000;

    if (wol_indicator_phase == WolIndicatorPhase::Confirmed) {
        if (elapsed_ms >= WOL_INDICATOR_CONFIRMED_HOLD_MS) {
            wol_indicator_phase = WolIndicatorPhase::Idle;
            bt_set_lightbar_color(
                wol_indicator_pre_red, wol_indicator_pre_green, wol_indicator_pre_blue,
                wol_indicator_pre_brightness
            );
        }
        return;
    }

    // Pulsing: triangle-wave green level between dark and light green over
    // WOL_INDICATOR_PULSE_PERIOD_MS, updated at whatever cadence the main
    // loop polls this at (no fixed frame rate needed for a slow breathing
    // pulse).
    const uint32_t phase_ms = elapsed_ms % WOL_INDICATOR_PULSE_PERIOD_MS;
    const uint32_t half_period = WOL_INDICATOR_PULSE_PERIOD_MS / 2;
    const uint32_t ramp = phase_ms < half_period ? phase_ms : (WOL_INDICATOR_PULSE_PERIOD_MS - phase_ms);
    const uint32_t span = WOL_INDICATOR_LIGHT_GREEN - WOL_INDICATOR_DARK_GREEN;
    const uint8_t green = static_cast<uint8_t>(WOL_INDICATOR_DARK_GREEN + (ramp * span) / half_period);
    bt_set_lightbar_color(0x00, green, 0x00, WOL_INDICATOR_BRIGHTNESS);
}

void bt_signal_strength_loop() {
    if (acl_handle == HCI_CON_HANDLE_INVALID || hid_interrupt_cid == 0) {
        reset_signal_strength_session();
        return;
    }

    const uint64_t now = time_us_64();
    if (bt_rssi_request_pending) {
        if (now - bt_rssi_last_request_us < RSSI_REQUEST_TIMEOUT_US) {
            return;
        }
        bt_rssi_request_pending = false;
        if (bt_rssi_pending_epoch == bt_rssi_idle_epoch) {
            if (bt_rssi_retries_remaining > 0) {
                bt_rssi_retries_remaining--;
                bt_rssi_idle_epoch_armed = true;
            } else {
                bt_rssi_idle_epoch_armed = false;
            }
        }
    }

    if (
        !bt_rssi_idle_epoch_armed
        || audio_recent()
        || usb_speaker_streaming_active()
        || now - bt_rssi_last_activity_us < RSSI_INPUT_IDLE_GRACE_US
        || (
            bt_rssi_last_request_us != 0
            && now - bt_rssi_last_request_us < RSSI_REQUEST_COOLDOWN_US
        )
    ) {
        return;
    }

    const bool queued = gap_read_rssi(acl_handle) != 0;
    bt_rssi_last_request_us = now;
    bt_rssi_pending_epoch = bt_rssi_idle_epoch;
    bt_rssi_request_pending = queued;
    bt_rssi_idle_epoch_armed = false;
    if (!queued) {
        bt_rssi_retries_remaining = 0;
    }
}

bool bt_disconnect_with_intent(BtControllerDisconnectIntent intent) {
    if (acl_handle == HCI_CON_HANDLE_INVALID) {
        return false;
    }
    if (connection_phase == BtConnectionPhase::Disconnecting) {
        return true;
    }
    if (!begin_connection_disconnect()) {
        return false;
    }
    controller_disconnect_intent = intent;
    disconnect_retry_requested = false;
    disconnect_retry_waiting = false;
    disconnect_retry_attempts = 0;
    disconnect_retry_at_us = 0;

    // Let BTstack own its SEND_DISCONNECT/SENT_DISCONNECT state transition.
    // Sending hci_disconnect directly leaves its ACL bookkeeping stale.
    gap_connectable_control(0);
    gap_discoverable_control(0);
    gap_set_bondable_mode(0);
    const uint8_t status = gap_disconnect(acl_handle);
    if (status == ERROR_CODE_SUCCESS || status == ERROR_CODE_COMMAND_DISALLOWED) {
        // The no-connection GAP path may complete synchronously. Only arm the
        // terminal-event timeout while this exact session still owns teardown.
        if (
            connection_phase == BtConnectionPhase::Disconnecting
            && acl_handle != HCI_CON_HANDLE_INVALID
        ) {
            disconnect_retry_waiting = true;
            disconnect_retry_at_us = time_us_32() + DISCONNECT_RETRY_EVENT_TIMEOUT_US;
        }
        return true;
    }
    DS5_LOG("[HCI] GAP disconnect failed handle=0x%04X status=0x%02X\n", acl_handle, status);
    disconnect_retry_requested = true;
    disconnect_retry_at_us = time_us_32() + DISCONNECT_RETRY_DELAY_US;
    return false;
}

bool bt_disconnect() {
    return bt_disconnect_with_intent(BtControllerDisconnectIntentNone);
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

bool bt_request_scan() {
    if (pairing_transaction_recovery_failed) {
        if (!recover_pairing_transaction_on_boot()) {
            DS5_LOG("[HCI] Pairing transaction recovery still incomplete; scan denied\n");
            restore_passive_reconnect_scan();
            return false;
        }
        pairing_transaction_recovery_failed = false;
        stored_link_key_present = bt_has_stored_link_key();
    }

    const uint32_t now = time_us_32();
    pairing_window_active = true;
    pairing_window_deadline_us = now + PAIRING_WINDOW_US;
    gap_connectable_control(0);
    gap_discoverable_control(0);
    gap_set_bondable_mode(1);
    DS5_LOG("[HCI] Controller pairing window requested\n");

    if (acl_handle != HCI_CON_HANDLE_INVALID || hid_interrupt_ready) {
        // Companion pairing while connected means "disconnect and pair".
        // The disconnection-complete path schedules inquiry because the
        // pairing window is already open.
        (void)bt_disconnect();
        return true;
    }

    inquiry_retry_scheduled = true;
    inquiry_retry_at_us = now;
    return true;
}

bool bt_forget_pairings() {
    DS5_LOG("[HCI] Forget controller pairings requested\n");
    bool transaction_present = false;
    if (!pairing_transaction_storage_status(transaction_present)) {
        DS5_LOG("[HCI] Forget all aborted: pairing transaction storage unavailable\n");
        return false;
    }
    pairing_transaction transaction{};
    const bool transaction_readable =
        transaction_present && read_pairing_transaction(transaction);
    bd_addr_t previous_addrs[NVM_NUM_LINK_KEYS]{};
    const int previous_count = cleared_controller_addr_count;
    memcpy(previous_addrs, cleared_controller_addrs, sizeof(previous_addrs));

    if (
        !bt_blacklist_add_stored_link_keys()
        || (
            transaction_readable
            && !bt_blacklist_add_unique(transaction.addr)
        )
        || (bt_current_address_known() && !bt_blacklist_add_unique(current_device_addr))
        || !bt_blacklist_persist()
    ) {
        memcpy(cleared_controller_addrs, previous_addrs, sizeof(previous_addrs));
        cleared_controller_addr_count = previous_count;
        DS5_LOG("[BLACKLIST] Forget all aborted: durable blacklist update failed\n");
        return false;
    }
    if (!cancel_pairing_transaction_before_forget(true, nullptr)) {
        // Keep the durable blacklist additions fail-closed. No link key is
        // deleted until the transaction record is also durably removed.
        DS5_LOG("[HCI] Forget all aborted: pairing transaction cancellation was not durable\n");
        return false;
    }

    gap_delete_all_link_keys();
    pairing_transaction_recovery_failed = false;
    stored_link_key_present = false;
    current_link_key_persisted = false;
    feature_data.clear();
    clear_feature_prefetch_queue();

    return bt_request_scan();
}

bool bt_forget_pairing(uint8_t address[6]) {
    if (address == nullptr) {
        return false;
    }
    bool has_address_material = false;
    for (size_t i = 0; i < sizeof(bd_addr_t); i++) {
        has_address_material = has_address_material || address[i] != 0;
    }
    if (!has_address_material) {
        return false;
    }

    bd_addr_t addr;
    memcpy(addr, address, sizeof(addr));
    DS5_LOG("[HCI] Forget controller pairing requested for %s\n", bd_addr_to_str(addr));

    bd_addr_t previous_addrs[NVM_NUM_LINK_KEYS]{};
    const int previous_count = cleared_controller_addr_count;
    memcpy(previous_addrs, cleared_controller_addrs, sizeof(previous_addrs));
    if (!bt_blacklist_add_unique(addr) || !bt_blacklist_persist()) {
        memcpy(cleared_controller_addrs, previous_addrs, sizeof(previous_addrs));
        cleared_controller_addr_count = previous_count;
        DS5_LOG("[BLACKLIST] Targeted forget aborted: durable blacklist update failed\n");
        return false;
    }
    if (!cancel_pairing_transaction_before_forget(false, addr)) {
        // The durable blacklist remains intentional fail-closed state. Do not
        // delete the key until the transaction record is durably settled.
        DS5_LOG("[HCI] Targeted forget aborted: pairing transaction cancellation was not durable\n");
        return false;
    }

    const bool targets_current_session =
        bt_current_address_known() && bd_addr_cmp(current_device_addr, addr) == 0;
    gap_drop_link_key_for_bd_addr(addr);
    stored_link_key_present = bt_has_stored_link_key();
    if (targets_current_session) {
        current_link_key_persisted = false;
        feature_data.clear();
        clear_feature_prefetch_queue();
        if (acl_handle != HCI_CON_HANDLE_INVALID || hid_interrupt_ready) {
            (void)bt_disconnect();
        }
    }
    if (!stored_link_key_present) {
        return bt_request_scan();
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
    inactive_time = time_us_64();
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
    if (
        acl_handle == HCI_CON_HANDLE_INVALID
        || connection_phase != BtConnectionPhase::HidOpening
        || hid_connection_initiator == HidConnectionInitiator::Remote
    ) {
        return;
    }

    if (
        !hid_control_ready
        && hid_control_cid == 0
        && hid_control_pending_cid == 0
    ) {
        hid_connection_initiator = HidConnectionInitiator::Local;
        DS5_LOG("[L2CAP] Open missing HID Control channel\n");
        const uint8_t status = l2cap_create_channel(
            l2cap_packet_handler,
            current_device_addr,
            PSM_HID_CONTROL,
            MTU_CONTROL,
            &hid_control_pending_cid
        );
        if (status != ERROR_CODE_SUCCESS) {
            hid_control_pending_cid = 0;
            hid_connection_initiator = HidConnectionInitiator::None;
            DS5_LOG("[L2CAP] HID Control open deferred status=0x%02X\n", status);
        }
        return;
    }

    if (
        hid_connection_initiator == HidConnectionInitiator::Local
        && hid_control_ready
        && !hid_interrupt_ready
        && hid_interrupt_cid == 0
        && hid_interrupt_pending_cid == 0
    ) {
        DS5_LOG("[L2CAP] Open missing HID Interrupt channel\n");
        const uint8_t status = l2cap_create_channel(
            l2cap_packet_handler,
            current_device_addr,
            PSM_HID_INTERRUPT,
            MTU_INTERRUPT,
            &hid_interrupt_pending_cid
        );
        if (status != ERROR_CODE_SUCCESS) {
            hid_interrupt_pending_cid = 0;
            DS5_LOG("[L2CAP] HID Interrupt open deferred status=0x%02X\n", status);
        }
    }
}

static void schedule_hid_channel_recovery(
    uint32_t delay_us = HID_CHANNEL_RECOVERY_DELAY_US
) {
    hid_channel_recovery_pending = true;
    hid_channel_recovery_at_us = time_us_32() + delay_us;
}

static void cancel_hid_channel_recovery_if_ready() {
    if (hid_control_ready && hid_interrupt_ready) {
        hid_channel_recovery_pending = false;
        hid_channel_recovery_attempts = 0;
    }
}

static uint32_t current_hid_opening_timeout_us() {
    if (
        hid_connection_initiator == HidConnectionInitiator::Remote
        && hid_control_ready
        && !hid_interrupt_ready
    ) {
        return HID_REMOTE_INTERRUPT_OPEN_TIMEOUT_US;
    }
    return HID_OPENING_PHASE_TIMEOUT_US;
}

static void service_disconnect_recovery(uint32_t now) {
    if (
        disconnect_retry_waiting
        && bt_time_reached(now, disconnect_retry_at_us)
    ) {
        disconnect_retry_waiting = false;
        disconnect_retry_requested = true;
    }
    if (!disconnect_retry_requested) {
        return;
    }
    if (disconnect_retry_attempts >= DISCONNECT_RETRY_MAX_ATTEMPTS) {
        disconnect_retry_requested = false;
        DS5_LOG("[HCI] Disconnect retry exhausted; reboot for bounded transport recovery\n");
        watchdog_reboot(0, 0, CONTROLLER_DISCONNECT_REBOOT_DELAY_MS);
        return;
    }
    if (!bt_time_reached(now, disconnect_retry_at_us) || !hci_can_send_command_packet_now()) {
        return;
    }

    const uint8_t status = hci_send_cmd(&hci_disconnect, acl_handle, 0x13);
    if (status == ERROR_CODE_SUCCESS) {
        disconnect_retry_attempts++;
        disconnect_retry_requested = false;
        disconnect_retry_waiting = true;
        disconnect_retry_at_us = now + DISCONNECT_RETRY_EVENT_TIMEOUT_US;
        DS5_LOG("[HCI] Disconnect retry sent attempt=%u\n", disconnect_retry_attempts);
    } else {
        disconnect_retry_at_us = now + DISCONNECT_RETRY_DELAY_US;
    }
}

void bt_connection_recovery_loop() {
    service_edge_profile_switching_mode();
    if (acl_handle == HCI_CON_HANDLE_INVALID) {
        return;
    }

    const uint32_t now = time_us_32();
    if (connection_phase == BtConnectionPhase::Disconnecting) {
        service_disconnect_recovery(now);
        return;
    }
    if (
        authentication_retry_pending
        && bt_time_reached(now, authentication_retry_at_us)
    ) {
        authentication_retry_pending = false;
        DS5_LOG("[HCI] Retry GAP security level 2 attempt=%u\n", authentication_retry_attempts);
        gap_request_security_level(acl_handle, LEVEL_2);
    }

    if (
        encryption_completion_pending
        && encryption_command_generation == connection_generation
        && encryption_command_handle == acl_handle
        && static_cast<uint32_t>(now - encryption_command_accepted_at_us)
            >= ENCRYPTION_COMPLETION_TIMEOUT_US
    ) {
        DS5_LOG("[HCI] Encryption completion stalled; recycle ACL and preserve pairing\n");
        clear_encryption_completion();
        bt_disconnect();
        return;
    }

    if (
        connection_phase == BtConnectionPhase::Securing
        && connection_phase_started_us != 0
        && static_cast<uint32_t>(now - connection_phase_started_us)
            >= SECURITY_PHASE_TIMEOUT_US
    ) {
        DS5_LOG("[HCI] Security phase timed out; recycle ACL and preserve pairing\n");
        bt_disconnect();
        return;
    }

    if (
        connection_phase == BtConnectionPhase::HidOpening
        && hid_connection_initiator == HidConnectionInitiator::Remote
        && hid_control_ready
        && !hid_interrupt_ready
        && hid_control_opened_at_us != 0
        && static_cast<uint32_t>(now - hid_control_opened_at_us)
            >= HID_REMOTE_INTERRUPT_FOLLOWUP_TIMEOUT_US
    ) {
        DS5_LOG("[L2CAP] Controller-owned HID Interrupt follow-up timed out; retry ACL\n");
        bt_disconnect();
        return;
    }

    if (
        connection_phase == BtConnectionPhase::HidOpening
        && connection_phase_started_us != 0
        && static_cast<uint32_t>(now - connection_phase_started_us)
            >= current_hid_opening_timeout_us()
    ) {
        DS5_LOG("[L2CAP] HID opening phase timed out; recycle ACL\n");
        bt_disconnect();
        return;
    }

    if (!hid_channel_recovery_pending) {
        return;
    }
    if (!bt_time_reached(now, hid_channel_recovery_at_us)) {
        return;
    }
    if (hid_control_ready && hid_interrupt_ready) {
        hid_channel_recovery_pending = false;
        hid_channel_recovery_attempts = 0;
        return;
    }
    if (hid_connection_initiator == HidConnectionInitiator::Remote) {
        // The endpoint that opened Control owns the matching Interrupt open.
        // Never collide with it by creating a symmetric local transaction.
        hid_channel_recovery_pending = false;
        hid_channel_recovery_attempts = 0;
        return;
    }
    if (hid_control_pending_cid != 0 || hid_interrupt_pending_cid != 0) {
        schedule_hid_channel_recovery();
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

void bt_feature_prefetch_loop() {
    if (feature_prefetch_index >= feature_prefetch_count) {
        clear_feature_prefetch_queue();
        return;
    }
    if (hid_control_cid == 0 || connection_phase != BtConnectionPhase::Ready) {
        clear_feature_prefetch_queue();
        return;
    }

    const uint32_t now = time_us_32();
    if (feature_prefetch_next_us != 0 && !bt_time_reached(now, feature_prefetch_next_us)) {
        return;
    }

    const feature_prefetch_request request = feature_prefetch_queue[feature_prefetch_index++];
    (void)get_feature_data(request.report_id, request.len);
    feature_prefetch_next_us = time_us_32() + FEATURE_PREFETCH_SPACING_US;
}

static void service_acl_connection_cancel() {
    if (
        !acl_connection_cancel_requested
        || acl_connection_cancel_sent
        || !acl_connection_outbound
        || !acl_connection_pending
        || !hci_can_send_command_packet_now()
    ) {
        return;
    }

    const uint8_t status = hci_send_cmd(&hci_create_connection_cancel, current_device_addr);
    if (status == ERROR_CODE_SUCCESS) {
        acl_connection_cancel_sent = true;
        DS5_LOG("[HCI] Classic create-connection cancel sent; drain completion\n");
    }
}

void bt_output_retry_loop() {
    if (
        hid_interrupt_cid == 0
        || connection_phase == BtConnectionPhase::Disconnecting
    ) {
        return;
    }

    bool retry_ready = false;
    const uint32_t now = time_us_32();
    critical_section_enter_blocking(&queue_lock);
    const bool audio_queued = !audio_queue.empty();
    const bool urgent_ready = !urgent_queue.empty()
        && bt_time_reached(now, urgent_queue.front().ready_at_us);
    retry_ready = audio_queued
        || urgent_ready
        || (state_pending && urgent_queue.empty());
    critical_section_exit(&queue_lock);
    request_can_send_if_needed(retry_ready);
}

void bt_inquiry_loop() {
    service_acl_connection_cancel();

    const uint32_t now = time_us_32();
    if (
        pairing_window_active
        && bt_time_reached(now, pairing_window_deadline_us)
    ) {
        if (
            device_found
            || acl_connection_pending
            || acl_handle != HCI_CON_HANDLE_INVALID
        ) {
            pairing_window_deadline_us = now + PAIRING_ACTIVE_ATTEMPT_EXTENSION_US;
            DS5_LOG("[HCI] Pairing discovery window elapsed; preserve active attempt\n");
        } else {
            DS5_LOG("[HCI] Pairing window elapsed\n");
            close_pairing_window(true);
            return;
        }
    }

    if (
        acl_connection_pending
        && acl_handle == HCI_CON_HANDLE_INVALID
        && bt_time_reached(now, acl_connection_pending_at_us + ACL_CONNECTION_PENDING_TIMEOUT_US)
    ) {
        if (acl_connection_outbound && !acl_connection_cancel_requested) {
            // Retain ownership until CONNECTION_COMPLETE drains the cancelled
            // transaction. Releasing it early allows a late result to consume
            // a newer connection generation.
            DS5_LOG("[HCI] ACL connection pending timed out; request cancel and drain\n");
            acl_connection_cancel_requested = true;
            acl_disconnect_on_completion = true;
            acl_connection_pending_at_us = now;
        } else if (!acl_connection_outbound) {
            DS5_LOG("[HCI] Incoming ACL pending timed out; reset bounded transport recovery\n");
            watchdog_reboot(0, 0, CONTROLLER_DISCONNECT_REBOOT_DELAY_MS);
        } else if (acl_connection_cancel_sent) {
            DS5_LOG("[HCI] ACL cancellation did not complete; reset bounded transport recovery\n");
            watchdog_reboot(0, 0, CONTROLLER_DISCONNECT_REBOOT_DELAY_MS);
        } else {
            // The cancel command is waiting for HCI command credit. Keep the
            // current generation owned and allow the next poll to submit it.
            acl_connection_pending_at_us = now;
        }
    }

    if (
        inquiry_active
        || device_found
        || acl_connection_pending
        || acl_handle != HCI_CON_HANDLE_INVALID
    ) {
        update_inquiry_led(now);
        return;
    }

    if (
        pairing_window_active
        && inquiry_retry_scheduled
        && bt_time_reached(now, inquiry_retry_at_us)
    ) {
        start_inquiry_if_needed();
    }
    update_inquiry_led(now);
}

int bt_init() {
    critical_section_init(&queue_lock);
    // Allocate the reusable interrupt packet before streaming starts so the
    // steady-state CAN_SEND_NOW handler never enters the flash-backed heap.
    interrupt_send_packet.data.reserve(AUDIO_INTERRUPT_PACKET_MAX_SIZE);

    bt_l2cap_init();
    gap_set_link_supervision_timeout(CLASSIC_LINK_SUPERVISION_TIMEOUT_SLOTS);

    // SSP (Secure Simple Pairing)
    gap_ssp_set_enable(true);
    gap_secure_connections_enable(true);
    gap_ssp_set_io_capability(SSP_IO_CAPABILITY_DISPLAY_YES_NO);
    gap_ssp_set_authentication_requirement(SSP_IO_AUTHREQ_MITM_PROTECTION_NOT_REQUIRED_GENERAL_BONDING);
    gap_ssp_set_auto_accept(false);
    gap_set_bondable_mode(0);

    hci_set_master_slave_policy(HCI_ROLE_MASTER);
    gap_connectable_control(0);
    gap_discoverable_control(0);
    gap_register_classic_connection_filter(&classic_connection_filter);

    hci_event_callback_registration.callback = &hci_packet_handler;
    hci_add_event_handler(&hci_event_callback_registration);

    hci_power_control(HCI_POWER_ON);
    return 0;
}

static void begin_hid_channel_negotiation(hci_con_handle_t handle) {
    if (!current_link_security_ready(handle)) {
        DS5_LOG("[L2CAP] Refuse HID negotiation before GAP LEVEL_2 handle=0x%04X\n", handle);
        return;
    }
    if (!begin_hid_opening(handle)) {
        return;
    }

    // DualSense normally opens HID Control immediately after SSP. Give it the
    // first turn; local recovery claims ownership only after this grace period.
    schedule_hid_channel_recovery(HID_REMOTE_INITIATION_GRACE_US);
    DS5_LOG("[L2CAP] Security ready; await controller-owned HID open\n");
}

static void handle_encryption_change(
    hci_con_handle_t handle,
    uint8_t status,
    uint8_t enabled
) {
    if (!connection_handle_is_current(handle)) {
        DS5_LOG("[HCI] Ignoring stale encryption event handle=0x%04X\n", handle);
        return;
    }
    clear_encryption_completion();
    if (connection_phase == BtConnectionPhase::Disconnecting) {
        return;
    }

    DS5_LOG("[HCI] Encryption change handle=0x%04X status=0x%02X enabled=%u\n",
            handle,
            status,
            enabled);
    if (status == ERROR_CODE_SUCCESS && enabled) {
        if (current_link_security_ready(handle)) {
            begin_hid_channel_negotiation(handle);
        } else {
            DS5_LOG("[HCI] Encryption enabled; wait for GAP LEVEL_2 validation\n");
        }
        return;
    }

    DS5_LOG("[HCI] Encryption failed; recycle incomplete ACL and preserve pairing\n");
    bt_disconnect();
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
                // HCI power-on rebuilds BTstack's pending Classic task mask.
                // Apply fast interlaced page scan tuning after that reset.
                gap_set_page_scan_activity(0x0012, 0x0012); // 11.25 ms
                gap_set_page_scan_type(PAGE_SCAN_MODE_INTERLACED);
                bt_blacklist_load();
                pairing_transaction_recovery_failed =
                    !recover_pairing_transaction_on_boot();
                if (pairing_transaction_recovery_failed) {
                    DS5_LOG(
                        "[HCI] Pairing transaction recovery failed; remain fail-closed\n"
                    );
                }
                stored_link_key_present = bt_has_stored_link_key();
                if (pairing_transaction_recovery_failed) {
                    restore_passive_reconnect_scan();
                } else if (stored_link_key_present) {
                    DS5_LOG("[BT] Stored controller found; staying in passive page scan\n");
                    restore_passive_reconnect_scan();
                } else {
                    DS5_LOG("[BT] No stored controller; starting initial pairing window\n");
                    (void)bt_request_scan();
                }
            }
            break;
        }
        case HCI_EVENT_INQUIRY_RESULT:
        case HCI_EVENT_INQUIRY_RESULT_WITH_RSSI:
        case HCI_EVENT_EXTENDED_INQUIRY_RESPONSE: {
            bd_addr_t addr;
            uint32_t cod;
            uint8_t page_scan_repetition_mode;
            uint16_t clock_offset;

            if (event_type == HCI_EVENT_INQUIRY_RESULT) {
                cod = hci_event_inquiry_result_get_class_of_device(packet);
                hci_event_inquiry_result_get_bd_addr(packet, addr);
                page_scan_repetition_mode =
                    hci_event_inquiry_result_get_page_scan_repetition_mode(packet);
                clock_offset =
                    hci_event_inquiry_result_get_clock_offset(packet);
            } else if (event_type == HCI_EVENT_INQUIRY_RESULT_WITH_RSSI) {
                cod = hci_event_inquiry_result_with_rssi_get_class_of_device(packet);
                hci_event_inquiry_result_with_rssi_get_bd_addr(packet, addr);
                page_scan_repetition_mode =
                    hci_event_inquiry_result_with_rssi_get_page_scan_repetition_mode(packet);
                clock_offset =
                    hci_event_inquiry_result_with_rssi_get_clock_offset(packet);
            } else {
                cod = hci_event_extended_inquiry_response_get_class_of_device(packet);
                hci_event_extended_inquiry_response_get_bd_addr(packet, addr);
                page_scan_repetition_mode =
                    hci_event_extended_inquiry_response_get_page_scan_repetition_mode(packet);
                clock_offset =
                    hci_event_extended_inquiry_response_get_clock_offset(packet);
            }

            // CoD 0x002508 = Gamepad (Major: Peripheral, Minor: Gamepad)
            if (
                (cod & 0x000F00) == 0x000500
                && pairing_window_active
                && !device_found
                && !acl_connection_pending
                && acl_handle == HCI_CON_HANDLE_INVALID
            ) {
                DS5_LOG("[HCI] Gamepad found: %s (CoD: 0x%06x)\n", bd_addr_to_str(addr), (unsigned int) cod);
                bd_addr_copy(current_device_addr, addr);
                current_device_page_scan_repetition_mode = page_scan_repetition_mode;
                current_device_clock_offset = clock_offset;
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
            stop_inquiry_led();
            if (device_found && !acl_connection_pending && acl_handle == HCI_CON_HANDLE_INVALID) {
                if (!begin_connection_attempt()) {
                    DS5_LOG("[HCI] Pairing target ignored because another connection owns the transport\n");
                    break;
                }
                DS5_LOG("[HCI] Connecting to %s...\n", bd_addr_to_str(current_device_addr));
                new_pair = true;
                link_key_t prior_key;
                link_key_type_t prior_key_type = INVALID_LINK_KEY;
                const bool had_prior_key = gap_get_link_key_for_bd_addr(
                    current_device_addr,
                    prior_key,
                    &prior_key_type
                );
                if (
                    !stage_pairing_transaction(
                        current_device_addr,
                        had_prior_key ? prior_key : nullptr,
                        prior_key_type
                    )
                ) {
                    DS5_LOG(
                        "[HCI] Refuse explicit pairing because its durable transaction could not be staged\n"
                    );
                    clear_outbound_inquiry_target();
                    fail_pending_connection_attempt();
                    schedule_inquiry_retry();
                    break;
                }
                pairing_authorized_session = true;
                pairing_link_key_required = true;
                current_link_key_persisted = false;
                if (had_prior_key) {
                    // Explicit pairing authorizes replacement of this target's
                    // key only. The durable transaction restores it if no new
                    // key is accepted.
                    gap_drop_link_key_for_bd_addr(current_device_addr);
                    link_key_t remaining_key;
                    link_key_type_t remaining_type;
                    if (
                        gap_get_link_key_for_bd_addr(
                            current_device_addr,
                            remaining_key,
                            &remaining_type
                        )
                    ) {
                        DS5_LOG(
                            "[HCI] Refuse explicit re-pair because prior bond could not be removed\n"
                        );
                        (void)restore_uncommitted_pairing_key(
                            "failed prior bond removal"
                        );
                        clear_outbound_inquiry_target();
                        fail_pending_connection_attempt();
                        schedule_inquiry_retry();
                        break;
                    }
                    stored_link_key_present = bt_has_stored_link_key();
                    DS5_LOG("[HCI] Dropped target's prior link key for explicit re-pair\n");
                }
                acl_connection_outbound = true;
                acl_disconnect_on_completion = false;
                mark_acl_connection_pending();
                const uint16_t valid_clock_offset =
                    (current_device_clock_offset & 0x7FFFu) | 0x8000u;
                const uint8_t create_status = hci_send_cmd(
                    &hci_create_connection,
                    current_device_addr,
                    hci_usable_acl_packet_types(),
                    current_device_page_scan_repetition_mode,
                    0,
                    valid_clock_offset,
                    1
                );
                if (create_status != ERROR_CODE_SUCCESS) {
                    DS5_LOG(
                        "[HCI] Classic create-connection submission failed status=0x%02X\n",
                        create_status
                    );
                    (void)restore_uncommitted_pairing_key(
                        "HCI create-connection submission failure"
                    );
                    clear_outbound_inquiry_target();
                    clear_acl_connection_pending();
                    acl_connection_outbound = false;
                    acl_disconnect_on_completion = false;
                    fail_pending_connection_attempt();
                    schedule_inquiry_retry();
                }
            } else if (
                pairing_window_active
                && !device_found
                && !acl_connection_pending
                && acl_handle == HCI_CON_HANDLE_INVALID
            ) {
                schedule_inquiry_retry();
            } else {
                restore_passive_reconnect_scan();
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
                (void)restore_uncommitted_pairing_key("ACL command rejection");
                clear_outbound_inquiry_target();
                clear_acl_connection_pending();
                acl_connection_outbound = false;
                acl_disconnect_on_completion = false;
                fail_pending_connection_attempt();
                DS5_LOG("[HCI] ACL connection command rejected, restart inquiry\n");
                if (pairing_window_active) {
                    schedule_inquiry_retry();
                } else {
                    restore_passive_reconnect_scan();
                }
            }
            if (
                opcode == HCI_OPCODE_HCI_SET_CONNECTION_ENCRYPTION
                && connection_phase == BtConnectionPhase::Securing
                && acl_handle != HCI_CON_HANDLE_INVALID
            ) {
                if (status == ERROR_CODE_SUCCESS) {
                    if (!encryption_completion_pending) {
                        encryption_completion_pending = true;
                        encryption_command_handle = acl_handle;
                        encryption_command_generation = connection_generation;
                        encryption_command_accepted_at_us = time_us_32();
                    }
                } else {
                    DS5_LOG("[HCI] Encryption command rejected; recycle incomplete ACL\n");
                    bt_disconnect();
                }
            }
            if (
                opcode == HCI_OPCODE_HCI_DISCONNECT
                && connection_phase == BtConnectionPhase::Disconnecting
                && status != ERROR_CODE_SUCCESS
            ) {
                disconnect_retry_waiting = false;
                disconnect_retry_requested = true;
                disconnect_retry_at_us = time_us_32() + DISCONNECT_RETRY_DELAY_US;
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
                bd_addr_t conn_addr;
                hci_event_connection_complete_get_bd_addr(packet, conn_addr);
                if (
                    !pairing_authorized_session
                    && !pairing_window_active
                    && bt_blacklist_contains(conn_addr)
                ) {
                    DS5_LOG(
                        "[HCI] Late connection from blacklisted %s on handle=0x%04X; disconnecting\n",
                        bd_addr_to_str(conn_addr),
                        handle
                    );
                    if (note_acl_connected(handle)) {
                        bd_addr_copy(current_device_addr, conn_addr);
                        clear_outbound_inquiry_target();
                        clear_acl_connection_pending();
                        acl_disconnect_on_completion = false;
                        (void)bt_disconnect();
                    } else {
                        (void)gap_disconnect(handle);
                    }
                    break;
                }
                if (!note_acl_connected(handle)) {
                    DS5_LOG("[HCI] Ignoring stale/duplicate ACL connection handle=0x%04X\n", handle);
                    gap_disconnect(handle);
                    break;
                }
                reset_signal_strength_session();
                clear_acl_connection_pending();
                device_found = false;
                bd_addr_copy(current_device_addr, conn_addr);
                gap_connectable_control(0);
                gap_discoverable_control(0);
                DS5_LOG("[HCI] ACL connected handle=0x%04X\n", handle);
                if (acl_disconnect_on_completion) {
                    acl_disconnect_on_completion = false;
                    acl_connection_outbound = false;
                    DS5_LOG("[HCI] ACL completed after cancellation; disconnect before security setup\n");
                    bt_disconnect();
                    break;
                }
                acl_connection_outbound = false;
                usb_wake_host_if_suspended();
                DS5_LOG("[HCI] Request GAP security level 2 on handle=0x%04X\n", handle);
                gap_request_security_level(handle, LEVEL_2);
            } else {
                (void)restore_uncommitted_pairing_key("ACL connection failure");
                clear_outbound_inquiry_target();
                clear_acl_connection_pending();
                acl_connection_outbound = false;
                acl_disconnect_on_completion = false;
                fail_pending_connection_attempt();
                DS5_LOG("[HCI] ACL connect failed status=0x%02X, restart inquiry\n", status);
                if (pairing_window_active) {
                    schedule_inquiry_retry();
                } else {
                    restore_passive_reconnect_scan();
                }
            }
            break;
        }

        case HCI_EVENT_LINK_KEY_REQUEST: {
            bd_addr_t addr;
            hci_event_link_key_request_get_bd_addr(packet, addr);
            link_key_t link_key;
            link_key_type_t link_key_type;
            bool link = !pairing_transaction_recovery_failed
                && !bt_blacklist_contains(addr)
                && gap_get_link_key_for_bd_addr(addr, link_key, &link_key_type);
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
            const bool authorized = new_pair
                && pairing_window_active
                && bd_addr_cmp(addr, current_device_addr) == 0;
            const int response = authorized
                ? gap_ssp_confirmation_response(addr)
                : gap_ssp_confirmation_negative(addr);
            DS5_LOG("[HCI] User confirmation request from %s %s status=0x%02X\n",
                    bd_addr_to_str(addr),
                    authorized ? "accepted" : "rejected",
                    response);
            break;
        }

        case HCI_EVENT_PIN_CODE_REQUEST: {
            bd_addr_t addr;
            hci_event_pin_code_request_get_bd_addr(packet, addr);
            const bool authorized = new_pair
                && pairing_window_active
                && bd_addr_cmp(addr, current_device_addr) == 0;
            const int response = authorized
                ? gap_pin_code_response(addr, "0000")
                : gap_pin_code_negative(addr);
            DS5_LOG("[HCI] Legacy pin request from %s %s status=0x%02X\n",
                    bd_addr_to_str(addr),
                    authorized ? "accepted" : "rejected",
                    response);
            break;
        }

        case HCI_EVENT_LINK_KEY_NOTIFICATION: {
            bd_addr_t addr;
            hci_event_link_key_request_get_bd_addr(packet, addr);
            const bool current_controller =
                bd_addr_cmp(addr, current_device_addr) == 0
                && connection_phase != BtConnectionPhase::Listening
                && connection_phase != BtConnectionPhase::Disconnecting;
            if (!current_controller) {
                DS5_LOG("[HCI] Ignore link key notification from unowned controller %s\n",
                        bd_addr_to_str(addr));
                break;
            }

            current_link_key_persisted = persist_notified_link_key(
                packet,
                addr,
                pairing_authorized_session,
                current_link_security_ready(acl_handle)
            );
            stored_link_key_present = bt_has_stored_link_key();
            if (!current_link_key_persisted) {
                DS5_LOG("[HCI] Reject non-durable or unauthorized link key for %s\n",
                        bd_addr_to_str(addr));
                (void)restore_uncommitted_pairing_key(
                    "link key persistence failure"
                );
                stored_link_key_present = bt_has_stored_link_key();
                bt_disconnect();
                break;
            }

            if (pairing_authorized_session) {
                if (!mark_pairing_transaction_key_accepted(addr)) {
                    DS5_LOG(
                        "[HCI] Replacement key durable but transaction acceptance could not be recorded\n"
                    );
                    (void)restore_uncommitted_pairing_key(
                        "pairing transaction acceptance failure"
                    );
                    stored_link_key_present = bt_has_stored_link_key();
                    bt_disconnect();
                    break;
                }
                if (!finalize_pairing_policy_for_addr(addr)) {
                    DS5_LOG(
                        "[HCI] Replacement key durable but pairing policy commit failed\n"
                    );
                    pairing_transaction_recovery_failed = true;
                    bt_disconnect();
                    break;
                }
                if (!discard_pairing_transaction()) {
                    // The accepted key and policy are durable. Boot recovery
                    // can safely repeat the idempotent policy commit.
                    DS5_LOG(
                        "[HCI] Pairing policy committed; transaction cleanup deferred to boot\n"
                    );
                }
            }

            pairing_link_key_required = false;
            gap_discoverable_control(0);
            gap_set_bondable_mode(0);
            DS5_LOG("[HCI] Link key persisted for %s\n", bd_addr_to_str(addr));
            finish_hid_session_if_ready();
            break;
        }

        case HCI_EVENT_AUTHENTICATION_COMPLETE: {
            const uint8_t status = hci_event_authentication_complete_get_status(packet);
            const hci_con_handle_t handle = hci_event_authentication_complete_get_connection_handle(packet);
            if (!connection_handle_is_current(handle)) {
                DS5_LOG("[HCI] Ignoring stale authentication event handle=0x%04X status=0x%02X\n",
                        handle,
                        status);
                break;
            }
            if (connection_phase == BtConnectionPhase::Disconnecting) {
                break;
            }
            DS5_LOG("[HCI] Authentication complete handle=0x%04X status=0x%02X\n", handle, status);
            if (status != ERROR_CODE_SUCCESS) {
                if (
                    (
                        status == AUTHENTICATION_LMP_TRANSACTION_COLLISION
                        || status == AUTHENTICATION_DIFFERENT_TRANSACTION_COLLISION
                    )
                    && authentication_retry_attempts < AUTHENTICATION_COLLISION_MAX_RETRIES
                ) {
                    authentication_retry_attempts++;
                    authentication_retry_pending = true;
                    authentication_retry_at_us = time_us_32()
                        + AUTHENTICATION_COLLISION_RETRY_DELAY_US * authentication_retry_attempts;
                    DS5_LOG("[HCI] Authentication collision; retry same ACL attempt=%u\n",
                            authentication_retry_attempts);
                    break;
                }
                if (status == AUTHENTICATION_PIN_OR_KEY_MISSING) {
                    DS5_LOG("[HCI] Remote reports missing key; drop stale key for %s\n",
                            bd_addr_to_str(current_device_addr));
                    if (!invalidate_rejected_pairing_transaction_prior_key(current_device_addr)) {
                        DS5_LOG(
                            "[HCI] Failed to durably invalidate rejected pairing key; reconnect remains fail-closed\n"
                        );
                    }
                    gap_drop_link_key_for_bd_addr(current_device_addr);
                    link_key_t rejected_key;
                    link_key_type_t rejected_type;
                    if (
                        gap_get_link_key_for_bd_addr(
                            current_device_addr,
                            rejected_key,
                            &rejected_type
                        )
                    ) {
                        DS5_LOG("[HCI] Failed to remove rejected pairing key\n");
                        pairing_transaction_recovery_failed = true;
                    }
                    stored_link_key_present = bt_has_stored_link_key();
                } else {
                    DS5_LOG("[HCI] Transient authentication failure; preserve stored pairing\n");
                }
                clear_outbound_inquiry_target();
                clear_acl_connection_pending();
                bt_disconnect();
            } else {
                clear_authentication_retry();
            }
            break;
        }

        case HCI_EVENT_ENCRYPTION_CHANGE: {
            handle_encryption_change(
                hci_event_encryption_change_get_connection_handle(packet),
                hci_event_encryption_change_get_status(packet),
                hci_event_encryption_change_get_encryption_enabled(packet)
            );
            break;
        }

        case HCI_EVENT_ENCRYPTION_CHANGE_V2: {
            handle_encryption_change(
                hci_event_encryption_change_v2_get_connection_handle(packet),
                hci_event_encryption_change_v2_get_status(packet),
                hci_event_encryption_change_v2_get_encryption_enabled(packet)
            );
            break;
        }

        case GAP_EVENT_SECURITY_LEVEL: {
            const hci_con_handle_t handle = gap_event_security_level_get_handle(packet);
            const gap_security_level_t level = static_cast<gap_security_level_t>(
                gap_event_security_level_get_security_level(packet)
            );
            if (!connection_handle_is_current(handle)) {
                break;
            }
            DS5_LOG("[HCI] GAP security level handle=0x%04X level=%u\n", handle, level);
            if (level >= LEVEL_2) {
                clear_encryption_completion();
                begin_hid_channel_negotiation(handle);
            }
            break;
        }

        case HCI_EVENT_CONNECTION_REQUEST: {
            bd_addr_t addr;
            hci_event_connection_request_get_bd_addr(packet, addr);
            const uint32_t cod = hci_event_connection_request_get_class_of_device(packet);
            DS5_LOG("[HCI] Incoming ACL request from %s cod=0x%06x\n", bd_addr_to_str(addr), (unsigned int) cod);
            if (classic_acl_connection_allowed(addr, false)) {
                if (!begin_connection_attempt()) {
                    break;
                }
                bd_addr_copy(current_device_addr, addr);
                clear_outbound_inquiry_target();
                link_key_t existing_key;
                link_key_type_t existing_key_type;
                current_link_key_persisted = gap_get_link_key_for_bd_addr(
                    current_device_addr,
                    existing_key,
                    &existing_key_type
                );
                pairing_authorized_session = false;
                pairing_link_key_required = !current_link_key_persisted;
                acl_connection_outbound = false;
                acl_disconnect_on_completion = false;
                mark_acl_connection_pending();
                inquiry_active = false;
            }
            break;
        }

        case HCI_EVENT_DISCONNECTION_COMPLETE: {
            const uint8_t status = hci_event_disconnection_complete_get_status(packet);
            const hci_con_handle_t disconnected_handle =
                hci_event_disconnection_complete_get_connection_handle(packet);
            if (
                status != ERROR_CODE_SUCCESS
                && connection_handle_is_current(disconnected_handle)
                && connection_phase == BtConnectionPhase::Disconnecting
            ) {
                disconnect_retry_waiting = false;
                disconnect_retry_requested = true;
                disconnect_retry_at_us = time_us_32() + DISCONNECT_RETRY_DELAY_US;
                DS5_LOG("[HCI] Disconnect completion failed handle=0x%04X status=0x%02X; retry queued\n",
                        disconnected_handle,
                        status);
                break;
            }
            if (
                status != ERROR_CODE_SUCCESS
                || !connection_handle_is_current(disconnected_handle)
            ) {
                DS5_LOG("[HCI] Ignore stale disconnection status=0x%02X handle=0x%04X\n",
                        status,
                        disconnected_handle);
                break;
            }
            const BtControllerDisconnectIntent disconnect_intent =
                controller_disconnect_intent;
            const bool expected_disconnect =
                disconnect_intent != BtControllerDisconnectIntentNone;
            const bool host_suspended = usb_host_suspended_active();
            if (
                !restore_uncommitted_pairing_key(
                    "disconnect before replacement key commit"
                )
            ) {
                DS5_LOG(
                    "[HCI] Pairing rollback incomplete; reconnect remains fail-closed\n"
                );
            }
            usb_handle_controller_transport_disconnect(expected_disconnect);
            reset_controller_input_report_cache();
            const uint8_t reason = hci_event_disconnection_complete_get_reason(packet);
            clear_outbound_inquiry_target();
            clear_acl_connection_pending();
            acl_connection_outbound = false;
            acl_disconnect_on_completion = false;
            inquiry_active = false;
            disconnect_retry_requested = false;
            disconnect_retry_waiting = false;
            disconnect_retry_attempts = 0;
            disconnect_retry_at_us = 0;
            acl_handle = HCI_CON_HANDLE_INVALID;
            reset_connection_session();
            reset_signal_strength_session();
            hid_control_cid = 0;
            hid_interrupt_cid = 0;
            hid_control_pending_cid = 0;
            hid_interrupt_pending_cid = 0;
            hid_control_ready = false;
            hid_interrupt_ready = false;
            hid_connection_initiator = HidConnectionInitiator::None;
            hid_control_opened_at_us = 0;
            audio_handle_controller_disconnect();
            feature_data.clear();
            clear_feature_prefetch_queue();
            controller_type = ControllerTypeUnknown;
            controller_type_check_pending = false;
            hid_channel_recovery_pending = false;
            hid_channel_recovery_attempts = 0;
            critical_section_enter_blocking(&queue_lock);
            reset_controller_output_session_locked();
            critical_section_exit(&queue_lock);
            cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, false);
            stored_link_key_present = bt_has_stored_link_key();
            if (pairing_window_active) {
                schedule_inquiry_retry();
            } else {
                restore_passive_reconnect_scan();
            }
            controller_disconnect_intent = BtControllerDisconnectIntentNone;
            if (host_suspended) {
                DS5_LOG("[HCI] Disconnected reason=0x%02X while USB host suspended; keeping USB on bus\n", reason);
                break;
            }
            if (expected_disconnect) {
                DS5_LOG("[HCI] Expected controller disconnect intent=%u reason=0x%02X; keeping Pico alive\n",
                        static_cast<unsigned int>(disconnect_intent),
                        reason);
                break;
            }
            DS5_LOG("[HCI] Controller disconnected reason=0x%02X; keeping Pico alive for reconnect\n", reason);
            break;
        }

        case GAP_EVENT_RSSI_MEASUREMENT: {
            const hci_con_handle_t handle = gap_event_rssi_measurement_get_con_handle(packet);
            if (handle == acl_handle) {
                bt_rssi = static_cast<int8_t>(gap_event_rssi_measurement_get_rssi(packet));
                bt_rssi_known = true;
                bt_rssi_request_pending = false;
                if (bt_rssi_pending_epoch == bt_rssi_idle_epoch) {
                    bt_rssi_idle_epoch_armed = false;
                }
                bt_rssi_pending_epoch = 0;
            }
            break;
        }
    }
}

static __attribute__((noinline, noclone, optimize("O2"))) void __not_in_flash_func(note_output_packet_sent)(
    const output_packet &packet,
    uint32_t now
) {
    const uint32_t age_us = packet_age_us(now, packet.enqueue_time_us);
    if (last_bt_send_us != 0) {
        update_max_u32(output_counters.bt_send_gap_max_us, packet_age_us(now, last_bt_send_us));
    }
    last_bt_send_us = now;

    if (ds5::classic_rumble::is_terminal_stop(
            classic_rumble_delivery_kind(packet.reason)
        )) {
        if (consecutive_classic_rumble_stop_sends != 0xff) {
            consecutive_classic_rumble_stop_sends++;
        }
    } else {
        consecutive_classic_rumble_stop_sends = 0;
    }

    if (packet.packet_class == OutputPacketAudio) {
        update_max_u32(output_counters.audio_0x36_max_age_us, age_us);
        uint32_t audio_gap_us = 0;
        if (last_audio_0x36_send_us != 0) {
            audio_gap_us = packet_age_us(now, last_audio_0x36_send_us);
            update_max_u32(output_counters.audio_0x36_send_gap_max_us, audio_gap_us);
        }
        last_audio_0x36_send_us = now;
        if (age_us > AUDIO_STREAM_QUEUE_LATE_US) {
            output_counters.audio_0x36_late_count_over_12000_us++;
        }
        if (
            age_us > AUDIO_STREAM_QUEUE_LATE_US
            || audio_gap_us > AUDIO_STREAM_GAP_LATE_US
        ) {
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
        if (consecutive_audio_sends != 0xff) {
            consecutive_audio_sends++;
        }
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
    consecutive_audio_sends = 0;
}

static __attribute__((noinline, noclone, optimize("O2"))) bool __not_in_flash_func(select_next_output_packet_locked)(
    output_packet &packet,
    uint32_t now
) {
    if (!output_pending_locked()) {
        return false;
    }

    const bool urgent_queued = !urgent_queue.empty();
    const bool urgent_ready = urgent_queued
        && bt_time_reached(now, urgent_queue.front().ready_at_us);
    const bool audio_queued = !audio_queue.empty();
    const bool urgent_precedes_audio = output_scheduler_fifo_prefers_urgent(
        urgent_ready,
        urgent_queued ? urgent_queue.front().enqueue_time_us : 0,
        audio_queued,
        audio_queued ? audio_queue.front().enqueue_time_us : 0
    );

    uint8_t trace_critical_depth = 0;
    uint8_t trace_audio_depth = 0;
    uint8_t trace_route_flags = 0;
    output_trace_queue_details_locked(trace_critical_depth, trace_audio_depth, trace_route_flags);

    if (urgent_precedes_audio) {
        // Match Awalol/DS5Dongle's shared FIFO: host 0x31 and audio 0x39
        // reports drain in arrival order. Retry readiness still prevents a
        // delayed urgent head from blocking newer audio indefinitely.
        packet = std::move(urgent_queue.front());
        urgent_queue.pop_front();
    } else {
        const bool audio_available = audio_queued;
        const uint32_t state_age_us = state_pending
            ? packet_age_us(now, state_pending_since_us)
            : 0;
        const OutputSchedulerInputs scheduler_inputs{
            audio_available,
            urgent_ready,
            state_pending && !urgent_queued,
            consecutive_audio_sends,
            state_age_us
        };
        constexpr OutputSchedulerConfig scheduler_config{
            OUTPUT_MAX_CONSECUTIVE_AUDIO_SENDS,
            OUTPUT_STATE_MAX_AGE_US
        };

        const OutputSchedulerChoice choice = output_scheduler_choose_interrupt_packet(
            scheduler_inputs,
            scheduler_config
        );

        if (choice == OutputSchedulerChoice::AudioStream) {
            const audio_output_packet &audio_packet = audio_queue.front();
            packet.data.assign(
                audio_packet.data.begin(),
                audio_packet.data.begin() + audio_packet.data_size
            );
            packet.enqueue_time_us = audio_packet.enqueue_time_us;
            packet.ready_at_us = audio_packet.enqueue_time_us;
            packet.packet_class = OutputPacketAudio;
            packet.report_id = audio_packet.report_id;
            packet.reason = OutputReasonAudioStream;
            packet.retry_count = 0;
            audio_queue.pop();
        } else if (choice == OutputSchedulerChoice::Urgent) {
            packet = std::move(urgent_queue.front());
            urgent_queue.pop_front();
        } else if (choice == OutputSchedulerChoice::CoalescedState) {
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
    update_queue_depth_counters_locked();
    return true;
}

static bool select_next_control_packet_locked(control_packet &packet, uint32_t now) {
    if (!control_pending_locked()) {
        return false;
    }
    if (audio_send_window_closed_locked(now)) {
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

static bool requeue_managed_rumble_on_send_failure(
    output_packet &&packet,
    uint32_t now
) {
    const auto delivery_kind = classic_rumble_delivery_kind(packet.reason);
    if (
        packet.packet_class != OutputPacketUrgent
        || !ds5::classic_rumble::tracks_delivery_state(delivery_kind)
        || hid_interrupt_cid == 0
    ) {
        return false;
    }

    if (packet.retry_count != 0xff) {
        packet.retry_count++;
    }
    if (ds5::classic_rumble::retry_requires_fail_closed(packet.retry_count)) {
        DS5_LOG("[L2CAP] Managed rumble retry exhausted; disconnect HID\n");
        (void)bt_disconnect();
        critical_section_enter_blocking(&queue_lock);
        clear_output_queues_locked();
        critical_section_exit(&queue_lock);
        return false;
    }

    packet.ready_at_us = now
        + ds5::classic_rumble::retry_delay_us(packet.retry_count);
    critical_section_enter_blocking(&queue_lock);
    if (urgent_queue.size() >= URGENT_SEND_QUEUE_HARD_MAX_DEPTH) {
        critical_section_exit(&queue_lock);
        DS5_LOG("[L2CAP] Managed rumble retry reserve exhausted; disconnect HID\n");
        (void)bt_disconnect();
        critical_section_enter_blocking(&queue_lock);
        clear_output_queues_locked();
        critical_section_exit(&queue_lock);
        return false;
    }
    ds5::classic_rumble::requeue_failed_front(
        urgent_queue,
        std::move(packet)
    );
    critical_section_exit(&queue_lock);
    return true;
}

static void finish_hid_session_if_ready() {
    if (!hid_control_ready || !hid_interrupt_ready) {
        return;
    }
    if (pairing_link_key_required && !current_link_key_persisted) {
        DS5_LOG("[HCI] HID ready; wait for durable link key before publishing controller\n");
        return;
    }
    if (connection_phase == BtConnectionPhase::Ready) {
        return;
    }
    if (connection_phase != BtConnectionPhase::HidOpening) {
        return;
    }
    if (
        pairing_authorized_session
        && !bt_blacklist_remove(current_device_addr)
    ) {
        DS5_LOG("[BLACKLIST] Explicit pairing policy commit failed; disconnect controller\n");
        (void)bt_disconnect();
        return;
    }

    connection_phase = BtConnectionPhase::Ready;
    connection_phase_started_us = 0;
    cancel_hid_channel_recovery_if_ready();
    // Wake-on-LAN: this function only reaches here once per connection (see
    // the `connection_phase == BtConnectionPhase::Ready` early-return above),
    // so this is an edge trigger -- fires once per DISCONNECTED->CONNECTED
    // transition, not on every input report or while already connected.
    wolwifi_on_controller_connect();
    critical_section_enter_blocking(&queue_lock);
    reset_controller_output_session_locked();
    critical_section_exit(&queue_lock);

    if (!mute[0]) {
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, true);
    }
    gap_connectable_control(0);
    gap_discoverable_control(0);
    gap_set_bondable_mode(0);
    close_pairing_window(false);
    const uint64_t now_us = time_us_64();
    inactive_time = now_us;
    arm_signal_strength_idle_epoch(now_us);

    DS5_LOG("Init DualSense\n");
    init_feature();
    reset_lightbar_setup();
    bt_set_lightbar_color(0x00, 0x00, 0xff, 100);
    bt_schedule_lightbar_restore(250);
}

static __attribute__((optimize("O2"))) void __not_in_flash_func(handle_l2cap_can_send_now)(uint8_t *packet) {
    if (connection_phase == BtConnectionPhase::Disconnecting) {
        return;
    }
    const uint16_t local_cid = l2cap_event_can_send_now_get_local_cid(packet);
    if (local_cid != hid_interrupt_cid) {
        return;
    }
    interrupt_can_send_event_requested = false;

    const uint32_t now = time_us_32();
    critical_section_enter_blocking(&queue_lock);
    if (!select_next_output_packet_locked(interrupt_send_packet, now)) {
        critical_section_exit(&queue_lock);
        return;
    }
    bool has_more = output_pending_locked();
    bool should_request_control = false;
    request_control_if_audio_window_open_locked(now, should_request_control);
    const bool transport_ready = prepare_interrupt_output_packet_for_send(
        interrupt_send_packet
    );
    critical_section_exit(&queue_lock);

    if (!transport_ready) {
        DS5_LOG("[L2CAP] Refusing malformed DualSense output transport report\n");
        request_can_send_if_needed(has_more);
        request_control_can_send_if_needed(should_request_control);
        return;
    }

    uint8_t status = l2cap_send(
        hid_interrupt_cid,
        interrupt_send_packet.data.data(),
        interrupt_send_packet.data.size()
    );
    if (status != 0) {
        DS5_LOG("[L2CAP] Interrupt Error, Status: 0x%02X\n", status);
        if (interrupt_send_packet.packet_class == OutputPacketAudio) {
            critical_section_enter_blocking(&queue_lock);
            if (output_counters.audio_l2cap_send_fail_count != 0xffffffffu) {
                output_counters.audio_l2cap_send_fail_count++;
            }
            critical_section_exit(&queue_lock);
        }
        if (requeue_managed_rumble_on_send_failure(std::move(interrupt_send_packet), now)) {
            // The failed transition remains at the head until its bounded
            // backoff expires. Audio may continue meanwhile.
            critical_section_enter_blocking(&queue_lock);
            has_more = !audio_queue.empty() || state_pending;
            critical_section_exit(&queue_lock);
        }
    } else if (!interrupt_send_packet.data.empty()) {
        critical_section_enter_blocking(&queue_lock);
        commit_interrupt_output_packet_sent(interrupt_send_packet);
        note_output_packet_sent(interrupt_send_packet, time_us_32());
        has_more = has_more || output_pending_locked();
        critical_section_exit(&queue_lock);
#ifdef ENABLE_COMPANION
        companion_note_trigger_trace_report(
            CompanionTriggerTraceBt,
            interrupt_send_packet.data.data() + 1,
            static_cast<uint16_t>(interrupt_send_packet.data.size() - 1),
            interrupt_send_packet.reason
        );
        companion_note_feedback_trace_report(
            CompanionFeedbackTraceBt,
            interrupt_send_packet.data.data() + 1,
            static_cast<uint16_t>(interrupt_send_packet.data.size() - 1),
            interrupt_send_packet.reason,
            interrupt_send_packet.trace_detail0,
            interrupt_send_packet.trace_detail1,
            interrupt_send_packet.trace_detail2,
            interrupt_send_packet.trace_detail3
        );
#endif
    }
    request_can_send_if_needed(has_more);
    request_control_can_send_if_needed(should_request_control);
}

static void __not_in_flash_func(l2cap_packet_handler)(
    uint8_t packet_type,
    uint16_t channel,
    uint8_t *packet,
    uint16_t size
) {
    if (
        packet_type == HCI_EVENT_PACKET
        && hci_event_packet_get_type(packet) == L2CAP_EVENT_CAN_SEND_NOW
        && l2cap_event_can_send_now_get_local_cid(packet) == hid_interrupt_cid
    ) {
        handle_l2cap_can_send_now(packet);
        return;
    }
    l2cap_packet_handler_cold(packet_type, channel, packet, size);
}

static __attribute__((noinline)) void l2cap_packet_handler_cold(
    uint8_t packet_type,
    uint16_t channel,
    uint8_t *packet,
    uint16_t size
) {
    (void) channel;

    if (packet_type == L2CAP_DATA_PACKET) {
        if (channel == hid_interrupt_cid) {
            // DS5_LOG("[L2CAP] HID Interrupt data len=%u\n", size);
            // DS5_HEXDUMP(packet, size);
            bt_data_callback(INTERRUPT, packet, size);

            const uint64_t now_us = time_us_64();
            const bool meaningful_input_activity =
                controller_input_report_is_active(packet, size);
            if (meaningful_input_activity) {
                inactive_time = now_us;
                arm_signal_strength_idle_epoch(now_us);
            }

            // Inactivity detection.
            if (mute[1]) { // Microphone mute is enabled.
                return;
            }
            if (!meaningful_input_activity && now_us - inactive_time > idle_disconnect_timeout_us()) {
                DS5_LOG("disconnect when inactive\n");
                inactive_time = now_us;
                bt_disconnect_with_intent(BtControllerDisconnectIntentIdleTimeout);
            }
        } else if (channel == hid_control_cid) {
            const bool firmware_type_response =
                size > 23
                && packet[0] == 0xA3
                && packet[1] == 0x20;
            const bool edge_type_response = firmware_type_response && packet[23] == 0x44;
            if (controller_type_check_pending) {
                if (firmware_type_response) {
                    controller_type = edge_type_response
                        ? ControllerTypeDualSenseEdge
                        : ControllerTypeDualSense;
                    controller_type_check_pending = false;
                    DS5_LOG(
                        "[L2CAP] Connected controller detected as %s\n",
                        edge_type_response ? "DualSense Edge" : "DualSense"
                    );
                    usb_handle_controller_transport_ready();
                } else if (size > 0 && packet[0] == 0x02) {
                    controller_type = ControllerTypeDualSense;
                    controller_type_check_pending = false;
                    DS5_LOG("[L2CAP] Connected controller detected as DualSense\n");
                    usb_handle_controller_transport_ready();
                }
            } else if (
                edge_type_response
                && controller_type == ControllerTypeDualSense
            ) {
                // The initial USB persona intentionally remains base DualSense,
                // but a delayed firmware report must still upgrade Edge-specific
                // input handling after the fallback has already published.
                controller_type = ControllerTypeDualSenseEdge;
                DS5_LOG("[L2CAP] Late controller type response upgraded controller to DualSense Edge\n");
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
            const uint16_t psm = l2cap_event_channel_opened_get_psm(packet);
            const hci_con_handle_t handle = l2cap_event_channel_opened_get_handle(packet);
            if (!connection_handle_is_current(handle)) {
                DS5_LOG("[L2CAP] Ignore stale channel open handle=0x%04X cid=0x%04X\n",
                        handle,
                        local_cid);
                if (status == ERROR_CODE_SUCCESS) {
                    l2cap_disconnect(local_cid);
                }
                break;
            }

            uint16_t *pending_cid = nullptr;
            if (psm == PSM_HID_CONTROL) {
                pending_cid = &hid_control_pending_cid;
            } else if (psm == PSM_HID_INTERRUPT) {
                pending_cid = &hid_interrupt_pending_cid;
            }
            if (pending_cid == nullptr || *pending_cid != local_cid) {
                DS5_LOG("[L2CAP] Ignore duplicate/unowned channel open psm=0x%04X cid=0x%04X\n",
                        psm,
                        local_cid);
                if (status == ERROR_CODE_SUCCESS) {
                    l2cap_disconnect(local_cid);
                }
                break;
            }
            *pending_cid = 0;

            if (status != ERROR_CODE_SUCCESS) {
                if (
                    psm == PSM_HID_CONTROL
                    && hid_connection_initiator == HidConnectionInitiator::Local
                ) {
                    hid_connection_initiator = HidConnectionInitiator::None;
                }
                DS5_LOG("[L2CAP] Open failed psm=0x%04X cid=0x%04X status=0x%02X; retry\n",
                        psm,
                        local_cid,
                        status);
                schedule_hid_channel_recovery();
                break;
            }

            if (psm == PSM_HID_CONTROL) {
                DS5_LOG("[L2CAP] HID Control opened cid=0x%04X\n", local_cid);
                hid_control_cid = local_cid;
                hid_control_ready = true;
                hid_control_opened_at_us = time_us_32();
                note_connection_phase_started();
                hid_channel_recovery_attempts = 0;
                if (hid_connection_initiator == HidConnectionInitiator::Remote) {
                    DS5_LOG("[L2CAP] Controller opened HID Control; await controller-owned Interrupt\n");
                    hid_channel_recovery_pending = false;
                } else {
                    schedule_hid_channel_recovery();
                }
            } else {
                DS5_LOG("[L2CAP] HID Interrupt opened cid=0x%04X\n", local_cid);
                hid_interrupt_cid = local_cid;
                hid_interrupt_ready = true;
                hid_control_opened_at_us = 0;
                note_connection_phase_started();
                hid_channel_recovery_attempts = 0;
            }
            finish_hid_session_if_ready();
            break;
        }

        case L2CAP_EVENT_INCOMING_CONNECTION: {
            const uint16_t local_cid = l2cap_event_incoming_connection_get_local_cid(packet);
            const uint16_t psm = l2cap_event_incoming_connection_get_psm(packet);
            const hci_con_handle_t handle = l2cap_event_incoming_connection_get_handle(packet);
            DS5_LOG("[L2CAP] Incoming connection handle=0x%04X psm=0x%04X cid=0x%04X\n",
                    handle,
                    psm,
                    local_cid);
            if (!current_link_security_ready(handle) || !begin_hid_opening(handle)) {
                DS5_LOG("[L2CAP] Decline unowned incoming HID channel\n");
                l2cap_decline_connection(local_cid);
                break;
            }
            if (psm == PSM_HID_CONTROL) {
                if (hid_control_cid != 0 || hid_control_pending_cid != 0) {
                    DS5_LOG("[L2CAP] Decline duplicate HID Control channel\n");
                    l2cap_decline_connection(local_cid);
                    break;
                }
                hid_connection_initiator = HidConnectionInitiator::Remote;
                hid_channel_recovery_pending = false;
                hid_channel_recovery_attempts = 0;
                hid_control_pending_cid = local_cid;
            } else if (psm == PSM_HID_INTERRUPT) {
                const bool control_owned = hid_control_ready || hid_control_pending_cid != 0;
                if (!control_owned || hid_interrupt_cid != 0 || hid_interrupt_pending_cid != 0) {
                    DS5_LOG("[L2CAP] Decline out-of-order/duplicate HID Interrupt channel\n");
                    l2cap_decline_connection(local_cid);
                    break;
                }
                hid_interrupt_pending_cid = local_cid;
            } else {
                DS5_LOG("[L2CAP] Decline unsupported PSM=0x%04X\n", psm);
                l2cap_decline_connection(local_cid);
                break;
            }
            l2cap_accept_connection(local_cid);
            break;
        }

        case L2CAP_EVENT_CHANNEL_CLOSED: {
            const uint16_t local_cid = l2cap_event_channel_closed_get_local_cid(packet);
            bool owned_channel = true;
            if (local_cid == hid_control_cid) {
                hid_control_cid = 0;
                hid_control_ready = false;
                hid_control_opened_at_us = 0;
                if (hid_connection_initiator == HidConnectionInitiator::Local) {
                    hid_connection_initiator = HidConnectionInitiator::None;
                }
                DS5_LOG("[L2CAP] HID Control closed cid=0x%04X\n", local_cid);
            } else if (local_cid == hid_interrupt_cid) {
                hid_interrupt_cid = 0;
                hid_interrupt_ready = false;
                DS5_LOG("[L2CAP] HID Interrupt closed cid=0x%04X\n", local_cid);
            } else if (local_cid == hid_control_pending_cid) {
                hid_control_pending_cid = 0;
                if (hid_connection_initiator == HidConnectionInitiator::Local) {
                    hid_connection_initiator = HidConnectionInitiator::None;
                }
                DS5_LOG("[L2CAP] Pending HID Control closed cid=0x%04X\n", local_cid);
            } else if (local_cid == hid_interrupt_pending_cid) {
                hid_interrupt_pending_cid = 0;
                DS5_LOG("[L2CAP] Pending HID Interrupt closed cid=0x%04X\n", local_cid);
            } else {
                owned_channel = false;
                DS5_LOG("[L2CAP] Ignore stale channel close cid=0x%04X\n", local_cid);
            }
            if (!owned_channel) {
                break;
            }
            if (connection_phase == BtConnectionPhase::Ready) {
                connection_phase = BtConnectionPhase::HidOpening;
                note_connection_phase_started();
            }
            if (
                hid_control_cid == 0
                && hid_interrupt_cid == 0
                && hid_control_pending_cid == 0
                && hid_interrupt_pending_cid == 0
            ) {
                bt_disconnect();
            } else {
                schedule_hid_channel_recovery();
            }
            break;
        }

        case L2CAP_EVENT_CAN_SEND_NOW: {
            // DS5_LOG("[L2CAP] L2CAP_EVENT_CAN_SEND_NOW\n");
            if (connection_phase == BtConnectionPhase::Disconnecting) {
                break;
            }
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

static bool dualsense_output_transport_report(output_packet const &packet) {
    if (packet.data.size() <= 2) {
        return false;
    }
    const uint8_t report_id = packet.data[1];
    return report_id == DS_OUTPUT_REPORT_BT
        || report_id == 0x32
        || report_id == 0x39;
}

static bool prepare_interrupt_output_packet_for_send(output_packet &packet) {
    if (!dualsense_output_transport_report(packet)) {
        return true;
    }
    uint8_t *report = packet.data.data() + 1;
    const uint16_t report_len = static_cast<uint16_t>(packet.data.size() - 1);
    report[1] = static_cast<uint8_t>((state_report_seq & 0x0f) << 4);
    return fill_output_report_checksum(report, report_len);
}

static void commit_interrupt_output_packet_sent(output_packet const &packet) {
    if (!dualsense_output_transport_report(packet)) {
        return;
    }
    state_report_seq = static_cast<uint8_t>((state_report_seq + 1) & 0x0f);
}

static void request_can_send_if_needed(bool should_request_send) {
    if (!should_request_send) {
        return;
    }
    if (connection_phase == BtConnectionPhase::Disconnecting) {
        return;
    }
    if (hid_interrupt_cid == 0) {
        DS5_LOG("[L2CAP output] Warning: hid_interrupt_cid 0\n");
        return;
    }
    if (interrupt_can_send_event_requested) {
        return;
    }
    interrupt_can_send_event_requested = true;
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

static bool audio_send_window_closed_locked(uint32_t now) {
    if (!speaker_output_enabled) {
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

static void request_control_if_audio_window_open_locked(uint32_t now, bool &should_request_control) {
    should_request_control = control_pending_locked() && !audio_send_window_closed_locked(now);
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
    packet.ready_at_us = packet.enqueue_time_us;
    packet.packet_class = packet_class;
    packet.report_id = len > 0 ? data[0] : 0;
    packet.reason = reason;
    packet.retry_count = 0;
    return true;
}

static bool enqueue_urgent_output(uint8_t *data, uint16_t len, uint8_t reason) {
    output_packet packet{};
    if (!make_output_packet(data, len, OutputPacketUrgent, reason, packet)) {
        return false;
    }

    bool should_request_send = false;
    bool hard_limit_reached = false;
    critical_section_enter_blocking(&queue_lock);
    should_request_send = !output_pending_locked();
    const auto kind_of = [](output_packet const &queued) {
        return classic_rumble_delivery_kind(queued.reason);
    };
    const bool coalesced = ds5::classic_rumble::coalesce_latest_managed_active(
        urgent_queue,
        std::move(packet),
        kind_of
    );
    ds5::classic_rumble::AdmissionResult admission =
        ds5::classic_rumble::AdmissionResult::Enqueued;
    if (!coalesced) {
        admission = ds5::classic_rumble::enqueue_with_soft_cap(
            urgent_queue,
            std::move(packet),
            URGENT_SEND_QUEUE_MAX_DEPTH,
            URGENT_SEND_QUEUE_HARD_MAX_DEPTH,
            kind_of
        );
    }
    hard_limit_reached = !coalesced
        && admission == ds5::classic_rumble::AdmissionResult::HardCapReached;
    const bool enqueued = coalesced
        || admission == ds5::classic_rumble::AdmissionResult::Enqueued;
    if (enqueued && ds5::classic_rumble::is_classic_rumble(
            classic_rumble_delivery_kind(reason)
        )) {
        // Existing 0x36 carriers must not overwrite the newly admitted host
        // or managed rumble command with an older cached snapshot.
        mirror_pending_classic_rumble_locked(data, len);
    }
    critical_section_exit(&queue_lock);
    if (!enqueued) {
        if (
            hard_limit_reached
            && reason == OutputReasonClassicRumbleManagedStop
        ) {
            DS5_LOG("[L2CAP] Managed rumble STOP reserve exhausted; disconnect HID\n");
            (void)bt_disconnect();
        }
        return false;
    }
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

static void mirror_pending_classic_rumble_locked(uint8_t const *data, uint16_t len) {
    if (state_pending) {
        (void)mirror_classic_rumble_in_report(state_pending_report, sizeof(state_pending_report), data, len);
    }
    // Batched 0x39 audio carries no controller state. Complete host reports
    // already queued in the urgent lane remain immutable and ordered.
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
    if (flag0 & DS_OUTPUT_VALID_FLAG0_HEADPHONE_VOLUME_ENABLE) {
        mark_payload_byte(recognized, payload_len, OUTPUT_PAYLOAD_HEADPHONE_VOLUME_OFFSET);
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
        | DS_OUTPUT_VALID_FLAG0_HEADPHONE_VOLUME_ENABLE
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
        | DS_OUTPUT_VALID_FLAG0_HEADPHONE_VOLUME_ENABLE
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
        uint8_t const *payload = nullptr;
        uint16_t payload_len = 0;
        const bool managed_stop =
            output_report_payload(data, len, payload, payload_len)
            && payload_len > OUTPUT_PAYLOAD_MOTOR_LEFT_OFFSET
            && (payload[OUTPUT_PAYLOAD_MOTOR_RIGHT_OFFSET]
                | payload[OUTPUT_PAYLOAD_MOTOR_LEFT_OFFSET]) == 0;
        const uint8_t transition_reason = managed_stop
            ? OutputReasonClassicRumbleManagedStop
            : OutputReasonClassicRumbleImmediate;
        if (!enqueue_urgent_output(data, len, transition_reason)) {
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
        | DS_OUTPUT_VALID_FLAG0_HEADPHONE_VOLUME_ENABLE
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
    if (state_flag0 & DS_OUTPUT_VALID_FLAG0_HEADPHONE_VOLUME_ENABLE) {
        copy_payload_byte(state_payload, payload, payload_len, OUTPUT_PAYLOAD_HEADPHONE_VOLUME_OFFSET);
        clear_payload_byte(payload, payload_len, OUTPUT_PAYLOAD_HEADPHONE_VOLUME_OFFSET);
    }
    if (state_flag0 & DS_OUTPUT_VALID_FLAG0_SPEAKER_VOLUME_ENABLE) {
        copy_payload_byte(state_payload, payload, payload_len, OUTPUT_PAYLOAD_SPEAKER_VOLUME_OFFSET);
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
    if (flag0 & DS_OUTPUT_VALID_FLAG0_HEADPHONE_VOLUME_ENABLE) {
        dst[OUTPUT_PAYLOAD_VALID_FLAG0_OFFSET] |= DS_OUTPUT_VALID_FLAG0_HEADPHONE_VOLUME_ENABLE;
        dst[OUTPUT_PAYLOAD_HEADPHONE_VOLUME_OFFSET] = src[OUTPUT_PAYLOAD_HEADPHONE_VOLUME_OFFSET];
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
    critical_section_enter_blocking(&queue_lock);
    merge_state_output_locked(data, len, now, reason);
    update_queue_depth_counters_locked();
    critical_section_exit(&queue_lock);
    request_can_send_if_needed(true);
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
    uint8_t *payload = nullptr;
    uint16_t payload_len = 0;
    if (!output_report_payload(data, len, payload, payload_len)) {
        return false;
    }
    apply_player_led_policy_to_payload(payload, payload_len);

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
    // Preserve every complete host SetStateData report as a standalone 0x31,
    // including the full active-rumble envelope. Batched 0x39 audio and host
    // reports share arrival-ordered FIFO scheduling.
    const bool audio_protected = speaker_output_enabled && audio_output_route_protected();
    const bool classic_rumble_transition = output_report_is_classic_rumble_transition(data, len);
    const bool enqueued = enqueue_urgent_output(
        data,
        len,
        OutputReasonHostPassthrough
    );
#ifdef ENABLE_COMPANION
    companion_note_trigger_trace_report(
        CompanionTriggerTraceBridgeOut,
        data,
        len,
        OutputReasonHostPassthrough
    );
    companion_note_feedback_trace_report(
        CompanionFeedbackTraceBridgeOut,
        data,
        len,
        OutputReasonHostPassthrough,
        trace_critical_depth,
        trace_audio_depth,
        trace_route_flags,
        static_cast<uint8_t>(
            (audio_protected ? OutputTraceTransformAudioProtected : 0)
            | (classic_rumble_transition ? OutputTraceTransformClassicRumble : 0)
        )
    );
#endif
    return enqueued;
}

bool __not_in_flash_func(bt_write_audio_stream)(uint8_t *data, uint16_t len) {
    if (
        hid_interrupt_cid == 0
        || data == nullptr
        || len + 1u > AUDIO_INTERRUPT_PACKET_MAX_SIZE
    ) {
        return false;
    }

    audio_output_packet packet{};
    packet.data[0] = 0xA2;
    memcpy(packet.data.data() + 1, data, len);
    if (!fill_output_report_checksum(packet.data.data() + 1, len)) {
        return false;
    }
    packet.data_size = static_cast<uint16_t>(len + 1u);
    packet.enqueue_time_us = time_us_32();
    packet.report_id = len > 0 ? data[0] : 0;

    bool should_request_send = false;
    uint8_t trace_critical_depth = 0;
    uint8_t trace_audio_depth = 0;
    uint8_t trace_route_flags = 0;
    critical_section_enter_blocking(&queue_lock);
    // Audio must remain runnable while a failed managed rumble transition is
    // waiting for its bounded retry deadline.
    should_request_send = true;
    while (audio_queue.size() >= AUDIO_SEND_QUEUE_MAX_DEPTH) {
#ifdef ENABLE_COMPANION
        if (audio_queue.front().data_size > 1) {
            uint8_t drop_critical_depth = 0;
            uint8_t drop_audio_depth = 0;
            uint8_t drop_route_flags = 0;
            output_trace_queue_details_locked(drop_critical_depth, drop_audio_depth, drop_route_flags);
            companion_note_feedback_trace_report(
                CompanionFeedbackTraceAudioDrop,
                audio_queue.front().data.data() + 1,
                static_cast<uint16_t>(audio_queue.front().data_size - 1),
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
    audio_queue.push(packet);
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
    consecutive_audio_sends = 0;
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
    stats->audio_l2cap_send_fail_count = output_counters.audio_l2cap_send_fail_count;
    stats->normal_0x31_rx_count = output_counters.normal_0x31_rx_count;
    stats->normal_0x31_sent_count = output_counters.normal_0x31_sent_count;
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
    clear_feature_prefetch_queue();
    controller_type_check_pending = true;
    schedule_feature_prefetch(0x20, 64);
    schedule_feature_prefetch(0x09, 20);
    schedule_feature_prefetch(0x22, 64);
    schedule_feature_prefetch(0x05, 41);
    feature_prefetch_next_us = time_us_32();
}
