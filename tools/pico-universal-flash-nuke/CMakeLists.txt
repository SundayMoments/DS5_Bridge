cmake_minimum_required(VERSION 3.13)

include(${CMAKE_CURRENT_LIST_DIR}/../../pico_sdk_import.cmake)

project(ds5_bridge_pico_universal_flash_nuke C CXX ASM)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)

pico_sdk_init()

add_executable(flash_nuke
        nuke.c
        flash.c
)

target_link_libraries(flash_nuke
        pico_stdlib
        hardware_flash
)

# Dummy PICO_FLASH_SIZE_BYTES so flash_range_erase does not assert before the
# runtime JEDEC flash-size probe determines the real erase length.
target_compile_definitions(flash_nuke PRIVATE
        PICO_FLASH_SIZE_BYTES=33554432
)

# The nuke erases external flash, so it must always run from SRAM.
pico_set_binary_type(flash_nuke no_flash)

pico_add_extra_outputs(flash_nuke)
