//
// BOOTSEL button gestures.
//

#ifndef DS5_BRIDGE_BUTTON_FUNCTIONS_H
#define DS5_BRIDGE_BUTTON_FUNCTIONS_H

// Poll BOOTSEL at 10 Hz. Triple click reboots into USB firmware flashing mode.
void button_check();

#endif // DS5_BRIDGE_BUTTON_FUNCTIONS_H
