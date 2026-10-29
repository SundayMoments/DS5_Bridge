// Ported from Kitsune Input's Wake-on-LAN.
#include "wake_on_lan_engine.h"
#include "wake_on_lan_crc32.h"
#include <algorithm>
#include <cstring>

namespace ds5::wake_on_lan {
namespace {
bool padded(const uint8_t *p,size_t n,size_t used) {
    if (!p || n<used || n>53) return false;
    for (size_t i=used;i<n;++i) if (p[i]) return false;
    return true;
}
uint16_t u16(const uint8_t *p) { return uint16_t(p[0]) | uint16_t(p[1])<<8; }
}
void WakeOnLan::initialize(const StoredRecord &saved,bool persistence_ok,const uint32_t *radio_marker) {
    saved_=saved;
    configured_ok_=persistence_ok && (!saved.configured || valid_config(saved.config));
    if (!configured_ok_) { saved_={}; stage_=Stage::Failed; error_=Error::Persistence; }
    // Power authorization is deliberately never loaded from flash.
    uint8_t packets=0;
    if (decode_radio_marker(radio_marker,packets)) {
        // A reboot interrupted radio work: a RadioFault recovery, or a watchdog
        // reset while Wi-Fi was active. Report it as a teardown failure with the
        // packets submitted before the reset. It never authorizes a wake, does
        // not suppress USB wake and leaves every command available. A
        // persistence failure is the more actionable result and wins.
        if (configured_ok_) { stage_=Stage::Failed; error_=Error::RadioTeardown; packets_=packets; }
        store_marker(false);
    }
}
bool WakeOnLan::running() const {
    return stage_==Stage::UsbFirst || stage_==Stage::Joining || stage_==Stage::Sending
        || stage_==Stage::Teardown || stage_==Stage::Testing;
}
bool WakeOnLan::radio_active() const {
    return ports_.radio_state && ports_.radio_state(ports_.context)!=RadioState::Idle;
}
bool WakeOnLan::quiet_gate() const { return running() || recovery_required() || radio_active(); }
bool WakeOnLan::allow_usb_wake() const {
    // Only a feature-owned transition blocks raw USB wake: while it is Preparing
    // or Armed, while the radio gate is held, and after the transition or its
    // attempt ended with the host still down (scope rule 3). A saved, tested,
    // failed or reloaded configuration never disables Wake PC via USB.
    return stage_!=Stage::Preparing && stage_!=Stage::Armed && !quiet_gate() && !usb_wake_suppressed_;
}
bool WakeOnLan::suspend_exempt() const {
    return running() || (host_starting_ && !host_active_);
}
bool WakeOnLan::take_usb_wake_request() { const bool v=usb_request_; usb_request_=false; return v; }
void WakeOnLan::clear_staging() {
    erase_secret(staging_.data(),staging_.size()); staging_present_=false;
    validated_=false; written_=0; staging_crc_=0;
}
uint8_t WakeOnLan::reject(Error error,uint8_t ack) {
    // The ACK reports the rejection. A rejected command never replaces a
    // retained transition, test or radio outcome; only an idle status records
    // it. A flash failure is the command's own result, not a rejection, so it
    // is always recorded for Settings.
    if (stage_==Stage::Idle || error==Error::Persistence) error_=error;
    return ack;
}
bool WakeOnLan::persist(StoredRecord &record) {
    if (!configured_ok_ || saved_.generation==UINT32_MAX || !ports_.save) return false;
    record.generation=saved_.generation+1;
    if (!ports_.save(record,ports_.context)) return false;
    erase_secret(&saved_,sizeof(saved_)); saved_=record; return true;
}
void WakeOnLan::store_marker(bool active) {
    marker_active_=active;
    if (!ports_.write_marker) return;
    uint32_t words[kRadioMarkerWords]{};
    // The packet count describes wake attempts only, never a test's sends.
    if (active) encode_radio_marker(testing_ ? 0:packets_,words);
    ports_.write_marker(words,ports_.context);
}
bool WakeOnLan::armable() const {
    // A saved FI/IE record (no CLM locale) can never pass the region check, so
    // it never arms, whichever path asks.
    return configured_ok_ && saved_.configured && saved_.config[6]
        && radio_country(saved_.config[4],saved_.config[5]);
}
bool WakeOnLan::standalone_ready() const {
    // An enabled saved record arms itself after the enumerated host leaves the
    // bus. App absence, a firmware-initiated remount, or startup never qualify:
    // the host must have stayed enumerated outside its firmware for 45 s since
    // the last attempt or preparation, so a BIOS POST session does not count. A
    // host PREPARE whose COMMIT never arrived is taken over the same way once
    // the bus is down; a committed or already bridge-armed transition is not.
    return host_seen_ && !host_active_ && armable()
        && !staging_present_ && !running() && !radio_active()
        && (stage_!=Stage::Preparing || (!standalone_ && !committed_))
        && stage_!=Stage::Armed && stage_!=Stage::RadioFault;
}
void WakeOnLan::enter_preparing() {
    stage_=Stage::Preparing; stage_at_=now_; quiet_tracking_=false; error_=Error::None;
    candidate_pending_=false; controller_=0;
}
void WakeOnLan::release_unused_commit() {
    // A committed host preparation that ends before any bus-down never saw the
    // host leave (for example Update and shut down taking longer than 30 s), so
    // it hands back the host-active observation its COMMIT consumed. The bridge
    // then still arms when the bus finally goes down.
    if (stage_==Stage::Preparing && !standalone_ && committed_ && !prepared_down_seen_)
        host_seen_=host_seen_ || seen_at_commit_;
}
void WakeOnLan::finish(Error error) {
    release_unused_commit();
    // A finish ends a feature-owned transition or its attempt, except a test
    // and an uncommitted host PREPARE, which authorized nothing.
    const bool owned=!testing_ && !(stage_==Stage::Preparing && !committed_);
    if (owned && !host_active_) usb_wake_suppressed_=true;
    error_=error; stage_=error==Error::None ? Stage::Complete:Stage::Failed;
    complete_at_=now_; committed_=false; usb_request_=false;
    prepared_down_seen_=false; prepared_down_tracking_=false;
    candidate_pending_=false; controller_=0; controller_lost_=false;
    // finish() runs only once the radio is verified idle (or never started).
    if (marker_active_) store_marker(false);
    // Only a submitted packet gives the PC a reason to boot; a failed attempt
    // ends the sleep-disconnect exemption at once, and the USB layer then
    // re-arms the user's sleep-disconnect debounce if the bus is still down.
    host_starting_=error==Error::None && !testing_ && !host_active_;
    if (testing_) {
        // Test and save reports its own result. Leaving its sends in the status
        // would read as a wake attempt the PC never needed.
        validated_=error==Error::None; staging_at_=now_; testing_=false; packets_=0;
    }
}
void WakeOnLan::cancel(Error error) {
    candidate_pending_=false; usb_request_=false;
    if (radio_active()) {
        committed_=false; error_=error; stage_=Stage::Teardown; stage_at_=now_;
        if (ports_.stop) ports_.stop(ports_.context);
    } else finish(error);
}
void WakeOnLan::start_radio() {
    if (!ports_.start || !ports_.send || !ports_.stop || !ports_.radio_state) {
        finish(Error::NetworkUnavailable); return;
    }
    stage_=Stage::Joining; stage_at_=now_; attempt_at_=now_; controller_lost_=false;
    // Evidence survives a RadioFault reboot or a watchdog reset from here until
    // the radio is verified idle.
    store_marker(true);
    const auto error=ports_.start(testing_ ? staging_:saved_.config,ports_.context);
    if (error!=Error::None) cancel(error);
}
void WakeOnLan::controller_connected(uint32_t generation,bool authenticated,bool qualified) {
    if (stage_!=Stage::Armed || !generation) return;
    controller_=generation; candidate_pending_=true;
    candidate_authenticated_=authenticated; candidate_qualified_=qualified;
}
void WakeOnLan::controller_disconnected(uint32_t generation) {
    if (controller_==generation && candidate_pending_) {
        candidate_pending_=false; controller_=0;
    }
    // Only the USB-first wait depends on the controller. Once a non-test attempt
    // is joining Wi-Fi the qualified press is enough: host return, deadlines and
    // teardown still end it. Test mode cancels through its setup-idle check.
    if (controller_==generation && !testing_ && stage_==Stage::UsbFirst) controller_lost_=true;
}
void WakeOnLan::poll(uint64_t now,bool host_active,bool external_suspended,
                     bool controllers_quiet,bool idle_for_setup,bool radio_ready,bool firmware_host) {
    now_=now; setup_idle_=idle_for_setup;
    // Only enumeration by a host that is not running its firmware counts toward
    // a returned host. BIOS/UEFI keyboard drivers select the HID boot protocol
    // (firmware_host); a BIOS screen can be held indefinitely (BitLocker PIN,
    // boot menu) and is followed by the OS handoff drop, so its session never
    // counts. A host that gives no signal is judged by time alone. Continuity
    // restarts whenever counting resumes (bus-down, reset, remount, firmware to
    // OS), at COMMIT, and when an attempt starts.
    const bool counting=host_active && !firmware_host;
    if (counting && !host_counting_) host_active_since_=now;
    host_counting_=counting;
    host_active_=host_active;
    // A returned host ends feature-owned USB wake suppression; scope rule 3
    // applies only while the host stays down.
    if (host_active) usb_wake_suppressed_=false;
    // After a packet, 45 s of counted enumeration is a returned host; 5 min caps
    // a PC that never boots, so the controller does not stay on indefinitely.
    if (host_starting_ && ((counting && now_-host_active_since_>=kHostReturnMs)
                           || now_-complete_at_>=kHostStartingCapMs)) host_starting_=false;
    // The host-active observation needs the same 45 s on every path, so a BIOS
    // session never establishes it. Consequence: with the companion closed, a
    // sleep or shutdown within 45 s of the host becoming active (right after
    // boot or resume) does not arm Wake-on-LAN; a host PREPARE/COMMIT still
    // does, and raw USB wake is unaffected.
    if (counting && !host_starting_ && now_-host_active_since_>=kHostReturnMs) host_seen_=true;
    if (recovery_required()) return;
    if (!running() && radio_active()) {
        stage_=Stage::RadioFault; error_=Error::RadioTeardown; store_marker(true); return;
    }
    if (staging_present_ && !testing_ && now_-staging_at_>=30000) clear_staging();
    if (standalone_ready() && external_suspended) {
        // Debounce short bus resets and re-enumerations before claiming the
        // transition. The USB sleep-disconnect policy uses the same interval.
        if (!down_tracking_) { down_tracking_=true; down_at_=now_; }
        if (now_-down_at_>=3000) {
            host_seen_=false; down_tracking_=false; standalone_=true; committed_=true;
            enter_preparing();
        }
    } else down_tracking_=false;
    if (stage_==Stage::Preparing) {
        if (standalone_) {
            // Without a host session there is no deadline: the bridge waits for the
            // controller to go quiet, and a returning host simply ends the transition.
            if (host_active || !external_suspended) {
                stage_=Stage::Idle; error_=Error::None; standalone_=false; committed_=false;
                quiet_tracking_=false; return;
            }
        } else {
            // A bus-down is corroborated after the same 3 s debounce as bridge
            // arming, so a brief port reset and re-enumeration does not count.
            if (external_suspended) {
                if (!prepared_down_tracking_) { prepared_down_tracking_=true; prepared_down_at_=now_; }
                if (now_-prepared_down_at_>=3000) prepared_down_seen_=true;
            } else {
                prepared_down_tracking_=false;
                if (host_active && prepared_down_seen_) {
                    // Positive host activity after corroborated bus-down invalidates
                    // the authorization (a restart, or a sleep the PC left at once).
                    if (committed_) finish(Error::Cancelled);
                    else { stage_=Stage::Idle; error_=Error::None; quiet_tracking_=false; prepared_down_seen_=false; }
                    return;
                }
            }
            // The 30 s window bounds a preparation without corroborated bus-down.
            // Once the bus has gone down (or while a bus-down is being
            // debounced), a committed transition waits for the controller to go
            // quiet with no deadline, like a bridge-armed one; only the host's
            // return ends it. An uncommitted PREPARE keeps the window (the bridge
            // takes it over after its 3 s debounce if it can).
            if ((!committed_ || (!prepared_down_seen_ && !prepared_down_tracking_))
                && now_-stage_at_>=30000) { finish(Error::Timeout); return; }
        }
        if (committed_ && external_suspended && controllers_quiet) {
            if (!quiet_tracking_) { quiet_tracking_=true; quiet_at_=now_; }
            if (now_-quiet_at_>=1000) {
                stage_=Stage::Armed; quiet_tracking_=false; candidate_pending_=false; controller_=0;
            }
        } else quiet_tracking_=false;
        return;
    }
    if (stage_==Stage::Armed) {
        if (host_active || !external_suspended) { finish(Error::Cancelled); return; }
        if (candidate_pending_) {
            candidate_pending_=false;
            if (!candidate_authenticated_ || !candidate_qualified_) return;
            committed_=false; controller_lost_=false; packets_=0; error_=Error::None;
            stage_=Stage::UsbFirst; stage_at_=now_; usb_request_=true;
            // The attempt consumes the power cycle and restarts continuity.
            host_seen_=false; host_active_since_=now_;
        }
        return;
    }
    if (!testing_ && running() && stage_!=Stage::Teardown) {
        if (host_active || !external_suspended) { cancel(Error::None); return; }
        if (controller_lost_) {
            controller_lost_=false;
            if (stage_==Stage::UsbFirst) { cancel(Error::ControllerUnavailable); return; }
        }
    }
    if (testing_ && !idle_for_setup && stage_!=Stage::Teardown) {
        cancel(Error::Busy); return;
    }
    if (stage_==Stage::UsbFirst) {
        if (now_-stage_at_>=1000 && radio_ready) start_radio();
        else if (now_-stage_at_>=2000) cancel(Error::Busy);
        return;
    }
    if (stage_==Stage::Testing) {
        if (radio_ready) start_radio();
        else if (now_-stage_at_>=1000) cancel(Error::Busy);
        return;
    }
    if (stage_==Stage::Joining || stage_==Stage::Sending) {
        if (now_-attempt_at_>=10000) { cancel(Error::Timeout); return; }
        const auto rs=ports_.radio_state(ports_.context);
        if (rs==RadioState::Fault || rs==RadioState::Idle) {
            auto error=ports_.radio_error ? ports_.radio_error(ports_.context):Error::NetworkUnavailable;
            cancel(error==Error::None ? Error::NetworkUnavailable:error); return;
        }
        if (stage_==Stage::Joining) {
            if (rs==RadioState::Ready) { stage_=Stage::Sending; stage_at_=now_-100; }
            else if (now_-stage_at_>=8000) {
                // While joining, the radio reports NetworkUnavailable when a
                // re-scan after "no network" has not reached the access point
                // (no AUTH or LINK progress since). That is a network problem,
                // not a weak-signal or handshake timeout.
                const auto hint=ports_.radio_error ? ports_.radio_error(ports_.context):Error::None;
                cancel(hint==Error::NetworkUnavailable ? Error::NetworkUnavailable:Error::Timeout); return;
            }
        }
        if (stage_==Stage::Sending && packets_<3 && now_-stage_at_>=100) {
            const auto &config=testing_ ? staging_:saved_.config;
            if (!ports_.send(config.data()+8,ports_.context)) { cancel(Error::SendFailed); return; }
            ++packets_; stage_at_=now_; store_marker(true);
        } else if (stage_==Stage::Sending && packets_==3 && now_-stage_at_>=300) {
            cancel(Error::None);
        }
        return;
    }
    if (stage_==Stage::Teardown) {
        if (!radio_active()) { finish(error_); return; }
        if (ports_.radio_state(ports_.context)==RadioState::Fault || now_-stage_at_>=kTeardownDeadlineMs) {
            stage_=Stage::RadioFault; error_=Error::RadioTeardown; validated_=false; store_marker(true);
        }
    }
}
uint8_t WakeOnLan::command(uint16_t opcode,const uint8_t *p,size_t n) {
    if (opcode<1 || opcode>10) return AckUnknownCommand;
    if (recovery_required()) return AckBusy;
    if (!configured_ok_) return AckPersistenceFailed;
    size_t used=4;
    switch (opcode) {
    case 1: used=10; break;
    case 2: if (!p || n<7) return AckBadLength; used=7+p[6]; break;
    case 6: used=5; break;
    case 8: case 9: used=18; break;
    case 10: used=8; break;
    default: break;
    }
    if (!padded(p,n,used)) return AckBadLength;
    const uint32_t id=read_u32(p);
    if (!id && opcode!=6 && opcode!=7) return AckInvalidValue;
    if (opcode==10) {
        if (!read_u32(p+4)) return AckInvalidValue;
        if (session_!=id || epoch_!=read_u32(p+4)) return reject(Error::BadTransaction,AckInvalidValue);
        if (stage_==Stage::Preparing || stage_==Stage::Armed || (!testing_ && running())) cancel(Error::Cancelled);
        return AckOk;
    }
    if (opcode==8 || opcode==9) {
        const uint32_t epoch=read_u32(p+4);
        if (!epoch) return AckInvalidValue;
        // A saved FI/IE record is treated as not configured for power transitions.
        if (!armable()) return reject(Error::NotConfigured,AckInvalidValue);
        if (read_u32(p+8)!=saved_.generation || std::memcmp(p+12,saved_.config.data()+8,6))
            return reject(Error::HostMismatch,AckUnauthorized);
        if (staging_present_ || running() || radio_active()) return AckBusy;
        if (opcode==8) {
            if (session_==id && epoch_==epoch) return stage_==Stage::Preparing ? AckOk:AckInvalidValue;
            if (!host_active_ || (session_==id && epoch<=epoch_)) return AckInvalidValue;
            release_unused_commit(); // A superseding PREPARE abandons the old commit.
            session_=id; epoch_=epoch; enter_preparing();
            committed_=false; standalone_=false; down_tracking_=false; host_starting_=false;
            prepared_down_seen_=false; prepared_down_tracking_=false; usb_wake_suppressed_=false; return AckOk;
        }
        if (stage_!=Stage::Preparing || session_!=id || epoch_!=epoch || now_-stage_at_>=30000)
            return reject(Error::BadTransaction,AckInvalidValue);
        // COMMIT consumes the host-active observation and restarts continuity, so
        // the host-active polls that follow before the bus goes down cannot
        // re-establish it and authorize a second, bridge-armed attempt.
        if (!committed_) seen_at_commit_=host_seen_;
        committed_=true; host_seen_=false; host_active_since_=now_; return AckOk;
    }
    if (opcode==5) {
        if (!staging_present_ || transaction_!=id) return reject(Error::BadTransaction,AckInvalidValue);
        if (testing_ && running()) cancel(Error::Cancelled);
        clear_staging(); return AckOk;
    }
    if (running() || radio_active() || !setup_idle_ || !host_active_
        || stage_==Stage::Preparing || stage_==Stage::Armed) return AckBusy;
    if (opcode==1) {
        if (u16(p+4)!=kConfigSize) return AckInvalidValue;
        if (staging_present_) {
            if (transaction_!=id || staging_crc_!=read_u32(p+6)) return AckBusy;
            staging_at_=now_; return AckOk;
        }
        if (saved_.transaction==id) return reject(Error::BadTransaction,AckInvalidValue);
        clear_staging(); transaction_=id; staging_crc_=read_u32(p+6);
        staging_present_=true; staging_at_=now_; error_=Error::None; stage_=Stage::Idle;
        usb_wake_suppressed_=false; return AckOk;
    }
    if (opcode==6 || opcode==7) {
        if (staging_present_) return AckBusy;
        if (id!=saved_.generation) return reject(Error::BadTransaction,AckInvalidValue);
        if (opcode==6 && (!saved_.configured || p[4]>1)) return AckInvalidValue;
        // A saved FI/IE record can be disabled or forgotten but never enabled:
        // every join in that region fails the radio's region check.
        if (opcode==6 && p[4] && !radio_country(saved_.config[4],saved_.config[5]))
            return reject(Error::InvalidConfig,AckInvalidValue);
        if (opcode==6 && saved_.config[6]==p[4]) { usb_wake_suppressed_=false; return AckOk; }
        // A successful load/save has already scrubbed the inactive slot. A
        // repeated Forget has no credential left to erase or record to change.
        if (opcode==7 && !saved_.configured) {
            stage_=Stage::Idle; error_=Error::None; usb_wake_suppressed_=false; return AckOk;
        }
        StoredRecord updated=saved_; updated.transaction=0;
        if (opcode==7) { erase_secret(updated.config.data(),updated.config.size()); updated.configured=false; }
        else updated.config[6]=p[4];
        const bool ok=persist(updated); erase_secret(&updated,sizeof(updated));
        if (!ok) return reject(Error::Persistence,AckPersistenceFailed);
        stage_=Stage::Idle; error_=Error::None; usb_wake_suppressed_=false; return AckOk;
    }
    if (opcode==4 && !staging_present_ && saved_.transaction==id) return AckOk;
    if (!staging_present_ || transaction_!=id) return reject(Error::BadTransaction,AckInvalidValue);
    staging_at_=now_;
    if (opcode==2) {
        const size_t offset=u16(p+4), count=p[6];
        if (!count || count>46 || offset+count>kConfigSize || offset>written_) return AckInvalidValue;
        if (offset<written_) {
            if (offset+count>written_ || std::memcmp(staging_.data()+offset,p+7,count)) return AckInvalidValue;
            return AckOk;
        }
        validated_=false; std::memcpy(staging_.data()+offset,p+7,count); written_+=count; return AckOk;
    }
    // New configurations must name a region the radio can join; saved legacy
    // FI/IE records still load, enable and forget.
    if (written_!=kConfigSize || !valid_config(staging_) || !radio_country(staging_[4],staging_[5])
        || crc32_seeded(staging_.data(),staging_.size(),0)!=staging_crc_)
        return reject(Error::InvalidConfig,AckInvalidValue);
    if (opcode==3) {
        testing_=true; validated_=false; packets_=0; error_=Error::None;
        stage_=Stage::Testing; stage_at_=now_; return AckOk;
    }
    if (opcode==4) {
        if (!validated_) return AckBusy;
        StoredRecord updated{}; updated.config=staging_; updated.transaction=id; updated.configured=true;
        const bool ok=persist(updated); erase_secret(&updated,sizeof(updated));
        if (!ok) return reject(Error::Persistence,AckPersistenceFailed);
        clear_staging(); stage_=Stage::Complete; error_=Error::None; return AckOk;
    }
    return AckUnknownCommand;
}
void WakeOnLan::encode_status(uint8_t *out,size_t length) const {
    if (!out || length<64) return;
    std::memset(out,0,64); out[0]=kStatusReportId; std::memcpy(out+1,"DS5B",4); out[5]=1; out[6]=kProtocolMinor; out[7]=1;
    out[8]=(saved_.configured ? 1|4:0) | ((saved_.configured && saved_.config[6]) ? 2:0)
        | (radio_active() ? 8:0) | (staging_present_ ? 16:0) | (validated_ ? 32:0);
    out[9]=static_cast<uint8_t>(stage_); out[10]=static_cast<uint8_t>(error_); out[11]=packets_;
    write_u32(out+12,saved_.generation); write_u32(out+16,transaction_ ? transaction_:saved_.transaction);
    if (saved_.configured) {
        std::memcpy(out+20,saved_.config.data()+8,6); out[26]=saved_.config[2];
        std::memcpy(out+27,saved_.config.data()+14,32);
        out[59]=saved_.config[4]; out[60]=saved_.config[5]; out[61]=saved_.config[1];
    }
}
}
