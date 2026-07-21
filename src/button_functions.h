//
// BOOTSEL button gestures.
//

#ifndef DS5_BRIDGE_BUTTON_FUNCTIONS_H
#define DS5_BRIDGE_BUTTON_FUNCTIONS_H

// Poll BOOTSEL at 10 Hz. Click disconnects a connected controller while
// preserving pairing, or requests pairing while idle. Double click reboots,
// triple click enters USB flashing mode, and hold forgets controller pairings.
void button_check();

#endif // DS5_BRIDGE_BUTTON_FUNCTIONS_H
