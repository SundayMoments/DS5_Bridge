// Wake-on-LAN over Wi-Fi for DS5 Bridge.
//
// Sends a standard UDP magic packet to a configured target PC when a
// DualSense controller connects, so the PC wakes over the network. Isolated
// from the Bluetooth/controller code: bt.cpp only calls
// wolwifi_on_controller_connect() at the point a connection becomes Ready
// (see decisions.md for why that call site was chosen). Everything else --
// Wi-Fi connection, retry, and the magic packet itself -- lives here.
//
// Compiled only when ENABLE_WOLWIFI is set (Waveshare RP2350B-Plus-W build).
// On boards without it, the stubs below are no-ops so callers never need an
// #ifdef.
#pragma once
#include <cstdint>
#include <cstddef>

#ifdef ENABLE_WOLWIFI

// Must be called once during boot, after cyw43_arch_init() (main.cpp already
// calls cyw43_arch_init() for Bluetooth; WOL reuses that same CYW43 radio).
void wolwifi_init(void);

// Polled every main-loop iteration. Non-blocking: drives Wi-Fi
// connect/reconnect and any pending magic-packet send. Never blocks on
// network I/O regardless of Wi-Fi state.
void wolwifi_task(void);

// Call exactly once per controller connect edge (DISCONNECTED -> CONNECTED).
// No-ops if WOL is disabled, unconfigured, or Wi-Fi isn't connected --
// controller operation must never depend on this succeeding.
void wolwifi_on_controller_connect(void);

// Runtime configuration, applied by the companion app. All setters are
// safe to call at any time; they take effect on the next wolwifi_task().
void wolwifi_set_enabled(bool enabled);
bool wolwifi_is_enabled(void);

// SSID and password are set independently (the companion app sends them as
// separate commands). len excludes any NUL terminator. Returns false (and
// leaves the prior value untouched) if len exceeds the firmware's max, or
// data is null with nonzero len -- firmware never trusts the companion
// app's client-side validation alone.
bool wolwifi_set_wifi_ssid(const char *ssid, uint8_t ssid_len);
bool wolwifi_set_wifi_password(const char *password, uint8_t password_len);

// mac must be exactly 6 raw bytes (not a "AA:BB:.." string). Returns false
// (leaving prior config untouched) on a null pointer.
bool wolwifi_set_target_mac(const uint8_t mac[6]);

// True while an automatic-trigger resend cycle is actively sending/waiting
// for the target to confirm it woke up (see begin_resend_cycle()/
// drive_resend_cycle() in wolwifi.cpp), or the host-observation window
// ahead of it is still running (see begin_observe_host()/
// drive_observe_host()). Used by usb.cpp to suppress the USB-suspend
// controller-power-off behavior for exactly this window -- without it, the
// board would power off the controller ~3s after the PC suspends, before
// WOL has a chance to actually wake it back up.
bool wolwifi_wake_in_progress(void);

#else

static inline void wolwifi_init(void) {}
static inline void wolwifi_task(void) {}
static inline void wolwifi_on_controller_connect(void) {}
static inline void wolwifi_set_enabled(bool) {}
static inline bool wolwifi_is_enabled(void) { return false; }
static inline bool wolwifi_set_wifi_ssid(const char *, uint8_t) { return false; }
static inline bool wolwifi_set_wifi_password(const char *, uint8_t) { return false; }
static inline bool wolwifi_set_target_mac(const uint8_t[6]) { return false; }
static inline bool wolwifi_wake_in_progress(void) { return false; }

#endif // ENABLE_WOLWIFI
