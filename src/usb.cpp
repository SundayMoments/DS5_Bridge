//
// Created by awalol on 2026/3/4.
// Modified for DS5 Bridge companion firmware and app integration.
//

#include "tusb.h"
#include "device/dcd.h"
#include "bsp/board_api.h"
#include "hardware/structs/usb.h"
#include "hardware/watchdog.h"
#include "pico/time.h"
#include <algorithm>
#include <cmath>

#include "audio.h"
#include "bt.h"
#include "host_input.h"
#include "persona/host_persona.h"
#include "usb.h"
#include "usb_descriptor_mode.h"
#include "wake_on_lan.h"

uint8_t mute[2]; // 0: speaker/LED fallback, 1: mic/idle-disconnect fallback
float volume[2] = {DEFAULT_COMPANION_SPEAKER_GAIN, 1.0f}; // 0: companion speaker gain 0-1, 1: haptics gain 0-5
uint8_t usb_host_volume_percent[3] = {100, 100, 100};
uint8_t usb_host_mute[3] = {0, 0, 0};
uint32_t usb_host_volume_set_count[3] = {0, 0, 0};
float usb_host_speaker_gain = 1.0f;
volatile uint8_t usb_mic_endpoint_channels = 1;
static uint32_t usb_last_hid_output_us = 0;
static uint8_t usb_hid_polling_rate = 2;
static bool usb_suspend_disconnect = true;
static volatile bool usb_speaker_streaming = false;
static volatile bool usb_mic_streaming = false;
static volatile bool usb_line_streaming = false;
static bool usb_reconnect_requested = false;
static bool usb_reconnect_connect_pending = false;
static uint32_t usb_reconnect_at_us = 0;
// These flags own their deadlines. usb_pm_poll retires an elapsed wait even
// while suspend defers topology changes, so a deadline left behind by a long
// sleep cannot read as future again once the signed clock difference wraps.
static bool usb_reconnect_wait_pending = false;
static bool usb_controller_transport_ready = false;
static bool usb_controller_transport_transition_pending = false;
static bool usb_controller_transport_attached = false;
static uint32_t usb_controller_transport_disconnect_not_before_us = 0;
static bool usb_controller_transport_disconnect_grace_pending = false;
static volatile bool usb_mounted = false;
static volatile bool usb_host_suspended = false;
static volatile uint32_t usb_suspend_at_us = 0;
static volatile uint32_t usb_reconnect_grace_until_us = 0;
static volatile bool usb_remote_wakeup_armed = false;
static volatile bool usb_remote_wakeup_pending = false;
static volatile bool usb_wake_on_connect = true;
static bool usb_attached_bridge_only = false;
static bool usb_reconnect_target_bridge_only = false;
// The host unconfigured the bridge itself (not a firmware reconnect).
static bool usb_external_unmount = false;
// The mounted session's host selected the HID boot protocol (BIOS/UEFI).
static bool usb_session_firmware = false;
static bool usb_ever_mounted = false;
static bool usb_idle_down_seen = false;
// Wake-on-LAN's sleep-disconnect exemption as seen by the previous PM poll.
static bool usb_wake_exemption_seen = false;
static volatile bool usb_gameplay_quiet = false;
// Start-of-frame activity, sampled from the main loop (see usb_bus_idle).
static bool usb_sof_sampled = false;
static uint32_t usb_sof_frame_seen = 0;
static uint32_t usb_sof_changed_at_us = 0;
static uint32_t usb_sof_sampled_at_us = 0;

extern "C" {
uint8_t usb_hid_polling_interval_ms_value = 1;
}

#define UAC1_ENTITY_SPK_FEATURE_UNIT    0x02
#define UAC1_ENTITY_MIC_FEATURE_UNIT    0x05
#define UAC1_ENTITY_LINE_FEATURE_UNIT   0x08
#define HID_OUTPUT_ACTIVE_US            500000
#define USB_RECONNECT_DELAY_US          50000
#define USB_RECONNECT_HOLD_US           100000
#define USB_SUSPEND_POWEROFF_DEBOUNCE_US 3000000
#define USB_RECONNECT_GRACE_US          5000000
#define USB_EXPECTED_DISCONNECT_GRACE_US 1500000
#define USB_BUS_IDLE_US                 20000
#define USB_SOF_SAMPLE_STALE_US         1000000

enum UsbAudioDebugKind : uint8_t {
    UsbAudioDebugSetInterface = 1,
    UsbAudioDebugGetEntity = 2,
    UsbAudioDebugSetEntity = 3,
};

struct UsbAudioVolumeRange {
    int16_t min;
    int16_t max;
    int16_t res;
};

