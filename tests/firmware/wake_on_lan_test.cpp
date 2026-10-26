// Ported from Kitsune Input's Wake-on-LAN.
#include "wake_on_lan_domain.h"
#include "wake_on_lan_crc32.h"
#include "wake_on_lan_engine.h"
#include "wake_on_lan_store.h"
#include <algorithm>
#include <array>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <string>

using namespace ds5::wake_on_lan;

using ds5::wake_on_lan::WakeOnLan;
using ds5::wake_on_lan::WakeOnLanStore;
#define CHECK(x) do { if (!(x)) { std::fprintf(stderr,"WOL check failed at line %d: %s\n",__LINE__,#x); std::abort(); } } while (0)

Config config(bool enabled=true) {
    Config c{}; c[0]=c[1]=1; c[2]=4; c[3]=12; c[4]='U'; c[5]='S'; c[6]=enabled;
    const uint8_t mac[]={0x02,0x23,0x45,0x67,0x89,0xab};
    std::memcpy(c.data()+8,mac,6); std::memcpy(c.data()+14,"Home",4);
    std::memcpy(c.data()+46,"test-password",12); return c;
}
StoredRecord record(uint32_t gen=1) { return {config(),gen,0x1234,true}; }
struct Radio {
    RadioState state=RadioState::Idle; Error error=Error::None, start_error=Error::None;
    unsigned starts=0,sends=0,stops=0,saves=0,marker_writes=0; bool save_ok=true,send_ok=true;
    StoredRecord saved{}; Config joined{}; std::array<uint32_t,kRadioMarkerWords> marker{};
    static Radio &self(void *p) { return *static_cast<Radio *>(p); }
    static bool save(const StoredRecord &r,void *p) { auto &s=self(p); ++s.saves; if (!s.save_ok) return false; s.saved=r; return true; }
    static Error start(const Config &c,void *p) { auto &s=self(p); ++s.starts; s.joined=c; s.state=RadioState::Joining; return s.start_error; }
    static RadioState status(void *p) { return self(p).state; }
    static Error last_error(void *p) { return self(p).error; }
    static bool send(const uint8_t *target,void *p) { auto &s=self(p); CHECK(!std::memcmp(target,s.joined.data()+8,6)); ++s.sends; return s.send_ok; }
    static void stop(void *p) { auto &s=self(p); ++s.stops; s.state=RadioState::Stopping; }
    static void write_marker(const uint32_t *words,void *p) {
        auto &s=self(p); ++s.marker_writes; std::copy(words,words+kRadioMarkerWords,s.marker.begin());
    }
    bool marker_clear() const { return std::all_of(marker.begin(),marker.end(),[](uint32_t w) { return w==0; }); }
    ds5::wake_on_lan::WakeOnLanPorts ports() { return {this,save,start,status,last_error,send,stop,write_marker}; }
};
struct Harness {
    // firmware: the host's current USB session selected the HID boot protocol.
    Radio radio; WakeOnLan engine{radio.ports()}; uint64_t now=100; uint32_t generation=100; bool firmware=false;
    // A host that is present starts with an established host-active
    // observation (45 s of continuous enumeration).
    explicit Harness(StoredRecord saved=record(),bool host=true,const uint32_t *marker=nullptr) {
        engine.initialize(saved,true,marker); tick(now,host,!host);
        if (host) tick(now+WakeOnLan::kHostReturnMs);
    }
    void tick(uint64_t t,bool host=true,bool suspended=false,bool quiet=true,bool idle=true) {
        now=t; engine.poll(t,host,suspended,quiet,idle,true,firmware);
    }
    // Hold one bus state for ms, polling like the main loop.
    void hold(uint64_t ms,bool host,bool suspended,bool quiet=true,uint64_t step=100) {
        for (uint64_t elapsed=0;elapsed<ms;) { const uint64_t dt=std::min(step,ms-elapsed); elapsed+=dt; tick(now+dt,host,suspended,quiet); }
    }
    std::array<uint8_t,64> status() { std::array<uint8_t,64> s{}; engine.encode_status(s.data(),s.size()); return s; }
    Stage stage() { return static_cast<Stage>(status()[9]); }
    Error error() { return static_cast<Error>(status()[10]); }
    uint8_t id_command(unsigned op,uint32_t id) { uint8_t p[4]; write_u32(p,id); return engine.command(op,p,4); }
    std::array<uint8_t,18> power(uint32_t session_id=3,uint32_t epoch=4,uint32_t gen=1) {
        std::array<uint8_t,18> p{}; write_u32(p.data(),session_id); write_u32(p.data()+4,epoch);
        write_u32(p.data()+8,gen); const auto c=config(); std::memcpy(p.data()+12,c.data()+8,6); return p;
    }
    void prepare_commit() {
        auto p=power(); CHECK(engine.command(8,p.data(),p.size())==AckOk);
        CHECK(engine.command(9,p.data(),p.size())==AckOk);
    }
    void arm() {
        auto p=power(); CHECK(engine.command(8,p.data(),p.size())==AckOk);
        CHECK(engine.preparing()); CHECK(!engine.allow_usb_wake());
        CHECK(engine.command(9,p.data(),p.size())==AckOk);
        tick(now+1,false,true); CHECK(!engine.armed());
        tick(now+1000,false,true); CHECK(engine.armed());
    }
    void upload(const Config &c,uint32_t id=55) {
        uint8_t begin[10]{}; write_u32(begin,id); begin[4]=112;
        write_u32(begin+6,crc32_seeded(c.data(),c.size(),0));
        CHECK(engine.command(1,begin,sizeof(begin))==AckOk);
        for (size_t offset=0;offset<c.size();) {
            const size_t n=std::min<size_t>(46,c.size()-offset); uint8_t p[53]{};
            write_u32(p,id); p[4]=uint8_t(offset); p[6]=uint8_t(n);
            std::memcpy(p+7,c.data()+offset,n);
            CHECK(engine.command(2,p,7+n)==AckOk);
            CHECK(engine.command(2,p,7+n)==AckOk); // Identical retried chunks.
            offset+=n;
        }
    }
    // Bus-down with no host session: 3 s debounce, then the 1 s quiet window.
    void self_arm(bool quiet=true) {
        tick(now+1,false,true,quiet); CHECK(!engine.preparing());
        tick(now+2999,false,true,quiet); CHECK(!engine.preparing());
        tick(now+1,false,true,quiet); CHECK(engine.preparing() && engine.standalone() && !engine.host_prepared());
        CHECK(!engine.allow_usb_wake());
        tick(now+1000,false,true,quiet); CHECK(engine.armed()==quiet);
    }
    void complete_attempt() {
        tick(now+1,false,true); CHECK(stage()==Stage::UsbFirst && engine.take_usb_wake_request());
        tick(now+1000,false,true); CHECK(radio.starts>0);
        radio.state=RadioState::Ready; tick(now+1,false,true); tick(now+100,false,true); tick(now+100,false,true);
        tick(now+300,false,true); CHECK(stage()==Stage::Teardown);
        radio.state=RadioState::Idle; tick(now+250,false,true); CHECK(stage()==Stage::Complete);
    }
    // A qualified press while the bus stays down; the radio joins (or fails)
    // on the next poll and tears down promptly.
    void press_attempt(bool join_ok=true) {
        engine.controller_connected(++generation,true,true);
        for (int i=0;i<1000;++i) {
            const Stage s=stage();
            if (!engine.armed() && s!=Stage::UsbFirst && s!=Stage::Joining && s!=Stage::Sending && s!=Stage::Teardown) break;
            tick(now+10,false,true,false);
            if (radio.state==RadioState::Joining) radio.state=join_ok ? RadioState::Ready:RadioState::Fault;
            else if (radio.state==RadioState::Stopping) radio.state=RadioState::Idle;
        }
        (void)engine.take_usb_wake_request();
    }
    void pass_test(uint32_t id=55) {
        CHECK(id_command(3,id)==AckOk); CHECK(engine.quiet_gate()); CHECK(radio.starts==0);
        tick(now+1); CHECK(radio.starts==1); CHECK(stage()==Stage::Joining);
        radio.state=RadioState::Ready; tick(now+1); CHECK(radio.sends==1);
        tick(now+100); tick(now+100); CHECK(radio.sends==3);
        tick(now+299); CHECK(radio.stops==0); tick(now+1); CHECK(radio.stops==1);
        CHECK(engine.quiet_gate()); CHECK(id_command(4,id)==AckBusy);
        radio.state=RadioState::Idle; tick(now+250); CHECK(stage()==Stage::Complete);
        CHECK(!engine.quiet_gate()); CHECK(status()[8]&32);
        CHECK(status()[11]==0); // A test is not a wake attempt.
    }
};

