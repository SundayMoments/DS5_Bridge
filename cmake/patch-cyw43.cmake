# Generated, hash-checked copies of the pinned Pico SDK 2.3.0 CYW43 Bluetooth
# transport. The installed SDK is never edited. Each generator fails closed if
# the audited source or one of its patch boundaries changes.
set(DS5_CYW43_PATCH_DIR "${CMAKE_CURRENT_LIST_DIR}/patches")

function(ds5_cyw43_read_pinned source expected_sha result)
    file(READ "${source}" original)
    # Hash and patch one canonical representation so the guard verifies
    # content, not the checkout's platform-specific line endings.
    string(REPLACE "\r\n" "\n" original "${original}")
    string(REPLACE "\r" "\n" original "${original}")
    string(SHA256 actual_sha "${original}")
    if(NOT actual_sha STREQUAL expected_sha)
        message(FATAL_ERROR "Unsupported CYW43 transport source ${source} (${actual_sha}); review the Pico SDK 2.3.0 patches")
    endif()
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${source}")
    set(${result} "${original}" PARENT_SCOPE)
endfunction()

function(ds5_cyw43_read_fragment name result)
    set(fragment "${DS5_CYW43_PATCH_DIR}/${name}")
    file(READ "${fragment}" content)
    string(REPLACE "\r\n" "\n" content "${content}")
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${fragment}")
    set(${result} "${content}" PARENT_SCOPE)
endfunction()

function(ds5_cyw43_replace_once content_var original replacement description)
    string(FIND "${${content_var}}" "${original}" position)
    if(position LESS 0)
        message(FATAL_ERROR "Audited CYW43 boundary changed: ${description}")
    endif()
    string(REPLACE "${original}" "${replacement}" patched "${${content_var}}")
    set(${content_var} "${patched}" PARENT_SCOPE)
endfunction()

# Bounded HCI receive continuation. When the receive loop reaches
# PICO_BTSTACK_CYW43_MAX_HCI_PROCESS_LOOP_COUNT after a successful read, request
# another main-loop poll instead of waiting for a new radio interrupt, and own
# the four-byte rounding the bus reader copies into the receive buffer.
function(ds5_generate_cyw43_hci_transport source output)
    ds5_cyw43_read_pinned("${source}"
        "edd6ebc07c764e99bfd4be4268f8f0e18586605b085677125da5fc7c6e264fdc" original)
    ds5_cyw43_read_fragment(cyw43_hci_receive_continuation.inc replacement)
    string(FIND "${original}" "static void hci_transport_cyw43_process(void) {" process_start)
    string(FIND "${original}" "// This is called from cyw43_poll_func." process_end)
    if(process_start LESS 0 OR process_end LESS process_start)
        message(FATAL_ERROR "Audited CYW43 HCI process-function boundaries changed")
    endif()
    string(SUBSTRING "${original}" 0 ${process_start} prefix)
    string(SUBSTRING "${original}" ${process_end} -1 suffix)
    ds5_cyw43_replace_once(prefix
        "static uint8_t hci_packet_with_pre_buffer[HCI_INCOMING_PRE_BUFFER_SIZE_ALIGNED + HCI_INCOMING_PACKET_BUFFER_SIZE ];"
        "static uint8_t hci_packet_with_pre_buffer[HCI_INCOMING_PRE_BUFFER_SIZE_ALIGNED + ((HCI_INCOMING_PACKET_BUFFER_SIZE + 3u) & ~3u)];"
        "HCI receive storage")
    get_filename_component(output_directory "${output}" DIRECTORY)
    file(MAKE_DIRECTORY "${output_directory}")
    file(CONFIGURE OUTPUT "${output}" CONTENT "${prefix}${replacement}\n${suffix}" @ONLY NEWLINE_STYLE LF)
endfunction()

# Single-pass packet reader: read the header and the already committed payload
# with one index fetch and publish the consumer index once per packet. The
# SDK's ring-overflow guard is retained and records evidence before resetting.
function(ds5_generate_cyw43_shared_bus source output)
    ds5_cyw43_read_pinned("${source}"
        "61ef6cafaeea33f87c219ee3ff9fa298c800cbe91f9976c751740487576444ef" original)
    ds5_cyw43_read_fragment(cyw43_rx_packet_read.inc reader)
    string(FIND "${original}" "static cybt_result_t cybt_hci_read(" read_start)
    string(FIND "${original}" "static void cybt_bus_request(void)" read_end)
    if(read_start LESS 0 OR read_end LESS read_start)
        message(FATAL_ERROR "Audited CYW43 read-function boundaries changed")
    endif()
    string(SUBSTRING "${original}" 0 ${read_start} prefix)
    string(SUBSTRING "${original}" ${read_end} -1 suffix)
    set(patched "${prefix}${reader}${suffix}")
    ds5_cyw43_replace_once(patched
        "    // Read the header into the first 4 bytes of the buffer"
        "    ds5_cybt_rx_packet_t packet = { .capacity = max_buf_size };\n\n    // Read the header into the first 4 bytes of the buffer"
        "packet reader state")
    ds5_cyw43_replace_once(patched
        "cybt_hci_read(buf, &read_len);"
        "cybt_hci_read(buf, &read_len, &packet, true);"
        "header read")
    ds5_cyw43_replace_once(patched
        "cybt_hci_read(buf + 4, &total_read_len);"
        "cybt_hci_read(buf + 4, &total_read_len, &packet, false);"
        "payload read")
    get_filename_component(output_directory "${output}" DIRECTORY)
    file(MAKE_DIRECTORY "${output_directory}")
    file(CONFIGURE OUTPUT "${output}" CONTENT "${patched}" @ONLY NEWLINE_STYLE LF)
