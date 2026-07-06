export const COMPANION_USAGE_PAGE = 0xff5d;
export const COMPANION_USAGE = 0x0001;
export const REPORT_LENGTH = 64;
export const PAYLOAD_LENGTH = 63;
export const MAGIC = 'DS5B';
export const PROTOCOL_MAJOR = 1;
export const PROTOCOL_MINOR = 16;

export const REPORT_ID = {
  STATUS: 0x01,
  COMMAND: 0x02,
  ACK: 0x03,
  INPUT: 0x04,
  AUDIO_DEBUG: 0x05,
  AUDIO_STATS: 0x06,
  AUDIO_STATUS: 0x08,
  TRIGGER_TRACE: 0x09,
  FEEDBACK_TRACE: 0x0a
} as const;

export const SHORTCUT_EVENT = {
  CONTROLLER_VOLUME_DOWN: 0x01,
  CONTROLLER_VOLUME_UP: 0x02,
  SLEEP_CONTROLLER: 0x03,
  MIC_MUTE_ON: 0x04,
  MIC_MUTE_OFF: 0x05
} as const;

export const AUDIO_DEBUG_EVENT = {
  AUDIO_START: 1,
  RESET_GAP: 2,
  CORE1_RESET: 3,
  SKIP_OPUS_PACKET: 4,
  SEND_SPEAKER_PACKET: 5,
  NO_OPUS_PACKET: 6,
  AUDIO_FIFO_DROP: 7,
  AUDIO_FIFO_ADD_FAIL: 8,
  OPUS_FIFO_DROP: 9,
  OPUS_FIFO_ADD_FAIL: 10,
  TEST_HAPTICS_START: 11,
  TEST_HAPTICS_STOP: 12,
  SPEAKER_ROUTE: 13,
  QUIET_MODE: 14,
  SILENCE_PREROLL: 15,
  USB_SILENCE_TAIL: 16,
  MIC_PACKET: 19,
  USB_EVENT: 20,
  HID_EVENT: 21,
  BT_EVENT: 22,
  CPU_LOAD: 23
} as const;

export const AUDIO_DEBUG_RECORD_SIZE = 14;
export const TRIGGER_TRACE_RECORD_SIZE = 38;
export const FEEDBACK_TRACE_RECORD_SIZE = 24;

export const COMMAND_ID = {
  SET_HAPTICS_GAIN: 0x01,
  SET_LED_ENABLED: 0x02,
  SET_IDLE_DISCONNECT_ENABLED: 0x03,
  TEST_HAPTICS: 0x04,
  RESTORE_DEFAULTS: 0x05,
  SET_SPEAKER_VOLUME: 0x07,
  SET_LIGHTBAR_COLOR: 0x08,
  SET_LIGHTBAR_OVERRIDE: 0x09,
  SET_MUTE_BUTTON_ACTION: 0x0A,
  SET_HAPTICS_BUFFER_LENGTH: 0x0B,
  SET_TRIGGER_EFFECT_INTENSITY: 0x0C,
  TEST_ADAPTIVE_TRIGGERS: 0x0D,
  RESET_ADAPTIVE_TRIGGERS: 0x0E,
  SET_USB_SUSPEND_DISCONNECT_ENABLED: 0x0F,
  SET_SLEEP_KEYBIND_ENABLED: 0x10,
  SLEEP_CONTROLLER: 0x11,
  SET_POLLING_RATE_MODE: 0x12,
  SET_CLASSIC_RUMBLE_GAIN: 0x13,
  TEST_CLASSIC_RUMBLE: 0x14,
  SET_DUPLEX_ENABLED: 0x19,
  SET_MIC_VOLUME: 0x1A,
  SET_MIC_MUTE: 0x1B,
  SET_IDLE_DISCONNECT_TIMEOUT: 0x1C,
  SET_SPEAKER_VOLUME_SHORTCUT_ENABLED: 0x1D,
  SET_BUTTON_REMAP: 0x1E,
  PREVIEW_ADAPTIVE_TRIGGER_EFFECT: 0x1F,
  APPLY_ADAPTIVE_TRIGGER_EFFECT: 0x20,
  SET_HOST_PERSONA: 0x21,
  SET_AUDIO_REACTIVE_HAPTICS: 0x22,
  SET_CHORD_BINDINGS: 0x23,
  SET_PLAYER_LED_ENABLED: 0x24,
  SET_CLASSIC_RUMBLE_V1: 0x25,
  SET_SPEAKER_GAIN: 0x32,
  ENTER_BOOTLOADER: 0x33
} as const;

export const ACK_RESULT = {
  OK: 0x00,
  ERR_BAD_MAGIC: 0x01,
  ERR_BAD_VERSION: 0x02,
  ERR_BAD_LENGTH: 0x03,
  ERR_INVALID_VALUE: 0x04,
  ERR_UNKNOWN_COMMAND: 0x05,
  ERR_NOT_CONNECTED: 0x06,
  ERR_BUSY: 0x07
} as const;

