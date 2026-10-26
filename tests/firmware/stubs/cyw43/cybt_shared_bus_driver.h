#pragma once
#include <stdint.h>
// ABI subset from the pinned Pico SDK; production includes the SDK header.
#define BTSDIO_FWBUF_SIZE 0x1000
typedef enum { CYBT_SUCCESS = 0, CYBT_ERR_BADARG = 0xB1 } cybt_result_t;
typedef enum {
    H2B_BUF_ADDR_IDX = 0x10, H2B_BUF_IN_ADDR_IDX, H2B_BUF_OUT_ADDR_IDX,
    B2H_BUF_ADDR_IDX, B2H_BUF_IN_ADDR_IDX, B2H_BUF_OUT_ADDR_IDX,
} cybt_addr_idx_t;
typedef struct {
    uint32_t host2bt_in_val, host2bt_out_val, bt2host_in_val, bt2host_out_val;
} cybt_fw_membuf_index_t;
