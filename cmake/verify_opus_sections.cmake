# Check every retained Opus archive contribution, not a small symbol allowlist.
# Diagnostics may live in flash; codec instructions, tables and state may not.
if(NOT DEFINED MAP OR NOT EXISTS "${MAP}")
    message(FATAL_ERROR "verify_opus_sections: missing linker map")
endif()
include("${CMAKE_CURRENT_LIST_DIR}/opus_sections.cmake")
file(READ "${MAP}" map_text)
string(REGEX MATCHALL
    "(^|\n)[ \t]+[.][^ \t\r\n]+[ \t\r\n]+0x[0-9a-fA-F]+[ \t]+0x[0-9a-fA-F]+[ \t]+[^\r\n]*libopus[.]a\\([^\r\n]+\\)"
    contributions "${map_text}")
set(code_sections 0)
set(table_sections 0)
set(string_sections 0)
foreach(contribution IN LISTS contributions)
    string(REGEX MATCH
        "[ \t]+([.][^ \t\r\n]+)[ \t\r\n]+0x([0-9a-fA-F]+)[ \t]+0x([0-9a-fA-F]+)"
        bounds "${contribution}")
    set(section "${CMAKE_MATCH_1}")
    math(EXPR address "0x${CMAKE_MATCH_2}")
    math(EXPR bytes "0x${CMAKE_MATCH_3}")
    if(address EQUAL 0)
        continue() # Discarded sections and the start of debug metadata.
    endif()
    # Debug input sections receive offsets within their non-allocated output
    # sections, so later archive members can have nonzero map addresses.
    if(section MATCHES "^[.](debug_|zdebug_|comment($|[.])|ARM[.]attributes($|[.]))" AND address LESS 0x10000000)
        continue()
    endif()
    math(EXPR end_address "${address} + ${bytes}")
    ds5_opus_section_destination("${section}" destination kind)
    if(kind STREQUAL "strings" OR kind STREQUAL "unwind")
        if(address LESS 0x10000000 OR end_address GREATER 0x11000000)
            message(FATAL_ERROR "Opus ${kind} section outside flash: ${contribution}")
        endif()
        if(kind STREQUAL "strings")
            # A merged string section can have zero remaining size.
            math(EXPR string_sections "${string_sections} + 1")
        endif()
    elseif(kind STREQUAL "code" OR kind STREQUAL "tables" OR kind STREQUAL "state")
        if(address LESS 0x20000000 OR end_address GREATER 0x20082000)
            message(FATAL_ERROR "Opus ${kind} section outside SRAM: ${contribution}")
        endif()
        if(bytes GREATER 0)
            if(kind STREQUAL "code")
                math(EXPR code_sections "${code_sections} + 1")
            elseif(kind STREQUAL "tables")
                math(EXPR table_sections "${table_sections} + 1")
            endif()
        endif()
    else()
        message(FATAL_ERROR "Unclassified retained Opus section; review placement: ${contribution}")
    endif()
endforeach()
# Diagnostic strings are optional: the forced celt_fatal override discards them
# before compilation. Code and numerical tables must always be present in SRAM.
if(code_sections EQUAL 0 OR table_sections EQUAL 0)
    message(FATAL_ERROR "Missing retained Opus code or numerical tables; review map parsing and relocation")
endif()
message(STATUS "Verified Opus placement: ${code_sections} code and ${table_sections} numerical sections in SRAM, ${string_sections} diagnostic string sections in flash")