static constexpr UsbAudioVolumeRange kUsbAudioVolumeRanges[3] = {
    {-100 * 256, 0, 1 * 256},
    {0, 48 * 256, 0x007a},
    {0, 48 * 256, 0x007a},
};

static bool time_reached(uint32_t now, uint32_t target) {
    return static_cast<int32_t>(now - target) >= 0;
}

// Called where the host can next read descriptors (attach) and where it has
// committed to them (mount), so the microphone format follows the enumerated
// descriptor rather than a persona change still waiting for its reconnect.
static void usb_latch_mic_endpoint_channels() {
    usb_mic_endpoint_channels = host_persona_active() == HostPersonaModeDualSenseEdge ? 2 : 1;
}

static void sleep_ms_with_watchdog(uint32_t total_ms) {
    while (total_ms > 0) {
        watchdog_update();
        const uint32_t chunk_ms = std::min<uint32_t>(total_ms, 10);
        sleep_ms(chunk_ms);
        total_ms -= chunk_ms;
    }
    watchdog_update();
}

static bool reconnect_grace_active(uint32_t now) {
    return usb_reconnect_grace_until_us != 0
        && !time_reached(now, usb_reconnect_grace_until_us);
}

static uint32_t nonzero_time(uint32_t now) {
    return now == 0 ? 1 : now;
}

static void arm_suspend_disconnect(uint32_t now) {
    usb_suspend_at_us = usb_suspend_disconnect && !reconnect_grace_active(now)
        ? nonzero_time(now)
        : 0;
}

static bool usb_bus_suspended() {
    return usb_host_suspended || (tud_inited() && tud_suspended());
}

// Positive evidence that the host stopped driving the bus: the SIE's last
// start-of-frame number has not advanced for 20 ms. TinyUSB drops SUSPEND and
// RESUME while it is not "connected" (after a bus reset, until the next
// SETUP), so this is the only signal for a host that resets the port and goes
// away. A host that is awake keeps sending SOFs on an enabled port even before
// it configures the device, so a late configuration is never mistaken for
// sleep. A sample more than 1 s after the previous one restarts the interval,
// so the 11-bit frame counter wrapping to the same value cannot read as idle.
// SOF interrupts are unused here (no audio feedback endpoint, no tud_sof_cb),
// so reading SOF_RD from the main loop cannot steal one. Ported from Kitsune.
#if defined(CFG_TUD_AUDIO_ENABLE_FEEDBACK_EP) && CFG_TUD_AUDIO_ENABLE_FEEDBACK_EP
#error "usb_bus_idle() reads SOF_RD, which would clear an audio feedback SOF interrupt"
#endif
static bool usb_bus_idle(uint32_t now) {
    if (!tud_inited()) {
        usb_sof_sampled = false;
        return false;
    }
    const uint32_t frame = usb_hw->sof_rd & USB_SOF_RD_BITS;
    const bool stale = static_cast<uint32_t>(now - usb_sof_sampled_at_us) >= USB_SOF_SAMPLE_STALE_US;
    usb_sof_sampled_at_us = now;
    if (!usb_sof_sampled || stale || frame != usb_sof_frame_seen) {
        usb_sof_sampled = true;
        usb_sof_frame_seen = frame;
        usb_sof_changed_at_us = now;
        return false;
    }
    return static_cast<uint32_t>(now - usb_sof_changed_at_us) >= USB_BUS_IDLE_US;
}

static uint8_t hid_polling_interval_for_mode(uint8_t mode) {
    switch (mode) {
        case 0:
            return 4;
        case 1:
            return 2;
        case 2:
        default:
            return 1;
    }
}

static void usb_note_reconnect_disconnect(uint32_t now);

static void usb_begin_descriptor_reconnect(uint32_t now, bool bridge_only) {
    // Keep callbacks on the mounted descriptor topology until the new attach.
    usb_reconnect_target_bridge_only = bridge_only;
    usb_reconnect_requested = false;
    usb_reconnect_connect_pending = true;
    usb_reconnect_at_us = now + USB_RECONNECT_HOLD_US;
    usb_reconnect_wait_pending = true;
    usb_note_reconnect_disconnect(now);
    host_input_prepare_persona_switch();
    tud_disconnect();
    // RP2's forced VBUS detection does not reset endpoint hardware when only
    // the pull-up is removed. Reclaim DPRAM and publish the local unplug event
    // before presenting a descriptor topology with different interfaces.
    dcd_edpt_close_all(BOARD_TUD_RHPORT);
    dcd_event_bus_signal(BOARD_TUD_RHPORT, DCD_EVENT_UNPLUGGED, false);
}

