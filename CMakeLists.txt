# Generated Cmake Pico project file

cmake_minimum_required(VERSION 3.13)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

set(DS5_FIRMWARE_VERSION_FILE "${CMAKE_CURRENT_LIST_DIR}/firmware-version.txt")
set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS
    "${DS5_FIRMWARE_VERSION_FILE}"
)
file(STRINGS "${DS5_FIRMWARE_VERSION_FILE}" DS5_FIRMWARE_VERSION LIMIT_COUNT 1)
string(STRIP "${DS5_FIRMWARE_VERSION}" DS5_FIRMWARE_VERSION)
if(NOT DS5_FIRMWARE_VERSION MATCHES "^([0-9]+)\\.([0-9]+)\\.([0-9]+)$")
    message(FATAL_ERROR
        "firmware-version.txt must contain one MAJOR.MINOR.PATCH version"
    )
endif()
set(DS5_FIRMWARE_VERSION_MAJOR "${CMAKE_MATCH_1}")
set(DS5_FIRMWARE_VERSION_MINOR "${CMAKE_MATCH_2}")
set(DS5_FIRMWARE_VERSION_PATCH "${CMAKE_MATCH_3}")

# Initialise pico_sdk from installed location
# (note this can come from environment, CMake cache etc)

# == DO NOT EDIT THE FOLLOWING LINES for the Raspberry Pi Pico VS Code Extension to work ==
if (WIN32)
    set(USERHOME $ENV{USERPROFILE})
else ()
    set(USERHOME $ENV{HOME})
endif ()
set(sdkVersion 2.3.0)
set(toolchainVersion 15_2_Rel1)
set(picotoolVersion 2.3.0)
set(picoVscode ${USERHOME}/.pico-sdk/cmake/pico-vscode.cmake)
if (EXISTS ${picoVscode})
    include(${picoVscode})
endif ()
# ====================================================================================
option(WAVESHARE_RP2350B_PLUS_W_BUILD "Build for Waveshare RP2350B-Plus-W (USB-C, 16MB flash, RM2 wireless)" OFF)

if (WAVESHARE_RP2350B_PLUS_W_BUILD)
    set(PICO_BOARD waveshare_rp2350b_plus_w CACHE STRING "Board type")
    # Waveshare board header is not in upstream pico-sdk; ship it here and
    # tell the SDK to search this directory when resolving PICO_BOARD.
    list(APPEND PICO_BOARD_HEADER_DIRS "${CMAKE_CURRENT_SOURCE_DIR}/boards/headers")
else ()
    set(PICO_BOARD pico2_w CACHE STRING "Board type")
endif ()
message(STATUS "ds5-bridge board target -- PICO_BOARD=${PICO_BOARD}")
set(SYS_CLOCK_KHZ_VALUE 150000 CACHE STRING "RP2350 system clock in kHz")
set(CYW43_PIO_CLOCK_DIV_VALUE 2 CACHE STRING "CYW43 PIO clock divider")

# Pull in Raspberry Pi Pico SDK (must be before project)
include(pico_sdk_import.cmake)

project(ds5-bridge C CXX ASM)

# DS5 Bridge owns TinyUSB from the core-0 bare-metal loop and synchronizes all
# cross-core traffic through its own queues. TinyUSB 0.21 defaults RP2 builds
# to OPT_OS_PICO, which consumes additional exclusive critical sections and
# changes the firmware's established concurrency model.
set(TINYUSB_OPT_OS OPT_OS_NONE CACHE STRING "TinyUSB OS abstraction for DS5 Bridge firmware" FORCE)

# Initialise the Raspberry Pi Pico SDK
pico_sdk_init()

# Patched copies of the CYW43 Bluetooth transport (see cmake/patch-cyw43.cmake):
# bounded receive continuation, the single-pass packet reader with retained
# overflow evidence, bounded backplane-window reuse and the F2 readiness fix.
include("${CMAKE_CURRENT_SOURCE_DIR}/cmake/patch-cyw43.cmake")
set(DS5_CYW43_GENERATED_DIR "${CMAKE_BINARY_DIR}/generated/ds5-cyw43")
set(DS5_SDK_CYW43_DIR "${PICO_SDK_PATH}/src/rp2_common/pico_cyw43_driver")
ds5_generate_cyw43_hci_transport(
        "${DS5_SDK_CYW43_DIR}/btstack_hci_transport_cyw43.c"
        "${DS5_CYW43_GENERATED_DIR}/btstack_hci_transport_cyw43.c"
)
ds5_generate_cyw43_shared_bus(
        "${DS5_SDK_CYW43_DIR}/cybt_shared_bus/cybt_shared_bus.c"
        "${DS5_CYW43_GENERATED_DIR}/cybt_shared_bus.c"
)
ds5_generate_cyw43_payload(
        "${PICO_CYW43_DRIVER_PATH}/src/cyw43_ll.c"
        "${DS5_SDK_CYW43_DIR}/cyw43_bus_pio_spi.c"
        "${DS5_SDK_CYW43_DIR}/cybt_shared_bus/cybt_shared_bus_driver.c"
        "${DS5_CYW43_GENERATED_DIR}"
)
ds5_replace_sdk_interface_source(pico_btstack_hci_transport_cyw43
        "${DS5_SDK_CYW43_DIR}/btstack_hci_transport_cyw43.c"
        "${DS5_CYW43_GENERATED_DIR}/btstack_hci_transport_cyw43.c")
ds5_replace_sdk_interface_source(cybt_shared_bus
        "${DS5_SDK_CYW43_DIR}/cybt_shared_bus/cybt_shared_bus.c"
        "${DS5_CYW43_GENERATED_DIR}/cybt_shared_bus.c")
ds5_replace_sdk_interface_source(cybt_shared_bus
        "${DS5_SDK_CYW43_DIR}/cybt_shared_bus/cybt_shared_bus_driver.c"
        "${DS5_CYW43_GENERATED_DIR}/cybt_shared_bus_driver.c")
ds5_replace_sdk_interface_source(cyw43_driver
        "${PICO_CYW43_DRIVER_PATH}/src/cyw43_ll.c"
        "${DS5_CYW43_GENERATED_DIR}/cyw43_ll.c")
