//
// Created by awalol on 2026/3/5.
// Modified for DS5 Bridge companion firmware and app integration.
//

#include "audio.h"
#include "audio_exact_queue.h"
#include "bt.h"
#include "controller_output_policy.h"
#include "controller_output_state.h"
#include "dualsense_output.h"
#include "haptics_test_signal.h"
#include "persona/host_persona.h"
#include "usb_audio_render_gain.h"
#ifdef ENABLE_COMPANION
#include "companion.h"
#endif
#include "resample.h"
#include "tusb.h"
#include "usb.h"
#include <algorithm>
#include <atomic>
#include <cstdio>
#include <cstring>
#include <iterator>

#include "opus.h"
#include "utils.h"
#include "pico/critical_section.h"
#include "pico/flash.h"
#include "pico/multicore.h"
#include "pico/platform.h"
#include "pico/sem.h"
#include "pico/time.h"

#define INPUT_CHANNELS    4
#define OUTPUT_CHANNELS   2
#define SAMPLE_SIZE       64
#define SPEAKER_OPUS_SIZE 200
#define AUDIO_BATCH_FRAMES 2
#define REPORT_SIZE       547
#define REPORT_ID         0x39
#define DEFAULT_HAPTICS_BUFFER_LENGTH 64
#define MIN_HAPTICS_BUFFER_LENGTH 16
#define MAX_HAPTICS_BUFFER_LENGTH 128
#define TEST_HAPTICS_PACKET_COUNT 36
#define TEST_HAPTICS_PACKET_INTERVAL_US 10666
#define TEST_HAPTICS_COOLDOWN_US 500000
#define TEST_HAPTICS_BASE_AMPLITUDE 72
#define TEST_HAPTICS_PREROLL_PACKET_COUNT 3
#define TEST_HAPTICS_NEUTRAL_PACKET_COUNT 5
#define MAX_HAPTICS_GAIN 5.0f
#define USB_AUDIO_ACTIVE_THRESHOLD 8
#define AUDIO_LOOP_MAX_USB_READS 4
#define AUDIO_DEBUG_RING_SIZE 96
#define AUDIO_DEBUG_REPORT_HEADER_SIZE 8
#define AUDIO_DEBUG_RECORD_SIZE 14
#define OPUS_ENCODE_BUDGET_US 10000
#define SPEAKER_USB_SILENCE_TAIL_US 500000
#define SPEAKER_SILENCE_PREROLL_USB_PACKETS 24
#define SPEAKER_SILENCE_PREROLL_INTERVAL_US 10666
#define AUDIO_REACTIVE_HAPTICS_MAX_GAIN_PERCENT 200
#define AUDIO_REACTIVE_HAPTICS_GATE_THRESHOLD 98.0f
#define AUDIO_REACTIVE_HAPTICS_ENVELOPE_ATTACK 0.40f
#define AUDIO_REACTIVE_HAPTICS_ENVELOPE_RELEASE 0.025f
#define AUDIO_REACTIVE_HAPTICS_GATE_OPEN_RATE 0.035f
#define AUDIO_REACTIVE_HAPTICS_GATE_CLOSE_RATE 0.004f
#define AUDIO_REACTIVE_HAPTICS_OUTPUT_RAMP_STEP 0.004f
#define HOST_MIC_OPUS_SIZE 71
#define HOST_MIC_OPUS_FRAMES 480
#define HOST_MIC_INPUT_CHANNELS 1
#define HOST_MIC_USB_CHANNELS_MAX CFG_TUD_AUDIO_FUNC_1_N_CHANNELS_TX
#define HOST_MIC_QUEUE_DEPTH 8
#define HOST_MIC_USB_PACKET_BYTES_MAX (48 * HOST_MIC_USB_CHANNELS_MAX * sizeof(int16_t))
#define HOST_MIC_USB_FILL_MAX_CHUNKS 6
#define HOST_MIC_USB_FILL_MAX_CHUNKS_WITH_RAW_PCM 4
#define HOST_MIC_CORE1_BURST_LIMIT 2
#define HOST_MIC_PLAYOUT_START_DEPTH 12
#define HOST_MIC_OPUS_FRAME_INTERVAL_US 10000
#define HOST_MIC_PLC_TARGET_DEPTH 1
#define HOST_MIC_PLC_EMPTY_GRACE_US 30000
#define BRIDGE_AUDIO_STREAM_REPORT_ID 0x07
#define BRIDGE_AUDIO_FAST_FRAME_FRAGMENT_TYPE 0x08
#define BRIDGE_AUDIO_FAST_PAYLOAD_BYTES 57
#define BRIDGE_AUDIO_COMPACT_FRAME_BYTES 264
#define BRIDGE_AUDIO_MAX_FRAGMENTS ((BRIDGE_AUDIO_COMPACT_FRAME_BYTES + BRIDGE_AUDIO_FAST_PAYLOAD_BYTES - 1) / BRIDGE_AUDIO_FAST_PAYLOAD_BYTES)
using std::clamp;
using std::max;

enum AudioDebugEventCode : uint8_t {
    AudioDebugAudioStart = 1,
    AudioDebugResetGap = 2,
    AudioDebugCore1Reset = 3,
    AudioDebugSkipOpusPacket = 4,
    AudioDebugSendSpeakerPacket = 5,
    AudioDebugNoOpusPacket = 6,
    AudioDebugAudioFifoDrop = 7,
    AudioDebugAudioFifoAddFail = 8,
    AudioDebugOpusFifoDrop = 9,
    AudioDebugOpusFifoAddFail = 10,
    AudioDebugTestHapticsStart = 11,
    AudioDebugTestHapticsStop = 12,
    AudioDebugSpeakerRoute = 13,
    AudioDebugQuietMode = 14,
    AudioDebugSilencePreroll = 15,
    AudioDebugUsbSilenceTail = 16,
    AudioDebugMicPacket = 19,
    AudioDebugUsbEvent = 20,
    AudioDebugHidEvent = 21,
    AudioDebugBtEvent = 22,
    AudioDebugCpuLoad = 23,
};

struct mic_packet_element {
    uint8_t data[HOST_MIC_OPUS_SIZE];
    uint32_t generation;
};

struct mic_decode_element {
    int16_t data[HOST_MIC_OPUS_FRAMES * HOST_MIC_USB_CHANNELS_MAX];
    uint16_t len;
    uint32_t generation;
};

static uint8_t host_mic_usb_channel_count() {
    return host_persona_active() == HostPersonaModeDualSenseEdge ? 2 : 1;
}

static uint16_t host_mic_usb_packet_bytes() {
    return static_cast<uint16_t>(48 * host_mic_usb_channel_count() * sizeof(int16_t));
}

static uint16_t host_mic_usb_prefill_bytes() {
    return static_cast<uint16_t>(64 * host_mic_usb_packet_bytes());
}

static uint32_t host_mic_plc_reservoir_bytes() {
    return static_cast<uint32_t>(40 * host_mic_usb_packet_bytes());
}

struct speaker_opus_element {
    uint8_t data[SPEAKER_OPUS_SIZE];
    uint32_t generation;
};

struct audio_raw_element {
    float data[512 * 2];
    uint32_t generation;
};

struct audio_debug_event {
    uint32_t sequence;
    uint32_t timestamp_us;
    uint8_t code;
    uint8_t arg0;
    uint8_t arg1;
    uint8_t arg2;
    uint8_t arg3;
    uint8_t arg4;
};

static uint8_t packetCounter = 0;
static bool plug_headset = false;
static bool controller_state_ready = false;
static bool audio_initialized = false;
static semaphore_t core1_flash_init_done;
static std::atomic_bool core1_flash_init_succeeded{false};
static std::atomic<uint32_t> mic_stream_generation{1};
static uint32_t last_audio_us = 0;
static bool speaker_route_active = false;
static bool speaker_route_headset = false;
static bool host_route_primer_toggle_pending = false;
static bool test_haptics_active = false;
static uint8_t test_haptics_preroll_packets_remaining = 0;
static uint8_t test_haptics_packets_remaining = 0;
static uint8_t test_haptics_neutral_packets_remaining = 0;
static uint32_t test_haptics_last_packet_us = 0;
static uint32_t test_haptics_cooldown_until_us = 0;
static bool quiet_mode_enabled = false;
static volatile uint32_t audio_stream_generation = 1;
static uint8_t haptics_buffer_length = DEFAULT_HAPTICS_BUFFER_LENGTH;
static critical_section_t audio_debug_cs;
static bool audio_debug_cs_ready = false;
static audio_debug_event audio_debug_ring[AUDIO_DEBUG_RING_SIZE];
static uint32_t audio_debug_next_sequence = 1;
static uint32_t audio_debug_read_sequence = 1;
static uint16_t audio_debug_dropped_count = 0;
static uint8_t audio_debug_count = 0;
static uint8_t audio_debug_head = 0;
static uint8_t audio_debug_packet_log_budget = 0;
static audio_debug_stats audio_stats{};
static volatile uint32_t audio_loop_runtime_max_us = 0;
static volatile uint32_t audio_loop_gap_max_us = 0;
static uint32_t audio_loop_last_start_us = 0;
static uint32_t last_usb_audio_read_us = 0;
static uint32_t last_usb_discard_debug_us = 0;
static uint32_t last_hid_output_debug_us = 0;
static uint8_t hid_output_debug_burst_remaining = 0;
static bool audio_silence_tail_logged = false;
static uint8_t speaker_silence_preroll_packets_remaining = 0;
static uint32_t speaker_silence_preroll_last_packet_us = 0;
static uint8_t bridge_audio_frame[BRIDGE_AUDIO_COMPACT_FRAME_BYTES];
static uint16_t bridge_audio_sequence = 0;
static uint8_t bridge_audio_next_fragment = 0;
static uint8_t bridge_audio_expected_fragments = 0;
static bool bridge_audio_receiving = false;

constexpr std::size_t AUDIO_CORE1_STACK_WORDS = 7000;
constexpr std::size_t AUDIO_CORE1_STACK_GUARD_WORDS = 64;
constexpr uint32_t AUDIO_CORE1_STACK_CANARY = 0xa55aa55au;

struct alignas(8) AudioCore1StackStorage {
    uint32_t guard[AUDIO_CORE1_STACK_GUARD_WORDS];
    uint32_t stack[AUDIO_CORE1_STACK_WORDS];
};

static AudioCore1StackStorage audio_core1_stack_storage{};
static ExactAudioQueue<audio_raw_element, 2> audio_fifo;
static ExactAudioQueue<speaker_opus_element, AUDIO_BATCH_FRAMES> speaker_opus_fifo;
static bool speaker_opus_fifo_ready = false;
static ExactAudioQueue<mic_packet_element, HOST_MIC_QUEUE_DEPTH> mic_fifo;
static ExactAudioQueue<mic_decode_element, HOST_MIC_QUEUE_DEPTH> mic_decode_fifo;
static uint32_t audio_core1_stack_last_guard_check_us = 0;
#if DS5_DEBUG_LOGS_ENABLED
static uint32_t audio_core1_stack_last_watermark_check_us = 0;
static uint32_t audio_core1_stack_high_water_bytes = 0;
#endif

