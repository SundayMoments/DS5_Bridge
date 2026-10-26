import type { ControllerProfileSettings, MuteButtonMode, MuteKeyboardBehavior, PollingRateMode } from '@shared/protocol';
import type { BridgeSnapshot } from '@shared/types';

export const MUTE_KEY_OPTIONS: Array<[string, number]> = [
  ['F1', 0x3A], ['F2', 0x3B], ['F3', 0x3C], ['F4', 0x3D], ['F5', 0x3E], ['F6', 0x3F],
  ['F7', 0x40], ['F8', 0x41], ['F9', 0x42], ['F10', 0x43], ['F11', 0x44], ['F12', 0x45],
  ['F13', 0x68], ['F14', 0x69], ['F15', 0x6A], ['F16', 0x6B], ['F17', 0x6C], ['F18', 0x6D],
  ['F19', 0x6E], ['F20', 0x6F], ['F21', 0x70], ['F22', 0x71], ['F23', 0x72], ['F24', 0x73],
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter, index) => [letter, 0x04 + index] as [string, number]),
  ['1', 0x1E], ['2', 0x1F], ['3', 0x20], ['4', 0x21], ['5', 0x22],
  ['6', 0x23], ['7', 0x24], ['8', 0x25], ['9', 0x26], ['0', 0x27],
  ['Enter', 0x28], ['Escape', 0x29], ['Backspace', 0x2A], ['Tab', 0x2B], ['Space', 0x2C],
  ['-', 0x2D], ['=', 0x2E], ['[', 0x2F], [']', 0x30], ['\\', 0x31],
  [';', 0x33], ["'", 0x34], ['`', 0x35], [',', 0x36], ['.', 0x37], ['/', 0x38],
  ['Insert', 0x49], ['Home', 0x4A], ['Page Up', 0x4B], ['Delete', 0x4C], ['End', 0x4D], ['Page Down', 0x4E],
  ['Right Arrow', 0x4F], ['Left Arrow', 0x50], ['Down Arrow', 0x51], ['Up Arrow', 0x52]
];
export const MUTE_MODIFIER_OPTIONS: Array<[string, number]> = [
  ['Ctrl', 0x01],
  ['Shift', 0x02],
  ['Alt', 0x04],
  ['Win', 0x08]
];
export const MUTE_BUTTON_MODE_OPTIONS: Array<[string, MuteButtonMode]> = [
  ['Normal', 'normal'],
  ['Keyboard Key', 'keyboard'],
  ['Quiet Toggle', 'quiet'],
  ['Chord', 'chord']
];
export const MUTE_KEYBOARD_BEHAVIOR_OPTIONS: Array<[string, MuteKeyboardBehavior]> = [
  ['Tap Once', 'tap'],
  ['Hold While Pressed', 'hold']
];
export const POLLING_RATE_OPTIONS: Array<[string, PollingRateMode]> = [
  ['1000 Hz / Real-time', '1000'],
  ['500 Hz', '500'],
  ['250 Hz', '250']
];
export function controllerProfileSettingsFromSnapshot(snapshot: BridgeSnapshot): ControllerProfileSettings {
  return {
    leftStickRadialDeadzonePercent: snapshot.settings.leftStickRadialDeadzonePercent,
    rightStickRadialDeadzonePercent: snapshot.settings.rightStickRadialDeadzonePercent,
    hapticsEnabled: snapshot.settings.hapticsEnabled,
    hapticsGainPercent: snapshot.settings.hapticsGainPercent,
    feedbackBoostEnabled: snapshot.settings.feedbackBoostEnabled,
    classicRumbleEnabled: snapshot.settings.classicRumbleEnabled,
    classicRumbleGainPercent: snapshot.settings.classicRumbleGainPercent,
    classicRumbleV1Enabled: snapshot.settings.classicRumbleV1Enabled,
    adaptiveTriggersEnabled: snapshot.settings.adaptiveTriggersEnabled,
    triggerEffectIntensityPercent: snapshot.settings.triggerEffectIntensityPercent,
    triggerTestMode: snapshot.settings.triggerTestMode,
    speakerEnabled: snapshot.settings.speakerEnabled,
    speakerVolumePercent: snapshot.settings.speakerVolumePercent,
    micVolumePercent: snapshot.settings.micVolumePercent,
    micMuted: snapshot.settings.micMuted,
    lightbarEnabled: snapshot.settings.lightbarEnabled,
    lightbarColor: snapshot.settings.lightbarColor,
    lightbarBrightnessPercent: snapshot.settings.lightbarBrightnessPercent,
    lightbarOverrideEnabled: snapshot.settings.lightbarOverrideEnabled,
    muteButtonMode: snapshot.settings.muteButtonMode,
    muteKeyboardUsage: snapshot.settings.muteKeyboardUsage,
    muteKeyboardModifiers: snapshot.settings.muteKeyboardModifiers,
    muteKeyboardBehavior: snapshot.settings.muteKeyboardBehavior,
    muteKeyboardChordStarterEnabled: snapshot.settings.muteKeyboardChordStarterEnabled,
    edgeProfileSwitchingBlocked: snapshot.settings.edgeProfileSwitchingBlocked,
    sleepKeybindEnabled: snapshot.settings.sleepKeybindEnabled,
    speakerVolumeShortcutEnabled: snapshot.settings.speakerVolumeShortcutEnabled,
    pollingRateMode: snapshot.settings.pollingRateMode,
    hostPersonaMode: snapshot.settings.hostPersonaMode,
    duplexMicEnabled: snapshot.settings.duplexMicEnabled,
    audioReactiveHapticsEnabled: snapshot.settings.audioReactiveHapticsEnabled,
    audioReactiveHapticsSource: snapshot.settings.audioReactiveHapticsSource,
    audioReactiveHapticsMode: snapshot.settings.audioReactiveHapticsMode,
    audioReactiveHapticsGainPercent: snapshot.settings.audioReactiveHapticsGainPercent,
    audioReactiveHapticsBassFocus: snapshot.settings.audioReactiveHapticsBassFocus,
    audioReactiveHapticsResponse: snapshot.settings.audioReactiveHapticsResponse,
    audioReactiveHapticsAttack: snapshot.settings.audioReactiveHapticsAttack,
    audioReactiveHapticsRelease: snapshot.settings.audioReactiveHapticsRelease,
    controllerPowerSavingEnabled: snapshot.settings.controllerPowerSavingEnabled
  };
}

export function optionLabel<T extends string | number>(options: Array<[string, T]>, value: T): string {
  return options.find(([, optionValue]) => optionValue === value)?.[0] ?? String(value);
}

export function enabledLabel(enabled: boolean): string {
  return enabled ? 'On' : 'Off';
}

export function percentLabel(value: number): string {
  return `${value}%`;
}

export function muteButtonSummary(settings: ControllerProfileSettings): string {
  if (settings.muteButtonMode === 'normal') {
    return 'Normal';
  }
  if (settings.muteButtonMode === 'quiet') {
    return 'Quiet Toggle';
  }
  const key = optionLabel(MUTE_KEY_OPTIONS, settings.muteKeyboardUsage);
  const modifiers = MUTE_MODIFIER_OPTIONS
    .filter(([, bit]) => (settings.muteKeyboardModifiers & bit) !== 0)
    .map(([label]) => label);
  const chordStarter = settings.muteButtonMode === 'keyboard' && settings.muteKeyboardChordStarterEnabled
    ? ['Chord Starter']
    : [];
  return [...modifiers, key, ...chordStarter].join(' + ');
}

export function hexByte(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}