export type AckResultCode = typeof ACK_RESULT[keyof typeof ACK_RESULT];
export type ShortcutEvent = typeof SHORTCUT_EVENT[keyof typeof SHORTCUT_EVENT];
export type MuteButtonMode = 'normal' | 'keyboard' | 'quiet' | 'chord';
export type MuteKeyboardBehavior = 'tap' | 'hold';
export type TriggerTestMode = 'feedback' | 'weapon' | 'vibration';
export type TriggerTestTarget = 'both' | 'l2' | 'r2';
export interface AdaptiveTriggerPreviewEffect {
  mode: TriggerTestMode;
  target: TriggerTestTarget;
  startPercent: number;
  wallPercent: number;
  forcePercent: number;
}
export type PollingRateMode = '250' | '500' | '1000';
export type HostPersonaMode = 'dualsense' | 'xbox' | 'ds4';
export const CHORD_FUNCTION_EVENT_BASE = 0x20;
export const MAX_CHORD_ASSIGNMENTS = 16;
export const MAX_CHORD_FUNCTION_NAME_LENGTH = 16;
export const MAX_KEYBOARD_FUNCTION_KEYS = 4;
export const CHORD_CONTROLLER_SETTING_STEP_MIN = 1;
export const CHORD_CONTROLLER_SETTING_STEP_MAX = 100;
export const CHORD_CONTROLLER_SETTING_STEP_DEFAULT = 10;
export interface AudioReactiveHapticsAppSource {
  kind: 'app-session';
  processId: number;
  displayName?: string;
  executableName?: string;
  processPath?: string;
  sessionIdentifier?: string;
  sessionInstanceIdentifier?: string;
}
export type AudioReactiveHapticsSource = 'controller-audio' | 'system-audio' | AudioReactiveHapticsAppSource;
export type AudioReactiveHapticsMode = 'mix' | 'replace';
export type AudioReactiveHapticsBassFocus = 'deep' | 'balanced' | 'punchy' | 'wide';
export type AudioReactiveHapticsResponse = 'subtle' | 'balanced' | 'strong';
export type AudioReactiveHapticsAttack = 'soft' | 'balanced' | 'fast' | 'sharp';
export type AudioReactiveHapticsRelease = 'tight' | 'balanced' | 'smooth' | 'long';
export interface AudioReactiveHapticsConfig {
  enabled: boolean;
  source: AudioReactiveHapticsSource;
  mode: AudioReactiveHapticsMode;
  gainPercent: number;
  bassFocus: AudioReactiveHapticsBassFocus;
  response: AudioReactiveHapticsResponse;
  attack: AudioReactiveHapticsAttack;
  release: AudioReactiveHapticsRelease;
}
export const BRIDGE_PRESET_IDS = [
  'custom',
  'balanced',
  'quiet',
  'no-speaker',
  'no-haptics',
  'no-triggers',
  'lights-off'
] as const;
export type BridgePresetId = typeof BRIDGE_PRESET_IDS[number];

export const REMAP_BUTTON_IDS = [
  'l2',
  'l1',
  'create',
  'dpad-up',
  'dpad-left',
  'dpad-down',
  'dpad-right',
  'l3',
  'r2',
  'r1',
  'options',
  'triangle',
  'circle',
  'cross',
  'square',
  'r3',
  'lb',
  'rb',
  'lfn',
  'rfn',
  'ps'
] as const;
export type RemapButtonId = typeof REMAP_BUTTON_IDS[number];
export const CHORD_MUTE_STARTER_ID = 'mute' as const;
export const CHORD_STARTER_IDS = ['ps', 'lfn', 'rfn', CHORD_MUTE_STARTER_ID] as const;
export type ChordStarterId = typeof CHORD_STARTER_IDS[number];
export type ChordRemapButtonId = Exclude<RemapButtonId, 'lfn' | 'rfn' | 'ps'>;
export type ChordAssignableButtonId = ChordRemapButtonId;
export const CHORD_ASSIGNABLE_BUTTON_IDS = REMAP_BUTTON_IDS.filter((
  id
): id is ChordRemapButtonId => id !== 'lfn' && id !== 'rfn' && id !== 'ps');
export const CHORD_EDGE_RESERVED_FACE_BUTTON_IDS = ['triangle', 'circle', 'cross', 'square'] as const;
export type ChordFunctionId = string;
export type ChordFunctionType = 'keyboard' | 'media' | 'controller-setting';
export type ChordMediaAction =
  | 'play-pause'
  | 'next-track'
  | 'previous-track'
  | 'mute'
  | 'volume-up'
  | 'volume-down';
export type ChordControllerSettingAction =
  | 'toggle-audio-haptics'
  | 'toggle-lightbar-override'
  | 'toggle-mic-mute'
  | 'sleep-controller'
  | 'persona-dualsense'
  | 'persona-ds4'
  | 'persona-xbox'
  | 'speaker-down'
  | 'speaker-up'
  | 'mic-down'
  | 'mic-up'
  | 'haptics-down'
  | 'haptics-up'
  | 'rumble-down'
  | 'rumble-up'
  | 'triggers-down'
  | 'triggers-up'
  | 'lighting-down'
  | 'lighting-up';
