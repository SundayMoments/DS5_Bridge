#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <setjmp.h>
#include "cybt_shared_bus_driver.h"

#define CHECK(c) do { if (!(c)) { fprintf(stderr, "RX check failed at line %d: %s\n", __LINE__, #c); exit(1); } } while (0)
#define assert(c) CHECK(c)
#define ISALIGNED(p, a) (((uintptr_t)(p) & ((a) - 1)) == 0)
#define ROUNDUP(x, a) ((((x) + (a) - 1) / (a)) * (a))
#define CIRC_BUF_CNT(in, out) (((in) - (out)) & (BTSDIO_FWBUF_SIZE - 1))
#define cybt_error(...) ((void)0)

static uint8_t ring[BTSDIO_FWBUF_SIZE];
static uint32_t producer, consumer, index_calls, data_calls, publish_calls, ack_calls;
static bool publish_on_ack;
static uint32_t producer_after_ack;
static bool publish_after_header_read;
static uint32_t producer_after_header_read;
static jmp_buf panic_target;
static uint32_t overflow_calls, overflow_values[4];
void ds5_record_cyw43_rx_overflow(uint32_t previous, uint32_t published,
                                     uint32_t in, uint32_t out) {
    ++overflow_calls;
    overflow_values[0] = previous; overflow_values[1] = published;
    overflow_values[2] = in; overflow_values[3] = out;
}
static void panic(const char *message) { (void)message; longjmp(panic_target, 1); }

static cybt_result_t cybt_get_bt_buf_index(cybt_fw_membuf_index_t *indices) {
    *indices = (cybt_fw_membuf_index_t){0, 0, producer, consumer};
    ++index_calls;
    return CYBT_SUCCESS;
}
static cybt_result_t cybt_mem_read_idx(cybt_addr_idx_t index, uint32_t offset, uint8_t *data, uint32_t size) {
    CHECK(index == B2H_BUF_ADDR_IDX && size >= 4 && ISALIGNED(data, 4));
    CHECK(offset + size <= BTSDIO_FWBUF_SIZE);
    CHECK(size <= CIRC_BUF_CNT(producer, offset)); // Never read uncommitted payload.
    memcpy(data, ring + offset, size);
    ++data_calls;
    if (publish_after_header_read && data_calls == 1) {
        producer = producer_after_header_read;
        publish_after_header_read = false;
    }
    return CYBT_SUCCESS;
}
static cybt_result_t cybt_reg_write_idx(cybt_addr_idx_t index, uint32_t value) {
    CHECK(index == B2H_BUF_OUT_ADDR_IDX && value < BTSDIO_FWBUF_SIZE);
    CHECK(CIRC_BUF_CNT(value, consumer) <= CIRC_BUF_CNT(producer, consumer));
    consumer = value;
    ++publish_calls;
    return CYBT_SUCCESS;
}
static cybt_result_t cybt_toggle_bt_intr(void) {
    ++ack_calls;
    if (publish_on_ack) {
        CHECK(publish_calls > 0); // Model a producer waiting for freed header space.
        producer = producer_after_ack;
        publish_on_ack = false;
    }
    return CYBT_SUCCESS;
}

// The exact C function compiled into the generated SDK translation unit.
#include "../../cmake/patches/cyw43_rx_packet_read.inc"

static uint32_t put_packet(uint32_t offset, uint32_t payload) {
    ring[offset] = (uint8_t)payload;
    ring[offset + 1] = (uint8_t)(payload >> 8);
    ring[offset + 2] = (uint8_t)(payload >> 16);
    ring[offset + 3] = 2;
    const uint32_t padded = ROUNDUP(payload, 4);
    for (uint32_t i = 0; i < padded; ++i) ring[(offset + 4 + i) & 4095] = (uint8_t)(i ^ 0x5a);
    return (offset + 4 + padded) & 4095;
}
static void reset(uint32_t offset) {
    producer = consumer = offset;
    index_calls = data_calls = publish_calls = ack_calls = 0;
    publish_on_ack = false;
    publish_after_header_read = false;
    ds5_cybt_rx_available = 0; // Only the host fake resets the SDK's static guard.
    memset(ring, 0, sizeof(ring));
}
static void read_packet(uint32_t payload, bool fast, bool expect_fast) {
    const uint32_t original_consumer = consumer;
    const uint32_t before_index = index_calls, before_publish = publish_calls, before_ack = ack_calls;
    _Alignas(4) uint8_t buffer[1028];
    memset(buffer, 0xcd, sizeof(buffer));
    ds5_cybt_rx_packet_t packet = { .capacity = fast ? 1024 : 0 };
    uint32_t length = 4;
    CHECK(cybt_hci_read(buffer, &length, &packet, true) == CYBT_SUCCESS && length == 4);
    CHECK(packet.reuse == expect_fast);
    if (expect_fast) {
        CHECK(consumer == original_consumer && publish_calls == before_publish && ack_calls == before_ack);
    } else {
        CHECK(consumer == ((original_consumer + 4) & 4095)
              && publish_calls == before_publish + 1 && ack_calls == before_ack + 1);
    }
    CHECK(buffer[0] == (uint8_t)payload && buffer[1] == (uint8_t)(payload >> 8) && buffer[3] == 2);
    length = payload;
    CHECK(cybt_hci_read(buffer + 4, &length, &packet, false) == CYBT_SUCCESS);
    CHECK(length == ROUNDUP(payload, 4));
    for (uint32_t i = 0; i < length; ++i) CHECK(buffer[4 + i] == (uint8_t)(i ^ 0x5a));
    for (uint32_t i = 4 + length; i < sizeof(buffer); ++i) CHECK(buffer[i] == 0xcd);
    CHECK(consumer == ((original_consumer + 4 + length) & 4095));
    CHECK(index_calls - before_index == (expect_fast ? 1u : 2u));
    CHECK(publish_calls - before_publish == (expect_fast ? 1u : 2u));
    CHECK(ack_calls - before_ack == (expect_fast ? 1u : 2u));
    CHECK(!packet.reuse);
}

