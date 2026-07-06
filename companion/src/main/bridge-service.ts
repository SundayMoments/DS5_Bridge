import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  ACK_RESULT,
  AUDIO_DEBUG_EVENT,
  COMMAND_ID,
  PROTOCOL_MAJOR,
  PROTOCOL_MINOR,
  REPORT_ID,
  REPORT_LENGTH,
  CHORD_FUNCTION_EVENT_BASE,
  MAX_CHORD_ASSIGNMENTS,
  MUTE_KEYBOARD_CHORD_STARTER_FLAG,
  MUTE_KEYBOARD_HOLD_FLAG,
  MUTE_KEYBOARD_MODIFIER_MASK,
  ProtocolError,
  ackUserMessage,
  buildChordBindingsPayload,
  buildCommandReport,
  parseAckReport,
  parseAudioDebugReport,
  parseAudioStatsReport,
  parseAudioStatusReport,
  parseTriggerTraceReport,
  parseFeedbackTraceReport,
  parseStatusReport,
  readReportProtocolVersion,
  SHORTCUT_EVENT,
  buildButtonRemapPayload,
  hostPersonaModeValue,
  normalizeChordControllerSettingStepPercent,
  normalizeBridgePresetId,
  pollingRateModeValue
} from '../shared/protocol';
import type {
  AdaptiveTriggerPreviewEffect,
  AudioReactiveHapticsAttack,
  AudioReactiveHapticsBassFocus,
  AudioReactiveHapticsConfig,
  AudioReactiveHapticsMode,
  AudioReactiveHapticsRelease,
  AudioReactiveHapticsResponse,
  AudioReactiveHapticsSource,
  AudioDebugEventPayload,
  AudioDebugStatsPayload,
  BridgeAckPayload,
  BridgePresetId,
  ChordAssignment,
  ChordFunction,
  RemapButtonId,
  HostPersonaMode,
  AudioStatusPayload,
  TriggerTraceEventPayload,
  FeedbackTraceEventPayload,
  BridgeStatusPayload,
  MuteButtonMode,
  MuteKeyboardBehavior,
  PollingRateMode,
  ReportProtocolVersion,
  ShortcutEvent,
  TriggerTestMode,
  TriggerTestTarget
} from '../shared/protocol';
import type {
  BridgeDiagnostics,
  BridgeSnapshot,
  CompanionSettings,
  AudioHapticsSession,
  HostPersonaTransition,
  HidDeviceSummary,
  UiScalePercent,
  UiThemePreset,
  WindowsDeviceCleanupResult
} from '../shared/types';
import {
  AudioHapticsSessionMonitor,
  MicKeepaliveEngine,
  SystemAudioHapticsEngine,
  playBridgeHapticsTestPattern,
  playBridgeSpeakerTestTone,
  getDefaultRenderEndpointStatus,
  setDefaultRenderBridgeEndpoint,
  type DefaultRenderEndpointStatus,
  type SystemAudioHapticsConfig
} from './audio-helper';
import { CompanionDebugConfig } from './debug-config';
import { HidDiscoveryClient } from './hid-discovery-client';
import { SettingsStore, normalizeUiScalePercent, normalizeUiThemePreset } from './settings-store';
import { WinUsbCompanionTransport } from './winusb-companion-transport';

const POLL_INTERVAL_MS = 500;
const SHORTCUT_POLL_INTERVAL_MS = 50;
const SHORTCUT_POLL_ERROR_RETRY_MS = 250;
const AUDIO_STATUS_READ_INTERVAL_MS = 500;
const AUDIO_DEBUG_READ_INTERVAL_MS = 500;
const TRIGGER_TRACE_READ_INTERVAL_MS = 250;
const FEEDBACK_TRACE_READ_INTERVAL_MS = 250;
const AUDIO_DEBUG_DIAGNOSTICS_ENABLED = CompanionDebugConfig.audioDebugDiagnosticsEnabled;
const TRIGGER_TRACE_DIAGNOSTICS_ENABLED = CompanionDebugConfig.triggerTraceDiagnosticsEnabled;
const FEEDBACK_TRACE_DIAGNOSTICS_ENABLED = CompanionDebugConfig.feedbackTraceDiagnosticsEnabled;
const MIC_KEEPALIVE_ENABLED = CompanionDebugConfig.micKeepaliveEnabled;
const SYSTEM_AUDIO_HAPTICS_RETRY_MS = 5000;
const SYSTEM_AUDIO_HAPTICS_BYPASS_RETRY_MS = 2000;
const AUDIO_HAPTICS_SESSION_CACHE_MS = 2500;
const LOW_BATTERY_PERCENT = 20;
const BUNDLED_FIRMWARE_VERSION = '1.6.3';
const MIN_SUPPORTED_FIRMWARE_VERSION = '1.6.1';
const FIRMWARE_UPDATE_REQUIRED_MESSAGE = `Firmware ${MIN_SUPPORTED_FIRMWARE_VERSION} update required`;
const AUDIO_DEBUG_LOG_LINE_LIMIT = 300;
const TRIGGER_TRACE_LOG_LINE_LIMIT = 300;
const TRIGGER_TRACE_MAX_READS_PER_POLL = 32;
const FEEDBACK_TRACE_LOG_LINE_LIMIT = 300;
const FEEDBACK_TRACE_MAX_READS_PER_POLL = 32;
const STARTUP_REAPPLY_MIN_SETTLE_MS = 0;
const STARTUP_REAPPLY_RETRY_DELAYS_MS = [250, 650, 1300] as const;
const HOST_PERSONA_TRANSITION_TIMEOUT_MS = 8000;
const HOST_PERSONA_TRANSITION_SETTLE_MS = 0;
const HOST_PERSONA_TRANSITION_REDISCOVERY_POLL_MS = 50;
const HOST_PERSONA_TRANSITION_OPEN_RETRY_MS = 250;
const HOST_PERSONA_RECONNECT_GRACE_MS = 5000;
const HOST_PERSONA_DEFAULT_RENDER_RESTORE_RETRY_MS = 500;
const HOST_PERSONA_DEFAULT_RENDER_RESTORE_GRACE_MS = 4000;
const MIN_IDLE_DISCONNECT_TIMEOUT_MINUTES = 1;
const MAX_IDLE_DISCONNECT_TIMEOUT_MINUTES = 120;
const CONTROLLER_POWER_SAVING_CAP_PERCENT = 60;
const STANDARD_FEEDBACK_GAIN_PERCENT = 200;
const BOOSTED_FEEDBACK_GAIN_PERCENT = 500;
const HAPTICS_STEP = 20;
const SPEAKER_VOLUME_STEP = 10;
const MIC_VOLUME_STEP = 10;
const LIGHTBAR_BRIGHTNESS_STEP = 10;
const TRIGGER_EFFECT_STEP = 10;
const AUDIO_REACTIVE_HAPTICS_FIXED_GAIN_PERCENT = 100;
const AUDIO_REACTIVE_HAPTICS_SUPPRESS_CLASSIC_RUMBLE_MODE_FLAG = 0x80;
const SONY_VENDOR_ID = 0x054c;
const DUALSENSE_PRODUCT_IDS = new Set([0x0ce6, 0x0df2]);
const WINDOWS_DEVICE_CLEANUP_RELATIVE_PATH = path.join('tools', 'windows', 'clean-ds5bridge-devices.ps1');
const POWERSHELL_ERROR_OUTPUT_MAX_CHARS = 8192;
const CLEANUP_LOG_EXCERPT_MAX_CHARS = 3000;
type BridgeDiagnosticsWithoutAudioLog = Omit<
  BridgeDiagnostics,
  | 'audioDebugLogPath'
  | 'audioDebugLogLines'
  | 'audioDebugDroppedCount'
  | 'audioDebugStats'
  | 'triggerTraceLines'
  | 'triggerTraceDroppedCount'
  | 'feedbackTraceLines'
  | 'feedbackTraceDroppedCount'
  | 'audioStatus'
>;

type CommandOptions = {
  expectSettingsRevisionChange?: boolean;
  throwOnCommandError?: boolean;
  extraPayload?: ArrayLike<number>;
  allowAckTransportLoss?: boolean;
  allowProtocolMismatch?: boolean;
};

type HostPersonaTransitionState = HostPersonaTransition & {
  settlingUntil: number | null;
  reconnectingUntil: number;
  completedAt: number | null;
};

type HostPersonaDefaultRenderRestore = {
  to: HostPersonaMode;
  deadlineAt: number;
  nextAttemptAt: number;
  attempts: number;
  inFlight: boolean;
};

export type BridgeToast = {
  title: string;
  body: string;
};

const PRESET_SETTINGS: Record<Exclude<BridgePresetId, 'custom'>, Partial<CompanionSettings>> = {
  balanced: {
    selectedPresetId: 'balanced',
    hapticsEnabled: true,
    hapticsGainPercent: 100,
    feedbackBoostEnabled: false,
    classicRumbleEnabled: true,
    classicRumbleGainPercent: 100,
    speakerEnabled: true,
    speakerVolumePercent: 100,
    adaptiveTriggersEnabled: true,
    triggerEffectIntensityPercent: 100,
    lightbarEnabled: true,
    lightbarColor: '#0000ff',
    lightbarBrightnessPercent: 100,
    lightbarOverrideEnabled: false,
    muteButtonMode: 'normal',
    muteKeyboardBehavior: 'tap'
  },
  quiet: {
    selectedPresetId: 'quiet',
    hapticsEnabled: false,
    classicRumbleEnabled: false,
    speakerEnabled: false,
    adaptiveTriggersEnabled: false,
    lightbarEnabled: true,
    lightbarBrightnessPercent: 35,
    lightbarOverrideEnabled: true,
    muteButtonMode: 'quiet'
  },
  'no-speaker': {
    selectedPresetId: 'no-speaker',
    speakerEnabled: false
  },
  'no-haptics': {
    selectedPresetId: 'no-haptics',
    hapticsEnabled: false,
    classicRumbleEnabled: false
  },
  'no-triggers': {
    selectedPresetId: 'no-triggers',
    adaptiveTriggersEnabled: false,
    triggerEffectIntensityPercent: 0
  },
  'lights-off': {
    selectedPresetId: 'lights-off',
    lightbarEnabled: false,
    lightbarOverrideEnabled: true
  }
};

function isDualSenseDevice(device: HidDeviceSummary): boolean {
  return device.vendorId === SONY_VENDOR_ID
    && DUALSENSE_PRODUCT_IDS.has(device.productId ?? 0)
    && /DualSense/i.test(device.product ?? '');
}

function parseFirmwareVersion(version: string): { major: number; minor: number; patch: number } | null {
  const [major = 0, minor = 0, patch = 0] = version.split('.').map((part) => Number.parseInt(part, 10));
  if (![major, minor, patch].every(Number.isFinite)) {
    return null;
  }
  return { major, minor, patch };
}

function compareFirmwareVersions(left: string, right: string): number | null {
  const leftVersion = parseFirmwareVersion(left);
  const rightVersion = parseFirmwareVersion(right);
  if (!leftVersion || !rightVersion) {
    return null;
  }
  for (const part of ['major', 'minor', 'patch'] as const) {
    const delta = leftVersion[part] - rightVersion[part];
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function isSupportedFirmwareVersion(version: string): boolean {
  const comparison = compareFirmwareVersions(version, MIN_SUPPORTED_FIRMWARE_VERSION);
  return comparison !== null && comparison >= 0;
}

function firmwareUpdateAvailable(
  version: string
): BridgeDiagnostics['firmwareUpdateAvailable'] {
  const comparison = compareFirmwareVersions(version, BUNDLED_FIRMWARE_VERSION);
  if (comparison === null || comparison >= 0) {
    return null;
  }
  return {
    currentVersion: version,
    availableVersion: BUNDLED_FIRMWARE_VERSION
  };
}

function isBridgeTransportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /WinUSB bridge (?:GET_REPORT|SET_REPORT|sendFeatureReport|getFeatureReport) failed/i.test(message)
    || /WinUSB bridge helper request timed out/i.test(message)
    || /A device attached to the system is not functioning/i.test(message)
    || /No companion bridge is connected/i.test(message);
}

function isProtocolMismatch(error: unknown): error is ProtocolError {
  return error instanceof ProtocolError && error.code === 'bad-version';
}

function emptyDiagnostics(rawDevices: HidDeviceSummary[]): BridgeDiagnostics {
  return {
    hidPath: null,
    protocolVersion: null,
    uptimeSeconds: null,
    settingsRevision: null,
    lastAck: null,
    lastError: null,
    firmwareUpdateAvailable: null,
    lastPollAt: null,
    rawDevices,
    audioDebugLogPath: null,
    audioDebugLogLines: [],
    audioDebugDroppedCount: 0,
    audioDebugStats: null,
    triggerTraceLines: [],
    triggerTraceDroppedCount: 0,
    feedbackTraceLines: [],
    feedbackTraceDroppedCount: 0,
    audioStatus: null
  };
}

function parseHexColor(color: string): { hex: string; red: number; green: number; blue: number } {
  const hex = /^#[0-9a-fA-F]{6}$/.test(color) ? color.toLowerCase() : '#0000ff';
  return {
    hex,
    red: Number.parseInt(hex.slice(1, 3), 16),
    green: Number.parseInt(hex.slice(3, 5), 16),
    blue: Number.parseInt(hex.slice(5, 7), 16)
  };
}

function muteButtonModeValue(mode: MuteButtonMode): number {
  if (mode === 'keyboard') return 1;
  if (mode === 'quiet') return 2;
  if (mode === 'chord') return 3;
  return 0;
}

function encodeMuteKeyboardOptions(
  modifiers: number,
  behavior: MuteKeyboardBehavior,
  chordStarterEnabled = false
): number {
  const modifierBits = Math.max(0, Math.min(MUTE_KEYBOARD_MODIFIER_MASK, Math.round(modifiers)));
  return modifierBits
    | (behavior === 'hold' ? MUTE_KEYBOARD_HOLD_FLAG : 0)
    | (chordStarterEnabled ? MUTE_KEYBOARD_CHORD_STARTER_FLAG : 0);
}

function triggerTestModeValue(mode: TriggerTestMode): number {
  if (mode === 'weapon') return 1;
  if (mode === 'vibration') return 2;
  return 0;
}

function triggerTestTargetValue(target: TriggerTestTarget): number {
  if (target === 'l2') return 1;
  if (target === 'r2') return 2;
  return 0;
}

function audioReactiveHapticsModeValue(mode: AudioReactiveHapticsMode): number {
  return mode === 'replace' ? 1 : 0;
}

function audioReactiveHapticsBassFocusValue(focus: AudioReactiveHapticsBassFocus): number {
  switch (focus) {
    case 'deep':
      return 0;
    case 'punchy':
      return 2;
    case 'wide':
      return 3;
    case 'balanced':
    default:
      return 1;
  }
}

function audioReactiveHapticsResponseValue(response: AudioReactiveHapticsResponse): number {
  switch (response) {
    case 'subtle':
      return 0;
    case 'strong':
      return 2;
    case 'balanced':
    default:
      return 1;
  }
}

function audioReactiveHapticsAttackValue(attack: AudioReactiveHapticsAttack): number {
  switch (attack) {
    case 'soft':
      return 0;
    case 'fast':
      return 2;
    case 'sharp':
      return 3;
    case 'balanced':
    default:
      return 1;
  }
}

function audioReactiveHapticsReleaseValue(release: AudioReactiveHapticsRelease): number {
  switch (release) {
    case 'tight':
      return 0;
    case 'smooth':
      return 2;
    case 'long':
      return 3;
    case 'balanced':
    default:
      return 1;
  }
}

function normalizeTriggerTestMode(mode: unknown): TriggerTestMode {
  if (mode === 'weapon' || mode === 'vibration') {
    return mode;
  }
  return 'feedback';
}

function normalizeTriggerTestTarget(target: unknown): TriggerTestTarget {
  if (target === 'l2' || target === 'r2') {
    return target;
  }
  return 'both';
}

function normalizePercent(value: unknown): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue)
    ? Math.max(0, Math.min(100, Math.round(numericValue)))
    : 0;
}

function normalizeAdaptiveTriggerPreviewEffect(
  effect: Partial<AdaptiveTriggerPreviewEffect> | null | undefined
): AdaptiveTriggerPreviewEffect {
  const candidate = effect ?? {};
  return {
    mode: normalizeTriggerTestMode(candidate.mode),
    target: normalizeTriggerTestTarget(candidate.target),
    startPercent: normalizePercent(candidate.startPercent),
    wallPercent: normalizePercent(candidate.wallPercent),
    forcePercent: normalizePercent(candidate.forcePercent)
  };
}

function normalizePollingRateMode(mode: PollingRateMode): PollingRateMode {
  if (mode === '250' || mode === '500') {
    return mode;
  }
  return '1000';
}

function normalizeAudioReactiveHapticsMode(mode: unknown): AudioReactiveHapticsMode {
  return mode === 'replace' ? 'replace' : 'mix';
}

