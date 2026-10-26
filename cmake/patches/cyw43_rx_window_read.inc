// Runtime B2H payload only. The caller has validated one contiguous <=4 KiB
// ring segment and owns the SDK bus lock. Keep every original SPI/page boundary
// and restore the default window before publication, another segment or unlock.
int ds5_cyw43_read_backplane_mem_batched(cyw43_ll_t *self_in, uint32_t addr,
                                            uint32_t len, uint8_t *buf) {
    cyw43_int_t *self = CYW_INT_FROM_LL(self_in);
    while (len > 0) {
        const uint32_t backplane_addr = addr & BACKPLANE_ADDR_MASK;
        uint32_t chunk = MIN(len, CYW43_BUS_MAX_BLOCK_SIZE);
        chunk = MIN(chunk, 0x1000u - (addr & 0xfffu));
        chunk = MIN(chunk, BACKPLANE_ADDR_MASK + 1u - backplane_addr);
        if (self->cur_backplane_window != (addr & ~BACKPLANE_ADDR_MASK)) {
            cyw43_set_backplane_window(self, addr);
        }
        // cybt_mem_read ignores individual read errors and continues all chunks.
        // Preserve that contract; cyw43_read_bytes retains its error diagnostic.
        (void)cyw43_read_bytes(self, BACKPLANE_FUNCTION,
            backplane_addr | SBSDIO_SB_ACCESS_2_4B_FLAG, chunk, buf);
        addr += chunk;
        buf += chunk;
        len -= chunk;
    }
    // Includes a defensive empty call and every failed-read path.
    cyw43_set_backplane_window(self, CHIPCOMMON_BASE_ADDRESS);
    return 0;
}
