import circleGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/Circle.svg';
import createGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/Create.svg';
import crossGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/Cross.svg';
import dpadDownGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Down.svg';
import dpadLeftGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Left.svg';
import dpadRightGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Right.svg';
import dpadUpGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Up.svg';
import psHomeGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/Home.svg';
import l1GlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/L1.svg';
import l2GlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/L2.svg';
import leftStickClickGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/Left Stick Click.svg';
import optionsGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/Options.svg';
import r1GlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/R1.svg';
import r2GlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/R2.svg';
import rightStickClickGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/Right Stick Click.svg';
import squareGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/Square.svg';
import triangleGlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/Triangle.svg';
import { REMAP_BUTTON_IDS, type BridgeStatusPayload, type RemapButtonId } from '@shared/protocol';

export { psHomeGlyphUrl };

export type ControllerType = BridgeStatusPayload['controllerType'];
export type KnownControllerType = Exclude<ControllerType, 'unknown'>;

export type RemapButtonDefinition = {
  id: RemapButtonId;
  label: string;
  glyphUrl?: string;
  textGlyph?: string;
};

export type TargetOnlyRemapButtonId = Extract<RemapButtonId, 'ps'>;
export type SourceRemapButtonId = Exclude<RemapButtonId, TargetOnlyRemapButtonId>;
export type DualSenseEdgeRemapButtonId = Extract<SourceRemapButtonId, 'lb' | 'rb' | 'lfn' | 'rfn'>;
export type StandardRemapButtonId = Exclude<SourceRemapButtonId, DualSenseEdgeRemapButtonId>;

export const REMAP_BUTTONS: Record<RemapButtonId, RemapButtonDefinition> = {
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
export const REMAP_LEFT_BUTTON_IDS: StandardRemapButtonId[] = ['l2', 'l1', 'create', 'dpad-up', 'dpad-right', 'dpad-down', 'dpad-left', 'l3'];
export const REMAP_RIGHT_BUTTON_IDS: StandardRemapButtonId[] = ['r2', 'r1', 'options', 'triangle', 'circle', 'cross', 'r3', 'square'];
export const REMAP_STANDARD_BUTTON_IDS: StandardRemapButtonId[] = [
  ...REMAP_LEFT_BUTTON_IDS,
  ...REMAP_RIGHT_BUTTON_IDS
];
export const REMAP_EDGE_TOP_BUTTON_IDS: DualSenseEdgeRemapButtonId[] = ['lb', 'rb'];
export const REMAP_EDGE_BOTTOM_BUTTON_IDS: DualSenseEdgeRemapButtonId[] = ['lfn', 'rfn'];
export const REMAP_EDGE_BUTTON_IDS: DualSenseEdgeRemapButtonId[] = [
  ...REMAP_EDGE_TOP_BUTTON_IDS,
  ...REMAP_EDGE_BOTTOM_BUTTON_IDS
];
export const REMAP_STANDARD_TARGET_BUTTON_IDS: StandardRemapButtonId[] = [
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
export const REMAP_TARGET_BUTTON_IDS: RemapButtonId[] = [
  ...REMAP_STANDARD_TARGET_BUTTON_IDS,
  'ps'
];

export const REMAP_ALL_BUTTON_IDS = [...REMAP_BUTTON_IDS] as RemapButtonId[];
export const REMAP_TARGET_OPTIONS: Array<[string, RemapButtonId]> = [
  ...REMAP_TARGET_BUTTON_IDS
].map((id) => [REMAP_BUTTONS[id].label, id]);

export const DEFAULT_REMAP_DRAFT = Object.fromEntries(
  REMAP_ALL_BUTTON_IDS.map((id) => [id, id])
) as Record<RemapButtonId, RemapButtonId>;

export const LAST_REMAP_CONTROLLER_TYPE_STORAGE_KEY = 'ds5bridge.lastRemapControllerType';

export function storedRemapControllerType(): KnownControllerType {
  const saved = window.localStorage.getItem(LAST_REMAP_CONTROLLER_TYPE_STORAGE_KEY);
  return saved === 'dualsense-edge' ? 'dualsense-edge' : 'dualsense';
}

export function RemapGlyphOption({ label, value }: { label: string; value: RemapButtonId }) {
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

export function RemapSourceGlyph({ button }: { button: RemapButtonDefinition }) {
  return button.glyphUrl ? (
    <img src={button.glyphUrl} alt={button.label} title={button.label} />
  ) : (
    <span className="remap-text-glyph remap-text-glyph-source" title={button.label}>
      {button.textGlyph ?? button.label}
    </span>
  );
}

export function remapTargetOptionsFor(buttonId: RemapButtonId): Array<[string, RemapButtonId]> {
  if ((REMAP_EDGE_BUTTON_IDS as readonly RemapButtonId[]).includes(buttonId)) {
    return [...REMAP_TARGET_OPTIONS, [REMAP_BUTTONS[buttonId].label, buttonId]];
  }
  return REMAP_TARGET_OPTIONS;
}
