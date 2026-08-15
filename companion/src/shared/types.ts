import type {
  BridgeAckPayload,
  AudioDebugStatsPayload,
  BridgeStatusPayload,
  ChordAssignment,
  ChordFunction,
  ButtonRemapMap,
  ButtonRemapProfile,
  ControllerProfile,
  CompanionDeviceIdentityPayload,
  AudioStatusPayload,
  BridgePresetId,
  HostPersonaMode,
  AudioReactiveHapticsSource,
  AudioReactiveHapticsBassFocus,
  AudioReactiveHapticsMode,
  AudioReactiveHapticsResponse,
  AudioReactiveHapticsAttack,
  AudioReactiveHapticsRelease,
  MuteButtonMode,
  MuteKeyboardBehavior,
  PollingRateMode,
  StickInputPreviewPayload,
  TriggerTestMode
} from './protocol';

export type UiScalePercent = 75 | 100 | 125 | 150;
export type UiThemePreset = 'light' | 'dark' | 'bubble-gum' | 'pomegranate' | 'kiwi';

export interface CompanionSettings {
  selectedPresetId: BridgePresetId;
  uiScalePercent: UiScalePercent;
  uiThemePreset: UiThemePreset;
  launchAtStartupEnabled: boolean;
  showBatteryPercentTrayIcon: boolean;
  kitsuneInputPromotionDismissed: boolean;
  firmwareLogDirectory: string | null;
  leftStickRadialDeadzonePercent: number;
  rightStickRadialDeadzonePercent: number;
  hapticsEnabled: boolean;
  hapticsGainPercent: number;
  feedbackBoostEnabled: boolean;
  hapticsBufferLength: number;
  audioInterleaveMaxConsecutiveAudioSends: number;
  audioInterleaveStateMaxAgeUs: number;
  classicRumbleEnabled: boolean;
  classicRumbleGainPercent: number;
  classicRumbleV1Enabled: boolean;
  adaptiveTriggersEnabled: boolean;
  triggerEffectIntensityPercent: number;
  triggerTestMode: TriggerTestMode;
  speakerEnabled: boolean;
  speakerVolumePercent: number;
  speakerGainLevel: number;
  selectedBridgePath: string | null;
  bridgeIdentities: Record<string, BridgeIdentityRecord>;
  controllerBindings: Record<string, string>;
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
  lightbarRestoreEnabled: boolean;
  muteButtonMode: MuteButtonMode;
  muteKeyboardUsage: number;
  muteKeyboardModifiers: number;
  muteKeyboardBehavior: MuteKeyboardBehavior;
  muteKeyboardChordStarterEnabled: boolean;
  edgeProfileSwitchingBlocked: boolean;
  ledEnabled: boolean;
  playerLedEnabled: boolean;
  idleDisconnectEnabled: boolean;
  idleDisconnectTimeoutMinutes: number;
  usbSuspendDisconnectEnabled: boolean;
  wakeOnConnectEnabled: boolean;
  wolEnabled: boolean;
  wolWifiSsid: string;
  wolWifiPassword: string;
  wolTargetMac: string;
  sleepKeybindEnabled: boolean;
  speakerVolumeShortcutEnabled: boolean;
  pollingRateMode: PollingRateMode;
  hostPersonaMode: HostPersonaMode;
  notifyControllerConnection: boolean;
  notifyLowBattery: boolean;
  duplexMicEnabled: boolean;
  controllerPowerSavingEnabled: boolean;
  selectedControllerProfileId: string;
  controllerProfiles: ControllerProfile[];
  selectedButtonRemappingProfileId: string;
  buttonRemappingProfiles: ButtonRemapProfile[];
  buttonRemappingDraft: ButtonRemapMap;
  chordFunctions: ChordFunction[];
  chordAssignments: ChordAssignment[];
}

export interface HidDeviceSummary {
  path?: string;
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
  product?: string;
  manufacturer?: string;
  interface?: number;
}

export interface AudioHapticsSession {
  processId: number;
  displayName: string;
  executableName: string | null;
  processPath: string | null;
  iconPath: string | null;
  iconDataUrl?: string | null;
  sessionIdentifier: string | null;
  sessionInstanceIdentifier: string | null;
  state: 'active' | 'inactive' | 'expired' | string;
  endpointName: string;
  isSelected: boolean;
}

export type BridgeStateKind =
  | 'no-bridge'
  | 'normal-firmware'
  | 'transitioning'
  | 'connected'
  | 'incompatible'
  | 'error';

export interface BridgeDiagnostics {
  hidPath: string | null;
  protocolVersion: string | null;
  uptimeSeconds: number | null;
  settingsRevision: number | null;
  lastAck: BridgeAckPayload | null;
  lastError: string | null;
  firmwareUpdateAvailable: {
    currentVersion: string;
    availableVersion: string;
  } | null;
  lastPollAt: number | null;
  rawDevices: HidDeviceSummary[];
  deviceIdentity: CompanionDeviceIdentityPayload | null;
  firmwareLogDirectory: string | null;
  firmwareLogPath: string | null;
  firmwareLogEnabled: boolean | null;
  firmwareLogDroppedBytes: number;
  firmwareLogLastError: string | null;
  audioDebugLogPath: string | null;
  audioDebugLogLines: string[];
  audioDebugDroppedCount: number;
  audioDebugStats: AudioDebugStatsPayload | null;
  triggerTraceLines: string[];
  triggerTraceDroppedCount: number;
  feedbackTraceLines: string[];
  feedbackTraceDroppedCount: number;
  audioStatus: AudioStatusPayload | null;
}

export interface BridgeSnapshot {
  state: BridgeStateKind;
  message: string;
  status: BridgeStatusPayload | null;
  settings: CompanionSettings;
  diagnostics: BridgeDiagnostics;
  personaTransition?: HostPersonaTransition | null;
  bridgeDevices?: BridgeDeviceCensus | null;
  stickInputPreview?: StickInputPreviewPayload | null;
}

export interface BridgeDeviceInfo {
  path: string;
  containerId: string | null;
  selected: boolean;
  connected: boolean;
  uniqueId: string | null;
  name: string | null;
}

export interface DirectControllerInfo {
  path: string;
  product: string | null;
  productId: number;
}

export interface BridgeIdentityRecord {
  label: string | null;
  containerId: string | null;
}

export interface BridgeDeviceCensus {
  bridges: BridgeDeviceInfo[];
  directControllers: DirectControllerInfo[];
  selectedBridgePath: string | null;
}

export interface HostPersonaTransition {
  from: HostPersonaMode;
  to: HostPersonaMode;
  startedAt: number;
  deadlineAt: number;
}

export interface WindowsDeviceCleanupResult {
  scriptPath: string;
  logPath: string;
  includedBluetooth: boolean;
  message: string;
}

export type PicoFirmwareAction = 'mount' | 'flash' | 'nuke';

export interface PicoFirmwareActionResult {
  ok: boolean;
  action: PicoFirmwareAction;
  cancelled?: boolean;
  driveRoot?: string;
  sourcePath?: string;
  targetPath?: string;
  message: string;
}
