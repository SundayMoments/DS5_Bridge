import fs from 'node:fs';
import path from 'node:path';
import {
  CHORD_ASSIGNABLE_BUTTON_IDS,
  CHORD_STARTER_IDS,
  DEFAULT_BUTTON_REMAP_PROFILE,
  DEFAULT_BUTTON_REMAP_PROFILE_ID,
  DEFAULT_CONTROLLER_PROFILE_ID,
  MAX_CHORD_ASSIGNMENTS,
  MAX_CHORD_FUNCTION_NAME_LENGTH,
  MAX_KEYBOARD_FUNCTION_KEYS,
  REMAP_BUTTON_IDS,
  defaultChordControllerSettingStepPercent,
  isChordBindingAllowed,
  isRemapButtonId,
  normalizeChordControllerSettingStepPercent,
  normalizeBridgePresetId
} from '../shared/protocol';
import type {
  BridgePresetId,
  ButtonRemapMap,
  ButtonRemapProfile,
  ControllerProfile,
  ControllerProfileSettings,
  AudioReactiveHapticsSource,
  AudioReactiveHapticsBassFocus,
  AudioReactiveHapticsMode,
  AudioReactiveHapticsResponse,
  AudioReactiveHapticsAttack,
  AudioReactiveHapticsRelease,
  ChordAssignableButtonId,
  ChordAssignment,
  ChordControllerSettingAction,
  ChordFunction,
  ChordMediaAction,
  ChordStarterId,
  HostPersonaMode,
  RemapButtonId
} from '../shared/protocol';
import type { CompanionSettings, UiScalePercent, UiThemePreset } from '../shared/types';

const DEFAULT_CONTROLLER_PROFILE_SETTINGS: ControllerProfileSettings = {
  hapticsEnabled: true,
  hapticsGainPercent: 100,
  feedbackBoostEnabled: false,
  classicRumbleEnabled: true,
  classicRumbleGainPercent: 100,
  classicRumbleV1Enabled: false,
  adaptiveTriggersEnabled: true,
  triggerEffectIntensityPercent: 100,
  triggerTestMode: 'feedback',
  speakerEnabled: true,
  speakerVolumePercent: 100,
  micVolumePercent: 100,
  micMuted: false,
  audioReactiveHapticsEnabled: false,
  audioReactiveHapticsSource: 'system-audio',
  audioReactiveHapticsMode: 'mix',
  audioReactiveHapticsGainPercent: 100,
  audioReactiveHapticsBassFocus: 'balanced',
  audioReactiveHapticsResponse: 'balanced',
  audioReactiveHapticsAttack: 'balanced',
  audioReactiveHapticsRelease: 'balanced',
  lightbarEnabled: true,
  lightbarColor: '#0000ff',
  lightbarBrightnessPercent: 100,
  lightbarOverrideEnabled: false,
  muteButtonMode: 'normal',
  muteKeyboardUsage: 0x68,
  muteKeyboardModifiers: 0,
  muteKeyboardBehavior: 'tap',
  muteKeyboardChordStarterEnabled: false,
  sleepKeybindEnabled: false,
  speakerVolumeShortcutEnabled: false,
  pollingRateMode: '1000',
  hostPersonaMode: 'dualsense',
  duplexMicEnabled: true,
  controllerPowerSavingEnabled: false
};

const DEFAULT_CONTROLLER_PROFILE: ControllerProfile = {
  id: DEFAULT_CONTROLLER_PROFILE_ID,
  name: 'Default',
  settings: { ...DEFAULT_CONTROLLER_PROFILE_SETTINGS }
};

const CUSTOM_CONTROLLER_PROFILE_ID = 'custom';
const CUSTOM_BUTTON_REMAP_PROFILE_ID = 'custom';
const CUSTOM_CONTROLLER_PROFILE: ControllerProfile = {
  id: CUSTOM_CONTROLLER_PROFILE_ID,
  name: 'Custom',
  settings: { ...DEFAULT_CONTROLLER_PROFILE_SETTINGS }
};
const CUSTOM_BUTTON_REMAP_PROFILE: ButtonRemapProfile = {
  id: CUSTOM_BUTTON_REMAP_PROFILE_ID,
  name: 'Custom',
  mappings: cloneRemapMap(DEFAULT_BUTTON_REMAP_PROFILE.mappings)
};

const CONTROLLER_PROFILE_SETTING_KEYS = new Set<keyof ControllerProfileSettings>([
  'hapticsEnabled',
  'hapticsGainPercent',
  'feedbackBoostEnabled',
  'classicRumbleEnabled',
  'classicRumbleGainPercent',
  'classicRumbleV1Enabled',
  'adaptiveTriggersEnabled',
  'triggerEffectIntensityPercent',
  'triggerTestMode',
  'speakerEnabled',
  'speakerVolumePercent',
  'micVolumePercent',
  'micMuted',
  'audioReactiveHapticsEnabled',
  'audioReactiveHapticsSource',
  'audioReactiveHapticsMode',
  'audioReactiveHapticsGainPercent',
  'audioReactiveHapticsBassFocus',
  'audioReactiveHapticsResponse',
  'audioReactiveHapticsAttack',
  'audioReactiveHapticsRelease',
  'lightbarEnabled',
  'lightbarColor',
  'lightbarBrightnessPercent',
  'lightbarOverrideEnabled',
  'muteButtonMode',
  'muteKeyboardUsage',
  'muteKeyboardModifiers',
  'muteKeyboardBehavior',
  'muteKeyboardChordStarterEnabled',
  'sleepKeybindEnabled',
  'speakerVolumeShortcutEnabled',
  'pollingRateMode',
  'hostPersonaMode',
  'duplexMicEnabled',
  'controllerPowerSavingEnabled'
]);

