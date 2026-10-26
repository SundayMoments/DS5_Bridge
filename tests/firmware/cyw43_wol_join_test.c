#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#define CHECK(c) do { if (!(c)) { fprintf(stderr, "WLAN join check failed at line %d: %s\n", __LINE__, #c); exit(1); } } while (0)
#define WIFI_JOIN_STATE_ACTIVE 0x0001u
#define WIFI_JOIN_STATE_FAIL 0x0002u
#define WIFI_JOIN_STATE_NONET 0x0003u
#define WIFI_JOIN_STATE_BADAUTH 0x0004u
#define WIFI_JOIN_STATE_AUTH 0x0200u
#define WIFI_JOIN_STATE_LINK 0x0400u
#define WIFI_JOIN_STATE_KEYED 0x0800u
#define CYW43_AUTH_OPEN 0u
#define CYW43_AUTH_WPA2_AES_PSK 0x00400004u
#define CYW43_EPERM 1
#define CYW43_THREAD_ENTER (++locks)
#define CYW43_THREAD_EXIT (--locks)
#define CYW43_STA_IS_ACTIVE(s) ((s)->active)
#define SDPCM_SET 2
#define WLC_SET_VAR 263
#define WWD_STA_INTERFACE 0
typedef struct { int placeholder; } cyw43_ll_t;
typedef struct { cyw43_ll_t cyw43_ll; uint32_t wifi_join_state; bool active; } cyw43_t;
typedef struct { int placeholder; } cyw43_int_t;
static cyw43_t *joining;
static int locks, ensure_result, join_result, join_calls, ioctl_result;
static uint32_t inline_event_state, state_at_join;
static uint8_t event_request[41];
static int cyw43_ensure_up(cyw43_t *self) { (void)self; return ensure_result; }
static int cyw43_ll_wifi_join(cyw43_ll_t *self, size_t ssid_len, const uint8_t *ssid,
                             size_t key_len, const uint8_t *key, uint32_t auth,
                             const uint8_t *bssid, uint32_t channel) {
    (void)self; (void)ssid_len; (void)ssid; (void)key_len; (void)key;
    (void)auth; (void)bssid; (void)channel;
    CHECK(locks == 1); ++join_calls; state_at_join = joining->wifi_join_state;
    // The real synchronous ioctl wait dispatches async events before returning.
    if (inline_event_state) joining->wifi_join_state = inline_event_state;
    return join_result;
}
static void cyw43_ll_wifi_rejoin(cyw43_ll_t *self) {
    (void)self; state_at_join = joining->wifi_join_state;
    if (inline_event_state) joining->wifi_join_state = inline_event_state;
}
static int cyw43_do_ioctl(cyw43_int_t *self, int kind, int command, size_t length,
                          const uint8_t *buf, int interface) {
    (void)self;
    CHECK(kind == SDPCM_SET && command == WLC_SET_VAR && length == 41 && interface == 0);
    memcpy(event_request, buf, length); return ioctl_result;
}
// Compile the exact implementations inserted into generated SDK source.
#include "../../cmake/patches/cyw43_wol_join.inc"
#include "../../cmake/patches/cyw43_wol_event_mask.inc"

static int join(cyw43_t *self, uint32_t auth) {
    joining = self;
    const int result = cyw43_wifi_join(self, 4, (const uint8_t *)"Home", 8,
                                      (const uint8_t *)"password", auth, NULL, 0);
    CHECK(locks == 0); return result;
}
static void join_events_test(void) {
    cyw43_t self = {.active = true};
    // Reuse a prior completed/failed connection, and deliver partial progress,
    // completion or authentication failure inside the synchronous join call.
    const uint32_t events[] = {0, 0x201, 0x401, 0x801, 0xe01, WIFI_JOIN_STATE_BADAUTH};
    for (unsigned i = 0; i < sizeof(events)/sizeof(events[0]); ++i) {
        self.wifi_join_state = WIFI_JOIN_STATE_FAIL; inline_event_state = events[i];
        CHECK(join(&self, CYW43_AUTH_WPA2_AES_PSK) == 0);
        CHECK(state_at_join == WIFI_JOIN_STATE_ACTIVE);
        CHECK(self.wifi_join_state == (events[i] ? events[i] : WIFI_JOIN_STATE_ACTIVE));
        self.wifi_join_state = WIFI_JOIN_STATE_FAIL;
        ds5_cyw43_wifi_rejoin(&self);
        CHECK(state_at_join == WIFI_JOIN_STATE_ACTIVE);
        CHECK(self.wifi_join_state == (events[i] ? events[i] : WIFI_JOIN_STATE_ACTIVE));
    }
    // The radio adapter re-issues the join after a missed scan (NONET). The
    // retry must start from an active join state, not the stale NONET result,
    // and repeated retries each issue a new SET_SSID.
    inline_event_state = 0;
    for (unsigned retry = 0; retry < 3; ++retry) {
        const int calls_before = join_calls;
        self.wifi_join_state = WIFI_JOIN_STATE_NONET;
        CHECK(join(&self, CYW43_AUTH_WPA2_AES_PSK) == 0);
        CHECK(join_calls == calls_before + 1 && state_at_join == WIFI_JOIN_STATE_ACTIVE);
        CHECK(self.wifi_join_state == WIFI_JOIN_STATE_ACTIVE);
    }
    CHECK(join(&self, CYW43_AUTH_OPEN) == 0);
    CHECK(state_at_join == (WIFI_JOIN_STATE_ACTIVE | WIFI_JOIN_STATE_KEYED));
    join_result = -7;
    CHECK(join(&self, CYW43_AUTH_WPA2_AES_PSK) == -7);
    CHECK(self.wifi_join_state == WIFI_JOIN_STATE_FAIL);
    const int calls = join_calls;
    ensure_result = -9;
    CHECK(join(&self, CYW43_AUTH_WPA2_AES_PSK) == -9 && join_calls == calls);
    self.active = false;
    CHECK(join(&self, CYW43_AUTH_WPA2_AES_PSK) == -CYW43_EPERM && join_calls == calls);
}
static void event_mask_test(void) {
    cyw43_int_t self = {0}; uint8_t buffer[43];
    for (unsigned fill = 0; fill < 256; ++fill) {
        memset(buffer, (int)fill, sizeof(buffer));
        CHECK(ds5_cyw43_enable_wifi_events(&self, buffer + 1) == 0);
        CHECK(buffer[0] == fill && buffer[42] == fill);
        CHECK(!memcmp(event_request, "bsscfg:event_msgs", 18));
        for (unsigned i = 18; i < 22; ++i) CHECK(event_request[i] == 0);
        for (unsigned event = 0; event < 152; ++event) {
            const bool expected = event != 19 && event != 20 && event != 40
                && event != 44 && event != 54 && event != 71;
            CHECK(!!(event_request[22 + event/8] & (1u << (event%8))) == expected);
        }
    }
    ioctl_result = -5;
    CHECK(ds5_cyw43_enable_wifi_events(&self, buffer + 1) == -5);
}
int main(int argc, char **argv) {
    CHECK(argc == 2);
    if (!strcmp(argv[1], "events")) join_events_test();
    else if (!strcmp(argv[1], "mask")) event_mask_test();
    else CHECK(false);
    return 0;
}
