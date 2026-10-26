# Strings are deliberately separate from the live codec tables checked by the
# SRAM guard. Inspect the final map, not just the input archive section names.
if(NOT DEFINED MAP OR NOT EXISTS "${MAP}")
    message(FATAL_ERROR "verify_opus_strings: missing linker map")
endif()
file(READ "${MAP}" map_text)
if(map_text MATCHES "[.]time_critical[.]opus_strings")
    message(FATAL_ERROR "Legacy Opus diagnostic strings still occupy SRAM")
endif()
string(REGEX MATCHALL
        "[.]rodata[.]opus_strings[^ \t\r\n]*[ \t\r\n]+0x[0-9a-fA-F]+[ \t]+0x[0-9a-fA-F]+"
        string_sections "${map_text}")
set(linked_string_sections 0)
foreach(section IN LISTS string_sections)
    string(REGEX MATCH "0x([0-9a-fA-F]+)[ \t]+0x([0-9a-fA-F]+)$" bounds "${section}")
    math(EXPR address "0x${CMAKE_MATCH_1}")
    math(EXPR bytes "0x${CMAKE_MATCH_2}")
    if(address EQUAL 0)
        continue() # Discarded input sections.
    endif()
    math(EXPR end_address "${address} + ${bytes}")
    if(address LESS 0x10000000 OR end_address GREATER 0x11000000)
        message(FATAL_ERROR "Opus diagnostic strings linked outside flash: ${section}")
    endif()
    # Merged strings can have zero remaining size but still receive a flash
    # address in the output section. Check that placement as well.
    math(EXPR linked_string_sections "${linked_string_sections} + 1")
endforeach()
# cmake/opus_fatal_override.h discards hardening message strings before they
# are emitted, so a production link normally retains none. Any that survive
# (for example a future opus_strerror caller) must still be flash-resident.
if(linked_string_sections EQUAL 0)
    message(STATUS "Verified Opus placement: no diagnostic string sections retained in the link")
else()
    message(STATUS "Verified ${linked_string_sections} Opus diagnostic string sections mapped to flash")
endif()