ds5_replace_sdk_interface_source(cyw43_driver_picow
        "${DS5_SDK_CYW43_DIR}/cyw43_bus_pio_spi.c"
        "${DS5_CYW43_GENERATED_DIR}/cyw43_bus_pio_spi.c")
# Wake-on-LAN station control (companion builds only; see src/wake_on_lan.cpp).
set(DS5_CYW43_CTRL_OBJECT lib/cyw43-driver/src/cyw43_ctrl.c.o)
if(ENABLE_COMPANION)
    ds5_generate_cyw43_wol_ctrl(
            "${PICO_CYW43_DRIVER_PATH}/src/cyw43_ctrl.c"
            "${DS5_CYW43_GENERATED_DIR}/cyw43_ctrl.c")
    ds5_replace_sdk_interface_source(cyw43_driver
            "${PICO_CYW43_DRIVER_PATH}/src/cyw43_ctrl.c"
            "${DS5_CYW43_GENERATED_DIR}/cyw43_ctrl.c")
    set(DS5_CYW43_CTRL_OBJECT generated/ds5-cyw43/cyw43_ctrl.c.o)
endif()

# Add executable. Default name is the project name, version 0.1

add_executable(ds5-bridge
        src/usb_descriptors.c
        src/main.cpp
        src/button_functions.cpp
        src/kitsune_button_gesture.cpp
        src/dualsense_input_decoder.cpp
        src/persona/host_persona.cpp
        src/persona/dualsense_persona.cpp
        src/persona/ds4_persona.cpp
        src/persona/xusb360_persona.cpp
        src/persona/xusb360_usb.cpp
        src/usb.cpp
        src/controller_packet_compositor.cpp
        src/controller_output_policy.cpp
        src/controller_output_rumble_state.cpp
        src/controller_output_state.cpp
        src/haptics_test_signal.cpp
        src/output_scheduler.cpp
        src/ram_mem.c
        src/audio.cpp
        src/bt.cpp
        src/firmware_log.cpp
        src/runtime_fail_fast.cpp
        src/watchdog_telemetry.cpp
        src/wake_on_lan.cpp
)

# Third-party archives follow the firmware's exception/RTTI policy instead of
# retaining an otherwise unused exception-unwinding runtime.
function(ds5_apply_pico_archive_compile_policy target)
    target_compile_options(${target} PRIVATE -fsigned-char)
    if(NOT PICO_CXX_ENABLE_EXCEPTIONS)
        target_compile_definitions(${target} PRIVATE PICO_CXX_ENABLE_EXCEPTIONS=0)
        target_compile_options(${target} PRIVATE
            $<$<COMPILE_LANGUAGE:CXX>:-fno-exceptions>
            $<$<COMPILE_LANGUAGE:CXX>:-fno-unwind-tables>
        )
    endif()
    if(NOT PICO_CXX_ENABLE_RTTI)
        target_compile_options(${target} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-fno-rtti>)
    endif()
    if(NOT PICO_CXX_ENABLE_CXA_ATEXIT)
        target_compile_options(${target} PRIVATE $<$<COMPILE_LANGUAGE:CXX>:-fno-use-cxa-atexit>)
    endif()
    if(NOT PICO_NO_GC_SECTIONS)
        target_compile_options(${target} PRIVATE -ffunction-sections -fdata-sections)
    endif()
endfunction()

# Cockos WDLResampler
add_library(wdl_resampler STATIC
        lib/WDL/WDL/resample.cpp
)
target_include_directories(wdl_resampler PUBLIC
        lib/WDL/WDL
)
ds5_apply_pico_archive_compile_policy(wdl_resampler)

# Opus
# The DualSense speaker path encodes CELT-only frames: audio.cpp creates the
# encoder with OPUS_APPLICATION_RESTRICTED_CELT at 48 kHz stereo, 10 ms, CBR,
# complexity 0. That application never allocates, initializes or runs the SILK
# encoder, and complexity 0 never runs the tonality analysis. The linker
# wrappers on ds5-bridge redirect those entry points so --gc-sections can
# discard both trees instead of copying them to SRAM. The stack protector is
# disabled: its canaries sat in every codec hot loop while hardening checks
# (OPUS_HARDENING) remain enabled.
set(OPUS_STACK_PROTECTOR OFF CACHE BOOL "DS5 Bridge keeps Opus hardening without stack canaries" FORCE)
set(OPUS_STACK_PROTECTOR OFF)
add_subdirectory(lib/opus)

# Keep live Opus instructions and numerical tables in SRAM. Preserve individual
# sections so the linker can discard unused routines and tables. Diagnostic
# strings stay in flash; normalize legacy archives on incremental builds too.
add_custom_command(
        OUTPUT ${CMAKE_BINARY_DIR}/opus_ram_relocate.stamp
        COMMAND ${CMAKE_COMMAND}
                "-DARCHIVE=$<TARGET_FILE:opus>"
                "-DOBJDUMP=${CMAKE_OBJDUMP}"
                "-DOBJCOPY=${CMAKE_OBJCOPY}"
                -P "${CMAKE_SOURCE_DIR}/cmake/relocate_opus_sections.cmake"
        COMMAND ${CMAKE_COMMAND} -E touch ${CMAKE_BINARY_DIR}/opus_ram_relocate.stamp
        DEPENDS $<TARGET_FILE:opus>
                "${CMAKE_SOURCE_DIR}/cmake/relocate_opus_sections.cmake"
                "${CMAKE_SOURCE_DIR}/cmake/opus_sections.cmake"
        COMMENT "Placing Opus code/tables in SRAM and diagnostic strings in flash"
        VERBATIM
)
add_custom_target(opus_ram_relocate ALL DEPENDS ${CMAKE_BINARY_DIR}/opus_ram_relocate.stamp)
add_dependencies(ds5-bridge opus_ram_relocate)

# Opus' hardening failure path normally formats a diagnostic through fprintf.
# The firmware supplies a watchdog-backed fail-fast implementation instead, and
# the forced include discards the message and source-path strings before they
# are emitted while the hardening checks keep running.
target_compile_definitions(opus PRIVATE OVERRIDE_celt_fatal)
target_compile_options(opus PRIVATE -O2 -ffunction-sections -fdata-sections)
target_compile_options(opus PRIVATE
        "SHELL:-include ${CMAKE_CURRENT_SOURCE_DIR}/cmake/opus_fatal_override.h"
        # The rewritten celt_fatal prototype loses its parameter list in C.
        -Wno-strict-prototypes)