function normalizeAudioReactiveHapticsSource(source: unknown): AudioReactiveHapticsSource {
  if (source === 'controller-audio' || source === 'system-audio') {
    return source;
  }
  if (!source || typeof source !== 'object') {
    return 'system-audio';
  }
  const candidate = source as Partial<Extract<AudioReactiveHapticsSource, { kind: 'app-session' }>>;
  if (candidate.kind !== 'app-session') {
    return 'system-audio';
  }
  const processId = Number.isFinite(candidate.processId)
    ? Math.max(0, Math.round(candidate.processId!))
    : 0;
  const displayName = normalizeOptionalString(candidate.displayName);
  const executableName = normalizeOptionalString(candidate.executableName);
  const processPath = normalizeOptionalString(candidate.processPath);
  if (processId <= 0 && !processPath && !executableName) {
    return 'system-audio';
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

function audioReactiveHapticsSourceKey(source: AudioReactiveHapticsSource): string {
  if (source === 'controller-audio' || source === 'system-audio') {
    return source;
  }
  if (source.processPath) {
    return `app-path:${source.processPath.toLowerCase()}`;
  }
  if (source.executableName) {
    return `app-exe:${source.executableName.toLowerCase()}`;
  }
  return `app-pid:${Math.max(0, Math.round(source.processId))}`;
}

function cloneAudioHapticsSessions(sessions: AudioHapticsSession[]): AudioHapticsSession[] {
  return sessions.map((session) => ({ ...session }));
}

function normalizeAudioReactiveHapticsBassFocus(focus: unknown): AudioReactiveHapticsBassFocus {
  if (focus === 'deep' || focus === 'punchy' || focus === 'wide') {
    return focus;
  }
  return 'balanced';
}

function normalizeAudioReactiveHapticsResponse(response: unknown): AudioReactiveHapticsResponse {
  if (response === 'subtle' || response === 'strong') {
    return response;
  }
  return 'balanced';
}

function normalizeAudioReactiveHapticsAttack(attack: unknown): AudioReactiveHapticsAttack {
  if (attack === 'soft' || attack === 'fast' || attack === 'sharp') {
    return attack;
  }
  return 'balanced';
}

function normalizeAudioReactiveHapticsRelease(release: unknown): AudioReactiveHapticsRelease {
  if (release === 'tight' || release === 'smooth' || release === 'long') {
    return release;
  }
  return 'balanced';
}

function normalizeAudioReactiveHapticsConfig(
  config: Partial<AudioReactiveHapticsConfig>,
  settings: CompanionSettings
): AudioReactiveHapticsConfig {
  return {
    enabled: typeof config.enabled === 'boolean' ? config.enabled : settings.audioReactiveHapticsEnabled,
    source: normalizeAudioReactiveHapticsSource(config.source ?? settings.audioReactiveHapticsSource),
    mode: normalizeAudioReactiveHapticsMode(config.mode ?? settings.audioReactiveHapticsMode),
    gainPercent: Number.isFinite(config.gainPercent ?? settings.audioReactiveHapticsGainPercent)
      ? Math.max(0, Math.min(200, Math.round(config.gainPercent ?? settings.audioReactiveHapticsGainPercent)))
      : AUDIO_REACTIVE_HAPTICS_FIXED_GAIN_PERCENT,
    bassFocus: normalizeAudioReactiveHapticsBassFocus(config.bassFocus ?? settings.audioReactiveHapticsBassFocus),
    response: normalizeAudioReactiveHapticsResponse(config.response ?? settings.audioReactiveHapticsResponse),
    attack: normalizeAudioReactiveHapticsAttack(config.attack ?? settings.audioReactiveHapticsAttack),
    release: normalizeAudioReactiveHapticsRelease(config.release ?? settings.audioReactiveHapticsRelease)
  };
}

function normalizeIdleDisconnectTimeoutMinutes(minutes: number): number {
  return Math.max(
    MIN_IDLE_DISCONNECT_TIMEOUT_MINUTES,
    Math.min(MAX_IDLE_DISCONNECT_TIMEOUT_MINUTES, Math.round(minutes))
  );
}

function customSettingUpdate(update: Partial<CompanionSettings>): Partial<CompanionSettings> {
  return { ...update, selectedPresetId: 'custom' };
}

function limitedByte(value: number, suffix = '+'): string {
  return value === 255 ? `${value}${suffix}` : String(value);
}

function hexByte(value: number): string {
  return `0x${value.toString(16).padStart(2, '0')}`;
}

function scaled100Us(value: number): string {
  return value === 255 ? '25500+us' : `${value * 100}us`;
}

function formatMicDebugEvent(prefix: string, args: number[]): string {
  const [type, arg1, arg2, arg3, arg4] = args;
  switch (type) {
    case 0:
      return `${prefix} [HostPico] MIC decode-fail code=${arg1} dropped=${arg2}`;
    case 1:
      return `${prefix} [HostPico] MIC usb-short written=${arg1} target=${arg2} dropped=${arg3}`;
    case 2:
      return `${prefix} [HostPico] MIC packet rx=${arg1} raw_fifo=${arg2}`;
    case 3:
      return `${prefix} [HostPico] MIC playout-underrun usb_fifo=${arg1} decoded_fifo=${arg2} dropped=${arg3}`;
    case 4:
      return `${prefix} [HostPico] MIC raw-fifo-overflow raw_fifo=${arg1} dropped=${arg2}`;
    case 5:
      return `${prefix} [HostPico] MIC raw-fifo-add-fail raw_fifo=${arg1} dropped=${arg2}`;
    case 6:
      return `${prefix} [HostPico] MIC short-packet len=${arg1} dropped=${arg2}`;
    case 7:
      return `${prefix} [HostPico] MIC decoded-fifo-overflow decoded_fifo=${arg1} dropped=${arg2}`;
    case 8:
      return `${prefix} [HostPico] MIC decoded-fifo-add-fail decoded_fifo=${arg1} dropped=${arg2}`;
    case 9:
      return `${prefix} [HostPico] MIC plc-fail code=${arg1} dropped=${arg2}`;
    case 10:
      return `${prefix} [HostPico] MIC plc decoded_fifo=${arg1} samples=${arg2}`;
    default:
      return `${prefix} [HostPico] MIC type=${type} arg1=${arg1} arg2=${arg2} arg3=${arg3} arg4=${arg4}`;
  }
}

type InputShortcutEvent =
  | { kind: 'shortcut'; event: ShortcutEvent }
  | { kind: 'chord-function'; slot: number };

function parseShortcutEvent(data: Buffer | number[]): InputShortcutEvent | null {
  const report = Array.from(data);
  const event = report[0] === REPORT_ID.INPUT ? report[1] : report[0];
  if (event >= CHORD_FUNCTION_EVENT_BASE && event < CHORD_FUNCTION_EVENT_BASE + MAX_CHORD_ASSIGNMENTS) {
    return {
      kind: 'chord-function',
      slot: event - CHORD_FUNCTION_EVENT_BASE
    };
  }
  switch (event) {
    case SHORTCUT_EVENT.CONTROLLER_VOLUME_DOWN:
    case SHORTCUT_EVENT.CONTROLLER_VOLUME_UP:
    case SHORTCUT_EVENT.SLEEP_CONTROLLER:
    case SHORTCUT_EVENT.MIC_MUTE_ON:
    case SHORTCUT_EVENT.MIC_MUTE_OFF:
      return { kind: 'shortcut', event };
    default:
      return null;
  }
}

const VIRTUAL_KEY_CODES: Record<string, number> = {
  BACKSPACE: 0x08,
  TAB: 0x09,
  ENTER: 0x0d,
  RETURN: 0x0d,
  SHIFT: 0x10,
  CTRL: 0x11,
  CONTROL: 0x11,
  ALT: 0x12,
  PAUSE: 0x13,
  CAPSLOCK: 0x14,
  ESC: 0x1b,
  ESCAPE: 0x1b,
  SPACE: 0x20,
  PAGEUP: 0x21,
  PAGEDOWN: 0x22,
  END: 0x23,
  HOME: 0x24,
  LEFT: 0x25,
  UP: 0x26,
  RIGHT: 0x27,
  DOWN: 0x28,
  PRINTSCREEN: 0x2c,
  PRTSC: 0x2c,
  PRTSCN: 0x2c,
  SNAPSHOT: 0x2c,
  INSERT: 0x2d,
  DELETE: 0x2e,
  WIN: 0x5b,
  WINDOWS: 0x5b,
  META: 0x5b,
  COMMAND: 0x5b,
  MENU: 0x5d,
  NUMLOCK: 0x90,
  SCROLLLOCK: 0x91,
  PLAYPAUSE: 0xb3,
  MEDIAPLAYPAUSE: 0xb3,
  NEXTTRACK: 0xb0,
  MEDIANEXTTRACK: 0xb0,
  PREVIOUSTRACK: 0xb1,
  MEDIAPREVIOUSTRACK: 0xb1,
  VOLUMEMUTE: 0xad,
  VOLUMEUP: 0xaf,
  VOLUMEDOWN: 0xae
};

for (let index = 0; index < 26; index += 1) {
  VIRTUAL_KEY_CODES[String.fromCharCode(65 + index)] = 0x41 + index;
}
for (let index = 0; index <= 9; index += 1) {
  VIRTUAL_KEY_CODES[String(index)] = 0x30 + index;
  VIRTUAL_KEY_CODES[`NUMPAD${index}`] = 0x60 + index;
}
for (let index = 1; index <= 24; index += 1) {
  VIRTUAL_KEY_CODES[`F${index}`] = 0x6f + index;
}

const MEDIA_ACTION_KEY_CODES: Record<Extract<ChordFunction, { type: 'media' }>['action'], number> = {
  'play-pause': 0xb3,
  'next-track': 0xb0,
  'previous-track': 0xb1,
  mute: 0xad,
  'volume-up': 0xaf,
  'volume-down': 0xae
};

function normalizeVirtualKeyName(key: string): string {
  return key.trim().replace(/\s+/g, '').replace(/-/g, '').toUpperCase();
}

function virtualKeyCodeFor(key: string): number | null {
  const normalized = normalizeVirtualKeyName(key);
  return VIRTUAL_KEY_CODES[normalized] ?? null;
}

async function sendVirtualKeySequence(codes: number[]): Promise<void> {
  const normalized = codes
    .map((code) => Math.max(0, Math.min(0xff, Math.round(code))))
    .filter((code) => Number.isFinite(code) && code > 0);
  if (normalized.length === 0) {
    return;
  }
  const downCodes = normalized.join(',');
  const upCodes = [...normalized].reverse().join(',');
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "Add-Type -Namespace DS5Bridge -Name KeyboardInput -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);'",
    `foreach ($vk in @(${downCodes})) { [DS5Bridge.KeyboardInput]::keybd_event([byte]$vk, 0, 0, [UIntPtr]::Zero) }`,
    'Start-Sleep -Milliseconds 20',
    `foreach ($vk in @(${upCodes})) { [DS5Bridge.KeyboardInput]::keybd_event([byte]$vk, 0, 2, [UIntPtr]::Zero) }`
  ].join('; ');
  await new Promise<void>((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      script
    ], {
      windowsHide: true
    });
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Shortcut key injection failed${stderr ? `: ${stderr.trim()}` : ''}`));
      }
    });
  });
}

function formatUsbDebugEvent(prefix: string, args: number[]): string {
  const [type, arg1, arg2, arg3, arg4] = args;
  switch (type) {
    case 1:
      return `${prefix} [USB] AUDIO_SET_INTERFACE itf=${arg1} alt=${arg2} speakerStreaming=${arg3 === 1 ? 'true' : 'false'} micStreaming=${arg4 === 1 ? 'true' : 'false'}`;
    case 2:
      return `${prefix} [USB] AUDIO_GET entity=${hexByte(arg1)} control=${hexByte(arg2)} request=${hexByte(arg3)} len=${arg4}`;
    case 3:
      return `${prefix} [USB] AUDIO_SET entity=${hexByte(arg1)} control=${hexByte(arg2)} request=${hexByte(arg3)} len=${arg4}`;
    case 4:
      return `${prefix} [USB] AUDIO_DISCARD reads=${arg1} maxReads=${arg2} runtime=${arg3} stillAvailable=${arg4 === 1 ? 'true' : 'false'}`;
    case 8:
      return `${prefix} [USB] BULK_PCM_PARTIAL headerWritten=${arg1} payloadWritten=${arg2} payloadBytes=${arg3}`;
    case 9:
      return `${prefix} [USB] BULK_PCM_DROP countLow=${arg1} available=${arg2} packetBytes=${arg3} sequenceLow=${arg4}`;
    case 10:
      return `${prefix} [USB] BULK_PCM_QUEUE_DROP countLow=${arg1} queue=${arg2}/${arg3} sequenceLow=${arg4}`;
    default:
      return `${prefix} [USB] type=${type} arg1=${arg1} arg2=${arg2} arg3=${arg3} arg4=${arg4}`;
  }
}

function normalizeHostPersonaMode(mode: HostPersonaMode): HostPersonaMode {
  if (mode === 'xbox' || mode === 'ds4') {
    return mode;
  }
  return 'dualsense';
}

function hostPersonaModeLabel(mode: HostPersonaMode): string {
  if (mode === 'ds4') return 'DualShock 4';
  return mode === 'xbox' ? 'Xbox Controller' : 'DualSense';
}

function formatHidDebugEvent(prefix: string, args: number[]): string {
  const [type, reportId, reportType, len, firstByte] = args;
  switch (type) {
    case 1:
      return `${prefix} [HID] GET_REPORT report=${hexByte(reportId)} type=${reportType} len=${limitedByte(len)}`;
    case 2:
      return `${prefix} [HID] SET_REPORT report=${hexByte(reportId)} type=${reportType} len=${limitedByte(len)} first=${hexByte(firstByte)}`;
    case 3:
      return `${prefix} [HID] IN_REPORT report=${hexByte(reportId)} len=${limitedByte(len)} buttonByte=${hexByte(firstByte)}`;
    default:
      return `${prefix} [HID] type=${type} report=${hexByte(reportId)} reportType=${reportType} len=${limitedByte(len)} first=${hexByte(firstByte)}`;
  }
}

function formatBtDebugEvent(prefix: string, args: number[]): string {
  const [type, arg1, arg2, arg3, arg4] = args;
  switch (type) {
    case 1:
      return `${prefix} [BT] AUDIO_LATE age=${scaled100Us(arg1)} gap=${scaled100Us(arg2)} nonAudioBefore=${arg3} audioQueueAfter=${arg4}`;
    case 2:
      return `${prefix} [BT] NON_AUDIO_WITH_AUDIO_QUEUED reason=${arg1} queuedAudioAge=${scaled100Us(arg2)} criticalQ=${arg3} statePending=${arg4 === 1 ? 'true' : 'false'}`;
    case 3:
      return `${prefix} [BT] CONTROL_SEND op=${hexByte(arg1)} report=${hexByte(arg2)} age=${scaled100Us(arg3)} controlQ=${arg4}`;
    case 4:
      return `${prefix} [BT] CONTROL_SUPPRESSED op=${hexByte(arg1)} report=${hexByte(arg2)} cached=${arg3 === 1 ? 'true' : 'false'}`;
    default:
      return `${prefix} [BT] type=${type} arg1=${arg1} arg2=${arg2} arg3=${arg3} arg4=${arg4}`;
  }
}

function routeSourceLabel(source: number): string {
  switch (source) {
    case 0:
      return 'persistent';
    case 1:
      return 'headset-change';
    case 2:
      return 'route-primer';
    default:
      return String(source);
  }
}

function formatAudioDebugEvent(event: AudioDebugEventPayload): string {
  const [arg0, arg1, arg2, arg3, arg4] = event.args;
  const prefix = `#${event.sequence} t=${event.timeUs}us`;
  switch (event.eventCode) {
    case AUDIO_DEBUG_EVENT.AUDIO_START:
      return `${prefix} [Audio] START: local audio audio_fifo=${arg0} opus_ready=${arg1} frames=${arg2} packet=${arg3} reportSeq=${arg4}`;
    case AUDIO_DEBUG_EVENT.RESET_GAP:
      return `${prefix} [Audio] RESET: gap detected audio_fifo=${arg0} opus_ready=${arg1} gap_ms=${limitedByte(arg2)} packet=${arg3} skip=${arg4}`;
    case AUDIO_DEBUG_EVENT.CORE1_RESET:
      return `${prefix} [Audio] CORE1: reset encoder opus_fifo_before=${arg0} opus_fifo_after=${arg1} reset_ran=${arg2 === 1 ? 'true' : 'false'} audio_fifo=${arg3}`;
    case AUDIO_DEBUG_EVENT.SKIP_OPUS_PACKET:
      return `${prefix} [Audio] SKIP opus pkt skip_before=${arg0} skip_after=${arg1} opus_fifo=${arg2} packet=${arg3} reportSeq=${arg4}`;
    case AUDIO_DEBUG_EVENT.SEND_SPEAKER_PACKET:
      return `${prefix} [Audio] SEND: speaker opus included audio_fifo=${arg0} opus_ready=${arg1} packet=${arg2} reportSeq=${arg3} headset=${(arg4 & 0x01) !== 0 ? 'true' : 'false'} silence=${(arg4 & 0x02) !== 0 ? 'true' : 'false'}`;
    case AUDIO_DEBUG_EVENT.NO_OPUS_PACKET:
      return `${prefix} [Audio] SUPPRESS: no opus packet audio_fifo=${arg0} opus_ready=${arg1} packet=${arg2} reportSeq=${arg3}`;
    case AUDIO_DEBUG_EVENT.AUDIO_FIFO_DROP:
      return `${prefix} [Audio] DROP: audio_fifo full audio_fifo=${arg0} opus_ready=${arg1} packet=${arg2} reportSeq=${arg3}`;
    case AUDIO_DEBUG_EVENT.AUDIO_FIFO_ADD_FAIL:
      return `${prefix} [Audio] ERROR: audio_fifo add failed audio_fifo=${arg0} opus_ready=${arg1} packet=${arg2} reportSeq=${arg3}`;
    case AUDIO_DEBUG_EVENT.OPUS_FIFO_DROP:
      return `${prefix} [Audio] DROP: opus_fifo full audio_fifo=${arg0} opus_fifo=${arg1}`;
    case AUDIO_DEBUG_EVENT.OPUS_FIFO_ADD_FAIL:
      return `${prefix} [Audio] ERROR: opus_fifo add failed audio_fifo=${arg0} opus_fifo=${arg1}`;
    case AUDIO_DEBUG_EVENT.TEST_HAPTICS_START:
      return `${prefix} [Audio] TEST HAPTICS: start audio_fifo=${arg0} opus_ready=${arg1} haptics_gain=${arg2}%`;
    case AUDIO_DEBUG_EVENT.TEST_HAPTICS_STOP:
      return `${prefix} [Audio] TEST HAPTICS: stop reason=${arg0 === 1 ? 'complete' : 'disconnected'} audio_fifo=${arg1} opus_ready=${arg2}`;
    case AUDIO_DEBUG_EVENT.SPEAKER_ROUTE:
      return `${prefix} [Audio] ROUTE: speaker ${arg0 === 1 ? 'enabled' : 'disabled'} volume=${arg1}% quiet=${arg2 === 1 ? 'true' : 'false'} headset=${arg3 === 1 ? 'true' : 'false'} source=${routeSourceLabel(arg4)}`;
    case AUDIO_DEBUG_EVENT.QUIET_MODE:
      return `${prefix} [Audio] QUIET: ${arg0 === 1 ? 'enabled' : 'disabled'} audio_fifo=${arg1} opus_fifo=${arg2}`;
    case AUDIO_DEBUG_EVENT.SILENCE_PREROLL:
      return `${prefix} [Audio] PREROLL: encoded silence requested=${arg0} queued=${arg1} opus_fifo=${arg2} skip=${arg3}`;
    case AUDIO_DEBUG_EVENT.USB_SILENCE_TAIL:
      return `${prefix} [Audio] TAIL: forwarding USB silence frames=${arg0} audio_fifo=${arg1} opus_ready=${arg2} packet=${arg3} reportSeq=${arg4}`;
    case AUDIO_DEBUG_EVENT.MIC_PACKET:
      return formatMicDebugEvent(prefix, event.args);
    case AUDIO_DEBUG_EVENT.USB_EVENT:
      return formatUsbDebugEvent(prefix, event.args);
    case AUDIO_DEBUG_EVENT.HID_EVENT:
      return formatHidDebugEvent(prefix, event.args);
    case AUDIO_DEBUG_EVENT.BT_EVENT:
      return formatBtDebugEvent(prefix, event.args);
    case AUDIO_DEBUG_EVENT.CPU_LOAD:
      return `${prefix} [CPU] core1Busy=${arg0}% core1Speaker=${arg1}% core1Mic=${arg2}% audioLoopMax=${scaled100Us(arg3)} audioLoopGapMax=${scaled100Us(arg4)}`;
    default:
      return `${prefix} [Audio] UNKNOWN code=${event.eventCode} args=${event.args.join(',')}`;
  }
}

function formatAudioStats(stats: AudioDebugStatsPayload): string {
  return [
    '[AudioStats]',
    `version=${stats.statsVersion}`,
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
  ].join(' ');
}

function triggerTraceStageLabel(stage: number): string {
  switch (stage) {
    case 1:
      return 'HOST';
    case 2:
      return 'BRIDGE-IN';
    case 3:
      return 'BRIDGE-OUT';
    case 4:
      return 'BT';
    case 5:
      return 'DROP';
    default:
      return `stage-${stage}`;
  }
}

function outputDecisionLabel(decision: number): string {
  switch (decision) {
    case 0:
      return 'raw';
    case 1:
      return 'critical-direct';
    case 2:
      return 'audio';
    case 3:
      return 'state-only';
    case 4:
      return 'critical-flags';
    case 5:
      return 'critical-payload';
    case 6:
      return 'noop';
    default:
      return String(decision);
  }
}

function hexBytes(values: number[]): string {
  return values.map(hexByte).join(' ');
}

function formatTriggerTraceEvent(event: TriggerTraceEventPayload): string {
  return [
    `#${event.sequence}`,
    `t=${event.timeMs}ms`,
    triggerTraceStageLabel(event.stage),
    `report=${hexByte(event.reportId)}`,
    `len=${limitedByte(event.length)}`,
    `seq=${hexByte(event.sequenceTag)}`,
    `flags=${hexByte(event.flag0)}/${hexByte(event.flag1)}/${hexByte(event.flag2)}`,
    `power=${hexByte(event.motorPower)}`,
    `decision=${outputDecisionLabel(event.decision)}`,
    `R=[${hexBytes(event.rightTrigger)}]`,
    `L=[${hexBytes(event.leftTrigger)}]`
  ].join(' ');
}

function feedbackTraceStageLabel(stage: number): string {
  switch (stage) {
    case 1:
      return 'HOST';
    case 2:
      return 'BRIDGE-IN';
    case 3:
      return 'BRIDGE-OUT';
    case 4:
      return 'BT';
    case 5:
      return 'DROP';
    case 6:
      return 'RESERVED-6';
    case 7:
      return 'RESERVED-7';
    case 8:
      return 'AUDIO-ENQUEUE';
    case 9:
      return 'AUDIO-DROP';
    case 10:
      return 'LOCAL-AUDIO';
    default:
      return `stage-${stage}`;
  }
}

function outputTraceRouteLabels(flags: number): string {
  const labels: string[] = [];
  if ((flags & 0x01) !== 0) {
    labels.push('state-pending');
  }
  if ((flags & 0x02) !== 0) {
    labels.push('protected');
  }
  if ((flags & 0x04) !== 0) {
    labels.push('audio-recent');
  }
  if ((flags & 0x08) !== 0) {
    labels.push('route-primed');
  }
  if ((flags & 0x10) !== 0) {
    labels.push('usb-speaker');
  }
  if ((flags & 0x20) !== 0) {
    labels.push('classic-active');
  }
  if ((flags & 0x40) !== 0) {
    labels.push('send-audio');
  }
  if ((flags & 0x80) !== 0) {
    labels.push('send-output');
  }
  return labels.length === 0 ? '-' : labels.join(',');
}

function outputTraceTransformLabels(flags: number): string {
  const labels: string[] = [];
  if ((flags & 0x01) !== 0) {
    labels.push('strip-zero-rumble');
  }
  if ((flags & 0x02) !== 0) {
    labels.push('split-state');
  }
  if ((flags & 0x04) !== 0) {
    labels.push('protected');
  }
  if ((flags & 0x08) !== 0) {
    labels.push('classic-rumble');
  }
  if ((flags & 0x10) !== 0) {
    labels.push('feedback-state');
  }
  if ((flags & 0x20) !== 0) {
    labels.push('state');
  }
  return labels.length === 0 ? '-' : labels.join(',');
}

function feedbackTraceDetailFields(event: FeedbackTraceEventPayload): string[] {
  const fields = [`detail=${event.detail0}/${event.detail1}/${event.detail2}/${event.detail3}`];
  if (![2, 3, 4, 5, 8, 9].includes(event.stage)) {
    return fields;
  }

  fields.push(`q=C${event.detail0}/A${event.detail1}`);
  fields.push(`route=${outputTraceRouteLabels(event.detail2)}`);
  if (event.stage === 3 || event.stage === 5) {
    fields.push(`xf=${outputTraceTransformLabels(event.detail3)}`);
  } else if (event.stage === 4 || event.stage === 9) {
    fields.push(`age=${event.detail3}ms`);
  }
  return fields;
}

function formatFeedbackTraceEvent(event: FeedbackTraceEventPayload): string {
  return [
    `#${event.sequence}`,
    `t=${event.timeMs}ms`,
    feedbackTraceStageLabel(event.stage),
    `report=${hexByte(event.reportId)}`,
    `len=${limitedByte(event.length)}`,
    `seq=${hexByte(event.sequenceTag)}`,
    `flags=${hexByte(event.flag0)}/${hexByte(event.flag1)}/${hexByte(event.flag2)}`,
    `motors=R${hexByte(event.motorRight)} L${hexByte(event.motorLeft)}`,
    `haptic=peak${event.hapticPeak} mean${event.hapticMean} nz${event.hapticNonZero}`,
    `decision=${outputDecisionLabel(event.decision)}`,
    ...feedbackTraceDetailFields(event)
  ].join(' ');
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

function quotePowerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteWindowsCommandArgument(value: string): string {
  if (!/[\s"]/.test(value)) {
    return value;
  }
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/\\+$/g, '$&$&')}"`;
}

function createWindowsDeviceCleanupLogPath(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(tmpdir(), `ds5-bridge-device-cleanup-${process.pid}-${stamp}.log`);
}

function createWindowsDeviceCleanupRunnerPath(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(tmpdir(), `ds5-bridge-device-cleanup-runner-${process.pid}-${stamp}.ps1`);
}

function readCleanupLogExcerpt(logPath: string): string {
  try {
    if (!existsSync(logPath)) {
      return '';
    }
    const text = readFileSync(logPath, 'utf8').trim();
    if (text.length <= CLEANUP_LOG_EXCERPT_MAX_CHARS) {
      return text;
    }
    return text.slice(-CLEANUP_LOG_EXCERPT_MAX_CHARS);
  } catch {
    return '';
  }
}

function buildWindowsDeviceCleanupRunnerScript(scriptPath: string, logPath: string): string {
  const quotedScriptPath = quotePowerShellString(scriptPath);
  const quotedLogPath = quotePowerShellString(logPath);
  return [
    "$ErrorActionPreference = 'Stop'",
    `$logPath = ${quotedLogPath}`,
    `$scriptPath = ${quotedScriptPath}`,
    'try {',
    "  \"DS5 Bridge emergency cleanup started: $(Get-Date -Format o)\" | Out-File -LiteralPath $logPath -Encoding UTF8",
    '  & $scriptPath -Apply -IncludeBluetooth -RepeatUntilClean -Force -Confirm:$false *>&1 | Tee-Object -FilePath $logPath -Append',
    '  $exitCode = if ($null -eq $global:LASTEXITCODE) { 0 } else { $global:LASTEXITCODE }',
    "  \"DS5 Bridge emergency cleanup exited: $exitCode\" | Out-File -LiteralPath $logPath -Encoding UTF8 -Append",
    '  exit $exitCode',
    '} catch {',
    '  $message = if ($_.Exception) { $_.Exception.Message } else { $_ | Out-String }',
    "  \"ERROR: $message\" | Out-File -LiteralPath $logPath -Encoding UTF8 -Append",
    '  $_ | Out-String | Out-File -LiteralPath $logPath -Encoding UTF8 -Append',
    '  exit 1',
    '}'
  ].join('\r\n');
}

function resolveWindowsDeviceCleanupScriptPath(): string {
  const packagedCandidate = process.resourcesPath
    ? path.join(process.resourcesPath, WINDOWS_DEVICE_CLEANUP_RELATIVE_PATH)
    : null;
  const candidates = [
    packagedCandidate,
    path.resolve(process.cwd(), WINDOWS_DEVICE_CLEANUP_RELATIVE_PATH),
    path.resolve(process.cwd(), '..', WINDOWS_DEVICE_CLEANUP_RELATIVE_PATH),
    path.resolve(__dirname, '..', '..', '..', WINDOWS_DEVICE_CLEANUP_RELATIVE_PATH),
    path.resolve(__dirname, '..', '..', '..', '..', WINDOWS_DEVICE_CLEANUP_RELATIVE_PATH)
  ].filter((candidate): candidate is string => Boolean(candidate));

  const scriptPath = candidates.find((candidate) => existsSync(candidate));
  if (!scriptPath) {
    throw new Error('Windows device cleanup script is missing.');
  }
  return scriptPath;
}

async function runElevatedWindowsDeviceCleanup(scriptPath: string, logPath: string): Promise<void> {
  const runnerPath = createWindowsDeviceCleanupRunnerPath();
  writeFileSync(runnerPath, buildWindowsDeviceCleanupRunnerScript(scriptPath, logPath), 'utf8');
  const cleanupArguments = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    runnerPath
  ].map(quoteWindowsCommandArgument).join(' ');
  const command = [
    "$ErrorActionPreference = 'Stop';",
    `$process = Start-Process -FilePath ${quotePowerShellString('powershell.exe')} -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList ${quotePowerShellString(cleanupArguments)};`,
    'exit $process.ExitCode'
  ].join(' ');

  await new Promise<void>((resolve, reject) => {
    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      command
    ], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    const appendOutput = (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (output.length > POWERSHELL_ERROR_OUTPUT_MAX_CHARS) {
        output = output.slice(-POWERSHELL_ERROR_OUTPUT_MAX_CHARS);
      }
    };
    child.stdout.on('data', appendOutput);
    child.stderr.on('data', appendOutput);
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const logExcerpt = readCleanupLogExcerpt(logPath);
      const details = logExcerpt || output.trim();
      const suffix = details ? `\n\n${details}` : ` See log: ${logPath}. Runner: ${runnerPath}`;
      reject(new Error(`Windows device cleanup failed.${suffix}`));
    });
  });
}