static void usb_schedule_reconnect() {
    if (usb_reconnect_connect_pending) {
        return;
    }
    usb_reconnect_target_bridge_only = usb_attached_bridge_only;
    usb_reconnect_requested = true;
    usb_reconnect_at_us = time_us_32() + USB_RECONNECT_DELAY_US;
    usb_reconnect_wait_pending = true;
}

static void usb_schedule_topology_reconnect(uint32_t now, bool bridge_only) {
    usb_begin_descriptor_reconnect(now, bridge_only);
}

static void usb_note_reconnect_disconnect(uint32_t now) {
    usb_reconnect_grace_until_us = now + USB_RECONNECT_GRACE_US;
    usb_suspend_at_us = 0;
}

void usb_request_reconnect() {
    usb_schedule_reconnect();
}

static void usb_reset_audio_class_state() {
    usb_last_hid_output_us = 0;
    usb_speaker_streaming = false;
    usb_mic_streaming = false;
    usb_line_streaming = false;
    for (uint8_t i = 0; i < 3; i++) {
        usb_host_volume_percent[i] = 100;
        usb_host_mute[i] = 0;
        usb_host_volume_set_count[i] = 0;
    }
    usb_host_speaker_gain = 1.0f;
    if (tud_inited()) {
        tud_audio_clear_ep_out_ff();
        tud_audio_n_clear_ep_in_ff(0);
        tud_audio_n_clear_ep_in_ff(1);
    }
}

void usb_device_stack_init_disconnected() {
    const bool initialized_now = !tud_inited();
    if (!tud_inited()) {
        tusb_rhport_init_t dev_init = {
            .role = TUSB_ROLE_DEVICE,
            .speed = TUSB_SPEED_FULL
        };
        tusb_init(BOARD_TUD_RHPORT, &dev_init);
        // TinyUSB connects during initialization. Detach immediately so the
        // host never observes a half-settled controller descriptor topology.
        tud_disconnect();
    }
    usb_mounted = false;
    usb_reset_audio_class_state();
    if (initialized_now) {
        sleep_ms_with_watchdog(150);
        // No controller is ready during boot. The top-level poll publishes the
        // management-only bridge after TinyUSB has settled.
        usb_controller_transport_transition_pending = true;
    }
    if (!initialized_now) {
        tud_disconnect();
    }
}

static void usb_connect_transport(uint32_t now, bool bridge_only) {
    (void)now;
    if (usb_controller_transport_attached) {
        return;
    }
    usb_descriptor_set_bridge_only_active(bridge_only);
    usb_attached_bridge_only = bridge_only;
    usb_reconnect_target_bridge_only = bridge_only;
    usb_device_stack_init_disconnected();
    usb_latch_mic_endpoint_channels();
    tud_connect();
    usb_controller_transport_attached = true;
}

uint8_t usb_hid_polling_rate_mode() {
    return usb_hid_polling_rate;
}

bool usb_set_hid_polling_rate_mode(uint8_t mode) {
    if (mode > 2) {
        return false;
    }

    const bool changed = usb_hid_polling_rate != mode;
    usb_hid_polling_rate = mode;
    usb_hid_polling_interval_ms_value = hid_polling_interval_for_mode(mode);
    if (changed) {
        usb_schedule_reconnect();
    }
    return true;
}

void usb_note_hid_output() {
    usb_last_hid_output_us = time_us_32();
}

bool usb_host_hid_output_recent() {
    return usb_last_hid_output_us != 0
        && static_cast<uint32_t>(time_us_32() - usb_last_hid_output_us) < HID_OUTPUT_ACTIVE_US;
}

void usb_set_suspend_disconnect_enabled(bool enabled) {
    usb_suspend_disconnect = enabled;
    if (!enabled) {
        usb_suspend_at_us = 0;
    }
}

bool usb_suspend_disconnect_enabled() {
    return usb_suspend_disconnect;
}

bool usb_host_suspended_active() {
    return usb_bus_suspended();
}

bool __not_in_flash_func(usb_mounted_active)() {
    return usb_mounted;
}

bool __not_in_flash_func(usb_speaker_streaming_active)() {
    return usb_speaker_streaming && !usb_gameplay_quiet;
}

bool __not_in_flash_func(usb_mic_streaming_active)() {
    return usb_mic_streaming && !usb_gameplay_quiet;
}

bool usb_line_streaming_active() {
    return usb_line_streaming && !usb_gameplay_quiet;
}

