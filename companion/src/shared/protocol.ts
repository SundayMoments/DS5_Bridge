export const COMPANION_USAGE_PAGE = 0xff5d;
export const COMPANION_USAGE = 0x0001;
export const REPORT_LENGTH = 64;
export const PAYLOAD_LENGTH = 63;
export const MAGIC = 'DS5B';
export const PROTOCOL_MAJOR = 1;
export const PROTOCOL_MINOR = 2;

export const REPORT_ID = {
  STATUS: 0x01,
  COMMAND: 0x02,
  ACK: 0x03,
  INPUT: 0x04,
  AUDIO_DEBUG: 0x05,
  AUDIO_STATS: 0x06,
  HOST_AUDIO_STREAM: 0x07,
  HOST_AUDIO_STATUS: 0x08
} as const;

export const SHORTCUT_EVENT = {
  CONTROLLER_VOLUME_DOWN: 0x01,
  CONTROLLER_VOLUME_UP: 0x02,
  SLEEP_CONTROLLER: 0x03
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
  HOST_MODE: 17,
  HOST_FRAME: 18,
  MIC_PACKET: 19,
  USB_EVENT: 20,
  HID_EVENT: 21,
  BT_EVENT: 22
} as const;

export const AUDIO_DEBUG_RECORD_SIZE = 14;

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
  SET_HOST_AUDIO_ENABLED: 0x15,
  HOST_AUDIO_HEARTBEAT: 0x16,
  START_HOST_AUDIO: 0x17,
  STOP_HOST_AUDIO: 0x18,
  SET_DUPLEX_ENABLED: 0x19,
  SET_MIC_VOLUME: 0x1A,
  SET_MIC_MUTE: 0x1B,
  SET_IDLE_DISCONNECT_TIMEOUT: 0x1C,
  SET_SPEAKER_VOLUME_SHORTCUT_ENABLED: 0x1D,
  SET_BUTTON_REMAP: 0x1E
} as const;

export const HOST_AUDIO_PACKET_TYPE = {
  HELLO: 1,
  HEARTBEAT: 2,
  START: 3,
  STOP: 4,
  FRAME_CHUNK: 5,
  SET_DUPLEX_ENABLED: 6,
  SET_DUPLEX_DISABLED: 7,
  FAST_FRAME_FRAGMENT: 8
} as const;

export const HOST_AUDIO_PAYLOAD_LENGTH = 47;
export const HOST_AUDIO_FAST_PAYLOAD_LENGTH = 57;
export const HOST_AUDIO_REPORT_FRAME_LENGTH = 398;
export const HOST_AUDIO_COMPACT_FRAME_LENGTH = 264;
export const HOST_AUDIO_FRAME_CHUNK_COUNT = Math.ceil(HOST_AUDIO_REPORT_FRAME_LENGTH / HOST_AUDIO_PAYLOAD_LENGTH);
export const HOST_AUDIO_FAST_FRAME_CHUNK_COUNT = Math.ceil(HOST_AUDIO_COMPACT_FRAME_LENGTH / HOST_AUDIO_FAST_PAYLOAD_LENGTH);

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
export type MuteButtonMode = 'normal' | 'keyboard' | 'quiet';
export type MuteKeyboardBehavior = 'tap' | 'hold';
export type TriggerTestMode = 'feedback' | 'weapon' | 'vibration';
export type TriggerTestTarget = 'both' | 'l2' | 'r2';
export type PollingRateMode = '250' | '500' | '1000';
export type HostAudioMode = 'fallback-pico-local' | 'host-encoded-active';
export type HostAudioFallbackReason =
  | 'none'
  | 'host-disabled'
  | 'heartbeat-timeout'
  | 'stream-timeout'
  | 'invalid-packet'
  | 'companion-stop'
  | 'controller-disconnected';
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
  'rfn'
] as const;
export type RemapButtonId = typeof REMAP_BUTTON_IDS[number];
export type ButtonRemapMap = Record<RemapButtonId, RemapButtonId>;
export interface ButtonRemapProfile {
  id: string;
  name: string;
  mappings: ButtonRemapMap;
}

