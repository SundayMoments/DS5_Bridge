#include "wake_on_lan.h"
#include <cstring>
#include "pico.h"

// Ported from Kitsune Input's Wake-on-LAN radio adapter.

#ifdef ENABLE_COMPANION
#include "wake_on_lan_engine.h"
#include "wake_on_lan_store.h"
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
uint64_t now_ms() { return to_us_since_boot(get_absolute_time())/1000; }
// Firmware ABI command IDs defined by Broadcom's public fwil/wlioctl headers.
// CYW43 encodes get/set in bit0; raw command number occupies the remaining bits.
constexpr uint32_t kSetDown=(3u<<1)|1u, kGetUp=162u<<1;
// cyw43_ctrl.c's private WIFI_JOIN_STATE_AUTH and WIFI_JOIN_STATE_LINK bits
// (checked against the pinned driver by cyw43_wol_patch_contract).
constexpr uint32_t kJoinAuth=0x0200, kJoinLink=0x0400;
// GET_UP readback is a firmware-state check, not RF/performance qualification.
struct WatchdogWindow {
    WatchdogWindow() { watchdog_enable(5000,true); watchdog_update(); }
    ~WatchdogWindow() { watchdog_enable(kRuntimeWatchdogTimeoutMs,true); watchdog_update(); }
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
    WatchdogWindow window;
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
bool pending_wifi() {
    return cyw43_state.itf_state || cyw43_state.wifi_join_state || cyw43_state.wifi_scan_state
        || cyw43_state.pend_rejoin || cyw43_state.pend_rejoin_wpa || cyw43_state.pend_disassoc;
}
bool disable_wifi_events() {
    uint8_t request[41]{}; std::memcpy(request,"bsscfg:event_msgs",17);
    // Matches the pinned driver's 18-byte name field + 4-byte BSS index + mask.
    return cyw43_ioctl(&cyw43_state,CYW43_IOCTL_SET_VAR,sizeof(request),request,CYW43_ITF_STA)==0;
}
void stop(void *) {
    WatchdogWindow window;
    ds5_cyw43_wlan_allowed=false; radio=RadioState::Stopping;
    join_config=nullptr; join_retry={};
    clear_join_work();
    // WLAN DOWN stops in-progress association/scans in firmware. Mask WLAN
    // events before draining old packets; Bluetooth HCI uses its own channel.
    const bool masked=disable_wifi_events();
    // clear_join_work() has zeroed the join state, so the SDK's
    // cyw43_arch_disable_sta_mode() would skip its SET_DISASSOC. Disassociate
    // explicitly; the result is advisory. DOWN, its readback and the drain
    // check below remain the proof that WLAN stopped.
    (void)cyw43_wifi_leave(&cyw43_state,CYW43_ITF_STA);
    cyw43_arch_disable_sta_mode();
    uint8_t value[4]={1,0,0,0};
    const bool down=cyw43_ioctl(&cyw43_state,kSetDown,sizeof(value),value,CYW43_ITF_STA)==0;
    clear_join_work(); cyw43_state.itf_state=0;
    if (!masked || !down || !query_supported || !get_up(0)) {
        radio=RadioState::Fault; radio_error=Error::RadioTeardown; return;
    }
    stopped_at=to_us_since_boot(get_absolute_time())/1000;
}
int join(const Config &config) {
    // The generated join (cmake/patches/cyw43_wol_join.inc) resets the join
    // state before each SET_SSID, so it can be re-issued after NONET.
    return cyw43_wifi_join(&cyw43_state,config[2],config.data()+14,
        config[3],config.data()+46,CYW43_AUTH_WPA2_AES_PSK,nullptr,CYW43_CHANNEL_NONE);
}
Error start(const Config &config,void *) {
    if (radio!=RadioState::Idle || !valid_config(config)) return Error::Busy;
    WatchdogWindow window;
    touched_radio=true; ds5_cyw43_wlan_allowed=true; query_supported=false;
    radio=RadioState::Joining; radio_error=Error::None; clear_join_work();
    join_config=nullptr; join_retry.start(now_ms());
    const uint32_t country=uint32_t(config[4]) | uint32_t(config[5])<<8;
    cyw43_wifi_set_up(&cyw43_state,CYW43_ITF_STA,true,country);
    // Reject unsupported GET_UP before using its DOWN response as evidence.
    query_supported=get_up(1);
    if (!query_supported || !(cyw43_state.itf_state&1) || !country_matches(config)) return Error::NetworkUnavailable;
    join_config=&config;
    return join(config)==0 ? Error::None:Error::NetworkUnavailable;
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
    WatchdogWindow window;
    return cyw43_send_ethernet(&cyw43_state,CYW43_ITF_STA,sizeof(frame),frame,false)==0;
}
// Watchdog SCRATCH0-3 hold watchdog telemetry (watchdog_telemetry.cpp), and
// the SDK writes SCRATCH4 on every watchdog_enable()/watchdog_reboot().
// SCRATCH5-7 are written only by watchdog_reboot() with a nonzero entry point,
// which this firmware never uses, and by the bootrom's own reboot paths
// (BOOTSEL, RAM image). They survive the RadioFault watchdog_reboot(0, 0, 10)
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
            radio=RadioState::Fault; radio_error=Error::RadioTeardown; return;
        }
        if (now-stopped_at>=250) {
            WatchdogWindow window;
            if (!get_up(0) || pending_wifi()) { radio=RadioState::Fault; radio_error=Error::RadioTeardown; }
            else radio=RadioState::Idle;
        }
    } else if (radio==RadioState::Joining) {
        if (join_retry.pending()) {
            if (!join_retry.due(now)) return;
            join_retry.issued();
            WatchdogWindow window;
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
        radio=RadioState::Fault; radio_error=Error::RadioTeardown;
    }
}
}
// The no-lwIP SDK defaults panic on link events and RX. These callbacks only
// publish state; never send a frame, mutate flash, or recursively poll here.
extern "C" void cyw43_cb_tcpip_init(cyw43_t *,int) {}
extern "C" void cyw43_cb_tcpip_deinit(cyw43_t *,int) {}
extern "C" void cyw43_cb_tcpip_set_link_up(cyw43_t *,int itf) {
    if (itf==CYW43_ITF_STA && ds5_cyw43_wlan_allowed && radio==RadioState::Joining) radio=RadioState::Ready;
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
bool wake_on_lan_preparing() { return false; }
bool wake_on_lan_host_prepared() { return false; }
bool wake_on_lan_armed() { return false; }
uint8_t wake_on_lan_command(uint16_t,const uint8_t *,size_t) { return 5; }
void wake_on_lan_encode_status(uint8_t *p,size_t n) { if (p && n>=64) std::memset(p,0,64); }
#endif
