#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define CHECK(c) do { if (!(c)) { fprintf(stderr, "TX window check failed at line %d: %s\n", __LINE__, #c); exit(1); } } while (0)
#define MIN(a, b) ((a) < (b) ? (a) : (b))
#define CYW43_BUS_MAX_BLOCK_SIZE 64u
#define BACKPLANE_ADDR_MASK 0x7fffu
#define SBSDIO_SB_ACCESS_2_4B_FLAG 0x8000u
#define CHIPCOMMON_BASE_ADDRESS 0x18000000u
#define BACKPLANE_FUNCTION 1u
typedef struct { uint32_t cur_backplane_window; } cyw43_int_t;
typedef cyw43_int_t cyw43_ll_t;
#define CYW_INT_FROM_LL(p) (p)

typedef struct { uint32_t addr, len, source_offset; } transfer_t;
typedef struct {
    transfer_t transfers[128];
    uint32_t windows[260];
    uint32_t transfer_count, window_count, error_count;
} trace_t;
static trace_t trace;
static uint8_t payload[8192];
static int fail_at = -1;
static bool disturb_window;
static void cyw43_set_backplane_window(cyw43_int_t *self, uint32_t addr) {
    CHECK(trace.window_count < 260);
    trace.windows[trace.window_count++] = addr & ~BACKPLANE_ADDR_MASK;
    self->cur_backplane_window = addr & ~BACKPLANE_ADDR_MASK;
}
static int cyw43_write_bytes(cyw43_int_t *self, uint32_t function, uint32_t addr,
                            uint32_t len, const uint8_t *source) {
    CHECK(function == BACKPLANE_FUNCTION);
    CHECK((addr & SBSDIO_SB_ACCESS_2_4B_FLAG) != 0);
    const uint32_t absolute = self->cur_backplane_window | (addr & BACKPLANE_ADDR_MASK);
    CHECK(len > 0 && len <= CYW43_BUS_MAX_BLOCK_SIZE);
    CHECK((absolute & 0xfffu) + len <= 0x1000u);
    CHECK((addr & BACKPLANE_ADDR_MASK) + len <= BACKPLANE_ADDR_MASK + 1u);
    CHECK(source >= payload && source + len <= payload + sizeof(payload));
    CHECK(trace.transfer_count < 128);
    const uint32_t index = trace.transfer_count++;
    trace.transfers[index] = (transfer_t){absolute, len, (uint32_t)(source - payload)};
    if (disturb_window) self->cur_backplane_window = CHIPCOMMON_BASE_ADDRESS;
    return (int)index == fail_at ? -7 : 0;
}
#define CYW43_PRINTF(...) (++trace.error_count)

// Compile the exact implementation inserted into the generated SDK source.
#include "../../cmake/patches/cyw43_tx_window_write.inc"

// Model the pinned cybt_mem_write -> cyw43_ll_write_backplane_mem composition.
static int original_write(cyw43_ll_t *self, uint32_t addr, uint32_t len, const uint8_t *source) {
    do {
        uint32_t chunk = MIN(len, CYW43_BUS_MAX_BLOCK_SIZE);
        chunk = MIN(chunk, 0x1000u - (addr & 0xfffu));
        if (chunk) {
            cyw43_set_backplane_window(self, addr);
            if (cyw43_write_bytes(self, BACKPLANE_FUNCTION,
                (addr & BACKPLANE_ADDR_MASK) | SBSDIO_SB_ACCESS_2_4B_FLAG, chunk, source) != 0) {
                ++trace.error_count;
            }
        }
        cyw43_set_backplane_window(self, CHIPCOMMON_BASE_ADDRESS);
        addr += chunk;
        source += chunk;
        len -= chunk;
    } while (len > 0);
    return 0;
}

static void compare_write(uint32_t addr, uint32_t length) {
    cyw43_ll_t bus = {CHIPCOMMON_BASE_ADDRESS};
    memset(&trace, 0, sizeof(trace));
    CHECK(original_write(&bus, addr, length, payload) == 0);
    const trace_t expected = trace;
    CHECK(bus.cur_backplane_window == CHIPCOMMON_BASE_ADDRESS);
    memset(&trace, 0, sizeof(trace));
    CHECK(ds5_cyw43_write_backplane_mem_batched(&bus, addr, length, payload) == 0);
    CHECK(bus.cur_backplane_window == CHIPCOMMON_BASE_ADDRESS);
    CHECK(trace.transfer_count == expected.transfer_count);
    CHECK(trace.error_count == expected.error_count);
    CHECK(memcmp(trace.transfers, expected.transfers,
                 trace.transfer_count * sizeof(transfer_t)) == 0);
    CHECK(trace.window_count <= expected.window_count);
    CHECK(trace.windows[trace.window_count - 1] == CHIPCOMMON_BASE_ADDRESS);
    if (!disturb_window && length &&
        (addr & ~BACKPLANE_ADDR_MASK) == ((addr + length - 1) & ~BACKPLANE_ADDR_MASK)) {
        CHECK(trace.window_count == 2);
    }
}

int main(void) {
    // Every aligned ring offset, including tails and chunks near page/window
    // edges. Production validates a contiguous <=4 KiB segment before entry.
    const uint32_t lengths[] = {0, 4, 60, 64, 68, 476, 1020, 4096};
    for (uint32_t offset = 0; offset < 4096; offset += 4) {
        for (size_t i = 0; i < sizeof(lengths) / sizeof(lengths[0]); ++i) {
            compare_write(0x19000000u + offset, lengths[i]);
            compare_write(0x19007000u + offset, lengths[i]);
        }
        // A packet wrapping the ring is still two independently restored calls.
        const uint32_t first = MIN(476u, 4096u - offset);
        compare_write(0x19000000u + offset, first);
        if (first < 476) compare_write(0x19000000u, 476 - first);
    }
    compare_write(0x19000000u, 476);
    CHECK(trace.transfer_count == 8 && trace.window_count == 2);
    // Preserve the SDK's existing log/continue behavior, restoring on errors.
    for (fail_at = 0; fail_at < 65; ++fail_at) compare_write(0x19007ffcu, 4096);
    fail_at = -1;
    // Even an unexpected cache change cannot silently redirect later chunks.
    disturb_window = true;
    compare_write(0x19007ffcu, 476);
    puts("TX window reuse: identical legal payload chunks, boundary/error restoration, 16 -> 2 window calls for 476 bytes");
    return 0;
}