export const DEFAULT_SETTINGS: CompanionSettings = {
  selectedPresetId: 'balanced',
  uiScalePercent: 100,
  uiThemePreset: 'dark',
  launchAtStartupEnabled: false,
  showBatteryPercentTrayIcon: false,
  hapticsEnabled: DEFAULT_CONTROLLER_PROFILE_SETTINGS.hapticsEnabled,
  hapticsGainPercent: DEFAULT_CONTROLLER_PROFILE_SETTINGS.hapticsGainPercent,
  feedbackBoostEnabled: DEFAULT_CONTROLLER_PROFILE_SETTINGS.feedbackBoostEnabled,
  hapticsBufferLength: 64,
  classicRumbleEnabled: DEFAULT_CONTROLLER_PROFILE_SETTINGS.classicRumbleEnabled,
  classicRumbleGainPercent: DEFAULT_CONTROLLER_PROFILE_SETTINGS.classicRumbleGainPercent,
  classicRumbleV1Enabled: DEFAULT_CONTROLLER_PROFILE_SETTINGS.classicRumbleV1Enabled,
  adaptiveTriggersEnabled: DEFAULT_CONTROLLER_PROFILE_SETTINGS.adaptiveTriggersEnabled,
  triggerEffectIntensityPercent: DEFAULT_CONTROLLER_PROFILE_SETTINGS.triggerEffectIntensityPercent,
  triggerTestMode: DEFAULT_CONTROLLER_PROFILE_SETTINGS.triggerTestMode,
  speakerEnabled: DEFAULT_CONTROLLER_PROFILE_SETTINGS.speakerEnabled,
  speakerVolumePercent: DEFAULT_CONTROLLER_PROFILE_SETTINGS.speakerVolumePercent,
  speakerGainLevel: 4,
  micVolumePercent: DEFAULT_CONTROLLER_PROFILE_SETTINGS.micVolumePercent,
  micMuted: DEFAULT_CONTROLLER_PROFILE_SETTINGS.micMuted,
  audioReactiveHapticsEnabled: DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsEnabled,
  audioReactiveHapticsSource: DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsSource,
  audioReactiveHapticsMode: DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsMode,
  audioReactiveHapticsGainPercent: DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsGainPercent,
  audioReactiveHapticsBassFocus: DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsBassFocus,
  audioReactiveHapticsResponse: DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsResponse,
  audioReactiveHapticsAttack: DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsAttack,
  audioReactiveHapticsRelease: DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsRelease,
  lightbarEnabled: DEFAULT_CONTROLLER_PROFILE_SETTINGS.lightbarEnabled,
  lightbarColor: DEFAULT_CONTROLLER_PROFILE_SETTINGS.lightbarColor,
  lightbarBrightnessPercent: DEFAULT_CONTROLLER_PROFILE_SETTINGS.lightbarBrightnessPercent,
  lightbarOverrideEnabled: DEFAULT_CONTROLLER_PROFILE_SETTINGS.lightbarOverrideEnabled,
  muteButtonMode: DEFAULT_CONTROLLER_PROFILE_SETTINGS.muteButtonMode,
  muteKeyboardUsage: DEFAULT_CONTROLLER_PROFILE_SETTINGS.muteKeyboardUsage,
  muteKeyboardModifiers: DEFAULT_CONTROLLER_PROFILE_SETTINGS.muteKeyboardModifiers,
  muteKeyboardBehavior: DEFAULT_CONTROLLER_PROFILE_SETTINGS.muteKeyboardBehavior,
  muteKeyboardChordStarterEnabled: DEFAULT_CONTROLLER_PROFILE_SETTINGS.muteKeyboardChordStarterEnabled,
  ledEnabled: true,
  playerLedEnabled: true,
  idleDisconnectEnabled: true,
  idleDisconnectTimeoutMinutes: 15,
  usbSuspendDisconnectEnabled: true,
  sleepKeybindEnabled: DEFAULT_CONTROLLER_PROFILE_SETTINGS.sleepKeybindEnabled,
  speakerVolumeShortcutEnabled: DEFAULT_CONTROLLER_PROFILE_SETTINGS.speakerVolumeShortcutEnabled,
  pollingRateMode: DEFAULT_CONTROLLER_PROFILE_SETTINGS.pollingRateMode,
  hostPersonaMode: 'dualsense',
  notifyControllerConnection: false,
  notifyLowBattery: false,
  duplexMicEnabled: DEFAULT_CONTROLLER_PROFILE_SETTINGS.duplexMicEnabled,
  controllerPowerSavingEnabled: DEFAULT_CONTROLLER_PROFILE_SETTINGS.controllerPowerSavingEnabled,
  selectedControllerProfileId: DEFAULT_CONTROLLER_PROFILE_ID,
  controllerProfiles: [DEFAULT_CONTROLLER_PROFILE],
  selectedButtonRemappingProfileId: DEFAULT_BUTTON_REMAP_PROFILE_ID,
  buttonRemappingProfiles: [DEFAULT_BUTTON_REMAP_PROFILE],
  buttonRemappingDraft: { ...DEFAULT_BUTTON_REMAP_PROFILE.mappings },
  chordFunctions: [],
  chordAssignments: []
};

function normalizeColor(value: unknown): string {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    return DEFAULT_SETTINGS.lightbarColor;
  }
  return value.toLowerCase();
}

function normalizePresetId(value: unknown): CompanionSettings['selectedPresetId'] {
  return normalizeBridgePresetId(value, DEFAULT_SETTINGS.selectedPresetId);
}

function normalizePollingRateMode(value: unknown): CompanionSettings['pollingRateMode'] {
  switch (value) {
    case '250':
    case '500':
    case '1000':
      return value;
    default:
      return DEFAULT_SETTINGS.pollingRateMode;
  }
}

function normalizeHostPersonaMode(value: unknown): HostPersonaMode {
  switch (value) {
    case 'xbox':
    case 'ds4':
      return value;
    default:
      return 'dualsense';
  }
}

function normalizeAudioReactiveHapticsMode(value: unknown): AudioReactiveHapticsMode {
  return value === 'replace' ? value : DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsMode;
}

