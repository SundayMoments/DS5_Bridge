#ifndef DS5_BRIDGE_USB_DESCRIPTOR_MODE_H
#define DS5_BRIDGE_USB_DESCRIPTOR_MODE_H

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

void usb_descriptor_set_bridge_only_active(bool active);
bool usb_descriptor_bridge_only_active(void);

#ifdef __cplusplus
}
#endif

#endif // DS5_BRIDGE_USB_DESCRIPTOR_MODE_H
