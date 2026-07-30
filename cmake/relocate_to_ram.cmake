# Relocate selected function sections from one compiled object into the Pico
# SDK's .time_critical SRAM region. Adapted from awalol/DS5Dongle (MIT).

foreach(required_value OBJROOT OBJCOPY OBJDUMP SUFFIX RENAMES)
    if(NOT DEFINED ${required_value})
        message(FATAL_ERROR
                "relocate_to_ram: missing required -D${required_value}"
        )
    endif()
endforeach()

file(GLOB_RECURSE object_files "${OBJROOT}/*.o" "${OBJROOT}/*.obj")
string(REGEX REPLACE "\\.o(bj)?$" "" normalized_suffix "${SUFFIX}")
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
            "relocate_to_ram: no object matching '${SUFFIX}' under '${OBJROOT}'"
    )
endif()

execute_process(
        COMMAND "${OBJDUMP}" -h "${matching_object}"
        RESULT_VARIABLE objdump_result
        OUTPUT_VARIABLE section_table
        ERROR_VARIABLE objdump_error
)
if(NOT objdump_result EQUAL 0)
    message(FATAL_ERROR
            "relocate_to_ram: objdump failed (rc=${objdump_result}) on ${matching_object}: ${objdump_error}"
    )
endif()

string(REPLACE "@" ";" section_renames "${RENAMES}")
set(objcopy_arguments "")
foreach(section_rename ${section_renames})
    string(REPLACE "=" ";" rename_parts "${section_rename}")
    list(LENGTH rename_parts rename_part_count)
    if(NOT rename_part_count EQUAL 2)
        message(FATAL_ERROR
                "relocate_to_ram: invalid section rename '${section_rename}'"
        )
    endif()
    list(GET rename_parts 0 source_section)
    list(GET rename_parts 1 destination_section)
    string(FIND "${section_table}" " ${source_section} " source_section_index)
    string(FIND "${section_table}" " ${destination_section} " destination_section_index)
    if(NOT source_section_index EQUAL -1)
        list(APPEND objcopy_arguments --rename-section "${section_rename}")
    elseif(destination_section_index EQUAL -1)
        message(FATAL_ERROR
                "relocate_to_ram: '${matching_object}' contains neither '${source_section}' nor '${destination_section}'"
        )
    endif()
endforeach()

if(objcopy_arguments)
    execute_process(
            COMMAND "${OBJCOPY}" ${objcopy_arguments} "${matching_object}"
            RESULT_VARIABLE objcopy_result
            ERROR_VARIABLE objcopy_error
    )
    if(NOT objcopy_result EQUAL 0)
        message(FATAL_ERROR
                "relocate_to_ram: objcopy failed (rc=${objcopy_result}) on ${matching_object}: ${objcopy_error}"
        )
    endif()
endif()