target_link_options(ds5-bridge PRIVATE
        "LINKER:--wrap=silk_Encode"
        "LINKER:--wrap=silk_InitEncoder"
        "LINKER:--wrap=run_analysis"
        "LINKER:--wrap=tonality_analysis_init"
        "LINKER:--wrap=tonality_analysis_reset"
        "LINKER:--wrap=tonality_get_info"
)
target_compile_options(wdl_resampler PRIVATE -O2)
add_custom_command(TARGET wdl_resampler POST_BUILD
        COMMAND ${CMAKE_OBJCOPY}
                --rename-section .text._ZN13WDL_Resampler11ResampleOutEPfiii=.time_critical.WDL_ResampleOut
                --rename-section .text._ZN13WDL_Resampler15ResamplePrepareEiiPPf=.time_critical.WDL_ResamplePrepare
                --rename-section .text._ZN13WDL_Resampler5ResetEd=.time_critical.WDL_Reset
                --rename-section .text._ZL26wdl_rs_reinterleave_bufferPfiii=.time_critical.WDL_ReinterleaveBuffer
                $<TARGET_FILE:wdl_resampler>
        COMMENT "Relocating WDL_Resampler hot path to .time_critical.*"
        VERBATIM
)

# Keep high-frequency Bluetooth, CYW43, and USB paths in SRAM. Besides reducing
# XIP contention during controller audio, this leaves core 1 promptly
# interruptible while flash access is paused. The helper verifies each section
# name so compiler or SDK drift cannot silently undo a relocation.
function(relocate_to_ram _suffix _renames _comment)
    add_custom_command(TARGET ds5-bridge PRE_LINK
            COMMAND ${CMAKE_COMMAND}
                    "-DOBJROOT=${CMAKE_BINARY_DIR}/CMakeFiles/ds5-bridge.dir"
                    "-DOBJCOPY=${CMAKE_OBJCOPY}"
                    "-DOBJDUMP=${CMAKE_OBJDUMP}"
                    "-DSUFFIX=${_suffix}"
                    "-DRENAMES=${_renames}"
                    -P "${CMAKE_SOURCE_DIR}/cmake/relocate_to_ram.cmake"
            COMMENT "${_comment}"
            VERBATIM
    )
endfunction()

# Tier 1: controller receive, USB FIFO, and CYW43 transport.
relocate_to_ram(
        lib/btstack/src/hci.c.o
        ".text.packet_handler=.time_critical.bt_packet_handler"
        "Relocating BT packet receive path to SRAM"
)
relocate_to_ram(
        lib/btstack/src/l2cap.c.o
        ".text.l2cap_acl_handler=.time_critical.l2cap_acl_handler"
        "Relocating L2CAP receive path to SRAM"
)
relocate_to_ram(
        lib/tinyusb/src/common/tusb_fifo.c.o
        ".text.tu_fifo_read=.time_critical.tu_fifo_read@.text.tu_fifo_read_n_access_mode=.time_critical.tu_fifo_read_n_access_mode@.text.tu_fifo_write=.time_critical.tu_fifo_write@.text.tu_fifo_write_n_access_mode=.time_critical.tu_fifo_write_n_access_mode"
        "Relocating TinyUSB FIFO data path to SRAM"
)
relocate_to_ram(
        generated/ds5-cyw43/cyw43_bus_pio_spi.c.o
        ".text.cyw43_spi_transfer=.time_critical.cyw43_spi_transfer@.text.cyw43_read_bytes=.time_critical.cyw43_read_bytes@.text.cyw43_write_bytes=.time_critical.cyw43_write_bytes@.text.cyw43_read_reg_u32=.time_critical.cyw43_read_reg_u32@.text.cyw43_read_reg_u16=.time_critical.cyw43_read_reg_u16@.text.cyw43_read_reg_u8=.time_critical.cyw43_read_reg_u8@.text.cyw43_write_reg_u32=.time_critical.cyw43_write_reg_u32@.text.cyw43_write_reg_u16=.time_critical.cyw43_write_reg_u16@.text.cyw43_write_reg_u8=.time_critical.cyw43_write_reg_u8@.text.read_reg_u32_swap=.time_critical.read_reg_u32_swap@.text.write_reg_u32_swap=.time_critical.write_reg_u32_swap@.text.ns_delay.constprop.0=.time_critical.cyw43_ns_delay"
        "Relocating CYW43 PIO-SPI transport to SRAM"
)
relocate_to_ram(
        generated/ds5-cyw43/cyw43_ll.c.o
        ".text.cyw43_ll_bus_sleep=.time_critical.cyw43_ll_bus_sleep@.text.cyw43_ll_sdpcm_poll_device=.time_critical.cyw43_ll_sdpcm_poll_device@.text.cyw43_ll_process_packets=.time_critical.cyw43_ll_process_packets@.text.cyw43_sdpcm_send_common=.time_critical.cyw43_sdpcm_send_common@.text.cyw43_do_ioctl.part.0=.time_critical.cyw43_do_ioctl@.text.cyw43_ll_bt_has_work=.time_critical.cyw43_ll_bt_has_work@.text.cyw43_ll_parse_async_event=.time_critical.cyw43_ll_parse_async_event"
        "Relocating CYW43 SDPCM pump to SRAM"
)
relocate_to_ram(
        ${DS5_CYW43_CTRL_OBJECT}
        ".text.cyw43_ensure_up=.time_critical.cyw43_ensure_up@.text.cyw43_cb_ensure_awake=.time_critical.cyw43_cb_ensure_awake@.text.cyw43_poll_func=.time_critical.cyw43_poll_func@.text.cyw43_bluetooth_hci_read=.time_critical.cyw43_bluetooth_hci_read@.text.cyw43_bluetooth_hci_write=.time_critical.cyw43_bluetooth_hci_write"
        "Relocating CYW43 poll and Bluetooth HCI bus to SRAM"
)
relocate_to_ram(
        generated/ds5-cyw43/cybt_shared_bus.c.o
        ".text.cyw43_btbus_write=.time_critical.cyw43_btbus_write@.text.cyw43_btbus_read=.time_critical.cyw43_btbus_read@.text.cybt_hci_read=.time_critical.cybt_hci_read"
        "Relocating CYW43 shared-bus read and write to SRAM"
)
relocate_to_ram(
        generated/ds5-cyw43/cybt_shared_bus_driver.c.o
        ".text.cybt_awake=.time_critical.cybt_awake@.text.cybt_set_bt_awake=.time_critical.cybt_set_bt_awake@.text.cybt_get_bt_buf_index=.time_critical.cybt_get_bt_buf_index@.text.cybt_toggle_bt_intr=.time_critical.cybt_toggle_bt_intr@.text.cybt_reg_write_idx=.time_critical.cybt_reg_write_idx@.text.cybt_mem_write_idx=.time_critical.cybt_mem_write_idx@.text.cybt_mem_read_idx=.time_critical.cybt_mem_read_idx"
        "Relocating CYW43 shared-bus packet helpers to SRAM"
)
# Every received Bluetooth packet is read by the transport's data-source
# callback through cyw43_btbus_read, cybt_hci_read and cybt_mem_read_idx.
relocate_to_ram(
        generated/ds5-cyw43/btstack_hci_transport_cyw43.c.o
        ".text.hci_transport_data_source_process=.time_critical.hci_transport_data_source_process@.text.cyw43_bluetooth_hci_process=.time_critical.cyw43_bluetooth_hci_process"
        "Relocating the CYW43 HCI receive callback to SRAM"
)
relocate_to_ram(
        src/rp2_common/pico_cyw43_driver/cyw43_driver.c.o
        ".text.cyw43_thread_enter=.time_critical.cyw43_thread_enter@.text.cyw43_thread_exit=.time_critical.cyw43_thread_exit"
        "Relocating CYW43 driver lock path to SRAM"
)
relocate_to_ram(
        src/rp2_common/pico_async_context/async_context_poll.c.o
        ".text.noop=.time_critical.async_context_poll_noop"
        "Relocating CYW43 poll-context lock stub to SRAM"
)
relocate_to_ram(
        src/rp2_common/hardware_clocks/clocks.c.o
        ".text.clock_get_hz=.time_critical.clock_get_hz"
        "Relocating CYW43 bus clock query to SRAM"
)