bool usb_wake_host_active() {
    return usb_mounted
        && !usb_bus_suspended()
        && !usb_reconnect_requested
        && !usb_reconnect_connect_pending;
}

bool usb_wake_external_suspended() {
    const uint32_t now = time_us_32();
    // An unconfigured bridge on an idle bus (a host that reset the port and
    // went away, or never configured a firmware re-attach) is down as well.
    const bool idle_unmounted = !usb_mounted && usb_bus_idle(now);
    return !reconnect_grace_active(now)
        && !usb_reconnect_requested
        && !usb_reconnect_connect_pending
        && (usb_bus_suspended() || usb_external_unmount || idle_unmounted);
}

bool usb_wake_host_firmware() {
    return usb_mounted && usb_session_firmware;
}

// TinyUSB invokes this from tud_task for SET_PROTOCOL on a boot interface.
// UEFI keyboard drivers (EDK2 UsbKbDxe and similar) select boot protocol (0);
// the Windows HID driver keeps report protocol. This is an estimate, used only
// to keep BIOS sessions from counting as a returned host.
extern "C" void tud_hid_set_protocol_cb(uint8_t instance, uint8_t protocol) {
    (void)instance;
    usb_session_firmware = protocol == 0;
}

void usb_set_gameplay_quiet(bool quiet) {
    if (usb_gameplay_quiet == quiet) {
        return;
    }
    usb_gameplay_quiet = quiet;
    // Neither direction may replay audio queued across the Wi-Fi window.
    if (tud_inited()) {
        tud_audio_clear_ep_out_ff();
        tud_audio_n_clear_ep_in_ff(0);
        tud_audio_n_clear_ep_in_ff(1);
    }
}

void usb_set_wake_on_connect(bool enabled) {
    usb_wake_on_connect = enabled;
    if (!enabled) {
        usb_remote_wakeup_pending = false;
    }
}

bool usb_wake_on_connect_enabled() {
    return usb_wake_on_connect;
}

void usb_handle_controller_transport_disconnect(bool expected_disconnect) {
#ifdef ENABLE_COMPANION
    // A controller loss does not apply an acknowledged descriptor change, and
    // a detach already in progress must still reattach (as the management
    // bridge if the controller stays away). usb_pm_poll consumes both.
#else
    // Without the management bridge, controller loss leaves USB detached.
    usb_reconnect_requested = false;
    usb_reconnect_connect_pending = false;
#endif
    usb_controller_transport_ready = false;
    usb_controller_transport_disconnect_not_before_us = expected_disconnect
        ? time_us_32() + USB_EXPECTED_DISCONNECT_GRACE_US
        : 0;
    usb_controller_transport_disconnect_grace_pending = expected_disconnect;
    // Bluetooth callbacks only publish desired state. TinyUSB is reconciled
    // from usb_pm_poll at the top level, so a controller loss can never tear
    // the USB stack down from inside cyw43_arch_poll or a TinyUSB callback.
    usb_controller_transport_transition_pending = true;
}

void usb_handle_controller_link_connected() {
    // While Wake-on-LAN owns a transition, only its qualified request wakes.
    if (!usb_wake_on_connect || !wake_on_lan_allow_usb_wake()) {
        return;
    }
    // Bluetooth callbacks only publish wake intent. TinyUSB performs the
    // remote-wakeup request later from usb_pm_poll.
    usb_remote_wakeup_pending = true;
}

void usb_handle_controller_transport_ready() {
    usb_handle_controller_link_connected();
    if (
        usb_controller_transport_ready
        && !usb_controller_transport_transition_pending
    ) {
        return;
    }
    usb_controller_transport_disconnect_grace_pending = false;
    usb_controller_transport_ready = true;
    usb_controller_transport_transition_pending = true;
}

extern "C" void tud_mount_cb(void) {
    // A host bus reset can re-enumerate before a scheduled persona reconnect;
    // mount is where the newly read descriptor becomes the active format.
    usb_latch_mic_endpoint_channels();
    usb_external_unmount = false;
    usb_session_firmware = false;
    usb_ever_mounted = true;
    usb_mounted = true;
    usb_host_suspended = false;
    usb_remote_wakeup_armed = false;
    usb_remote_wakeup_pending = false;
    usb_suspend_at_us = 0;
    usb_reconnect_grace_until_us = 0;
    host_input_note_usb_mounted();
}

