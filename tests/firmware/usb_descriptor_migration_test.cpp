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
        "void usb_handle_controller_transport_disconnect() {",
        "\n}\n\nvoid usb_handle_controller_transport_ready()"
    );
    const auto disconnect_suspend = disconnect_block.find("usb_bus_suspended()");
    const auto disconnect_deinit = disconnect_block.find("usb_deinit_device_stack();");
    if (
        disconnect_suspend == std::string::npos
        || disconnect_deinit == std::string::npos
        || disconnect_deinit < disconnect_suspend
    ) {
        throw std::runtime_error("Controller disconnect must defer USB deinit while the host is suspended");
    }

    const std::string ready_block = extract_between(
        usb_cpp,
        "void usb_handle_controller_transport_ready() {",
        "\n}\n\nextern \"C\" void tud_mount_cb(void) {"
    );
    const auto ready_suspend = ready_block.find("usb_bus_suspended()");
    const auto ready_connect = ready_block.find("usb_connect_controller_transport");
    if (
        ready_suspend == std::string::npos
        || ready_connect == std::string::npos
        || ready_connect < ready_suspend
    ) {
        throw std::runtime_error("Controller reconnect must not re-enumerate USB while the host is suspended");
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
    const auto watchdog = hci_disconnect.find("watchdog_reboot");
    if (
        suspended_query == std::string::npos
        || hci_disconnect.find("keeping USB on bus") == std::string::npos
        || watchdog == std::string::npos
        || watchdog < suspended_query
    ) {
        throw std::runtime_error("BT disconnect must avoid rebooting while the USB host is suspended");
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