# Tier 2: transmit pumps and USB transfer submission.
relocate_to_ram(
        lib/btstack/src/hci.c.o
        ".text.hci_run=.time_critical.hci_run@.text.hci_send_acl_packet_fragments=.time_critical.hci_send_acl_packet_fragments@.text.hci_send_acl_packet_buffer=.time_critical.hci_send_acl_packet_buffer@.text.hci_can_send_prepared_acl_packet_now=.time_critical.hci_can_send_prepared_acl_packet_now@.text.hci_can_send_acl_packet_now=.time_critical.hci_can_send_acl_packet_now@.text.hci_can_send_acl_classic_packet_now=.time_critical.hci_can_send_acl_classic_packet_now@.text.hci_is_packet_buffer_reserved=.time_critical.hci_is_packet_buffer_reserved@.text.hci_reserve_packet_buffer=.time_critical.hci_reserve_packet_buffer@.text.hci_get_outgoing_packet_buffer=.time_critical.hci_get_outgoing_packet_buffer@.text.hci_non_flushable_packet_boundary_flag_supported=.time_critical.hci_non_flushable_packet_boundary_flag_supported@.text.hci_automatic_flush_timeout=.time_critical.hci_automatic_flush_timeout"
        "Relocating HCI transmit pump to SRAM"
)
relocate_to_ram(
        lib/btstack/src/l2cap.c.o
        ".text.l2cap_run=.time_critical.l2cap_run@.text.l2cap_send=.time_critical.l2cap_send@.text.l2cap_send_prepared=.time_critical.l2cap_send_prepared@.text.l2cap_notify_channel_can_send=.time_critical.l2cap_notify_channel_can_send@.text.l2cap_request_can_send_now_event=.time_critical.l2cap_request_can_send_now_event"
        "Relocating L2CAP transmit path to SRAM"
)
relocate_to_ram(
        lib/btstack/src/btstack_linked_list.c.o
        ".text.btstack_linked_list_add_tail=.time_critical.btstack_linked_list_add_tail@.text.btstack_linked_list_remove=.time_critical.btstack_linked_list_remove@.text.btstack_linked_list_iterator_init=.time_critical.btstack_linked_list_iterator_init@.text.btstack_linked_list_iterator_has_next=.time_critical.btstack_linked_list_iterator_has_next@.text.btstack_linked_list_iterator_next=.time_critical.btstack_linked_list_iterator_next"
        "Relocating BTstack list iterators to SRAM"
)
relocate_to_ram(
        lib/btstack/src/btstack_util.c.o
        ".text.little_endian_read_16=.time_critical.little_endian_read_16@.text.little_endian_store_16=.time_critical.little_endian_store_16"
        "Relocating BTstack packet writer to SRAM"
)
relocate_to_ram(
        lib/btstack/src/hci_dump.c.o
        ".text.hci_dump_btstack_event=.time_critical.hci_dump_btstack_event@.text.hci_dump_packet=.time_critical.hci_dump_packet"
        "Relocating BTstack event dump stub to SRAM"
)
relocate_to_ram(
        lib/btstack/src/btstack_run_loop.c.o
        ".text.btstack_run_loop_get_time_ms=.time_critical.btstack_run_loop_get_time_ms"
        "Relocating BTstack time query to SRAM"
)
relocate_to_ram(
        src/rp2_common/pico_btstack/btstack_run_loop_async_context.c.o
        ".text.btstack_run_loop_async_context_get_time_ms=.time_critical.btstack_run_loop_async_context_get_time_ms"
        "Relocating BTstack async-context clock to SRAM"
)
relocate_to_ram(
        generated/ds5-cyw43/btstack_hci_transport_cyw43.c.o
        ".text.hci_transport_cyw43_send_packet=.time_critical.hci_transport_cyw43_send_packet"
        "Relocating CYW43 HCI packet send entry to SRAM"
)
relocate_to_ram(
        generated/ds5-cyw43/cyw43_ll.c.o
        ".text.cyw43_ll_write_backplane_mem=.time_critical.cyw43_ll_write_backplane_mem@.text.cyw43_ll_read_backplane_mem=.time_critical.cyw43_ll_read_backplane_mem@.text.cyw43_write_backplane=.time_critical.cyw43_write_backplane@.text.cyw43_read_backplane.constprop.0=.time_critical.cyw43_read_backplane"
        "Relocating CYW43 backplane accessors to SRAM"
)
# Every HCI payload is copied through the bounded window-reuse writer/reader,
# which select and restore the backplane window around each ring segment.
relocate_to_ram(
        generated/ds5-cyw43/cyw43_ll.c.o
        ".text.ds5_cyw43_write_backplane_mem_batched=.time_critical.ds5_cyw43_write_backplane_mem_batched@.text.ds5_cyw43_read_backplane_mem_batched=.time_critical.ds5_cyw43_read_backplane_mem_batched@.text.cyw43_set_backplane_window=.time_critical.cyw43_set_backplane_window@.text.cyw43_set_backplane_window.constprop.0=.time_critical.cyw43_set_backplane_window_default@.text.cyw43_read_backplane=.time_critical.cyw43_read_backplane_generic@.text.cyw43_ll_read_backplane_reg=.time_critical.cyw43_ll_read_backplane_reg@.text.cyw43_ll_write_backplane_reg=.time_critical.cyw43_ll_write_backplane_reg"
        "Relocating bounded HCI window-reuse and register helpers to SRAM"
)
# tud_task locks its event queue through usbd_int_set -> dcd_int_enable/disable
# -> irq_set_enabled on every call, several times per main-loop pass. Each
# input report also claims, checks and starts its endpoint transfer.
relocate_to_ram(
        lib/tinyusb/src/device/usbd.c.o
        ".text.tud_task_ext=.time_critical.tud_task_ext@.text.usbd_edpt_xfer=.time_critical.usbd_edpt_xfer@.text.usbd_edpt_xfer_fifo=.time_critical.usbd_edpt_xfer_fifo@.text.usbd_int_set=.time_critical.usbd_int_set@.text.usbd_edpt_claim=.time_critical.usbd_edpt_claim@.text.usbd_edpt_busy=.time_critical.usbd_edpt_busy@.text.tud_mounted=.time_critical.tud_mounted@.text.tud_suspended=.time_critical.tud_suspended@.text.tud_event_hook_cb=.time_critical.tud_event_hook_cb"
        "Relocating TinyUSB device task and transfers to SRAM"
)
relocate_to_ram(
        lib/tinyusb/src/tusb.c.o
        ".text.tu_edpt_claim=.time_critical.tu_edpt_claim"
        "Relocating TinyUSB endpoint claim to SRAM"
)
relocate_to_ram(
        lib/tinyusb/src/portable/raspberrypi/rp2040/dcd_rp2040.c.o
        ".text.dcd_edpt_xfer=.time_critical.dcd_edpt_xfer@.text.dcd_edpt_iso_activate=.time_critical.dcd_edpt_iso_activate@.text.dcd_int_enable=.time_critical.dcd_int_enable@.text.dcd_int_disable=.time_critical.dcd_int_disable"
        "Relocating RP2040 USB transfer submission to SRAM"
)
relocate_to_ram(
        lib/tinyusb/src/portable/raspberrypi/rp2040/rp2040_usb.c.o
        ".text.rp2usb_xfer_start=.time_critical.rp2usb_xfer_start"
        "Relocating RP2040 USB transfer start to SRAM"
)
relocate_to_ram(
        src/rp2_common/hardware_irq/irq.c.o
        ".text.irq_set_enabled=.time_critical.irq_set_enabled"
        "Relocating the IRQ enable helper to SRAM"
)
relocate_to_ram(
        lib/tinyusb/src/class/audio/audio_device.c.o
        ".text.tud_audio_n_available=.time_critical.tud_audio_n_available@.text.tud_audio_n_get_ep_in_ff=.time_critical.tud_audio_n_get_ep_in_ff@.text.tud_audio_n_read=.time_critical.tud_audio_n_read@.text.tud_audio_n_write=.time_critical.tud_audio_n_write@.text.audiod_calc_tx_packet_sz.isra.0=.time_critical.audiod_calc_tx_packet_sz@.text.audiod_xfer_isr=.time_critical.audiod_xfer_isr"
        "Relocating TinyUSB audio data path to SRAM"
)