export class BridgeService extends EventEmitter {
  private device: WinUsbCompanionTransport | null = null;
  private devicePath: string | null = null;
  private pollTimer: NodeJS.Timeout | null = null;
  private hostPersonaTransitionPollTimer: NodeJS.Timeout | null = null;
  private pollInFlight = false;
  private pollAgainRequested = false;
  private shortcutPollTimer: NodeJS.Timeout | null = null;
  private shortcutPollInFlight = false;
  private readonly systemAudioHapticsEngine = new SystemAudioHapticsEngine();
  private readonly audioHapticsSessionMonitor = new AudioHapticsSessionMonitor();
  private readonly micKeepaliveEngine = new MicKeepaliveEngine();
  private readonly hidDiscovery = new HidDiscoveryClient();
  private audioHapticsSessionCache: { key: string; expiresAt: number; sessions: AudioHapticsSession[] } | null = null;
  private audioHapticsSessionListInFlight: Promise<AudioHapticsSession[]> | null = null;
  private audioHapticsSessionListInFlightKey: string | null = null;
  private snapshot: BridgeSnapshot;
  private lastEmittedSnapshotSignature: string | null = null;
  private commandSequence = 0;
  private lastUptimeSeconds: number | null = null;
  private sessionKey: string | null = null;
  private sessionPath: string | null = null;
  private reappliedSessionKey: string | null = null;
  private controllerConnectedSince = 0;
  private reapplyAttempt = 0;
  private nextReapplyAt = 0;
  private reapplyActive = false;
  private pollPausedUntil = 0;
  private readonly audioDebugLogPath: string | null = null;
  private audioDebugLogLines: string[] = [];
  private audioDebugDroppedCount = 0;
  private audioDebugStats: AudioDebugStatsPayload | null = null;
  private triggerTraceLines: string[] = [];
  private triggerTraceDroppedCount = 0;
  private triggerTraceSupported: boolean | null = null;
  private feedbackTraceLines: string[] = [];
  private feedbackTraceDroppedCount = 0;
  private feedbackTraceSupported: boolean | null = null;
  private audioStatus: AudioStatusPayload | null = null;
  private incompatibleCompanionProtocolVersion: ReportProtocolVersion | null = null;
  private lastAudioStatsSignature: string | null = null;
  private systemAudioHapticsRetryAt = 0;
  private systemAudioHapticsPassthroughActive = false;
  private commandQueue: Promise<unknown> = Promise.resolve();
  private lastAudioStatusReadAt = 0;
  private lastAudioDebugReadAt = 0;
  private lastTriggerTraceReadAt = 0;
  private lastFeedbackTraceReadAt = 0;
  private hostPersonaTransition: HostPersonaTransitionState | null = null;
  private completedHostPersonaMode: HostPersonaMode | null = null;
  private hostPersonaDefaultRenderRestore: HostPersonaDefaultRenderRestore | null = null;
  private controllerPowerSavingActive: boolean | null = null;
  private previousControllerConnected: boolean | null = null;
  private lowBatteryToastActive = false;
  private shortcutFeaturePollRetryAt = 0;
  private shortcutActionQueue: Promise<void> = Promise.resolve();
  private readonly shortcutActionHandlers: Record<ShortcutEvent, () => Promise<void>> = {
    [SHORTCUT_EVENT.CONTROLLER_VOLUME_DOWN]: () => this.applyControllerVolumeShortcut(-10),
    [SHORTCUT_EVENT.CONTROLLER_VOLUME_UP]: () => this.applyControllerVolumeShortcut(10),
    [SHORTCUT_EVENT.SLEEP_CONTROLLER]: () => this.applySleepShortcut(),
    [SHORTCUT_EVENT.MIC_MUTE_ON]: () => this.applyControllerMicMuteEvent(true),
    [SHORTCUT_EVENT.MIC_MUTE_OFF]: () => this.applyControllerMicMuteEvent(false)
  };

  constructor(private readonly settingsStore: SettingsStore) {
    super();
    this.snapshot = {
      state: 'no-bridge',
      message: 'No bridge detected',
      status: null,
      settings: this.settingsStore.get(),
      diagnostics: this.withAudioDebugDiagnostics(emptyDiagnostics([])),
      personaTransition: null
    };
    this.systemAudioHapticsEngine.on('error', (error: Error) => {
      this.appendAudioDebugLines([`[SystemHaptics] error: ${error.message}`]);
      this.emitSnapshot();
    });
    this.systemAudioHapticsEngine.on('status', (line: string) => {
      if (line) {
        this.appendAudioDebugLines([`[SystemHaptics] ${line}`]);
      }
      void this.handleSystemAudioHapticsStatus(line);
      this.emitSnapshot();
    });
    this.audioHapticsSessionMonitor.on('error', (error: Error) => {
      this.appendAudioDebugLines([`[AudioSessions] error: ${error.message}`]);
      this.emitSnapshot();
    });
    this.audioHapticsSessionMonitor.on('status', (line: string) => {
      if (line) {
        this.appendAudioDebugLines([`[AudioSessions] ${line}`]);
      }
      this.emitSnapshot();
    });
    this.audioHapticsSessionMonitor.on('sessions', () => {
      this.audioHapticsSessionCache = null;
    });
    this.micKeepaliveEngine.on('error', (error: Error) => {
      this.appendAudioDebugLines([`[MicKeepalive] error: ${error.message}`]);
      this.emitSnapshot();
    });
    this.micKeepaliveEngine.on('status', (line: string) => {
      if (line) {
        this.appendAudioDebugLines([`[MicKeepalive] ${line}`]);
      }
      this.emitSnapshot();
    });
  }

  private enqueueShortcutEvent(event: InputShortcutEvent): void {
    this.shortcutActionQueue = this.shortcutActionQueue
      .catch(() => {
        // Keep later shortcut events alive after a failed command.
      })
      .then(() => this.dispatchInputShortcutAction(event));
  }

  private async pollShortcutEvent(): Promise<void> {
    const device = this.device;
    if (!device || Date.now() < this.shortcutFeaturePollRetryAt) {
      return;
    }

    try {
      const event = parseShortcutEvent(await device.getFeatureReport(REPORT_ID.INPUT, REPORT_LENGTH));
      this.shortcutFeaturePollRetryAt = 0;
      if (event !== null) {
        this.enqueueShortcutEvent(event);
      }
    } catch {
      // Shortcut polling is optional and should never make the bridge look
      // disconnected on its own. Keep retrying so one transient control
      // transfer failure does not leave controller shortcuts on the slow
      // status-poll path.
      this.shortcutFeaturePollRetryAt = Date.now() + SHORTCUT_POLL_ERROR_RETRY_MS;
    }
  }

  start(): void {
    this.runPoll();
    this.pollTimer = setInterval(() => {
      this.runPoll();
    }, POLL_INTERVAL_MS);
    this.runShortcutPoll();
    this.shortcutPollTimer = setInterval(() => {
      this.runShortcutPoll();
    }, SHORTCUT_POLL_INTERVAL_MS);
  }

  async stop(): Promise<void> {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.clearHostPersonaTransitionPollTimer();
    if (this.shortcutPollTimer) {
      clearInterval(this.shortcutPollTimer);
      this.shortcutPollTimer = null;
    }

    await this.stopControllerAudioPolling();
    this.hidDiscovery.stop();
    this.closeDevice();
  }

  getSnapshot(): BridgeSnapshot {
    return structuredClone(this.snapshot);
  }

  listDevices(): Promise<HidDeviceSummary[]> {
    return this.hidDiscovery.listDevices();
  }

  private controllerAudioReady(status = this.snapshot.status): boolean {
    return Boolean(status?.controllerConnected);
  }

