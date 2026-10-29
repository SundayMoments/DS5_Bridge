import type { TablerIcon } from '@tabler/icons-react';
import { IconMicrophoneOff as MicOff } from '@tabler/icons-react';
import {
  CHORD_CONTROLLER_SETTING_STEP_DEFAULT,
  CHORD_MUTE_STARTER_ID,
  MAX_CHORD_FUNCTION_NAME_LENGTH,
  MAX_KEYBOARD_FUNCTION_KEYS,
  normalizeChordControllerSettingStepPercent,
  type ChordAssignableButtonId,
  type ChordAssignment,
  type ChordControllerSettingAction,
  type ChordFunction,
  type ChordFunctionType,
  type ChordMediaAction,
  type ChordStarterId
} from '@shared/protocol';
import { REMAP_BUTTONS, REMAP_STANDARD_TARGET_BUTTON_IDS, psHomeGlyphUrl } from '../button-remapping/remap-buttons';

export type ChordStarterDefinition = {
  id: ChordStarterId;
  label: string;
  glyphUrl?: string;
  textGlyph?: string;
  Icon?: TablerIcon;
};

export type ChordFunctionDraft = {
  id: string;
  name: string;
  type: ChordFunctionType;
  keyboardKey: string;
  keyboardModifiers: ChordKeyboardModifier[];
  mediaAction: ChordMediaAction;
  controllerAction: ChordControllerSettingAction;
  controllerStepPercent: number;
};
export type ChordKeyboardModifier = 'Ctrl' | 'Shift' | 'Alt' | 'Win';
export type ChordNotchTargetId = 'speaker' | 'mic' | 'haptics' | 'rumble' | 'triggers' | 'lighting';
export type ChordNotchDirection = 'down' | 'up';
export type ChordNotchAction = Extract<ChordControllerSettingAction, `${ChordNotchTargetId}-${ChordNotchDirection}`>;
export type ChordControllerSettingSelectValue = Exclude<ChordControllerSettingAction, ChordNotchAction> | ChordNotchTargetId;
export type ChordFunctionDialogMode = 'rename' | 'delete';
export type ChordFunctionDialogState = {
  mode: ChordFunctionDialogMode;
  functionId: string;
};
export const CHORD_UNASSIGNED_BUTTON = '__unassigned__';
export type ChordButtonSelectValue = ChordAssignableButtonId | typeof CHORD_UNASSIGNED_BUTTON;
export type ChordAssignmentDraftRow = {
  id: string;
  starter: ChordStarterId;
  button: ChordAssignableButtonId | null;
  functionId: string;
};
export type ChordAssignmentDropHint = {
  targetId: string;
  placement: 'before' | 'after';
};
export type ChordAssignmentDragSession = {
  active: boolean;
  id: string;
  offsetX: number;
  offsetY: number;
  overlay: HTMLElement | null;
  startX: number;
  startY: number;
  cleanup: () => void;
  dropHint: ChordAssignmentDropHint | null;
};
export type ChordAssignmentScrollbarState = {
  visible: boolean;
  top: number;
  height: number;
};

export const CHORD_BUTTON_MENU_IDS: ChordAssignableButtonId[] = [
  ...REMAP_STANDARD_TARGET_BUTTON_IDS,
  'lb',
  'rb'
];

