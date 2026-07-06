#ifdef ENABLE_COMPANION

#include "tusb.h"
#include "device/usbd_pvt.h"

extern "C" usbd_class_driver_t const *host_bridge_usb_driver(void);
extern "C" usbd_class_driver_t const *xusb360_usb_driver(void);

extern "C" usbd_class_driver_t const *usbd_app_driver_get_cb(uint8_t *driver_count) {
    static usbd_class_driver_t const drivers[] = {
        *xusb360_usb_driver(),
        *host_bridge_usb_driver(),
    };

    *driver_count = static_cast<uint8_t>(sizeof(drivers) / sizeof(drivers[0]));
    return drivers;
}

#endif // ENABLE_COMPANION
