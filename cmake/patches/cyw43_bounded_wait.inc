// The SDK defines both waits as a poll-mode async_context wait of up to 1 ms,
// which can sleep past its timeout with nothing to wake it while an ioctl
// blocks the main loop (cmake/patch-cyw43.cmake). The ioctl and send-credit
// loops check their own deadlines after every wait.
#include "hardware/timer.h"
#undef CYW43_SDPCM_SEND_COMMON_WAIT
#undef CYW43_DO_IOCTL_WAIT
#define CYW43_SDPCM_SEND_COMMON_WAIT busy_wait_us_32(100);
#define CYW43_DO_IOCTL_WAIT busy_wait_us_32(100);
