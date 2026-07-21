#include <cctype>
#include <cstdint>
#include <exception>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <regex>
#include <sstream>
#include <stdexcept>
#include <string>

namespace {

constexpr uint16_t kExpectedUsbDeviceRevision = 0x0153;
constexpr uint64_t kExpectedCompanionDescriptorHash = 0x4f0540e7fbbbddcbull;

std::string read_text(std::filesystem::path const &path) {
    std::ifstream input(path, std::ios::binary);
    if (!input) {
        throw std::runtime_error("Unable to open " + path.string());
    }
    std::ostringstream stream;
    stream << input.rdbuf();
    std::string text = stream.str();
    text = std::regex_replace(text, std::regex("\r\n?"), "\n");
    return text;
}

std::string extract_between(
    std::string const &source,
    std::string const &start_marker,
    std::string const &end_marker
) {
    const auto start = source.find(start_marker);
    if (start == std::string::npos) {
        throw std::runtime_error("Missing marker: " + start_marker);
    }
    const auto end = source.find(end_marker, start);
    if (end == std::string::npos) {
        throw std::runtime_error("Missing end marker after: " + start_marker);
    }
    return source.substr(start, end - start);
}

std::string remove_comments(std::string const &text) {
    std::string output;
    output.reserve(text.size());

    bool in_line_comment = false;
    bool in_block_comment = false;
    for (std::size_t index = 0; index < text.size(); ++index) {
        const char current = text[index];
        const char next = index + 1 < text.size() ? text[index + 1] : '\0';

        if (in_line_comment) {
            if (current == '\n') {
                in_line_comment = false;
                output.push_back(current);
            }
            continue;
        }

        if (in_block_comment) {
            if (current == '*' && next == '/') {
                in_block_comment = false;
                ++index;
            }
            continue;
        }

        if (current == '/' && next == '/') {
            in_line_comment = true;
            ++index;
            continue;
        }

        if (current == '/' && next == '*') {
            in_block_comment = true;
            ++index;
            continue;
        }

        output.push_back(current);
    }

    return output;
}

std::string normalize_for_hash(std::string text) {
    text = remove_comments(text);
    text = std::regex_replace(text, std::regex(R"(\.bcdDevice\s*=\s*0x[0-9A-Fa-f]+,\s*)"), "");
    text = std::regex_replace(text, std::regex(R"(\s+)"), " ");
    return text;
}

uint64_t fnv1a_64(std::string const &text) {
    uint64_t hash = 14695981039346656037ull;
    for (unsigned char byte : text) {
        hash ^= byte;
        hash *= 1099511628211ull;
    }
    return hash;
}

uint16_t parse_bcd_device(std::string const &source) {
    std::smatch match;
    if (!std::regex_search(source, match, std::regex(R"(\.bcdDevice\s*=\s*0x([0-9A-Fa-f]+),)"))) {
        throw std::runtime_error("Unable to find USB bcdDevice assignment");
    }
    return static_cast<uint16_t>(std::stoul(match[1].str(), nullptr, 16));
}

uint64_t companion_descriptor_hash(std::string const &source) {
    std::string material;
    material += extract_between(source, "static tusb_desc_device_t const desc_device", "\n};\nstatic tusb_desc_device_t desc_device_runtime");
    material += extract_between(source, "uint8_t descriptor_configuration[] = {", "\n};\n\n#ifdef ENABLE_COMPANION");
    material += extract_between(source, "uint8_t const desc_ms_os_20[]", "\n};\n\nTU_VERIFY_STATIC(sizeof(desc_ms_os_20)");
    material += extract_between(source, "char const *string_desc_arr[]", "\n};\n\nstatic uint16_t _desc_str");
    return fnv1a_64(normalize_for_hash(material));
}

void assert_xusb_descriptor_uses_endpoint_constants(std::string const &source) {
    const std::string block = extract_between(
        source,
        "static uint8_t const desc_xusb360_gamepad_interface[] = {",
        "\n};\nTU_VERIFY_STATIC(sizeof(desc_xusb360_gamepad_interface)"
    );

    if (block.find("0x11, 0x21, 0x00, 0x01") == std::string::npos) {
        throw std::runtime_error("XUSB class descriptor must use the 17-byte Xbox 360 interface shape");
    }

    if (block.find("0x01, 0x25, XUSB360_EP_IN, 0x14") == std::string::npos) {
        throw std::runtime_error("XUSB class descriptor must advertise XUSB360_EP_IN");
    }

    if (block.find("0x13, XUSB360_EP_OUT, 0x08, 0x00, 0x00") == std::string::npos) {
        throw std::runtime_error("XUSB class descriptor must advertise XUSB360_EP_OUT");
    }
}

void assert_persona_support_requires_verified_descriptors(
    std::string const &usb_descriptors,
    std::filesystem::path const &source_root
) {
    const auto host_persona_h = read_text(source_root / "src" / "persona" / "host_persona.h");
    const auto host_persona_cpp = read_text(source_root / "src" / "persona" / "host_persona.cpp");

    if (host_persona_h.find("bool host_persona_descriptors_verified(HostPersonaMode mode);") == std::string::npos) {
        throw std::runtime_error("Host persona support must expose the descriptor verification gate");
    }

    const std::string support_block = extract_between(
        host_persona_cpp,
        "extern \"C\" bool host_persona_is_supported(HostPersonaMode mode) {",
        "\n}\n\nextern \"C\" bool host_persona_is_native_hid"
    );
    if (support_block.find("return host_persona_descriptors_verified(mode);") == std::string::npos) {
        throw std::runtime_error("Host personas must not be supported unless their descriptors match the manifest");
    }

    const std::string encode_block = extract_between(
        host_persona_cpp,
        "bool host_persona_encode_input(",
        "\n}\n\nbool host_persona_decode_output_to_ds5_payload"
    );
    if (encode_block.find("if (!host_persona_is_supported(mode))") == std::string::npos) {
        throw std::runtime_error("Host persona input reports must be blocked for unverified descriptors");
    }

    const std::string decode_block = extract_between(
        host_persona_cpp,
        "bool host_persona_decode_output_to_ds5_payload(",
        "\n}\n"
    );
    if (decode_block.find("if (!host_persona_is_supported(mode))") == std::string::npos) {
        throw std::runtime_error("Host persona output decoding must be blocked for unverified descriptors");
    }

    if (
        usb_descriptors.find("#define DUALSENSE_HID_REPORT_DESC_FNV1A32 0x98EE8A4Au") == std::string::npos
        || usb_descriptors.find("#define DS4_HID_REPORT_DESC_FNV1A32 0x9316A41Du") == std::string::npos
        || usb_descriptors.find("#define XUSB360_INTERFACE_DESC_FNV1A32 0x824C084Au") == std::string::npos
        || usb_descriptors.find("#define XUSB360_INTERFACE_DESC_FNV1A32 0xAAC10AD0u") == std::string::npos
        || usb_descriptors.find("bool host_persona_descriptors_verified(HostPersonaMode mode)") == std::string::npos
        || usb_descriptors.find("descriptor_matches_manifest(") == std::string::npos
    ) {
        throw std::runtime_error("USB persona descriptors must be pinned by length and fingerprint manifest");
    }

    if (
        usb_descriptors.find("case HostPersonaModeXusb360:") == std::string::npos
        || usb_descriptors.find("desc_xusb360_gamepad_interface") == std::string::npos
        || usb_descriptors.find("XUSB360_INTERFACE_DESC_FNV1A32") == std::string::npos
    ) {
        throw std::runtime_error("XUSB persona must be gated on its intended descriptor fingerprint");
    }
}

void assert_dse_identity_reports_do_not_use_edge_passthrough(std::filesystem::path const &source_root) {
    const auto bt_h = read_text(source_root / "src" / "bt.h");
    const auto main_cpp = read_text(source_root / "src" / "main.cpp");
    const auto dualsense_persona_cpp = read_text(source_root / "src" / "persona" / "dualsense_persona.cpp");
    const auto dualsense_persona_h = read_text(source_root / "src" / "persona" / "dualsense_persona.h");
    const std::string get_report_callback = extract_between(
        main_cpp,
        "uint16_t tud_hid_get_report_cb",
        "\n}\n\n// Invoked when received SET_REPORT"
    );

    if (
        bt_h.find("ControllerTypeDualSenseEdge = 2") == std::string::npos
        || main_cpp.find("dualsense_feature_report_may_use_bt_passthrough") == std::string::npos
        || main_cpp.find("report_id != 0x20 && report_id != 0x22") == std::string::npos
        || main_cpp.find("bt_controller_type() != ControllerTypeDualSenseEdge") == std::string::npos
        || get_report_callback.find("report_type != HID_REPORT_TYPE_FEATURE") == std::string::npos
        || get_report_callback.find("dualsense_feature_report_may_use_bt_passthrough(report_id)") == std::string::npos
        || get_report_callback.find("get_feature_data(report_id, reqlen)") == std::string::npos
        || get_report_callback.find("dualsense_persona_get_feature_report(report_id, buffer, reqlen)") == std::string::npos
        || dualsense_persona_h.find("dualsense_persona_get_feature_report") == std::string::npos
        || dualsense_persona_cpp.find("kDualSenseFeatureFirmwareInfo = 0x20") == std::string::npos
        || dualsense_persona_cpp.find("write_firmware_feature_report") == std::string::npos
        || dualsense_persona_cpp.find("kFirmwareVersion = 0x0110002a") == std::string::npos
    ) {
        throw std::runtime_error("DualSense identity feature reports must not leak DualSense Edge identity through BT passthrough");
    }
}

void assert_xusb_persona_strings_are_xbox_facing(std::string const &source) {
    if (source.find("#define XUSB360_VENDOR_ID 0x1209") == std::string::npos) {
        throw std::runtime_error("Xbox persona must expose a non-Sony composite-safe USB vendor ID");
    }

    if (source.find("#define XUSB360_PRODUCT_ID 0xDB05") == std::string::npos) {
        throw std::runtime_error("Xbox persona must expose a non-Sony composite-safe USB product ID");
    }

    if (source.find("#define XUSB360_USB_BCD_DEVICE 0x0156") == std::string::npos) {
        throw std::runtime_error("Xbox persona USB revision must be bumped for Windows descriptor cache separation");
    }

    if (source.find("#define XUSB360_STRING_MANUFACTURER \"Microsoft Corporation\"") == std::string::npos) {
        throw std::runtime_error("Xbox persona must expose an Xbox-facing manufacturer string");
    }

    if (source.find("#define XUSB360_STRING_PRODUCT \"Xbox 360 Controller for Windows\"") == std::string::npos) {
        throw std::runtime_error("Xbox persona must expose an Xbox-facing product string");
    }

    if (source.find("STRID_XUSB_GAMEPAD, // iInterface: Xbox 360 Controller for Windows") == std::string::npos) {
        throw std::runtime_error("Xbox persona game interface must expose an Xbox-facing interface string");
    }

    const std::string device_callback = extract_between(
        source,
        "uint8_t const *tud_descriptor_device_cb(void) {",
        "\n}\n\n//--------------------------------------------------------------------+\n// Configuration Descriptor"
    );
    if (
        device_callback.find("desc_device_runtime.idVendor = XUSB360_VENDOR_ID") == std::string::npos
        || device_callback.find("desc_device_runtime.idProduct = XUSB360_PRODUCT_ID") == std::string::npos
    ) {
        throw std::runtime_error("Xbox persona must override the runtime USB VID/PID");
    }

    const std::string string_helper = extract_between(
        source,
        "static char const *descriptor_string_for_index(uint8_t index) {",
        "\n}\n\n// Invoked when received GET STRING DESCRIPTOR request"
    );
    if (
        string_helper.find("index == STRID_MANUFACTURER && host_persona_active() == HostPersonaModeXusb360")
            == std::string::npos
        || string_helper.find("index == STRID_PRODUCT && host_persona_active() == HostPersonaModeXusb360")
            == std::string::npos
    ) {
        throw std::runtime_error("Xbox persona strings must only override manufacturer/product while Xbox mode is active");
    }
}

void assert_ds4_persona_identity_is_ds4_facing(std::string const &source) {
    if (source.find("#define DS4_VENDOR_ID 0x054C") == std::string::npos) {
        throw std::runtime_error("DS4 persona must expose Sony's DS4 USB vendor ID");
    }

    if (source.find("#define DS4_PRODUCT_ID 0x09CC") == std::string::npos) {
        throw std::runtime_error("DS4 persona must expose the DS4 v2 USB product ID");
    }

    if (source.find("#define DS4_USB_BCD_DEVICE 0x0102") == std::string::npos) {
        throw std::runtime_error("DS4 persona must expose the DS4 v2 USB device revision");
    }

    if (source.find("#define DS4_HID_REPORT_DESC_LEN 0x01FB") == std::string::npos) {
        throw std::runtime_error("DS4 v2 HID report descriptor length must match the public 507-byte descriptor");
    }

    if (source.find("#define DS4_STRING_PRODUCT \"Wireless Controller\"") == std::string::npos) {
        throw std::runtime_error("DS4 persona must expose the DS4-facing Wireless Controller product string");
    }

    if (source.find("#define DS4_HID_EP_INTERVAL 0x04") == std::string::npos) {
        throw std::runtime_error("DS4 persona must preserve the DS4-like HID endpoint interval");
    }

    if (source.find("TU_VERIFY_STATIC(sizeof(desc_hid_report_ds4) == DS4_HID_REPORT_DESC_LEN") == std::string::npos) {
        throw std::runtime_error("DS4 HID report descriptor length must be guarded");
    }

    const std::string ds4_report_descriptor = extract_between(
        source,
        "uint8_t const desc_hid_report_ds4[] = {",
        "\n};\nTU_VERIFY_STATIC(sizeof(desc_hid_report_ds4)"
    );
    if (ds4_report_descriptor.find("0x85, 0x01, 0x05, 0x01") != std::string::npos) {
        throw std::runtime_error("DS4 v2 HID report descriptor must not include non-stock Usage Page after Report ID 1");
    }

    const std::string device_callback = extract_between(
        source,
        "uint8_t const *tud_descriptor_device_cb(void) {",
        "\n}\n\n//--------------------------------------------------------------------+\n// Configuration Descriptor"
    );
    if (
        device_callback.find("host_persona_active() == HostPersonaModeDs4") == std::string::npos
        || device_callback.find("desc_device_runtime.idVendor = DS4_VENDOR_ID") == std::string::npos
        || device_callback.find("desc_device_runtime.idProduct = DS4_PRODUCT_ID") == std::string::npos
    ) {
        throw std::runtime_error("DS4 persona must override the runtime USB VID/PID");
    }

    const std::string report_callback = extract_between(
        source,
        "uint8_t const *tud_hid_descriptor_report_cb(uint8_t itf) {",
        "\n}\n\n//--------------------------------------------------------------------+\n// String Descriptors"
    );
    if (
        report_callback.find("host_persona_active() == HostPersonaModeDs4") == std::string::npos
        || report_callback.find("return desc_hid_report_ds4") == std::string::npos
    ) {
        throw std::runtime_error("DS4 persona must select the DS4 HID report descriptor");
    }
}

void assert_persona_switch_quiets_input_only(std::filesystem::path const &root) {
    const auto host_input_h = read_text(root / "src" / "host_input.h");
    const auto main_cpp = read_text(root / "src" / "main.cpp");
    const auto companion_cpp = read_text(root / "src" / "companion.cpp");
    const auto usb_cpp = read_text(root / "src" / "usb.cpp");

    if (
        host_input_h.find("void host_input_prepare_persona_switch();") == std::string::npos
        || host_input_h.find("void host_input_note_usb_mounted();") == std::string::npos
    ) {
        throw std::runtime_error("Persona switches must expose an input-only transition guard");
    }
    if (
        main_cpp.find("HOST_PERSONA_SWITCH_INPUT_FALLBACK_US") == std::string::npos
        || main_cpp.find("host_input_waiting_for_mount = true;") == std::string::npos
        || main_cpp.find("host_input_prepare_persona_switch()") == std::string::npos
        || main_cpp.find("host_input_note_usb_mounted()") == std::string::npos
        || main_cpp.find("host_input_send_report_for_persona(current_persona, neutral_state)") == std::string::npos
    ) {
        throw std::runtime_error("Persona switches must send a neutral report and quiet input until USB remount");
    }
    if (
        usb_cpp.find("#include \"host_input.h\"") == std::string::npos
        || usb_cpp.find("host_input_note_usb_mounted();") == std::string::npos
    ) {
        throw std::runtime_error("USB mount must release persona-switch input quieting");
    }

    const std::string command_block = extract_between(
        companion_cpp,
        "case CommandSetHostPersona:",
        "\n\n        case CommandSleepController:"
    );
    const auto guard_pos = command_block.find("host_input_prepare_persona_switch();");
    const auto set_pos = command_block.find("host_persona_set_active(next_persona)");
    const auto reconnect_pos = command_block.find("usb_request_reconnect();");
    if (
        guard_pos == std::string::npos
        || set_pos == std::string::npos
        || reconnect_pos == std::string::npos
        || guard_pos > set_pos
        || set_pos > reconnect_pos
    ) {
        throw std::runtime_error("Persona command order must be neutral-release, set persona, then reconnect");
    }

    const std::string interrupt_loop = extract_between(
        main_cpp,
        "void interrupt_loop() {",
        "\n}\n\nvoid on_bt_data"
    );
    if (interrupt_loop.find("host_input_quiet_active(now)") == std::string::npos) {
        throw std::runtime_error("Persona transition quieting must only silence input reports");
    }

    const std::string get_report_callback = extract_between(
        main_cpp,
        "uint16_t tud_hid_get_report_cb",
        "\n}\n\n// Invoked when received SET_REPORT"
    );
    const std::string set_report_callback = extract_between(
        main_cpp,
        "void tud_hid_set_report_cb",
        "\n}\n\nint main()"
    );
    if (
        get_report_callback.find("host_input_quiet") != std::string::npos
        || set_report_callback.find("host_input_quiet") != std::string::npos
    ) {
        throw std::runtime_error("Persona transition quieting must not block HID control callbacks");
    }

    if (
        get_report_callback.find("HostPersonaModeDs4") == std::string::npos
        || get_report_callback.find("HID_REPORT_TYPE_INPUT") == std::string::npos
        || get_report_callback.find("ds4_copy_input_report_payload") == std::string::npos
    ) {
        throw std::runtime_error("DS4 native probes must be able to GET_REPORT the current input report");
    }
}

void assert_usb_suspend_poweroff_is_debounced(std::filesystem::path const &root) {
    const auto bt_cpp = read_text(root / "src" / "bt.cpp");
    const auto usb_cpp = read_text(root / "src" / "usb.cpp");
    const auto usb_h = read_text(root / "src" / "usb.h");

    if (
        usb_cpp.find("#define USB_SUSPEND_POWEROFF_DEBOUNCE_US 3000000") == std::string::npos
        || usb_cpp.find("#define USB_RECONNECT_GRACE_US          5000000") == std::string::npos
    ) {
        throw std::runtime_error("USB suspend power-off must retain the hub debounce and reconnect grace windows");
    }

    const std::string suspend_callback = extract_between(
        usb_cpp,
        "extern \"C\" void tud_suspend_cb(bool remote_wakeup_en) {",
        "\n}\n\nextern \"C\" void tud_resume_cb(void) {"
    );
    if (
        suspend_callback.find("reconnect_grace_active(now)") == std::string::npos
        || suspend_callback.find("usb_suspend_at_us = now;") == std::string::npos
        || suspend_callback.find("bt_power_off_controller") != std::string::npos
    ) {
        throw std::runtime_error("USB suspend must arm a debounced power-off, not power off the controller immediately");
    }

    const std::string pm_poll = extract_between(
        usb_cpp,
        "void usb_pm_poll() {",
        "\n}\n\nstatic UsbAudioVolumeRange"
    );
    if (
        pm_poll.find("USB_SUSPEND_POWEROFF_DEBOUNCE_US") == std::string::npos
        || pm_poll.find("bt_power_off_controller();") == std::string::npos
        || pm_poll.find("usb_note_reconnect_disconnect(now);") == std::string::npos
        || pm_poll.find("if (usb_bus_suspended())") == std::string::npos
    ) {
        throw std::runtime_error("USB PM poll must commit debounced power-off and defer reconnect work while suspended");
    }

    const std::string disconnect_block = extract_between(
        usb_cpp,
        "void usb_handle_controller_transport_disconnect(bool expected_disconnect) {",
        "\n}\n\nvoid usb_handle_controller_transport_ready()"
    );
    if (
        disconnect_block.find("usb_controller_transport_ready = false;")
            == std::string::npos
        || disconnect_block.find("USB_EXPECTED_DISCONNECT_GRACE_US")
            == std::string::npos
        || disconnect_block.find("usb_controller_transport_transition_pending = true;")
            == std::string::npos
        || disconnect_block.find("tud_disconnect") != std::string::npos
        || disconnect_block.find("tusb_deinit") != std::string::npos
    ) {
        throw std::runtime_error(
            "Controller disconnect callbacks must only publish deferred USB desired state"
        );
    }

    const std::string ready_block = extract_between(
        usb_cpp,
        "void usb_handle_controller_transport_ready() {",
        "\n}\n\nextern \"C\" void tud_mount_cb(void) {"
    );
    if (
        ready_block.find("usb_controller_transport_ready = true;")
            == std::string::npos
        || ready_block.find("usb_controller_transport_transition_pending = true;")
            == std::string::npos
        || ready_block.find("tud_connect") != std::string::npos
        || ready_block.find("tusb_init") != std::string::npos
    ) {
        throw std::runtime_error(
            "Controller ready callbacks must defer every TinyUSB lifecycle mutation"
        );
    }

    const auto stack_init = usb_cpp.find("tusb_init(BOARD_TUD_RHPORT, &dev_init);");
    const auto initial_detach = usb_cpp.find("tud_disconnect();", stack_init);
    const auto initial_wait = usb_cpp.find("sleep_ms_with_watchdog(150);", stack_init);
    if (
        stack_init == std::string::npos
        || initial_detach == std::string::npos
        || initial_wait == std::string::npos
        || !(stack_init < initial_detach && initial_detach < initial_wait)
        || pm_poll.find("if (usb_controller_transport_transition_pending)")
            == std::string::npos
        || pm_poll.find("usb_controller_transport_disconnect_not_before_us")
            == std::string::npos
        || pm_poll.find("usb_connect_controller_transport(now);")
            == std::string::npos
        || pm_poll.find("usb_controller_transport_attached = false;")
            == std::string::npos
        || pm_poll.find("tud_disconnect();") == std::string::npos
        || usb_cpp.find("tusb_deinit") != std::string::npos
    ) {
        throw std::runtime_error(
            "USB PM poll must reconcile soft attach/detach without deinitializing TinyUSB"
        );
    }

    if (usb_h.find("bool usb_host_suspended_active();") == std::string::npos) {
        throw std::runtime_error("BT disconnect handling must be able to query suspended USB host state");
    }

    const std::string hci_disconnect = extract_between(
        bt_cpp,
        "case HCI_EVENT_DISCONNECTION_COMPLETE: {",
        "\n        }\n\n        case GAP_EVENT_RSSI_MEASUREMENT:"
    );
    const auto suspended_query = hci_disconnect.find("usb_host_suspended_active()");
    if (
        suspended_query == std::string::npos
        || hci_disconnect.find("keeping USB on bus") == std::string::npos
        || hci_disconnect.find("keeping Pico alive") == std::string::npos
        || hci_disconnect.find("watchdog_reboot") != std::string::npos
    ) {
        throw std::runtime_error(
            "Normal controller disconnects must keep the Pico alive, including while USB is suspended"
        );
    }
}

void assert_mute_keyboard_chord_starter_is_deferred(std::filesystem::path const &root) {
    const auto companion_cpp = read_text(root / "src" / "companion.cpp");

    if (
        companion_cpp.find("constexpr uint8_t kMuteKeyboardChordStarterFlag = 0x10;") == std::string::npos
        || companion_cpp.find("constexpr uint32_t kMuteKeyboardChordWindowUs = 250000;") == std::string::npos
    ) {
        throw std::runtime_error("Mute keyboard chord starter must use the reserved option bit and 250ms window");
    }

    const std::string helper_block = extract_between(
        companion_cpp,
        "bool mute_keyboard_chord_starter_enabled() {",
        "\n}\n\nvoid begin_mute_keyboard_chord_window"
    );
    if (
        helper_block.find("mute_button_mode == MuteButtonKeyboard") == std::string::npos
        || helper_block.find("mute_keyboard_modifiers & kMuteKeyboardChordStarterFlag") == std::string::npos
    ) {
        throw std::runtime_error("Mute keyboard chord starter must only be active for keyboard mode with the option bit");
    }

    const std::string starter_block = extract_between(
        companion_cpp,
        "case kChordStarterMute:",
        "\n        default:"
    );
    if (
        starter_block.find("mute_button_mode == MuteButtonChord") == std::string::npos
        || starter_block.find("mute_keyboard_chord_starter_enabled() && mute_keyboard_chord_pending") == std::string::npos
    ) {
        throw std::runtime_error("Mute starter must be accepted in chord mode or during the keyboard chord window");
    }

    const std::string dynamic_block = extract_between(
        companion_cpp,
        "DynamicChordProcessingResult process_dynamic_chord_bindings(uint8_t *report, uint16_t len) {",
        "\n}\n\nvoid apply_button_remap"
    );
    if (
        dynamic_block.find("DynamicChordProcessingResult result{};") == std::string::npos
        || dynamic_block.find("result.mute_chord_pressed = true;") == std::string::npos
        || dynamic_block.find("return result;") == std::string::npos
    ) {
        throw std::runtime_error("Dynamic chord processing must report when Mute consumed the pending keyboard action");
    }

    const std::string process_block = extract_between(
        companion_cpp,
        "void companion_process_controller_report(uint8_t *report, uint16_t len) {",
        "\n}\n\nvoid companion_update_controller_report"
    );
    const auto begin_pos = process_block.find("begin_mute_keyboard_chord_window(now);");
    const auto dynamic_pos = process_block.find("const DynamicChordProcessingResult dynamic_chord_result = process_dynamic_chord_bindings(report, len);");
    const auto mute_consumed_pos = process_block.find("dynamic_chord_result.mute_chord_pressed");
    const auto cancel_pos = process_block.find("cancel_mute_keyboard_chord_window();");
    const auto immediate_guard_pos = process_block.find("if (!mute_keyboard_chord_starter_enabled())");
    const auto immediate_queue_pos = process_block.find("queue_mute_keyboard_press(mute_keyboard_hold_enabled());", immediate_guard_pos);
    const auto release_commit_pos = process_block.find("commit_mute_keyboard_chord_window(false);");
    if (
        begin_pos == std::string::npos
        || dynamic_pos == std::string::npos
        || mute_consumed_pos == std::string::npos
        || cancel_pos == std::string::npos
        || immediate_guard_pos == std::string::npos
        || immediate_queue_pos == std::string::npos
        || release_commit_pos == std::string::npos
        || begin_pos > dynamic_pos
        || dynamic_pos > mute_consumed_pos
        || mute_consumed_pos > cancel_pos
        || immediate_guard_pos > immediate_queue_pos
    ) {
        throw std::runtime_error("Mute keyboard mode must defer only while waiting for an enabled chord starter");
    }

    const std::string loop_block = extract_between(
        companion_cpp,
        "void companion_loop() {",
        "\n}\n\nvoid companion_process_controller_report"
    );
    const auto window_loop = loop_block.find("mute_keyboard_chord_window_loop();");
    const auto keyboard_loop = loop_block.find("mute_keyboard_loop();");
    if (
        window_loop == std::string::npos
        || keyboard_loop == std::string::npos
        || keyboard_loop < window_loop
    ) {
        throw std::runtime_error("Mute chord window must be committed before keyboard reports are flushed");
    }
}

void assert_ps_chord_starter_is_deferred_to_protect_steam_big_picture(std::filesystem::path const &root) {
    const auto companion_cpp = read_text(root / "src" / "companion.cpp");

    if (companion_cpp.find("constexpr uint32_t kHomeChordSuppressUs = 250000;") == std::string::npos) {
        throw std::runtime_error("PS/Home chord starter must be swallowed for the full 250ms chord window");
    }
    if (companion_cpp.find("constexpr uint32_t kHomeChordFallbackReplayUs = 80000;") == std::string::npos) {
        throw std::runtime_error("Unconsumed PS/Home taps must replay as a host-visible 80ms press");
    }

    const std::string gate_enabled_block = extract_between(
        companion_cpp,
        "bool home_chord_gate_enabled() {",
        "\n}\n\nvoid clear_home_chord_gate"
    );
    if (
        gate_enabled_block.find("sleep_keybind_enabled || speaker_volume_shortcut_enabled") == std::string::npos
        || gate_enabled_block.find("dynamic_chord_bindings[i].starter == kChordStarterHome") == std::string::npos
    ) {
        throw std::runtime_error("PS/Home chord gate must activate when PS/Home can start a shortcut or chord");
    }

    const std::string gate_block = extract_between(
        companion_cpp,
        "void apply_home_chord_gate(uint8_t *report, uint16_t len, bool physical_home_pressed, bool home_chord_consumed) {",
        "\n}\n\nbool dpad_direction_has"
    );
    if (
        gate_block.find("if (home_chord_consumed)") == std::string::npos
        || gate_block.find("report[9] &= static_cast<uint8_t>(~kHomeButtonBit);") == std::string::npos
        || gate_block.find("home_chord_gate_until_us = now + kHomeChordSuppressUs;") == std::string::npos
        || gate_block.find("if (!time_us_reached(now, home_chord_gate_until_us))") == std::string::npos
        || gate_block.find("home_chord_replay_until_us = now + kHomeChordFallbackReplayUs;") == std::string::npos
        || gate_block.find("if (home_chord_replay_until_us != 0 && !time_us_reached(now, home_chord_replay_until_us))") == std::string::npos
    ) {
        throw std::runtime_error("PS/Home chord gate must mask PS/Home during the chord window and replay unconsumed taps by duration");
    }

    const std::string dynamic_block = extract_between(
        companion_cpp,
        "DynamicChordProcessingResult process_dynamic_chord_bindings(uint8_t *report, uint16_t len) {",
        "\n}\n\nvoid apply_button_remap"
    );
    if (
        dynamic_block.find("DynamicChordProcessingResult result{};") == std::string::npos
        || dynamic_block.find("result.home_chord_consumed = true;") == std::string::npos
        || dynamic_block.find("result.mute_chord_pressed = true;") == std::string::npos
    ) {
        throw std::runtime_error("Dynamic chord processing must report when PS/Home or Mute starters are consumed");
    }

    const std::string process_block = extract_between(
        companion_cpp,
        "void companion_process_controller_report(uint8_t *report, uint16_t len) {",
        "\n}\n\nvoid companion_update_controller_report"
    );
    const auto dynamic_pos = process_block.find("const DynamicChordProcessingResult dynamic_chord_result = process_dynamic_chord_bindings(report, len);");
    const auto shortcut_pos = process_block.find("const bool shortcut_home_chord_consumed = process_shortcut_bindings(report);");
    const auto consumed_pos = process_block.find("const bool home_chord_consumed = dynamic_chord_result.home_chord_consumed || shortcut_home_chord_consumed;");
    const auto gate_pos = process_block.find("apply_home_chord_gate(report, len, home_pressed, home_chord_consumed);");
    const auto dpad_guard_pos = process_block.find("if (home_pressed && dpad_pressed)");
    if (
        dynamic_pos == std::string::npos
        || shortcut_pos == std::string::npos
        || consumed_pos == std::string::npos
        || gate_pos == std::string::npos
        || dpad_guard_pos == std::string::npos
        || dynamic_pos > shortcut_pos
        || shortcut_pos > consumed_pos
        || consumed_pos > gate_pos
        || gate_pos > dpad_guard_pos
    ) {
        throw std::runtime_error("PS/Home chord gate must run after shortcut/chord consumption and before Home+Dpad suppression");
    }
}

void assert_mic_pass_through_defaults_to_enabled(std::filesystem::path const &root) {
    const auto audio_cpp = read_text(root / "src" / "audio.cpp");
    const auto companion_cpp = read_text(root / "src" / "companion.cpp");

    if (audio_cpp.find("static volatile bool duplex_requested = true;") == std::string::npos) {
        throw std::runtime_error("Pico mic pass-through must default on without requiring the companion app");
    }

    const std::string restore_defaults_block = extract_between(
        companion_cpp,
        "void restore_defaults() {",
        "\n}\n\nuint8_t controller_type()"
    );
    if (
        restore_defaults_block.find("audio_set_duplex_requested(true);") == std::string::npos
        || restore_defaults_block.find("companion_mic_enabled = true;") == std::string::npos
    ) {
        throw std::runtime_error("Restore Defaults must keep Pico mic pass-through enabled");
    }
}

void assert_bluetooth_pairing_and_reconnect_policy(std::filesystem::path const &root) {
    const auto bt_cpp = read_text(root / "src" / "bt.cpp");
    const auto bt_h = read_text(root / "src" / "bt.h");

    const std::string init_block = extract_between(
        bt_cpp,
        "int bt_init() {",
        "\n}\n\nstatic void hci_packet_handler"
    );
    if (
        init_block.find("gap_set_link_supervision_timeout(CLASSIC_LINK_SUPERVISION_TIMEOUT_SLOTS);")
            == std::string::npos
        || init_block.find("gap_ssp_set_auto_accept(false);") == std::string::npos
        || init_block.find("hci_set_master_slave_policy(HCI_ROLE_MASTER);") == std::string::npos
        || init_block.find("gap_register_classic_connection_filter(&classic_connection_filter);")
            == std::string::npos
    ) {
        throw std::runtime_error("Bluetooth init must install the Kitsune reconnect timing, role, and ACL admission policy");
    }

    const std::string working_block = extract_between(
        bt_cpp,
        "case BTSTACK_EVENT_STATE:",
        "\n        case HCI_EVENT_INQUIRY_RESULT:"
    );
    const auto page_activity = working_block.find("gap_set_page_scan_activity(0x0012, 0x0012);");
    const auto page_type = working_block.find("gap_set_page_scan_type(PAGE_SCAN_MODE_INTERLACED);");
    const auto pairing_recovery =
        working_block.find("recover_pairing_transaction_on_boot();");
    const auto stored_key = working_block.find("stored_link_key_present = bt_has_stored_link_key();");
    const auto passive_scan = working_block.find("restore_passive_reconnect_scan();");
    const auto first_pair = working_block.find("(void)bt_request_scan();");
    if (
        page_activity == std::string::npos
        || page_type == std::string::npos
        || pairing_recovery == std::string::npos
        || stored_key == std::string::npos
        || passive_scan == std::string::npos
        || first_pair == std::string::npos
        || page_activity > page_type
        || page_type > pairing_recovery
        || pairing_recovery > stored_key
    ) {
        throw std::runtime_error("Bluetooth page-scan tuning must be applied after HCI reset before passive reconnect or first pairing");
    }

    const std::string inquiry_block = extract_between(
        bt_cpp,
        "static void start_inquiry_if_needed() {",
        "\n}\n\nstatic void update_inquiry_led"
    );
    if (
        inquiry_block.find("!pairing_window_active") == std::string::npos
        || inquiry_block.find("gap_connectable_control(0);") == std::string::npos
        || inquiry_block.find("gap_discoverable_control(0);") == std::string::npos
        || inquiry_block.find("gap_set_bondable_mode(1);") == std::string::npos
        || inquiry_block.find("gap_inquiry_start(PAIRING_INQUIRY_LENGTH_UNITS)")
            == std::string::npos
    ) {
        throw std::runtime_error("Controller discovery must remain an explicit, outbound-only pairing window");
    }

    const std::string filter_block = extract_between(
        bt_cpp,
        "static bool classic_acl_connection_allowed",
        "\n}\n\nstatic int classic_connection_filter"
    );
    if (
        filter_block.find("gap_get_link_key_for_bd_addr") == std::string::npos
        || filter_block.find("Rejecting unknown controller") == std::string::npos
        || filter_block.find("Rejecting incoming page") == std::string::npos
    ) {
        throw std::runtime_error("Passive page scan must admit only a stored controller outside explicit pairing");
    }

    if (
        bt_cpp.find("#define PAIRING_WINDOW_US 30000000u") == std::string::npos
        || bt_cpp.find("#define PAIRING_INQUIRY_LENGTH_UNITS 24u") == std::string::npos
        || bt_cpp.find("#define CLASSIC_LINK_SUPERVISION_TIMEOUT_SLOTS 3200u") == std::string::npos
        || bt_cpp.find("HCI_SEND_CMD_LOGGED(&hci_accept_connection_request") != std::string::npos
        || bt_h.find("bool bt_request_scan();") == std::string::npos
    ) {
        throw std::runtime_error("Bluetooth pairing window, link-loss timing, or BTstack-owned incoming ACL policy regressed");
    }

    const std::string inquiry_loop = extract_between(
        bt_cpp,
        "void bt_inquiry_loop() {",
        "\n}\n\nint bt_init()"
    );
    const std::string connection_complete = extract_between(
        bt_cpp,
        "case HCI_EVENT_CONNECTION_COMPLETE: {",
        "\n        case HCI_EVENT_LINK_KEY_REQUEST:"
    );
    const std::string disconnect = extract_between(
        bt_cpp,
        "bool bt_disconnect_with_intent",
        "\n}\n\nbool bt_disconnect()"
    );
    const std::string explicit_pairing = extract_between(
        bt_cpp,
        "case GAP_EVENT_INQUIRY_COMPLETE:",
        "\n        case HCI_EVENT_COMMAND_STATUS:"
    );
    const auto transaction_stage =
        explicit_pairing.find("stage_pairing_transaction(");
    const auto prior_key_drop =
        explicit_pairing.find("gap_drop_link_key_for_bd_addr(current_device_addr);");
    const auto create_connection =
        explicit_pairing.find("&hci_create_connection");
    if (
        bt_cpp.find("static void service_acl_connection_cancel()") == std::string::npos
        || bt_cpp.find("hci_send_cmd(&hci_create_connection_cancel, current_device_addr)")
            == std::string::npos
        || bt_cpp.find("hci_event_inquiry_result_get_page_scan_repetition_mode(packet)")
            == std::string::npos
        || bt_cpp.find("hci_event_inquiry_result_with_rssi_get_clock_offset(packet)")
            == std::string::npos
        || bt_cpp.find("hci_event_extended_inquiry_response_get_clock_offset(packet)")
            == std::string::npos
        || bt_cpp.find("(current_device_clock_offset & 0x7FFFu) | 0x8000u")
            == std::string::npos
        || bt_cpp.find("current_device_page_scan_repetition_mode,\n                    0,\n                    valid_clock_offset")
            == std::string::npos
        || bt_cpp.find("#define BT_PAIRING_TRANSACTION_TLV_TAG 0x50545832u")
            == std::string::npos
        || bt_cpp.find("static bool recover_pairing_transaction_on_boot()")
            == std::string::npos
        || transaction_stage == std::string::npos
        || prior_key_drop == std::string::npos
        || create_connection == std::string::npos
        || !(transaction_stage < prior_key_drop && prior_key_drop < create_connection)
        || inquiry_loop.find("acl_connection_cancel_requested = true;") == std::string::npos
        || inquiry_loop.find("acl_disconnect_on_completion = true;") == std::string::npos
        || inquiry_loop.find("clear_acl_connection_pending();\n        fail_pending_connection_attempt();")
            != std::string::npos
        || connection_complete.find("if (acl_disconnect_on_completion)") == std::string::npos
        || connection_complete.find(
            "ACL completed after cancellation; disconnect before security setup"
        ) == std::string::npos
        || connection_complete.find(
            "restore_uncommitted_pairing_key(\"ACL connection failure\")"
        ) == std::string::npos
        || bt_cpp.find(
            "restore_uncommitted_pairing_key(\"ACL command rejection\")"
        ) == std::string::npos
        || bt_cpp.find(
            "\"disconnect before replacement key commit\""
        ) == std::string::npos
        || disconnect.find("connection_phase == BtConnectionPhase::Disconnecting")
            == std::string::npos
        || disconnect.find("&& acl_handle != HCI_CON_HANDLE_INVALID") == std::string::npos
    ) {
        throw std::runtime_error(
            "Pending ACL and disconnect transactions must retain ownership until their terminal events"
        );
    }

    const std::string signal_strength_loop = extract_between(
        bt_cpp,
        "void bt_signal_strength_loop() {",
        "\n}\n\nbool bt_disconnect_with_intent"
    );
    const auto input_activity = bt_cpp.find(
        "const bool meaningful_input_activity ="
    );
    const auto idle_disconnect = bt_cpp.find(
        "// Inactivity detection.",
        input_activity
    );
    if (
        bt_cpp.find("RSSI_POLL_INTERVAL_US") != std::string::npos
        || bt_cpp.find("#define RSSI_INPUT_IDLE_GRACE_US 5000000ull")
            == std::string::npos
        || bt_cpp.find("#define RSSI_REQUEST_COOLDOWN_US 10000000ull")
            == std::string::npos
        || signal_strength_loop.find("bt_rssi_idle_epoch_armed")
            == std::string::npos
        || signal_strength_loop.find("audio_recent()") == std::string::npos
        || signal_strength_loop.find("usb_speaker_streaming_active()")
            == std::string::npos
        || signal_strength_loop.find("gap_read_rssi(acl_handle)")
            == std::string::npos
        || input_activity == std::string::npos
        || idle_disconnect == std::string::npos
        || input_activity > idle_disconnect
        || bt_cpp.find("arm_signal_strength_idle_epoch(now_us);")
            == std::string::npos
        || bt_cpp.find("uint64_t inactive_time = 0;")
            == std::string::npos
    ) {
        throw std::runtime_error(
            "RSSI sampling must remain input-idle, audio-safe, and bounded per idle epoch"
        );
    }

    const std::string link_key_notification = extract_between(
        bt_cpp,
        "case HCI_EVENT_LINK_KEY_NOTIFICATION: {",
        "\n        case HCI_EVENT_AUTHENTICATION_COMPLETE:"
    );
    const std::string finish_hid = extract_between(
        bt_cpp,
        "static void finish_hid_session_if_ready() {",
        "\n}\n\nstatic void l2cap_packet_handler"
    );
    const auto transaction_accept =
        link_key_notification.find("mark_pairing_transaction_key_accepted(addr)");
    const auto pairing_policy_commit =
        link_key_notification.find("finalize_pairing_policy_for_addr(addr)");
    const auto transaction_discard =
        link_key_notification.find("discard_pairing_transaction()");
    if (
        bt_cpp.find("static bool persist_notified_link_key(")
            == std::string::npos
        || bt_cpp.find("gap_store_link_key_for_bd_addr(addr, notified_key, effective_type);")
            == std::string::npos
        || bt_cpp.find("memcmp(stored_key, notified_key, LINK_KEY_LEN) == 0")
            == std::string::npos
        || bt_cpp.find("gap_drop_link_key_for_bd_addr(addr);")
            == std::string::npos
        || bt_cpp.find("gap_store_link_key_for_bd_addr(addr, prior_key, prior_type);")
            == std::string::npos
        || bt_cpp.find("const bool update_authorized =")
            == std::string::npos
        || bt_cpp.find("notified_type == CHANGED_COMBINATION_KEY")
            == std::string::npos
        || bt_cpp.find("&& existing_link_is_secured")
            == std::string::npos
        || link_key_notification.find("current_link_key_persisted =")
            == std::string::npos
        || link_key_notification.find("finish_hid_session_if_ready();")
            == std::string::npos
        || transaction_accept == std::string::npos
        || pairing_policy_commit == std::string::npos
        || transaction_discard == std::string::npos
        || !(transaction_accept < pairing_policy_commit
            && pairing_policy_commit < transaction_discard)
        || finish_hid.find("pairing_link_key_required && !current_link_key_persisted")
            == std::string::npos
        || finish_hid.find("wait for durable link key before publishing controller")
            == std::string::npos
    ) {
        throw std::runtime_error(
            "Bluetooth pairing must transactionally replace and byte-verify its durable link key before publishing HID"
        );
    }
}

void assert_firmware_version_has_one_canonical_source(
    std::filesystem::path const &root
) {
    auto firmware_version = read_text(root / "firmware-version.txt");
    while (!firmware_version.empty() && std::isspace(
        static_cast<unsigned char>(firmware_version.back())
    )) {
        firmware_version.pop_back();
    }
    if (!std::regex_match(firmware_version, std::regex(R"(\d+\.\d+\.\d+)"))) {
        throw std::runtime_error(
            "firmware-version.txt must contain one semantic firmware version"
        );
    }

    const auto cmake = read_text(root / "CMakeLists.txt");
    const auto companion_cpp = read_text(root / "src" / "companion.cpp");
    const auto bridge_service =
        read_text(root / "companion" / "src" / "main" / "bridge-service.ts");
    const auto release_script =
        read_text(root / "tools" / "create-release-candidate.ps1");
    const auto release_workflow =
        read_text(root / ".github" / "workflows" / "release.yml");
    std::smatch bundled_match;
    const bool bundled_found = std::regex_search(
        bridge_service,
        bundled_match,
        std::regex(R"(BUNDLED_FIRMWARE_VERSION\s*=\s*'(\d+\.\d+\.\d+)')")
    );

    if (
        cmake.find(
            "pico_set_program_version(ds5-bridge \"${DS5_FIRMWARE_VERSION}\")"
        ) == std::string::npos
        || cmake.find(
            "DS5_FIRMWARE_VERSION_MAJOR=${DS5_FIRMWARE_VERSION_MAJOR}"
        ) == std::string::npos
        || companion_cpp.find(
            "kFirmwareMajor = DS5_FIRMWARE_VERSION_MAJOR"
        ) == std::string::npos
        || companion_cpp.find(
            "kFirmwareMinor = DS5_FIRMWARE_VERSION_MINOR"
        ) == std::string::npos
        || companion_cpp.find(
            "kFirmwarePatch = DS5_FIRMWARE_VERSION_PATCH"
        ) == std::string::npos
        || release_script.find(
            "Read-FirmwareVersion (Join-Path $repoRoot 'firmware-version.txt')"
        ) == std::string::npos
        || release_workflow.find(
            "(Get-Content firmware-version.txt -Raw).Trim()"
        ) == std::string::npos
        || !bundled_found
        || bundled_match[1].str() != firmware_version
    ) {
        throw std::runtime_error(
            "CMake, firmware reports, and release validation must share firmware-version.txt"
        );
    }
}

void assert_bluetooth_device_management_policy(std::filesystem::path const &root) {
    const auto bt_cpp = read_text(root / "src" / "bt.cpp");
    const auto bt_h = read_text(root / "src" / "bt.h");

    const std::string working_block = extract_between(
        bt_cpp,
        "case BTSTACK_EVENT_STATE:",
        "\n        case HCI_EVENT_INQUIRY_RESULT:"
    );
    const auto blacklist_load = working_block.find("bt_blacklist_load();");
    const auto link_key_load =
        working_block.find("stored_link_key_present = bt_has_stored_link_key();");
    if (
        bt_cpp.find("#include \"btstack_tlv.h\"") == std::string::npos
        || bt_cpp.find("#define BT_BLACKLIST_TLV_TAG 0x424C434Bu")
            == std::string::npos
        || bt_cpp.find("static bool bt_blacklist_persist()")
            == std::string::npos
        || bt_cpp.find("tlv->store_tag(") == std::string::npos
        || bt_cpp.find("memcmp(verified_addrs, cleared_controller_addrs, bytes) == 0")
            == std::string::npos
        || blacklist_load == std::string::npos
        || link_key_load == std::string::npos
        || blacklist_load > link_key_load
    ) {
        throw std::runtime_error(
            "Forgotten-controller policy must load and byte-verify its durable TLV state before reconnect"
        );
    }

    const std::string filter_block = extract_between(
        bt_cpp,
        "static bool classic_acl_connection_allowed",
        "\n}\n\nstatic int classic_connection_filter"
    );
    const auto blacklist_check = filter_block.find("bt_blacklist_contains(addr)");
    const auto stored_key_check = filter_block.find("gap_get_link_key_for_bd_addr");
    const std::string connection_complete = extract_between(
        bt_cpp,
        "case HCI_EVENT_CONNECTION_COMPLETE: {",
        "\n        case HCI_EVENT_LINK_KEY_REQUEST:"
    );
    const std::string link_key_request = extract_between(
        bt_cpp,
        "case HCI_EVENT_LINK_KEY_REQUEST: {",
        "\n        case HCI_EVENT_USER_CONFIRMATION_REQUEST:"
    );
    if (
        blacklist_check == std::string::npos
        || stored_key_check == std::string::npos
        || blacklist_check > stored_key_check
        || connection_complete.find("Late connection from blacklisted")
            == std::string::npos
        || connection_complete.find("gap_disconnect(handle)")
            == std::string::npos
        || link_key_request.find("!bt_blacklist_contains(addr)")
            == std::string::npos
    ) {
        throw std::runtime_error(
            "Forgotten controllers must be rejected at admission, late completion, and stale key lookup"
        );
    }

    const std::string forget_all = extract_between(
        bt_cpp,
        "bool bt_forget_pairings() {",
        "\n}\n\nbool bt_forget_pairing("
    );
    const auto forget_all_cancel =
        forget_all.find("cancel_pairing_transaction_before_forget(true, nullptr)");
    const auto forget_all_capture = forget_all.find("bt_blacklist_add_stored_link_keys()");
    const auto forget_all_persist = forget_all.find("bt_blacklist_persist()");
    const auto forget_all_drop = forget_all.find("gap_delete_all_link_keys();");
    const std::string forget_one = extract_between(
        bt_cpp,
        "bool bt_forget_pairing(uint8_t address[6])",
        "\n}\n\nbool bt_set_idle_disconnect_timeout_minutes"
    );
    const auto forget_one_cancel =
        forget_one.find("cancel_pairing_transaction_before_forget(false, addr)");
    const auto forget_one_add = forget_one.find("bt_blacklist_add_unique(addr)");
    const auto forget_one_persist = forget_one.find("bt_blacklist_persist()");
    const auto forget_one_drop = forget_one.find("gap_drop_link_key_for_bd_addr(addr);");
    if (
        forget_all_cancel == std::string::npos
        || forget_all_capture == std::string::npos
        || forget_all_persist == std::string::npos
        || forget_all_drop == std::string::npos
        || !(forget_all_capture < forget_all_persist
            && forget_all_persist < forget_all_cancel
            && forget_all_cancel < forget_all_drop)
        || forget_one_cancel == std::string::npos
        || forget_one_add == std::string::npos
        || forget_one_persist == std::string::npos
        || forget_one_drop == std::string::npos
        || !(forget_one_add < forget_one_persist
            && forget_one_persist < forget_one_cancel
            && forget_one_cancel < forget_one_drop)
    ) {
        throw std::runtime_error(
            "Forget-one and forget-all must durably blacklist addresses before deleting link keys"
        );
    }

    const std::string finish_hid = extract_between(
        bt_cpp,
        "static void finish_hid_session_if_ready() {",
        "\n}\n\nstatic void l2cap_packet_handler"
    );
    const auto durable_key_gate =
        finish_hid.find("pairing_link_key_required && !current_link_key_persisted");
    const auto blacklist_clear = finish_hid.find("bt_blacklist_remove(current_device_addr)");
    const auto publish_ready =
        finish_hid.find("connection_phase = BtConnectionPhase::Ready;");
    if (
        durable_key_gate == std::string::npos
        || blacklist_clear == std::string::npos
        || publish_ready == std::string::npos
        || !(durable_key_gate < blacklist_clear && blacklist_clear < publish_ready)
        || bt_h.find("struct BtDeviceIdentitySnapshot") == std::string::npos
        || bt_h.find("bool bt_get_device_identity(BtDeviceIdentitySnapshot *snapshot);")
            == std::string::npos
        || bt_h.find("bool bt_forget_pairing(uint8_t address[6]);")
            == std::string::npos
        || bt_h.find("bool bt_pairing_active();") == std::string::npos
    ) {
        throw std::runtime_error(
            "Explicit durable re-pairing must clear the blacklist before publishing identity and HID readiness"
        );
    }
}

void assert_companion_device_management_contract(std::filesystem::path const &root) {
    const auto companion_cpp = read_text(root / "src" / "companion.cpp");
    const auto companion_h = read_text(root / "src" / "companion.h");
    const auto protocol_ts = read_text(root / "companion" / "src" / "shared" / "protocol.ts");

    if (
        companion_cpp.find("constexpr uint8_t kProtocolMinor = 17;")
            == std::string::npos
        || protocol_ts.find("export const PROTOCOL_MINOR = 17;")
            == std::string::npos
        || companion_h.find("#define COMPANION_REPORT_DEVICE_IDENTITY 0x0D")
            == std::string::npos
        || protocol_ts.find("DEVICE_IDENTITY: 0x0d")
            == std::string::npos
        || companion_cpp.find("CommandRequestControllerScan = 0x27")
            == std::string::npos
        || companion_cpp.find("CommandForgetControllerPairings = 0x28")
            == std::string::npos
        || companion_cpp.find("CommandForgetControllerPairing = 0x2E")
            == std::string::npos
        || protocol_ts.find("REQUEST_CONTROLLER_SCAN: 0x27")
            == std::string::npos
        || protocol_ts.find("FORGET_CONTROLLER_PAIRINGS: 0x28")
            == std::string::npos
        || protocol_ts.find("FORGET_CONTROLLER_PAIRING: 0x2e")
            == std::string::npos
    ) {
        throw std::runtime_error(
            "Firmware and companion controller-management protocol identifiers must remain in parity"
        );
    }

    const std::string identity = extract_between(
        companion_cpp,
        "uint16_t build_device_identity",
        "\n}\n\nuint16_t build_shortcut_event"
    );
    if (
        identity.find("bt_get_device_identity(&identity)") == std::string::npos
        || identity.find("bt_pairing_active() ? 0x08") == std::string::npos
        || identity.find("write_ascii(buffer + 9, 18, identity.address);")
            == std::string::npos
        || identity.find("write_ascii(buffer + 27, 24, identity.name);")
            == std::string::npos
        || identity.find("write_u16(buffer + 51, identity.vendor_id);")
            == std::string::npos
        || identity.find("write_u16(buffer + 53, identity.product_id);")
            == std::string::npos
        || protocol_ts.find("export function parseDeviceIdentityReport")
            == std::string::npos
        || protocol_ts.find("const address = readAscii(report, 10, 18);")
            == std::string::npos
        || protocol_ts.find("const controllerName = readAscii(report, 28, 24);")
            == std::string::npos
    ) {
        throw std::runtime_error(
            "Device identity report layout must remain byte-for-byte aligned across firmware and TypeScript"
        );
    }

    const std::string commands = extract_between(
        companion_cpp,
        "void handle_command",
        "\n}\n\nbool shortcut_setting_enabled"
    );
    if (
        commands.find("case CommandRequestControllerScan:")
            == std::string::npos
        || commands.find("bt_request_scan() ? AckOk : AckBusy")
            == std::string::npos
        || commands.find("case CommandForgetControllerPairings:")
            == std::string::npos
        || commands.find("bt_forget_pairings() ? AckOk : AckPersistenceFailed")
            == std::string::npos
        || commands.find("case CommandForgetControllerPairing:")
            == std::string::npos
        || commands.find("memcpy(address, buffer + 10, sizeof(address));")
            == std::string::npos
        || commands.find("bt_forget_pairing(address) ? AckOk : AckPersistenceFailed")
            == std::string::npos
    ) {
        throw std::runtime_error(
            "Companion controller-management commands must validate and report persistent mutation failures"
        );
    }
}

void assert_bluetooth_hid_recovery_and_encryption_watchdog(std::filesystem::path const &root) {
    const auto bt_cpp = read_text(root / "src" / "bt.cpp");

    const std::string recovery_block = extract_between(
        bt_cpp,
        "void bt_connection_recovery_loop() {",
        "\n}\n\nvoid bt_inquiry_loop"
    );
    if (
        recovery_block.find("ENCRYPTION_COMPLETION_TIMEOUT_US") == std::string::npos
        || recovery_block.find("SECURITY_PHASE_TIMEOUT_US") == std::string::npos
        || recovery_block.find("HID_REMOTE_INTERRUPT_FOLLOWUP_TIMEOUT_US")
            == std::string::npos
        || recovery_block.find("current_hid_opening_timeout_us()")
            == std::string::npos
        || recovery_block.find("hid_connection_initiator == HidConnectionInitiator::Remote")
            == std::string::npos
        || recovery_block.find("hid_control_pending_cid != 0 || hid_interrupt_pending_cid != 0")
            == std::string::npos
    ) {
        throw std::runtime_error("Bluetooth recovery must bound security/encryption and preserve HID channel initiator ownership");
    }

    const std::string init_feature = extract_between(
        bt_cpp,
        "void init_feature() {",
        "\n}\n"
    );
    const auto edge_probe = init_feature.find("schedule_feature_prefetch(0x70, 64);");
    const auto informational_probe = init_feature.find("schedule_feature_prefetch(0x09, 20);");
    const std::string control_data = extract_between(
        bt_cpp,
        "} else if (channel == hid_control_cid) {",
        "\n        } else {"
    );
    if (
        edge_probe == std::string::npos
        || informational_probe == std::string::npos
        || edge_probe > informational_probe
        || control_data.find("const bool edge_type_response =")
            == std::string::npos
        || control_data.find("controller_type == ControllerTypeDualSense")
            == std::string::npos
        || control_data.find(
            "Late controller type response upgraded controller to DualSense Edge"
        ) == std::string::npos
    ) {
        throw std::runtime_error(
            "Initial feature pacing must prioritize Edge detection and accept a delayed authoritative reply"
        );
    }

    const std::string incoming_block = extract_between(
        bt_cpp,
        "case L2CAP_EVENT_INCOMING_CONNECTION:",
        "\n        case L2CAP_EVENT_CHANNEL_CLOSED:"
    );
    if (
        incoming_block.find("current_link_security_ready(handle)") == std::string::npos
        || incoming_block.find("hid_connection_initiator = HidConnectionInitiator::Remote;")
            == std::string::npos
        || incoming_block.find("hid_control_pending_cid = local_cid;") == std::string::npos
        || incoming_block.find("hid_control_ready || hid_control_pending_cid != 0")
            == std::string::npos
        || incoming_block.find("hid_interrupt_pending_cid = local_cid;")
            == std::string::npos
    ) {
        throw std::runtime_error("Incoming HID Control must retain remote ownership through the pending Interrupt boundary");
    }

    const std::string command_status_block = extract_between(
        bt_cpp,
        "case HCI_EVENT_COMMAND_STATUS:",
        "\n        case HCI_EVENT_COMMAND_COMPLETE:"
    );
    if (
        command_status_block.find("HCI_OPCODE_HCI_SET_CONNECTION_ENCRYPTION")
            == std::string::npos
        || command_status_block.find("encryption_command_generation = connection_generation;")
            == std::string::npos
        || command_status_block.find("encryption_command_accepted_at_us = time_us_32();")
            == std::string::npos
    ) {
        throw std::runtime_error("Accepted Set Connection Encryption commands must be tied to the active ACL generation");
    }

    if (
        bt_cpp.find("#define ENCRYPTION_COMPLETION_TIMEOUT_US 2500000u") == std::string::npos
        || bt_cpp.find("#define HID_REMOTE_INITIATION_GRACE_US 500000u") == std::string::npos
        || bt_cpp.find("#define HID_REMOTE_INTERRUPT_FOLLOWUP_TIMEOUT_US 1000000u")
            == std::string::npos
        || bt_cpp.find("case HCI_EVENT_ENCRYPTION_CHANGE_V2:") == std::string::npos
        || bt_cpp.find("case GAP_EVENT_SECURITY_LEVEL:") == std::string::npos
        || bt_cpp.find("gap_request_security_level(handle, LEVEL_2);") == std::string::npos
        || bt_cpp.find("gap_disconnect(acl_handle)") == std::string::npos
        || bt_cpp.find("HCI_SEND_CMD_LOGGED(&hci_disconnect") != std::string::npos
        || bt_cpp.find("HCI_SEND_CMD_LOGGED(&hci_set_connection_encryption") != std::string::npos
    ) {
        throw std::runtime_error("Bluetooth security must use GAP-owned setup and generation-safe stalled-encryption recovery");
    }
}

void assert_dualsense_feature_startup_is_paced(std::filesystem::path const &root) {
    const auto bt_cpp = read_text(root / "src" / "bt.cpp");
    const auto bt_h = read_text(root / "src" / "bt.h");
    const auto main_cpp = read_text(root / "src" / "main.cpp");
    const auto usb_cpp = read_text(root / "src" / "usb.cpp");

    const std::string prefetch_loop = extract_between(
        bt_cpp,
        "void bt_feature_prefetch_loop() {",
        "\n}\n\nvoid bt_inquiry_loop"
    );
    const std::string init_feature_block = extract_between(
        bt_cpp,
        "void init_feature() {",
        "\n}"
    );
    if (
        bt_cpp.find("#define FEATURE_PREFETCH_SPACING_US 5000u") == std::string::npos
        || bt_h.find("void bt_feature_prefetch_loop();") == std::string::npos
        || init_feature_block.find("schedule_feature_prefetch(0x09, 20);")
            == std::string::npos
        || init_feature_block.find("schedule_feature_prefetch(0x70, 64);")
            == std::string::npos
        || init_feature_block.find("get_feature_data(") != std::string::npos
        || prefetch_loop.find("get_feature_data(request.report_id, request.len)")
            == std::string::npos
        || prefetch_loop.find("FEATURE_PREFETCH_SPACING_US") == std::string::npos
        || main_cpp.find("bt_feature_prefetch_loop();") == std::string::npos
    ) {
        throw std::runtime_error(
            "DualSense startup feature requests must be paced from the main loop"
        );
    }

    const std::string watchdog_sleep = extract_between(
        usb_cpp,
        "static void sleep_ms_with_watchdog",
        "\n}\n\nstatic bool reconnect_grace_active"
    );
    if (
        watchdog_sleep.find("watchdog_update();") == std::string::npos
        || watchdog_sleep.find("std::min<uint32_t>(total_ms, 10)") == std::string::npos
        || usb_cpp.find("sleep_ms_with_watchdog(150);") == std::string::npos
        || main_cpp.find("bt_feature_prefetch_loop();") == std::string::npos
        || main_cpp.find("watchdog_update();") == std::string::npos
    ) {
        throw std::runtime_error(
            "Feature startup and USB initialization must remain watchdog-safe"
        );
    }
}

void assert_watchdog_and_bootsel_flash_safety(std::filesystem::path const &root) {
    const auto cmake = read_text(root / "CMakeLists.txt");
    const auto audio_cpp = read_text(root / "src" / "audio.cpp");
    const auto audio_h = read_text(root / "src" / "audio.h");
    const auto ram_mem_c = read_text(root / "src" / "ram_mem.c");
    const auto relocate_cmake = read_text(root / "cmake" / "relocate_to_ram.cmake");
    const auto verify_cmake = read_text(root / "cmake" / "verify_core1_sram.cmake");
    const auto main_cpp = read_text(root / "src" / "main.cpp");

    if (
        cmake.find("src/ram_mem.c") == std::string::npos
        || cmake.find(".text.queue_try_add=.time_critical.queue_try_add")
            == std::string::npos
        || cmake.find(".text.queue_try_remove=.time_critical.queue_try_remove")
            == std::string::npos
        || cmake.find("verify_core1_sram.cmake") == std::string::npos
        || cmake.find("PICO_BTSTACK_CYW43_MAX_HCI_PROCESS_LOOP_COUNT=4")
            == std::string::npos
        || cmake.find("PICO_FLASH_ASSUME_CORE1_SAFE=0") == std::string::npos
    ) {
        throw std::runtime_error(
            "Firmware build must bound CYW43 event bursts and retain multicore flash safety"
        );
    }

    const auto core1_entry = audio_cpp.find("static void __not_in_flash_func(core1_entry)() {");
    const auto decoder_ready = audio_cpp.find("mic_decoder = opus_decoder_create(", core1_entry);
    const auto flash_ready = audio_cpp.find(
        "const bool flash_init_succeeded = flash_safe_execute_core_init();",
        core1_entry
    );
    const auto service_loop = audio_cpp.find("    while (true) {", flash_ready);
    if (
        audio_h.find("bool audio_init();") == std::string::npos
        || audio_cpp.find("std::atomic_bool core1_flash_init_succeeded") == std::string::npos
        || audio_cpp.find("sem_acquire_timeout_ms(&core1_flash_init_done, 250)")
            == std::string::npos
        || audio_cpp.find("sem_release(&core1_flash_init_done);") == std::string::npos
        || audio_cpp.find("core1_flash_safety_poll();") != std::string::npos
        || audio_cpp.find("#include \"core1_flash_safety.h\"") != std::string::npos
        || core1_entry == std::string::npos
        || decoder_ready == std::string::npos
        || flash_ready == std::string::npos
        || service_loop == std::string::npos
        || !(decoder_ready < flash_ready && flash_ready < service_loop)
        || ram_mem_c.find("__not_in_flash_func(memcpy)") == std::string::npos
        || ram_mem_c.find("__not_in_flash_func(memset)") == std::string::npos
        || ram_mem_c.find("__not_in_flash_func(memmove)") == std::string::npos
        || relocate_cmake.find("--rename-section") == std::string::npos
        || verify_cmake.find("\"_ZL11core1_entryv\"") == std::string::npos
        || verify_cmake.find("\"queue_try_add\"") == std::string::npos
        || verify_cmake.find("\"queue_try_remove\"") == std::string::npos
        || verify_cmake.find("\"memcpy\"") == std::string::npos
        || verify_cmake.find("\"memset\"") == std::string::npos
        || verify_cmake.find("\"memmove\"") == std::string::npos
        || verify_cmake.find("0x20000000") == std::string::npos
        || verify_cmake.find("0x20082000") == std::string::npos
    ) {
        throw std::runtime_error(
            "Core 1 must register the SDK lockout victim after its complete steady-state audio chain is SRAM-resident"
        );
    }

    const auto audio_init = main_cpp.find("if (!audio_init())");
    const auto bt_init = main_cpp.find("bt_init();", audio_init);
    const auto watchdog_start = main_cpp.find("watchdog_enable(1000, true);", bt_init);
    const auto first_poll = main_cpp.find("cyw43_arch_poll();", watchdog_start);
    const auto first_poll_feed = main_cpp.find("watchdog_update();", first_poll);
    const auto next_usb_phase = main_cpp.find("tud_task();", first_poll);
    const auto button_check = main_cpp.find("button_check();", first_poll_feed);
    const std::string reboot_branch = extract_between(
        main_cpp,
        "if (watchdog_enable_caused_reboot()) {",
        "\n    } else {"
    );
    if (
        audio_init == std::string::npos
        || bt_init == std::string::npos
        || watchdog_start == std::string::npos
        || !(audio_init < bt_init && bt_init < watchdog_start)
        || first_poll == std::string::npos
        || first_poll_feed == std::string::npos
        || next_usb_phase == std::string::npos
        || first_poll_feed > next_usb_phase
        || button_check == std::string::npos
        || main_cpp.find("if (!audio_recent())", first_poll_feed) != std::string::npos
        || reboot_branch.find("sleep_ms(") != std::string::npos
    ) {
        throw std::runtime_error(
            "Main-loop phases must remain watchdog-fed and BOOTSEL polling must remain available during active audio"
        );
    }
}

void assert_bootsel_gestures_and_intentional_disconnects(std::filesystem::path const &root) {
    const auto button_cpp = read_text(root / "src" / "button_functions.cpp");
    const auto gesture_h = read_text(root / "src" / "kitsune_button_gesture.h");
    const auto bt_cpp = read_text(root / "src" / "bt.cpp");
    const auto bt_h = read_text(root / "src" / "bt.h");
    const auto usb_cpp = read_text(root / "src" / "usb.cpp");
    const auto companion_cpp = read_text(root / "src" / "companion.cpp");

    const std::string dispatch = extract_between(
        button_cpp,
        "static void button_dispatch",
        "\n}\n\nvoid button_check"
    );
    if (
        button_cpp.find("BUTTON_FLASH_SAFE_TIMEOUT_MS = 100") == std::string::npos
        || button_cpp.find("static kitsune::ButtonGesture button_gesture")
            == std::string::npos
        || button_cpp.find("10, // ~1000 ms allowed between clicks")
            == std::string::npos
        || button_cpp.find("button_gesture.update(pressed)") == std::string::npos
        || gesture_h.find("ReleaseAfterHold") == std::string::npos
        || button_cpp.find(
            "const bool sample_succeeded = button_read_bootsel(pressed)"
        ) == std::string::npos
        || button_cpp.find("if (!sample_succeeded)") == std::string::npos
        || button_cpp.find("[BTN] sampler samples=%lu failures=%lu")
            == std::string::npos
        || dispatch.find("bt_is_controller_connected()") == std::string::npos
        || dispatch.find(
            "bt_disconnect_with_intent(BtControllerDisconnectIntentSleep)"
        ) == std::string::npos
        || dispatch.find("bt_request_scan()") == std::string::npos
        || dispatch.find("watchdog_reboot(0, 0, 0)") == std::string::npos
        || dispatch.find("reset_usb_boot(0, 0)") == std::string::npos
        || dispatch.find("bt_forget_pairings()") == std::string::npos
    ) {
        throw std::runtime_error(
            "BOOTSEL must implement safe click, reboot, flashing, and forget-pairing gestures"
        );
    }

    const std::string disconnect = extract_between(
        bt_cpp,
        "bool bt_disconnect_with_intent",
        "\n}\n\nbool bt_disconnect()"
    );
    const std::string recovery = extract_between(
        bt_cpp,
        "static void service_disconnect_recovery",
        "\n}\n\nvoid bt_connection_recovery_loop"
    );
    const std::string hci_disconnect = extract_between(
        bt_cpp,
        "case HCI_EVENT_DISCONNECTION_COMPLETE: {",
        "\n        }\n\n        case GAP_EVENT_RSSI_MEASUREMENT:"
    );
    if (
        bt_h.find("BtControllerDisconnectIntentSleep = 1") == std::string::npos
        || bt_h.find("bool bt_forget_pairings();") == std::string::npos
        || disconnect.find("controller_disconnect_intent = intent;") == std::string::npos
        || disconnect.find("gap_disconnect(acl_handle)") == std::string::npos
        || disconnect.find("DISCONNECT_RETRY_EVENT_TIMEOUT_US") == std::string::npos
        || recovery.find("DISCONNECT_RETRY_MAX_ATTEMPTS") == std::string::npos
        || recovery.find("hci_send_cmd(&hci_disconnect") == std::string::npos
        || hci_disconnect.find("usb_handle_controller_transport_disconnect(expected_disconnect)")
            == std::string::npos
        || hci_disconnect.find("keeping Pico alive") == std::string::npos
        || bt_cpp.find(
            "bt_disconnect_with_intent(BtControllerDisconnectIntentIdleTimeout)"
        ) == std::string::npos
        || companion_cpp.find(
            "bt_disconnect_with_intent(BtControllerDisconnectIntentSleep)"
        ) == std::string::npos
        || usb_cpp.find("#define USB_EXPECTED_DISCONNECT_GRACE_US 1500000")
            == std::string::npos
    ) {
        throw std::runtime_error(
            "Intentional disconnects must preserve pairing, retry bounded teardown, and keep the bridge alive"
        );
    }
}

void assert_host_rumble_passes_through_with_bounded_delivery(
    std::filesystem::path const &root
) {
    const auto main_cpp = read_text(root / "src" / "main.cpp");
    const auto bt_cpp = read_text(root / "src" / "bt.cpp");
    const auto bt_h = read_text(root / "src" / "bt.h");
    const auto scheduler_cpp = read_text(root / "src" / "output_scheduler.cpp");
    const auto delivery_policy = read_text(
        root / "src" / "classic_rumble_delivery_policy.h"
    );

    const std::string submit = extract_between(
        main_cpp,
        "void controller_output_submit_usb_payload",
        "\n}\n\nuint8_t interrupt_in_data"
    );
    const auto gain = submit.find(
        "controller_output_policy_apply_classic_rumble_gain_payload"
    );
    const auto write = submit.find("bt_write_classified_output");
    const auto cache = submit.find("audio_set_state_data");
    if (
        gain == std::string::npos
        || write == std::string::npos
        || cache == std::string::npos
        || gain > write
        || write > cache
        || submit.find("if (!bt_write_classified_output") == std::string::npos
    ) {
        throw std::runtime_error(
            "Host rumble gain must be applied once before pass-through admission, with audio cache publication gated on acceptance"
        );
    }

    const std::string classified = extract_between(
        bt_cpp,
        "bool bt_write_classified_output",
        "\n}\n\nbool bt_write_audio_stream"
    );
    if (
        classified.find("OutputReasonHostPassthrough") == std::string::npos
        || classified.find("enqueue_urgent_output") == std::string::npos
        || classified.find("apply_classic_rumble_gain") != std::string::npos
        || classified.find("strip_redundant_classic_rumble_from_output")
            != std::string::npos
        || classified.find("split_state_from_mixed_output") != std::string::npos
    ) {
        throw std::runtime_error(
            "Normal host/persona reports must stay complete pass-through packets without inferred START/STOP rewriting"
        );
    }

    const std::string enqueue = extract_between(
        bt_cpp,
        "static bool enqueue_urgent_output",
        "\n}\n\nstatic bool make_control_packet"
    );
    const std::string retry = extract_between(
        bt_cpp,
        "static bool requeue_managed_rumble_on_send_failure",
        "\n}\n\nstatic void finish_hid_session_if_ready"
    );
    if (
        enqueue.find("enqueue_with_soft_cap") == std::string::npos
        || enqueue.find("URGENT_SEND_QUEUE_HARD_MAX_DEPTH") == std::string::npos
        || retry.find("retry_delay_us") == std::string::npos
        || retry.find("retry_requires_fail_closed") == std::string::npos
        || retry.find("requeue_failed_front") == std::string::npos
        || delivery_policy.find("DeliveryKind::ManagedStop") == std::string::npos
        || delivery_policy.find("return is_terminal_stop(kind);") == std::string::npos
        || scheduler_cpp.find("output_scheduler_classic_rumble_can_bypass_audio")
            == std::string::npos
        || bt_h.find("void bt_output_retry_loop();") == std::string::npos
        || main_cpp.find("bt_output_retry_loop();") == std::string::npos
    ) {
        throw std::runtime_error(
            "Managed rumble STOP delivery must remain bounded, retryable, and fair to native audio"
        );
    }

    const std::string select_output = extract_between(
        bt_cpp,
        "static bool select_next_output_packet_locked(output_packet &packet, uint32_t now) {",
        "\n}\n\nstatic bool select_next_control_packet_locked"
    );
    const std::string enqueue_state = extract_between(
        bt_cpp,
        "static bool enqueue_state_output(uint8_t *data, uint16_t len, uint8_t reason) {",
        "\n}\n\nstatic bool enqueue_feedback_state_output"
    );
    if (
        bt_cpp.find("#define OUTPUT_MAX_CONSECUTIVE_AUDIO_SENDS 4")
            == std::string::npos
        || bt_cpp.find("#define OUTPUT_STATE_MAX_AGE_US 3000")
            == std::string::npos
        || select_output.find("consecutive_audio_sends")
            == std::string::npos
        || select_output.find("state_age_us")
            == std::string::npos
        || scheduler_cpp.find("const bool state_starved")
            == std::string::npos
        || scheduler_cpp.find(
            "return OutputSchedulerChoice::CoalescedState;"
        ) == std::string::npos
        || bt_cpp.find("state_send_blocked_by_audio_locked")
            != std::string::npos
        || enqueue_state.find("request_can_send_if_needed(true);")
            == std::string::npos
    ) {
        throw std::runtime_error(
            "Companion feedback must receive a bounded scheduler turn during continuous audio"
        );
    }
}

void assert_companion_trigger_tests_survive_continuous_audio(
    std::filesystem::path const &root
) {
    const auto bt_cpp = read_text(root / "src" / "bt.cpp");
    const std::string state_submit = extract_between(
        bt_cpp,
        "static void queue_adaptive_trigger_state_report",
        "\n}\n\nstatic void reset_lightbar_setup"
    );
    const std::string standard_test = extract_between(
        bt_cpp,
        "void bt_set_adaptive_trigger_effect",
        "\n}\n\nstatic void set_custom_trigger_effect"
    );
    const std::string custom_test = extract_between(
        bt_cpp,
        "void bt_set_custom_adaptive_trigger_effects",
        "\n}\n\nvoid bt_set_custom_adaptive_trigger_effect("
    );

    if (
        state_submit.find("DS_OUTPUT_VALID_FLAG1_MOTOR_POWER_LEVEL_ENABLE")
            == std::string::npos
        || state_submit.find("audio_set_adaptive_trigger_state")
            == std::string::npos
        || state_submit.find("enqueue_feedback_state_output")
            == std::string::npos
        || standard_test.find("adaptive_trigger_motor_power_for_intensity")
            == std::string::npos
        || standard_test.find("queue_adaptive_trigger_state_report")
            == std::string::npos
        || standard_test.find("bt_write(") != std::string::npos
        || custom_test.find("queue_adaptive_trigger_state_report(report, 0)")
            == std::string::npos
        || custom_test.find("bt_write(") != std::string::npos
    ) {
        throw std::runtime_error(
            "Companion trigger tests must update the audio-carried output state and use the bounded feedback queue"
        );
    }
}

void assert_lightbar_restore_can_be_disabled(
    std::filesystem::path const &root
) {
    const auto bt_cpp = read_text(root / "src" / "bt.cpp");
    const auto bt_h = read_text(root / "src" / "bt.h");
    const auto companion_cpp = read_text(root / "src" / "companion.cpp");
    const std::string setter = extract_between(
        bt_cpp,
        "void bt_set_lightbar_restore_enabled",
        "\n}\n\nvoid bt_schedule_lightbar_restore"
    );
    const std::string scheduler = extract_between(
        bt_cpp,
        "void bt_schedule_lightbar_restore",
        "\n}\n\nvoid bt_lightbar_loop"
    );
    const std::string loop = extract_between(
        bt_cpp,
        "void bt_lightbar_loop",
        "\n}\n\nvoid bt_signal_strength_loop"
    );

    if (
        bt_h.find("void bt_set_lightbar_restore_enabled(bool enabled);")
            == std::string::npos
        || setter.find("lightbar_restore_enabled = enabled;")
            == std::string::npos
        || setter.find("lightbar_restore_pending = false;")
            == std::string::npos
        || scheduler.find("!lightbar_restore_enabled")
            == std::string::npos
        || loop.find("!lightbar_restore_enabled")
            == std::string::npos
        || companion_cpp.find("CommandSetLightbarRestoreEnabled = 0x36")
            == std::string::npos
        || companion_cpp.find("bt_set_lightbar_restore_enabled(value == 1);")
            == std::string::npos
        || companion_cpp.find("bt_set_lightbar_restore_enabled(true);")
            == std::string::npos
    ) {
        throw std::runtime_error(
            "Automatic lightbar restore must be runtime-toggleable, cancel pending work when disabled, and default on"
        );
    }
}

void assert_dualsense_battery_buckets_preserve_power_state(
    std::filesystem::path const &root
) {
    const auto decoder = read_text(root / "src" / "dualsense_input_decoder.cpp");
    const auto companion = read_text(root / "src" / "companion.cpp");
    constexpr auto midpoint_formula = "battery == 10 ? 100 : battery * 10 + 5";

    if (
        decoder.find(midpoint_formula) == std::string::npos
        || companion.find(midpoint_formula) == std::string::npos
        || decoder.find("raw_power_state == 0x02") != std::string::npos
        || companion.find("raw_power_state == 0x02") != std::string::npos
    ) {
        throw std::runtime_error(
            "DualSense battery buckets must map to midpoint percentages independently of charging or external-power state"
        );
    }
}

} // namespace

