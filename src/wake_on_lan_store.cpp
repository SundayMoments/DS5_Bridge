// Ported from Kitsune Input's Wake-on-LAN.
#include "wake_on_lan_store.h"
#include "wake_on_lan_crc32.h"
#include <cstring>

namespace ds5::wake_on_lan {
namespace {
constexpr uint32_t kSector=4096, kPage=256, kMagic=0x314c574b, kCommit=0x544d4f43;
struct SecretPage {
    std::array<uint8_t,kPage> bytes{};
    ~SecretPage() { erase_secret(bytes.data(),bytes.size()); }
};
}
bool WakeOnLanStore::read_slot(unsigned slot, StoredRecord &record) {
    SecretPage page;
    uint8_t marker[4]{};
    if (!ports_.read || !ports_.read(slot*kSector,page.bytes.data(),kPage,ports_.context)
        || !ports_.read(slot*kSector+kPage,marker,sizeof(marker),ports_.context)) {
        read_failed_=true; return false;
    }
    const auto *p=page.bytes.data();
    if (read_u32(marker)!=kCommit || read_u32(p)!=kMagic || p[4]!=1 || p[5]>1
        || p[6] || p[7] || !read_u32(p+8)
        || crc32_seeded(p,252,0)!=read_u32(p+252)) return false;
    record={}; record.generation=read_u32(p+8); record.transaction=read_u32(p+12);
    record.configured=p[5]!=0;
    if (record.configured) {
        std::memcpy(record.config.data(),p+16,kConfigSize);
        if (!valid_config(record.config)) { erase_secret(&record,sizeof(record)); return false; }
    } else {
        for (size_t i=16;i<16+kConfigSize;++i) if (p[i]!=0) return false;
    }
    return true;
}
bool WakeOnLanStore::clear_slot(unsigned slot) {
    // Avoid wearing flash on ordinary boot. Also scrub interrupted uncommitted
    // pages: otherwise Abort/Forget could leave an extractable old credential.
    SecretPage page; bool erased=true;
    for (uint32_t off=0;off<kSector;off+=kPage) {
        if (!ports_.read(slot*kSector+off,page.bytes.data(),kPage,ports_.context)) return false;
        for (auto byte:page.bytes) erased &= byte==0xff;
    }
    if (erased) return true;
    if (!ports_.erase || !ports_.erase(slot,ports_.context)) return false;
    for (uint32_t off=0;off<kSector;off+=kPage) {
        if (!ports_.read(slot*kSector+off,page.bytes.data(),kPage,ports_.context)) return false;
        for (auto byte:page.bytes) if (byte!=0xff) return false;
    }
    return true;
}
bool WakeOnLanStore::load(StoredRecord &record) {
    read_failed_=false;
    StoredRecord slots[2]{};
    const bool a=read_slot(0,slots[0]), b=read_slot(1,slots[1]);
    if (read_failed_) { erase_secret(slots,sizeof(slots)); record={}; return false; }
    const unsigned active=b && (!a || slots[1].generation>slots[0].generation) ? 1:0;
    bool ok;
    if (!a && !b) { record={}; ok=clear_slot(0) && clear_slot(1); }
    else {
        // Equal generations with different records are ambiguous; fail closed.
        if (a && b && slots[0].generation==slots[1].generation) {
            erase_secret(slots,sizeof(slots)); record={}; return false;
        }
        record=slots[active]; ok=clear_slot(active^1);
    }
    erase_secret(slots,sizeof(slots));
    if (!ok) { erase_secret(&record,sizeof(record)); record={}; }
    return ok;
}
bool WakeOnLanStore::save(const StoredRecord &record) {
    read_failed_=false;
    if (!record.generation || (record.configured && !valid_config(record.config))
        || !ports_.program || !ports_.read) return false;
    StoredRecord slots[2]{};
    const bool a=read_slot(0,slots[0]), b=read_slot(1,slots[1]);
    if (read_failed_) { erase_secret(slots,sizeof(slots)); return false; }
    const unsigned active=b && (!a || slots[1].generation>slots[0].generation) ? 1:0;
    if ((a || b) && record.generation<=slots[active].generation) {
        // A previous call may have committed successfully but failed old-secret
        // cleanup. Allow only that exact record to complete the pending erase.
        const bool same=record.generation==slots[active].generation
            && record.transaction==slots[active].transaction
            && record.configured==slots[active].configured
            && (!record.configured || record.config==slots[active].config);
        erase_secret(slots,sizeof(slots));
        return same && clear_slot(active^1);
    }
    erase_secret(slots,sizeof(slots));
    const unsigned next=(a||b) ? active^1:0;
    if (!clear_slot(next)) return false;
    SecretPage page, check;
    page.bytes.fill(0xff); auto *p=page.bytes.data();
    write_u32(p,kMagic); p[4]=1; p[5]=record.configured; p[6]=p[7]=0;
    write_u32(p+8,record.generation); write_u32(p+12,record.transaction);
    std::memset(p+16,0,kConfigSize);
    if (record.configured) std::memcpy(p+16,record.config.data(),kConfigSize);
    write_u32(p+252,crc32_seeded(p,252,0));
    if (!ports_.program(next*kSector,p,ports_.context)
        || !ports_.read(next*kSector,check.bytes.data(),kPage,ports_.context)
        || check.bytes!=page.bytes) return false;
    page.bytes.fill(0xff); write_u32(p,kCommit);
    // The marker program can report failure after it reached flash. Readback,
    // not the port result, decides whether the new generation is durable.
    (void)ports_.program(next*kSector+kPage,p,ports_.context);
    StoredRecord verified{};
    const bool committed=read_slot(next,verified) && verified.generation==record.generation
        && verified.transaction==record.transaction && verified.configured==record.configured
        && (!record.configured || verified.config==record.config);
    erase_secret(&verified,sizeof(verified));
    if (!committed) return false;
    // The verified record is now the one load() selects, so report success and
    // keep RAM in step with flash. A failed scrub of the superseded slot leaves
    // only an older generation behind: the next save erases that slot before
    // writing into it, and load() scrubs it at the latest on the next boot.
    (void)clear_slot(next^1);
    return true;
}
}
