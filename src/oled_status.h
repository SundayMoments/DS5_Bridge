#ifndef DS5_BRIDGE_OLED_STATUS_H
#define DS5_BRIDGE_OLED_STATUS_H

#include <cstdint>

// Call once before watchdog startup, then from the core-0 main loop.
void oled_status_init();
// The battery value is already decoded from the latest input report.
void oled_status_loop(uint8_t battery_percent);

#endif // DS5_BRIDGE_OLED_STATUS_H
