import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  type TablerIcon,
  IconAdjustmentsSpark,
  IconActivity as Activity,
  IconAdjustmentsHorizontal as Settings2,
  IconAdjustmentsHorizontal as SlidersHorizontal,
  IconArrowRight as ArrowRight,
  IconBatteryEco,
  IconBell as Bell,
  IconBinary,
  IconBolt as Zap,
  IconBulb,
  IconCheck as Check,
  IconChevronDown as ChevronDown,
  IconCpu,
  IconDeviceFloppy as Save,
  IconDeviceGamepad2,
  IconDeviceGamepad3,
  IconBrandGithub,
  IconDeviceMobileVibration as Vibrate,
  IconHeadphones as Headphones,
  IconKeyboard as Keyboard,
  IconLayoutDashboard,
  IconMicrophone as Mic,
  IconMinus as Minus,
  IconMoon as Moon,
  IconPalette as Palette,
  IconPencil as Pencil,
  IconPlayerPlay as Play,
  IconQuestionMark,
  IconRefresh as RefreshCcw,
  IconRipple,
  IconSettings as SettingsIcon,
  IconBluetooth,
  IconSparkleHighlight,
  IconSparkles as Sparkles,
  IconStethoscope,
  IconTestPipe,
  IconTool,
  IconTrash as Trash2,
  IconVolume,
  IconVolume as Volume2,
  IconVolumeOff as VolumeX,
  IconX as X
} from '@tabler/icons-react';
import kofiBadgeUrl from '../../../assets/brand/support_me_on_kofi_badge_dark.png';
import bridgeMarkUrl from '../../../assets/controllers/ds5-bridge_mark.svg';
import controllerImage from '../../../assets/controllers/dualsense-edge-front.svg';
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
import { DEFAULT_BUTTON_REMAP_PROFILE_ID, DEFAULT_CONTROLLER_PROFILE_ID, REMAP_BUTTON_IDS, ackResultName } from '../shared/protocol';
import type {
  ControllerProfileSettings,
  MuteButtonMode,
  MuteKeyboardBehavior,
  PollingRateMode,
  RemapButtonId,
  TriggerTestMode,
  TriggerTestTarget
} from '../shared/protocol';
import type { BridgeSnapshot, UiScalePercent } from '../shared/types';

type ControlTab = 'overview' | 'haptics' | 'audio' | 'triggers' | 'lighting' | 'remapping' | 'system';
type RemapButtonDefinition = {
  id: RemapButtonId;
  label: string;
  glyphUrl?: string;
  textGlyph?: string;
};
type DualSenseEdgeRemapButtonId = Extract<RemapButtonId, 'lb' | 'rb' | 'lfn' | 'rfn'>;
type StandardRemapButtonId = Exclude<RemapButtonId, DualSenseEdgeRemapButtonId>;
type RemapProfileDialogMode = 'save' | 'rename' | 'delete';
type ControllerProfileDialogMode = 'save' | 'rename' | 'delete';
type RemapCalloutLayout = {
  top: number;
  points: string;
};
type LightbarPaletteCell = {
  color: string;
  name: string;
};
type FeatureTipsPanelProps = {
  tab: 'audio' | 'haptics' | 'triggers' | 'lighting';
  onSettingsFocusRequest?: (target: SettingsFocusTarget) => void;
  onFeatureFocusRequest?: (target: FeatureFocusTarget) => void;
  hostEncodingTipActionable?: boolean;
};
type SettingsFocusTarget = 'controller-power-saving' | 'sleep-shortcut' | 'volume-shortcut';
type NotificationFocusTarget = 'controller-status' | 'low-battery';
type FeatureFocusTarget = 'host-encoding';

const HAPTICS_STEP = 20;
const SPEAKER_VOLUME_STEP = 10;
const MIC_VOLUME_STEP = 10;
const LIGHTBAR_BRIGHTNESS_STEP = 10;
const TRIGGER_EFFECT_STEP = 10;
const CONTROLLER_POWER_SAVING_CAP_PERCENT = 60;
const TEST_HAPTICS_LOCK_MS = 1100;
const TEST_SPEAKER_LOCK_MS = 900;
const TEST_MIC_LISTEN_MS = 5000;
const TEST_SPEAKER_VOLUME_SETTLE_MS = 90;
const HOST_AUDIO_INITIAL_START_GRACE_MS = 2500;
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
const HAPTICS_SLIDER_TICKS = Array.from({ length: 11 }, (_, index) => index * 20);
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
const MUTE_BUTTON_MODE_OPTIONS: Array<[string, MuteButtonMode]> = [
  ['Normal', 'normal'],
  ['Keyboard Key', 'keyboard'],
  ['Quiet Toggle', 'quiet']
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
  rfn: { id: 'rfn', label: 'Right Function Button', textGlyph: 'RFN' }
};
const REMAP_LEFT_BUTTON_IDS: StandardRemapButtonId[] = ['l2', 'l1', 'create', 'dpad-up', 'dpad-left', 'dpad-down', 'dpad-right', 'l3'];
const REMAP_RIGHT_BUTTON_IDS: StandardRemapButtonId[] = ['r2', 'r1', 'options', 'triangle', 'circle', 'cross', 'square', 'r3'];
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
const REMAP_ALL_BUTTON_IDS = [...REMAP_BUTTON_IDS] as RemapButtonId[];
const REMAP_STICK_CLICK_IDS: StandardRemapButtonId[] = ['l3', 'r3'];
const REMAP_TARGET_OPTIONS: Array<[string, StandardRemapButtonId]> = [
  ...REMAP_STANDARD_BUTTON_IDS
].map((id) => [REMAP_BUTTONS[id].label, id]);
const DEFAULT_REMAP_DRAFT = Object.fromEntries(
  REMAP_ALL_BUTTON_IDS.map((id) => [id, id])
) as Record<RemapButtonId, RemapButtonId>;
const REMAP_STICK_CLICK_TARGET_OPTIONS: Array<[string, StandardRemapButtonId]> = REMAP_STICK_CLICK_IDS.map((id) => [
  REMAP_BUTTONS[id].label,
  id
]);
const REMAP_SVG_VIEWBOX_WIDTH = 597.47;
const REMAP_SVG_VIEWBOX_HEIGHT = 429.39;
const REMAP_CALLOUT_POINTS: Record<StandardRemapButtonId, Array<[number, number]>> = {
  l2: [[2.4, 3.17], [117.91, 3.17], [171.1, 93.49]],
  l1: [[2.4, 63.71], [129.99, 63.71], [161.13, 118.36]],
  create: [[2.4, 124.24], [110.86, 124.24], [134, 163], [186.65, 162.89]],
  'dpad-up': [[2.4, 184.78], [146.83, 184.78]],
  'dpad-right': [[2.4, 245.32], [126.31, 245.32], [138.09, 221.25]],
  'dpad-down': [[2.4, 305.86], [124.63, 305.86], [162.42, 241.39]],
  'dpad-left': [[2.4, 366.39], [106.55, 366.39], [189.13, 221.85]],
  l3: [[2.4, 426.93], [143.77, 426.93], [230.4, 275.47]],
  r2: [[595.34, 3.17], [480.78, 3.17], [427.95, 93.94]],
  r1: [[595.34, 63.71], [468.92, 63.71], [437.92, 117.79]],
  options: [[595.34, 124.24], [487.5, 124.24], [464.28, 162.89], [411.62, 162.89]],
  triangle: [[595.34, 184.78], [453.97, 184.78]],
  circle: [[595.34, 245.32], [486.88, 245.32], [473.71, 222.09]],
  cross: [[595.34, 305.86], [472.22, 305.86], [438.56, 248.84]],
  square: [[595.34, 366.39], [485.42, 366.39], [405.35, 223.46]],
  r3: [[595.34, 426.93], [453.97, 426.93], [369.45, 275.47]]
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
type CustomSelectProps<T extends SelectValue> = {
  value: T;
  options: Array<[string, T]>;
  disabled?: boolean;
  className?: string;
  showSelectedCheck?: boolean;
  renderValue?: (label: string, value: T) => ReactNode;
  renderOption?: (label: string, value: T) => ReactNode;
  ariaLabel: string;
  onChange: (value: T) => void;
};

function snapHapticsValue(value: number): number {
  return Math.max(0, Math.min(200, Math.round(value / HAPTICS_STEP) * HAPTICS_STEP));
}

function snapSpeakerVolume(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / SPEAKER_VOLUME_STEP) * SPEAKER_VOLUME_STEP));
}