extern "C" void tud_umount_cb(void) {
    const uint32_t now = time_us_32();
    usb_external_unmount = !reconnect_grace_active(now)
        && !usb_reconnect_requested
        && !usb_reconnect_connect_pending;
    usb_mounted = false;
    // Windows may report a durable unmount instead of suspend. Treat it as a
    // debounced power transition, excluding our own descriptor reconnects.
    arm_suspend_disconnect(now);
    usb_remote_wakeup_armed = false;
    usb_remote_wakeup_pending = false;
    usb_speaker_streaming = false;
    usb_mic_streaming = false;
    usb_line_streaming = false;
}

extern "C" bool tud_audio_set_itf_cb(uint8_t rhport, tusb_control_request_t const *p_request) {
    (void)rhport;
    const uint8_t itf = tu_u16_low(p_request->wIndex);
    const uint8_t alt = tu_u16_low(p_request->wValue);

    if (itf == 1) {
        usb_speaker_streaming = alt != 0;
    } else if (itf == 2) {
        usb_mic_streaming = alt != 0;
    } else if (itf == 4) {
        usb_line_streaming = alt != 0;
    }
    audio_debug_note_usb_event(
        UsbAudioDebugSetInterface,
        itf,
        alt,
        usb_speaker_streaming ? 1 : 0,
        static_cast<uint8_t>((usb_mic_streaming ? 1 : 0) | (usb_line_streaming ? 2 : 0))
    );

    return true;
}

extern "C" void tud_suspend_cb(bool remote_wakeup_en) {
    const uint32_t now = time_us_32();
    if (reconnect_grace_active(now)) {
        usb_suspend_at_us = 0;
        return;
    }
    usb_host_suspended = true;
    usb_remote_wakeup_armed = remote_wakeup_en;
    arm_suspend_disconnect(now);
    usb_speaker_streaming = false;
    usb_mic_streaming = false;
    usb_line_streaming = false;
}

extern "C" void tud_resume_cb(void) {
    usb_host_suspended = false;
    usb_remote_wakeup_armed = false;
    usb_remote_wakeup_pending = false;
    usb_suspend_at_us = 0;
}

// TinyUSB reports every device-controller event here, usually from the USB
// IRQ. A bus reset ends suspend (TinyUSB clears its own flag too); leaving
// ours set let the suspend debounce power the controller off while the host
// was already sending start-of-frames before SET_CONFIGURATION.
// A bus reset also ends the configured session without tud_umount_cb, so
// clear the mount and wake state until tud_mount_cb starts the next one. If
// the host never configures the bridge again (the PC shut down), the same
// debounce as an unmount powers the controller off.
extern "C" void __not_in_flash_func(tud_event_hook_cb)(uint8_t rhport, uint32_t eventid, bool in_isr) {
    (void)rhport;
    (void)in_isr;
    if (eventid == DCD_EVENT_BUS_RESET) {
        usb_host_suspended = false;
        const bool was_mounted = usb_mounted;
        usb_mounted = false;
        usb_remote_wakeup_armed = false;
        usb_remote_wakeup_pending = false;
        if (was_mounted) {
            arm_suspend_disconnect(time_us_32());
        }
    }
}

