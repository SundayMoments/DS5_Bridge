// The exact-ratio audio resamplers: the speaker block lands on 16k/15 with
// linear interpolation and stays inside its buffers, and haptics decimation
// keeps every 16th frame of the stream however the USB reads split it.

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <iterator>
#include <limits>
#include <span>

#include "audio_resampler.h"

#define CHECK(condition) \
    do { \
        if (!(condition)) { \
            std::fprintf(stderr, "audio resampler check failed at %d: %s\n", __LINE__, #condition); \
            std::exit(1); \
        } \
    } while (0)

namespace audio = ds5::audio;

namespace {

constexpr std::size_t kIn = audio::kSpeakerBlockInputSamples;
constexpr std::size_t kOut = audio::kSpeakerBlockOutputSamples;

// Deterministic samples in [-1, 1) on every platform.
struct Lcg {
    uint32_t state = 0x2545f491u;

    float next() {
        state = state * 1664525u + 1013904223u;
        return static_cast<float>(static_cast<int32_t>(state >> 8) - (1 << 23)) / static_cast<float>(1 << 23);
    }
};

void fill(float *samples, std::size_t count, Lcg &rng) {
    for (std::size_t i = 0; i < count; ++i) {
        samples[i] = rng.next();
    }
}

// Linear interpolation at exactly 16k/15, from integer arithmetic.
double reference(float const *in, std::size_t k, std::size_t channel) {
    const std::size_t numerator = 16 * k;
    const std::size_t frame = numerator / 15;
    const double weight = static_cast<double>(numerator % 15) / 15.0;
    const double current = in[frame * 2 + channel];
    const double next = in[(frame + 1) * 2 + channel];
    return current + (next - current) * weight;
}

void check_speaker_against_reference() {
    Lcg rng;
    float in[kIn];
    float out[kOut];
    double max_error = 0.0;
    for (int block = 0; block < 64; ++block) {
        fill(in, kIn, rng);
        audio::resample_speaker_block(in, out);
        for (std::size_t k = 0; k < audio::kSpeakerBlockOutputFrames; ++k) {
            for (std::size_t channel = 0; channel < 2; ++channel) {
                max_error = std::fmax(max_error, std::fabs(out[k * 2 + channel] - reference(in, k, channel)));
            }
        }
    }
    // a + (b - a) * w rounds the difference, the stored weight and the
    // product and sum (fused or not). For samples in [-1, 1) that stays below
    // 3.5 * 2^-24 = 2.1e-7, far below one 16-bit step (3.05e-5).
    CHECK(max_error < 2.5e-7);
}

void check_speaker_exact_cases() {
    float in[kIn];
    float out[kOut];

    // Every 15th output frame lands on a whole input frame and copies it.
    Lcg rng;
    fill(in, kIn, rng);
    audio::resample_speaker_block(in, out);
    for (std::size_t k = 0; k < audio::kSpeakerBlockOutputFrames; k += 15) {
        const std::size_t frame = k * 16 / 15;
        CHECK(out[k * 2] == in[frame * 2]);
        CHECK(out[k * 2 + 1] == in[frame * 2 + 1]);
    }

    // A constant signal stays exactly constant, per channel.
    for (std::size_t i = 0; i < kIn; i += 2) {
        in[i] = 0.25f;
        in[i + 1] = -0.999969482421875f;
    }
    audio::resample_speaker_block(in, out);
    for (std::size_t i = 0; i < kOut; i += 2) {
        CHECK(out[i] == 0.25f);
        CHECK(out[i + 1] == -0.999969482421875f);
    }

    // The block is read up to and including its last frame: an impulse there
    // reaches only the last output frame, at weight 14/15.
    std::fill(std::begin(in), std::end(in), 0.0f);
    in[kIn - 2] = 1.0f;
    in[kIn - 1] = -1.0f;
    audio::resample_speaker_block(in, out);
    for (std::size_t i = 0; i < kOut - 2; ++i) {
        CHECK(out[i] == 0.0f);
    }
    CHECK(std::fabs(out[kOut - 2] - 14.0f / 15.0f) < 1e-7f);
    CHECK(std::fabs(out[kOut - 1] + 14.0f / 15.0f) < 1e-7f);
}

void check_speaker_stays_in_bounds() {
    // Guards around both buffers: NaN around the input turns any read outside
    // it into a NaN output, and a finite marker around the output catches any
    // write outside it, including a write of NaN.
    constexpr std::size_t kGuard = 64;
    constexpr float kOutputGuard = 1234.5f;
    float in[kGuard + kIn + kGuard];
    float out[kGuard + kOut + kGuard];
    std::fill(std::begin(in), std::end(in), std::numeric_limits<float>::quiet_NaN());
    std::fill(std::begin(out), std::end(out), kOutputGuard);
    Lcg rng;
    fill(in + kGuard, kIn, rng);

    audio::resample_speaker_block(
        std::span<const float, kIn>(in + kGuard, kIn),
        std::span<float, kOut>(out + kGuard, kOut)
    );
    for (std::size_t i = 0; i < kGuard; ++i) {
        CHECK(out[i] == kOutputGuard);
        CHECK(out[kGuard + kOut + i] == kOutputGuard);
    }
    for (std::size_t i = 0; i < kOut; ++i) {
        CHECK(std::isfinite(out[kGuard + i]));
    }
}

void check_haptics_decimator() {
    static_assert(audio::HapticsDecimator::kFactor == 16);

    // Reads of every size from 1 to 48 frames keep exactly frames 0, 16,
    // 32, ... of the stream.
    audio::HapticsDecimator decimator;
    uint32_t stream_frame = 0;
    uint32_t kept = 0;
    for (uint32_t read = 0; read < 2000; ++read) {
        const uint32_t frames = 1 + (read * 7) % 48;
        for (uint32_t i = 0; i < frames; ++i, ++stream_frame) {
            const bool keep = decimator.keep_frame();
            CHECK(keep == (stream_frame % 16 == 0));
            kept += keep;
        }
    }
    CHECK(kept == (stream_frame + 15) / 16);

    // Reset starts a new stream: its first frame is kept.
    for (int i = 0; i < 5; ++i) {
        (void)decimator.keep_frame();
    }
    decimator.reset();
    CHECK(decimator.keep_frame());
    for (int i = 1; i < 16; ++i) {
        CHECK(!decimator.keep_frame());
    }
    CHECK(decimator.keep_frame());
}

} // namespace

int main() {
    check_speaker_against_reference();
    check_speaker_exact_cases();
    check_speaker_stays_in_bounds();
    check_haptics_decimator();
    std::printf("Audio resampler checks passed\n");
    return 0;
}
