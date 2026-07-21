# Verify the linked release keeps the complete steady-state core-1 audio chain
# in RP2350 SRAM. This catches section-name/toolchain drift that would silently
# undo the DS5Dongle-style BOOTSEL lockout assumptions.

foreach(required_value NM ELF)
    if(NOT DEFINED ${required_value})
        message(FATAL_ERROR
                "verify_core1_sram: missing required -D${required_value}"
        )
    endif()
endforeach()

execute_process(
        COMMAND "${NM}" --format=posix "${ELF}"
        RESULT_VARIABLE result
        OUTPUT_VARIABLE symbol_table
        ERROR_VARIABLE symbol_error
)
if(NOT result EQUAL 0)
    message(FATAL_ERROR
            "verify_core1_sram: nm failed (rc=${result}): ${symbol_error}"
    )
endif()

set(required_sram_symbols
        "_ZL11core1_entryv"
        "_ZN13WDL_Resampler15ResamplePrepareEiiPPf"
        "_ZN13WDL_Resampler11ResampleOutEPfiii"
        "opus_encode_float"
        "opus_decode"
        "queue_try_add"
        "queue_try_remove"
        "memcpy"
        "memset"
        "memmove"
)

# RP2350 SRAM spans [0x20000000, 0x20082000).
set(rp2350_sram_start 536870912)
set(rp2350_sram_end 537403392)

foreach(symbol ${required_sram_symbols})
    string(REGEX MATCH
            "(^|\n)${symbol} [A-Za-z] ([0-9A-Fa-f]+)"
            symbol_match
            "${symbol_table}"
    )
    if(NOT symbol_match)
        message(FATAL_ERROR
                "verify_core1_sram: missing linked symbol '${symbol}'"
        )
    endif()

    set(symbol_address "0x${CMAKE_MATCH_2}")
    math(EXPR symbol_address_decimal "${symbol_address}")
    if(
        symbol_address_decimal LESS ${rp2350_sram_start}
        OR NOT symbol_address_decimal LESS ${rp2350_sram_end}
    )
        message(FATAL_ERROR
                "verify_core1_sram: '${symbol}' linked outside SRAM at ${symbol_address}"
        )
    endif()
endforeach()

message(STATUS "Verified core-1 audio execution chain is SRAM-resident")