# Tier 3: controller input-report and scheduler tail.
relocate_to_ram(
        src/main.cpp.o
        ".text._Z10on_bt_data12CHANNEL_TYPEPht=.time_critical.controller_input_bt_callback@.text._Z14interrupt_loopv=.time_critical.controller_input_usb_submit"
        "Relocating controller input receive and USB submission to SRAM"
)
if(ENABLE_COMPANION)
    relocate_to_ram(
            src/companion.cpp.o
            ".text._ZN12_GLOBAL__N_120queue_shortcut_eventEh|.text._ZN12_GLOBAL__N_1L20queue_shortcut_eventEh=.time_critical.controller_input_shortcut_queue@.text._ZN12_GLOBAL__N_127dpad_direction_from_buttonsEbbbb|.text._ZN12_GLOBAL__N_1L27dpad_direction_from_buttonsEbbbb=.time_critical.controller_input_dpad_remap@.text._Z35companion_process_controller_reportPht=.time_critical.controller_input_companion_process@.text._Z34companion_update_controller_reportPKht=.time_critical.controller_input_companion_snapshot"
            "Relocating companion controller-report processing to SRAM"
    )
endif()
relocate_to_ram(
        src/dualsense_input_decoder.cpp.o
        ".text._Z33dualsense_decode_usb_input_reportPKhtR21BridgeControllerState=.time_critical.controller_input_decode"
        "Relocating DualSense input decoding to SRAM"
)
relocate_to_ram(
        src/persona/host_persona.cpp.o
        ".text.host_persona_active=.time_critical.controller_input_active_persona@.text._Z25host_persona_encode_input15HostPersonaModeRK21BridgeControllerStateR22HostPersonaInputReport=.time_critical.controller_input_persona_encode"
        "Relocating host-persona input dispatch to SRAM"
)
relocate_to_ram(
        src/usb_descriptors.c.o
        ".text.host_persona_descriptors_verified=.time_critical.controller_input_persona_verified"
        "Relocating host-persona verification to SRAM"
)
relocate_to_ram(
        src/persona/dualsense_persona.cpp.o
        ".text._Z30dualsense_persona_encode_inputRK21BridgeControllerStateR22HostPersonaInputReport=.time_critical.controller_input_dualsense_encode"
        "Relocating DualSense persona input encoding to SRAM"
)
relocate_to_ram(
        src/persona/ds4_persona.cpp.o
        ".text._Z24ds4_persona_encode_inputRK21BridgeControllerStateR22HostPersonaInputReport=.time_critical.controller_input_ds4_encode"
        "Relocating DS4 persona input encoding to SRAM"
)
relocate_to_ram(
        src/persona/xusb360_persona.cpp.o
        ".text._Z28xusb360_persona_encode_inputRK21BridgeControllerStateR22HostPersonaInputReport=.time_critical.controller_input_xusb_encode"
        "Relocating XUSB persona input encoding to SRAM"
)
relocate_to_ram(
        src/persona/xusb360_usb.cpp.o
        ".text._Z17xusb360_usb_readyv=.time_critical.controller_input_xusb_ready@.text._Z23xusb360_usb_send_reportPKhh=.time_critical.controller_input_xusb_submit"
        "Relocating XUSB controller input submission to SRAM"
)
relocate_to_ram(
        src/audio.cpp.o
        ".text._Z11set_headsetb=.time_critical.controller_input_headset_state@.text._Z20audio_mic_add_packetPKht=.time_critical.controller_input_mic_enqueue"
        "Relocating controller headset and microphone input handling to SRAM"
)
relocate_to_ram(
        lib/tinyusb/src/class/hid/hid_device.c.o
        ".text.tud_hid_n_report=.time_critical.tud_hid_n_report@.text.tud_hid_n_ready=.time_critical.tud_hid_n_ready@.text.hidd_xfer_cb=.time_critical.hidd_xfer_cb"
        "Relocating TinyUSB HID report path to SRAM"
)
relocate_to_ram(
        src/rp2_common/pico_cyw43_arch/cyw43_arch.c.o
        ".text.cyw43_arch_poll=.time_critical.cyw43_arch_poll"
        "Relocating CYW43 architecture poll to SRAM"
)
relocate_to_ram(
        lib/btstack/src/btstack_run_loop.c.o
        ".text.btstack_run_loop_base_poll_data_sources=.time_critical.btstack_run_loop_base_poll_data_sources@.text.btstack_run_loop_poll_data_sources_from_irq=.time_critical.btstack_run_loop_poll_data_sources_from_irq"
        "Relocating BTstack run-loop poll path to SRAM"
)

