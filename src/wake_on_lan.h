#pragma once

#include <cstddef>
#include <cstdint>

// Ported from Kitsune Input's Wake-on-LAN radio adapter. The engine lives in
// wake_on_lan_engine.{h,cpp}; this is the CYW43/flash/watchdog platform side.
//
// All mutations run on core 0 at the top level. BT/USB callbacks may publish
// observations, but command processing and poll must not run inside callbacks.
void wake_on_lan_init();
// firmware_host: the current USB session selected the HID boot protocol, as
// BIOS/UEFI keyboard drivers do; it never counts toward a returned host.
void wake_on_lan_poll(uint64_t now_ms, bool host_active, bool external_suspended,
                      bool controllers_quiet, bool idle_for_setup, bool radio_ready,
                      bool firmware_host);
void wake_on_lan_controller_connected(uint32_t generation,
                                      bool authenticated_prior_bond,
                                      bool qualified_reconnect);
void wake_on_lan_controller_disconnected(uint32_t generation);
// True while Wi-Fi work owns the radio. Gameplay input, output and audio stay
// quiet; false whenever Wake-on-LAN is idle. Always inlined: the SRAM receive,
// audio and USB paths check it with one load and never call into flash.
#ifdef ENABLE_COMPANION
extern volatile bool wake_on_lan_quiet_cached;
__attribute__((always_inline)) inline bool wake_on_lan_quiet_gate() { return wake_on_lan_quiet_cached; }
#else
__attribute__((always_inline)) inline bool wake_on_lan_quiet_gate() { return false; }
#endif
bool wake_on_lan_allow_usb_wake();
bool wake_on_lan_suspend_exempt();
bool wake_on_lan_take_usb_wake_request();
bool wake_on_lan_recovery_required();
bool wake_on_lan_preparing();
// Preparing under a host session. An enabled bridge also arms itself after an
// enumerated host leaves the bus; that path respects the user's USB
// sleep-disconnect setting instead of forcing a controller power-off.
bool wake_on_lan_host_prepared();
bool wake_on_lan_armed();
// Uses ordinary companion AckResult values. Extra command bytes include zero
// padding; encode_status writes all 64 bytes including feature report ID 0x1d.
uint8_t wake_on_lan_command(uint16_t opcode, const uint8_t *payload, size_t length);
void wake_on_lan_encode_status(uint8_t *report, size_t length);
