# DS5Dongle clone audio/RAM implementation

Source studied: local `DS5Dongle` clone on branch `refactor/audio-path-to-ram`, commit `329c0de` (`feat(mic): enable controller mic capture, mono opus path`).

This document intentionally ignores Waveshare-specific board support and focuses on the firmware audio path that makes speaker, haptics, and controller mic run without a host-side encoder.

## Relevant commits

The current branch is built from these audio commits:

- `646b176` - moves `audio_loop()` and `core1_entry()` into RAM with `__not_in_flash_func`.
- `3bfa4c2` - moves `WDL_Resampler::ResamplePrepare` and `WDL_Resampler::ResampleOut` into RAM by renaming object sections.
- `0adca8f` - moves libopus `.text`, `.rodata`, and `.rodata.str1.4` into `.time_critical.opus_*` RAM sections.
- `a023371` - changes the default non-Pico-W build to 150 MHz and CYW43 PIO divider 2 after the audio hot path is in RAM.
- `329c0de` - adds the controller mic path: BT interrupt Opus payload to `mic_fifo`, core1 Opus decode to PCM, core0 USB audio IN write.

The mic commit says the validated configuration was 150 MHz / PIO divider 2 with speaker audio, 3.5 mm headset output, and controller mic capture working.

## Build and RAM relocation

Default non-Pico-W configuration in `DS5Dongle/CMakeLists.txt`:

- `SYS_CLOCK_KHZ_VALUE = 150000`
- `CYW43_PIO_CLOCK_DIV_VALUE = 2`
- `DISABLE_SPEAKER_PROC_VALUE = 0`
- `PICO_FLASH_SPI_CLKDIV = 2` because the clock is not above 266 MHz
- `PICO_EMBED_XIP_SETUP = 1`
- `PICO_FLASH_ASSUME_CORE1_SAFE = 1`
- `CYW43_LWIP = 0`
- `WDL_RESAMPLE_TYPE = float`

The clone only raises voltage and explicitly sets the system clock when `SYS_CLOCK_KHZ != 150000`. At the default 150 MHz build, `main()` skips the old overclock block entirely.

RAM relocation details:

- `audio_loop()`, `core1_entry()`, `speaker_proc()`, and `mic_proc()` are marked `__not_in_flash_func`.
- WDL is compiled with `-ffunction-sections`, then these sections are renamed:
  - `.text._ZN13WDL_Resampler11ResampleOutEPfiii` to `.time_critical.WDL_ResampleOut`
  - `.text._ZN13WDL_Resampler15ResamplePrepareEiiPPf` to `.time_critical.WDL_ResamplePrepare`
- libopus archive sections are renamed before final link:
  - `.text` to `.time_critical.opus_text`
  - `.rodata` to `.time_critical.opus_rodata`
  - `.rodata.str1.4` to `.time_critical.opus_strings`
- The commit notes report about 366 KiB static RAM use and about 145 KiB free heap at the mic-enabled 150 MHz build.

## USB audio function

The clone exposes one UAC1 audio function with speaker OUT and mic IN:

- Audio control interface: interface 0.
- Speaker stream OUT: interface 1, alternate 1.
- Mic stream IN: interface 2, alternate 1.
- HID controller interface follows as interface 3.

Speaker OUT descriptor:

- Terminal ID 1: USB streaming input.
- Feature unit ID 2: speaker mute and volume controls.
- Terminal ID 3: speaker output.
- Channels: 4.
- Format: 16-bit PCM, 48 kHz.
- Channel config: `0x0033` (front L/R plus surround L/R).
- Endpoint: OUT EP1.
- Endpoint attributes: isochronous adaptive (`0x09`).
- Descriptor max packet size: `0x0188` / 392 bytes.
- Firmware read size in `audio_loop`: 384 bytes into `int16_t raw[192]`, interpreted as 48 frames x 4 channels x 16-bit.

Mic IN descriptor:

