# Relocate selected function sections from one compiled object into the Pico
# SDK's .time_critical SRAM region. Adapted from awalol/DS5Dongle (MIT).

foreach(required_value OBJROOT OBJCOPY SUFFIX RENAMES)
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

string(REPLACE "@" ";" section_renames "${RENAMES}")
set(objcopy_arguments "")
foreach(section_rename ${section_renames})
    list(APPEND objcopy_arguments --rename-section "${section_rename}")
endforeach()

execute_process(
        COMMAND "${OBJCOPY}" ${objcopy_arguments} "${matching_object}"
        RESULT_VARIABLE result
)
if(NOT result EQUAL 0)
    message(FATAL_ERROR
            "relocate_to_ram: objcopy failed (rc=${result}) on ${matching_object}"
    )
endif()
