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

# Wake-on-LAN (ported from Kitsune Input). The pinned driver otherwise ACKs
# firmware-rejected ioctls as success: match request IDs before checking the
# CDC error bit and status, preserving event and HCI processing while waiting.
# The station PMK is scrubbed from the stack and the shared SPI buffer once its
# ioctl completes, and WLAN startup suppresses events the bridge never uses.
function(ds5_patch_cyw43_ioctl content_var)
    set(source "${${content_var}}")
    ds5_cyw43_read_fragment(cyw43_wol_guards.inc guards)
    ds5_cyw43_replace_once(source
        "#define DATA_HEADER (2)"
        "#define DATA_HEADER (2)\n${guards}\n// Internal receive result, never a transmitted SDPCM channel.\n#define DS5_CONTROL_ERROR (3)"
        "packet result definitions")
    set(anchor "            // TODO extract and check/use the interface number from ioctl_header->flags")
    set(check [=[            // CDCF_IOC_ERROR is bit 0; bit 1 is the ordinary SET flag.
            if (ds5_cyw43_ioctl_failed(ioctl_header->status, ioctl_header->flags)) {
                *out_len = 0;
                *out_buf = NULL;
                return DS5_CONTROL_ERROR;
            }
]=])
    ds5_cyw43_replace_once(source "${anchor}" "${check}${anchor}" "matched ioctl response")
    set(anchor "        if (ret == CONTROL_HEADER) {\n            #if CYW43_USE_STATS")
    ds5_cyw43_replace_once(source "${anchor}"
        "        if (ret == DS5_CONTROL_ERROR) {\n            return -CYW43_EIO;\n        }\n${anchor}"
        "ioctl wait")
    # cyw43_send_ioctl() copies the payload into self->spid_buf after the SDPCM
    # and ioctl headers, and the firmware's echoed response is read back into
    # the same place. Later short commands overwrite only the first bytes, and
    # Bluetooth transfers never reach it, so scrub that region as well as the
    # stack copy.
    set(anchor "        cyw43_do_ioctl(self, SDPCM_SET, WLC_SET_WSEC_PMK, 4 + CYW43_WPA_MAX_PASSWORD_LEN, buf, WWD_STA_INTERFACE); // 68, see wsec_pmk_t")
    ds5_cyw43_replace_once(source "${anchor}"
        "${anchor}\n        // The synchronous ioctl has completed. Scrub the stack copy and the\n        // shared SPI transfer buffer, which holds the request and the echoed\n        // response; short later commands would leave the password tail there.\n        ds5_cyw43_erase_secret(buf, 4 + CYW43_WPA_MAX_PASSWORD_LEN);\n        ds5_cyw43_erase_transfer_secret(self->spid_buf, sizeof(self->spid_buf),\n            SDPCM_HEADER_LEN + IOCTL_HEADER_LEN + 4 + CYW43_WPA_MAX_PASSWORD_LEN);"
        "station PMK buffer")
    ds5_cyw43_read_fragment(cyw43_wol_event_mask.inc event_mask)
    set(anchor "int cyw43_ll_wifi_on(cyw43_ll_t *self_in, uint32_t country) {")
    ds5_cyw43_replace_once(source "${anchor}" "${event_mask}\n${anchor}" "WLAN startup")
    string(FIND "${source}" "    // Clear all async events\n" start)
    set(anchor "    cyw43_do_ioctl(self, SDPCM_SET, WLC_SET_VAR, 18 + 4 + 19, buf, WWD_STA_INTERFACE);")
    string(FIND "${source}" "${anchor}" end)
    if(start LESS 0 OR end LESS start)
        message(FATAL_ERROR "Audited CYW43 boundary changed: WLAN event mask")
    endif()
    string(LENGTH "${anchor}" anchor_length)
    math(EXPR length "${end} + ${anchor_length} - ${start}")
    string(SUBSTRING "${source}" ${start} ${length} original_mask)
    string(REPLACE "${original_mask}"
        "    int event_result = ds5_cyw43_enable_wifi_events(self, buf);\n    if (event_result != 0) return event_result;"
        source "${source}")
    set(${content_var} "${source}" PARENT_SCOPE)
endfunction()

