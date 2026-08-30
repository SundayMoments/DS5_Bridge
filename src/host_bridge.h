#ifndef DS5_BRIDGE_HOST_BRIDGE_H
#define DS5_BRIDGE_HOST_BRIDGE_H

#include <stdint.h>

#define HOST_BRIDGE_INTERFACE_NUMBER 0x05
#define HOST_BRIDGE_BRIDGE_ONLY_INTERFACE_NUMBER 0x01
#define HOST_BRIDGE_EP_OUT 0x07

#ifdef __cplusplus
extern "C" {
#endif

uint8_t host_bridge_runtime_interface_number(void);
uint16_t host_bridge_get_report(uint8_t report_id, uint8_t *buffer, uint16_t reqlen);
void host_bridge_set_report(uint8_t const *report, uint16_t len);

#ifdef __cplusplus
}
#endif

#endif // DS5_BRIDGE_HOST_BRIDGE_H
