import '@fontsource/montserrat/latin-500.css';
import '@fontsource/montserrat/latin-600.css';
import { type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { InlineSelect as CustomSelect } from './components/InlineSelect';
import { AudioHapticsConfigLabel } from './common/AudioHapticsConfigLabel';
import {
  type TablerIcon,
  IconAdjustmentsSpark,
  IconActivity as Activity,
  IconAdjustmentsHorizontal as Settings2,
  IconViewfinder,
  IconAlertHexagon,
  IconAlertTriangle,
  IconArrowRight as ArrowRight,
  IconBatteryEco,
  IconBell as Bell,
  IconBinary,
  IconBolt as Zap,
  IconBooks,
  IconBulb,
  IconCheck as Check,
  IconChevronDown as ChevronDown,
  IconCircleCheck,
  IconCpu,
  IconDeviceFloppy as Save,
  IconDeviceGamepad2,
  IconDeviceGamepad3,
  IconExternalLink,
  IconEyeOff,
  IconFlame,
  IconFlask2,
  IconBrandDeezer,
  IconBrandDiscord,
  IconDeviceAudioTape,
  IconBrandXbox,
  IconBrandGithub,
  IconHeart as Heart,
  IconDeviceMobileVibration as Vibrate,
  IconHeadphones as Headphones,
  IconKeyboard as Keyboard,
  IconLayoutDashboard,
  IconLink as LinkIcon,
  IconLinkOff as LinkOffIcon,
  IconMicrophone as Mic,
  IconMicrophoneOff as MicOff,
  IconMinus as Minus,
  IconMoon as Moon,
  IconPalette as Palette,
  IconPencil as Pencil,
  IconPlayerPlay as Play,
  IconPlus as Plus,
  IconQuestionMark,
  IconRadioactive,
  IconRefresh as RefreshCcw,
  IconReplace,
  IconSettings as SettingsIcon,
  IconBluetooth,
  IconSparkleHighlight,
  IconSparkles as Sparkles,
  IconStethoscope,
  IconTestPipe,
  IconTool,
  IconTrash as Trash2,
  IconUpload,
  IconUsb,
  IconVolume,
  IconVolume as Volume2,
  IconVolumeOff as VolumeX,
  IconX as X
} from '@tabler/icons-react';
import playStationLogoUrl from '../../../assets/brand/playstation-logo.svg';
import controllerImage from '../../../assets/controllers/dualsense-edge-front.svg';
import dpadDownGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Down.svg';
import dpadUpGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Up.svg';
import psHomeGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Home.svg';
import triangleGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Triangle.svg';
import {
  DEFAULT_UI_THEME_PRESET,
  UI_THEME_KOFI_BADGES,
  UI_THEME_OPTIONS,
  UI_THEME_PREVIEW_SWATCHES
} from './ui-themes';
import { saveUiThemePreset, storedUiThemePreset } from './ui-theme-preferences';
import {
  applyUiTextScalePercent,
  saveUiTextScalePercent,
  storedUiTextScalePercent
} from './ui-text-scale-preferences';
import { useDocumentTheme } from './common/use-document-theme';
import { documentHidden, useDocumentVisible } from './common/use-document-visible';
import { BridgeMark } from './features/shell/BridgeMark';
import { MainAppShell } from './features/shell/MainAppShell';
import { ShellSidebarHeader } from './features/shell/ShellSidebarHeader';
// Pages that load on first visit come from composition/lazy-pages; their
// controllers and dialogs are imported from their own modules so the pages stay
// out of the main chunk.
import { SettingsSidebar } from './features/settings/SettingsSidebar';
import { useSettingsNavigation } from './features/settings/use-settings-navigation';
import type { SettingsFocusTarget } from './features/settings/settings-navigation';
import type { SettingsPageActions, SettingsPageModel } from './features/settings/types';
import {
  LazyButtonRemappingPage,
  LazyChordsPage,
  LazyDevicesPage,
  LazySettingsPage,
  LazyStickDeadzonesPage
} from './composition/lazy-pages';
import { DeferredPage } from './common/DeferredPage';
import { ShellBridgeSelector } from './features/shell/ShellBridgeSelector';
import { ShellNotifications } from './features/shell/ShellNotifications';
import { ShellSidebarDevice } from './features/shell/ShellSidebarDevice';
import { ShellSupportBadge } from './features/shell/ShellSupportBadge';
import { CONTROL_TAB_DEFINITIONS, controlPanelIdFor, type ControlTab } from './features/shell/control-tabs';
import {
  STARTING_BRIDGE_LABEL,
  StartupPlaceholderPage,
  StartupTutorial,
  startingDevicePresentation,
  useStartupTutorial
} from './features/startup';
import { useLocalization, type UiLocalePreference } from './common/localization';
import type { AppRuntime } from './composition/app-runtime';
import { FeatureTipsPanel } from './common/FeatureTipsPanel';
import { ProfileSaveStatus } from './common/ProfileSaveStatus';
import { PERCENT_SLIDER_TICKS, sliderTickClass } from './common/slider-ticks';
import {
  CONTROLLER_POWER_SAVING_CAP_PERCENT,
  capControllerPowerSavingValue,
  controllerPowerSavingActiveFromSnapshot
} from './common/controller-power-saving';
import { useStickDeadzonesController } from './features/stick-deadzones/use-stick-deadzones-controller';
import { useDevicesController } from './features/devices/use-devices-controller';
import { ControllerLightingPage, useControllerLightingController } from './features/controller-lighting';
import { ControllerAudioPage, useControllerAudioController } from './features/controller-audio';
import { AdaptiveTriggersPage, useAdaptiveTriggersController } from './features/adaptive-triggers';
import { TRIGGER_EFFECT_STEP, snapTriggerEffectIntensity } from './features/adaptive-triggers/model';
import { TriggerLabProfileDialog, useTriggerLabController } from './features/trigger-lab';
import { ButtonRemappingProfileDialog } from './features/button-remapping/ButtonRemappingProfileDialog';
import { useButtonRemappingController } from './features/button-remapping/use-button-remapping-controller';
import { ChordFunctionDialog } from './features/chords/ChordFunctionDialog';
import { useChordsController } from './features/chords/use-chords-controller';
import { BootloaderConfirmationDialog } from './features/bootloader-confirmation';
import {
  KITSUNE_INPUT_PURCHASE_URL,
  KITSUNE_INPUT_URL,
  KitsuneInputLaunchOffer,
  KitsuneInputPromotionDialog,
  KitsunePromotionBanner,
  useKitsuneLaunchOffer
} from './features/kitsune-promotion';
import { lightbarColorLabel, LIGHTBAR_BRIGHTNESS_STEP, snapLightbarBrightness } from './features/controller-lighting/model';
import { normalizeUiLocalePreference } from '../shared/ui-locale-matching';
import {
  CHORD_CONTROLLER_SETTING_STEP_DEFAULT,
  CHORD_CONTROLLER_SETTING_STEP_MAX,
  CHORD_CONTROLLER_SETTING_STEP_MIN,
  CHORD_MUTE_STARTER_ID,
  DEFAULT_BUTTON_REMAP_PROFILE_ID,
  DEFAULT_CONTROLLER_PROFILE_ID,
  MAX_CHORD_ASSIGNMENTS,
  MAX_CHORD_FUNCTION_NAME_LENGTH,
  MAX_KEYBOARD_FUNCTION_KEYS,
  RADIAL_DEADZONE_MAX_PERCENT,
  REMAP_BUTTON_IDS,
  ackResultName,
  normalizeChordControllerSettingStepPercent,
  isChordBindingAllowed,
  normalizeRadialDeadzonePercent
} from '../shared/protocol';
import type {
  AudioReactiveHapticsBassFocus,
  AudioReactiveHapticsConfig,
  AudioReactiveHapticsMode,
  AudioReactiveHapticsSource,
  AudioReactiveHapticsAttack,
  AudioReactiveHapticsRelease,
  AudioReactiveHapticsResponse,
  ChordAssignment,
  ChordAssignableButtonId,
  ChordControllerSettingAction,
  ChordFunction,
  ChordFunctionType,
  ChordMediaAction,
  ChordStarterId,
  ControllerProfileSettings,
  HostPersonaMode,
  MuteButtonMode,
  MuteKeyboardBehavior,
  PollingRateMode,
  BridgeStatusPayload,
  RemapButtonId,
  TriggerTestMode,
  TriggerTestTarget
} from '../shared/protocol';
import {
  UI_SCALE_PERCENTS,
  UI_TEXT_SCALE_PERCENTS,
  type AudioHapticsSession,
  type BridgeSnapshot,
  type UiScalePercent,
  type UiTextScalePercent,
  type UiThemePreset
} from '../shared/types';
import { ControllerType, DEFAULT_REMAP_DRAFT, DualSenseEdgeRemapButtonId, KnownControllerType, LAST_REMAP_CONTROLLER_TYPE_STORAGE_KEY, REMAP_ALL_BUTTON_IDS, REMAP_BUTTONS, REMAP_EDGE_BUTTON_IDS, REMAP_LEFT_BUTTON_IDS, REMAP_RIGHT_BUTTON_IDS, REMAP_STANDARD_BUTTON_IDS, REMAP_STANDARD_TARGET_BUTTON_IDS, RemapGlyphOption, RemapSourceGlyph, StandardRemapButtonId, remapTargetOptionsFor, storedRemapControllerType } from './features/button-remapping/remap-buttons';
import { EdgeRemapControlLayout, REMAP_EDGE_CONTROL_POINTS, REMAP_EDGE_LAYOUT_ASSET, REMAP_EDGE_LINE_POINTS, REMAP_STANDARD_LAYOUT_ASSET, RemapCalloutLayout } from './features/button-remapping/remap-layout';
import { CHORD_BUTTON_MENU_IDS, CHORD_CONTROLLER_SETTING_ACTION_OPTIONS, CHORD_FUNCTION_TYPE_OPTIONS, CHORD_KEYBOARD_KEY_MAX_LABEL_LENGTH, CHORD_KEYBOARD_KEY_OPTIONS, CHORD_KEYBOARD_MODIFIER_OPTIONS, CHORD_MEDIA_ACTION_OPTIONS, CHORD_STARTERS, CHORD_STARTER_OPTIONS, CHORD_UNASSIGNED_BUTTON, ChordAssignmentDraftRow, ChordAssignmentDragSession, ChordAssignmentDropHint, ChordAssignmentScrollbarState, ChordButtonSelectValue, ChordFunctionDialogMode, ChordFunctionDialogState, ChordFunctionDraft, ChordKeyboardModifier, EMPTY_CHORD_FUNCTION_DRAFT, chordAssignmentKey, chordAssignmentLabel, chordBindingKey, chordButtonLabel, chordControllerSettingActionFromSelectValue, chordControllerSettingAdjustmentText, chordControllerSettingSelectValue, chordFunctionFromDraft, chordFunctionSummary, chordFunctionToDraft, chordFunctionTypeLabel, chordNotchTargetForAction, createChordAssignmentId } from './features/chords/model';
import { ChordButtonGlyphOption, ChordStarterGlyphOption } from './features/chords/ChordGlyphs';
import { AUDIO_BUFFER_LENGTH_MAX, AUDIO_BUFFER_LENGTH_MIN, BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE, BRIDGE_MIC_ENDPOINT_UNAVAILABLE, MIC_VOLUME_PRESETS, MIC_VOLUME_STEP, SPEAKER_GAIN_OPTIONS, SPEAKER_VOLUME_PRESETS, SPEAKER_VOLUME_STEP, TEST_MIC_LISTEN_MS, TEST_SPEAKER_ENDPOINT_REFRESH_MS, TEST_SPEAKER_LOCK_MS, TEST_SPEAKER_VOLUME_SETTLE_MS, audioBufferDelayLabel, audioBufferPercent, audioBufferZoneLabel, audioBufferZoneTone, audioBufferZoneTooltip, clampAudioBufferLength, snapMicVolume, snapSpeakerVolume } from './features/controller-audio/model';
import { delay, findBridgeAudioOutputId, playMicLiveListen, stopMicLiveListen } from './features/controller-audio/audio-playback';

type RemapProfileDialogMode = 'save' | 'rename' | 'delete';
type ControllerProfileDialogMode = 'save' | 'rename' | 'delete';
type NotificationFocusTarget = 'controller-status' | 'low-battery' | 'all';

const HAPTICS_STEP = 20;
const STANDARD_FEEDBACK_GAIN_PERCENT = 200;
const BOOSTED_FEEDBACK_GAIN_PERCENT = 500;
const TEST_HAPTICS_LOCK_MS = 1100;
const SLEEP_CONFIRM_MS = 2400;
const HAPTICS_PRESETS: Array<[string, number]> = [
  ['Low', 50],
  ['Medium', 100],
  ['High', 150]
];
const STANDARD_HAPTICS_SLIDER_TICKS = Array.from({ length: 11 }, (_, index) => index * 20);
const MUTE_KEY_OPTIONS: Array<[string, number]> = [
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
const MUTE_MODIFIER_OPTIONS: Array<[string, number]> = [
  ['Ctrl', 0x01],
  ['Shift', 0x02],
  ['Alt', 0x04],
  ['Win', 0x08]
];
const MUTE_BUTTON_MODE_OPTIONS: Array<[string, MuteButtonMode]> = [
  ['Normal', 'normal'],
  ['Keyboard Key', 'keyboard'],
  ['Quiet Toggle', 'quiet'],
  ['Chord', 'chord']
];
const MUTE_KEYBOARD_BEHAVIOR_OPTIONS: Array<[string, MuteKeyboardBehavior]> = [
  ['Tap Once', 'tap'],
  ['Hold While Pressed', 'hold']
];
const POLLING_RATE_OPTIONS: Array<[string, PollingRateMode]> = [
  ['1000 Hz / Real-time', '1000'],
  ['500 Hz', '500'],
  ['250 Hz', '250']
];
const HOST_PERSONA_OPTIONS: Array<[string, HostPersonaMode]> = [
  ['DualSense', 'dualsense'],
  ['DualSense Edge', 'dualsense-edge'],
  ['DualShock 4', 'ds4'],
  ['Xbox', 'xbox']
];
const HOST_PERSONA_SHORT_LABELS: Record<HostPersonaMode, string> = {
  dualsense: 'DS',
  'dualsense-edge': 'DSE',
  ds4: 'DS4',
  xbox: 'XBOX'
};
const AUDIO_REACTIVE_HAPTICS_MODE_OPTIONS: Array<[string, AudioReactiveHapticsMode]> = [
  ['Mix', 'mix'],
  ['Replace', 'replace']
];
const AUDIO_REACTIVE_HAPTICS_BASS_FOCUS_OPTIONS: Array<[string, AudioReactiveHapticsBassFocus]> = [
  ['80 Hz', 'deep'],
  ['160 Hz', 'balanced'],
  ['240 Hz', 'punchy'],
  ['400 Hz', 'wide']
];
const AUDIO_REACTIVE_HAPTICS_RESPONSE_OPTIONS: Array<[string, AudioReactiveHapticsResponse]> = [
  ['Subtle', 'subtle'],
  ['Dynamic', 'balanced'],
  ['Aggressive', 'strong']
];
const AUDIO_REACTIVE_HAPTICS_ATTACK_OPTIONS: Array<[string, AudioReactiveHapticsAttack]> = [
  ['Slow Ramp', 'soft'],
  ['Medium Ramp', 'balanced'],
  ['Fast Ramp', 'fast'],
  ['Instant Ramp', 'sharp']
];
const AUDIO_REACTIVE_HAPTICS_RELEASE_OPTIONS: Array<[string, AudioReactiveHapticsRelease]> = [
  ['Fast Fade', 'tight'],
  ['Medium Fade', 'balanced'],
  ['Slow Fade', 'smooth'],
  ['Long Fade', 'long']
];
const AUDIO_REACTIVE_HAPTICS_FIELD_TOOLTIPS = {
  bassFocus: 'Applies a low-pass filter that chooses which part of the low-end audio becomes vibration.',
  response: 'Controls how strongly haptics react to audio, especially louder peaks.',
  attack: 'Controls how quickly the haptics ramp when a sound rises or spikes.',
  release: 'Controls how quickly the haptics fade when a sound drops.'
} as const;
function snapHapticsValue(value: number, max = STANDARD_FEEDBACK_GAIN_PERCENT): number {
  return Math.max(0, Math.min(max, Math.round(value / HAPTICS_STEP) * HAPTICS_STEP));
}

function audioHapticsAppSource(source: AudioReactiveHapticsSource | null | undefined) {
  return source && typeof source === 'object' && source.kind === 'app-session' ? source : null;
}

function audioHapticsSessionKey(session: AudioHapticsSession): string {
  if (session.processPath) {
    return `app-path:${session.processPath.toLowerCase()}`;
  }
  if (session.executableName) {
    return `app-exe:${session.executableName.toLowerCase()}`;
  }
  return `app-pid:${session.processId}`;
}

function audioHapticsSourceKey(source: AudioReactiveHapticsSource | null | undefined): string {
  const appSource = audioHapticsAppSource(source);
  if (!appSource) {
    return 'system-audio';
  }
  if (appSource.processPath) {
    return `app-path:${appSource.processPath.toLowerCase()}`;
  }
  if (appSource.executableName) {
    return `app-exe:${appSource.executableName.toLowerCase()}`;
  }
  return `app-pid:${Math.max(0, Math.round(appSource.processId))}`;
}

function audioHapticsSourceFromSession(session: AudioHapticsSession): AudioReactiveHapticsSource {
  return {
    kind: 'app-session',
    processId: session.processId,
    displayName: session.displayName,
    ...(session.executableName ? { executableName: session.executableName } : {}),
    ...(session.processPath ? { processPath: session.processPath } : {}),
    ...(session.sessionIdentifier ? { sessionIdentifier: session.sessionIdentifier } : {}),
    ...(session.sessionInstanceIdentifier ? { sessionInstanceIdentifier: session.sessionInstanceIdentifier } : {})
  };
}

function audioHapticsSourceDisplayName(source: AudioReactiveHapticsSource | null | undefined): string {
  const appSource = audioHapticsAppSource(source);
  if (!appSource) {
    return 'System';
  }
  return appSource.displayName
    || appSource.executableName?.replace(/\.[^.]+$/, '')
    || 'Selected app';
}

function feedbackSliderMaxFromSnapshot(snapshot: BridgeSnapshot | null | undefined): number {
  if (controllerPowerSavingActiveFromSnapshot(snapshot)) {
    return CONTROLLER_POWER_SAVING_CAP_PERCENT;
  }
  return snapshot?.settings.feedbackBoostEnabled ? BOOSTED_FEEDBACK_GAIN_PERCENT : STANDARD_FEEDBACK_GAIN_PERCENT;
}

function feedbackSliderTicks(max: number): number[] {
  if (max === STANDARD_FEEDBACK_GAIN_PERCENT) {
    return STANDARD_HAPTICS_SLIDER_TICKS;
  }
  return Array.from({ length: 11 }, (_, index) => (max / 10) * index);
}

function displayHapticsValue(snapshot: BridgeSnapshot): number {
  return capControllerPowerSavingValue(snapshot.settings.hapticsGainPercent, snapshot);
}

function displayClassicRumbleValue(snapshot: BridgeSnapshot): number {
  return capControllerPowerSavingValue(snapshot.settings.classicRumbleGainPercent, snapshot);
}


function controllerProfileSettingsFromSnapshot(snapshot: BridgeSnapshot): ControllerProfileSettings {
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

function optionLabel<T extends string | number>(options: Array<[string, T]>, value: T): string {
  return options.find(([, optionValue]) => optionValue === value)?.[0] ?? String(value);
}

function enabledLabel(enabled: boolean): string {
  return enabled ? 'On' : 'Off';
}

function percentLabel(value: number): string {
  return `${value}%`;
}

function muteButtonSummary(settings: ControllerProfileSettings): string {
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

function SystemProfileSummary({
  settings,
  powerSavingActive
}: {
  settings: ControllerProfileSettings;
  powerSavingActive: boolean;
}) {
  const ecoValueClass = (active: boolean) => (active ? ' eco-limited' : '');
  const effectiveEcoPercent = (value: number) => percentLabel(Math.min(value, CONTROLLER_POWER_SAVING_CAP_PERCENT));
  const hapticsEcoLimited = powerSavingActive
    && settings.hapticsEnabled
    && settings.hapticsGainPercent > 0;
  const rumbleEcoLimited = powerSavingActive
    && settings.classicRumbleEnabled
    && settings.classicRumbleGainPercent > 0;
  const triggersEcoLimited = powerSavingActive
    && settings.adaptiveTriggersEnabled
    && settings.triggerEffectIntensityPercent > 0;
  const lightbarEcoLimited = powerSavingActive
    && settings.lightbarEnabled
    && settings.lightbarBrightnessPercent > 0;

  return (
    <div className="system-profile-summary" aria-label="Current profile settings">
      <div className="system-profile-summary-group">
        <div className="system-profile-summary-heading">
          <Volume2 size={15} />
          <h3>Audio</h3>
        </div>
        <dl>
          <div><dt>Speaker</dt><dd>{settings.speakerEnabled ? percentLabel(settings.speakerVolumePercent) : 'Off'}</dd></div>
          <div><dt>Mic</dt><dd>{settings.micMuted ? 'Muted' : percentLabel(settings.micVolumePercent)}</dd></div>
          <div><dt>Pass-through</dt><dd>{enabledLabel(settings.duplexMicEnabled)}</dd></div>
        </dl>
      </div>

      <div className="system-profile-summary-group">
        <div className="system-profile-summary-heading">
          <Sparkles size={15} />
          <h3>Feel</h3>
        </div>
        <dl>
          <div><dt>Haptics</dt><dd className={ecoValueClass(hapticsEcoLimited)}>{settings.hapticsEnabled ? (hapticsEcoLimited ? effectiveEcoPercent(settings.hapticsGainPercent) : percentLabel(settings.hapticsGainPercent)) : 'Off'}</dd></div>
          <div><dt>Rumble</dt><dd className={ecoValueClass(rumbleEcoLimited)}>{settings.classicRumbleEnabled ? (rumbleEcoLimited ? effectiveEcoPercent(settings.classicRumbleGainPercent) : percentLabel(settings.classicRumbleGainPercent)) : 'Off'}</dd></div>
          <div><dt>Triggers</dt><dd className={ecoValueClass(triggersEcoLimited)}>{settings.adaptiveTriggersEnabled ? (triggersEcoLimited ? effectiveEcoPercent(settings.triggerEffectIntensityPercent) : percentLabel(settings.triggerEffectIntensityPercent)) : 'Off'}</dd></div>
          <div><dt>Stick DZ</dt><dd>{`${settings.leftStickRadialDeadzonePercent}% / ${settings.rightStickRadialDeadzonePercent}%`}</dd></div>
        </dl>
      </div>

      <div className="system-profile-summary-group">
        <div className="system-profile-summary-heading">
          <IconBulb size={15} />
          <h3>Lighting</h3>
        </div>
        <dl>
          <div><dt>Lightbar</dt><dd className={ecoValueClass(lightbarEcoLimited)}>{settings.lightbarEnabled ? (lightbarEcoLimited ? effectiveEcoPercent(settings.lightbarBrightnessPercent) : percentLabel(settings.lightbarBrightnessPercent)) : 'Off'}</dd></div>
          <div><dt>Color</dt><dd>{lightbarColorLabel(settings.lightbarColor)}</dd></div>
          <div><dt>Override</dt><dd>{enabledLabel(settings.lightbarOverrideEnabled)}</dd></div>
        </dl>
      </div>

      <div className="system-profile-summary-group">
        <div className="system-profile-summary-heading">
          <Settings2 size={15} />
          <h3>System</h3>
        </div>
        <dl>
          <div><dt>Mute</dt><dd>{muteButtonSummary(settings)}</dd></div>
          <div><dt>Polling</dt><dd>{optionLabel(POLLING_RATE_OPTIONS, settings.pollingRateMode)}</dd></div>
          <div><dt>Edge Profiles</dt><dd>{settings.edgeProfileSwitchingBlocked ? 'Blocked' : 'Available'}</dd></div>
          <div><dt>Power Save</dt><dd>{enabledLabel(settings.controllerPowerSavingEnabled)}</dd></div>
        </dl>
      </div>
    </div>
  );
}


function batteryLabel(snapshot: BridgeSnapshot | null | undefined): string {
  const battery = snapshot?.status?.batteryPercent;
  return battery === null || battery === undefined ? '\u2014' : `${battery}%`;
}

function isChargingPowerState(rawPowerState: number | undefined): boolean {
  return rawPowerState === 0x01;
}

function isExternalPowerState(rawPowerState: number | undefined): boolean {
  return rawPowerState === 0x01 || rawPowerState === 0x02;
}

function controllerName(type: string | undefined): string {
  if (type === 'dualsense-edge') return 'DualSense Edge';
  if (type === 'dualsense') return 'DualSense';
  return 'Controller';
}

function healthLabel(snapshot: BridgeSnapshot | null | undefined): string {
  if (!snapshot) return 'Unavailable';
  if (snapshot.state !== 'connected') {
    return /^Firmware .+ update required$/i.test(snapshot.message)
      ? 'Update required: Bridge Settings > Firmware'
      : snapshot.message;
  }
  if (snapshot.diagnostics.lastError) return snapshot.diagnostics.lastError;
  if (snapshot.diagnostics.firmwareUpdateAvailable) {
    return `Firmware ${snapshot.diagnostics.firmwareUpdateAvailable.availableVersion} available`;
  }
  if (!snapshot.status?.controllerConnected && snapshot.settings.wakeOnConnectEnabled) {
    return 'Wake with controller enabled';
  }
  if (!snapshot.status?.controllerConnected) return 'Bridge online';
  return 'All systems normal';
}

function healthTitle(snapshot: BridgeSnapshot | null | undefined): string | undefined {
  if (
    snapshot?.state !== 'connected'
    || snapshot.diagnostics.lastError
    || snapshot.diagnostics.firmwareUpdateAvailable
    || snapshot.status?.controllerConnected
  ) {
    return undefined;
  }
  return snapshot.settings.wakeOnConnectEnabled
    ? 'The Pico bridge is online. Controller wake is enabled, but no controller is connected.'
    : 'The Pico bridge is online and waiting for a controller.';
}

function hexByte(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

function UptimeValue({
  active,
  lastPollAt,
  uptimeSeconds
}: {
  active: boolean;
  lastPollAt: number | null;
  uptimeSeconds: number | null;
}) {
  const [displayUptime, setDisplayUptime] = useState<number | null>(uptimeSeconds);

  useEffect(() => {
    if (!active || !lastPollAt || uptimeSeconds === null) {
      setDisplayUptime(uptimeSeconds);
      return;
    }

    const updateUptime = () => {
      const elapsedSeconds = Math.floor((Date.now() - lastPollAt) / 1000);
      setDisplayUptime(uptimeSeconds + Math.max(0, elapsedSeconds));
    };

    updateUptime();
    const handle = window.setInterval(updateUptime, 1000);
    return () => window.clearInterval(handle);
  }, [active, lastPollAt, uptimeSeconds]);

  return <span className="uptime-value">{displayUptime ?? '--'}s</span>;
}

function HostPersonaOption({ label, value }: { label: string; value: HostPersonaMode }) {
  const sonyPersona = value === 'dualsense' || value === 'dualsense-edge' || value === 'ds4';
  return (
    <span className="host-persona-option">
      {sonyPersona ? (
        <span
          className="host-persona-brand-icon"
          style={{ '--host-persona-brand-mask': `url("${playStationLogoUrl}")` } as CSSProperties}
          aria-hidden="true"
        />
      ) : (
        <IconBrandXbox size={18} aria-hidden="true" />
      )}
      <span className="host-persona-label">{label}</span>
    </span>
  );
}

function AudioHapticsSourceOption({
  label,
  value,
  session,
  loading
}: {
  label: string;
  value: string;
  session?: AudioHapticsSession;
  loading?: boolean;
}) {
  const system = value === 'system-audio';
  const unavailable = !system && !session;
  let sublabel = 'System mix';
  if (!system) {
    if (!session) {
      sublabel = loading ? 'Scanning' : 'Unavailable';
    } else {
      sublabel = session.state === 'active'
        ? session.endpointName || 'Active'
        : 'Idle';
    }
  }
  return (
    <span className={`audio-haptics-source-option ${unavailable ? 'unavailable' : ''}`}>
      <span className="audio-haptics-source-icon" aria-hidden="true">
        {system ? (
          <IconDeviceAudioTape size={17} />
        ) : session?.iconDataUrl ? (
          <img src={session.iconDataUrl} alt="" />
        ) : (
          <IconBrandDeezer size={17} />
        )}
      </span>
      <span className="audio-haptics-source-copy">
        <strong>{label}</strong>
        <small>{sublabel}</small>
      </span>
    </span>
  );
}

export function App() {
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [bridgeRenameDraft, setBridgeRenameDraft] = useState<{ uniqueId: string; value: string } | null>(null);
  const [activeControlTab, setActiveControlTab] = useState<ControlTab>('overview');
  const [hapticsValue, setHapticsValue] = useState(100);
  const [classicRumbleValue, setClassicRumbleValue] = useState(100);
  const triggerLabOpen = activeControlTab === 'trigger-lab';
  const audioHapticsOpen = activeControlTab === 'audio-haptics';
  const [audioHapticsSessions, setAudioHapticsSessions] = useState<AudioHapticsSession[]>([]);
  const [audioHapticsSessionsLoading, setAudioHapticsSessionsLoading] = useState(false);
  const [controllerProfileDialogMode, setControllerProfileDialogMode] = useState<ControllerProfileDialogMode | null>(null);
  const [controllerProfileNameDraft, setControllerProfileNameDraft] = useState('');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [settingsReturnTab, setSettingsReturnTab] = useState<ControlTab>('overview');
  const [settingsFocusTarget, setSettingsFocusTarget] = useState<SettingsFocusTarget | null>(null);
  const [notificationFocusTarget, setNotificationFocusTarget] = useState<NotificationFocusTarget | null>(null);
  const [showNotificationsMenu, setShowNotificationsMenu] = useState(false);
  const [showKitsuneInputPromotion, setShowKitsuneInputPromotion] = useState(false);
  const [showClassicRumbleControl, setShowClassicRumbleControl] = useState(false);
  const [windowDragging, setWindowDragging] = useState(false);
  const [testLocked, setTestLocked] = useState(false);
  const [startupTheme, setStartupTheme] = useState<UiThemePreset>(storedUiThemePreset);
  const [startupTextScale, setStartupTextScale] = useState<UiTextScalePercent>(storedUiTextScalePercent);
  const localization = useLocalization();
  // Hidden or minimized, the app stops rendering snapshots and pauses its polling.
  const windowVisible = useDocumentVisible();
  const [hapticsCommitPending, setHapticsCommitPending] = useState(false);
  const [classicRumbleCommitPending, setClassicRumbleCommitPending] = useState(false);
  const [classicRumbleV1CommitPending, setClassicRumbleV1CommitPending] = useState(false);
  const [feedbackBoostCommitPending, setFeedbackBoostCommitPending] = useState(false);
  const [audioReactiveHapticsCommitPending, setAudioReactiveHapticsCommitPending] = useState(false);
  const [overviewSleepConfirmVisible, setOverviewSleepConfirmVisible] = useState(false);
  const [deviceCleanupConfirmVisible, setDeviceCleanupConfirmVisible] = useState(false);
  const startupTutorial = useStartupTutorial();
  const [deviceCleanupMessage, setDeviceCleanupMessage] = useState<string | null>(null);
  const [deviceCleanupError, setDeviceCleanupError] = useState<string | null>(null);
  const [picoFirmwareMessage, setPicoFirmwareMessage] = useState<string | null>(null);
  const [picoFirmwareError, setPicoFirmwareError] = useState<string | null>(null);
  const hapticsEditingRef = useRef(false);
  const classicRumbleEditingRef = useRef(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const bridgeRenameCancelledRef = useRef(false);
  const overviewSleepConfirmTimerRef = useRef<number | null>(null);
  const settingsFocusTimerRef = useRef<number | null>(null);
  const notificationFocusTimerRef = useRef<number | null>(null);
  const windowDraggingRef = useRef(false);
  const windowDragReleaseTimerRef = useRef<number | null>(null);
  const deferredSnapshotRef = useRef<BridgeSnapshot | null>(null);
  const overviewSleepConfirmArmedRef = useRef(false);
  const kitsuneLaunchOffer = useKitsuneLaunchOffer({
    eligible: Boolean(snapshot) && !snapshot?.settings.kitsuneInputLaunchOfferShown,
    blocked: startupTutorial.step !== 'done'
      || Boolean(snapshot?.bootloaderConfirmation)
      || showKitsuneInputPromotion,
    markShown: () => void runQuietAction(() => window.bridge.markKitsuneInputLaunchOfferShown())
  });

  useEffect(() => {
    const liveTheme = snapshot?.settings.uiThemePreset;
    if (!liveTheme) return;
    setStartupTheme(liveTheme);
    saveUiThemePreset(liveTheme);
  }, [snapshot?.settings.uiThemePreset]);

  useEffect(() => {
    const liveLocale = snapshot?.settings.uiLocale;
    if (!liveLocale || liveLocale === localization.preference) return;
    localization.setPreference(liveLocale);
  }, [snapshot?.settings.uiLocale]);

  useEffect(() => {
    const liveTextScale = snapshot?.settings.uiTextScalePercent;
    if (!liveTextScale) return;
    setStartupTextScale(liveTextScale);
    applyUiTextScalePercent(liveTextScale);
    saveUiTextScalePercent(liveTextScale);
  }, [snapshot?.settings.uiTextScalePercent]);

  const personaTransition = snapshot?.personaTransition ?? null;
  const personaTransitionActive = Boolean(personaTransition);
  const connected = snapshot?.state === 'connected';
  const controllerConnected = Boolean(snapshot?.status?.controllerConnected);
  const controllerControlsAvailable = connected && controllerConnected;
  const runtime: AppRuntime = {
    snapshot,
    connected,
    controllerConnected,
    controllerControlsAvailable,
    pendingAction,
    setSnapshot,
    setPendingAction,
    applySnapshot,
    runAction,
    runQuietAction
  };
  const stickDeadzones = useStickDeadzonesController(runtime, activeControlTab === 'deadzones' && windowVisible);
  const devices = useDevicesController(runtime);
  const lighting = useControllerLightingController(runtime);
  const audio = useControllerAudioController(runtime, { lightbarCommitPending: lighting.lightbarCommitPending });
  const triggers = useAdaptiveTriggersController(runtime);
  const triggerLab = useTriggerLabController(runtime, triggers);
  const buttonRemapping = useButtonRemappingController(runtime, activeControlTab === 'remapping');
  const { showDualSenseEdgeRemapButtons } = buttonRemapping;
  const chords = useChordsController(runtime, { active: activeControlTab === 'chords', showDualSenseEdgeRemapButtons });
  const selectedControllerProfile = snapshot?.settings.controllerProfiles.find((profile) => (
    profile.id === snapshot.settings.selectedControllerProfileId
  ));
  const selectedControllerProfileId = selectedControllerProfile?.id ?? DEFAULT_CONTROLLER_PROFILE_ID;
  const controllerProfileOptions = useMemo<Array<[string, string]>>(() => (
    snapshot?.settings.controllerProfiles.map((profile) => [profile.name, profile.id]) ?? [['Default', DEFAULT_CONTROLLER_PROFILE_ID]]
  ), [snapshot?.settings.controllerProfiles]);
  const selectedControllerProfileIsDefault = selectedControllerProfileId === DEFAULT_CONTROLLER_PROFILE_ID;
  const canDeleteControllerProfile = !selectedControllerProfileIsDefault;
  function applySnapshot(next: BridgeSnapshot) {
    setSnapshot(next);
    buttonRemapping.syncSnapshot(next);
    if (!hapticsEditingRef.current) {
      setHapticsValue(displayHapticsValue(next));
    }
    stickDeadzones.syncSnapshot(next);
    if (!classicRumbleEditingRef.current) {
      setClassicRumbleValue(displayClassicRumbleValue(next));
    }
    audio.syncSnapshot(next);
    lighting.syncSnapshot(next);
    triggers.syncSnapshot(next);
  }

  function finishWindowDrag() {
    windowDraggingRef.current = false;
    setWindowDragging(false);
    if (windowDragReleaseTimerRef.current !== null) {
      window.clearTimeout(windowDragReleaseTimerRef.current);
      windowDragReleaseTimerRef.current = null;
    }
    const deferredSnapshot = deferredSnapshotRef.current;
    deferredSnapshotRef.current = null;
    if (deferredSnapshot) {
      applySnapshot(deferredSnapshot);
    }
  }

  function beginWindowDrag() {
    windowDraggingRef.current = true;
    setWindowDragging(true);
    if (windowDragReleaseTimerRef.current !== null) {
      window.clearTimeout(windowDragReleaseTimerRef.current);
    }
    windowDragReleaseTimerRef.current = window.setTimeout(finishWindowDrag, 1600);
    window.addEventListener('mouseup', finishWindowDrag, { once: true });
    window.addEventListener('blur', finishWindowDrag, { once: true });
  }

  const audioReactiveHapticsSource = snapshot?.settings.audioReactiveHapticsSource ?? 'system-audio';
  const audioReactiveHapticsSourceKey = audioHapticsSourceKey(audioReactiveHapticsSource);

  useEffect(() => {
    let cancelled = false;
    let receivedLiveSnapshot = false;
    // The bridge service sends a snapshot on every status poll. While the window
    // is being dragged, hidden, or minimized only the newest one is kept, and it
    // is rendered once the window is back.
    const receiveSnapshot = (next: BridgeSnapshot) => {
      if (windowDraggingRef.current || documentHidden()) {
        deferredSnapshotRef.current = next;
        return;
      }
      applySnapshot(next);
    };
    const applyDeferredSnapshotWhenShown = () => {
      if (documentHidden() || windowDraggingRef.current) return;
      const deferredSnapshot = deferredSnapshotRef.current;
      deferredSnapshotRef.current = null;
      if (deferredSnapshot) {
        applySnapshot(deferredSnapshot);
      }
    };
    window.bridge.getStatus().then((next) => {
      if (!cancelled && !receivedLiveSnapshot) {
        receiveSnapshot(next);
      }
    });
    const unsubscribe = window.bridge.onSnapshot((next) => {
      receivedLiveSnapshot = true;
      receiveSnapshot(next);
    });
    document.addEventListener('visibilitychange', applyDeferredSnapshotWhenShown);
    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', applyDeferredSnapshotWhenShown);
      if (overviewSleepConfirmTimerRef.current !== null) {
        window.clearTimeout(overviewSleepConfirmTimerRef.current);
      }
      if (settingsFocusTimerRef.current !== null) {
        window.clearTimeout(settingsFocusTimerRef.current);
      }
      if (notificationFocusTimerRef.current !== null) {
        window.clearTimeout(notificationFocusTimerRef.current);
      }
      if (windowDragReleaseTimerRef.current !== null) {
        window.clearTimeout(windowDragReleaseTimerRef.current);
      }
      window.removeEventListener('mouseup', finishWindowDrag);
      window.removeEventListener('blur', finishWindowDrag);
    };
  }, []);

  useEffect(() => {
    const controllerAudioReady = connected && controllerConnected;
    if (!audioHapticsOpen || !controllerAudioReady) {
      setAudioHapticsSessions([]);
      setAudioHapticsSessionsLoading(false);
      return undefined;
    }
    if (!windowVisible) {
      // Keep the listed sessions; they refresh when the window is shown again.
      return undefined;
    }

    let cancelled = false;
    let refreshInFlight = false;
    async function refreshSessions() {
      if (refreshInFlight) {
        return;
      }
      refreshInFlight = true;
      setAudioHapticsSessionsLoading(true);
      try {
        const sessions = await window.bridge.listAudioHapticsSessions();
        if (!cancelled) {
          setAudioHapticsSessions(sessions);
        }
      } catch {
        if (!cancelled) {
          setAudioHapticsSessions([]);
        }
      } finally {
        refreshInFlight = false;
        if (!cancelled) {
          setAudioHapticsSessionsLoading(false);
        }
      }
    }

    void refreshSessions();
    const interval = window.setInterval(refreshSessions, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [audioHapticsOpen, audioReactiveHapticsSourceKey, connected, controllerConnected, windowVisible]);

  useEffect(() => {
    if (!showNotificationsMenu) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (showNotificationsMenu && !notificationsRef.current?.contains(event.target as Node)) {
        setShowNotificationsMenu(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotificationsMenu(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showNotificationsMenu]);

  const batteryPercentLabel = batteryLabel(snapshot);
  const batteryCharging = isChargingPowerState(snapshot?.status?.rawPowerState);
  const batteryExternalPower = isExternalPowerState(snapshot?.status?.rawPowerState);
  const batteryPowerLabel = batteryExternalPower
    ? batteryCharging ? 'Charging' : 'Connected to power'
    : null;
  const statusTone = personaTransitionActive
    ? 'warn'
    : connected
      ? 'good'
      : snapshot?.state === 'error' || snapshot?.state === 'incompatible'
        ? 'bad'
        : 'idle';
  const lastAck = snapshot?.diagnostics.lastAck;
  const speakerVolumeSupported = Boolean(snapshot?.status?.firmwareFlags.speakerVolumeControl);
  const lightbarSupported = Boolean(snapshot?.status?.firmwareFlags.lightbarControl);
  const lightbarOverrideSupported = Boolean(snapshot?.status?.firmwareFlags.lightbarOverrideControl);
  const muteButtonActionsSupported = Boolean(snapshot?.status?.firmwareFlags.muteButtonActions);
  const adaptiveTriggersSupported = Boolean(snapshot?.status?.firmwareFlags.adaptiveTriggersControl);
  const usbSuspendDisconnectSupported = Boolean(snapshot?.status?.firmwareFlags.usbSuspendDisconnectControl);
  const wakeOnConnectSupported = Boolean(snapshot?.status?.firmwareFlags.wakeOnConnectControl);
  const sleepControllerSupported = Boolean(snapshot?.status?.firmwareFlags.sleepControllerControl);
  const pollingRateControlSupported = Boolean(snapshot?.status?.firmwareFlags.pollingRateControl);
  const hostPersonaControlSupported = Boolean(snapshot?.status?.firmwareFlags.hostPersonaControl);
  const audioBufferLengthControlSupported = Boolean(snapshot?.status?.firmwareFlags.hapticsBufferLengthControl);
  const audioReactiveHapticsSupported = Boolean(snapshot?.status?.firmwareFlags.audioReactiveHapticsControl);
  const supportedHostPersonaModes: HostPersonaMode[] = snapshot?.status?.supportedHostPersonaModes ?? ['dualsense'];
  const hostPersonaOptions = HOST_PERSONA_OPTIONS.filter(([, mode]) => (
    supportedHostPersonaModes.includes(mode) || snapshot?.settings.hostPersonaMode === mode
  ));
  const overviewHostPersonaMode = personaTransition?.to ?? snapshot?.settings.hostPersonaMode ?? 'dualsense';
  const hapticsEnabled = Boolean(snapshot?.settings.hapticsEnabled);
  const audioReactiveHapticsEnabled = Boolean(snapshot?.settings.audioReactiveHapticsEnabled);
  const audioHapticsSessionByKey = useMemo(() => {
    const sessions = new Map<string, AudioHapticsSession>();
    for (const session of audioHapticsSessions) {
      sessions.set(audioHapticsSessionKey(session), session);
    }
    return sessions;
  }, [audioHapticsSessions]);
  const selectedAudioHapticsSourceDisplayName = audioHapticsSessionByKey.get(audioReactiveHapticsSourceKey)?.displayName
    ?? audioHapticsSourceDisplayName(audioReactiveHapticsSource);
  const audioHapticsSourceOptions = useMemo<Array<[string, string]>>(() => {
    const options: Array<[string, string]> = [['System', 'system-audio']];
    for (const session of audioHapticsSessions) {
      options.push([session.displayName, audioHapticsSessionKey(session)]);
    }
    if (
      audioReactiveHapticsSourceKey !== 'system-audio'
      && !audioHapticsSessionByKey.has(audioReactiveHapticsSourceKey)
    ) {
      options.push([`${audioHapticsSourceDisplayName(audioReactiveHapticsSource)} unavailable`, audioReactiveHapticsSourceKey]);
    }
    return options;
  }, [
    audioHapticsSessionByKey,
    audioHapticsSessions,
    audioReactiveHapticsSource,
    audioReactiveHapticsSourceKey
  ]);
  const classicRumbleEnabled = Boolean(snapshot?.settings.classicRumbleEnabled);
  const classicRumbleV1Enabled = Boolean(snapshot?.settings.classicRumbleV1Enabled);
  const activeHapticsFeatureEnabled = showClassicRumbleControl ? classicRumbleEnabled : hapticsEnabled;
  const adaptiveTriggersEnabled = Boolean(snapshot?.settings.adaptiveTriggersEnabled);
  const lightbarEnabled = Boolean(snapshot?.settings.lightbarEnabled);
  const sleepKeybindEnabled = Boolean(snapshot?.settings.sleepKeybindEnabled);
  const controllerToastEnabled = Boolean(snapshot?.settings.notifyControllerConnection);
  const lowBatteryToastEnabled = Boolean(snapshot?.settings.notifyLowBattery);
  const notificationsEnabled = controllerToastEnabled || lowBatteryToastEnabled;
  const adaptiveTriggerOutputActive = Boolean(snapshot?.status?.adaptiveTriggerOutputRecent);
  const audioStatus = snapshot?.diagnostics.audioStatus;
  const headsetOutputDetected = Boolean(audioStatus?.headsetPlugged);
  const controllerPowerSavingActive = controllerPowerSavingActiveFromSnapshot(snapshot);
  const feedbackBoostEnabled = Boolean(snapshot?.settings.feedbackBoostEnabled);
  const hapticsSliderMax = feedbackSliderMaxFromSnapshot(snapshot);
  const hapticsSliderTicks = feedbackSliderTicks(hapticsSliderMax);
  const percentSliderMax = controllerPowerSavingActive ? CONTROLLER_POWER_SAVING_CAP_PERCENT : 100;
  const audioReactiveHapticsRouteSupported = audioReactiveHapticsSupported;
  const audioReactiveHapticsBlocked = !connected
    || !audioReactiveHapticsSupported
    || !audioReactiveHapticsRouteSupported
    || !hapticsEnabled;
  const audioReactiveHapticsControlDisabled = !connected
    || !audioReactiveHapticsSupported
    || pendingAction !== null
    || audioReactiveHapticsCommitPending;
  const audioReactiveHapticsConfigDisabled = audioReactiveHapticsBlocked
    || pendingAction !== null
    || audioReactiveHapticsCommitPending
    || !audioReactiveHapticsEnabled;
  const audioReactiveHapticsStatusLabel = !connected
    ? 'Unavailable'
    : !audioReactiveHapticsSupported
      ? 'Update Firmware'
      : !hapticsEnabled
        ? 'Haptics Off'
        : audioReactiveHapticsEnabled
          ? 'Ready'
          : 'Off';
  const audioReactiveHapticsStatusTone = audioReactiveHapticsEnabled
    && hapticsEnabled
    && audioReactiveHapticsRouteSupported
    ? 'good'
    : connected && (
        !audioReactiveHapticsRouteSupported
        || !hapticsEnabled
      )
      ? 'warn'
      : 'idle';
  const audioReactiveHapticsOverrideMode = snapshot?.settings.audioReactiveHapticsMode === 'replace';
  const audioReactiveHapticsModeBadgeLabel = audioReactiveHapticsEnabled
    ? audioReactiveHapticsOverrideMode ? 'Override' : 'Mixed'
    : null;
  const audioReactiveHapticsModeTooltip = audioReactiveHapticsOverrideMode
    ? 'Audio haptics are replacing native haptic output.'
    : 'Audio haptics are mixed with native haptic output.';
  const testHapticsUnavailable = !connected
    || !hapticsEnabled
    || pendingAction !== null
    || audio.speakerVolumeCommitPending
    || lighting.lightbarCommitPending
    || testLocked
    || Boolean(snapshot?.status?.testHapticsBusy)
    || Boolean(snapshot?.status?.testHapticsCooldown);
  const testRumbleUnavailable = !connected
    || !classicRumbleEnabled
    || pendingAction !== null
    || audio.speakerVolumeCommitPending
    || lighting.lightbarCommitPending
    || testLocked
    || Boolean(snapshot?.status?.testHapticsBusy);
  const hapticsStatusReady = connected
    && hapticsEnabled
    && !testLocked
    && !snapshot?.status?.testHapticsBusy
    && !snapshot?.status?.testHapticsCooldown;
  const rumbleStatusReady = connected
    && classicRumbleEnabled
    && !testLocked
    && !snapshot?.status?.testHapticsBusy;
  const hapticsStatusLabel = testLocked || snapshot?.status?.testHapticsBusy
    ? 'Testing'
      : snapshot?.status?.testHapticsCooldown
        ? 'Cooling Down'
      : hapticsStatusReady
        ? 'Ready'
        : 'Unavailable';
  const rumbleStatusLabel = testLocked
    ? 'Testing'
    : rumbleStatusReady
      ? 'Ready'
      : 'Unavailable';
  const hapticsStatusTone = testLocked || snapshot?.status?.testHapticsBusy || hapticsStatusReady
    ? 'good'
    : connected && snapshot?.status?.testHapticsCooldown
      ? 'warn'
      : 'idle';
  const rumbleStatusTone = testLocked || rumbleStatusReady
    ? 'good'
    : 'idle';
  const activeFeedbackTestUnavailable = showClassicRumbleControl ? testRumbleUnavailable : testHapticsUnavailable;
  const activeFeedbackStatusLabel = showClassicRumbleControl ? rumbleStatusLabel : hapticsStatusLabel;
  const activeFeedbackStatusTone = showClassicRumbleControl ? rumbleStatusTone : hapticsStatusTone;
  const sidebarControllerCard = devices.model.cards.find(
    (device) => device.label === 'Current controller'
  ) ?? devices.model.cards[0] ?? null;
  const sidebarDeviceTitle = personaTransitionActive
    ? 'Switching Mode'
    : sidebarControllerCard?.title
      ?? (connected && controllerConnected ? controllerName(snapshot.status?.controllerType) : 'Controller');
  const sidebarDeviceStatus = personaTransitionActive
    ? 'Switching'
    : connected && controllerConnected
    ? 'Connected'
    : 'Disconnected';
  const sidebarDeviceTone = personaTransitionActive
    ? 'warn'
    : connected && controllerConnected
      ? 'good'
      : connected
        ? 'warn'
        : snapshot?.state === 'error' || snapshot?.state === 'incompatible'
          ? 'bad'
          : 'idle';
  const sidebarBatteryLabel = personaTransitionActive
    ? '\u2014'
    : connected && controllerConnected
    ? batteryPercentLabel
    : '\u2014';
  const bridgeDevices = snapshot?.bridgeDevices ?? null;
  const bridgeSelectOptions: Array<[string, string]> = (bridgeDevices?.bridges ?? []).map((bridge, index) => [
    `${bridge.name ?? `Bridge ${index + 1}`}${bridge.connected ? ' (active)' : ''}`,
    bridge.path
  ]);
  const selectedBridgeInfo = bridgeDevices?.bridges.find((bridge) => bridge.selected)
    ?? bridgeDevices?.bridges.find((bridge) => bridge.connected)
    ?? bridgeDevices?.bridges[0]
    ?? null;
  const activeBridgeSelectValue = selectedBridgeInfo?.path ?? '';
  const directControllers = bridgeDevices?.directControllers ?? [];
  const pollingRateLabel = POLLING_RATE_OPTIONS.find(([, mode]) => mode === snapshot?.settings.pollingRateMode)?.[0]
    .replace(' / Real-time', '')
    ?? '--';
  const firmwareUpdateAvailable = Boolean(snapshot?.diagnostics.firmwareUpdateAvailable);
  const overviewHealthLabel = healthLabel(snapshot);
  const overviewHealthTitle = healthTitle(snapshot);
  const overviewHealthTone = personaTransitionActive
    ? 'warn'
    : snapshot?.diagnostics.lastError
    ? 'bad'
    : firmwareUpdateAvailable
    ? 'warn'
    : connected && controllerConnected
      ? 'good'
      : connected
        ? 'info'
        : 'idle';
  const systemHealthTone = personaTransitionActive
    ? 'warn'
    : snapshot?.diagnostics.lastError
      ? 'bad'
      : firmwareUpdateAvailable
        ? 'warn'
        : connected && !controllerConnected
          ? 'info'
          : 'good';
  const overviewConnectionStatus = personaTransitionActive
    ? 'Switching'
    : connected && controllerConnected
    ? 'Stable'
    : connected
      ? 'Waiting'
      : 'Offline';
  const overviewAudioPathState = !connected
    ? '--'
    : 'Pico Local';
  const overviewAudioPathDetail = personaTransitionActive
    ? 'Switching Mode'
    : !connected
    ? '--'
    : audioStatus?.controllerStateReady
      ? 'Controller Ready'
      : 'Waiting';
  const overviewAudioOutputLabel = connected ? (headsetOutputDetected ? 'Headphones' : 'Speaker') : '--';
  const overviewSpeakerVolumeValue = `${audio.speakerVolumeValue}%`;
  const overviewFirmwareLabel = snapshot?.status?.firmwareVersion ?? '--';
  const overviewSignalValue = connected ? snapshot?.status?.signalStrengthDbm : null;
  const overviewSignalQuality = overviewSignalValue === null || overviewSignalValue === undefined
    ? null
    : overviewSignalValue >= -15
      ? 'Excellent'
      : overviewSignalValue >= -22
        ? 'Good'
        : overviewSignalValue >= -27
          ? 'Audio Risk'
          : 'Poor';
  const overviewSignalTone = overviewSignalQuality === 'Excellent' || overviewSignalQuality === 'Good'
    ? 'good'
    : overviewSignalQuality === 'Audio Risk'
      ? 'warn'
      : overviewSignalQuality === 'Poor'
        ? 'bad'
        : 'idle';
  const overviewSignalTitle = overviewSignalValue !== null && overviewSignalValue !== undefined
    ? `${overviewSignalValue} dBm`
    : undefined;
  const overviewSignalLabel = overviewSignalQuality
    ? overviewSignalQuality
    : '--';
  const overviewShortcutItems = [
    snapshot?.settings.sleepKeybindEnabled ? { id: 'sleep', label: 'Sleep Shortcut' } : null,
    snapshot?.settings.speakerVolumeShortcutEnabled ? { id: 'volume', label: 'Volume Shortcut' } : null
  ].filter((item): item is { id: 'sleep' | 'volume'; label: string } => Boolean(item));
  const overviewNotificationItems = [
    controllerToastEnabled ? { id: 'controller-status', label: 'Controller Status' } : null,
    lowBatteryToastEnabled ? { id: 'low-battery', label: 'Low Battery' } : null
  ].filter((item): item is { id: NotificationFocusTarget; label: string } => Boolean(item));
  const overviewPowerSavingLabel = snapshot?.settings.controllerPowerSavingEnabled
    ? controllerPowerSavingActive
      ? 'Active'
      : 'Enabled'
    : 'Off';
  const diagnosticsVisible = activeControlTab === 'system' && showDiagnostics && windowVisible;
  const ackText = useMemo(() => {
    if (!diagnosticsVisible) return '';
    if (!lastAck) return 'No commands yet';
    return `${ackResultName(lastAck.resultCode)} - seq ${lastAck.commandSequence}`;
  }, [diagnosticsVisible, lastAck]);
  const audioDebugText = useMemo(() => {
    if (!diagnosticsVisible) {
      return '';
    }
    if (!snapshot) {
      return 'state=starting';
    }
    if (!snapshot.status) {
      return `state=${snapshot.state}\nmessage=${snapshot.message}`;
    }

    const debug = snapshot.status.audioDebug;
    const stats = snapshot.diagnostics.audioDebugStats;
    const audio = snapshot.diagnostics.audioStatus;
    const lines = [
      `state=${snapshot.state}`,
      `firmware=${snapshot.status.firmwareVersion}`,
      `triggerEffectIntensity=${snapshot.settings.triggerEffectIntensityPercent}%`,
      `classicRumble=${snapshot.settings.classicRumbleEnabled ? snapshot.settings.classicRumbleGainPercent : 0}%`,
      `appSpeakerSlider=${snapshot.settings.speakerVolumePercent}%`,
      `firmwareSpeakerGate=${snapshot.status.speakerVolumePercent}%`,
      `audioRecent=${snapshot.status.audioRecent ? 'true' : 'false'}`,
      `hostOutputRecent=${snapshot.status.hostOutputRecent ? 'true' : 'false'}`,
      `usbHostSpeakerVolume=${debug.usbHostSpeakerVolumePercent}%`,
      `usbHostSpeakerMute=${debug.usbHostSpeakerMute ? 'true' : 'false'}`,
      `usbHostMicVolume=${debug.usbHostMicVolumePercent}%`,
      `usbHostMicMute=${debug.usbHostMicMute ? 'true' : 'false'}`,
      `audioRepairCount=${debug.lastHostOutputCount}`,
      `lastAudioRepairReportId=0x${hexByte(debug.lastHostOutputReportId)}`,
      `lastAudioRepairLength=${debug.lastHostOutputLength}`
    ];
    if (audio) {
      lines.push(
        'audioPath=pico-local',
        `controllerStateReady=${audio.controllerStateReady ? 'true' : 'false'}`,
        `headsetPlugged=${audio.headsetPlugged ? 'true' : 'false'}`,
        `headsetAudioRoute=${audio.headsetAudioRoute ? 'true' : 'false'}`,
        `duplexRequested=${audio.duplexRequested ? 'true' : 'false'}`,
        `duplexActive=${audio.duplexActive ? 'true' : 'false'}`,
        `micPacketsReceived=${audio.micPacketsReceived}`,
        `micPacketsDropped=${audio.micPacketsDropped}`,
        `micDecodeSuccess=${audio.micDecodeSuccess}`,
        `micDecodeFail=${audio.micDecodeFail}`,
        `micUsbWriteSuccess=${audio.micUsbWriteSuccess}`,
        `micUsbWriteShort=${audio.micUsbWriteShort}`,
        `micUsbConcealCount=${audio.micUsbConcealCount}`,
        `micPlcCount=${audio.micPlcCount}`,
        `micLastDecodedSamples=${audio.micLastDecodedSamples}`,
        `micLastWrittenBytes=${audio.micLastWrittenBytes}`,
        `micPeakPermille=${audio.micPeakPermille}`,
        `micUsbStreaming=${audio.micUsbStreaming ? 'true' : 'false'}`
      );
    }
    if (stats) {
      lines.push(
        `usbAudioGapMaxUs=${stats.usbAudioGapMaxUs}`,
        `usbAudioGapOver1500Count=${stats.usbAudioGapOver1500Count}`,
        `opusEncodeMaxUs=${stats.opusEncodeMaxUs}`,
        `opusEncodeOverBudgetCount=${stats.opusEncodeOverBudgetCount}`,
        `audio0x36EnqueueToSendMaxUs=${stats.audio0x36EnqueueToSendMaxUs}`,
        `audio0x36SendGapMaxUs=${stats.audio0x36SendGapMaxUs}`,
        `audio0x36LateCountOver12000Us=${stats.audio0x36LateCountOver12000Us}`,
        `audio0x36DropOldestCount=${stats.audio0x36DropOldestCount}`,
        `audioGenerationDropCount=${stats.audioGenerationDropCount}`,
        `nonAudioReportsBetweenAudioMax=${stats.nonAudioReportsBetweenAudioMax}`,
        `btAudioQueueDepthMax=${stats.btAudioQueueDepthMax}`,
        `audio0x36EnqueuedCount=${stats.audio0x36EnqueuedCount}`,
        `audio0x36SentCount=${stats.audio0x36SentCount}`,
        `criticalStarvingAudioCount=${stats.criticalStarvingAudioCount}`
      );
    }
    return lines.join('\n');
  }, [diagnosticsVisible, snapshot]);
  const audioEventLogText = useMemo(() => {
    if (!diagnosticsVisible) {
      return '';
    }
    const lines = snapshot?.diagnostics.audioDebugLogLines ?? [];
    return lines.length > 0 ? lines.join('\n') : 'No audio debug events captured yet.';
  }, [diagnosticsVisible, snapshot?.diagnostics.audioDebugLogLines]);
  const triggerTraceText = useMemo(() => {
    if (!diagnosticsVisible) {
      return '';
    }
    const lines = snapshot?.diagnostics.triggerTraceLines ?? [];
    return lines.length > 0 ? lines.join('\n') : 'No trigger trace events captured yet.';
  }, [diagnosticsVisible, snapshot?.diagnostics.triggerTraceLines]);
  const feedbackTraceText = useMemo(() => {
    if (!diagnosticsVisible) {
      return '';
    }
    const lines = snapshot?.diagnostics.feedbackTraceLines ?? [];
    return lines.length > 0 ? lines.join('\n') : 'No non-zero feedback trace events captured yet.';
  }, [diagnosticsVisible, snapshot?.diagnostics.feedbackTraceLines]);
  const firmwareLogStatus = snapshot?.diagnostics.firmwareLogLastError
    ? `Write failed: ${snapshot.diagnostics.firmwareLogLastError}`
    : !snapshot?.diagnostics.firmwareLogDirectory
      ? 'Choose a folder to start capture.'
      : snapshot.diagnostics.firmwareLogEnabled === false
        ? 'Unavailable: firmware was not compiled with UART logging.'
        : snapshot.diagnostics.firmwareLogEnabled === null
          ? 'Waiting for UART-enabled firmware.'
          : snapshot.diagnostics.firmwareLogPath
            ? 'Capturing retained firmware logs.'
            : 'Starting capture.';

  async function runAction(label: string, action: () => Promise<BridgeSnapshot>) {
    if (!snapshot || pendingAction) {
      return;
    }
    setPendingAction(label);
    try {
      const next = await action();
      setSnapshot(next);
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
    } finally {
      setPendingAction(null);
    }
  }

  async function runQuietAction(action: () => Promise<BridgeSnapshot>) {
    if (!snapshot) {
      return;
    }
    try {
      const next = await action();
      setSnapshot(next);
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
    }
  }

  async function commitHapticsValue(value = hapticsValue) {
    const snappedValue = snapHapticsValue(value, hapticsSliderMax);
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !snapshot.settings.hapticsEnabled
      || (controllerPowerSavingActive && snapshot.settings.hapticsGainPercent > CONTROLLER_POWER_SAVING_CAP_PERCENT && snappedValue === CONTROLLER_POWER_SAVING_CAP_PERCENT)
      || snappedValue === snapshot.settings.hapticsGainPercent
      || hapticsCommitPending
    ) {
      hapticsEditingRef.current = false;
      return;
    }

    setHapticsCommitPending(true);
    hapticsEditingRef.current = true;
    try {
      const next = await window.bridge.setHapticsGain(snappedValue);
      setSnapshot(next);
      setHapticsValue(displayHapticsValue(next));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setHapticsValue(displayHapticsValue(next));
    } finally {
      setHapticsCommitPending(false);
      hapticsEditingRef.current = false;
    }
  }

  async function commitClassicRumbleValue(value = classicRumbleValue) {
    const snappedValue = snapHapticsValue(value, hapticsSliderMax);
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !snapshot.settings.classicRumbleEnabled
      || (controllerPowerSavingActive && snapshot.settings.classicRumbleGainPercent > CONTROLLER_POWER_SAVING_CAP_PERCENT && snappedValue === CONTROLLER_POWER_SAVING_CAP_PERCENT)
      || snappedValue === snapshot.settings.classicRumbleGainPercent
      || classicRumbleCommitPending
    ) {
      classicRumbleEditingRef.current = false;
      return;
    }

    setClassicRumbleCommitPending(true);
    classicRumbleEditingRef.current = true;
    try {
      const next = await window.bridge.setClassicRumbleGain(snappedValue);
      setSnapshot(next);
      setClassicRumbleValue(displayClassicRumbleValue(next));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setClassicRumbleValue(displayClassicRumbleValue(next));
    } finally {
      setClassicRumbleCommitPending(false);
      classicRumbleEditingRef.current = false;
    }
  }

  function setHapticsPreset(value: number) {
    const snappedValue = snapHapticsValue(capControllerPowerSavingValue(value, snapshot), hapticsSliderMax);
    hapticsEditingRef.current = true;
    setHapticsValue(snappedValue);
    void commitHapticsValue(snappedValue);
  }

  function setClassicRumblePreset(value: number) {
    const snappedValue = snapHapticsValue(capControllerPowerSavingValue(value, snapshot), hapticsSliderMax);
    classicRumbleEditingRef.current = true;
    setClassicRumbleValue(snappedValue);
    void commitClassicRumbleValue(snappedValue);
  }

  async function commitAudioReactiveHapticsConfig(config: Partial<AudioReactiveHapticsConfig>): Promise<BridgeSnapshot | null> {
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !audioReactiveHapticsSupported
      || !hapticsEnabled
      || audioReactiveHapticsCommitPending
    ) {
      return null;
    }

    setAudioReactiveHapticsCommitPending(true);
    try {
      const next = await window.bridge.setAudioReactiveHapticsConfig(config);
      applySnapshot(next);
      return next;
    } catch {
      const next = await window.bridge.getStatus();
      applySnapshot(next);
      return next;
    } finally {
      setAudioReactiveHapticsCommitPending(false);
    }
  }

  async function toggleAudioReactiveHapticsEnabled() {
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !audioReactiveHapticsSupported
      || pendingAction !== null
      || audioReactiveHapticsCommitPending
    ) {
      return;
    }

    const enabled = !snapshot.settings.audioReactiveHapticsEnabled;
    setAudioReactiveHapticsCommitPending(true);
    try {
      if (enabled && !snapshot.settings.hapticsEnabled) {
        await window.bridge.setHapticsEnabled(true);
      }
      const next = await window.bridge.setAudioReactiveHapticsConfig({ enabled });
      applySnapshot(next);
    } catch {
      const next = await window.bridge.getStatus();
      applySnapshot(next);
    } finally {
      setAudioReactiveHapticsCommitPending(false);
    }
  }

  function setAudioReactiveHapticsMode(mode: AudioReactiveHapticsMode) {
    if (!snapshot || mode === snapshot.settings.audioReactiveHapticsMode) return;
    void commitAudioReactiveHapticsConfig({ mode });
  }

  function setAudioReactiveHapticsSourceValue(value: string) {
    if (!snapshot || value === audioReactiveHapticsSourceKey) return;
    if (value === 'system-audio') {
      void commitAudioReactiveHapticsConfig({ source: 'system-audio' });
      return;
    }
    const session = audioHapticsSessionByKey.get(value);
    if (!session) {
      return;
    }
    void commitAudioReactiveHapticsConfig({ source: audioHapticsSourceFromSession(session) });
  }

  function setAudioReactiveHapticsBassFocus(bassFocus: AudioReactiveHapticsBassFocus) {
    if (!snapshot || bassFocus === snapshot.settings.audioReactiveHapticsBassFocus) return;
    void commitAudioReactiveHapticsConfig({ bassFocus });
  }

  function setAudioReactiveHapticsResponse(response: AudioReactiveHapticsResponse) {
    if (!snapshot || response === snapshot.settings.audioReactiveHapticsResponse) return;
    void commitAudioReactiveHapticsConfig({ response });
  }

  function setAudioReactiveHapticsAttack(attack: AudioReactiveHapticsAttack) {
    if (!snapshot || attack === snapshot.settings.audioReactiveHapticsAttack) return;
    void commitAudioReactiveHapticsConfig({ attack });
  }

  function setAudioReactiveHapticsRelease(release: AudioReactiveHapticsRelease) {
    if (!snapshot || release === snapshot.settings.audioReactiveHapticsRelease) return;
    void commitAudioReactiveHapticsConfig({ release });
  }

  function isPreservingPowerSavingCap(savedValue: number, visibleValue: number): boolean {
    return controllerPowerSavingActive
      && savedValue > CONTROLLER_POWER_SAVING_CAP_PERCENT
      && visibleValue === CONTROLLER_POWER_SAVING_CAP_PERCENT;
  }

  function runFeedbackTest() {
    setTestLocked(true);
    void runAction(showClassicRumbleControl ? 'test-rumble' : 'test', async () => {
      if (snapshot && showClassicRumbleControl) {
        if (
          classicRumbleValue !== snapshot.settings.classicRumbleGainPercent
          && !isPreservingPowerSavingCap(snapshot.settings.classicRumbleGainPercent, classicRumbleValue)
        ) {
          await window.bridge.setClassicRumbleGain(classicRumbleValue);
        }
        return window.bridge.testClassicRumble();
      }
      if (
        snapshot
        && hapticsValue !== snapshot.settings.hapticsGainPercent
        && !isPreservingPowerSavingCap(snapshot.settings.hapticsGainPercent, hapticsValue)
      ) {
        await window.bridge.setHapticsGain(hapticsValue);
      }
      return window.bridge.testHaptics();
    }).finally(() => {
      window.setTimeout(() => setTestLocked(false), TEST_HAPTICS_LOCK_MS);
    });
  }

  function selectControllerProfile(profileId: string) {
    void runAction('controller-profile', () => window.bridge.selectControllerProfile(profileId));
  }

  function renameControllerProfile() {
    if (!selectedControllerProfile || selectedControllerProfileIsDefault) {
      return;
    }
    setControllerProfileNameDraft(selectedControllerProfile.name);
    setControllerProfileDialogMode('rename');
  }

  function saveControllerProfile() {
    setControllerProfileNameDraft(`Custom Profile ${snapshot?.settings.controllerProfiles.length ?? 1}`);
    setControllerProfileDialogMode('save');
  }

  function deleteControllerProfile() {
    if (!selectedControllerProfile || !canDeleteControllerProfile) {
      return;
    }
    setControllerProfileDialogMode('delete');
  }

  function closeControllerProfileDialog() {
    setControllerProfileDialogMode(null);
    setControllerProfileNameDraft('');
  }

  function submitControllerProfileDialog() {
    if (!selectedControllerProfile && controllerProfileDialogMode !== 'save') {
      return;
    }
    if (controllerProfileDialogMode === 'save') {
      const nextName = controllerProfileNameDraft.trim();
      if (!nextName) {
        return;
      }
      closeControllerProfileDialog();
      void runAction('controller-save-profile', () => window.bridge.saveControllerProfile(nextName));
      return;
    }
    if (controllerProfileDialogMode === 'rename' && selectedControllerProfile && !selectedControllerProfileIsDefault) {
      const nextName = controllerProfileNameDraft.trim();
      if (!nextName || nextName === selectedControllerProfile.name) {
        closeControllerProfileDialog();
        return;
      }
      closeControllerProfileDialog();
      void runAction('controller-rename-profile', () => (
        window.bridge.renameControllerProfile(selectedControllerProfile.id, nextName)
      ));
      return;
    }
    if (controllerProfileDialogMode === 'delete' && selectedControllerProfile && canDeleteControllerProfile) {
      closeControllerProfileDialog();
      void runAction('controller-delete-profile', () => (
        window.bridge.deleteControllerProfile(selectedControllerProfile.id)
      ));
    }
  }

  function chooseFirmwareLogDirectory() {
    void runAction('firmware-log-directory', () => window.bridge.selectFirmwareLogDirectory());
  }

  function clearFirmwareLogDirectory() {
    void runAction('firmware-log-directory', () => window.bridge.clearFirmwareLogDirectory());
  }

  function toggleHapticsEnabled() {
    if (!snapshot) return;
    void runAction('haptics-enabled', () => window.bridge.setHapticsEnabled(!snapshot.settings.hapticsEnabled));
  }

  function toggleClassicRumbleEnabled() {
    if (!snapshot) return;
    void runAction('classic-rumble-enabled', () => (
      window.bridge.setClassicRumbleEnabled(!snapshot.settings.classicRumbleEnabled)
    ));
  }

  function toggleClassicRumbleV1Enabled() {
    if (!snapshot || classicRumbleV1CommitPending) return;

    setClassicRumbleV1CommitPending(true);
    void (async () => {
      try {
        const next = await window.bridge.setClassicRumbleV1Enabled(!snapshot.settings.classicRumbleV1Enabled);
        setSnapshot(next);
      } catch {
        const next = await window.bridge.getStatus();
        setSnapshot(next);
      } finally {
        setClassicRumbleV1CommitPending(false);
      }
    })();
  }

  function toggleFeedbackBoostEnabled() {
    if (!snapshot || feedbackBoostCommitPending) return;

    setFeedbackBoostCommitPending(true);
    void (async () => {
      try {
        const next = await window.bridge.setFeedbackBoostEnabled(!snapshot.settings.feedbackBoostEnabled);
        setSnapshot(next);
        setHapticsValue(displayHapticsValue(next));
        setClassicRumbleValue(displayClassicRumbleValue(next));
      } catch {
        const next = await window.bridge.getStatus();
        setSnapshot(next);
        setHapticsValue(displayHapticsValue(next));
        setClassicRumbleValue(displayClassicRumbleValue(next));
      } finally {
        setFeedbackBoostCommitPending(false);
      }
    })();
  }

  function openDeviceCleanupConfirm() {
    setDeviceCleanupMessage(null);
    setDeviceCleanupError(null);
    setDeviceCleanupConfirmVisible(true);
  }

  function closeDeviceCleanupConfirm() {
    if (pendingAction === 'device-cleanup') {
      return;
    }
    setDeviceCleanupConfirmVisible(false);
  }

  async function runWindowsDeviceCleanup() {
    if (!snapshot || pendingAction) {
      return;
    }
    setDeviceCleanupMessage(null);
    if (controllerConnected) {
      setDeviceCleanupError('Disconnect the controller from the bridge before running emergency repair.');
      return;
    }

    setPendingAction('device-cleanup');
    setDeviceCleanupError(null);
    try {
      const result = await window.bridge.repairWindowsDeviceCache();
      setDeviceCleanupMessage(result.message);
    } catch (error) {
      setDeviceCleanupError(error instanceof Error ? error.message : 'Emergency device repair could not run.');
    } finally {
      try {
        applySnapshot(await window.bridge.getStatus());
      } catch {
        // Keep the existing snapshot if status refresh fails after the repair process.
      }
      setPendingAction(null);
    }
  }

  async function runPicoFirmwareAction(
    label: string,
    action: () => Promise<{ ok: boolean; cancelled?: boolean; message: string }>
  ) {
    if (pendingAction !== null) {
      return;
    }
    setPendingAction(label);
    setPicoFirmwareMessage(null);
    setPicoFirmwareError(null);
    try {
      const result = await action();
      if (!result.cancelled) {
        if (result.ok) {
          setPicoFirmwareMessage(result.message);
        } else {
          setPicoFirmwareError(result.message);
        }
      }
    } catch (error) {
      setPicoFirmwareError(error instanceof Error ? error.message : 'Pico firmware action failed.');
    } finally {
      setPendingAction(null);
    }
  }

  function mountPicoBootloader() {
    void runPicoFirmwareAction('pico-firmware-mount', () => window.bridge.mountPicoBootloader());
  }

  function flashPicoFirmware() {
    void runPicoFirmwareAction('pico-firmware-flash', () => window.bridge.flashPicoFirmware());
  }

  function nukePicoFlash() {
    void runPicoFirmwareAction('pico-firmware-nuke', () => window.bridge.nukePicoFlash());
  }

  function focusBridgeSettings(target: SettingsFocusTarget) {
    setShowNotificationsMenu(false);
    selectControlTab('settings');
    setNotificationFocusTarget(null);
    setSettingsFocusTarget(target);
    if (settingsFocusTimerRef.current !== null) {
      window.clearTimeout(settingsFocusTimerRef.current);
    }
    settingsFocusTimerRef.current = window.setTimeout(() => {
      setSettingsFocusTarget(null);
      settingsFocusTimerRef.current = null;
    }, 2200);
  }

  function focusNotificationSettings(target: NotificationFocusTarget) {
    setShowNotificationsMenu(true);
    setSettingsFocusTarget(null);
    setNotificationFocusTarget(target);
    if (notificationFocusTimerRef.current !== null) {
      window.clearTimeout(notificationFocusTimerRef.current);
    }
    notificationFocusTimerRef.current = window.setTimeout(() => {
      setNotificationFocusTarget(null);
      notificationFocusTimerRef.current = null;
    }, 2200);
  }

  function setMuteButtonAction(
    mode: MuteButtonMode,
    usage?: number,
    modifiers?: number,
    behavior?: MuteKeyboardBehavior,
    chordStarterEnabled?: boolean
  ) {
    if (!snapshot) {
      return;
    }
    const keyUsage = usage ?? snapshot.settings.muteKeyboardUsage;
    const keyModifiers = modifiers ?? snapshot.settings.muteKeyboardModifiers;
    const keyBehavior = behavior ?? snapshot.settings.muteKeyboardBehavior;
    const keyChordStarterEnabled = chordStarterEnabled ?? snapshot.settings.muteKeyboardChordStarterEnabled;
    void runAction('mute-button', () => (
      window.bridge.setMuteButtonAction(mode, keyUsage, keyModifiers, keyBehavior, keyChordStarterEnabled)
    ));
  }

  function setMuteModifier(bit: number, enabled: boolean) {
    if (!snapshot) {
      return;
    }
    const nextModifiers = enabled
      ? snapshot.settings.muteKeyboardModifiers | bit
      : snapshot.settings.muteKeyboardModifiers & ~bit;
    setMuteButtonAction(
      snapshot.settings.muteButtonMode,
      snapshot.settings.muteKeyboardUsage,
      nextModifiers,
      snapshot.settings.muteKeyboardBehavior,
      snapshot.settings.muteKeyboardChordStarterEnabled
    );
  }

  function clearOverviewSleepConfirmation() {
    overviewSleepConfirmArmedRef.current = false;
    setOverviewSleepConfirmVisible(false);
    if (overviewSleepConfirmTimerRef.current !== null) {
      window.clearTimeout(overviewSleepConfirmTimerRef.current);
      overviewSleepConfirmTimerRef.current = null;
    }
  }

  function armOverviewSleepConfirmation() {
    overviewSleepConfirmArmedRef.current = true;
    setOverviewSleepConfirmVisible(true);
    if (overviewSleepConfirmTimerRef.current !== null) {
      window.clearTimeout(overviewSleepConfirmTimerRef.current);
    }
    overviewSleepConfirmTimerRef.current = window.setTimeout(() => {
      overviewSleepConfirmArmedRef.current = false;
      setOverviewSleepConfirmVisible(false);
      overviewSleepConfirmTimerRef.current = null;
    }, SLEEP_CONFIRM_MS);
  }

  function handleOverviewSleepController() {
    if (!snapshot || !connected || !sleepControllerSupported || !controllerConnected || pendingAction !== null) {
      return;
    }
    if (!overviewSleepConfirmArmedRef.current) {
      armOverviewSleepConfirmation();
      return;
    }
    clearOverviewSleepConfirmation();
    void runAction('overview-sleep-controller', () => window.bridge.sleepController());
  }

  function toggleControllerNotifications() {
    if (!snapshot) return;
    void runAction('notify-controller', () => (
      window.bridge.setNotifyControllerConnection(!snapshot.settings.notifyControllerConnection)
    ));
  }

  function toggleLowBatteryNotifications() {
    if (!snapshot) return;
    void runAction('notify-battery', () => (
      window.bridge.setNotifyLowBattery(!snapshot.settings.notifyLowBattery)
    ));
  }

  function setPollingRateMode(mode: PollingRateMode) {
    void runAction('polling-rate', () => window.bridge.setPollingRateMode(mode));
  }

  function setHostPersonaMode(mode: HostPersonaMode) {
    void runAction('host-persona', () => window.bridge.setHostPersonaMode(mode));
  }

  function testNotifications() {
    void runAction('notify-test', () => window.bridge.testNotification());
  }

  function selectControlTab(tab: ControlTab) {
    if (tab === activeControlTab) {
      return;
    }
    if (tab === 'settings') {
      setSettingsReturnTab(activeControlTab);
    }
    lighting.closeCustomColorPicker();
    setShowNotificationsMenu(false);
    devices.closeMenu();
    setActiveControlTab(tab);
  }

  const activeTheme = snapshot?.settings.uiThemePreset ?? startupTheme;
  const activeTextScale = snapshot?.settings.uiTextScalePercent ?? startupTextScale;
  useDocumentTheme(activeTheme, activeTextScale);
  const settingsNavigation = useSettingsNavigation({ focusTarget: settingsFocusTarget });

  // The shell renders at once; until the first snapshot arrives the device card
  // and page area show placeholders instead of a full-window splash screen.
  if (!snapshot) {
    return (
      <MainAppShell
        className="shell starting"
        theme={activeTheme}
        textScale={activeTextScale}
        activeTab={activeControlTab}
        panelIdForTab={controlPanelIdFor}
        onSelectTab={selectControlTab}
        onWindowChromeMouseDown={() => undefined}
        onBeginWindowDrag={beginWindowDrag}
        onMinimize={() => void window.bridge.minimizeWindow()}
        onHide={() => void window.bridge.hideWindow()}
        sidebarDevice={(
          <ShellSidebarDevice
            device={startingDevicePresentation(controllerImage)}
            bridgeSelector={(
              <ShellBridgeSelector
                bridges={[]}
                selectedPath=""
                selectedName={null}
                selectedUniqueId={null}
                directControllers={[]}
                busy
                emptyLabel={STARTING_BRIDGE_LABEL}
                onSelect={() => undefined}
                onRefresh={() => undefined}
                onRename={() => undefined}
              />
            )}
          />
        )}
        pages={<StartupPlaceholderPage title={CONTROL_TAB_DEFINITIONS[activeControlTab].label} />}
      />
    );
  }

  const kofiBadgeUrl = UI_THEME_KOFI_BADGES[activeTheme] ?? UI_THEME_KOFI_BADGES[DEFAULT_UI_THEME_PRESET];

  const sidebarDeviceNode = (
    <ShellSidebarDevice
      device={{
        title: sidebarDeviceTitle,
        status: sidebarDeviceStatus,
        tone: sidebarDeviceTone,
        batteryLabel: sidebarBatteryLabel,
        powerLabel: batteryPowerLabel,
        controllerArt: controllerImage
      }}
      onOpenDevices={() => selectControlTab('devices')}
      bridgeSelector={(
        <ShellBridgeSelector
          bridges={bridgeSelectOptions.map(([label, path]) => ({ label, path }))}
          selectedPath={activeBridgeSelectValue}
          selectedName={selectedBridgeInfo?.name ?? null}
          selectedUniqueId={selectedBridgeInfo?.uniqueId ?? null}
          directControllers={directControllers}
          busy={pendingAction !== null}
          onSelect={(devicePath) => void runAction('bridge-select', () => window.bridge.selectBridge(devicePath))}
          onRefresh={() => runAction('bridge-refresh', () => window.bridge.refreshBridgeDevices())}
          onRename={(uniqueId, name) => void runAction(
            'bridge-rename',
            () => window.bridge.setBridgeLabel(uniqueId, name)
          )}
        />
      )}
    />
  );

  const settingsPageModel: SettingsPageModel = {
    settings: snapshot.settings,
    connected,
    busy: pendingAction !== null,
    pendingAction,
    support: {
      usbSuspendDisconnect: usbSuspendDisconnectSupported,
      wakeOnConnect: wakeOnConnectSupported,
      sleepController: sleepControllerSupported
    },
    focusTarget: settingsFocusTarget,
    picoFirmware: { message: picoFirmwareMessage, error: picoFirmwareError }
  };
  const currentSettings = snapshot.settings;
  const settingsPageActions: SettingsPageActions = {
    setTheme: (value) => void runAction('ui-theme', () => window.bridge.setUiThemePreset(value)),
    setUiScale: (value) => void runAction('ui-scale', () => window.bridge.setUiScalePercent(value)),
    setTextScale: (value) => void runAction('ui-text-scale', () => window.bridge.setUiTextScalePercent(value)),
    setLocale: (value) => void runAction('ui-locale', () => window.bridge.setUiLocale(normalizeUiLocalePreference(value))),
    toggleLaunchAtStartup: () => void runAction('launch-at-startup', () => (
      window.bridge.setLaunchAtStartupEnabled(!currentSettings.launchAtStartupEnabled)
    )),
    toggleBatteryTrayIcon: () => void runAction('battery-tray-icon', () => (
      window.bridge.setShowBatteryPercentTrayIcon(!currentSettings.showBatteryPercentTrayIcon)
    )),
    toggleControllerNotifications,
    toggleLowBatteryNotifications,
    testNotification: testNotifications,
    setIdleDisconnectTimeout: (minutes) => void runAction('idle-timeout', () => window.bridge.setIdleDisconnectTimeoutMinutes(minutes)),
    toggleIdleDisconnect: () => void runAction('idle', () => (
      window.bridge.setIdleDisconnectEnabled(!currentSettings.idleDisconnectEnabled)
    )),
    toggleUsbSuspendDisconnect: () => void runAction('usb-suspend', () => (
      window.bridge.setUsbSuspendDisconnectEnabled(!currentSettings.usbSuspendDisconnectEnabled)
    )),
    toggleControllerPowerSaving: () => void runAction('controller-power-saving', () => (
      window.bridge.setControllerPowerSavingEnabled(!currentSettings.controllerPowerSavingEnabled)
    )),
    toggleLed: () => void runAction('led', () => window.bridge.setLedEnabled(!currentSettings.ledEnabled)),
    togglePlayerLed: () => void runAction('player-led', () => window.bridge.setPlayerLedEnabled(!currentSettings.playerLedEnabled)),
    toggleLightbarRestore: () => void runAction('lightbar-restore', () => (
      window.bridge.setLightbarRestoreEnabled(!currentSettings.lightbarRestoreEnabled)
    )),
    toggleEdgeProfileSwitching: () => void runAction('edge-profile-switching', () => (
      window.bridge.setEdgeProfileSwitchingBlocked(!currentSettings.edgeProfileSwitchingBlocked)
    )),
    toggleSleepShortcut: () => void runAction('sleep-keybind', () => (
      window.bridge.setSleepKeybindEnabled(!currentSettings.sleepKeybindEnabled)
    )),
    toggleVolumeShortcut: () => void runAction('volume-shortcut', () => (
      window.bridge.setSpeakerVolumeShortcutEnabled(!currentSettings.speakerVolumeShortcutEnabled)
    )),
    toggleWakeOnConnect: () => void runAction('wake-on-connect', () => (
      window.bridge.setWakeOnConnectEnabled(!currentSettings.wakeOnConnectEnabled)
    )),
    mountPicoBootloader,
    flashPicoFirmware,
    nukePicoFlash,
    openExternal: (url) => void window.bridge.openExternal(url)
  };

  const shellClassName = [
    'shell',
    windowDragging ? 'window-dragging' : '',
    controllerControlsAvailable ? '' : 'controller-unavailable'
  ].filter(Boolean).join(' ');

  return (
    <MainAppShell
      className={shellClassName}
      theme={activeTheme}
      textScale={activeTextScale}
      activeTab={activeControlTab}
      panelIdForTab={controlPanelIdFor}
      onSelectTab={selectControlTab}
      onWindowChromeMouseDown={() => setShowNotificationsMenu(false)}
      onBeginWindowDrag={beginWindowDrag}
      onMinimize={() => void window.bridge.minimizeWindow()}
      onHide={() => void window.bridge.hideWindow()}
      windowBarCenter={snapshot.settings.kitsuneInputPromotionDismissed ? null : (
        <KitsunePromotionBanner
          expanded={showKitsuneInputPromotion}
          onOpen={() => {
            setShowNotificationsMenu(false);
            setShowKitsuneInputPromotion(true);
          }}
        />
      )}
      windowBarTools={(
        <>
          <ShellSupportBadge
            badgeUrl={kofiBadgeUrl}
            onOpen={() => void window.bridge.openExternal('https://ko-fi.com/sundaymoments')}
          />
          <ShellNotifications
          rootRef={notificationsRef}
          notifications={{
            menuOpen: showNotificationsMenu,
            controllerEnabled: controllerToastEnabled,
            lowBatteryEnabled: lowBatteryToastEnabled,
            controlsDisabled: pendingAction !== null,
            focusTarget: notificationFocusTarget
          }}
          onToggle={() => setShowNotificationsMenu((value) => !value)}
          onToggleController={toggleControllerNotifications}
          onToggleLowBattery={toggleLowBatteryNotifications}
          onTest={testNotifications}
          />
        </>
      )}
      sidebarDevice={sidebarDeviceNode}
      pages={(
        <>
          {/* Each page mounts on its first visit; hidden pages skip re-rendering on new snapshots. */}
          <DeferredPage active={activeControlTab === 'overview'}>
          <div
            className={`control-page overview-page ${activeControlTab === 'overview' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-overview"
            aria-labelledby="control-tab-overview"
            aria-hidden={activeControlTab !== 'overview'}
          >
            <div className="feature-heading overview-heading">
              <div>
                <h2>Overview</h2>
                <p>At-a-glance status of your controller and active settings.</p>
              </div>
              <span className={`overview-health health-label ${overviewHealthTone}`} title={overviewHealthTitle}>
                <span className={`dot ${overviewHealthTone}`} />
                {overviewHealthLabel}
              </span>
            </div>

            <div className="overview-card-grid">
              <button className="overview-card" type="button" onClick={() => selectControlTab('system')}>
                <div className="overview-card-title">
                  <span className="feature-icon overview-icon"><Activity size={19} /></span>
                  <h3>Connection</h3>
                </div>
                <div className="overview-fields">
                  <div>
                    <span>USB</span>
                    <strong className={overviewConnectionStatus === 'Stable' ? 'success-value' : ''}>
                      {overviewConnectionStatus}
                    </strong>
                  </div>
                  <div>
                    <span>Polling Rate</span>
                    <strong>{connected && pollingRateControlSupported ? pollingRateLabel : '--'}</strong>
                  </div>
                </div>
              </button>

              <button className="overview-card" type="button" onClick={() => selectControlTab('audio')}>
                <div className="overview-card-title">
                  <span className="feature-icon overview-icon"><IconBinary size={26} /></span>
                  <h3>Audio Path</h3>
                </div>
                <div className="overview-fields">
                  <div>
                    <span>Route</span>
                    <strong className={overviewAudioPathState === 'Pico Local' ? 'success-value' : ''}>
                      {overviewAudioPathState}
                    </strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{overviewAudioPathDetail}</strong>
                  </div>
                </div>
              </button>

              <button className="overview-card" type="button" onClick={() => selectControlTab('audio')}>
                <div className="overview-card-title">
                  <span className="feature-icon overview-icon"><Volume2 size={19} /></span>
                  <h3>Audio</h3>
                </div>
                <div className="overview-fields">
                  <div>
                    <span>Route</span>
                    <strong>{overviewAudioOutputLabel}</strong>
                  </div>
                  <div>
                    <span>Volume</span>
                    <strong>{overviewSpeakerVolumeValue}</strong>
                  </div>
                </div>
              </button>

              <button className="overview-card" type="button" onClick={() => selectControlTab('system')}>
                <div className="overview-card-title">
                  <span className="feature-icon overview-icon"><IconBluetooth size={19} /></span>
                  <h3>Wireless</h3>
                </div>
                <div className="overview-fields">
                  <div>
                    <span>Signal</span>
                    <strong className={`signal-value ${overviewSignalTone}`} title={overviewSignalTitle}>
                      {overviewSignalLabel}
                    </strong>
                  </div>
                  <div>
                    <span>Firmware</span>
                    <strong>{overviewFirmwareLabel}</strong>
                  </div>
                </div>
              </button>
            </div>

            <div className="overview-control-grid">
              <section className="overview-control-panel overview-quick-actions" aria-label="Quick actions">
                <div className="overview-panel-heading">
                  <span className="feature-icon overview-icon"><Zap size={18} /></span>
                  <div>
                    <h3>Quick Actions</h3>
                  </div>
                </div>
                <div className="overview-action-grid">
                  <button
                    type="button"
                    disabled={activeFeedbackTestUnavailable}
                    onClick={runFeedbackTest}
                  >
                    <Play size={15} />
                    Test Haptics
                  </button>
                  <button
                    type="button"
                    disabled={audio.testSpeakerUnavailable}
                    onClick={audio.runTestSpeaker}
                  >
                    <Volume2 size={15} />
                    Test Speaker
                  </button>
                  <button
                    type="button"
                    disabled={audio.testMicUnavailable}
                    onClick={audio.runTestMic}
                  >
                    <Mic size={15} />
                    Listen Mic
                  </button>
                  <button
                    type="button"
                    className={overviewSleepConfirmVisible ? 'confirm' : undefined}
                    disabled={!connected || !sleepControllerSupported || !controllerConnected || pendingAction !== null}
                    onClick={handleOverviewSleepController}
                  >
                    <Moon size={15} />
                    {overviewSleepConfirmVisible ? 'Confirm Sleep' : 'Sleep Controller'}
                  </button>
                </div>
                <div className="overview-persona-grid" aria-label="Host controller persona">
                  {HOST_PERSONA_OPTIONS.map(([label, mode]) => {
                    const active = overviewHostPersonaMode === mode;
                    const supported = supportedHostPersonaModes.includes(mode);
                    const disabled = !connected
                      || !hostPersonaControlSupported
                      || pendingAction !== null
                      || personaTransitionActive
                      || (!supported && !active);
                    return (
                      <button
                        key={mode}
                        type="button"
                        className={`overview-persona-button persona-${mode} ${active ? 'active' : ''}`}
                        aria-pressed={active}
                        aria-label={`Switch to ${label} mode`}
                        disabled={disabled}
                        title={`Switch to ${label} mode`}
                        onClick={() => {
                          if (!active) {
                            setHostPersonaMode(mode);
                          }
                        }}
                      >
                        {mode === 'xbox' ? (
                          <IconBrandXbox className="overview-persona-logo" aria-hidden="true" />
                        ) : (
                          <span
                            className="overview-persona-logo playstation"
                            style={{ '--overview-persona-logo-mask': `url("${playStationLogoUrl}")` } as CSSProperties}
                            aria-hidden="true"
                          />
                        )}
                        <span>{HOST_PERSONA_SHORT_LABELS[mode]}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="overview-control-panel overview-sliders" aria-label="Quick controls">
                <div className="overview-panel-heading">
                  <span className="feature-icon overview-icon"><IconAdjustmentsSpark size={18} /></span>
                  <div>
                    <h3>Quick Controls</h3>
                  </div>
                </div>
                <div className="overview-slider-list">
                  <label className={`overview-slider-row ${(!connected || !snapshot.settings.hapticsEnabled) ? 'disabled' : ''}`}>
                    <span>Haptics</span>
                    <div className="overview-range-control">
                      <input
                        type="range"
                        min="0"
                        max={hapticsSliderMax}
                        step={HAPTICS_STEP}
                        value={hapticsValue}
                        disabled={!connected || !snapshot.settings.hapticsEnabled}
                        style={{ '--range-fill': `${(hapticsValue / hapticsSliderMax) * 100}%` } as CSSProperties}
                        onPointerDown={() => {
                          hapticsEditingRef.current = true;
                        }}
                        onChange={(event) => setHapticsValue(snapHapticsValue(
                          Number(event.currentTarget.value),
                          hapticsSliderMax
                        ))}
                        onPointerUp={() => void commitHapticsValue()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            hapticsEditingRef.current = true;
                          }
                        }}
                        onKeyUp={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            void commitHapticsValue();
                          }
                        }}
                        onBlur={() => void commitHapticsValue()}
                      />
                      <div className="overview-range-ticks" aria-hidden="true">
                        {hapticsSliderTicks.map((value) => (
                          <span key={value} className={sliderTickClass(value, hapticsSliderMax)} />
                        ))}
                      </div>
                    </div>
                    <strong>{hapticsValue}%</strong>
                  </label>
                  <label className={`overview-slider-row ${(!connected || !speakerVolumeSupported || !snapshot.settings.speakerEnabled || audio.speakerVolumeCommitPending) ? 'disabled' : ''}`}>
                    <span>Speaker</span>
                    <div className="overview-range-control">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step={SPEAKER_VOLUME_STEP}
                        value={audio.speakerVolumeValue}
                        disabled={!connected || !speakerVolumeSupported || !snapshot.settings.speakerEnabled || audio.speakerVolumeCommitPending}
                        style={{ '--range-fill': `${audio.speakerVolumeValue}%` } as CSSProperties}
                        onPointerDown={() => {
                          audio.speakerVolumeEditingRef.current = true;
                        }}
                        onChange={(event) => audio.setSpeakerVolumeValue(snapSpeakerVolume(Number(event.currentTarget.value)))}
                        onPointerUp={() => void audio.commitSpeakerVolume()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            audio.speakerVolumeEditingRef.current = true;
                          }
                        }}
                        onKeyUp={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            void audio.commitSpeakerVolume();
                          }
                        }}
                        onBlur={() => void audio.commitSpeakerVolume()}
                      />
                      <div className="overview-range-ticks" aria-hidden="true">
                        {PERCENT_SLIDER_TICKS.map((value) => (
                          <span key={value} className={sliderTickClass(value, 100)} />
                        ))}
                      </div>
                    </div>
                    <strong>{audio.speakerVolumeValue}%</strong>
                  </label>
                  <label className={`overview-slider-row ${(!connected || !audio.duplexMicEnabled || audio.micVolumeCommitPending) ? 'disabled' : ''}`}>
                    <span>Mic</span>
                    <div className="overview-range-control">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step={MIC_VOLUME_STEP}
                        value={audio.micVolumeValue}
                        disabled={!connected || !audio.duplexMicEnabled || audio.micVolumeCommitPending}
                        style={{ '--range-fill': `${audio.micVolumeValue}%` } as CSSProperties}
                        onPointerDown={() => {
                          audio.micVolumeEditingRef.current = true;
                        }}
                        onChange={(event) => audio.setMicVolumeValue(snapMicVolume(Number(event.currentTarget.value)))}
                        onPointerUp={() => void audio.commitMicVolume()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            audio.micVolumeEditingRef.current = true;
                          }
                        }}
                        onKeyUp={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            void audio.commitMicVolume();
                          }
                        }}
                        onBlur={() => void audio.commitMicVolume()}
                      />
                      <div className="overview-range-ticks" aria-hidden="true">
                        {PERCENT_SLIDER_TICKS.map((value) => (
                          <span key={value} className={sliderTickClass(value, 100)} />
                        ))}
                      </div>
                    </div>
                    <strong>{audio.micVolumeValue}%</strong>
                  </label>
                  <label className={`overview-slider-row ${(!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled || lighting.lightbarCommitPending) ? 'disabled' : ''}`}>
                    <span>Lightbar</span>
                    <div className="overview-range-control">
                      <input
                        type="range"
                        min="0"
                        max={percentSliderMax}
                        step={LIGHTBAR_BRIGHTNESS_STEP}
                        value={lighting.lightbarBrightnessValue}
                        disabled={!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled || lighting.lightbarCommitPending}
                        style={{ '--range-fill': `${(lighting.lightbarBrightnessValue / percentSliderMax) * 100}%` } as CSSProperties}
                        onPointerDown={() => {
                          lighting.lightbarBrightnessEditingRef.current = true;
                        }}
                        onChange={(event) => lighting.setLightbarBrightnessValue(snapLightbarBrightness(Number(event.currentTarget.value)))}
                        onPointerUp={() => void lighting.commitLightbar()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            lighting.lightbarBrightnessEditingRef.current = true;
                          }
                        }}
                        onKeyUp={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            void lighting.commitLightbar();
                          }
                        }}
                        onBlur={() => void lighting.commitLightbar()}
                      />
                      <div className="overview-range-ticks" aria-hidden="true">
                        {PERCENT_SLIDER_TICKS.map((value) => (
                          <span key={value} className={sliderTickClass(value, 100)} />
                        ))}
                      </div>
                    </div>
                    <strong>{lighting.lightbarBrightnessValue}%</strong>
                  </label>
                </div>
              </section>
            </div>

            <section className="overview-status-panel" aria-label="Active settings summary">
              <div className="overview-status-group">
                <div className="overview-status-heading">
                  <IconDeviceGamepad2 size={15} />
                  <span>Shortcuts</span>
                </div>
                <div className="overview-chip-row">
                  {overviewShortcutItems.length > 0 ? (
                    overviewShortcutItems.map((item) => (
                      <button
                        className="overview-chip overview-shortcut-chip active"
                        key={item.id}
                        type="button"
                        onClick={() => focusBridgeSettings(item.id === 'sleep' ? 'sleep-shortcut' : 'volume-shortcut')}
                      >
                        {item.label}
                        {item.id === 'sleep' ? (
                          <span className="settings-shortcut-tooltip shortcut-glyph-tooltip overview-shortcut-tooltip" role="tooltip">
                            <span>Put controller to sleep with</span>
                            <span className="shortcut-glyph-row" aria-label="PlayStation Home and Triangle">
                              <span className="shortcut-glyph-key">
                                <img src={psHomeGlyphUrl} alt="PlayStation Home" />
                              </span>
                              <span className="shortcut-plus" aria-hidden="true">+</span>
                              <span className="shortcut-glyph-key">
                                <img src={triangleGlyphUrl} alt="Triangle" />
                              </span>
                            </span>
                          </span>
                        ) : (
                          <span className="settings-shortcut-tooltip shortcut-glyph-tooltip overview-shortcut-tooltip" role="tooltip">
                            <span>Controller volume up/down with</span>
                            <span className="shortcut-glyph-row" aria-label="PlayStation Home and D-pad Up or D-pad Down">
                              <span className="shortcut-glyph-key">
                                <img src={psHomeGlyphUrl} alt="PlayStation Home" />
                              </span>
                              <span className="shortcut-plus" aria-hidden="true">+</span>
                              <span className="shortcut-glyph-pair">
                                <span className="shortcut-glyph-key">
                                  <img src={dpadUpGlyphUrl} alt="D-pad Up" />
                                </span>
                                <span className="shortcut-glyph-key">
                                  <img src={dpadDownGlyphUrl} alt="D-pad Down" />
                                </span>
                              </span>
                            </span>
                          </span>
                        )}
                      </button>
                    ))
                  ) : (
                    <span className="overview-chip muted">None enabled</span>
                  )}
                </div>
              </div>
              <div className="overview-status-group">
                <div className="overview-status-heading">
                  <IconBatteryEco size={15} />
                  <span>Power Saving</span>
                </div>
                <div className="overview-chip-row">
                  <button
                    className={`overview-chip ${snapshot.settings.controllerPowerSavingEnabled ? 'active success' : 'muted'}`}
                    type="button"
                    onClick={() => focusBridgeSettings('controller-power-saving')}
                  >
                    {overviewPowerSavingLabel}
                  </button>
                </div>
              </div>
              <div className="overview-status-group">
                <div className="overview-status-heading">
                  <Bell size={15} />
                  <span>Notifications</span>
                </div>
                <div className="overview-chip-row">
                  {overviewNotificationItems.length > 0 ? (
                    overviewNotificationItems.map((item) => (
                      <button
                        className="overview-chip active"
                        key={item.id}
                        type="button"
                        onClick={() => focusNotificationSettings(item.id)}
                      >
                        {item.label}
                      </button>
                    ))
                  ) : (
                    <button
                      className="overview-chip muted"
                      type="button"
                      onClick={() => focusNotificationSettings('all')}
                    >
                      Off
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'devices'}>
            <LazyDevicesPage active={activeControlTab === 'devices'} controller={devices} pendingAction={pendingAction} />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'deadzones'}>
            <LazyStickDeadzonesPage
              active={activeControlTab === 'deadzones'}
              controller={stickDeadzones}
              stickInputPreview={snapshot.stickInputPreview}
              locked={!controllerControlsAvailable || pendingAction !== null}
            />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'haptics' || audioHapticsOpen}>
          <div
            className={`control-page haptics-page ${activeControlTab === 'haptics' || audioHapticsOpen ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-haptics"
            aria-labelledby={audioHapticsOpen ? 'control-tab-audio-haptics' : 'control-tab-haptics'}
            aria-hidden={activeControlTab !== 'haptics' && !audioHapticsOpen}
          >
              <div className="feature-heading">
                <div>
                  <h2>{audioHapticsOpen ? 'Audio Haptics' : 'Haptics'}</h2>
                  <p>{audioHapticsOpen ? 'Turn system audio into haptic feedback.' : 'Adjust controller haptic feedback and run a quick test.'}</p>
                </div>
                <div className="audio-heading-controls">
                  {audioReactiveHapticsModeBadgeLabel ? (
                    <div className="inline-switch audio-haptics-mode-indicator">
                      <span className={`inline-state-badge audio-haptics-mode-state ${audioReactiveHapticsOverrideMode ? 'warn' : 'retry'}`}>
                        {audioReactiveHapticsModeBadgeLabel}
                      </span>
                      <span className="settings-shortcut-tooltip shortcut-glyph-tooltip audio-haptics-mode-tooltip">
                        {audioReactiveHapticsModeTooltip}
                      </span>
                    </div>
                  ) : null}
                  <div className="inline-switch">
                    <span>Enabled</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={audioHapticsOpen ? audioReactiveHapticsEnabled : activeHapticsFeatureEnabled}
                      className={`switch ${(audioHapticsOpen ? audioReactiveHapticsEnabled : activeHapticsFeatureEnabled) ? 'on' : ''}`}
                      disabled={audioHapticsOpen
                        ? audioReactiveHapticsControlDisabled
                        : !controllerControlsAvailable || pendingAction !== null}
                      onClick={audioHapticsOpen
                        ? () => void toggleAudioReactiveHapticsEnabled()
                        : showClassicRumbleControl ? toggleClassicRumbleEnabled : toggleHapticsEnabled}
                    >
                      <span />
                    </button>
                  </div>
                </div>
              </div>
              {audioHapticsOpen ? (
                <div className="feature-card-grid audio-haptics-grid">
                  <section className="feature-card audio-haptics-card">
                    <div className="feature-card-title">
                      <button
                        type="button"
                        className={`feature-icon audio-haptics-enable-button icon-compact ${audioReactiveHapticsEnabled ? 'active' : ''}`}
                        aria-pressed={audioReactiveHapticsEnabled}
                        aria-label={audioReactiveHapticsEnabled ? 'Disable audio haptics' : 'Enable audio haptics'}
                        title={audioReactiveHapticsStatusLabel}
                        disabled={audioReactiveHapticsControlDisabled}
                        onClick={() => void toggleAudioReactiveHapticsEnabled()}
                      >
                        <IconDeviceAudioTape size={20} />
                      </button>
                      <div className="title-copy">
                        <h3>Audio Haptics</h3>
                        <p>System audio feedback</p>
                      </div>
                    </div>
                    <div className="framed-slider">
                      <label className="slider-row">
                        <span>0%</span>
                        <div className="range-control">
                          <input
                            type="range"
                            min="0"
                            max={hapticsSliderMax}
                            step={HAPTICS_STEP}
                            value={hapticsValue}
                            disabled={!connected || !snapshot.settings.hapticsEnabled || hapticsCommitPending}
                            style={{ '--range-fill': `${(hapticsValue / hapticsSliderMax) * 100}%` } as CSSProperties}
                            aria-label="Haptics gain"
                            onPointerDown={() => {
                              hapticsEditingRef.current = true;
                            }}
                            onChange={(event) => setHapticsValue(snapHapticsValue(
                              Number(event.currentTarget.value),
                              hapticsSliderMax
                            ))}
                            onPointerUp={() => void commitHapticsValue()}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                hapticsEditingRef.current = true;
                              }
                            }}
                            onKeyUp={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                void commitHapticsValue();
                              }
                            }}
                            onBlur={() => void commitHapticsValue()}
                          />
                          <div className="range-ticks" aria-hidden="true">
                            {hapticsSliderTicks.map((value) => (
                              <span key={value} className={sliderTickClass(value, hapticsSliderMax)} />
                            ))}
                          </div>
                        </div>
                        <strong>{hapticsValue}%</strong>
                      </label>
                    </div>
                    <span className="audio-haptics-slider-spacer" aria-hidden="true" />
                    <div className="segmented-row">
                      {HAPTICS_PRESETS.map(([label, value]) => {
                        const presetValue = snapHapticsValue(Number(value), hapticsSliderMax);
                        return (
                          <button
                            key={label}
                            type="button"
                            className={hapticsValue === presetValue ? 'active' : ''}
                            disabled={!connected || !snapshot.settings.hapticsEnabled || hapticsCommitPending}
                            onClick={() => setHapticsPreset(presetValue)}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="audio-haptics-routing-stack">
                      <label className="audio-haptics-source-field">
                        <CustomSelect
                          value={audioReactiveHapticsSourceKey}
                          options={audioHapticsSourceOptions}
                          disabled={audioReactiveHapticsConfigDisabled}
                          className="audio-haptics-source-select"
                          ariaLabel="Audio haptics source"
                          renderValue={(label, value) => (
                            <AudioHapticsSourceOption
                              label={label}
                              value={value}
                              session={audioHapticsSessionByKey.get(value)}
                              loading={audioHapticsSessionsLoading}
                            />
                          )}
                          renderOption={(label, value) => (
                            <AudioHapticsSourceOption
                              label={label}
                              value={value}
                              session={audioHapticsSessionByKey.get(value)}
                              loading={audioHapticsSessionsLoading}
                            />
                          )}
                          onChange={setAudioReactiveHapticsSourceValue}
                        />
                      </label>
                      <div className="dual-selector audio-haptics-mode-selector" role="tablist" aria-label="Audio haptics mode">
                        {AUDIO_REACTIVE_HAPTICS_MODE_OPTIONS.map(([label, mode]) => (
                          <button
                            key={mode}
                            type="button"
                            role="tab"
                            aria-selected={snapshot.settings.audioReactiveHapticsMode === mode}
                            className={snapshot.settings.audioReactiveHapticsMode === mode ? 'active' : ''}
                            disabled={audioReactiveHapticsConfigDisabled}
                            onClick={() => setAudioReactiveHapticsMode(mode)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                  <section className="feature-card audio-haptics-card audio-haptics-response-card">
                    <div className="feature-card-title">
                      <span className="feature-icon"><IconBrandDeezer size={20} /></span>
                      <div className="title-copy">
                        <h3>Response</h3>
                        <p>Frequency focus and strength</p>
                      </div>
                    </div>
                    <div className="audio-haptics-config-stack">
                      <div className="audio-haptics-config-pair-row">
                        <label>
                          <AudioHapticsConfigLabel
                            id="audio-haptics-bass-focus-tooltip"
                            label="Bass Focus"
                            tooltip={AUDIO_REACTIVE_HAPTICS_FIELD_TOOLTIPS.bassFocus}
                          />
                          <CustomSelect
                            value={snapshot.settings.audioReactiveHapticsBassFocus}
                            options={AUDIO_REACTIVE_HAPTICS_BASS_FOCUS_OPTIONS}
                            disabled={audioReactiveHapticsConfigDisabled}
                            className="audio-haptics-select"
                            ariaLabel="Audio haptics bass focus"
                            onChange={setAudioReactiveHapticsBassFocus}
                          />
                        </label>
                        <label>
                          <AudioHapticsConfigLabel
                            id="audio-haptics-response-tooltip"
                            label="Response"
                            tooltip={AUDIO_REACTIVE_HAPTICS_FIELD_TOOLTIPS.response}
                          />
                          <CustomSelect
                            value={snapshot.settings.audioReactiveHapticsResponse}
                            options={AUDIO_REACTIVE_HAPTICS_RESPONSE_OPTIONS}
                            disabled={audioReactiveHapticsConfigDisabled}
                            className="audio-haptics-select"
                            ariaLabel="Audio haptics response"
                            onChange={setAudioReactiveHapticsResponse}
                          />
                        </label>
                      </div>
                      <div className="audio-haptics-config-pair-row">
                        <label>
                          <AudioHapticsConfigLabel
                            id="audio-haptics-attack-tooltip"
                            label="Ramp"
                            tooltip={AUDIO_REACTIVE_HAPTICS_FIELD_TOOLTIPS.attack}
                          />
                          <CustomSelect
                            value={snapshot.settings.audioReactiveHapticsAttack}
                            options={AUDIO_REACTIVE_HAPTICS_ATTACK_OPTIONS}
                            disabled={audioReactiveHapticsConfigDisabled}
                            className="audio-haptics-select"
                            ariaLabel="Audio haptics attack"
                            onChange={setAudioReactiveHapticsAttack}
                          />
                        </label>
                        <label>
                          <AudioHapticsConfigLabel
                            id="audio-haptics-release-tooltip"
                            label="Fade"
                            tooltip={AUDIO_REACTIVE_HAPTICS_FIELD_TOOLTIPS.release}
                          />
                          <CustomSelect
                            value={snapshot.settings.audioReactiveHapticsRelease}
                            options={AUDIO_REACTIVE_HAPTICS_RELEASE_OPTIONS}
                            disabled={audioReactiveHapticsConfigDisabled}
                            className="audio-haptics-select"
                            ariaLabel="Audio haptics release"
                            onChange={setAudioReactiveHapticsRelease}
                          />
                        </label>
                      </div>
                    </div>
                    <div className="feature-status test-status audio-haptics-status">
                      <span className={`status-badge ${audioReactiveHapticsStatusTone}`} title={audioReactiveHapticsStatusLabel}>
                        <span className={`dot ${audioReactiveHapticsStatusTone}`} />
                        <strong>{audioReactiveHapticsStatusLabel}</strong>
                      </span>
                      <span className={`status-badge ${audioReactiveHapticsStatusTone}`} title={audioReactiveHapticsSourceKey === 'system-audio' ? 'Using the mixed Windows output.' : 'Using the selected app audio session.'}>
                        <span className={`dot ${audioReactiveHapticsEnabled ? audioReactiveHapticsStatusTone : 'idle'}`} />
                        <strong>{selectedAudioHapticsSourceDisplayName}</strong>
                      </span>
                    </div>
                  </section>
                </div>
              ) : (
              <div className="feature-card-grid">
                <section className="feature-card preset-card">
                  <div className="feature-card-title">
                    <button
                      type="button"
                      className={`feature-icon haptics-enable-button ${showClassicRumbleControl ? 'icon-medium' : 'icon-compact'} ${activeHapticsFeatureEnabled ? 'active' : ''} ${controllerPowerSavingActive && activeHapticsFeatureEnabled ? 'power-saving-active' : ''}`}
                      aria-pressed={activeHapticsFeatureEnabled}
                      aria-label={showClassicRumbleControl ? 'Enable rumble' : 'Enable haptics'}
                      title={showClassicRumbleControl ? 'Enable rumble' : 'Enable haptics'}
                      disabled={!controllerControlsAvailable || pendingAction !== null}
                      onClick={showClassicRumbleControl ? toggleClassicRumbleEnabled : toggleHapticsEnabled}
                    >
                      {showClassicRumbleControl ? <Vibrate size={20} /> : <Sparkles size={20} />}
                    </button>
                    <div className="title-copy">
                      <h3>{showClassicRumbleControl ? 'Rumble' : 'Intensity'}</h3>
                      <p>{showClassicRumbleControl ? 'Rumble Strength' : 'Haptic Strength'}</p>
                    </div>
                    <div className="dual-selector haptics-mode-selector" role="tablist" aria-label="Haptics control mode">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={!showClassicRumbleControl}
                        className={!showClassicRumbleControl ? 'active' : ''}
                        onClick={() => setShowClassicRumbleControl(false)}
                      >
                        Haptics
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={showClassicRumbleControl}
                        className={showClassicRumbleControl ? 'active' : ''}
                        onClick={() => setShowClassicRumbleControl(true)}
                      >
                        Rumble
                      </button>
                    </div>
                  </div>
                  <div className="framed-slider">
                    <label className="slider-row">
                      <span>0%</span>
                      <div className="range-control">
                        {showClassicRumbleControl ? (
                          <input
                            type="range"
                            min="0"
                            max={hapticsSliderMax}
                            step={HAPTICS_STEP}
                            value={classicRumbleValue}
                            disabled={!connected || !snapshot.settings.classicRumbleEnabled}
                            style={{ '--range-fill': `${(classicRumbleValue / hapticsSliderMax) * 100}%` } as CSSProperties}
                            onPointerDown={() => {
                              classicRumbleEditingRef.current = true;
                            }}
                            onChange={(event) => setClassicRumbleValue(snapHapticsValue(
                              Number(event.currentTarget.value),
                              hapticsSliderMax
                            ))}
                            onPointerUp={() => void commitClassicRumbleValue()}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                classicRumbleEditingRef.current = true;
                              }
                            }}
                            onKeyUp={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                void commitClassicRumbleValue();
                              }
                            }}
                            onBlur={() => void commitClassicRumbleValue()}
                          />
                        ) : (
                          <input
                            type="range"
                            min="0"
                            max={hapticsSliderMax}
                            step={HAPTICS_STEP}
                            value={hapticsValue}
                            disabled={!connected || !snapshot.settings.hapticsEnabled}
                            style={{ '--range-fill': `${(hapticsValue / hapticsSliderMax) * 100}%` } as CSSProperties}
                            onPointerDown={() => {
                              hapticsEditingRef.current = true;
                            }}
                            onChange={(event) => setHapticsValue(snapHapticsValue(
                              Number(event.currentTarget.value),
                              hapticsSliderMax
                            ))}
                            onPointerUp={() => void commitHapticsValue()}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                hapticsEditingRef.current = true;
                              }
                            }}
                            onKeyUp={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                void commitHapticsValue();
                              }
                            }}
                            onBlur={() => void commitHapticsValue()}
                          />
                        )}
                        <div className="range-ticks" aria-hidden="true">
                          {hapticsSliderTicks.map((value) => (
                            <span key={value} className={sliderTickClass(value, hapticsSliderMax)} />
                          ))}
                        </div>
                      </div>
                      <strong>{showClassicRumbleControl ? classicRumbleValue : hapticsValue}%</strong>
                    </label>
                  </div>
                  <div className="segmented-row">
                    {HAPTICS_PRESETS.map(([label, value]) => {
                      const presetValue = snapHapticsValue(Number(value), hapticsSliderMax);
                      const currentValue = showClassicRumbleControl ? classicRumbleValue : hapticsValue;
                      return (
                        <button
                          key={label}
                          type="button"
                          className={currentValue === presetValue ? 'active' : ''}
                          disabled={
                            !connected
                            || (showClassicRumbleControl ? !snapshot.settings.classicRumbleEnabled : !snapshot.settings.hapticsEnabled)
                          }
                          onClick={() => (
                            showClassicRumbleControl
                              ? setClassicRumblePreset(presetValue)
                              : setHapticsPreset(presetValue)
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  <div
                    className="inline-switch feedback-boost-control haptics-boost-control"
                    title={feedbackBoostEnabled ? 'Feedback boost: up to 500%' : 'Enable feedback boost up to 500%'}
                  >
                    <span className="feedback-boost-label">
                      <IconFlame size={16} aria-hidden="true" />
                      Boost
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={feedbackBoostEnabled}
                      aria-label={feedbackBoostEnabled ? 'Disable feedback boost' : 'Enable feedback boost'}
                      className={`switch ${feedbackBoostEnabled ? 'on' : ''}`}
                      disabled={!connected || pendingAction !== null || feedbackBoostCommitPending}
                      onClick={toggleFeedbackBoostEnabled}
                    >
                      <span />
                    </button>
                  </div>
                  {showClassicRumbleControl ? (
                    <div
                      className="inline-switch feedback-boost-control haptics-rumble-v1-control"
                      title={classicRumbleV1Enabled ? 'Classic rumble: v1 compatibility mode' : 'Classic rumble: v2 default mode'}
                    >
                      <span className="feedback-boost-label">v1 Rumble</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={classicRumbleV1Enabled}
                        aria-label={classicRumbleV1Enabled ? 'Disable v1 rumble mode' : 'Enable v1 rumble mode'}
                        className={`switch ${classicRumbleV1Enabled ? 'on' : ''}`}
                        disabled={!connected || pendingAction !== null || classicRumbleV1CommitPending}
                        onClick={toggleClassicRumbleV1Enabled}
                      >
                        <span />
                      </button>
                    </div>
                  ) : null}
                </section>
                <section className="feature-card test-card">
                  <div className="feature-card-title">
                    <span className="feature-icon"><IconTestPipe size={20} /></span>
                    <div className="title-copy">
                      <h3>Testing</h3>
                      <p>Run a short test to feel the current settings.</p>
                    </div>
                  </div>
                  <button className="primary-action" type="button" disabled={activeFeedbackTestUnavailable} onClick={runFeedbackTest}>
                    <Play size={15} />
                    {showClassicRumbleControl
                      ? connected && testLocked
                        ? 'Testing'
                        : 'Test Rumble'
                    : connected && testLocked
                        ? 'Testing'
                      : connected && snapshot.status?.testHapticsCooldown
                        ? 'Cooling Down'
                        : 'Test Haptics'}
                  </button>
                  <button className="secondary-action" type="button" disabled={!testLocked} onClick={() => setTestLocked(false)}>
                    <span className="stop-glyph" aria-hidden="true" />
                    Stop Test
                  </button>
                  <div className={`feature-status test-status ${activeFeedbackStatusTone}`}>
                    <span className="status-badge">
                      <span className={`dot ${activeFeedbackStatusTone}`} />
                      <strong>{activeFeedbackStatusLabel}</strong>
                    </span>
                  </div>
                </section>
              </div>
              )}
              <FeatureTipsPanel tab="haptics" onSettingsFocusRequest={focusBridgeSettings} audioHapticsOpen={audioHapticsOpen} />
          </div>
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'audio'}>
            <ControllerAudioPage
              active={activeControlTab === 'audio'}
              controller={audio}
              snapshot={snapshot}
              connected={connected}
              controllerControlsAvailable={controllerControlsAvailable}
              pendingAction={pendingAction}
            />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'triggers' || triggerLabOpen}>
            <AdaptiveTriggersPage
              active={activeControlTab === 'triggers' || triggerLabOpen}
              triggerLabOpen={triggerLabOpen}
              triggers={triggers}
              lab={triggerLab}
              snapshot={snapshot}
              connected={connected}
              controllerControlsAvailable={controllerControlsAvailable}
              pendingAction={pendingAction}
              onSettingsFocusRequest={focusBridgeSettings}
            />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'lighting'}>
            <ControllerLightingPage
              active={activeControlTab === 'lighting'}
              controller={lighting}
              snapshot={snapshot}
              connected={connected}
              controllerControlsAvailable={controllerControlsAvailable}
              pendingAction={pendingAction}
              onSettingsFocusRequest={focusBridgeSettings}
            />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'remapping'}>
            <LazyButtonRemappingPage
              active={activeControlTab === 'remapping'}
              controller={buttonRemapping}
              pendingAction={pendingAction}
            />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'chords'}>
            <LazyChordsPage
              active={activeControlTab === 'chords'}
              controller={chords}
              snapshot={snapshot}
              pendingAction={pendingAction}
            />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'system'}>
          <div
            className={`control-page system-page ${activeControlTab === 'system' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-system"
            aria-labelledby="control-tab-system"
            aria-hidden={activeControlTab !== 'system'}
          >
              <div className="feature-heading system-heading">
                <div>
                  <h2>System</h2>
                  <p>Configure bridge behavior and defaults.</p>
                </div>
                <div className="profile-controls">
                  <button
                    className="heading-icon-action emergency-repair-button"
                    type="button"
                    title="Emergency device repair"
                    aria-label="Emergency device repair"
                    disabled={pendingAction !== null}
                    onClick={openDeviceCleanupConfirm}
                  >
                    <IconTool size={20} />
                  </button>
                  <CustomSelect
                    value={selectedControllerProfileId}
                    disabled={!connected || pendingAction !== null}
                    options={controllerProfileOptions}
                    ariaLabel="System profile"
                    onChange={selectControllerProfile}
                  />
                  <button
                    className="heading-action"
                    type="button"
                    disabled={!connected || pendingAction !== null || hapticsCommitPending || audio.speakerVolumeCommitPending || lighting.lightbarCommitPending}
                    onClick={() => void runAction('restore', () => window.bridge.restoreDefaults())}
                  >
                    <RefreshCcw size={18} />
                    Restore Defaults
                  </button>
                </div>
              </div>

              <div className="feature-card-grid">
                <section className="system-card mute-card">
                  <div className="feature-card-title system-card-heading">
                    <span className="feature-icon system-icon icon-wide"><MicOff size={20} /></span>
                    <div className="title-copy">
                      <h3>Mute Button</h3>
                      <p>Set controller mute behavior.</p>
                    </div>
                  </div>
                  <div className="system-fields">
                    <div className="select-row">
                      <span>Behavior</span>
                      <CustomSelect
                        value={snapshot.settings.muteButtonMode}
                        disabled={!connected || !muteButtonActionsSupported || pendingAction !== null}
                        options={MUTE_BUTTON_MODE_OPTIONS}
                        ariaLabel="Mute button behavior"
                        onChange={(mode) => setMuteButtonAction(mode)}
                      />
                    </div>
                    {snapshot.settings.muteButtonMode === 'keyboard' && (
                      <>
                        <div className="select-row">
                          <span>Key</span>
                          <CustomSelect
                            value={snapshot.settings.muteKeyboardUsage}
                            disabled={!connected || !muteButtonActionsSupported || pendingAction !== null}
                            options={MUTE_KEY_OPTIONS}
                            ariaLabel="Mute keyboard key"
                            onChange={(usage) => setMuteButtonAction('keyboard', usage)}
                          />
                        </div>
                        <div className="select-row">
                          <span>Press Mode</span>
                          <CustomSelect
                            value={snapshot.settings.muteKeyboardBehavior}
                            disabled={!connected || !muteButtonActionsSupported || pendingAction !== null}
                            options={MUTE_KEYBOARD_BEHAVIOR_OPTIONS}
                            ariaLabel="Mute keyboard press mode"
                            onChange={(behavior) => setMuteButtonAction('keyboard', undefined, undefined, behavior)}
                          />
                        </div>
                        <div className="modifier-block">
                          <div className="modifier-grid" aria-label="Keyboard modifiers">
                            {MUTE_MODIFIER_OPTIONS.map(([label, bit]) => {
                              const enabled = (snapshot.settings.muteKeyboardModifiers & bit) !== 0;
                              return (
                                <button
                                  key={bit}
                                  type="button"
                                  className={enabled ? 'active' : ''}
                                  disabled={!connected || !muteButtonActionsSupported || pendingAction !== null}
                                  onClick={() => setMuteModifier(bit, !enabled)}
                                >
                                  <Keyboard size={16} />
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="select-row">
                          <span
                            className="settings-menu-copy-tooltip chord-starter-label"
                            tabIndex={0}
                            aria-describedby="mute-chord-starter-tooltip"
                          >
                            Chord Starter
                            <span
                              id="mute-chord-starter-tooltip"
                              className="settings-shortcut-tooltip chord-starter-tooltip"
                              role="tooltip"
                            >
                              Lets Mute start a chord. When enabled, the keyboard key waits 250ms so a chord can be detected first.
                            </span>
                          </span>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={snapshot.settings.muteKeyboardChordStarterEnabled}
                            className={`switch ${snapshot.settings.muteKeyboardChordStarterEnabled ? 'on' : ''}`}
                            disabled={!connected || !muteButtonActionsSupported || pendingAction !== null}
                            onClick={() => setMuteButtonAction(
                              'keyboard',
                              undefined,
                              undefined,
                              undefined,
                              !snapshot.settings.muteKeyboardChordStarterEnabled
                            )}
                          >
                            <span />
                          </button>
                        </div>
                      </>
                    )}
                    {snapshot.settings.muteButtonMode === 'quiet' && (
                      <div className={`quiet-state ${snapshot.status?.quietModeEnabled ? 'active' : ''}`}>
                        <VolumeX size={18} />
                        <span>{snapshot.status?.quietModeEnabled ? 'Controller Quiet On' : 'Controller Quiet Off'}</span>
                      </div>
                    )}
                  </div>
                </section>

                <section className={`system-card device-card ${showDiagnostics ? 'expanded' : ''}`}>
                  <div className="feature-card-title system-card-heading">
                    <span className="feature-icon system-icon icon-wide">
                      {showDiagnostics ? <IconStethoscope size={20} /> : <Settings2 size={20} />}
                    </span>
                    <div className="title-copy">
                      <h3>{showDiagnostics ? 'Diagnostics' : 'Device'}</h3>
                        <p>
                          {showDiagnostics
                            ? 'Debug Data'
                            : 'Firmware'}
                        </p>
                    </div>
                    <div className="dual-selector system-mode-selector" role="tablist" aria-label="System control mode">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={!showDiagnostics}
                        className={!showDiagnostics ? 'active' : ''}
                        onClick={() => setShowDiagnostics(false)}
                      >
                        Device
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={showDiagnostics}
                        className={showDiagnostics ? 'active' : ''}
                        onClick={() => setShowDiagnostics(true)}
                      >
                        Diagnostics
                      </button>
                    </div>
                  </div>
                  {showDiagnostics ? (
                    <div className="device-diagnostics">
                      <dl>
                        <div><dt>Protocol</dt><dd>{snapshot.diagnostics.protocolVersion ?? '--'}</dd></div>
                        <div>
                          <dt>Uptime</dt>
                          <dd>
                            <UptimeValue
                              active={diagnosticsVisible}
                              lastPollAt={snapshot.diagnostics.lastPollAt}
                              uptimeSeconds={snapshot.diagnostics.uptimeSeconds}
                            />
                          </dd>
                        </div>
                        <div>
                          <dt>Revision</dt>
                          <dd><span className="diagnostic-number">{snapshot.diagnostics.settingsRevision ?? '--'}</span></dd>
                        </div>
                        <div><dt>Last ACK</dt><dd>{ackText}</dd></div>
                        <div><dt>HID Path</dt><dd>{snapshot.diagnostics.hidPath ?? '--'}</dd></div>
                        <div className="debug-entry firmware-log-entry">
                          <dt>Firmware UART Log</dt>
                          <dd>
                            <div className="firmware-log-details">
                              <span>{firmwareLogStatus}</span>
                              <span title={snapshot.diagnostics.firmwareLogDirectory ?? undefined}>
                                Folder: {snapshot.diagnostics.firmwareLogDirectory ?? '--'}
                              </span>
                              <span title={snapshot.diagnostics.firmwareLogPath ?? undefined}>
                                File: {snapshot.diagnostics.firmwareLogPath ?? '--'}
                              </span>
                              <span>
                                SRAM overwrite loss: <span className="diagnostic-number">{snapshot.diagnostics.firmwareLogDroppedBytes}</span> bytes
                              </span>
                            </div>
                            <div className="firmware-log-actions">
                              <button
                                type="button"
                                className="secondary-action"
                                disabled={pendingAction !== null}
                                onClick={chooseFirmwareLogDirectory}
                              >
                                Choose Folder
                              </button>
                              {snapshot.diagnostics.firmwareLogDirectory ? (
                                <button
                                  type="button"
                                  className="secondary-action"
                                  disabled={pendingAction !== null}
                                  onClick={clearFirmwareLogDirectory}
                                >
                                  Stop Capture
                                </button>
                              ) : null}
                            </div>
                          </dd>
                        </div>
                        <div>
                          <dt>Audio Log</dt>
                          <dd title={snapshot.diagnostics.audioDebugLogPath ?? undefined}>
                            {snapshot.diagnostics.audioDebugLogPath ?? '--'}
                          </dd>
                        </div>
                        <div>
                          <dt>Dropped</dt>
                          <dd><span className="diagnostic-number">{snapshot.diagnostics.audioDebugDroppedCount}</span></dd>
                        </div>
                        <div>
                          <dt>Trigger Drop</dt>
                          <dd><span className="diagnostic-number">{snapshot.diagnostics.triggerTraceDroppedCount}</span></dd>
                        </div>
                        <div>
                          <dt>Feedback Drop</dt>
                          <dd><span className="diagnostic-number">{snapshot.diagnostics.feedbackTraceDroppedCount}</span></dd>
                        </div>
                        <div className="debug-entry">
                          <dt>Audio Debug</dt>
                          <dd>
                            <textarea readOnly value={audioDebugText} aria-label="Audio debug copy text" />
                          </dd>
                        </div>
                        <div className="debug-entry">
                          <dt>Audio Events</dt>
                          <dd>
                            <textarea readOnly value={audioEventLogText} aria-label="Audio event log text" />
                          </dd>
                        </div>
                        <div className="debug-entry">
                          <dt>Trigger Trace</dt>
                          <dd>
                            <textarea readOnly value={triggerTraceText} aria-label="Trigger trace text" />
                          </dd>
                        </div>
                        <div className="debug-entry">
                          <dt>Feedback Trace</dt>
                          <dd>
                            <textarea readOnly value={feedbackTraceText} aria-label="Feedback trace text" />
                          </dd>
                        </div>
                      </dl>
                    </div>
                  ) : (
                    <div className="device-list">
                      <div className="device-row">
                        <span>Firmware</span>
                        <strong>{snapshot.status?.firmwareVersion ?? '--'}</strong>
                      </div>
                      <div className="device-row">
                        <span>Controller</span>
                        <strong>{controllerConnected ? controllerName(snapshot.status?.controllerType) : '--'}</strong>
                      </div>
                      <div className="device-row device-control-row">
                        <span>Polling Rate</span>
                        <CustomSelect
                          value={snapshot.settings.pollingRateMode}
                          disabled={!connected || !pollingRateControlSupported || pendingAction !== null}
                          options={POLLING_RATE_OPTIONS}
                          ariaLabel="Polling rate"
                          onChange={setPollingRateMode}
                        />
                      </div>
                      <div className="device-row device-control-row">
                        <span>Host Controller</span>
                        <CustomSelect
                          value={snapshot.settings.hostPersonaMode}
                          disabled={!connected || !hostPersonaControlSupported || pendingAction !== null || personaTransitionActive}
                          options={hostPersonaOptions.length > 0 ? hostPersonaOptions : HOST_PERSONA_OPTIONS.slice(0, 1)}
                          className="host-persona-selector"
                          ariaLabel="Host controller persona"
                          getOptionClassName={(_, mode) => (mode === 'xbox' ? 'host-persona-platform-break' : undefined)}
                          renderValue={(label, mode) => <HostPersonaOption label={label} value={mode} />}
                          renderOption={(label, mode) => <HostPersonaOption label={label} value={mode} />}
                          onChange={setHostPersonaMode}
                        />
                      </div>
                      <div className="device-row device-status-row">
                        <span>Status</span>
                        <strong className={`health-label ${systemHealthTone}`} title={healthTitle(snapshot)}>
                          <span className={`dot ${systemHealthTone === 'good' ? statusTone : systemHealthTone}`} />
                          {healthLabel(snapshot)}
                        </strong>
                      </div>
                    </div>
                  )}
                </section>
              </div>
              <section className="feature-help-panel system-profile-panel" aria-label="System profiles and tips">
                <div className="system-profile-strip">
                  <ProfileSaveStatus />
                  <div className="remapping-profile-actions">
                    <button
                      type="button"
                      disabled={selectedControllerProfileIsDefault || pendingAction !== null}
                      onClick={renameControllerProfile}
                    >
                      <Pencil size={15} />
                      Rename Profile
                    </button>
                    <button
                      type="button"
                      disabled={pendingAction !== null}
                      onClick={saveControllerProfile}
                    >
                      <Save size={15} />
                      Save New Profile
                    </button>
                    <button
                      type="button"
                      disabled={!canDeleteControllerProfile || pendingAction !== null}
                      onClick={deleteControllerProfile}
                    >
                      <Trash2 size={15} />
                      Delete Profile
                    </button>
                  </div>
                </div>
                <SystemProfileSummary
                  settings={controllerProfileSettingsFromSnapshot(snapshot)}
                  powerSavingActive={controllerPowerSavingActive}
                />
              </section>
          </div>
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'settings'}>
            <LazySettingsPage
              active={activeControlTab === 'settings'}
              navigation={settingsNavigation}
              model={settingsPageModel}
              actions={settingsPageActions}
            />
          </DeferredPage>
        </>
      )}
      settingsSidebar={(
        <SettingsSidebar
          navigation={settingsNavigation}
          onBack={() => selectControlTab(settingsReturnTab)}
          header={<><ShellSidebarHeader />{sidebarDeviceNode}</>}
        />
      )}
      overlays={(
        <>

      {showKitsuneInputPromotion && !snapshot.settings.kitsuneInputPromotionDismissed && (
        <KitsuneInputPromotionDialog
          dismissing={pendingAction === 'dismiss-kitsune-input-promotion'}
          onClose={() => setShowKitsuneInputPromotion(false)}
          onPurchase={() => void window.bridge.openExternal(KITSUNE_INPUT_PURCHASE_URL)}
          onLearnMore={() => void window.bridge.openExternal(KITSUNE_INPUT_URL)}
          onDismissForever={() => {
            setShowKitsuneInputPromotion(false);
            void runAction(
              'dismiss-kitsune-input-promotion',
              () => window.bridge.setKitsuneInputPromotionDismissed(true)
            );
          }}
        />
      )}

      {kitsuneLaunchOffer.visible && (
        <KitsuneInputLaunchOffer
          onGet={() => {
            void window.bridge.openExternal(KITSUNE_INPUT_PURCHASE_URL);
            kitsuneLaunchOffer.close();
          }}
          onLearnMore={() => void window.bridge.openExternal(KITSUNE_INPUT_URL)}
          onClose={kitsuneLaunchOffer.close}
        />
      )}

      {startupTutorial.step !== 'done' && (
        <StartupTutorial
          step={startupTutorial.step}
          featureExampleActive={startupTutorial.featureExampleActive}
          supportCountdown={startupTutorial.supportCountdown}
          kofiBadgeUrl={kofiBadgeUrl}
          onFeatureExampleToggle={startupTutorial.toggleFeatureExample}
          onFeatureStepComplete={startupTutorial.completeFeatureStep}
          onSupport={() => void window.bridge.openExternal('https://ko-fi.com/sundaymoments')}
          onFinish={startupTutorial.finish}
        />
      )}

      {deviceCleanupConfirmVisible && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeDeviceCleanupConfirm}
        >
          <form
            className="settings-menu bridge-settings-modal device-cleanup-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Emergency device repair"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void runWindowsDeviceCleanup();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <IconTool size={16} />
                <span>Emergency Device Repair</span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close emergency device repair dialog"
                disabled={pendingAction === 'device-cleanup'}
                onClick={closeDeviceCleanupConfirm}
              >
                <X size={16} />
              </button>
            </div>
            <div className="device-cleanup-copy">
              <p>
                Only run this if you are running into persistent odd controller, rumble, haptics, audio, or Windows device issues.
              </p>
              <p>
                Disconnect the controller from the bridge before running this repair.
              </p>
              <ul>
                <li>Removes stale Windows DualSense, DualSense Edge, DS5 Bridge USB/HID, audio endpoint, and Bluetooth pairing records.</li>
                <li>Controller identity based profiles in Steam, emulators, or other tools may need to be assigned again.</li>
                <li>DualSense controllers paired directly to Windows over Bluetooth may need to be paired again.</li>
              </ul>
              {controllerConnected && (
                <div className="device-cleanup-alert bad">
                  Controller is still connected to the bridge.
                </div>
              )}
              {deviceCleanupError && (
                <div className="device-cleanup-alert bad">
                  {deviceCleanupError}
                </div>
              )}
              {deviceCleanupMessage && (
                <div className="device-cleanup-alert good">
                  {deviceCleanupMessage}
                </div>
              )}
            </div>
            <div className="remap-profile-dialog-actions">
              <button
                type="button"
                className="secondary-action"
                disabled={pendingAction === 'device-cleanup'}
                onClick={closeDeviceCleanupConfirm}
              >
                Close
              </button>
              <button
                type="submit"
                className="primary-action danger"
                disabled={pendingAction !== null || controllerConnected}
              >
                {pendingAction === 'device-cleanup' ? 'Running...' : 'Run Repair'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ChordFunctionDialog controller={chords} pendingAction={pendingAction} />

      <TriggerLabProfileDialog lab={triggerLab} pendingAction={pendingAction} />

      <ButtonRemappingProfileDialog controller={buttonRemapping} pendingAction={pendingAction} />

      <BootloaderConfirmationDialog
        confirmation={snapshot.bootloaderConfirmation}
        onCancel={() => void runQuietAction(() => window.bridge.cancelBootloaderConfirmation())}
      />

      {controllerProfileDialogMode && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeControllerProfileDialog}
        >
          <form
            className="settings-menu bridge-settings-modal remap-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="System profile"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              submitControllerProfileDialog();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                {controllerProfileDialogMode === 'delete' ? <Trash2 size={16} /> : <Save size={16} />}
                <span>
                  {controllerProfileDialogMode === 'save'
                    ? 'Save New Profile'
                    : controllerProfileDialogMode === 'rename'
                      ? 'Rename Profile'
                      : 'Delete Profile'}
                </span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close system profile dialog"
                onClick={closeControllerProfileDialog}
              >
                <X size={16} />
              </button>
            </div>
            {controllerProfileDialogMode === 'delete' ? (
              <p className="remap-profile-dialog-copy">
                Delete {selectedControllerProfile?.name ?? 'this profile'}?
              </p>
            ) : (
              <label className="remap-profile-name-field">
                <span>Profile Name</span>
                <input
                  autoFocus
                  value={controllerProfileNameDraft}
                  maxLength={48}
                  onChange={(event) => setControllerProfileNameDraft(event.target.value)}
                />
              </label>
            )}
            <div className="remap-profile-dialog-actions">
              <button type="button" className="secondary-action" onClick={closeControllerProfileDialog}>
                Cancel
              </button>
              <button
                type="submit"
                className={`primary-action ${controllerProfileDialogMode === 'delete' ? 'danger' : ''}`}
                disabled={pendingAction !== null || (controllerProfileDialogMode !== 'delete' && controllerProfileNameDraft.trim().length === 0)}
              >
                {controllerProfileDialogMode === 'delete' ? 'Delete' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}


        </>
      )}
    />
  );
}