export interface ControllerProfileSettings {
  hapticsEnabled: boolean;
  hapticsGainPercent: number;
  classicRumbleEnabled: boolean;
  classicRumbleGainPercent: number;
  adaptiveTriggersEnabled: boolean;
  triggerEffectIntensityPercent: number;
  triggerTestMode: TriggerTestMode;
  speakerEnabled: boolean;
  speakerVolumePercent: number;
  micVolumePercent: number;
  micMuted: boolean;
  lightbarEnabled: boolean;
  lightbarColor: string;
  lightbarBrightnessPercent: number;
  lightbarOverrideEnabled: boolean;
  muteButtonMode: MuteButtonMode;
  muteKeyboardUsage: number;
  muteKeyboardModifiers: number;
  muteKeyboardBehavior: MuteKeyboardBehavior;
  sleepKeybindEnabled: boolean;
  speakerVolumeShortcutEnabled: boolean;
  pollingRateMode: PollingRateMode;
  hostEncodedAudioEnabled: boolean;
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

export function remapButtonIdValue(buttonId: RemapButtonId): number {
  return REMAP_BUTTON_IDS.indexOf(buttonId);
}

export function buildButtonRemapPayload(mapping: ButtonRemapMap): number[] {
  return REMAP_BUTTON_IDS.map((buttonId) => {
    const target = mapping[buttonId];
    return remapButtonIdValue(isRemapButtonId(target) ? target : buttonId);
  });
}
export const MUTE_KEYBOARD_HOLD_FLAG = 0x80;
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
  lightbarColor: {
    red: number;
    green: number;
    blue: number;
    brightnessPercent: number;
  };
  lightbarOverrideEnabled: boolean;
  muteButtonMode: MuteButtonMode;
  muteKeyboardUsage: number;
  muteKeyboardModifiers: number;
  muteKeyboardBehavior: MuteKeyboardBehavior;
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
  };
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

export interface HostAudioStatusPayload {
  mode: HostAudioMode;
  fallbackReason: HostAudioFallbackReason;
  hostRequested: boolean;
  heartbeatHealthy: boolean;
  streamActive: boolean;
  streamHealthy: boolean;
  duplexRequested: boolean;
  duplexActive: boolean;
  controllerStateReady: boolean;
  headsetPlugged: boolean;
  headsetAudioRoute: boolean;
  streamGeneration: number;
  heartbeatAgeMs: number | null;
  frameAgeMs: number | null;
  hostFramesReceived: number;
  hostFramesDropped: number;
  micPacketsReceived: number;
  micPacketsDropped: number;
  micDecodeSuccess: number;
  micDecodeFail: number;
  micUsbWriteSuccess: number;
  micUsbWriteShort: number;
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
  return 'normal';
}

function hostAudioMode(value: number): HostAudioMode {
  return value === 1 ? 'host-encoded-active' : 'fallback-pico-local';
}

function hostAudioFallbackReason(value: number): HostAudioFallbackReason {
  switch (value) {
    case 0:
      return 'none';
    case 1:
      return 'host-disabled';
    case 2:
      return 'heartbeat-timeout';
    case 3:
      return 'stream-timeout';
    case 4:
      return 'invalid-packet';
    case 5:
      return 'companion-stop';
    case 6:
      return 'controller-disconnected';
    default:
      return 'invalid-packet';
  }
}

function nullableAge(value: number): number | null {
  return value === 0xffffffff ? null : value;
}

export function pollingRateModeValue(mode: PollingRateMode): number {
  if (mode === '250') return 0;
  if (mode === '500') return 1;
  return 2;
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
    lightbarColor: {
      red: report[31],
      green: report[32],
      blue: report[33],
      brightnessPercent: report[34]
    },
    lightbarOverrideEnabled: report[59] === 1,
    muteButtonMode: muteButtonMode(report[60]),
    muteKeyboardUsage: report[61],
    muteKeyboardModifiers: report[62] & MUTE_KEYBOARD_MODIFIER_MASK,
    muteKeyboardBehavior: (report[62] & MUTE_KEYBOARD_HOLD_FLAG) !== 0 ? 'hold' : 'tap',
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
      pollingRateControl: true
    },
    protocolVersion: `${report[5]}.${report[6]}`
  };
}

