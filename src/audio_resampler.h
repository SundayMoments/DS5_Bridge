#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

// Exact-ratio sample-rate conversion for the two fixed-rate audio paths. Both
// ratios are rational, so the phase is carried in integers and all arithmetic
// stays in single precision: the RP2350 FPU has no double unit.
namespace ds5::audio {

inline constexpr std::size_t kStereoChannels = 2;

inline constexpr std::size_t kSpeakerBlockInputFrames = 512;
inline constexpr std::size_t kSpeakerBlockOutputFrames = 480;
inline constexpr std::size_t kSpeakerBlockInputSamples = kSpeakerBlockInputFrames * kStereoChannels;
inline constexpr std::size_t kSpeakerBlockOutputSamples = kSpeakerBlockOutputFrames * kStereoChannels;

// Converts one interleaved stereo speaker block from 512 to 480 frames by
// linear interpolation at input position 16k / 15. Stateless; output frames
// that land on a whole input frame are copies of it.
void resample_speaker_block(
    std::span<const float, kSpeakerBlockInputSamples> input,
    std::span<float, kSpeakerBlockOutputSamples> output
);

// Decimates 48 kHz haptics to 3 kHz by keeping frames 0, 16, 32, ... of the
// stream since the last reset. At an exact 16:1 ratio, linear interpolation
// weighs those frames by 1 and their neighbours by 0, so nothing is lost by
// skipping the arithmetic.
class HapticsDecimator {
public:
    static constexpr uint32_t kInputRateHz = 48000;
    static constexpr uint32_t kOutputRateHz = 3000;
    static constexpr uint32_t kFactor = kInputRateHz / kOutputRateHz;
    static_assert(kInputRateHz % kOutputRateHz == 0);

    // Advances by one input frame; true when that frame is kept.
    constexpr bool keep_frame() {
        const bool keep = phase_ == 0;
        phase_ = (phase_ + 1) % kFactor;
        return keep;
    }

    constexpr void reset() {
        phase_ = 0;
    }

private:
    uint32_t phase_ = 0;
};

} // namespace ds5::audio