export interface ChordKeyboardFunction {
  id: ChordFunctionId;
  name: string;
  type: 'keyboard';
  keys: string[];
}
export interface ChordMediaFunction {
  id: ChordFunctionId;
  name: string;
  type: 'media';
  action: ChordMediaAction;
}
export interface ChordControllerSettingFunction {
  id: ChordFunctionId;
  name: string;
  type: 'controller-setting';
  action: ChordControllerSettingAction;
  stepPercent: number;
}
export type ChordFunction = ChordKeyboardFunction | ChordMediaFunction | ChordControllerSettingFunction;
export interface ChordComboAssignment {
  id: string;
  kind: 'chord';
  starter: ChordStarterId;
  button: ChordAssignableButtonId;
  functionId: ChordFunctionId;
}
export type ChordAssignment = ChordComboAssignment;
export type ButtonRemapMap = Record<RemapButtonId, RemapButtonId>;
export interface ButtonRemapProfile {
  id: string;
  name: string;
  mappings: ButtonRemapMap;
}

export interface ControllerProfileSettings {
  hapticsEnabled: boolean;
  hapticsGainPercent: number;
  feedbackBoostEnabled: boolean;
  classicRumbleEnabled: boolean;
  classicRumbleGainPercent: number;
  classicRumbleV1Enabled: boolean;
  adaptiveTriggersEnabled: boolean;
  triggerEffectIntensityPercent: number;
  triggerTestMode: TriggerTestMode;
  speakerEnabled: boolean;
  speakerVolumePercent: number;
  micVolumePercent: number;
  micMuted: boolean;
  audioReactiveHapticsEnabled: boolean;
  audioReactiveHapticsSource: AudioReactiveHapticsSource;
  audioReactiveHapticsMode: AudioReactiveHapticsMode;
  audioReactiveHapticsGainPercent: number;
  audioReactiveHapticsBassFocus: AudioReactiveHapticsBassFocus;
  audioReactiveHapticsResponse: AudioReactiveHapticsResponse;
  audioReactiveHapticsAttack: AudioReactiveHapticsAttack;
  audioReactiveHapticsRelease: AudioReactiveHapticsRelease;
  lightbarEnabled: boolean;
  lightbarColor: string;
  lightbarBrightnessPercent: number;
  lightbarOverrideEnabled: boolean;
  muteButtonMode: MuteButtonMode;
  muteKeyboardUsage: number;
  muteKeyboardModifiers: number;
  muteKeyboardBehavior: MuteKeyboardBehavior;
  muteKeyboardChordStarterEnabled: boolean;
  sleepKeybindEnabled: boolean;
  speakerVolumeShortcutEnabled: boolean;
  pollingRateMode: PollingRateMode;
  hostPersonaMode: HostPersonaMode;
  duplexMicEnabled: boolean;
  controllerPowerSavingEnabled: boolean;
}

export interface ControllerProfile {
  id: string;
  name: string;
  settings: ControllerProfileSettings;
}

export const DEFAULT_BUTTON_REMAP_PROFILE_ID = 'default';
export const DEFAULT_BUTTON_REMAP_PROFILE: ButtonRemapProfile = {
  id: DEFAULT_BUTTON_REMAP_PROFILE_ID,
  name: 'Default',
  mappings: Object.fromEntries(REMAP_BUTTON_IDS.map((id) => [id, id])) as ButtonRemapMap
};
export const DEFAULT_CONTROLLER_PROFILE_ID = 'default';

export function normalizeBridgePresetId(
  value: unknown,
  fallback: BridgePresetId = 'balanced'
): BridgePresetId {
  return typeof value === 'string' && (BRIDGE_PRESET_IDS as readonly string[]).includes(value)
    ? value as BridgePresetId
    : fallback;
}

export function isRemapButtonId(value: unknown): value is RemapButtonId {
  return typeof value === 'string' && (REMAP_BUTTON_IDS as readonly string[]).includes(value);
}

export function isChordStarterId(value: unknown): value is ChordStarterId {
  return typeof value === 'string' && (CHORD_STARTER_IDS as readonly string[]).includes(value);
}

export function isChordAssignableButtonId(value: unknown): value is ChordAssignableButtonId {
  return typeof value === 'string' && (CHORD_ASSIGNABLE_BUTTON_IDS as readonly string[]).includes(value);
}

export function isChordBindingAllowed(starter: ChordStarterId, button: ChordAssignableButtonId): boolean {
  return starter === 'ps' || !(CHORD_EDGE_RESERVED_FACE_BUTTON_IDS as readonly string[]).includes(button);
}

export function defaultChordControllerSettingStepPercent(action: ChordControllerSettingAction): number {
  switch (action) {
    case 'haptics-down':
    case 'haptics-up':
    case 'rumble-down':
    case 'rumble-up':
      return 20;
    default:
      return CHORD_CONTROLLER_SETTING_STEP_DEFAULT;
  }
}