- Terminal ID 4: headset mic.
- Feature unit ID 5: mic mute and volume controls.
- Terminal ID 6: USB streaming output.
- Channels: 1 mono.
- Channel config: `0x0000` (non-predefined mono).
- Format: 16-bit PCM, 48 kHz.
- Endpoint: IN EP2.
- Endpoint attributes: isochronous asynchronous (`0x05`).
- Descriptor max packet size: `0x0062` / 98 bytes.
- TinyUSB IN software buffer: `16 * CFG_TUD_AUDIO_FUNC_1_EP_IN_SZ_MAX`.

TinyUSB config:

- `CFG_TUD_AUDIO_FUNC_1_N_CHANNELS_RX = 4`
- `CFG_TUD_AUDIO_FUNC_1_N_BYTES_PER_SAMPLE_RX = 2`
- `CFG_TUD_AUDIO_FUNC_1_N_CHANNELS_TX = 1`
- `CFG_TUD_AUDIO_FUNC_1_N_BYTES_PER_SAMPLE_TX = 2`
- `CFG_TUD_AUDIO_FUNC_1_SAMPLE_RATE = 48000`
- `CFG_TUD_AUDIO_ENABLE_EP_OUT = 1`
- `CFG_TUD_AUDIO_ENABLE_EP_IN = 1`

The UAC mute/volume controls are mostly state/control plumbing. Speaker volume updates call `set_volume(100 + volume[index])`, which updates the controller state snapshot. The actual speaker PCM samples sent into Opus are not scaled by USB volume or mute in `audio.cpp`. Mic mute/volume controls are stored but are not used to gate or scale the decoded mic PCM.

## Main loop and ownership

Boot order:

1. Optional overclock block only if `SYS_CLOCK_KHZ != 150000`.
2. `board_init()`.
3. `tusb_init(... TUSB_SPEED_FULL)`.
4. Optional USB disconnect delay when serial is disabled.
5. `board_init_after_tusb()`.
6. `cyw43_arch_init()`.
7. `config_load()`.
8. `bt_init()` and `bt_register_data_callback(on_bt_data)`.
9. `audio_init()`.
10. `state_init()`.
11. Main loop runs `cyw43_arch_poll()`, `tud_task()`, `wake_task()`, `audio_loop()`, `interrupt_loop()`, LED tick, and inquiry LED tick.

State ownership:

- Host HID output report `0x02` updates the clone's `state` with `state_update(buffer + 1, bufsize - 1)`.
- If USB speaker alternate setting is active (`spk_active`), the clone does not forward a normal BT `0x31` state report from that HID output path.
- During active audio, the current `state` is embedded inside every BT `0x36` audio/haptics/speaker packet.
- The clone therefore treats the firmware `state_mgr` snapshot as the packet source of truth while audio is active.

Speaker active tracking:

- `tud_audio_set_itf_cb` checks interface 1.
- It sets `spk_active = alt`.
- This flag only affects whether normal HID output `0x02` reports are forwarded as BT `0x31` while audio is active.
- It does not gate `audio_loop()` or speaker Opus encoding.

Headset routing:

- `on_bt_data()` watches controller BT input report `0x31`.
- If the mic payload bit is not set, it compares `data[56] & 1` with `interrupt_in_data[53] & 1`.
- On change, it calls `set_headset(data[56] & 1)`.
- `set_headset()` stores `plug_headset`.
- The next `0x36` packet uses speaker section type `0x13` when not plugged and `0x16` when plugged.

## Runtime threads and queues

Core0 runs TinyUSB, BT polling, HID input, and `audio_loop()`.

Core1 runs one tight loop:

```cpp
while (true) {
    speaker_proc();
    mic_proc();
}
```

There is no sleep, watchdog, health check, generation number, stream timeout, or host heartbeat in the audio core1 loop.

Queues:

- `audio_fifo`: `audio_raw_element`, depth 2.
- `mic_fifo`: `mic_element`, depth 2.
- `mic_decode_fifo`: `mic_decode_element`, depth 2.
- BT `send_fifo`: `send_element`, depth 10.

Queue overflow policy:

- `audio_fifo` full: drop oldest, add newest.
- `mic_fifo` full: drop oldest, add newest.
- `mic_decode_fifo` full: drop oldest, add newest.
- BT `send_fifo` full: print error and drop the packet being enqueued.

Concurrency:

