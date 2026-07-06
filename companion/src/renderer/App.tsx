import { type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type TablerIcon,
  IconAdjustmentsSpark,
  IconActivity as Activity,
  IconAdjustmentsHorizontal as Settings2,
  IconAdjustmentsHorizontal as SlidersHorizontal,
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
  IconFlame,
  IconFlask2,
  IconBrandDeezer,
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
import remappingEdgeLayoutImage from '../../../assets/controllers/dualsense-edge-remapping-layout.svg';
import remappingLayoutImage from '../../../assets/controllers/dualsense-remapping-layout.svg';
import circleGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Circle.svg';
import createGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Create.svg';
import crossGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Cross.svg';
import dpadDownGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Down.svg';
import dpadLeftGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Left.svg';
import dpadRightGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Right.svg';
import dpadUpGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Up.svg';
import l1GlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/L1.svg';
import l2GlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/L2.svg';
import leftStickClickGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Left Stick Click.svg';
import optionsGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Options.svg';
import psHomeGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Home.svg';
import r1GlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/R1.svg';
import r2GlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/R2.svg';
import rightStickClickGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Right Stick Click.svg';
import squareGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Square.svg';
import triangleGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Triangle.svg';
import testSpeakerToneUrl from './assets/test-speaker-tone-silence-tail.mp3';
import {
  DEFAULT_UI_THEME_PRESET,
  UI_THEME_KOFI_BADGES,
  UI_THEME_OPTIONS,
  UI_THEME_PREVIEW_SWATCHES
} from './ui-themes';
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
  REMAP_BUTTON_IDS,
  ackResultName,
  normalizeChordControllerSettingStepPercent,
  isChordBindingAllowed
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
import type { AudioHapticsSession, BridgeSnapshot, UiScalePercent, UiThemePreset } from '../shared/types';

type ControlTab = 'overview' | 'haptics' | 'audio' | 'triggers' | 'lighting' | 'remapping' | 'chords' | 'system';
type StartupTutorialStep = 'feature-toggle' | 'support' | 'done';
type ControllerType = BridgeStatusPayload['controllerType'];
type KnownControllerType = Exclude<ControllerType, 'unknown'>;
type RemapButtonDefinition = {
  id: RemapButtonId;
  label: string;
  glyphUrl?: string;
  textGlyph?: string;
};
type ChordStarterDefinition = {
  id: ChordStarterId;
  label: string;
  glyphUrl?: string;
  textGlyph?: string;
  Icon?: TablerIcon;
};
type TargetOnlyRemapButtonId = Extract<RemapButtonId, 'ps'>;
type SourceRemapButtonId = Exclude<RemapButtonId, TargetOnlyRemapButtonId>;
type DualSenseEdgeRemapButtonId = Extract<SourceRemapButtonId, 'lb' | 'rb' | 'lfn' | 'rfn'>;
type StandardRemapButtonId = Exclude<SourceRemapButtonId, DualSenseEdgeRemapButtonId>;
type RemapProfileDialogMode = 'save' | 'rename' | 'delete';
type ControllerProfileDialogMode = 'save' | 'rename' | 'delete';
type ChordFunctionDraft = {
  id: string;
  name: string;
  type: ChordFunctionType;
  keyboardKey: string;
  keyboardModifiers: ChordKeyboardModifier[];
  mediaAction: ChordMediaAction;
  controllerAction: ChordControllerSettingAction;
  controllerStepPercent: number;
};
type ChordKeyboardModifier = 'Ctrl' | 'Shift' | 'Alt' | 'Win';
type ChordNotchTargetId = 'speaker' | 'mic' | 'haptics' | 'rumble' | 'triggers' | 'lighting';
type ChordNotchDirection = 'down' | 'up';
type ChordNotchAction = Extract<ChordControllerSettingAction, `${ChordNotchTargetId}-${ChordNotchDirection}`>;
type ChordControllerSettingSelectValue = Exclude<ChordControllerSettingAction, ChordNotchAction> | ChordNotchTargetId;
type ChordFunctionDialogMode = 'rename' | 'delete';
type ChordFunctionDialogState = {
  mode: ChordFunctionDialogMode;
  functionId: string;
};
const CHORD_UNASSIGNED_BUTTON = '__unassigned__';
type ChordButtonSelectValue = ChordAssignableButtonId | typeof CHORD_UNASSIGNED_BUTTON;
type ChordAssignmentDraftRow = {
  id: string;
  starter: ChordStarterId;
  button: ChordAssignableButtonId | null;
  functionId: string;
};
type ChordAssignmentDropHint = {
  targetId: string;
  placement: 'before' | 'after';
};
type ChordAssignmentDragSession = {
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
type ChordAssignmentScrollbarState = {
  visible: boolean;
  top: number;
  height: number;
};
type TriggerLabProfileDialogMode = 'save' | 'rename' | 'delete';
type TriggerLabBuiltinProfileId = 'default';
type TriggerLabCustomProfileId = 'custom' | `custom-${string}`;
type TriggerLabProfileId = TriggerLabBuiltinProfileId | TriggerLabCustomProfileId;
type TriggerLabSide = Extract<TriggerTestTarget, 'l2' | 'r2'>;
type TriggerLabDraft = {
  profileId: TriggerLabProfileId;
  mode: TriggerTestMode;
  startPercent: number;
  wallPercent: number;
  forcePercent: number;
};
type TriggerLabCustomProfile = {
  id: TriggerLabCustomProfileId;
  name: string;
  mode: TriggerTestMode;
  startPercent: number;
  wallPercent: number;
  forcePercent: number;
  active: boolean;
};
type TriggerLabProfileDialogState = {
  mode: TriggerLabProfileDialogMode;
  side: TriggerLabSide;
};
type TriggerLabSplitState = {
  drafts: Record<TriggerLabSide, TriggerLabDraft>;
  active: Record<TriggerLabSide, boolean>;
};
type TriggerLabWorkspaceState = {
  linked: boolean;
  drafts: Record<TriggerLabSide, TriggerLabDraft>;
  active: Record<TriggerLabSide, boolean>;
  splitState: TriggerLabSplitState | null;
};
type TriggerLabInitialState = TriggerLabWorkspaceState & {
  profiles: TriggerLabCustomProfile[];
};
type RemapCalloutLayout = {
  top: number;
  points: string;
};
type EdgeRemapControlLayout = {
  left: number;
  top: number;
  anchor: 'top' | 'bottom';
  linePoints: string;
};
type LightbarPaletteCell = {
  color: string;
  name: string;
};
type FeatureTipsPanelProps = {
  tab: 'audio' | 'haptics' | 'triggers' | 'lighting';
  onSettingsFocusRequest?: (target: SettingsFocusTarget) => void;
  audioHapticsOpen?: boolean;
  triggerLabOpen?: boolean;
};
type SettingsFocusTarget = 'controller-power-saving' | 'sleep-shortcut' | 'volume-shortcut';
type NotificationFocusTarget = 'controller-status' | 'low-battery' | 'all';

const HAPTICS_STEP = 20;
const STANDARD_FEEDBACK_GAIN_PERCENT = 200;
const BOOSTED_FEEDBACK_GAIN_PERCENT = 500;
const SPEAKER_VOLUME_STEP = 10;
const MIC_VOLUME_STEP = 10;
const AUDIO_BUFFER_LENGTH_MIN = 16;
const AUDIO_BUFFER_LENGTH_MAX = 128;
const AUDIO_BUFFER_LENGTH_HIGH_STUTTER_MAX = 44;
const AUDIO_BUFFER_LENGTH_RISKY_MAX = 63;
const LIGHTBAR_BRIGHTNESS_STEP = 10;
const TRIGGER_EFFECT_STEP = 10;
const CONTROLLER_POWER_SAVING_CAP_PERCENT = 60;
const TEST_HAPTICS_LOCK_MS = 1100;
const TEST_SPEAKER_LOCK_MS = 900;
const TEST_MIC_LISTEN_MS = 5000;
const TEST_SPEAKER_VOLUME_SETTLE_MS = 90;
const TEST_SPEAKER_ENDPOINT_ATTEMPTS = 12;
const TEST_SPEAKER_ENDPOINT_RETRY_MS = 150;
const TEST_SPEAKER_ENDPOINT_REFRESH_MS = 1500;
const TEST_SPEAKER_ENDPOINT_VERIFY_MS = 100;
const TEST_SPEAKER_PREROLL_MS = 220;
const TEST_TRIGGER_LOCK_MS = 2800;
const SLEEP_CONFIRM_MS = 2400;
const LIGHTBAR_SWATCHES = ['#ffff00', '#0000ff', '#00ff00', '#ff0000', '#8000ff', '#ffffff'];
const LIGHTBAR_SWATCH_NAMES: Record<string, string> = {
  '#ffff00': 'Yellow',
  '#0000ff': 'Blue',
  '#00ff00': 'Green',
  '#ff0000': 'Red',
  '#8000ff': 'Violet',
  '#ffffff': 'White'
};
const LIGHTBAR_DEFAULT_CUSTOM_COLOR = '#7b61ff';
const LIGHTBAR_CUSTOM_PALETTE = makeLightbarCustomPalette();
const LIGHTBAR_COLOR_NAMES = makeLightbarColorNames();
const LIGHTBAR_PRESETS: Array<[string, number]> = [
  ['Low', 30],
  ['Medium', 50],
  ['High', 100]
];
const HAPTICS_PRESETS: Array<[string, number]> = [
  ['Low', 50],
  ['Medium', 100],
  ['High', 150]
];
const SPEAKER_VOLUME_PRESETS: Array<[string, number]> = [
  ['Low', 30],
  ['Medium', 70],
  ['High', 100]
];
const MIC_VOLUME_PRESETS: Array<[string, number]> = [
  ['Low', 30],
  ['Medium', 70],
  ['High', 100]
];
const TRIGGER_EFFECT_PRESETS: Array<[string, number]> = [
  ['Low', 30],
  ['Medium', 70],
  ['High', 100]
];
const PERCENT_SLIDER_TICKS = Array.from({ length: 11 }, (_, index) => index * 10);
const TRIGGER_LAB_SLIDER_STEP = 5;
const TRIGGER_LAB_SLIDER_TICKS = Array.from({ length: 21 }, (_, index) => index * TRIGGER_LAB_SLIDER_STEP);
const STANDARD_HAPTICS_SLIDER_TICKS = Array.from({ length: 11 }, (_, index) => index * 20);
const BRIDGE_AUDIO_OUTPUT_RE = /ds5|dualsense|dual sense|wireless controller|bridge/i;
const BRIDGE_AUDIO_INPUT_RE = /ds5|dualsense|dual sense|wireless controller|bridge/i;
const BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE = 'DualSense audio endpoint unavailable';
const BRIDGE_MIC_ENDPOINT_UNAVAILABLE = 'DualSense microphone unavailable';
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
const TRIGGER_TEST_MODE_OPTIONS: Array<[string, TriggerTestMode]> = [
  ['Feedback', 'feedback'],
  ['Weapon', 'weapon'],
  ['Vibration', 'vibration']
];
const TRIGGER_LAB_BUILTIN_PROFILE_OPTIONS: Array<[string, TriggerLabBuiltinProfileId]> = [
  ['Default', 'default']
];
const TRIGGER_LAB_PROFILE_PRESETS: Record<TriggerLabBuiltinProfileId, TriggerLabDraft> = {
  default: {
    profileId: 'default',
    mode: 'weapon',
    startPercent: 20,
    wallPercent: 60,
    forcePercent: 85
  }
};
const TRIGGER_LAB_DEFAULT_DRAFT = TRIGGER_LAB_PROFILE_PRESETS.default;
const TRIGGER_LAB_AUTO_CUSTOM_PROFILE_ID: TriggerLabCustomProfileId = 'custom';
const TRIGGER_LAB_AUTO_CUSTOM_PROFILE_NAME = 'Custom';
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
  ['DualShock 4', 'ds4'],
  ['Xbox', 'xbox']
];
const SPEAKER_GAIN_OPTIONS: Array<[string, number]> = [
  ['1', 1],
  ['2', 2],
  ['3', 3],
  ['4', 4],
  ['5', 5],
  ['6', 6],
  ['7', 7]
];
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
const TRIGGER_TARGET_OPTIONS: Array<[string, TriggerTestTarget]> = [
  ['L2', 'l2'],
  ['R2', 'r2'],
  ['Both Triggers', 'both']
];
const IDLE_DISCONNECT_TIMEOUT_OPTIONS: Array<[string, number]> = [
  ['5 min', 5],
  ['15 min', 15],
  ['30 min', 30]
];
const UI_SCALE_OPTIONS: Array<[string, UiScalePercent]> = [
  ['75%', 75],
  ['100%', 100],
  ['125%', 125],
  ['150%', 150]
];
const REMAP_BUTTONS: Record<RemapButtonId, RemapButtonDefinition> = {
  l2: { id: 'l2', label: 'L2', glyphUrl: l2GlyphUrl },
  l1: { id: 'l1', label: 'L1', glyphUrl: l1GlyphUrl },
  create: { id: 'create', label: 'Create', glyphUrl: createGlyphUrl },
  'dpad-up': { id: 'dpad-up', label: 'D-pad Up', glyphUrl: dpadUpGlyphUrl },
  'dpad-left': { id: 'dpad-left', label: 'D-pad Left', glyphUrl: dpadLeftGlyphUrl },
  'dpad-down': { id: 'dpad-down', label: 'D-pad Down', glyphUrl: dpadDownGlyphUrl },
  'dpad-right': { id: 'dpad-right', label: 'D-pad Right', glyphUrl: dpadRightGlyphUrl },
  l3: { id: 'l3', label: 'L3', glyphUrl: leftStickClickGlyphUrl },
  r2: { id: 'r2', label: 'R2', glyphUrl: r2GlyphUrl },
  r1: { id: 'r1', label: 'R1', glyphUrl: r1GlyphUrl },
  options: { id: 'options', label: 'Options', glyphUrl: optionsGlyphUrl },
  triangle: { id: 'triangle', label: 'Triangle', glyphUrl: triangleGlyphUrl },
  circle: { id: 'circle', label: 'Circle', glyphUrl: circleGlyphUrl },
  cross: { id: 'cross', label: 'Cross', glyphUrl: crossGlyphUrl },
  square: { id: 'square', label: 'Square', glyphUrl: squareGlyphUrl },
  r3: { id: 'r3', label: 'R3', glyphUrl: rightStickClickGlyphUrl },
  lb: { id: 'lb', label: 'Left Back Button', textGlyph: 'LB' },
  rb: { id: 'rb', label: 'Right Back Button', textGlyph: 'RB' },
  lfn: { id: 'lfn', label: 'Left Function Button', textGlyph: 'LFN' },
  rfn: { id: 'rfn', label: 'Right Function Button', textGlyph: 'RFN' },
  ps: { id: 'ps', label: 'PS Button', glyphUrl: psHomeGlyphUrl }
};
const REMAP_LEFT_BUTTON_IDS: StandardRemapButtonId[] = ['l2', 'l1', 'create', 'dpad-up', 'dpad-right', 'dpad-down', 'dpad-left', 'l3'];
const REMAP_RIGHT_BUTTON_IDS: StandardRemapButtonId[] = ['r2', 'r1', 'options', 'triangle', 'circle', 'cross', 'r3', 'square'];
const REMAP_STANDARD_BUTTON_IDS: StandardRemapButtonId[] = [
  ...REMAP_LEFT_BUTTON_IDS,
  ...REMAP_RIGHT_BUTTON_IDS
];
const REMAP_EDGE_TOP_BUTTON_IDS: DualSenseEdgeRemapButtonId[] = ['lb', 'rb'];
const REMAP_EDGE_BOTTOM_BUTTON_IDS: DualSenseEdgeRemapButtonId[] = ['lfn', 'rfn'];
const REMAP_EDGE_BUTTON_IDS: DualSenseEdgeRemapButtonId[] = [
  ...REMAP_EDGE_TOP_BUTTON_IDS,
  ...REMAP_EDGE_BOTTOM_BUTTON_IDS
];
const REMAP_STANDARD_TARGET_BUTTON_IDS: StandardRemapButtonId[] = [
  'triangle',
  'circle',
  'cross',
  'square',
  'dpad-up',
  'dpad-right',
  'dpad-down',
  'dpad-left',
  'l1',
  'r1',
  'l2',
  'r2',
  'l3',
  'r3',
  'create',
  'options'
];
const REMAP_TARGET_BUTTON_IDS: RemapButtonId[] = [
  ...REMAP_STANDARD_TARGET_BUTTON_IDS,
  'ps'
];
const CHORD_BUTTON_MENU_IDS: ChordAssignableButtonId[] = [
  ...REMAP_STANDARD_TARGET_BUTTON_IDS,
  'lb',
  'rb'
];
const REMAP_ALL_BUTTON_IDS = [...REMAP_BUTTON_IDS] as RemapButtonId[];
const REMAP_TARGET_OPTIONS: Array<[string, RemapButtonId]> = [
  ...REMAP_TARGET_BUTTON_IDS
].map((id) => [REMAP_BUTTONS[id].label, id]);
const CHORD_STARTERS: Record<ChordStarterId, ChordStarterDefinition> = {
  ps: { id: 'ps', label: 'PS Button', glyphUrl: psHomeGlyphUrl },
  lfn: { id: 'lfn', label: 'LFN', textGlyph: 'LFN' },
  rfn: { id: 'rfn', label: 'RFN', textGlyph: 'RFN' },
  mute: { id: CHORD_MUTE_STARTER_ID, label: 'Mute Button', Icon: MicOff }
};
const CHORD_STARTER_OPTIONS: Array<[string, ChordStarterId]> = [
  [CHORD_STARTERS.ps.label, 'ps'],
  [CHORD_STARTERS.lfn.label, 'lfn'],
  [CHORD_STARTERS.rfn.label, 'rfn'],
  [CHORD_STARTERS.mute.label, CHORD_MUTE_STARTER_ID]
];
const CHORD_FUNCTION_TYPE_OPTIONS: Array<[string, ChordFunctionType]> = [
  ['Keyboard Shortcut', 'keyboard'],
  ['Media Action', 'media'],
  ['Controller Setting', 'controller-setting']
];
const CHORD_MEDIA_ACTION_OPTIONS: Array<[string, ChordMediaAction]> = [
  ['Play / Pause', 'play-pause'],
  ['Next Track', 'next-track'],
  ['Previous Track', 'previous-track'],
  ['Mute Output', 'mute'],
  ['Volume Up', 'volume-up'],
  ['Volume Down', 'volume-down']
];
const CHORD_NOTCH_TARGETS: Array<{
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
const CHORD_CONTROLLER_SETTING_ACTION_OPTIONS: Array<[string, ChordControllerSettingSelectValue]> = [
  ['Audio Haptics', 'toggle-audio-haptics'],
  ['Lightbar Override', 'toggle-lightbar-override'],
  ['Mic Mute', 'toggle-mic-mute'],
  ['Sleep Controller', 'sleep-controller'],
  ['DualSense', 'persona-dualsense'],
  ['DualShock 4', 'persona-ds4'],
  ['Xbox', 'persona-xbox'],
  ...CHORD_NOTCH_TARGETS.map((target): [string, ChordNotchTargetId] => [target.label, target.id])
];
const CHORD_KEYBOARD_KEY_OPTIONS: Array<[string, string]> = [
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
const CHORD_KEYBOARD_KEY_MAX_LABEL_LENGTH = Math.max(
  ...CHORD_KEYBOARD_KEY_OPTIONS.map(([label]) => label.length)
);
const CHORD_KEYBOARD_MODIFIER_OPTIONS: Array<[ChordKeyboardModifier, ChordKeyboardModifier]> = [
  ['Ctrl', 'Ctrl'],
  ['Shift', 'Shift'],
  ['Alt', 'Alt'],
  ['Win', 'Win']
];
const DEFAULT_CHORD_KEYBOARD_KEYS = ['Ctrl', 'Shift', 'Esc'];
const EMPTY_CHORD_FUNCTION_DRAFT: ChordFunctionDraft = {
  id: '',
  name: 'Task Manager',
  type: 'keyboard',
  keyboardKey: 'Esc',
  keyboardModifiers: ['Ctrl', 'Shift'],
  mediaAction: 'play-pause',
  controllerAction: 'sleep-controller',
  controllerStepPercent: CHORD_CONTROLLER_SETTING_STEP_DEFAULT
};
const DEFAULT_REMAP_DRAFT = Object.fromEntries(
  REMAP_ALL_BUTTON_IDS.map((id) => [id, id])
) as Record<RemapButtonId, RemapButtonId>;
const REMAP_CALLOUT_POINTS: Record<StandardRemapButtonId, Array<[number, number]>> = {
  l2: [[2.4, 3.17], [118.22, 3.17], [171.1, 93.49]],
  l1: [[2.4, 63.71], [121.9, 63.71], [153.13, 118.36]],
  create: [[2.4, 124.24], [110.86, 124.24], [134, 163], [186.65, 162.89]],
  'dpad-up': [[2.4, 184.78], [146.83, 184.78]],
  'dpad-right': [[2.4, 245.32], [126.31, 245.32], [138.09, 221.25]],
  'dpad-down': [[2.4, 305.86], [124.63, 305.86], [162.42, 241.39]],
  'dpad-left': [[2.4, 366.39], [106.55, 366.39], [189.13, 221.85]],
  l3: [[2.4, 426.93], [143.77, 426.93], [230.4, 275.47]],
  r2: [[595.34, 3.17], [481.09, 3.17], [427.95, 93.94]],
  r1: [[595.34, 63.71], [476.83, 63.71], [445.92, 117.79]],
  options: [[595.34, 124.24], [487.5, 124.24], [464.28, 162.89], [411.62, 162.89]],
  triangle: [[595.34, 184.78], [453.97, 184.78]],
  circle: [[595.34, 245.32], [486.88, 245.32], [473.71, 222.09]],
  cross: [[595.34, 305.86], [472.22, 305.86], [438.56, 248.84]],
  square: [[595.34, 366.39], [485.42, 366.39], [405.35, 223.46]],
  r3: [[595.34, 426.93], [453.97, 426.93], [369.45, 275.47]]
};
const REMAP_EDGE_CALLOUT_POINTS: Record<StandardRemapButtonId, Array<[number, number]>> = {
  l2: [[0.5, 0.5], [119.4, 0.5], [162.08, 90.82]],
  l1: [[0.5, 61.04], [118.08, 61.04], [154.08, 112.52]],
  create: [[0.5, 121.57], [108.96, 121.57], [132.1, 160.28], [183.55, 160.28]],
  'dpad-up': [[0.5, 182.11], [141.23, 182.11]],
  'dpad-right': [[0.5, 363.72], [104.65, 363.72], [188.5, 216.96]],
  'dpad-down': [[0.5, 303.19], [122.73, 303.19], [159.9, 239.79]],
  'dpad-left': [[0.5, 242.65], [124.41, 242.65], [137.98, 216.32]],
  l3: [[0.5, 424.26], [141.87, 424.26], [226.76, 271.06]],
  r2: [[593.44, 0.5], [482.26, 0.5], [439.58, 90.82]],
  r1: [[593.44, 61.04], [483.58, 61.04], [447.58, 112.52]],
  options: [[593.44, 121.57], [485.6, 121.57], [462.38, 160.22], [414.99, 160.22]],
  triangle: [[593.44, 182.11], [455.88, 182.11]],
  circle: [[593.44, 242.65], [484.98, 242.65], [470.67, 217.4]],
  cross: [[593.44, 303.19], [470.32, 303.19], [436.66, 246.17]],
  square: [[593.44, 363.72], [498.9, 363.72], [406.86, 218.55]],
  r3: [[593.44, 424.26], [452.07, 424.26], [370.93, 271.66]]
};
const REMAP_CALLOUT_Y: Record<StandardRemapButtonId, number> = {
  l2: 3.17,
  l1: 63.71,
  create: 124.24,
  'dpad-up': 184.78,
  'dpad-right': 245.32,
  'dpad-down': 305.86,
  'dpad-left': 366.39,
  l3: 426.93,
  r2: 3.17,
  r1: 63.71,
  options: 124.24,
  triangle: 184.78,
  circle: 245.32,
  cross: 305.86,
  square: 366.39,
  r3: 426.93
};
const REMAP_EDGE_CALLOUT_Y: Record<StandardRemapButtonId, number> = {
  l2: 0.5,
  l1: 61.04,
  create: 121.57,
  'dpad-up': 182.11,
  'dpad-right': 363.72,
  'dpad-down': 303.19,
  'dpad-left': 242.65,
  l3: 424.26,
  r2: 0.5,
  r1: 61.04,
  options: 121.57,
  triangle: 182.11,
  circle: 242.65,
  cross: 303.19,
  square: 363.72,
  r3: 424.26
};
const REMAP_STANDARD_LAYOUT_ASSET = {
  src: remappingLayoutImage,
  viewBoxWidth: 597.47,
  viewBoxHeight: 429.39,
  calloutPoints: REMAP_CALLOUT_POINTS,
  calloutY: REMAP_CALLOUT_Y
};
const REMAP_EDGE_LAYOUT_ASSET = {
  src: remappingEdgeLayoutImage,
  viewBoxWidth: 593.94,
  viewBoxHeight: 424.76,
  calloutPoints: REMAP_EDGE_CALLOUT_POINTS,
  calloutY: REMAP_EDGE_CALLOUT_Y
};
const REMAP_EDGE_CONTROL_POINTS: Record<DualSenseEdgeRemapButtonId, { x: number; y: number; anchor: 'top' | 'bottom' }> = {
  lb: { x: 227.59, y: 33.19, anchor: 'bottom' },
  rb: { x: 371.02, y: 33.19, anchor: 'bottom' },
  lfn: { x: 227.5, y: 368.88, anchor: 'top' },
  rfn: { x: 370.46, y: 368.88, anchor: 'top' }
};
const REMAP_EDGE_LINE_POINTS: Record<DualSenseEdgeRemapButtonId, [[number, number], [number, number]]> = {
  lb: [[227.59, 33.19], [227.42, 105.09]],
  rb: [[371.02, 33.19], [370.84, 105.09]],
  lfn: [[227.5, 368.88], [227.68, 296.98]],
  rfn: [[370.46, 368.88], [370.64, 296.98]]
};
const CONTROL_TABS: Array<{ id: ControlTab; label: string; Icon: TablerIcon }> = [
  { id: 'overview', label: 'Overview', Icon: IconLayoutDashboard },
  { id: 'audio', label: 'Audio', Icon: IconVolume },
  { id: 'haptics', label: 'Haptics', Icon: Sparkles },
  { id: 'triggers', label: 'Triggers', Icon: IconDeviceGamepad2 },
  { id: 'lighting', label: 'Lighting', Icon: IconBulb },
  { id: 'remapping', label: 'Button Remapping', Icon: IconDeviceGamepad3 },
  { id: 'system', label: 'System', Icon: IconCpu }
];

type SelectValue = string | number;
type SinkSelectableAudio = HTMLAudioElement & {
  setSinkId?: (sinkId: string) => Promise<void>;
  sinkId?: string;
};
const LAST_REMAP_CONTROLLER_TYPE_STORAGE_KEY = 'ds5bridge.lastRemapControllerType';
const TRIGGER_LAB_CUSTOM_PROFILES_STORAGE_KEY = 'ds5bridge.triggerLabProfiles';
const TRIGGER_LAB_WORKSPACE_STORAGE_KEY = 'ds5bridge.triggerLabWorkspace';
const UI_THEME_PRESET_STORAGE_KEY = 'ds5bridge.uiThemePreset';
const STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY = 'ds5bridge.startupTutorialCompleted.v1';
const STARTUP_READY_HOLD_MS = 1000;

function storedRemapControllerType(): KnownControllerType {
  const saved = window.localStorage.getItem(LAST_REMAP_CONTROLLER_TYPE_STORAGE_KEY);
  return saved === 'dualsense-edge' ? 'dualsense-edge' : 'dualsense';
}

function isUiThemePreset(value: string | null): value is UiThemePreset {
  return UI_THEME_OPTIONS.some(([, preset]) => preset === value);
}

function storedUiThemePreset(): UiThemePreset {
  const saved = window.localStorage.getItem(UI_THEME_PRESET_STORAGE_KEY);
  return isUiThemePreset(saved) ? saved : DEFAULT_UI_THEME_PRESET;
}

function saveUiThemePreset(preset: UiThemePreset): void {
  window.localStorage.setItem(UI_THEME_PRESET_STORAGE_KEY, preset);
}

function storedStartupTutorialStep(): StartupTutorialStep {
  return window.localStorage.getItem(STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY) === '1' ? 'done' : 'feature-toggle';
}

function saveStartupTutorialCompleted(): void {
  window.localStorage.setItem(STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY, '1');
}

type CustomSelectProps<T extends SelectValue> = {
  value: T;
  options: Array<[string, T]>;
  disabled?: boolean;
  className?: string;
  floatingMenu?: boolean;
  floatingMenuMinWidth?: number;
  suspendOutsideClose?: boolean;
  showSelectedCheck?: boolean;
  closeOnSelect?: boolean;
  getOptionClassName?: (label: string, value: T) => string | undefined;
  renderValue?: (label: string, value: T) => ReactNode;
  renderOption?: (label: string, value: T) => ReactNode;
  renderMenuFooter?: (closeMenu: () => void) => ReactNode;
  ariaLabel: string;
  onChange: (value: T) => void;
};

type CustomSelectMenuStyle = CSSProperties & {
  '--custom-select-menu-max-height'?: string;
};

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

function snapSpeakerVolume(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / SPEAKER_VOLUME_STEP) * SPEAKER_VOLUME_STEP));
}

function snapMicVolume(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / MIC_VOLUME_STEP) * MIC_VOLUME_STEP));
}

function clampAudioBufferLength(value: number): number {
  if (!Number.isFinite(value)) {
    return 64;
  }
  return Math.max(AUDIO_BUFFER_LENGTH_MIN, Math.min(AUDIO_BUFFER_LENGTH_MAX, Math.round(value)));
}

function audioBufferDelayMs(value: number): number {
  return clampAudioBufferLength(value) / 3;
}

function audioBufferDelayLabel(value: number): string {
  return `${audioBufferDelayMs(value).toFixed(1)} ms`;
}

function audioBufferPercent(value: number): number {
  return ((clampAudioBufferLength(value) - AUDIO_BUFFER_LENGTH_MIN) / (AUDIO_BUFFER_LENGTH_MAX - AUDIO_BUFFER_LENGTH_MIN)) * 100;
}

function audioBufferZoneLabel(value: number): string {
  const bufferLength = clampAudioBufferLength(value);
  if (bufferLength <= AUDIO_BUFFER_LENGTH_HIGH_STUTTER_MAX) {
    return 'High stutter';
  }
  if (bufferLength <= AUDIO_BUFFER_LENGTH_RISKY_MAX) {
    return 'Risky';
  }
  return 'Safe';
}

function audioBufferZoneTooltip(value: number): string {
  const bufferLength = clampAudioBufferLength(value);
  if (bufferLength <= AUDIO_BUFFER_LENGTH_HIGH_STUTTER_MAX) {
    return 'Danger: lowest haptic delay, but speaker audio is likely to stutter or underrun.';
  }
  if (bufferLength <= AUDIO_BUFFER_LENGTH_RISKY_MAX) {
    return 'Warning: lower haptic delay, with a minimal chance of speaker stutter under load.';
  }
  return 'Safe: more speaker buffer headroom, with higher DualSense haptic delay.';
}

function audioBufferZoneTone(value: number): 'stutter' | 'risky' | 'safe' {
  const bufferLength = clampAudioBufferLength(value);
  if (bufferLength <= AUDIO_BUFFER_LENGTH_HIGH_STUTTER_MAX) {
    return 'stutter';
  }
  if (bufferLength <= AUDIO_BUFFER_LENGTH_RISKY_MAX) {
    return 'risky';
  }
  return 'safe';
}

function snapLightbarBrightness(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / LIGHTBAR_BRIGHTNESS_STEP) * LIGHTBAR_BRIGHTNESS_STEP));
}

function snapTriggerEffectIntensity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / TRIGGER_EFFECT_STEP) * TRIGGER_EFFECT_STEP));
}

function snapTriggerLabPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / TRIGGER_LAB_SLIDER_STEP) * TRIGGER_LAB_SLIDER_STEP));
}

function isTriggerLabBuiltinProfileId(value: string): value is TriggerLabBuiltinProfileId {
  return value === 'default';
}

function isTriggerTestModeValue(value: unknown): value is TriggerTestMode {
  return value === 'feedback' || value === 'weapon' || value === 'vibration';
}