# Tier 4: core 1's double-precision math. The SRAM-resident Opus encoder calls
# cos per quantized band, exp/log/acos/atan2 and double arithmetic per frame,
# and floor/sqrt per sample or band in both codec directions. pico_double
# links these in flash by default, so every speaker frame left SRAM.
relocate_to_ram(
        src/rp2_common/pico_double/double_sci_m33.S.o
        ".text.__wrap_sin_cos=.time_critical.double_sin_cos@.text.drrcore=.time_critical.double_range_reduce_core@.text.rtwopi=.time_critical.double_two_over_pi@.text.dpack=.time_critical.double_pack@.text.dreduce=.time_critical.double_reduce@.text.exptab=.time_critical.double_exptab@.text.__wrap_exp=.time_critical.double_exp@.text.__wrap_log=.time_critical.double_log@.text.trigtab=.time_critical.double_trigtab@.text.__wrap_atan2=.time_critical.double_atan2"
        "Relocating Opus double sin/cos, exp, log and atan2 to SRAM"
)
relocate_to_ram(
        src/rp2_common/pico_double/double_aeabi_dcp.S.o
        ".text.__rp2350_dcp_engaged_state_save_restore=.time_critical.double_dcp_state@.text.__wrap___aeabi_dadd=.time_critical.double_add@.text.__wrap___aeabi_dsub=.time_critical.double_sub@.text.__wrap___aeabi_drsub=.time_critical.double_rsub@.text.__wrap___aeabi_dmul=.time_critical.double_mul@.text.ddiv_fast=.time_critical.double_div_fast@.text.__wrap___aeabi_ddiv=.time_critical.double_div@.text.sqrt_fast=.time_critical.double_sqrt_fast@.text.__wrap_sqrt=.time_critical.double_sqrt@.text.dclassify=.time_critical.double_classify@.text.__wrap___aeabi_d2f=.time_critical.double_to_float@.text.__wrap___aeabi_i2d=.time_critical.int_to_double@.text.double2int=.time_critical.double_to_int_impl@.text.__wrap___aeabi_d2iz=.time_critical.double_to_int@.text.__wrap___aeabi_dcmp=.time_critical.double_compare@.text.__wrap___aeabi_dcmpun=.time_critical.double_compare_unordered@.text.__wrap___aeabi_dcmpeq=.time_critical.double_compare_eq@.text.__wrap___aeabi_dcmplt=.time_critical.double_compare_lt@.text.__wrap___aeabi_dcmple=.time_critical.double_compare_le@.text.__wrap___aeabi_dcmpge=.time_critical.double_compare_ge@.text.__wrap___aeabi_dcmpgt=.time_critical.double_compare_gt"
        "Relocating Opus double arithmetic and sqrt to SRAM"
)
relocate_to_ram(
        src/rp2_common/pico_double/double_math.c.o
        ".text.__wrap_floor=.time_critical.double_floor@.text.__wrap_acos=.time_critical.double_acos"
        "Relocating Opus double floor and acos to SRAM"
)

# These strong RAM-resident definitions replace newlib's flash-backed memory
# operations. Prevent the compiler from lowering their loops back into recursive
# calls to the functions being defined.
set_source_files_properties(src/ram_mem.c PROPERTIES COMPILE_OPTIONS
        "-fno-builtin;-fno-tree-loop-distribute-patterns"
)

target_compile_options(ds5-bridge PRIVATE -fsigned-char)
target_compile_definitions(wdl_resampler PRIVATE
        WDL_RESAMPLE_TYPE=float
)
if(SYS_CLOCK_KHZ_VALUE GREATER 266000)
    set(PICO_FLASH_SPI_CLKDIV 4)
else()
    set(PICO_FLASH_SPI_CLKDIV 2)