function snapMicVolume(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / MIC_VOLUME_STEP) * MIC_VOLUME_STEP));
}

function snapLightbarBrightness(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / LIGHTBAR_BRIGHTNESS_STEP) * LIGHTBAR_BRIGHTNESS_STEP));
}

function snapTriggerEffectIntensity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / TRIGGER_EFFECT_STEP) * TRIGGER_EFFECT_STEP));
}

function controllerPowerSavingActiveFromSnapshot(snapshot: BridgeSnapshot | null | undefined): boolean {
  return Boolean(snapshot?.settings.controllerPowerSavingEnabled && snapshot.diagnostics.hostAudioStatus?.headsetPlugged);
}

function capControllerPowerSavingValue(value: number, snapshot: BridgeSnapshot | null | undefined): number {
  return controllerPowerSavingActiveFromSnapshot(snapshot)
    ? Math.min(value, CONTROLLER_POWER_SAVING_CAP_PERCENT)
    : value;
}

function displayHapticsValue(snapshot: BridgeSnapshot): number {
  return snapHapticsValue(capControllerPowerSavingValue(snapshot.settings.hapticsGainPercent, snapshot));
}

function displayClassicRumbleValue(snapshot: BridgeSnapshot): number {
  return snapHapticsValue(capControllerPowerSavingValue(snapshot.settings.classicRumbleGainPercent, snapshot));
}

function displayLightbarBrightnessValue(snapshot: BridgeSnapshot): number {
  return snapLightbarBrightness(capControllerPowerSavingValue(snapshot.settings.lightbarBrightnessPercent, snapshot));
}