export function normalizeChordControllerSettingStepPercent(
  value: unknown,
  fallback = CHORD_CONTROLLER_SETTING_STEP_DEFAULT
): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  const resolved = Number.isFinite(numeric) ? numeric : fallback;
  return Math.max(
    CHORD_CONTROLLER_SETTING_STEP_MIN,
    Math.min(CHORD_CONTROLLER_SETTING_STEP_MAX, Math.round(resolved))
  );
}

export function remapButtonIdValue(buttonId: RemapButtonId): number {
  return REMAP_BUTTON_IDS.indexOf(buttonId);
}

export function chordStarterIdValue(starter: ChordStarterId): number {
  switch (starter) {
    case 'ps':
      return 0x01;
    case 'lfn':
      return 0x02;
    case 'rfn':
      return 0x03;
    case 'mute':
      return 0x04;
  }
}

export function buildButtonRemapPayload(mapping: ButtonRemapMap): number[] {
  return REMAP_BUTTON_IDS.map((buttonId) => {
    const target = mapping[buttonId];
    return remapButtonIdValue(isRemapButtonId(target) ? target : buttonId);
  });
}

export function buildChordBindingsPayload(assignments: ChordAssignment[]): number[] {
  return assignments.slice(0, MAX_CHORD_ASSIGNMENTS).flatMap((assignment, index) => {
    return [
      (CHORD_FUNCTION_EVENT_BASE + index) & 0xff,
      chordStarterIdValue(assignment.starter),
      remapButtonIdValue(assignment.button)
    ];
  });
}
export const MUTE_KEYBOARD_HOLD_FLAG = 0x80;
export const MUTE_KEYBOARD_CHORD_STARTER_FLAG = 0x10;
export const MUTE_KEYBOARD_MODIFIER_MASK = 0x0f;

export interface BridgeStatusPayload {
  controllerConnected: boolean;
  controllerType: 'unknown' | 'dualsense' | 'dualsense-edge';
  batteryPercent: number | null;
  rawPowerState: number;
  audioRecent: boolean;
  hapticsReady: boolean;
  hapticsGainPercent: number;
  speakerVolumePercent: number;
  speakerGainLevel: number;
  lightbarColor: {
    red: number;
    green: number;
    blue: number;
    brightnessPercent: number;
  };
  lightbarOverrideEnabled: boolean;
  micMuted: boolean;
  muteButtonMode: MuteButtonMode;
  muteKeyboardUsage: number;
  muteKeyboardModifiers: number;
  muteKeyboardBehavior: MuteKeyboardBehavior;
  muteKeyboardChordStarterEnabled: boolean;
  quietModeEnabled: boolean;
  audioDebug: {
    usbHostSpeakerVolumePercent: number;
    usbHostMicVolumePercent: number;
    usbHostSpeakerMute: boolean;
    usbHostMicMute: boolean;
    lastHostOutputLength: number;
    lastHostOutputReportId: number;
    lastHostOutputCount: number;
  };
  ledEnabled: boolean;
  idleDisconnectEnabled: boolean;
  idleDisconnectTimeoutMinutes: number;
  signalStrengthDbm: number | null;
  usbSuspendDisconnectEnabled: boolean;
  sleepKeybindEnabled: boolean;
  settingsRevision: number;
  lastCommandResult: AckResultCode;
  testHapticsBusy: boolean;
  testHapticsCooldown: boolean;
  hostOutputRecent: boolean;
  adaptiveTriggerOutputRecent: boolean;
  testAdaptiveTriggersBusy: boolean;
  uptimeSeconds: number;
  firmwareVersion: string;
  firmwareFlags: {
    companion: boolean;
    dse: boolean;
    speakerVolumeControl: boolean;
    lightbarControl: boolean;
    lightbarOverrideControl: boolean;
    muteButtonActions: boolean;
    hapticsBufferLengthControl: boolean;
    adaptiveTriggersControl: boolean;
    usbSuspendDisconnectControl: boolean;
    sleepControllerControl: boolean;
    pollingRateControl: boolean;
    hostPersonaControl: boolean;
    audioReactiveHapticsControl: boolean;
  };
  hostPersonaMode: HostPersonaMode;
  supportedHostPersonaModes: HostPersonaMode[];
  protocolVersion: string;
}

export interface BridgeAckPayload {
  commandId: number;
  commandSequence: number;
  resultCode: AckResultCode;
  detailCode: number;
  settingsRevision: number;
  uptimeSeconds: number;
  protocolVersion: string;
}

export interface AudioDebugEventPayload {
  sequence: number;
  timeUs: number;
  eventCode: number;
  args: number[];
}

export interface AudioDebugPayload {
  latestSequence: number;
  droppedCount: number;
  events: AudioDebugEventPayload[];
}

