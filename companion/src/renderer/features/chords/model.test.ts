import { describe, expect, it } from 'vitest';
import { IconMicrophoneOff } from '@tabler/icons-react';
import { CHORD_MUTE_STARTER_ID } from '@shared/protocol';
import {
  CHORD_CONTROLLER_SETTING_ACTION_OPTIONS,
  CHORD_KEYBOARD_KEY_OPTIONS,
  CHORD_STARTERS,
  CHORD_STARTER_OPTIONS,
  chordFunctionFromDraft,
  chordFunctionSummary,
  chordFunctionToDraft,
  normalizeChordKeyLabel
} from './model';

describe('chord model', () => {
  it('offers Print Screen and numpad numerals as keyboard shortcut keys', () => {
    expect(CHORD_KEYBOARD_KEY_OPTIONS).toContainEqual(['Print Screen', 'Print Screen']);
    for (const digit of '0123456789') {
      expect(CHORD_KEYBOARD_KEY_OPTIONS).toContainEqual([`Numpad ${digit}`, `Numpad${digit}`]);
    }
    for (const alias of ['print screen', 'printscreen', 'prtsc', 'prtscn', 'PrtSc']) {
      expect(normalizeChordKeyLabel(alias)).toBe('Print Screen');
    }
  });

  it('defines the mute button as an icon starter', () => {
    expect(CHORD_STARTERS.mute).toEqual({ id: CHORD_MUTE_STARTER_ID, label: 'Mute Button', Icon: IconMicrophoneOff });
    expect(CHORD_STARTER_OPTIONS).toContainEqual(['Mute Button', CHORD_MUTE_STARTER_ID]);
  });

  it('offers every host persona as a controller setting action', () => {
    expect(CHORD_CONTROLLER_SETTING_ACTION_OPTIONS).toEqual(expect.arrayContaining([
      ['DualSense', 'persona-dualsense'],
      ['DualSense Edge', 'persona-dualsense-edge'],
      ['DualShock 4', 'persona-ds4'],
      ['Xbox', 'persona-xbox']
    ]));
  });

  it('round-trips a keyboard function through its editor draft', () => {
    const draft = chordFunctionToDraft(null);
    const func = chordFunctionFromDraft({ ...draft, id: 'task-manager' });
    expect(chordFunctionToDraft(func)).toEqual({ ...draft, id: 'task-manager' });
    expect(chordFunctionSummary(func)).toContain('Esc');
  });
});