- `opus_buf` is protected by `opus_cs`.
- `audio_fifo`, `mic_fifo`, and `mic_decode_fifo` use Pico `queue_t`.
- No explicit critical section wraps mic queues.

## Constants

From `DS5Dongle/src/audio.cpp`:

```cpp
#define INPUT_CHANNELS    4
#define OUTPUT_CHANNELS   2
#define SAMPLE_SIZE       64
#define REPORT_SIZE       398
#define REPORT_ID         0x36
#define MIC_CHANNELS      1
#define MIC_FRAMES        480
#define MIC_OPUS_SIZE     71
```

Other important sizes:

- `opus_buf[200]`: latest speaker Opus payload.
- `audio_core1_stack[8192]` as `uint32_t`: 32 KiB stack.
- `audio_raw_element.data[512 * 2]`: 512 stereo float frames.
- `mic_element.data[71]`: one controller mic Opus packet.
- `mic_decode_element.data[480]`: mono 10 ms frame at 48 kHz.

## Speaker and haptics path

Core0 `audio_loop()` does all USB OUT consumption and BT `0x36` packet construction.

Exact flow:

1. First, try to remove one decoded mic PCM block from `mic_decode_fifo`.
2. If present, call `tud_audio_write(mic_pb.data, mic_pb.len)`.
3. If TinyUSB reports no speaker OUT bytes (`!tud_audio_available()`), return.
4. Read up to 384 bytes:

   ```cpp
   int16_t raw[192];
   uint32_t bytes_read = tud_audio_read(raw, sizeof(raw));
   int frames = bytes_read / (4 * sizeof(int16_t));
   ```

5. Prepare the haptic resampler:

   ```cpp
   int nframes = resampler.ResamplePrepare(frames, 2, &in_buf);
   ```

6. For `i = 0; i < nframes; i++`:
   - Speaker samples:
     - left = `raw[i * 4] / 32768.0f`
     - right = `raw[i * 4 + 1] / 32768.0f`
   - Append speaker samples to a static `audio_buf`.
   - When `audio_buf` reaches 512 stereo frames, copy to `audio_fifo`.
   - Haptics samples:
     - left = clamp(`raw[i * 4 + 2] / 32768.0f * haptics_gain`, -1, 1)
     - right = clamp(`raw[i * 4 + 3] / 32768.0f * haptics_gain`, -1, 1)
   - Write haptics into the WDL input buffer.

7. Run 48 kHz to 3 kHz haptics resampling:

   ```cpp
   out_frames = resampler.ResampleOut(out_buf, nframes, nframes / 4, 2);
   ```

8. Convert haptics float samples to signed 8-bit.
9. Accumulate 64 haptic bytes.
10. When the 64-byte haptic buffer is full, build and send one BT `0x36` packet.

Important negative space:

- No silence detection.
- No audio-recent timeout.
- No USB host mute gate.
- No USB speaker volume scaling.
- No host-render compensation.
- No fade-in or fade-out.
- No Opus-valid flag.
- No generation check.
- No PC-side replacement encoder mode.
- No fallback state machine.
- No separate speaker route primer outside the `0x36` packet itself.

## Core1 speaker encoder

`speaker_proc()` is non-blocking. It tries one queue pop per core1 loop:

1. If `audio_fifo` is empty, return.
2. Call `resampler_audio.ResamplePrepare(512, 2, &in_buf)`.
3. Copy 512 stereo float frames into the WDL input buffer.
4. Call `resampler_audio.ResampleOut(out_buf, nframes, 480, 2)`.
5. Encode exactly 480 stereo float frames:

   ```cpp
   opus_encode_float(encoder, out_buf, 480, out, 200);
   ```

6. Ignore the Opus return value.
7. Copy exactly 200 bytes from local `out[200]` to global `opus_buf[200]` under `opus_cs`.

Encoder initialization in `core1_entry()`:

- `opus_encoder_create(48000, 2, OPUS_APPLICATION_AUDIO, &error)`
- `OPUS_SET_EXPERT_FRAME_DURATION(OPUS_FRAMESIZE_10_MS)`
- `OPUS_SET_BITRATE(200 * 8 * 100)` = 160,000 bps
- `OPUS_SET_VBR(false)`
- `OPUS_SET_COMPLEXITY(0)`

