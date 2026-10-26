# Wake-on-LAN driver hardening in the production-generated, hash-checked SDK
# copies, plus the radio adapter's teardown order. Ported from Kitsune Input.
# Build-local output only.
include("${CMAKE_CURRENT_LIST_DIR}/../../cmake/patch-cyw43.cmake")
if(NOT DEFINED SDK_PATH OR NOT DEFINED OUTPUT_DIR OR NOT DEFINED SOURCE_DIR)
    message(FATAL_ERROR "SDK_PATH, OUTPUT_DIR and SOURCE_DIR are required")
endif()
set(ENABLE_COMPANION ON)
file(MAKE_DIRECTORY "${OUTPUT_DIR}")
ds5_generate_cyw43_payload(
    "${SDK_PATH}/lib/cyw43-driver/src/cyw43_ll.c"
    "${SDK_PATH}/src/rp2_common/pico_cyw43_driver/cyw43_bus_pio_spi.c"
    "${SDK_PATH}/src/rp2_common/pico_cyw43_driver/cybt_shared_bus/cybt_shared_bus_driver.c"
    "${OUTPUT_DIR}")
ds5_generate_cyw43_wol_ctrl("${SDK_PATH}/lib/cyw43-driver/src/cyw43_ctrl.c" "${OUTPUT_DIR}/cyw43_ctrl.c")
file(READ "${OUTPUT_DIR}/cyw43_ll.c" ll)
file(READ "${OUTPUT_DIR}/cyw43_ctrl.c" ctrl)

# Needles are CMake list items, so none may contain a semicolon.
function(ds5_wol_order source label)
    set(previous -1)
    foreach(needle IN LISTS ARGN)
        string(FIND "${source}" "${needle}" position)
        if(position LESS 0 OR position LESS_EQUAL previous)
            message(FATAL_ERROR "${label}: '${needle}' missing or out of order")
        endif()
        set(previous ${position})
    endforeach()
endfunction()

# A firmware-rejected ioctl is an error, not an ACK.
ds5_wol_order("${ll}" "ioctl error"
    "#define DS5_CONTROL_ERROR (3)"
    "if (ds5_cyw43_ioctl_failed(ioctl_header->status, ioctl_header->flags))"
    "if (ret == DS5_CONTROL_ERROR)")

# The PMK ioctl is scrubbed from the stack copy and from spid_buf before the
# join continues.
ds5_wol_order("${ll}" "PMK scrub"
    "WLC_SET_WSEC_PMK, 4 + CYW43_WPA_MAX_PASSWORD_LEN, buf, WWD_STA_INTERFACE)"
    "ds5_cyw43_erase_secret(buf, 4 + CYW43_WPA_MAX_PASSWORD_LEN)"
    "ds5_cyw43_erase_transfer_secret(self->spid_buf, sizeof(self->spid_buf),"
    "SDPCM_HEADER_LEN + IOCTL_HEADER_LEN + 4 + CYW43_WPA_MAX_PASSWORD_LEN)"
    "if (wpa_auth == CYW43_WPA3_AUTH_SAE_PSK) {")
string(FIND "${ll}" "static inline void ds5_cyw43_erase_transfer_secret(" helper)
string(FIND "${ll}" "int cyw43_ll_wifi_join(" join)
if(helper LESS 0 OR helper GREATER join)
    message(FATAL_ERROR "PMK scrub helper is not defined before the join")
endif()

# WLAN startup programs the reduced event mask and fails on its error.
ds5_wol_order("${ll}" "event mask"
    "static int ds5_cyw43_enable_wifi_events(cyw43_int_t *self, uint8_t *buf)"
    "int cyw43_ll_wifi_on(cyw43_ll_t *self_in, uint32_t country) {"
    "int event_result = ds5_cyw43_enable_wifi_events(self, buf)")

# An RSN-mismatch prune never re-issues the join with WPA1 PSK, WLAN events
# are dropped unless the adapter allows WLAN, and deferred work is cancelled.
string(FIND "${ctrl}" "cyw43_ll_wifi_set_wpa_auth(" downgrade)
if(NOT downgrade EQUAL -1)
    message(FATAL_ERROR "Generated driver still downgrades a rejoin to WPA1 PSK")
endif()
ds5_wol_order("${ctrl}" "WPA downgrade guard"
    "static inline void ds5_cyw43_refuse_wpa_downgrade("
    "static void cyw43_poll_func(void) {"
    "ds5_cyw43_cancel_disabled_work(&self->pend_rejoin, &self->pend_rejoin_wpa, &self->pend_disassoc)"
    "ds5_cyw43_refuse_wpa_downgrade(&self->pend_rejoin, &self->pend_rejoin_wpa)"
    "ds5_cyw43_wifi_rejoin(self)")
ds5_wol_order("${ctrl}" "WLAN event gate"
    "void cyw43_cb_process_async_event(void *cb_data, const cyw43_async_event_t *ev) {"
    "// WLAN events only, Bluetooth HCI has a separate packet channel.")

# Teardown disassociates after masking WLAN events and before DOWN, and keeps
# the DOWN readback and drain proof.
file(READ "${SOURCE_DIR}/wake_on_lan.cpp" adapter)
string(FIND "${adapter}" "void stop(void *) {" stop_start)
string(FIND "${adapter}" "Error start(const Config &config,void *) {" stop_end)
if(stop_start LESS 0 OR stop_end LESS stop_start)
    message(FATAL_ERROR "Radio adapter teardown boundary changed")
endif()
math(EXPR stop_length "${stop_end} - ${stop_start}")
string(SUBSTRING "${adapter}" ${stop_start} ${stop_length} stop)
ds5_wol_order("${stop}" "Teardown order"
    "clear_join_work()"
    "const bool masked=disable_wifi_events()"
    "(void)cyw43_wifi_leave(&cyw43_state,CYW43_ITF_STA)"
    "\n    cyw43_arch_disable_sta_mode()"
    "kSetDown"
    "!get_up(0)")

# A missed scan is re-issued through the shared join helper, only from the
# Joining state, and FAIL/BADAUTH still fault.
ds5_wol_order("${adapter}" "NONET retry"
    "if (join_retry.pending()) {"
    "if (!join_config || join(*join_config)!=0)"
    "if (cyw43_state.wifi_join_state & (kJoinAuth|kJoinLink)) join_retry.note_progress()"
    "if (link==CYW43_LINK_NONET && join_retry.on_no_network(now)) return"
    "radio_error=link==CYW43_LINK_BADAUTH ? Error::Authentication:Error::NetworkUnavailable")
# The adapter's AUTH/LINK progress bits must match the pinned driver's private
# join-state definitions.
file(READ "${SDK_PATH}/lib/cyw43-driver/src/cyw43_ctrl.c" sdk_ctrl)
foreach(needle "#define WIFI_JOIN_STATE_AUTH    (0x0200)" "#define WIFI_JOIN_STATE_LINK    (0x0400)")
    string(FIND "${sdk_ctrl}" "${needle}" position)
    if(position LESS 0)
        message(FATAL_ERROR "Pinned CYW43 join-state bit changed: ${needle}")
    endif()
endforeach()
string(FIND "${adapter}" "kJoinAuth=0x0200, kJoinLink=0x0400" position)
if(position LESS 0)
    message(FATAL_ERROR "Radio adapter join-progress bits do not match the pinned driver")
endif()
message(STATUS "ioctl errors, PMK scrub, event mask, WPA downgrade refusal, teardown and NONET retry verified")