function loadTriggerLabCustomProfiles(): TriggerLabCustomProfile[] {
  try {
    const rawProfiles = JSON.parse(window.localStorage.getItem(TRIGGER_LAB_CUSTOM_PROFILES_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(rawProfiles)) {
      return [];
    }
    return rawProfiles.flatMap((profile): TriggerLabCustomProfile[] => {
      if (!profile || typeof profile !== 'object') {
        return [];
      }
      const candidate = profile as Partial<TriggerLabCustomProfile>;
      if (
        typeof candidate.id !== 'string'
        || (candidate.id !== TRIGGER_LAB_AUTO_CUSTOM_PROFILE_ID && !candidate.id.startsWith('custom-'))
        || typeof candidate.name !== 'string'
        || candidate.name.trim().length === 0
        || !isTriggerTestModeValue(candidate.mode)
      ) {
        return [];
      }
      return [{
        id: candidate.id as TriggerLabCustomProfileId,
        name: candidate.name.trim().slice(0, 48),
        mode: candidate.mode,
        startPercent: snapTriggerLabPercent(Number(candidate.startPercent ?? 0)),
        wallPercent: snapTriggerLabPercent(Number(candidate.wallPercent ?? 0)),
        forcePercent: snapTriggerLabPercent(Number(candidate.forcePercent ?? 0)),
        active: candidate.active === true
      }];
    });
  } catch {
    return [];
  }
}

function saveTriggerLabCustomProfiles(profiles: TriggerLabCustomProfile[]) {
  window.localStorage.setItem(TRIGGER_LAB_CUSTOM_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
}

function createTriggerLabProfileId(): TriggerLabCustomProfileId {
  return `custom-${window.crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`}`;
}

function defaultTriggerLabWorkspaceState(): TriggerLabWorkspaceState {
  return {
    linked: true,
    drafts: {
      l2: { ...TRIGGER_LAB_DEFAULT_DRAFT },
      r2: { ...TRIGGER_LAB_DEFAULT_DRAFT }
    },
    active: {
      l2: false,
      r2: false
    },
    splitState: null
  };
}

function triggerLabProfileDraftFromProfile(profile: TriggerLabCustomProfile): TriggerLabDraft {
  return {
    profileId: profile.id,
    mode: profile.mode,
    startPercent: profile.startPercent,
    wallPercent: profile.wallPercent,
    forcePercent: profile.forcePercent
  };
}

function normalizeTriggerLabWorkspaceDraft(
  value: unknown,
  profiles: TriggerLabCustomProfile[]
): TriggerLabDraft {
  if (!value || typeof value !== 'object') {
    return { ...TRIGGER_LAB_DEFAULT_DRAFT };
  }

  const candidate = value as Partial<TriggerLabDraft>;
  if (candidate.profileId === 'default') {
    return { ...TRIGGER_LAB_DEFAULT_DRAFT };
  }

  if (typeof candidate.profileId === 'string') {
    const customProfile = profiles.find((profile) => profile.id === candidate.profileId);
    if (customProfile) {
      return triggerLabProfileDraftFromProfile(customProfile);
    }
  }

  return { ...TRIGGER_LAB_DEFAULT_DRAFT };
}

function triggerLabWorkspaceDraftActive(
  draft: TriggerLabDraft,
  storedActive: unknown,
  profiles: TriggerLabCustomProfile[]
): boolean {
  if (draft.profileId === 'default') {
    return false;
  }
  const profileActive = profiles.find((profile) => profile.id === draft.profileId)?.active ?? false;
  const active = typeof storedActive === 'boolean' ? storedActive : profileActive;
  return active && draft.forcePercent > 0;
}

function loadTriggerLabWorkspaceState(profiles: TriggerLabCustomProfile[]): TriggerLabWorkspaceState {
  const fallback = defaultTriggerLabWorkspaceState();
  try {
    const value = JSON.parse(window.localStorage.getItem(TRIGGER_LAB_WORKSPACE_STORAGE_KEY) ?? 'null') as unknown;
    if (!value || typeof value !== 'object') {
      return fallback;
    }

    const candidate = value as Partial<TriggerLabWorkspaceState>;
    const l2Draft = normalizeTriggerLabWorkspaceDraft(candidate.drafts?.l2, profiles);
    const r2Draft = normalizeTriggerLabWorkspaceDraft(candidate.drafts?.r2, profiles);
    const active = {
      l2: triggerLabWorkspaceDraftActive(l2Draft, candidate.active?.l2, profiles),
      r2: triggerLabWorkspaceDraftActive(r2Draft, candidate.active?.r2, profiles)
    };

    let splitState: TriggerLabSplitState | null = null;
    if (candidate.splitState && typeof candidate.splitState === 'object') {
      const splitL2Draft = normalizeTriggerLabWorkspaceDraft(candidate.splitState.drafts?.l2, profiles);
      const splitR2Draft = normalizeTriggerLabWorkspaceDraft(candidate.splitState.drafts?.r2, profiles);
      splitState = {
        drafts: {
          l2: splitL2Draft,
          r2: splitR2Draft
        },
        active: {
          l2: triggerLabWorkspaceDraftActive(splitL2Draft, candidate.splitState.active?.l2, profiles),
          r2: triggerLabWorkspaceDraftActive(splitR2Draft, candidate.splitState.active?.r2, profiles)
        }
      };
    }

    const linked = candidate.linked !== false;
    const workspaceActive = linked
      ? { l2: active.l2 || active.r2, r2: active.l2 || active.r2 }
      : active;

    return {
      linked,
      drafts: {
        l2: l2Draft,
        r2: r2Draft
      },
      active: workspaceActive,
      splitState
    };
  } catch {
    return fallback;
  }
}

function loadTriggerLabInitialState(): TriggerLabInitialState {
  const profiles = loadTriggerLabCustomProfiles();
  return {
    ...loadTriggerLabWorkspaceState(profiles),
    profiles
  };
}

function saveTriggerLabWorkspaceState(state: TriggerLabWorkspaceState) {
  window.localStorage.setItem(TRIGGER_LAB_WORKSPACE_STORAGE_KEY, JSON.stringify(state));
}

function controllerPowerSavingActiveFromSnapshot(snapshot: BridgeSnapshot | null | undefined): boolean {
  return Boolean(snapshot?.settings.controllerPowerSavingEnabled && snapshot.diagnostics.audioStatus?.headsetPlugged);
}

function capControllerPowerSavingValue(value: number, snapshot: BridgeSnapshot | null | undefined): number {
  return controllerPowerSavingActiveFromSnapshot(snapshot)
    ? Math.min(value, CONTROLLER_POWER_SAVING_CAP_PERCENT)
    : value;
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

function displayLightbarBrightnessValue(snapshot: BridgeSnapshot): number {
  return capControllerPowerSavingValue(snapshot.settings.lightbarBrightnessPercent, snapshot);
}

function displayTriggerEffectIntensityValue(snapshot: BridgeSnapshot): number {
  return capControllerPowerSavingValue(snapshot.settings.triggerEffectIntensityPercent, snapshot);
}

function sliderTickClass(value: number, max: number): string | undefined {
  if (value === 0 || value === max) {
    return 'milestone endpoint';
  }
  if (value === max / 2) {
    return 'milestone';
  }
  return undefined;
}

type TriggerLabMeterProps = {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
};

function TriggerLabMeter({ label, value, disabled = false, onChange, onCommit }: TriggerLabMeterProps) {
  function commitValue(element: HTMLInputElement) {
    onCommit(snapTriggerLabPercent(Number(element.value)));
  }

  return (
    <div className="range-control trigger-lab-meter">
      <input
        type="range"
        min="0"
        max="100"
        step={TRIGGER_LAB_SLIDER_STEP}
        value={value}
        disabled={disabled}
        aria-label={label}
        style={{ '--range-fill': `${value}%` } as CSSProperties}
        onChange={(event) => onChange(snapTriggerLabPercent(Number(event.currentTarget.value)))}
        onBlur={(event) => commitValue(event.currentTarget)}
        onKeyUp={(event) => commitValue(event.currentTarget)}
        onPointerCancel={(event) => commitValue(event.currentTarget)}
        onPointerUp={(event) => commitValue(event.currentTarget)}
      />
      <div className="range-ticks" aria-hidden="true">
        {TRIGGER_LAB_SLIDER_TICKS.map((tick) => (
          <span key={tick} className={sliderTickClass(tick, 100)} />
        ))}
      </div>
    </div>
  );
}

function BridgeMark() {
  return (
    <svg className="bridge-mark" viewBox="335 88 310 292" aria-hidden="true" focusable="false">
      <path
        d="M 864.77 430.4 L 864.77 430.4 A 0.3453 0.3389 -55.841 0 1 864.65 429.74 C 890.7 418.97 908.21 394.39 913.07 367.04 Q 913.87 362.54 913.87 350.25 Q 913.87 343.85 913.73 310.51 C 913.59 279.64 890.84 248.89 859.8 243.26 Q 855.01 242.39 845.2 242.4 Q 735.01 242.44 716.25 242.4 Q 708.72 242.38 705.28 242.67 C 688.41 244.09 674.53 255.82 670.13 271.87 Q 668.71 277.05 668.72 288.26 Q 668.8 403.3 668.79 407.26 C 668.73 429.15 687.02 445.81 708.28 445.78 Q 723.29 445.75 737.72 445.69 L 737.72 445.69 A 0.6565 0.6519 78.2735 0 1 738.34 446.1 Q 748.79 472.7 773.46 487.92 L 773.46 487.92 A 0.2759 0.2737 60.5847 0 1 773.32 488.43 Q 746.06 488.27 717.83 488.45 Q 699.82 488.56 692.29 486.93 Q 675.65 483.32 663.78 475.73 Q 640.67 460.95 630.84 435.18 C 626.71 424.34 625.81 415.24 625.82 402.4 Q 625.87 313.63 625.78 289.05 Q 625.72 274.97 627.22 267.58 C 634.19 233.22 661.15 206.38 695.82 200.44 Q 701.96 199.39 712.75 199.39 Q 768.15 199.4 854 199.4 Q 858.34 199.41 867.8 201.07 Q 874.86 202.32 881.21 204.48 C 914.65 215.86 940.3 242.82 951.4 276.34 Q 956.72 292.43 956.78 308.5 Q 956.81 318.91 956.88 344.27 Q 956.94 364.15 955.25 374.14 Q 951.72 395.08 941.77 413.99 C 938.94 419.38 934.77 424.88 931.3 429.85 L 931.3 429.85 A 1.2776 1.2741 17.2763 0 1 930.25 430.4 L 864.77 430.4 Z"
        fill="var(--bridge-mark-primary)"
        transform="matrix(0.5818 0 0 0.5818 0 0)"
      />
      <path
        d="M 896.95 373.03 L 896.95 373.03 A 0.6463 0.6441 -83.8938 0 1 896.32 373.54 Q 871.83 373.82 838.84 373.65 Q 820.82 373.56 816.73 374.53 C 795.55 379.55 784.9 400.68 790.87 421.13 C 793.48 430.08 798.91 436.11 806.81 440.77 Q 815.27 445.76 824.54 445.77 Q 857.29 445.77 980.74 445.82 Q 993.93 445.83 1007.2 451.29 C 1046.5 467.48 1065.63 510.54 1050.8199 550.98 Q 1043.61 570.68 1027.51 584.73 Q 1023.67 588.08 1014.98 593.18 Q 1005.17 598.94 992.3 601.61 Q 986.5 602.81 968.13 602.8 Q 876.32 602.75 842.35 602.75 Q 818.37 602.75 817.15 602.59 C 805.99 601.11 795.75 597.97 785.66 591.65 Q 759.6 575.33 750.46 544.77 Q 746.76 532.39 747.41 519.21 L 747.41 519.21 A 1.3529 1.3514 -88.6671 0 1 748.76 517.92 L 787.86 517.92 L 787.86 517.92 A 1.8981 1.8942 -88.1551 0 1 789.75 519.94 C 788.61 537.13 798.59 553.44 815.27 558.67 Q 820.27 560.24 835.53 560.22 Q 897.28 560.16 976.26 560.16 Q 990.81 560.16 1000.68 551.71 Q 1015.36 539.15 1013.57 519.34 Q 1013.3 516.35 1011.1 510.38 C 1008.01 501.96 1001.86 496.55 993.91 492.23 C 986.35 488.13 979.5 488.45 970 488.44 Q 892 488.41 827.25 488.47 Q 816.38 488.48 807.56 486.62 C 787.46 482.39 769.98 469.71 759.32 452.36 Q 757.23 448.98 755.78 445.86 C 754.36 442.81 752.55 439.97 751.58 437.02 Q 740.83 404.12 755.51 374.72 C 767.26 351.19 788.59 335.04 814.84 331.58 Q 820.95 330.78 832.06 330.81 Q 883.87 330.98 897.79 330.8 L 897.79 330.8 A 0.7015 0.6915 -89.2094 0 1 898.49 331.53 Q 898.05 343.01 898.46 354.62 C 898.72 361.7 898.34 366.91 896.95 373.03 Z"
        fill="var(--bridge-mark-secondary)"
        transform="matrix(0.5818 0 0 0.5818 0 0)"
      />
      <path
        d="M 971.82 331.88 L 971.82 331.88 A 0.98 0.98 -60.1943 0 1 972.8 330.9 C 994.8 331.03 1015.5 340.93 1030.0601 357.64 Q 1049.92 380.42 1049.22 413.11 L 1049.22 413.11 A 1.591 1.5905 -89.2606 0 1 1047.63 414.66 L 1008.32 414.66 L 1008.32 414.66 A 1.9801 1.98 89.8546 0 1 1006.34 412.69 Q 1006.3 406.39 1006.21 405.46 Q 1004.53 389.03 991.04 379.45 Q 983.23 373.91 972.94 373.98 L 972.94 373.98 A 1.1101 1.11 -0.2558 0 1 971.82 372.87 L 971.82 331.88 Z"
        fill="var(--bridge-mark-secondary)"
        transform="matrix(0.5818 0 0 0.5818 0 0)"
      />
    </svg>
  );
}

function StartupScreen({ ready }: { ready: boolean }) {
  return (
    <main className={`startup-screen ${ready ? 'ready' : ''}`} aria-live="polite">
      <section className="startup-card" aria-label="Starting DS5 Bridge">
        <div className="startup-brand">
          <BridgeMark />
          <div>
            <strong>DS5 Bridge</strong>
            <span>Starting companion</span>
          </div>
        </div>
        <div className="startup-progress" aria-hidden="true">
          <span />
        </div>
      </section>
    </main>
  );
}

function StartupTutorial({
  step,
  featureExampleActive,
  supportCountdown,
  kofiBadgeUrl,
  onFeatureExampleToggle,
  onFeatureStepComplete,
  onSupport,
  onFinish
}: {
  step: Exclude<StartupTutorialStep, 'done'>;
  featureExampleActive: boolean;
  supportCountdown: number;
  kofiBadgeUrl: string;
  onFeatureExampleToggle: () => void;
  onFeatureStepComplete: () => void;
  onSupport: () => void;
  onFinish: () => void;
}) {
  return (
    <div className="modal-backdrop startup-tutorial-backdrop" role="presentation">
      <section
        className="settings-menu bridge-settings-modal startup-tutorial-modal"
        role="dialog"
        aria-modal="true"
        aria-label={step === 'feature-toggle' ? 'Feature tile tutorial' : 'Support DS5 Bridge'}
      >
        {step === 'feature-toggle' ? (
          <>
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <IconSparkleHighlight size={16} />
                <span>Feature Tiles</span>
              </div>
              <span className="startup-tutorial-step">1 / 2</span>
            </div>
            <div className="startup-tutorial-copy">
              <h2>Click The Square</h2>
              <p>Feature tiles turn effects on and off. Try it once here, then keep going.</p>
            </div>
            <div className="startup-tutorial-feature-demo">
              <button
                className={`startup-tutorial-feature-icon ${featureExampleActive ? 'active' : ''}`}
                type="button"
                aria-pressed={featureExampleActive}
                aria-label="Toggle example effect"
                onClick={onFeatureExampleToggle}
              >
                <IconSparkleHighlight size={24} />
              </button>
              <span>
                <strong>Example Effect</strong>
                <span>{featureExampleActive ? 'On' : 'Off'}</span>
              </span>
            </div>
            <div className="startup-tutorial-actions">
              <button
                type="button"
                className="primary-action"
                disabled={!featureExampleActive}
                onClick={onFeatureStepComplete}
              >
                Next <ArrowRight size={16} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <Heart size={16} />
                <span>One Tiny Ask</span>
              </div>
              <span className="startup-tutorial-step">2 / 2</span>
            </div>
            <div className="startup-tutorial-copy">
              <h2>Enjoying DS5 Bridge?</h2>
              <p>If this app makes your setup better, please consider supporting the work on Ko-fi.</p>
            </div>
            <button
              className="startup-tutorial-kofi-button"
              type="button"
              aria-label="Support SundayMoments on Ko-fi"
              onClick={onSupport}
            >
              <img src={kofiBadgeUrl} alt="" />
            </button>
            <div className="startup-tutorial-actions">
              <button
                type="button"
                className="primary-action"
                disabled={supportCountdown > 0}
                onClick={onFinish}
              >
                {supportCountdown > 0 ? `Continue In ${supportCountdown}` : 'Continue'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function ProfileSaveStatus() {
  return (
    <div className="system-profile-save-status">
      <span className="autosave-check-icon" aria-hidden="true">
        <Check className="autosave-check-outline" size={16} />
        <Check className="autosave-check-fill" size={16} />
      </span>
      <span>Changes Are Automatically Saved</span>
    </div>
  );
}

function FeatureTipsPanel({
  tab,
  onSettingsFocusRequest,
  audioHapticsOpen = false,
  triggerLabOpen = false
}: FeatureTipsPanelProps) {
  const [featureTileSampleActive, setFeatureTileSampleActive] = useState(false);
  const [triggerLabLinkTipSplit, setTriggerLabLinkTipSplit] = useState(false);
  const tips: Array<{
    key: string;
    icon: ReactNode;
    title: string;
    text: string;
    tone?: 'success';
  }> = [
    {
      key: 'toggle',
      icon: <IconSparkleHighlight size={16} />,
      title: 'Feature Tiles',
      text: 'Click the square icon tile to enable or disable that feature.'
    },
    {
      key: 'unavailable',
      icon: <Settings2 size={16} />,
      title: 'Unavailable',
      text: 'Dimmed controls need the bridge, controller, or matching feature enabled.'
    }
  ];

  if (tab === 'triggers' && triggerLabOpen) {
    tips.push({
      key: 'trigger-lab-override',
      icon: <IconFlask2 size={16} />,
      title: 'Lab Override',
      text: 'Active Lab effects stay applied and ignore incoming game trigger output.'
    });
  } else if (tab === 'haptics' && audioHapticsOpen) {
    tips.push({
      key: 'audio-haptics',
      icon: <IconDeviceAudioTape size={16} />,
      title: 'Audio Haptics',
      text: 'Audio Haptics turns system audio into haptic feedback.'
    });
  } else if (tab === 'audio') {
    tips.push({
      key: 'headphones',
      icon: <Headphones size={16} />,
      title: 'Headphones',
      text: 'Headphones use the same Pico-local audio path as the controller speaker.'
    });
  } else {
    tips.push({
      key: 'power-saving',
      icon: <IconBatteryEco size={16} />,
      title: 'Green Icon',
      text: 'Power saving is temporarily capping this setting while headphones are connected.',
      tone: 'success'
    });
  }

  if (tab === 'triggers' && triggerLabOpen) {
    tips.push({
      key: 'trigger-lab-link',
      icon: triggerLabLinkTipSplit ? <LinkOffIcon size={16} /> : <LinkIcon size={16} />,
      title: 'Linked / Split',
      text: 'When Linked is on, the selected effect mirrors across L2 and R2. Split keeps each trigger separate.'
    });
  } else if (tab === 'haptics' && audioHapticsOpen) {
    tips.push({
      key: 'audio-haptics-mode',
      icon: <IconBrandDeezer size={16} />,
      title: 'Mix / Replace',
      text: 'Mix adds audio feedback to native haptics and rumble; Replace uses only the derived audio feel.'
    });
  } else if (tab === 'lighting') {
    tips.push({
      key: 'custom-color',
      icon: <Palette size={16} />,
      title: 'Custom Color',
      text: 'Double-click the final color swatch to choose a custom lightbar color.'
    });
  } else {
    tips.push({
      key: 'tests',
      icon: <Play size={16} />,
      title: 'Tests',
      text: 'Tests may pause while a game or audio stream is actively using the controller.'
    });
  }

  return (
    <section className="feature-help-panel" aria-label={`${tab} tips`}>
      <div className="feature-help-heading">
        <IconQuestionMark size={16} />
        <h3>Tips</h3>
      </div>
      <div className="feature-help-grid">
        {tips.map((tip) => (
          <div
            className="feature-help-item"
            key={tip.key}
          >
            {tip.key === 'toggle' ? (
              <button
                className={`feature-help-icon feature-help-icon-button ${featureTileSampleActive ? 'active' : ''}`}
                type="button"
                aria-pressed={featureTileSampleActive}
                aria-label="Toggle feature tile example"
                onClick={() => setFeatureTileSampleActive((active) => !active)}
              >
                {tip.icon}
              </button>
            ) : tip.key === 'power-saving' ? (
              <button
                className={`feature-help-icon feature-help-icon-button ${tip.tone ?? ''}`}
                type="button"
                aria-label="Open Controller Power Saving settings"
                onClick={() => onSettingsFocusRequest?.('controller-power-saving')}
              >
                {tip.icon}
              </button>
            ) : tip.key === 'trigger-lab-link' ? (
              <button
                className={`feature-help-icon feature-help-icon-button ${triggerLabLinkTipSplit ? '' : 'active'}`}
                type="button"
                aria-pressed={!triggerLabLinkTipSplit}
                aria-label="Toggle Linked Split tip example"
                onClick={() => setTriggerLabLinkTipSplit((split) => !split)}
              >
                {tip.icon}
              </button>
            ) : (
              <span className={`feature-help-icon ${tip.tone ?? ''}`} aria-hidden="true">
                {tip.icon}
              </span>
            )}
            <span className="feature-help-copy">
              <strong>{tip.title}</strong>
              <span>{tip.text}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function controllerProfileSettingsFromSnapshot(snapshot: BridgeSnapshot): ControllerProfileSettings {
  return {
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

function lightbarColorLabel(color: string): string {
  return LIGHTBAR_COLOR_NAMES[color.toLowerCase()] ?? color.toUpperCase();
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
          <div><dt>Power Save</dt><dd>{enabledLabel(settings.controllerPowerSavingEnabled)}</dd></div>
        </dl>
      </div>
    </div>
  );
}

function normalizeHexColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : '#ffff00';
}

function normalizeLightbarPresetColor(value: string): string {
  return normalizeHexColor(value);
}

function isLightbarPresetColor(value: string): boolean {
  return LIGHTBAR_SWATCHES.includes(normalizeLightbarPresetColor(value));
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((channel) => clampByte(channel).toString(16).padStart(2, '0')).join('')}`;
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const normalizedHue = (((hue % 360) + 360) % 360) / 360;
  const normalizedSaturation = Math.max(0, Math.min(100, saturation)) / 100;
  const normalizedLightness = Math.max(0, Math.min(100, lightness)) / 100;

  if (normalizedSaturation === 0) {
    const channel = clampByte(normalizedLightness * 255);
    return rgbToHex(channel, channel, channel);
  }

  const q = normalizedLightness < 0.5
    ? normalizedLightness * (1 + normalizedSaturation)
    : normalizedLightness + normalizedSaturation - normalizedLightness * normalizedSaturation;
  const p = 2 * normalizedLightness - q;
  const hueToRgb = (offset: number) => {
    let t = normalizedHue + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  return rgbToHex(hueToRgb(1 / 3) * 255, hueToRgb(0) * 255, hueToRgb(-1 / 3) * 255);
}

function makeLightbarCustomPalette(): LightbarPaletteCell[][] {
  const hues = [
    { hue: 0, name: 'Red' },
    { hue: 30, name: 'Orange' },
    { hue: 60, name: 'Yellow' },
    { hue: 90, name: 'Lime' },
    { hue: 120, name: 'Green' },
    { hue: 150, name: 'Mint' },
    { hue: 180, name: 'Cyan' },
    { hue: 210, name: 'Sky' },
    { hue: 240, name: 'Blue' },
    { hue: 270, name: 'Violet' },
    { hue: 300, name: 'Magenta' },
    { hue: 330, name: 'Rose' }
  ];
  const rows = [
    { saturation: 28, lightness: 88, tone: 'Pale', gray: '#ffffff', grayName: 'White' },
    { saturation: 58, lightness: 78, tone: 'Soft', gray: '#d9d9d9', grayName: 'Light Gray' },
    { saturation: 82, lightness: 66, tone: 'Light', gray: '#b3b3b3', grayName: 'Silver' },
    { saturation: 100, lightness: 58, tone: 'Bright', gray: '#8a8a8a', grayName: 'Gray' },
    { saturation: 100, lightness: 50, tone: 'Pure', gray: '#666666', grayName: 'Dim Gray' },
    { saturation: 100, lightness: 40, tone: 'Deep', gray: '#4a4a4a', grayName: 'Charcoal' },
    { saturation: 100, lightness: 30, tone: 'Dark', gray: '#333333', grayName: 'Dark Gray' },
    { saturation: 100, lightness: 20, tone: 'Midnight', gray: '#1a1a1a', grayName: 'Near Black' },
    { saturation: 100, lightness: 10, tone: 'Blackened', gray: '#000000', grayName: 'Black' }
  ];
  return rows.map((row) => [
    ...hues.map((hue) => ({
      color: hslToHex(hue.hue, row.saturation, row.lightness),
      name: `${row.tone} ${hue.name}`
    })),
    {
      color: row.gray,
      name: row.grayName
    }
  ]);
}

function makeLightbarColorNames(): Record<string, string> {
  const names = { ...LIGHTBAR_SWATCH_NAMES };
  for (const row of LIGHTBAR_CUSTOM_PALETTE) {
    for (const cell of row) {
      names[cell.color] ??= cell.name;
    }
  }
  names[LIGHTBAR_DEFAULT_CUSTOM_COLOR] = 'Custom';
  return names;
}

function lightbarColorFromSnapshot(snapshot: BridgeSnapshot): string {
  if (snapshot.status?.firmwareFlags.lightbarControl) {
    const color = snapshot.status.lightbarColor;
    return normalizeLightbarPresetColor(rgbToHex(color.red, color.green, color.blue));
  }
  return normalizeLightbarPresetColor(snapshot.settings.lightbarColor);
}

function lightbarBrightnessFromSnapshot(snapshot: BridgeSnapshot): number {
  if (snapshot.status?.firmwareFlags.lightbarControl) {
    return snapshot.status.lightbarColor.brightnessPercent;
  }
  return snapshot.settings.lightbarBrightnessPercent;
}

function batteryLabel(snapshot: BridgeSnapshot | null | undefined): string {
  const battery = snapshot?.status?.batteryPercent;
  return battery === null || battery === undefined ? '--' : `${battery}%`;
}

function batteryTone(percent: number | null | undefined): 'healthy' | 'warning' | 'low' | 'unknown' {
  if (percent === null || percent === undefined) return 'unknown';
  if (percent <= 20) return 'low';
  if (percent <= 45) return 'warning';
  return 'healthy';
}

function isChargingPowerState(rawPowerState: number | undefined): boolean {
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
  return 'All systems normal';
}

function hexByte(value: number): string {
  return value.toString(16).padStart(2, '0').toUpperCase();
}

function normalizeAudioDeviceLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/^\s*\d+\s*-\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBridgeAudioLabel(label: string): boolean {
  return BRIDGE_AUDIO_OUTPUT_RE.test(normalizeAudioDeviceLabel(label));
}

function bridgeAudioOutputScore(device: MediaDeviceInfo): number {
  const label = normalizeAudioDeviceLabel(device.label);
  let score = 1;
  if (label.includes('dualsense') || label.includes('dual sense')) score += 4;
  if (label.includes('wireless controller')) score += 3;
  if (label.includes('speaker') || label.includes('headphone') || label.includes('headset')) score += 2;
  if (label.includes('microphone') || label.includes('mic')) score -= 4;
  if (label.includes('ds5') || label.includes('bridge')) score += 1;
  return score;
}

function bridgeAudioInputScore(device: MediaDeviceInfo): number {
  const label = normalizeAudioDeviceLabel(device.label);
  let score = 1;
  if (label.includes('dualsense') || label.includes('dual sense')) score += 4;
  if (label.includes('wireless controller')) score += 3;
  if (label.includes('microphone') || label.includes('mic')) score += 2;
  if (label.includes('speaker') || label.includes('headphone')) score -= 4;
  if (label.includes('ds5') || label.includes('bridge')) score += 1;
  return score;
}

async function findBridgeAudioOutputIdOnce(): Promise<string | null> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return null;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const outputs = devices.filter((device) => (
      device.kind === 'audiooutput'
      && isBridgeAudioLabel(device.label)
      && device.deviceId
      && device.deviceId !== 'default'
      && device.deviceId !== 'communications'
    ));
    outputs.sort((left, right) => bridgeAudioOutputScore(right) - bridgeAudioOutputScore(left));
    const output = outputs[0];
    return output?.deviceId ?? null;
  } catch {
    return null;
  }
}

async function findBridgeAudioInputIdOnce(): Promise<string | null> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return null;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((device) => (
      device.kind === 'audioinput'
      && BRIDGE_AUDIO_INPUT_RE.test(normalizeAudioDeviceLabel(device.label))
      && device.deviceId
      && device.deviceId !== 'default'
      && device.deviceId !== 'communications'
    ));
    inputs.sort((left, right) => bridgeAudioInputScore(right) - bridgeAudioInputScore(left));
    const input = inputs[0];
    return input?.deviceId ?? null;
  } catch {
    return null;
  }
}

async function unlockMediaDeviceLabels(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return false;
  }

  let permissionStream: MediaStream | null = null;
  try {
    permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    return true;
  } catch {
    return false;
  } finally {
    permissionStream?.getTracks().forEach((track) => track.stop());
  }
}

async function findBridgeAudioInputId(): Promise<string | null> {
  let inputId = await findBridgeAudioInputIdOnce();
  if (inputId || !navigator.mediaDevices?.getUserMedia) {
    return inputId;
  }

  if (!await unlockMediaDeviceLabels()) {
    return null;
  }

  inputId = await findBridgeAudioInputIdOnce();
  return inputId;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

let speakerPrerollSilenceUrl: string | null = null;

function getSpeakerPrerollSilenceUrl(): string {
  if (speakerPrerollSilenceUrl) {
    return speakerPrerollSilenceUrl;
  }

  const sampleRate = 48000;
  const channels = 2;
  const bytesPerSample = 2;
  const frames = Math.round((sampleRate * TEST_SPEAKER_PREROLL_MS) / 1000);
  const dataSize = frames * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  speakerPrerollSilenceUrl = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  return speakerPrerollSilenceUrl;
}

async function findBridgeAudioOutputId(attempts = 1): Promise<string | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const sinkId = await findBridgeAudioOutputIdOnce();
    if (sinkId) {
      return sinkId;
    }
    if (attempt + 1 < attempts) {
      await delay(TEST_SPEAKER_ENDPOINT_RETRY_MS);
    }
  }
  if (await unlockMediaDeviceLabels()) {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const sinkId = await findBridgeAudioOutputIdOnce();
      if (sinkId) {
        return sinkId;
      }
      if (attempt + 1 < attempts) {
        await delay(TEST_SPEAKER_ENDPOINT_RETRY_MS);
      }
    }
  }
  return null;
}

let speakerToneAudio: SinkSelectableAudio | null = null;
let speakerToneSinkId: string | null = null;

function resetSpeakerToneAudio(): void {
  if (speakerToneAudio) {
    try {
      speakerToneAudio.pause();
      speakerToneAudio.removeAttribute('src');
      speakerToneAudio.load();
    } catch {
      // Ignore teardown races while Windows is removing the audio endpoint.
    }
  }
  speakerToneAudio = null;
  speakerToneSinkId = null;
}

