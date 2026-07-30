// https://github.com/rafaelvaloto/Pico_W-Dualsense/blob/main/btstack_config.h

// c
#ifndef BTSTACK_CONFIG_H
#define BTSTACK_CONFIG_H

#include "debug_config.h"

#ifndef ENABLE_CLASSIC
#define ENABLE_CLASSIC
#endif


// CYW43 HCI Transport requires pre-buffer space for packet header

// Values 1 or 2 overflow with DualSense 0x31 reports.
#define MAX_NR_HCI_ACL_PACKETS 4

#define MAX_NR_HCI_CONNECTIONS 1
#define MAX_NR_L2CAP_CHANNELS  2
#define MAX_NR_L2CAP_SERVICES  3 // GDP + CONTROL + INTERRUPT
//
#define HCI_ACL_PAYLOAD_SIZE 1021
#define HCI_ACL_CHUNK_SIZE_ALIGNMENT 4
#define HCI_OUTGOING_PRE_BUFFER_SIZE 4


#define MAX_NR_RFCOMM_MULTIPLEXERS 0
#define MAX_NR_RFCOMM_SERVICES 0
#define MAX_NR_RFCOMM_CHANNELS 0

// CYW43-specific settings required for the transport layer.

#define NVM_NUM_LINK_KEYS 4
#define NVM_NUM_DEVICE_DB_ENTRIES 4
#define HAVE_EMBEDDED_TIME_MS

// Required by the Pico SDK's linked BTstack stdout dump source. Firmware
// hexdump calls still compile out unless DS5_DEBUG_LOGS_ENABLED is set.
#define ENABLE_PRINTF_HEXDUMP

#if DS5_DEBUG_LOGS_ENABLED
#define ENABLE_LOG_ERROR
#endif

#endif