export const CHORD_STARTERS: Record<ChordStarterId, ChordStarterDefinition> = {
  ps: { id: 'ps', label: 'PS Button', glyphUrl: psHomeGlyphUrl },
  lfn: { id: 'lfn', label: 'LFN', textGlyph: 'LFN' },
  rfn: { id: 'rfn', label: 'RFN', textGlyph: 'RFN' },
  mute: { id: CHORD_MUTE_STARTER_ID, label: 'Mute Button', Icon: MicOff }
};
export const CHORD_STARTER_OPTIONS: Array<[string, ChordStarterId]> = [
  [CHORD_STARTERS.ps.label, 'ps'],
  [CHORD_STARTERS.lfn.label, 'lfn'],
  [CHORD_STARTERS.rfn.label, 'rfn'],
  [CHORD_STARTERS.mute.label, CHORD_MUTE_STARTER_ID]
];
export const CHORD_FUNCTION_TYPE_OPTIONS: Array<[string, ChordFunctionType]> = [
  ['Keyboard Shortcut', 'keyboard'],
  ['Media Action', 'media'],
  ['Controller Setting', 'controller-setting']
];
export const CHORD_MEDIA_ACTION_OPTIONS: Array<[string, ChordMediaAction]> = [
  ['Play / Pause', 'play-pause'],
  ['Next Track', 'next-track'],
  ['Previous Track', 'previous-track'],
  ['Mute Output', 'mute'],
  ['Volume Up', 'volume-up'],
  ['Volume Down', 'volume-down']
];
export const CHORD_NOTCH_TARGETS: Array<{
  id: ChordNotchTargetId;
  label: string;
  downAction: ChordNotchAction;
  upAction: ChordNotchAction;
}> = [
  { id: 'speaker', label: 'Speaker', downAction: 'speaker-down', upAction: 'speaker-up' },
  { id: 'mic', label: 'Mic', downAction: 'mic-down', upAction: 'mic-up' },
  { id: 'haptics', label: 'Haptics', downAction: 'haptics-down', upAction: 'haptics-up' },
  { id: 'rumble', label: 'Rumble', downAction: 'rumble-down', upAction: 'rumble-up' },
  { id: 'triggers', label: 'Triggers', downAction: 'triggers-down', upAction: 'triggers-up' },
  { id: 'lighting', label: 'Lighting', downAction: 'lighting-down', upAction: 'lighting-up' }
];
export const CHORD_CONTROLLER_SETTING_ACTION_OPTIONS: Array<[string, ChordControllerSettingSelectValue]> = [
  ['Audio Haptics', 'toggle-audio-haptics'],
  ['Lightbar Override', 'toggle-lightbar-override'],
  ['Mic Mute', 'toggle-mic-mute'],
  ['Sleep Controller', 'sleep-controller'],
  ['Show Battery', 'show-battery'],
  ['DualSense', 'persona-dualsense'],
  ['DualSense Edge', 'persona-dualsense-edge'],
  ['DualShock 4', 'persona-ds4'],
  ['Xbox', 'persona-xbox'],
  ...CHORD_NOTCH_TARGETS.map((target): [string, ChordNotchTargetId] => [target.label, target.id])
];
export const CHORD_KEYBOARD_KEY_OPTIONS: Array<[string, string]> = [
  // A modifier-only shortcut, such as Ctrl+Shift.
  ['None', ''],
  ['Esc', 'Esc'],
  ['Enter', 'Enter'],
  ['Space', 'Space'],
  ['Tab', 'Tab'],
  ['Backspace', 'Backspace'],
  ['Delete', 'Delete'],
  ['Insert', 'Insert'],
  ['Home', 'Home'],
  ['End', 'End'],
  ['Page Up', 'Page Up'],
  ['Page Down', 'Page Down'],
  ['Up Arrow', 'Up'],
  ['Down Arrow', 'Down'],
  ['Left Arrow', 'Left'],
  ['Right Arrow', 'Right'],
  ['Print Screen', 'Print Screen'],
  ['Pause', 'Pause'],
  ['Caps Lock', 'Caps Lock'],
  ['Num Lock', 'Num Lock'],
  ['Scroll Lock', 'Scroll Lock'],
  ['Menu', 'Menu'],
  ...Array.from({ length: 24 }, (_, index): [string, string] => [`F${index + 1}`, `F${index + 1}`]),
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter): [string, string] => [letter, letter]),
  ...'1234567890'.split('').map((digit): [string, string] => [digit, digit]),
  ...'0123456789'.split('').map((digit): [string, string] => [`Numpad ${digit}`, `Numpad${digit}`])
];
export const CHORD_KEYBOARD_KEY_MAX_LABEL_LENGTH = Math.max(
  ...CHORD_KEYBOARD_KEY_OPTIONS.map(([label]) => label.length)
);
export const CHORD_KEYBOARD_MODIFIER_OPTIONS: Array<[ChordKeyboardModifier, ChordKeyboardModifier]> = [
  ['Ctrl', 'Ctrl'],
  ['Shift', 'Shift'],
  ['Alt', 'Alt'],
  ['Win', 'Win']
];
export const DEFAULT_CHORD_KEYBOARD_KEYS = ['Ctrl', 'Shift', 'Esc'];
export const EMPTY_CHORD_FUNCTION_DRAFT: ChordFunctionDraft = {
  id: '',
  name: 'Task Manager',
  type: 'keyboard',
  keyboardKey: 'Esc',
  keyboardModifiers: ['Ctrl', 'Shift'],
  mediaAction: 'play-pause',
  controllerAction: 'sleep-controller',
  controllerStepPercent: CHORD_CONTROLLER_SETTING_STEP_DEFAULT
};

export function chordFunctionTypeLabel(type: ChordFunctionType): string {
  return CHORD_FUNCTION_TYPE_OPTIONS.find(([, value]) => value === type)?.[0] ?? 'Function';
}