async function playSpeakerAudioSource(sourceUrl: string): Promise<void> {
  const sinkId = await findBridgeAudioOutputId(TEST_SPEAKER_ENDPOINT_ATTEMPTS);
  if (!sinkId) {
    throw new Error(BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE);
  }

  // Reuse the persistent Audio element if the endpoint hasn't changed.
  // This keeps the WASAPI session alive so the firmware audio pipeline stays warm.
  if (!speakerToneAudio || speakerToneSinkId !== sinkId) {
    const audio = new Audio() as SinkSelectableAudio;
    audio.volume = 1;
    if (!audio.setSinkId) {
      throw new Error(BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE);
    }
    try {
      await audio.setSinkId(sinkId);
    } catch {
      throw new Error(BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE);
    }
    if (audio.sinkId !== undefined && audio.sinkId !== sinkId) {
      throw new Error(BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE);
    }
    speakerToneAudio = audio;
    speakerToneSinkId = sinkId;
  }

  const audio = speakerToneAudio;
  audio.src = sourceUrl;
  audio.currentTime = 0;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const mediaDevices = navigator.mediaDevices;
    const fail = (error: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };
    const verifySink = () => {
      void (async () => {
        const currentSinkId = await findBridgeAudioOutputIdOnce();
        if (
          currentSinkId !== sinkId
          || (audio.sinkId !== undefined && audio.sinkId !== sinkId)
        ) {
          resetSpeakerToneAudio();
          fail(new Error(BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE));
        }
      })();
    };
    const verifyTimer = window.setInterval(verifySink, TEST_SPEAKER_ENDPOINT_VERIFY_MS);
    function cleanup() {
      window.clearInterval(verifyTimer);
      audio.removeEventListener('ended', finish);
      audio.removeEventListener('error', onAudioError);
      mediaDevices?.removeEventListener?.('devicechange', verifySink);
    }
    function onAudioError() {
      fail(new Error('Speaker test audio playback failed.'));
    }

    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', onAudioError, { once: true });
    mediaDevices?.addEventListener?.('devicechange', verifySink);
    audio.play().then(verifySink).catch((error: unknown) => {
      fail(error instanceof Error ? error : new Error('Speaker test audio playback failed.'));
    });
  });
}

async function playSpeakerToneFile(): Promise<void> {
  await playSpeakerAudioSource(getSpeakerPrerollSilenceUrl());
  await delay(25);
  await playSpeakerAudioSource(testSpeakerToneUrl);
}

let micListenAudio: HTMLAudioElement | null = null;
let micListenStream: MediaStream | null = null;
let micListenTimer: number | null = null;
let micListenResolve: (() => void) | null = null;

function stopMicLiveListen(): void {
  if (micListenTimer !== null) {
    window.clearTimeout(micListenTimer);
  }
  micListenTimer = null;
  if (micListenAudio) {
    try {
      micListenAudio.pause();
      micListenAudio.srcObject = null;
    } catch {
      // Ignore teardown races while the mic endpoint is closing.
    }
  }
  micListenAudio = null;
  micListenStream?.getTracks().forEach((track) => track.stop());
  micListenStream = null;
  const resolve = micListenResolve;
  micListenResolve = null;
  resolve?.();
}

async function openBridgeMicStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(BRIDGE_MIC_ENDPOINT_UNAVAILABLE);
  }

  const inputId = await findBridgeAudioInputId();
  if (!inputId) {
    throw new Error(BRIDGE_MIC_ENDPOINT_UNAVAILABLE);
  }

  return navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: inputId },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false
    },
    video: false
  });
}

async function playMicLiveListen(durationMs: number): Promise<void> {
  stopMicLiveListen();
  const stream = await openBridgeMicStream();
  const audio = new Audio();
  audio.srcObject = stream;
  audio.volume = 1;
  micListenAudio = audio;
  micListenStream = stream;

  try {
    await audio.play();
  } catch (error) {
    stopMicLiveListen();
    throw error;
  }

  await new Promise<void>((resolve) => {
    micListenResolve = resolve;
    micListenTimer = window.setTimeout(stopMicLiveListen, durationMs);
  });
}

function CustomSelect<T extends SelectValue>({
  value,
  options,
  disabled = false,
  className = '',
  floatingMenu = false,
  floatingMenuMinWidth,
  suspendOutsideClose = false,
  showSelectedCheck = true,
  closeOnSelect = true,
  getOptionClassName,
  renderValue,
  renderOption,
  renderMenuFooter,
  ariaLabel,
  onChange
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find(([, optionValue]) => optionValue === value);
  const longList = options.length > 18;
  const defaultMenuMaxHeight = longList ? 360 : 232;
  const [menuMaxHeight, setMenuMaxHeight] = useState(defaultMenuMaxHeight);
  const [menuPlacement, setMenuPlacement] = useState<'top' | 'bottom'>('bottom');
  const [floatingMenuStyle, setFloatingMenuStyle] = useState<CustomSelectMenuStyle>({});

  function updateMenuMaxHeight() {
    const root = rootRef.current;
    if (!root) {
      setMenuMaxHeight(defaultMenuMaxHeight);
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const boundary = floatingMenu
      ? null
      : root.closest('.system-card, .feature-card, .settings-menu, .control-page') as HTMLElement | null;
    const boundaryRect = boundary?.getBoundingClientRect();
    const menuGap = 6;
    const viewportPadding = floatingMenu ? 8 : 0;
    const lowerLimit = Math.min(window.innerHeight - viewportPadding, boundaryRect?.bottom ?? window.innerHeight);
    const upperLimit = Math.max(viewportPadding, boundaryRect?.top ?? 0);
    const spaceBelow = Math.max(1, Math.floor(lowerLimit - rootRect.bottom - menuGap));
    const spaceAbove = Math.max(1, Math.floor(rootRect.top - upperLimit - menuGap));
    const preferredVisibleHeight = Math.min(defaultMenuMaxHeight, 184);
    const nextPlacement = spaceBelow < preferredVisibleHeight && spaceAbove > spaceBelow ? 'top' : 'bottom';
    const availableSpace = nextPlacement === 'top' ? spaceAbove : spaceBelow;
    const nextMaxHeight = longList ? availableSpace : Math.min(defaultMenuMaxHeight, availableSpace);

    setMenuPlacement(nextPlacement);
    setMenuMaxHeight(Math.max(1, nextMaxHeight));

    if (floatingMenu) {
      const minimumWidth = floatingMenuMinWidth ?? rootRect.width;
      const width = Math.min(
        Math.max(rootRect.width, minimumWidth),
        Math.max(1, window.innerWidth - viewportPadding * 2)
      );
      const idealLeft = rootRect.left + (rootRect.width - width) / 2;
      const left = Math.min(
        Math.max(viewportPadding, idealLeft),
        Math.max(viewportPadding, window.innerWidth - viewportPadding - width)
      );
      setFloatingMenuStyle({
        left: `${Math.round(left)}px`,
        width: `${Math.round(width)}px`,
        ...(nextPlacement === 'top'
          ? { bottom: `${Math.round(window.innerHeight - rootRect.top + menuGap)}px` }
          : { top: `${Math.round(rootRect.bottom + menuGap)}px` }),
        '--custom-select-menu-max-height': `${Math.max(1, nextMaxHeight)}px`
      });
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    function closeIfOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !suspendOutsideClose
        && !rootRef.current?.contains(target)
        && !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', closeIfOutside);
    return () => document.removeEventListener('mousedown', closeIfOutside);
  }, [open, suspendOutsideClose]);

  useEffect(() => {
    if (!open) return undefined;
    updateMenuMaxHeight();
    window.addEventListener('resize', updateMenuMaxHeight);
    window.addEventListener('scroll', updateMenuMaxHeight, true);
    return () => {
      window.removeEventListener('resize', updateMenuMaxHeight);
      window.removeEventListener('scroll', updateMenuMaxHeight, true);
    };
  }, [open, defaultMenuMaxHeight, floatingMenu, floatingMenuMinWidth, longList]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      const menu = menuRef.current;
      const optionsContainer = menu?.querySelector('.custom-select-menu-options') as HTMLElement | null;
      const selectedElement = menu?.querySelector('[data-selected="true"]') as HTMLElement | null;
      if (!optionsContainer || !selectedElement) {
        return;
      }
      const selectedCenter = selectedElement.offsetTop + selectedElement.offsetHeight / 2;
      optionsContainer.scrollTop = Math.max(0, selectedCenter - optionsContainer.clientHeight / 2);
    });
  }, [open]);

  function choose(nextValue: T) {
    if (closeOnSelect) {
      setOpen(false);
    }
    if (nextValue !== value) {
      onChange(nextValue);
    }
  }

  function toggleOpen() {
    if (!open) {
      updateMenuMaxHeight();
    }
    setOpen((nextOpen) => !nextOpen);
  }

  function openMenu() {
    updateMenuMaxHeight();
    setOpen(true);
  }

  const menu = open ? (
    <div ref={menuRef} className="custom-select-menu" role="listbox" aria-label={ariaLabel}>
      <div className="custom-select-menu-options">
        {options.map(([label, optionValue]) => {
          const selectedOption = optionValue === value;
          const optionClassName = getOptionClassName?.(label, optionValue);
          return (
            <button
              key={String(optionValue)}
              type="button"
              role="option"
              aria-selected={selectedOption}
              data-selected={selectedOption ? 'true' : undefined}
              className={[selectedOption ? 'selected' : '', optionClassName].filter(Boolean).join(' ')}
              onClick={() => choose(optionValue)}
            >
              <span>{renderOption?.(label, optionValue) ?? label}</span>
              {showSelectedCheck && selectedOption && <Check size={15} />}
            </button>
          );
        })}
      </div>
      {renderMenuFooter && (
        <div className="custom-select-menu-footer">
          {renderMenuFooter(() => setOpen(false))}
        </div>
      )}
    </div>
  ) : null;

  const portalTarget = floatingMenu
    ? (rootRef.current?.closest('.shell') as HTMLElement | null) ?? document.body
    : null;

  return (
    <div
      ref={rootRef}
      className={`custom-select ${className} ${open ? 'open' : ''} menu-${menuPlacement} ${disabled ? 'disabled' : ''}`}
      style={{ '--custom-select-menu-max-height': `${menuMaxHeight}px` } as CSSProperties}
    >
      <button
        type="button"
        className="custom-select-button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggleOpen}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openMenu();
          }
          if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      >
        <span>{selected ? (renderValue?.(selected[0], selected[1]) ?? selected[0]) : String(value)}</span>
        <ChevronDown size={18} />
      </button>
      {floatingMenu && portalTarget && menu
        ? createPortal(
          <div
            className={`custom-select custom-select-floating-layer open menu-${menuPlacement} ${suspendOutsideClose ? 'dialog-suspended' : ''} ${className}`}
            style={floatingMenuStyle}
          >
            {menu}
          </div>,
          portalTarget
        )
        : menu}
    </div>
  );
}

function ThemeOption({ label, value }: { label: string; value: UiThemePreset }) {
  return (
      <span className="theme-option">
        <span className="theme-option-swatches" aria-hidden="true">
        {UI_THEME_PREVIEW_SWATCHES[value].map((swatch) => (
          <span key={`${value}-${swatch.role}`} title={swatch.role} style={{ background: swatch.color }} />
        ))}
      </span>
      <span className="theme-option-label">{label}</span>
    </span>
  );
}