function normalizeAudioReactiveHapticsSource(value: unknown): AudioReactiveHapticsSource {
  if (value === 'controller-audio' || value === 'system-audio') {
    return value;
  }
  if (!value || typeof value !== 'object') {
    return DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsSource;
  }
  const candidate = value as Partial<Extract<AudioReactiveHapticsSource, { kind: 'app-session' }>>;
  if (candidate.kind !== 'app-session') {
    return DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsSource;
  }
  const processId = Number.isFinite(candidate.processId)
    ? Math.max(0, Math.round(candidate.processId!))
    : 0;
  const displayName = normalizeOptionalString(candidate.displayName);
  const executableName = normalizeOptionalString(candidate.executableName);
  const processPath = normalizeOptionalString(candidate.processPath);
  if (processId <= 0 && !processPath && !executableName) {
    return DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsSource;
  }
  return {
    kind: 'app-session',
    processId,
    ...(displayName ? { displayName } : {}),
    ...(executableName ? { executableName } : {}),
    ...(processPath ? { processPath } : {}),
    ...(normalizeOptionalString(candidate.sessionIdentifier) ? { sessionIdentifier: normalizeOptionalString(candidate.sessionIdentifier) } : {}),
    ...(normalizeOptionalString(candidate.sessionInstanceIdentifier) ? { sessionInstanceIdentifier: normalizeOptionalString(candidate.sessionInstanceIdentifier) } : {})
  };
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeAudioReactiveHapticsBassFocus(value: unknown): AudioReactiveHapticsBassFocus {
  switch (value) {
    case 'deep':
    case 'punchy':
    case 'wide':
      return value;
    default:
      return DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsBassFocus;
  }
}

function normalizeAudioReactiveHapticsResponse(value: unknown): AudioReactiveHapticsResponse {
  switch (value) {
    case 'subtle':
    case 'strong':
      return value;
    default:
      return DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsResponse;
  }
}

function normalizeAudioReactiveHapticsAttack(value: unknown): AudioReactiveHapticsAttack {
  switch (value) {
    case 'soft':
    case 'fast':
    case 'sharp':
      return value;
    default:
      return DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsAttack;
  }
}

function normalizeAudioReactiveHapticsRelease(value: unknown): AudioReactiveHapticsRelease {
  switch (value) {
    case 'tight':
    case 'smooth':
    case 'long':
      return value;
    default:
      return DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsRelease;
  }
}

export function normalizeUiScalePercent(value: unknown): UiScalePercent {
  return value === 75 || value === 125 || value === 150 ? value : 100;
}

export function normalizeUiThemePreset(value: unknown): UiThemePreset {
  switch (value) {
    case 'light':
    case 'dark':
    case 'bubble-gum':
    case 'pomegranate':
    case 'kiwi':
      return value;
    default:
      return DEFAULT_SETTINGS.uiThemePreset;
  }
}

function cloneRemapMap(map: ButtonRemapMap): ButtonRemapMap {
  return { ...map };
}

function cloneControllerProfileSettings(settings: ControllerProfileSettings): ControllerProfileSettings {
  return { ...settings };
}

export function controllerProfileSettingsFrom(settings: CompanionSettings): ControllerProfileSettings {
  return {
    hapticsEnabled: settings.hapticsEnabled,
    hapticsGainPercent: settings.hapticsGainPercent,
    feedbackBoostEnabled: settings.feedbackBoostEnabled,
    classicRumbleEnabled: settings.classicRumbleEnabled,
    classicRumbleGainPercent: settings.classicRumbleGainPercent,
    classicRumbleV1Enabled: settings.classicRumbleV1Enabled,
    adaptiveTriggersEnabled: settings.adaptiveTriggersEnabled,
    triggerEffectIntensityPercent: settings.triggerEffectIntensityPercent,
    triggerTestMode: settings.triggerTestMode,
    speakerEnabled: settings.speakerEnabled,
    speakerVolumePercent: settings.speakerVolumePercent,
    micVolumePercent: settings.micVolumePercent,
    micMuted: settings.micMuted,
    audioReactiveHapticsEnabled: settings.audioReactiveHapticsEnabled,
    audioReactiveHapticsSource: settings.audioReactiveHapticsSource,
    audioReactiveHapticsMode: settings.audioReactiveHapticsMode,
    audioReactiveHapticsGainPercent: settings.audioReactiveHapticsGainPercent,
    audioReactiveHapticsBassFocus: settings.audioReactiveHapticsBassFocus,
    audioReactiveHapticsResponse: settings.audioReactiveHapticsResponse,
    audioReactiveHapticsAttack: settings.audioReactiveHapticsAttack,
    audioReactiveHapticsRelease: settings.audioReactiveHapticsRelease,
    lightbarEnabled: settings.lightbarEnabled,
    lightbarColor: settings.lightbarColor,
    lightbarBrightnessPercent: settings.lightbarBrightnessPercent,
    lightbarOverrideEnabled: settings.lightbarOverrideEnabled,
    muteButtonMode: settings.muteButtonMode,
    muteKeyboardUsage: settings.muteKeyboardUsage,
    muteKeyboardModifiers: settings.muteKeyboardModifiers,
    muteKeyboardBehavior: settings.muteKeyboardBehavior,
    muteKeyboardChordStarterEnabled: settings.muteKeyboardChordStarterEnabled,
    sleepKeybindEnabled: settings.sleepKeybindEnabled,
    speakerVolumeShortcutEnabled: settings.speakerVolumeShortcutEnabled,
    pollingRateMode: settings.pollingRateMode,
    hostPersonaMode: settings.hostPersonaMode,
    duplexMicEnabled: settings.duplexMicEnabled,
    controllerPowerSavingEnabled: settings.controllerPowerSavingEnabled
  };
}

function normalizeControllerProfileSettings(value: unknown): ControllerProfileSettings {
  const candidate = value && typeof value === 'object' ? value as Partial<ControllerProfileSettings> : {};
  return {
    hapticsEnabled: typeof candidate.hapticsEnabled === 'boolean'
      ? candidate.hapticsEnabled
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.hapticsEnabled,
    hapticsGainPercent: Number.isFinite(candidate.hapticsGainPercent)
      ? Math.max(0, Math.min(500, Math.round(candidate.hapticsGainPercent!)))
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.hapticsGainPercent,
    feedbackBoostEnabled: typeof candidate.feedbackBoostEnabled === 'boolean'
      ? candidate.feedbackBoostEnabled
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.feedbackBoostEnabled,
    classicRumbleEnabled: typeof candidate.classicRumbleEnabled === 'boolean'
      ? candidate.classicRumbleEnabled
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.classicRumbleEnabled,
    classicRumbleGainPercent: Number.isFinite(candidate.classicRumbleGainPercent)
      ? Math.max(0, Math.min(500, Math.round(candidate.classicRumbleGainPercent!)))
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.classicRumbleGainPercent,
    classicRumbleV1Enabled: typeof candidate.classicRumbleV1Enabled === 'boolean'
      ? candidate.classicRumbleV1Enabled
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.classicRumbleV1Enabled,
    adaptiveTriggersEnabled: typeof candidate.adaptiveTriggersEnabled === 'boolean'
      ? candidate.adaptiveTriggersEnabled
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.adaptiveTriggersEnabled,
    triggerEffectIntensityPercent: Number.isFinite(candidate.triggerEffectIntensityPercent)
      ? Math.max(0, Math.min(100, Math.round(candidate.triggerEffectIntensityPercent!)))
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.triggerEffectIntensityPercent,
    triggerTestMode: candidate.triggerTestMode === 'weapon' || candidate.triggerTestMode === 'vibration' || candidate.triggerTestMode === 'feedback'
      ? candidate.triggerTestMode
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.triggerTestMode,
    speakerEnabled: typeof candidate.speakerEnabled === 'boolean'
      ? candidate.speakerEnabled
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.speakerEnabled,
    speakerVolumePercent: Number.isFinite(candidate.speakerVolumePercent)
      ? Math.max(0, Math.min(100, Math.round(candidate.speakerVolumePercent!)))
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.speakerVolumePercent,
    micVolumePercent: Number.isFinite(candidate.micVolumePercent)
      ? Math.max(0, Math.min(100, Math.round(candidate.micVolumePercent!)))
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.micVolumePercent,
    micMuted: typeof candidate.micMuted === 'boolean' ? candidate.micMuted : DEFAULT_CONTROLLER_PROFILE_SETTINGS.micMuted,
    audioReactiveHapticsEnabled: typeof candidate.audioReactiveHapticsEnabled === 'boolean'
      ? candidate.audioReactiveHapticsEnabled
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsEnabled,
    audioReactiveHapticsSource: normalizeAudioReactiveHapticsSource(candidate.audioReactiveHapticsSource),
    audioReactiveHapticsMode: normalizeAudioReactiveHapticsMode(candidate.audioReactiveHapticsMode),
    audioReactiveHapticsGainPercent: Number.isFinite(candidate.audioReactiveHapticsGainPercent)
      ? Math.max(0, Math.min(200, Math.round(candidate.audioReactiveHapticsGainPercent!)))
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.audioReactiveHapticsGainPercent,
    audioReactiveHapticsBassFocus: normalizeAudioReactiveHapticsBassFocus(candidate.audioReactiveHapticsBassFocus),
    audioReactiveHapticsResponse: normalizeAudioReactiveHapticsResponse(candidate.audioReactiveHapticsResponse),
    audioReactiveHapticsAttack: normalizeAudioReactiveHapticsAttack(candidate.audioReactiveHapticsAttack),
    audioReactiveHapticsRelease: normalizeAudioReactiveHapticsRelease(candidate.audioReactiveHapticsRelease),
    lightbarEnabled: typeof candidate.lightbarEnabled === 'boolean'
      ? candidate.lightbarEnabled
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.lightbarEnabled,
    lightbarColor: normalizeColor(candidate.lightbarColor),
    lightbarBrightnessPercent: Number.isFinite(candidate.lightbarBrightnessPercent)
      ? Math.max(0, Math.min(100, Math.round(candidate.lightbarBrightnessPercent!)))
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.lightbarBrightnessPercent,
    lightbarOverrideEnabled: typeof candidate.lightbarOverrideEnabled === 'boolean'
      ? candidate.lightbarOverrideEnabled
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.lightbarOverrideEnabled,
    muteButtonMode: candidate.muteButtonMode === 'keyboard'
      || candidate.muteButtonMode === 'quiet'
      || candidate.muteButtonMode === 'chord'
      || candidate.muteButtonMode === 'normal'
      ? candidate.muteButtonMode
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.muteButtonMode,
    muteKeyboardUsage: Number.isFinite(candidate.muteKeyboardUsage)
      ? Math.max(1, Math.min(0x73, Math.round(candidate.muteKeyboardUsage!)))
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.muteKeyboardUsage,
    muteKeyboardModifiers: Number.isFinite(candidate.muteKeyboardModifiers)
      ? Math.max(0, Math.min(0x0f, Math.round(candidate.muteKeyboardModifiers!)))
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.muteKeyboardModifiers,
    muteKeyboardBehavior: candidate.muteKeyboardBehavior === 'hold' || candidate.muteKeyboardBehavior === 'tap'
      ? candidate.muteKeyboardBehavior
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.muteKeyboardBehavior,
    muteKeyboardChordStarterEnabled: typeof candidate.muteKeyboardChordStarterEnabled === 'boolean'
      ? candidate.muteKeyboardChordStarterEnabled
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.muteKeyboardChordStarterEnabled,
    sleepKeybindEnabled: typeof candidate.sleepKeybindEnabled === 'boolean'
      ? candidate.sleepKeybindEnabled
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.sleepKeybindEnabled,
    speakerVolumeShortcutEnabled: typeof candidate.speakerVolumeShortcutEnabled === 'boolean'
      ? candidate.speakerVolumeShortcutEnabled
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.speakerVolumeShortcutEnabled,
    pollingRateMode: normalizePollingRateMode(candidate.pollingRateMode),
    hostPersonaMode: normalizeHostPersonaMode(candidate.hostPersonaMode),
    duplexMicEnabled: typeof candidate.duplexMicEnabled === 'boolean'
      ? candidate.duplexMicEnabled
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.duplexMicEnabled,
    controllerPowerSavingEnabled: typeof candidate.controllerPowerSavingEnabled === 'boolean'
      ? candidate.controllerPowerSavingEnabled
      : DEFAULT_CONTROLLER_PROFILE_SETTINGS.controllerPowerSavingEnabled
  };
}

function normalizeControllerProfile(value: unknown): ControllerProfile | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<ControllerProfile>;
  if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) {
    return null;
  }
  const name = typeof candidate.name === 'string' && candidate.name.trim().length > 0
    ? candidate.name.trim().slice(0, 48)
    : 'Custom Profile';
  return {
    id: candidate.id.trim().slice(0, 64),
    name,
    settings: normalizeControllerProfileSettings(candidate.settings)
  };
}

