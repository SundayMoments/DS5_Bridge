cmake_minimum_required(VERSION 3.20)

project(ds5_bridge_firmware_tests LANGUAGES CXX)

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

if(MSVC)
    target_compile_options(firmware_logic_tests PRIVATE /W4)
else()
    target_compile_options(firmware_logic_tests PRIVATE -Wall -Wextra -Wpedantic)
endif()

enable_testing()
add_test(NAME firmware_logic_tests COMMAND firmware_logic_tests)
add_test(NAME usb_descriptor_migration_test COMMAND usb_descriptor_migration_test)
add_test(NAME diagnostics_config_test COMMAND diagnostics_config_test)