Speaker resampler initialization:

- `resampler_audio.SetMode(true, 0, false)`
- `resampler_audio.SetRates(51200, 48000)`
- `resampler_audio.SetFeedMode(true)`
- `resampler_audio.Prealloc(2, 512, 480)`

The 51200 to 48000 resample is the clone's fix for speaker noise: 512 input frames become 480 Opus frames.

## BT 0x36 packet layout

The clone builds a 398-byte payload and sends it through `bt_write()`, which prepends BT HID output prefix `0xA2`, appends/fills checksum over the payload, and queues it on the BT interrupt L2CAP channel.

Payload layout:

| Offset | Length | Value |
|---:|---:|---|
| 0 | 1 | `0x36` report ID |
| 1 | 1 | `reportSeqCounter << 4`, then counter increments modulo 16 |
| 2 | 1 | `0x91` audio control section tag |
| 3 | 1 | `7` |
| 4 | 1 | `0xff`; bit 0 enables controller mic streaming |
| 5 | 1 | `audio_buffer_length` from config |
| 6 | 1 | same buffer length |
| 7 | 1 | same buffer length |
| 8 | 1 | same buffer length |
| 9 | 1 | same buffer length; clone comment says this is the byte that actually affects audio buffer length |
| 10 | 1 | `packetCounter++` |
| 11 | 1 | `0x90` state section tag |
| 12 | 1 | `63` state length |
| 13 | 63 | `state_set(pkt + 13, 63)` |
| 76 | 1 | `0x92` haptics section tag |
| 77 | 1 | `64` haptics length |
| 78 | 64 | signed 8-bit haptics samples |
| 142 | 1 | speaker section tag: `0x93` for controller speaker, `0x96` for headset |
| 143 | 1 | `200` Opus payload length |
| 144 | 200 | latest `opus_buf`, copied regardless of freshness |
| 344 | 54 | zero padding |

The clone always includes the speaker section when `DISABLE_SPEAKER_PROC` is off. It does not check whether the Opus encoder has produced a first valid frame. Before the first encode, `opus_buf` is zero-initialized static storage.

`pkt[4] = 0xff` is also the clone's mic-stream request. There is no separate controller mic enable report in the audio path. Practically, this means mic capture is primed by sending `0x36` packets.

## BT output queueing

`bt_write(data, len)`:

1. Returns immediately if `hid_interrupt_cid == 0`.
2. Builds a static `send_element`.
3. Clears 512 bytes.
4. Sets `packet.len = len + 1`.
5. Sets `packet.data[0] = 0xA2`.
6. Copies the 398-byte `0x36` payload at `packet.data + 1`.
7. Calls `fill_output_report_checksum(packet.data + 1, len)`.
8. Adds to `send_fifo`.
9. If this was the first queued packet, requests `L2CAP_EVENT_CAN_SEND_NOW`.

`L2CAP_EVENT_CAN_SEND_NOW`:

- Removes one packet from `send_fifo`.
- Sends it with `l2cap_send(hid_interrupt_cid, send_packet.data, send_packet.len)`.
- If the queue is still non-empty, requests another can-send event.

There is no audio-priority scheduler. All BT writes share `send_fifo`, depth 10.

## Controller mic path

Mic ingress is in `on_bt_data()`:

1. Only considers BT interrupt channel packets where `len > 2` and `data[1] == 0x31`.
2. Checks `data[2] >> 1 & 1`.
3. If set, treats the packet as a mic payload.
4. Calls `mic_add_queue(data + 4)`.
5. Returns immediately, so mic-payload reports do not update HID state/headset state.

`mic_add_queue()`:

- Copies exactly 71 bytes from `data + 4` into `mic_element.data`.
- If `mic_fifo` is full, drops oldest.
- Adds newest.
- Does not check USB mic streaming state.
- Does not check mute state.
- Does not check whether a host app has opened the mic.

Core1 mic decoder:

1. `mic_proc()` tries to pop one `mic_fifo` element per core1 loop.
2. If empty, returns.
3. Decodes with:

   ```cpp
   opus_decode(decoder, mic_packet.data, 71, decoded_data, 480, false);
   ```