function normalizeControllerProfiles(value: unknown): ControllerProfile[] {
  const profiles = Array.isArray(value)
    ? value.map(normalizeControllerProfile).filter((profile): profile is ControllerProfile => profile !== null)
    : [];
  const uniqueProfiles = new Map<string, ControllerProfile>();
  uniqueProfiles.set(DEFAULT_CONTROLLER_PROFILE_ID, {
    ...DEFAULT_CONTROLLER_PROFILE,
    settings: cloneControllerProfileSettings(DEFAULT_CONTROLLER_PROFILE.settings)
  });
  for (const profile of profiles) {
    if (profile.id === DEFAULT_CONTROLLER_PROFILE_ID) {
      continue;
    }
    uniqueProfiles.set(profile.id, profile);
  }
  return Array.from(uniqueProfiles.values());
}

function normalizeSelectedControllerProfileId(value: unknown, profiles: ControllerProfile[]): string {
  return typeof value === 'string' && profiles.some((profile) => profile.id === value)
    ? value
    : profiles[0]?.id ?? DEFAULT_CONTROLLER_PROFILE_ID;
}

function restoreDefaultControllerProfile(profiles: ControllerProfile[]): ControllerProfile[] {
  const restoredDefault: ControllerProfile = {
    ...DEFAULT_CONTROLLER_PROFILE,
    settings: cloneControllerProfileSettings(DEFAULT_CONTROLLER_PROFILE.settings)
  };
  const defaultIndex = profiles.findIndex((profile) => profile.id === DEFAULT_CONTROLLER_PROFILE_ID);
  if (defaultIndex === -1) {
    return [restoredDefault, ...profiles];
  }
  return profiles.map((profile, index) => (
    index === defaultIndex ? restoredDefault : profile
  ));
}

function syncSelectedControllerProfile(settings: CompanionSettings): CompanionSettings {
  const profileSettings = controllerProfileSettingsFrom(settings);
  if (settings.selectedControllerProfileId === DEFAULT_CONTROLLER_PROFILE_ID) {
    const customProfile = settings.controllerProfiles.find((profile) => profile.id === CUSTOM_CONTROLLER_PROFILE_ID);
    const nextCustomProfile: ControllerProfile = {
      ...(customProfile ?? CUSTOM_CONTROLLER_PROFILE),
      settings: profileSettings
    };
    const controllerProfiles = customProfile
      ? settings.controllerProfiles.map((profile) => (
        profile.id === CUSTOM_CONTROLLER_PROFILE_ID ? nextCustomProfile : profile
      ))
      : [...settings.controllerProfiles, nextCustomProfile];
    return normalizeSettings({
      ...settings,
      selectedControllerProfileId: CUSTOM_CONTROLLER_PROFILE_ID,
      controllerProfiles
    });
  }
  return normalizeSettings({
    ...settings,
    controllerProfiles: settings.controllerProfiles.map((profile) => (
      profile.id === settings.selectedControllerProfileId
        ? { ...profile, settings: profileSettings }
        : profile
    ))
  });
}

function includesControllerProfileSettingUpdate(update: Partial<CompanionSettings>): boolean {
  return Object.keys(update).some((key) => CONTROLLER_PROFILE_SETTING_KEYS.has(key as keyof ControllerProfileSettings));
}

function normalizeRemapMap(value: unknown): ButtonRemapMap {
  const source = value && typeof value === 'object' ? value as Partial<Record<RemapButtonId, unknown>> : {};
  return Object.fromEntries(REMAP_BUTTON_IDS.map((id) => {
    const target = source[id];
    return [id, isRemapButtonId(target) ? target : id];
  })) as ButtonRemapMap;
}

function normalizeRemapProfile(value: unknown): ButtonRemapProfile | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<ButtonRemapProfile>;
  if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) {
    return null;
  }
  const name = typeof candidate.name === 'string' && candidate.name.trim().length > 0
    ? candidate.name.trim().slice(0, 48)
    : 'Custom Profile';
  return {
    id: candidate.id.trim().slice(0, 64),
    name,
    mappings: normalizeRemapMap(candidate.mappings)
  };
}

function normalizeRemapProfiles(value: unknown): ButtonRemapProfile[] {
  const profiles = Array.isArray(value)
    ? value.map(normalizeRemapProfile).filter((profile): profile is ButtonRemapProfile => profile !== null)
    : [];
  const uniqueProfiles = new Map<string, ButtonRemapProfile>();
  uniqueProfiles.set(DEFAULT_BUTTON_REMAP_PROFILE_ID, {
    ...DEFAULT_BUTTON_REMAP_PROFILE,
    mappings: cloneRemapMap(DEFAULT_BUTTON_REMAP_PROFILE.mappings)
  });
  for (const profile of profiles) {
    if (profile.id === DEFAULT_BUTTON_REMAP_PROFILE_ID) {
      continue;
    }
    uniqueProfiles.set(profile.id, profile);
  }
  return Array.from(uniqueProfiles.values());
}