function AudioHapticsConfigLabel({
  id,
  label,
  tooltip,
  className = '',
  showQuestionMark = false
}: {
  id: string;
  label: string;
  tooltip: string;
  className?: string;
  showQuestionMark?: boolean;
}) {
  return (
    <span className={`audio-haptics-config-label ${className}`.trim()} tabIndex={0} aria-describedby={id}>
      {label}
      {showQuestionMark ? <IconQuestionMark size={12} stroke={3} aria-hidden="true" /> : null}
      <span id={id} className="settings-shortcut-tooltip shortcut-glyph-tooltip audio-haptics-config-tooltip" role="tooltip">
        {tooltip}
      </span>
    </span>
  );
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

function RemapGlyphOption({ label, value }: { label: string; value: RemapButtonId }) {
  const button = REMAP_BUTTONS[value];

  return (
    <span className="remap-glyph-option" title={label}>
      {button.glyphUrl ? (
        <img src={button.glyphUrl} alt={label} />
      ) : (
        <span className="remap-text-glyph" aria-hidden="true">{button.textGlyph ?? button.label}</span>
      )}
    </span>
  );
}

function RemapSourceGlyph({ button }: { button: RemapButtonDefinition }) {
  return button.glyphUrl ? (
    <img src={button.glyphUrl} alt={button.label} title={button.label} />
  ) : (
    <span className="remap-text-glyph remap-text-glyph-source" title={button.label}>
      {button.textGlyph ?? button.label}
    </span>
  );
}

function ChordStarterGlyph({ starter, label = CHORD_STARTERS[starter].label }: { starter: ChordStarterId; label?: string }) {
  const button = CHORD_STARTERS[starter];
  const Icon = button.Icon;

  return Icon ? (
    <span className="chords-unassigned-glyph chords-starter-icon-glyph" title={label} aria-label={label}>
      <Icon size={18} />
    </span>
  ) : button.glyphUrl ? (
    <img src={button.glyphUrl} alt={label} title={label} />
  ) : (
    <span className="remap-text-glyph remap-text-glyph-source" title={label}>
      {button.textGlyph ?? button.label}
    </span>
  );
}

function ChordStarterGlyphOption({ label, value }: { label: string; value: ChordStarterId }) {
  return (
    <span className="chords-starter-glyph-option" title={label}>
      <ChordStarterGlyph starter={value} label={label} />
    </span>
  );
}

function ChordButtonGlyphOption({ label, value }: { label: string; value: ChordButtonSelectValue }) {
  if (value === CHORD_UNASSIGNED_BUTTON) {
    return (
      <span className="chords-unassigned-glyph" title={label} aria-label={label}>
        <IconQuestionMark size={16} />
      </span>
    );
  }

  return <RemapGlyphOption label={label} value={value} />;
}

function HostPersonaOption({ label, value }: { label: string; value: HostPersonaMode }) {
  const sonyPersona = value === 'dualsense' || value === 'ds4';
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

function remapTargetOptionsFor(buttonId: RemapButtonId): Array<[string, RemapButtonId]> {
  if ((REMAP_EDGE_BUTTON_IDS as readonly RemapButtonId[]).includes(buttonId)) {
    return [...REMAP_TARGET_OPTIONS, [REMAP_BUTTONS[buttonId].label, buttonId]];
  }
  return REMAP_TARGET_OPTIONS;
}

function chordFunctionTypeLabel(type: ChordFunctionType): string {
  return CHORD_FUNCTION_TYPE_OPTIONS.find(([, value]) => value === type)?.[0] ?? 'Function';
}

function chordMediaActionLabel(action: ChordMediaAction): string {
  return CHORD_MEDIA_ACTION_OPTIONS.find(([, value]) => value === action)?.[0] ?? 'Media Action';
}

function chordNotchTargetForAction(action: ChordControllerSettingAction): {
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

function chordControllerSettingSelectValue(action: ChordControllerSettingAction): ChordControllerSettingSelectValue {
  const notchTarget = chordNotchTargetForAction(action);
  if (notchTarget) {
    return notchTarget.target.id;
  }
  return action as ChordControllerSettingSelectValue;
}

function chordControllerSettingActionFromSelectValue(
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

function chordControllerSettingActionLabel(action: ChordControllerSettingAction): string {
  const notchTarget = chordNotchTargetForAction(action);
  if (notchTarget) {
    return notchTarget.target.label;
  }
  return CHORD_CONTROLLER_SETTING_ACTION_OPTIONS.find(([, value]) => value === action)?.[0] ?? 'Controller Setting';
}

function chordControllerSettingSummary(action: ChordControllerSettingAction, stepPercent?: number): string {
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
    case 'persona-dualsense':
      return 'Set Persona: DualSense';
    case 'persona-ds4':
      return 'Set Persona: DualShock 4';
    case 'persona-xbox':
      return 'Set Persona: Xbox';
  }
  return 'Controller Setting';
}

function chordControllerSettingAdjustmentText(action: ChordControllerSettingAction): string {
  const notchTarget = chordNotchTargetForAction(action);
  if (!notchTarget) {
    return chordControllerSettingSummary(action);
  }
  return `${notchTarget.direction === 'up' ? 'Increase' : 'Decrease'} ${notchTarget.target.label}`;
}

function chordStarterLabel(starter: ChordStarterId): string {
  return CHORD_STARTER_OPTIONS.find(([, value]) => value === starter)?.[0] ?? starter.toUpperCase();
}

function chordButtonLabel(button: ChordAssignableButtonId): string {
  return REMAP_BUTTONS[button].label;
}

function chordFunctionSummary(func: ChordFunction): string {
  switch (func.type) {
    case 'keyboard':
      return func.keys.join(' + ');
    case 'media':
      return chordMediaActionLabel(func.action);
    case 'controller-setting':
      return chordControllerSettingSummary(func.action, func.stepPercent);
  }
}

function chordFunctionToDraft(func: ChordFunction | null): ChordFunctionDraft {
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

function normalizeChordKeyLabel(key: string): string {
  const trimmed = key.trim();
  const normalized = trimmed.replace(/\s+/g, ' ').toLowerCase();
  switch (normalized) {
    case 'control':
    case 'ctrl':
      return 'Ctrl';
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

function chordKeyboardParts(keys: string[]): {
  key: string;
  modifiers: ChordKeyboardModifier[];
} {
  const normalizedKeys = keys.map(normalizeChordKeyLabel);
  const modifiers = CHORD_KEYBOARD_MODIFIER_OPTIONS
    .map(([, modifier]) => modifier)
    .filter((modifier) => normalizedKeys.includes(modifier))
    .slice(0, MAX_KEYBOARD_FUNCTION_KEYS - 1);
  const supportedKeys = new Set(CHORD_KEYBOARD_KEY_OPTIONS.map(([, value]) => value));
  const key = normalizedKeys.find((candidate) => supportedKeys.has(candidate)) ?? 'Esc';
  return { key, modifiers };
}

function chordFunctionFromDraft(draft: ChordFunctionDraft): ChordFunction {
  const name = (draft.name.trim() || chordFunctionTypeLabel(draft.type)).slice(0, MAX_CHORD_FUNCTION_NAME_LENGTH);
  const id = draft.id || `function-${Date.now().toString(36)}`;
  switch (draft.type) {
    case 'keyboard':
      return {
        id,
        name,
        type: 'keyboard',
        keys: [...draft.keyboardModifiers, draft.keyboardKey].slice(0, MAX_KEYBOARD_FUNCTION_KEYS)
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

function chordAssignmentLabel(assignment: ChordAssignment): string {
  return `${chordStarterLabel(assignment.starter)} + ${chordButtonLabel(assignment.button)}`;
}

function chordBindingKey(starter: ChordStarterId, button: ChordAssignableButtonId): string {
  return `chord:${starter}:${button}`;
}

function chordAssignmentKey(assignment: ChordAssignment): string {
  return chordBindingKey(assignment.starter, assignment.button);
}

function createChordAssignmentId(starter: ChordStarterId, button: ChordAssignableButtonId): string {
  return `chord-${starter}-${button}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function App() {
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null);
  const [startupVisible, setStartupVisible] = useState(true);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [activeControlTab, setActiveControlTab] = useState<ControlTab>('overview');
  const [hapticsValue, setHapticsValue] = useState(100);
  const [classicRumbleValue, setClassicRumbleValue] = useState(100);
  const [speakerVolumeValue, setSpeakerVolumeValue] = useState(100);
  const [micVolumeValue, setMicVolumeValue] = useState(100);
  const [audioBufferLengthValue, setAudioBufferLengthValue] = useState(64);
  const [lightbarColor, setLightbarColor] = useState('#ffff00');
  const [customLightbarColor, setCustomLightbarColor] = useState<string | null>(() => {
    const saved = window.localStorage.getItem('ds5bridge.customLightbarColor');
    if (!saved || !/^#[0-9a-fA-F]{6}$/.test(saved)) return null;
    const color = normalizeLightbarPresetColor(saved);
    return LIGHTBAR_SWATCHES.includes(color) ? null : color;
  });
  const [customColorDraft, setCustomColorDraft] = useState(LIGHTBAR_DEFAULT_CUSTOM_COLOR);
  const [showCustomColorPicker, setShowCustomColorPicker] = useState(false);
  const [customSwatchPrimed, setCustomSwatchPrimed] = useState(false);
  const [lightbarBrightnessValue, setLightbarBrightnessValue] = useState(100);
  const [triggerEffectIntensityValue, setTriggerEffectIntensityValue] = useState(100);
  const [triggerTarget, setTriggerTarget] = useState<TriggerTestTarget>('both');
  const triggerLabInitialStateRef = useRef<TriggerLabInitialState | null>(null);
  if (triggerLabInitialStateRef.current === null) {
    triggerLabInitialStateRef.current = loadTriggerLabInitialState();
  }
  const triggerLabInitialState = triggerLabInitialStateRef.current;
  const [triggerLabOpen, setTriggerLabOpen] = useState(false);
  const [audioHapticsOpen, setAudioHapticsOpen] = useState(false);
  const [audioHapticsSessions, setAudioHapticsSessions] = useState<AudioHapticsSession[]>([]);
  const [audioHapticsSessionsLoading, setAudioHapticsSessionsLoading] = useState(false);
  const [triggerLabLinked, setTriggerLabLinked] = useState(triggerLabInitialState.linked);
  const [triggerLabDrafts, setTriggerLabDrafts] = useState<Record<TriggerLabSide, TriggerLabDraft>>(triggerLabInitialState.drafts);
  const [triggerLabActive, setTriggerLabActive] = useState<Record<TriggerLabSide, boolean>>(triggerLabInitialState.active);
  const [triggerLabSplitState, setTriggerLabSplitState] = useState<TriggerLabSplitState | null>(triggerLabInitialState.splitState);
  const [triggerLabCustomProfiles, setTriggerLabCustomProfiles] = useState<TriggerLabCustomProfile[]>(triggerLabInitialState.profiles);
  const [triggerLabProfileDialog, setTriggerLabProfileDialog] = useState<TriggerLabProfileDialogState | null>(null);
  const [triggerLabProfileNameDraft, setTriggerLabProfileNameDraft] = useState('');
  const [remapDraft, setRemapDraft] = useState<Record<RemapButtonId, RemapButtonId>>(DEFAULT_REMAP_DRAFT);
  const [remapProfileDialogMode, setRemapProfileDialogMode] = useState<RemapProfileDialogMode | null>(null);
  const [remapProfileNameDraft, setRemapProfileNameDraft] = useState('');
  const [selectedChordFunctionId, setSelectedChordFunctionId] = useState('');
  const [chordFunctionDraft, setChordFunctionDraft] = useState<ChordFunctionDraft>(EMPTY_CHORD_FUNCTION_DRAFT);
  const [chordFunctionDialog, setChordFunctionDialog] = useState<ChordFunctionDialogState | null>(null);
  const [chordFunctionNameDraft, setChordFunctionNameDraft] = useState('');
  const [chordAssignmentDraftRows, setChordAssignmentDraftRows] = useState<ChordAssignmentDraftRow[]>([]);
  const [draggedChordAssignmentId, setDraggedChordAssignmentId] = useState<string | null>(null);
  const [chordAssignmentDropHint, setChordAssignmentDropHint] = useState<ChordAssignmentDropHint | null>(null);
  const [chordAssignmentScrollbar, setChordAssignmentScrollbar] = useState<ChordAssignmentScrollbarState>({
    visible: false,
    top: 0,
    height: 0
  });
  const [controllerProfileDialogMode, setControllerProfileDialogMode] = useState<ControllerProfileDialogMode | null>(null);
  const [controllerProfileNameDraft, setControllerProfileNameDraft] = useState('');
  const [remapCalloutLayout, setRemapCalloutLayout] = useState<Record<StandardRemapButtonId, RemapCalloutLayout> | null>(null);
  const [edgeRemapControlLayout, setEdgeRemapControlLayout] = useState<Record<DualSenseEdgeRemapButtonId, EdgeRemapControlLayout> | null>(null);
  const [hoveredRemapButton, setHoveredRemapButton] = useState<RemapButtonId | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [showBridgeSettings, setShowBridgeSettings] = useState(false);
  const [settingsFocusTarget, setSettingsFocusTarget] = useState<SettingsFocusTarget | null>(null);
  const [notificationFocusTarget, setNotificationFocusTarget] = useState<NotificationFocusTarget | null>(null);
  const [showNotificationsMenu, setShowNotificationsMenu] = useState(false);
  const [showClassicRumbleControl, setShowClassicRumbleControl] = useState(false);
  const [showMicrophoneControl, setShowMicrophoneControl] = useState(false);
  const [lastRemapControllerType, setLastRemapControllerType] = useState<KnownControllerType>(storedRemapControllerType);
  const [windowDragging, setWindowDragging] = useState(false);
  const [testLocked, setTestLocked] = useState(false);
  const [startupTheme, setStartupTheme] = useState<UiThemePreset>(storedUiThemePreset);
  const [speakerTestLocked, setSpeakerTestLocked] = useState(false);
  const [speakerOutputAvailable, setSpeakerOutputAvailable] = useState<boolean | null>(null);
  const [speakerTestError, setSpeakerTestError] = useState<string | null>(null);
  const [micTestLocked, setMicTestLocked] = useState(false);
  const [micTestError, setMicTestError] = useState<string | null>(null);
  const [triggerTestLocked, setTriggerTestLocked] = useState(false);
  const [hapticsCommitPending, setHapticsCommitPending] = useState(false);
  const [classicRumbleCommitPending, setClassicRumbleCommitPending] = useState(false);
  const [classicRumbleV1CommitPending, setClassicRumbleV1CommitPending] = useState(false);
  const [feedbackBoostCommitPending, setFeedbackBoostCommitPending] = useState(false);
  const [speakerVolumeCommitPending, setSpeakerVolumeCommitPending] = useState(false);
  const [micVolumeCommitPending, setMicVolumeCommitPending] = useState(false);
  const [audioBufferLengthCommitPending, setAudioBufferLengthCommitPending] = useState(false);
  const [audioReactiveHapticsCommitPending, setAudioReactiveHapticsCommitPending] = useState(false);
  const [lightbarCommitPending, setLightbarCommitPending] = useState(false);
  const [overviewSleepConfirmVisible, setOverviewSleepConfirmVisible] = useState(false);
  const [deviceCleanupConfirmVisible, setDeviceCleanupConfirmVisible] = useState(false);
  const [startupTutorialStep, setStartupTutorialStep] = useState<StartupTutorialStep>(storedStartupTutorialStep);
  const [startupTutorialFeatureActive, setStartupTutorialFeatureActive] = useState(false);
  const [startupTutorialSupportCountdown, setStartupTutorialSupportCountdown] = useState(5);
  const [deviceCleanupMessage, setDeviceCleanupMessage] = useState<string | null>(null);
  const [deviceCleanupError, setDeviceCleanupError] = useState<string | null>(null);
  const [picoFirmwareMessage, setPicoFirmwareMessage] = useState<string | null>(null);
  const [picoFirmwareError, setPicoFirmwareError] = useState<string | null>(null);
  const hapticsEditingRef = useRef(false);
  const classicRumbleEditingRef = useRef(false);
  const speakerVolumeEditingRef = useRef(false);
  const micVolumeEditingRef = useRef(false);
  const audioBufferLengthEditingRef = useRef(false);
  const lightbarBrightnessEditingRef = useRef(false);
  const triggerEffectEditingRef = useRef(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const remappingLayoutRef = useRef<HTMLDivElement>(null);
  const remappingLeftSideRef = useRef<HTMLDivElement>(null);
  const remappingRightSideRef = useRef<HTMLDivElement>(null);
  const remappingArtRef = useRef<HTMLImageElement>(null);
  const customColorPickerRef = useRef<HTMLDivElement>(null);
  const customSwatchPrimeTimerRef = useRef<number | null>(null);
  const overviewSleepConfirmTimerRef = useRef<number | null>(null);
  const settingsFocusTimerRef = useRef<number | null>(null);
  const notificationFocusTimerRef = useRef<number | null>(null);
  const chordAssignmentDragRef = useRef<ChordAssignmentDragSession | null>(null);
  const chordAssignmentListRef = useRef<HTMLDivElement>(null);
  const windowDraggingRef = useRef(false);
  const windowDragReleaseTimerRef = useRef<number | null>(null);
  const startupReadyTimerRef = useRef<number | null>(null);
  const startupReadyArmedRef = useRef(false);
  const triggerLabRestoreAppliedRef = useRef(false);
  const deferredSnapshotRef = useRef<BridgeSnapshot | null>(null);
  const overviewSleepConfirmArmedRef = useRef(false);
  useEffect(() => () => {
    const session = chordAssignmentDragRef.current;
    session?.cleanup();
    session?.overlay?.remove();
    document.body.classList.remove('chords-assignment-pointer-dragging');
    chordAssignmentDragRef.current = null;
  }, []);

  useEffect(() => {
    saveTriggerLabCustomProfiles(triggerLabCustomProfiles);
  }, [triggerLabCustomProfiles]);

  useEffect(() => {
    const liveTheme = snapshot?.settings.uiThemePreset;
    if (!liveTheme) return;
    setStartupTheme(liveTheme);
    saveUiThemePreset(liveTheme);
  }, [snapshot?.settings.uiThemePreset]);

  useEffect(() => {
    const hasSnapshot = Boolean(snapshot);
    if (!hasSnapshot || !startupVisible || startupReadyArmedRef.current) return undefined;
    startupReadyArmedRef.current = true;
    startupReadyTimerRef.current = window.setTimeout(() => {
      setStartupVisible(false);
      startupReadyTimerRef.current = null;
    }, STARTUP_READY_HOLD_MS);
    return () => {
      if (startupReadyTimerRef.current !== null) {
        window.clearTimeout(startupReadyTimerRef.current);
        startupReadyTimerRef.current = null;
      }
    };
  }, [Boolean(snapshot), startupVisible]);

  useEffect(() => {
    if (startupTutorialStep !== 'support') {
      return undefined;
    }

    setStartupTutorialSupportCountdown(5);
    const interval = window.setInterval(() => {
      setStartupTutorialSupportCountdown((value) => Math.max(0, value - 1));
    }, 1000);
    return () => {
      window.clearInterval(interval);
    };
  }, [startupTutorialStep]);

  useEffect(() => {
    saveTriggerLabWorkspaceState({
      linked: triggerLabLinked,
      drafts: triggerLabDrafts,
      active: triggerLabActive,
      splitState: triggerLabSplitState
    });
  }, [triggerLabActive, triggerLabDrafts, triggerLabLinked, triggerLabSplitState]);

  const personaTransition = snapshot?.personaTransition ?? null;
  const personaTransitionActive = Boolean(personaTransition);
  const connected = snapshot?.state === 'connected';
  const controllerConnected = Boolean(snapshot?.status?.controllerConnected);
  const controllerControlsAvailable = connected && controllerConnected;
  const liveControllerType = snapshot?.status?.controllerType;
  const remapControllerType = snapshot?.status?.controllerConnected && liveControllerType && liveControllerType !== 'unknown'
    ? liveControllerType
    : lastRemapControllerType;
  const showDualSenseEdgeRemapButtons = remapControllerType === 'dualsense-edge';
  const remapModifiedCount = useMemo(() => (
    REMAP_ALL_BUTTON_IDS.filter((buttonId) => remapDraft[buttonId] !== buttonId).length
  ), [remapDraft]);
  const triggerLabProfileOptions = useMemo<Array<[string, TriggerLabProfileId]>>(() => ([
    ...TRIGGER_LAB_BUILTIN_PROFILE_OPTIONS,
    ...triggerLabCustomProfiles.map((profile): [string, TriggerLabProfileId] => [profile.name, profile.id])
  ]), [triggerLabCustomProfiles]);
  const triggerLabAnyActive = triggerLabActive.l2 || triggerLabActive.r2;
  const selectedControllerProfile = snapshot?.settings.controllerProfiles.find((profile) => (
    profile.id === snapshot.settings.selectedControllerProfileId
  ));
  const selectedControllerProfileId = selectedControllerProfile?.id ?? DEFAULT_CONTROLLER_PROFILE_ID;
  const controllerProfileOptions = useMemo<Array<[string, string]>>(() => (
    snapshot?.settings.controllerProfiles.map((profile) => [profile.name, profile.id]) ?? [['Default', DEFAULT_CONTROLLER_PROFILE_ID]]
  ), [snapshot?.settings.controllerProfiles]);
  const selectedControllerProfileIsDefault = selectedControllerProfileId === DEFAULT_CONTROLLER_PROFILE_ID;
  const canDeleteControllerProfile = !selectedControllerProfileIsDefault;
  const selectedRemapProfile = snapshot?.settings.buttonRemappingProfiles.find((profile) => (
    profile.id === snapshot.settings.selectedButtonRemappingProfileId
  ));
  const selectedRemapProfileId = selectedRemapProfile?.id ?? DEFAULT_BUTTON_REMAP_PROFILE_ID;
  const remapProfileOptions = useMemo<Array<[string, string]>>(() => (
    snapshot?.settings.buttonRemappingProfiles.map((profile) => [profile.name, profile.id]) ?? [['Default', DEFAULT_BUTTON_REMAP_PROFILE_ID]]
  ), [snapshot?.settings.buttonRemappingProfiles]);
  const selectedRemapProfileIsDefault = selectedRemapProfileId === DEFAULT_BUTTON_REMAP_PROFILE_ID;
  const remappingLayoutAsset = showDualSenseEdgeRemapButtons ? REMAP_EDGE_LAYOUT_ASSET : REMAP_STANDARD_LAYOUT_ASSET;
  const chordFunctions = snapshot?.settings.chordFunctions ?? [];
  const chordAssignments = snapshot?.settings.chordAssignments ?? [];
  const muteButtonChordStarterActive = snapshot?.settings.muteButtonMode === 'chord'
    || (
      snapshot?.settings.muteButtonMode === 'keyboard'
      && snapshot.settings.muteKeyboardChordStarterEnabled
    );
  const selectedChordFunction = chordFunctions.find((func) => func.id === selectedChordFunctionId) ?? chordFunctions[0] ?? null;
  const chordFunctionDialogFunction = chordFunctionDialog
    ? chordFunctions.find((func) => func.id === chordFunctionDialog.functionId) ?? null
    : null;
  const chordAssignmentConflictState = useMemo(() => {
    const counts = new Map<string, number>();
    for (const assignment of chordAssignments) {
      const key = chordAssignmentKey(assignment);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const conflictKeys = new Set<string>();
    let conflictCount = 0;
    for (const [key, count] of counts) {
      if (count > 1) {
        conflictKeys.add(key);
        conflictCount += count - 1;
      }
    }
    const shortcutKeys = new Set<string>();
    if (snapshot?.settings.sleepKeybindEnabled) {
      shortcutKeys.add(chordBindingKey('ps', 'triangle'));
    }
    if (snapshot?.settings.speakerVolumeShortcutEnabled) {
      shortcutKeys.add(chordBindingKey('ps', 'dpad-up'));
      shortcutKeys.add(chordBindingKey('ps', 'dpad-down'));
    }
    for (const assignment of chordAssignments) {
      const key = chordAssignmentKey(assignment);
      if (shortcutKeys.has(key)) {
        conflictKeys.add(key);
        conflictCount += 1;
      }
      if (assignment.starter === CHORD_MUTE_STARTER_ID && !muteButtonChordStarterActive) {
        conflictKeys.add(key);
        conflictCount += 1;
      }
    }
    return { conflictKeys, conflictCount };
  }, [
    chordAssignments,
    muteButtonChordStarterActive,
    snapshot?.settings.sleepKeybindEnabled,
    snapshot?.settings.speakerVolumeShortcutEnabled
  ]);
  const chordFunctionsSignature = useMemo(() => (
    chordFunctions.map((func) => `${func.id}:${func.name}:${chordFunctionSummary(func)}`).join('|')
  ), [chordFunctions]);
  const chordFunctionOptions = useMemo<Array<[string, string]>>(() => (
    chordFunctions.length > 0
      ? chordFunctions.map((func) => [func.name, func.id])
      : [['No Functions', '']]
  ), [chordFunctions]);
  const defaultChordFunctionId = selectedChordFunction?.id ?? chordFunctions[0]?.id ?? '';
  const chordStarterOptions = useMemo<Array<[string, ChordStarterId]>>(() => (
    CHORD_STARTER_OPTIONS.filter(([, starter]) => {
      if (starter === CHORD_MUTE_STARTER_ID) {
        return muteButtonChordStarterActive;
      }
      return starter === 'ps' || showDualSenseEdgeRemapButtons;
    })
  ), [muteButtonChordStarterActive, showDualSenseEdgeRemapButtons]);
  const chordAssignableButtonIds = useMemo<readonly ChordAssignableButtonId[]>(() => (
    (showDualSenseEdgeRemapButtons
      ? CHORD_BUTTON_MENU_IDS
      : REMAP_STANDARD_TARGET_BUTTON_IDS) as readonly ChordAssignableButtonId[]
  ), [showDualSenseEdgeRemapButtons]);
  function chordStarterOptionsFor(currentStarter?: ChordStarterId): Array<[string, ChordStarterId]> {
    return currentStarter === CHORD_MUTE_STARTER_ID
      && !chordStarterOptions.some(([, starter]) => starter === CHORD_MUTE_STARTER_ID)
      ? [...chordStarterOptions, [CHORD_STARTERS.mute.label, CHORD_MUTE_STARTER_ID]]
      : chordStarterOptions;
  }
  function muteChordStarterIsInactive(starter: ChordStarterId): boolean {
    return starter === CHORD_MUTE_STARTER_ID && !muteButtonChordStarterActive;
  }
  function chordButtonOptionsFor(
    starter: ChordStarterId,
    includeUnassigned = false
  ): Array<[string, ChordButtonSelectValue]> {
    const ids = chordAssignableButtonIds;
    const options = ids
      .filter((id) => isChordBindingAllowed(starter, id))
      .map((id): [string, ChordButtonSelectValue] => [chordButtonLabel(id), id]);
    return includeUnassigned
      ? [['Choose Button', CHORD_UNASSIGNED_BUTTON], ...options]
      : options;
  }
  function firstAllowedChordButton(starter: ChordStarterId): ChordAssignableButtonId | null {
    return chordAssignableButtonIds.find((id) => isChordBindingAllowed(starter, id)) ?? null;
  }
  const canAddChordDraft = Boolean(defaultChordFunctionId)
    && chordAssignments.length + chordAssignmentDraftRows.length < MAX_CHORD_ASSIGNMENTS;
  const chordAssignmentsSubtitle = muteButtonChordStarterActive
    ? (showDualSenseEdgeRemapButtons ? 'Pair PS, LFN, RFN, or Mute with a button.' : 'Pair PS or Mute with a button.')
    : (showDualSenseEdgeRemapButtons ? 'Pair PS, LFN, or RFN with a button.' : 'Pair PS with a button.');

  useEffect(() => {
    const list = chordAssignmentListRef.current;
    if (!list || activeControlTab !== 'chords') {
      return;
    }
    const frame = window.requestAnimationFrame(updateChordAssignmentScrollbar);
    const observer = new ResizeObserver(updateChordAssignmentScrollbar);
    observer.observe(list);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [
    activeControlTab,
    chordAssignments.length,
    chordAssignmentDraftRows.length
  ]);

  useEffect(() => {
    if (snapshot?.status?.controllerConnected && liveControllerType && liveControllerType !== 'unknown') {
      setLastRemapControllerType(liveControllerType);
      window.localStorage.setItem(LAST_REMAP_CONTROLLER_TYPE_STORAGE_KEY, liveControllerType);
    }
  }, [liveControllerType, snapshot?.status?.controllerConnected]);

  useEffect(() => {
    if (chordFunctions.length === 0) {
      setSelectedChordFunctionId('');
      setChordFunctionDraft(EMPTY_CHORD_FUNCTION_DRAFT);
      setChordAssignmentDraftRows([]);
      return;
    }
    const nextSelected = chordFunctions.find((func) => func.id === selectedChordFunctionId) ?? chordFunctions[0]!;
    if (nextSelected.id !== selectedChordFunctionId) {
      setSelectedChordFunctionId(nextSelected.id);
    }
    setChordFunctionDraft(chordFunctionToDraft(nextSelected));
  }, [chordFunctionsSignature]);

  useEffect(() => {
    setChordAssignmentDraftRows((rows) => rows
      .map((row) => {
        const rowStarterOptions = chordStarterOptionsFor(row.starter);
        const starter = rowStarterOptions.some(([, option]) => option === row.starter) ? row.starter : 'ps';
        const functionId = chordFunctions.some((func) => func.id === row.functionId)
          ? row.functionId
          : defaultChordFunctionId;
        const button = row.button
          && chordAssignableButtonIds.includes(row.button)
          && isChordBindingAllowed(starter, row.button)
          ? row.button
          : null;
        return functionId ? { ...row, starter, button, functionId } : null;
      })
      .filter((row): row is ChordAssignmentDraftRow => row !== null));
  }, [chordAssignableButtonIds, chordFunctionsSignature, chordStarterOptions, defaultChordFunctionId]);

  function applySnapshot(next: BridgeSnapshot) {
    setSnapshot(next);
    setRemapDraft(next.settings.buttonRemappingDraft);
    if (!hapticsEditingRef.current) {
      setHapticsValue(displayHapticsValue(next));
    }
    if (!classicRumbleEditingRef.current) {
      setClassicRumbleValue(displayClassicRumbleValue(next));
    }
    if (!speakerVolumeEditingRef.current) {
      setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
    }
    if (!micVolumeEditingRef.current) {
      setMicVolumeValue(snapMicVolume(next.settings.micVolumePercent));
    }
    if (!audioBufferLengthEditingRef.current) {
      setAudioBufferLengthValue(clampAudioBufferLength(next.settings.hapticsBufferLength));
    }
    const nextLightbarColor = lightbarColorFromSnapshot(next);
    setLightbarColor(nextLightbarColor);
    if (!isLightbarPresetColor(nextLightbarColor)) {
      setCustomLightbarColor(nextLightbarColor);
      setCustomColorDraft(nextLightbarColor);
      window.localStorage.setItem('ds5bridge.customLightbarColor', nextLightbarColor);
    }
    if (!lightbarBrightnessEditingRef.current) {
      setLightbarBrightnessValue(displayLightbarBrightnessValue(next));
    }
    if (!triggerEffectEditingRef.current) {
      setTriggerEffectIntensityValue(displayTriggerEffectIntensityValue(next));
    }
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
    window.bridge.getStatus().then((next) => {
      if (!cancelled && !receivedLiveSnapshot) {
        applySnapshot(next);
      }
    });
    const unsubscribe = window.bridge.onSnapshot((next) => {
      receivedLiveSnapshot = true;
      if (windowDraggingRef.current) {
        deferredSnapshotRef.current = next;
        return;
      }
      applySnapshot(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
      if (customSwatchPrimeTimerRef.current !== null) {
        window.clearTimeout(customSwatchPrimeTimerRef.current);
      }
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
      if (startupReadyTimerRef.current !== null) {
        window.clearTimeout(startupReadyTimerRef.current);
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
  }, [audioHapticsOpen, audioReactiveHapticsSourceKey, connected, controllerConnected]);

  useEffect(() => {
    if (!showBridgeSettings && !showNotificationsMenu) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (showNotificationsMenu && !notificationsRef.current?.contains(event.target as Node)) {
        setShowNotificationsMenu(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowBridgeSettings(false);
        setShowNotificationsMenu(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showBridgeSettings, showNotificationsMenu]);

  useEffect(() => {
    setSpeakerOutputAvailable(true);
  }, []);

  useEffect(() => {
    if (activeControlTab !== 'remapping') {
      return undefined;
    }

    const leftSide = remappingLeftSideRef.current;
    const rightSide = remappingRightSideRef.current;
    const layout = remappingLayoutRef.current;
    const art = remappingArtRef.current;
    if (!leftSide || !rightSide || !layout || !art) {
      return undefined;
    }
    const leftSideElement = leftSide;
    const rightSideElement = rightSide;
    const layoutElement = layout;
    const artElement = art;

    function updateRemapCalloutPositions() {
      const artRect = artElement.getBoundingClientRect();
      const leftRect = leftSideElement.getBoundingClientRect();
      const rightRect = rightSideElement.getBoundingClientRect();
      const layoutRect = layoutElement.getBoundingClientRect();
      const layoutScaleX = layoutRect.width / layoutElement.offsetWidth || 1;
      const layoutScaleY = layoutRect.height / layoutElement.offsetHeight || 1;
      const toLocalX = (clientX: number) => (clientX - layoutRect.left) / layoutScaleX;
      const toLocalY = (clientY: number) => (clientY - layoutRect.top) / layoutScaleY;
      const artLeft = toLocalX(artRect.left);
      const artTop = toLocalY(artRect.top);
      const artWidth = artRect.width / layoutScaleX;
      const artHeight = artRect.height / layoutScaleY;
      const leftTop = toLocalY(leftRect.top);
      const rightTop = toLocalY(rightRect.top);
      const viewBoxAspect = remappingLayoutAsset.viewBoxWidth / remappingLayoutAsset.viewBoxHeight;
      const renderedSvgHeight = Math.min(artHeight, artWidth / viewBoxAspect);
      const renderedSvgWidth = renderedSvgHeight * viewBoxAspect;
      const renderedSvgTop = artTop + (artHeight - renderedSvgHeight) / 2;
      const renderedSvgLeft = artLeft + (artWidth - renderedSvgWidth) / 2;
      const nextLayout = {} as Record<StandardRemapButtonId, RemapCalloutLayout>;
      const mapSvgPoint = ([x, y]: [number, number]) => (
        `${renderedSvgLeft + (x / remappingLayoutAsset.viewBoxWidth) * renderedSvgWidth},${renderedSvgTop + (y / remappingLayoutAsset.viewBoxHeight) * renderedSvgHeight}`
      );
      const mapSvgX = (x: number) => renderedSvgLeft + (x / remappingLayoutAsset.viewBoxWidth) * renderedSvgWidth;
      const mapSvgY = (y: number) => renderedSvgTop + (y / remappingLayoutAsset.viewBoxHeight) * renderedSvgHeight;
      const remapPillEdgeX = (side: HTMLElement, buttonId: StandardRemapButtonId, edge: 'left' | 'right') => {
        const pill = side.querySelector<HTMLElement>(`[data-remap-button-id="${buttonId}"]`);
        if (!pill) {
          return edge === 'right' ? toLocalX(side.getBoundingClientRect().right) : toLocalX(side.getBoundingClientRect().left);
        }
        const pillRect = pill.getBoundingClientRect();
        return toLocalX(edge === 'right' ? pillRect.right : pillRect.left);
      };

      for (const buttonId of REMAP_LEFT_BUTTON_IDS) {
        const top = renderedSvgTop + (remappingLayoutAsset.calloutY[buttonId] / remappingLayoutAsset.viewBoxHeight) * renderedSvgHeight - leftTop;
        const pillRightX = remapPillEdgeX(leftSideElement, buttonId, 'right');
        nextLayout[buttonId] = {
          top,
          points: [
            `${pillRightX},${leftTop + top}`,
            ...remappingLayoutAsset.calloutPoints[buttonId].map(mapSvgPoint)
          ].join(' ')
        };
      }
      for (const buttonId of REMAP_RIGHT_BUTTON_IDS) {
        const top = renderedSvgTop + (remappingLayoutAsset.calloutY[buttonId] / remappingLayoutAsset.viewBoxHeight) * renderedSvgHeight - rightTop;
        const pillLeftX = remapPillEdgeX(rightSideElement, buttonId, 'left');
        nextLayout[buttonId] = {
          top,
          points: [
            `${pillLeftX},${rightTop + top}`,
            ...remappingLayoutAsset.calloutPoints[buttonId].map(mapSvgPoint)
          ].join(' ')
        };
      }

      setRemapCalloutLayout((current) => {
        if (current && REMAP_STANDARD_BUTTON_IDS.every((buttonId) => (
          Math.abs(current[buttonId].top - nextLayout[buttonId].top) < 0.5
          && current[buttonId].points === nextLayout[buttonId].points
        ))) {
          return current;
        }
        return nextLayout;
      });

      if (showDualSenseEdgeRemapButtons) {
        const nextEdgeLayout = {} as Record<DualSenseEdgeRemapButtonId, EdgeRemapControlLayout>;
        for (const buttonId of REMAP_EDGE_BUTTON_IDS) {
          const point = REMAP_EDGE_CONTROL_POINTS[buttonId];
          nextEdgeLayout[buttonId] = {
            left: mapSvgX(point.x),
            top: mapSvgY(point.y),
            anchor: point.anchor,
            linePoints: REMAP_EDGE_LINE_POINTS[buttonId].map(mapSvgPoint).join(' ')
          };
        }
        setEdgeRemapControlLayout((current) => {
          if (current && REMAP_EDGE_BUTTON_IDS.every((buttonId) => (
            Math.abs(current[buttonId].left - nextEdgeLayout[buttonId].left) < 0.5
            && Math.abs(current[buttonId].top - nextEdgeLayout[buttonId].top) < 0.5
            && current[buttonId].anchor === nextEdgeLayout[buttonId].anchor
            && current[buttonId].linePoints === nextEdgeLayout[buttonId].linePoints
          ))) {
            return current;
          }
          return nextEdgeLayout;
        });
      } else {
        setEdgeRemapControlLayout(null);
      }
    }

    updateRemapCalloutPositions();
    const resizeObserver = new ResizeObserver(updateRemapCalloutPositions);
    resizeObserver.observe(leftSideElement);
    resizeObserver.observe(rightSideElement);
    resizeObserver.observe(layoutElement);
    resizeObserver.observe(artElement);
    window.addEventListener('resize', updateRemapCalloutPositions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateRemapCalloutPositions);
    };
  }, [activeControlTab, remappingLayoutAsset, showDualSenseEdgeRemapButtons]);

  useEffect(() => {
    if (!connected) {
      setSpeakerTestError(null);
    }
  }, [connected]);

  useEffect(() => {
    if (!showCustomColorPicker) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!customColorPickerRef.current?.contains(event.target as Node)) {
        setShowCustomColorPicker(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowCustomColorPicker(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showCustomColorPicker]);

  const batteryPercent = Math.max(0, Math.min(100, snapshot?.status?.batteryPercent ?? 0));
  const batteryPercentLabel = batteryLabel(snapshot);
  const batteryLevelTone = batteryTone(snapshot?.status?.batteryPercent);
  const batteryCharging = isChargingPowerState(snapshot?.status?.rawPowerState);
  const batterySegmentCount = connected
    ? batteryPercent >= 67
      ? 3
      : batteryPercent >= 34
        ? 2
        : batteryPercent > 0
          ? 1
          : 0
    : 0;
  const batteryChargingSegment = connected && batteryCharging && batteryPercent < 100
    ? Math.min(2, batterySegmentCount)
    : -1;
  const batteryCritical = connected && !batteryCharging && batteryPercent > 0 && batteryPercent <= 20;
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
  const speakerEnabled = Boolean(snapshot?.settings.speakerEnabled);
  const speakerGainLevel = Math.max(1, Math.min(7, Math.round(
    snapshot?.settings.speakerGainLevel ?? snapshot?.status?.speakerGainLevel ?? 4
  )));
  const adaptiveTriggersEnabled = Boolean(snapshot?.settings.adaptiveTriggersEnabled);
  const lightbarEnabled = Boolean(snapshot?.settings.lightbarEnabled);
  const sleepKeybindEnabled = Boolean(snapshot?.settings.sleepKeybindEnabled);
  const controllerToastEnabled = Boolean(snapshot?.settings.notifyControllerConnection);
  const lowBatteryToastEnabled = Boolean(snapshot?.settings.notifyLowBattery);
  const notificationsEnabled = controllerToastEnabled || lowBatteryToastEnabled;
  const gameStreamActive = Boolean(snapshot?.status?.hostOutputRecent);
  const adaptiveTriggerOutputActive = Boolean(snapshot?.status?.adaptiveTriggerOutputRecent);
  const audioStatus = snapshot?.diagnostics.audioStatus;
  const headsetOutputDetected = Boolean(audioStatus?.headsetPlugged);
  const controllerPowerSavingActive = controllerPowerSavingActiveFromSnapshot(snapshot);
  const feedbackBoostEnabled = Boolean(snapshot?.settings.feedbackBoostEnabled);
  const hapticsSliderMax = feedbackSliderMaxFromSnapshot(snapshot);
  const hapticsSliderTicks = feedbackSliderTicks(hapticsSliderMax);
  const percentSliderMax = controllerPowerSavingActive ? CONTROLLER_POWER_SAVING_CAP_PERCENT : 100;
  const OutputIcon = headsetOutputDetected ? Headphones : Volume2;

  useEffect(() => {
    if (!connected) {
      triggerLabRestoreAppliedRef.current = false;
    }
  }, [connected]);

  useEffect(() => {
    if (
      triggerLabRestoreAppliedRef.current
      || !connected
      || !adaptiveTriggersSupported
      || !adaptiveTriggersEnabled
      || pendingAction !== null
    ) {
      return;
    }

    triggerLabRestoreAppliedRef.current = true;
    if (!triggerLabAnyActive) {
      return;
    }

    if (triggerLabLinked) {
      const active = triggerLabActive.l2 && triggerLabActive.r2 && triggerLabDrafts.l2.forcePercent > 0;
      persistTriggerLab('l2', triggerLabDrafts.l2, active, 'trigger-lab-restore', 'both');
      return;
    }

    persistTriggerLabSplitState({
      drafts: triggerLabDrafts,
      active: triggerLabActive
    }, 'trigger-lab-restore');
  }, [
    adaptiveTriggersEnabled,
    adaptiveTriggersSupported,
    connected,
    pendingAction,
    triggerLabActive,
    triggerLabAnyActive,
    triggerLabDrafts,
    triggerLabLinked
  ]);
  const outputControlLabel = headsetOutputDetected ? 'Headphones' : 'Speaker';
  const outputControlLower = headsetOutputDetected ? 'headphones' : 'speaker';
  const outputPresetLower = headsetOutputDetected ? 'headphones' : 'speaker';
  const duplexMicEnabled = Boolean(snapshot?.settings.duplexMicEnabled);
  const audioEnabled = speakerEnabled || duplexMicEnabled;
  const audioPathLabel = personaTransitionActive
    ? 'Switching Mode'
    : !connected
    ? 'Unavailable'
    : 'Pico Local';
  const audioPathTooltip = personaTransitionActive
    ? 'Waiting for the controller to re-enumerate.'
    : audioPathLabel;
  const audioPathTone = connected && !personaTransitionActive ? 'good' : 'idle';
  const audioBufferLengthControlDisabled = !connected
    || !audioBufferLengthControlSupported
    || pendingAction !== null
    || audioBufferLengthCommitPending;
  const audioReactiveHapticsRouteSupported = audioReactiveHapticsSupported;
  const audioReactiveHapticsBlocked = !connected
    || !audioReactiveHapticsSupported
    || !audioReactiveHapticsRouteSupported
    || !hapticsEnabled;
  const audioReactiveHapticsControlDisabled = audioReactiveHapticsBlocked
    || pendingAction !== null
    || audioReactiveHapticsCommitPending;
  const audioReactiveHapticsConfigDisabled = audioReactiveHapticsControlDisabled || !audioReactiveHapticsEnabled;
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
  const duplexMicLabel = audioStatus?.duplexActive
    ? 'Duplex Active'
    : duplexMicEnabled
      ? 'Mic Standby'
      : 'Off';
  const speakerOutputMissing = false;
  const testHapticsUnavailable = !connected
    || !hapticsEnabled
    || pendingAction !== null
    || speakerVolumeCommitPending
    || lightbarCommitPending
    || testLocked
    || Boolean(snapshot?.status?.testHapticsBusy)
    || Boolean(snapshot?.status?.testHapticsCooldown);
  const testRumbleUnavailable = !connected
    || !classicRumbleEnabled
    || pendingAction !== null
    || speakerVolumeCommitPending
    || lightbarCommitPending
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
  const testSpeakerUnavailable = !connected
    || !speakerVolumeSupported
    || !speakerEnabled
    || pendingAction !== null
    || speakerVolumeCommitPending
    || lightbarCommitPending
    || speakerTestLocked
    || gameStreamActive
    || Boolean(snapshot?.status?.testHapticsBusy);
  const testMicUnavailable = !connected
    || !duplexMicEnabled
    || pendingAction !== null
    || micVolumeCommitPending
    || lightbarCommitPending
    || micTestLocked
    || gameStreamActive;
  const speakerStatusReady = connected
    && speakerVolumeSupported
    && speakerEnabled
    && !speakerTestLocked
    && !speakerOutputMissing
    && !gameStreamActive
    && !snapshot?.status?.testHapticsBusy;
  const micStatusReady = connected
    && duplexMicEnabled
    && !micTestLocked
    && !gameStreamActive;
  const speakerStatusLabel = speakerTestLocked
    ? 'Playing'
    : connected && speakerTestError
      ? speakerTestError
    : connected && speakerOutputMissing
        ? BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE
        : speakerStatusReady
          ? 'Ready'
          : connected && gameStreamActive
            ? 'Game Audio Active'
            : 'Unavailable';
  const speakerStatusTone = speakerTestLocked || speakerStatusReady
    ? 'good'
    : connected && (speakerTestError || speakerOutputMissing)
        ? 'bad'
      : connected && gameStreamActive
        ? 'warn'
        : 'idle';
  const micTestStatusLabel = micTestLocked
    ? 'Listening'
    : connected && micTestError
      ? micTestError
      : micStatusReady
        ? 'Ready'
        : 'Unavailable';
  const micTestStatusTone = micTestLocked || micStatusReady
    ? 'good'
    : connected && micTestError
      ? 'bad'
      : 'idle';
  const activeAudioTestUnavailable = showMicrophoneControl ? testMicUnavailable : testSpeakerUnavailable;
  const activeAudioTestLocked = showMicrophoneControl ? micTestLocked : speakerTestLocked;
  const activeAudioTestStatusLabel = showMicrophoneControl ? micTestStatusLabel : speakerStatusLabel;
  const activeAudioTestStatusTone = showMicrophoneControl ? micTestStatusTone : speakerStatusTone;
  const sidebarDeviceTitle = personaTransitionActive
    ? 'Switching Mode'
    : connected && controllerConnected
    ? controllerName(snapshot.status?.controllerType)
    : 'Controller';
  const sidebarDeviceStatus = personaTransitionActive
    ? 'Please wait'
    : connected && controllerConnected
    ? 'Connected'
    : connected
      ? 'Controller not connected'
      : 'Bridge not detected';
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
    ? 'Reconnecting'
    : connected && controllerConnected
    ? `Battery ${batteryPercentLabel}`
    : 'Battery unavailable';
  const pollingRateLabel = POLLING_RATE_OPTIONS.find(([, mode]) => mode === snapshot?.settings.pollingRateMode)?.[0]
    .replace(' / Real-time', '')
    ?? '--';
  const firmwareUpdateAvailable = Boolean(snapshot?.diagnostics.firmwareUpdateAvailable);
  const overviewHealthLabel = healthLabel(snapshot);
  const overviewHealthTone = personaTransitionActive
    ? 'warn'
    : snapshot?.diagnostics.lastError
    ? 'bad'
    : firmwareUpdateAvailable
    ? 'warn'
    : connected && controllerConnected
      ? 'good'
      : connected
        ? 'warn'
        : 'idle';
  const systemHealthTone = personaTransitionActive
    ? 'warn'
    : snapshot?.diagnostics.lastError
      ? 'bad'
      : firmwareUpdateAvailable
        ? 'warn'
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
  const overviewSpeakerVolumeValue = `${speakerVolumeValue}%`;
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
  const testTriggersUnavailable = !connected
    || !adaptiveTriggersSupported
    || !adaptiveTriggersEnabled
    || pendingAction !== null
    || triggerTestLocked
    || adaptiveTriggerOutputActive
    || Boolean(snapshot?.status?.testAdaptiveTriggersBusy);
  const triggerStatusReady = connected
    && adaptiveTriggersSupported
    && adaptiveTriggersEnabled
    && !triggerTestLocked
    && !adaptiveTriggerOutputActive
    && !snapshot?.status?.testAdaptiveTriggersBusy;
  const triggerStatusLabel = triggerTestLocked || snapshot?.status?.testAdaptiveTriggersBusy
    ? 'Testing'
    : triggerStatusReady
      ? 'Ready'
      : connected && adaptiveTriggerOutputActive
        ? 'Game Triggers Active'
        : 'Unavailable';
  const triggerStatusTone = triggerTestLocked || snapshot?.status?.testAdaptiveTriggersBusy || triggerStatusReady
    ? 'good'
    : connected && adaptiveTriggerOutputActive
      ? 'warn'
      : 'idle';
  const lightbarStateActive = connected && lightbarSupported && lightbarEnabled;
  const lightbarStateLabel = lightbarStateActive
    ? 'Active'
    : connected && lightbarSupported
      ? 'Off'
      : 'Unavailable';

  useEffect(() => {
    if (!connected || speakerOutputAvailable !== false || speakerTestLocked) {
      return undefined;
    }

    const refresh = () => {
      void findBridgeAudioOutputId(2).then((sinkId) => {
        if (!sinkId) {
          return;
        }
        setSpeakerOutputAvailable(true);
        setSpeakerTestError(null);
      });
    };

    const handle = window.setInterval(refresh, TEST_SPEAKER_ENDPOINT_REFRESH_MS);
    return () => window.clearInterval(handle);
  }, [connected, speakerOutputAvailable, speakerTestLocked]);

  useEffect(() => () => {
    stopMicLiveListen();
  }, []);

  useEffect(() => {
    if ((!connected || !showMicrophoneControl) && micTestLocked) {
      stopMicLiveListen();
    }
  }, [connected, showMicrophoneControl, micTestLocked]);

  const normalizedLightbarColor = normalizeHexColor(lightbarColor);
  const customSwatchColor = customLightbarColor ?? LIGHTBAR_DEFAULT_CUSTOM_COLOR;
  const customSwatchSelected = Boolean(customLightbarColor && normalizedLightbarColor === customLightbarColor);
  const customColorPickerDisabled = !connected || !lightbarSupported || !lightbarEnabled;
  const diagnosticsVisible = activeControlTab === 'system' && showDiagnostics;
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

  async function commitSpeakerVolume(value = speakerVolumeValue) {
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !speakerVolumeSupported
      || !snapshot.settings.speakerEnabled
      || value === snapshot.settings.speakerVolumePercent
      || speakerVolumeCommitPending
    ) {
      speakerVolumeEditingRef.current = false;
      return;
    }

    setSpeakerVolumeCommitPending(true);
    speakerVolumeEditingRef.current = true;
    try {
      const next = await window.bridge.setSpeakerVolume(value);
      setSnapshot(next);
      setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
      await delay(TEST_SPEAKER_VOLUME_SETTLE_MS);
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
    } finally {
      setSpeakerVolumeCommitPending(false);
      speakerVolumeEditingRef.current = false;
    }
  }

  async function commitLightbar(nextColor = lightbarColor, brightness = lightbarBrightnessValue) {
    const color = normalizeHexColor(nextColor);
    const snappedBrightness = snapLightbarBrightness(brightness);
    const shouldPreserveSavedBrightness = Boolean(
      snapshot
      && controllerPowerSavingActive
      && snapshot.settings.lightbarBrightnessPercent > CONTROLLER_POWER_SAVING_CAP_PERCENT
      && snappedBrightness === CONTROLLER_POWER_SAVING_CAP_PERCENT
    );
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !lightbarSupported
      || !snapshot.settings.lightbarEnabled
      || lightbarCommitPending
      || (
        controllerPowerSavingActive
        && snapshot.settings.lightbarBrightnessPercent > CONTROLLER_POWER_SAVING_CAP_PERCENT
        && snappedBrightness === CONTROLLER_POWER_SAVING_CAP_PERCENT
        && color === normalizeHexColor(snapshot.settings.lightbarColor)
      )
      || (
        color === normalizeHexColor(snapshot.settings.lightbarColor)
        && snappedBrightness === snapshot.settings.lightbarBrightnessPercent
      )
    ) {
      lightbarBrightnessEditingRef.current = false;
      return;
    }

    setLightbarCommitPending(true);
    try {
      const persistedBrightness = shouldPreserveSavedBrightness
        ? snapshot.settings.lightbarBrightnessPercent
        : snappedBrightness;
      const next = await window.bridge.setLightbarColor(color, persistedBrightness);
      setSnapshot(next);
      setLightbarBrightnessValue(displayLightbarBrightnessValue(next));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setLightbarBrightnessValue(displayLightbarBrightnessValue(next));
    } finally {
      setLightbarCommitPending(false);
      lightbarBrightnessEditingRef.current = false;
    }
  }

  async function commitTriggerEffectIntensity(value = triggerEffectIntensityValue) {
    const snappedValue = snapTriggerEffectIntensity(value);
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !adaptiveTriggersSupported
      || !snapshot.settings.adaptiveTriggersEnabled
      || (controllerPowerSavingActive && snapshot.settings.triggerEffectIntensityPercent > CONTROLLER_POWER_SAVING_CAP_PERCENT && snappedValue === CONTROLLER_POWER_SAVING_CAP_PERCENT)
      || snappedValue === snapshot.settings.triggerEffectIntensityPercent
    ) {
      triggerEffectEditingRef.current = false;
      return;
    }

    try {
      const next = await window.bridge.setTriggerEffectIntensity(snappedValue);
      setSnapshot(next);
      setTriggerEffectIntensityValue(displayTriggerEffectIntensityValue(next));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setTriggerEffectIntensityValue(displayTriggerEffectIntensityValue(next));
    } finally {
      triggerEffectEditingRef.current = false;
    }
  }

  function selectLightbarColor(nextColor: string) {
    const color = normalizeHexColor(nextColor);
    setLightbarColor(color);
    void commitLightbar(color, lightbarBrightnessValue);
  }

  function saveCustomLightbarColor(nextColor: string) {
    const color = normalizeHexColor(nextColor);
    setCustomLightbarColor(color);
    setCustomColorDraft(color);
    setLightbarColor(color);
    setShowCustomColorPicker(false);
    setCustomSwatchPrimed(false);
    window.localStorage.setItem('ds5bridge.customLightbarColor', color);
    void commitLightbar(color, lightbarBrightnessValue);
  }

  function previewCustomLightbarColor(nextColor: string) {
    const color = normalizeHexColor(nextColor);
    setCustomColorDraft(color);
    setLightbarColor(color);
    void commitLightbar(color, lightbarBrightnessValue);
  }

  function selectCustomLightbarColor() {
    if (!customLightbarColor) {
      setCustomSwatchPrimed(true);
      if (customSwatchPrimeTimerRef.current !== null) {
        window.clearTimeout(customSwatchPrimeTimerRef.current);
      }
      customSwatchPrimeTimerRef.current = window.setTimeout(() => {
        setCustomSwatchPrimed(false);
        customSwatchPrimeTimerRef.current = null;
      }, 1600);
      return;
    }
    selectLightbarColor(customLightbarColor);
  }

  function openCustomLightbarPicker() {
    const color = customLightbarColor ?? LIGHTBAR_DEFAULT_CUSTOM_COLOR;
    setCustomColorDraft(color);
    setCustomSwatchPrimed(false);
    setShowCustomColorPicker(true);
  }

  function setLightbarPreset(value: number) {
    const brightness = snapLightbarBrightness(capControllerPowerSavingValue(value, snapshot));
    setLightbarBrightnessValue(brightness);
    void commitLightbar(lightbarColor, brightness);
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

  function setSpeakerPreset(value: number) {
    const snappedValue = snapSpeakerVolume(value);
    speakerVolumeEditingRef.current = true;
    setSpeakerVolumeValue(snappedValue);
    void commitSpeakerVolume(snappedValue);
  }

  function setSpeakerGainLevel(level: number) {
    if (!snapshot) {
      return;
    }
    const value = Math.max(1, Math.min(7, Math.round(level)));
    if (value === snapshot.settings.speakerGainLevel) {
      return;
    }
    void runQuietAction(() => window.bridge.setSpeakerGainLevel(value));
  }

  async function commitMicVolume(value = micVolumeValue) {
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || value === snapshot.settings.micVolumePercent
      || micVolumeCommitPending
    ) {
      micVolumeEditingRef.current = false;
      return;
    }

    setMicVolumeCommitPending(true);
    micVolumeEditingRef.current = true;
    try {
      const next = await window.bridge.setMicVolume(value);
      setSnapshot(next);
      setMicVolumeValue(snapMicVolume(next.settings.micVolumePercent));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setMicVolumeValue(snapMicVolume(next.settings.micVolumePercent));
    } finally {
      setMicVolumeCommitPending(false);
      micVolumeEditingRef.current = false;
    }
  }

  function setMicPreset(value: number) {
    const snappedValue = snapMicVolume(value);
    micVolumeEditingRef.current = true;
    setMicVolumeValue(snappedValue);
    void commitMicVolume(snappedValue);
  }

  async function commitAudioBufferLength(value = audioBufferLengthValue) {
    const snappedValue = clampAudioBufferLength(value);
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !audioBufferLengthControlSupported
      || snappedValue === snapshot.settings.hapticsBufferLength
      || audioBufferLengthCommitPending
    ) {
      audioBufferLengthEditingRef.current = false;
      setAudioBufferLengthValue(snappedValue);
      return;
    }

    setAudioBufferLengthCommitPending(true);
    audioBufferLengthEditingRef.current = true;
    try {
      const next = await window.bridge.setHapticsBufferLength(snappedValue);
      setSnapshot(next);
      setAudioBufferLengthValue(clampAudioBufferLength(next.settings.hapticsBufferLength));
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setAudioBufferLengthValue(clampAudioBufferLength(next.settings.hapticsBufferLength));
    } finally {
      setAudioBufferLengthCommitPending(false);
      audioBufferLengthEditingRef.current = false;
    }
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

  function toggleAudioReactiveHapticsEnabled() {
    if (!snapshot) return;
    void commitAudioReactiveHapticsConfig({
      enabled: !snapshot.settings.audioReactiveHapticsEnabled
    });
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

  function setTriggerIntensityPreset(value: number) {
    const snappedValue = snapTriggerEffectIntensity(capControllerPowerSavingValue(value, snapshot));
    setTriggerEffectIntensityValue(snappedValue);
    void commitTriggerEffectIntensity(snappedValue);
  }

  function lightbarColorName(color: string) {
    const normalized = normalizeHexColor(color);
    return LIGHTBAR_COLOR_NAMES[normalized] ?? 'Custom';
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

  function runTestSpeaker() {
    setSpeakerTestLocked(true);
    setPendingAction('speaker');
    setSpeakerTestError(null);
    void (async () => {
      try {
        let volumeChanged = false;
        if (snapshot && speakerVolumeSupported && speakerVolumeValue !== snapshot.settings.speakerVolumePercent) {
          speakerVolumeEditingRef.current = true;
          const next = await window.bridge.setSpeakerVolume(speakerVolumeValue);
          setSnapshot(next);
          setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
          speakerVolumeEditingRef.current = false;
          volumeChanged = true;
        }
        if (volumeChanged) {
          await delay(TEST_SPEAKER_VOLUME_SETTLE_MS);
        }
        const next = await window.bridge.testSpeaker();
        setSnapshot(next);
        setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
        setSpeakerOutputAvailable(true);
      } catch (error) {
        const message = error instanceof Error ? error.message : BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE;
        setSpeakerTestError(message);
        setSpeakerOutputAvailable(true);
        const next = await window.bridge.getStatus();
        setSnapshot(next);
        setSpeakerVolumeValue(snapSpeakerVolume(next.settings.speakerVolumePercent));
        speakerVolumeEditingRef.current = false;
      } finally {
        speakerVolumeEditingRef.current = false;
        setPendingAction(null);
        window.setTimeout(() => setSpeakerTestLocked(false), TEST_SPEAKER_LOCK_MS);
      }
    })();
  }

  function runTestMic() {
    setMicTestLocked(true);
    setPendingAction('mic-test');
    setMicTestError(null);
    void (async () => {
      try {
        if (snapshot && micVolumeValue !== snapshot.settings.micVolumePercent) {
          micVolumeEditingRef.current = true;
          const next = await window.bridge.setMicVolume(micVolumeValue);
          setSnapshot(next);
          setMicVolumeValue(snapMicVolume(next.settings.micVolumePercent));
          micVolumeEditingRef.current = false;
        }
        await playMicLiveListen(TEST_MIC_LISTEN_MS);
      } catch (error) {
        const message = error instanceof Error ? error.message : BRIDGE_MIC_ENDPOINT_UNAVAILABLE;
        setMicTestError(message);
        const next = await window.bridge.getStatus();
        setSnapshot(next);
        setMicVolumeValue(snapMicVolume(next.settings.micVolumePercent));
      } finally {
        micVolumeEditingRef.current = false;
        setPendingAction(null);
        setMicTestLocked(false);
      }
    })();
  }

  function runTestAdaptiveTriggers() {
    setTriggerTestLocked(true);
    void runAction('triggers', async () => {
      if (
        snapshot
        && triggerEffectIntensityValue !== snapshot.settings.triggerEffectIntensityPercent
        && !isPreservingPowerSavingCap(snapshot.settings.triggerEffectIntensityPercent, triggerEffectIntensityValue)
      ) {
        await window.bridge.setTriggerEffectIntensity(triggerEffectIntensityValue);
      }
      return window.bridge.testAdaptiveTriggers(snapshot?.settings.triggerTestMode ?? 'feedback', triggerTarget);
    }).finally(() => {
      window.setTimeout(() => setTriggerTestLocked(false), TEST_TRIGGER_LOCK_MS);
    });
  }

  function updateTriggerLabSide(side: TriggerLabSide, update: (current: TriggerLabDraft) => TriggerLabDraft) {
    setTriggerLabDrafts((current) => {
      const nextSide = update(current[side]);
      if (triggerLabLinked) {
        return { l2: nextSide, r2: nextSide };
      }
      return { ...current, [side]: nextSide };
    });
  }

  function triggerLabActiveForSide(side: TriggerLabSide) {
    return triggerLabLinked ? triggerLabActive.l2 && triggerLabActive.r2 : triggerLabActive[side];
  }

  function setTriggerLabActiveForTarget(side: TriggerLabSide, active: boolean) {
    setTriggerLabActive((current) => (
      triggerLabLinked ? { l2: active, r2: active } : { ...current, [side]: active }
    ));
  }

  function triggerLabProfileDraft(profileId: TriggerLabProfileId): TriggerLabDraft | null {
    if (isTriggerLabBuiltinProfileId(profileId)) {
      return { ...TRIGGER_LAB_PROFILE_PRESETS[profileId] };
    }
    const profile = triggerLabCustomProfiles.find((candidate) => candidate.id === profileId);
    if (!profile) {
      return null;
    }
    return {
      profileId: profile.id,
      mode: profile.mode,
      startPercent: profile.startPercent,
      wallPercent: profile.wallPercent,
      forcePercent: profile.forcePercent
    };
  }

  function triggerLabProfileName(profileId: TriggerLabProfileId): string {
    const builtin = TRIGGER_LAB_BUILTIN_PROFILE_OPTIONS.find(([, value]) => value === profileId);
    if (builtin) {
      return builtin[0];
    }
    return triggerLabCustomProfiles.find((profile) => profile.id === profileId)?.name
      ?? (profileId === TRIGGER_LAB_AUTO_CUSTOM_PROFILE_ID ? TRIGGER_LAB_AUTO_CUSTOM_PROFILE_NAME : 'Profile');
  }

  function triggerLabProfileIsCustom(profileId: TriggerLabProfileId): boolean {
    return triggerLabCustomProfiles.some((profile) => profile.id === profileId);
  }

  function triggerLabProfileActive(profileId: TriggerLabProfileId): boolean {
    if (isTriggerLabBuiltinProfileId(profileId)) {
      return false;
    }
    return triggerLabCustomProfiles.find((profile) => profile.id === profileId)?.active ?? false;
  }

  function triggerLabCustomProfileFromDraft(
    id: TriggerLabCustomProfileId,
    name: string,
    draft: TriggerLabDraft,
    active: boolean
  ): TriggerLabCustomProfile {
    return {
      id,
      name: name.trim().slice(0, 48) || TRIGGER_LAB_AUTO_CUSTOM_PROFILE_NAME,
      mode: draft.mode,
      startPercent: draft.startPercent,
      wallPercent: draft.wallPercent,
      forcePercent: draft.forcePercent,
      active: active && draft.forcePercent > 0
    };
  }

  function upsertTriggerLabCustomProfile(profile: TriggerLabCustomProfile) {
    setTriggerLabCustomProfiles((current) => {
      const existingProfile = current.find((candidate) => candidate.id === profile.id);
      if (!existingProfile) {
        return [...current, profile];
      }
      return current.map((candidate) => (
        candidate.id === profile.id ? profile : candidate
      ));
    });
  }

  function saveTriggerLabDraftToProfile(draft: TriggerLabDraft, active: boolean) {
    if (isTriggerLabBuiltinProfileId(draft.profileId)) {
      return;
    }
    upsertTriggerLabCustomProfile(triggerLabCustomProfileFromDraft(
      draft.profileId,
      triggerLabProfileName(draft.profileId),
      draft,
      active
    ));
  }

  function editableTriggerLabDraft(draft: TriggerLabDraft, active: boolean): TriggerLabDraft {
    if (isTriggerLabBuiltinProfileId(draft.profileId)) {
      const nextDraft = {
        ...draft,
        profileId: TRIGGER_LAB_AUTO_CUSTOM_PROFILE_ID
      };
      upsertTriggerLabCustomProfile(triggerLabCustomProfileFromDraft(
        TRIGGER_LAB_AUTO_CUSTOM_PROFILE_ID,
        TRIGGER_LAB_AUTO_CUSTOM_PROFILE_NAME,
        nextDraft,
        active
      ));
      return nextDraft;
    }

    upsertTriggerLabCustomProfile(triggerLabCustomProfileFromDraft(
      draft.profileId,
      triggerLabProfileName(draft.profileId),
      draft,
      active
    ));
    return draft;
  }

  function updateEditableTriggerLabSide(
    side: TriggerLabSide,
    update: (current: TriggerLabDraft) => TriggerLabDraft
  ): TriggerLabDraft {
    const nextDraft = editableTriggerLabDraft(update(triggerLabDrafts[side]), triggerLabActiveForSide(side));
    updateTriggerLabSide(side, () => nextDraft);
    return nextDraft;
  }

  function persistTriggerLab(
    side: TriggerLabSide,
    draft: TriggerLabDraft,
    active: boolean,
    label: string,
    target: TriggerTestTarget = triggerLabLinked ? 'both' : side
  ) {
    void runAction(label, () => (
      window.bridge.applyAdaptiveTriggerEffect({
        mode: draft.mode,
        target,
        startPercent: draft.startPercent,
        wallPercent: draft.wallPercent,
        forcePercent: active ? draft.forcePercent : 0
      })
    ));
  }

  function persistTriggerLabSplitState(nextState: TriggerLabSplitState, label: string) {
    void runAction(label, async () => {
      await window.bridge.applyAdaptiveTriggerEffect({
        mode: nextState.drafts.l2.mode,
        target: 'l2',
        startPercent: nextState.drafts.l2.startPercent,
        wallPercent: nextState.drafts.l2.wallPercent,
        forcePercent: nextState.active.l2 ? nextState.drafts.l2.forcePercent : 0
      });
      return window.bridge.applyAdaptiveTriggerEffect({
        mode: nextState.drafts.r2.mode,
        target: 'r2',
        startPercent: nextState.drafts.r2.startPercent,
        wallPercent: nextState.drafts.r2.wallPercent,
        forcePercent: nextState.active.r2 ? nextState.drafts.r2.forcePercent : 0
      });
    });
  }

  function setTriggerLabProfile(side: TriggerLabSide, profileId: TriggerLabProfileId) {
    const profileDraft = triggerLabProfileDraft(profileId);
    if (!profileDraft) {
      return;
    }
    const previousActive = triggerLabActiveForSide(side);
    const nextActive = triggerLabProfileActive(profileId) && profileDraft.forcePercent > 0;
    const nextDraft = { ...profileDraft, profileId };
    updateTriggerLabSide(side, () => nextDraft);
    setTriggerLabActiveForTarget(side, nextActive);
    if (previousActive || nextActive) {
      persistTriggerLab(side, nextDraft, nextActive, `trigger-lab-update-${side}`);
    }
  }

  function openTriggerLabProfileDialog(mode: TriggerLabProfileDialogMode, side: TriggerLabSide) {
    const profileId = triggerLabDrafts[side].profileId;
    if ((mode === 'rename' || mode === 'delete') && !triggerLabProfileIsCustom(profileId)) {
      return;
    }
    setTriggerLabProfileNameDraft(
      mode === 'save'
        ? `Custom Trigger ${triggerLabCustomProfiles.length + 1}`
        : triggerLabProfileName(profileId)
    );
    setTriggerLabProfileDialog({ mode, side });
  }

  function closeTriggerLabProfileDialog() {
    setTriggerLabProfileDialog(null);
    setTriggerLabProfileNameDraft('');
  }

  function submitTriggerLabProfileDialog() {
    if (!triggerLabProfileDialog) {
      return;
    }

    const side = triggerLabProfileDialog.side;
    const draft = triggerLabDrafts[side];
    const nextName = triggerLabProfileNameDraft.trim();

    if (triggerLabProfileDialog.mode === 'save') {
      if (!nextName) {
        return;
      }
      const id = createTriggerLabProfileId();
      const nextProfile: TriggerLabCustomProfile = {
        id,
        name: nextName,
        mode: draft.mode,
        startPercent: draft.startPercent,
        wallPercent: draft.wallPercent,
        forcePercent: draft.forcePercent,
        active: triggerLabActiveForSide(side) && draft.forcePercent > 0
      };
      setTriggerLabCustomProfiles((current) => [...current, nextProfile]);
      updateTriggerLabSide(side, (current) => ({ ...current, profileId: id }));
      closeTriggerLabProfileDialog();
      return;
    }

    if (!triggerLabProfileIsCustom(draft.profileId)) {
      closeTriggerLabProfileDialog();
      return;
    }

    if (triggerLabProfileDialog.mode === 'rename') {
      if (!nextName || nextName === triggerLabProfileName(draft.profileId)) {
        closeTriggerLabProfileDialog();
        return;
      }
      setTriggerLabCustomProfiles((current) => current.map((profile) => (
        profile.id === draft.profileId ? { ...profile, name: nextName } : profile
      )));
      closeTriggerLabProfileDialog();
      return;
    }

    if (triggerLabProfileDialog.mode === 'delete') {
      const profileId = draft.profileId;
      const nextDrafts = {
        l2: triggerLabDrafts.l2.profileId === profileId ? { ...TRIGGER_LAB_DEFAULT_DRAFT } : triggerLabDrafts.l2,
        r2: triggerLabDrafts.r2.profileId === profileId ? { ...TRIGGER_LAB_DEFAULT_DRAFT } : triggerLabDrafts.r2
      };
      const nextActive = {
        l2: triggerLabDrafts.l2.profileId === profileId ? false : triggerLabActive.l2,
        r2: triggerLabDrafts.r2.profileId === profileId ? false : triggerLabActive.r2
      };
      setTriggerLabCustomProfiles((current) => current.filter((profile) => profile.id !== profileId));
      setTriggerLabDrafts(nextDrafts);
      setTriggerLabActive(nextActive);
      setTriggerLabSplitState((current) => current
        ? {
            drafts: {
              l2: current.drafts.l2.profileId === profileId ? { ...TRIGGER_LAB_DEFAULT_DRAFT } : current.drafts.l2,
              r2: current.drafts.r2.profileId === profileId ? { ...TRIGGER_LAB_DEFAULT_DRAFT } : current.drafts.r2
            },
            active: {
              l2: current.drafts.l2.profileId === profileId ? false : current.active.l2,
              r2: current.drafts.r2.profileId === profileId ? false : current.active.r2
            }
          }
        : null);
      if (triggerLabActive.l2 || triggerLabActive.r2) {
        if (triggerLabLinked) {
          persistTriggerLab('l2', nextDrafts.l2, false, 'trigger-lab-delete-profile', 'both');
        } else {
          persistTriggerLabSplitState({ drafts: nextDrafts, active: nextActive }, 'trigger-lab-delete-profile');
        }
      }
      closeTriggerLabProfileDialog();
    }
  }

  function setTriggerLabMode(side: TriggerLabSide, mode: TriggerTestMode) {
    const nextDraft = updateEditableTriggerLabSide(side, (current) => ({ ...current, mode }));
    if (triggerLabActiveForSide(side)) {
      persistTriggerLab(side, nextDraft, nextDraft.forcePercent > 0, `trigger-lab-update-${side}`);
      setTriggerLabActiveForTarget(side, nextDraft.forcePercent > 0);
    }
  }

  function setTriggerLabPercent(side: TriggerLabSide, key: 'startPercent' | 'wallPercent' | 'forcePercent', value: number) {
    updateEditableTriggerLabSide(side, (current) => ({
      ...current,
      [key]: snapTriggerLabPercent(value),
    }));
  }

  function commitTriggerLabPercent(side: TriggerLabSide, key: 'startPercent' | 'wallPercent' | 'forcePercent', value: number) {
    const nextDraft = updateEditableTriggerLabSide(side, (current) => ({
      ...current,
      [key]: snapTriggerLabPercent(value),
    }));
    if (triggerLabActiveForSide(side)) {
      const nextActive = nextDraft.forcePercent > 0;
      saveTriggerLabDraftToProfile(nextDraft, nextActive);
      persistTriggerLab(side, nextDraft, nextActive, `trigger-lab-update-${side}`);
      setTriggerLabActiveForTarget(side, nextActive);
    }
  }

  function toggleTriggerLabLinked(sourceSide: TriggerLabSide) {
    if (triggerLabLinked) {
      if (triggerLabSplitState) {
        setTriggerLabDrafts({
          l2: { ...triggerLabSplitState.drafts.l2 },
          r2: { ...triggerLabSplitState.drafts.r2 }
        });
        setTriggerLabActive({ ...triggerLabSplitState.active });
        persistTriggerLabSplitState(triggerLabSplitState, `trigger-lab-unlink-${sourceSide}`);
      }
      setTriggerLabLinked(false);
      return;
    }

    const sourceDraft = { ...triggerLabDrafts[sourceSide] };
    const sourceActive = triggerLabActive[sourceSide];
    setTriggerLabSplitState({
      drafts: {
        l2: { ...triggerLabDrafts.l2 },
        r2: { ...triggerLabDrafts.r2 }
      },
      active: { ...triggerLabActive }
    });
    setTriggerLabDrafts({ l2: sourceDraft, r2: { ...sourceDraft } });
    setTriggerLabActive({ l2: sourceActive, r2: sourceActive });
    setTriggerLabLinked(true);
    if (sourceActive || triggerLabActive.l2 || triggerLabActive.r2) {
      persistTriggerLab(sourceSide, sourceDraft, sourceActive, `trigger-lab-link-${sourceSide}`, 'both');
    }
  }

  function previewTriggerLab(side: TriggerLabSide) {
    const draft = triggerLabDrafts[side];
    setTriggerTestLocked(true);
    void runAction(`trigger-lab-${side}`, () => (
      window.bridge.previewAdaptiveTriggerEffect({
        mode: draft.mode,
        target: triggerLabLinked ? 'both' : side,
        startPercent: draft.startPercent,
        wallPercent: draft.wallPercent,
        forcePercent: draft.forcePercent
      })
    )).finally(() => {
      window.setTimeout(() => setTriggerTestLocked(false), TEST_TRIGGER_LOCK_MS);
    });
  }

  function toggleTriggerLabActive(side: TriggerLabSide, active: boolean) {
    const draft = active
      ? editableTriggerLabDraft(triggerLabDrafts[side], active)
      : editableTriggerLabDraft(triggerLabDrafts[side], false);
    updateTriggerLabSide(side, () => draft);
    setTriggerLabActiveForTarget(side, active);
    persistTriggerLab(side, draft, active, `trigger-lab-active-${side}`);
  }

  function setTriggerTestMode(mode: TriggerTestMode) {
    void runAction('trigger-mode', () => window.bridge.setTriggerTestMode(mode));
  }

  function resetAdaptiveTriggers() {
    saveTriggerLabDraftToProfile(triggerLabDrafts.l2, false);
    saveTriggerLabDraftToProfile(triggerLabDrafts.r2, false);
    setTriggerLabActive({ l2: false, r2: false });
    void runAction('triggers-reset', () => window.bridge.resetAdaptiveTriggers());
  }

  function resetTriggerLab() {
    resetAdaptiveTriggers();
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

  function selectButtonRemappingProfile(profileId: string) {
    void runAction('remap-profile', () => window.bridge.selectButtonRemappingProfile(profileId));
  }

  function setButtonRemap(buttonId: RemapButtonId, targetId: RemapButtonId) {
    setRemapDraft((draft) => ({ ...draft, [buttonId]: targetId }));
    void runAction(`remap-${buttonId}`, () => window.bridge.setButtonRemap(buttonId, targetId));
  }

  function restoreButtonRemappingDefaults() {
    void runAction('remap-restore', () => window.bridge.restoreButtonRemappingDefaults());
  }

  function renameButtonRemappingProfile() {
    if (!selectedRemapProfile || selectedRemapProfileIsDefault) {
      return;
    }
    setRemapProfileNameDraft(selectedRemapProfile.name);
    setRemapProfileDialogMode('rename');
  }

  function saveButtonRemappingProfile() {
    setRemapProfileNameDraft(`Custom Profile ${snapshot?.settings.buttonRemappingProfiles.length ?? 1}`);
    setRemapProfileDialogMode('save');
  }

  function deleteButtonRemappingProfile() {
    if (!selectedRemapProfile || selectedRemapProfileIsDefault) {
      return;
    }
    setRemapProfileDialogMode('delete');
  }

  function closeRemapProfileDialog() {
    setRemapProfileDialogMode(null);
    setRemapProfileNameDraft('');
  }

  function submitRemapProfileDialog() {
    if (!selectedRemapProfile && remapProfileDialogMode !== 'save') {
      return;
    }
    if (remapProfileDialogMode === 'save') {
      const nextName = remapProfileNameDraft.trim();
      if (!nextName) {
        return;
      }
      closeRemapProfileDialog();
      void runAction('remap-save-profile', () => window.bridge.saveButtonRemappingProfile(nextName));
      return;
    }
    if (remapProfileDialogMode === 'rename' && selectedRemapProfile && !selectedRemapProfileIsDefault) {
      const nextName = remapProfileNameDraft.trim();
      if (!nextName || nextName === selectedRemapProfile.name) {
        closeRemapProfileDialog();
        return;
      }
      closeRemapProfileDialog();
      void runAction('remap-rename-profile', () => (
        window.bridge.renameButtonRemappingProfile(selectedRemapProfile.id, nextName)
      ));
      return;
    }
    if (remapProfileDialogMode === 'delete' && selectedRemapProfile && !selectedRemapProfileIsDefault) {
      closeRemapProfileDialog();
      void runAction('remap-delete-profile', () => window.bridge.deleteButtonRemappingProfile(selectedRemapProfile.id));
    }
  }

  function commitChordConfiguration(
    nextFunctions: ChordFunction[],
    nextAssignments: ChordAssignment[],
    _action = 'chords-save'
  ) {
    void runQuietAction(() => window.bridge.setChordConfiguration(nextFunctions, nextAssignments));
  }

  function createChordFunction() {
    const id = `function-${Date.now().toString(36)}`;
    const nextDraft: ChordFunctionDraft = {
      ...EMPTY_CHORD_FUNCTION_DRAFT,
      id,
      name: `Function ${chordFunctions.length + 1}`
    };
    const nextFunction = chordFunctionFromDraft(nextDraft);
    setSelectedChordFunctionId(id);
    setChordFunctionDraft(chordFunctionToDraft(nextFunction));
    commitChordConfiguration([...chordFunctions, nextFunction], chordAssignments, 'chords-create-function');
  }

  function commitChordFunctionDraft(nextDraft = chordFunctionDraft) {
    const nextFunction = chordFunctionFromDraft(nextDraft);
    const exists = chordFunctions.some((func) => func.id === nextFunction.id);
    const nextFunctions = exists
      ? chordFunctions.map((func) => (func.id === nextFunction.id ? nextFunction : func))
      : [...chordFunctions, nextFunction];
    setSelectedChordFunctionId(nextFunction.id);
    commitChordConfiguration(nextFunctions, chordAssignments, `chords-function-${nextFunction.id}`);
  }

  function setChordFunctionKeyboardKey(keyboardKey: string) {
    const nextDraft = { ...chordFunctionDraft, keyboardKey };
    setChordFunctionDraft(nextDraft);
    commitChordFunctionDraft(nextDraft);
  }

  function toggleChordFunctionKeyboardModifier(modifier: ChordKeyboardModifier) {
    const enabled = chordFunctionDraft.keyboardModifiers.includes(modifier);
    if (!enabled && chordFunctionDraft.keyboardModifiers.length >= MAX_KEYBOARD_FUNCTION_KEYS - 1) {
      return;
    }
    const keyboardModifiers = enabled
      ? chordFunctionDraft.keyboardModifiers.filter((candidate) => candidate !== modifier)
      : CHORD_KEYBOARD_MODIFIER_OPTIONS
        .map(([, candidate]) => candidate)
        .filter((candidate) => (
          candidate === modifier || chordFunctionDraft.keyboardModifiers.includes(candidate)
        ));
    const nextDraft = { ...chordFunctionDraft, keyboardModifiers };
    setChordFunctionDraft(nextDraft);
    commitChordFunctionDraft(nextDraft);
  }

  function setChordFunctionControllerAction(action: ChordControllerSettingAction) {
    const nextDraft = { ...chordFunctionDraft, controllerAction: action };
    setChordFunctionDraft(nextDraft);
    commitChordFunctionDraft(nextDraft);
  }

  function setChordFunctionControllerStepPercent(stepPercent: number) {
    const nextDraft = {
      ...chordFunctionDraft,
      controllerStepPercent: normalizeChordControllerSettingStepPercent(stepPercent)
    };
    setChordFunctionDraft(nextDraft);
    commitChordFunctionDraft(nextDraft);
  }

  function renderChordFunctionSummary(func: ChordFunction) {
    const notchTarget = func.type === 'controller-setting'
      ? chordNotchTargetForAction(func.action)
      : null;
    const detailLabel = func.type === 'keyboard'
      ? 'Keys'
      : notchTarget
        ? 'Adjustment'
        : 'Action';
    const detailValue = func.type === 'controller-setting' && notchTarget
      ? chordControllerSettingAdjustmentText(func.action)
      : chordFunctionSummary(func);

    return (
      <div className="chords-function-summary chords-function-summary-grouped">
        <div className="chords-function-summary-header">
          <span>Summary</span>
          {func.type === 'controller-setting' && notchTarget ? (
            <div className="chords-function-summary-options">
              <label className="chords-step-selector">
                <span>Step</span>
                <input
                  type="number"
                  min={CHORD_CONTROLLER_SETTING_STEP_MIN}
                  max={CHORD_CONTROLLER_SETTING_STEP_MAX}
                  step={1}
                  value={chordFunctionDraft.id === func.id ? chordFunctionDraft.controllerStepPercent : func.stepPercent}
                  disabled={pendingAction !== null}
                  aria-label={`${notchTarget.target.label} step percent`}
                  onChange={(event) => {
                    const nextValue = normalizeChordControllerSettingStepPercent(event.target.value);
                    setChordFunctionDraft((draft) => ({ ...draft, controllerStepPercent: nextValue }));
                  }}
                  onBlur={(event) => {
                    setChordFunctionControllerStepPercent(Number(event.currentTarget.value));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.currentTarget.blur();
                    }
                  }}
                />
                <small>%</small>
              </label>
              <div className="dual-selector chords-notch-direction-selector" role="group" aria-label={`${notchTarget.target.label} direction`}>
                <button
                  type="button"
                  className={notchTarget.direction === 'down' ? 'active' : ''}
                  title={`Decrease ${notchTarget.target.label}`}
                  aria-label={`Decrease ${notchTarget.target.label}`}
                  disabled={pendingAction !== null}
                  onClick={() => setChordFunctionControllerAction(notchTarget.target.downAction)}
                >
                  <Minus size={15} />
                </button>
                <button
                  type="button"
                  className={notchTarget.direction === 'up' ? 'active' : ''}
                  title={`Increase ${notchTarget.target.label}`}
                  aria-label={`Increase ${notchTarget.target.label}`}
                  disabled={pendingAction !== null}
                  onClick={() => setChordFunctionControllerAction(notchTarget.target.upAction)}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
          ) : null}
        </div>
        <div className="chords-function-summary-detail">
          <div className="chords-function-summary-detail-row">
            <span>Type</span>
            <strong>{chordFunctionTypeLabel(func.type)}</strong>
          </div>
          <div className="chords-function-summary-detail-row">
            <span>{detailLabel}</span>
            <strong>
              {detailValue}
              {func.type === 'controller-setting' && notchTarget ? (
                <em> — {func.stepPercent}% step</em>
              ) : null}
            </strong>
          </div>
        </div>
      </div>
    );
  }

  function openChordFunctionDialog(mode: ChordFunctionDialogMode) {
    if (!selectedChordFunction) {
      return;
    }
    setChordFunctionNameDraft(selectedChordFunction.name);
    setChordFunctionDialog({ mode, functionId: selectedChordFunction.id });
  }

  function closeChordFunctionDialog() {
    setChordFunctionDialog(null);
    setChordFunctionNameDraft('');
  }

  function deleteChordFunction(functionId: string) {
    const nextFunctions = chordFunctions.filter((func) => func.id !== functionId);
    const nextAssignments = chordAssignments.filter((assignment) => assignment.functionId !== functionId);
    const nextSelected = nextFunctions[0] ?? null;
    setSelectedChordFunctionId(nextSelected?.id ?? '');
    setChordFunctionDraft(chordFunctionToDraft(nextSelected));
    setChordAssignmentDraftRows((rows) => rows.filter((row) => row.functionId !== functionId));
    commitChordConfiguration(nextFunctions, nextAssignments, `chords-delete-function-${functionId}`);
  }

  function submitChordFunctionDialog() {
    if (!chordFunctionDialog) {
      return;
    }
    const current = chordFunctions.find((func) => func.id === chordFunctionDialog.functionId);
    if (!current) {
      closeChordFunctionDialog();
      return;
    }
    if (chordFunctionDialog.mode === 'delete') {
      deleteChordFunction(current.id);
      closeChordFunctionDialog();
      return;
    }
    const nextName = chordFunctionNameDraft.trim().slice(0, MAX_CHORD_FUNCTION_NAME_LENGTH);
    if (!nextName || nextName === current.name) {
      closeChordFunctionDialog();
      return;
    }
    const nextFunction = { ...current, name: nextName };
    const nextFunctions = chordFunctions.map((func) => (func.id === current.id ? nextFunction : func));
    setSelectedChordFunctionId(current.id);
    setChordFunctionDraft(chordFunctionToDraft(nextFunction));
    commitChordConfiguration(nextFunctions, chordAssignments, `chords-rename-function-${current.id}`);
    closeChordFunctionDialog();
  }

  function commitChordAssignment(nextAssignment: ChordAssignment, replaceAssignmentId?: string) {
    const replacingExisting = replaceAssignmentId
      ? chordAssignments.some((assignment) => assignment.id === replaceAssignmentId)
      : false;
    if (!replacingExisting && chordAssignments.length >= MAX_CHORD_ASSIGNMENTS) {
      return;
    }
    const nextAssignments = replacingExisting
      ? chordAssignments.map((assignment) => (
        assignment.id === replaceAssignmentId ? nextAssignment : assignment
      ))
      : [...chordAssignments, nextAssignment];
    commitChordConfiguration(chordFunctions, nextAssignments, `chords-assignment-${nextAssignment.id}`);
  }

  function addChordAssignmentDraft() {
    if (!canAddChordDraft) {
      return;
    }
    setChordAssignmentDraftRows((rows) => [
      ...rows,
      {
        id: `draft-${Date.now().toString(36)}-${rows.length}`,
        starter: chordStarterOptions[0]?.[1] ?? 'ps',
        button: null,
        functionId: defaultChordFunctionId
      }
    ]);
  }

  function commitChordAssignmentDraft(row: ChordAssignmentDraftRow, button: ChordAssignableButtonId) {
    if (!row.functionId || !isChordBindingAllowed(row.starter, button)) {
      return;
    }
    const nextAssignment: ChordAssignment = {
      id: createChordAssignmentId(row.starter, button),
      kind: 'chord',
      starter: row.starter,
      button,
      functionId: row.functionId
    };
    setChordAssignmentDraftRows((rows) => rows.filter((draft) => draft.id !== row.id));
    commitChordAssignment(nextAssignment);
  }

  function updateChordAssignmentDraftStarter(rowId: string, starter: ChordStarterId) {
    setChordAssignmentDraftRows((rows) => rows.map((row) => (
      row.id === rowId
        ? {
          ...row,
          starter,
          button: row.button && isChordBindingAllowed(starter, row.button) ? row.button : null
        }
        : row
    )));
  }

  function updateChordAssignmentDraftButton(rowId: string, button: ChordButtonSelectValue) {
    if (button === CHORD_UNASSIGNED_BUTTON) {
      return;
    }
    const row = chordAssignmentDraftRows.find((draft) => draft.id === rowId);
    if (row) {
      commitChordAssignmentDraft(row, button);
    }
  }

  function updateChordAssignmentDraftFunction(rowId: string, functionId: string) {
    setChordAssignmentDraftRows((rows) => rows.map((row) => (
      row.id === rowId ? { ...row, functionId } : row
    )));
  }

  function deleteChordAssignmentDraft(rowId: string) {
    setChordAssignmentDraftRows((rows) => rows.filter((row) => row.id !== rowId));
  }

  function updateChordAssignmentStarter(assignmentId: string, starter: ChordStarterId) {
    const current = chordAssignments.find((assignment) => assignment.id === assignmentId);
    if (!current) {
      return;
    }
    const button = isChordBindingAllowed(starter, current.button)
      ? current.button
      : firstAllowedChordButton(starter);
    if (!button) {
      return;
    }
    commitChordAssignment({
      ...current,
      starter,
      button
    }, assignmentId);
  }

  function updateChordAssignmentButton(assignmentId: string, button: ChordButtonSelectValue) {
    if (button === CHORD_UNASSIGNED_BUTTON) {
      return;
    }
    const current = chordAssignments.find((assignment) => assignment.id === assignmentId);
    if (!current || !isChordBindingAllowed(current.starter, button)) {
      return;
    }
    commitChordAssignment({
      ...current,
      button
    }, assignmentId);
  }

  function setChordAssignmentFunction(assignmentId: string, functionId: string) {
    const current = chordAssignments.find((assignment) => assignment.id === assignmentId);
    if (!current) {
      return;
    }
    commitChordAssignment({
      ...current,
      functionId
    }, assignmentId);
  }

  function deleteChordAssignment(assignmentId: string) {
    const nextAssignments = chordAssignments.filter((assignment) => assignment.id !== assignmentId);
    commitChordConfiguration(chordFunctions, nextAssignments, `chords-delete-assignment-${assignmentId}`);
  }

  function updateChordAssignmentScrollbar() {
    const list = chordAssignmentListRef.current;
    if (!list) {
      return;
    }
    const maxScroll = list.scrollHeight - list.clientHeight;
    if (maxScroll <= 1) {
      setChordAssignmentScrollbar((current) => (
        current.visible ? { visible: false, top: 0, height: 0 } : current
      ));
      return;
    }
    const trackHeight = list.clientHeight;
    const height = Math.max(30, Math.round((list.clientHeight / list.scrollHeight) * trackHeight));
    const top = Math.round((list.scrollTop / maxScroll) * (trackHeight - height));
    setChordAssignmentScrollbar((current) => (
      current.visible && current.top === top && current.height === height
        ? current
        : { visible: true, top, height }
    ));
  }

  function startChordAssignmentScrollbarDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const list = chordAssignmentListRef.current;
    if (!list || !chordAssignmentScrollbar.visible || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startScrollTop = list.scrollTop;
    const maxScroll = list.scrollHeight - list.clientHeight;
    const thumbTravel = list.clientHeight - chordAssignmentScrollbar.height;
    const move = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault();
      list.scrollTop = startScrollTop + ((moveEvent.clientY - startY) / thumbTravel) * maxScroll;
    };
    const finish = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  function reorderChordAssignment(sourceId: string, targetId: string, placement: 'before' | 'after') {
    if (sourceId === targetId) {
      return;
    }
    const sourceIndex = chordAssignments.findIndex((assignment) => assignment.id === sourceId);
    if (sourceIndex === -1 || !chordAssignments.some((assignment) => assignment.id === targetId)) {
      return;
    }
    const nextAssignments = [...chordAssignments];
    const [moved] = nextAssignments.splice(sourceIndex, 1);
    if (!moved) {
      return;
    }
    const targetIndex = nextAssignments.findIndex((assignment) => assignment.id === targetId);
    if (targetIndex === -1) {
      return;
    }
    nextAssignments.splice(placement === 'after' ? targetIndex + 1 : targetIndex, 0, moved);
    commitChordConfiguration(chordFunctions, nextAssignments, `chords-reorder-assignment-${sourceId}`);
  }

  function setChordAssignmentDragDropHint(nextHint: ChordAssignmentDropHint | null) {
    const session = chordAssignmentDragRef.current;
    if (session) {
      session.dropHint = nextHint;
    }
    setChordAssignmentDropHint((current) => (
      current?.targetId === nextHint?.targetId && current?.placement === nextHint?.placement
        ? current
        : nextHint
    ));
  }

  function createChordAssignmentDragOverlay(sourceRow: HTMLDivElement): HTMLElement {
    const overlay = sourceRow.cloneNode(true) as HTMLElement;
    const rect = sourceRow.getBoundingClientRect();
    overlay.classList.add('chords-assignment-drag-overlay');
    overlay.classList.remove('dragging', 'drop-before', 'drop-after');
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    (sourceRow.closest<HTMLElement>('.shell') ?? document.body).appendChild(overlay);
    return overlay;
  }

  function moveChordAssignmentDragOverlay(session: ChordAssignmentDragSession, clientX: number, clientY: number) {
    if (!session.overlay) {
      return;
    }
    session.overlay.style.transform = `translate3d(${clientX - session.offsetX}px, ${clientY - session.offsetY}px, 0) scale(1.01)`;
  }

  function updateChordAssignmentDropTarget(sourceId: string, _clientX: number, clientY: number) {
    const list = chordAssignmentListRef.current;
    if (!list) {
      setChordAssignmentDragDropHint(null);
      return;
    }
    const rows = Array.from(
      list.querySelectorAll<HTMLElement>('.chords-assignment-row[data-assignment-id]:not(.draft)')
    ).filter((row) => row.dataset.assignmentId !== sourceId);
    if (rows.length === 0) {
      setChordAssignmentDragDropHint(null);
      return;
    }
    let nearest: { targetId: string; placement: 'before' | 'after'; distance: number } | null = null;
    for (const row of rows) {
      const targetId = row.dataset.assignmentId;
      if (!targetId) {
        continue;
      }
      const rect = row.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const placement = clientY > centerY ? 'after' : 'before';
      const edgeY = placement === 'after' ? rect.bottom : rect.top;
      const distance = Math.abs(clientY - edgeY);
      if (!nearest || distance < nearest.distance) {
        nearest = { targetId, placement, distance };
      }
    }
    setChordAssignmentDragDropHint(nearest && {
      targetId: nearest.targetId,
      placement: nearest.placement
    });
  }

  function finishChordAssignmentPointerDrag(cancelled = false) {
    const session = chordAssignmentDragRef.current;
    if (!session) {
      return;
    }
    session.cleanup();
    session.overlay?.remove();
    document.body.classList.remove('chords-assignment-pointer-dragging');
    chordAssignmentDragRef.current = null;
    setDraggedChordAssignmentId(null);
    setChordAssignmentDropHint(null);
    if (!cancelled && session.active && session.dropHint) {
      reorderChordAssignment(session.id, session.dropHint.targetId, session.dropHint.placement);
    }
    if (session.active) {
      window.addEventListener('click', (clickEvent) => {
        clickEvent.preventDefault();
        clickEvent.stopPropagation();
      }, { capture: true, once: true });
    }
  }

  function startChordAssignmentPointerDrag(event: ReactPointerEvent<HTMLDivElement>, assignmentId: string) {
    if (pendingAction !== null || event.button !== 0 || chordAssignmentDragRef.current) {
      return;
    }
    const sourceRow = event.currentTarget;
    const rect = sourceRow.getBoundingClientRect();
    const session: ChordAssignmentDragSession = {
      active: false,
      id: assignmentId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      overlay: null,
      startX: event.clientX,
      startY: event.clientY,
      cleanup: () => undefined,
      dropHint: null
    };
    const activate = (clientX: number, clientY: number) => {
      if (session.active) {
        return;
      }
      session.active = true;
      session.overlay = createChordAssignmentDragOverlay(sourceRow);
      document.body.classList.add('chords-assignment-pointer-dragging');
      setDraggedChordAssignmentId(assignmentId);
      moveChordAssignmentDragOverlay(session, clientX, clientY);
    };
    const move = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - session.startX;
      const deltaY = moveEvent.clientY - session.startY;
      if (!session.active && Math.hypot(deltaX, deltaY) < 5) {
        return;
      }
      activate(moveEvent.clientX, moveEvent.clientY);
      moveEvent.preventDefault();
      moveChordAssignmentDragOverlay(session, moveEvent.clientX, moveEvent.clientY);
      updateChordAssignmentDropTarget(assignmentId, moveEvent.clientX, moveEvent.clientY);
    };
    const end = () => finishChordAssignmentPointerDrag(false);
    const cancel = () => finishChordAssignmentPointerDrag(true);
    const keyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === 'Escape') {
        finishChordAssignmentPointerDrag(true);
      }
    };
    session.cleanup = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', keyDown);
    };
    chordAssignmentDragRef.current = session;
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', keyDown);
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

  function toggleSpeakerEnabled() {
    if (!snapshot) return;
    void runAction('speaker-enabled', () => window.bridge.setSpeakerEnabled(!snapshot.settings.speakerEnabled));
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

  function toggleAudioEnabled() {
    if (!snapshot) return;
    const enabled = !(snapshot.settings.speakerEnabled || snapshot.settings.duplexMicEnabled);
    void runAction('audio-enabled', async () => {
      let next = snapshot;
      if (next.settings.speakerEnabled !== enabled) {
        next = await window.bridge.setSpeakerEnabled(enabled);
      }
      if (!enabled && next.settings.duplexMicEnabled) {
        next = await window.bridge.setDuplexMicEnabled(false);
      }
      return next;
    });
  }

  function toggleDuplexMicEnabled() {
    if (!snapshot) return;
    void runAction('duplex-mic-enabled', () => (
      window.bridge.setDuplexMicEnabled(!snapshot.settings.duplexMicEnabled)
    ));
  }

  function toggleMicMute() {
    if (!snapshot) return;
    void runAction('mic-mute', () => window.bridge.setMicMute(!snapshot.settings.micMuted));
  }

  function toggleAdaptiveTriggersEnabled() {
    if (!snapshot) return;
    void runAction('triggers-enabled', () => (
      window.bridge.setAdaptiveTriggersEnabled(!snapshot.settings.adaptiveTriggersEnabled)
    ));
  }

  function toggleLightbarEnabled() {
    if (!snapshot) return;
    void runAction('lightbar-enabled', () => window.bridge.setLightbarEnabled(!snapshot.settings.lightbarEnabled));
  }

  function focusBridgeSettings(target: SettingsFocusTarget) {
    setShowNotificationsMenu(false);
    setShowBridgeSettings(true);
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
    setShowBridgeSettings(false);
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
    setShowCustomColorPicker(false);
    setShowBridgeSettings(false);
    setShowNotificationsMenu(false);
    setActiveControlTab(tab);
  }

  function renderTriggerLabCard(side: TriggerLabSide) {
    const draft = triggerLabDrafts[side];
    const label = side === 'l2' ? 'Left Trigger' : 'Right Trigger';
    const glyphUrl = side === 'l2' ? l2GlyphUrl : r2GlyphUrl;
    const targetLabel = side.toUpperCase();
    const active = triggerLabActiveForSide(side);
    const labActionDisabled = !connected
      || !adaptiveTriggersSupported
      || !adaptiveTriggersEnabled
      || pendingAction !== null;
    const activeDisabled = labActionDisabled || (!active && draft.forcePercent <= 0);
    const previewDisabled = labActionDisabled
      || triggerTestLocked
      || adaptiveTriggerOutputActive
      || Boolean(snapshot.status?.testAdaptiveTriggersBusy);

    return (
      <section className="feature-card trigger-lab-card trigger-lab-trigger-card" key={side}>
        <div className="feature-card-title">
          <button
            type="button"
            className={`feature-icon triggers-enable-button trigger-lab-trigger-badge ${active ? 'active' : ''}`}
            aria-pressed={active}
            aria-label={`${label} persistent lab effect`}
            disabled={activeDisabled}
            onClick={() => toggleTriggerLabActive(side, !active)}
          >
            <span
              className="trigger-lab-trigger-glyph"
              style={{
                WebkitMaskImage: `url("${glyphUrl}")`,
                maskImage: `url("${glyphUrl}")`
              } as CSSProperties}
            />
          </button>
          <div className="title-copy">
            <h3>{label}</h3>
            <p>Shape the {targetLabel} trigger feel</p>
          </div>
          <div className="inline-switch trigger-lab-card-active">
            <span>Active</span>
            <button
              type="button"
              role="switch"
              aria-checked={active}
              aria-label={`${label} persistent lab effect`}
              className={`switch trigger-lab-active-switch ${active ? 'on' : ''}`}
              disabled={activeDisabled}
              onClick={() => toggleTriggerLabActive(side, !active)}
            >
              <span />
            </button>
          </div>
        </div>
        <div className="trigger-lab-editor">
          <div className="trigger-lab-profile-row">
            <CustomSelect
              value={draft.profileId}
              options={triggerLabProfileOptions}
              ariaLabel={`${label} lab profile`}
              className="trigger-lab-profile-select"
              closeOnSelect={false}
              floatingMenu
              suspendOutsideClose={triggerLabProfileDialog?.side === side}
              onChange={(profileId) => setTriggerLabProfile(side, profileId)}
              renderMenuFooter={() => {
                const customProfile = triggerLabProfileIsCustom(draft.profileId);
                return (
                  <div className="trigger-lab-profile-actions">
                    <button
                      type="button"
                      aria-label="Save new trigger profile"
                      title="Save New"
                      onClick={() => {
                        openTriggerLabProfileDialog('save', side);
                      }}
                    >
                      <Save size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="Rename trigger profile"
                      title="Rename"
                      disabled={!customProfile}
                      onClick={() => {
                        openTriggerLabProfileDialog('rename', side);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete trigger profile"
                      title="Delete"
                      disabled={!customProfile}
                      onClick={() => {
                        openTriggerLabProfileDialog('delete', side);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              }}
            />
            <button
              type="button"
              className={`trigger-lab-chip compact ${triggerLabLinked ? 'active' : ''}`}
              aria-pressed={triggerLabLinked}
              onClick={() => toggleTriggerLabLinked(side)}
            >
              {triggerLabLinked ? <LinkIcon size={13} /> : <LinkOffIcon size={13} />}
              <span className="trigger-lab-chip-label">{triggerLabLinked ? 'Linked' : 'Split'}</span>
            </button>
          </div>
          <div className="trigger-lab-mode-grid">
            {TRIGGER_TEST_MODE_OPTIONS.map(([modeLabel, mode]) => (
              <button
                key={mode}
                type="button"
                className={`trigger-lab-mode-button ${draft.mode === mode ? 'active' : ''}`}
                onClick={() => setTriggerLabMode(side, mode)}
              >
                {modeLabel}
              </button>
            ))}
          </div>
          <div className="trigger-lab-meter-row">
            <span>Start</span>
            <TriggerLabMeter
              label={`${label} start`}
              value={draft.startPercent}
              onChange={(value) => setTriggerLabPercent(side, 'startPercent', value)}
              onCommit={(value) => commitTriggerLabPercent(side, 'startPercent', value)}
            />
            <strong>{draft.startPercent}%</strong>
          </div>
          <div className="trigger-lab-meter-row">
            <span>Wall</span>
            <TriggerLabMeter
              label={`${label} wall`}
              value={draft.wallPercent}
              onChange={(value) => setTriggerLabPercent(side, 'wallPercent', value)}
              onCommit={(value) => commitTriggerLabPercent(side, 'wallPercent', value)}
            />
            <strong>{draft.wallPercent}%</strong>
          </div>
          <div className="trigger-lab-meter-row">
            <span>Force</span>
            <TriggerLabMeter
              label={`${label} force`}
              value={draft.forcePercent}
              onChange={(value) => setTriggerLabPercent(side, 'forcePercent', value)}
              onCommit={(value) => commitTriggerLabPercent(side, 'forcePercent', value)}
            />
            <strong>{draft.forcePercent}%</strong>
          </div>
          <div className="trigger-lab-button-row two-up">
            <button type="button" disabled={previewDisabled} onClick={() => previewTriggerLab(side)}>
              <Play size={14} /> Preview
            </button>
            <button type="button" disabled={labActionDisabled} onClick={resetTriggerLab}>
              <RefreshCcw size={14} /> Reset
            </button>
          </div>
        </div>
      </section>
    );
  }

  const activeTheme = snapshot?.settings.uiThemePreset ?? startupTheme;

  if (!snapshot || startupVisible) {
    return (
      <div className="shell loading" data-theme={activeTheme}>
        <StartupScreen ready={Boolean(snapshot)} />
      </div>
    );
  }

  const kofiBadgeUrl = UI_THEME_KOFI_BADGES[activeTheme] ?? UI_THEME_KOFI_BADGES[DEFAULT_UI_THEME_PRESET];

  return (
    <div
      className={[
        'shell',
        windowDragging ? 'window-dragging' : '',
        controllerControlsAvailable ? '' : 'controller-unavailable'
      ].filter(Boolean).join(' ')}
      data-theme={activeTheme}
    >
      <div
        className="window-bar"
        onMouseDown={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest('.bridge-tools') || target.closest('.window-actions')) {
            return;
          }
          setShowBridgeSettings(false);
          setShowNotificationsMenu(false);
          if (event.button === 0) {
            beginWindowDrag();
          }
        }}
      >
        <span className="bridge-wordmark" aria-label="DS5 Bridge">
          <BridgeMark />
          <span className="bridge-wordmark-ds">DS5</span>
          <span className="bridge-wordmark-name">Bridge</span>
        </span>
        <div className="topbar-right">
          <div className="bridge-tools">
            <div className="notifications-control" ref={notificationsRef}>
              <button
                className={`topbar-tool notification-tool ${showNotificationsMenu ? 'active' : ''} ${notificationsEnabled ? 'armed' : ''}`}
                type="button"
                aria-label="Notifications"
                aria-haspopup="menu"
                aria-expanded={showNotificationsMenu}
                onClick={() => setShowNotificationsMenu((value) => !value)}
              >
                <Bell size={18} />
              </button>
              {showNotificationsMenu && (
                <div className="settings-menu notifications-menu" role="menu" aria-label="Notifications">
                  <div className="settings-menu-heading">
                    <Bell size={16} />
                    <span>Notifications</span>
                  </div>
                  <div className={`settings-menu-row ${notificationFocusTarget === 'controller-status' || notificationFocusTarget === 'all' ? 'settings-menu-row-highlight' : ''}`}>
                    <div>
                      <strong>Controller Status</strong>
                      <span>Toast when the controller connects or disconnects</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={controllerToastEnabled}
                      className={`switch ${controllerToastEnabled ? 'on' : ''}`}
                      disabled={pendingAction !== null}
                      onClick={toggleControllerNotifications}
                    >
                      <span />
                    </button>
                  </div>
                  <div className={`settings-menu-row ${notificationFocusTarget === 'low-battery' || notificationFocusTarget === 'all' ? 'settings-menu-row-highlight' : ''}`}>
                    <div>
                      <strong>Low Battery</strong>
                      <span>Toast when battery reaches 20% or below</span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={lowBatteryToastEnabled}
                      className={`switch ${lowBatteryToastEnabled ? 'on' : ''}`}
                      disabled={pendingAction !== null}
                      onClick={toggleLowBatteryNotifications}
                    >
                      <span />
                    </button>
                  </div>
                  <div className="settings-menu-action">
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={pendingAction !== null}
                      onClick={testNotifications}
                    >
                      Test Toast
                    </button>
                  </div>
                </div>
              )}
            </div>
            <span className="bridge-tool-divider" aria-hidden="true" />
          </div>
          <div className="window-actions">
            <button type="button" title="Minimize" onClick={() => void window.bridge.minimizeWindow()}>
              <Minus size={16} />
            </button>
            <button type="button" title="Hide to tray" onClick={() => void window.bridge.hideWindow()}>
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      <main className="app-content">
        <section className={`hero-card status-${statusTone}`}>
          <div className="sidebar-section-label">Device</div>
          <div className={`hero-main device-status-${sidebarDeviceTone}`}>
            <img className="controller-art" src={controllerImage} alt="" />
            <div className="status-copy">
              <div className="connection-row">
                <strong>{sidebarDeviceTitle}</strong>
              </div>
              <div className="bridge-state compact-device-status">
                <span>{sidebarDeviceStatus}</span>
              </div>
              <div className="battery-row compact-battery-row">
                {connected && controllerConnected && (
                  <span
                    className={`battery-icon ${batteryLevelTone} ${batteryCharging ? 'charging' : ''}`}
                    aria-hidden="true"
                  >
                    {[0, 1, 2].map((segment) => (
                      <span
                        key={segment}
                        className={[
                          segment < batterySegmentCount ? 'active' : '',
                          segment === batteryChargingSegment ? 'charging-segment' : '',
                          segment === 0 && batteryCritical ? 'critical-segment' : ''
                        ].filter(Boolean).join(' ')}
                      />
                    ))}
                  </span>
                )}
                <span>{sidebarBatteryLabel}</span>
              </div>
            </div>
          </div>
          <div className="sidebar-section-label">Controls</div>
          <div className="sidebar-controls">
            <div className="control-tabs" role="tablist" aria-label="Controls">
              {CONTROL_TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  id={`control-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeControlTab === id}
                  aria-controls={`control-panel-${id}`}
                  className={activeControlTab === id ? 'active' : ''}
                  onClick={() => selectControlTab(id)}
                >
                  <Icon size={18} stroke={2} />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="sidebar-actions">
            <div className="sidebar-support">
              <button
                className="sidebar-kofi-link"
                type="button"
                aria-label="Support SundayMoments on Ko-fi"
                onClick={() => void window.bridge.openExternal('https://ko-fi.com/sundaymoments')}
              >
                <img className="sidebar-kofi-badge" src={kofiBadgeUrl} alt="" />
              </button>
            </div>
            <div className="header-settings">
              <button
                className={`sidebar-action-button ${showBridgeSettings ? 'active' : ''}`}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={showBridgeSettings}
                onClick={() => setShowBridgeSettings((value) => !value)}
              >
                <SettingsIcon size={18} />
                <span>Settings</span>
              </button>
              <button
                className={`sidebar-action-button ${activeControlTab === 'chords' ? 'active' : ''}`}
                id="control-tab-chords"
                type="button"
                aria-controls="control-panel-chords"
                aria-selected={activeControlTab === 'chords'}
                onClick={() => selectControlTab('chords')}
              >
                <IconReplace size={18} />
                <span>Chords</span>
              </button>
            </div>
          </div>
        </section>

      <section className="control-panel flat-control-panel">
        <div className="control-pages">
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
              <span className={`overview-health health-label ${overviewHealthTone}`}>
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
                    disabled={testSpeakerUnavailable}
                    onClick={runTestSpeaker}
                  >
                    <Volume2 size={15} />
                    Test Speaker
                  </button>
                  <button
                    type="button"
                    disabled={testMicUnavailable}
                    onClick={runTestMic}
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
                        <span>{label}</span>
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
                  <label className={`overview-slider-row ${(!connected || !speakerVolumeSupported || !snapshot.settings.speakerEnabled || speakerVolumeCommitPending) ? 'disabled' : ''}`}>
                    <span>Speaker</span>
                    <div className="overview-range-control">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step={SPEAKER_VOLUME_STEP}
                        value={speakerVolumeValue}
                        disabled={!connected || !speakerVolumeSupported || !snapshot.settings.speakerEnabled || speakerVolumeCommitPending}
                        style={{ '--range-fill': `${speakerVolumeValue}%` } as CSSProperties}
                        onPointerDown={() => {
                          speakerVolumeEditingRef.current = true;
                        }}
                        onChange={(event) => setSpeakerVolumeValue(snapSpeakerVolume(Number(event.currentTarget.value)))}
                        onPointerUp={() => void commitSpeakerVolume()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            speakerVolumeEditingRef.current = true;
                          }
                        }}
                        onKeyUp={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            void commitSpeakerVolume();
                          }
                        }}
                        onBlur={() => void commitSpeakerVolume()}
                      />
                      <div className="overview-range-ticks" aria-hidden="true">
                        {PERCENT_SLIDER_TICKS.map((value) => (
                          <span key={value} className={sliderTickClass(value, 100)} />
                        ))}
                      </div>
                    </div>
                    <strong>{speakerVolumeValue}%</strong>
                  </label>
                  <label className={`overview-slider-row ${(!connected || !duplexMicEnabled || micVolumeCommitPending) ? 'disabled' : ''}`}>
                    <span>Mic</span>
                    <div className="overview-range-control">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step={MIC_VOLUME_STEP}
                        value={micVolumeValue}
                        disabled={!connected || !duplexMicEnabled || micVolumeCommitPending}
                        style={{ '--range-fill': `${micVolumeValue}%` } as CSSProperties}
                        onPointerDown={() => {
                          micVolumeEditingRef.current = true;
                        }}
                        onChange={(event) => setMicVolumeValue(snapMicVolume(Number(event.currentTarget.value)))}
                        onPointerUp={() => void commitMicVolume()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            micVolumeEditingRef.current = true;
                          }
                        }}
                        onKeyUp={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            void commitMicVolume();
                          }
                        }}
                        onBlur={() => void commitMicVolume()}
                      />
                      <div className="overview-range-ticks" aria-hidden="true">
                        {PERCENT_SLIDER_TICKS.map((value) => (
                          <span key={value} className={sliderTickClass(value, 100)} />
                        ))}
                      </div>
                    </div>
                    <strong>{micVolumeValue}%</strong>
                  </label>
                  <label className={`overview-slider-row ${(!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled || lightbarCommitPending) ? 'disabled' : ''}`}>
                    <span>Lightbar</span>
                    <div className="overview-range-control">
                      <input
                        type="range"
                        min="0"
                        max={percentSliderMax}
                        step={LIGHTBAR_BRIGHTNESS_STEP}
                        value={lightbarBrightnessValue}
                        disabled={!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled || lightbarCommitPending}
                        style={{ '--range-fill': `${(lightbarBrightnessValue / percentSliderMax) * 100}%` } as CSSProperties}
                        onPointerDown={() => {
                          lightbarBrightnessEditingRef.current = true;
                        }}
                        onChange={(event) => setLightbarBrightnessValue(snapLightbarBrightness(Number(event.currentTarget.value)))}
                        onPointerUp={() => void commitLightbar()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            lightbarBrightnessEditingRef.current = true;
                          }
                        }}
                        onKeyUp={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            void commitLightbar();
                          }
                        }}
                        onBlur={() => void commitLightbar()}
                      />
                      <div className="overview-range-ticks" aria-hidden="true">
                        {PERCENT_SLIDER_TICKS.map((value) => (
                          <span key={value} className={sliderTickClass(value, 100)} />
                        ))}
                      </div>
                    </div>
                    <strong>{lightbarBrightnessValue}%</strong>
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

          <div
            className={`control-page haptics-page ${activeControlTab === 'haptics' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-haptics"
            aria-labelledby="control-tab-haptics"
            aria-hidden={activeControlTab !== 'haptics'}
          >
              <div className="feature-heading">
                <div>
                  <h2>{audioHapticsOpen ? 'Audio Haptics' : 'Haptics'}</h2>
                  <p>{audioHapticsOpen ? 'Turn system audio into haptic feedback.' : 'Adjust controller haptic feedback and run a quick test.'}</p>
                </div>
                <div className="audio-heading-controls">
                  <div className="inline-switch audio-haptics-switch-control">
                    {audioReactiveHapticsModeBadgeLabel ? (
                      <span className={`inline-state-badge audio-haptics-mode-state ${audioReactiveHapticsOverrideMode ? 'warn' : 'retry'}`}>
                        {audioReactiveHapticsModeBadgeLabel}
                      </span>
                    ) : null}
                    <span>Audio Haptics</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={audioHapticsOpen}
                      aria-label={audioHapticsOpen ? 'Exit Audio Haptics' : 'Enter Audio Haptics'}
                      className={`switch audio-haptics-switch ${audioHapticsOpen ? 'on' : ''}`}
                      onClick={() => setAudioHapticsOpen((open) => !open)}
                    >
                      <span />
                    </button>
                    {audioReactiveHapticsModeBadgeLabel ? (
                      <span className="settings-shortcut-tooltip shortcut-glyph-tooltip audio-haptics-mode-tooltip">
                        {audioReactiveHapticsModeTooltip}
                      </span>
                    ) : null}
                  </div>
                  <div className="inline-switch">
                    <span>Enabled</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={activeHapticsFeatureEnabled}
                      className={`switch ${activeHapticsFeatureEnabled ? 'on' : ''}`}
                      disabled={!controllerControlsAvailable || pendingAction !== null}
                      onClick={showClassicRumbleControl ? toggleClassicRumbleEnabled : toggleHapticsEnabled}
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
                        onClick={toggleAudioReactiveHapticsEnabled}
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

          <div
            className={`control-page audio-page ${activeControlTab === 'audio' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-audio"
            aria-labelledby="control-tab-audio"
            aria-hidden={activeControlTab !== 'audio'}
          >
              <div className="feature-heading">
                <div>
                  <h2>Audio</h2>
                  <p>{`Adjust controller ${outputControlLower} and microphone levels.`}</p>
                </div>
                <div className="audio-heading-actions">
                  <div className="chords-field chords-inline-field audio-speaker-gain-field">
                    <span>Speaker Gain</span>
                    <CustomSelect
                      value={speakerGainLevel}
                      options={SPEAKER_GAIN_OPTIONS}
                      disabled={!controllerControlsAvailable || !speakerVolumeSupported || pendingAction !== null}
                      ariaLabel="Speaker gain"
                      className="audio-speaker-gain-select"
                      closeOnSelect={true}
                      onChange={setSpeakerGainLevel}
                      renderValue={(_label, value) => (
                        <span>{value}</span>
                      )}
                      renderOption={(label) => (
                        <span className="speaker-gain-option">
                          <strong>{label}</strong>
                        </span>
                      )}
                    />
                  </div>
                  <div className="audio-heading-controls">
                    <div className="inline-switch">
                      <span>Enabled</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={audioEnabled}
                        aria-label="Enable audio"
                        className={`switch ${audioEnabled ? 'on' : ''}`}
                        disabled={!controllerControlsAvailable || pendingAction !== null}
                        onClick={toggleAudioEnabled}
                      >
                        <span />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="feature-card-grid">
                <section className="feature-card preset-card">
                  <div className="feature-card-title">
                    <button
                      type="button"
                      className={`feature-icon audio-enable-button icon-medium ${
                        showMicrophoneControl
                          ? duplexMicEnabled
                            ? 'active'
                            : ''
                          : snapshot.settings.speakerEnabled
                            ? 'active'
                            : ''
                      }`}
                      aria-pressed={showMicrophoneControl ? duplexMicEnabled : snapshot.settings.speakerEnabled}
                      aria-label={showMicrophoneControl ? duplexMicLabel : `Enable controller ${outputControlLower}`}
                      title={showMicrophoneControl ? duplexMicLabel : `Enable controller ${outputControlLower}`}
                      disabled={
                        showMicrophoneControl
                          ? !controllerControlsAvailable || pendingAction !== null
                          : !controllerControlsAvailable || !speakerVolumeSupported || pendingAction !== null
                      }
                      onClick={showMicrophoneControl ? toggleDuplexMicEnabled : toggleSpeakerEnabled}
                    >
                      {showMicrophoneControl ? <Mic size={20} /> : <OutputIcon size={20} />}
                    </button>
                    <div className="title-copy">
                      <h3>{showMicrophoneControl ? 'Microphone' : outputControlLabel}</h3>
                      <p>
                        {showMicrophoneControl
                          ? 'Microphone level'
                          : `${outputControlLabel} level`}
                      </p>
                    </div>
                    <div className="dual-selector audio-mode-selector" role="tablist" aria-label="Audio control mode">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={!showMicrophoneControl}
                        className={!showMicrophoneControl ? 'active' : ''}
                        onClick={() => setShowMicrophoneControl(false)}
                      >
                        {outputControlLabel}
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={showMicrophoneControl}
                        className={showMicrophoneControl ? 'active' : ''}
                        onClick={() => setShowMicrophoneControl(true)}
                      >
                        Mic
                      </button>
                    </div>
                  </div>
                  <div className="framed-slider">
                    <label className="slider-row">
                      <span>0%</span>
                      <div className="range-control">
                        {showMicrophoneControl ? (
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step={MIC_VOLUME_STEP}
                            value={micVolumeValue}
                            disabled={!connected || !duplexMicEnabled || micVolumeCommitPending}
                            style={{ '--range-fill': `${micVolumeValue}%` } as CSSProperties}
                            aria-label="Microphone level"
                            onPointerDown={() => {
                              micVolumeEditingRef.current = true;
                            }}
                            onChange={(event) => setMicVolumeValue(snapMicVolume(Number(event.currentTarget.value)))}
                            onPointerUp={() => void commitMicVolume()}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                micVolumeEditingRef.current = true;
                              }
                            }}
                            onKeyUp={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                void commitMicVolume();
                              }
                            }}
                            onBlur={() => void commitMicVolume()}
                          />
                        ) : (
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step={SPEAKER_VOLUME_STEP}
                            value={speakerVolumeValue}
                            disabled={!connected || !speakerVolumeSupported || !snapshot.settings.speakerEnabled}
                            style={{ '--range-fill': `${speakerVolumeValue}%` } as CSSProperties}
                            onPointerDown={() => {
                              speakerVolumeEditingRef.current = true;
                            }}
                            onChange={(event) => setSpeakerVolumeValue(snapSpeakerVolume(Number(event.currentTarget.value)))}
                            onPointerUp={() => void commitSpeakerVolume()}
                            onKeyDown={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                speakerVolumeEditingRef.current = true;
                              }
                            }}
                            onKeyUp={(event) => {
                              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                void commitSpeakerVolume();
                              }
                            }}
                            onBlur={() => void commitSpeakerVolume()}
                          />
                        )}
                        <div className="range-ticks" aria-hidden="true">
                          {PERCENT_SLIDER_TICKS.map((value) => (
                            <span key={value} className={sliderTickClass(value, 100)} />
                          ))}
                        </div>
                      </div>
                      <strong>{showMicrophoneControl ? micVolumeValue : speakerVolumeValue}%</strong>
                    </label>
                  </div>
                  {showMicrophoneControl ? (
                    <>
                      <div className="segmented-row">
                        {MIC_VOLUME_PRESETS.map(([label, value]) => (
                          <button
                            key={label}
                            type="button"
                            className={micVolumeValue === value ? 'active' : ''}
                            disabled={!connected || !duplexMicEnabled || micVolumeCommitPending}
                            onClick={() => setMicPreset(Number(value))}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="mic-option-grid">
                        <button
                          type="button"
                          className={snapshot.settings.micMuted ? 'active danger' : ''}
                          aria-pressed={snapshot.settings.micMuted}
                          disabled={!connected || !duplexMicEnabled || pendingAction !== null}
                          onClick={toggleMicMute}
                        >
                          <VolumeX size={15} />
                          Mute
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="segmented-row">
                        {SPEAKER_VOLUME_PRESETS.map(([label, value]) => (
                          <button
                            key={label}
                            type="button"
                            className={speakerVolumeValue === value ? 'active' : ''}
                            disabled={!connected || !speakerVolumeSupported || !snapshot.settings.speakerEnabled || speakerVolumeCommitPending}
                            onClick={() => setSpeakerPreset(Number(value))}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <div className="audio-secondary-controls">
                        <div
                          className={`audio-buffer-control framed-slider ${audioBufferLengthControlDisabled ? 'disabled' : ''}`}
                          style={{ '--range-fill': `${audioBufferPercent(audioBufferLengthValue)}%` } as CSSProperties}
                        >
                          <div className="audio-buffer-header">
                            <AudioHapticsConfigLabel
                              id="audio-buffer-length-tooltip"
                              label="Audio Buffer Length"
                              tooltip="Sets the DualSense audio buffer value. Lower values reduce haptic delay but increase stutter risk; higher values improve speaker stability at the cost of latency."
                              className="audio-buffer-title"
                            />
                            <div className="audio-buffer-readout">
                              <strong>{audioBufferLengthValue}</strong>
                              <span>{audioBufferDelayLabel(audioBufferLengthValue)}</span>
                            </div>
                            <div
                              className={`audio-buffer-status-icon ${audioBufferZoneTone(audioBufferLengthValue)}`}
                              aria-label={audioBufferZoneLabel(audioBufferLengthValue)}
                              aria-describedby="audio-buffer-zone-tooltip"
                              tabIndex={0}
                            >
                              {audioBufferZoneTone(audioBufferLengthValue) === 'safe' && (
                                <IconCircleCheck size={18} stroke={2.35} aria-hidden="true" />
                              )}
                              {audioBufferZoneTone(audioBufferLengthValue) === 'risky' && (
                                <IconAlertTriangle size={18} stroke={2.35} aria-hidden="true" />
                              )}
                              {audioBufferZoneTone(audioBufferLengthValue) === 'stutter' && (
                                <IconAlertHexagon size={18} stroke={2.35} aria-hidden="true" />
                              )}
                              <span
                                id="audio-buffer-zone-tooltip"
                                className="settings-shortcut-tooltip shortcut-glyph-tooltip audio-buffer-zone-tooltip"
                                role="tooltip"
                              >
                                {audioBufferZoneTooltip(audioBufferLengthValue)}
                              </span>
                            </div>
                          </div>
                          <label className="audio-slider-row audio-buffer-slider-row">
                            <div className="range-control audio-buffer-range-control">
                              <input
                                type="range"
                                min={AUDIO_BUFFER_LENGTH_MIN}
                                max={AUDIO_BUFFER_LENGTH_MAX}
                                step="1"
                                value={audioBufferLengthValue}
                                aria-label="Audio buffer length"
                                aria-valuetext={`${audioBufferLengthValue}, ${audioBufferDelayLabel(audioBufferLengthValue)}, ${audioBufferZoneLabel(audioBufferLengthValue)}`}
                                disabled={audioBufferLengthControlDisabled}
                                onPointerDown={() => {
                                  audioBufferLengthEditingRef.current = true;
                                }}
                                onPointerCancel={() => void commitAudioBufferLength()}
                                onChange={(event) => {
                                  audioBufferLengthEditingRef.current = true;
                                  setAudioBufferLengthValue(clampAudioBufferLength(Number(event.currentTarget.value)));
                                }}
                                onPointerUp={() => void commitAudioBufferLength()}
                                onKeyDown={(event) => {
                                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                    audioBufferLengthEditingRef.current = true;
                                  }
                                }}
                                onKeyUp={(event) => {
                                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                                    void commitAudioBufferLength();
                                  }
                                }}
                                onBlur={() => void commitAudioBufferLength()}
                              />
                            </div>
                          </label>
                        </div>
                      </div>
                    </>
                  )}
                </section>
                <section className="feature-card test-card">
                  <div className="feature-card-title">
                    <span className="feature-icon"><IconTestPipe size={20} /></span>
                    <div className="title-copy">
                      <h3>Testing</h3>
                      <p>{showMicrophoneControl ? 'Listen to the controller microphone for five seconds.' : `Play a short sample through the controller ${outputControlLower}.`}</p>
                    </div>
                  </div>
                  <button
                    className="primary-action"
                    type="button"
                    disabled={activeAudioTestUnavailable}
                    onClick={showMicrophoneControl ? runTestMic : runTestSpeaker}
                  >
                    {showMicrophoneControl ? <Mic size={15} /> : <Play size={15} />}
                    {showMicrophoneControl
                      ? connected && micTestLocked
                        ? 'Live Listening'
                        : connected && micTestError
                          ? 'Retry Mic'
                          : 'Test Mic'
                      : connected && speakerTestLocked
                        ? 'Playing Tone'
                        : connected && gameStreamActive
                          ? 'Game Active'
                        : connected && speakerOutputMissing
                            ? `Retry ${outputControlLabel}`
                          : `Test ${outputControlLabel}`}
                  </button>
                  <button
                    className="secondary-action"
                    type="button"
                    disabled={!activeAudioTestLocked}
                    onClick={showMicrophoneControl ? stopMicLiveListen : () => setSpeakerTestLocked(false)}
                  >
                    <span className="stop-glyph" aria-hidden="true" />
                    Stop Test
                  </button>
                  <div className="feature-status test-status audio-test-status">
                    <span className={`status-badge ${activeAudioTestStatusTone}`} title={activeAudioTestStatusLabel}>
                      <span className={`dot ${activeAudioTestStatusTone}`} />
                      <strong>{activeAudioTestStatusLabel}</strong>
                    </span>
                    <span className={`status-badge ${audioPathTone}`} title={audioPathTooltip}>
                      <span className={`dot ${audioPathTone}`} />
                      <strong>{audioPathLabel}</strong>
                    </span>
                  </div>
                </section>
              </div>
              <FeatureTipsPanel tab="audio" />
          </div>

          <div
            className={`control-page triggers-page ${activeControlTab === 'triggers' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-triggers"
            aria-labelledby="control-tab-triggers"
            aria-hidden={activeControlTab !== 'triggers'}
          >
              <div className="feature-heading">
                <div>
                  <h2>{triggerLabOpen ? 'Trigger Lab' : 'Adaptive Triggers'}</h2>
                  <p>{triggerLabOpen ? 'Experimental adaptive trigger profile editor' : 'Set trigger effect intensity and test mode'}</p>
                </div>
                <div className="triggers-heading-controls">
                  <div className="inline-switch trigger-lab-switch-control">
                    {triggerLabAnyActive ? (
                      <span className="inline-state-badge warn trigger-lab-state">
                        Lab Override
                      </span>
                    ) : null}
                    <span>Lab</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={triggerLabOpen}
                      aria-label={triggerLabOpen ? 'Exit Trigger Lab' : 'Enter Trigger Lab'}
                      className={`switch trigger-lab-switch ${triggerLabOpen ? 'on' : ''}`}
                      onClick={() => setTriggerLabOpen((open) => !open)}
                    >
                      <span />
                    </button>
                    {triggerLabAnyActive ? (
                      <span className="settings-shortcut-tooltip shortcut-glyph-tooltip trigger-lab-override-tooltip">
                        Trigger Lab is overriding game adaptive trigger output.
                      </span>
                    ) : null}
                  </div>
                  <div className="inline-switch">
                    <span>Enabled</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={snapshot.settings.adaptiveTriggersEnabled}
                      className={`switch ${snapshot.settings.adaptiveTriggersEnabled ? 'on' : ''}`}
                      disabled={!controllerControlsAvailable || !adaptiveTriggersSupported || pendingAction !== null}
                      onClick={toggleAdaptiveTriggersEnabled}
                    >
                      <span />
                    </button>
                  </div>
                </div>
              </div>
              {triggerLabOpen ? (
                <div className="feature-card-grid trigger-lab-grid">
                  {renderTriggerLabCard('l2')}
                  {renderTriggerLabCard('r2')}
                </div>
              ) : (
              <div className="feature-card-grid">
                <section className="feature-card preset-card">
                  <div className="feature-card-title">
                    <button
                      type="button"
                      className={`feature-icon triggers-enable-button icon-compact ${snapshot.settings.adaptiveTriggersEnabled ? 'active' : ''} ${controllerPowerSavingActive && snapshot.settings.adaptiveTriggersEnabled ? 'power-saving-active' : ''}`}
                      aria-pressed={snapshot.settings.adaptiveTriggersEnabled}
                      aria-label="Enable adaptive triggers"
                      title="Enable adaptive triggers"
                      disabled={!controllerControlsAvailable || !adaptiveTriggersSupported || pendingAction !== null}
                      onClick={toggleAdaptiveTriggersEnabled}
                    >
                      <IconDeviceGamepad2 size={20} />
                    </button>
                    <div className="title-copy">
                      <h3>Intensity</h3>
                      <p>Set the overall strength of adaptive trigger effects</p>
                    </div>
                  </div>
                  <div className="framed-slider">
                    <label className="slider-row">
                      <span>0%</span>
                      <div className="range-control">
                        <input
                          type="range"
                          min="0"
                          max={percentSliderMax}
                          step={TRIGGER_EFFECT_STEP}
                          value={triggerEffectIntensityValue}
                          disabled={!connected || !adaptiveTriggersSupported || !snapshot.settings.adaptiveTriggersEnabled}
                          style={{ '--range-fill': `${(triggerEffectIntensityValue / percentSliderMax) * 100}%` } as CSSProperties}
                          onPointerDown={() => {
                            triggerEffectEditingRef.current = true;
                          }}
                          onChange={(event) => (
                            setTriggerEffectIntensityValue(snapTriggerEffectIntensity(Number(event.currentTarget.value)))
                          )}
                          onPointerUp={() => void commitTriggerEffectIntensity()}
                          onKeyDown={(event) => {
                            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                              triggerEffectEditingRef.current = true;
                            }
                          }}
                          onKeyUp={(event) => {
                            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                              void commitTriggerEffectIntensity();
                            }
                          }}
                          onBlur={() => void commitTriggerEffectIntensity()}
                        />
                        <div className="range-ticks" aria-hidden="true">
                          {PERCENT_SLIDER_TICKS.map((value) => (
                            <span key={value} className={sliderTickClass(value, 100)} />
                          ))}
                        </div>
                      </div>
                      <strong>{triggerEffectIntensityValue}%</strong>
                    </label>
                  </div>
                  <div className="segmented-row">
                    {TRIGGER_EFFECT_PRESETS.map(([label, value]) => (
                      <button
                        key={label}
                        type="button"
                        className={triggerEffectIntensityValue === value ? 'active' : ''}
                        disabled={!connected || !adaptiveTriggersSupported || !snapshot.settings.adaptiveTriggersEnabled || pendingAction !== null}
                        onClick={() => setTriggerIntensityPreset(Number(value))}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="feature-card test-card">
                  <div className="feature-card-title">
                    <span className="feature-icon"><IconTestPipe size={20} /></span>
                    <div className="title-copy">
                      <h3>Testing</h3>
                      <p>Choose a trigger effect and run a short test</p>
                    </div>
                  </div>
                  <div className="test-options">
                    <div className="select-row wide-select trigger-test-mode-control">
                      <CustomSelect
                        value={snapshot.settings.triggerTestMode}
                        disabled={
                          !connected
                          || !adaptiveTriggersSupported
                          || !snapshot.settings.adaptiveTriggersEnabled
                          || adaptiveTriggerOutputActive
                          || pendingAction !== null
                        }
                        options={TRIGGER_TEST_MODE_OPTIONS}
                        ariaLabel="Trigger test type"
                        onChange={setTriggerTestMode}
                      />
                    </div>
                    <div className="target-row">
                      <div className="segmented-row compact">
                        {TRIGGER_TARGET_OPTIONS.map(([label, value]) => (
                          <button
                            key={value}
                            type="button"
                            className={triggerTarget === value ? 'active' : ''}
                            disabled={!connected || !adaptiveTriggersSupported || adaptiveTriggerOutputActive}
                            onClick={() => setTriggerTarget(value)}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="trigger-action-row">
                    <button className="primary-action" type="button" disabled={testTriggersUnavailable} onClick={runTestAdaptiveTriggers}>
                      <Play size={15} />
                      {connected && adaptiveTriggerOutputActive
                        ? 'Game Triggers Active'
                        : connected && (triggerTestLocked || snapshot.status?.testAdaptiveTriggersBusy)
                          ? 'Testing'
                          : 'Test Triggers'}
                    </button>
                    <button
                      className="secondary-action"
                      type="button"
                      disabled={!connected || !adaptiveTriggersSupported || adaptiveTriggerOutputActive || pendingAction !== null}
                      onClick={resetAdaptiveTriggers}
                    >
                      <RefreshCcw size={14} />
                      Reset Triggers
                    </button>
                  </div>
                  <div className={`feature-status test-status ${triggerStatusTone}`}>
                    <span className="status-badge">
                      <span className={`dot ${triggerStatusTone}`} />
                      <strong>{triggerStatusLabel}</strong>
                    </span>
                  </div>
                </section>
              </div>
              )}
              <FeatureTipsPanel
                tab="triggers"
                triggerLabOpen={triggerLabOpen}
                onSettingsFocusRequest={focusBridgeSettings}
              />
          </div>

          <div
            className={`control-page lighting-page ${activeControlTab === 'lighting' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-lighting"
            aria-labelledby="control-tab-lighting"
            aria-hidden={activeControlTab !== 'lighting'}
          >
              <div className="feature-heading">
                <div>
                  <h2>Lighting</h2>
                  <p>Customize the controller light bar and override behavior</p>
                </div>
                <div className="inline-switch">
                  <span>Enabled</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.lightbarEnabled}
                    className={`switch ${snapshot.settings.lightbarEnabled ? 'on' : ''}`}
                    disabled={!controllerControlsAvailable || !lightbarSupported || pendingAction !== null}
                    onClick={toggleLightbarEnabled}
                  >
                    <span />
                  </button>
                </div>
              </div>
              <div className="feature-card-grid lighting-grid">
                <section className="feature-card preset-card">
                  <div className="feature-card-title">
                    <button
                      type="button"
                      className={`feature-icon lighting-enable-button icon-large ${snapshot.settings.lightbarEnabled ? 'active' : ''} ${controllerPowerSavingActive && snapshot.settings.lightbarEnabled ? 'power-saving-active' : ''}`}
                      aria-pressed={snapshot.settings.lightbarEnabled}
                      aria-label="Enable lighting"
                      title="Enable lighting"
                      disabled={!controllerControlsAvailable || !lightbarSupported || pendingAction !== null}
                      onClick={toggleLightbarEnabled}
                    >
                      <IconBulb size={20} />
                    </button>
                    <div className="title-copy">
                      <h3>Brightness</h3>
                      <p>Set the controller light bar brightness</p>
                    </div>
                  </div>
                  <div className="framed-slider">
                    <label className="slider-row">
                      <span>0%</span>
                      <div className="range-control">
                        <input
                          type="range"
                          min="0"
                          max={percentSliderMax}
                          step={LIGHTBAR_BRIGHTNESS_STEP}
                          value={lightbarBrightnessValue}
                          disabled={!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled}
                          style={{ '--range-fill': `${(lightbarBrightnessValue / percentSliderMax) * 100}%` } as CSSProperties}
                          onPointerDown={() => {
                            lightbarBrightnessEditingRef.current = true;
                          }}
                          onChange={(event) => setLightbarBrightnessValue(snapLightbarBrightness(Number(event.currentTarget.value)))}
                          onPointerUp={() => void commitLightbar()}
                          onKeyDown={(event) => {
                            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                              lightbarBrightnessEditingRef.current = true;
                            }
                          }}
                          onKeyUp={(event) => {
                            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                              void commitLightbar();
                            }
                          }}
                          onBlur={() => void commitLightbar()}
                        />
                        <div className="range-ticks" aria-hidden="true">
                          {PERCENT_SLIDER_TICKS.map((value) => (
                            <span key={value} className={sliderTickClass(value, 100)} />
                          ))}
                        </div>
                      </div>
                      <strong>{lightbarBrightnessValue}%</strong>
                    </label>
                  </div>
                  <div className="segmented-row">
                    {LIGHTBAR_PRESETS.map(([label, value]) => (
                      <button
                        key={label}
                        type="button"
                        className={lightbarBrightnessValue === value ? 'active' : ''}
                        disabled={!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled}
                        onClick={() => setLightbarPreset(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="feature-card behavior-card">
                  <div className="feature-card-title">
                    <span className="feature-icon"><Palette size={20} /></span>
                    <div className="title-copy">
                      <h3>Behavior</h3>
                      <p>Set light bar behavior</p>
                    </div>
                  </div>
                  <div className="behavior-toggle-row">
                    <div>
                      <strong>Light Bar Override</strong>
                      <p>Use app-controlled lighting instead of the default controller behavior</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={snapshot.settings.lightbarOverrideEnabled}
                      className={`switch ${snapshot.settings.lightbarOverrideEnabled ? 'on' : ''}`}
                      disabled={!connected || !lightbarOverrideSupported || !snapshot.settings.lightbarEnabled}
                      onClick={() => void runAction('lightbar-override', () => (
                        window.bridge.setLightbarOverrideEnabled(!snapshot.settings.lightbarOverrideEnabled)
                      ))}
                    >
                      <span />
                    </button>
                  </div>
                  <div className="light-color-panel">
                    <strong>Light Color</strong>
                    <div className="behavior-swatches" aria-label="Light bar color">
                      {LIGHTBAR_SWATCHES.map((color) => (
                        <button
                          key={color}
                          type="button"
                          title={`${lightbarColorName(color)} ${color.toUpperCase()}`}
                          className={normalizedLightbarColor === color ? 'active' : ''}
                          style={{ '--swatch-color': color } as CSSProperties}
                          disabled={!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled}
                          onClick={() => selectLightbarColor(color)}
                        />
                      ))}
                      <div className="custom-color-anchor" ref={customColorPickerRef}>
                        <button
                          type="button"
                          className={`custom-color-swatch ${customSwatchSelected ? 'active' : ''} ${showCustomColorPicker ? 'picker-open' : ''} ${customSwatchPrimed && !customLightbarColor ? 'primed' : ''}`}
                          title={customLightbarColor ? `Custom ${customLightbarColor.toUpperCase()}` : 'Double-click to create a custom color'}
                          style={{ '--picker-color': customSwatchColor } as CSSProperties}
                          disabled={customColorPickerDisabled}
                          aria-pressed={customSwatchSelected}
                          onClick={selectCustomLightbarColor}
                          onDoubleClick={openCustomLightbarPicker}
                        >
                          <span className="custom-color-fill" aria-hidden="true" />
                          <Palette size={15} aria-hidden="true" />
                        </button>
                        {showCustomColorPicker && (
                          <div className="custom-color-popover" role="dialog" aria-label="Custom light bar color picker">
                            <div className="custom-color-popover-head">
                              <strong>Custom Color</strong>
                              <span>{customColorDraft.toUpperCase()}</span>
                            </div>
                            <div className="custom-color-palette" role="grid" aria-label="Custom color palette">
                              {LIGHTBAR_CUSTOM_PALETTE.map((row) => (
                                <div className="custom-color-palette-row" role="row" key={row[0].color}>
                                  {row.map((cell) => (
                                    <button
                                      key={cell.color}
                                      type="button"
                                      role="gridcell"
                                      className={normalizeHexColor(customColorDraft) === cell.color ? 'selected' : ''}
                                      style={{ '--picker-color': cell.color } as CSSProperties}
                                      title={`${cell.name} ${cell.color.toUpperCase()}`}
                                      aria-label={`${cell.name} ${cell.color.toUpperCase()}`}
                                      disabled={customColorPickerDisabled}
                                      onClick={() => previewCustomLightbarColor(cell.color)}
                                    />
                                  ))}
                                </div>
                              ))}
                            </div>
                            <div className="custom-color-picker-row">
                              <span
                                className="custom-color-preview"
                                style={{ '--picker-color': customColorDraft } as CSSProperties}
                                aria-hidden="true"
                              />
                              <code>{customColorDraft.toUpperCase()}</code>
                            </div>
                            <button
                              type="button"
                              className="custom-color-apply"
                              disabled={customColorPickerDisabled}
                              onClick={() => saveCustomLightbarColor(customColorDraft)}
                            >
                              Use Color
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="light-color-meta">
                      <strong>{lightbarColorName(lightbarColor)}</strong>
                      <span>{normalizedLightbarColor.toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="feature-status lighting-status">
                    <span className={`status-badge ${lightbarStateActive ? 'good' : 'idle'}`}>
                      <span className={`dot ${lightbarStateActive ? 'good' : 'idle'}`} />
                      <strong>{lightbarStateLabel}</strong>
                    </span>
                  </div>
                </section>
              </div>
              <FeatureTipsPanel tab="lighting" onSettingsFocusRequest={focusBridgeSettings} />
          </div>

          <div
            className={`control-page remapping-page ${activeControlTab === 'remapping' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-remapping"
            aria-labelledby="control-tab-remapping"
            aria-hidden={activeControlTab !== 'remapping'}
          >
              <div className="feature-heading system-heading remapping-heading">
                <div>
                  <h2>Button Remapping</h2>
                  <p>Choose replacement targets for controller button slots.</p>
                </div>
                <div className="profile-controls">
                  <CustomSelect
                    value={selectedRemapProfileId}
                    disabled={pendingAction !== null}
                    options={remapProfileOptions}
                    ariaLabel="Button remapping profile"
                    onChange={selectButtonRemappingProfile}
                  />
                  <button
                    className="heading-action"
                    type="button"
                    disabled={pendingAction !== null}
                    onClick={restoreButtonRemappingDefaults}
                  >
                    <RefreshCcw size={18} />
                    Restore Defaults
                  </button>
                </div>
              </div>
              <section className="feature-card remapping-card">
                <div className="remapping-profile-strip">
                  <ProfileSaveStatus />
                  <div className="remapping-profile-actions">
                    <button
                      type="button"
                      disabled={pendingAction !== null || selectedRemapProfileIsDefault}
                      onClick={renameButtonRemappingProfile}
                    >
                      <Pencil size={15} />
                      Rename Profile
                    </button>
                    <button
                      type="button"
                      disabled={pendingAction !== null}
                      onClick={saveButtonRemappingProfile}
                    >
                      <Save size={15} />
                      Save New Profile
                    </button>
                    <button
                      type="button"
                      disabled={pendingAction !== null || selectedRemapProfileIsDefault}
                      onClick={deleteButtonRemappingProfile}
                    >
                      <Trash2 size={15} />
                      Delete Profile
                    </button>
                  </div>
                </div>
                <div className="remapping-layout" ref={remappingLayoutRef}>
                  <svg className="remapping-callout-layer" aria-hidden="true">
                    {remapCalloutLayout && (
                      <g>
                        {REMAP_STANDARD_BUTTON_IDS.map((buttonId) => {
                          const remapped = remapDraft[buttonId] !== buttonId;
                          return (
                            <g key={buttonId} className={hoveredRemapButton === buttonId || remapped ? 'active' : undefined}>
                              <polyline
                                className="remapping-callout-underlay"
                                points={remapCalloutLayout[buttonId].points}
                              />
                              <polyline
                                className="remapping-callout-line"
                                points={remapCalloutLayout[buttonId].points}
                              />
                            </g>
                          );
                        })}
                      </g>
                    )}
                    {showDualSenseEdgeRemapButtons && edgeRemapControlLayout && (
                      <g>
                        {REMAP_EDGE_BUTTON_IDS.map((buttonId) => {
                          const remapped = remapDraft[buttonId] !== buttonId;
                          return (
                            <g key={buttonId} className={hoveredRemapButton === buttonId || remapped ? 'active' : undefined}>
                              <polyline
                                className="remapping-callout-underlay"
                                points={edgeRemapControlLayout[buttonId].linePoints}
                              />
                              <polyline
                                className="remapping-callout-line"
                                points={edgeRemapControlLayout[buttonId].linePoints}
                              />
                            </g>
                          );
                        })}
                      </g>
                    )}
                  </svg>
                  {showDualSenseEdgeRemapButtons && (
                    <div className="remapping-edge-layer" aria-label="DualSense Edge button mappings">
                      {REMAP_EDGE_BUTTON_IDS.map((buttonId) => {
                        const button = REMAP_BUTTONS[buttonId];
                        const targetOptions = remapTargetOptionsFor(buttonId);
                        const remapped = remapDraft[buttonId] !== buttonId;
                        const fallbackPoint = REMAP_EDGE_CONTROL_POINTS[buttonId];
                        const edgeLayout = edgeRemapControlLayout?.[buttonId];
                        const anchor = edgeLayout?.anchor ?? fallbackPoint.anchor;
                        return (
                          <div
                            className={`remapping-pill remapping-pill-edge remapping-pill-edge-compact remapping-edge-control remapping-edge-control-${anchor} ${remapped ? 'changed' : ''}`}
                            data-remap-button-id={buttonId}
                            key={buttonId}
                            onMouseEnter={() => setHoveredRemapButton(buttonId)}
                            onMouseLeave={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                            onFocusCapture={() => setHoveredRemapButton(buttonId)}
                            onBlurCapture={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                            style={{
                              left: edgeLayout ? `${edgeLayout.left}px` : `${(fallbackPoint.x / remappingLayoutAsset.viewBoxWidth) * 100}%`,
                              top: edgeLayout ? `${edgeLayout.top}px` : `${(fallbackPoint.y / remappingLayoutAsset.viewBoxHeight) * 100}%`
                            } as CSSProperties}
                          >
                            <CustomSelect
                              value={remapDraft[buttonId]}
                              options={targetOptions}
                              className="remapping-select remapping-edge-select"
                              showSelectedCheck={false}
                              ariaLabel={`${button.label} remap target`}
                              renderValue={(label, value) => <RemapGlyphOption label={label} value={value} />}
                              renderOption={(label, value) => <RemapGlyphOption label={label} value={value} />}
                              onChange={(value) => setButtonRemap(buttonId, value)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div className="remapping-side remapping-side-left" ref={remappingLeftSideRef} aria-label="Left side button mappings">
                    {REMAP_LEFT_BUTTON_IDS.map((buttonId) => {
                      const button = REMAP_BUTTONS[buttonId];
                      const targetOptions = remapTargetOptionsFor(buttonId);
                      const remapped = remapDraft[buttonId] !== buttonId;
                      return (
                        <div
                          className={`remapping-pill ${remapped ? 'changed' : ''}`}
                          data-remap-button-id={buttonId}
                          key={buttonId}
                          onMouseEnter={() => setHoveredRemapButton(buttonId)}
                          onMouseLeave={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                          onFocusCapture={() => setHoveredRemapButton(buttonId)}
                          onBlurCapture={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                          style={{
                            '--remapping-callout-top': remapCalloutLayout
                              ? `${remapCalloutLayout[buttonId].top}px`
                              : `${(remappingLayoutAsset.calloutY[buttonId] / remappingLayoutAsset.viewBoxHeight) * 100}%`
                          } as CSSProperties}
                        >
                          <span className="remapping-source">
                            <RemapSourceGlyph button={button} />
                          </span>
                          <span className="remapping-arrow" aria-hidden="true">
                            <ArrowRight size={15} />
                          </span>
                          <CustomSelect
                            value={remapDraft[buttonId]}
                            options={targetOptions}
                            className="remapping-select"
                            showSelectedCheck={false}
                            ariaLabel={`${button.label} remap target`}
                            renderValue={(label, value) => <RemapGlyphOption label={label} value={value} />}
                            renderOption={(label, value) => <RemapGlyphOption label={label} value={value} />}
                            onChange={(value) => setButtonRemap(buttonId, value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="remapping-controller-stage" aria-hidden="true">
                    <img
                      ref={remappingArtRef}
                      className="remapping-controller-art"
                      src={remappingLayoutAsset.src}
                      alt=""
                      style={{
                        '--remapping-art-aspect': remappingLayoutAsset.viewBoxWidth / remappingLayoutAsset.viewBoxHeight
                      } as CSSProperties}
                    />
                  </div>
                  <div className="remapping-side remapping-side-right" ref={remappingRightSideRef} aria-label="Right side button mappings">
                    {REMAP_RIGHT_BUTTON_IDS.map((buttonId) => {
                      const button = REMAP_BUTTONS[buttonId];
                      const targetOptions = remapTargetOptionsFor(buttonId);
                      const remapped = remapDraft[buttonId] !== buttonId;
                      return (
                        <div
                          className={`remapping-pill ${remapped ? 'changed' : ''}`}
                          data-remap-button-id={buttonId}
                          key={buttonId}
                          onMouseEnter={() => setHoveredRemapButton(buttonId)}
                          onMouseLeave={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                          onFocusCapture={() => setHoveredRemapButton(buttonId)}
                          onBlurCapture={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                          style={{
                            '--remapping-callout-top': remapCalloutLayout
                              ? `${remapCalloutLayout[buttonId].top}px`
                              : `${(remappingLayoutAsset.calloutY[buttonId] / remappingLayoutAsset.viewBoxHeight) * 100}%`
                          } as CSSProperties}
                        >
                          <span className="remapping-source">
                            <RemapSourceGlyph button={button} />
                          </span>
                          <span className="remapping-arrow" aria-hidden="true">
                            <ArrowRight size={15} />
                          </span>
                          <CustomSelect
                            value={remapDraft[buttonId]}
                            options={targetOptions}
                            className="remapping-select"
                            showSelectedCheck={false}
                            ariaLabel={`${button.label} remap target`}
                            renderValue={(label, value) => <RemapGlyphOption label={label} value={value} />}
                            renderOption={(label, value) => <RemapGlyphOption label={label} value={value} />}
                            onChange={(value) => setButtonRemap(buttonId, value)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
          </div>

          <div
            className={`control-page chords-page ${activeControlTab === 'chords' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-chords"
            aria-labelledby="control-tab-chords"
            aria-hidden={activeControlTab !== 'chords'}
          >
              <div className="feature-heading chords-heading">
                <div>
                  <h2>Chords</h2>
                  <p>Assign reusable functions to controller buttons and starter chords.</p>
                </div>
              </div>

              <div className="chords-layout">
                <section className="feature-card chords-card chords-function-card">
                  <div className="feature-card-title">
                    <span className="feature-icon">
                      <IconBooks size={24} />
                    </span>
                    <div className="title-copy">
                      <h3>Function Library</h3>
                      <p>Create actions.</p>
                    </div>
                  </div>

                  <div className="chords-function-strip">
                    <CustomSelect
                      value={selectedChordFunction?.id ?? ''}
                      options={chordFunctionOptions}
                      disabled={pendingAction !== null || chordFunctions.length === 0}
                      ariaLabel="Chord function"
                      className="chords-function-select"
                      closeOnSelect={false}
                      suspendOutsideClose={chordFunctionDialog !== null}
                      onChange={(value) => {
                        const next = chordFunctions.find((func) => func.id === value) ?? null;
                        setSelectedChordFunctionId(value);
                        setChordFunctionDraft(chordFunctionToDraft(next));
                      }}
                      renderMenuFooter={() => (
                        selectedChordFunction ? (
                          <div className="trigger-lab-profile-actions chords-function-menu-actions">
                            <button
                              type="button"
                              title="Rename"
                              disabled={pendingAction !== null}
                              onClick={() => {
                                openChordFunctionDialog('rename');
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              title="Delete"
                              disabled={pendingAction !== null}
                              onClick={() => {
                                openChordFunctionDialog('delete');
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ) : null
                      )}
                    />
                    <button
                      className="heading-icon-action chords-new-function-button"
                      type="button"
                      title="New Function"
                      aria-label="New Function"
                      disabled={pendingAction !== null}
                      onClick={createChordFunction}
                    >
                      <Plus size={17} />
                    </button>
                  </div>

                  {selectedChordFunction ? (
                    <div className="chords-editor">
                      <label className="chords-field chords-inline-field">
                        <span>Type</span>
                        <CustomSelect
                          value={chordFunctionDraft.type}
                          options={CHORD_FUNCTION_TYPE_OPTIONS}
                          disabled={pendingAction !== null}
                          ariaLabel="Chord function type"
                          onChange={(value) => {
                            const nextDraft = { ...chordFunctionDraft, type: value };
                            setChordFunctionDraft(nextDraft);
                            commitChordFunctionDraft(nextDraft);
                          }}
                        />
                      </label>

                      {chordFunctionDraft.type === 'keyboard' && (
                        <div
                          className="chords-keyboard-shortcut-builder"
                          aria-label="Keyboard shortcut"
                          style={{
                            '--chords-keyboard-key-label-width': `${CHORD_KEYBOARD_KEY_MAX_LABEL_LENGTH}ch`
                          } as CSSProperties}
                        >
                          <CustomSelect
                            className="chords-keyboard-key-select"
                            value={chordFunctionDraft.keyboardKey}
                            options={CHORD_KEYBOARD_KEY_OPTIONS}
                            disabled={pendingAction !== null}
                            ariaLabel="Keyboard shortcut key"
                            onChange={setChordFunctionKeyboardKey}
                          />
                          <div className="chords-keyboard-modifiers" aria-label="Keyboard shortcut modifiers">
                            {CHORD_KEYBOARD_MODIFIER_OPTIONS.map(([label, modifier]) => {
                              const active = chordFunctionDraft.keyboardModifiers.includes(modifier);
                              const unavailable = !active
                                && chordFunctionDraft.keyboardModifiers.length >= MAX_KEYBOARD_FUNCTION_KEYS - 1;
                              return (
                                <button
                                  key={modifier}
                                  type="button"
                                  className={active ? 'active' : ''}
                                  aria-pressed={active}
                                  disabled={pendingAction !== null || unavailable}
                                  onClick={() => toggleChordFunctionKeyboardModifier(modifier)}
                                >
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {chordFunctionDraft.type === 'media' && (
                        <label className="chords-field chords-inline-field">
                          <span>Action</span>
                          <CustomSelect
                            value={chordFunctionDraft.mediaAction}
                            options={CHORD_MEDIA_ACTION_OPTIONS}
                            disabled={pendingAction !== null}
                            ariaLabel="Chord media action"
                            onChange={(value) => {
                              const nextDraft = { ...chordFunctionDraft, mediaAction: value };
                              setChordFunctionDraft(nextDraft);
                              commitChordFunctionDraft(nextDraft);
                            }}
                          />
                        </label>
                      )}

                      {chordFunctionDraft.type === 'controller-setting' && (
                        <label className="chords-field chords-inline-field">
                          <span>Action</span>
                          <CustomSelect
                            value={chordControllerSettingSelectValue(chordFunctionDraft.controllerAction)}
                            options={CHORD_CONTROLLER_SETTING_ACTION_OPTIONS}
                            disabled={pendingAction !== null}
                            ariaLabel="Chord controller setting action"
                            onChange={(value) => {
                              const nextDraft = {
                                ...chordFunctionDraft,
                                controllerAction: chordControllerSettingActionFromSelectValue(
                                  value,
                                  chordFunctionDraft.controllerAction
                                )
                              };
                              setChordFunctionDraft(nextDraft);
                              commitChordFunctionDraft(nextDraft);
                            }}
                          />
                        </label>
                      )}

                      {renderChordFunctionSummary(selectedChordFunction)}
                    </div>
                  ) : (
                    <div className="chords-empty">
                      <IconReplace size={26} />
                      <strong>No functions yet</strong>
                      <span>Create a function, then bind it to a button or chord.</span>
                    </div>
                  )}
                </section>

                <section className="feature-card chords-card chords-assignment-card">
                  <div className="feature-card-title">
                    <span className="feature-icon">
                      <IconDeviceGamepad3 size={24} />
                    </span>
                    <div className="title-copy">
                      <h3>Assignments</h3>
                      <p>{chordAssignmentsSubtitle}</p>
                    </div>
                    {chordAssignmentConflictState.conflictCount > 0 ? (
                      <span className="chords-conflict-badge" title="Duplicate, inactive, or shortcut-shadowed chord bindings">
                        <strong>{chordAssignmentConflictState.conflictCount}x</strong>
                        {chordAssignmentConflictState.conflictCount === 1 ? 'Conflict' : 'Conflicts'}
                      </span>
                    ) : null}
                  </div>

                  <div className="chords-assignment-builder">
                    <button
                      className="heading-action chords-new-chord-button"
                      type="button"
                      disabled={pendingAction !== null || !canAddChordDraft}
                      onClick={addChordAssignmentDraft}
                    >
                      <IconReplace size={18} />
                      New Chord
                    </button>
                  </div>

                  <div className="chords-assignment-scroll-region">
                    <div
                      className="chords-assignment-list"
                      ref={chordAssignmentListRef}
                      aria-label="Chord assignments"
                      onScroll={updateChordAssignmentScrollbar}
                    >
                      {chordAssignments.length + chordAssignmentDraftRows.length > 0 ? (
                        <>
                        {chordAssignmentDraftRows.map((row) => {
                          const func = chordFunctions.find((candidate) => candidate.id === row.functionId);
                          const starterOptions = chordStarterOptionsFor(row.starter);
                          const isInactiveMuteChord = muteChordStarterIsInactive(row.starter);
                          return (
                            <div
                              className={[
                                'chords-assignment-row',
                                'draft',
                                isInactiveMuteChord ? 'mute-starter-inactive' : ''
                              ].filter(Boolean).join(' ')}
                              key={row.id}
                            >
                              <div
                                className="chords-assignment-binding"
                                aria-label="New chord"
                                title="New chord"
                              >
                                  <CustomSelect
                                  value={row.starter}
                                  options={starterOptions}
                                  disabled={pendingAction !== null}
                                  className="chords-inline-glyph-select chords-inline-starter-select"
                                  floatingMenu
                                  floatingMenuMinWidth={72}
                                  showSelectedCheck={false}
                                  ariaLabel="Chord starter"
                                  renderValue={(label, value) => <ChordStarterGlyphOption label={label} value={value} />}
                                  renderOption={(label, value) => <ChordStarterGlyphOption label={label} value={value} />}
                                  onChange={(value) => updateChordAssignmentDraftStarter(row.id, value)}
                                />
                                <span className="chords-binding-connector" aria-hidden="true" />
                                <CustomSelect
                                  value={row.button ?? CHORD_UNASSIGNED_BUTTON}
                                  options={chordButtonOptionsFor(row.starter, true)}
                                  disabled={pendingAction !== null}
                                  className="chords-inline-glyph-select chords-inline-button-select"
                                  floatingMenu
                                  floatingMenuMinWidth={72}
                                  showSelectedCheck={false}
                                  ariaLabel="Chord button"
                                  renderValue={(label, value) => <ChordButtonGlyphOption label={label} value={value} />}
                                  renderOption={(label, value) => <ChordButtonGlyphOption label={label} value={value} />}
                                  onChange={(value) => updateChordAssignmentDraftButton(row.id, value)}
                                />
                              </div>
                              <span className="chords-function-connector" aria-hidden="true" />
                              <CustomSelect
                                value={row.functionId}
                                options={chordFunctionOptions}
                                disabled={pendingAction !== null}
                                className="chords-assignment-function-select"
                                floatingMenu
                                ariaLabel="New chord function"
                                renderValue={(label) => (
                                  <span className="chords-function-option">
                                    <strong>{label}</strong>
                                    <small>{func ? chordFunctionSummary(func) : 'Missing function'}</small>
                                  </span>
                                )}
                                renderOption={(label, value) => {
                                  const optionFunction = chordFunctions.find((candidate) => candidate.id === value);
                                  return (
                                    <span className="chords-function-option">
                                      <strong>{label}</strong>
                                      <small>{optionFunction ? chordFunctionSummary(optionFunction) : 'Missing function'}</small>
                                    </span>
                                  );
                                }}
                                onChange={(value) => updateChordAssignmentDraftFunction(row.id, value)}
                              />
                              <button
                                className="heading-icon-action"
                                type="button"
                                title="Remove assignment"
                                disabled={pendingAction !== null}
                                onClick={() => deleteChordAssignmentDraft(row.id)}
                              >
                                <Trash2 size={17} />
                              </button>
                            </div>
                          );
                        })}
                        {chordAssignments.map((assignment, assignmentIndex) => {
                        const func = chordFunctions.find((candidate) => candidate.id === assignment.functionId);
                        const hasConflict = chordAssignmentConflictState.conflictKeys.has(chordAssignmentKey(assignment));
                        const starterOptions = chordStarterOptionsFor(assignment.starter);
                        const isInactiveMuteChord = muteChordStarterIsInactive(assignment.starter);
                        const dropPlacement = chordAssignmentDropHint?.targetId === assignment.id
                          ? chordAssignmentDropHint.placement
                          : null;
                        return (
                          <div
                            className={[
                              'chords-assignment-row',
                              hasConflict ? 'conflict' : '',
                              isInactiveMuteChord ? 'mute-starter-inactive' : '',
                              draggedChordAssignmentId === assignment.id ? 'dragging' : '',
                              dropPlacement === 'before' ? 'drop-before' : '',
                              dropPlacement === 'after' ? 'drop-after' : '',
                              assignmentIndex === 0 && dropPlacement === 'before' ? 'drop-list-start' : ''
                            ].filter(Boolean).join(' ')}
                            key={assignment.id}
                            data-assignment-id={assignment.id}
                            onPointerDown={(event) => startChordAssignmentPointerDrag(event, assignment.id)}
                          >
                            <div
                              className="chords-assignment-binding"
                              aria-label={chordAssignmentLabel(assignment)}
                              title={chordAssignmentLabel(assignment)}
                            >
                                <CustomSelect
                                value={assignment.starter}
                                options={starterOptions}
                                disabled={pendingAction !== null}
                                className="chords-inline-glyph-select chords-inline-starter-select"
                                floatingMenu
                                floatingMenuMinWidth={72}
                                showSelectedCheck={false}
                                ariaLabel={`${chordAssignmentLabel(assignment)} starter`}
                                renderValue={(label, value) => <ChordStarterGlyphOption label={label} value={value} />}
                                renderOption={(label, value) => <ChordStarterGlyphOption label={label} value={value} />}
                                onChange={(value) => updateChordAssignmentStarter(assignment.id, value)}
                              />
                              <span className="chords-binding-connector" aria-hidden="true" />
                              <CustomSelect
                                value={assignment.button}
                                options={chordButtonOptionsFor(assignment.starter)}
                                disabled={pendingAction !== null}
                                className="chords-inline-glyph-select chords-inline-button-select"
                                floatingMenu
                                floatingMenuMinWidth={72}
                                showSelectedCheck={false}
                                ariaLabel={`${chordAssignmentLabel(assignment)} button`}
                                renderValue={(label, value) => <ChordButtonGlyphOption label={label} value={value} />}
                                renderOption={(label, value) => <ChordButtonGlyphOption label={label} value={value} />}
                                onChange={(value) => updateChordAssignmentButton(assignment.id, value)}
                              />
                            </div>
                            <span className="chords-function-connector" aria-hidden="true" />
                            <CustomSelect
                              value={assignment.functionId}
                              options={chordFunctionOptions}
                              disabled={pendingAction !== null}
                              className="chords-assignment-function-select"
                              floatingMenu
                              ariaLabel={`${chordAssignmentLabel(assignment)} function`}
                              renderValue={(label) => (
                                <span className="chords-function-option">
                                  <strong>{label}</strong>
                                  <small>{func ? chordFunctionSummary(func) : 'Missing function'}</small>
                                </span>
                              )}
                              renderOption={(label, value) => {
                                const optionFunction = chordFunctions.find((candidate) => candidate.id === value);
                                return (
                                  <span className="chords-function-option">
                                    <strong>{label}</strong>
                                    <small>{optionFunction ? chordFunctionSummary(optionFunction) : 'Missing function'}</small>
                                  </span>
                                );
                              }}
                              onChange={(value) => setChordAssignmentFunction(assignment.id, value)}
                            />
                            <button
                              className="heading-icon-action"
                              type="button"
                              title="Remove assignment"
                              disabled={pendingAction !== null}
                              onClick={() => deleteChordAssignment(assignment.id)}
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        );
                        })}
                        </>
                      ) : (
                        <div className="chords-empty chords-empty-assignments">
                          <IconDeviceGamepad3 size={26} />
                          <strong>No assignments</strong>
                          <span>Use New Chord to pair a starter, button, and function.</span>
                        </div>
                      )}
                    </div>
                    {chordAssignmentScrollbar.visible ? (
                      <div className="chords-assignment-scrollbar" aria-hidden="true">
                        <div
                          className="chords-assignment-scrollbar-thumb"
                          style={{
                            height: `${chordAssignmentScrollbar.height}px`,
                            transform: `translateY(${chordAssignmentScrollbar.top}px)`
                          }}
                          onPointerDown={startChordAssignmentScrollbarDrag}
                        />
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>
          </div>

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
                    disabled={!connected || pendingAction !== null || hapticsCommitPending || speakerVolumeCommitPending || lightbarCommitPending}
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
                        <strong className={`health-label ${systemHealthTone}`}>
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
        </div>
      </section>
      </main>

      {startupTutorialStep !== 'done' && (
        <StartupTutorial
          step={startupTutorialStep}
          featureExampleActive={startupTutorialFeatureActive}
          supportCountdown={startupTutorialSupportCountdown}
          kofiBadgeUrl={kofiBadgeUrl}
          onFeatureExampleToggle={() => setStartupTutorialFeatureActive((active) => !active)}
          onFeatureStepComplete={() => setStartupTutorialStep('support')}
          onSupport={() => void window.bridge.openExternal('https://ko-fi.com/sundaymoments')}
          onFinish={() => {
            saveStartupTutorialCompleted();
            setStartupTutorialStep('done');
          }}
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

      {chordFunctionDialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeChordFunctionDialog}
        >
          <form
            className="settings-menu bridge-settings-modal remap-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Chord function"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              submitChordFunctionDialog();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                {chordFunctionDialog.mode === 'delete' ? <Trash2 size={16} /> : <Pencil size={16} />}
                <span>
                  {chordFunctionDialog.mode === 'delete' ? 'Delete Function' : 'Rename Function'}
                </span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close chord function dialog"
                onClick={closeChordFunctionDialog}
              >
                <X size={16} />
              </button>
            </div>
            {chordFunctionDialog.mode === 'delete' ? (
              <p className="remap-profile-dialog-copy">
                Delete {chordFunctionDialogFunction?.name ?? 'this function'}?
              </p>
            ) : (
              <label className="remap-profile-name-field">
                <span>Function Name</span>
                <input
                  autoFocus
                  value={chordFunctionNameDraft}
                  maxLength={MAX_CHORD_FUNCTION_NAME_LENGTH}
                  onChange={(event) => setChordFunctionNameDraft(event.target.value)}
                />
              </label>
            )}
            <div className="remap-profile-dialog-actions">
              <button type="button" className="secondary-action" onClick={closeChordFunctionDialog}>
                Cancel
              </button>
              <button
                type="submit"
                className={`primary-action ${chordFunctionDialog.mode === 'delete' ? 'danger' : ''}`}
                disabled={pendingAction !== null || (chordFunctionDialog.mode !== 'delete' && chordFunctionNameDraft.trim().length === 0)}
              >
                {chordFunctionDialog.mode === 'delete' ? 'Delete' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {triggerLabProfileDialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeTriggerLabProfileDialog}
        >
          <form
            className="settings-menu bridge-settings-modal remap-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Trigger Lab profile"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              submitTriggerLabProfileDialog();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                {triggerLabProfileDialog.mode === 'delete' ? <Trash2 size={16} /> : <Save size={16} />}
                <span>
                  {triggerLabProfileDialog.mode === 'save'
                    ? 'Save Trigger Profile'
                    : triggerLabProfileDialog.mode === 'rename'
                      ? 'Rename Trigger Profile'
                      : 'Delete Trigger Profile'}
                </span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close Trigger Lab profile dialog"
                onClick={closeTriggerLabProfileDialog}
              >
                <X size={16} />
              </button>
            </div>
            {triggerLabProfileDialog.mode === 'delete' ? (
              <p className="remap-profile-dialog-copy">
                Delete {triggerLabProfileName(triggerLabDrafts[triggerLabProfileDialog.side].profileId)}?
              </p>
            ) : (
              <label className="remap-profile-name-field">
                <span>Profile Name</span>
                <input
                  autoFocus
                  value={triggerLabProfileNameDraft}
                  maxLength={48}
                  onChange={(event) => setTriggerLabProfileNameDraft(event.target.value)}
                />
              </label>
            )}
            <div className="remap-profile-dialog-actions">
              <button type="button" className="secondary-action" onClick={closeTriggerLabProfileDialog}>
                Cancel
              </button>
              <button
                type="submit"
                className={`primary-action ${triggerLabProfileDialog.mode === 'delete' ? 'danger' : ''}`}
                disabled={pendingAction !== null || (triggerLabProfileDialog.mode !== 'delete' && triggerLabProfileNameDraft.trim().length === 0)}
              >
                {triggerLabProfileDialog.mode === 'delete' ? 'Delete' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {remapProfileDialogMode && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeRemapProfileDialog}
        >
          <form
            className="settings-menu bridge-settings-modal remap-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Button remapping profile"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              submitRemapProfileDialog();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                {remapProfileDialogMode === 'delete' ? <Trash2 size={16} /> : <Save size={16} />}
                <span>
                  {remapProfileDialogMode === 'save'
                    ? 'Save New Profile'
                    : remapProfileDialogMode === 'rename'
                      ? 'Rename Profile'
                      : 'Delete Profile'}
                </span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close profile dialog"
                onClick={closeRemapProfileDialog}
              >
                <X size={16} />
              </button>
            </div>
            {remapProfileDialogMode === 'delete' ? (
              <p className="remap-profile-dialog-copy">
                Delete {selectedRemapProfile?.name ?? 'this profile'}?
              </p>
            ) : (
              <label className="remap-profile-name-field">
                <span>Profile Name</span>
                <input
                  autoFocus
                  value={remapProfileNameDraft}
                  maxLength={48}
                  onChange={(event) => setRemapProfileNameDraft(event.target.value)}
                />
              </label>
            )}
            <div className="remap-profile-dialog-actions">
              <button type="button" className="secondary-action" onClick={closeRemapProfileDialog}>
                Cancel
              </button>
              <button
                type="submit"
                className={`primary-action ${remapProfileDialogMode === 'delete' ? 'danger' : ''}`}
                disabled={pendingAction !== null || (remapProfileDialogMode !== 'delete' && remapProfileNameDraft.trim().length === 0)}
              >
                {remapProfileDialogMode === 'delete' ? 'Delete' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

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

      {showBridgeSettings && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setShowBridgeSettings(false)}
        >
          <div
            className="settings-menu bridge-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Bridge settings"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <SettingsIcon size={16} />
                <span>Bridge Settings</span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close bridge settings"
                onClick={() => setShowBridgeSettings(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="bridge-settings-columns">
              <div className="bridge-settings-column">
                <div className="settings-menu-section-label">Appearance</div>
                <div className="settings-menu-row">
                  <div className="settings-menu-copy">
                    <strong>Theme</strong>
                  </div>
                  <CustomSelect
                    value={snapshot.settings.uiThemePreset}
                    options={UI_THEME_OPTIONS}
                    className="settings-theme-select"
                    showSelectedCheck={false}
                    ariaLabel="UI theme"
                    disabled={pendingAction !== null}
                    renderValue={(label, value) => <ThemeOption label={label} value={value} />}
                    renderOption={(label, value) => <ThemeOption label={label} value={value} />}
                    onChange={(value) => {
                      void runAction('ui-theme', () => window.bridge.setUiThemePreset(value));
                    }}
                  />
                </div>
                <div className="settings-menu-row">
                  <div className="settings-menu-copy">
                    <strong>UI Scale</strong>
                  </div>
                  <CustomSelect
                    value={snapshot.settings.uiScalePercent}
                    options={UI_SCALE_OPTIONS}
                    className="settings-scale-select"
                    showSelectedCheck={false}
                    ariaLabel="UI scale"
                    disabled={pendingAction !== null}
                    onChange={(value) => {
                      void runAction('ui-scale', () => window.bridge.setUiScalePercent(value));
                    }}
                  />
                </div>
                <div className="settings-menu-section-label">General</div>
                <div className="settings-menu-row">
                  <div className="settings-menu-copy">
                    <strong>Launch at Startup</strong>
                    <span>Start in the tray when Windows starts</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.launchAtStartupEnabled}
                    className={`switch ${snapshot.settings.launchAtStartupEnabled ? 'on' : ''}`}
                    disabled={pendingAction !== null}
                    onClick={() => void runAction('launch-at-startup', () => (
                      window.bridge.setLaunchAtStartupEnabled(!snapshot.settings.launchAtStartupEnabled)
                    ))}
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-menu-row">
                  <div className="settings-menu-copy">
                    <strong>Battery Tray Icon</strong>
                    <span>Show controller battery percentage in the tray</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.showBatteryPercentTrayIcon}
                    className={`switch ${snapshot.settings.showBatteryPercentTrayIcon ? 'on' : ''}`}
                    disabled={pendingAction !== null}
                    onClick={() => void runAction('battery-tray-icon', () => (
                      window.bridge.setShowBatteryPercentTrayIcon(!snapshot.settings.showBatteryPercentTrayIcon)
                    ))}
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-menu-row">
                  <div className="settings-menu-copy">
                    <strong>Pico LED</strong>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.ledEnabled}
                    className={`switch ${snapshot.settings.ledEnabled ? 'on' : ''}`}
                    disabled={!connected}
                    onClick={() => void runAction('led', () => window.bridge.setLedEnabled(!snapshot.settings.ledEnabled))}
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-menu-section-label">Connection Behavior</div>
                <div className="settings-menu-row">
                  <div className="settings-menu-copy">
                    <strong>Idle Disconnect</strong>
                  </div>
                  <div className="settings-menu-controls">
                    <CustomSelect
                      value={snapshot.settings.idleDisconnectTimeoutMinutes}
                      options={IDLE_DISCONNECT_TIMEOUT_OPTIONS}
                      className="settings-timeout-select"
                      showSelectedCheck={false}
                      ariaLabel="Idle disconnect timeout"
                      disabled={!connected || !snapshot.settings.idleDisconnectEnabled}
                      onChange={(value) => {
                        void runAction('idle-timeout', () => window.bridge.setIdleDisconnectTimeoutMinutes(value));
                      }}
                    />
                    <button
                      type="button"
                      role="switch"
                      aria-checked={snapshot.settings.idleDisconnectEnabled}
                      className={`switch ${snapshot.settings.idleDisconnectEnabled ? 'on' : ''}`}
                      disabled={!connected}
                      onClick={() => void runAction('idle', () => (
                        window.bridge.setIdleDisconnectEnabled(!snapshot.settings.idleDisconnectEnabled)
                      ))}
                    >
                      <span />
                    </button>
                  </div>
                </div>
                <div className="settings-menu-row">
                  <div className="settings-menu-copy">
                    <strong>PC Sleep Disconnect</strong>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.usbSuspendDisconnectEnabled}
                    className={`switch ${snapshot.settings.usbSuspendDisconnectEnabled ? 'on' : ''}`}
                    disabled={!connected || !usbSuspendDisconnectSupported}
                    onClick={() => void runAction('usb-suspend', () => (
                      window.bridge.setUsbSuspendDisconnectEnabled(!snapshot.settings.usbSuspendDisconnectEnabled)
                    ))}
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-menu-row pico-firmware-row">
                  <div className="pico-firmware-header">
                    <strong>Firmware</strong>
                    <div className="pico-firmware-actions">
                      <button
                        type="button"
                        className="heading-action danger"
                        disabled={pendingAction !== null}
                        onClick={nukePicoFlash}
                      >
                        <IconRadioactive size={14} />
                        {pendingAction === 'pico-firmware-nuke' ? 'Nuking...' : 'Nuke'}
                      </button>
                      <div className="pico-firmware-dual-action" role="group" aria-label="Pico firmware bootloader actions">
                        <button
                          type="button"
                          className="heading-action"
                          disabled={pendingAction !== null}
                          onClick={mountPicoBootloader}
                        >
                          <IconUsb size={14} />
                          {pendingAction === 'pico-firmware-mount' ? 'Mounting...' : 'Mount'}
                        </button>
                        <button
                          type="button"
                          className="heading-action"
                          disabled={pendingAction !== null}
                          onClick={flashPicoFirmware}
                        >
                          <IconUpload size={14} />
                          {pendingAction === 'pico-firmware-flash' ? 'Flashing...' : 'Flash'}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="settings-menu-copy pico-firmware-copy">
                    <span>Mount reboots the Pico into UF2 mode. Flash copies a selected firmware UF2. Nuke wipes flash with Pico Universal Flash Nuke.</span>
                    {picoFirmwareMessage ? (
                      <span className="pico-firmware-message good">{picoFirmwareMessage}</span>
                    ) : null}
                    {picoFirmwareError ? (
                      <span className="pico-firmware-message bad">{picoFirmwareError}</span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="bridge-settings-column">
                <div className="settings-menu-section-label">Power & Controller</div>
                <div className={`settings-menu-row ${settingsFocusTarget === 'controller-power-saving' ? 'settings-menu-row-highlight' : ''}`}>
                  <div className="settings-menu-copy">
                    <strong>Controller Power Saving</strong>
                    <span>Caps haptics, triggers, and lightbar brightness at 60% while headphones are plugged in</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.controllerPowerSavingEnabled}
                    className={`switch ${snapshot.settings.controllerPowerSavingEnabled ? 'on' : ''}`}
                    disabled={pendingAction !== null}
                    onClick={() => void runAction('controller-power-saving', () => (
                      window.bridge.setControllerPowerSavingEnabled(!snapshot.settings.controllerPowerSavingEnabled)
                    ))}
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-menu-row">
                  <div className="settings-menu-copy">
                    <strong>Player Slot LED</strong>
                    <span>Show the controller player indicator lights</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.playerLedEnabled}
                    className={`switch ${snapshot.settings.playerLedEnabled ? 'on' : ''}`}
                    disabled={!connected}
                    onClick={() => void runAction('player-led', () => (
                      window.bridge.setPlayerLedEnabled(!snapshot.settings.playerLedEnabled)
                    ))}
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-menu-section-label">Shortcuts</div>
                <div className={`settings-menu-row ${settingsFocusTarget === 'sleep-shortcut' ? 'settings-menu-row-highlight' : ''}`}>
                  <div className="settings-menu-copy settings-menu-copy-tooltip">
                    <strong>Sleep Shortcut</strong>
                    <div className="settings-shortcut-tooltip shortcut-glyph-tooltip" role="tooltip">
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
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.sleepKeybindEnabled}
                    className={`switch ${snapshot.settings.sleepKeybindEnabled ? 'on' : ''}`}
                    disabled={!connected || !sleepControllerSupported || pendingAction !== null}
                    onClick={() => void runAction('sleep-keybind', () => (
                      window.bridge.setSleepKeybindEnabled(!snapshot.settings.sleepKeybindEnabled)
                    ))}
                  >
                    <span />
                  </button>
                </div>
                <div className={`settings-menu-row ${settingsFocusTarget === 'volume-shortcut' ? 'settings-menu-row-highlight' : ''}`}>
                  <div className="settings-menu-copy settings-menu-copy-tooltip">
                    <strong>Volume Shortcut</strong>
                    <div className="settings-shortcut-tooltip shortcut-glyph-tooltip" role="tooltip">
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
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.speakerVolumeShortcutEnabled}
                    className={`switch ${snapshot.settings.speakerVolumeShortcutEnabled ? 'on' : ''}`}
                    disabled={!connected}
                    onClick={() => void runAction('volume-shortcut', () => (
                      window.bridge.setSpeakerVolumeShortcutEnabled(!snapshot.settings.speakerVolumeShortcutEnabled)
                    ))}
                  >
                    <span />
                  </button>
                </div>
                <div className="settings-menu-section-label">About</div>
                <button
                  type="button"
                  className="settings-menu-link-row"
                  onClick={() => void window.bridge.openExternal('https://github.com/SundayMoments')}
                >
                  <span className="settings-menu-link-icon" aria-hidden="true">
                    <IconBrandGithub size={18} />
                  </span>
                  <span className="settings-menu-link-copy">
                    <strong>GitHub</strong>
                    <span>SundayMoments</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
