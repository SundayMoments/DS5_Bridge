#ifndef DS5_BRIDGE_XUSB360_USB_H
#define DS5_BRIDGE_XUSB360_USB_H

#include <cstdint>

#ifdef ENABLE_COMPANION
constexpr uint8_t kXusb360InterfaceNumber = 0x03;
#else
constexpr uint8_t kXusb360InterfaceNumber = 0x05;
#endif
constexpr uint8_t kXusb360EpIn = 0x84;
constexpr uint8_t kXusb360EpOut = 0x03;
constexpr uint8_t kXusb360EpSize = 32;

bool xusb360_usb_ready();
bool xusb360_usb_send_report(uint8_t const *report, uint8_t len);

#endif // DS5_BRIDGE_XUSB360_USB_H
