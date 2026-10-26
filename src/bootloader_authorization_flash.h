#ifndef DS5_BRIDGE_BOOTLOADER_AUTHORIZATION_FLASH_H
#define DS5_BRIDGE_BOOTLOADER_AUTHORIZATION_FLASH_H

#include "bootloader_authorization.h"

// The enrolled bootloader key lives in its own flash sector, directly below
// BTstack's storage bank, so pairing data and the key never share an erase.
bool bootloader_authorization_flash_load(ds5::bootloader_authorization::PersistentRecord *record);
bool bootloader_authorization_flash_store(ds5::bootloader_authorization::PersistentRecord const *record);
bool bootloader_authorization_flash_erase();

#endif // DS5_BRIDGE_BOOTLOADER_AUTHORIZATION_FLASH_H
