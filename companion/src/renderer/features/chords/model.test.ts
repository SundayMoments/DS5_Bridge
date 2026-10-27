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
  chordKeyboardKeyUnavailable,
  chordKeyboardModifierUnavailable,
  chordKeyboardParts,
  normalizeChordKeyLabel
} from './model';
import type { ChordFunction } from '@shared/protocol';

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

  it.each([['Ctrl'], ['Alt', 'Win'], ['Ctrl', 'Shift', 'Alt', 'Win']])('round-trips modifier-only keys %j without adding Escape', (...keys) => {
    const func: ChordFunction = { id: 'modifiers', name: 'Modifiers', type: 'keyboard', keys };
    const draft = chordFunctionToDraft(func);
    expect(draft.keyboardKey).toBe('');
    expect(draft.keyboardModifiers).toEqual(keys);
    expect(chordFunctionFromDraft(draft)).toEqual(func);
    expect(chordFunctionSummary(func)).toBe(keys.join(' + '));
  });

  it('offers None as a key and reads lowercase modifiers', () => {
    expect(CHORD_KEYBOARD_KEY_OPTIONS[0]).toEqual(['None', '']);
    expect(chordKeyboardParts(['control', 'shift', 'alt', 'meta'])).toEqual({ key: '', modifiers: ['Ctrl', 'Shift', 'Alt', 'Win'] });
    expect(chordKeyboardParts(['alt', 'Win', 'Win'])).toEqual({ key: '', modifiers: ['Alt', 'Win'] });
    // Nothing usable at all still falls back to Esc.
    expect(chordKeyboardParts(['Bogus'])).toEqual({ key: 'Esc', modifiers: [] });
  });

  it('keeps a shortcut non-empty and within four keys', () => {
    const draft = { ...chordFunctionToDraft(null), keyboardKey: 'A', keyboardModifiers: [] as Array<'Ctrl' | 'Shift' | 'Alt' | 'Win'> };
    // None needs at least one modifier.
    expect(chordKeyboardKeyUnavailable(draft, '')).toBe(true);
    expect(chordKeyboardKeyUnavailable({ ...draft, keyboardModifiers: ['Ctrl'] }, '')).toBe(false);
    // The last modifier of a modifier-only shortcut cannot be turned off.
    expect(chordKeyboardModifierUnavailable({ ...draft, keyboardKey: '', keyboardModifiers: ['Ctrl'] }, 'Ctrl')).toBe(true);
    // With a key, three modifiers fill the four keys; with None, all four modifiers fit.
    expect(chordKeyboardModifierUnavailable({ ...draft, keyboardModifiers: ['Ctrl', 'Shift', 'Alt'] }, 'Win')).toBe(true);
    expect(chordKeyboardModifierUnavailable({ ...draft, keyboardKey: '', keyboardModifiers: ['Ctrl', 'Shift', 'Alt'] }, 'Win')).toBe(false);
    expect(chordKeyboardKeyUnavailable({ ...draft, keyboardKey: '', keyboardModifiers: ['Ctrl', 'Shift', 'Alt', 'Win'] }, 'A')).toBe(true);
  });
});