  private currentHostPersonaMode(): HostPersonaMode {
    return normalizeHostPersonaMode(
      this.snapshot.status?.hostPersonaMode ?? this.settingsStore.get().hostPersonaMode
    );
  }

  private async stopAudioHapticsSessionPolling(): Promise<void> {
    this.audioHapticsSessionCache = null;
    this.audioHapticsSessionListInFlight = null;
    this.audioHapticsSessionListInFlightKey = null;
    await this.audioHapticsSessionMonitor.stop();
  }

  private async stopControllerAudioPolling(): Promise<void> {
    this.systemAudioHapticsRetryAt = 0;
    this.systemAudioHapticsPassthroughActive = false;
    await this.systemAudioHapticsEngine.stop();
    await this.stopAudioHapticsSessionPolling();
    await this.micKeepaliveEngine.stop();
  }

  async listAudioHapticsSessions(): Promise<AudioHapticsSession[]> {
    if (!this.controllerAudioReady()) {
      await this.stopAudioHapticsSessionPolling();
      return [];
    }

    const source = this.settingsStore.get().audioReactiveHapticsSource;
    const key = audioReactiveHapticsSourceKey(source);
    const now = Date.now();
    if (this.audioHapticsSessionCache?.key === key && now < this.audioHapticsSessionCache.expiresAt) {
      return cloneAudioHapticsSessions(this.audioHapticsSessionCache.sessions);
    }
    if (this.audioHapticsSessionListInFlight && this.audioHapticsSessionListInFlightKey === key) {
      return cloneAudioHapticsSessions(await this.audioHapticsSessionListInFlight);
    }

    this.audioHapticsSessionListInFlightKey = key;
    this.audioHapticsSessionListInFlight = this.audioHapticsSessionMonitor.listSessions()
      .then((sessions) => {
        if (this.controllerAudioReady()) {
          this.audioHapticsSessionCache = {
            key,
            expiresAt: Date.now() + AUDIO_HAPTICS_SESSION_CACHE_MS,
            sessions: cloneAudioHapticsSessions(sessions)
          };
        }
        return sessions;
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.appendAudioDebugLines([`[AudioSessions] monitor unavailable error=${message}`]);
        return [];
      })
      .finally(() => {
        this.audioHapticsSessionListInFlight = null;
        this.audioHapticsSessionListInFlightKey = null;
      });

    const sessions = await this.audioHapticsSessionListInFlight;
    if (!this.controllerAudioReady()) {
      await this.stopAudioHapticsSessionPolling();
      return [];
    }
    return cloneAudioHapticsSessions(sessions);
  }

  async repairWindowsDeviceCache(): Promise<WindowsDeviceCleanupResult> {
    if (this.snapshot.status?.controllerConnected) {
      throw new Error('Disconnect the controller from the bridge before running emergency device repair.');
    }
    if (process.platform !== 'win32') {
      throw new Error('Windows device repair is only available on Windows.');
    }

    const scriptPath = resolveWindowsDeviceCleanupScriptPath();
    const logPath = createWindowsDeviceCleanupLogPath();
    await runElevatedWindowsDeviceCleanup(scriptPath, logPath);
    return {
      scriptPath,
      logPath,
      includedBluetooth: true,
      message: 'Emergency device repair completed. Reconnect the bridge after Windows settles; pair DualSense controllers to Windows again if you use them directly over Bluetooth.'
    };
  }

  pausePollingFor(milliseconds: number): void {
    this.pollPausedUntil = Math.max(this.pollPausedUntil, Date.now() + milliseconds);
  }

  private runPoll(): void {
    if (this.pollInFlight) {
      this.pollAgainRequested = true;
      return;
    }
    this.pollInFlight = true;
    this.poll()
      .catch((error) => this.publishError(error))
      .finally(() => {
        this.pollInFlight = false;
        if (this.pollAgainRequested && this.pollTimer) {
          this.pollAgainRequested = false;
          this.runPoll();
        } else {
          this.pollAgainRequested = false;
        }
      });
  }

  private runShortcutPoll(): void {
    if (this.shortcutPollInFlight) {
      return;
    }
    this.shortcutPollInFlight = true;
    this.pollShortcutEvent()
      .catch((error) => this.publishError(error))
      .finally(() => {
        this.shortcutPollInFlight = false;
      });
  }

  private scheduleHostPersonaTransitionPoll(): void {
    if (!this.pollTimer || !this.isHostPersonaTransitionActive() || this.hostPersonaTransitionPollTimer) {
      return;
    }
    this.hostPersonaTransitionPollTimer = setTimeout(() => {
      this.hostPersonaTransitionPollTimer = null;
      if (this.isHostPersonaTransitionActive()) {
        this.runPoll();
      }
    }, HOST_PERSONA_TRANSITION_REDISCOVERY_POLL_MS);
  }

  private clearHostPersonaTransitionPollTimer(): void {
    if (!this.hostPersonaTransitionPollTimer) {
      return;
    }
    clearTimeout(this.hostPersonaTransitionPollTimer);
    this.hostPersonaTransitionPollTimer = null;
  }

  private withAudioDebugDiagnostics(diagnostics: BridgeDiagnosticsWithoutAudioLog): BridgeDiagnostics {
    return {
      ...diagnostics,
      audioDebugLogPath: this.audioDebugLogPath,
      audioDebugLogLines: [...this.audioDebugLogLines],
      audioDebugDroppedCount: this.audioDebugDroppedCount,
      audioDebugStats: this.audioDebugStats ? { ...this.audioDebugStats } : null,
      triggerTraceLines: [...this.triggerTraceLines],
      triggerTraceDroppedCount: this.triggerTraceDroppedCount,
      feedbackTraceLines: [...this.feedbackTraceLines],
      feedbackTraceDroppedCount: this.feedbackTraceDroppedCount,
      audioStatus: this.audioStatus ? { ...this.audioStatus } : null
    };
  }

  private expireHostPersonaTransition(now = Date.now()): HostPersonaTransitionState | null {
    const transition = this.hostPersonaTransition;
    if (!transition) {
      return null;
    }
    if (now >= transition.reconnectingUntil) {
      this.hostPersonaTransition = null;
      this.clearHostPersonaTransitionPollTimer();
      return null;
    }
    return transition;
  }

  private hostPersonaTransitionSnapshot(now = Date.now()): HostPersonaTransition | null {
    const transition = this.expireHostPersonaTransition(now);
    if (!transition || transition.completedAt !== null) {
      return null;
    }
    if (transition.settlingUntil !== null && now >= transition.settlingUntil) {
      return null;
    }
    return this.hostPersonaTransitionPublicSnapshot(transition);
  }

  private hostPersonaTransitionMaskSnapshot(now = Date.now()): HostPersonaTransition | null {
    const transition = this.expireHostPersonaTransition(now);
    if (!transition) {
      return null;
    }
    return this.hostPersonaTransitionPublicSnapshot(transition);
  }

  private hostPersonaTransitionPublicSnapshot(transition: HostPersonaTransitionState): HostPersonaTransition {
    return {
      from: transition.from,
      to: transition.to,
      startedAt: transition.startedAt,
      deadlineAt: transition.deadlineAt
    };
  }

  private isHostPersonaTransitionActive(now = Date.now()): boolean {
    return this.expireHostPersonaTransition(now) !== null;
  }

  private hostPersonaTransitionMessage(transition: HostPersonaTransition, forceReconnecting = false): string {
    const activeTransition = this.hostPersonaTransition;
    if (
      forceReconnecting
      || (
        activeTransition
        && activeTransition.to === transition.to
        && activeTransition.settlingUntil === null
        && Date.now() >= activeTransition.deadlineAt
      )
    ) {
      return `Please wait, reconnecting to ${hostPersonaModeLabel(transition.to)} mode`;
    }
    return `Switching to ${hostPersonaModeLabel(transition.to)} mode`;
  }

  private beginHostPersonaTransition(to: HostPersonaMode, from: HostPersonaMode): void {
    const now = Date.now();
    this.hostPersonaTransition = {
      from,
      to,
      startedAt: now,
      deadlineAt: now + HOST_PERSONA_TRANSITION_TIMEOUT_MS,
      settlingUntil: null,
      reconnectingUntil: now + HOST_PERSONA_TRANSITION_TIMEOUT_MS + HOST_PERSONA_RECONNECT_GRACE_MS,
      completedAt: null
    };
  }

  private async getDefaultRenderEndpointStatus(): Promise<DefaultRenderEndpointStatus> {
    return getDefaultRenderEndpointStatus();
  }

  private async setDefaultRenderBridgeEndpoint(mode: HostPersonaMode): Promise<void> {
    await setDefaultRenderBridgeEndpoint(mode);
  }

  private async defaultRenderIsBridgeEndpoint(): Promise<boolean> {
    try {
      const status = await this.getDefaultRenderEndpointStatus();
      this.appendAudioDebugLines([
        `[HostBridge] default render before persona switch device='${status.deviceName}' bridge=${status.isBridgeEndpoint}`
      ]);
      return status.isBridgeEndpoint;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.appendAudioDebugLines([`[HostBridge] default render check skipped: ${message}`]);
      return false;
    }
  }

  private queueHostPersonaDefaultRenderRestore(to: HostPersonaMode): void {
    const now = Date.now();
    this.hostPersonaDefaultRenderRestore = {
      to,
      deadlineAt: now
        + HOST_PERSONA_TRANSITION_TIMEOUT_MS
        + HOST_PERSONA_RECONNECT_GRACE_MS
        + HOST_PERSONA_DEFAULT_RENDER_RESTORE_GRACE_MS,
      nextAttemptAt: 0,
      attempts: 0,
      inFlight: false
    };
  }