# Wake-on-LAN station control. WLAN events and deferred rejoin work are dropped
# unless the radio adapter allows WLAN, an RSN-mismatch retry is never
# downgraded to WPA1 PSK, and the join state is reset before each SET_SSID so a
# missed scan can be re-issued.
function(ds5_generate_cyw43_wol_ctrl source output)
    ds5_cyw43_read_pinned("${source}"
        "c87785fa3791a12068f28d0de6c057351c467414b134dd4ffe77cad58952a776" ctrl)
    ds5_cyw43_read_fragment(cyw43_wol_guards.inc guards)
    ds5_cyw43_replace_once(ctrl
        "static void cyw43_poll_func(void) {"
        "${guards}\nstatic void ds5_cyw43_wifi_rejoin(cyw43_t *self);\n\nstatic void cyw43_poll_func(void) {"
        "poll function")
    set(guard [=[    // A queued late event must never reissue SET_SSID after WLAN teardown.
    // Keep this after packet/HCI processing and before any deferred WLAN work.
    ds5_cyw43_cancel_disabled_work(&self->pend_rejoin, &self->pend_rejoin_wpa, &self->pend_disassoc);

]=])
    ds5_cyw43_replace_once(ctrl "    if (self->pend_disassoc) {" "${guard}    if (self->pend_disassoc) {"
        "deferred disassociation")
    # PRUNE reason 8 (RSN mismatch) makes the stock poll switch the station to
    # WPA1 PSK and re-issue the join, which can admit a WPA1-CCMP network.
    set(anchor [=[    if (self->pend_rejoin_wpa) {
        self->pend_rejoin_wpa = false;
        cyw43_ll_wifi_set_wpa_auth(&self->cyw43_ll);
    }
]=])
    set(guard [=[    // DS5 Bridge joins WPA2-AES (CCMP) networks only: never downgrade an
    // RSN-mismatch retry to WPA1 PSK authentication.
    ds5_cyw43_refuse_wpa_downgrade(&self->pend_rejoin, &self->pend_rejoin_wpa);
]=])
    ds5_cyw43_replace_once(ctrl "${anchor}" "${guard}" "WPA rejoin")
    set(anchor "void cyw43_cb_process_async_event(void *cb_data, const cyw43_async_event_t *ev) {\n    cyw43_t *self = cb_data;")
    ds5_cyw43_replace_once(ctrl "${anchor}"
        "${anchor}\n\n    // WLAN events only, Bluetooth HCI has a separate packet channel.\n    if (!ds5_cyw43_wlan_allowed) {\n        return;\n    }"
        "async event entry")
    ds5_cyw43_read_fragment(cyw43_wol_join.inc join)
    string(FIND "${ctrl}" "int cyw43_wifi_join(" start)
    string(FIND "${ctrl}" "int cyw43_wifi_leave(" end)
    if(start LESS 0 OR end LESS start)
        message(FATAL_ERROR "Audited CYW43 boundary changed: station join")
    endif()
    math(EXPR length "${end} - ${start}")
    string(SUBSTRING "${ctrl}" ${start} ${length} original_join)
    string(REPLACE "${original_join}" "${join}\n\n" ctrl "${ctrl}")
    ds5_cyw43_replace_once(ctrl
        "        cyw43_ll_wifi_rejoin(&self->cyw43_ll);\n        self->wifi_join_state = WIFI_JOIN_STATE_ACTIVE;"
        "        ds5_cyw43_wifi_rejoin(self);"
        "deferred rejoin")
    get_filename_component(output_directory "${output}" DIRECTORY)
    file(MAKE_DIRECTORY "${output_directory}")
    file(CONFIGURE OUTPUT "${output}" CONTENT "${ctrl}" @ONLY NEWLINE_STYLE LF)
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
    if(ENABLE_COMPANION)
        ds5_patch_cyw43_ioctl(ll)
    endif()
    # The SDK's poll-mode wait between ioctl and send-credit polls sleeps until
    # min(async_context next_time, now + 1 ms). next_time is only refreshed by
    # cyw43_arch_poll(), which cannot run while an ioctl blocks the main loop, so
    # it goes stale; best_effort_wfe_or_timeout() then WFEs on that past time
    # without arming an alarm, and only an unrelated interrupt wakes core 0. With
    # the PC off (Wake-on-LAN from S5) none came and the watchdog reset the
    # bridge. Spin instead; both loops re-check their own 1 s timeouts.
    ds5_cyw43_read_fragment(cyw43_bounded_wait.inc bounded_wait)
    ds5_cyw43_replace_once(ll "#define USE_KSO (1)" "${bounded_wait}\n#define USE_KSO (1)" "ioctl wait")
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