static WDL_Resampler resampler;
static float audio_buf[512 * 2];
static uint audio_buf_pos = 0;
static int8_t audio_haptic_buf[SAMPLE_SIZE];
static int audio_haptic_buf_pos = 0;
static int8_t pending_audio_haptics[AUDIO_BATCH_FRAMES][SAMPLE_SIZE]{};
static uint8_t pending_audio_haptics_count = 0;
static bool pending_audio_include_speaker = false;
static bool audio_reactive_haptics_config_enabled = false;
static uint8_t audio_reactive_haptics_mode = AudioReactiveHapticsMix;
static uint16_t audio_reactive_haptics_gain_percent = 100;
static uint8_t audio_reactive_haptics_bass_focus = AudioReactiveHapticsBassBalanced;
static uint8_t audio_reactive_haptics_response = AudioReactiveHapticsResponseBalanced;
static uint8_t audio_reactive_haptics_attack = AudioReactiveHapticsAttackBalanced;
static uint8_t audio_reactive_haptics_release = AudioReactiveHapticsReleaseBalanced;
static bool audio_reactive_haptics_suppress_classic_rumble = false;
static float audio_reactive_haptics_filter_l = 0.0f;
static float audio_reactive_haptics_filter_r = 0.0f;
static float audio_reactive_haptics_env_l = 0.0f;
static float audio_reactive_haptics_env_r = 0.0f;
static float audio_reactive_haptics_gate = 0.0f;
static float audio_reactive_haptics_output_ramp = 0.0f;
static volatile bool duplex_requested = true;
static uint32_t mic_packets_received = 0;
static uint32_t mic_packets_dropped = 0;
static uint32_t mic_decode_success = 0;
static uint32_t mic_decode_fail = 0;
static uint32_t mic_usb_write_success = 0;
static uint32_t mic_usb_write_short = 0;
static uint32_t mic_plc_count = 0;
static uint16_t mic_last_decoded_samples = 0;
static uint16_t mic_last_written_bytes = 0;
static uint16_t mic_peak_permille = 0;
static volatile bool mic_usb_playout_started = false;
static volatile uint8_t mic_output_volume_percent = 100;
static volatile bool mic_output_muted = false;
static volatile bool mic_mute_led_passthrough = false;
static bool controller_mic_state_valid = false;
static uint8_t controller_mic_state_volume_percent = 0xff;
static bool controller_mic_state_muted = true;
static bool controller_mic_state_control_mute_led = false;
static bool controller_mic_state_mute_led = false;
static uint32_t mic_next_plc_us = 0;
static uint32_t mic_usb_conceal_count = 0;
static uint32_t mic_decode_empty_since_us = 0;
static volatile uint32_t mic_usb_buffered_bytes = 0;
static bool mic_usb_fifo_threshold_configured = false;

static void __not_in_flash_func(core1_entry)();
static void reset_core1_audio_pipeline(uint32_t generation);
static void clear_mic_queues();
static __attribute__((noinline)) void __not_in_flash_func(process_mic_usb_output)();
static void discard_usb_audio_packets(uint8_t max_reads);
static void clear_partial_audio_state();
static void reset_controller_audio_report_counters();
static void schedule_host_route_primer();
static bool prime_host_audio_route_if_needed();
static bool audio_silence_tail_active(uint32_t now);
static uint8_t clamp_debug_u8(uint32_t value);
static void refresh_audio_haptics_replace_policy();
static bool merge_test_haptics_overlay(int8_t *destination, bool carrier_paced);
static bool append_resampled_haptic_sample(float left, float right, float gain);
static bool speaker_opus_batch_ready();
static bool try_send_pending_audio_batch();
static void clear_pending_audio_batch();
#if DS5_AUDIO_DEBUG_ENABLED
static void audio_debug_log_impl(
    AudioDebugEventCode code,
    uint8_t a = 0,
    uint8_t b = 0,
    uint8_t c = 0,
    uint8_t d = 0,
    uint8_t e = 0
);
#define audio_debug_log(...) audio_debug_log_impl(__VA_ARGS__)
#else
#define audio_debug_log(...) do { } while (0)
#endif
static constexpr uint32_t CPU_DEBUG_INTERVAL_US = 1000000;

static uint32_t current_mic_stream_generation() {
    return mic_stream_generation.load(std::memory_order_acquire);
}

static bool host_mic_path_active() {
    return duplex_requested
        && bt_is_controller_connected()
        && !mic_output_muted;
}

static bool host_mic_stream_active() {
    return host_mic_path_active();
}

static bool mic_usb_output_active() {
    return host_mic_stream_active() && usb_mic_streaming_active();
}

static bool controller_mic_transport_muted() {
    return quiet_mode_enabled || !host_mic_stream_active();
}

static void refresh_controller_mic_transport_state(bool force = false) {
    if (!bt_is_controller_connected()) {
        controller_mic_state_valid = false;
        return;
    }

    const uint8_t volume_percent = mic_output_volume_percent;
    const bool muted = controller_mic_transport_muted();
    const bool control_mute_led = mic_mute_led_passthrough;
    const bool mute_led = control_mute_led && mic_output_muted;
    if (
        !force
        && controller_mic_state_valid
        && controller_mic_state_volume_percent == volume_percent
        && controller_mic_state_muted == muted
        && controller_mic_state_control_mute_led == control_mute_led
        && controller_mic_state_mute_led == mute_led
    ) {
        return;
    }

    bt_set_microphone_state(volume_percent, muted, control_mute_led, mute_led);
    controller_mic_state_valid = true;
    controller_mic_state_volume_percent = volume_percent;
    controller_mic_state_muted = muted;
    controller_mic_state_control_mute_led = control_mute_led;
    controller_mic_state_mute_led = mute_led;
}

static void reset_controller_audio_report_counters() {
    packetCounter = 0;
}

static void schedule_host_route_primer() {
    if (speaker_route_active && speaker_route_headset == plug_headset) {
        host_route_primer_toggle_pending = false;
        return;
    }

    host_route_primer_toggle_pending = true;
    speaker_route_active = false;
    speaker_route_headset = false;
    audio_debug_packet_log_budget = max<uint8_t>(audio_debug_packet_log_budget, 6);
}

static bool prime_host_audio_route_if_needed() {
    if (!host_route_primer_toggle_pending || !controller_state_ready) {
        return false;
    }

    bt_rearm_speaker_output_route(plug_headset);
    speaker_route_active = true;
    speaker_route_headset = plug_headset;
    host_route_primer_toggle_pending = false;
    audio_debug_log(
        AudioDebugSpeakerRoute,
        1,
        clamp_debug_u8(static_cast<uint32_t>(volume[0] * 100.0f)),
        quiet_mode_enabled ? 1 : 0,
        plug_headset ? 1 : 0,
        2
    );
    return true;
}

void audio_set_state_data(uint8_t const *data, uint8_t len) {
    controller_output_state_apply_host_payload(data, len);
}

void audio_set_adaptive_trigger_state(
    uint8_t const *right_trigger,
    bool right_valid,
    uint8_t const *left_trigger,
    bool left_valid,
    uint8_t motor_power,
    bool motor_power_valid
) {
    controller_output_state_set_adaptive_trigger(
        right_trigger,
        right_valid,
        left_trigger,
        left_valid,
        motor_power,
        motor_power_valid
    );
}

void audio_set_lightbar_state(uint8_t red, uint8_t green, uint8_t blue, uint8_t brightness_percent) {
    controller_output_state_set_lightbar(red, green, blue, brightness_percent);
}

void set_headset(bool state) {
    const bool first_report_after_connect = !controller_state_ready;
    controller_state_ready = true;
    if (plug_headset == state) {
        if (first_report_after_connect) {
            schedule_host_route_primer();
        }
        return;
    }

    plug_headset = state;
    if (speaker_route_active && speaker_route_headset != plug_headset) {
        bt_rearm_speaker_output_route(plug_headset);
        speaker_route_headset = plug_headset;
        audio_debug_log(
            AudioDebugSpeakerRoute,
            1,
            clamp_debug_u8(static_cast<uint32_t>(volume[0] * 100.0f)),
            quiet_mode_enabled ? 1 : 0,
            plug_headset ? 1 : 0,
            1
        );
    }
    schedule_host_route_primer();
}

bool audio_controller_state_ready() {
    return controller_state_ready;
}

static bool time_reached(uint32_t now, uint32_t target) {
    return static_cast<int32_t>(now - target) >= 0;
}

static uint8_t clamp_debug_u8(uint32_t value) {
    return value > 255 ? 255 : static_cast<uint8_t>(value);
}

static uint16_t current_haptics_gain_percent() {
    const float gain = clamp(volume[1], 0.0f, MAX_HAPTICS_GAIN);
    return static_cast<uint16_t>(gain * 100.0f + 0.5f);
}

static uint8_t percent_debug_u8(uint32_t part, uint32_t total) {
    if (total == 0) {
        return 0;
    }
    const uint32_t percent = static_cast<uint32_t>(
        (static_cast<uint64_t>(part) * 100u + (total / 2u)) / total
    );
    return percent > 100 ? 100 : static_cast<uint8_t>(percent);
}

static uint8_t us_to_100us_debug_u8(uint32_t us) {
    return clamp_debug_u8((us + 50u) / 100u);
}

static bool mic_debug_should_log(uint8_t type, uint32_t min_interval_us) {
#if DS5_AUDIO_DEBUG_ENABLED
    static uint32_t last_log_us[16]{};
    const uint8_t index = type < count_of(last_log_us) ? type : static_cast<uint8_t>(count_of(last_log_us) - 1);
    const uint32_t now = time_us_32();
    if (last_log_us[index] == 0 || static_cast<uint32_t>(now - last_log_us[index]) >= min_interval_us) {
        last_log_us[index] = now;
        return true;
    }
#else
    (void)type;
    (void)min_interval_us;
#endif
    return false;
}

static void audio_loop_note_start(uint32_t now) {
    if (audio_loop_last_start_us != 0) {
        const uint32_t gap_us = static_cast<uint32_t>(now - audio_loop_last_start_us);
        if (gap_us > audio_loop_gap_max_us) {
            audio_loop_gap_max_us = gap_us;
        }
    }
    audio_loop_last_start_us = now;
}

static void audio_loop_note_finish(uint32_t start_us) {
    const uint32_t runtime_us = static_cast<uint32_t>(time_us_32() - start_us);
    if (runtime_us > audio_loop_runtime_max_us) {
        audio_loop_runtime_max_us = runtime_us;
    }
}

struct AudioLoopTelemetryScope {
    explicit AudioLoopTelemetryScope(uint32_t now) : start_us(now) {
        audio_loop_note_start(now);
    }

    ~AudioLoopTelemetryScope() {
        audio_loop_note_finish(start_us);
    }

    uint32_t start_us;
};

static uint32_t take_audio_loop_runtime_max_us() {
    const uint32_t value = audio_loop_runtime_max_us;
    audio_loop_runtime_max_us = 0;
    return value;
}

static uint32_t take_audio_loop_gap_max_us() {
    const uint32_t value = audio_loop_gap_max_us;
    audio_loop_gap_max_us = 0;
    return value;
}

static void write_debug_u16(uint8_t *data, uint16_t value) {
    data[0] = static_cast<uint8_t>(value & 0xFF);
    data[1] = static_cast<uint8_t>((value >> 8) & 0xFF);
}

static void write_debug_u32(uint8_t *data, uint32_t value) {
    data[0] = static_cast<uint8_t>(value & 0xFF);
    data[1] = static_cast<uint8_t>((value >> 8) & 0xFF);
    data[2] = static_cast<uint8_t>((value >> 16) & 0xFF);
    data[3] = static_cast<uint8_t>((value >> 24) & 0xFF);
}

static void audio_debug_update_max_u32(uint32_t &current, uint32_t candidate) {
    if (candidate > current) {
        current = candidate;
    }
}

static void audio_debug_increment_u32(uint32_t &value) {
    if (value != 0xffffffffu) {
        value++;
    }
}

static void audio_stats_note_usb_read(uint32_t now) {
#if DS5_AUDIO_TRANSPORT_STATS_ENABLED
    if (!audio_debug_cs_ready) {
        last_usb_audio_read_us = now;
        return;
    }
    if (last_usb_audio_read_us != 0) {
        const uint32_t gap_us = static_cast<uint32_t>(now - last_usb_audio_read_us);
        critical_section_enter_blocking(&audio_debug_cs);
        audio_debug_update_max_u32(audio_stats.usb_audio_gap_max_us, gap_us);
        if (gap_us > 1500) {
            audio_debug_increment_u32(audio_stats.usb_audio_gap_over_1500_count);
        }
        critical_section_exit(&audio_debug_cs);
    }
    last_usb_audio_read_us = now;
#else
    (void)now;
#endif
}

static void audio_stats_note_opus_encode(uint32_t encode_us) {
#if DS5_AUDIO_TRANSPORT_STATS_ENABLED
    if (!audio_debug_cs_ready) {
        return;
    }
    critical_section_enter_blocking(&audio_debug_cs);
    audio_debug_update_max_u32(audio_stats.opus_encode_max_us, encode_us);
    audio_debug_increment_u32(audio_stats.opus_encode_count);
    if (encode_us > OPUS_ENCODE_BUDGET_US) {
        audio_debug_increment_u32(audio_stats.opus_encode_over_budget_count);
    }
    critical_section_exit(&audio_debug_cs);
#else
    (void)encode_us;
#endif
}

static void audio_stats_note_generation_drop() {
#if DS5_AUDIO_TRANSPORT_STATS_ENABLED
    if (!audio_debug_cs_ready) {
        return;
    }
    critical_section_enter_blocking(&audio_debug_cs);
    audio_debug_increment_u32(audio_stats.audio_generation_drop_count);
    critical_section_exit(&audio_debug_cs);
#endif
}

