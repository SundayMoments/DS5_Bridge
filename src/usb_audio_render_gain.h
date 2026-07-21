#ifndef DS5_BRIDGE_USB_AUDIO_RENDER_GAIN_H
#define DS5_BRIDGE_USB_AUDIO_RENDER_GAIN_H

#include <cstdint>

namespace ds5::usb_audio {

struct NativeRenderFrame {
    int16_t speaker_left = 0;
    int16_t speaker_right = 0;
    int16_t haptic_left = 0;
    int16_t haptic_right = 0;
};

inline int16_t scale_host_speaker_sample(int16_t sample, float host_gain) {
    const float clamped_gain = host_gain < 0.0f
        ? 0.0f
        : (host_gain > 1.0f ? 1.0f : host_gain);
    const int32_t scaled = static_cast<int32_t>(
        static_cast<float>(sample) * clamped_gain
    );
    const int32_t clamped_sample = scaled < -32768
        ? -32768
        : (scaled > 32767 ? 32767 : scaled);
    return static_cast<int16_t>(clamped_sample);
}

inline NativeRenderFrame apply_host_speaker_gain(
    NativeRenderFrame const &frame,
    float host_gain
) {
    return {
        .speaker_left = scale_host_speaker_sample(frame.speaker_left, host_gain),
        .speaker_right = scale_host_speaker_sample(frame.speaker_right, host_gain),
        // UAC speaker volume controls only the audible render channels. Native
        // DualSense haptics have their own gain and must retain their level.
        .haptic_left = frame.haptic_left,
        .haptic_right = frame.haptic_right,
    };
}

} // namespace ds5::usb_audio

#endif // DS5_BRIDGE_USB_AUDIO_RENDER_GAIN_H