void usb_pm_poll() {
    const uint32_t now = time_us_32();
    if (usb_reconnect_grace_until_us != 0 && time_reached(now, usb_reconnect_grace_until_us)) {
        usb_reconnect_grace_until_us = 0;
    }
    // Polling continues while suspend defers topology changes. Retire elapsed
    // waits here; the detach and attach themselves stay gated below.
    if (usb_reconnect_wait_pending && time_reached(now, usb_reconnect_at_us)) {
        usb_reconnect_wait_pending = false;
    }
    if (
        usb_controller_transport_disconnect_grace_pending
        && time_reached(now, usb_controller_transport_disconnect_not_before_us)
    ) {
        usb_controller_transport_disconnect_grace_pending = false;
    }

    // Wake-on-LAN suspends the sleep-disconnect policy while an attempt runs
    // and while a PC it woke is starting. That exemption can end with the bus
    // still down: a failed attempt, or a PC that never booted. The suspend that
    // armed the debounce was consumed earlier, so restart it here and apply the
    // user's setting 3 s later.
    const bool wake_exempt = wake_on_lan_suspend_exempt();
    if (
        usb_wake_exemption_seen
        && !wake_exempt
        && usb_suspend_at_us == 0
        && usb_wake_external_suspended()
    ) {
        arm_suspend_disconnect(now);
    }
    usb_wake_exemption_seen = wake_exempt;
    // A bus that goes idle with the bridge unconfigured, outside a firmware
    // re-attach grace (for example a persona re-attach the host never
    // configured because it was going to sleep), starts the debounce like a
    // suspend. A bridge never configured since power-on (a charger) is left
    // alone. An awake host keeps sending start-of-frames, so a slow
    // configuration never reads as idle.
    const bool idle_unmounted = !usb_mounted && usb_bus_idle(now);
    const bool idle_down = idle_unmounted
        && !reconnect_grace_active(now)
        && !usb_reconnect_requested
        && !usb_reconnect_connect_pending;
    if (idle_down && !usb_idle_down_seen && usb_ever_mounted && usb_suspend_at_us == 0) {
        arm_suspend_disconnect(now);
    }
    usb_idle_down_seen = idle_down;
    if (
        usb_suspend_at_us != 0
        && !wake_exempt
        && (usb_host_suspended || !usb_mounted)
        && static_cast<uint32_t>(now - usb_suspend_at_us) >= USB_SUSPEND_POWEROFF_DEBOUNCE_US
    ) {
        (void)bt_power_off_controller();
        usb_suspend_at_us = 0;
    }

    // A Wake-on-LAN qualified press wakes the PC over USB first, even while the
    // feature blocks the ordinary wake-on-connect path.
    const bool qualified_wake = wake_on_lan_take_usb_wake_request();
    if (usb_remote_wakeup_pending || qualified_wake) {
        usb_remote_wakeup_pending = false;
        if (
            usb_wake_on_connect
            && (qualified_wake || wake_on_lan_allow_usb_wake())
            && usb_remote_wakeup_armed
            && usb_bus_suspended()
            && tud_inited()
        ) {
            (void)tud_remote_wakeup();
        }
    }

    if (usb_host_suspended) {
        return;
    }
    // No topology change while Wi-Fi owns the radio, or while an armed bridge
    // waits on a sleeping host.
    if (
        wake_on_lan_quiet_gate()
        || ((wake_on_lan_preparing() || wake_on_lan_armed()) && usb_wake_external_suspended())
    ) {
        return;
    }

    // An ACL link is enough to request remote wake, but the full DS/DSE
    // topology waits for HID initialization so every exposed endpoint is
    // immediately backed by a usable controller transport.
    if (
        usb_controller_transport_ready
        && usb_controller_transport_attached
        && usb_attached_bridge_only
        && !usb_reconnect_connect_pending
        && !usb_reconnect_requested
    ) {
        usb_controller_transport_transition_pending = false;
        usb_controller_transport_disconnect_grace_pending = false;
        usb_schedule_topology_reconnect(now, false);
        return;
    }

    if (
        tud_inited()
        && tud_suspended()
        && !usb_reconnect_connect_pending
        && !usb_reconnect_requested
    ) {
        return;
    }

    // Consume a duplicate ready notification when a full-persona reconnect is
    // already in flight instead of restarting the detach timer.
    if (
        usb_controller_transport_transition_pending
        && usb_controller_transport_ready
        && (usb_reconnect_connect_pending || usb_reconnect_requested)
        && !usb_reconnect_target_bridge_only
    ) {
        usb_controller_transport_transition_pending = false;
        usb_controller_transport_disconnect_grace_pending = false;
    }

    if (usb_controller_transport_transition_pending) {
        if (
            !usb_controller_transport_ready
            && usb_controller_transport_disconnect_grace_pending
        ) {
            return;
        }
        usb_controller_transport_transition_pending = false;
        usb_controller_transport_disconnect_grace_pending = false;
        if (usb_reconnect_connect_pending) {
            // Controller loss or recovery during the detach changes the
            // target, but the reattach itself must still happen. Dropping it
            // here left the bridge detached from the host.
            usb_reconnect_target_bridge_only = !usb_controller_transport_ready;
        } else if (usb_controller_transport_ready) {
            if (usb_controller_transport_attached) {
                if (!usb_attached_bridge_only) {
                    return;
                }
                usb_schedule_topology_reconnect(now, false);
                return;
            }
            usb_mounted = false;
            usb_reset_audio_class_state();
            // The stack is initialized once before Bluetooth starts. Keep the
            // defensive initializer for an exceptional recovery path, but it
            // now runs only from this top-level poll, never a packet callback.
            usb_connect_transport(now, false);
        } else {
#ifdef ENABLE_COMPANION
            if (!usb_controller_transport_attached) {
                usb_mounted = false;
                usb_reset_audio_class_state();
                usb_connect_transport(now, true);
                return;
            }
            if (!usb_attached_bridge_only && tud_inited()) {
                usb_mounted = false;
                usb_reset_audio_class_state();
                usb_schedule_topology_reconnect(now, true);
            }
            return;
#else
            if (usb_controller_transport_attached && tud_inited()) {
                usb_controller_transport_attached = false;
                usb_mounted = false;
                usb_reset_audio_class_state();
                tud_disconnect();
            }
#endif
        }
    }

    if (usb_reconnect_connect_pending && !usb_reconnect_wait_pending) {
        usb_reconnect_connect_pending = false;
        usb_descriptor_set_bridge_only_active(usb_reconnect_target_bridge_only);
        usb_attached_bridge_only = usb_reconnect_target_bridge_only;
        usb_latch_mic_endpoint_channels();
        tud_connect();
    }
    if (usb_reconnect_requested && !usb_reconnect_wait_pending) {
        // Polling and persona changes alter descriptor state too. Use the same
        // endpoint teardown as topology handoffs so Windows cannot retain the
        // former bInterval or interface ownership.
        usb_begin_descriptor_reconnect(now, usb_reconnect_target_bridge_only);
        return;
    }
}