export interface AudioDebugStatsPayload {
  statsVersion: number;
  usbAudioGapMaxUs: number;
  usbAudioGapOver1500Count: number;
  opusEncodeMaxUs: number;
  opusEncodeOverBudgetCount: number;
  audio0x36EnqueueToSendMaxUs: number;
  audio0x36SendGapMaxUs: number;
  audio0x36LateCountOver12000Us: number;
  audio0x36DropOldestCount: number;
  audioGenerationDropCount: number;
  nonAudioReportsBetweenAudioMax: number;
  btAudioQueueDepthMax: number;
  audio0x36EnqueuedCount: number;
  audio0x36SentCount: number;
  criticalStarvingAudioCount: number;
}

export interface TriggerTraceEventPayload {
  sequence: number;
  timeMs: number;
  stage: number;
  reportId: number;
  length: number;
  sequenceTag: number;
  flag0: number;
  flag1: number;
  flag2: number;
  motorPower: number;
  decision: number;
  rightTrigger: number[];
  leftTrigger: number[];
}

export interface TriggerTracePayload {
  latestSequence: number;
  droppedCount: number;
  events: TriggerTraceEventPayload[];
}

export interface FeedbackTraceEventPayload {
  sequence: number;
  timeMs: number;
  stage: number;
  reportId: number;
  length: number;
  sequenceTag: number;
  decision: number;
  flag0: number;
  flag1: number;
  flag2: number;
  motorRight: number;
  motorLeft: number;
  hapticPeak: number;
  hapticMean: number;
  hapticNonZero: number;
  detail0: number;
  detail1: number;
  detail2: number;
  detail3: number;
}

export interface FeedbackTracePayload {
  latestSequence: number;
  droppedCount: number;
  events: FeedbackTraceEventPayload[];
}

export interface AudioStatusPayload {
  duplexRequested: boolean;
  duplexActive: boolean;
  controllerStateReady: boolean;
  headsetPlugged: boolean;
  headsetAudioRoute: boolean;
  micPacketsReceived: number;
  micPacketsDropped: number;
  micDecodeSuccess: number;
  micDecodeFail: number;
  micUsbWriteSuccess: number;
  micUsbWriteShort: number;
  micUsbConcealCount: number;
  micPlcCount: number;
  micLastDecodedSamples: number;
  micLastWrittenBytes: number;
  micPeakPermille: number;
  micUsbStreaming: boolean;
  protocolVersion: string;
}

export class ProtocolError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
  }
}

export interface ReportProtocolVersion {
  major: number;
  minor: number;
}

function assertReport(report: ArrayLike<number>, reportId: number): void {
  if (report.length !== REPORT_LENGTH) {
    throw new ProtocolError(`Expected ${REPORT_LENGTH} bytes, received ${report.length}.`, 'bad-length');
  }
  if (report[0] !== reportId) {
    throw new ProtocolError(`Expected report ID 0x${reportId.toString(16)}, received 0x${report[0].toString(16)}.`, 'bad-report-id');
  }
  const magic = String.fromCharCode(report[1], report[2], report[3], report[4]);
  if (magic !== MAGIC) {
    throw new ProtocolError('Companion report magic did not match DS5B.', 'bad-magic');
  }
}

function assertVersion(report: ArrayLike<number>): void {
  if (report[5] !== PROTOCOL_MAJOR || report[6] !== PROTOCOL_MINOR) {
    throw new ProtocolError(
      `Firmware update required. Expected companion protocol ${PROTOCOL_MAJOR}.${PROTOCOL_MINOR}, received ${report[5]}.${report[6]}.`,
      'bad-version'
    );
  }
}

function assertCurrentOrOlderVersion(report: ArrayLike<number>): void {
  if (report[5] !== PROTOCOL_MAJOR || report[6] > PROTOCOL_MINOR) {
    throw new ProtocolError(
      `Firmware update required. Expected companion protocol ${PROTOCOL_MAJOR}.${PROTOCOL_MINOR}, received ${report[5]}.${report[6]}.`,
      'bad-version'
    );
  }
}

export function readReportProtocolVersion(
  report: ArrayLike<number>,
  reportId: number
): ReportProtocolVersion {
  assertReport(report, reportId);
  return {
    major: report[5],
    minor: report[6]
  };
}

function readU16(report: ArrayLike<number>, offset: number): number {
  return report[offset] | (report[offset + 1] << 8);
}

function readU32(report: ArrayLike<number>, offset: number): number {
  return (
    report[offset]
    | (report[offset + 1] << 8)
    | (report[offset + 2] << 16)
    | (report[offset + 3] << 24)
  ) >>> 0;
}

function controllerType(value: number): BridgeStatusPayload['controllerType'] {
  if (value === 1) return 'dualsense';
  if (value === 2) return 'dualsense-edge';
  return 'unknown';
}

function muteButtonMode(value: number): MuteButtonMode {
  if (value === 1) return 'keyboard';
  if (value === 2) return 'quiet';
  if (value === 3) return 'chord';
  return 'normal';
}

export function pollingRateModeValue(mode: PollingRateMode): number {
  if (mode === '250') return 0;
  if (mode === '500') return 1;
  return 2;
}

export function hostPersonaModeValue(mode: HostPersonaMode): number {
  if (mode === 'xbox') return 1;
  if (mode === 'ds4') return 2;
  return 0;
}