function displayTriggerEffectIntensityValue(snapshot: BridgeSnapshot): number {
  return snapTriggerEffectIntensity(capControllerPowerSavingValue(snapshot.settings.triggerEffectIntensityPercent, snapshot));
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

function FeatureTipsPanel({
  tab,
  onSettingsFocusRequest,
  onFeatureFocusRequest,
  hostEncodingTipActionable = false
}: FeatureTipsPanelProps) {
  const [featureTileSampleActive, setFeatureTileSampleActive] = useState(false);
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

  if (tab === 'audio') {
    tips.push({
      key: 'host-encoding',
      icon: <Headphones size={16} />,
      title: 'Headphones',
      text: 'Use Host Encoding when listening through the controller headphone jack.'
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

  if (tab === 'lighting') {
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
            className={[
              'feature-help-item',
              tip.key === 'host-encoding' && hostEncodingTipActionable ? 'feature-help-item-attention' : ''
            ].filter(Boolean).join(' ')}
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
            ) : tip.key === 'host-encoding' && hostEncodingTipActionable ? (
              <button
                className="feature-help-icon feature-help-icon-button"
                type="button"
                aria-label="Highlight Host Encoding"
                onClick={() => onFeatureFocusRequest?.('host-encoding')}
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
    classicRumbleEnabled: snapshot.settings.classicRumbleEnabled,
    classicRumbleGainPercent: snapshot.settings.classicRumbleGainPercent,
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
    sleepKeybindEnabled: snapshot.settings.sleepKeybindEnabled,
    speakerVolumeShortcutEnabled: snapshot.settings.speakerVolumeShortcutEnabled,
    pollingRateMode: snapshot.settings.pollingRateMode,
    hostEncodedAudioEnabled: snapshot.settings.hostEncodedAudioEnabled,
    duplexMicEnabled: snapshot.settings.duplexMicEnabled,
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
  return [...modifiers, key].join(' + ');
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
          <div><dt>Host Encoding</dt><dd>{enabledLabel(settings.hostEncodedAudioEnabled)}</dd></div>
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
  if (snapshot.state !== 'connected') return snapshot.message;
  if (snapshot.diagnostics.lastError) return snapshot.diagnostics.lastError;
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
  showSelectedCheck = true,
  renderValue,
  renderOption,
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

  function updateMenuMaxHeight() {
    const root = rootRef.current;
    if (!root) {
      setMenuMaxHeight(defaultMenuMaxHeight);
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const boundary = root.closest('.system-card, .feature-card, .settings-menu, .control-page') as HTMLElement | null;
    const boundaryRect = boundary?.getBoundingClientRect();
    const menuGap = 6;
    const lowerLimit = Math.min(window.innerHeight, boundaryRect?.bottom ?? window.innerHeight);
    const upperLimit = Math.max(0, boundaryRect?.top ?? 0);
    const spaceBelow = Math.max(1, Math.floor(lowerLimit - rootRect.bottom - menuGap));
    const spaceAbove = Math.max(1, Math.floor(rootRect.top - upperLimit - menuGap));
    const nextPlacement = spaceBelow < 92 && spaceAbove > spaceBelow ? 'top' : 'bottom';
    const availableSpace = nextPlacement === 'top' ? spaceAbove : spaceBelow;
    const nextMaxHeight = longList ? availableSpace : Math.min(defaultMenuMaxHeight, availableSpace);

    setMenuPlacement(nextPlacement);
    setMenuMaxHeight(Math.max(1, nextMaxHeight));
  }

  useEffect(() => {
    if (!open) return undefined;
    function closeIfOutside(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', closeIfOutside);
    return () => document.removeEventListener('mousedown', closeIfOutside);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    updateMenuMaxHeight();
    window.addEventListener('resize', updateMenuMaxHeight);
    window.addEventListener('scroll', updateMenuMaxHeight, true);
    return () => {
      window.removeEventListener('resize', updateMenuMaxHeight);
      window.removeEventListener('scroll', updateMenuMaxHeight, true);
    };
  }, [open, defaultMenuMaxHeight, longList]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      const menu = menuRef.current;
      const selectedElement = menu?.querySelector('[data-selected="true"]') as HTMLElement | null;
      if (!menu || !selectedElement) {
        return;
      }
      const selectedCenter = selectedElement.offsetTop + selectedElement.offsetHeight / 2;
      menu.scrollTop = Math.max(0, selectedCenter - menu.clientHeight / 2);
    });
  }, [open]);

  function choose(nextValue: T) {
    setOpen(false);
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
      {open && (
        <div ref={menuRef} className="custom-select-menu" role="listbox" aria-label={ariaLabel}>
          {options.map(([label, optionValue]) => {
            const selectedOption = optionValue === value;
            return (
              <button
                key={String(optionValue)}
                type="button"
                role="option"
                aria-selected={selectedOption}
                data-selected={selectedOption ? 'true' : undefined}
                className={selectedOption ? 'selected' : ''}
                onClick={() => choose(optionValue)}
              >
                <span>{renderOption?.(label, optionValue) ?? label}</span>
                {showSelectedCheck && selectedOption && <Check size={15} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
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

function remapTargetOptionsFor(buttonId: RemapButtonId): Array<[string, RemapButtonId]> {
  if ((REMAP_EDGE_BUTTON_IDS as readonly RemapButtonId[]).includes(buttonId)) {
    return [[REMAP_BUTTONS[buttonId].label, buttonId], ...REMAP_TARGET_OPTIONS];
  }
  return (REMAP_STICK_CLICK_IDS as readonly RemapButtonId[]).includes(buttonId)
    ? REMAP_STICK_CLICK_TARGET_OPTIONS
    : REMAP_TARGET_OPTIONS;
}

export function App() {
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [activeControlTab, setActiveControlTab] = useState<ControlTab>('overview');
  const [hapticsValue, setHapticsValue] = useState(100);
  const [classicRumbleValue, setClassicRumbleValue] = useState(100);
  const [speakerVolumeValue, setSpeakerVolumeValue] = useState(100);
  const [micVolumeValue, setMicVolumeValue] = useState(100);
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
  const [remapDraft, setRemapDraft] = useState<Record<RemapButtonId, RemapButtonId>>(DEFAULT_REMAP_DRAFT);
  const [remapProfileDialogMode, setRemapProfileDialogMode] = useState<RemapProfileDialogMode | null>(null);
  const [remapProfileNameDraft, setRemapProfileNameDraft] = useState('');
  const [controllerProfileDialogMode, setControllerProfileDialogMode] = useState<ControllerProfileDialogMode | null>(null);
  const [controllerProfileNameDraft, setControllerProfileNameDraft] = useState('');
  const [remapCalloutLayout, setRemapCalloutLayout] = useState<Record<StandardRemapButtonId, RemapCalloutLayout> | null>(null);
  const [hoveredRemapButton, setHoveredRemapButton] = useState<RemapButtonId | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [showBridgeSettings, setShowBridgeSettings] = useState(false);
  const [settingsFocusTarget, setSettingsFocusTarget] = useState<SettingsFocusTarget | null>(null);
  const [notificationFocusTarget, setNotificationFocusTarget] = useState<NotificationFocusTarget | null>(null);
  const [featureFocusTarget, setFeatureFocusTarget] = useState<FeatureFocusTarget | null>(null);
  const [featureFocusPulse, setFeatureFocusPulse] = useState(0);
  const [showNotificationsMenu, setShowNotificationsMenu] = useState(false);
  const [showClassicRumbleControl, setShowClassicRumbleControl] = useState(false);
  const [showMicrophoneControl, setShowMicrophoneControl] = useState(false);
  const [windowDragging, setWindowDragging] = useState(false);
  const [testLocked, setTestLocked] = useState(false);
  const [speakerTestLocked, setSpeakerTestLocked] = useState(false);
  const [speakerOutputAvailable, setSpeakerOutputAvailable] = useState<boolean | null>(null);
  const [speakerTestError, setSpeakerTestError] = useState<string | null>(null);
  const [micTestLocked, setMicTestLocked] = useState(false);
  const [micTestError, setMicTestError] = useState<string | null>(null);
  const [triggerTestLocked, setTriggerTestLocked] = useState(false);
  const [hapticsCommitPending, setHapticsCommitPending] = useState(false);
  const [classicRumbleCommitPending, setClassicRumbleCommitPending] = useState(false);
  const [speakerVolumeCommitPending, setSpeakerVolumeCommitPending] = useState(false);
  const [micVolumeCommitPending, setMicVolumeCommitPending] = useState(false);
  const [lightbarCommitPending, setLightbarCommitPending] = useState(false);
  const [overviewSleepConfirmVisible, setOverviewSleepConfirmVisible] = useState(false);
  const [hostEncodingDisableConfirmVisible, setHostEncodingDisableConfirmVisible] = useState(false);
  const [deviceCleanupConfirmVisible, setDeviceCleanupConfirmVisible] = useState(false);
  const [deviceCleanupMessage, setDeviceCleanupMessage] = useState<string | null>(null);
  const [deviceCleanupError, setDeviceCleanupError] = useState<string | null>(null);
  const hapticsEditingRef = useRef(false);
  const classicRumbleEditingRef = useRef(false);
  const speakerVolumeEditingRef = useRef(false);
  const micVolumeEditingRef = useRef(false);
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
  const featureFocusTimerRef = useRef<number | null>(null);
  const windowDraggingRef = useRef(false);
  const windowDragReleaseTimerRef = useRef<number | null>(null);
  const deferredSnapshotRef = useRef<BridgeSnapshot | null>(null);
  const overviewSleepConfirmArmedRef = useRef(false);
  const appOpenedAtRef = useRef(Date.now());
  const connected = snapshot?.state === 'connected';
  const showDualSenseEdgeRemapButtons = snapshot?.status?.controllerType === 'dualsense-edge';
  const remapModifiedCount = useMemo(() => (
    REMAP_ALL_BUTTON_IDS.filter((buttonId) => remapDraft[buttonId] !== buttonId).length
  ), [remapDraft]);
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

  useEffect(() => {
    let cancelled = false;
    window.bridge.getStatus().then((next) => {
      if (!cancelled) {
        applySnapshot(next);
      }
    });
    const unsubscribe = window.bridge.onSnapshot((next) => {
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
      if (featureFocusTimerRef.current !== null) {
        window.clearTimeout(featureFocusTimerRef.current);
      }
      if (windowDragReleaseTimerRef.current !== null) {
        window.clearTimeout(windowDragReleaseTimerRef.current);
      }
      window.removeEventListener('mouseup', finishWindowDrag);
      window.removeEventListener('blur', finishWindowDrag);
    };
  }, []);

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
      const viewBoxAspect = REMAP_SVG_VIEWBOX_WIDTH / REMAP_SVG_VIEWBOX_HEIGHT;
      const renderedSvgHeight = Math.min(artHeight, artWidth / viewBoxAspect);
      const renderedSvgWidth = renderedSvgHeight * viewBoxAspect;
      const renderedSvgTop = artTop + (artHeight - renderedSvgHeight) / 2;
      const renderedSvgLeft = artLeft + (artWidth - renderedSvgWidth) / 2;
      const nextLayout = {} as Record<StandardRemapButtonId, RemapCalloutLayout>;
      const mapSvgPoint = ([x, y]: [number, number]) => (
        `${renderedSvgLeft + (x / REMAP_SVG_VIEWBOX_WIDTH) * renderedSvgWidth},${renderedSvgTop + (y / REMAP_SVG_VIEWBOX_HEIGHT) * renderedSvgHeight}`
      );
      const remapPillEdgeX = (side: HTMLElement, buttonId: StandardRemapButtonId, edge: 'left' | 'right') => {
        const pill = side.querySelector<HTMLElement>(`[data-remap-button-id="${buttonId}"]`);
        if (!pill) {
          return edge === 'right' ? toLocalX(side.getBoundingClientRect().right) : toLocalX(side.getBoundingClientRect().left);
        }
        const pillRect = pill.getBoundingClientRect();
        return toLocalX(edge === 'right' ? pillRect.right : pillRect.left);
      };

      for (const buttonId of REMAP_LEFT_BUTTON_IDS) {
        const top = renderedSvgTop + (REMAP_CALLOUT_Y[buttonId] / REMAP_SVG_VIEWBOX_HEIGHT) * renderedSvgHeight - leftTop;
        const pillRightX = remapPillEdgeX(leftSideElement, buttonId, 'right');
        nextLayout[buttonId] = {
          top,
          points: [
            `${pillRightX},${leftTop + top}`,
            ...REMAP_CALLOUT_POINTS[buttonId].map(mapSvgPoint)
          ].join(' ')
        };
      }
      for (const buttonId of REMAP_RIGHT_BUTTON_IDS) {
        const top = renderedSvgTop + (REMAP_CALLOUT_Y[buttonId] / REMAP_SVG_VIEWBOX_HEIGHT) * renderedSvgHeight - rightTop;
        const pillLeftX = remapPillEdgeX(rightSideElement, buttonId, 'left');
        nextLayout[buttonId] = {
          top,
          points: [
            `${pillLeftX},${rightTop + top}`,
            ...REMAP_CALLOUT_POINTS[buttonId].map(mapSvgPoint)
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
  }, [activeControlTab]);

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
  const statusTone = connected ? 'good' : snapshot?.state === 'error' || snapshot?.state === 'incompatible' ? 'bad' : 'idle';
  const lastAck = snapshot?.diagnostics.lastAck;
  const speakerVolumeSupported = Boolean(snapshot?.status?.firmwareFlags.speakerVolumeControl);
  const lightbarSupported = Boolean(snapshot?.status?.firmwareFlags.lightbarControl);
  const lightbarOverrideSupported = Boolean(snapshot?.status?.firmwareFlags.lightbarOverrideControl);
  const muteButtonActionsSupported = Boolean(snapshot?.status?.firmwareFlags.muteButtonActions);
  const adaptiveTriggersSupported = Boolean(snapshot?.status?.firmwareFlags.adaptiveTriggersControl);
  const usbSuspendDisconnectSupported = Boolean(snapshot?.status?.firmwareFlags.usbSuspendDisconnectControl);
  const sleepControllerSupported = Boolean(snapshot?.status?.firmwareFlags.sleepControllerControl);
  const pollingRateControlSupported = Boolean(snapshot?.status?.firmwareFlags.pollingRateControl);
  const hapticsEnabled = Boolean(snapshot?.settings.hapticsEnabled);
  const classicRumbleEnabled = Boolean(snapshot?.settings.classicRumbleEnabled);
  const activeHapticsFeatureEnabled = showClassicRumbleControl ? classicRumbleEnabled : hapticsEnabled;
  const speakerEnabled = Boolean(snapshot?.settings.speakerEnabled);
  const adaptiveTriggersEnabled = Boolean(snapshot?.settings.adaptiveTriggersEnabled);
  const lightbarEnabled = Boolean(snapshot?.settings.lightbarEnabled);
  const sleepKeybindEnabled = Boolean(snapshot?.settings.sleepKeybindEnabled);
  const controllerToastEnabled = Boolean(snapshot?.settings.notifyControllerConnection);
  const lowBatteryToastEnabled = Boolean(snapshot?.settings.notifyLowBattery);
  const notificationsEnabled = controllerToastEnabled || lowBatteryToastEnabled;
  const controllerConnected = Boolean(snapshot?.status?.controllerConnected);
  const gameStreamActive = Boolean(snapshot?.status?.hostOutputRecent);
  const adaptiveTriggerOutputActive = Boolean(snapshot?.status?.adaptiveTriggerOutputRecent);
  const audioStreamActive = Boolean(snapshot?.status?.audioRecent && pendingAction !== 'speaker' && !speakerTestLocked);
  const hostAudioStatus = snapshot?.diagnostics.hostAudioStatus;
  const headsetOutputDetected = Boolean(hostAudioStatus?.headsetPlugged);
  const controllerPowerSavingActive = controllerPowerSavingActiveFromSnapshot(snapshot);
  const hapticsSliderMax = controllerPowerSavingActive ? CONTROLLER_POWER_SAVING_CAP_PERCENT : 200;
  const percentSliderMax = controllerPowerSavingActive ? CONTROLLER_POWER_SAVING_CAP_PERCENT : 100;
  const OutputIcon = headsetOutputDetected ? Headphones : Volume2;
  const outputControlLabel = headsetOutputDetected ? 'Headphones' : 'Speaker';
  const outputControlLower = headsetOutputDetected ? 'headphones' : 'speaker';
  const outputPresetLower = headsetOutputDetected ? 'headphones' : 'speaker';
  const hostAudioEnabled = Boolean(snapshot?.settings.hostEncodedAudioEnabled);
  const duplexMicEnabled = Boolean(snapshot?.settings.duplexMicEnabled);
  const audioEnabled = speakerEnabled || duplexMicEnabled;
  const hostAudioActive = hostAudioStatus?.mode === 'host-encoded-active';
  const initialHostAudioStartGrace = Date.now() - appOpenedAtRef.current < HOST_AUDIO_INITIAL_START_GRACE_MS;
  const hostAudioStarting = hostAudioEnabled
    && !hostAudioActive
    && (
      !hostAudioStatus
      || hostAudioStatus.fallbackReason === 'none'
      || hostAudioStatus.fallbackReason === 'host-disabled'
      || (initialHostAudioStartGrace && hostAudioStatus.fallbackReason === 'heartbeat-timeout')
    );
  const hostAudioLabel = !connected
    ? 'Unavailable'
    : hostAudioActive
      ? 'Host Encoding Active'
      : hostAudioStarting
        ? 'Starting Host Encoding'
      : hostAudioEnabled
        ? `Fallback: ${hostAudioStatus?.fallbackReason?.replaceAll('-', ' ') ?? 'pending'}`
        : 'Pico Local';
  const hostAudioTone = hostAudioActive
    ? 'good'
    : connected && hostAudioEnabled && !hostAudioStarting
      ? 'warn'
      : 'idle';
  const duplexMicLabel = hostAudioStatus?.duplexActive
    ? 'Duplex Active'
    : duplexMicEnabled
      ? 'Disabled in Fallback'
      : 'Off';
  const speakerOutputMissing = false;
  const testHapticsUnavailable = !connected
    || !hapticsEnabled
    || pendingAction !== null
    || speakerVolumeCommitPending
    || lightbarCommitPending
    || testLocked
    || gameStreamActive
    || audioStreamActive
    || Boolean(snapshot?.status?.testHapticsBusy)
    || Boolean(snapshot?.status?.testHapticsCooldown);
  const testRumbleUnavailable = !connected
    || !classicRumbleEnabled
    || pendingAction !== null
    || speakerVolumeCommitPending
    || lightbarCommitPending
    || testLocked
    || gameStreamActive
    || audioStreamActive
    || Boolean(snapshot?.status?.testHapticsBusy);
  const hapticsTestReady = !testHapticsUnavailable;
  const rumbleTestReady = !testRumbleUnavailable;
  const hapticsStatusLabel = testLocked || snapshot?.status?.testHapticsBusy
    ? 'Testing'
    : snapshot?.status?.testHapticsCooldown
      ? 'Cooling Down'
      : hapticsTestReady
        ? 'Ready'
        : connected && gameStreamActive
          ? 'Game Active'
          : connected && audioStreamActive
            ? 'Audio Active'
            : connected && pendingAction !== null
              ? 'Command Pending'
              : 'Unavailable';
  const rumbleStatusLabel = testLocked
    ? 'Testing'
    : rumbleTestReady
      ? 'Ready'
      : connected && gameStreamActive
        ? 'Game Active'
        : connected && audioStreamActive
          ? 'Audio Active'
          : connected && pendingAction !== null
            ? 'Command Pending'
            : 'Unavailable';
  const hapticsStatusTone = testLocked || snapshot?.status?.testHapticsBusy || hapticsTestReady
    ? 'good'
    : connected && (snapshot?.status?.testHapticsCooldown || gameStreamActive || audioStreamActive || pendingAction !== null)
      ? 'warn'
      : 'idle';
  const rumbleStatusTone = testLocked || rumbleTestReady
    ? 'good'
    : connected && (gameStreamActive || audioStreamActive || pendingAction !== null)
      ? 'warn'
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
  const speakerTestReady = !testSpeakerUnavailable && !speakerOutputMissing;
  const testMicUnavailable = !connected
    || !hostAudioEnabled
    || !hostAudioActive
    || !duplexMicEnabled
    || pendingAction !== null
    || micVolumeCommitPending
    || lightbarCommitPending
    || micTestLocked
    || gameStreamActive;
  const micTestReady = !testMicUnavailable;
  const speakerStatusLabel = speakerTestLocked
    ? 'Playing'
    : connected && speakerTestError
      ? speakerTestError
    : connected && speakerOutputMissing
        ? BRIDGE_AUDIO_ENDPOINT_UNAVAILABLE
        : speakerTestReady
          ? 'Ready'
          : connected && gameStreamActive
            ? 'Game Audio Active'
            : connected && pendingAction !== null
              ? 'Command Pending'
              : 'Unavailable';
  const speakerStatusTone = speakerTestLocked || speakerTestReady
    ? 'good'
    : connected && (speakerTestError || speakerOutputMissing)
        ? 'bad'
      : connected && (gameStreamActive || pendingAction !== null)
        ? 'warn'
        : 'idle';
  const micTestStatusLabel = micTestLocked
    ? 'Listening'
    : connected && micTestError
      ? micTestError
      : micTestReady
        ? 'Ready'
        : connected && !hostAudioEnabled
          ? 'Host Encoding Off'
          : connected && !hostAudioActive
            ? 'Host Encoding Starting'
            : connected && pendingAction !== null
              ? 'Command Pending'
              : 'Unavailable';
  const micTestStatusTone = micTestLocked || micTestReady
    ? 'good'
    : connected && micTestError
      ? 'bad'
      : connected && (hostAudioEnabled || pendingAction !== null)
        ? 'warn'
        : 'idle';
  const activeAudioTestUnavailable = showMicrophoneControl ? testMicUnavailable : testSpeakerUnavailable;
  const activeAudioTestLocked = showMicrophoneControl ? micTestLocked : speakerTestLocked;
  const activeAudioTestStatusLabel = showMicrophoneControl ? micTestStatusLabel : speakerStatusLabel;
  const activeAudioTestStatusTone = showMicrophoneControl ? micTestStatusTone : speakerStatusTone;
  const sidebarDeviceTitle = connected && controllerConnected
    ? controllerName(snapshot.status?.controllerType)
    : 'Controller';
  const sidebarDeviceStatus = connected && controllerConnected
    ? 'Connected'
    : 'Bridge not detected';
  const sidebarBatteryLabel = connected && controllerConnected
    ? `Battery ${batteryPercentLabel}`
    : 'Battery unavailable';
  const pollingRateLabel = POLLING_RATE_OPTIONS.find(([, mode]) => mode === snapshot?.settings.pollingRateMode)?.[0]
    .replace(' / Real-time', '')
    ?? '--';
  const overviewHealthLabel = healthLabel(snapshot);
  const overviewHealthTone = snapshot?.diagnostics.lastError
    ? 'bad'
    : connected && controllerConnected
      ? 'good'
      : connected
        ? 'warn'
        : 'idle';
  const overviewConnectionStatus = connected && controllerConnected
    ? 'Stable'
    : connected
      ? 'Waiting'
      : 'Offline';
  const overviewEncoderState = !connected
    ? '--'
    : hostAudioEnabled
      ? 'On'
      : 'Off';
  const overviewEncoderDetail = !connected
    ? '--'
    : hostAudioActive
      ? 'Active'
      : hostAudioStarting
        ? 'Starting'
        : hostAudioEnabled
          ? `Fallback: ${hostAudioStatus?.fallbackReason?.replaceAll('-', ' ') ?? 'pending'}`
          : 'Pico Local';
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
  const triggerTestReady = !testTriggersUnavailable;
  const triggerStatusLabel = triggerTestLocked || snapshot?.status?.testAdaptiveTriggersBusy
    ? 'Testing'
    : triggerTestReady
      ? 'Ready'
      : connected && adaptiveTriggerOutputActive
        ? 'Game Triggers Active'
        : connected && pendingAction !== null
          ? 'Command Pending'
          : 'Unavailable';
  const triggerStatusTone = triggerTestLocked || snapshot?.status?.testAdaptiveTriggersBusy || triggerTestReady
    ? 'good'
    : connected && (adaptiveTriggerOutputActive || pendingAction !== null)
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
    const host = snapshot.diagnostics.hostAudioStatus;
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
    if (host) {
      lines.push(
        `hostAudioMode=${host.mode}`,
        `hostFallbackReason=${host.fallbackReason}`,
        `hostRequested=${host.hostRequested ? 'true' : 'false'}`,
        `hostHeartbeatHealthy=${host.heartbeatHealthy ? 'true' : 'false'}`,
        `hostStreamHealthy=${host.streamHealthy ? 'true' : 'false'}`,
        `hostGeneration=${host.streamGeneration}`,
        `hostFramesReceived=${host.hostFramesReceived}`,
        `hostFramesDropped=${host.hostFramesDropped}`,
        `controllerStateReady=${host.controllerStateReady ? 'true' : 'false'}`,
        `headsetPlugged=${host.headsetPlugged ? 'true' : 'false'}`,
        `headsetAudioRoute=${host.headsetAudioRoute ? 'true' : 'false'}`,
        `duplexRequested=${host.duplexRequested ? 'true' : 'false'}`,
        `duplexActive=${host.duplexActive ? 'true' : 'false'}`,
        `micPacketsReceived=${host.micPacketsReceived}`,
        `micPacketsDropped=${host.micPacketsDropped}`,
        `micDecodeSuccess=${host.micDecodeSuccess}`,
        `micDecodeFail=${host.micDecodeFail}`,
        `micUsbWriteSuccess=${host.micUsbWriteSuccess}`,
        `micUsbWriteShort=${host.micUsbWriteShort}`,
        `micLastDecodedSamples=${host.micLastDecodedSamples}`,
        `micLastWrittenBytes=${host.micLastWrittenBytes}`,
        `micPeakPermille=${host.micPeakPermille}`,
        `micUsbStreaming=${host.micUsbStreaming ? 'true' : 'false'}`
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

  async function commitHapticsValue(value = hapticsValue) {
    const snappedValue = snapHapticsValue(value);
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
    const snappedValue = snapHapticsValue(value);
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
    const snappedValue = snapHapticsValue(capControllerPowerSavingValue(value, snapshot));
    hapticsEditingRef.current = true;
    setHapticsValue(snappedValue);
    void commitHapticsValue(snappedValue);
  }

  function setClassicRumblePreset(value: number) {
    const snappedValue = snapHapticsValue(capControllerPowerSavingValue(value, snapshot));
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

  async function commitMicVolume(value = micVolumeValue) {
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || !hostAudioEnabled
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

  function setTriggerTestMode(mode: TriggerTestMode) {
    void runAction('trigger-mode', () => window.bridge.setTriggerTestMode(mode));
  }

  function resetAdaptiveTriggers() {
    void runAction('triggers-reset', () => window.bridge.resetAdaptiveTriggers());
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

  function toggleSpeakerEnabled() {
    if (!snapshot) return;
    void runAction('speaker-enabled', () => window.bridge.setSpeakerEnabled(!snapshot.settings.speakerEnabled));
  }

  function toggleHostEncodedAudioEnabled() {
    if (!snapshot) return;
    if (snapshot.settings.hostEncodedAudioEnabled) {
      setHostEncodingDisableConfirmVisible(true);
      return;
    }
    void runAction('host-audio-enabled', () => window.bridge.setHostEncodedAudioEnabled(true));
  }

  function closeHostEncodingDisableConfirm() {
    setHostEncodingDisableConfirmVisible(false);
  }

  function confirmDisableHostEncoding() {
    if (!snapshot) {
      closeHostEncodingDisableConfirm();
      return;
    }
    void runAction('host-audio-enabled', () => window.bridge.setHostEncodedAudioEnabled(false));
    closeHostEncodingDisableConfirm();
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

  function toggleAudioEnabled() {
    if (!snapshot) return;
    const enabled = !(snapshot.settings.speakerEnabled || snapshot.settings.duplexMicEnabled);
    void runAction('audio-enabled', async () => {
      let next = snapshot;
      if (next.settings.speakerEnabled !== enabled) {
        next = await window.bridge.setSpeakerEnabled(enabled);
      }
      const micEnabled = enabled && next.settings.hostEncodedAudioEnabled;
      if (next.settings.duplexMicEnabled !== micEnabled) {
        next = await window.bridge.setDuplexMicEnabled(micEnabled);
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
    setFeatureFocusTarget(null);
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
    setFeatureFocusTarget(null);
    setNotificationFocusTarget(target);
    if (notificationFocusTimerRef.current !== null) {
      window.clearTimeout(notificationFocusTimerRef.current);
    }
    notificationFocusTimerRef.current = window.setTimeout(() => {
      setNotificationFocusTarget(null);
      notificationFocusTimerRef.current = null;
    }, 2200);
  }

  function focusFeatureControl(target: FeatureFocusTarget) {
    if (target === 'host-encoding' && hostAudioEnabled) {
      return;
    }
    setShowBridgeSettings(false);
    setShowNotificationsMenu(false);
    setSettingsFocusTarget(null);
    setNotificationFocusTarget(null);
    setFeatureFocusTarget(target);
    setFeatureFocusPulse((pulse) => pulse + 1);
    if (featureFocusTimerRef.current !== null) {
      window.clearTimeout(featureFocusTimerRef.current);
    }
    featureFocusTimerRef.current = window.setTimeout(() => {
      setFeatureFocusTarget(null);
      featureFocusTimerRef.current = null;
    }, 2200);
  }

  function setMuteButtonAction(
    mode: MuteButtonMode,
    usage?: number,
    modifiers?: number,
    behavior?: MuteKeyboardBehavior
  ) {
    if (!snapshot) {
      return;
    }
    const keyUsage = usage ?? snapshot.settings.muteKeyboardUsage;
    const keyModifiers = modifiers ?? snapshot.settings.muteKeyboardModifiers;
    const keyBehavior = behavior ?? snapshot.settings.muteKeyboardBehavior;
    void runAction('mute-button', () => window.bridge.setMuteButtonAction(mode, keyUsage, keyModifiers, keyBehavior));
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
      snapshot.settings.muteKeyboardBehavior
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

  function testNotifications() {
    void runAction('notify-test', () => window.bridge.testNotification());
  }

  function selectControlTab(tab: ControlTab) {
    if (tab === activeControlTab) {
      return;
    }
    setShowCustomColorPicker(false);
    setActiveControlTab(tab);
  }

  if (!snapshot) {
    return <div className="shell loading">Starting bridge companion</div>;
  }

  return (
    <div className={`shell ${windowDragging ? 'window-dragging' : ''}`}>
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
          <img className="bridge-mark" src={bridgeMarkUrl} alt="" aria-hidden="true" />
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
                  <div className={`settings-menu-row ${notificationFocusTarget === 'controller-status' ? 'settings-menu-row-highlight' : ''}`}>
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
                  <div className={`settings-menu-row ${notificationFocusTarget === 'low-battery' ? 'settings-menu-row-highlight' : ''}`}>
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
          <div className="hero-main">
            <img className="controller-art" src={controllerImage} alt="" />
            <div className="status-copy">
              <div className="connection-row">
                <strong>{sidebarDeviceTitle}</strong>
              </div>
              <div className="bridge-state compact-device-status">
                <span className={`dot ${connected && controllerConnected ? 'good' : connected ? 'warn' : ''}`} />
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
                  <span className="feature-icon overview-icon"><IconBinary size={20} /></span>
                  <h3>Encoder</h3>
                </div>
                <div className="overview-fields">
                  <div>
                    <span>Host Encoding</span>
                    <strong className={overviewEncoderState === 'On' ? 'success-value' : ''}>
                      {overviewEncoderState}
                    </strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{overviewEncoderDetail}</strong>
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
                        onChange={(event) => setHapticsValue(snapHapticsValue(Number(event.currentTarget.value)))}
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
                        {HAPTICS_SLIDER_TICKS.map((value) => (
                          <span key={value} className={sliderTickClass(value, 200)} />
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
                  <label className={`overview-slider-row ${(!connected || !hostAudioEnabled || !duplexMicEnabled || micVolumeCommitPending) ? 'disabled' : ''}`}>
                    <span>Mic</span>
                    <div className="overview-range-control">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step={MIC_VOLUME_STEP}
                        value={micVolumeValue}
                        disabled={!connected || !hostAudioEnabled || !duplexMicEnabled || micVolumeCommitPending}
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
                    <span className="overview-chip muted">Off</span>
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
                  <h2>Haptics</h2>
                  <p>Adjust controller haptic feedback and run a quick test.</p>
                </div>
                <div className="inline-switch">
                  <span>Enabled</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={activeHapticsFeatureEnabled}
                    className={`switch ${activeHapticsFeatureEnabled ? 'on' : ''}`}
                    disabled={!connected || pendingAction !== null}
                    onClick={showClassicRumbleControl ? toggleClassicRumbleEnabled : toggleHapticsEnabled}
                  >
                    <span />
                  </button>
                </div>
              </div>
              <div className="feature-card-grid">
                <section className="feature-card">
                  <div className="feature-card-title">
                    <button
                      type="button"
                      className={`feature-icon haptics-enable-button ${showClassicRumbleControl ? 'icon-medium' : 'icon-compact'} ${activeHapticsFeatureEnabled ? 'active' : ''} ${controllerPowerSavingActive && activeHapticsFeatureEnabled ? 'power-saving-active' : ''}`}
                      aria-pressed={activeHapticsFeatureEnabled}
                      aria-label={showClassicRumbleControl ? 'Enable rumble' : 'Enable haptics'}
                      title={showClassicRumbleControl ? 'Enable rumble' : 'Enable haptics'}
                      disabled={!connected || pendingAction !== null}
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
                            onChange={(event) => setClassicRumbleValue(snapHapticsValue(Number(event.currentTarget.value)))}
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
                            onChange={(event) => setHapticsValue(snapHapticsValue(Number(event.currentTarget.value)))}
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
                          {HAPTICS_SLIDER_TICKS.map((value) => (
                            <span key={value} className={sliderTickClass(value, 200)} />
                          ))}
                        </div>
                      </div>
                      <strong>{showClassicRumbleControl ? classicRumbleValue : hapticsValue}%</strong>
                    </label>
                  </div>
                  <p>{showClassicRumbleControl ? 'Applies to game rumble output.' : 'Balanced feedback across both motors.'}</p>
                  <div className="segmented-row">
                    {HAPTICS_PRESETS.map(([label, value]) => {
                      const presetValue = snapHapticsValue(Number(value));
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
                      ? connected && gameStreamActive
                        ? 'Game Active'
                        : connected && audioStreamActive
                          ? 'Audio Active'
                        : connected && testLocked
                          ? 'Testing'
                          : 'Test Rumble'
                    : connected && gameStreamActive
                      ? 'Game Active'
                      : connected && audioStreamActive
                        ? 'Audio Active'
                      : connected && (testLocked || snapshot.status?.testHapticsCooldown)
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
              <FeatureTipsPanel tab="haptics" onSettingsFocusRequest={focusBridgeSettings} />
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
                  <p>Adjust controller {outputControlLower} and microphone levels.</p>
                </div>
                <div className="audio-heading-controls">
                  <div
                    className={[
                      'inline-switch',
                      featureFocusTarget === 'host-encoding' ? `feature-focus-highlight feature-focus-highlight-${featureFocusPulse % 2}` : ''
                    ].filter(Boolean).join(' ')}
                  >
                    <span>Host Encoding</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={hostAudioEnabled}
                      aria-label="Enable host encoded audio"
                      className={`switch ${hostAudioEnabled ? 'on' : ''}`}
                      disabled={!connected || pendingAction !== null}
                      onClick={toggleHostEncodedAudioEnabled}
                    >
                      <span />
                    </button>
                  </div>
                  <div className="inline-switch">
                    <span>Enabled</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={audioEnabled}
                      aria-label="Enable audio"
                      className={`switch ${audioEnabled ? 'on' : ''}`}
                      disabled={!connected || pendingAction !== null}
                      onClick={toggleAudioEnabled}
                    >
                      <span />
                    </button>
                  </div>
                </div>
              </div>
              <div className="feature-card-grid">
                <section className="feature-card">
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
                          ? !connected || !hostAudioEnabled || pendingAction !== null
                          : !connected || !speakerVolumeSupported || pendingAction !== null
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
                            disabled={!connected || !hostAudioEnabled || !duplexMicEnabled || micVolumeCommitPending}
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
                      <p>Use presets for quick microphone levels.</p>
                      <div className="segmented-row">
                        {MIC_VOLUME_PRESETS.map(([label, value]) => (
                          <button
                            key={label}
                            type="button"
                            className={micVolumeValue === value ? 'active' : ''}
                            disabled={!connected || !hostAudioEnabled || !duplexMicEnabled || micVolumeCommitPending}
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
                      <p>Use presets for quick {outputPresetLower} levels.</p>
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
                    <span className={`status-badge ${hostAudioTone}`} title={hostAudioLabel}>
                      <span className={`dot ${hostAudioTone}`} />
                      <strong>{hostAudioLabel}</strong>
                    </span>
                  </div>
                </section>
              </div>
              <FeatureTipsPanel
                tab="audio"
                hostEncodingTipActionable={!hostAudioEnabled}
                onFeatureFocusRequest={focusFeatureControl}
              />
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
                  <h2>Adaptive Triggers</h2>
                  <p>Set trigger effect intensity and test mode</p>
                </div>
                <div className="inline-switch">
                  <span>Enabled</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={snapshot.settings.adaptiveTriggersEnabled}
                    className={`switch ${snapshot.settings.adaptiveTriggersEnabled ? 'on' : ''}`}
                    disabled={!connected || !adaptiveTriggersSupported || pendingAction !== null}
                    onClick={toggleAdaptiveTriggersEnabled}
                  >
                    <span />
                  </button>
                </div>
              </div>
              <div className="feature-card-grid">
                <section className="feature-card">
                  <div className="feature-card-title">
                    <button
                      type="button"
                      className={`feature-icon triggers-enable-button icon-compact ${snapshot.settings.adaptiveTriggersEnabled ? 'active' : ''} ${controllerPowerSavingActive && snapshot.settings.adaptiveTriggersEnabled ? 'power-saving-active' : ''}`}
                      aria-pressed={snapshot.settings.adaptiveTriggersEnabled}
                      aria-label="Enable adaptive triggers"
                      title="Enable adaptive triggers"
                      disabled={!connected || !adaptiveTriggersSupported || pendingAction !== null}
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
                  <p>Use presets for quick trigger levels</p>
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
              <FeatureTipsPanel tab="triggers" onSettingsFocusRequest={focusBridgeSettings} />
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
                    disabled={!connected || !lightbarSupported || pendingAction !== null}
                    onClick={toggleLightbarEnabled}
                  >
                    <span />
                  </button>
                </div>
              </div>
              <div className="feature-card-grid lighting-grid">
                <section className="feature-card">
                  <div className="feature-card-title">
                    <button
                      type="button"
                      className={`feature-icon lighting-enable-button icon-large ${snapshot.settings.lightbarEnabled ? 'active' : ''} ${controllerPowerSavingActive && snapshot.settings.lightbarEnabled ? 'power-saving-active' : ''}`}
                      aria-pressed={snapshot.settings.lightbarEnabled}
                      aria-label="Enable lighting"
                      title="Enable lighting"
                      disabled={!connected || !lightbarSupported || pendingAction !== null}
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
                  <p>Use presets for quick light bar levels</p>
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
                  <div className="system-profile-save-status">
                    <Check size={16} />
                    <span>Changes Are Automatically Saved</span>
                  </div>
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
                        {REMAP_TARGET_OPTIONS.map(([, buttonId]) => {
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
                  </svg>
                  {showDualSenseEdgeRemapButtons && (
                    <>
                      <div className="remapping-edge-group remapping-edge-group-top" aria-label="DualSense Edge back button mappings">
                        {REMAP_EDGE_TOP_BUTTON_IDS.map((buttonId) => {
                          const button = REMAP_BUTTONS[buttonId];
                          const targetOptions = remapTargetOptionsFor(buttonId);
                          const remapped = remapDraft[buttonId] !== buttonId;
                          return (
                            <div
                              className={`remapping-pill remapping-pill-edge ${remapped ? 'changed' : ''}`}
                              data-remap-button-id={buttonId}
                              key={buttonId}
                              onMouseEnter={() => setHoveredRemapButton(buttonId)}
                              onMouseLeave={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                              onFocusCapture={() => setHoveredRemapButton(buttonId)}
                              onBlurCapture={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
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
                      <div className="remapping-edge-group remapping-edge-group-bottom" aria-label="DualSense Edge function button mappings">
                        {REMAP_EDGE_BOTTOM_BUTTON_IDS.map((buttonId) => {
                          const button = REMAP_BUTTONS[buttonId];
                          const targetOptions = remapTargetOptionsFor(buttonId);
                          const remapped = remapDraft[buttonId] !== buttonId;
                          return (
                            <div
                              className={`remapping-pill remapping-pill-edge ${remapped ? 'changed' : ''}`}
                              data-remap-button-id={buttonId}
                              key={buttonId}
                              onMouseEnter={() => setHoveredRemapButton(buttonId)}
                              onMouseLeave={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                              onFocusCapture={() => setHoveredRemapButton(buttonId)}
                              onBlurCapture={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
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
                    </>
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
                              : `${(REMAP_CALLOUT_Y[buttonId] / REMAP_SVG_VIEWBOX_HEIGHT) * 100}%`
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
                    <img ref={remappingArtRef} className="remapping-controller-art" src={remappingLayoutImage} alt="" />
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
                              : `${(REMAP_CALLOUT_Y[buttonId] / REMAP_SVG_VIEWBOX_HEIGHT) * 100}%`
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
                    <span className="feature-icon system-icon icon-wide"><VolumeX size={20} /></span>
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
                      <div className="device-row">
                        <span>Status</span>
                        <strong className={`health-label ${snapshot.diagnostics.lastError ? 'bad' : 'good'}`}>
                          <span className={`dot ${snapshot.diagnostics.lastError ? 'bad' : statusTone}`} />
                          {healthLabel(snapshot)}
                        </strong>
                      </div>
                    </div>
                  )}
                </section>
              </div>
              <section className="feature-help-panel system-profile-panel" aria-label="System profiles and tips">
                <div className="system-profile-strip">
                  <div className="system-profile-save-status">
                    <Check size={16} />
                    <span>Changes Are Automatically Saved</span>
                  </div>
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

      {hostEncodingDisableConfirmVisible && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeHostEncodingDisableConfirm}
        >
          <form
            className="settings-menu bridge-settings-modal host-encoding-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Disable host encoding"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              confirmDisableHostEncoding();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <IconBinary size={16} />
                <span>Disable Host Encoding?</span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close host encoding dialog"
                onClick={closeHostEncodingDisableConfirm}
              >
                <X size={16} />
              </button>
            </div>
            <p className="remap-profile-dialog-copy">
              Host encoding helps keep controller audio smooth. Turning it off may cause audio stuttering.
            </p>
            <div className="remap-profile-dialog-actions">
              <button type="button" className="secondary-action" onClick={closeHostEncodingDisableConfirm}>
                Cancel
              </button>
              <button
                type="submit"
                className="primary-action danger"
                disabled={pendingAction !== null}
              >
                Disable
              </button>
            </div>
          </form>
        </div>
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
                <div className="settings-menu-section-label">General</div>
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