function normalizeSelectedRemapProfileId(value: unknown, profiles: ButtonRemapProfile[]): string {
  return typeof value === 'string' && profiles.some((profile) => profile.id === value)
    ? value
    : DEFAULT_BUTTON_REMAP_PROFILE_ID;
}

const CHORD_MEDIA_ACTIONS = new Set<ChordMediaAction>([
  'play-pause',
  'next-track',
  'previous-track',
  'mute',
  'volume-up',
  'volume-down'
]);
const CHORD_CONTROLLER_SETTING_ACTIONS = new Set<ChordControllerSettingAction>([
  'toggle-audio-haptics',
  'toggle-lightbar-override',
  'toggle-mic-mute',
  'sleep-controller',
  'persona-dualsense',
  'persona-ds4',
  'persona-xbox',
  'speaker-down',
  'speaker-up',
  'mic-down',
  'mic-up',
  'haptics-down',
  'haptics-up',
  'rumble-down',
  'rumble-up',
  'triggers-down',
  'triggers-up',
  'lighting-down',
  'lighting-up'
]);

function isChordStarterId(value: unknown): value is ChordStarterId {
  return typeof value === 'string' && (CHORD_STARTER_IDS as readonly string[]).includes(value);
}

function isChordAssignableButtonId(value: unknown): value is ChordAssignableButtonId {
  return typeof value === 'string' && (CHORD_ASSIGNABLE_BUTTON_IDS as readonly string[]).includes(value);
}

function normalizeChordName(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, MAX_CHORD_FUNCTION_NAME_LENGTH)
    : fallback.slice(0, MAX_CHORD_FUNCTION_NAME_LENGTH);
}

function normalizeChordId(value: unknown, fallbackPrefix: string, index: number): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim().slice(0, 64)
    : `${fallbackPrefix}-${index + 1}`;
}

function normalizeChordFunction(value: unknown, index: number): ChordFunction | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<ChordFunction>;
  const id = normalizeChordId(candidate.id, 'function', index);
  switch (candidate.type) {
    case 'keyboard': {
      const keys = Array.isArray(candidate.keys)
        ? candidate.keys
          .filter((key): key is string => typeof key === 'string' && key.trim().length > 0)
          .map((key) => key.trim().slice(0, 24))
          .slice(0, MAX_KEYBOARD_FUNCTION_KEYS)
        : [];
      if (keys.length === 0) {
        return null;
      }
      return {
        id,
        name: normalizeChordName(candidate.name, 'Shortcut'),
        type: 'keyboard',
        keys
      };
    }
    case 'media':
      return {
        id,
        name: normalizeChordName(candidate.name, 'Media'),
        type: 'media',
        action: CHORD_MEDIA_ACTIONS.has(candidate.action as ChordMediaAction)
          ? candidate.action as ChordMediaAction
          : 'play-pause'
      };
    case 'controller-setting': {
      const action = CHORD_CONTROLLER_SETTING_ACTIONS.has(candidate.action as ChordControllerSettingAction)
        ? candidate.action as ChordControllerSettingAction
        : 'sleep-controller';
      return {
        id,
        name: normalizeChordName(candidate.name, 'Setting'),
        type: 'controller-setting',
        action,
        stepPercent: normalizeChordControllerSettingStepPercent(
          (candidate as { stepPercent?: unknown }).stepPercent,
          defaultChordControllerSettingStepPercent(action)
        )
      };
    }
    default:
      return null;
  }
}

function normalizeChordFunctions(value: unknown): ChordFunction[] {
  const functions = Array.isArray(value)
    ? value.map(normalizeChordFunction).filter((func): func is ChordFunction => func !== null)
    : [];
  const unique = new Map<string, ChordFunction>();
  for (const func of functions) {
    unique.set(func.id, func);
  }
  return Array.from(unique.values()).slice(0, 64);
}

function normalizeChordAssignment(
  value: unknown,
  functionIds: Set<string>,
  index: number
): ChordAssignment | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<ChordAssignment>;
  if (typeof candidate.functionId !== 'string' || !functionIds.has(candidate.functionId)) {
    return null;
  }
  const id = normalizeChordId(candidate.id, 'assignment', index);
  if (candidate.kind === 'chord') {
    if (
      !isChordStarterId(candidate.starter)
      || !isChordAssignableButtonId(candidate.button)
      || !isChordBindingAllowed(candidate.starter, candidate.button)
    ) {
      return null;
    }
    return {
      id,
      kind: 'chord',
      starter: candidate.starter,
      button: candidate.button,
      functionId: candidate.functionId
    };
  }
  return null;
}

function normalizeChordAssignments(value: unknown, functions: ChordFunction[]): ChordAssignment[] {
  const functionIds = new Set(functions.map((func) => func.id));
  return (Array.isArray(value) ? value : [])
    .map((assignment, index) => normalizeChordAssignment(assignment, functionIds, index))
    .filter((assignment): assignment is ChordAssignment => assignment !== null)
    .slice(0, MAX_CHORD_ASSIGNMENTS);
}

function syncSelectedButtonRemappingProfile(settings: CompanionSettings): CompanionSettings {
  const mappings = cloneRemapMap(settings.buttonRemappingDraft);
  if (settings.selectedButtonRemappingProfileId === DEFAULT_BUTTON_REMAP_PROFILE_ID) {
    const customProfile = settings.buttonRemappingProfiles.find((profile) => (
      profile.id === CUSTOM_BUTTON_REMAP_PROFILE_ID
    ));
    const nextCustomProfile: ButtonRemapProfile = {
      ...(customProfile ?? CUSTOM_BUTTON_REMAP_PROFILE),
      mappings
    };
    const buttonRemappingProfiles = customProfile
      ? settings.buttonRemappingProfiles.map((profile) => (
        profile.id === CUSTOM_BUTTON_REMAP_PROFILE_ID ? nextCustomProfile : profile
      ))
      : [...settings.buttonRemappingProfiles, nextCustomProfile];
    return normalizeSettings({
      ...settings,
      selectedButtonRemappingProfileId: CUSTOM_BUTTON_REMAP_PROFILE_ID,
      buttonRemappingProfiles,
      buttonRemappingDraft: mappings
    });
  }
  return normalizeSettings({
    ...settings,
    buttonRemappingProfiles: settings.buttonRemappingProfiles.map((profile) => (
      profile.id === settings.selectedButtonRemappingProfileId
        ? { ...profile, mappings }
        : profile
    )),
    buttonRemappingDraft: mappings
  });
}

function cloneSettings(settings: CompanionSettings): CompanionSettings {
  return {
    ...settings,
    controllerProfiles: settings.controllerProfiles.map((profile) => ({
      ...profile,
      settings: cloneControllerProfileSettings(profile.settings)
    })),
    buttonRemappingProfiles: settings.buttonRemappingProfiles.map((profile) => ({
      ...profile,
      mappings: cloneRemapMap(profile.mappings)
    })),
    buttonRemappingDraft: cloneRemapMap(settings.buttonRemappingDraft),
    chordFunctions: settings.chordFunctions.map((func) => ({ ...func })),
    chordAssignments: settings.chordAssignments.map((assignment) => ({ ...assignment }))
  };
}