  private async restoreHostPersonaDefaultRenderIfReady(status: BridgeStatusPayload): Promise<void> {
    const restore = this.hostPersonaDefaultRenderRestore;
    if (!restore || restore.inFlight || status.hostPersonaMode !== restore.to) {
      return;
    }

    const now = Date.now();
    if (now < restore.nextAttemptAt) {
      return;
    }
    const transition = this.hostPersonaTransition;
    if (transition && transition.to === restore.to && transition.completedAt === null) {
      return;
    }
    if (now >= restore.deadlineAt) {
      this.hostPersonaDefaultRenderRestore = null;
      this.appendAudioDebugLines([
        `[HostBridge] default render restore expired persona=${restore.to} attempts=${restore.attempts}`
      ]);
      return;
    }

    restore.inFlight = true;
    restore.attempts += 1;
    try {
      await this.setDefaultRenderBridgeEndpoint(restore.to);
      this.hostPersonaDefaultRenderRestore = null;
      this.appendAudioDebugLines([
        `[HostBridge] default render restored for persona=${restore.to}`
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      restore.nextAttemptAt = Date.now() + HOST_PERSONA_DEFAULT_RENDER_RESTORE_RETRY_MS;
      if (restore.attempts <= 3) {
        this.appendAudioDebugLines([
          `[HostBridge] default render restore retry persona=${restore.to} attempts=${restore.attempts} error=${message}`
        ]);
      }
    } finally {
      if (this.hostPersonaDefaultRenderRestore === restore) {
        restore.inFlight = false;
      }
    }
  }

  private advanceHostPersonaTransition(status: BridgeStatusPayload, now = Date.now()): HostPersonaTransition | null {
    const transition = this.expireHostPersonaTransition(now);
    if (!transition) {
      return null;
    }
    if (status.hostPersonaMode === transition.to) {
      if (transition.settlingUntil === null) {
        transition.settlingUntil = now + HOST_PERSONA_TRANSITION_SETTLE_MS;
      }
      if (now >= transition.settlingUntil) {
        if (transition.completedAt === null) {
          transition.completedAt = now;
          transition.reconnectingUntil = now + HOST_PERSONA_RECONNECT_GRACE_MS;
          this.completedHostPersonaMode = transition.to;
          this.clearHostPersonaTransitionPollTimer();
        }
        return null;
      }
    }
    return this.hostPersonaTransitionSnapshot(now);
  }

  private transitionDiagnostics(rawDevices: HidDeviceSummary[]): BridgeDiagnostics {
    return this.withAudioDebugDiagnostics({
      ...this.snapshot.diagnostics,
      lastError: null,
      lastPollAt: Date.now(),
      rawDevices
    });
  }

  private applyHostPersonaTransitionSnapshot(rawDevices: HidDeviceSummary[]): boolean {
    const now = Date.now();
    const transition = this.hostPersonaTransitionMaskSnapshot(now);
    if (!transition) {
      return false;
    }
    const activeTransition = this.hostPersonaTransition;
    const forceReconnecting = Boolean(activeTransition?.completedAt !== null);
    this.snapshot = {
      ...this.snapshot,
      state: 'transitioning',
      message: this.hostPersonaTransitionMessage(transition, forceReconnecting),
      settings: this.settingsStore.get(),
      diagnostics: this.transitionDiagnostics(rawDevices),
      personaTransition: transition
    };
    this.scheduleHostPersonaTransitionPoll();
    return true;
  }

  private appendAudioDebugLines(lines: string[]): void {
    if (!AUDIO_DEBUG_DIAGNOSTICS_ENABLED) {
      return;
    }
    if (lines.length === 0) {
      return;
    }

    this.audioDebugLogLines.push(...lines);
    if (this.audioDebugLogLines.length > AUDIO_DEBUG_LOG_LINE_LIMIT) {
      this.audioDebugLogLines = this.audioDebugLogLines.slice(-AUDIO_DEBUG_LOG_LINE_LIMIT);
    }
    this.snapshot = {
      ...this.snapshot,
      diagnostics: this.withAudioDebugDiagnostics(this.snapshot.diagnostics)
    };
  }

  private consumeCompletedHostPersonaMode(): HostPersonaMode | null {
    const mode = this.completedHostPersonaMode;
    this.completedHostPersonaMode = null;
    return mode;
  }

  private async restartSystemAudioHapticsAfterPersonaTransition(mode: HostPersonaMode): Promise<void> {
    this.systemAudioHapticsRetryAt = 0;
    await this.systemAudioHapticsEngine.stop();
    await this.updateSystemAudioHapticsEngine();
    this.appendAudioDebugLines([`[SystemHaptics] restarted after persona transition persona=${mode}`]);
  }

  private isBridgeRenderEndpointUnavailableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes('Render endpoint matching') && message.includes('was not found');
  }

  private skipBridgeHapticsTest(reason: string): BridgeSnapshot {
    this.appendAudioDebugLines([`[HostBridge] test haptics skipped: ${reason}`]);
    return this.getSnapshot();
  }

  private async readAudioDebugEvents(): Promise<void> {
    if (!AUDIO_DEBUG_DIAGNOSTICS_ENABLED) {
      return;
    }
    if (!this.device) {
      return;
    }

    try {
      const debug = parseAudioDebugReport(await this.device.getFeatureReport(REPORT_ID.AUDIO_DEBUG, REPORT_LENGTH));
      this.audioDebugDroppedCount = debug.droppedCount;
      this.appendAudioDebugLines(debug.events.map(formatAudioDebugEvent));
    } catch {
      // Keep diagnostics best-effort so normal status polling is not blocked.
    }
  }

  private async readAudioDebugStats(): Promise<void> {
    if (!AUDIO_DEBUG_DIAGNOSTICS_ENABLED) {
      return;
    }
    if (!this.device) {
      return;
    }

    try {
      const stats = parseAudioStatsReport(await this.device.getFeatureReport(REPORT_ID.AUDIO_STATS, REPORT_LENGTH));
      this.audioDebugStats = stats;
      const signature = JSON.stringify(stats);
      if (signature !== this.lastAudioStatsSignature) {
        this.lastAudioStatsSignature = signature;
        this.appendAudioDebugLines([formatAudioStats(stats)]);
      }
    } catch {
      // Keep diagnostics best-effort so normal status polling is not blocked.
    }
  }

  private async readAudioDebugThrottled(force = false): Promise<void> {
    if (!AUDIO_DEBUG_DIAGNOSTICS_ENABLED) {
      return;
    }
    const now = Date.now();
    if (!force && now - this.lastAudioDebugReadAt < AUDIO_DEBUG_READ_INTERVAL_MS) {
      return;
    }
    this.lastAudioDebugReadAt = now;
    await this.readAudioDebugEvents();
    await this.readAudioDebugStats();
  }

  private appendTriggerTraceLines(lines: string[]): void {
    if (lines.length === 0) {
      return;
    }

    this.triggerTraceLines.push(...lines);
    if (this.triggerTraceLines.length > TRIGGER_TRACE_LOG_LINE_LIMIT) {
      this.triggerTraceLines = this.triggerTraceLines.slice(-TRIGGER_TRACE_LOG_LINE_LIMIT);
    }
    this.snapshot = {
      ...this.snapshot,
      diagnostics: this.withAudioDebugDiagnostics(this.snapshot.diagnostics)
    };
  }

  private async readTriggerTraceThrottled(force = false): Promise<void> {
    if (!TRIGGER_TRACE_DIAGNOSTICS_ENABLED) {
      return;
    }
    if (!this.device) {
      return;
    }
    if (this.triggerTraceSupported === false) {
      return;
    }
    const now = Date.now();
    if (!force && now - this.lastTriggerTraceReadAt < TRIGGER_TRACE_READ_INTERVAL_MS) {
      return;
    }
    this.lastTriggerTraceReadAt = now;

    try {
      const lines: string[] = [];
      for (let readIndex = 0; readIndex < TRIGGER_TRACE_MAX_READS_PER_POLL; readIndex += 1) {
        const trace = parseTriggerTraceReport(await this.device.getFeatureReport(REPORT_ID.TRIGGER_TRACE, REPORT_LENGTH));
        this.triggerTraceSupported = true;
        this.triggerTraceDroppedCount = trace.droppedCount;
        if (trace.events.length === 0) {
          break;
        }
        lines.push(...trace.events.map(formatTriggerTraceEvent));
      }
      this.appendTriggerTraceLines(lines);
    } catch {
      this.triggerTraceSupported = false;
    }
  }

  private appendFeedbackTraceLines(lines: string[]): void {
    if (lines.length === 0) {
      return;
    }

    this.feedbackTraceLines.push(...lines);
    if (this.feedbackTraceLines.length > FEEDBACK_TRACE_LOG_LINE_LIMIT) {
      this.feedbackTraceLines = this.feedbackTraceLines.slice(-FEEDBACK_TRACE_LOG_LINE_LIMIT);
    }
    this.snapshot = {
      ...this.snapshot,
      diagnostics: this.withAudioDebugDiagnostics(this.snapshot.diagnostics)
    };
  }

  private async readFeedbackTraceThrottled(force = false): Promise<void> {
    if (!FEEDBACK_TRACE_DIAGNOSTICS_ENABLED) {
      return;
    }
    if (!this.device) {
      return;
    }
    if (this.feedbackTraceSupported === false) {
      return;
    }
    const now = Date.now();
    if (!force && now - this.lastFeedbackTraceReadAt < FEEDBACK_TRACE_READ_INTERVAL_MS) {
      return;
    }
    this.lastFeedbackTraceReadAt = now;

    try {
      const lines: string[] = [];
      for (let readIndex = 0; readIndex < FEEDBACK_TRACE_MAX_READS_PER_POLL; readIndex += 1) {
        const trace = parseFeedbackTraceReport(await this.device.getFeatureReport(REPORT_ID.FEEDBACK_TRACE, REPORT_LENGTH));
        this.feedbackTraceSupported = true;
        this.feedbackTraceDroppedCount = trace.droppedCount;
        if (trace.events.length === 0) {
          break;
        }
        lines.push(...trace.events.map(formatFeedbackTraceEvent));
      }
      this.appendFeedbackTraceLines(lines);
    } catch {
      this.feedbackTraceSupported = false;
    }
  }

  private async readAudioStatus(): Promise<void> {
    if (!this.device) {
      this.audioStatus = null;
      this.publishAudioDiagnosticsSnapshot();
      return;
    }

    try {
      const status = parseAudioStatusReport(
        await this.device.getFeatureReport(REPORT_ID.AUDIO_STATUS, REPORT_LENGTH)
      );
      this.audioStatus = status;
      this.lastAudioStatusReadAt = Date.now();
    } catch {
      this.audioStatus = null;
    }
    this.publishAudioDiagnosticsSnapshot();
  }

  private async readAudioStatusThrottled(force = false, intervalMs = AUDIO_STATUS_READ_INTERVAL_MS): Promise<void> {
    if (!force && Date.now() - this.lastAudioStatusReadAt < intervalMs) {
      return;
    }
    await this.readAudioStatus();
  }

  private publishAudioDiagnosticsSnapshot(): void {
    this.snapshot = {
      ...this.snapshot,
      diagnostics: this.withAudioDebugDiagnostics(this.snapshot.diagnostics)
    };
    if (this.snapshot.status) {
      this.emitSnapshot();
    }
  }

  private isControllerPowerSavingActive(settings: CompanionSettings): boolean {
    return settings.controllerPowerSavingEnabled && Boolean(this.audioStatus?.headsetPlugged);
  }

  private capForControllerPowerSaving(value: number, settings: CompanionSettings): number {
    return this.isControllerPowerSavingActive(settings)
      ? Math.min(value, CONTROLLER_POWER_SAVING_CAP_PERCENT)
      : value;
  }

  private feedbackGainMax(settings: CompanionSettings): number {
    return settings.feedbackBoostEnabled ? BOOSTED_FEEDBACK_GAIN_PERCENT : STANDARD_FEEDBACK_GAIN_PERCENT;
  }

  private capForFeedbackBoost(value: number, settings: CompanionSettings): number {
    return Math.min(value, this.feedbackGainMax(settings));
  }

  private effectiveHapticsGain(settings: CompanionSettings): number {
    return settings.hapticsEnabled
      ? this.capForControllerPowerSaving(this.capForFeedbackBoost(settings.hapticsGainPercent, settings), settings)
      : 0;
  }

  private effectiveClassicRumbleGain(settings: CompanionSettings): number {
    return settings.classicRumbleEnabled
      ? this.capForControllerPowerSaving(this.capForFeedbackBoost(settings.classicRumbleGainPercent, settings), settings)
      : 0;
  }

  private effectiveTriggerEffectIntensity(settings: CompanionSettings): number {
    return settings.adaptiveTriggersEnabled
      ? this.capForControllerPowerSaving(settings.triggerEffectIntensityPercent, settings)
      : 0;
  }

  private audioReactiveHapticsCommandEnabled(settings: CompanionSettings): boolean {
    return settings.hapticsEnabled
      && settings.audioReactiveHapticsEnabled
      && this.systemAudioHapticsPassthroughActive;
  }

  private audioReactiveHapticsSuppressesClassicRumble(settings: CompanionSettings): boolean {
    return settings.hapticsEnabled
      && settings.audioReactiveHapticsEnabled
      && settings.audioReactiveHapticsMode === 'replace';
  }

  private audioReactiveHapticsSupported(): boolean {
    return Boolean(this.snapshot.status?.firmwareFlags.audioReactiveHapticsControl);
  }

  private systemAudioHapticsSupported(): boolean {
    return this.audioReactiveHapticsSupported();
  }

  private systemAudioHapticsDesired(settings: CompanionSettings): boolean {
    return settings.hapticsEnabled
      && settings.audioReactiveHapticsEnabled;
  }

  private systemAudioHapticsConfig(settings: CompanionSettings): SystemAudioHapticsConfig {
    return {
      source: settings.audioReactiveHapticsSource,
      gainPercent: settings.audioReactiveHapticsGainPercent,
      bassFocus: settings.audioReactiveHapticsBassFocus,
      response: settings.audioReactiveHapticsResponse,
      attack: settings.audioReactiveHapticsAttack,
      release: settings.audioReactiveHapticsRelease
    };
  }

  private audioReactiveHapticsCommandPayload(settings: CompanionSettings): number[] {
    const gain = Math.max(0, Math.min(200, Math.round(settings.audioReactiveHapticsGainPercent)));
    const mode = audioReactiveHapticsModeValue(settings.audioReactiveHapticsMode)
      | (this.audioReactiveHapticsSuppressesClassicRumble(settings)
        ? AUDIO_REACTIVE_HAPTICS_SUPPRESS_CLASSIC_RUMBLE_MODE_FLAG
        : 0);
    return [
      mode,
      gain & 0xff,
      (gain >> 8) & 0xff,
      audioReactiveHapticsBassFocusValue(settings.audioReactiveHapticsBassFocus),
      audioReactiveHapticsResponseValue(settings.audioReactiveHapticsResponse),
      audioReactiveHapticsAttackValue(settings.audioReactiveHapticsAttack),
      audioReactiveHapticsReleaseValue(settings.audioReactiveHapticsRelease)
    ];
  }

  private async applyAudioReactiveHapticsSettings(
    settings: CompanionSettings,
    expectSettingsRevisionChange: boolean
  ): Promise<void> {
    if (!this.audioReactiveHapticsSupported()) {
      return;
    }
    await this.sendCommand(
      COMMAND_ID.SET_AUDIO_REACTIVE_HAPTICS,
      this.audioReactiveHapticsCommandEnabled(settings) ? 1 : 0,
      {
        expectSettingsRevisionChange,
        extraPayload: this.audioReactiveHapticsCommandPayload(settings)
      }
    );
  }

  private effectiveLightbarBrightness(settings: CompanionSettings): number {
    return settings.lightbarEnabled
      ? this.capForControllerPowerSaving(settings.lightbarBrightnessPercent, settings)
      : 0;
  }

  private async applyControllerPowerSavingSensitiveSettings(
    settings: CompanionSettings,
    expectSettingsRevisionChange: boolean
  ): Promise<void> {
    await this.sendCommand(COMMAND_ID.SET_HAPTICS_GAIN, this.effectiveHapticsGain(settings), {
      expectSettingsRevisionChange
    });
    await this.sendCommand(COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN, this.effectiveClassicRumbleGain(settings), {
      expectSettingsRevisionChange
    });
    await this.sendCommand(COMMAND_ID.SET_TRIGGER_EFFECT_INTENSITY, this.effectiveTriggerEffectIntensity(settings), {
      expectSettingsRevisionChange
    });
    await this.applyAudioReactiveHapticsSettings(settings, expectSettingsRevisionChange);
    await this.applyLightbarSettings(settings, expectSettingsRevisionChange);
  }

  private async syncControllerPowerSavingState(settings: CompanionSettings): Promise<void> {
    const active = this.isControllerPowerSavingActive(settings);
    if (this.controllerPowerSavingActive === active) {
      return;
    }
    const previousActive = this.controllerPowerSavingActive;
    this.controllerPowerSavingActive = active;
    if (previousActive === null || this.reapplyActive || this.snapshot.state !== 'connected') {
      return;
    }
    await this.applyControllerPowerSavingSensitiveSettings(settings, true);
    this.emitSnapshot();
  }

  async setHapticsGain(percent: number): Promise<BridgeSnapshot> {
    const currentSettings = this.settingsStore.get();
    const value = Math.max(0, Math.min(this.feedbackGainMax(currentSettings), Math.round(percent)));
    const enableFromPositiveGain = value > 0 && !currentSettings.hapticsEnabled;
    const nextSettings = {
      ...currentSettings,
      hapticsGainPercent: value,
      hapticsEnabled: enableFromPositiveGain ? true : currentSettings.hapticsEnabled
    };
    const effectiveValue = this.effectiveHapticsGain(nextSettings);
    await this.sendSettingCommand(COMMAND_ID.SET_HAPTICS_GAIN, effectiveValue, customSettingUpdate({
      hapticsGainPercent: value,
      ...(enableFromPositiveGain ? { hapticsEnabled: true } : {})
    }));
    return this.getSnapshot();
  }

  async setHapticsEnabled(enabled: boolean): Promise<BridgeSnapshot> {
    const currentSettings = this.settingsStore.get();
    const settings = {
      ...currentSettings,
      hapticsEnabled: enabled
    };
    await this.sendSettingCommand(COMMAND_ID.SET_HAPTICS_GAIN, this.effectiveHapticsGain(settings), customSettingUpdate({
      hapticsEnabled: enabled
    }));
    if (this.snapshot.state === 'connected') {
      await this.applyAudioReactiveHapticsSettings(this.snapshot.settings, true);
    }
    await this.updateSystemAudioHapticsEngine();
    return this.getSnapshot();
  }

  async setHapticsBufferLength(length: number): Promise<BridgeSnapshot> {
    const value = Math.max(16, Math.min(128, Math.round(length)));
    await this.sendSettingCommand(COMMAND_ID.SET_HAPTICS_BUFFER_LENGTH, value, { hapticsBufferLength: value });
    return this.getSnapshot();
  }

  async setClassicRumbleGain(percent: number): Promise<BridgeSnapshot> {
    const currentSettings = this.settingsStore.get();
    const value = Math.max(0, Math.min(this.feedbackGainMax(currentSettings), Math.round(percent)));
    const nextSettings = { ...currentSettings, classicRumbleGainPercent: value };
    const effectiveValue = this.effectiveClassicRumbleGain(nextSettings);
    await this.sendSettingCommand(COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN, effectiveValue, customSettingUpdate({
      classicRumbleGainPercent: value
    }));
    return this.getSnapshot();
  }

  async setFeedbackBoostEnabled(enabled: boolean): Promise<BridgeSnapshot> {
    const currentSettings = this.settingsStore.get();
    const update: Partial<CompanionSettings> = { feedbackBoostEnabled: enabled };
    if (!enabled) {
      update.hapticsGainPercent = Math.min(currentSettings.hapticsGainPercent, STANDARD_FEEDBACK_GAIN_PERCENT);
      update.classicRumbleGainPercent = Math.min(
        currentSettings.classicRumbleGainPercent,
        STANDARD_FEEDBACK_GAIN_PERCENT
      );
    }
    this.snapshot.settings = this.settingsStore.update(update);
    if (this.snapshot.state === 'connected') {
      await this.sendCommand(COMMAND_ID.SET_HAPTICS_GAIN, this.effectiveHapticsGain(this.snapshot.settings), {
        expectSettingsRevisionChange: true
      });
      await this.sendCommand(
        COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN,
        this.effectiveClassicRumbleGain(this.snapshot.settings),
        { expectSettingsRevisionChange: true }
      );
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setClassicRumbleEnabled(enabled: boolean): Promise<BridgeSnapshot> {
    const settings = { ...this.settingsStore.get(), classicRumbleEnabled: enabled };
    await this.sendSettingCommand(
      COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN,
      this.effectiveClassicRumbleGain(settings),
      customSettingUpdate({ classicRumbleEnabled: enabled })
    );
    return this.getSnapshot();
  }

  async setClassicRumbleV1Enabled(enabled: boolean): Promise<BridgeSnapshot> {
    await this.sendSettingCommand(COMMAND_ID.SET_CLASSIC_RUMBLE_V1, enabled ? 1 : 0, customSettingUpdate({
      classicRumbleV1Enabled: enabled
    }));
    return this.getSnapshot();
  }

  async setTriggerEffectIntensity(percent: number): Promise<BridgeSnapshot> {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    const nextSettings = { ...this.settingsStore.get(), triggerEffectIntensityPercent: value };
    const effectiveValue = this.effectiveTriggerEffectIntensity(nextSettings);
    await this.sendSettingCommand(COMMAND_ID.SET_TRIGGER_EFFECT_INTENSITY, effectiveValue, customSettingUpdate({
      triggerEffectIntensityPercent: value
    }));
    return this.getSnapshot();
  }

  async setTriggerTestMode(mode: TriggerTestMode): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.update(customSettingUpdate({ triggerTestMode: mode }));
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setAdaptiveTriggersEnabled(enabled: boolean): Promise<BridgeSnapshot> {
    const settings = { ...this.settingsStore.get(), adaptiveTriggersEnabled: enabled };
    await this.sendSettingCommand(
      COMMAND_ID.SET_TRIGGER_EFFECT_INTENSITY,
      this.effectiveTriggerEffectIntensity(settings),
      customSettingUpdate({ adaptiveTriggersEnabled: enabled })
    );
    if (!enabled && this.snapshot.state === 'connected') {
      await this.sendCommand(COMMAND_ID.RESET_ADAPTIVE_TRIGGERS, 0, { throwOnCommandError: false });
    }
    return this.getSnapshot();
  }

  async setSpeakerVolume(percent: number): Promise<BridgeSnapshot> {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    const settings = this.settingsStore.get();
    if (settings.speakerEnabled) {
      await this.setFirmwareSpeakerVolume(value, true);
    }
    this.snapshot.settings = this.settingsStore.update(customSettingUpdate({
      speakerVolumePercent: value
    }));
    if (this.snapshot.status) {
      this.snapshot.status.speakerVolumePercent = value;
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setSpeakerGainLevel(level: number): Promise<BridgeSnapshot> {
    const value = Math.max(1, Math.min(7, Math.round(level)));
    await this.sendCommand(COMMAND_ID.SET_SPEAKER_GAIN, value, {
      expectSettingsRevisionChange: true
    });
    this.snapshot.settings = this.settingsStore.update({
      speakerGainLevel: value
    });
    if (this.snapshot.status) {
      this.snapshot.status.speakerGainLevel = value;
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setSpeakerEnabled(enabled: boolean): Promise<BridgeSnapshot> {
    const settings = this.settingsStore.get();
    await this.setFirmwareSpeakerVolume(enabled ? settings.speakerVolumePercent : 0, true);
    this.snapshot.settings = this.settingsStore.update(customSettingUpdate({
      speakerEnabled: enabled
    }));
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setMicVolume(percent: number): Promise<BridgeSnapshot> {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    await this.sendCommand(COMMAND_ID.SET_MIC_VOLUME, value, {
      expectSettingsRevisionChange: true
    });
    this.snapshot.settings = this.settingsStore.update(customSettingUpdate({
      micVolumePercent: value
    }));
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setMicMute(enabled: boolean): Promise<BridgeSnapshot> {
    await this.sendCommand(COMMAND_ID.SET_MIC_MUTE, enabled ? 1 : 0, {
      expectSettingsRevisionChange: true
    });
    this.snapshot.settings = this.settingsStore.update(customSettingUpdate({
      micMuted: enabled
    }));
    this.emitSnapshot();
    await this.updateMicKeepaliveEngine(Boolean(this.snapshot.status?.controllerConnected));
    return this.getSnapshot();
  }

  async setAudioReactiveHapticsConfig(config: Partial<AudioReactiveHapticsConfig>): Promise<BridgeSnapshot> {
    const currentSettings = this.settingsStore.get();
    const normalized = normalizeAudioReactiveHapticsConfig(config, currentSettings);
    const nextSettings: CompanionSettings = {
      ...currentSettings,
      audioReactiveHapticsEnabled: normalized.enabled,
      audioReactiveHapticsSource: normalized.source,
      audioReactiveHapticsMode: normalized.mode,
      audioReactiveHapticsGainPercent: normalized.gainPercent,
      audioReactiveHapticsBassFocus: normalized.bassFocus,
      audioReactiveHapticsResponse: normalized.response,
      audioReactiveHapticsAttack: normalized.attack,
      audioReactiveHapticsRelease: normalized.release
    };
    if (!this.audioReactiveHapticsSupported()) {
      throw new Error('Audio reactive haptics require updated bridge firmware.');
    }
    const ack = await this.sendCommand(
      COMMAND_ID.SET_AUDIO_REACTIVE_HAPTICS,
      this.audioReactiveHapticsCommandEnabled(nextSettings) ? 1 : 0,
      {
        expectSettingsRevisionChange: true,
        extraPayload: this.audioReactiveHapticsCommandPayload(nextSettings)
      }
    );
    if (ack.resultCode === ACK_RESULT.OK) {
      this.snapshot.settings = this.settingsStore.update(customSettingUpdate({
        audioReactiveHapticsEnabled: normalized.enabled,
        audioReactiveHapticsSource: normalized.source,
        audioReactiveHapticsMode: normalized.mode,
        audioReactiveHapticsGainPercent: normalized.gainPercent,
        audioReactiveHapticsBassFocus: normalized.bassFocus,
        audioReactiveHapticsResponse: normalized.response,
        audioReactiveHapticsAttack: normalized.attack,
        audioReactiveHapticsRelease: normalized.release
      }));
      await this.updateSystemAudioHapticsEngine();
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  async setDuplexMicEnabled(enabled: boolean): Promise<BridgeSnapshot> {
    const nextEnabled = enabled;
    if (!nextEnabled) {
      await this.sendCommand(COMMAND_ID.SET_MIC_MUTE, 1, {
        expectSettingsRevisionChange: true
      });
    }
    await this.sendCommand(COMMAND_ID.SET_DUPLEX_ENABLED, nextEnabled ? 1 : 0, {
      expectSettingsRevisionChange: true
    });
    if (nextEnabled) {
      await this.sendCommand(COMMAND_ID.SET_MIC_MUTE, 0, {
        expectSettingsRevisionChange: true
      });
    }
    this.snapshot.settings = this.settingsStore.update(customSettingUpdate({
      duplexMicEnabled: nextEnabled,
      micMuted: !nextEnabled
    }));
    if (nextEnabled) {
      await this.updateMicKeepaliveEngine(Boolean(this.snapshot.status?.controllerConnected));
    } else {
      await this.micKeepaliveEngine.stop();
    }
    await this.readAudioStatus();
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setLightbarColor(color: string, brightnessPercent: number): Promise<BridgeSnapshot> {
    const parsed = parseHexColor(color);
    const brightness = Math.max(0, Math.min(100, Math.round(brightnessPercent)));
    const nextSettings = {
      ...this.settingsStore.get(),
      lightbarColor: parsed.hex,
      lightbarBrightnessPercent: brightness
    };
    const effectiveBrightness = this.effectiveLightbarBrightness(nextSettings);
    const ack = await this.sendCommand(COMMAND_ID.SET_LIGHTBAR_COLOR, effectiveBrightness, {
      expectSettingsRevisionChange: true,
      extraPayload: [parsed.red, parsed.green, parsed.blue]
    });
    if (ack.resultCode === ACK_RESULT.OK) {
      this.snapshot.settings = this.settingsStore.update(customSettingUpdate({
        lightbarColor: parsed.hex,
        lightbarBrightnessPercent: brightness
      }));
      if (this.snapshot.status) {
        this.snapshot.status.lightbarColor = {
          red: parsed.red,
          green: parsed.green,
          blue: parsed.blue,
          brightnessPercent: effectiveBrightness
        };
      }
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  async setLightbarOverrideEnabled(enabled: boolean): Promise<BridgeSnapshot> {
    const ack = await this.sendCommand(COMMAND_ID.SET_LIGHTBAR_OVERRIDE, enabled ? 1 : 0, {
      expectSettingsRevisionChange: true
    });
    if (ack.resultCode === ACK_RESULT.OK) {
      this.snapshot.settings = this.settingsStore.update(customSettingUpdate({ lightbarOverrideEnabled: enabled }));
      if (this.snapshot.status) {
        this.snapshot.status.lightbarOverrideEnabled = enabled;
      }
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  async setLightbarEnabled(enabled: boolean): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.update(customSettingUpdate({ lightbarEnabled: enabled }));
    if (this.snapshot.state === 'connected') {
      await this.applyLightbarSettings(this.snapshot.settings, true);
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setMuteButtonAction(
    mode: MuteButtonMode,
    usage: number,
    modifiers: number,
    behavior: MuteKeyboardBehavior,
    chordStarterEnabled = false
  ): Promise<BridgeSnapshot> {
    const keyUsage = Math.max(1, Math.min(0x73, Math.round(usage)));
    const keyModifiers = Math.max(0, Math.min(MUTE_KEYBOARD_MODIFIER_MASK, Math.round(modifiers)));
    const keyChordStarterEnabled = mode === 'keyboard' && chordStarterEnabled;
    const keyOptions = encodeMuteKeyboardOptions(keyModifiers, behavior, keyChordStarterEnabled);
    const ack = await this.sendCommand(COMMAND_ID.SET_MUTE_BUTTON_ACTION, muteButtonModeValue(mode), {
      expectSettingsRevisionChange: true,
      extraPayload: [keyUsage, keyOptions]
    });
    if (ack.resultCode === ACK_RESULT.OK) {
      this.snapshot.settings = this.settingsStore.update(customSettingUpdate({
        muteButtonMode: mode,
        muteKeyboardUsage: keyUsage,
        muteKeyboardModifiers: keyModifiers,
        muteKeyboardBehavior: behavior,
        muteKeyboardChordStarterEnabled: keyChordStarterEnabled
      }));
      if (this.snapshot.status) {
        this.snapshot.status.muteButtonMode = mode;
        this.snapshot.status.muteKeyboardUsage = keyUsage;
        this.snapshot.status.muteKeyboardModifiers = keyModifiers;
        this.snapshot.status.muteKeyboardBehavior = behavior;
        this.snapshot.status.muteKeyboardChordStarterEnabled = keyChordStarterEnabled;
      }
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  async setLedEnabled(enabled: boolean): Promise<BridgeSnapshot> {
    await this.sendSettingCommand(COMMAND_ID.SET_LED_ENABLED, enabled ? 1 : 0, { ledEnabled: enabled });
    return this.getSnapshot();
  }

  async setPlayerLedEnabled(enabled: boolean): Promise<BridgeSnapshot> {
    await this.sendSettingCommand(COMMAND_ID.SET_PLAYER_LED_ENABLED, enabled ? 1 : 0, {
      playerLedEnabled: enabled
    });
    return this.getSnapshot();
  }

  async setIdleDisconnectEnabled(enabled: boolean): Promise<BridgeSnapshot> {
    await this.sendSettingCommand(COMMAND_ID.SET_IDLE_DISCONNECT_ENABLED, enabled ? 1 : 0, {
      idleDisconnectEnabled: enabled
    });
    return this.getSnapshot();
  }

  private async dispatchInputShortcutAction(event: InputShortcutEvent): Promise<void> {
    if (event.kind === 'chord-function') {
      await this.dispatchChordFunctionSlot(event.slot);
      return;
    }
    await this.dispatchShortcutAction(event.event);
  }

  private async dispatchShortcutAction(event: ShortcutEvent): Promise<void> {
    await this.shortcutActionHandlers[event]();
  }

  private async dispatchChordFunctionSlot(slot: number): Promise<void> {
    const settings = this.settingsStore.get();
    const assignment = settings.chordAssignments[slot];
    if (!assignment) {
      return;
    }
    const func = settings.chordFunctions.find((candidate) => candidate.id === assignment.functionId);
    if (!func) {
      return;
    }
    await this.executeChordFunction(func);
  }

  private async executeChordFunction(func: ChordFunction): Promise<void> {
    switch (func.type) {
      case 'keyboard': {
        const codes = func.keys.map(virtualKeyCodeFor).filter((code): code is number => code !== null);
        if (codes.length !== func.keys.length || codes.length === 0) {
          this.appendAudioDebugLines([`[Chords] ignored invalid keyboard function id=${func.id} keys=${func.keys.join('+')}`]);
          return;
        }
        await sendVirtualKeySequence(codes);
        return;
      }
      case 'media':
        await sendVirtualKeySequence([MEDIA_ACTION_KEY_CODES[func.action]]);
        return;
      case 'controller-setting':
        await this.executeChordControllerSettingAction(func.action, func.stepPercent);
        return;
    }
  }

  private async executeChordControllerSettingAction(
    action: Extract<ChordFunction, { type: 'controller-setting' }>['action'],
    stepPercent: number
  ): Promise<void> {
    const settings = this.settingsStore.get();
    const step = normalizeChordControllerSettingStepPercent(stepPercent);
    switch (action) {
      case 'toggle-audio-haptics':
        await this.setAudioReactiveHapticsConfig({ enabled: !settings.audioReactiveHapticsEnabled });
        return;
      case 'toggle-lightbar-override':
        await this.setLightbarOverrideEnabled(!settings.lightbarOverrideEnabled);
        return;
      case 'toggle-mic-mute':
        if (!settings.duplexMicEnabled) {
          return;
        }
        await this.setMicMute(!settings.micMuted);
        return;
      case 'sleep-controller':
        await this.sleepController();
        return;
      case 'persona-dualsense':
        await this.setHostPersonaMode('dualsense');
        return;
      case 'persona-ds4':
        await this.setHostPersonaMode('ds4');
        return;
      case 'persona-xbox':
        await this.setHostPersonaMode('xbox');
        return;
      case 'speaker-down':
        await this.stepSpeakerVolume(-step);
        return;
      case 'speaker-up':
        await this.stepSpeakerVolume(step);
        return;
      case 'mic-down':
        await this.stepMicVolume(-step);
        return;
      case 'mic-up':
        await this.stepMicVolume(step);
        return;
      case 'haptics-down':
        await this.stepHapticsGain(-step);
        return;
      case 'haptics-up':
        await this.stepHapticsGain(step);
        return;
      case 'rumble-down':
        await this.stepClassicRumbleGain(-step);
        return;
      case 'rumble-up':
        await this.stepClassicRumbleGain(step);
        return;
      case 'triggers-down':
        await this.stepTriggerEffectIntensity(-step);
        return;
      case 'triggers-up':
        await this.stepTriggerEffectIntensity(step);
        return;
      case 'lighting-down':
        await this.stepLightbarBrightness(-step);
        return;
      case 'lighting-up':
        await this.stepLightbarBrightness(step);
        return;
    }
  }

  private clampChordPercent(value: number, max: number): number {
    return Math.max(0, Math.min(max, Math.round(value)));
  }

  private async stepSpeakerVolume(deltaPercent: number): Promise<void> {
    const settings = this.settingsStore.get();
    if (!settings.speakerEnabled) {
      return;
    }
    const nextValue = this.clampChordPercent(settings.speakerVolumePercent + deltaPercent, 100);
    if (nextValue !== settings.speakerVolumePercent) {
      await this.setSpeakerVolume(nextValue);
    }
  }

  private async stepMicVolume(deltaPercent: number): Promise<void> {
    const settings = this.settingsStore.get();
    if (!settings.duplexMicEnabled) {
      return;
    }
    const nextValue = this.clampChordPercent(settings.micVolumePercent + deltaPercent, 100);
    if (nextValue !== settings.micVolumePercent) {
      await this.setMicVolume(nextValue);
    }
  }

  private async stepHapticsGain(deltaPercent: number): Promise<void> {
    const settings = this.settingsStore.get();
    if (!settings.hapticsEnabled) {
      return;
    }
    const nextValue = this.clampChordPercent(settings.hapticsGainPercent + deltaPercent, this.feedbackGainMax(settings));
    if (nextValue !== settings.hapticsGainPercent) {
      await this.setHapticsGain(nextValue);
    }
  }

  private async stepClassicRumbleGain(deltaPercent: number): Promise<void> {
    const settings = this.settingsStore.get();
    if (!settings.classicRumbleEnabled) {
      return;
    }
    const nextValue = this.clampChordPercent(settings.classicRumbleGainPercent + deltaPercent, this.feedbackGainMax(settings));
    if (nextValue !== settings.classicRumbleGainPercent) {
      await this.setClassicRumbleGain(nextValue);
    }
  }

  private async stepTriggerEffectIntensity(deltaPercent: number): Promise<void> {
    const settings = this.settingsStore.get();
    if (!settings.adaptiveTriggersEnabled) {
      return;
    }
    const nextValue = this.clampChordPercent(settings.triggerEffectIntensityPercent + deltaPercent, 100);
    if (nextValue !== settings.triggerEffectIntensityPercent) {
      await this.setTriggerEffectIntensity(nextValue);
    }
  }

  private async stepLightbarBrightness(deltaPercent: number): Promise<void> {
    const settings = this.settingsStore.get();
    if (!settings.lightbarEnabled) {
      return;
    }
    const nextValue = this.clampChordPercent(settings.lightbarBrightnessPercent + deltaPercent, 100);
    if (nextValue !== settings.lightbarBrightnessPercent) {
      await this.setLightbarColor(settings.lightbarColor, nextValue);
    }
  }

  private async applyControllerVolumeShortcut(deltaPercent: number): Promise<void> {
    const settings = this.settingsStore.get();
    if (!settings.speakerVolumeShortcutEnabled || !settings.speakerEnabled) {
      return;
    }

    const nextVolume = Math.max(0, Math.min(100, settings.speakerVolumePercent + deltaPercent));
    if (nextVolume === settings.speakerVolumePercent) {
      return;
    }

    await this.setSpeakerVolume(nextVolume);
  }

  private async applySleepShortcut(): Promise<void> {
    if (!this.settingsStore.get().sleepKeybindEnabled) {
      return;
    }
    await this.sleepController();
  }

  private async applyControllerMicMuteEvent(micMuted: boolean): Promise<void> {
    const settings = this.settingsStore.get();
    if (!settings.duplexMicEnabled || settings.muteButtonMode !== 'normal') {
      return;
    }
    this.snapshot.settings = this.settingsStore.update(customSettingUpdate({ micMuted }));
    if (this.snapshot.status) {
      this.snapshot.status.micMuted = micMuted;
    }
    this.emitSnapshot();
    void this.updateMicKeepaliveEngine(Boolean(this.snapshot.status?.controllerConnected));
  }

  async setIdleDisconnectTimeoutMinutes(minutes: number): Promise<BridgeSnapshot> {
    const value = normalizeIdleDisconnectTimeoutMinutes(minutes);
    await this.sendSettingCommand(COMMAND_ID.SET_IDLE_DISCONNECT_TIMEOUT, value, {
      idleDisconnectTimeoutMinutes: value
    });
    return this.getSnapshot();
  }

  async setUsbSuspendDisconnectEnabled(enabled: boolean): Promise<BridgeSnapshot> {
    await this.sendSettingCommand(COMMAND_ID.SET_USB_SUSPEND_DISCONNECT_ENABLED, enabled ? 1 : 0, {
      usbSuspendDisconnectEnabled: enabled
    });
    if (this.snapshot.status) {
      this.snapshot.status.usbSuspendDisconnectEnabled = enabled;
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  async setSleepKeybindEnabled(enabled: boolean): Promise<BridgeSnapshot> {
    await this.sendSettingCommand(COMMAND_ID.SET_SLEEP_KEYBIND_ENABLED, enabled ? 1 : 0, {
      sleepKeybindEnabled: enabled
    });
    if (this.snapshot.status) {
      this.snapshot.status.sleepKeybindEnabled = enabled;
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  async setSpeakerVolumeShortcutEnabled(enabled: boolean): Promise<BridgeSnapshot> {
    await this.sendSettingCommand(COMMAND_ID.SET_SPEAKER_VOLUME_SHORTCUT_ENABLED, enabled ? 1 : 0, {
      speakerVolumeShortcutEnabled: enabled
    });
    return this.getSnapshot();
  }

  async setControllerPowerSavingEnabled(enabled: boolean): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.update({ controllerPowerSavingEnabled: enabled });
    if (this.snapshot.state === 'connected') {
      const wasActive = this.controllerPowerSavingActive;
      this.controllerPowerSavingActive = this.isControllerPowerSavingActive(this.snapshot.settings);
      if (wasActive !== this.controllerPowerSavingActive) {
        await this.applyControllerPowerSavingSensitiveSettings(this.snapshot.settings, true);
      }
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  setUiScalePercent(value: UiScalePercent): BridgeSnapshot {
    this.snapshot.settings = this.settingsStore.update({
      uiScalePercent: normalizeUiScalePercent(value)
    });
    this.emitSnapshot();
    return this.getSnapshot();
  }

  setUiThemePreset(value: UiThemePreset): BridgeSnapshot {
    this.snapshot.settings = this.settingsStore.update({
      uiThemePreset: normalizeUiThemePreset(value)
    });
    this.emitSnapshot();
    return this.getSnapshot();
  }

  setLaunchAtStartupEnabled(enabled: boolean): BridgeSnapshot {
    this.snapshot.settings = this.settingsStore.update({
      launchAtStartupEnabled: enabled
    });
    this.emitSnapshot();
    return this.getSnapshot();
  }

  setShowBatteryPercentTrayIcon(enabled: boolean): BridgeSnapshot {
    this.snapshot.settings = this.settingsStore.update({
      showBatteryPercentTrayIcon: enabled
    });
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setPollingRateMode(mode: PollingRateMode): Promise<BridgeSnapshot> {
    const normalizedMode = normalizePollingRateMode(mode);
    await this.sendSettingCommand(
      COMMAND_ID.SET_POLLING_RATE_MODE,
      pollingRateModeValue(normalizedMode),
      { pollingRateMode: normalizedMode }
    );
    return this.getSnapshot();
  }

  async sleepController(): Promise<BridgeSnapshot> {
    await this.sendCommand(COMMAND_ID.SLEEP_CONTROLLER, 0, {
      throwOnCommandError: false
    });
    return this.getSnapshot();
  }

  async mountPicoBootloader(): Promise<void> {
    await this.sendCommand(COMMAND_ID.ENTER_BOOTLOADER, 0, {
      allowAckTransportLoss: true,
      allowProtocolMismatch: true
    });
  }

  async setNotifyControllerConnection(enabled: boolean): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.update({ notifyControllerConnection: enabled });
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setNotifyLowBattery(enabled: boolean): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.update({ notifyLowBattery: enabled });
    this.lowBatteryToastActive = false;
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async testNotification(): Promise<BridgeSnapshot> {
    this.emit('toast', {
      title: 'DS5 Bridge',
      body: 'Notifications are working.'
    } satisfies BridgeToast);
    return this.getSnapshot();
  }

  async testHaptics(): Promise<BridgeSnapshot> {
    const transition = this.hostPersonaTransitionMaskSnapshot();
    if (transition) {
      return this.skipBridgeHapticsTest(`switching to ${transition.to}`);
    }

    const settings = this.settingsStore.get();
    const hostPersonaMode = this.currentHostPersonaMode();
    try {
      await playBridgeHapticsTestPattern(settings.hapticsGainPercent, hostPersonaMode);
    } catch (error) {
      if (this.isBridgeRenderEndpointUnavailableError(error)) {
        return this.skipBridgeHapticsTest(`${hostPersonaModeLabel(hostPersonaMode)} audio endpoint unavailable`);
      }
      throw error;
    }
    return this.getSnapshot();
  }

  async testSpeaker(): Promise<BridgeSnapshot> {
    const settings = this.settingsStore.get();
    await playBridgeSpeakerTestTone(settings.speakerVolumePercent, this.currentHostPersonaMode());
    return this.getSnapshot();
  }

  async testClassicRumble(): Promise<BridgeSnapshot> {
    await this.sendCommand(COMMAND_ID.TEST_CLASSIC_RUMBLE, 0, { throwOnCommandError: false });
    return this.getSnapshot();
  }

  async testAdaptiveTriggers(
    mode = this.settingsStore.get().triggerTestMode,
    target: TriggerTestTarget = 'both'
  ): Promise<BridgeSnapshot> {
    const value = triggerTestModeValue(mode) | (triggerTestTargetValue(target) << 8);
    await this.sendCommand(COMMAND_ID.TEST_ADAPTIVE_TRIGGERS, value, {
      throwOnCommandError: false
    });
    return this.getSnapshot();
  }

  async setHostPersonaMode(mode: HostPersonaMode): Promise<BridgeSnapshot> {
    const normalizedMode = normalizeHostPersonaMode(mode);
    const previousMode = this.snapshot.status?.hostPersonaMode ?? this.snapshot.settings.hostPersonaMode;
    const shouldRestoreDefaultRender = previousMode !== normalizedMode
      ? await this.defaultRenderIsBridgeEndpoint()
      : false;
    const ack = await this.sendCommand(COMMAND_ID.SET_HOST_PERSONA, hostPersonaModeValue(normalizedMode), {
      expectSettingsRevisionChange: true
    });
    if (ack.resultCode === ACK_RESULT.OK) {
      this.snapshot.settings = this.settingsStore.update({ hostPersonaMode: normalizedMode });
      if (previousMode !== normalizedMode) {
        if (shouldRestoreDefaultRender) {
          this.queueHostPersonaDefaultRenderRestore(normalizedMode);
        } else {
          this.hostPersonaDefaultRenderRestore = null;
        }
        this.beginHostPersonaTransition(normalizedMode, previousMode);
        this.systemAudioHapticsRetryAt = 0;
        await this.systemAudioHapticsEngine.stop();
        this.applyHostPersonaTransitionSnapshot(this.snapshot.diagnostics.rawDevices);
      }
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  async previewAdaptiveTriggerEffect(effect: AdaptiveTriggerPreviewEffect): Promise<BridgeSnapshot> {
    const normalized = normalizeAdaptiveTriggerPreviewEffect(effect);
    const value = triggerTestModeValue(normalized.mode) | (triggerTestTargetValue(normalized.target) << 8);
    await this.sendCommand(COMMAND_ID.PREVIEW_ADAPTIVE_TRIGGER_EFFECT, value, {
      extraPayload: [normalized.startPercent, normalized.wallPercent, normalized.forcePercent],
      throwOnCommandError: false
    });
    return this.getSnapshot();
  }

  async applyAdaptiveTriggerEffect(effect: AdaptiveTriggerPreviewEffect): Promise<BridgeSnapshot> {
    const normalized = normalizeAdaptiveTriggerPreviewEffect(effect);
    const value = triggerTestModeValue(normalized.mode) | (triggerTestTargetValue(normalized.target) << 8);
    await this.sendCommand(COMMAND_ID.APPLY_ADAPTIVE_TRIGGER_EFFECT, value, {
      extraPayload: [normalized.startPercent, normalized.wallPercent, normalized.forcePercent],
      throwOnCommandError: false
    });
    return this.getSnapshot();
  }

  async resetAdaptiveTriggers(): Promise<BridgeSnapshot> {
    await this.sendCommand(COMMAND_ID.RESET_ADAPTIVE_TRIGGERS, 0, { throwOnCommandError: false });
    return this.getSnapshot();
  }

  async restoreDefaults(): Promise<BridgeSnapshot> {
    const ack = await this.sendCommand(COMMAND_ID.RESTORE_DEFAULTS, 0, { expectSettingsRevisionChange: true });
    if (ack.resultCode === ACK_RESULT.OK) {
      this.snapshot.settings = this.settingsStore.restoreDefaults();
      await this.updateSystemAudioHapticsEngine();
      this.emitSnapshot();
    }
    return this.getSnapshot();
  }

  async applyPreset(presetId: BridgePresetId): Promise<BridgeSnapshot> {
    const normalizedPresetId = normalizeBridgePresetId(presetId);
    this.snapshot.settings = this.settingsStore.applyPreset(
      normalizedPresetId,
      normalizedPresetId === 'custom' ? undefined : PRESET_SETTINGS[normalizedPresetId]
    );
    if (this.snapshot.state === 'connected') {
      await this.applyCurrentSettings(this.snapshot.settings, false);
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async selectControllerProfile(profileId: string): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.selectControllerProfile(profileId);
    if (this.snapshot.state === 'connected') {
      await this.applyCurrentSettings(this.snapshot.settings, false);
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async saveControllerProfile(name?: string): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.saveControllerProfile(name);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async updateControllerProfile(profileId: string): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.updateControllerProfile(profileId);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async renameControllerProfile(profileId: string, name: string): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.renameControllerProfile(profileId, name);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async deleteControllerProfile(profileId: string): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.deleteControllerProfile(profileId);
    if (this.snapshot.state === 'connected') {
      await this.applyCurrentSettings(this.snapshot.settings, false);
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setButtonRemap(buttonId: RemapButtonId, targetId: RemapButtonId): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.setButtonRemap(buttonId, targetId);
    if (this.snapshot.state === 'connected') {
      await this.applyButtonRemapping(this.snapshot.settings, true);
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async selectButtonRemappingProfile(profileId: string): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.selectButtonRemappingProfile(profileId);
    if (this.snapshot.state === 'connected') {
      await this.applyButtonRemapping(this.snapshot.settings, true);
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async saveButtonRemappingProfile(name?: string): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.saveButtonRemappingProfile(name);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async updateButtonRemappingProfile(profileId: string): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.updateButtonRemappingProfile(profileId);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async renameButtonRemappingProfile(profileId: string, name: string): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.renameButtonRemappingProfile(profileId, name);
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async deleteButtonRemappingProfile(profileId: string): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.deleteButtonRemappingProfile(profileId);
    if (this.snapshot.state === 'connected') {
      await this.applyButtonRemapping(this.snapshot.settings, true);
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async restoreButtonRemappingDefaults(): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.restoreButtonRemappingDefaults();
    if (this.snapshot.state === 'connected') {
      await this.applyButtonRemapping(this.snapshot.settings, true);
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setChordConfiguration(functions: ChordFunction[], assignments: ChordAssignment[]): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.setChordConfiguration(functions, assignments);
    if (this.snapshot.state === 'connected') {
      await this.applyChordBindings(this.snapshot.settings);
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setChordFunctions(functions: ChordFunction[]): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.setChordFunctions(functions);
    if (this.snapshot.state === 'connected') {
      await this.applyChordBindings(this.snapshot.settings);
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setChordAssignments(assignments: ChordAssignment[]): Promise<BridgeSnapshot> {
    this.snapshot.settings = this.settingsStore.setChordAssignments(assignments);
    if (this.snapshot.state === 'connected') {
      await this.applyChordBindings(this.snapshot.settings);
    }
    this.emitSnapshot();
    return this.getSnapshot();
  }

  private async applyButtonRemapping(
    settings: CompanionSettings,
    expectSettingsRevisionChange: boolean
  ): Promise<void> {
    await this.sendCommand(COMMAND_ID.SET_BUTTON_REMAP, 0, {
      expectSettingsRevisionChange,
      extraPayload: buildButtonRemapPayload(settings.buttonRemappingDraft)
    });
  }

  private async applyChordBindings(settings: CompanionSettings): Promise<void> {
    await this.sendCommand(COMMAND_ID.SET_CHORD_BINDINGS, settings.chordAssignments.length, {
      throwOnCommandError: false,
      extraPayload: buildChordBindingsPayload(settings.chordAssignments)
    });
  }

  private async sendSettingCommand(
    commandId: number,
    value: number,
    settingUpdate: Partial<CompanionSettings>
  ): Promise<void> {
    const ack = await this.sendCommand(commandId, value, { expectSettingsRevisionChange: true });
    if (ack.resultCode === ACK_RESULT.OK) {
      this.snapshot.settings = this.settingsStore.update(settingUpdate);
      this.emitSnapshot();
    }
  }

  private enqueueCommand<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.commandQueue.then(operation, operation);
    this.commandQueue = run.catch(() => undefined);
    return run;
  }

  private acceptCommandTransportLoss(
    commandId: number,
    sequence: number,
    previousSettingsRevision: number | null
  ): BridgeAckPayload {
    const ack = {
      commandId: commandId & 0xff,
      commandSequence: sequence,
      resultCode: ACK_RESULT.OK,
      detailCode: 0,
      settingsRevision: previousSettingsRevision ?? 0,
      uptimeSeconds: this.snapshot.diagnostics.uptimeSeconds ?? 0,
      protocolVersion: this.snapshot.diagnostics.protocolVersion ?? 'unknown'
    };
    this.snapshot.diagnostics.lastAck = ack;
    this.snapshot.diagnostics.lastError = null;
    this.emitSnapshot();
    this.closeDevice();
    return ack;
  }

  private async sendCommand(commandId: number, value: number, options: CommandOptions = {}) {
    return this.enqueueCommand(async () => {
      await this.ensureCompanionDevice(options.allowProtocolMismatch ? { allowProtocolMismatch: true } : undefined);
      if (!this.device) {
        throw new Error('No companion bridge is connected.');
      }

      const sequence = this.nextSequence();
      const protocolMinor = this.commandProtocolMinorFor(options);
      const previousSettingsRevision = this.snapshot.diagnostics.settingsRevision;
      try {
        const commandReport = protocolMinor === undefined
          ? buildCommandReport(commandId, sequence, value, options.extraPayload)
          : buildCommandReport(commandId, sequence, value, options.extraPayload, { protocolMinor });
        await this.device.sendFeatureReport(commandReport);
      } catch (error) {
        if (!options.allowAckTransportLoss || !isBridgeTransportError(error)) {
          throw error;
        }
        return this.acceptCommandTransportLoss(commandId, sequence, previousSettingsRevision);
      }
      let ack: BridgeAckPayload;
      try {
        const rawAckReport = await this.device.getFeatureReport(REPORT_ID.ACK, REPORT_LENGTH);
        ack = options.allowProtocolMismatch
          ? parseAckReport(rawAckReport, { allowProtocolMismatch: true })
          : parseAckReport(rawAckReport);
      } catch (error) {
        if (!options.allowAckTransportLoss || !isBridgeTransportError(error)) {
          throw error;
        }
        return this.acceptCommandTransportLoss(commandId, sequence, previousSettingsRevision);
      }
      this.snapshot.diagnostics.lastAck = ack;
      if (ack.commandId !== (commandId & 0xff) || ack.commandSequence !== sequence) {
        const message = `Stale companion ACK: expected command 0x${(commandId & 0xff).toString(16).padStart(2, '0')} sequence ${sequence}, received command 0x${ack.commandId.toString(16).padStart(2, '0')} sequence ${ack.commandSequence}.`;
        this.snapshot.diagnostics.lastError = message;
        this.emitSnapshot();
        throw new Error(message);
      }
      this.snapshot.diagnostics.settingsRevision = ack.settingsRevision;
      this.snapshot.diagnostics.lastError = ack.resultCode === ACK_RESULT.OK ? null : ackUserMessage(ack.resultCode);
      this.emitSnapshot();

      if (ack.resultCode !== ACK_RESULT.OK) {
        if (options.throwOnCommandError === false) {
          return ack;
        }
        throw new Error(ackUserMessage(ack.resultCode));
      }
      if (
        options.expectSettingsRevisionChange
        && previousSettingsRevision !== null
        && ack.settingsRevision === previousSettingsRevision
      ) {
        const message = 'Firmware accepted the setting but did not advance settings_revision.';
        this.snapshot.diagnostics.lastError = message;
        this.emitSnapshot();
        throw new Error(message);
      }
      return ack;
    });
  }

  private async updateSystemAudioHapticsEngine(): Promise<void> {
    const settings = this.settingsStore.get();
    if (
      !this.systemAudioHapticsDesired(settings)
      || !this.device
      || !this.controllerAudioReady()
      || !this.systemAudioHapticsSupported()
    ) {
      const wasPassthroughActive = this.systemAudioHapticsPassthroughActive;
      this.systemAudioHapticsPassthroughActive = false;
      this.systemAudioHapticsRetryAt = 0;
      await this.systemAudioHapticsEngine.stop();
      if (wasPassthroughActive && this.device && this.audioReactiveHapticsSupported()) {
        await this.applyAudioReactiveHapticsSettings(settings, false);
      }
      return;
    }

    if (Date.now() < this.systemAudioHapticsRetryAt) {
      await this.systemAudioHapticsEngine.stop();
      return;
    }

    try {
      await this.systemAudioHapticsEngine.start(this.systemAudioHapticsConfig(settings), this.currentHostPersonaMode());
      if (this.systemAudioHapticsPassthroughActive) {
        this.systemAudioHapticsPassthroughActive = false;
        await this.applyAudioReactiveHapticsSettings(settings, false);
      }
      this.systemAudioHapticsRetryAt = 0;
    } catch (error) {
      await this.systemAudioHapticsEngine.stop();
      if (this.systemAudioHapticsPassthroughActive) {
        this.systemAudioHapticsRetryAt = Date.now() + SYSTEM_AUDIO_HAPTICS_BYPASS_RETRY_MS;
        await this.applyAudioReactiveHapticsSettings(settings, false);
        this.appendAudioDebugLines([
          `[SystemHaptics] mirror bypassed because Windows output is already DS5 Bridge; firmware passthrough active retryInMs=${SYSTEM_AUDIO_HAPTICS_BYPASS_RETRY_MS}`
        ]);
        return;
      }
      this.systemAudioHapticsRetryAt = Date.now() + SYSTEM_AUDIO_HAPTICS_RETRY_MS;
      const message = error instanceof Error ? error.message : String(error);
      this.appendAudioDebugLines([
        `[SystemHaptics] capture unavailable retryInMs=${SYSTEM_AUDIO_HAPTICS_RETRY_MS} error=${message}`
      ]);
    }
  }

  private async handleSystemAudioHapticsStatus(line: string): Promise<void> {
    if (!line) {
      return;
    }

    try {
      const settings = this.settingsStore.get();
      if (
        line.includes('route-changed')
        && this.systemAudioHapticsDesired(settings)
      ) {
        this.systemAudioHapticsRetryAt = 0;
        await this.systemAudioHapticsEngine.stop();
        await this.updateSystemAudioHapticsEngine();
        return;
      }

      if (
        line.includes('system-haptics-bypassed')
        && line.includes('reason=source-is-bridge')
        && this.systemAudioHapticsDesired(settings)
      ) {
        if (!this.systemAudioHapticsPassthroughActive) {
          this.systemAudioHapticsPassthroughActive = true;
          if (this.device && this.audioReactiveHapticsSupported()) {
            await this.applyAudioReactiveHapticsSettings(settings, false);
          }
          this.emitSnapshot();
        }
        return;
      }

      if (
        this.systemAudioHapticsPassthroughActive
        && (
          line.includes('source=system-haptics-mirror')
          || line.includes('status: recording-started')
        )
      ) {
        this.systemAudioHapticsPassthroughActive = false;
        if (this.device && this.audioReactiveHapticsSupported()) {
          await this.applyAudioReactiveHapticsSettings(settings, false);
        }
        this.emitSnapshot();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.appendAudioDebugLines([`[SystemHaptics] status handling failed: ${message}`]);
    }
  }

  private async updateMicKeepaliveEngine(controllerConnected: boolean): Promise<void> {
    try {
      const settings = this.settingsStore.get();
      if (
        !MIC_KEEPALIVE_ENABLED
        || !controllerConnected
        || !settings.duplexMicEnabled
        || settings.micMuted
      ) {
        await this.micKeepaliveEngine.stop();
        return;
      }
      await this.micKeepaliveEngine.start();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.appendAudioDebugLines([`[MicKeepalive] error: ${message}`]);
    }
  }

  private async pulseSystemAudioHaptics(): Promise<void> {
    const settings = this.settingsStore.get();
    if (!this.systemAudioHapticsDesired(settings)) {
      await this.updateSystemAudioHapticsEngine();
      return;
    }
    if (!this.controllerAudioReady() || this.reapplyActive) {
      await this.updateSystemAudioHapticsEngine();
      return;
    }
    await this.ensureCompanionDevice();
    await this.updateSystemAudioHapticsEngine();
  }

  private async poll(): Promise<void> {
    const now = Date.now();
    if (now < this.pollPausedUntil) {
      return;
    }
    const currentSettings = this.settingsStore.get();

    const rawDevices = await this.hidDiscovery.listDevices();
    let status: BridgeStatusPayload | null;
    try {
      status = await this.openAndReadStatus();
    } catch (error) {
      if (!(error instanceof ProtocolError)) {
        throw error;
      }
      this.noteControllerUnavailableForToasts();
      this.snapshot = {
        state: 'incompatible',
        message: FIRMWARE_UPDATE_REQUIRED_MESSAGE,
        status: null,
        settings: this.settingsStore.get(),
        diagnostics: this.withAudioDebugDiagnostics({
          ...emptyDiagnostics(rawDevices),
          hidPath: this.devicePath,
          lastError: error.message,
          lastPollAt: Date.now()
        })
      };
      this.emitSnapshot();
      return;
    }
    if (!status) {
      this.closeDevice();
      const normalFirmwarePresent = rawDevices.some(isDualSenseDevice);
      this.markBridgeUnavailableAfterDisconnect(rawDevices, normalFirmwarePresent);
      this.emitSnapshot();
      return;
    }

    if (!isSupportedFirmwareVersion(status.firmwareVersion)) {
      this.noteControllerUnavailableForToasts();
      this.snapshot = {
        state: 'incompatible',
        message: FIRMWARE_UPDATE_REQUIRED_MESSAGE,
        status,
        settings: this.settingsStore.get(),
        diagnostics: this.withAudioDebugDiagnostics({
          hidPath: this.devicePath,
          protocolVersion: status.protocolVersion,
          uptimeSeconds: status.uptimeSeconds,
          settingsRevision: status.settingsRevision,
          lastAck: this.snapshot.diagnostics.lastAck,
          lastError: `Firmware ${status.firmwareVersion} is too old for this companion app. Update the bridge firmware to ${MIN_SUPPORTED_FIRMWARE_VERSION} or newer.`,
          firmwareUpdateAvailable: null,
          lastPollAt: Date.now(),
          rawDevices
        })
      };
      this.emitSnapshot();
      return;
    }

    const transition = this.advanceHostPersonaTransition(status, now);
    const completedHostPersonaMode = this.consumeCompletedHostPersonaMode();
    const controllerAudioReady = this.controllerAudioReady(status);

    if (!controllerAudioReady) {
      await this.stopControllerAudioPolling();
    }
    await this.readTriggerTraceThrottled();
    await this.readFeedbackTraceThrottled();
    await this.readAudioDebugThrottled(true);
    await this.readAudioStatus();
    this.maybeEmitStatusToasts(status);

    const previousUptime = this.lastUptimeSeconds;
    const isNewSession = this.sessionKey === null
      || this.sessionPath !== this.devicePath
      || (previousUptime !== null && status.uptimeSeconds < previousUptime)
      || previousUptime === null;

    if (isNewSession) {
      this.sessionKey = `${this.devicePath ?? 'unknown'}:${Date.now()}`;
      this.sessionPath = this.devicePath;
      this.resetStartupReapplyState();
    }
    this.lastUptimeSeconds = status.uptimeSeconds;

    let settings = this.settingsStore.get();
    if (
      this.reappliedSessionKey === this.sessionKey
      && settings.duplexMicEnabled
      && settings.micMuted !== status.micMuted
    ) {
      settings = this.settingsStore.update(customSettingUpdate({ micMuted: status.micMuted }));
    }
    const state = transition ? 'transitioning' : 'connected';

    this.snapshot = {
      state,
      message: transition ? this.hostPersonaTransitionMessage(transition) : 'Companion firmware connected',
      status,
      settings: {
        ...settings,
        idleDisconnectTimeoutMinutes: status.idleDisconnectTimeoutMinutes
      },
      diagnostics: this.withAudioDebugDiagnostics({
        hidPath: this.devicePath,
        protocolVersion: status.protocolVersion,
        uptimeSeconds: status.uptimeSeconds,
        settingsRevision: status.settingsRevision,
        lastAck: this.snapshot.diagnostics.lastAck,
        lastError: null,
        firmwareUpdateAvailable: firmwareUpdateAvailable(status.firmwareVersion),
        lastPollAt: Date.now(),
        rawDevices
      }),
      personaTransition: transition
    };
    this.emitSnapshot();
    if (transition) {
      this.scheduleHostPersonaTransitionPoll();
    }
    await this.restoreHostPersonaDefaultRenderIfReady(status);
    if (completedHostPersonaMode) {
      await this.restartSystemAudioHapticsAfterPersonaTransition(completedHostPersonaMode);
    }
    await this.updateMicKeepaliveEngine(status.controllerConnected);
    await this.syncControllerPowerSavingState(settings);

    if (status.controllerConnected) {
      if (this.controllerConnectedSince === 0) {
        this.controllerConnectedSince = Date.now();
      }
      void this.reapplySettingsUntilSettled();
    } else {
      this.controllerConnectedSince = 0;
      this.reapplyAttempt = 0;
      this.nextReapplyAt = 0;
    }
    await this.pollShortcutEvent();
  }

  private commandProtocolMinorFor(options: CommandOptions): number | undefined {
    if (!options.allowProtocolMismatch) {
      return undefined;
    }
    const version = this.incompatibleCompanionProtocolVersion;
    return version?.major === PROTOCOL_MAJOR && version.minor <= PROTOCOL_MINOR
      ? version.minor
      : undefined;
  }

  private rememberIncompatibleProtocolVersion(report: ArrayLike<number>): void {
    try {
      this.incompatibleCompanionProtocolVersion = readReportProtocolVersion(report, REPORT_ID.STATUS);
    } catch {
      this.incompatibleCompanionProtocolVersion = null;
    }
  }

  private async ensureCompanionDevice(options: { allowProtocolMismatch?: boolean } = {}): Promise<void> {
    if (this.device) {
      return;
    }
    try {
      await this.openAndReadStatus();
    } catch (error) {
      if (options.allowProtocolMismatch && isProtocolMismatch(error) && this.device) {
        return;
      }
      throw error;
    }
  }

  private async openAndReadStatus() {
    try {
      if (!this.device) {
        this.device = await WinUsbCompanionTransport.open({
          retryTimeoutMs: this.isHostPersonaTransitionActive() ? HOST_PERSONA_TRANSITION_OPEN_RETRY_MS : 0
        });
        const openedDevice = this.device;
        this.device.on('error', (error: Error) => this.publishError(error));
        this.device.on('close', () => {
          void this.handleCompanionTransportClose(openedDevice);
        });
        this.devicePath = this.device.path;
        this.shortcutFeaturePollRetryAt = 0;
        this.lastUptimeSeconds = null;
        this.sessionKey = null;
        this.sessionPath = null;
        this.resetStartupReapplyState();
      }
      const rawStatusReport = await this.device.getFeatureReport(REPORT_ID.STATUS, REPORT_LENGTH);
      let status: BridgeStatusPayload;
      try {
        status = parseStatusReport(rawStatusReport);
        this.incompatibleCompanionProtocolVersion = null;
      } catch (error) {
        if (isProtocolMismatch(error)) {
          this.rememberIncompatibleProtocolVersion(rawStatusReport);
        }
        throw error;
      }
      return status;
    } catch (error) {
      if (error instanceof ProtocolError) {
        throw error;
      }
      this.closeDevice();
    }
    return null;
  }

  private async handleCompanionTransportClose(closedDevice: WinUsbCompanionTransport): Promise<void> {
    if (this.device !== closedDevice) {
      return;
    }
    this.closeDevice();
    let rawDevices: HidDeviceSummary[] = [];
    try {
      rawDevices = await this.hidDiscovery.listDevices();
    } catch (error) {
      this.publishError(error);
    }
    const normalFirmwarePresent = rawDevices.some(isDualSenseDevice);
    this.markBridgeUnavailableAfterDisconnect(rawDevices, normalFirmwarePresent);
    this.emitSnapshot();
  }

  private maybeEmitStatusToasts(status: BridgeStatusPayload): void {
    const settings = this.settingsStore.get();
    const controllerConnected = status.controllerConnected;

    if (
      settings.notifyControllerConnection
      && this.previousControllerConnected !== null
      && this.previousControllerConnected !== controllerConnected
    ) {
      this.emit('toast', {
        title: 'DS5 Bridge',
        body: controllerConnected ? 'Controller connected' : 'Controller disconnected'
      } satisfies BridgeToast);
    }
    this.previousControllerConnected = controllerConnected;

    const lowBattery = controllerConnected
      && status.batteryPercent !== null
      && status.batteryPercent <= LOW_BATTERY_PERCENT;
    if (settings.notifyLowBattery && lowBattery && !this.lowBatteryToastActive) {
      this.emit('toast', {
        title: 'DS5 Bridge',
        body: `Controller battery low: ${status.batteryPercent}%`
      } satisfies BridgeToast);
    }
    this.lowBatteryToastActive = lowBattery;
  }

  private noteControllerUnavailableForToasts(): void {
    const settings = this.settingsStore.get();
    if (settings.notifyControllerConnection && this.previousControllerConnected === true) {
      this.emit('toast', {
        title: 'DS5 Bridge',
        body: 'Controller disconnected'
      } satisfies BridgeToast);
    }
    this.previousControllerConnected = false;
    this.lowBatteryToastActive = false;
  }

  private resetStartupReapplyState(): void {
    this.reappliedSessionKey = null;
    this.controllerConnectedSince = 0;
    this.reapplyAttempt = 0;
    this.nextReapplyAt = 0;
  }

  private async reapplySettingsUntilSettled(): Promise<void> {
    if (!this.sessionKey || this.reapplyActive || this.reappliedSessionKey === this.sessionKey) {
      return;
    }
    const now = Date.now();
    if (now < this.nextReapplyAt) {
      return;
    }
    if (this.controllerConnectedSince && now - this.controllerConnectedSince < STARTUP_REAPPLY_MIN_SETTLE_MS) {
      this.nextReapplyAt = this.controllerConnectedSince + STARTUP_REAPPLY_MIN_SETTLE_MS;
      return;
    }

    this.reapplyActive = true;
    let reapplied = false;
    try {
      const settings = this.settingsStore.get();
      await this.applyCurrentSettings(settings, this.reapplyAttempt === 0);
      this.reappliedSessionKey = this.sessionKey;
      reapplied = true;
    } catch (error) {
      this.publishError(error);
    } finally {
      this.reapplyActive = false;
    }
    if (reapplied) {
      await this.updateSystemAudioHapticsEngine();
    }
  }

  private async applyCurrentSettings(settings: CompanionSettings, expectSettingsRevisionChange: boolean): Promise<void> {
    await this.applyLightbarSettings(settings, expectSettingsRevisionChange);
    await this.sendCommand(COMMAND_ID.SET_MUTE_BUTTON_ACTION, muteButtonModeValue(settings.muteButtonMode), {
      expectSettingsRevisionChange,
      extraPayload: [
        settings.muteKeyboardUsage,
        encodeMuteKeyboardOptions(
          settings.muteKeyboardModifiers,
          settings.muteKeyboardBehavior,
          settings.muteButtonMode === 'keyboard' && settings.muteKeyboardChordStarterEnabled
        )
      ]
    });
    await this.sendCommand(COMMAND_ID.SET_HAPTICS_GAIN, this.effectiveHapticsGain(settings), {
      expectSettingsRevisionChange
    });
    await this.sendCommand(COMMAND_ID.SET_HAPTICS_BUFFER_LENGTH, settings.hapticsBufferLength, {
      expectSettingsRevisionChange
    });
    await this.applyAudioReactiveHapticsSettings(settings, expectSettingsRevisionChange);
    if (!this.reapplyActive) {
      await this.updateSystemAudioHapticsEngine();
    }
    await this.sendCommand(
      COMMAND_ID.SET_CLASSIC_RUMBLE_GAIN,
      this.effectiveClassicRumbleGain(settings),
      { expectSettingsRevisionChange }
    );
    await this.sendCommand(COMMAND_ID.SET_CLASSIC_RUMBLE_V1, settings.classicRumbleV1Enabled ? 1 : 0, {
      expectSettingsRevisionChange
    });
    await this.sendCommand(
      COMMAND_ID.SET_TRIGGER_EFFECT_INTENSITY,
      this.effectiveTriggerEffectIntensity(settings),
      { expectSettingsRevisionChange }
    );
    if (!settings.adaptiveTriggersEnabled) {
      await this.sendCommand(COMMAND_ID.RESET_ADAPTIVE_TRIGGERS, 0, { throwOnCommandError: false });
    }
    await this.applySpeakerSettings(settings, expectSettingsRevisionChange);
    await this.applyMicSettings(settings, expectSettingsRevisionChange);
    await this.sendCommand(COMMAND_ID.SET_LED_ENABLED, settings.ledEnabled ? 1 : 0, {
      expectSettingsRevisionChange
    });
    await this.sendCommand(COMMAND_ID.SET_PLAYER_LED_ENABLED, settings.playerLedEnabled ? 1 : 0, {
      expectSettingsRevisionChange
    });
    await this.sendCommand(COMMAND_ID.SET_IDLE_DISCONNECT_ENABLED, settings.idleDisconnectEnabled ? 1 : 0, {
      expectSettingsRevisionChange
    });
    await this.sendCommand(COMMAND_ID.SET_IDLE_DISCONNECT_TIMEOUT, settings.idleDisconnectTimeoutMinutes, {
      expectSettingsRevisionChange
    });
    await this.sendCommand(
      COMMAND_ID.SET_USB_SUSPEND_DISCONNECT_ENABLED,
      settings.usbSuspendDisconnectEnabled ? 1 : 0,
      { expectSettingsRevisionChange }
    );
    await this.sendCommand(
      COMMAND_ID.SET_SLEEP_KEYBIND_ENABLED,
      settings.sleepKeybindEnabled ? 1 : 0,
      { expectSettingsRevisionChange }
    );
    await this.sendCommand(
      COMMAND_ID.SET_SPEAKER_VOLUME_SHORTCUT_ENABLED,
      settings.speakerVolumeShortcutEnabled ? 1 : 0,
      { expectSettingsRevisionChange }
    );
    await this.applyButtonRemapping(settings, expectSettingsRevisionChange);
    await this.applyChordBindings(settings);
    await this.sendCommand(
      COMMAND_ID.SET_POLLING_RATE_MODE,
      pollingRateModeValue(settings.pollingRateMode),
      { expectSettingsRevisionChange }
    );
    await this.sendCommand(
      COMMAND_ID.SET_HOST_PERSONA,
      hostPersonaModeValue(settings.hostPersonaMode),
      { expectSettingsRevisionChange }
    );
  }

  private async applyLightbarSettings(settings: CompanionSettings, expectSettingsRevisionChange: boolean): Promise<void> {
    const color = settings.lightbarEnabled ? parseHexColor(settings.lightbarColor) : { red: 0, green: 0, blue: 0 };
    await this.sendCommand(
      COMMAND_ID.SET_LIGHTBAR_COLOR,
      this.effectiveLightbarBrightness(settings),
      {
        expectSettingsRevisionChange,
        extraPayload: [color.red, color.green, color.blue]
      }
    );
    await this.sendCommand(COMMAND_ID.SET_LIGHTBAR_OVERRIDE, (!settings.lightbarEnabled || settings.lightbarOverrideEnabled) ? 1 : 0, {
      expectSettingsRevisionChange
    });
  }

  private async applySpeakerSettings(settings: CompanionSettings, expectSettingsRevisionChange: boolean): Promise<void> {
    await this.sendCommand(COMMAND_ID.SET_SPEAKER_GAIN, settings.speakerGainLevel, {
      expectSettingsRevisionChange
    });
    await this.setFirmwareSpeakerVolume(settings.speakerEnabled ? settings.speakerVolumePercent : 0, expectSettingsRevisionChange);
  }

  private async applyMicSettings(settings: CompanionSettings, expectSettingsRevisionChange: boolean): Promise<void> {
    await this.sendCommand(COMMAND_ID.SET_DUPLEX_ENABLED, settings.duplexMicEnabled ? 1 : 0, {
      expectSettingsRevisionChange
    });
    await this.sendCommand(COMMAND_ID.SET_MIC_VOLUME, settings.micVolumePercent, {
      expectSettingsRevisionChange
    });
    await this.sendCommand(COMMAND_ID.SET_MIC_MUTE, settings.micMuted ? 1 : 0, {
      expectSettingsRevisionChange
    });
  }

  private async setFirmwareSpeakerVolume(percent: number, expectSettingsRevisionChange: boolean): Promise<void> {
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    await this.sendCommand(COMMAND_ID.SET_SPEAKER_VOLUME, value, {
      expectSettingsRevisionChange
    });
    if (this.snapshot.status) {
      this.snapshot.status.speakerVolumePercent = value;
    }
  }

  private nextSequence(): number {
    this.commandSequence = (this.commandSequence + 1) & 0xff;
    return this.commandSequence;
  }

  private publishError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    if (this.applyHostPersonaTransitionSnapshot(this.snapshot.diagnostics.rawDevices)) {
      this.appendAudioDebugLines([`[HostBridge] masked persona transition error: ${message}`]);
      this.emitSnapshot();
      return;
    }

    const isIncompatible = error instanceof ProtocolError && error.code === 'bad-version';
    this.snapshot = {
      ...this.snapshot,
      state: isIncompatible ? 'incompatible' : this.snapshot.state === 'no-bridge' ? 'no-bridge' : 'error',
      message: isIncompatible ? FIRMWARE_UPDATE_REQUIRED_MESSAGE : message,
      diagnostics: {
        ...this.snapshot.diagnostics,
        lastError: message,
        firmwareUpdateAvailable: null,
        lastPollAt: Date.now()
      }
    };
    this.emitSnapshot();
  }

  private closeDevice(): void {
    const device = this.device;
    this.device = null;
    if (device) {
      try {
        device.removeAllListeners();
        device.close();
      } catch {
        // Ignore close races while Windows removes the WinUSB path.
      }
    }
    this.devicePath = null;
    this.audioStatus = null;
    this.incompatibleCompanionProtocolVersion = null;
    this.triggerTraceSupported = null;
    this.feedbackTraceSupported = null;
    this.controllerPowerSavingActive = null;
    this.systemAudioHapticsRetryAt = 0;
    this.systemAudioHapticsPassthroughActive = false;
    void this.stopControllerAudioPolling();
  }

  private markBridgeUnavailableAfterDisconnect(rawDevices: HidDeviceSummary[], normalFirmwarePresent = false): void {
    if (this.applyHostPersonaTransitionSnapshot(rawDevices)) {
      return;
    }

    this.lastUptimeSeconds = null;
    this.sessionKey = null;
    this.sessionPath = null;
    this.reapplyActive = false;
    this.noteControllerUnavailableForToasts();
    this.lowBatteryToastActive = false;
    this.resetStartupReapplyState();
    this.snapshot = {
      state: normalFirmwarePresent ? 'normal-firmware' : 'no-bridge',
      message: normalFirmwarePresent
        ? 'Companion firmware required'
        : 'No bridge detected',
      status: null,
      settings: this.settingsStore.get(),
      diagnostics: this.withAudioDebugDiagnostics(emptyDiagnostics(rawDevices))
    };
  }

  private emitSnapshot(): void {
    const personaTransition = this.snapshot.state === 'transitioning'
      ? this.hostPersonaTransitionMaskSnapshot()
      : this.hostPersonaTransitionSnapshot();
    this.snapshot = {
      ...this.snapshot,
      personaTransition
    };
    const signature = JSON.stringify({
      state: this.snapshot.state,
      message: this.snapshot.message,
      status: this.snapshot.status
        ? {
            ...this.snapshot.status,
            uptimeSeconds: 0
          }
        : null,
      settings: this.snapshot.settings,
      personaTransition: this.snapshot.personaTransition,
      diagnostics: {
        hidPath: this.snapshot.diagnostics.hidPath,
        protocolVersion: this.snapshot.diagnostics.protocolVersion,
        settingsRevision: this.snapshot.diagnostics.settingsRevision,
        lastAck: this.snapshot.diagnostics.lastAck,
        lastError: this.snapshot.diagnostics.lastError,
        firmwareUpdateAvailable: this.snapshot.diagnostics.firmwareUpdateAvailable,
        audioDebugLogPath: this.snapshot.diagnostics.audioDebugLogPath,
        audioDebugLogLineCount: this.snapshot.diagnostics.audioDebugLogLines.length,
        audioDebugLogTail: this.snapshot.diagnostics.audioDebugLogLines.at(-1) ?? null,
        audioDebugDroppedCount: this.snapshot.diagnostics.audioDebugDroppedCount,
        triggerTraceLineCount: this.snapshot.diagnostics.triggerTraceLines.length,
        triggerTraceTail: this.snapshot.diagnostics.triggerTraceLines.at(-1) ?? null,
        triggerTraceDroppedCount: this.snapshot.diagnostics.triggerTraceDroppedCount,
        feedbackTraceLineCount: this.snapshot.diagnostics.feedbackTraceLines.length,
        feedbackTraceTail: this.snapshot.diagnostics.feedbackTraceLines.at(-1) ?? null,
        feedbackTraceDroppedCount: this.snapshot.diagnostics.feedbackTraceDroppedCount,
        audioStatus: this.snapshot.diagnostics.audioStatus
      }
    });
    if (signature === this.lastEmittedSnapshotSignature) {
      return;
    }
    this.lastEmittedSnapshotSignature = signature;
    this.emit('snapshot', this.getSnapshot());
  }
}
