cmake_minimum_required(VERSION 3.20)

project(ds5_bridge_firmware_tests LANGUAGES C CXX)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(firmware_logic_tests
    firmware_logic_tests.cpp
    ../../src/dualsense_input_decoder.cpp
    ../../src/persona/host_persona.cpp
    ../../src/persona/dualsense_persona.cpp
    ../../src/persona/ds4_persona.cpp
    ../../src/persona/xusb360_persona.cpp
    ../../src/controller_output_policy.cpp
    ../../src/controller_output_rumble_state.cpp
    ../../src/controller_output_state.cpp
    ../../src/controller_packet_compositor.cpp
    ../../src/haptics_test_signal.cpp
    ../../src/kitsune_button_gesture.cpp
    ../../src/output_scheduler.cpp
)

target_include_directories(firmware_logic_tests PRIVATE
    ../../src
)

add_executable(usb_descriptor_migration_test
    usb_descriptor_migration_test.cpp
)

target_compile_definitions(usb_descriptor_migration_test PRIVATE
    DS5_SOURCE_ROOT="${CMAKE_CURRENT_LIST_DIR}/../.."
)

add_executable(diagnostics_config_test
    diagnostics_config_test.cpp
)

target_compile_definitions(diagnostics_config_test PRIVATE
    DS5_SOURCE_ROOT="${CMAKE_CURRENT_LIST_DIR}/../.."
)

# The production SRAM memory operations, compiled under renamed symbols so
# they can be compared with the host C library.
add_library(ds5_ram_mem STATIC ../../src/ram_mem.c)
target_include_directories(ds5_ram_mem PRIVATE stubs/ram_mem)
target_compile_definitions(ds5_ram_mem PRIVATE
    memcpy=ds5_ram_memcpy
    memset=ds5_ram_memset
    memmove=ds5_ram_memmove
)
add_executable(ram_mem_test ram_mem_test.cpp)
target_link_libraries(ram_mem_test PRIVATE ds5_ram_mem)

add_executable(bt_output_send_dispatcher_test bt_output_send_dispatcher_test.cpp)
target_include_directories(bt_output_send_dispatcher_test PRIVATE ../../src)
add_executable(bounded_containers_test bounded_containers_test.cpp)
target_include_directories(bounded_containers_test PRIVATE ../../src)
add_executable(trigger_motor_power_test trigger_motor_power_test.cpp)
target_include_directories(trigger_motor_power_test PRIVATE ../../src)
add_executable(home_chord_gate_test home_chord_gate_test.cpp)
target_include_directories(home_chord_gate_test PRIVATE ../../src)
add_executable(controller_input_handoff_test
    controller_input_handoff_test.cpp
    ../../src/dualsense_input_decoder.cpp
    ../../src/persona/dualsense_persona.cpp
)
target_include_directories(controller_input_handoff_test PRIVATE ../../src)
add_executable(keyboard_tap_sequencer_test
    keyboard_tap_sequencer_test.cpp
    ../../src/keyboard_tap_sequencer.cpp
)
target_include_directories(keyboard_tap_sequencer_test PRIVATE ../../src)
add_executable(bootloader_maintenance_test
    bootloader_maintenance_test.cpp
    ../../src/bootloader_maintenance.cpp
)
target_include_directories(bootloader_maintenance_test PRIVATE ../../src)
add_executable(wake_on_lan_test
    wake_on_lan_test.cpp
    ../../src/wake_on_lan_domain.cpp
    ../../src/wake_on_lan_engine.cpp
    ../../src/wake_on_lan_store.cpp
)
target_include_directories(wake_on_lan_test PRIVATE ../../src)
target_compile_definitions(wake_on_lan_test PRIVATE
    DS5_WOL_FIXTURES="${CMAKE_CURRENT_LIST_DIR}/fixtures")
# The exact Wake-on-LAN fragments compiled into the generated CYW43 copies.
add_executable(cyw43_wol_guards_test cyw43_wol_guards_test.c)
add_executable(cyw43_wol_join_test cyw43_wol_join_test.c)