type PersistedSettings = Partial<CompanionSettings> & {
  customProfile?: Partial<CompanionSettings>;
  settingsSchemaVersion?: number;
};

const CURRENT_SETTINGS_SCHEMA_VERSION = 2;

function migratePersistedSettings(value: PersistedSettings): PersistedSettings {
  const version = Number.isFinite(value.settingsSchemaVersion)
    ? Math.max(0, Math.floor(value.settingsSchemaVersion!))
    : 0;
  if (version >= CURRENT_SETTINGS_SCHEMA_VERSION) {
    return value;
  }

  const next: PersistedSettings = {
    ...value,
    settingsSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION
  };
  return next;
}

function normalizeSettings(value: Partial<CompanionSettings> | null | undefined): CompanionSettings {
  const selectedPresetId = normalizePresetId(value?.selectedPresetId);
  const controllerProfiles = normalizeControllerProfiles(value?.controllerProfiles);
  const selectedControllerProfileId = normalizeSelectedControllerProfileId(
    value?.selectedControllerProfileId,
    controllerProfiles
  );
  const buttonRemappingProfiles = normalizeRemapProfiles(value?.buttonRemappingProfiles);
  const selectedButtonRemappingProfileId = normalizeSelectedRemapProfileId(
    value?.selectedButtonRemappingProfileId,
    buttonRemappingProfiles
  );
  const chordFunctions = normalizeChordFunctions(value?.chordFunctions);

  return {
    selectedPresetId,
    uiScalePercent: normalizeUiScalePercent(value?.uiScalePercent),
    uiThemePreset: normalizeUiThemePreset(value?.uiThemePreset),
    launchAtStartupEnabled: typeof value?.launchAtStartupEnabled === 'boolean'
      ? value.launchAtStartupEnabled
      : DEFAULT_SETTINGS.launchAtStartupEnabled,
    showBatteryPercentTrayIcon: typeof value?.showBatteryPercentTrayIcon === 'boolean'
      ? value.showBatteryPercentTrayIcon
      : DEFAULT_SETTINGS.showBatteryPercentTrayIcon,
    hapticsEnabled: typeof value?.hapticsEnabled === 'boolean'
      ? value.hapticsEnabled
      : DEFAULT_SETTINGS.hapticsEnabled,
    hapticsGainPercent: Number.isFinite(value?.hapticsGainPercent)
      ? Math.max(0, Math.min(500, Math.round(value!.hapticsGainPercent!)))
      : DEFAULT_SETTINGS.hapticsGainPercent,
    feedbackBoostEnabled: typeof value?.feedbackBoostEnabled === 'boolean'
      ? value.feedbackBoostEnabled
      : DEFAULT_SETTINGS.feedbackBoostEnabled,
    hapticsBufferLength: Number.isFinite(value?.hapticsBufferLength)
      ? Math.max(16, Math.min(128, Math.round(value!.hapticsBufferLength!)))
      : DEFAULT_SETTINGS.hapticsBufferLength,
    classicRumbleEnabled: typeof value?.classicRumbleEnabled === 'boolean'
      ? value.classicRumbleEnabled
      : DEFAULT_SETTINGS.classicRumbleEnabled,
    classicRumbleGainPercent: Number.isFinite(value?.classicRumbleGainPercent)
      ? Math.max(0, Math.min(500, Math.round(value!.classicRumbleGainPercent!)))
      : DEFAULT_SETTINGS.classicRumbleGainPercent,
    classicRumbleV1Enabled: typeof value?.classicRumbleV1Enabled === 'boolean'
      ? value.classicRumbleV1Enabled
      : DEFAULT_SETTINGS.classicRumbleV1Enabled,
    adaptiveTriggersEnabled: typeof value?.adaptiveTriggersEnabled === 'boolean'
      ? value.adaptiveTriggersEnabled
      : DEFAULT_SETTINGS.adaptiveTriggersEnabled,
    triggerEffectIntensityPercent: Number.isFinite(value?.triggerEffectIntensityPercent)
      ? Math.max(0, Math.min(100, Math.round(value!.triggerEffectIntensityPercent!)))
      : DEFAULT_SETTINGS.triggerEffectIntensityPercent,
    triggerTestMode: value?.triggerTestMode === 'weapon' || value?.triggerTestMode === 'vibration' || value?.triggerTestMode === 'feedback'
      ? value.triggerTestMode
      : DEFAULT_SETTINGS.triggerTestMode,
    speakerEnabled: typeof value?.speakerEnabled === 'boolean'
      ? value.speakerEnabled
      : DEFAULT_SETTINGS.speakerEnabled,
    speakerVolumePercent: Number.isFinite(value?.speakerVolumePercent)
      ? Math.max(0, Math.min(100, Math.round(value!.speakerVolumePercent!)))
      : DEFAULT_SETTINGS.speakerVolumePercent,
    speakerGainLevel: Number.isFinite(value?.speakerGainLevel)
      ? Math.max(1, Math.min(7, Math.round(value!.speakerGainLevel!)))
      : DEFAULT_SETTINGS.speakerGainLevel,
    micVolumePercent: Number.isFinite(value?.micVolumePercent)
      ? Math.max(0, Math.min(100, Math.round(value!.micVolumePercent!)))
      : DEFAULT_SETTINGS.micVolumePercent,
    micMuted: typeof value?.micMuted === 'boolean'
      ? value.micMuted
      : DEFAULT_SETTINGS.micMuted,
    audioReactiveHapticsEnabled: typeof value?.audioReactiveHapticsEnabled === 'boolean'
      ? value.audioReactiveHapticsEnabled
      : DEFAULT_SETTINGS.audioReactiveHapticsEnabled,
    audioReactiveHapticsSource: normalizeAudioReactiveHapticsSource(value?.audioReactiveHapticsSource),
    audioReactiveHapticsMode: normalizeAudioReactiveHapticsMode(value?.audioReactiveHapticsMode),
    audioReactiveHapticsGainPercent: Number.isFinite(value?.audioReactiveHapticsGainPercent)
      ? Math.max(0, Math.min(200, Math.round(value!.audioReactiveHapticsGainPercent!)))
      : DEFAULT_SETTINGS.audioReactiveHapticsGainPercent,
    audioReactiveHapticsBassFocus: normalizeAudioReactiveHapticsBassFocus(value?.audioReactiveHapticsBassFocus),
    audioReactiveHapticsResponse: normalizeAudioReactiveHapticsResponse(value?.audioReactiveHapticsResponse),
    audioReactiveHapticsAttack: normalizeAudioReactiveHapticsAttack(value?.audioReactiveHapticsAttack),
    audioReactiveHapticsRelease: normalizeAudioReactiveHapticsRelease(value?.audioReactiveHapticsRelease),
    lightbarEnabled: typeof value?.lightbarEnabled === 'boolean'
      ? value.lightbarEnabled
      : DEFAULT_SETTINGS.lightbarEnabled,
    lightbarColor: normalizeColor(value?.lightbarColor),
    lightbarBrightnessPercent: Number.isFinite(value?.lightbarBrightnessPercent)
      ? Math.max(0, Math.min(100, Math.round(value!.lightbarBrightnessPercent!)))
      : DEFAULT_SETTINGS.lightbarBrightnessPercent,
    lightbarOverrideEnabled: typeof value?.lightbarOverrideEnabled === 'boolean'
      ? value.lightbarOverrideEnabled
      : DEFAULT_SETTINGS.lightbarOverrideEnabled,
    muteButtonMode: value?.muteButtonMode === 'keyboard'
      || value?.muteButtonMode === 'quiet'
      || value?.muteButtonMode === 'chord'
      || value?.muteButtonMode === 'normal'
      ? value.muteButtonMode
      : DEFAULT_SETTINGS.muteButtonMode,
    muteKeyboardUsage: Number.isFinite(value?.muteKeyboardUsage)
      ? Math.max(1, Math.min(0x73, Math.round(value!.muteKeyboardUsage!)))
      : DEFAULT_SETTINGS.muteKeyboardUsage,
    muteKeyboardModifiers: Number.isFinite(value?.muteKeyboardModifiers)
      ? Math.max(0, Math.min(0x0f, Math.round(value!.muteKeyboardModifiers!)))
      : DEFAULT_SETTINGS.muteKeyboardModifiers,
    muteKeyboardBehavior: value?.muteKeyboardBehavior === 'hold' || value?.muteKeyboardBehavior === 'tap'
      ? value.muteKeyboardBehavior
      : DEFAULT_SETTINGS.muteKeyboardBehavior,
    muteKeyboardChordStarterEnabled: typeof value?.muteKeyboardChordStarterEnabled === 'boolean'
      ? value.muteKeyboardChordStarterEnabled
      : DEFAULT_SETTINGS.muteKeyboardChordStarterEnabled,
    ledEnabled: typeof value?.ledEnabled === 'boolean' ? value.ledEnabled : DEFAULT_SETTINGS.ledEnabled,
    playerLedEnabled: typeof value?.playerLedEnabled === 'boolean'
      ? value.playerLedEnabled
      : DEFAULT_SETTINGS.playerLedEnabled,
    idleDisconnectEnabled: typeof value?.idleDisconnectEnabled === 'boolean'
      ? value.idleDisconnectEnabled
      : DEFAULT_SETTINGS.idleDisconnectEnabled,
    idleDisconnectTimeoutMinutes: Number.isFinite(value?.idleDisconnectTimeoutMinutes)
      ? Math.max(1, Math.min(120, Math.round(value!.idleDisconnectTimeoutMinutes!)))
      : DEFAULT_SETTINGS.idleDisconnectTimeoutMinutes,
    usbSuspendDisconnectEnabled: typeof value?.usbSuspendDisconnectEnabled === 'boolean'
      ? value.usbSuspendDisconnectEnabled
      : DEFAULT_SETTINGS.usbSuspendDisconnectEnabled,
    sleepKeybindEnabled: typeof value?.sleepKeybindEnabled === 'boolean'
      ? value.sleepKeybindEnabled
      : DEFAULT_SETTINGS.sleepKeybindEnabled,
    speakerVolumeShortcutEnabled: typeof value?.speakerVolumeShortcutEnabled === 'boolean'
      ? value.speakerVolumeShortcutEnabled
      : DEFAULT_SETTINGS.speakerVolumeShortcutEnabled,
    pollingRateMode: normalizePollingRateMode(value?.pollingRateMode),
    hostPersonaMode: normalizeHostPersonaMode(value?.hostPersonaMode),
    notifyControllerConnection: typeof value?.notifyControllerConnection === 'boolean'
      ? value.notifyControllerConnection
      : DEFAULT_SETTINGS.notifyControllerConnection,
    notifyLowBattery: typeof value?.notifyLowBattery === 'boolean'
      ? value.notifyLowBattery
      : DEFAULT_SETTINGS.notifyLowBattery,
    duplexMicEnabled: typeof value?.duplexMicEnabled === 'boolean'
      ? value.duplexMicEnabled
      : DEFAULT_SETTINGS.duplexMicEnabled,
    controllerPowerSavingEnabled: typeof value?.controllerPowerSavingEnabled === 'boolean'
      ? value.controllerPowerSavingEnabled
      : DEFAULT_SETTINGS.controllerPowerSavingEnabled,
    selectedControllerProfileId,
    controllerProfiles,
    selectedButtonRemappingProfileId,
    buttonRemappingProfiles,
    buttonRemappingDraft: normalizeRemapMap(value?.buttonRemappingDraft),
    chordFunctions,
    chordAssignments: normalizeChordAssignments(value?.chordAssignments, chordFunctions)
  };
}