#if DS5_AUDIO_DEBUG_ENABLED
static void audio_debug_log_impl(
    AudioDebugEventCode code,
    uint8_t arg0,
    uint8_t arg1,
    uint8_t arg2,
    uint8_t arg3,
    uint8_t arg4
) {
    if (!audio_debug_cs_ready) {
        return;
    }

    critical_section_enter_blocking(&audio_debug_cs);
    const uint32_t sequence = audio_debug_next_sequence++;
    audio_debug_ring[audio_debug_head] = {
        sequence,
        time_us_32(),
        static_cast<uint8_t>(code),
        arg0,
        arg1,
        arg2,
        arg3,
        arg4
    };
    audio_debug_head = static_cast<uint8_t>((audio_debug_head + 1) % AUDIO_DEBUG_RING_SIZE);
    if (audio_debug_count < AUDIO_DEBUG_RING_SIZE) {
        audio_debug_count++;
    } else {
        if (audio_debug_dropped_count != 0xffff) {
            audio_debug_dropped_count++;
        }
        const uint32_t oldest_sequence = audio_debug_next_sequence - audio_debug_count;
        if (audio_debug_read_sequence < oldest_sequence) {
            audio_debug_read_sequence = oldest_sequence;
        }
    }
    critical_section_exit(&audio_debug_cs);
}
#endif

static void audio_debug_reset_stats() {
#if DS5_AUDIO_TRANSPORT_STATS_ENABLED
    if (audio_debug_cs_ready) {
        critical_section_enter_blocking(&audio_debug_cs);
        memset(&audio_stats, 0, sizeof(audio_stats));
        critical_section_exit(&audio_debug_cs);
    } else {
        memset(&audio_stats, 0, sizeof(audio_stats));
    }
    last_usb_audio_read_us = 0;
#endif
}

void audio_debug_note_usb_event(
    uint8_t kind,
    uint32_t arg1,
    uint32_t arg2,
    uint32_t arg3,
    uint32_t arg4
) {
#if !DS5_AUDIO_DEBUG_ENABLED
    (void)kind;
    (void)arg1;
    (void)arg2;
    (void)arg3;
    (void)arg4;
    return;
#else
    audio_debug_log(
        AudioDebugUsbEvent,
        kind,
        clamp_debug_u8(arg1),
        clamp_debug_u8(arg2),
        clamp_debug_u8(arg3),
        clamp_debug_u8(arg4)
    );
#endif
}

void audio_debug_note_hid_event(
    uint8_t kind,
    uint32_t report_id,
    uint32_t report_type,
    uint32_t len,
    uint32_t first_byte
) {
#if !DS5_AUDIO_DEBUG_ENABLED
    (void)kind;
    (void)report_id;
    (void)report_type;
    (void)len;
    (void)first_byte;
    return;
#else
    if (kind == 2 && report_id == 0 && first_byte == 0x02) {
        const uint32_t now = time_us_32();
        if (last_hid_output_debug_us == 0 || static_cast<uint32_t>(now - last_hid_output_debug_us) > 250000) {
            hid_output_debug_burst_remaining = 8;
        }
        last_hid_output_debug_us = now;
        if (hid_output_debug_burst_remaining == 0) {
            return;
        }
        hid_output_debug_burst_remaining--;
    }

    audio_debug_log(
        AudioDebugHidEvent,
        kind,
        clamp_debug_u8(report_id),
        clamp_debug_u8(report_type),
        clamp_debug_u8(len),
        clamp_debug_u8(first_byte)
    );
#endif
}

void __not_in_flash_func(audio_debug_note_bt_event)(
    uint8_t kind,
    uint32_t arg1,
    uint32_t arg2,
    uint32_t arg3,
    uint32_t arg4
) {
#if !DS5_AUDIO_DEBUG_ENABLED
    (void)kind;
    (void)arg1;
    (void)arg2;
    (void)arg3;
    (void)arg4;
    return;
#else
    audio_debug_log(
        AudioDebugBtEvent,
        kind,
        clamp_debug_u8(arg1),
        clamp_debug_u8(arg2),
        clamp_debug_u8(arg3),
        clamp_debug_u8(arg4)
    );
#endif
}

static bool usb_audio_has_signal(int16_t const *raw, int frames) {
    for (int frame = 0; frame < frames; frame++) {
        for (int channel = 0; channel < INPUT_CHANNELS; channel++) {
            const int sample = raw[frame * INPUT_CHANNELS + channel];
            const int magnitude = sample < 0 ? -sample : sample;
            if (magnitude > USB_AUDIO_ACTIVE_THRESHOLD) {
                return true;
            }
        }
    }
    return false;
}

template <typename T, std::size_t Capacity>
static __force_inline void drain_queue(ExactAudioQueue<T, Capacity> *queue) {
    queue->clear();
}

static void audio_core1_stack_init_watermark() {
    std::fill(
        std::begin(audio_core1_stack_storage.guard),
        std::end(audio_core1_stack_storage.guard),
        AUDIO_CORE1_STACK_CANARY
    );
    std::fill(
        std::begin(audio_core1_stack_storage.stack),
        std::end(audio_core1_stack_storage.stack),
        AUDIO_CORE1_STACK_CANARY
    );
}

static void __no_inline_not_in_flash_func(audio_core1_stack_poll)(uint32_t now) {
    if (
        audio_core1_stack_last_guard_check_us != 0
        && static_cast<uint32_t>(now - audio_core1_stack_last_guard_check_us) < 1000000u
    ) {
        return;
    }
    audio_core1_stack_last_guard_check_us = now;

    for (uint32_t word : audio_core1_stack_storage.guard) {
        if (word != AUDIO_CORE1_STACK_CANARY) {
            panic("audio Core 1 stack overflow");
        }
    }

#if DS5_DEBUG_LOGS_ENABLED
    if (
        audio_core1_stack_last_watermark_check_us != 0
        && static_cast<uint32_t>(now - audio_core1_stack_last_watermark_check_us) < 10000000u
    ) {
        return;
    }
    audio_core1_stack_last_watermark_check_us = now;

    std::size_t unused_words = 0;
    while (
        unused_words < AUDIO_CORE1_STACK_WORDS
        && audio_core1_stack_storage.stack[unused_words] == AUDIO_CORE1_STACK_CANARY
    ) {
        unused_words++;
    }
    const uint32_t used_bytes = static_cast<uint32_t>(
        (AUDIO_CORE1_STACK_WORDS - unused_words) * sizeof(uint32_t)
    );
    if (used_bytes > audio_core1_stack_high_water_bytes) {
        audio_core1_stack_high_water_bytes = used_bytes;
        DS5_LOG(
            "[Audio] Core 1 stack high-water: %lu/%lu bytes (%lu free)\n",
            static_cast<unsigned long>(used_bytes),
            static_cast<unsigned long>(sizeof(audio_core1_stack_storage.stack)),
            static_cast<unsigned long>(sizeof(audio_core1_stack_storage.stack) - used_bytes)
        );
    }
#endif
}

static uint8_t opus_debug_level() {
    return speaker_opus_fifo_ready
        ? clamp_debug_u8(queue_get_level(&speaker_opus_fifo))
        : 0;
}

static bool speaker_opus_batch_ready() {
    return speaker_opus_fifo_ready
        && queue_get_level(&speaker_opus_fifo) >= AUDIO_BATCH_FRAMES;
}

static void clear_opus_buffer() {
    if (speaker_opus_fifo_ready) {
        speaker_opus_fifo.clear();
    }
}

static void clear_pending_audio_batch() {
    pending_audio_haptics_count = 0;
    pending_audio_include_speaker = false;
    memset(pending_audio_haptics, 0, sizeof(pending_audio_haptics));
}

static void drain_audio_queues() {
    uint32_t next_generation = audio_stream_generation + 1;
    if (next_generation == 0) {
        next_generation = 1;
    }
    audio_stream_generation = next_generation;
    drain_queue(&audio_fifo);
    clear_opus_buffer();
    clear_pending_audio_batch();
    bt_drain_audio_stream();
}

static void clear_mic_queues() {
    uint32_t next_generation = mic_stream_generation.load(std::memory_order_relaxed) + 1u;
    if (next_generation == 0) {
        next_generation = 1;
    }
    mic_stream_generation.store(next_generation, std::memory_order_release);
    drain_queue(&mic_fifo);
    drain_queue(&mic_decode_fifo);
    if (usb_mic_streaming_active()) {
        tud_audio_n_clear_ep_in_ff(0);
    }
    mic_usb_playout_started = false;
    mic_next_plc_us = 0;
    mic_decode_empty_since_us = 0;
    mic_usb_buffered_bytes = 0;
    mic_usb_fifo_threshold_configured = false;
}

static bool valid_audio_reactive_haptics_mode(uint8_t mode) {
    return mode == AudioReactiveHapticsMix || mode == AudioReactiveHapticsReplace;
}

static bool valid_audio_reactive_haptics_bass_focus(uint8_t focus) {
    return focus == AudioReactiveHapticsBassDeep
        || focus == AudioReactiveHapticsBassBalanced
        || focus == AudioReactiveHapticsBassPunchy
        || focus == AudioReactiveHapticsBassWide;
}

static bool valid_audio_reactive_haptics_response(uint8_t response) {
    return response == AudioReactiveHapticsResponseSubtle
        || response == AudioReactiveHapticsResponseBalanced
        || response == AudioReactiveHapticsResponseStrong;
}

static bool valid_audio_reactive_haptics_attack(uint8_t attack) {
    return attack == AudioReactiveHapticsAttackSoft
        || attack == AudioReactiveHapticsAttackBalanced
        || attack == AudioReactiveHapticsAttackFast
        || attack == AudioReactiveHapticsAttackSharp;
}

static bool valid_audio_reactive_haptics_release(uint8_t release) {
    return release == AudioReactiveHapticsReleaseTight
        || release == AudioReactiveHapticsReleaseBalanced
        || release == AudioReactiveHapticsReleaseSmooth
        || release == AudioReactiveHapticsReleaseLong;
}

void audio_reactive_haptics_reset() {
    audio_reactive_haptics_filter_l = 0.0f;
    audio_reactive_haptics_filter_r = 0.0f;
    audio_reactive_haptics_env_l = 0.0f;
    audio_reactive_haptics_env_r = 0.0f;
    audio_reactive_haptics_gate = 0.0f;
    audio_reactive_haptics_output_ramp = 0.0f;
}

static void refresh_audio_haptics_replace_policy() {
    controller_output_policy_set_audio_haptics_replace_requested(
        audio_reactive_haptics_suppress_classic_rumble
    );
    controller_output_policy_set_audio_haptics_replace_producer_active(
        audio_reactive_haptics_config_enabled
    );
}

bool audio_set_reactive_haptics_config(
    bool enabled,
    uint8_t mode,
    uint16_t gain_percent,
    uint8_t bass_focus,
    uint8_t response,
    uint8_t attack,
    uint8_t release,
    bool suppress_classic_rumble
) {
    if (
        !valid_audio_reactive_haptics_mode(mode)
        || !valid_audio_reactive_haptics_bass_focus(bass_focus)
        || !valid_audio_reactive_haptics_response(response)
        || !valid_audio_reactive_haptics_attack(attack)
        || !valid_audio_reactive_haptics_release(release)
        || gain_percent > AUDIO_REACTIVE_HAPTICS_MAX_GAIN_PERCENT
    ) {
        return false;
    }

    const bool changed = audio_reactive_haptics_config_enabled != enabled
        || audio_reactive_haptics_mode != mode
        || audio_reactive_haptics_gain_percent != gain_percent
        || audio_reactive_haptics_bass_focus != bass_focus
        || audio_reactive_haptics_response != response
        || audio_reactive_haptics_attack != attack
        || audio_reactive_haptics_release != release
        || audio_reactive_haptics_suppress_classic_rumble != suppress_classic_rumble;
    audio_reactive_haptics_config_enabled = enabled;
    audio_reactive_haptics_mode = mode;
    audio_reactive_haptics_gain_percent = gain_percent;
    audio_reactive_haptics_bass_focus = bass_focus;
    audio_reactive_haptics_response = response;
    audio_reactive_haptics_attack = attack;
    audio_reactive_haptics_release = release;
    audio_reactive_haptics_suppress_classic_rumble = suppress_classic_rumble;
    refresh_audio_haptics_replace_policy();
    if (changed) {
        audio_reactive_haptics_reset();
    }
    return true;
}