function hostPersonaMode(value: number): HostPersonaMode {
  if (value === 2) return 'ds4';
  return value === 1 ? 'xbox' : 'dualsense';
}

function supportedHostPersonaModes(mask: number): HostPersonaMode[] {
  const modes: HostPersonaMode[] = [];
  if ((mask & 0x01) !== 0) {
    modes.push('dualsense');
  }
  if ((mask & 0x02) !== 0) {
    modes.push('xbox');
  }
  if ((mask & 0x04) !== 0) {
    modes.push('ds4');
  }
  return modes.length === 0 ? ['dualsense'] : modes;
}

export function parseStatusReport(report: ArrayLike<number>): BridgeStatusPayload {
  assertReport(report, REPORT_ID.STATUS);
  assertVersion(report);

  const statusFlags = report[20];
  const firmwareFlags = report[28];
  const firmwareMajor = report[25];
  const firmwareMinor = report[26];
  const firmwarePatch = report[27];
  const battery = report[9];
  return {
    controllerConnected: report[7] === 1,
    controllerType: controllerType(report[8]),
    batteryPercent: battery === 255 ? null : battery,
    rawPowerState: report[10],
    audioRecent: report[11] === 1,
    hapticsReady: report[12] === 1,
    hapticsGainPercent: readU16(report, 13),
    speakerVolumePercent: readU16(report, 29),
    speakerGainLevel: Math.max(1, Math.min(7, report[57] || 4)),
    lightbarColor: {
      red: report[31],
      green: report[32],
      blue: report[33],
      brightnessPercent: report[34]
    },
    lightbarOverrideEnabled: report[59] === 1,
    micMuted: report[51] === 1,
    muteButtonMode: muteButtonMode(report[60]),
    muteKeyboardUsage: report[61],
    muteKeyboardModifiers: report[62] & MUTE_KEYBOARD_MODIFIER_MASK,
    muteKeyboardBehavior: (report[62] & MUTE_KEYBOARD_HOLD_FLAG) !== 0 ? 'hold' : 'tap',
    muteKeyboardChordStarterEnabled: (report[62] & MUTE_KEYBOARD_CHORD_STARTER_FLAG) !== 0,
    quietModeEnabled: report[63] === 1,
    audioDebug: {
      usbHostSpeakerVolumePercent: report[35],
      usbHostMicVolumePercent: report[36],
      usbHostSpeakerMute: report[37] !== 0,
      usbHostMicMute: report[38] !== 0,
      lastHostOutputLength: report[39],
      lastHostOutputReportId: report[40],
      lastHostOutputCount: readU16(report, 41)
    },
    idleDisconnectTimeoutMinutes: readU16(report, 43),
    signalStrengthDbm: report[7] === 1 && report[46] === 1 ? (report[45] << 24) >> 24 : null,
    ledEnabled: report[15] === 1,
    idleDisconnectEnabled: report[16] === 1,
    usbSuspendDisconnectEnabled: (statusFlags & 0x10) !== 0,
    sleepKeybindEnabled: (statusFlags & 0x40) !== 0,
    settingsRevision: readU16(report, 17),
    lastCommandResult: report[19] as AckResultCode,
    testHapticsBusy: (statusFlags & 0x01) !== 0,
    testHapticsCooldown: (statusFlags & 0x02) !== 0,
    hostOutputRecent: (statusFlags & 0x04) !== 0,
    adaptiveTriggerOutputRecent: report[47] === 1,
    testAdaptiveTriggersBusy: (statusFlags & 0x08) !== 0,
    uptimeSeconds: readU32(report, 21),
    firmwareVersion: `${firmwareMajor}.${firmwareMinor}.${firmwarePatch}`,
    firmwareFlags: {
      companion: (firmwareFlags & 0x01) !== 0,
      dse: (firmwareFlags & 0x02) !== 0,
      speakerVolumeControl: (firmwareFlags & 0x04) !== 0,
      lightbarControl: (firmwareFlags & 0x08) !== 0,
      lightbarOverrideControl: (firmwareFlags & 0x10) !== 0,
      muteButtonActions: (firmwareFlags & 0x20) !== 0,
      hapticsBufferLengthControl: (firmwareFlags & 0x40) !== 0,
      adaptiveTriggersControl: (firmwareFlags & 0x80) !== 0,
      usbSuspendDisconnectControl: (statusFlags & 0x20) !== 0,
      sleepControllerControl: (statusFlags & 0x80) !== 0,
      pollingRateControl: true,
      hostPersonaControl: report[49] !== 0,
      audioReactiveHapticsControl: report[6] >= 7
    },
    hostPersonaMode: hostPersonaMode(report[48]),
    supportedHostPersonaModes: supportedHostPersonaModes(report[49]),
    protocolVersion: `${report[5]}.${report[6]}`
  };
}

