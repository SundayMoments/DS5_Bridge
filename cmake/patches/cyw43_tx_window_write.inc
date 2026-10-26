// Runtime H2B payload only. The caller has already validated one contiguous
// ring segment (at most 4 KiB) and owns the SDK bus lock. No yield, new lock,
// persistent batch state, or enlarged SPI transaction is introduced here.
int ds5_cyw43_write_backplane_mem_batched(cyw43_ll_t *self_in, uint32_t addr,
                                             uint32_t len, const uint8_t *buf) {
    cyw43_int_t *self = CYW_INT_FROM_LL(self_in);
    while (len > 0) {
        const uint32_t backplane_addr = addr & BACKPLANE_ADDR_MASK;
        uint32_t chunk = MIN(len, CYW43_BUS_MAX_BLOCK_SIZE);
        chunk = MIN(chunk, 0x1000u - (addr & 0xfffu));
        chunk = MIN(chunk, BACKPLANE_ADDR_MASK + 1u - backplane_addr);

        // Use the driver's authoritative cache, including after any window
        // boundary; do not assume that retaining an address register is enough.
        if (self->cur_backplane_window != (addr & ~BACKPLANE_ADDR_MASK)) {
            cyw43_set_backplane_window(self, addr);
        }
        const int ret = cyw43_write_bytes(self, BACKPLANE_FUNCTION,
            backplane_addr | SBSDIO_SB_ACCESS_2_4B_FLAG, chunk, buf);
        if (ret != 0) {
            // Match the pinned writer's log/continue/return-zero semantics.
            // Changing the SDK's error propagation/publication is a separate
            // change, not part of this timing A/B experiment.
            CYW43_PRINTF("backplane write 0x%lx,0x%lx failed", addr, chunk);
        }
        addr += chunk;
        buf += chunk;
        len -= chunk;
    }
    // Restore before ring publication, another packet, or releasing the lock,
    // including a zero-length call and after any failed bulk write.
    cyw43_set_backplane_window(self, CHIPCOMMON_BASE_ADDRESS);
    return 0;
}