export function parseAckReport(report: ArrayLike<number>): BridgeAckPayload {
  assertReport(report, REPORT_ID.ACK);
  assertVersion(report);

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

export function parseHostAudioStatusReport(report: ArrayLike<number>): HostAudioStatusPayload {
  assertReport(report, REPORT_ID.HOST_AUDIO_STATUS);
  assertVersion(report);

  return {
    mode: hostAudioMode(report[7]),
    fallbackReason: hostAudioFallbackReason(report[8]),
    hostRequested: report[9] === 1,
    heartbeatHealthy: report[10] === 1,
    streamActive: report[11] === 1,
    streamHealthy: report[12] === 1,
    duplexRequested: report[13] === 1,
    duplexActive: (report[14] & 0x01) !== 0,
    headsetPlugged: (report[14] & 0x02) !== 0,
    headsetAudioRoute: (report[14] & 0x04) !== 0,
    controllerStateReady: (report[14] & 0x08) !== 0,
    streamGeneration: readU16(report, 15),
    heartbeatAgeMs: nullableAge(readU32(report, 17)),
    frameAgeMs: nullableAge(readU32(report, 21)),
    hostFramesReceived: readU32(report, 25),
    hostFramesDropped: readU32(report, 29),
    micPacketsReceived: readU32(report, 33),
    micPacketsDropped: readU32(report, 37),
    micDecodeSuccess: readU32(report, 41),
    micDecodeFail: readU32(report, 45),
    micUsbWriteSuccess: readU32(report, 49),
    micUsbWriteShort: readU32(report, 53),
    micLastDecodedSamples: readU16(report, 57),
    micLastWrittenBytes: readU16(report, 59),
    micPeakPermille: readU16(report, 61),
    micUsbStreaming: report[63] === 1,
    protocolVersion: `${report[5]}.${report[6]}`
  };
}

export function buildCommandReport(
  commandId: number,
  sequence: number,
  value: number,
  extraPayload: ArrayLike<number> = []
): number[] {
  const report = new Array<number>(REPORT_LENGTH).fill(0);
  report[0] = REPORT_ID.COMMAND;
  report[1] = MAGIC.charCodeAt(0);
  report[2] = MAGIC.charCodeAt(1);
  report[3] = MAGIC.charCodeAt(2);
  report[4] = MAGIC.charCodeAt(3);
  report[5] = PROTOCOL_MAJOR;
  report[6] = PROTOCOL_MINOR;
  report[7] = commandId & 0xff;
  report[8] = sequence & 0xff;
  report[9] = value & 0xff;
  report[10] = (value >> 8) & 0xff;
  for (let index = 0; index < extraPayload.length && 11 + index < REPORT_LENGTH; index += 1) {
    report[11 + index] = extraPayload[index] & 0xff;
  }
  return report;
}

export function buildHostAudioStreamReport(options: {
  packetType: number;
  streamGeneration?: number;
  frameSequence?: number;
  chunkIndex?: number;
  chunkCount?: number;
  payload?: ArrayLike<number>;
}): number[] {
  const payload = options.payload ?? [];
  const payloadLength = Math.min(HOST_AUDIO_PAYLOAD_LENGTH, payload.length);
  const report = new Array<number>(REPORT_LENGTH).fill(0);
  report[0] = REPORT_ID.HOST_AUDIO_STREAM;
  report[1] = MAGIC.charCodeAt(0);
  report[2] = MAGIC.charCodeAt(1);
  report[3] = MAGIC.charCodeAt(2);
  report[4] = MAGIC.charCodeAt(3);
  report[5] = PROTOCOL_MAJOR;
  report[6] = PROTOCOL_MINOR;
  report[7] = options.packetType & 0xff;
  report[8] = 0;
  const generation = options.streamGeneration ?? 0;
  report[9] = generation & 0xff;
  report[10] = (generation >> 8) & 0xff;
  const sequence = options.frameSequence ?? 0;
  report[11] = sequence & 0xff;
  report[12] = (sequence >> 8) & 0xff;
  report[13] = (options.chunkIndex ?? 0) & 0xff;
  report[14] = (options.chunkCount ?? 0) & 0xff;
  report[15] = payloadLength & 0xff;
  report[16] = (payloadLength >> 8) & 0xff;
  for (let index = 0; index < payloadLength; index += 1) {
    report[17 + index] = payload[index] & 0xff;
  }
  return report;
}

export function buildHostAudioFrameChunkReports(options: {
  streamGeneration: number;
  frameSequence: number;
  frame: ArrayLike<number>;
}): number[][] {
  const frame = options.frame;
  const chunkCount = Math.ceil(frame.length / HOST_AUDIO_PAYLOAD_LENGTH);
  const reports: number[][] = [];
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const start = chunkIndex * HOST_AUDIO_PAYLOAD_LENGTH;
    const end = Math.min(start + HOST_AUDIO_PAYLOAD_LENGTH, frame.length);
    const payload: number[] = [];
    for (let index = start; index < end; index += 1) {
      payload.push(frame[index] & 0xff);
    }
    reports.push(buildHostAudioStreamReport({
      packetType: HOST_AUDIO_PACKET_TYPE.FRAME_CHUNK,
      streamGeneration: options.streamGeneration,
      frameSequence: options.frameSequence,
      chunkIndex,
      chunkCount,
      payload
    }));
  }
  return reports;
}

export function buildHostAudioFastFrameReports(options: {
  frame: ArrayLike<number>;
  frameSequence?: number;
}): number[][] {
  const frame = options.frame;
  const sequence = options.frameSequence ?? 0;
  const fragmentCount = Math.ceil(frame.length / HOST_AUDIO_FAST_PAYLOAD_LENGTH);
  const reports: number[][] = [];
  for (let offset = 0, fragmentIndex = 0; offset < frame.length; offset += HOST_AUDIO_FAST_PAYLOAD_LENGTH, fragmentIndex += 1) {
    const payloadLength = Math.min(HOST_AUDIO_FAST_PAYLOAD_LENGTH, frame.length - offset);
    const report = new Array<number>(REPORT_LENGTH).fill(0);
    report[0] = REPORT_ID.HOST_AUDIO_STREAM;
    report[1] = HOST_AUDIO_PACKET_TYPE.FAST_FRAME_FRAGMENT;
    report[2] = sequence & 0xff;
    report[3] = (sequence >> 8) & 0xff;
    report[4] = fragmentIndex & 0xff;
    report[5] = fragmentCount & 0xff;
    report[6] = payloadLength & 0xff;
    for (let index = 0; index < payloadLength; index += 1) {
      report[7 + index] = frame[offset + index] & 0xff;
    }
    reports.push(report);
  }
  return reports;
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
