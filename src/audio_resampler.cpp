#include "audio_resampler.h"

#include <array>

#ifdef PICO_ON_DEVICE
#include "pico.h"
#else
#define __not_in_flash(group)
#define __not_in_flash_func(function_name) function_name
#endif

namespace ds5::audio {
namespace {

// Output frame k = 15g + r lies at input position 16k / 15 = 16g + r + r / 15:
// phase r of group g interpolates input frames 16g + r and 16g + r + 1 with
// weight r / 15. The 15 phases of a group read exactly its 16 input frames,
// and the 32 groups exactly the block.
constexpr std::size_t kPhases = 15;
constexpr std::size_t kGroupInputFrames = kPhases + 1;
constexpr std::size_t kGroups = kSpeakerBlockOutputFrames / kPhases;
static_assert(kGroups * kPhases == kSpeakerBlockOutputFrames);
static_assert(kGroups * kGroupInputFrames == kSpeakerBlockInputFrames);

// Weight r / 15 for each phase, rounded once at compile time. Core 1 reads it
// for every output frame, so it lives in SRAM beside resample_speaker_block.
constexpr std::array<float, kPhases> __not_in_flash("audio_resampler") phase_weights = [] {
    std::array<float, kPhases> weights{};
    for (std::size_t phase = 0; phase < kPhases; ++phase) {
        weights[phase] = static_cast<float>(phase) / static_cast<float>(kPhases);
    }
    return weights;
}();
static_assert(phase_weights[0] == 0.0f);

} // namespace

void __not_in_flash_func(resample_speaker_block)(
    std::span<const float, kSpeakerBlockInputSamples> input,
    std::span<float, kSpeakerBlockOutputSamples> output
) {
    const float *__restrict in = input.data();
    float *__restrict out = output.data();

    for (std::size_t group = 0; group < kGroups; ++group) {
        for (std::size_t phase = 0; phase < kPhases; ++phase) {
            const float weight = phase_weights[phase];
            const float *frame = in;
            const float *next = in + kStereoChannels;
            out[0] = frame[0] + (next[0] - frame[0]) * weight;
            out[1] = frame[1] + (next[1] - frame[1]) * weight;
            in += kStereoChannels;
            out += kStereoChannels;
        }
        // The group's last input frame was only the right-hand neighbour.
        in += kStereoChannels;
    }
}

} // namespace ds5::audio