bool audio_reactive_haptics_enabled() {
    return audio_reactive_haptics_config_enabled;
}

static void clear_partial_audio_state() {
    audio_buf_pos = 0;
    audio_haptic_buf_pos = 0;
    audio_silence_tail_logged = false;
    audio_reactive_haptics_reset();
    memset(audio_buf, 0, sizeof(audio_buf));
    memset(audio_haptic_buf, 0, sizeof(audio_haptic_buf));
    clear_pending_audio_batch();
    resampler.Reset();
}

static void schedule_speaker_silence_preroll() {
    speaker_silence_preroll_packets_remaining = SPEAKER_SILENCE_PREROLL_USB_PACKETS;
    speaker_silence_preroll_last_packet_us = 0;
    audio_debug_packet_log_budget = max<uint8_t>(audio_debug_packet_log_budget, 4);
}

void audio_handle_controller_disconnect() {
    test_haptics_active = false;
    test_haptics_preroll_packets_remaining = 0;
    test_haptics_packets_remaining = 0;
    test_haptics_neutral_packets_remaining = 0;
    controller_output_state_reset_cached_triggers();
    controller_output_state_reset_cached_player_leds();
    controller_output_state_clear_classic_rumble();
    plug_headset = false;
    controller_state_ready = false;
    host_route_primer_toggle_pending = false;
    reset_controller_audio_report_counters();
    drain_audio_queues();
    clear_partial_audio_state();
    speaker_silence_preroll_packets_remaining = 0;
    speaker_silence_preroll_last_packet_us = 0;
    speaker_route_active = false;
    speaker_route_headset = false;
    last_audio_us = 0;
}

static bool should_keep_speaker_route_open() {
    return bt_is_controller_connected() && controller_state_ready && volume[0] > 0.0f;
}

static void update_persistent_speaker_route() {
    if (quiet_mode_enabled) {
        return;
    }

    if (should_keep_speaker_route_open()) {
        if (!speaker_route_active) {
            bt_set_speaker_output_enabled(true, plug_headset, true);
            speaker_route_active = true;
            speaker_route_headset = plug_headset;
            schedule_speaker_silence_preroll();
            audio_debug_log(
                AudioDebugSpeakerRoute,
                1,
                clamp_debug_u8(static_cast<uint32_t>(volume[0] * 100.0f)),
                quiet_mode_enabled ? 1 : 0,
                plug_headset ? 1 : 0,
                0
            );
        }
        return;
    }

    if (speaker_route_active) {
        bt_set_speaker_output_enabled(false);
        speaker_route_active = false;
        speaker_route_headset = false;
        audio_debug_log(
            AudioDebugSpeakerRoute,
            0,
            clamp_debug_u8(static_cast<uint32_t>(volume[0] * 100.0f)),
            quiet_mode_enabled ? 1 : 0,
            0,
            0
        );
    }
}

static bool __not_in_flash_func(try_send_pending_audio_batch)() {
    if (pending_audio_haptics_count < AUDIO_BATCH_FRAMES) {
        return false;
    }
    if (pending_audio_include_speaker && !speaker_opus_batch_ready()) {
        return false;
    }

    speaker_opus_element speaker_frames[AUDIO_BATCH_FRAMES]{};
    if (pending_audio_include_speaker) {
        for (uint8_t frame = 0; frame < AUDIO_BATCH_FRAMES; frame++) {
            if (!queue_try_remove(&speaker_opus_fifo, &speaker_frames[frame])) {
                clear_pending_audio_batch();
                return false;
            }
            if (speaker_frames[frame].generation != audio_stream_generation) {
                clear_pending_audio_batch();
                return false;
            }
        }
    }

    uint8_t pkt[REPORT_SIZE]{};
    pkt[0] = REPORT_ID;
    // The Bluetooth scheduler stamps the shared DualSense output sequence at
    // the actual-send boundary.
    pkt[1] = 0;
    pkt[2] = 0x11 | (1 << 7);
    pkt[3] = 6;
    const bool controller_mic_transport_enabled = mic_usb_output_active();
    pkt[4] = ds5::output::audio_section_enable_mask(controller_mic_transport_enabled);
    const uint8_t buffer_length = haptics_buffer_length;
    pkt[5] = buffer_length;
    pkt[6] = buffer_length;
    pkt[7] = buffer_length;
    pkt[8] = buffer_length;
    packetCounter = static_cast<uint8_t>(packetCounter + AUDIO_BATCH_FRAMES);
    pkt[9] = packetCounter;
    pkt[10] = 0x12 | (1 << 6) | (1 << 7);
    pkt[11] = SAMPLE_SIZE;
    memcpy(pkt + 12, pending_audio_haptics[0], SAMPLE_SIZE);
    memcpy(pkt + 12 + SAMPLE_SIZE, pending_audio_haptics[1], SAMPLE_SIZE);

    const bool speaker_payload_included = pending_audio_include_speaker;
    if (speaker_payload_included) {
        const bool force_route = !speaker_route_active || speaker_route_headset != plug_headset;
        if (force_route) {
            bt_set_speaker_output_enabled(true, plug_headset, true);
        }
        speaker_route_active = true;
        speaker_route_headset = plug_headset;
        pkt[140] = (plug_headset ? 0x16 : 0x13) | (1 << 6) | (1 << 7);
        pkt[141] = SPEAKER_OPUS_SIZE;
        memcpy(pkt + 142, speaker_frames[0].data, SPEAKER_OPUS_SIZE);
        memcpy(pkt + 142 + SPEAKER_OPUS_SIZE, speaker_frames[1].data, SPEAKER_OPUS_SIZE);
        if (audio_debug_packet_log_budget != 0) {
            const uint8_t speaker_flags = plug_headset ? 0x01 : 0x00;
            audio_debug_packet_log_budget--;
            audio_debug_log(
                AudioDebugSendSpeakerPacket,
                clamp_debug_u8(queue_get_level(&audio_fifo)),
                opus_debug_level(),
                pkt[9],
                controller_mic_transport_enabled ? 1 : 0,
                speaker_flags
            );
        }
    }
#ifdef ENABLE_COMPANION
    for (uint8_t frame = 0; frame < AUDIO_BATCH_FRAMES; frame++) {
        companion_note_feedback_trace_samples(
            CompanionFeedbackTraceLocalAudio,
            reinterpret_cast<uint8_t const *>(pending_audio_haptics[frame]),
            SAMPLE_SIZE,
            speaker_payload_included ? 1 : 0,
            clamp_debug_u8(queue_get_level(&audio_fifo)),
            opus_debug_level(),
            clamp_debug_u8(static_cast<uint32_t>(volume[1] * 100.0f))
        );
    }
#endif

    clear_pending_audio_batch();
    return bt_write_audio_stream(pkt, sizeof(pkt));
}

static bool __not_in_flash_func(send_audio_haptics_packet)(
    const int8_t *haptic_buf,
    bool include_speaker,
    bool merge_test_overlay = true
) {
    bool sent = try_send_pending_audio_batch();
    if (
        pending_audio_haptics_count != 0
        && pending_audio_include_speaker != include_speaker
    ) {
        clear_pending_audio_batch();
    }

    if (pending_audio_haptics_count == AUDIO_BATCH_FRAMES) {
        memmove(
            pending_audio_haptics[0],
            pending_audio_haptics[1],
            SAMPLE_SIZE
        );
        pending_audio_haptics_count = AUDIO_BATCH_FRAMES - 1;
    }
    int8_t *pending = pending_audio_haptics[pending_audio_haptics_count];
    if (haptic_buf != nullptr) {
        memcpy(pending, haptic_buf, SAMPLE_SIZE);
    } else {
        memset(pending, 0, SAMPLE_SIZE);
    }
    if (merge_test_overlay && test_haptics_active) {
        (void)merge_test_haptics_overlay(pending, include_speaker);
    }
    pending_audio_include_speaker = include_speaker;
    pending_audio_haptics_count++;
    return try_send_pending_audio_batch() || sent;
}

static void bridge_audio_reset_reassembly() {
    bridge_audio_next_fragment = 0;
    bridge_audio_expected_fragments = 0;
    bridge_audio_receiving = false;
}

static void process_bridge_audio_frame(uint8_t const *frame) {
    if (frame == nullptr || quiet_mode_enabled || !bt_is_controller_connected()) {
        return;
    }

    int8_t haptic_buf[SAMPLE_SIZE]{};
    memcpy(haptic_buf, frame, SAMPLE_SIZE);
    if (send_audio_haptics_packet(haptic_buf, speaker_route_active, false)) {
        last_audio_us = time_us_32();
    }
}

void audio_handle_bridge_audio_report(uint8_t const *report, uint16_t len) {
    if (
        report == nullptr
        || len < 7
        || report[0] != BRIDGE_AUDIO_STREAM_REPORT_ID
        || report[1] != BRIDGE_AUDIO_FAST_FRAME_FRAGMENT_TYPE
    ) {
        return;
    }

    const uint16_t sequence = static_cast<uint16_t>(report[2] | (report[3] << 8));
    const uint8_t fragment = report[4];
    const uint8_t fragment_count = report[5];
    const uint8_t payload_len = report[6];
    if (
        fragment_count == 0
        || fragment_count > BRIDGE_AUDIO_MAX_FRAGMENTS
        || fragment >= fragment_count
        || payload_len > BRIDGE_AUDIO_FAST_PAYLOAD_BYTES
        || len < static_cast<uint16_t>(7 + payload_len)
    ) {
        bridge_audio_reset_reassembly();
        return;
    }

    const uint16_t offset = static_cast<uint16_t>(fragment * BRIDGE_AUDIO_FAST_PAYLOAD_BYTES);
    if (offset + payload_len > BRIDGE_AUDIO_COMPACT_FRAME_BYTES) {
        bridge_audio_reset_reassembly();
        return;
    }

    if (fragment == 0) {
        bridge_audio_sequence = sequence;
        bridge_audio_expected_fragments = fragment_count;
        bridge_audio_next_fragment = 0;
        bridge_audio_receiving = true;
    } else if (
        !bridge_audio_receiving
        || sequence != bridge_audio_sequence
        || fragment_count != bridge_audio_expected_fragments
        || fragment != bridge_audio_next_fragment
    ) {
        bridge_audio_reset_reassembly();
        return;
    }

    memcpy(bridge_audio_frame + offset, report + 7, payload_len);
    bridge_audio_next_fragment++;

    if (bridge_audio_next_fragment != bridge_audio_expected_fragments) {
        return;
    }

    if (offset + payload_len == BRIDGE_AUDIO_COMPACT_FRAME_BYTES) {
        process_bridge_audio_frame(bridge_audio_frame);
    }
    bridge_audio_reset_reassembly();
}

static float audio_reactive_haptics_filter_coeff() {
    switch (audio_reactive_haptics_bass_focus) {
        case AudioReactiveHapticsBassDeep:
            return 0.01039f;
        case AudioReactiveHapticsBassPunchy:
            return 0.03095f;
        case AudioReactiveHapticsBassWide:
            return 0.05123f;
        case AudioReactiveHapticsBassBalanced:
        default:
            return 0.02074f;
    }
}

static float audio_reactive_haptics_focus_gain() {
    switch (audio_reactive_haptics_bass_focus) {
        case AudioReactiveHapticsBassDeep:
            return 1.35f;
        case AudioReactiveHapticsBassPunchy:
            return 1.12f;
        case AudioReactiveHapticsBassWide:
            return 0.92f;
        case AudioReactiveHapticsBassBalanced:
        default:
            return 1.0f;
    }
}

static float audio_reactive_haptics_response_gain() {
    switch (audio_reactive_haptics_response) {
        case AudioReactiveHapticsResponseSubtle:
            return 0.68f;
        case AudioReactiveHapticsResponseStrong:
            return 1.0f;
        case AudioReactiveHapticsResponseBalanced:
        default:
            return 1.0f;
    }
}

static float audio_reactive_haptics_response_punch() {
    switch (audio_reactive_haptics_response) {
        case AudioReactiveHapticsResponseSubtle:
            return 0.0f;
        case AudioReactiveHapticsResponseStrong:
            return 3.0f;
        case AudioReactiveHapticsResponseBalanced:
        default:
            return 1.5f;
    }
}

static float audio_reactive_haptics_envelope_punch(float envelope) {
    const float normalized = clamp(envelope / 32768.0f, 0.0f, 1.0f);
    return 1.0f + (audio_reactive_haptics_response_punch() * normalized);
}