export function chordMediaActionLabel(action: ChordMediaAction): string {
  return CHORD_MEDIA_ACTION_OPTIONS.find(([, value]) => value === action)?.[0] ?? 'Media Action';
}

export function chordNotchTargetForAction(action: ChordControllerSettingAction): {
  target: (typeof CHORD_NOTCH_TARGETS)[number];
  direction: ChordNotchDirection;
} | null {
  for (const target of CHORD_NOTCH_TARGETS) {
    if (target.downAction === action) {
      return { target, direction: 'down' };
    }
    if (target.upAction === action) {
      return { target, direction: 'up' };
    }
  }
  return null;
}

export function chordControllerSettingSelectValue(action: ChordControllerSettingAction): ChordControllerSettingSelectValue {
  const notchTarget = chordNotchTargetForAction(action);
  if (notchTarget) {
    return notchTarget.target.id;
  }
  return action as ChordControllerSettingSelectValue;
}

export function chordControllerSettingActionFromSelectValue(
  value: ChordControllerSettingSelectValue,
  currentAction: ChordControllerSettingAction
): ChordControllerSettingAction {
  const target = CHORD_NOTCH_TARGETS.find((candidate) => candidate.id === value);
  if (!target) {
    return value as ChordControllerSettingAction;
  }
  const currentTarget = chordNotchTargetForAction(currentAction);
  return currentTarget?.target.id === target.id && currentTarget.direction === 'down'
    ? target.downAction
    : target.upAction;
}

export function chordControllerSettingActionLabel(action: ChordControllerSettingAction): string {
  const notchTarget = chordNotchTargetForAction(action);
  if (notchTarget) {
    return notchTarget.target.label;
  }
  return CHORD_CONTROLLER_SETTING_ACTION_OPTIONS.find(([, value]) => value === action)?.[0] ?? 'Controller Setting';
}

export function chordControllerSettingSummary(action: ChordControllerSettingAction, stepPercent?: number): string {
  const notchTarget = chordNotchTargetForAction(action);
  if (notchTarget) {
    const actionText = `${notchTarget.direction === 'up' ? 'Increase' : 'Decrease'} ${notchTarget.target.label}`;
    return typeof stepPercent === 'number'
      ? `${actionText} — ${stepPercent}% step`
      : actionText;
  }
  switch (action) {
    case 'toggle-audio-haptics':
      return 'Toggle Audio Haptics';
    case 'toggle-lightbar-override':
      return 'Toggle Lightbar Override';
    case 'toggle-mic-mute':
      return 'Toggle Mic Mute';
    case 'sleep-controller':
      return 'Sleep Controller';
    case 'show-battery':
      return 'Show Battery Level';
    case 'persona-dualsense':
      return 'Set Persona: DualSense';
    case 'persona-dualsense-edge':
      return 'Set Persona: DualSense Edge';
    case 'persona-ds4':
      return 'Set Persona: DualShock 4';
    case 'persona-xbox':
      return 'Set Persona: Xbox';
  }
  return 'Controller Setting';
}

export function chordControllerSettingAdjustmentText(action: ChordControllerSettingAction): string {
  const notchTarget = chordNotchTargetForAction(action);
  if (!notchTarget) {
    return chordControllerSettingSummary(action);
  }
  return `${notchTarget.direction === 'up' ? 'Increase' : 'Decrease'} ${notchTarget.target.label}`;
}

export function chordStarterLabel(starter: ChordStarterId): string {
  return CHORD_STARTER_OPTIONS.find(([, value]) => value === starter)?.[0] ?? starter.toUpperCase();
}

export function chordButtonLabel(button: ChordAssignableButtonId): string {
  return REMAP_BUTTONS[button].label;
}

export function chordFunctionSummary(func: ChordFunction): string {
  switch (func.type) {
    case 'keyboard':
      return func.keys.join(' + ');
    case 'media':
      return chordMediaActionLabel(func.action);
    case 'controller-setting':
      return chordControllerSettingSummary(func.action, func.stepPercent);
  }
}

export function chordFunctionToDraft(func: ChordFunction | null): ChordFunctionDraft {
  if (!func) {
    return { ...EMPTY_CHORD_FUNCTION_DRAFT };
  }
  const keyboardParts = func.type === 'keyboard'
    ? chordKeyboardParts(func.keys)
    : chordKeyboardParts(DEFAULT_CHORD_KEYBOARD_KEYS);
  return {
    id: func.id,
    name: func.name,
    type: func.type,
    keyboardKey: keyboardParts.key,
    keyboardModifiers: keyboardParts.modifiers,
    mediaAction: func.type === 'media' ? func.action : 'play-pause',
    controllerAction: func.type === 'controller-setting' ? func.action : 'sleep-controller',
    controllerStepPercent: func.type === 'controller-setting'
      ? normalizeChordControllerSettingStepPercent(func.stepPercent)
      : CHORD_CONTROLLER_SETTING_STEP_DEFAULT
  };
}

