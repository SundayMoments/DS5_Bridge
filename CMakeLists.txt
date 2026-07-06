# Generated Cmake Pico project file

cmake_minimum_required(VERSION 3.13)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Initialise pico_sdk from installed location
# (note this can come from environment, CMake cache etc)

# == DO NOT EDIT THE FOLLOWING LINES for the Raspberry Pi Pico VS Code Extension to work ==
if (WIN32)
    set(USERHOME $ENV{USERPROFILE})
else ()
    set(USERHOME $ENV{HOME})
endif ()
set(sdkVersion 2.2.0)
set(toolchainVersion 14_2_Rel1)
set(picotoolVersion 2.2.0-a4)
set(picoVscode ${USERHOME}/.pico-sdk/cmake/pico-vscode.cmake)
if (EXISTS ${picoVscode})
    include(${picoVscode})
endif ()
# ====================================================================================
set(PICO_BOARD pico2_w CACHE STRING "Board type")
set(SYS_CLOCK_KHZ_VALUE 150000 CACHE STRING "RP2350 system clock in kHz")
set(CYW43_PIO_CLOCK_DIV_VALUE 2 CACHE STRING "CYW43 PIO clock divider")

# Pull in Raspberry Pi Pico SDK (must be before project)
include(pico_sdk_import.cmake)

project(ds5-bridge C CXX ASM)

# Initialise the Raspberry Pi Pico SDK
pico_sdk_init()

# Add executable. Default name is the project name, version 0.1

add_executable(ds5-bridge
        src/usb_descriptors.c
        src/main.cpp
        src/button_functions.cpp
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
        src/audio.cpp
        src/bt.cpp
)

# Cockos WDLResampler
add_library(wdl_resampler STATIC
        lib/WDL/WDL/resample.cpp
)
target_include_directories(wdl_resampler PUBLIC
        lib/WDL/WDL
)

# Opus
add_subdirectory(lib/opus)

# Relocate libopus into Pico SDK .time_critical sections so the host fallback
# encoder runs from SRAM instead of XIP flash.
add_custom_command(
        OUTPUT ${CMAKE_BINARY_DIR}/opus_ram_relocate.stamp
        COMMAND ${CMAKE_OBJCOPY}
                --rename-section .text=.time_critical.opus_text
                --rename-section .rodata=.time_critical.opus_rodata
                --rename-section .rodata.str1.4=.time_critical.opus_strings
                $<TARGET_FILE:opus>
        COMMAND ${CMAKE_COMMAND} -E touch ${CMAKE_BINARY_DIR}/opus_ram_relocate.stamp
        DEPENDS $<TARGET_FILE:opus>
        COMMENT "Relocating libopus to .time_critical.* sections"
        VERBATIM
)
add_custom_target(opus_ram_relocate ALL DEPENDS ${CMAKE_BINARY_DIR}/opus_ram_relocate.stamp)
add_dependencies(ds5-bridge opus_ram_relocate)

target_compile_options(wdl_resampler PRIVATE -fsigned-char -ffunction-sections)
add_custom_command(TARGET wdl_resampler POST_BUILD
        COMMAND ${CMAKE_OBJCOPY}
                --rename-section .text._ZN13WDL_Resampler11ResampleOutEPfiii=.time_critical.WDL_ResampleOut
                --rename-section .text._ZN13WDL_Resampler15ResamplePrepareEiiPPf=.time_critical.WDL_ResamplePrepare
                $<TARGET_FILE:wdl_resampler>
        COMMENT "Relocating WDL_Resampler hot path to .time_critical.*"
        VERBATIM
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
        WDL_RESAMPLE_TYPE=float
        CYW43_PIO_CLOCK_DIV_INT=${CYW43_PIO_CLOCK_DIV_VALUE}
        SYS_CLOCK_KHZ=${SYS_CLOCK_KHZ_VALUE}
)
# Kitsune Input intentionally enumerates as a stock DualSense only. Never turn
# this on: DualSense Edge USB identity/descriptors are not a supported persona.
option(ENABLE_DSE "Unsupported: do not enable DualSense Edge USB enumeration" OFF)
if(ENABLE_DSE)
    message(FATAL_ERROR "ENABLE_DSE is intentionally disabled. Kitsune Input must never enumerate as DualSense Edge.")
endif()

option(ENABLE_COMPANION "Enable the optional companion HID interface" OFF)
if(ENABLE_COMPANION)
    target_sources(ds5-bridge PRIVATE
            src/companion.cpp
            src/host_bridge.cpp
            src/usb_app_drivers.cpp
    )
    target_compile_definitions(ds5-bridge PRIVATE
            ENABLE_COMPANION
    )
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
    target_compile_definitions(ds5-bridge PRIVATE
            DS5_ENABLE_DEBUG_LOGS
            DS5_DEBUG_LOGS_ENABLED=1
    )
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

pico_set_program_name(ds5-bridge "ds5-bridge")
pico_set_program_version(ds5-bridge "1.6.2")

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
        pico_btstack_classic
        pico_cyw43_arch_poll
        pico_btstack_cyw43
        tinyusb_device
        tinyusb_board
        wdl_resampler
        opus
)

pico_add_extra_outputs(ds5-bridge)