int main() {
    try {
        const auto source_root = std::filesystem::path(DS5_SOURCE_ROOT);
        const auto source = read_text(source_root / "src" / "usb_descriptors.c");
        const uint16_t bcd_device = parse_bcd_device(source);
        const uint64_t descriptor_hash = companion_descriptor_hash(source);
        assert_xusb_descriptor_uses_endpoint_constants(source);
        assert_persona_support_requires_verified_descriptors(source, source_root);
        assert_dse_identity_reports_do_not_use_edge_passthrough(source_root);
        assert_xusb_persona_strings_are_xbox_facing(source);
        assert_ds4_persona_identity_is_ds4_facing(source);
        assert_persona_switch_quiets_input_only(source_root);
        assert_usb_suspend_poweroff_is_debounced(source_root);
        assert_mute_keyboard_chord_starter_is_deferred(source_root);
        assert_ps_chord_starter_is_deferred_to_protect_steam_big_picture(source_root);
        assert_mic_pass_through_defaults_to_enabled(source_root);
        assert_bluetooth_pairing_and_reconnect_policy(source_root);
        assert_firmware_version_has_one_canonical_source(source_root);
        assert_bluetooth_device_management_policy(source_root);
        assert_companion_device_management_contract(source_root);
        assert_bluetooth_hid_recovery_and_encryption_watchdog(source_root);
        assert_dualsense_feature_startup_is_paced(source_root);
        assert_watchdog_and_bootsel_flash_safety(source_root);
        assert_bootsel_gestures_and_intentional_disconnects(source_root);
        assert_host_rumble_passes_through_with_bounded_delivery(source_root);
        assert_companion_trigger_tests_survive_continuous_audio(source_root);
        assert_lightbar_restore_can_be_disabled(source_root);
        assert_dualsense_battery_buckets_preserve_power_state(source_root);

        if (bcd_device != kExpectedUsbDeviceRevision) {
            std::cerr << "USB bcdDevice changed unexpectedly. Expected 0x" << std::hex
                      << kExpectedUsbDeviceRevision << ", got 0x" << bcd_device << std::dec << "\n";
            return 1;
        }

        if (descriptor_hash != kExpectedCompanionDescriptorHash) {
            std::cerr << "Companion USB descriptor fingerprint changed without updating the migration guard.\n"
                      << "If this is an intentional USB identity/interface change, bump bcdDevice so Windows "
                      << "re-enumerates the bridge cleanly, then update this expected fingerprint.\n"
                      << "Expected 0x" << std::hex << kExpectedCompanionDescriptorHash
                      << ", got 0x" << descriptor_hash << std::dec << "\n";
            return 1;
        }

        std::cout << "USB descriptor migration guard passed\n";
        return 0;
    } catch (std::exception const &error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