static UsbAudioVolumeRange const &usb_volume_range(uint8_t index) {
    return kUsbAudioVolumeRanges[index < 3 ? index : 1];
}

static int16_t usb_volume_units_from_buffer(uint8_t index, uint8_t const *buffer) {
    UsbAudioVolumeRange const &range = usb_volume_range(index);
    const int16_t raw_units = static_cast<int16_t>(tu_unaligned_read16(buffer));
    return std::clamp(raw_units, range.min, range.max);
}

static int16_t percent_to_usb_volume_units(uint8_t index, float percent) {
    UsbAudioVolumeRange const &range = usb_volume_range(index);
    const float clamped_percent = std::clamp(percent, 0.0f, 100.0f);
    return static_cast<int16_t>(
        static_cast<float>(range.min)
            + (static_cast<float>(range.max - range.min) * clamped_percent / 100.0f)
    );
}

static float usb_volume_units_to_percent(uint8_t index, uint8_t const *buffer) {
    UsbAudioVolumeRange const &range = usb_volume_range(index);
    const int16_t clamped_units = usb_volume_units_from_buffer(index, buffer);
    const float span = static_cast<float>(range.max - range.min);
    if (span <= 0.0f) {
        return 100.0f;
    }
    return std::clamp(
        (static_cast<float>(clamped_units - range.min) * 100.0f) / span,
        0.0f,
        100.0f
    );
}

static float usb_volume_units_to_gain(uint8_t index, uint8_t const *buffer) {
    const int16_t clamped_units = usb_volume_units_from_buffer(index, buffer);
    const float db = static_cast<float>(clamped_units) / 256.0f;
    return index == 0 ? std::pow(10.0f, db / 20.0f) : 1.0f;
}

static float current_host_volume_percent(uint8_t index) {
    return usb_host_volume_percent[index < 3 ? index : 1];
}

static uint8_t usb_audio_control_index_for_entity(uint8_t entityID) {
    if (entityID == UAC1_ENTITY_SPK_FEATURE_UNIT) {
        return 0;
    }
    if (entityID == UAC1_ENTITY_LINE_FEATURE_UNIT) {
        return 2;
    }
    return 1;
}

//--------------------------------------------------------------------+
// Audio Callback Functions
//--------------------------------------------------------------------+

//--------------------------------------------------------------------+
// UAC1 Helper Functions
//--------------------------------------------------------------------+

static bool audio10_set_req_entity(tusb_control_request_t const *p_request, uint8_t *pBuff) {
    uint8_t ctrlSel = TU_U16_HIGH(p_request->wValue);
    uint8_t entityID = TU_U16_HIGH(p_request->wIndex);
    uint8_t index = usb_audio_control_index_for_entity(entityID);
    audio_debug_note_usb_event(
        UsbAudioDebugSetEntity,
        entityID,
        ctrlSel,
        p_request->bRequest,
        p_request->wLength
    );

    // If request is for our speaker feature unit
    if (
        entityID == UAC1_ENTITY_SPK_FEATURE_UNIT
        || entityID == UAC1_ENTITY_MIC_FEATURE_UNIT
        || entityID == UAC1_ENTITY_LINE_FEATURE_UNIT
    ) {
        switch (ctrlSel) {
            case AUDIO10_FU_CTRL_MUTE:
                switch (p_request->bRequest) {
                    case AUDIO10_CS_REQ_SET_CUR:
                        // Only 1st form is supported
                        TU_VERIFY(p_request->wLength == 1);

                        usb_host_mute[index] = pBuff[0] ? 1 : 0;

                        TU_LOG2("    Set Mute: %d of entity: %u\r\n", usb_host_mute[index], entityID);
                        return true;

                    default:
                        return false; // not supported
                }

            case AUDIO10_FU_CTRL_VOLUME:
                switch (p_request->bRequest) {
                    case AUDIO10_CS_REQ_SET_CUR: {
                        // Only 1st form is supported
                        TU_VERIFY(p_request->wLength == 2);

                        const float host_percent = usb_volume_units_to_percent(index, pBuff);
                        usb_host_volume_percent[index] = static_cast<uint8_t>(host_percent);
                        usb_host_volume_set_count[index]++;
                        if (index == 0) {
                            usb_host_speaker_gain = usb_volume_units_to_gain(index, pBuff);
                        }

                        TU_LOG2("    Set Volume: %u%% of entity: %u\r\n", static_cast<uint8_t>(host_percent), entityID);
                        return true;
                    }

                    default:
                        return false; // not supported
                }

            // Unknown/Unsupported control
            default:
                TU_BREAKPOINT();
                return false;
        }
    }

    return false;
}

