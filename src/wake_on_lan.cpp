#include "wake_on_lan.h"
#include <cstring>
#include "pico.h"
#include "utils.h"

// Ported from Kitsune Input's Wake-on-LAN radio adapter.

#ifdef ENABLE_COMPANION
#include "wake_on_lan_engine.h"
#include "wake_on_lan_store.h"
#include "watchdog_telemetry.h"
#include "pico/cyw43_arch.h"
extern "C" {
#include "cyw43_ll.h"
}
#include "pico/btstack_flash_bank.h"
#include "pico/flash.h"
#include "pico/time.h"
#include "hardware/flash.h"
#include "hardware/watchdog.h"
#include "hardware/structs/watchdog.h"
#include "hardware/regs/addressmap.h"

extern "C" char __flash_binary_end;
extern "C" {
// Read by the generated CYW43 control copy (cmake/patches/cyw43_wol_guards.inc):
// WLAN events and deferred join work are dropped while this is false.
volatile bool ds5_cyw43_wlan_allowed=false;
}
volatile bool wake_on_lan_quiet_cached=false;
namespace {
using namespace ds5::wake_on_lan;
// Two A/B sectors directly below the bootloader authorization sector, which
// sits directly below BTstack's storage bank.
constexpr uint32_t kOffset=PICO_FLASH_BANK_STORAGE_OFFSET-3*FLASH_SECTOR_SIZE;
static_assert(PICO_FLASH_BANK_STORAGE_OFFSET>=3*FLASH_SECTOR_SIZE);
static_assert(FLASH_PAGE_SIZE==256 && FLASH_SECTOR_SIZE==4096);
static_assert(kOffset+2*FLASH_SECTOR_SIZE==PICO_FLASH_BANK_STORAGE_OFFSET-FLASH_SECTOR_SIZE);
// main() runs the loop under watchdog_enable(1000, true).
constexpr uint32_t kRuntimeWatchdogTimeoutMs=1000;
RadioState radio=RadioState::Idle;
Error radio_error=Error::None;
bool query_supported=false, touched_radio=false;
uint64_t stopped_at=0;
bool initialized=false;
volatile bool &cached_quiet=wake_on_lan_quiet_cached;
// The configuration being joined lives in the engine (saved record or test
// staging) for the whole attempt; stop() drops this reference first.
const Config *join_config=nullptr;
JoinRetry join_retry;
// What the last attempt reached and which teardown check failed, for the
// reset evidence a RadioFault recovery leaves (wake_on_lan_fault_detail()).
TeardownEvidence teardown;
// Teardown verification: stop() sends DOWN, then poll_radio() asks GET_UP
// once per main-loop pass until it reads down.
uint64_t stop_began=0, asked_at=0;
bool down_confirmed=false;
uint8_t questions=0;
// Start of the current attempt or teardown, for the watchdog breadcrumb.
uint64_t step_epoch=0;
uint64_t now_ms() { return to_us_since_boot(get_absolute_time())/1000; }
// Watchdog breadcrumb for the blocking CYW43 call that follows: a freeze
// inside it reports the step, the time since step_epoch and what teardown has
// seen so far (Settings > Last Restart, Copy). WatchdogWindow clears it.
void note_step(RadioStep step) {
    RadioTrace trace; trace.step=step; trace.questions=questions;
    trace.elapsed_ms=uint32_t(now_ms()-step_epoch); trace.down=teardown.down; trace.up=teardown.up;
    trace.packets=teardown.packets;
    watchdog_telemetry_note_detail(pack_radio_trace(trace));
}
// Firmware ABI command IDs defined by Broadcom's public fwil/wlioctl headers.
// CYW43 encodes get/set in bit0; raw command number occupies the remaining bits.
constexpr uint32_t kSetDown=(3u<<1)|1u, kGetUp=162u<<1;
// cyw43_ctrl.c's private WIFI_JOIN_STATE_AUTH and WIFI_JOIN_STATE_LINK bits
// (checked against the pinned driver by cyw43_wol_patch_contract).
constexpr uint32_t kJoinAuth=0x0200, kJoinLink=0x0400;
// GET_UP readback is a firmware-state check, not RF/performance qualification.
// Each window also names its step in the watchdog telemetry, so a reset inside
// a synchronous CYW43 operation reports which one.
struct WatchdogWindow {
    explicit WatchdogWindow(WatchdogMainLoopPhase step,uint32_t timeout_ms=5000)
        : enclosing(watchdog_telemetry_current_phase()) {
        watchdog_telemetry_note_phase(step); watchdog_enable(timeout_ms,true); watchdog_update();
    }
    ~WatchdogWindow() {
        watchdog_enable(kRuntimeWatchdogTimeoutMs,true); watchdog_update();
        watchdog_telemetry_note_phase(enclosing); watchdog_telemetry_note_detail(0);
    }
    WatchdogMainLoopPhase enclosing;
};
bool region_available() {
    return reinterpret_cast<uintptr_t>(&__flash_binary_end)-XIP_BASE<=kOffset;
}
uintptr_t flash_base() {
#if PICO_RP2040
    return XIP_BASE;
#else
    return XIP_NOCACHE_NOALLOC_NOTRANSLATE_BASE;
#endif
}
bool flash_read(uint32_t offset,uint8_t *out,size_t length,void *) {
    if (!region_available() || offset>8192 || length>8192-offset) return false;
    std::memcpy(out,reinterpret_cast<const void *>(flash_base()+kOffset+offset),length); return true;
}
// flash_range_program() requires a page-aligned flash offset, not an aligned
// source buffer (hardware/flash.h); the ROM routine reads the data bytewise.
// Without alignas(256) the save path keeps a 264-byte frame instead of a
// realigned 512-byte one on the core-0 stack.
struct FlashMutation {
    uint32_t offset; bool erase;
    uint8_t page[FLASH_PAGE_SIZE];
};
void __no_inline_not_in_flash_func(flash_mutate)(void *context) {
    const auto &m=*static_cast<FlashMutation *>(context);
    if (m.erase) flash_range_erase(m.offset,FLASH_SECTOR_SIZE);
    else flash_range_program(m.offset,m.page,FLASH_PAGE_SIZE);
}
bool flash_apply(FlashMutation &m) {
    WatchdogWindow window(WatchdogMainLoopPhase::WakeOnLanStorage);
    const bool ok=flash_safe_execute(flash_mutate,&m,500)==PICO_OK;
    erase_secret(m.page,sizeof(m.page)); return ok;
}
bool flash_erase(unsigned slot,void *) {
    if (!region_available() || slot>1) return false;
    FlashMutation m{}; m.offset=kOffset+slot*FLASH_SECTOR_SIZE; m.erase=true; return flash_apply(m);
}
bool flash_program(uint32_t offset,const uint8_t *page,void *) {
    if (!region_available() || offset%FLASH_PAGE_SIZE || offset>8192-FLASH_PAGE_SIZE) return false;
    FlashMutation m{}; m.offset=kOffset+offset; std::memcpy(m.page,page,FLASH_PAGE_SIZE); return flash_apply(m);
}
WakeOnLanStore store({nullptr,flash_read,flash_erase,flash_program});
bool save(const StoredRecord &record,void *) { return store.save(record); }
void clear_join_work() {
    cyw43_state.pend_rejoin=false; cyw43_state.pend_rejoin_wpa=false; cyw43_state.pend_disassoc=false;
    cyw43_state.wifi_join_state=0; cyw43_state.wifi_scan_state=0;
    cyw43_state.wifi_scan_cb=nullptr; cyw43_state.wifi_scan_env=nullptr;
}
bool get_up(uint32_t expected) {
    uint8_t value[4]={0xa5,0xa5,0xa5,0xa5};
    return cyw43_ioctl(&cyw43_state,kGetUp,sizeof(value),value,CYW43_ITF_STA)==0
        && read_u32(value)==expected;
}
bool country_matches(const Config &config) {
    uint8_t value[12]{}; std::memcpy(value,"country",7);
    return cyw43_ioctl(&cyw43_state,CYW43_IOCTL_GET_VAR,sizeof(value),value,CYW43_ITF_STA)==0
        && value[0]==config[4] && value[1]==config[5]
        && value[8]==config[4] && value[9]==config[5];
}
// WLAN work the driver still holds, as TeardownEvidence::pending bits.
uint8_t pending_work() {
    return (cyw43_state.itf_state ? 1:0) | (cyw43_state.wifi_join_state ? 2:0) | (cyw43_state.wifi_scan_state ? 4:0)
        | (cyw43_state.pend_rejoin ? 8:0) | (cyw43_state.pend_rejoin_wpa ? 16:0) | (cyw43_state.pend_disassoc ? 32:0);
}
bool pending_wifi() { return pending_work()!=0; }
void teardown_fault(TeardownCheck check) {
    radio=RadioState::Fault; radio_error=Error::RadioTeardown;
    teardown.check=check; teardown.pending=pending_work();
}
bool disable_wifi_events() {
    uint8_t request[41]{}; std::memcpy(request,"bsscfg:event_msgs",17);
    // Matches the pinned driver's 18-byte name field + 4-byte BSS index + mask.
    return cyw43_ioctl(&cyw43_state,CYW43_IOCTL_SET_VAR,sizeof(request),request,CYW43_ITF_STA)==0;
}
DownResult set_down() {
    uint8_t value[4]={1,0,0,0};
    const int result=cyw43_ioctl(&cyw43_state,kSetDown,sizeof(value),value,CYW43_ITF_STA);
    return result==0 ? DownResult::Ok : result==-CYW43_EIO ? DownResult::Rejected
        : result==-CYW43_ETIMEDOUT ? DownResult::TimedOut : DownResult::OtherError;
}
UpReadback read_up() {
    uint8_t value[4]={0xa5,0xa5,0xa5,0xa5};
    if (cyw43_ioctl(&cyw43_state,kGetUp,sizeof(value),value,CYW43_ITF_STA)!=0) return UpReadback::Failed;
    return read_u32(value)==0 ? UpReadback::Down:UpReadback::Up;
}
// A CYW43 ioctl can wait up to 1 s for send credit and 1 s for its reply.
// stop() blocks for two (mask and DOWN); verification asks GET_UP in later
// main-loop passes, one question each, until kVerifyWindowMs after stop began.
constexpr uint32_t kTeardownWatchdogMs=12000;
constexpr uint64_t kVerifyWindowMs=5000;
constexpr uint64_t kVerifyGapMs=100;
void stop(void *) {
    // The engine calls stop() again when a cancel (an ABORT or a power-cancel)
    // arrives during Teardown. A teardown already under way keeps verifying,
    // and a teardown fault stays a fault. A join fault still needs teardown.
    if (radio==RadioState::Stopping || (radio==RadioState::Fault && radio_error==Error::RadioTeardown)) return;
    WatchdogWindow window(WatchdogMainLoopPhase::WifiStop,kTeardownWatchdogMs);
    stop_began=step_epoch=now_ms(); questions=0; down_confirmed=false;
    ds5_cyw43_wlan_allowed=false; radio=RadioState::Stopping;
    join_config=nullptr; join_retry={};
    clear_join_work();
    // WLAN DOWN stops in-progress association/scans in firmware. Mask WLAN
    // events before draining old packets; Bluetooth HCI uses its own channel.
    note_step(RadioStep::Mask);
    const bool masked=disable_wifi_events();
    [[maybe_unused]] const uint64_t masked_at=now_ms();
    teardown.slow_mask=masked_at-stop_began>=500;
    // No SET_DISASSOC before DOWN. Kitsune Input added one on 2026-10-10
    // without hardware validation; its hardware-verified teardown goes
    // straight to DOWN.
    cyw43_arch_disable_sta_mode();
    note_step(RadioStep::Down);
    teardown.down=set_down();
    clear_join_work(); cyw43_state.itf_state=0;
    // poll_radio() asks GET_UP on the next pass.
    asked_at=now_ms()-kVerifyGapMs; teardown.stop_ms=uint32_t(now_ms()-stop_began);
    DS5_LOG("[WOL] stop: mask=%u (%lu ms) down=%u (%lu ms)\n",
        masked ? 1u:0u, static_cast<unsigned long>(masked_at-stop_began),
        static_cast<unsigned>(teardown.down), static_cast<unsigned long>(now_ms()-masked_at));
    if (!masked) teardown_fault(TeardownCheck::EventMask);
    else if (!query_supported) teardown_fault(TeardownCheck::UpQueryUnsupported);
}
// GET_UP reading down is the proof that WLAN stopped, not DOWN's own reply. On
// a Waveshare RP2350B-Plus-W (RM2 module), DOWN's reply never arrives after a
// successful join: the firmware finishes DOWN late and then answers GET_UP,
// sometimes only after one more question has timed out. So keep asking, one
// question per main-loop pass so Bluetooth and USB are serviced in between,
// until kVerifyWindowMs after stop began. A firmware that answers "still up"
// gets DOWN once more. The drain and its final check follow a "down" answer.
void verify_down() {
    WatchdogWindow window(WatchdogMainLoopPhase::WifiStop);
    if (questions<UINT8_MAX) ++questions;
    note_step(RadioStep::AskUp);
    teardown.up=read_up(); asked_at=now_ms();
    DS5_LOG("[WOL] GET_UP %u at +%lu ms: %u\n", static_cast<unsigned>(questions),
        static_cast<unsigned long>(asked_at-stop_began), static_cast<unsigned>(teardown.up));
    if (teardown.up==UpReadback::Down) {
        down_confirmed=true; stopped_at=asked_at; teardown.stop_ms=uint32_t(asked_at-stop_began);
    } else if (asked_at-stop_began>=kVerifyWindowMs) {
        teardown.stop_ms=uint32_t(asked_at-stop_began);
        teardown_fault(teardown.down!=DownResult::Ok ? TeardownCheck::Down : TeardownCheck::StillUp);
    } else if (teardown.up==UpReadback::Up && !teardown.down_retried) {
        teardown.down_retried=true; note_step(RadioStep::RetryDown); (void)set_down();
    }
}
int join(const Config &config) {
    // The generated join (cmake/patches/cyw43_wol_join.inc) resets the join
    // state before each SET_SSID, so it can be re-issued after NONET.
    return cyw43_wifi_join(&cyw43_state,config[2],config.data()+14,
        config[3],config.data()+46,CYW43_AUTH_WPA2_AES_PSK,nullptr,CYW43_CHANNEL_NONE);
}
Error start(const Config &config,void *) {
    if (radio!=RadioState::Idle || !valid_config(config)) return Error::Busy;
    WatchdogWindow window(WatchdogMainLoopPhase::WifiStart);
    touched_radio=true; ds5_cyw43_wlan_allowed=true; query_supported=false;
    radio=RadioState::Joining; radio_error=Error::None; clear_join_work();
    join_config=nullptr; join_retry.start(now_ms()); teardown={}; questions=0;
    step_epoch=now_ms(); note_step(RadioStep::Start);
    const uint32_t country=uint32_t(config[4]) | uint32_t(config[5])<<8;
    cyw43_wifi_set_up(&cyw43_state,CYW43_ITF_STA,true,country);
    // Reject unsupported GET_UP before using its DOWN response as evidence.
    query_supported=get_up(1);
    const bool station_up=cyw43_state.itf_state&1;
    const bool region=query_supported && station_up && country_matches(config);
    teardown.progress=(station_up ? kStartStationUp:0) | (query_supported ? kStartUpConfirmed:0)
        | (region ? kStartRegionMatched:0);
    if (!region) {
        DS5_LOG("[WOL] start: progress=0x%02x, not joining\n", static_cast<unsigned>(teardown.progress));
        return Error::NetworkUnavailable;
    }
    join_config=&config;
    const int joined=join(config);
    DS5_LOG("[WOL] start: progress=0x%02x join=%d\n", static_cast<unsigned>(teardown.progress), joined);
    if (joined!=0) return Error::NetworkUnavailable;
    teardown.progress|=kStartJoinIssued; return Error::None;
}
RadioState state(void *) { return radio; }
Error last_error(void *) {
    // While joining, flag a re-scan that never reached the access point so the
    // engine reports NetworkUnavailable instead of Timeout at its deadline.
    if (radio==RadioState::Joining && join_retry.unanswered()) return Error::NetworkUnavailable;
    return radio_error;
}
bool send(const uint8_t *target,void *) {
    if (radio!=RadioState::Ready || !ds5_cyw43_wlan_allowed) return false;
    uint8_t frame[kFrameSize]; magic_frame(cyw43_state.mac,target,frame);
    WatchdogWindow window(WatchdogMainLoopPhase::WifiSend);
    note_step(RadioStep::Send);
    const bool sent=cyw43_send_ethernet(&cyw43_state,CYW43_ITF_STA,sizeof(frame),frame,false)==0;
    if (sent && teardown.packets<3) ++teardown.packets;
    return sent;
}
// Watchdog SCRATCH0-3 hold watchdog telemetry (watchdog_telemetry.cpp), and
// the SDK writes SCRATCH4 on every watchdog_enable()/watchdog_reboot().
// SCRATCH5-7 are written only by watchdog_reboot() with a nonzero entry point,
// which this firmware never uses, and by the bootrom's own reboot paths
// (BOOTSEL, RAM image). They survive the RadioFault recovery's watchdog reset
// and a watchdog timeout, and are cleared by power-on reset. A magic and a
// check word reject stale bootrom values; SCRATCH4 is never written here, so
// the words can never form a bootrom watchdog-boot request.
constexpr unsigned kMarkerScratch=5;
static_assert(kMarkerScratch+kRadioMarkerWords==8);
void write_marker(const uint32_t *words,void *) {
    for (size_t i=0;i<kRadioMarkerWords;++i) watchdog_hw->scratch[kMarkerScratch+i]=words[i];
}
WakeOnLan engine({nullptr,save,start,state,last_error,send,stop,write_marker});
void poll_radio(uint64_t now) {
    if (radio==RadioState::Stopping) {
        // CYW43 polling in the ordinary top-level loop drains queued firmware
        // events during this grace period. A late rejoin is a failure, not proof
        // that assigning software fields has stopped a radio transmission.
        if (pending_wifi()) {
            DS5_LOG("[WOL] drain: late WLAN work 0x%02x\n", static_cast<unsigned>(pending_work()));
            teardown_fault(TeardownCheck::LateWork); return;
        }
        if (!down_confirmed) {
            if (now-asked_at>=kVerifyGapMs) verify_down();
            return;
        }
        if (now-stopped_at>=250) {
            WatchdogWindow window(WatchdogMainLoopPhase::WifiStop);
            note_step(RadioStep::FinalCheck);
            if (!get_up(0) || pending_wifi()) teardown_fault(TeardownCheck::FinalCheck);
            else radio=RadioState::Idle;
            DS5_LOG("[WOL] drain check: radio=%u\n", static_cast<unsigned>(radio));
        }
    } else if (radio==RadioState::Joining) {
        if (join_retry.pending()) {
            if (!join_retry.due(now)) return;
            join_retry.issued();
            WatchdogWindow window(WatchdogMainLoopPhase::WifiJoin);
            note_step(RadioStep::Join);
            if (!join_config || join(*join_config)!=0) { radio_error=Error::NetworkUnavailable; radio=RadioState::Fault; }
            return;
        }
        if (cyw43_state.wifi_join_state & (kJoinAuth|kJoinLink)) join_retry.note_progress();
        const int link=cyw43_wifi_link_status(&cyw43_state,CYW43_ITF_STA);
        // One scan can miss the access point. Re-scan after a short back-off
        // while the Joining budget allows; FAIL and BADAUTH end the attempt.
        if (link==CYW43_LINK_NONET && join_retry.on_no_network(now)) return;
        if (link<0) {
            radio_error=link==CYW43_LINK_BADAUTH ? Error::Authentication:Error::NetworkUnavailable;
            radio=RadioState::Fault;
        }
    } else if (radio==RadioState::Idle && touched_radio && pending_wifi()) {
        teardown_fault(TeardownCheck::WorkAfterIdle);
    }
}
}
// The no-lwIP SDK defaults panic on link events and RX. These callbacks only
// publish state; never send a frame, mutate flash, or recursively poll here.
extern "C" void cyw43_cb_tcpip_init(cyw43_t *,int) {}
extern "C" void cyw43_cb_tcpip_deinit(cyw43_t *,int) {}
extern "C" void cyw43_cb_tcpip_set_link_up(cyw43_t *,int itf) {
    if (itf==CYW43_ITF_STA && ds5_cyw43_wlan_allowed && radio==RadioState::Joining) {
        radio=RadioState::Ready; teardown.progress|=kStartLinkUp;
    }
}
extern "C" void cyw43_cb_tcpip_set_link_down(cyw43_t *,int itf) {
    if (itf==CYW43_ITF_STA && ds5_cyw43_wlan_allowed && radio==RadioState::Ready) {
        radio=RadioState::Fault; radio_error=Error::NetworkUnavailable;
    }
}
extern "C" void cyw43_cb_process_ethernet(void *,int,size_t,const uint8_t *) {}
extern "C" int cyw43_tcpip_link_status(cyw43_t *,int itf) {
    return itf==CYW43_ITF_STA && radio==RadioState::Ready ? CYW43_LINK_NOIP:CYW43_LINK_DOWN;
}
// The pinned raw sender references this symbol even with is_pbuf=false. This
// explicit rejection makes accidental pbuf use fail visibly without linking IP.
struct pbuf;
extern "C" uint16_t pbuf_copy_partial(const pbuf *,void *,uint16_t,uint16_t) {
    panic("WOL raw sender does not accept lwIP buffers");
}
void wake_on_lan_init() {
    if (initialized) return;
    StoredRecord saved{}; const bool ok=region_available() && store.load(saved);
    uint32_t marker[kRadioMarkerWords];
    for (size_t i=0;i<kRadioMarkerWords;++i) marker[i]=watchdog_hw->scratch[kMarkerScratch+i];
    engine.initialize(saved,ok,marker); erase_secret(&saved,sizeof(saved)); initialized=true;
    cached_quiet=engine.quiet_gate();
}
void wake_on_lan_poll(uint64_t now,bool host,bool suspended,bool quiet,bool idle,bool radio_ready,bool firmware_host) {
    if (!initialized) return;
    poll_radio(now); engine.poll(now,host,suspended,quiet,idle,radio_ready,firmware_host);
    cached_quiet=engine.quiet_gate();
}
void wake_on_lan_controller_connected(uint32_t generation,bool authenticated,bool qualified) {
    engine.controller_connected(generation,authenticated,qualified);
}
void wake_on_lan_controller_disconnected(uint32_t generation) { engine.controller_disconnected(generation); }
bool wake_on_lan_allow_usb_wake() { return engine.allow_usb_wake(); }
bool wake_on_lan_suspend_exempt() { return engine.suspend_exempt(); }
bool wake_on_lan_take_usb_wake_request() { return engine.take_usb_wake_request(); }
bool wake_on_lan_recovery_required() { return engine.recovery_required(); }
uint32_t wake_on_lan_fault_detail() {
    TeardownEvidence evidence=teardown; evidence.radio=radio;
    return pack_teardown_evidence(evidence);
}
bool wake_on_lan_preparing() { return engine.preparing(); }
bool wake_on_lan_host_prepared() { return engine.host_prepared(); }
bool wake_on_lan_armed() { return engine.armed(); }
uint8_t wake_on_lan_command(uint16_t op,const uint8_t *p,size_t n) {
    const uint8_t result=initialized ? engine.command(op,p,n):AckBusy;
    cached_quiet=engine.quiet_gate(); return result;
}
void wake_on_lan_encode_status(uint8_t *p,size_t n) { engine.encode_status(p,n); }
#else
void wake_on_lan_init() {}
void wake_on_lan_poll(uint64_t,bool,bool,bool,bool,bool,bool) {}
void wake_on_lan_controller_connected(uint32_t,bool,bool) {}
void wake_on_lan_controller_disconnected(uint32_t) {}
bool wake_on_lan_allow_usb_wake() { return true; }
bool wake_on_lan_suspend_exempt() { return false; }
bool wake_on_lan_take_usb_wake_request() { return false; }
bool wake_on_lan_recovery_required() { return false; }
uint32_t wake_on_lan_fault_detail() { return 0; }
bool wake_on_lan_preparing() { return false; }
bool wake_on_lan_host_prepared() { return false; }
bool wake_on_lan_armed() { return false; }
uint8_t wake_on_lan_command(uint16_t,const uint8_t *,size_t) { return 5; }
void wake_on_lan_encode_status(uint8_t *p,size_t n) { if (p && n>=64) std::memset(p,0,64); }
#endif