export function normalizeChordKeyLabel(key: string): string {
  const trimmed = key.trim();
  const normalized = trimmed.replace(/\s+/g, ' ').toLowerCase();
  switch (normalized) {
    case 'control':
    case 'ctrl':
      return 'Ctrl';
    case 'shift':
      return 'Shift';
    case 'alt':
      return 'Alt';
    case 'escape':
    case 'esc':
      return 'Esc';
    case 'windows':
    case 'win':
    case 'meta':
      return 'Win';
    case 'spacebar':
    case 'space':
      return 'Space';
    case 'left arrow':
      return 'Left';
    case 'right arrow':
      return 'Right';
    case 'up arrow':
      return 'Up';
    case 'down arrow':
      return 'Down';
    case 'print screen':
    case 'printscreen':
    case 'prtsc':
    case 'prtscn':
    case 'snapshot':
      return 'Print Screen';
    default:
      return trimmed.length === 1 ? trimmed.toUpperCase() : trimmed;
  }
}

export function chordKeyboardParts(keys: string[]): {
  key: string;
  modifiers: ChordKeyboardModifier[];
} {
  const normalizedKeys = keys.map(normalizeChordKeyLabel);
  const supportedKeys = new Set(CHORD_KEYBOARD_KEY_OPTIONS.map(([, value]) => value).filter(Boolean));
  const key = normalizedKeys.find((candidate) => supportedKeys.has(candidate)) ?? '';
  // Modifiers alone are a shortcut; only a shortcut with nothing usable falls back to Esc.
  const modifiers = CHORD_KEYBOARD_MODIFIER_OPTIONS
    .map(([, modifier]) => modifier)
    .filter((modifier) => normalizedKeys.includes(modifier))
    .slice(0, MAX_KEYBOARD_FUNCTION_KEYS - (key ? 1 : 0));
  return { key: key || (modifiers.length ? '' : 'Esc'), modifiers };
}

/** None needs a modifier; a key needs room beside the modifiers. */
export function chordKeyboardKeyUnavailable(draft: ChordFunctionDraft, key: string): boolean {
  return key === ''
    ? draft.keyboardModifiers.length === 0
    : draft.keyboardModifiers.length >= MAX_KEYBOARD_FUNCTION_KEYS;
}

/** The last modifier of a modifier-only shortcut stays on, and the four-key limit holds. */
export function chordKeyboardModifierUnavailable(draft: ChordFunctionDraft, modifier: ChordKeyboardModifier): boolean {
  return draft.keyboardModifiers.includes(modifier)
    ? draft.keyboardKey === '' && draft.keyboardModifiers.length === 1
    : draft.keyboardModifiers.length >= MAX_KEYBOARD_FUNCTION_KEYS - (draft.keyboardKey ? 1 : 0);
}

export function chordFunctionFromDraft(draft: ChordFunctionDraft): ChordFunction {
  const name = (draft.name.trim() || chordFunctionTypeLabel(draft.type)).slice(0, MAX_CHORD_FUNCTION_NAME_LENGTH);
  const id = draft.id || `function-${Date.now().toString(36)}`;
  switch (draft.type) {
    case 'keyboard':
      return {
        id,
        name,
        type: 'keyboard',
        keys: [...new Set([...draft.keyboardModifiers, draft.keyboardKey].filter(Boolean))].slice(0, MAX_KEYBOARD_FUNCTION_KEYS)
      };
    case 'media':
      return {
        id,
        name,
        type: 'media',
        action: draft.mediaAction
      };
    case 'controller-setting':
      return {
        id,
        name,
        type: 'controller-setting',
        action: draft.controllerAction,
        stepPercent: normalizeChordControllerSettingStepPercent(draft.controllerStepPercent)
      };
  }
}

export function chordAssignmentLabel(assignment: ChordAssignment): string {
  return `${chordStarterLabel(assignment.starter)} + ${chordButtonLabel(assignment.button)}`;
}

export function chordBindingKey(starter: ChordStarterId, button: ChordAssignableButtonId): string {
  return `chord:${starter}:${button}`;
}

export function chordAssignmentKey(assignment: ChordAssignment): string {
  return chordBindingKey(assignment.starter, assignment.button);
}

export function createChordAssignmentId(starter: ChordStarterId, button: ChordAssignableButtonId): string {
  return `chord-${starter}-${button}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
