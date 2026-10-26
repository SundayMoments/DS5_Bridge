// Shared by the generated driver and focused host tests. These helpers do not
// alter Bluetooth HCI, receive flow-control state, or ordinary successful SETs.
extern volatile bool ds5_cyw43_wlan_allowed;
static inline bool ds5_cyw43_ioctl_failed(uint32_t status, uint32_t flags) {
    return status != 0 || (flags & 1u) != 0;
}
static inline void ds5_cyw43_erase_secret(void *data, size_t length) {
    volatile uint8_t *bytes = (volatile uint8_t *)data;
    while (length--) *bytes++ = 0;
}
// Scrubs a secret-bearing ioctl from the shared SPI transfer buffer. `length`
// spans the headers and payload; 16 more bytes cover a padded response header.
static inline void ds5_cyw43_erase_transfer_secret(uint8_t *buffer, size_t capacity, size_t length) {
    length += 16;
    if (length > capacity) length = capacity;
    ds5_cyw43_erase_secret(buffer, length);
}
static inline void ds5_cyw43_cancel_disabled_work(bool *rejoin, bool *wpa, bool *disassoc) {
    if (!ds5_cyw43_wlan_allowed) {
        *rejoin = false;
        *wpa = false;
        *disassoc = false;
    }
}
// Only PRUNE reason 8 (RSN mismatch) sets the WPA flag, always together with
// a rejoin. Drop both instead of retrying with WPA1 PSK: the firmware's own
// join result, a NONET re-scan, or the bridge's join deadline ends the attempt.
static inline void ds5_cyw43_refuse_wpa_downgrade(bool *rejoin, bool *wpa) {
    if (*wpa) {
        *wpa = false;
        *rejoin = false;
    }
}
