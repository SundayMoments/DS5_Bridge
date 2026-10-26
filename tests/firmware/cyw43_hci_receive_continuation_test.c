#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>

#define CHECK(c) do { if (!(c)) { fprintf(stderr, "HCI continuation failed at %d: %s\n", __LINE__, #c); exit(1); } } while (0)
#define CYW43_THREAD_LOCK_CHECK ((void)0);
#define CYW43_PACKET_HEADER_SIZE 4
#define HCI_INCOMING_PACKET_BUFFER_SIZE 1025
#define BT_DEBUG(...) ((void)0)

static uint8_t cyw43_receive_buffer[CYW43_PACKET_HEADER_SIZE + HCI_INCOMING_PACKET_BUFFER_SIZE];
static unsigned remaining, reads, delivered, reschedules;
static int error_at;
static bool pending, in_poll;

static int cyw43_bluetooth_hci_read(uint8_t *buffer, uint32_t capacity, uint32_t *length) {
    CHECK(capacity == sizeof(cyw43_receive_buffer));
    const unsigned current = reads++;
    if ((int)current == error_at) {
        *length = 0;
        return -1;
    }
    if (remaining == 0) {
        *length = 0;
        return 0;
    }
    --remaining;
    buffer[3] = 4;
    buffer[4] = (uint8_t)delivered;
    *length = 5;
    return 0;
}

static void hci_transport_cyw43_packet_handler(uint8_t type, uint8_t *packet, uint16_t length) {
    CHECK(in_poll && type == 4 && length == 1 && packet[0] == delivered);
    ++delivered;
}

static void btstack_run_loop_poll_data_sources_from_irq(void) {
    CHECK(in_poll);
    ++reschedules;
    pending = true;
}

// Exact replacement used by the generated SDK transport.
#include "../../cmake/patches/cyw43_hci_receive_continuation.inc"

static void poll_once(void) {
    // The SDK async context clears pending before, not after, each callback.
    if (!pending) return;
    pending = false;
    in_poll = true;
    hci_transport_cyw43_process();
    in_poll = false;
}

static void start(unsigned packets, int failed_read) {
    remaining = packets;
    reads = delivered = reschedules = 0;
    error_at = failed_read;
    pending = true; // One radio IRQ, with no subsequent external wakeups.
}

int main(void) {
    start(5, -1);
    poll_once();
#ifdef PICO_BTSTACK_CYW43_MAX_HCI_PROCESS_LOOP_COUNT
    CHECK(delivered == 2 && reads == 2 && remaining == 3 && pending);
    poll_once();
    CHECK(delivered == 4 && reads == 4 && remaining == 1 && pending);
    poll_once();
    CHECK(delivered == 5 && reads == 6 && !pending && reschedules == 2);
#else
    CHECK(delivered == 5 && reads == 6 && !pending && reschedules == 0);
#endif
    poll_once();
    CHECK(reads == 6);

    // At the exact batch boundary, one extra empty probe is necessary; it must
    // clear the continuation instead of keeping an idle worker runnable.
    start(2, -1);
    poll_once();
#ifdef PICO_BTSTACK_CYW43_MAX_HCI_PROCESS_LOOP_COUNT
    CHECK(delivered == 2 && reads == 2 && pending && reschedules == 1);
    poll_once();
    CHECK(delivered == 2 && reads == 3 && !pending && reschedules == 1);
#else
    CHECK(delivered == 2 && reads == 3 && !pending && reschedules == 0);
#endif
    poll_once();
    CHECK(reads == 3);

    start(0, -1);
    poll_once();
    CHECK(reads == 1 && delivered == 0 && !pending && reschedules == 0);

    start(5, 0);
    poll_once();
    CHECK(reads == 1 && delivered == 0 && !pending && reschedules == 0);

    // A failed second read reaches the batch limit but must not self-wake.
    start(5, 1);
    poll_once();
    CHECK(reads == 2 && delivered == 1 && !pending && reschedules == 0);
    return 0;
}
