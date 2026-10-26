#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "../../cmake/patches/cyw43_wol_guards.inc"
volatile bool ds5_cyw43_wlan_allowed = false;
#define CHECK(x) do { if (!(x)) abort(); } while (0)
int main(void) {
    uint8_t secret[68];
    for (unsigned i=0; i<sizeof(secret); ++i) secret[i]=(uint8_t)(i+1);
    ds5_cyw43_erase_secret(secret,sizeof(secret));
    for (unsigned i=0; i<sizeof(secret); ++i) CHECK(secret[i]==0);
    // GET and SET success flags, including request ID/interface bits, must
    // remain successful. A firmware status/error flag can never become ACK0.
    CHECK(!ds5_cyw43_ioctl_failed(0, 0));
    CHECK(!ds5_cyw43_ioctl_failed(0, 2));
    CHECK(!ds5_cyw43_ioctl_failed(0, 0xabcd1002));
    CHECK(ds5_cyw43_ioctl_failed(0, 1));
    CHECK(ds5_cyw43_ioctl_failed(0, 0xabcd1003));
    CHECK(ds5_cyw43_ioctl_failed(0xffffffe2, 0));
    CHECK(ds5_cyw43_ioctl_failed(1, 2));
    for (unsigned bits=0; bits<8; ++bits) {
        bool rejoin=bits&1, wpa=bits&2, disassoc=bits&4;
        ds5_cyw43_wlan_allowed=true;
        ds5_cyw43_cancel_disabled_work(&rejoin,&wpa,&disassoc);
        CHECK(rejoin==!!(bits&1) && wpa==!!(bits&2) && disassoc==!!(bits&4));
        ds5_cyw43_wlan_allowed=false;
        ds5_cyw43_cancel_disabled_work(&rejoin,&wpa,&disassoc);
        CHECK(!rejoin && !wpa && !disassoc);
    }
    // The RSN-mismatch retry (WPA flag plus rejoin) is dropped; ordinary
    // rejoins after a key-exchange timeout or ICV error are kept.
    for (unsigned bits=0; bits<4; ++bits) {
        bool rejoin=bits&1, wpa=bits&2;
        ds5_cyw43_refuse_wpa_downgrade(&rejoin,&wpa);
        CHECK(!wpa && rejoin==((bits&1) && !(bits&2)));
    }
    // The PMK request and its echoed response leave no bytes in the shared SPI
    // buffer: headers, payload and the padded-header allowance are scrubbed,
    // and nothing past them is touched.
    uint8_t transfer[2048];
    const size_t pmk_span=12+16+68;
    memset(transfer,0x5a,sizeof(transfer));
    ds5_cyw43_erase_transfer_secret(transfer,sizeof(transfer),pmk_span);
    for (size_t i=0; i<sizeof(transfer); ++i) CHECK(transfer[i]==(i<pmk_span+16 ? 0:0x5a));
    uint8_t small[40];
    memset(small,0x5a,sizeof(small));
    ds5_cyw43_erase_transfer_secret(small,sizeof(small),pmk_span);
    for (size_t i=0; i<sizeof(small); ++i) CHECK(small[i]==0);
    return 0;
}