void config_packet_test() {
    const auto good=config(); CHECK(valid_config(good)); CHECK(valid_config(config(false)));
    for (const char *p:{"US","CA","GB","AU","NZ","DE","FR","ES","IT","NL","JP","KR","TW","IN","BR","MX","SG","SE","NO","FI","DK","CH","AT","BE","IE","PT","PL","CZ"}) CHECK(valid_country(p[0],p[1]));
    CHECK(!valid_country('u','s')); CHECK(!valid_country('Z','Z'));
    for (const char *p:{"XX","ZA","MY","PH","GR","TH","TR","KE","NG","CN","HK"}) {
        auto extended=good; extended[4]=p[0]; extended[5]=p[1]; CHECK(valid_config(extended));
        CHECK(radio_country(p[0],p[1]));
    }
    for (const size_t i:{size_t(0),size_t(1),size_t(4),size_t(7),size_t(18),size_t(58),size_t(110),size_t(111)}) {
        auto bad=good; bad[i]=0xff; CHECK(!valid_config(bad));
    }
    auto bad=good; bad[8]|=1; CHECK(!valid_config(bad));
    bad=good; std::memset(bad.data()+8,0,6); CHECK(!valid_config(bad));
    bad=good; bad[14]=0; CHECK(!valid_config(bad));
    bad=good; bad[14]=0xc0; bad[15]=0x80; CHECK(!valid_config(bad)); // Overlong UTF-8.
    bad=good; bad[14]=0xed; bad[15]=0xa0; bad[16]=0x80; CHECK(!valid_config(bad)); // Surrogate.
    bad=good; bad[14]=0xf4; bad[15]=0x90; bad[16]=0x80; bad[17]=0x80; CHECK(!valid_config(bad));
    auto utf=good; utf[14]=0xf0; utf[15]=0x9f; utf[16]=0x98; utf[17]=0x80; CHECK(valid_config(utf));
    std::array<uint8_t,118> out{}; out.front()=0x5a; out.back()=0xa5;
    const uint8_t source[]={2,4,6,8,10,12}; magic_frame(source,good.data()+8,out.data()+1);
    CHECK(out.front()==0x5a && out.back()==0xa5);
    for (unsigned i=1;i<7;++i) CHECK(out[i]==0xff);
    CHECK(!std::memcmp(out.data()+7,source,6)); CHECK(out[13]==8 && out[14]==0x42);
    for (unsigned i=15;i<21;++i) CHECK(out[i]==0xff);
    for (unsigned i=0;i<16;++i) CHECK(!std::memcmp(out.data()+21+i*6,good.data()+8,6));
    erase_secret(out.data(),out.size()); for (auto b:out) CHECK(b==0);
}
template <size_t N> std::array<uint8_t,N> fixture(const char *name) {
    std::ifstream file(std::string(DS5_WOL_FIXTURES)+"/"+name); std::string hex;
    CHECK(bool(file>>hex)); CHECK(hex.size()==N*2); std::array<uint8_t,N> bytes{};
    for (size_t i=0;i<N;++i) bytes[i]=uint8_t(std::stoul(hex.substr(i*2,2),nullptr,16));
    return bytes;
}
void golden_fixture_test() {
    const auto config_bytes=fixture<112>("wake-on-lan-config-v1.hex"); CHECK(valid_config(config_bytes));
    auto expected=config(false); expected[3]=13; std::memcpy(expected.data()+46,"canary-secret",13);
    const uint8_t mac[]={2,17,34,51,68,85}; std::memcpy(expected.data()+8,mac,6); CHECK(config_bytes==expected);
    Harness h({config_bytes,0x01020304,0x12345678,true});
    auto status_fixture=fixture<64>("wake-on-lan-status-v1.hex");
    status_fixture[6]=kProtocolMinor; // The original 1.103 fixture retains its wire layout.
    CHECK(h.status()==status_fixture);
}
void configuration_flow_test() {
    // Worldwide and newly exposed profiles must reach the radio unchanged and
    // survive save/reload.
    for (const char *p:{"XX","ZA","PH"}) {
        auto c=config(false); c[4]=p[0]; c[5]=p[1];
        Harness regional({}); regional.upload(c); regional.pass_test();
        CHECK(regional.radio.joined==c);
        CHECK(regional.id_command(4,55)==AckOk);
        Harness reloaded(regional.radio.saved);
        CHECK(reloaded.status()[59]==p[0] && reloaded.status()[60]==p[1]);
        CHECK(!reloaded.engine.armed() && !reloaded.engine.quiet_gate());
    }
    Harness h({}); CHECK(h.status()[8]==0); CHECK(!h.engine.quiet_gate()); h.upload(config(false));
    CHECK(h.id_command(4,55)==AckBusy); CHECK(h.radio.saves==0); h.pass_test();
    CHECK(h.id_command(4,55)==AckOk); CHECK(h.radio.saves==1); CHECK(h.radio.saved.config==config(false));
    CHECK(h.id_command(4,55)==AckOk); CHECK(h.radio.saves==1); CHECK(!(h.status()[8]&16));
    auto status=h.status(); CHECK(status[0]==0x1d && !std::memcmp(status.data()+1,"DS5B",4));
    CHECK(status[6]==kProtocolMinor && read_u32(status.data()+12)==1 && status[26]==4 && status[59]=='U');
    CHECK(std::search(status.begin(),status.end(),h.radio.saved.config.begin()+46,h.radio.saved.config.begin()+58)==status.end());
    uint8_t enable[5]={1,0,0,0,1}; CHECK(h.engine.command(6,enable,5)==AckOk); CHECK(h.radio.saved.generation==2);
    CHECK(h.engine.command(6,enable,5)==AckInvalidValue); CHECK(h.radio.saves==2);
    CHECK(h.id_command(7,2)==AckOk); CHECK(!h.radio.saved.configured && h.radio.saved.generation==3);
    for (auto b:h.radio.saved.config) CHECK(b==0);
}
void region_acceptance_test() {
    // The pinned CLM has no Finland or Ireland locale, so a join could never
    // pass the region check. New configurations naming them are rejected at
    // Test and Commit; saved legacy records still load, disable and forget, but
    // can never be enabled or armed.
    for (const char *p:{"FI","IE"}) {
        auto c=config(false); c[4]=p[0]; c[5]=p[1];
        CHECK(valid_config(c) && valid_country(p[0],p[1]) && !radio_country(p[0],p[1]));
        Harness fresh({}); fresh.upload(c);
        CHECK(fresh.id_command(3,55)==AckInvalidValue && fresh.error()==Error::InvalidConfig);
        CHECK(fresh.radio.starts==0 && !fresh.engine.quiet_gate());
        CHECK(fresh.id_command(4,55)==AckInvalidValue && fresh.radio.saves==0);
        Harness saved({c,4,0x1234,true});
        CHECK(saved.stage()==Stage::Idle && saved.error()==Error::None && saved.status()[59]==p[0]);
        uint8_t enable[5]={4,0,0,0,1};
        CHECK(saved.engine.command(6,enable,5)==AckInvalidValue && saved.error()==Error::InvalidConfig);
        CHECK(saved.radio.saves==0 && !(saved.status()[8]&2));
        CHECK(saved.id_command(7,4)==AckOk && !saved.radio.saved.configured);
        // A record saved enabled by older firmware loads, never arms, rejects
        // host preparation as not configured, and can still be switched off.
        auto on=c; on[6]=1;
        Harness legacy({on,4,0x1234,true});
        CHECK(legacy.status()[8]&2);
        legacy.tick(legacy.now+10000,false,true); CHECK(!legacy.engine.preparing() && !legacy.engine.armed());
        legacy.tick(legacy.now+1); legacy.tick(legacy.now+WakeOnLan::kHostReturnMs);
        auto prep=legacy.power(3,4,4); std::memcpy(prep.data()+12,on.data()+8,6);
        CHECK(legacy.engine.command(8,prep.data(),prep.size())==AckInvalidValue && legacy.error()==Error::NotConfigured);
        CHECK(legacy.engine.command(9,prep.data(),prep.size())==AckInvalidValue);
        CHECK(legacy.engine.command(6,enable,5)==AckInvalidValue);
        uint8_t disable[5]={4,0,0,0,0}; CHECK(legacy.engine.command(6,disable,5)==AckOk && legacy.radio.saved.config[6]==0);
        legacy.tick(legacy.now+10000,false,true); CHECK(!legacy.engine.preparing() && legacy.engine.allow_usb_wake());
    }
}
void forget_idempotence_test() {
    // An empty bridge and a previously forgotten bridge have no inactive
    // credential slot left to scrub. Neither request should wear flash or
    // consume a generation.
    Harness empty({});
    CHECK(empty.id_command(7,0)==AckOk);
    CHECK(empty.radio.saves==0 && read_u32(empty.status().data()+12)==0);

    StoredRecord tombstone{}; tombstone.generation=7;
    Harness forgotten(tombstone);
    CHECK(forgotten.id_command(7,7)==AckOk);
    CHECK(forgotten.radio.saves==0 && read_u32(forgotten.status().data()+12)==7);

    // A failed first Forget still owns a configured in-memory record, so a
    // retry must enter the store and finish its durable cleanup.
    Harness retry;
    retry.radio.save_ok=false;
    CHECK(retry.id_command(7,1)==AckPersistenceFailed && retry.radio.saves==1);
    retry.radio.save_ok=true;
    CHECK(retry.id_command(7,1)==AckOk && retry.radio.saves==2);
    CHECK(!retry.radio.saved.configured && retry.radio.saved.generation==2);
}
void staging_rejection_test() {
    Harness h({}); uint8_t begin[10]={55,0,0,0,112,0}; CHECK(h.engine.command(1,begin,10)==AckOk);
    uint8_t gap[8]={55,0,0,0,1,0,1,1}; CHECK(h.engine.command(2,gap,8)==AckInvalidValue);
    gap[4]=0; CHECK(h.engine.command(2,gap,8)==AckOk); gap[7]=2; CHECK(h.engine.command(2,gap,8)==AckInvalidValue);
    CHECK(h.id_command(3,55)==AckInvalidValue); CHECK(h.radio.starts==0);
    h.tick(h.now+30000); CHECK(!(h.status()[8]&16)); CHECK(h.id_command(4,55)==AckInvalidValue);
    h.upload(config()); CHECK(h.id_command(5,56)==AckInvalidValue); CHECK(h.status()[8]&16);
    CHECK(h.id_command(5,55)==AckOk); CHECK(!(h.status()[8]&16));
    auto p=h.power(); p[17]^=1; CHECK(h.engine.command(8,p.data(),p.size())==AckInvalidValue);
    uint8_t malformed[11]={55,0,0,0,112,0,0,0,0,0,1}; CHECK(h.engine.command(1,malformed,11)==AckBadLength);
}
void prepared_wake_test() {
    Harness h; h.arm(); CHECK(!h.engine.quiet_gate());
    h.engine.controller_connected(1,false,true); h.tick(h.now+1,false,true); CHECK(h.engine.armed());
    h.engine.controller_connected(2,true,false); h.tick(h.now+1,false,true); CHECK(h.engine.armed());
    h.engine.controller_connected(3,true,true); CHECK(h.radio.starts==0);
    h.tick(h.now+1,false,true); CHECK(h.stage()==Stage::UsbFirst && h.engine.quiet_gate());
    CHECK(h.engine.take_usb_wake_request()); CHECK(!h.engine.take_usb_wake_request());
    h.tick(h.now+999,false,true); CHECK(h.radio.starts==0); h.tick(h.now+1,false,true); CHECK(h.radio.starts==1);
    h.radio.state=RadioState::Ready; h.tick(h.now+1,false,true); h.tick(h.now+100,false,true); h.tick(h.now+100,false,true);
    CHECK(h.radio.sends==3); h.tick(h.now+300,false,true); CHECK(h.stage()==Stage::Teardown);
    h.radio.state=RadioState::Idle; h.tick(h.now+250,false,true); CHECK(h.stage()==Stage::Complete);
    CHECK(!h.engine.quiet_gate() && !h.engine.allow_usb_wake() && h.engine.suspend_exempt());
    h.engine.controller_connected(4,true,true); h.tick(h.now+1000,false,true); CHECK(h.radio.starts==1);
    h.tick(h.now+298999,false,true); CHECK(h.engine.suspend_exempt());
    h.tick(h.now+1,false,true); CHECK(!h.engine.suspend_exempt());
    h.tick(h.now+1); CHECK(h.engine.allow_usb_wake());
    auto p=h.power(); CHECK(h.engine.command(8,p.data(),p.size())==AckInvalidValue); // Consumed epoch.
    write_u32(p.data()+4,5); CHECK(h.engine.command(8,p.data(),p.size())==AckOk);
}
void cancellation_failure_test() {
    { Harness h; h.arm(); h.engine.controller_connected(1,true,true); h.engine.controller_disconnected(1);
      h.tick(h.now+1,false,true); CHECK(h.engine.armed() && h.radio.starts==0); }
    { Harness h; h.arm(); h.engine.controller_connected(1,true,true); h.tick(h.now+1,false,true);
      h.tick(h.now+10); CHECK(h.stage()==Stage::Complete && h.radio.starts==0); }
    { Harness h; h.arm(); h.engine.controller_connected(1,true,true); h.tick(h.now+1,false,true);
      h.tick(h.now+1000,false,true); h.tick(h.now+8000,false,true); CHECK(h.stage()==Stage::Teardown);
      h.tick(h.now+2000,false,true); CHECK(h.engine.recovery_required() && h.engine.quiet_gate()); }
    { Harness h({}); h.upload(config()); CHECK(h.id_command(3,55)==AckOk); h.tick(h.now+1);
      h.radio.error=Error::Authentication; h.radio.state=RadioState::Fault; h.tick(h.now+1);
      CHECK(h.stage()==Stage::Teardown); h.radio.state=RadioState::Idle; h.tick(h.now+250);
      CHECK(h.error()==Error::Authentication && !(h.status()[8]&32)); CHECK(h.id_command(4,55)==AckBusy); }
    { Harness h({}); h.upload(config()); CHECK(h.id_command(3,55)==AckOk); h.tick(h.now+1);
      CHECK(h.id_command(5,55)==AckOk && h.engine.quiet_gate()); h.radio.state=RadioState::Idle; h.tick(h.now+250);
      CHECK(h.error()==Error::Cancelled && !(h.status()[8]&16)); }
    // A test's sends never appear as a wake attempt, in the status or in the
    // reboot marker, even when the test fails after sending.
    { Harness h({}); h.upload(config()); CHECK(h.id_command(3,55)==AckOk); h.tick(h.now+1);
      h.radio.state=RadioState::Ready; h.tick(h.now+1); CHECK(h.radio.sends==1);
      uint8_t packets=9; CHECK(decode_radio_marker(h.radio.marker.data(),packets) && packets==0);
      h.radio.error=Error::NetworkUnavailable; h.radio.state=RadioState::Fault; h.tick(h.now+100);
      CHECK(h.stage()==Stage::Teardown); h.radio.state=RadioState::Idle; h.tick(h.now+250);
      CHECK(h.stage()==Stage::Failed && h.status()[11]==0); }
    { Harness h; auto p=h.power(); CHECK(h.engine.command(8,p.data(),p.size())==AckOk);
      h.tick(h.now+30000,false,true); CHECK(h.error()==Error::Timeout && !h.engine.armed()); }
    { Harness h; auto p=h.power(); p[12]^=2; CHECK(h.engine.command(8,p.data(),p.size())==AckUnauthorized); }
    { Harness h; h.engine.initialize(record(),false); CHECK(h.id_command(7,1)==AckPersistenceFailed); }
}
void controller_loss_test() {
    // During the USB-first wait the press still depends on the controller.
    { Harness h; h.arm(); h.engine.controller_connected(1,true,true); h.tick(h.now+1,false,true);
      CHECK(h.stage()==Stage::UsbFirst); h.engine.controller_disconnected(1); h.tick(h.now+1,false,true);
      CHECK(h.stage()==Stage::Failed && h.error()==Error::ControllerUnavailable && h.radio.starts==0);
      CHECK(!h.engine.allow_usb_wake()); }
    // Once a non-test attempt has started joining, a Bluetooth drop no longer
    // cancels it: joining, sending and teardown complete normally.
    { Harness h; h.arm(); h.engine.controller_connected(1,true,true); h.tick(h.now+1,false,true);
      h.tick(h.now+1000,false,true); CHECK(h.stage()==Stage::Joining);
      h.engine.controller_disconnected(1); h.tick(h.now+1,false,true); CHECK(h.stage()==Stage::Joining);
      h.radio.state=RadioState::Ready; h.tick(h.now+1,false,true); CHECK(h.radio.sends==1);
      h.engine.controller_disconnected(1); h.tick(h.now+100,false,true); h.tick(h.now+100,false,true);
      CHECK(h.radio.sends==3 && h.stage()==Stage::Sending);
      h.tick(h.now+300,false,true); CHECK(h.stage()==Stage::Teardown);
      h.radio.state=RadioState::Idle; h.tick(h.now+1,false,true);
      CHECK(h.stage()==Stage::Complete && h.error()==Error::None && h.status()[11]==3); }
    // Host return and the Joining deadline still end such an attempt.
    { Harness h; h.arm(); h.engine.controller_connected(1,true,true); h.tick(h.now+1,false,true);
      h.tick(h.now+1000,false,true); h.engine.controller_disconnected(1); h.tick(h.now+1);
      CHECK(h.stage()==Stage::Teardown); h.radio.state=RadioState::Idle; h.tick(h.now+1);
      CHECK(h.stage()==Stage::Complete && h.status()[11]==0); }
    { Harness h; h.arm(); h.engine.controller_connected(1,true,true); h.tick(h.now+1,false,true);
      h.tick(h.now+1000,false,true); h.engine.controller_disconnected(1); h.tick(h.now+8000,false,true);
      CHECK(h.stage()==Stage::Teardown); h.radio.state=RadioState::Idle; h.tick(h.now+1,false,true);
      CHECK(h.error()==Error::Timeout); }
    // Test mode still cancels as soon as setup is no longer idle.
    { Harness h({}); h.upload(config()); CHECK(h.id_command(3,55)==AckOk); h.tick(h.now+1);
      CHECK(h.stage()==Stage::Joining); h.tick(h.now+1,true,false,false,false); CHECK(h.stage()==Stage::Teardown);
      h.radio.state=RadioState::Idle; h.tick(h.now+1); CHECK(h.error()==Error::Busy); }
}
void standalone_arming_test() {
    // An enabled record arms itself after the enumerated host leaves the bus,
    // then runs the ordinary USB-first and network attempt once.
    { Harness h; h.tick(h.now+1,false,true); CHECK(h.engine.allow_usb_wake()); h.tick(h.now+1);
      h.self_arm(); CHECK(!h.engine.quiet_gate() && h.radio.starts==0);
      h.engine.controller_connected(1,true,true); h.complete_attempt();
      CHECK(h.radio.sends==3 && h.status()[11]==3 && h.engine.standalone());
      // The host has not returned: no second bridge-armed attempt this cycle.
      h.engine.controller_connected(2,true,true); h.tick(h.now+5000,false,true);
      CHECK(h.stage()==Stage::Complete && h.radio.starts==1 && !h.engine.preparing());
      // BIOS enumerates the bridge during POST and drops it at the OS handoff.
      // That is not a returned host: no new transition, and the controller is
      // kept on while the bus bounces.
      h.tick(h.now+1); h.tick(h.now+10000); CHECK(h.engine.allow_usb_wake());
      h.tick(h.now+1,false,true); CHECK(h.engine.suspend_exempt());
      h.tick(h.now+10000,false,true); CHECK(!h.engine.preparing() && h.engine.suspend_exempt() && h.stage()==Stage::Complete);
      // 45 s of continuous enumeration after that drop is a returned host; the next bus-down arms again.
      h.tick(h.now+1); h.tick(h.now+44998); h.tick(h.now+1,false,true); h.tick(h.now+10000,false,true); CHECK(!h.engine.preparing());
      h.tick(h.now+1); h.tick(h.now+45000); CHECK(h.engine.allow_usb_wake()); h.self_arm();
      h.engine.controller_connected(3,true,true); h.tick(h.now+1,false,true); CHECK(h.stage()==Stage::UsbFirst); }
    // A failed attempt restores the ordinary sleep-disconnect policy at once.
    { Harness h; h.self_arm(); h.engine.controller_connected(1,true,true); h.tick(h.now+1,false,true);
      h.tick(h.now+1000,false,true); h.tick(h.now+8000,false,true); CHECK(h.stage()==Stage::Teardown);
      h.radio.state=RadioState::Idle; h.tick(h.now+250,false,true); CHECK(h.stage()==Stage::Failed && !h.engine.suspend_exempt()); }
    // A host preparation during a still-starting host ends that phase.
    { Harness h; h.self_arm(); h.engine.controller_connected(1,true,true); h.complete_attempt();
      h.tick(h.now+1); auto p=h.power(); write_u32(p.data()+4,9); CHECK(h.engine.command(8,p.data(),p.size())==AckOk);
      CHECK(h.engine.host_prepared() && !h.engine.suspend_exempt()); }
    // Never-enumerated, disabled, and unconfigured bridges stay idle on a dead bus.
    { Harness h(record(),false); h.tick(h.now+10000,false,true); CHECK(h.stage()==Stage::Idle && h.engine.allow_usb_wake());
      h.tick(h.now+1); h.tick(h.now+WakeOnLan::kHostReturnMs); h.self_arm(); }
    { Harness h({config(false),1,0x1234,true}); h.tick(h.now+10000,false,true); CHECK(h.stage()==Stage::Idle); }
    { Harness h({}); h.tick(h.now+10000,false,true); CHECK(h.stage()==Stage::Idle); }
    { Harness h; h.engine.initialize(record(),false); h.tick(h.now+10000,false,true); CHECK(!h.engine.preparing()); }
    // Short bus resets below the debounce never start a transition.
    { Harness h; h.tick(h.now+2999,false,true); CHECK(!h.engine.preparing() && h.engine.allow_usb_wake());
      h.tick(h.now+1); h.tick(h.now+2999,false,true); CHECK(!h.engine.preparing()); }
    // A returning host ends an unarmed bridge transition silently, and cancels
    // an armed one. Either way the next transition needs another 45 s of host.
    { Harness h; h.self_arm(false); CHECK(h.engine.preparing() && !h.engine.armed());
      h.tick(h.now+1); CHECK(h.stage()==Stage::Idle && h.error()==Error::None && h.engine.allow_usb_wake() && !h.engine.standalone());
      h.tick(h.now+WakeOnLan::kHostReturnMs);
      h.self_arm(); h.tick(h.now+1); CHECK(h.stage()==Stage::Failed && h.error()==Error::Cancelled); }
    // A connected controller delays arming until it is quiet; there is no 30 s deadline.
    { Harness h; h.self_arm(false); h.tick(h.now+60000,false,true,false); CHECK(h.engine.preparing());
      h.tick(h.now+1,false,true); h.tick(h.now+1000,false,true); CHECK(h.engine.armed()); }
    // Host preparation wins while it is live, and its commit consumes the cycle.
    { Harness h; auto p=h.power(); CHECK(h.engine.command(8,p.data(),p.size())==AckOk && h.engine.host_prepared());
      CHECK(h.engine.command(9,p.data(),p.size())==AckOk);
      h.tick(h.now+1,false,true); h.tick(h.now+1000,false,true); CHECK(h.engine.armed() && !h.engine.standalone());
      h.engine.controller_connected(1,true,true); h.complete_attempt();
      h.engine.controller_connected(2,true,true); h.tick(h.now+5000,false,true); CHECK(h.radio.starts==1 && !h.engine.preparing()); }
    // A prepare the host never committed is taken over once the bus is down.
    { Harness h; auto p=h.power(); CHECK(h.engine.command(8,p.data(),p.size())==AckOk);
      h.tick(h.now+1,false,true); h.tick(h.now+3000,false,true); CHECK(h.engine.preparing() && h.engine.standalone());
      h.tick(h.now+1000,false,true); CHECK(h.engine.armed()); }
    // A canceled host transition never left the bus, so it hands back the
    // host-active observation and the next bus-down still arms.
    { Harness h; auto p=h.power(); CHECK(h.engine.command(8,p.data(),p.size())==AckOk);
      CHECK(h.engine.command(9,p.data(),p.size())==AckOk); uint8_t c[8]; write_u32(c,3); write_u32(c+4,4);
      CHECK(h.engine.command(10,c,8)==AckOk); h.tick(h.now+1); h.self_arm(); }
    // So does a commit superseded by a new PREPARE that the host then abandons.
    { Harness h; h.prepare_commit(); auto p=h.power(3,5); CHECK(h.engine.command(8,p.data(),p.size())==AckOk);
      h.tick(h.now+1,false,true); h.tick(h.now+3000,false,true); CHECK(h.engine.preparing() && h.engine.standalone()); }
    // An unrelated app cancel cannot disarm a bridge-armed transition.
    { Harness h; h.self_arm(); uint8_t c[8]; write_u32(c,9); write_u32(c+4,9);
      CHECK(h.engine.command(10,c,8)==AckInvalidValue); h.tick(h.now+1,false,true); CHECK(h.engine.armed()); }
    // Setup staging left behind by the app expires before the bridge arms.
    { Harness h; h.upload(config()); h.tick(h.now+1,false,true); h.tick(h.now+2999,false,true); CHECK(!h.engine.preparing());
      h.tick(h.now+30000,false,true); CHECK(!(h.status()[8]&16)); h.tick(h.now+3000,false,true); CHECK(h.engine.preparing()); }
}
void usb_wake_ownership_test() {
    // Test and save with the switch off (the documented default) leaves Wake PC
    // via USB working while the PC sleeps, whether or not a network was saved.
    for (int previously_saved=0;previously_saved<2;++previously_saved) {
        Harness h(previously_saved ? StoredRecord{config(false),1,0x1234,true}:StoredRecord{});
        h.upload(config(false)); h.pass_test(); CHECK(h.id_command(4,55)==AckOk);
        CHECK(h.stage()==Stage::Complete && h.error()==Error::None);
        h.tick(h.now+10,false,true); CHECK(h.engine.allow_usb_wake());
        h.hold(600000,false,true,true,10000); CHECK(h.engine.allow_usb_wake() && !h.engine.preparing());
    }
    // So does a failed test, and a bridge that booted with a persistence failure.
    { Harness h({}); h.upload(config()); CHECK(h.id_command(3,55)==AckOk); h.tick(h.now+1);
      h.radio.error=Error::Authentication; h.radio.state=RadioState::Fault; h.tick(h.now+1);
      h.radio.state=RadioState::Idle; h.tick(h.now+250); CHECK(h.stage()==Stage::Failed);
      h.tick(h.now+10,false,true); CHECK(h.engine.allow_usb_wake()); }
    { Harness h; h.engine.initialize(record(),false); h.tick(h.now+10,false,true);
      CHECK(h.stage()==Stage::Failed && h.error()==Error::Persistence && h.engine.allow_usb_wake()); }
    // A feature-owned attempt that fails while the host is down keeps raw USB
    // wake suppressed for as long as the host stays down (scope rule 3), and
    // releases it once the host returns.
    { Harness h; h.self_arm(); h.press_attempt(false); CHECK(h.stage()==Stage::Failed && h.radio.starts==1);
      CHECK(!h.engine.allow_usb_wake()); h.hold(600000,false,true,false,10000); CHECK(!h.engine.allow_usb_wake());
      h.tick(h.now+1); CHECK(h.engine.allow_usb_wake() && h.stage()==Stage::Failed);
      h.tick(h.now+10,false,true); CHECK(h.engine.allow_usb_wake()); }
    // A successful attempt's result survives the host's return for Settings.
    { Harness h; h.self_arm(); h.press_attempt(); CHECK(h.stage()==Stage::Complete && h.status()[11]==3);
      CHECK(!h.engine.allow_usb_wake());
      h.tick(h.now+1); CHECK(h.engine.allow_usb_wake() && h.stage()==Stage::Complete && h.status()[11]==3); }
    // A committed preparation still waiting for a quiet controller owns the bus.
    { Harness h; h.prepare_commit(); h.hold(60000,false,true,false,1000);
      CHECK(h.engine.host_prepared() && !h.engine.allow_usb_wake()); }
    // An uncommitted PREPARE authorized nothing: when it expires with the host
    // down (a suspend whose COMMIT was cut short, on a host active under 45 s),
    // raw USB wake stays available.
    { Harness h(record(),false); h.tick(h.now+1); h.tick(h.now+1000);
      auto p=h.power(); CHECK(h.engine.command(8,p.data(),p.size())==AckOk);
      h.hold(30000,false,true,false,1000);
      CHECK(h.stage()==Stage::Failed && h.error()==Error::Timeout && h.engine.allow_usb_wake()); }
    // A committed preparation that expires while the host is not active is owned.
    // (A bus-down being debounced at the deadline holds the window instead.)
    { Harness h; h.prepare_commit(); h.hold(29000,true,false,false,1000); h.hold(1000,false,false,false,1000);
      CHECK(h.stage()==Stage::Failed && h.error()==Error::Timeout && !h.engine.allow_usb_wake()); }
    { Harness h; h.prepare_commit(); h.hold(29000,true,false,false,1000); h.hold(5000,false,true,false,1000);
      CHECK(h.engine.host_prepared()); }
}
void host_return_evidence_test() {
    // A fresh or cold-booted bridge first sees the BIOS enumeration. 10 s of
    // POST is not a returned host, so the OS handoff drop does not arm (S2b),
    // with or without the boot-protocol signal.
    for (const bool firmware:{false,true}) {
        Harness h(record(),false); h.firmware=firmware; h.hold(10000,true,false); h.firmware=false; h.hold(6000,false,true);
        CHECK(!h.engine.preparing() && !h.engine.armed() && h.stage()==Stage::Idle);
        h.hold(2000,true,false); CHECK(h.stage()==Stage::Idle && h.error()==Error::None);
    }
    // A BIOS session (boot protocol) held for a minute on a cold-booted bridge
    // never establishes the host-active observation; 45 s of an OS session does.
    { Harness h(record(),false); h.firmware=true; h.hold(60000,true,false); h.firmware=false; h.hold(6000,false,true);
      CHECK(!h.engine.preparing() && !h.engine.armed());
      h.tick(h.now+1); h.tick(h.now+WakeOnLan::kHostReturnMs); h.self_arm(); }
    // A firmware session that becomes an OS session without a bus drop counts
    // from the switch.
    { Harness h(record(),false); h.firmware=true; h.hold(20000,true,false); h.firmware=false; h.hold(44000,true,false);
      h.hold(4000,false,true); CHECK(!h.engine.preparing());
      h.tick(h.now+1); h.tick(h.now+WakeOnLan::kHostReturnMs); h.self_arm(); }
    // Documented limit: with the companion closed, a shutdown within 45 s of
    // the host enumerating the bridge does not arm; 45 s of enumeration does.
    { Harness h(record(),false); h.tick(h.now+1); h.tick(h.now+44998); h.hold(5000,false,true);
      CHECK(!h.engine.preparing() && h.engine.allow_usb_wake());
      h.tick(h.now+1); h.tick(h.now+WakeOnLan::kHostReturnMs); h.self_arm(); }
    // Host preparation does not need that observation.
    { Harness h(record(),false); h.tick(h.now+1); h.tick(h.now+1000); h.arm(); }
    // Power-button boot of a host-prepared Armed bridge: the BIOS enumeration
    // cancels once, and the OS handoff drop starts no second transition (S2).
    { Harness h; h.arm(); h.tick(h.now+1); CHECK(h.stage()==Stage::Failed && h.error()==Error::Cancelled);
      h.hold(10000,true,false); h.hold(6000,false,true); CHECK(!h.engine.preparing() && !h.engine.armed());
      h.engine.controller_connected(9,true,true); h.hold(3000,false,true);
      CHECK(h.radio.starts==0 && h.stage()==Stage::Failed && h.error()==Error::Cancelled);
      h.tick(h.now+1); CHECK(h.stage()==Stage::Failed && h.error()==Error::Cancelled); }
    // COMMIT durably consumes the cycle, including when the main loop polls an
    // active host for a while before the bus goes down (C4/S11, and S11b).
    for (const uint64_t active_ms:{uint64_t(200),uint64_t(0)}) {
        Harness h; h.prepare_commit();
        if (active_ms) h.hold(active_ms,true,false,true,10);
        h.tick(h.now+1,false,true); h.tick(h.now+1000,false,true); CHECK(h.engine.armed() && !h.engine.standalone());
        h.press_attempt(); CHECK(h.stage()==Stage::Complete && h.radio.starts==1);
        h.hold(3000,false,true,false); h.hold(6000,false,true);
        CHECK(!h.engine.preparing() && !h.engine.armed());
        h.press_attempt(); CHECK(h.radio.starts==1 && h.stage()==Stage::Complete && !h.engine.allow_usb_wake());
    }
    // A host-prepared success with a POST longer than the debounce: no second
    // transition, and BIOS enumeration keeps the retained result (S12).
    { Harness h; h.prepare_commit(); h.hold(200,true,false,true,10);
      h.tick(h.now+1,false,true); h.tick(h.now+1000,false,true); h.press_attempt();
      CHECK(h.stage()==Stage::Complete && h.status()[11]==3);
      h.hold(10000,false,true,false,1000); CHECK(!h.engine.preparing() && h.engine.suspend_exempt());
      h.tick(h.now+1,true,false,false); CHECK(h.stage()==Stage::Complete && h.status()[11]==3); }
    // A BIOS screen held longer than 45 s after a packet (BitLocker PIN, boot
    // menu) is not a returned host: the OS handoff drop stays exempt from
    // sleep-disconnect and does not arm (C2-45s). 45 s of OS enumeration ends
    // the phase, and the next sleep arms again.
    { Harness h; h.self_arm(); h.press_attempt(); h.hold(5000,false,true,false);
      h.firmware=true; h.hold(46000,true,false,false); h.firmware=false; h.hold(4100,false,true);
      CHECK(!h.engine.preparing() && !h.engine.armed() && h.engine.suspend_exempt());
      h.hold(44000,true,false); h.tick(h.now+1,false,true); CHECK(h.engine.suspend_exempt());
      h.hold(5000,false,true); CHECK(!h.engine.preparing());
      h.tick(h.now+1); h.tick(h.now+WakeOnLan::kHostReturnMs);
      h.self_arm(); CHECK(!h.engine.suspend_exempt()); }
    // POST-internal events cannot defeat it: a momentary resume of the old OS
    // session, a reset between two BIOS sessions, or a BIOS re-enumeration of a
    // firmware re-attach are all short or firmware sessions (probes P3, P4).
    { Harness h; h.self_arm(); h.press_attempt();
      h.tick(h.now+1);                                         // momentary resume (OS session)
      h.hold(300,false,true,false,10);                         // BIOS reset
      h.firmware=true; h.hold(20000,true,false,false);         // first BIOS session
      h.firmware=false; h.hold(6000,false,true,false);         // reset / re-attach during POST
      h.firmware=true; h.hold(50000,true,false,false);         // BIOS session held 50 s
      h.firmware=false; h.hold(5000,false,true);               // OS handoff drop
      CHECK(!h.engine.preparing() && !h.engine.armed() && h.engine.suspend_exempt()); }
    // A BIOS that keeps its session past the 5-minute cap ends the phase there.
    { Harness h; h.self_arm(); h.press_attempt(); h.hold(5000,false,true,false);
      h.firmware=true; h.hold(200000,true,false,false,1000); h.firmware=false;
      h.tick(h.now+1,false,true); CHECK(h.engine.suspend_exempt());
      h.hold(100000,false,true,false,1000); CHECK(!h.engine.suspend_exempt() && !h.engine.preparing()); }
    // Fast Boot skips USB in POST, so Windows is the only enumeration after the
    // packet: 45 s of it ends the phase, and a shutdown 90 s after boot arms
    // (probe P6).
    { Harness h; h.self_arm(); h.press_attempt(); h.hold(20000,false,true,false);
      h.hold(46000,true,false); h.tick(h.now+1,false,true); CHECK(!h.engine.suspend_exempt());
      h.tick(h.now+1); h.hold(44000,true,false); h.self_arm(); }
    // Re-sleeping 30 s after a bridge-armed S3 wake leaves raw USB wake working
    // (C5); only bridge arming waits for 45 s of host activity.
    { Harness h; h.self_arm(); h.press_attempt(); CHECK(h.stage()==Stage::Complete);
      h.hold(30000,true,false); h.hold(400000,false,true,true,1000);
      h.engine.controller_connected(99,true,true); h.tick(h.now+1,false,true);
      CHECK(h.engine.allow_usb_wake() && !h.engine.preparing() && h.radio.starts==1); }
    // An S3 resume, plain or with a port reset (a new session), ends the phase
    // after 45 s, so the next sleep arms normally (probe P2).
    { Harness h; h.self_arm(); h.press_attempt(); h.hold(46000,true,false);
      h.self_arm(); CHECK(!h.engine.suspend_exempt()); }
    { Harness h; h.self_arm(); h.press_attempt(); h.hold(200,false,true,false,10); h.hold(46000,true,false);
      h.self_arm(); CHECK(!h.engine.suspend_exempt()); }
    // Update and shut down outlasting the 30 s window: a committed preparation
    // that never saw the bus go down hands the cycle back, and the bridge arms
    // when the bus finally drops (S1).
    { Harness h; h.prepare_commit(); h.hold(31000,true,false);
      CHECK(h.stage()==Stage::Failed && h.error()==Error::Timeout && h.engine.allow_usb_wake());
      h.self_arm(); h.press_attempt(); CHECK(h.radio.starts==1 && h.stage()==Stage::Complete); }
    // Once the bus has gone down inside the window, a committed preparation
    // waits without a deadline for the controller to go quiet (S1b), then arms
    // as host-prepared. It is still one attempt per cycle.
    { Harness h; h.prepare_commit(); h.hold(20000,true,false);
      h.hold(11000,false,true,false); CHECK(h.engine.host_prepared() && h.error()==Error::None);
      h.hold(300000,false,true,false,1000); CHECK(h.engine.host_prepared() && !h.engine.allow_usb_wake());
      h.hold(1100,false,true); CHECK(h.engine.armed() && !h.engine.standalone());
      h.press_attempt(); CHECK(h.radio.starts==1 && h.stage()==Stage::Complete);
      h.hold(3000,false,true,false); h.hold(6000,false,true);
      CHECK(!h.engine.preparing() && !h.engine.armed());
      h.press_attempt(); CHECK(h.radio.starts==1); }
}
void prepared_host_return_test() {
    // A restart: committed preparation, bus down for more than the 3 s debounce,
    // host back. The old authorization ends at once (S4/C6a), and a later drop
    // cannot arm it.
    { Harness h; h.prepare_commit(); h.hold(200,true,false,true,10);
      h.hold(4000,false,true,false); h.tick(h.now+1);
      CHECK(h.stage()==Stage::Failed && h.error()==Error::Cancelled && !h.engine.preparing());
      h.hold(8000,true,false); h.hold(5000,false,true); CHECK(!h.engine.armed() && !h.engine.preparing()); }
    // The result does not wait for the 30 s window when the host stays (C6b).
    { Harness h; h.prepare_commit(); h.hold(4000,false,true,false); h.hold(26000,true,false);
      CHECK(h.stage()==Stage::Failed && h.error()==Error::Cancelled); }
    // A brief port reset and re-enumeration during a committed preparation is
    // not a corroborated bus-down: the preparation continues and arms on the
    // real sleep, and it would still hand the cycle back on a timeout.
    { Harness h; h.prepare_commit(); h.hold(5000,true,false); h.hold(500,false,true,false,10);
      h.hold(2000,true,false); CHECK(h.engine.host_prepared() && h.error()==Error::None);
      h.tick(h.now+1,false,true); h.tick(h.now+1000,false,true); CHECK(h.engine.armed() && !h.engine.standalone()); }
    { Harness h; h.prepare_commit(); h.hold(5000,true,false); h.hold(2900,false,true,false,10);
      h.hold(23000,true,false); CHECK(h.stage()==Stage::Failed && h.error()==Error::Timeout);
      h.self_arm(); }
    // Without a COMMIT the preparation ends silently.
    { Harness h(record(),false); h.tick(h.now+1); h.tick(h.now+1000);
      auto p=h.power(); CHECK(h.engine.command(8,p.data(),p.size())==AckOk);
      h.hold(4000,false,true,false); h.tick(h.now+1);
      CHECK(h.stage()==Stage::Idle && h.error()==Error::None && !h.engine.preparing());
      CHECK(h.engine.command(9,p.data(),p.size())==AckInvalidValue); }
    // Ordinary traffic before the first bus-down does not end preparation.
    { Harness h; h.prepare_commit(); h.hold(5000,true,false); CHECK(h.engine.host_prepared());
      h.tick(h.now+1,false,true); h.tick(h.now+1000,false,true); CHECK(h.engine.armed()); }
    // After a bus-down the committed preparation has no deadline; only the
    // host's return ends it, with Cancelled, however long it waited.
    { Harness h; h.prepare_commit(); h.hold(120000,false,true,false,1000); CHECK(h.engine.host_prepared());
      h.tick(h.now+1); CHECK(h.stage()==Stage::Failed && h.error()==Error::Cancelled);
      h.hold(5000,false,true); CHECK(!h.engine.preparing() && !h.engine.armed()); }
    // An uncommitted PREPARE keeps its 30 s window when the bridge cannot take it
    // over, and is taken over after the 3 s debounce when it can.
    { Harness h(record(),false); h.tick(h.now+1); h.tick(h.now+1000);
      auto p=h.power(); CHECK(h.engine.command(8,p.data(),p.size())==AckOk);
      h.hold(29000,false,true,false,1000); CHECK(h.engine.host_prepared());
      h.hold(1000,false,true,false,1000); CHECK(h.stage()==Stage::Failed && h.error()==Error::Timeout); }
    { Harness h; auto p=h.power(); CHECK(h.engine.command(8,p.data(),p.size())==AckOk);
      h.hold(4000,false,true,false,1000); CHECK(h.engine.preparing() && h.engine.standalone()); }
}
void stale_candidate_test() {
    // A candidate delivered in the same pass as the host's return is dropped
    // with the transition and cannot start the next armed cycle (C7).
    Harness h; h.self_arm(); h.engine.controller_connected(5,true,true); h.tick(h.now+1);
    CHECK(h.stage()==Stage::Failed && h.error()==Error::Cancelled);
    h.hold(60000,true,false,false); h.self_arm(); h.tick(h.now+1,false,true);
    CHECK(h.engine.armed() && h.radio.starts==0 && !h.engine.take_usb_wake_request());
}
void retained_outcome_test() {
    // Rejected commands keep the retained result (C8); the ACK carries the error.
    { Harness h; auto p=h.power(3,4); CHECK(h.engine.command(8,p.data(),p.size())==AckOk);
      uint8_t c[8]; write_u32(c,3); write_u32(c+4,3);
      CHECK(h.engine.command(10,c,8)==AckInvalidValue && h.engine.preparing() && h.error()==Error::None); }
    { Harness h; auto p=h.power(3,4); CHECK(h.engine.command(8,p.data(),p.size())==AckOk);
      h.hold(31000,true,false); CHECK(h.stage()==Stage::Failed && h.error()==Error::Timeout);
      CHECK(h.engine.command(9,p.data(),p.size())==AckInvalidValue && h.error()==Error::Timeout); }
    { Harness h; h.self_arm(); h.tick(h.now+1); CHECK(h.stage()==Stage::Failed && h.error()==Error::Cancelled);
      CHECK(h.id_command(5,99)==AckInvalidValue && h.error()==Error::Cancelled); }
    { Harness h({}); h.upload(config(false)); h.pass_test(); CHECK(h.id_command(4,55)==AckOk);
      uint8_t enable[5]={9,0,0,0,1}; CHECK(h.engine.command(6,enable,5)==AckInvalidValue);
      CHECK(h.stage()==Stage::Complete && h.error()==Error::None); }
    // An idle status still records the rejection.
    { Harness h; CHECK(h.id_command(5,99)==AckInvalidValue && h.stage()==Stage::Idle && h.error()==Error::BadTransaction); }
    // A flash failure is the command's own result and is always recorded.
    { Harness h; h.self_arm(); h.tick(h.now+1); CHECK(h.stage()==Stage::Failed && h.error()==Error::Cancelled);
      h.radio.save_ok=false; uint8_t disable[5]={1,0,0,0,0};
      CHECK(h.engine.command(6,disable,5)==AckPersistenceFailed && h.error()==Error::Persistence); }
}
void radio_marker_test() {
    uint32_t words[kRadioMarkerWords]{}; uint8_t packets=9;
    for (uint8_t n=0;n<=3;++n) { encode_radio_marker(n,words); CHECK(decode_radio_marker(words,packets) && packets==n); }
    encode_radio_marker(2,words);
    for (size_t i=0;i<kRadioMarkerWords;++i) for (unsigned bit=0;bit<32;++bit) {
        uint32_t copy[kRadioMarkerWords]; std::copy(words,words+kRadioMarkerWords,copy);
        copy[i]^=1u<<bit; CHECK(!decode_radio_marker(copy,packets));
    }
    const uint32_t zero[kRadioMarkerWords]{}; CHECK(!decode_radio_marker(zero,packets) && !decode_radio_marker(nullptr,packets));
    // The marker is set when radio work starts, follows the packet count, and
    // is cleared only after teardown has been verified.
    { Harness h; h.self_arm(); h.engine.controller_connected(1,true,true); h.tick(h.now+1,false,true);
      CHECK(h.radio.marker_writes==0);
      h.tick(h.now+1000,false,true); CHECK(h.radio.starts==1 && decode_radio_marker(h.radio.marker.data(),packets) && packets==0);
      h.radio.state=RadioState::Ready; h.tick(h.now+1,false,true); CHECK(decode_radio_marker(h.radio.marker.data(),packets) && packets==1);
      h.tick(h.now+100,false,true); h.tick(h.now+100,false,true); CHECK(decode_radio_marker(h.radio.marker.data(),packets) && packets==3);
      h.tick(h.now+300,false,true); CHECK(h.stage()==Stage::Teardown && decode_radio_marker(h.radio.marker.data(),packets));
      h.radio.state=RadioState::Idle; h.tick(h.now+250,false,true); CHECK(h.stage()==Stage::Complete && h.radio.marker_clear()); }
    // A teardown that cannot be verified keeps the evidence; the bridge reboots
    // and reports Failed/RadioTeardown with the packets already submitted.
    std::array<uint32_t,kRadioMarkerWords> after_fault{};
    { Harness h; h.self_arm(); h.engine.controller_connected(1,true,true); h.tick(h.now+1,false,true);
      h.tick(h.now+1000,false,true); h.radio.state=RadioState::Ready; h.tick(h.now+1,false,true);
      h.radio.send_ok=false; h.tick(h.now+100,false,true); CHECK(h.stage()==Stage::Teardown);
      h.tick(h.now+2000,false,true); CHECK(h.engine.recovery_required());
      CHECK(decode_radio_marker(h.radio.marker.data(),packets) && packets==1); after_fault=h.radio.marker; }
    { Harness rebooted(record(),true,after_fault.data());
      auto s=rebooted.status(); CHECK(s[9]==uint8_t(Stage::Failed) && s[10]==uint8_t(Error::RadioTeardown) && s[11]==1 && !(s[8]&8));
      CHECK(rebooted.radio.marker_clear() && rebooted.radio.marker_writes==1);
      CHECK(rebooted.engine.allow_usb_wake() && !rebooted.engine.quiet_gate() && !rebooted.engine.armed() && !rebooted.engine.preparing());
      // It never authorizes a wake: no press is accepted before a new transition.
      rebooted.engine.controller_connected(1,true,true); rebooted.tick(rebooted.now+1,false,true); CHECK(rebooted.radio.starts==0);
      // Normal operation continues: ordinary arming after the host returns, and setup.
      rebooted.tick(rebooted.now+1); rebooted.tick(rebooted.now+WakeOnLan::kHostReturnMs); rebooted.self_arm();
      Harness setup(record(),true,after_fault.data()); setup.upload(config()); setup.pass_test(); }
    // A late WLAN event after verified teardown re-sets the marker before the reboot.
    { Harness h; h.radio.state=RadioState::Fault; h.tick(h.now+1);
      CHECK(h.engine.recovery_required() && decode_radio_marker(h.radio.marker.data(),packets) && packets==0); }
    // A persistence failure stays the reported result; the marker is still consumed.
    { Radio r; WakeOnLan e{r.ports()}; e.initialize(record(),false,after_fault.data());
      std::array<uint8_t,64> s{}; e.encode_status(s.data(),s.size());
      CHECK(s[9]==uint8_t(Stage::Failed) && s[10]==uint8_t(Error::Persistence) && r.marker_clear() && r.marker_writes==1); }
    // Without a valid marker nothing is written at boot.
    { Radio r; WakeOnLan e{r.ports()}; e.initialize(record(),true,zero); CHECK(r.marker_writes==0); }
}
void join_retry_test() {
    JoinRetry r; r.start(1000);
    CHECK(!r.pending() && !r.due(1000));
    CHECK(r.on_no_network(3000) && r.pending() && !r.due(3399) && r.due(3400)); r.issued();
    CHECK(!r.pending() && r.on_no_network(5000) && r.due(5400)); r.issued();
    CHECK(!r.on_no_network(6000) && r.retries()==2 && !r.pending()); // Three scans at most.
    r.start(0); CHECK(r.on_no_network(JoinRetry::kWindowMs-JoinRetry::kBackoffMs)); r.issued();
    CHECK(!r.on_no_network(JoinRetry::kWindowMs-JoinRetry::kBackoffMs+1));
    r.start(0); CHECK(!r.on_no_network(JoinRetry::kWindowMs-JoinRetry::kBackoffMs+1) && r.retries()==0);
    r.start(0); CHECK(r.on_no_network(100) && r.on_no_network(200) && r.retries()==1); // Still waiting.
    r.start(50); CHECK(!r.on_no_network(10) && !r.pending());
    // Progress after the latest re-issue answers it; a new re-issue needs new progress.
    r.start(0); CHECK(!r.unanswered());
    CHECK(r.on_no_network(1000)); CHECK(r.unanswered()); r.issued(); CHECK(r.unanswered());
    r.note_progress(); CHECK(!r.unanswered());
    CHECK(r.on_no_network(3000)); r.issued(); CHECK(r.unanswered());
    r.start(0); r.note_progress(); CHECK(!r.unanswered());
}
void join_deadline_test() {
    // The radio flags a re-scan that never reached the access point while it is
    // still joining; the Joining deadline then reports NetworkUnavailable, not a
    // weak-signal Timeout. Without the flag the deadline stays a Timeout.
    for (const bool unanswered:{true,false}) {
        Harness h; h.arm(); h.engine.controller_connected(1,true,true); h.tick(h.now+1,false,true);
        h.tick(h.now+1000,false,true); CHECK(h.stage()==Stage::Joining);
        h.radio.error=unanswered ? Error::NetworkUnavailable:Error::None;
        h.tick(h.now+7999,false,true); CHECK(h.stage()==Stage::Joining);
        h.tick(h.now+1,false,true); CHECK(h.stage()==Stage::Teardown);
        h.radio.state=RadioState::Idle; h.tick(h.now+1,false,true);
        CHECK(h.error()==(unanswered ? Error::NetworkUnavailable:Error::Timeout));
    }
}
void long_uptime_test() {
    Harness h; h.tick(uint64_t(UINT32_MAX)-500); h.arm(); CHECK(h.now>UINT32_MAX);
    h.engine.controller_connected(1,true,true); h.tick(h.now+1,false,true);
    CHECK(h.stage()==Stage::UsbFirst && h.radio.starts==0);
    h.tick(h.now+999,false,true); CHECK(h.radio.starts==0);
    h.tick(h.now+1,false,true); CHECK(h.radio.starts==1);
    h.tick(h.now+7999,false,true); CHECK(h.stage()==Stage::Joining);
    h.tick(h.now+1,false,true); CHECK(h.stage()==Stage::Teardown);
    h.radio.state=RadioState::Idle; h.tick(h.now+250,false,true); CHECK(h.error()==Error::Timeout);
}