static bool audio10_get_req_entity(uint8_t rhport, tusb_control_request_t const *p_request) {
    uint8_t ctrlSel = TU_U16_HIGH(p_request->wValue);
    uint8_t entityID = TU_U16_HIGH(p_request->wIndex);
    uint8_t index = usb_audio_control_index_for_entity(entityID);
    audio_debug_note_usb_event(
        UsbAudioDebugGetEntity,
        entityID,
        ctrlSel,
        p_request->bRequest,
        p_request->wLength
    );

    // If request is for our speaker feature unit
    if (
        entityID == UAC1_ENTITY_SPK_FEATURE_UNIT
        || entityID == UAC1_ENTITY_MIC_FEATURE_UNIT
        || entityID == UAC1_ENTITY_LINE_FEATURE_UNIT
    ) {
        switch (ctrlSel) {
            case AUDIO10_FU_CTRL_MUTE:
                // Audio control mute cur parameter block consists of only one byte - we thus can send it right away
                // There does not exist a range parameter block for mute
                TU_LOG2("    Get Mute of entity: %u\r\n", entityID);
                return tud_audio_buffer_and_schedule_control_xfer(rhport, p_request, &usb_host_mute[index], 1);

            case AUDIO10_FU_CTRL_VOLUME:
                switch (p_request->bRequest) {
                    case AUDIO10_CS_REQ_GET_CUR:
                        TU_LOG2("    Get Volume of entity: %u\r\n", entityID); {
                            int16_t vol = percent_to_usb_volume_units(index, current_host_volume_percent(index));
                            return tud_audio_buffer_and_schedule_control_xfer(rhport, p_request, &vol, sizeof(vol));
                        }

                    case AUDIO10_CS_REQ_GET_MIN:
                        TU_LOG2("    Get Volume min of entity: %u\r\n", entityID); {
                            int16_t min = usb_volume_range(index).min;
                            return tud_audio_buffer_and_schedule_control_xfer(rhport, p_request, &min, sizeof(min));
                        }

                    case AUDIO10_CS_REQ_GET_MAX:
                        TU_LOG2("    Get Volume max of entity: %u\r\n", entityID); {
                            int16_t max = usb_volume_range(index).max;
                            return tud_audio_buffer_and_schedule_control_xfer(rhport, p_request, &max, sizeof(max));
                        }

                    case AUDIO10_CS_REQ_GET_RES:
                        TU_LOG2("    Get Volume res of entity: %u\r\n", entityID); {
                            int16_t res = usb_volume_range(index).res;
                            return tud_audio_buffer_and_schedule_control_xfer(rhport, p_request, &res, sizeof(res));
                        }
                    // Unknown/Unsupported control
                    default:
                        TU_BREAKPOINT();
                        return false;
                }
                break;

            // Unknown/Unsupported control
            default:
                TU_BREAKPOINT();
                return false;
        }
    }

    return false;
}

// Invoked when audio class specific get request received for an entity
bool tud_audio_get_req_entity_cb(uint8_t rhport, tusb_control_request_t const *p_request) {
    (void) rhport;

    return audio10_get_req_entity(rhport, p_request);
}

// Invoked when audio class specific set request received for an entity
bool tud_audio_set_req_entity_cb(uint8_t rhport, tusb_control_request_t const *p_request, uint8_t *buf) {
    (void) rhport;

    return audio10_set_req_entity(p_request, buf);
}

void tud_hid_report_complete_cb(uint8_t instance, uint8_t const *report, uint16_t len) {
    // Instance 0 is the controller only in a native HID topology; with the
    // Xbox 360 persona it is the keyboard, whose completions are not input.
    if (instance == 0 && host_persona_is_native_hid()) {
        host_input_report_complete();
    }
    (void) report;
    (void) len;
}