export function parseAckReport(
  report: ArrayLike<number>,
  options: { allowProtocolMismatch?: boolean } = {}
): BridgeAckPayload {
  assertReport(report, REPORT_ID.ACK);
  if (options.allowProtocolMismatch) {
    assertCurrentOrOlderVersion(report);
  } else {
    assertVersion(report);
  }

  return {
    commandId: report[7],
    commandSequence: report[8],
    resultCode: report[9] as AckResultCode,
    detailCode: report[10],
    settingsRevision: readU16(report, 11),
    uptimeSeconds: readU32(report, 13),
    protocolVersion: `${report[5]}.${report[6]}`
  };
}

export function parseAudioDebugReport(report: ArrayLike<number>): AudioDebugPayload {
  assertReport(report, REPORT_ID.AUDIO_DEBUG);
  assertVersion(report);

  const recordCount = report[7];
  const recordSize = report[8];
  const latestSequence = readU32(report, 9);
  const droppedCount = readU16(report, 13);
  if (recordCount === 0) {
    return { latestSequence, droppedCount, events: [] };
  }
  if (recordSize < AUDIO_DEBUG_RECORD_SIZE) {
    throw new ProtocolError(`Audio debug record size ${recordSize} is too small.`, 'bad-audio-debug-record');
  }

  const events: AudioDebugEventPayload[] = [];
  for (let index = 0; index < recordCount; index += 1) {
    const offset = 15 + index * recordSize;
    if (offset + AUDIO_DEBUG_RECORD_SIZE > REPORT_LENGTH) {
      break;
    }
    events.push({
      sequence: readU32(report, offset),
      timeUs: readU32(report, offset + 4),
      eventCode: report[offset + 8],
      args: Array.from({ length: 5 }, (_, argIndex) => report[offset + 9 + argIndex])
    });
  }

  return { latestSequence, droppedCount, events };
}

export function parseAudioStatsReport(report: ArrayLike<number>): AudioDebugStatsPayload {
  assertReport(report, REPORT_ID.AUDIO_STATS);
  assertVersion(report);

  return {
    statsVersion: report[7],
    usbAudioGapMaxUs: readU32(report, 8),
    usbAudioGapOver1500Count: readU32(report, 12),
    opusEncodeMaxUs: readU32(report, 16),
    opusEncodeOverBudgetCount: readU32(report, 20),
    audio0x36EnqueueToSendMaxUs: readU32(report, 24),
    audio0x36SendGapMaxUs: readU32(report, 28),
    audio0x36LateCountOver12000Us: readU32(report, 32),
    audio0x36DropOldestCount: readU32(report, 36),
    audioGenerationDropCount: readU32(report, 40),
    nonAudioReportsBetweenAudioMax: readU32(report, 44),
    btAudioQueueDepthMax: readU32(report, 48),
    audio0x36EnqueuedCount: readU32(report, 52),
    audio0x36SentCount: readU32(report, 56),
    criticalStarvingAudioCount: readU32(report, 60)
  };
}

export function parseTriggerTraceReport(report: ArrayLike<number>): TriggerTracePayload {
  assertReport(report, REPORT_ID.TRIGGER_TRACE);
  assertVersion(report);

  const recordCount = report[7];
  const recordSize = report[8];
  const latestSequence = readU32(report, 9);
  const droppedCount = readU16(report, 13);
  if (recordCount === 0) {
    return { latestSequence, droppedCount, events: [] };
  }
  if (recordSize < TRIGGER_TRACE_RECORD_SIZE) {
    throw new ProtocolError(`Trigger trace record size ${recordSize} is too small.`, 'bad-trigger-trace-record');
  }

  const events: TriggerTraceEventPayload[] = [];
  for (let index = 0; index < recordCount; index += 1) {
    const offset = 15 + index * recordSize;
    if (offset + TRIGGER_TRACE_RECORD_SIZE > REPORT_LENGTH) {
      break;
    }
    events.push({
      sequence: readU16(report, offset),
      timeMs: readU32(report, offset + 2),
      stage: report[offset + 6],
      reportId: report[offset + 7],
      length: report[offset + 8],
      sequenceTag: report[offset + 9],
      flag0: report[offset + 10],
      flag1: report[offset + 11],
      flag2: report[offset + 12],
      motorPower: report[offset + 13],
      decision: report[offset + 14],
      rightTrigger: Array.from({ length: 11 }, (_, itemIndex) => report[offset + 15 + itemIndex]),
      leftTrigger: Array.from({ length: 11 }, (_, itemIndex) => report[offset + 26 + itemIndex])
    });
  }

  return { latestSequence, droppedCount, events };
}