static float abs_float(float value) {
    return value < 0.0f ? -value : value;
}

static float audio_reactive_haptics_attack_coeff() {
    switch (audio_reactive_haptics_attack) {
        case AudioReactiveHapticsAttackSoft:
            return 0.20f;
        case AudioReactiveHapticsAttackFast:
            return 0.65f;
        case AudioReactiveHapticsAttackSharp:
            return 0.90f;
        case AudioReactiveHapticsAttackBalanced:
        default:
            return AUDIO_REACTIVE_HAPTICS_ENVELOPE_ATTACK;
    }
}

static float audio_reactive_haptics_release_coeff() {
    switch (audio_reactive_haptics_release) {
        case AudioReactiveHapticsReleaseTight:
            return 0.055f;
        case AudioReactiveHapticsReleaseSmooth:
            return 0.012f;
        case AudioReactiveHapticsReleaseLong:
            return 0.006f;
        case AudioReactiveHapticsReleaseBalanced:
        default:
            return AUDIO_REACTIVE_HAPTICS_ENVELOPE_RELEASE;
    }
}

static float follow_envelope(float current, float value) {
    const float target = abs_float(value);
    const float rate = target > current
        ? audio_reactive_haptics_attack_coeff()
        : audio_reactive_haptics_release_coeff();
    return current + ((target - current) * rate);
}

static float soft_clip_unit(float value) {
    const float x = clamp(value, -4.0f, 4.0f);
    const float x2 = x * x;
    return clamp((x * (27.0f + x2)) / (27.0f + (9.0f * x2)), -1.0f, 1.0f);
}

static int16_t soft_clip_i16_from_float(float value) {
    const float normalized = value / 32768.0f;
    const float clipped = soft_clip_unit(normalized);
    return static_cast<int16_t>(
        clamp(
            static_cast<int32_t>(clipped * 32767.0f),
            static_cast<int32_t>(-32768),
            static_cast<int32_t>(32767)
        )
    );
}

static int16_t mix_i16(int16_t native_sample, int16_t derived_sample) {
    return soft_clip_i16_from_float(static_cast<float>(native_sample) + static_cast<float>(derived_sample));
}

static void process_audio_reactive_haptic_frame(
    int16_t speaker_l,
    int16_t speaker_r,
    int16_t native_haptic_l,
    int16_t native_haptic_r,
    int16_t &out_l,
    int16_t &out_r
) {
    if (!audio_reactive_haptics_config_enabled || quiet_mode_enabled) {
        out_l = native_haptic_l;
        out_r = native_haptic_r;
        return;
    }

    const float coeff = audio_reactive_haptics_filter_coeff();
    audio_reactive_haptics_filter_l += (static_cast<float>(speaker_l) - audio_reactive_haptics_filter_l) * coeff;
    audio_reactive_haptics_filter_r += (static_cast<float>(speaker_r) - audio_reactive_haptics_filter_r) * coeff;
    audio_reactive_haptics_env_l = follow_envelope(audio_reactive_haptics_env_l, audio_reactive_haptics_filter_l);
    audio_reactive_haptics_env_r = follow_envelope(audio_reactive_haptics_env_r, audio_reactive_haptics_filter_r);

    const float peak = max(audio_reactive_haptics_env_l, audio_reactive_haptics_env_r);
    const float gate_target = peak > AUDIO_REACTIVE_HAPTICS_GATE_THRESHOLD ? 1.0f : 0.0f;
    const float gate_rate = gate_target > audio_reactive_haptics_gate
        ? AUDIO_REACTIVE_HAPTICS_GATE_OPEN_RATE
        : AUDIO_REACTIVE_HAPTICS_GATE_CLOSE_RATE;
    audio_reactive_haptics_gate += (gate_target - audio_reactive_haptics_gate) * gate_rate;
    audio_reactive_haptics_output_ramp = std::min(
        1.0f,
        audio_reactive_haptics_output_ramp + AUDIO_REACTIVE_HAPTICS_OUTPUT_RAMP_STEP
    );

    const float gain = (static_cast<float>(audio_reactive_haptics_gain_percent) / 100.0f)
        * audio_reactive_haptics_focus_gain()
        * audio_reactive_haptics_response_gain()
        * audio_reactive_haptics_gate
        * audio_reactive_haptics_output_ramp;
    const int16_t derived_l = soft_clip_i16_from_float(
        audio_reactive_haptics_filter_l
        * gain
        * audio_reactive_haptics_envelope_punch(audio_reactive_haptics_env_l)
    );
    const int16_t derived_r = soft_clip_i16_from_float(
        audio_reactive_haptics_filter_r
        * gain
        * audio_reactive_haptics_envelope_punch(audio_reactive_haptics_env_r)
    );
    if (audio_reactive_haptics_mode == AudioReactiveHapticsReplace) {
        out_l = derived_l;
        out_r = derived_r;
        return;
    }

    out_l = mix_i16(native_haptic_l, derived_l);
    out_r = mix_i16(native_haptic_r, derived_r);
}

static int8_t quantize_haptic_sample(float sample, float gain) {
    const float clamped_gain = clamp(gain, 0.0f, MAX_HAPTICS_GAIN);
    const float scaled = sample * 127.0f * clamped_gain;
    return static_cast<int8_t>(clamp(static_cast<int>(scaled), -128, 127));
}

static bool append_resampled_haptic_sample(float left, float right, float gain) {
    audio_haptic_buf[audio_haptic_buf_pos++] = quantize_haptic_sample(left, gain);
    audio_haptic_buf[audio_haptic_buf_pos++] = quantize_haptic_sample(right, gain);
    if (audio_haptic_buf_pos < SAMPLE_SIZE) {
        return false;
    }

    audio_haptic_buf_pos = 0;
    return true;
}

static void process_audio_reactive_haptic_frame_for_resampler(
    int16_t speaker_l,
    int16_t speaker_r,
    int16_t native_haptic_l,
    int16_t native_haptic_r,
    WDL_ResampleSample &out_l,
    WDL_ResampleSample &out_r
) {
    int16_t processed_l = native_haptic_l;
    int16_t processed_r = native_haptic_r;
    process_audio_reactive_haptic_frame(
        speaker_l,
        speaker_r,
        native_haptic_l,
        native_haptic_r,
        processed_l,
        processed_r
    );
    out_l = static_cast<WDL_ResampleSample>(processed_l) / 32768.0f;
    out_r = static_cast<WDL_ResampleSample>(processed_r) / 32768.0f;
}

static void mix_haptics_overlay(int8_t *destination, int8_t const *overlay) {
    if (destination == nullptr || overlay == nullptr) {
        return;
    }
    for (uint16_t index = 0; index < SAMPLE_SIZE; index++) {
        destination[index] = static_cast<int8_t>(
            clamp(static_cast<int>(destination[index]) + static_cast<int>(overlay[index]), -128, 127)
        );
    }
}

static bool merge_test_haptics_overlay(int8_t *destination, bool carrier_paced) {
    if (!test_haptics_active) {
        return false;
    }
    if (!bt_is_controller_connected()) {
        test_haptics_active = false;
        test_haptics_preroll_packets_remaining = 0;
        test_haptics_packets_remaining = 0;
        test_haptics_neutral_packets_remaining = 0;
        test_haptics_cooldown_until_us = 0;
        audio_debug_log(AudioDebugTestHapticsStop, 0, 0, 0, 0, 0);
        return false;
    }

    const uint32_t now = time_us_32();
    if (!haptics_test_signal_packet_due(
            now,
            test_haptics_last_packet_us,
            TEST_HAPTICS_PACKET_INTERVAL_US,
            carrier_paced
        )) {
        return false;
    }

    int8_t overlay[SAMPLE_SIZE]{};
    const bool sent_preroll_packet = test_haptics_preroll_packets_remaining != 0;
    if (sent_preroll_packet) {
        test_haptics_preroll_packets_remaining--;
    } else if (test_haptics_packets_remaining != 0) {
        const uint8_t packet_index = static_cast<uint8_t>(TEST_HAPTICS_PACKET_COUNT - test_haptics_packets_remaining);
        haptics_test_signal_fill(
            overlay,
            SAMPLE_SIZE,
            packet_index,
            TEST_HAPTICS_PACKET_COUNT,
            TEST_HAPTICS_BASE_AMPLITUDE,
            current_haptics_gain_percent()
        );
    }

    mix_haptics_overlay(destination, overlay);
    test_haptics_last_packet_us = now;
    if (sent_preroll_packet) {
        return true;
    }

    if (test_haptics_packets_remaining != 0) {
        test_haptics_packets_remaining--;
        if (test_haptics_packets_remaining == 0) {
            test_haptics_neutral_packets_remaining = TEST_HAPTICS_NEUTRAL_PACKET_COUNT;
        }
    } else if (test_haptics_neutral_packets_remaining != 0) {
        test_haptics_neutral_packets_remaining--;
    }

    if (test_haptics_packets_remaining == 0 && test_haptics_neutral_packets_remaining == 0) {
        test_haptics_active = false;
        test_haptics_cooldown_until_us = now + TEST_HAPTICS_COOLDOWN_US;
        audio_debug_log(
            AudioDebugTestHapticsStop,
            1,
            clamp_debug_u8(queue_get_level(&audio_fifo)),
            opus_debug_level(),
            0,
            0
        );
    }
    return true;
}

bool audio_schedule_test_haptics() {
    const uint32_t now = time_us_32();
    const bool haptics_cooling_down = test_haptics_cooldown_until_us != 0
        && !time_reached(now, test_haptics_cooldown_until_us);
    if (
        quiet_mode_enabled
        || test_haptics_active
        || haptics_cooling_down
    ) {
        return false;
    }
    test_haptics_cooldown_until_us = 0;

    const bool audio_carrier_active = audio_silence_tail_active(now);
    const bool keep_speaker_route = should_keep_speaker_route_open();
    if (!audio_carrier_active) {
        drain_audio_queues();
        clear_partial_audio_state();
        if (!keep_speaker_route) {
            bt_set_speaker_output_enabled(false);
            speaker_route_active = false;
            speaker_route_headset = false;
        }
        last_audio_us = 0;
    }
    test_haptics_active = true;
    test_haptics_preroll_packets_remaining = TEST_HAPTICS_PREROLL_PACKET_COUNT;
    test_haptics_packets_remaining = TEST_HAPTICS_PACKET_COUNT;
    test_haptics_neutral_packets_remaining = 0;
    test_haptics_last_packet_us = 0;
    audio_debug_log(
        AudioDebugTestHapticsStart,
        clamp_debug_u8(queue_get_level(&audio_fifo)),
        opus_debug_level(),
        clamp_debug_u8(static_cast<uint32_t>(volume[1] * 100.0f)),
        0,
        0
    );
    return true;
}

bool audio_test_haptics_busy() {
    return test_haptics_active;
}

bool audio_test_haptics_cooldown() {
    if (!bt_is_controller_connected()) {
        return false;
    }
    if (test_haptics_cooldown_until_us == 0) {
        return false;
    }
    if (time_reached(time_us_32(), test_haptics_cooldown_until_us)) {
        test_haptics_cooldown_until_us = 0;
        return false;
    }
    return true;
}

static bool audio_silence_tail_active(uint32_t now) {
    return last_audio_us != 0 && static_cast<uint32_t>(now - last_audio_us) < SPEAKER_USB_SILENCE_TAIL_US;
}

bool __not_in_flash_func(audio_recent)() {
    return audio_silence_tail_active(time_us_32());
}

bool audio_haptics_ready() {
    return audio_initialized;
}

void audio_set_quiet_mode(bool enabled) {
    if (quiet_mode_enabled == enabled) {
        return;
    }

    quiet_mode_enabled = enabled;
    refresh_controller_mic_transport_state(true);
    if (!enabled) {
        return;
    }

    test_haptics_active = false;
    test_haptics_preroll_packets_remaining = 0;
    test_haptics_packets_remaining = 0;
    test_haptics_neutral_packets_remaining = 0;
    drain_audio_queues();
    clear_partial_audio_state();
    bt_set_speaker_output_enabled(false);
    speaker_route_active = false;
    speaker_route_headset = false;
    last_audio_us = 0;
    audio_debug_log(
        AudioDebugQuietMode,
        enabled ? 1 : 0,
        clamp_debug_u8(queue_get_level(&audio_fifo)),
        opus_debug_level(),
        0,
        0
    );
}

