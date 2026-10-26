// Ported from Kitsune Input's Wake-on-LAN.
#include "wake_on_lan_domain.h"
#include <cstring>

namespace ds5::wake_on_lan {
uint32_t read_u32(const uint8_t *p) {
    return uint32_t(p[0]) | uint32_t(p[1]) << 8 | uint32_t(p[2]) << 16 | uint32_t(p[3]) << 24;
}
void write_u32(uint8_t *p, uint32_t n) { for (unsigned i=0;i<4;++i) p[i]=uint8_t(n>>(8*i)); }
void erase_secret(void *data, size_t length) {
    auto *p = static_cast<volatile uint8_t *>(data);
    while (length--) *p++ = 0;
}
bool valid_country(uint8_t a, uint8_t b) {
    // pico-sdk 2.3.0 cyw43_country.h profiles, plus legacy IE for saved records.
    constexpr char codes[] = "XXAUATBEBRCACLCNCOCZDKEEFIFRDEGRHKHUISINILITJPKELVLILTLUMYMTMXNLNZNGNOPEPHPLPTSGSKSIZAKRESSECHTWTHTRGBUSIE";
    for (size_t i=0;i<sizeof(codes)-1;i+=2) if (codes[i]==a && codes[i+1]==b) return true;
    return false;
}
bool radio_country(uint8_t a, uint8_t b) {
    // The pinned CLM (43439_raspberrypi_picow_v5_220624) has 50 named locales
    // plus XX; cyw43_country.h also names FI, which the CLM lacks. A host test
    // checks this list against the SDK firmware image.
    if ((a=='F' && b=='I') || (a=='I' && b=='E')) return false;
    return valid_country(a,b);
}
bool JoinRetry::on_no_network(uint64_t now) {
    if (pending_) return true;
    if (retries_>=kMaxRetries || now<started_at_ || now-started_at_+kBackoffMs>kWindowMs) return false;
    ++retries_; retry_at_=now+kBackoffMs; pending_=true; return true;
}
namespace {
constexpr uint32_t kMarkerMagic=0x4c4f574b; // "KWOL"
constexpr uint32_t kMarkerVersion=1;
uint32_t marker_check(uint32_t magic, uint32_t value) {
    const uint32_t rotated=(value<<13) | (value>>19);
    return ~(magic ^ rotated ^ 0x9e3779b9u);
}
}
void encode_radio_marker(uint8_t packets, uint32_t *words) {
    words[0]=kMarkerMagic; words[1]=(kMarkerVersion<<24) | packets;
    words[2]=marker_check(words[0],words[1]);
}
bool decode_radio_marker(const uint32_t *words, uint8_t &packets) {
    if (!words || words[0]!=kMarkerMagic || (words[1]>>24)!=kMarkerVersion
        || (words[1]&0x00ffff00u) || (words[1]&0xffu)>3 || words[2]!=marker_check(words[0],words[1])) return false;
    packets=uint8_t(words[1]&0xffu); return true;
}
bool valid_mac(const uint8_t *mac) {
    if (!mac || (mac[0]&1)) return false;
    uint8_t any=0; for (size_t i=0;i<6;++i) any|=mac[i];
    return any!=0;
}
static bool valid_utf8(const uint8_t *p, size_t n) {
    for (size_t i=0;i<n;) {
        uint32_t c=p[i++]; unsigned extra=0; uint32_t min=0;
        if (!c) return false;
        if (c<0x80) continue;
        if (c>=0xc2 && c<=0xdf) { extra=1; min=0x80; c&=0x1f; }
        else if (c>=0xe0 && c<=0xef) { extra=2; min=0x800; c&=0xf; }
        else if (c>=0xf0 && c<=0xf4) { extra=3; min=0x10000; c&=7; }
        else return false;
        if (i+extra>n) return false;
        while (extra--) { if ((p[i]&0xc0)!=0x80) return false; c=(c<<6)|(p[i++]&0x3f); }
        if (c<min || c>0x10ffff || (c>=0xd800 && c<=0xdfff)) return false;
    }
    return true;
}
bool valid_config(const Config &c) {
    if (c[0]!=1 || c[1]!=1 || c[2]<1 || c[2]>32 || c[3]<8 || c[3]>63
        || !valid_country(c[4],c[5]) || c[6]>1 || c[7] || c[110] || c[111]
        || !valid_mac(c.data()+8) || !valid_utf8(c.data()+14,c[2])) return false;
    for (size_t i=c[2];i<32;++i) if (c[14+i]) return false;
    for (size_t i=0;i<c[3];++i) if (c[46+i]<0x20 || c[46+i]>0x7e) return false;
    for (size_t i=c[3];i<64;++i) if (c[46+i]) return false;
    return true;
}
void magic_frame(const uint8_t *source, const uint8_t *target, uint8_t *frame) {
    std::memset(frame,0xff,6); std::memcpy(frame+6,source,6);
    frame[12]=0x08; frame[13]=0x42; std::memset(frame+14,0xff,6);
    for (size_t i=0;i<16;++i) std::memcpy(frame+20+i*6,target,6);
}
}
