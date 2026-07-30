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
        "_Z10on_bt_data12CHANNEL_TYPEPht"
        "_Z14interrupt_loopv"
        "_Z35companion_process_controller_reportPht"
        "_Z34companion_update_controller_reportPKht"
        "_ZN12_GLOBAL__N_120queue_shortcut_eventEh"
        "_ZN12_GLOBAL__N_127dpad_direction_from_buttonsEbbbb"
        "_Z33dualsense_decode_usb_input_reportPKhtR21BridgeControllerState"
        "host_persona_active"
        "host_persona_descriptors_verified"
        "_Z25host_persona_encode_input15HostPersonaModeRK21BridgeControllerStateR22HostPersonaInputReport"
        "_Z30dualsense_persona_encode_inputRK21BridgeControllerStateR22HostPersonaInputReport"
        "_Z24ds4_persona_encode_inputRK21BridgeControllerStateR22HostPersonaInputReport"
        "_Z28xusb360_persona_encode_inputRK21BridgeControllerStateR22HostPersonaInputReport"
        "_Z17xusb360_usb_readyv"
        "_Z23xusb360_usb_send_reportPKhh"
        "_Z11set_headsetb"
        "_Z20audio_mic_add_packetPKht"
        "_ZL24process_usb_audio_packetv"
        "_ZL25send_audio_haptics_packetPKabb"
        "_Z21bt_write_audio_streamPht"
        "_Z12audio_recentv"
        "_Z28usb_speaker_streaming_activev"
        "_ZL33output_trace_queue_details_lockedRhS_S_"
        "_ZL25handle_l2cap_can_send_nowPh"
        "_ZL23note_output_packet_sentRK13output_packetm"
        "_ZL32select_next_output_packet_lockedR13output_packetm"
        "_Z40output_scheduler_choose_interrupt_packetRK21OutputSchedulerInputsRK21OutputSchedulerConfig"
        "_Z48output_scheduler_classic_rumble_can_bypass_audiobbhh"
        "_Z25audio_debug_note_bt_eventhmmmm"
        "_ZNSt6vectorIhSaIhEE13_M_assign_auxIPKhEEvT_S5_St20forward_iterator_tag.isra.0"
        "_Z37controller_packet_copy_audio_snapshotPhb"
        "_Z43controller_output_state_copy_audio_snapshotPhb"
        "_Z49controller_output_state_strip_zero_classic_rumblePht"
        "_ZL22process_mic_usb_outputv"
        "_ZL27write_mic_usb_pending_frameR18mic_decode_elementRtS1_"
        "_Z26bt_is_controller_connectedv"
        "_Z24usb_mic_streaming_activev"
        "_ZL11core1_entryv"
        "_ZL22audio_core1_stack_pollm"
        "_ZN13WDL_Resampler15ResamplePrepareEiiPPf"
        "_ZN13WDL_Resampler11ResampleOutEPfiii"
        "_ZN13WDL_Resampler5ResetEd"
        "_ZL26wdl_rs_reinterleave_bufferPfiii"
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
        "cyw43_ensure_up"
        "cyw43_cb_ensure_awake"
        "cyw43_btbus_write"
        "cybt_awake"
        "cybt_set_bt_awake"
        "cybt_get_bt_buf_index"
        "cybt_toggle_bt_intr"
        "cybt_reg_write_idx"
        "cybt_mem_write_idx"
        "cyw43_ll_bus_sleep"
        "cyw43_thread_enter"
        "cyw43_thread_exit"
        "noop"
        "clock_get_hz"
        "hci_run"
        "hci_send_acl_packet_fragments"
        "hci_send_acl_packet_buffer"
        "hci_can_send_prepared_acl_packet_now"
        "hci_can_send_acl_packet_now"
        "hci_can_send_acl_classic_packet_now"
        "l2cap_run"
        "l2cap_send"
        "l2cap_send_prepared"
        "l2cap_notify_channel_can_send"
        "l2cap_request_can_send_now_event"
        "btstack_linked_list_iterator_init"
        "btstack_linked_list_iterator_has_next"
        "btstack_linked_list_iterator_next"
        "btstack_linked_list_add_tail"
        "btstack_linked_list_remove"
        "little_endian_store_16"
        "hci_dump_btstack_event"
        "btstack_run_loop_async_context_get_time_ms"
        "hci_transport_cyw43_send_packet"
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
        "tud_audio_n_available"
        "tud_audio_n_get_ep_in_ff"
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