bool audio_quiet_mode_enabled() {
    return quiet_mode_enabled;
}

void audio_set_duplex_requested(bool enabled) {
    const bool changed = duplex_requested != enabled;
    duplex_requested = enabled;
    if (changed && !enabled) {
        clear_mic_queues();
    }
    refresh_controller_mic_transport_state(true);
}

bool audio_duplex_active() {
    return host_mic_stream_active();
}

void audio_set_mic_output_state(uint8_t volume_percent, bool muted) {
    const bool was_muted = mic_output_muted;
    mic_output_volume_percent = volume_percent > 100 ? 100 : volume_percent;
    mic_output_muted = muted;
    if (muted && !was_muted) {
        clear_mic_queues();
    }
    refresh_controller_mic_transport_state(true);
}

void audio_set_mic_mute_led_passthrough(bool enabled) {
    if (mic_mute_led_passthrough == enabled) {
        return;
    }
    mic_mute_led_passthrough = enabled;
    refresh_controller_mic_transport_state(true);
}

void audio_get_status(audio_status *status) {
    if (status == nullptr) {
        return;
    }

    memset(status, 0, sizeof(*status));
    status->duplex_requested = duplex_requested;
    status->duplex_active = audio_duplex_active();
    status->controller_state_ready = controller_state_ready;
    status->headset_plugged = plug_headset;
    status->headset_audio_route = speaker_route_active && speaker_route_headset;
    status->mic_packets_received = mic_packets_received;
    status->mic_packets_dropped = mic_packets_dropped;
    status->mic_decode_success = mic_decode_success;
    status->mic_decode_fail = mic_decode_fail;
    status->mic_usb_write_success = mic_usb_write_success;
    status->mic_usb_write_short = mic_usb_write_short;
    status->mic_usb_conceal_count = mic_usb_conceal_count;
    status->mic_plc_count = mic_plc_count;
    status->mic_last_decoded_samples = mic_last_decoded_samples;
    status->mic_last_written_bytes = mic_last_written_bytes;
    status->mic_peak_permille = mic_peak_permille;
    status->mic_usb_streaming = usb_mic_streaming_active();
}

void audio_set_haptics_buffer_length(uint8_t length) {
    haptics_buffer_length = clamp<uint8_t>(length, MIN_HAPTICS_BUFFER_LENGTH, MAX_HAPTICS_BUFFER_LENGTH);
}

uint8_t audio_haptics_buffer_length() {
    return haptics_buffer_length;
}

void audio_debug_copy_report_payload(uint8_t *buffer, uint8_t max_len) {
    if (buffer == nullptr || max_len < AUDIO_DEBUG_REPORT_HEADER_SIZE) {
        return;
    }

    memset(buffer, 0, max_len);
    buffer[1] = AUDIO_DEBUG_RECORD_SIZE;

#if DS5_AUDIO_DEBUG_ENABLED
    if (!audio_debug_cs_ready) {
        return;
    }

    critical_section_enter_blocking(&audio_debug_cs);

    const uint32_t latest_sequence = audio_debug_next_sequence > 1 ? audio_debug_next_sequence - 1 : 0;
    write_debug_u32(buffer + 2, latest_sequence);
    write_debug_u16(buffer + 6, audio_debug_dropped_count);

    const uint8_t max_records = static_cast<uint8_t>((max_len - AUDIO_DEBUG_REPORT_HEADER_SIZE) / AUDIO_DEBUG_RECORD_SIZE);
    const uint32_t oldest_sequence = audio_debug_next_sequence - audio_debug_count;
    if (audio_debug_read_sequence < oldest_sequence) {
        audio_debug_read_sequence = oldest_sequence;
    }

    const uint32_t available_records = audio_debug_next_sequence > audio_debug_read_sequence
        ? audio_debug_next_sequence - audio_debug_read_sequence
        : 0;
    const uint8_t record_count = static_cast<uint8_t>(std::min<uint32_t>(available_records, max_records));
    buffer[0] = record_count;

    const uint8_t oldest_index = static_cast<uint8_t>(
        (audio_debug_head + AUDIO_DEBUG_RING_SIZE - audio_debug_count) % AUDIO_DEBUG_RING_SIZE
    );
    for (uint8_t i = 0; i < record_count; i++) {
        const uint32_t sequence = audio_debug_read_sequence + i;
        const uint8_t ring_index = static_cast<uint8_t>(
            (oldest_index + (sequence - oldest_sequence)) % AUDIO_DEBUG_RING_SIZE
        );
        const audio_debug_event &event = audio_debug_ring[ring_index];
        uint8_t *record = buffer + AUDIO_DEBUG_REPORT_HEADER_SIZE + (i * AUDIO_DEBUG_RECORD_SIZE);
        write_debug_u32(record, event.sequence);
        write_debug_u32(record + 4, event.timestamp_us);
        record[8] = event.code;
        record[9] = event.arg0;
        record[10] = event.arg1;
        record[11] = event.arg2;
        record[12] = event.arg3;
        record[13] = event.arg4;
    }
    audio_debug_read_sequence += record_count;

    critical_section_exit(&audio_debug_cs);
#endif
}

void audio_debug_get_stats(audio_debug_stats *stats) {
    if (stats == nullptr) {
        return;
    }
    memset(stats, 0, sizeof(*stats));
#if DS5_AUDIO_TRANSPORT_STATS_ENABLED
    if (!audio_debug_cs_ready) {
        return;
    }
    critical_section_enter_blocking(&audio_debug_cs);
    *stats = audio_stats;
    critical_section_exit(&audio_debug_cs);
#endif
}

void audio_test_haptics_loop() {
    if (quiet_mode_enabled) {
        return;
    }

    if (!test_haptics_active) {
        return;
    }

    int8_t haptic_buf[SAMPLE_SIZE]{};
    if (merge_test_haptics_overlay(haptic_buf, false)) {
        send_audio_haptics_packet(haptic_buf, speaker_route_active, false);
    }
}

static bool __not_in_flash_func(process_usb_audio_packet)() {
    const uint32_t now = time_us_32();
    if (!tud_audio_available()) {
        return false;
    }

    int16_t raw[192];
    uint32_t bytes_read = tud_audio_read(raw, sizeof(raw)); // Reads 384 bytes at a time.
    int frames = bytes_read / (INPUT_CHANNELS * sizeof(int16_t));
    if (frames == 0) {
        return false;
    }
    audio_stats_note_usb_read(now);
    if (last_audio_us == 0) {
        audio_debug_packet_log_budget = 4;
        audio_debug_log(
            AudioDebugAudioStart,
            clamp_debug_u8(queue_get_level(&audio_fifo)),
            opus_debug_level(),
            clamp_debug_u8(static_cast<uint32_t>(frames)),
            packetCounter,
            pending_audio_haptics_count
        );
    }
    speaker_silence_preroll_packets_remaining = 0;
    audio_silence_tail_logged = false;
    last_audio_us = now;

    WDL_ResampleSample *in_buf;
    const int requested_haptic_frames = resampler.ResamplePrepare(frames, OUTPUT_CHANNELS, &in_buf);
    const int haptic_input_frames = std::min(frames, requested_haptic_frames);
    const float speaker_gain = usb_host_mute[0] ? 0.0f : clamp(volume[0], 0.0f, 1.0f);
    const float haptic_gain = clamp(volume[1], 0.0f, MAX_HAPTICS_GAIN);
    // Windows sends USB Audio volume controls for this endpoint instead of pre-scaling PCM.
    const float host_render_gain = clamp(usb_host_speaker_gain, 0.0f, 1.0f);
    for (int i = 0; i < frames; i++) {
        const auto rendered = ds5::usb_audio::apply_host_speaker_gain(
            {
                .speaker_left = raw[i * INPUT_CHANNELS],
                .speaker_right = raw[i * INPUT_CHANNELS + 1],
                .haptic_left = raw[i * INPUT_CHANNELS + 2],
                .haptic_right = raw[i * INPUT_CHANNELS + 3],
            },
            host_render_gain
        );
        const int16_t speaker_l = rendered.speaker_left;
        const int16_t speaker_r = rendered.speaker_right;
        const int16_t haptic_l = rendered.haptic_left;
        const int16_t haptic_r = rendered.haptic_right;
        audio_buf[audio_buf_pos++] = static_cast<float>(speaker_l) / 32768.0f * speaker_gain;
        audio_buf[audio_buf_pos++] = static_cast<float>(speaker_r) / 32768.0f * speaker_gain;
        if (audio_buf_pos == 512 * 2) {
            static audio_raw_element element{};
            memcpy(element.data,audio_buf,512 * 2 * 4);
            element.generation = audio_stream_generation;
            if (queue_is_full(&audio_fifo)){
                audio_debug_log(
                    AudioDebugAudioFifoDrop,
                    clamp_debug_u8(queue_get_level(&audio_fifo)),
                    opus_debug_level(),
                    packetCounter,
                    pending_audio_haptics_count,
                    0
                );
                audio_fifo.try_remove(nullptr);
            }
            if (!queue_try_add(&audio_fifo,&element)) {
                audio_debug_log(
                    AudioDebugAudioFifoAddFail,
                    clamp_debug_u8(queue_get_level(&audio_fifo)),
                    opus_debug_level(),
                    packetCounter,
                    pending_audio_haptics_count,
                    0
                );
            }
            audio_buf_pos = 0;
        }

        if (i < haptic_input_frames) {
            process_audio_reactive_haptic_frame_for_resampler(
                speaker_l,
                speaker_r,
                haptic_l,
                haptic_r,
                in_buf[i * OUTPUT_CHANNELS],
                in_buf[i * OUTPUT_CHANNELS + 1]
            );
        }
    }

    static WDL_ResampleSample out_buf[SAMPLE_SIZE];
    const int out_frames = resampler.ResampleOut(out_buf, haptic_input_frames, SAMPLE_SIZE / OUTPUT_CHANNELS, OUTPUT_CHANNELS);
    for (int i = 0; i < out_frames; i++) {
        if (append_resampled_haptic_sample(out_buf[i * OUTPUT_CHANNELS], out_buf[i * OUTPUT_CHANNELS + 1], haptic_gain)) {
            send_audio_haptics_packet(audio_haptic_buf, true);
        }
    }
    return true;
}

static void discard_usb_audio_packets(uint8_t max_reads) {
    int16_t discard[192];
    uint8_t reads = 0;
    for (uint8_t i = 0; i < max_reads && tud_audio_available(); i++) {
        tud_audio_read(discard, sizeof(discard));
        reads++;
    }
    if (reads == 0) {
        return;
    }

#if !DS5_AUDIO_DEBUG_ENABLED
    return;
#else
    const uint32_t now = time_us_32();
    if (last_usb_discard_debug_us == 0 || static_cast<uint32_t>(now - last_usb_discard_debug_us) > 100000) {
        last_usb_discard_debug_us = now;
        audio_debug_note_usb_event(
            4,
            reads,
            max_reads,
            0,
            tud_audio_available() ? 1 : 0
        );
    }
#endif
}

static void queue_silent_speaker_block() {
    static audio_raw_element element{};
    memset(&element, 0, sizeof(element));
    element.generation = audio_stream_generation;
    if (queue_is_full(&audio_fifo)) {
        audio_fifo.try_remove(nullptr);
    }
    (void)queue_try_add(&audio_fifo, &element);
}

static void process_idle_speaker_silence_preroll(uint32_t now) {
    if (
        speaker_silence_preroll_packets_remaining == 0
        || !speaker_route_active
        || quiet_mode_enabled
        || tud_audio_available()
    ) {
        return;
    }
    if (
        speaker_silence_preroll_last_packet_us != 0
        && !time_reached(now, speaker_silence_preroll_last_packet_us + SPEAKER_SILENCE_PREROLL_INTERVAL_US)
    ) {
        return;
    }

    queue_silent_speaker_block();
    speaker_silence_preroll_last_packet_us = now;

    int8_t haptic_buf[SAMPLE_SIZE]{};
    if (!send_audio_haptics_packet(haptic_buf, true)) {
        return;
    }

    speaker_silence_preroll_packets_remaining--;
    last_audio_us = now;
}

