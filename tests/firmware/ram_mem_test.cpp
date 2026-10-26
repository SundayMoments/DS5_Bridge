// Compares the SRAM memory operations in src/ram_mem.c, compiled under
// renamed symbols, with the host C library for every small alignment and
// length combination, including overlapping memmove in both directions.

#include <cstddef>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <initializer_list>

extern "C" {
void *ds5_ram_memcpy(void *destination, const void *source, size_t length);
void *ds5_ram_memset(void *destination, int value, size_t length);
void *ds5_ram_memmove(void *destination, const void *source, size_t length);
}

namespace {

constexpr size_t kBufferSize = 96;
constexpr size_t kMaxOffset = 8;
constexpr size_t kMaxLength = 40;

void fill_pattern(uint8_t *buffer, uint8_t seed) {
    for (size_t i = 0; i < kBufferSize; ++i) {
        buffer[i] = static_cast<uint8_t>(seed + i * 37u);
    }
}

int failures = 0;

void expect_equal(uint8_t const *actual, uint8_t const *expected, char const *operation,
                  size_t dst_offset, size_t src_offset, size_t length) {
    if (std::memcmp(actual, expected, kBufferSize) != 0) {
        std::fprintf(stderr, "%s mismatch: dst=%zu src=%zu len=%zu\n",
                     operation, dst_offset, src_offset, length);
        ++failures;
    }
}

void test_copy() {
    alignas(4) uint8_t source[kBufferSize];
    alignas(4) uint8_t actual[kBufferSize];
    alignas(4) uint8_t expected[kBufferSize];
    fill_pattern(source, 11);
    for (size_t dst_offset = 0; dst_offset < kMaxOffset; ++dst_offset) {
        for (size_t src_offset = 0; src_offset < kMaxOffset; ++src_offset) {
            for (size_t length = 0; length < kMaxLength; ++length) {
                fill_pattern(actual, 200);
                fill_pattern(expected, 200);
                void *result = ds5_ram_memcpy(actual + dst_offset, source + src_offset, length);
                std::memcpy(expected + dst_offset, source + src_offset, length);
                if (result != actual + dst_offset) {
                    std::fprintf(stderr, "memcpy returned the wrong pointer\n");
                    ++failures;
                }
                expect_equal(actual, expected, "memcpy", dst_offset, src_offset, length);
            }
        }
    }
}

void test_set() {
    alignas(4) uint8_t actual[kBufferSize];
    alignas(4) uint8_t expected[kBufferSize];
    for (size_t dst_offset = 0; dst_offset < kMaxOffset; ++dst_offset) {
        for (size_t length = 0; length < kMaxLength; ++length) {
            for (int value : {0x00, 0x5a, 0xff, 0x1a5}) {
                fill_pattern(actual, 3);
                fill_pattern(expected, 3);
                void *result = ds5_ram_memset(actual + dst_offset, value, length);
                std::memset(expected + dst_offset, value, length);
                if (result != actual + dst_offset) {
                    std::fprintf(stderr, "memset returned the wrong pointer\n");
                    ++failures;
                }
                expect_equal(actual, expected, "memset", dst_offset, 0, length);
            }
        }
    }
}

void test_move() {
    alignas(4) uint8_t actual[kBufferSize];
    alignas(4) uint8_t expected[kBufferSize];
    // Overlapping and disjoint regions inside one buffer, in both directions.
    for (size_t dst_offset = 0; dst_offset < 2 * kMaxOffset; ++dst_offset) {
        for (size_t src_offset = 0; src_offset < 2 * kMaxOffset; ++src_offset) {
            for (size_t length = 0; length < kMaxLength; ++length) {
                fill_pattern(actual, 77);
                fill_pattern(expected, 77);
                void *result = ds5_ram_memmove(actual + dst_offset, actual + src_offset, length);
                std::memmove(expected + dst_offset, expected + src_offset, length);
                if (result != actual + dst_offset) {
                    std::fprintf(stderr, "memmove returned the wrong pointer\n");
                    ++failures;
                }
                expect_equal(actual, expected, "memmove", dst_offset, src_offset, length);
            }
        }
    }
}

} // namespace

int main() {
    test_copy();
    test_set();
    test_move();
    if (failures != 0) {
        std::fprintf(stderr, "%d ram_mem comparisons failed\n", failures);
        return 1;
    }
    std::printf("ram_mem operations match the C library\n");
    return 0;
}
