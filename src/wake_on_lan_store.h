// Ported from Kitsune Input's Wake-on-LAN.
#pragma once
#include "wake_on_lan_domain.h"
#include "wake_on_lan_ports.h"

namespace ds5::wake_on_lan {
// Offsets are relative to the beginning of the exclusively reserved two sectors.
class WakeOnLanStore {
public:
    explicit WakeOnLanStore(WakeOnLanFlashPorts ports) : ports_(ports) {}
    bool load(StoredRecord &record);
    bool save(const StoredRecord &record);
private:
    bool read_slot(unsigned slot, StoredRecord &record);
    bool clear_slot(unsigned slot);
    WakeOnLanFlashPorts ports_;
    bool read_failed_=false;
};
}