static bool write_mic_usb_concealment_chunk(tu_fifo_t *ep_in_fifo) {
    const uint16_t packet_bytes = host_mic_usb_packet_bytes();
    if (ep_in_fifo != nullptr) {
        if (tu_fifo_count(ep_in_fifo) >= packet_bytes) {
            return false;
        }
        if (tu_fifo_remaining(ep_in_fifo) < packet_bytes) {
            return false;
        }
    }

    alignas(2) uint8_t chunk[HOST_MIC_USB_PACKET_BYTES_MAX]{};
    const uint16_t written = tud_audio_n_write(0, chunk, packet_bytes);
    mic_last_written_bytes = written;
    if (written != packet_bytes) {
        mic_usb_write_short++;
        audio_debug_log(
            AudioDebugMicPacket,
            12,
            clamp_debug_u8(written),
            clamp_debug_u8(packet_bytes),
            clamp_debug_u8(mic_usb_write_short),
            0
        );
        return false;
    }

    mic_usb_write_success++;
    const uint32_t conceal_count = ++mic_usb_conceal_count;
    if (mic_debug_should_log(11, 250000)) {
        audio_debug_log(
            AudioDebugMicPacket,
            11,
            clamp_debug_u8(ep_in_fifo != nullptr ? tu_fifo_count(ep_in_fifo) : 0),
            clamp_debug_u8(queue_get_level(&mic_decode_fifo)),
            clamp_debug_u8(queue_get_level(&mic_fifo)),
            clamp_debug_u8(conceal_count)
        );
    }
    return true;
}

static void configure_mic_usb_fifo_threshold(tu_fifo_t *ep_in_fifo) {
    if (mic_usb_fifo_threshold_configured || ep_in_fifo == nullptr) {
        return;
    }

    const uint16_t depth = tu_fifo_depth(ep_in_fifo);
    const uint16_t packet_bytes = host_mic_usb_packet_bytes();
    if (depth <= packet_bytes) {
        return;
    }

    const uint16_t max_threshold = static_cast<uint16_t>(depth - packet_bytes);
    const uint16_t threshold = std::min<uint16_t>(host_mic_usb_prefill_bytes(), max_threshold);
    tud_audio_n_set_ep_in_fifo_threshold(0, threshold);
    mic_usb_fifo_threshold_configured = true;
}

static void __not_in_flash_func(refresh_mic_usb_buffered_bytes)(
    tu_fifo_t *ep_in_fifo,
    uint16_t pending_len,
    uint16_t pending_offset
) {
    const uint32_t fifo_bytes = ep_in_fifo != nullptr ? tu_fifo_count(ep_in_fifo) : 0;
    const uint32_t pending_bytes = pending_len > pending_offset
        ? static_cast<uint32_t>(pending_len - pending_offset)
        : 0;
    mic_usb_buffered_bytes = fifo_bytes + pending_bytes;
}

static __attribute__((noinline, noclone)) bool __not_in_flash_func(write_mic_usb_pending_frame)(
    mic_decode_element &mic_usb_pending,
    uint16_t &mic_usb_pending_offset,
    uint16_t &mic_usb_pending_len
) {
    if (mic_usb_pending_len <= mic_usb_pending_offset) {
        mic_usb_pending_offset = 0;
        mic_usb_pending_len = 0;
        return false;
    }
    if (mic_usb_pending.generation != current_mic_stream_generation()) {
        mic_usb_pending_offset = 0;
        mic_usb_pending_len = 0;
        return false;
    }

    tu_fifo_t *ep_in_fifo = tud_audio_n_get_ep_in_ff(0);
    const uint16_t remaining = static_cast<uint16_t>(mic_usb_pending_len - mic_usb_pending_offset);
    uint16_t target_len = std::min<uint16_t>(remaining, host_mic_usb_packet_bytes());
    if (ep_in_fifo != nullptr) {
        target_len = std::min<uint16_t>(target_len, tu_fifo_remaining(ep_in_fifo));
        target_len = static_cast<uint16_t>(target_len & ~1u);
    }
    if (target_len == 0) {
        refresh_mic_usb_buffered_bytes(
            ep_in_fifo,
            mic_usb_pending_len,
            mic_usb_pending_offset
        );
        return true;
    }

    const uint8_t *data = reinterpret_cast<uint8_t const *>(mic_usb_pending.data) + mic_usb_pending_offset;
    alignas(2) uint8_t scaled_data[HOST_MIC_USB_PACKET_BYTES_MAX]{};
    uint8_t const *write_data = data;
    const uint8_t output_percent = mic_output_muted ? 0 : mic_output_volume_percent;
    if (output_percent < 100) {
        const int16_t *samples = reinterpret_cast<int16_t const *>(data);
        int16_t *scaled_samples = reinterpret_cast<int16_t *>(scaled_data);
        const uint16_t sample_count = target_len / sizeof(int16_t);
        for (uint16_t i = 0; i < sample_count; i++) {
            scaled_samples[i] = static_cast<int16_t>((static_cast<int32_t>(samples[i]) * output_percent) / 100);
        }
        write_data = scaled_data;
    }
    const uint16_t written = tud_audio_n_write(0, write_data, target_len);
    mic_last_written_bytes = written;
    if (written > 0) {
        mic_usb_playout_started = true;
        mic_usb_pending_offset = static_cast<uint16_t>(mic_usb_pending_offset + written);
    }
    if (mic_usb_pending_offset >= mic_usb_pending_len) {
        mic_usb_pending_offset = 0;
        mic_usb_pending_len = 0;
        mic_usb_write_success++;
    }
    refresh_mic_usb_buffered_bytes(
        ep_in_fifo,
        mic_usb_pending_len,
        mic_usb_pending_offset
    );

    if (written != target_len) {
        mic_usb_write_short++;
        audio_debug_log(
            AudioDebugMicPacket,
            1,
            clamp_debug_u8(written),
            clamp_debug_u8(target_len),
            clamp_debug_u8(mic_usb_write_short),
            0
        );
    }
    return true;
}

static __attribute__((noinline)) void __not_in_flash_func(process_mic_usb_output)() {
    // Keep the in-flight USB frame owned by this playout routine rather than
    // exposing partial-frame state to unrelated microphone lifecycle code.
    static mic_decode_element mic_usb_pending{};
    static uint16_t mic_usb_pending_offset = 0;
    static uint16_t mic_usb_pending_len = 0;

    if (!host_mic_stream_active()) {
        if (mic_usb_playout_started || mic_usb_pending_len != 0 || queue_get_level(&mic_decode_fifo) != 0) {
            tud_audio_n_clear_ep_in_ff(0);
        }
        mic_usb_playout_started = false;
        mic_usb_pending_offset = 0;
        mic_usb_pending_len = 0;
        mic_usb_buffered_bytes = 0;
        drain_queue(&mic_decode_fifo);
        return;
    }
    if (!usb_mic_streaming_active()) {
        mic_usb_buffered_bytes = 0;
        return;
    }

    if (
        write_mic_usb_pending_frame(
            mic_usb_pending,
            mic_usb_pending_offset,
            mic_usb_pending_len
        )
    ) {
        return;
    }

    static mic_decode_element mic_pb{};
    const uint32_t generation = current_mic_stream_generation();
    bool found_current_frame = false;
    while (queue_try_remove(&mic_decode_fifo, &mic_pb)) {
        if (mic_pb.generation == generation) {
            found_current_frame = true;
            break;
        }
    }
    if (!found_current_frame) {
        mic_usb_buffered_bytes = 0;
        return;
    }

    memcpy(&mic_usb_pending, &mic_pb, sizeof(mic_usb_pending));
    mic_usb_pending_offset = 0;
    mic_usb_pending_len = mic_pb.len;
    (void)write_mic_usb_pending_frame(
        mic_usb_pending,
        mic_usb_pending_offset,
        mic_usb_pending_len
    );
}

void audio_mic_add_packet(uint8_t const *data, uint16_t len) {
    if (!host_mic_stream_active()) {
        return;
    }
    if (data == nullptr || len < HOST_MIC_OPUS_SIZE) {
        if (len != 0) {
            mic_packets_dropped++;
            audio_debug_log(AudioDebugMicPacket, 6, clamp_debug_u8(len), clamp_debug_u8(mic_packets_dropped), 0, 0);
        }
        return;
    }

    static mic_packet_element packet{};
    memcpy(packet.data, data, HOST_MIC_OPUS_SIZE);
    packet.generation = current_mic_stream_generation();
    if (queue_is_full(&mic_fifo)) {
        mic_fifo.try_remove(nullptr);
        mic_packets_dropped++;
        audio_debug_log(
            AudioDebugMicPacket,
            4,
            clamp_debug_u8(queue_get_level(&mic_fifo)),
            clamp_debug_u8(mic_packets_dropped),
            0,
            0
        );
    }
    if (queue_try_add(&mic_fifo, &packet)) {
        mic_packets_received++;
        if (mic_packets_received <= 8 || mic_debug_should_log(2, 250000)) {
            audio_debug_log(
                AudioDebugMicPacket,
                2,
                clamp_debug_u8(mic_packets_received),
                clamp_debug_u8(queue_get_level(&mic_fifo)),
                0,
                0
            );
        }
    } else {
        mic_packets_dropped++;
        audio_debug_log(AudioDebugMicPacket, 5, clamp_debug_u8(queue_get_level(&mic_fifo)), clamp_debug_u8(mic_packets_dropped), 0, 0);
    }
}

void __not_in_flash_func(audio_loop)() {
    const uint32_t now = time_us_32();
    AudioLoopTelemetryScope loop_telemetry(now);
    audio_core1_stack_poll(now);
    process_mic_usb_output();

    if (!bt_is_controller_connected()) {
        controller_mic_state_valid = false;
        clear_mic_queues();
        discard_usb_audio_packets(AUDIO_LOOP_MAX_USB_READS);
        if (speaker_route_active || last_audio_us != 0) {
            audio_handle_controller_disconnect();
        }
        return;
    }

    if (quiet_mode_enabled) {
        refresh_controller_mic_transport_state();
        clear_mic_queues();
        discard_usb_audio_packets(AUDIO_LOOP_MAX_USB_READS);
        if (speaker_route_active) {
            bt_set_speaker_output_enabled(false);
            speaker_route_active = false;
            speaker_route_headset = false;
        }
        return;
    }

    update_persistent_speaker_route();
    process_idle_speaker_silence_preroll(now);

    (void)try_send_pending_audio_batch();
    for (uint8_t i = 0; i < AUDIO_LOOP_MAX_USB_READS; i++) {
        if (!process_usb_audio_packet()) {
            break;
        }
    }
    (void)try_send_pending_audio_batch();
}

bool audio_init() {
#if DS5_AUDIO_TRANSPORT_STATS_ENABLED
    critical_section_init(&audio_debug_cs);
    audio_debug_cs_ready = true;
#endif
    resampler.SetMode(true, 0, false);
    resampler.SetRates(48000, 3000);
    resampler.SetFeedMode(true);
    resampler.Prealloc(2, 24, 6);
    audio_fifo.init();
    speaker_opus_fifo.init();
    speaker_opus_fifo_ready = true;
    mic_fifo.init();
    mic_decode_fifo.init();
    audio_core1_stack_init_watermark();
    sem_init(&core1_flash_init_done, 0, 1);
    core1_flash_init_succeeded.store(false, std::memory_order_relaxed);
    multicore_launch_core1_with_stack(
        core1_entry,
        audio_core1_stack_storage.stack,
        sizeof(audio_core1_stack_storage.stack)
    );
    if (!sem_acquire_timeout_ms(&core1_flash_init_done, 250)) {
        DS5_LOG("[Audio] Core 1 flash-safety handshake timed out\n");
        return false;
    }
    if (!core1_flash_init_succeeded.load(std::memory_order_acquire)) {
        DS5_LOG("[Audio] Core 1 flash-safety initialization failed\n");
        return false;
    }
    audio_initialized = true;
    return true;
}

static OpusEncoder *encoder;
static OpusDecoder *mic_decoder;
static WDL_Resampler resampler_audio;
static uint32_t core1_audio_stream_generation = 0;

static void reset_core1_audio_pipeline(uint32_t generation) {
    if (encoder != nullptr) {
        opus_encoder_ctl(encoder, OPUS_RESET_STATE);
    }
    resampler_audio.Reset();
    core1_audio_stream_generation = generation;
    audio_debug_log(
        AudioDebugCore1Reset,
        clamp_debug_u8(queue_get_level(&audio_fifo)),
        opus_debug_level(),
        clamp_debug_u8(generation),
        0,
        0
    );
}