endfunction()

# Bounded backplane-window reuse for HCI payloads, plus the F2 readiness fix.
function(ds5_generate_cyw43_payload ll_source spi_source driver_source output_dir)
    ds5_cyw43_read_pinned("${ll_source}"
        "7f4c93755b2ab911d18606652497b2f3cd08085ce63b3b1836171d375f806b10" ll)
    ds5_cyw43_read_fragment(cyw43_tx_window_write.inc batch_writer)
    ds5_cyw43_read_fragment(cyw43_rx_window_read.inc batch_reader)
    ds5_cyw43_replace_once(ll
        "int cyw43_ll_write_backplane_mem("
        "${batch_writer}\nint cyw43_ll_write_backplane_mem("
        "backplane writer")
    ds5_cyw43_replace_once(ll
        "int cyw43_ll_read_backplane_mem("
        "${batch_reader}\nint cyw43_ll_read_backplane_mem("
        "backplane reader")
    # Keep SRAM relocation boundaries stable instead of duplicating helpers.
    foreach(signature "void cyw43_set_backplane_window" "void cyw43_write_backplane" "uint32_t cyw43_read_backplane")
        ds5_cyw43_replace_once(ll
            "static ${signature}("
            "static __attribute__((noinline)) ${signature}("
            "${signature}")
    endforeach()

    # The last successful F2 readiness probe leaves zero attempts; only true
    # loop exhaustion leaves -1. The SDK treated the final success as failure.
    ds5_cyw43_read_pinned("${spi_source}"
        "e7b73256c397fc5c912dcd9e1d5a35d374af0d1b91f61a053842473b42eeab66" spi)
    ds5_cyw43_replace_once(spi
        "        if (f2_ready_attempts <= 0) {"
        "        if (f2_ready_attempts < 0) {"
        "final F2 readiness check")

    # Redirect only validated runtime ring segments. Firmware download,
    # registers, wake/credit checks, locking and publication remain SDK code.
    ds5_cyw43_read_pinned("${driver_source}"
        "0e826a6cc5129c588c6a85ac1176ef74bdd3c8722d28793bb0619cf92b879c4e" driver)
    foreach(direction write read)
        set(qualifier "")
        if(direction STREQUAL "write")
            set(qualifier "const ")
        endif()
        ds5_cyw43_replace_once(driver
            "    return cybt_mem_${direction}(mem_addr, p_data, data_len);"
            "    return ds5_cyw43_${direction}_backplane_mem_batched(cyw43_ll, mem_addr, data_len, p_data);"
            "HCI ${direction} payload entry")
        ds5_cyw43_replace_once(driver
            "cybt_result_t cybt_mem_${direction}_idx("
            "int ds5_cyw43_${direction}_backplane_mem_batched(cyw43_ll_t *, uint32_t, uint32_t, ${qualifier}uint8_t *);\n\ncybt_result_t cybt_mem_${direction}_idx("
            "HCI ${direction} declaration")
    endforeach()

    file(MAKE_DIRECTORY "${output_dir}")
    file(CONFIGURE OUTPUT "${output_dir}/cyw43_ll.c" CONTENT "${ll}" @ONLY NEWLINE_STYLE LF)
    file(CONFIGURE OUTPUT "${output_dir}/cyw43_bus_pio_spi.c" CONTENT "${spi}" @ONLY NEWLINE_STYLE LF)
    file(CONFIGURE OUTPUT "${output_dir}/cybt_shared_bus_driver.c" CONTENT "${driver}" @ONLY NEWLINE_STYLE LF)
endfunction()

# Replace one SDK interface source with its generated copy.
function(ds5_replace_sdk_interface_source owner original replacement)
    get_target_property(sources ${owner} INTERFACE_SOURCES)
    list(FIND sources "${original}" source_index)
    if(source_index EQUAL -1)
        message(FATAL_ERROR "Pinned SDK target ${owner} no longer owns ${original}")
    endif()
    list(REMOVE_ITEM sources "${original}")
    list(APPEND sources "${replacement}")
    set_property(TARGET ${owner} PROPERTY INTERFACE_SOURCES "${sources}")
endfunction()
