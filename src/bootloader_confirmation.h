#ifndef DS5_BRIDGE_BOOTLOADER_CONFIRMATION_H
#define DS5_BRIDGE_BOOTLOADER_CONFIRMATION_H

#include <cstdint>

// Tracks the face-button presses of a physical bootloader confirmation on the
// DualSense report's button byte. Header-only: it runs inline in the SRAM
// controller-report path. Ported from Kitsune Input.

namespace ds5::bootloader_confirmation {

enum class FaceButton : uint8_t {
    Triangle = 0,
    Circle = 1,
    Cross = 2,
    Square = 3,
};

// Face-button bits of DualSense input report byte 7 (USB layout).
constexpr uint8_t kSquareBit = 0x10;
constexpr uint8_t kCrossBit = 0x20;
constexpr uint8_t kCircleBit = 0x40;
constexpr uint8_t kTriangleBit = 0x80;
constexpr uint8_t kFaceButtonMask = kSquareBit | kCrossBit | kCircleBit | kTriangleBit;

struct State {
    bool active = false;
    bool waiting_for_release = false;
};

enum class Result : uint8_t {
    Idle,
    Consuming,
    Correct,
    Incorrect,
};

constexpr bool valid_face_button(uint8_t value) {
    return value < 4;
}

constexpr uint8_t face_button_mask(FaceButton button) {
    switch (button) {
        case FaceButton::Triangle: return kTriangleBit;
        case FaceButton::Circle: return kCircleBit;
        case FaceButton::Cross: return kCrossBit;
        case FaceButton::Square: return kSquareBit;
    }
    return 0;
}

// While a confirmation is pending every face-button press is consumed, so it
// never reaches a game. A press held when confirmation starts must be released
// first, and each step counts once per press.
inline Result update(State &state, uint8_t face_buttons, bool pending, FaceButton expected) {
    const uint8_t pressed = face_buttons & kFaceButtonMask;
    if (!pending) {
        state.active = false;
        if (state.waiting_for_release && pressed != 0) {
            return Result::Consuming;
        }
        state.waiting_for_release = false;
        return Result::Idle;
    }

    if (!state.active) {
        state.active = true;
        state.waiting_for_release = pressed != 0;
        return Result::Consuming;
    }

    if (state.waiting_for_release) {
        if (pressed == 0) {
            state.waiting_for_release = false;
        }
        return Result::Consuming;
    }
    if (pressed == 0) {
        return Result::Consuming;
    }

    state.waiting_for_release = true;
    return pressed == face_button_mask(expected) ? Result::Correct : Result::Incorrect;
}

} // namespace ds5::bootloader_confirmation

#endif // DS5_BRIDGE_BOOTLOADER_CONFIRMATION_H