static bool queue_mic_decoded_samples(
    int16_t const *decoded_mono,
    int decoded_samples,
    bool count_packet_decode,
    uint32_t generation
) {
    if (
        decoded_mono == nullptr
        || decoded_samples <= 0
        || generation != current_mic_stream_generation()
    ) {
        return false;
    }

    static mic_decode_element decoded{};
    const int frames = std::min(decoded_samples, HOST_MIC_OPUS_FRAMES);
    const uint8_t usb_channels = host_mic_usb_channel_count();
    uint32_t peak = 0;
    for (int frame = 0; frame < frames; frame++) {
        const int32_t sample = decoded_mono[frame];
        const uint32_t magnitude = static_cast<uint32_t>(sample < 0 ? -sample : sample);
        if (magnitude > peak) {
            peak = magnitude;
        }
        for (int channel = 0; channel < usb_channels; channel++) {
            decoded.data[frame * usb_channels + channel] = decoded_mono[frame];
        }
    }
    decoded.len = static_cast<uint16_t>(frames * usb_channels * sizeof(int16_t));
    decoded.generation = generation;
    if (count_packet_decode) {
        mic_decode_success++;
    }
    mic_last_decoded_samples = static_cast<uint16_t>(decoded_samples);
    mic_peak_permille = static_cast<uint16_t>(std::min<uint32_t>((peak * 1000U) / 32768U, 1000U));
    if (queue_is_full(&mic_decode_fifo)) {
        mic_decode_fifo.try_remove(nullptr);
        mic_packets_dropped++;
        if (mic_debug_should_log(7, 250000)) {
            audio_debug_log(
                AudioDebugMicPacket,
                7,
                clamp_debug_u8(queue_get_level(&mic_decode_fifo)),
                clamp_debug_u8(mic_packets_dropped),
                0,
                0
            );
        }
    }
    if (
        generation != current_mic_stream_generation()
        || !queue_try_add(&mic_decode_fifo, &decoded)
    ) {
        mic_packets_dropped++;
        audio_debug_log(AudioDebugMicPacket, 8, clamp_debug_u8(queue_get_level(&mic_decode_fifo)), clamp_debug_u8(mic_packets_dropped), 0, 0);
        return false;
    }
    return true;
}

static bool __not_in_flash_func(core1_process_mic)() {
    static mic_packet_element mic_packet{};
    if (!queue_try_remove(&mic_fifo, &mic_packet)) {
        return false;
    }
    if (mic_packet.generation != current_mic_stream_generation()) {
        return true;
    }
    if (mic_decoder == nullptr) {
        return true;
    }

    static int16_t decoded_mono[HOST_MIC_OPUS_FRAMES * HOST_MIC_INPUT_CHANNELS];
    const int decoded_samples = opus_decode(
        mic_decoder,
        mic_packet.data,
        HOST_MIC_OPUS_SIZE,
        decoded_mono,
        HOST_MIC_OPUS_FRAMES,
        false
    );
    if (decoded_samples <= 0) {
        mic_decode_fail++;
        mic_last_decoded_samples = 0;
        mic_packets_dropped++;
        audio_debug_log(AudioDebugMicPacket, 0, clamp_debug_u8(decoded_samples < 0 ? -decoded_samples : decoded_samples), clamp_debug_u8(mic_packets_dropped), 0, 0);
        return true;
    }

    if (queue_mic_decoded_samples(
        decoded_mono,
        decoded_samples,
        true,
        mic_packet.generation
    )) {
        mic_decode_empty_since_us = 0;
    }
    return true;
}

static bool mic_playout_reservoir_needs_plc(uint8_t decoded_level) {
    const uint32_t decoded_bytes = static_cast<uint32_t>(decoded_level)
        * HOST_MIC_OPUS_FRAMES
        * host_mic_usb_channel_count()
        * sizeof(int16_t);
    return mic_usb_buffered_bytes + decoded_bytes < host_mic_plc_reservoir_bytes();
}

static bool __not_in_flash_func(core1_process_mic_plc)() {
    const uint32_t now = time_us_32();
    const uint8_t decoded_level = queue_get_level(&mic_decode_fifo);
    if (
        mic_decoder == nullptr
        || !host_mic_stream_active()
        || !mic_usb_playout_started
        || !queue_is_empty(&mic_fifo)
    ) {
        return false;
    }

    if (decoded_level >= HOST_MIC_PLC_TARGET_DEPTH || !mic_playout_reservoir_needs_plc(decoded_level)) {
        mic_decode_empty_since_us = 0;
        mic_next_plc_us = 0;
        return false;
    }

    if (mic_decode_empty_since_us == 0) {
        mic_decode_empty_since_us = now;
        mic_next_plc_us = now + HOST_MIC_PLC_EMPTY_GRACE_US;
        return false;
    }

    if (mic_next_plc_us == 0) {
        mic_next_plc_us = mic_decode_empty_since_us + HOST_MIC_PLC_EMPTY_GRACE_US;
    }

    if (!time_reached(now, mic_next_plc_us)) {
        return false;
    }

    static int16_t decoded_mono[HOST_MIC_OPUS_FRAMES * HOST_MIC_INPUT_CHANNELS];
    const int decoded_samples = opus_decode(
        mic_decoder,
        nullptr,
        0,
        decoded_mono,
        HOST_MIC_OPUS_FRAMES,
        false
    );
    if (decoded_samples <= 0) {
        mic_decode_fail++;
        mic_last_decoded_samples = 0;
        mic_packets_dropped++;
        audio_debug_log(AudioDebugMicPacket, 9, clamp_debug_u8(decoded_samples < 0 ? -decoded_samples : decoded_samples), clamp_debug_u8(mic_packets_dropped), 0, 0);
        mic_next_plc_us = now + HOST_MIC_OPUS_FRAME_INTERVAL_US;
        return true;
    }

    if (queue_mic_decoded_samples(
        decoded_mono,
        decoded_samples,
        false,
        current_mic_stream_generation()
    )) {
        mic_plc_count++;
    }
    audio_debug_log(
        AudioDebugMicPacket,
        10,
        clamp_debug_u8(queue_get_level(&mic_decode_fifo)),
        clamp_debug_u8(decoded_samples),
        0,
        0
    );
    mic_next_plc_us += HOST_MIC_OPUS_FRAME_INTERVAL_US;
    if (time_reached(now, mic_next_plc_us + HOST_MIC_OPUS_FRAME_INTERVAL_US)) {
        mic_next_plc_us = now + HOST_MIC_OPUS_FRAME_INTERVAL_US;
    }
    return true;
}

static bool __not_in_flash_func(core1_process_mic_burst)() {
    if (!host_mic_stream_active()) {
        return false;
    }
    bool did_mic = false;
    for (uint8_t packet = 0; packet < HOST_MIC_CORE1_BURST_LIMIT; packet++) {
        if (!core1_process_mic()) {
            break;
        }
        did_mic = true;
    }
    return did_mic;
}

static bool __not_in_flash_func(core1_process_speaker)() {
    static audio_raw_element audio_element{};
    if (!queue_try_remove(&audio_fifo, &audio_element)) {
        return false;
    }
    if (encoder == nullptr) {
        return true;
    }

    // Resample 512 frames to 480 frames to avoid noise. Thanks @Junhoo.
    WDL_ResampleSample *in_buf;
    int nframes = resampler_audio.ResamplePrepare(512, 2, &in_buf);
    for (int i = 0; i < nframes * 2;i++) {
        in_buf[i] = audio_element.data[i];
    }
    static WDL_ResampleSample out_buf[480 * 2];
    resampler_audio.ResampleOut(out_buf,nframes,480,2);
    static uint8_t encoded[SPEAKER_OPUS_SIZE];
#if DS5_AUDIO_TRANSPORT_STATS_ENABLED
    const uint32_t encode_start_us = time_us_32();
#endif
    const opus_int32 encoded_bytes = opus_encode_float(encoder,out_buf,480,encoded,sizeof(encoded));
#if DS5_AUDIO_TRANSPORT_STATS_ENABLED
    audio_stats_note_opus_encode(static_cast<uint32_t>(time_us_32() - encode_start_us));
#endif
    if (encoded_bytes < 0) {
        audio_debug_log(
            AudioDebugOpusFifoAddFail,
            clamp_debug_u8(queue_get_level(&audio_fifo)),
            opus_debug_level(),
            0,
            0,
            0
        );
        return true;
    }
    speaker_opus_element opus_element{};
    memcpy(opus_element.data, encoded, sizeof(opus_element.data));
    opus_element.generation = audio_element.generation;
    if (queue_is_full(&speaker_opus_fifo)) {
        speaker_opus_fifo.try_remove(nullptr);
    }
    if (!queue_try_add(&speaker_opus_fifo, &opus_element)) {
        audio_debug_log(
            AudioDebugOpusFifoAddFail,
            clamp_debug_u8(queue_get_level(&audio_fifo)),
            opus_debug_level(),
            0,
            0,
            0
        );
    }
    return true;
}

static void __not_in_flash_func(core1_entry)() {
    int error = 0;
    encoder = opus_encoder_create(48000,2,OPUS_APPLICATION_AUDIO,&error);
    if (error != OPUS_OK) {
        DS5_LOG("[Audio] OpusEncoder create failed\n");
        encoder = nullptr;
    }
    if (encoder != nullptr) {
        opus_encoder_ctl(encoder,OPUS_SET_EXPERT_FRAME_DURATION(OPUS_FRAMESIZE_10_MS));
        opus_encoder_ctl(encoder,OPUS_SET_BITRATE(200 * 8 * 100));
        opus_encoder_ctl(encoder,OPUS_SET_VBR(false));
        opus_encoder_ctl(encoder,OPUS_SET_COMPLEXITY(0)); // max 4
    }
    resampler_audio.SetMode(true,0,false);
    resampler_audio.SetRates(51200,48000);
    resampler_audio.SetFeedMode(true);
    resampler_audio.Prealloc(2, 512, 480);
    mic_decoder = opus_decoder_create(48000, HOST_MIC_INPUT_CHANNELS, &error);
    if (error != OPUS_OK) {
        DS5_LOG("[Audio] OpusDecoder create failed\n");
        mic_decoder = nullptr;
    }

    uint32_t cpu_window_start_us = time_us_32();
    uint32_t core1_sleep_us = 0;
    uint32_t core1_speaker_us = 0;
    uint32_t core1_mic_us = 0;

    // Register core 1 as an SDK flash-lockout victim only after all flash-backed
    // setup is complete. Core 0 waits for this acknowledgement before Bluetooth
    // can persist pairing data or sample BOOTSEL.
    const bool flash_init_succeeded = flash_safe_execute_core_init();
    core1_flash_init_succeeded.store(flash_init_succeeded, std::memory_order_release);
    sem_release(&core1_flash_init_done);
    if (!flash_init_succeeded) {
        while (true) {
            tight_loop_contents();
        }
    }

    while (true) {
        const uint32_t speaker_start_us = time_us_32();
        const bool did_speaker = queue_get_level(&audio_fifo) > 0
            ? core1_process_speaker()
            : false;
        const uint32_t mic_start_us = time_us_32();
        const bool did_mic = queue_get_level(&mic_fifo) > 0
            ? core1_process_mic()
            : false;
        const uint32_t work_end_us = time_us_32();
        if (did_speaker) {
            core1_speaker_us += static_cast<uint32_t>(mic_start_us - speaker_start_us);
        }
        if (did_mic) {
            core1_mic_us += static_cast<uint32_t>(work_end_us - mic_start_us);
        }
        if (!did_speaker && !did_mic) {
            const uint32_t sleep_start_us = time_us_32();
            sleep_us(10);
            core1_sleep_us += static_cast<uint32_t>(time_us_32() - sleep_start_us);
        }
        const uint32_t now_us = time_us_32();
        const uint32_t window_us = static_cast<uint32_t>(now_us - cpu_window_start_us);
        if (window_us >= CPU_DEBUG_INTERVAL_US) {
            const uint32_t busy_us = window_us > core1_sleep_us ? window_us - core1_sleep_us : 0;
            audio_debug_log(
                AudioDebugCpuLoad,
                percent_debug_u8(busy_us, window_us),
                percent_debug_u8(core1_speaker_us, window_us),
                percent_debug_u8(core1_mic_us, window_us),
                us_to_100us_debug_u8(take_audio_loop_runtime_max_us()),
                us_to_100us_debug_u8(take_audio_loop_gap_max_us())
            );
            cpu_window_start_us = now_us;
            core1_sleep_us = 0;
            core1_speaker_us = 0;
            core1_mic_us = 0;
        }
    }
}
