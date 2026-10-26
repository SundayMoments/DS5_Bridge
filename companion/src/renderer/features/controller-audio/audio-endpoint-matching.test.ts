import { describe, expect, it } from 'vitest';
import {
  bridgeAudioInputLabelScore,
  bridgeAudioOutputLabelScore,
  isBridgeAudioDeviceLabel,
  normalizeAudioDeviceLabel
} from './audio-endpoint-matching';

describe('renderer audio endpoint matching', () => {
  it.each([
    'Speakers (DualSense Wireless Controller)',
    'Microphone (DualSense Edge Wireless Controller)',
    'Headset Earphone (Wireless Controller)',
    'Headset Microphone (Xbox 360 Controller for Windows)',
    'Speakers (Xbox 360 Controller for Windows)',
    'DS5 Bridge Audio'
  ])('recognizes bridge persona endpoint %s', (label) => {
    expect(isBridgeAudioDeviceLabel(label)).toBe(true);
  });

  it.each([
    'Microphone (Yeti Classic)',
    'Speakers (Realtek(R) Audio)',
    'Xbox Wireless Headset'
  ])('rejects unrelated endpoint %s', (label) => {
    expect(isBridgeAudioDeviceLabel(label)).toBe(false);
  });

  it('normalizes Windows endpoint prefixes and whitespace', () => {
    expect(normalizeAudioDeviceLabel('  2 -  Headset   Microphone (Xbox 360 Controller for Windows) '))
      .toBe('headset microphone (xbox 360 controller for windows)');
  });

  it('prefers capture labels for input and playback labels for output', () => {
    const input = 'Headset Microphone (Xbox 360 Controller for Windows)';
    const output = 'Speakers (Xbox 360 Controller for Windows)';

    expect(bridgeAudioInputLabelScore(input)).toBeGreaterThan(bridgeAudioInputLabelScore(output));
    expect(bridgeAudioOutputLabelScore(output)).toBeGreaterThan(bridgeAudioOutputLabelScore(input));
  });
});