endif()
if(TARGET bs2_default)
    target_compile_definitions(bs2_default PRIVATE
            PICO_FLASH_SPI_CLKDIV=${PICO_FLASH_SPI_CLKDIV}
    )
endif()
target_compile_definitions(ds5-bridge PRIVATE
        CYW43_LWIP=0
        PICO_EMBED_XIP_SETUP=1
        # BOOTSEL polling floats QSPI CSn briefly; flash_safe_execute() must
        # park core 1 while that happens.
        PICO_FLASH_ASSUME_CORE1_SAFE=0
        # Bound each CYW43/BTstack service pass so connection-event bursts
        # cannot starve TinyUSB, audio, BOOTSEL, or the watchdog.
        PICO_BTSTACK_CYW43_MAX_HCI_PROCESS_LOOP_COUNT=4
        # Put TinyUSB's RP2 IRQ path (handler, buffer start and completion) in
        # SRAM; every input-report completion otherwise ran from flash.
        PICO_RP2040_USB_FAST_IRQ=1
        # Forward panic, including allocation failure, directly to the bounded
        # reset path on either core instead of halting until the watchdog (or,
        # before it is armed, forever).
        PICO_PANIC_FUNCTION=ds5_runtime_panic
        PICO_PANIC_FUNCTION_DOES_NOT_RETURN=1
        WDL_RESAMPLE_TYPE=float
        CYW43_PIO_CLOCK_DIV_INT=${CYW43_PIO_CLOCK_DIV_VALUE}
        SYS_CLOCK_KHZ=${SYS_CLOCK_KHZ_VALUE}
        DS5_FIRMWARE_VERSION_MAJOR=${DS5_FIRMWARE_VERSION_MAJOR}
        DS5_FIRMWARE_VERSION_MINOR=${DS5_FIRMWARE_VERSION_MINOR}
        DS5_FIRMWARE_VERSION_PATCH=${DS5_FIRMWARE_VERSION_PATCH}
)
option(ENABLE_COMPANION "Enable the optional companion HID interface" OFF)
if(ENABLE_COMPANION)
    target_sources(ds5-bridge PRIVATE
            src/companion.cpp
            src/bootloader_maintenance.cpp
            src/bootloader_authorization_flash.cpp
            src/keyboard_tap_sequencer.cpp
            src/host_bridge.cpp
            src/usb_app_drivers.cpp
            src/wake_on_lan_domain.cpp
            src/wake_on_lan_engine.cpp
            src/wake_on_lan_store.cpp
    )
    target_compile_definitions(ds5-bridge PRIVATE
            ENABLE_COMPANION
    )
    # Bootloader authorization: HMAC-SHA256 on the RP2350 SHA block and a
    # flash-backed enrollment record.
    target_link_libraries(ds5-bridge pico_sha256 pico_flash hardware_flash)
endif()

# Diagnostics live in one place. Quick presets:
#   -DDS5_DIAGNOSTICS_PRESET=off    release default
#   -DDS5_DIAGNOSTICS_PRESET=audio  audio ring/stats reports
#   -DDS5_DIAGNOSTICS_PRESET=traces audio + trigger + feedback trace reports
#   -DDS5_DIAGNOSTICS_PRESET=all    traces + UART/BTstack logs
#   -DDS5_DIAGNOSTICS_PRESET=custom honor the legacy individual flags below
set(DS5_DIAGNOSTICS_PRESET "off" CACHE STRING "Diagnostics preset: off, audio, traces, all, custom")
set_property(CACHE DS5_DIAGNOSTICS_PRESET PROPERTY STRINGS off audio traces all custom)
option(ENABLE_DEBUG_LOGS "Enable UART stdio and verbose firmware/BTstack debug logging" OFF)
option(ENABLE_COMPANION_DEBUG "Legacy custom-mode alias for audio debug reports" OFF)
option(ENABLE_AUDIO_DEBUG_REPORTS "Legacy custom-mode companion HID audio debug ring/stats reports" OFF)
option(ENABLE_TRIGGER_TRACE_REPORTS "Legacy custom-mode companion HID adaptive trigger trace report" OFF)
option(ENABLE_FEEDBACK_TRACE_REPORTS "Legacy custom-mode companion HID rumble/haptics feedback trace report" OFF)

set(DS5_ENABLE_FIRMWARE_LOGS OFF)
set(DS5_ENABLE_AUDIO_DEBUG_REPORTS OFF)
set(DS5_ENABLE_TRIGGER_TRACE_REPORTS OFF)
set(DS5_ENABLE_FEEDBACK_TRACE_REPORTS OFF)

if(DS5_DIAGNOSTICS_PRESET STREQUAL "audio")
    set(DS5_ENABLE_AUDIO_DEBUG_REPORTS ON)
elseif(DS5_DIAGNOSTICS_PRESET STREQUAL "traces")
    set(DS5_ENABLE_AUDIO_DEBUG_REPORTS ON)
    set(DS5_ENABLE_TRIGGER_TRACE_REPORTS ON)
    set(DS5_ENABLE_FEEDBACK_TRACE_REPORTS ON)
elseif(DS5_DIAGNOSTICS_PRESET STREQUAL "all")
    set(DS5_ENABLE_FIRMWARE_LOGS ON)
    set(DS5_ENABLE_AUDIO_DEBUG_REPORTS ON)
    set(DS5_ENABLE_TRIGGER_TRACE_REPORTS ON)
    set(DS5_ENABLE_FEEDBACK_TRACE_REPORTS ON)
elseif(DS5_DIAGNOSTICS_PRESET STREQUAL "custom")
    set(DS5_ENABLE_FIRMWARE_LOGS ${ENABLE_DEBUG_LOGS})
    set(DS5_ENABLE_AUDIO_DEBUG_REPORTS ${ENABLE_AUDIO_DEBUG_REPORTS})
    set(DS5_ENABLE_TRIGGER_TRACE_REPORTS ${ENABLE_TRIGGER_TRACE_REPORTS})
    set(DS5_ENABLE_FEEDBACK_TRACE_REPORTS ${ENABLE_FEEDBACK_TRACE_REPORTS})
    if(ENABLE_COMPANION_DEBUG)
        set(DS5_ENABLE_AUDIO_DEBUG_REPORTS ON)
    endif()