struct Flash {
    std::array<uint8_t,8192> bytes; int mutation=0, fail_at=-1; size_t partial=0; bool read_fail=false;
    Flash() { bytes.fill(0xff); }
    static Flash &self(void *p) { return *static_cast<Flash *>(p); }
    static bool read(uint32_t off,uint8_t *out,size_t n,void *p) {
        auto &s=self(p); CHECK(off+n<=s.bytes.size()); if (s.read_fail) return false;
        std::memcpy(out,s.bytes.data()+off,n); return true;
    }
    static bool erase(unsigned slot,void *p) {
        auto &s=self(p); CHECK(slot<2); const bool fail=s.mutation++==s.fail_at;
        std::fill_n(s.bytes.begin()+slot*4096,fail ? std::min<size_t>(s.partial,4096):4096,0xff); return !fail;
    }
    static bool program(uint32_t off,const uint8_t *page,void *p) {
        auto &s=self(p); CHECK(off%256==0 && off+256<=s.bytes.size()); const bool fail=s.mutation++==s.fail_at;
        for (size_t i=0;i<(fail ? std::min<size_t>(s.partial,256):256);++i) s.bytes[off+i]&=page[i];
        return !fail;
    }
    bool holds(const Config &c) const {
        return std::search(bytes.begin(),bytes.end(),c.begin()+46,c.begin()+46+c[3])!=bytes.end();
    }
    bool erased(unsigned slot) const {
        return std::all_of(bytes.begin()+slot*4096,bytes.begin()+(slot+1)*4096,[](uint8_t b) { return b==0xff; });
    }
    ds5::wake_on_lan::WakeOnLanFlashPorts ports() { return {this,read,erase,program}; }
};
void storage_power_loss_test() {
    Flash initial; WakeOnLanStore first(initial.ports()); StoredRecord loaded{};
    CHECK(first.load(loaded) && !loaded.configured && initial.mutation==0);
    const auto old=record(); CHECK(first.save(old)); auto replacement=record(2); replacement.config[46]='N'; replacement.transaction=88;
    // Interrupt either page write or the old-sector erase at representative
    // byte boundaries. Reboot selects one intact generation and scrubs debris,
    // and it is always the generation the save reported.
    for (int operation=0;operation<3;++operation) for (const size_t partial:{size_t(0),size_t(1),size_t(3),size_t(4),size_t(128),size_t(255),size_t(256),size_t(2048),size_t(4096)}) {
        Flash f=initial; f.mutation=0; f.fail_at=operation; f.partial=partial; WakeOnLanStore writing(f.ports());
        const bool saved=writing.save(replacement);
        // Page write: never durable. Marker: durable once the commit word landed.
        // Old-slot scrub: the new generation is already durable.
        CHECK(saved==(operation==2 || (operation==1 && partial>=4)));
        f.fail_at=-1; WakeOnLanStore reboot(f.ports()); CHECK(reboot.load(loaded));
        CHECK(loaded.configured); CHECK(saved ? (loaded.generation==2 && loaded.config==replacement.config)
            : (loaded.generation==1 && loaded.config==old.config));
        const unsigned inactive=loaded.generation==1 ? 1:0;
        for (unsigned i=inactive*4096;i<(inactive+1)*4096;++i) CHECK(f.bytes[i]==0xff);
    }
    Flash f=initial; WakeOnLanStore store(f.ports()); CHECK(store.save(replacement)); CHECK(store.load(loaded)); CHECK(loaded.generation==2);
    StoredRecord tombstone{}; tombstone.generation=3; CHECK(store.save(tombstone)); CHECK(store.load(loaded));
    CHECK(!loaded.configured && loaded.generation==3);
    CHECK(!f.holds(old.config) && !f.holds(replacement.config));
    // Commit may have reached flash before the old-secret scrub failed. The
    // save reports the durable commit; an exact retry finishes the scrub
    // without advancing its generation again.
    f=initial; f.mutation=0; f.fail_at=2; f.partial=0; WakeOnLanStore retry(f.ports()); CHECK(retry.save(replacement));
    CHECK(f.holds(old.config));
    f.fail_at=-1; CHECK(retry.save(replacement)); CHECK(!f.holds(old.config)); CHECK(retry.load(loaded)); CHECK(loaded.generation==2);
    CHECK(!retry.save(old));
    f=initial; f.read_fail=true; f.mutation=0; WakeOnLanStore unreadable(f.ports());
    CHECK(!unreadable.load(loaded) && !unreadable.save(replacement));
    CHECK(f.mutation==0 && f.bytes==initial.bytes); // An IO fault must never erase a valid slot.

    // The tombstone can commit before old-secret erasure fails. Retrying the
    // exact record must finish the erase instead of treating it as a no-op.
    f=initial; f.mutation=0; f.fail_at=2; f.partial=0;
    WakeOnLanStore forgetting(f.ports());
    StoredRecord interrupted_forget{}; interrupted_forget.generation=2;
    CHECK(forgetting.save(interrupted_forget) && f.holds(old.config));
    f.fail_at=-1;
    CHECK(forgetting.save(interrupted_forget) && forgetting.load(loaded));
    CHECK(!loaded.configured && loaded.generation==2);
    CHECK(!f.holds(old.config));
}
void store_cleanup_failure_test() {
    // A save whose new record committed but whose superseded slot could not be
    // scrubbed keeps RAM and flash in step (D9): the engine adopts the commit,
    // Forget is never refused for a generation mismatch, and the old secret is
    // gone after the next save or the next boot.
    struct Context {
        WakeOnLanStore *store;
        static bool save(const StoredRecord &r,void *p) { return static_cast<Context *>(p)->store->save(r); }
    };
    for (int next=0;next<3;++next) {
        // Generation 1 lands in slot 0; the disable writes generation 2 into slot 1.
        Flash f; WakeOnLanStore store(f.ports()); const auto old=record(); CHECK(store.save(old));
        StoredRecord loaded{}; CHECK(store.load(loaded));
        Context context{&store}; ds5::wake_on_lan::WakeOnLanPorts ports{}; ports.context=&context; ports.save=Context::save;
        WakeOnLan engine{ports}; engine.initialize(loaded,true); engine.poll(100,true,false,true,true);
        f.mutation=0; f.fail_at=2; f.partial=0; // Program record, program marker, then the old-slot erase fails.
        uint8_t disable[5]={1,0,0,0,0}; CHECK(engine.command(6,disable,5)==AckOk);
        std::array<uint8_t,64> s{}; engine.encode_status(s.data(),s.size());
        CHECK(read_u32(s.data()+12)==2 && !(s[8]&2) && s[10]==uint8_t(Error::None));
        CHECK(!f.erased(0) && !f.erased(1)); // Generation 1 awaits its scrub.
        f.fail_at=-1;
        if (next==0) {
            // Forget with the generation Settings reads back succeeds, and its
            // save erases the superseded slot before writing into it.
            uint8_t forget[4]; write_u32(forget,2); CHECK(engine.command(7,forget,4)==AckOk);
            engine.encode_status(s.data(),s.size()); CHECK(read_u32(s.data()+12)==3 && !(s[8]&1));
            CHECK(!f.holds(old.config));
            WakeOnLanStore reboot(f.ports()); CHECK(reboot.load(loaded) && loaded.generation==3 && !loaded.configured);
        } else if (next==1) {
            // Enabling again persists, so the feature does not boot disabled.
            uint8_t enable[5]={2,0,0,0,1}; CHECK(engine.command(6,enable,5)==AckOk);
            WakeOnLanStore reboot(f.ports()); CHECK(reboot.load(loaded) && loaded.generation==3 && loaded.config[6]==1);
        } else {
            // The next boot scrubs the superseded slot and loads what RAM had.
            WakeOnLanStore reboot(f.ports()); CHECK(reboot.load(loaded) && loaded.generation==2 && !loaded.config[6]);
            CHECK(f.erased(0) && !f.erased(1));
        }
    }
}
void radio_scan_quiescence_test() {
    Harness setup;
    setup.upload(config());
    CHECK(setup.id_command(3,55)==AckOk);
    setup.engine.poll(setup.now+1,true,false,true,true,false);
    CHECK(setup.stage()==Stage::Testing && setup.radio.starts==0 && setup.engine.quiet_gate());
    setup.engine.poll(setup.now+100,true,false,true,true,true);
    CHECK(setup.stage()==Stage::Joining && setup.radio.starts==1);

    Harness blocked;
    blocked.upload(config());
    CHECK(blocked.id_command(3,55)==AckOk);
    blocked.engine.poll(blocked.now+1000,true,false,true,true,false);
    CHECK(blocked.stage()==Stage::Failed && blocked.radio.starts==0 && !blocked.engine.quiet_gate());
    CHECK(blocked.status()[10]==static_cast<uint8_t>(Error::Busy));
    CHECK(blocked.id_command(4,55)==AckBusy && blocked.radio.saves==0);

    Harness wake;
    wake.arm();
    wake.engine.controller_connected(1,true,true);
    wake.tick(wake.now+1,false,true);
    wake.engine.poll(wake.now+1000,false,true,true,true,false);
    CHECK(wake.stage()==Stage::UsbFirst && wake.radio.starts==0);
    wake.engine.poll(wake.now+1100,false,true,true,true,true);
    CHECK(wake.stage()==Stage::Joining && wake.radio.starts==1);

    Harness canceled;
    canceled.upload(config());
    CHECK(canceled.id_command(3,55)==AckOk);
    canceled.engine.poll(canceled.now+1,true,false,true,true,false);
    CHECK(canceled.id_command(5,55)==AckOk);
    CHECK(!canceled.engine.quiet_gate() && canceled.radio.starts==0);
}

int main() {
    config_packet_test(); golden_fixture_test(); configuration_flow_test(); region_acceptance_test();
    forget_idempotence_test(); staging_rejection_test(); prepared_wake_test(); cancellation_failure_test();
    controller_loss_test(); standalone_arming_test(); usb_wake_ownership_test(); host_return_evidence_test();
    prepared_host_return_test(); stale_candidate_test(); retained_outcome_test(); radio_marker_test();
    join_retry_test(); join_deadline_test(); long_uptime_test(); storage_power_loss_test(); store_cleanup_failure_test();
    radio_scan_quiescence_test();
    std::puts("Wake-on-LAN packet, transaction, authorization, bridge arming, host-return evidence, USB wake ownership, radio marker, join retry and atomic storage tests passed");
}
