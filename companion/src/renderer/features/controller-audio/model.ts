// Speaker, microphone, and audio buffer settings for the Audio page.

export const SPEAKER_VOLUME_STEP = 10;
export const MIC_VOLUME_STEP = 10;
export const AUDIO_BUFFER_LENGTH_MIN = 16;
export const AUDIO_BUFFER_LENGTH_MAX = 128;
export const AUDIO_BUFFER_LENGTH_HIGH_STUTTER_MAX = 44;
export const AUDIO_BUFFER_LENGTH_RISKY_MAX = 63;

export const TEST_SPEAKER_LOCK_MS = 900;
export const TEST_MIC_LISTEN_MS = 5000;
export const TEST_SPEAKER_VOLUME_SETTLE_MS = 90;
export const TEST_SPEAKER_ENDPOINT_ATTEMPTS = 12;
export const TEST_SPEAKER_ENDPOINT_RETRY_MS = 150;
export const TEST_SPEAKER_ENDPOINT_REFRESH_MS = 1500;
export const TEST_SPEAKER_ENDPOINT_VERIFY_MS = 100;
export const TEST_SPEAKER_PREROLL_MS = 220;

export const SPEAKER_VOLUME_PRESETS: Array<[string, number]> = [
  ['Low', 30],
  ['Medium', 70],
  ['High', 100]
];
export const MIC_VOLUME_PRESETS: Array<[string, number]> = [
  ['Low', 30],
  ['Medium', 70],
  ['High', 100]
];

export const BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE = 'Controller audio endpoint unavailable';
export const BRIDGE_MIC_ENDPOINT_UNAVAILABLE = 'Controller microphone unavailable';

export const SPEAKER_GAIN_OPTIONS: Array<[string, number]> = [
  ['1', 1],
  ['2', 2],
  ['3', 3],
  ['4', 4],
  ['5', 5],
  ['6', 6],
  ['7', 7]
];

export function snapSpeakerVolume(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / SPEAKER_VOLUME_STEP) * SPEAKER_VOLUME_STEP));
}

export function snapMicVolume(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / MIC_VOLUME_STEP) * MIC_VOLUME_STEP));
}

export function clampAudioBufferLength(value: number): number {
  if (!Number.isFinite(value)) {
    return 64;
  }
  return Math.max(AUDIO_BUFFER_LENGTH_MIN, Math.min(AUDIO_BUFFER_LENGTH_MAX, Math.round(value)));
}

export function audioBufferDelayMs(value: number): number {
  return clampAudioBufferLength(value) / 3;
}

export function audioBufferDelayLabel(value: number): string {
  return `${audioBufferDelayMs(value).toFixed(1)} ms`;
}

export function audioBufferPercent(value: number): number {
  return ((clampAudioBufferLength(value) - AUDIO_BUFFER_LENGTH_MIN) / (AUDIO_BUFFER_LENGTH_MAX - AUDIO_BUFFER_LENGTH_MIN)) * 100;
}

export function audioBufferZoneLabel(value: number): string {
  const bufferLength = clampAudioBufferLength(value);
  if (bufferLength <= AUDIO_BUFFER_LENGTH_HIGH_STUTTER_MAX) {
    return 'High stutter';
  }
  if (bufferLength <= AUDIO_BUFFER_LENGTH_RISKY_MAX) {
    return 'Risky';
  }
  return 'Safe';
}

export function audioBufferZoneTooltip(value: number): string {
  const bufferLength = clampAudioBufferLength(value);
  if (bufferLength <= AUDIO_BUFFER_LENGTH_HIGH_STUTTER_MAX) {
    return 'Danger: lowest haptic delay, but speaker audio is likely to stutter or underrun.';
  }
  if (bufferLength <= AUDIO_BUFFER_LENGTH_RISKY_MAX) {
    return 'Warning: lower haptic delay, with a minimal chance of speaker stutter under load.';
  }
  return 'Safe: more speaker buffer headroom, with higher DualSense haptic delay.';
}

export function audioBufferZoneTone(value: number): 'stutter' | 'risky' | 'safe' {
  const bufferLength = clampAudioBufferLength(value);
  if (bufferLength <= AUDIO_BUFFER_LENGTH_HIGH_STUTTER_MAX) {
    return 'stutter';
  }
  if (bufferLength <= AUDIO_BUFFER_LENGTH_RISKY_MAX) {
    return 'risky';
  }
  return 'safe';
}