int main(void) {
    const uint32_t payloads[] = {1, 4, 7, 8, 88, 480, 1017, 1020};
    const uint32_t offsets[] = {0, 4, 2048, 4088, 4092};
    for (unsigned p = 0; p < sizeof(payloads) / sizeof(payloads[0]); ++p) {
        for (unsigned o = 0; o < sizeof(offsets) / sizeof(offsets[0]); ++o) {
            for (unsigned fast = 0; fast < 2; ++fast) {
                reset(offsets[o]);
                producer = put_packet(consumer, payloads[p]);
                read_packet(payloads[p], fast != 0, fast != 0);
                CHECK(ds5_cybt_rx_available == 0);
                const uint32_t payload_offset = (offsets[o] + 4) & 4095;
                CHECK(data_calls == (payload_offset + ROUNDUP(payloads[p], 4) > 4096 ? 3u : 2u));
            }
        }
    }
    // Partial publication: header acknowledgement must release the producer.
    reset(4092);
    producer_after_ack = put_packet(consumer, 88);
    producer = (consumer + 4) & 4095;
    publish_on_ack = true;
    read_packet(88, true, false);
    CHECK(!publish_on_ack && ds5_cybt_rx_available == 0);

    // Fast -> fallback -> fast, keeping one continuous SDK overflow baseline.
    reset(4088);
    const uint32_t second = put_packet(consumer, 88);
    producer_after_ack = put_packet(second, 88);
    producer = (second + 4) & 4095;
    read_packet(88, true, true);
    CHECK(ds5_cybt_rx_available == 4);
    publish_on_ack = true;
    read_packet(88, true, false);
    const uint32_t third = consumer;
    producer = put_packet(third, 8);
    read_packet(8, true, true);
    CHECK(ds5_cybt_rx_available == 0);

    // Additional committed packets remain untouched; do not drain an extra one.
    reset(0);
    const uint32_t tail = put_packet(0, 88);
    producer = put_packet(tail, 88);
    read_packet(88, true, true);
    CHECK(consumer == tail && ds5_cybt_rx_available == 92);
    read_packet(88, true, true);

    // New producer data after the first snapshot isn't read speculatively, and
    // doesn't corrupt the shared guard when the following packet is polled.
    reset(0);
    const uint32_t next_packet = put_packet(0, 88);
    producer_after_header_read = put_packet(next_packet, 88);
    producer = next_packet;
    publish_after_header_read = true;
    read_packet(88, true, true);
    CHECK(consumer == next_packet && ds5_cybt_rx_available == 0);
    read_packet(88, true, true);

    // Empty reads retain one index read and one ack, with no data or publication.
    reset(0);
    _Alignas(4) uint8_t buffer[32] = {0};
    ds5_cybt_rx_packet_t packet = { .capacity = sizeof(buffer) };
    uint32_t length = 4;
    CHECK(cybt_hci_read(buffer, &length, &packet, true) == CYBT_SUCCESS && length == 0);
    CHECK(index_calls == 1 && ack_calls == 1 && data_calls == 0 && publish_calls == 0);

    // Never defer the header for zero/oversized payloads or insufficient padding
    // capacity. The caller retains the SDK's length-validation/error path.
    const uint32_t invalid_sizes[] = {0, 29, 0xffffff};
    for (unsigned i = 0; i < 3; ++i) {
        reset(0);
        ring[0] = (uint8_t)invalid_sizes[i]; ring[1] = (uint8_t)(invalid_sizes[i] >> 8);
        ring[2] = (uint8_t)(invalid_sizes[i] >> 16);
        producer = 64;
        packet = (ds5_cybt_rx_packet_t){ .capacity = 33 };
        length = 4;
        CHECK(cybt_hci_read(buffer, &length, &packet, true) == CYBT_SUCCESS);
        CHECK(!packet.reuse && publish_calls == 1 && ack_calls == 1 && data_calls == 1);
    }
    reset(0);
    producer = 8;
    CHECK(overflow_calls == 0); // No observation on any healthy RX path.
    ds5_cybt_rx_available = 12;
    packet = (ds5_cybt_rx_packet_t){ .capacity = sizeof(buffer) };
    length = 4;
    if (setjmp(panic_target) == 0) {
        cybt_hci_read(buffer, &length, &packet, true);
        CHECK(false);
    }
    CHECK(data_calls == 0 && publish_calls == 0 && ack_calls == 0);
    CHECK(overflow_calls == 1 && overflow_values[0] == 12 && overflow_values[1] == 8
          && overflow_values[2] == 8 && overflow_values[3] == 0);
    puts("Single-packet CYW43 RX checks passed (fast/fallback, wrap, padding, partial publication, overflow guard)");
    return 0;
}