# The exact CYW43 transport fragments compiled into the generated SDK copies,
# exercised against modeled ring, window and receive-loop behavior.
add_executable(cyw43_rx_packet_read_test cyw43_rx_packet_read_test.c)
target_include_directories(cyw43_rx_packet_read_test PRIVATE stubs/cyw43)
add_executable(cyw43_tx_window_write_test cyw43_tx_window_write_test.c)
add_executable(cyw43_hci_receive_continuation_test cyw43_hci_receive_continuation_test.c)
target_compile_definitions(cyw43_hci_receive_continuation_test PRIVATE
    PICO_BTSTACK_CYW43_MAX_HCI_PROCESS_LOOP_COUNT=2)
add_executable(cyw43_hci_receive_unlimited_test cyw43_hci_receive_continuation_test.c)

if(MSVC)
    target_compile_options(firmware_logic_tests PRIVATE /W4)
else()
    target_compile_options(firmware_logic_tests PRIVATE -Wall -Wextra -Wpedantic)
endif()

enable_testing()
add_test(NAME firmware_logic_tests COMMAND firmware_logic_tests)
add_test(NAME usb_descriptor_migration_test COMMAND usb_descriptor_migration_test)
add_test(NAME diagnostics_config_test COMMAND diagnostics_config_test)
add_test(NAME ram_mem_test COMMAND ram_mem_test)
add_test(NAME bt_output_send_dispatcher_test COMMAND bt_output_send_dispatcher_test)
add_test(NAME bounded_containers_test COMMAND bounded_containers_test)
add_test(NAME trigger_motor_power_test COMMAND trigger_motor_power_test)
add_test(NAME home_chord_gate_test COMMAND home_chord_gate_test)
add_test(NAME controller_input_handoff_test COMMAND controller_input_handoff_test)
add_test(NAME keyboard_tap_sequencer_test COMMAND keyboard_tap_sequencer_test)
add_test(NAME bootloader_maintenance_test COMMAND bootloader_maintenance_test)
add_test(NAME wake_on_lan_test COMMAND wake_on_lan_test)
add_test(NAME cyw43_wol_guards_test COMMAND cyw43_wol_guards_test)
add_test(NAME cyw43_wol_inline_join_events_test COMMAND cyw43_wol_join_test events)
add_test(NAME cyw43_wol_reused_event_buffer_test COMMAND cyw43_wol_join_test mask)
# The generated SDK copies need the pinned Pico SDK; skipped without it.
set(DS5_TEST_PICO_SDK_PATH "$ENV{PICO_SDK_PATH}" CACHE PATH "Pinned Pico SDK for the CYW43 patch contract")
if(DS5_TEST_PICO_SDK_PATH AND EXISTS "${DS5_TEST_PICO_SDK_PATH}/lib/cyw43-driver/src/cyw43_ctrl.c")
    add_test(NAME cyw43_wol_patch_contract COMMAND ${CMAKE_COMMAND}
        -DSDK_PATH=${DS5_TEST_PICO_SDK_PATH}
        -DOUTPUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/cyw43-wol-patch-contract
        -DSOURCE_DIR=${CMAKE_CURRENT_LIST_DIR}/../../src
        -P ${CMAKE_CURRENT_LIST_DIR}/cyw43_wol_patch_contract.cmake)
else()
    message(STATUS "PICO_SDK_PATH not set; skipping cyw43_wol_patch_contract")
endif()
add_test(NAME cyw43_rx_packet_read_test COMMAND cyw43_rx_packet_read_test)
add_test(NAME cyw43_tx_window_write_test COMMAND cyw43_tx_window_write_test)
add_test(NAME cyw43_hci_receive_continuation_test COMMAND cyw43_hci_receive_continuation_test)
add_test(NAME cyw43_hci_receive_unlimited_test COMMAND cyw43_hci_receive_unlimited_test)
add_test(NAME opus_section_placement_test COMMAND ${CMAKE_COMMAND}
    -DOUTPUT_DIR=${CMAKE_CURRENT_BINARY_DIR}/opus-section-placement-test
    -P ${CMAKE_CURRENT_LIST_DIR}/opus_section_placement_test.cmake)
