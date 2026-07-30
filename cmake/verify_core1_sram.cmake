# Verify that the linked firmware keeps the live audio, Bluetooth, CYW43, and
# USB hot paths in RP2350 SRAM. This catches section-name or toolchain drift
# that would silently restore XIP contention or weaken flash lockout safety,
# while retaining sufficient runtime heap for codec and resampler startup.

foreach(required_value NM ELF MIN_HEAP_BYTES KNOWN_STARTUP_HEAP_BYTES)
    if(NOT DEFINED ${required_value})
        message(FATAL_ERROR
                "verify_core1_sram: missing required -D${required_value}"
        )
    endif()
endforeach()

execute_process(
        COMMAND "${NM}" --format=posix "${ELF}"
        RESULT_VARIABLE result
        OUTPUT_VARIABLE symbol_table
        ERROR_VARIABLE symbol_error
)
if(NOT result EQUAL 0)
    message(FATAL_ERROR
            "verify_core1_sram: nm failed (rc=${result}): ${symbol_error}"
    )
endif()

set(required_sram_symbols
        "_ZL11core1_entryv"
        "_ZL22audio_core1_stack_pollm"
        "_ZN13WDL_Resampler15ResamplePrepareEiiPPf"
        "_ZN13WDL_Resampler11ResampleOutEPfiii"
        "_ZN13WDL_Resampler5ResetEd"
        "opus_encode_float"
        "opus_decode"
        "crc32_lookup_table"
        "packet_handler"
        "l2cap_acl_handler"
        "tu_fifo_read_n_access_mode"
        "tu_fifo_write_n_access_mode"
        "cyw43_spi_transfer"
        "cyw43_read_bytes"
        "cyw43_write_bytes"
        "cyw43_read_reg_u32"
        "cyw43_read_reg_u16"
        "cyw43_read_reg_u8"
        "cyw43_write_reg_u32"
        "cyw43_write_reg_u16"
        "cyw43_write_reg_u8"
        "read_reg_u32_swap"
        "write_reg_u32_swap"
        "ns_delay.constprop.0"
        "cyw43_ll_sdpcm_poll_device"
        "cyw43_ll_process_packets"
        "cyw43_sdpcm_send_common"
        "cyw43_do_ioctl.part.0"
        "cyw43_ll_bt_has_work"
        "cyw43_ll_parse_async_event"
        "cyw43_poll_func"
        "cyw43_bluetooth_hci_read"
        "cyw43_bluetooth_hci_write"
        "hci_run"
        "hci_send_acl_packet_fragments"
        "hci_send_acl_packet_buffer"
        "l2cap_run"
        "l2cap_send"
        "l2cap_send_prepared"
        "l2cap_notify_channel_can_send"
        "l2cap_request_can_send_now_event"
        "btstack_linked_list_iterator_init"
        "btstack_linked_list_iterator_has_next"
        "btstack_linked_list_iterator_next"
        "cyw43_ll_write_backplane_mem"
        "cyw43_ll_read_backplane_mem"
        "cyw43_write_backplane"
        "cyw43_read_backplane.constprop.0"
        "tud_task_ext"
        "usbd_edpt_xfer"
        "usbd_edpt_xfer_fifo"
        "dcd_edpt_xfer"
        "dcd_edpt_iso_activate"
        "tud_audio_n_read"
        "tud_audio_n_write"
        "audiod_calc_tx_packet_sz.isra.0"
        "audiod_xfer_isr"
        "tud_hid_n_report"
        "tud_hid_n_ready"
        "hidd_xfer_cb"
        "cyw43_arch_poll"
        "btstack_run_loop_base_poll_data_sources"
        "btstack_run_loop_poll_data_sources_from_irq"
        "memcpy"
        "memset"
        "memmove"
)

# RP2350 SRAM spans [0x20000000, 0x20082000).
set(rp2350_sram_start 536870912)
set(rp2350_sram_end 537403392)

foreach(symbol ${required_sram_symbols})
    string(REGEX MATCH
            "(^|\n)${symbol} [A-Za-z] ([0-9A-Fa-f]+)"
            symbol_match
            "${symbol_table}"
    )
    if(NOT symbol_match)
        message(FATAL_ERROR
                "verify_core1_sram: missing linked symbol '${symbol}'"
        )
    endif()

    set(symbol_address "0x${CMAKE_MATCH_2}")
    math(EXPR symbol_address_decimal "${symbol_address}")
    if(
        symbol_address_decimal LESS ${rp2350_sram_start}
        OR NOT symbol_address_decimal LESS ${rp2350_sram_end}
    )
        message(FATAL_ERROR
                "verify_core1_sram: '${symbol}' linked outside SRAM at ${symbol_address}"
        )
    endif()
endforeach()

string(REGEX MATCH
        "(^|\n)end [A-Za-z] ([0-9A-Fa-f]+)"
        heap_start_match
        "${symbol_table}"
)
if(NOT heap_start_match)
    message(FATAL_ERROR "verify_core1_sram: missing linked heap start symbol 'end'")
endif()
set(heap_start_address "0x${CMAKE_MATCH_2}")

string(REGEX MATCH
        "(^|\n)__HeapLimit [A-Za-z] ([0-9A-Fa-f]+)"
        heap_limit_match
        "${symbol_table}"
)
if(NOT heap_limit_match)
    message(FATAL_ERROR "verify_core1_sram: missing linked symbol '__HeapLimit'")
endif()
set(heap_limit_address "0x${CMAKE_MATCH_2}")

math(EXPR runtime_heap_bytes "${heap_limit_address} - ${heap_start_address}")
math(EXPR post_startup_heap_bytes "${runtime_heap_bytes} - ${KNOWN_STARTUP_HEAP_BYTES}")
if(runtime_heap_bytes LESS MIN_HEAP_BYTES)
    message(FATAL_ERROR
            "verify_core1_sram: runtime heap headroom ${runtime_heap_bytes} bytes is below required ${MIN_HEAP_BYTES} bytes (end=${heap_start_address}, limit=${heap_limit_address})"
    )
endif()

message(STATUS
        "Verified complete live firmware hot paths, ${runtime_heap_bytes} bytes startup heap, and ${post_startup_heap_bytes} bytes post-startup headroom"
)
