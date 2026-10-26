/*
 * Derived from Pico SDK 2.3.0 cybt_shared_bus.c.
 * Copyright (c) 2023 Raspberry Pi (Trading) Ltd.
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Single-packet receive experiment. Included in the generated, hash-guarded SDK
 * source and directly in host tests. No dispatch, allocation, or extra I/O.
 */
typedef struct {
    cybt_fw_membuf_index_t indices;
    uint32_t capacity;
    bool reuse;
} ds5_cybt_rx_packet_t;

// Implemented by the firmware's retained connection telemetry. Fatal path only.
extern void ds5_record_cyw43_rx_overflow(uint32_t previous_available,
    uint32_t published_count, uint32_t producer_index, uint32_t consumer_index);

// The SDK's original unread-byte overflow guard, shared by BOTH paths. Keeping
// a separate counter for a fast path would make a later fallback misdetect
// previously consumed bytes as a buffer overflow.
static uint32_t ds5_cybt_rx_available = 0;

static cybt_result_t cybt_hci_read(uint8_t *p_data, uint32_t *p_length,
                                  ds5_cybt_rx_packet_t *packet, bool header) {
    cybt_result_t ret_result = CYBT_SUCCESS;
    cybt_fw_membuf_index_t fw_membuf_info = {0};

    assert(ISALIGNED(p_data, 4));
    if (!ISALIGNED(p_data, 4)) {
        assert(false);
        cybt_error("cybt_hci_read: buffer not aligned\n");
        return CYBT_ERR_BADARG;
    }

    uint32_t read_len = ROUNDUP(*p_length, 4);
    if (!header && packet->reuse) {
        // Only this packet's already committed payload. Nothing else runs
        // between header/payload calls; the consumer index is still unpublished.
        fw_membuf_info = packet->indices;
        packet->reuse = false;
    } else {
        cybt_get_bt_buf_index(&fw_membuf_info);
    }
    const uint32_t fw_b2h_buf_count = CIRC_BUF_CNT(fw_membuf_info.bt2host_in_val,
                                                  fw_membuf_info.bt2host_out_val);
    if (fw_b2h_buf_count < ds5_cybt_rx_available) {
        ds5_record_cyw43_rx_overflow(ds5_cybt_rx_available, fw_b2h_buf_count,
            fw_membuf_info.bt2host_in_val, fw_membuf_info.bt2host_out_val);
        cybt_error("error: cybt_hci_read buffer overflow fw_b2h_buf_count=%ld available=%lu\n",
                   fw_b2h_buf_count, ds5_cybt_rx_available);
        cybt_error("error: cybt_hci_read bt2host_in_val=%lu bt2host_out_val=%lu\n",
                   fw_membuf_info.bt2host_in_val, fw_membuf_info.bt2host_out_val);
        panic("cyw43 buffer overflow");
    }

    if (fw_b2h_buf_count == 0) {
        *p_length = 0;
    } else {
        if (read_len > fw_b2h_buf_count) read_len = fw_b2h_buf_count;
        if (fw_membuf_info.bt2host_out_val + read_len <= BTSDIO_FWBUF_SIZE) {
            cybt_mem_read_idx(B2H_BUF_ADDR_IDX, fw_membuf_info.bt2host_out_val, p_data, read_len);
            fw_membuf_info.bt2host_out_val += read_len;
        } else {
            uint32_t first_read_len = BTSDIO_FWBUF_SIZE - fw_membuf_info.bt2host_out_val;
            if (first_read_len >= 4) {
                cybt_mem_read_idx(B2H_BUF_ADDR_IDX, fw_membuf_info.bt2host_out_val, p_data, first_read_len);
                fw_membuf_info.bt2host_out_val += first_read_len;
            } else {
                first_read_len = 0;
            }
            uint32_t second_read_len = read_len - first_read_len;
            if (second_read_len > 0) {
                cybt_mem_read_idx(B2H_BUF_ADDR_IDX, 0, p_data + first_read_len, second_read_len);
                fw_membuf_info.bt2host_out_val += second_read_len;
            }
        }
        ds5_cybt_rx_available = fw_b2h_buf_count - read_len;

        if (header && read_len == 4 && packet->capacity >= 4) {
            const uint32_t payload = (uint32_t)p_data[0] | ((uint32_t)p_data[1] << 8)
                                    | ((uint32_t)p_data[2] << 16);
            const uint32_t aligned_payload = ROUNDUP(payload, 4);
            if (payload != 0 && aligned_payload <= packet->capacity - 4
                && aligned_payload <= ds5_cybt_rx_available) {
                packet->indices = fw_membuf_info;
                packet->indices.bt2host_out_val &= BTSDIO_FWBUF_SIZE - 1;
                packet->reuse = true;
                *p_length = read_len;
                // Don't free the header yet. Publish/ack once, after the whole
                // already committed packet has been copied. Never delay an ack
                // while waiting for a producer to supply a missing payload.
                return ret_result;
            }
        }

        const uint32_t new_b2h_out_val = fw_membuf_info.bt2host_out_val & (BTSDIO_FWBUF_SIZE - 1);
        cybt_reg_write_idx(B2H_BUF_OUT_ADDR_IDX, new_b2h_out_val);
        *p_length = read_len;
    }
    // Empty reads and partial-packet fallback retain the original SDK cadence.
    cybt_toggle_bt_intr();
    return ret_result;
}