function customSettingsFrom(value: Partial<CompanionSettings> | null | undefined): CompanionSettings {
  return normalizeSettings({ ...value, selectedPresetId: 'custom' });
}

export class SettingsStore {
  private readonly filePath: string;
  private settings: CompanionSettings;
  private customSettings: CompanionSettings;

  constructor(public readonly userDataPath: string) {
    this.filePath = path.join(userDataPath, 'settings.json');
    const persisted = this.read();
    this.settings = persisted.settings;
    this.customSettings = persisted.customSettings;
  }

  get(): CompanionSettings {
    return cloneSettings(this.settings);
  }

  update(next: Partial<CompanionSettings>): CompanionSettings {
    this.settings = normalizeSettings({ ...this.settings, ...next });
    if (includesControllerProfileSettingUpdate(next) && next.selectedControllerProfileId === undefined) {
      this.settings = syncSelectedControllerProfile(this.settings);
    }
    if (this.settings.selectedPresetId === 'custom') {
      this.customSettings = { ...this.settings };
    }
    this.write();
    return this.get();
  }

  applyPreset(
    presetId: BridgePresetId,
    presetSettings?: Partial<CompanionSettings>
  ): CompanionSettings {
    const normalizedPresetId = normalizePresetId(presetId);
    if (this.settings.selectedPresetId === 'custom') {
      this.customSettings = { ...this.settings, selectedPresetId: 'custom' };
    }

    if (normalizedPresetId === 'custom') {
      this.settings = { ...this.customSettings, selectedPresetId: 'custom' };
    } else {
      this.settings = normalizeSettings({ ...this.settings, ...presetSettings, selectedPresetId: normalizedPresetId });
    }

    this.write();
    return this.get();
  }

  restoreDefaults(): CompanionSettings {
    const controllerProfiles = restoreDefaultControllerProfile(this.settings.controllerProfiles);
    this.settings = normalizeSettings({
      ...DEFAULT_SETTINGS,
      selectedControllerProfileId: DEFAULT_CONTROLLER_PROFILE_ID,
      controllerProfiles
    });
    this.customSettings = customSettingsFrom(this.settings);
    this.write();
    return this.get();
  }

  selectControllerProfile(profileId: string): CompanionSettings {
    const profile = this.settings.controllerProfiles.find((candidate) => candidate.id === profileId)
      ?? this.settings.controllerProfiles[0]
      ?? DEFAULT_CONTROLLER_PROFILE;
    return this.update({
      selectedControllerProfileId: profile.id,
      ...profile.settings
    });
  }

  saveControllerProfile(name?: string): CompanionSettings {
    const profileName = typeof name === 'string' && name.trim().length > 0
      ? name.trim().slice(0, 48)
      : this.nextControllerProfileName();
    const profile: ControllerProfile = {
      id: `profile-${Date.now().toString(36)}`,
      name: profileName,
      settings: controllerProfileSettingsFrom(this.settings)
    };
    return this.update({
      selectedControllerProfileId: profile.id,
      controllerProfiles: [...this.settings.controllerProfiles, profile]
    });
  }

