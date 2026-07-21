#include <exception>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

namespace {

std::string read_text(std::filesystem::path const &path) {
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        throw std::runtime_error("Unable to open " + path.string());
    }
    std::ostringstream stream;
    stream << input.rdbuf();
    return stream.str();
}

void require_contains(
    std::string const &source,
    std::string const &expected,
    std::string const &message
) {
    if (source.find(expected) == std::string::npos) {
        throw std::runtime_error(message + ": missing " + expected);
    }
}

void require_before(
    std::string const &source,
    std::string const &first,
    std::string const &second,
    std::string const &message
) {
    const std::size_t first_position = source.find(first);
    const std::size_t second_position = source.find(second);
    if (
        first_position == std::string::npos
        || second_position == std::string::npos
        || first_position >= second_position
    ) {
        throw std::runtime_error(
            message + ": expected " + first + " before " + second
        );
    }
}

}  // namespace

int main() {
    try {
        const std::filesystem::path root = DS5_SOURCE_ROOT;
        const std::string cmake = read_text(root / "CMakeLists.txt");
        const std::string main = read_text(root / "src" / "main.cpp");
        const std::string presets = read_text(root / "CMakePresets.json");
        const std::string utils = read_text(root / "src" / "utils.h");
        const std::string firmware_log =
            read_text(root / "src" / "firmware_log.cpp");
        const std::string companion =
            read_text(root / "src" / "companion.cpp");
        const std::string watchdog_telemetry =
            read_text(root / "src" / "watchdog_telemetry.cpp");

        require_contains(
            cmake,
            "PICO_DEFAULT_UART_BAUD_RATE=921600",
            "Diagnostic UART firmware must match the persistent host collector"
        );
        require_contains(
            cmake,
            "PICO_STACK_SIZE=4096",
            "Diagnostic logging must retain the larger firmware stack"
        );
        require_contains(
            main,
            "#if DS5_DEBUG_LOGS_ENABLED",
            "The debug build must override TinyUSB's board-level UART default"
        );
        require_contains(
            main,
            "stdio_init_all();",
            "The debug build must reinitialize stdio at the configured UART baud"
        );
        require_before(
            main,
            "if (!audio_init())",
            "if (cyw43_arch_init())",
            "Core 1 flash safety must be ready before BTstack initializes its TLV bank"
        );
        require_contains(
            presets,
            "\"name\": \"pico2-w-debug-uart-companion-on\"",
            "The supported UART diagnostic configure/build preset must remain available"
        );
        require_contains(
            presets,
            "\"DS5_DIAGNOSTICS_PRESET\": \"custom\"",
            "The UART preset must use explicit diagnostic switches"
        );
        require_contains(
            presets,
            "\"ENABLE_COMPANION\": \"ON\"",
            "The UART preset must preserve companion support"
        );
        require_contains(
            presets,
            "\"ENABLE_DEBUG_LOGS\": \"ON\"",
            "The UART preset must compile firmware logging in"
        );
        require_contains(
            presets,
            "\"ENABLE_FEEDBACK_TRACE_REPORTS\": \"ON\"",
            "The UART preset must compile rumble and haptics tracing in"
        );
        require_contains(
            presets,
            "\"WAVESHARE_RP2350B_PLUS_W_BUILD\": \"OFF\"",
            "The UART preset must explicitly target the Pico 2 W"
        );
        require_contains(
            cmake,
            "src/firmware_log.cpp",
            "The retained firmware logger must be linked"
        );
        require_contains(
            utils,
            "firmware_log_printf(__VA_ARGS__)",
            "Firmware logs must append to the nonblocking retained logger"
        );
        require_contains(
            utils,
            "firmware_log_hexdump((data), (size))",
            "Firmware hexdumps must avoid direct UART writes"
        );
        require_contains(
            firmware_log,
            "constexpr uint32_t kFirmwareLogRingSize = 8u * 1024u;",
            "The retained log ring must preserve Kitsune Input's RAM-safe size"
        );
        require_contains(
            firmware_log,
            "while (written < copied && uart_is_writable(uart_default))",
            "UART draining must be bounded by currently writable FIFO space"
        );
        require_contains(
            firmware_log,
            "hci_dump_enable_packet_log(false);",
            "The BTstack sink must exclude raw pairing packets"
        );
        require_contains(
            main,
            "firmware_log_flush_live();",
            "The main loop must service the nonblocking UART drain"
        );
        require_contains(
            companion,
            "void feedback_trace_uart_loop()",
            "Feedback diagnostics must expose a main-loop UART consumer"
        );
        require_contains(
            companion,
            "event = feedback_trace_ring[ring_index];",
            "The UART consumer must copy trace data before formatting it"
        );
        require_contains(
            companion,
            "feedback_trace_uart_loop();",
            "The companion main loop must drain feedback diagnostics"
        );
        require_contains(
            companion,
            "\"[FB] lost=%lu\\n\"",
            "Feedback UART overruns must be visible in the persistent log"
        );
        require_contains(
            cmake,
            "src/watchdog_telemetry.cpp",
            "Watchdog phase telemetry must be linked"
        );
        require_contains(
            main,
            "watchdog_telemetry_boot_capture();",
            "Prior watchdog phase must be captured before watchdog enable"
        );
        require_contains(
            main,
            "watchdog_telemetry_note_phase(phase_id);",
            "Every guarded main-loop phase must publish a retained breadcrumb"
        );
        require_contains(
            main,
            "WatchdogMainLoopPhase::Cyw43",
            "The Bluetooth poll phase must be identifiable after a reset"
        );
        require_contains(
            main,
            "[Watchdog] retained phase=%s(%u) valid=%u",
            "The next boot must print the retained watchdog breadcrumb"
        );
        require_contains(
            watchdog_telemetry,
            "watchdog_hw->scratch[0] = 0;",
            "Watchdog telemetry must invalidate scratch before updating it"
        );
        require_contains(
            watchdog_telemetry,
            "kScratchSignature | scratch_crc(word1, word2, word3);",
            "Watchdog telemetry must publish a checksummed commit marker last"
        );

        std::cout << "Diagnostics configuration checks passed.\n";
        return 0;
    } catch (std::exception const &error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