4. On decode failure, prints and drops.
5. On success, creates `mic_decode_element`:
   - `len = decoded_samples * 1 * sizeof(int16_t)`
   - data is copied as mono PCM.
6. If `mic_decode_fifo` is full, drops oldest.
7. Adds decoded PCM.

Mic decoder initialization:

- `opus_decoder_create(48000, 1, &error)`

USB mic output:

- At the top of every `audio_loop()`, the clone tries one `mic_decode_fifo` pop.
- If a decoded block exists, it calls `tud_audio_write(mic_pb.data, mic_pb.len)`.
- It prints if the write is short.
- There is no TinyUSB FIFO threshold handling.
- There is no playout prebuffer.
- There is no packet-loss concealment.
- There is no stereo expansion.
- There is no volume scaling.
- There is no mute gating.

## What the clone does not have

These concepts do not exist in the clone audio implementation:

- Host-side Opus encoder transport.
- Vendor PCM mirror interface.
- Host audio heartbeats.
- Host stream health.
- Host fallback reason.
- Host frame generation.
- Separate duplex-active state.
- Separate mic USB streaming gate before decode.
- Mic packet drop because the host OS has not opened the mic endpoint.
- Mic PLC/concealment.
- Mic playout reservoir.
- Speaker silence tail.
- Speaker signal threshold.
- Speaker fade-in/fade-out.
- Opus packet validity gate.
- Opus generation matching.
- Speaker volume/mute scaling in the PCM samples.
- Audio-specific BT scheduler or critical queue.

## Clone-faithful matching checklist

For another firmware to closely match this clone's necessary audio behavior:

1. Enumerate the same UAC shape: 4-channel 48 kHz 16-bit OUT and mono 48 kHz 16-bit IN.
2. Keep the normal USB speaker OUT path into the Pico. Do not replace it with a host-side Opus path.
3. Read speaker OUT PCM directly from TinyUSB.
4. Treat channels 0/1 as speaker, channels 2/3 as haptics.
5. Feed speaker ch0/ch1 directly to a 512 stereo float FIFO with no signal gate or volume scaling.
6. On core1, resample 512 stereo frames at 51200 Hz to 480 stereo frames at 48000 Hz.
7. Encode 480 stereo frames with Opus at 48 kHz, stereo, `OPUS_APPLICATION_AUDIO`, 10 ms, 160 kbps, CBR, complexity 0.
8. Store the latest 200 bytes in a global Opus buffer, even if the encode return value is ignored.
9. Build a `0x36` packet whenever the 64-byte haptic buffer fills.
10. Always include state, haptics, and the 200-byte speaker section in that `0x36`.
11. Set `pkt[4] = 0xff` in every `0x36` so controller mic streaming is requested.
12. Request headset vs speaker output only by switching speaker section tag between `0x93` and `0x96`.
13. Accept controller mic packets from BT `0x31` interrupt reports when `data[2]` bit 1 is set.
14. Copy the 71-byte mic Opus payload from `data + 4`.
15. Decode mic Opus on core1 with a 48 kHz mono decoder into 480 max samples.
16. Write decoded mono PCM to TinyUSB audio IN from core0.
17. Do not drop mic packets just because USB mic streaming is not active.
18. Run `audio_loop()`, `core1_entry()`, `speaker_proc()`, `mic_proc()`, WDL hot paths, and libopus hot code from RAM.
19. Keep queues tiny and drop oldest on overflow.
20. Do not add health/fallback/generation gates until the clone behavior is proven working first.

## Practical diagnostic implications

If matching this clone, the most important runtime signs are:

- `0x36` packets must flow whenever USB OUT audio is flowing.
- `0x36` must include `pkt[4] = 0xff`.
- The speaker section must be present, with length 200, even during startup.
- `opus_buf` should be overwritten continuously by core1 once `audio_fifo` receives its first 512 stereo frames.
- Controller mic packets should be queued and decoded regardless of whether the host OS has opened the mic endpoint.
- USB mic writes may be short or ineffective until the host opens the IN stream, but mic decode should still happen before that.

The clone is simple and permissive. It wins by keeping the hot path in RAM and avoiding extra gates around audio flow.