  updateControllerProfile(profileId: string): CompanionSettings {
    if (profileId === DEFAULT_CONTROLLER_PROFILE_ID) {
      return this.get();
    }
    const profileExists = this.settings.controllerProfiles.some((profile) => profile.id === profileId);
    if (!profileExists) {
      return this.get();
    }
    const settings = controllerProfileSettingsFrom(this.settings);
    return this.update({
      controllerProfiles: this.settings.controllerProfiles.map((profile) => (
        profile.id === profileId ? { ...profile, settings } : profile
      ))
    });
  }

  renameControllerProfile(profileId: string, name: string): CompanionSettings {
    const nextName = name.trim().slice(0, 48);
    if (profileId === DEFAULT_CONTROLLER_PROFILE_ID || nextName.length === 0) {
      return this.get();
    }
    return this.update({
      controllerProfiles: this.settings.controllerProfiles.map((profile) => (
        profile.id === profileId ? { ...profile, name: nextName } : profile
      ))
    });
  }

  deleteControllerProfile(profileId: string): CompanionSettings {
    if (profileId === DEFAULT_CONTROLLER_PROFILE_ID) {
      return this.get();
    }
    const profiles = this.settings.controllerProfiles.filter((profile) => profile.id !== profileId);
    const fallback = profiles[0]
      ?? DEFAULT_CONTROLLER_PROFILE;
    return this.update({
      selectedControllerProfileId: fallback.id,
      controllerProfiles: profiles,
      ...fallback.settings
    });
  }

  setButtonRemap(buttonId: RemapButtonId, targetId: RemapButtonId): CompanionSettings {
    if (!isRemapButtonId(buttonId) || !isRemapButtonId(targetId)) {
      return this.get();
    }
    if (this.settings.buttonRemappingDraft[buttonId] === targetId) {
      return this.get();
    }
    this.settings = syncSelectedButtonRemappingProfile(normalizeSettings({
      ...this.settings,
      buttonRemappingDraft: {
        ...this.settings.buttonRemappingDraft,
        [buttonId]: targetId
      }
    }));
    if (this.settings.selectedPresetId === 'custom') {
      this.customSettings = { ...this.settings };
    }
    this.write();
    return this.get();
  }

  selectButtonRemappingProfile(profileId: string): CompanionSettings {
    const profile = this.settings.buttonRemappingProfiles.find((candidate) => candidate.id === profileId)
      ?? this.settings.buttonRemappingProfiles[0]
      ?? DEFAULT_BUTTON_REMAP_PROFILE;
    return this.update({
      selectedButtonRemappingProfileId: profile.id,
      buttonRemappingDraft: profile.mappings
    });
  }

  saveButtonRemappingProfile(name?: string): CompanionSettings {
    const profileName = typeof name === 'string' && name.trim().length > 0
      ? name.trim().slice(0, 48)
      : this.nextButtonRemappingProfileName();
    const profile: ButtonRemapProfile = {
      id: `profile-${Date.now().toString(36)}`,
      name: profileName,
      mappings: cloneRemapMap(this.settings.buttonRemappingDraft)
    };
    return this.update({
      selectedButtonRemappingProfileId: profile.id,
      buttonRemappingProfiles: [...this.settings.buttonRemappingProfiles, profile],
      buttonRemappingDraft: profile.mappings
    });
  }

  updateButtonRemappingProfile(profileId: string): CompanionSettings {
    if (profileId === DEFAULT_BUTTON_REMAP_PROFILE_ID) {
      return this.get();
    }
    const profileExists = this.settings.buttonRemappingProfiles.some((profile) => profile.id === profileId);
    if (!profileExists) {
      return this.get();
    }
    const mappings = cloneRemapMap(this.settings.buttonRemappingDraft);
    return this.update({
      buttonRemappingProfiles: this.settings.buttonRemappingProfiles.map((profile) => (
        profile.id === profileId ? { ...profile, mappings } : profile
      )),
      buttonRemappingDraft: mappings
    });
  }

  renameButtonRemappingProfile(profileId: string, name: string): CompanionSettings {
    const nextName = name.trim().slice(0, 48);
    if (profileId === DEFAULT_BUTTON_REMAP_PROFILE_ID || nextName.length === 0) {
      return this.get();
    }
    return this.update({
      buttonRemappingProfiles: this.settings.buttonRemappingProfiles.map((profile) => (
        profile.id === profileId ? { ...profile, name: nextName } : profile
      ))
    });
  }

  deleteButtonRemappingProfile(profileId: string): CompanionSettings {
    if (profileId === DEFAULT_BUTTON_REMAP_PROFILE_ID) {
      return this.get();
    }
    const profiles = this.settings.buttonRemappingProfiles.filter((profile) => profile.id !== profileId);
    const fallback = profiles.find((profile) => profile.id === DEFAULT_BUTTON_REMAP_PROFILE_ID)
      ?? DEFAULT_BUTTON_REMAP_PROFILE;
    return this.update({
      selectedButtonRemappingProfileId: fallback.id,
      buttonRemappingProfiles: profiles,
      buttonRemappingDraft: fallback.mappings
    });
  }

  restoreButtonRemappingDefaults(): CompanionSettings {
    return this.update({
      selectedButtonRemappingProfileId: DEFAULT_BUTTON_REMAP_PROFILE_ID,
      buttonRemappingDraft: DEFAULT_BUTTON_REMAP_PROFILE.mappings
    });
  }

  setChordConfiguration(functions: ChordFunction[], assignments: ChordAssignment[]): CompanionSettings {
    return this.update({
      chordFunctions: functions,
      chordAssignments: assignments
    });
  }

  setChordFunctions(functions: ChordFunction[]): CompanionSettings {
    return this.update({
      chordFunctions: functions,
      chordAssignments: this.settings.chordAssignments
    });
  }

  setChordAssignments(assignments: ChordAssignment[]): CompanionSettings {
    return this.update({
      chordAssignments: assignments
    });
  }

  private read(): { settings: CompanionSettings; customSettings: CompanionSettings } {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = migratePersistedSettings(JSON.parse(raw) as PersistedSettings);
      const settings = normalizeSettings(parsed);
      const fallbackCustom = settings.selectedPresetId === 'custom' ? settings : DEFAULT_SETTINGS;
      return {
        settings,
        customSettings: customSettingsFrom(parsed.customProfile ?? fallbackCustom)
      };
    } catch {
      return {
        settings: cloneSettings(DEFAULT_SETTINGS),
        customSettings: customSettingsFrom(DEFAULT_SETTINGS)
      };
    }
  }

  private nextButtonRemappingProfileName(): string {
    const names = new Set(this.settings.buttonRemappingProfiles.map((profile) => profile.name));
    let index = 1;
    while (names.has(`Custom Profile ${index}`)) {
      index += 1;
    }
    return `Custom Profile ${index}`;
  }

  private nextControllerProfileName(): string {
    const names = new Set(this.settings.controllerProfiles.map((profile) => profile.name));
    if (!names.has('Custom')) {
      return 'Custom';
    }
    let index = 1;
    while (names.has(`Custom Profile ${index}`)) {
      index += 1;
    }
    return `Custom Profile ${index}`;
  }

  private write(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, `${JSON.stringify({
      settingsSchemaVersion: CURRENT_SETTINGS_SCHEMA_VERSION,
      ...this.settings,
      customProfile: this.customSettings
    }, null, 2)}\n`, 'utf8');
  }
}