export function parseFeedbackTraceReport(report: ArrayLike<number>): FeedbackTracePayload {
  assertReport(report, REPORT_ID.FEEDBACK_TRACE);
  assertVersion(report);

  const recordCount = report[7];
  const recordSize = report[8];
  const latestSequence = readU32(report, 9);
  const droppedCount = readU16(report, 13);
  if (recordCount === 0) {
    return { latestSequence, droppedCount, events: [] };
  }
  if (recordSize < FEEDBACK_TRACE_RECORD_SIZE) {
    throw new ProtocolError(`Feedback trace record size ${recordSize} is too small.`, 'bad-feedback-trace-record');
  }

  const events: FeedbackTraceEventPayload[] = [];
  for (let index = 0; index < recordCount; index += 1) {
    const offset = 15 + index * recordSize;
    if (offset + FEEDBACK_TRACE_RECORD_SIZE > REPORT_LENGTH) {
      break;
    }
    events.push({
      sequence: readU16(report, offset),
      timeMs: readU32(report, offset + 2),
      stage: report[offset + 6],
      reportId: report[offset + 7],
      length: report[offset + 8],
      sequenceTag: report[offset + 9],
      decision: report[offset + 10],
      flag0: report[offset + 11],
      flag1: report[offset + 12],
      flag2: report[offset + 13],
      motorRight: report[offset + 14],
      motorLeft: report[offset + 15],
      hapticPeak: report[offset + 16],
      hapticMean: report[offset + 17],
      hapticNonZero: report[offset + 18],
      detail0: report[offset + 19],
      detail1: report[offset + 20],
      detail2: report[offset + 21],
      detail3: report[offset + 22]
    });
  }

  return { latestSequence, droppedCount, events };
}

export function parseAudioStatusReport(report: ArrayLike<number>): AudioStatusPayload {
  assertReport(report, REPORT_ID.AUDIO_STATUS);
  const protocolMajor = report[5];
  const protocolMinor = report[6];
  if (protocolMajor !== PROTOCOL_MAJOR || protocolMinor < 2 || protocolMinor > PROTOCOL_MINOR) {
    throw new ProtocolError(
      `Firmware update required. Expected companion protocol ${PROTOCOL_MAJOR}.${PROTOCOL_MINOR}, received ${protocolMajor}.${protocolMinor}.`,
      'bad-version'
    );
  }

  const primaryFlags = report[9];
  const routeFlags = report[10];

  return {
    duplexRequested: (primaryFlags & 0x10) !== 0,
    duplexActive: (primaryFlags & 0x20) !== 0,
    controllerStateReady: (primaryFlags & 0x40) !== 0,
    headsetPlugged: (routeFlags & 0x01) !== 0,
    headsetAudioRoute: (routeFlags & 0x02) !== 0,
    micPacketsReceived: readU32(report, 25),
    micPacketsDropped: readU32(report, 29),
    micDecodeSuccess: readU32(report, 33),
    micDecodeFail: readU32(report, 37),
    micUsbWriteSuccess: readU32(report, 41),
    micUsbWriteShort: readU32(report, 45),
    micUsbConcealCount: readU32(report, 49),
    micPlcCount: readU32(report, 53),
    micLastDecodedSamples: readU16(report, 57),
    micLastWrittenBytes: readU16(report, 59),
    micPeakPermille: readU16(report, 61),
    micUsbStreaming: (primaryFlags & 0x80) !== 0,
    protocolVersion: `${protocolMajor}.${protocolMinor}`
  };
}

export function buildCommandReport(
  commandId: number,
  sequence: number,
  value: number,
  extraPayload: ArrayLike<number> = [],
  options: { protocolMinor?: number } = {}
): number[] {
  const report = new Array<number>(REPORT_LENGTH).fill(0);
  report[0] = REPORT_ID.COMMAND;
  report[1] = MAGIC.charCodeAt(0);
  report[2] = MAGIC.charCodeAt(1);
  report[3] = MAGIC.charCodeAt(2);
  report[4] = MAGIC.charCodeAt(3);
  report[5] = PROTOCOL_MAJOR;
  report[6] = options.protocolMinor ?? PROTOCOL_MINOR;
  report[7] = commandId & 0xff;
  report[8] = sequence & 0xff;
  report[9] = value & 0xff;
  report[10] = (value >> 8) & 0xff;
  for (let index = 0; index < extraPayload.length && 11 + index < REPORT_LENGTH; index += 1) {
    report[11 + index] = extraPayload[index] & 0xff;
  }
  return report;
}

export function ackResultName(result: number): string {
  const entry = Object.entries(ACK_RESULT).find(([, value]) => value === result);
  return entry?.[0] ?? `UNKNOWN_${result}`;
}

export function ackUserMessage(result: number): string {
  switch (result) {
    case ACK_RESULT.OK:
      return 'OK';
    case ACK_RESULT.ERR_NOT_CONNECTED:
      return 'Controller not connected';
    case ACK_RESULT.ERR_BUSY:
      return 'Test is busy';
    case ACK_RESULT.ERR_INVALID_VALUE:
      return 'Invalid value';
    case ACK_RESULT.ERR_BAD_VERSION:
      return 'Firmware protocol mismatch';
    case ACK_RESULT.ERR_BAD_MAGIC:
    case ACK_RESULT.ERR_BAD_LENGTH:
    case ACK_RESULT.ERR_UNKNOWN_COMMAND:
    default:
      return ackResultName(result).replace(/^ERR_/, '').replaceAll('_', ' ').toLowerCase();
  }
}
