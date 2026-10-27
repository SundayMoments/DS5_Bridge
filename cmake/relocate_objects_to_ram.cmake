# Relocate every remaining function section of whole compiled objects into the
# Pico SDK's .time_critical SRAM region, keeping each section's name. For
# objects whose code runs during steady-state play. SUFFIXES separates objects
# with "@". Each object must end with no .text section, so a missing object, a
# renamed object or a failed rename stops the build instead of silently
# leaving code in flash.

foreach(required_value OBJROOT OBJCOPY OBJDUMP SUFFIXES)
    if(NOT DEFINED ${required_value})
        message(FATAL_ERROR
                "relocate_objects_to_ram: missing required -D${required_value}"
        )
    endif()
endforeach()

file(GLOB_RECURSE object_files "${OBJROOT}/*.o" "${OBJROOT}/*.obj")
string(REPLACE "@" ";" suffixes "${SUFFIXES}")

function(read_section_table object result)
    execute_process(
            COMMAND "${OBJDUMP}" -h "${object}"
            RESULT_VARIABLE objdump_result
            OUTPUT_VARIABLE section_table
            ERROR_VARIABLE objdump_error
    )
    if(NOT objdump_result EQUAL 0)
        message(FATAL_ERROR
                "relocate_objects_to_ram: objdump failed (rc=${objdump_result}) on ${object}: ${objdump_error}"
        )
    endif()
    set(${result} "${section_table}" PARENT_SCOPE)
endfunction()

# objdump -h lists each section as "<index> <name> <size> ...".
function(text_sections section_table result)
    string(REGEX MATCHALL "\n *[0-9]+ \\.text[^ \t\r\n]*" matches "${section_table}")
    set(names "")
    foreach(match ${matches})
        string(REGEX REPLACE "^\n *[0-9]+ " "" name "${match}")
        list(APPEND names "${name}")
    endforeach()
    set(${result} "${names}" PARENT_SCOPE)
endfunction()

foreach(suffix ${suffixes})
    string(REGEX REPLACE "\\.o(bj)?$" "" normalized_suffix "${suffix}")
    string(LENGTH "${normalized_suffix}" suffix_length)
    set(matching_object "")
    foreach(object_file ${object_files})
        string(REGEX REPLACE "\\.o(bj)?$" "" normalized_object "${object_file}")
        string(LENGTH "${normalized_object}" object_length)
        if(NOT object_length LESS suffix_length)
            math(EXPR suffix_offset "${object_length} - ${suffix_length}")
            string(SUBSTRING "${normalized_object}" ${suffix_offset} -1 object_suffix)
            if(object_suffix STREQUAL "${normalized_suffix}")
                set(matching_object "${object_file}")
                break()
            endif()
        endif()
    endforeach()
    if(NOT matching_object)
        message(FATAL_ERROR
                "relocate_objects_to_ram: no object matching '${suffix}' under '${OBJROOT}'"
        )
    endif()

    read_section_table("${matching_object}" section_table)
    text_sections("${section_table}" sections)
    if(NOT sections)
        # Relocated by an earlier link of the same object.
        string(FIND "${section_table}" " .time_critical" relocated_index)
        if(relocated_index EQUAL -1)
            message(FATAL_ERROR
                    "relocate_objects_to_ram: '${matching_object}' contains no code sections"
            )
        endif()
        continue()
    endif()

    # A response file keeps objects with hundreds of functions under the
    # Windows command-line limit. -p keeps the compile timestamp, so ninja
    # does not treat the rewritten object as stale and recompile it.
    set(renames "")
    foreach(section ${sections})
        string(SUBSTRING "${section}" 5 -1 section_tail)
        if(section_tail STREQUAL "")
            set(section_tail ".text")
        endif()
        string(APPEND renames "--rename-section ${section}=.time_critical${section_tail}\n")
    endforeach()
    set(response_file "${matching_object}.sram-renames")
    file(WRITE "${response_file}" "${renames}")
    execute_process(
            COMMAND "${OBJCOPY}" -p "@${response_file}" "${matching_object}"
            RESULT_VARIABLE objcopy_result
            ERROR_VARIABLE objcopy_error
    )
    if(NOT objcopy_result EQUAL 0)
        message(FATAL_ERROR
                "relocate_objects_to_ram: objcopy failed (rc=${objcopy_result}) on ${matching_object}: ${objcopy_error}"
        )
    endif()

    read_section_table("${matching_object}" section_table)
    text_sections("${section_table}" remaining)
    if(remaining)
        message(FATAL_ERROR
                "relocate_objects_to_ram: '${matching_object}' still has flash code: ${remaining}"
        )
    endif()
endforeach()