elseif(NOT DS5_DIAGNOSTICS_PRESET STREQUAL "off")
    message(FATAL_ERROR "DS5_DIAGNOSTICS_PRESET must be one of: off, audio, traces, all, custom")
endif()

message(STATUS "DS5 diagnostics: preset=${DS5_DIAGNOSTICS_PRESET}; logs=${DS5_ENABLE_FIRMWARE_LOGS}; audio=${DS5_ENABLE_AUDIO_DEBUG_REPORTS}; trigger=${DS5_ENABLE_TRIGGER_TRACE_REPORTS}; feedback=${DS5_ENABLE_FEEDBACK_TRACE_REPORTS}")

if(DS5_ENABLE_FIRMWARE_LOGS)
    target_link_libraries(ds5-bridge hardware_dma)
    target_compile_definitions(ds5-bridge PRIVATE
            DS5_ENABLE_DEBUG_LOGS
            DS5_DEBUG_LOGS_ENABLED=1
            PICO_DEFAULT_UART_BAUD_RATE=921600
    )
else()
    # Release builds have no stdio sink. The CYW43 driver's CYW43_PRINTF sites
    # were the only printf callers; compiling them out drops the SDK printf
    # implementation and its float/double formatting helpers from flash.
    target_compile_definitions(ds5-bridge PRIVATE PICO_CYW43_LOGGING_ENABLED=0)
endif()

if(DS5_ENABLE_AUDIO_DEBUG_REPORTS)
    target_compile_definitions(ds5-bridge PRIVATE
            DS5_AUDIO_DEBUG_ENABLED=1
    )
endif()

if(DS5_ENABLE_TRIGGER_TRACE_REPORTS)
    target_compile_definitions(ds5-bridge PRIVATE
            DS5_TRIGGER_TRACE_ENABLED=1
    )
endif()

if(DS5_ENABLE_FEEDBACK_TRACE_REPORTS)
    target_compile_definitions(ds5-bridge PRIVATE
            DS5_FEEDBACK_TRACE_ENABLED=1
    )
endif()

# Core 0 previously ran on the SDK's unguarded 2 KiB scratch stack and could
# silently grow across both scratch banks toward the heap. Give it the final
# 7 KiB of the contiguous scratch banks with the ARMv8-M MSPLIM guard, so an
# overflow faults and resets through the watchdog instead of corrupting memory.
# Core 1 keeps its dedicated guarded audio stack in main RAM.
target_compile_definitions(ds5-bridge PRIVATE
        PICO_STACK_SIZE=7168
        PICO_CORE1_STACK_SIZE=0
        PICO_USE_STACK_GUARDS=1
)
pico_add_linker_script_override_path(ds5-bridge
        "${CMAKE_CURRENT_SOURCE_DIR}/cmake/linker/rp2350-core0-stack"
        FILES memory_scratch.incl section_extra_post_platform_end.incl
)

pico_set_program_name(ds5-bridge "ds5-bridge")
pico_set_program_version(ds5-bridge "${DS5_FIRMWARE_VERSION}")

if(DS5_ENABLE_FIRMWARE_LOGS)
    pico_enable_stdio_uart(ds5-bridge 1)
else()
    pico_enable_stdio_uart(ds5-bridge 0)
endif()
pico_enable_stdio_usb(ds5-bridge 0)

target_include_directories(${PROJECT_NAME} PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}/src
)

# Add any user requested libraries
target_link_libraries(ds5-bridge
        pico_stdlib
        pico_multicore
        hardware_watchdog
        hardware_timer
        pico_rand
        pico_btstack_classic
        pico_cyw43_arch_poll
        pico_btstack_cyw43
        tinyusb_device
        tinyusb_board
        wdl_resampler
        opus
)

# The exact-capacity audio queues use static storage. Codec and resampler
# startup still allocate 54,872 bytes; retain another 8 KiB after those known
# allocations so a successful link cannot become an OOM boot. The previous
# 79,120-byte figure included the SILK encoder state (20,408 bytes) and the
# 10 ms delay buffer (3,840 bytes) that OPUS_APPLICATION_RESTRICTED_CELT no
# longer reserves inside the encoder.
set(DS5_KNOWN_STARTUP_HEAP_BYTES 54872)
set(DS5_MIN_POST_STARTUP_HEAP_BYTES 8192)
math(EXPR DS5_MIN_RUNTIME_HEAP_BYTES
        "${DS5_KNOWN_STARTUP_HEAP_BYTES} + ${DS5_MIN_POST_STARTUP_HEAP_BYTES}"
)
add_custom_command(TARGET ds5-bridge POST_BUILD
        COMMAND ${CMAKE_COMMAND}
                "-DMAP=$<TARGET_FILE:ds5-bridge>.map"
                -P "${CMAKE_SOURCE_DIR}/cmake/verify_opus_sections.cmake"
        COMMAND ${CMAKE_COMMAND}
                "-DMAP=$<TARGET_FILE:ds5-bridge>.map"
                -P "${CMAKE_SOURCE_DIR}/cmake/verify_opus_strings.cmake"
        COMMAND ${CMAKE_COMMAND}
                "-DNM=${CMAKE_NM}"
                "-DELF=$<TARGET_FILE:ds5-bridge>"
                "-DCOMPANION_ENABLED=${ENABLE_COMPANION}"
                "-DMIN_HEAP_BYTES=${DS5_MIN_RUNTIME_HEAP_BYTES}"
                "-DKNOWN_STARTUP_HEAP_BYTES=${DS5_KNOWN_STARTUP_HEAP_BYTES}"
                -P "${CMAKE_SOURCE_DIR}/cmake/verify_core1_sram.cmake"
        COMMENT "Verifying complete firmware hot paths and runtime heap headroom"
        VERBATIM
)
set_property(TARGET ds5-bridge APPEND PROPERTY LINK_DEPENDS
        "${CMAKE_SOURCE_DIR}/cmake/verify_opus_sections.cmake"
        "${CMAKE_SOURCE_DIR}/cmake/opus_sections.cmake"
        "${CMAKE_SOURCE_DIR}/cmake/verify_opus_strings.cmake"
        "${CMAKE_SOURCE_DIR}/cmake/verify_core1_sram.cmake"
)

pico_add_extra_outputs(ds5-bridge)

