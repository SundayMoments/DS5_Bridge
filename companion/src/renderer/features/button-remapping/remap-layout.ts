import remappingEdgeLayoutImage from '@product-assets/controllers/dualsense-edge-remapping-layout.svg';
import remappingLayoutImage from '@product-assets/controllers/dualsense-remapping-layout.svg';
import type { DualSenseEdgeRemapButtonId, StandardRemapButtonId } from './remap-buttons';

// Callout geometry is in each layout SVG's viewBox units; the page maps it onto
// the rendered artwork so the lines meet the button pills at any size.

export type RemapCalloutLayout = {
  top: number;
  points: string;
};
export type EdgeRemapControlLayout = {
  left: number;
  top: number;
  anchor: 'top' | 'bottom';
  linePoints: string;
};

export const REMAP_CALLOUT_POINTS: Record<StandardRemapButtonId, Array<[number, number]>> = {
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
export const REMAP_EDGE_CALLOUT_POINTS: Record<StandardRemapButtonId, Array<[number, number]>> = {
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
export const REMAP_CALLOUT_Y: Record<StandardRemapButtonId, number> = {
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
export const REMAP_EDGE_CALLOUT_Y: Record<StandardRemapButtonId, number> = {
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
export const REMAP_STANDARD_LAYOUT_ASSET = {
  src: remappingLayoutImage,
  viewBoxWidth: 597.47,
  viewBoxHeight: 429.39,
  calloutPoints: REMAP_CALLOUT_POINTS,
  calloutY: REMAP_CALLOUT_Y
};
export const REMAP_EDGE_LAYOUT_ASSET = {
  src: remappingEdgeLayoutImage,
  viewBoxWidth: 593.94,
  viewBoxHeight: 424.76,
  calloutPoints: REMAP_EDGE_CALLOUT_POINTS,
  calloutY: REMAP_EDGE_CALLOUT_Y
};
export const REMAP_EDGE_CONTROL_POINTS: Record<DualSenseEdgeRemapButtonId, { x: number; y: number; anchor: 'top' | 'bottom' }> = {
  lb: { x: 227.59, y: 33.19, anchor: 'bottom' },
  rb: { x: 371.02, y: 33.19, anchor: 'bottom' },
  lfn: { x: 227.5, y: 368.88, anchor: 'top' },
  rfn: { x: 370.46, y: 368.88, anchor: 'top' }
};
export const REMAP_EDGE_LINE_POINTS: Record<DualSenseEdgeRemapButtonId, [[number, number], [number, number]]> = {
  lb: [[227.59, 33.19], [227.42, 105.09]],
  rb: [[371.02, 33.19], [370.84, 105.09]],
  lfn: [[227.5, 368.88], [227.68, 296.98]],
  rfn: [[370.46, 368.88], [370.64, 296.98]]
};
