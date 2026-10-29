// Ported from Kitsune Input's Wake-on-LAN.
#pragma once
#include "wake_on_lan_domain.h"
#include "wake_on_lan_ports.h"

namespace ds5::wake_on_lan {
class WakeOnLan {
public:
    // Continuous enumeration that counts as an active host, and the cap on the
    // post-packet host-start phase.
    static constexpr uint64_t kHostReturnMs = 45000;
    static constexpr uint64_t kHostStartingCapMs = 300000;
    // Teardown that has not verified WLAN stopped by then is a RadioFault. The
    // radio keeps asking GET_UP until 5 s after its stop began; a question
    // started just before then can take about 3 s, and a "down" answer is
    // followed by a 250 ms drain and one more GET_UP.
    static constexpr uint64_t kTeardownDeadlineMs = 12000;
    explicit WakeOnLan(WakeOnLanPorts ports) : ports_(ports) {}
    // radio_marker holds kRadioMarkerWords words read back after a
    // reset; a valid marker reports the interrupted attempt and is cleared.
    void initialize(const StoredRecord &saved, bool persistence_ok=true,
                    const uint32_t *radio_marker=nullptr);
    // firmware_host marks a USB session in which the host selected the HID boot
    // protocol, as BIOS/UEFI keyboard drivers do and OS HID drivers do not (an
    // estimate). Such a session never counts toward a returned host.
    void poll(uint64_t now, bool host_active, bool external_suspended,
              bool controllers_quiet, bool idle_for_setup, bool radio_ready=true,
              bool firmware_host=false);
    void controller_connected(uint32_t generation, bool authenticated, bool qualified);
    void controller_disconnected(uint32_t generation);
    uint8_t command(uint16_t opcode, const uint8_t *payload, size_t length);
    void encode_status(uint8_t *report, size_t length) const;
    bool quiet_gate() const;
    bool allow_usb_wake() const;
    bool suspend_exempt() const;
    bool take_usb_wake_request();
    bool recovery_required() const { return stage_==Stage::RadioFault; }
    bool preparing() const { return stage_==Stage::Preparing; }
    /** Preparing under a host session, where the host asked the bridge to drop the controller. */
    bool host_prepared() const { return preparing() && !standalone_; }
    bool armed() const { return stage_==Stage::Armed; }
    /** The current transition was armed by the bridge itself, without host preparation. */
    bool standalone() const { return standalone_; }
private:
    bool running() const;
    bool radio_active() const;
    bool armable() const;
    bool standalone_ready() const;
    void cancel(Error error);
    void finish(Error error);
    void enter_preparing();
    void release_unused_commit();
    void store_marker(bool active);
    void clear_staging();
    bool persist(StoredRecord &record);
    uint8_t reject(Error error, uint8_t ack);
    void start_radio();
    WakeOnLanPorts ports_;
    StoredRecord saved_{};
    Config staging_{};
    Stage stage_=Stage::Idle;
    Error error_=Error::None;
    uint64_t now_=0, stage_at_=0, attempt_at_=0, staging_at_=0, quiet_at_=0, complete_at_=0, down_at_=0;
    uint64_t prepared_down_at_=0;
    // Start of the current counted host enumeration (active, outside the host
    // firmware). It restarts whenever counting resumes, at COMMIT, and when an
    // attempt starts.
    uint64_t host_active_since_=0;
    uint32_t transaction_=0, staging_crc_=0, session_=0, epoch_=0, controller_=0;
    uint16_t written_=0;
    uint8_t packets_=0;
    bool staging_present_=false, validated_=false, testing_=false, committed_=false;
    bool quiet_tracking_=false, usb_request_=false, candidate_pending_=false, controller_lost_=false;
    bool candidate_authenticated_=false, candidate_qualified_=false, setup_idle_=false;
    // Starts false so the first active poll begins the continuity interval.
    bool host_active_=false, host_counting_=false, configured_ok_=true;
    // One host-active observation (45 s of continuous enumeration) authorizes
    // at most one bridge-armed attempt. Host preparation consumes it too, so a
    // prepared attempt is never followed by a second bridge-armed attempt in the
    // same power cycle. A committed preparation abandoned before any bus-down
    // (timeout, cancel, superseding PREPARE) hands back what it consumed.
    bool host_seen_=false, standalone_=false, down_tracking_=false;
    // prepared_down_seen_: a bus-down lasted the 3 s debounce during this host
    // preparation; prepared_down_tracking_: one is being debounced.
    bool seen_at_commit_=false, prepared_down_seen_=false, prepared_down_tracking_=false;
    // After a completed attempt the PC is booting. BIOS enumerates the bridge
    // and drops it again at the OS handoff, so a host counts as returned only
    // after 45 s of enumeration outside its firmware; meanwhile the controller
    // is kept on and no new transition may start.
    bool host_starting_=false;
    // Raw USB wake stays blocked after a feature-owned transition or its attempt
    // ended while the host was down, until the host returns (scope rule 3).
    // Saved, tested or failed configurations never block it on their own.
    bool usb_wake_suppressed_=false;
    bool marker_active_=false;
};
}
