import type { BridgeSnapshot } from '@shared/types';
import { capControllerPowerSavingValue } from '../../common/controller-power-saving';

export type LightbarPaletteCell = {
  color: string;
  name: string;
};

export const LIGHTBAR_BRIGHTNESS_STEP = 10;

export const LIGHTBAR_SWATCHES = ['#ffff00', '#0000ff', '#00ff00', '#ff0000', '#8000ff', '#ffffff'];
export const LIGHTBAR_SWATCH_NAMES: Record<string, string> = {
  '#ffff00': 'Yellow',
  '#0000ff': 'Blue',
  '#00ff00': 'Green',
  '#ff0000': 'Red',
  '#8000ff': 'Violet',
  '#ffffff': 'White'
};
export const LIGHTBAR_DEFAULT_CUSTOM_COLOR = '#7b61ff';
export const LIGHTBAR_CUSTOM_PALETTE = makeLightbarCustomPalette();
export const LIGHTBAR_COLOR_NAMES = makeLightbarColorNames();
export const LIGHTBAR_PRESETS: Array<[string, number]> = [
  ['Low', 30],
  ['Medium', 50],
  ['High', 100]
];

export function snapLightbarBrightness(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / LIGHTBAR_BRIGHTNESS_STEP) * LIGHTBAR_BRIGHTNESS_STEP));
}

export function displayLightbarBrightnessValue(snapshot: BridgeSnapshot): number {
  return capControllerPowerSavingValue(snapshot.settings.lightbarBrightnessPercent, snapshot);
}

export function lightbarColorLabel(color: string): string {
  return LIGHTBAR_COLOR_NAMES[color.toLowerCase()] ?? color.toUpperCase();
}

export function normalizeHexColor(value: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : '#ffff00';
}

export function normalizeLightbarPresetColor(value: string): string {
  return normalizeHexColor(value);
}

export function isLightbarPresetColor(value: string): boolean {
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

export function lightbarColorFromSnapshot(snapshot: BridgeSnapshot): string {
  if (snapshot.status?.firmwareFlags.lightbarControl) {
    const color = snapshot.status.lightbarColor;
    return normalizeLightbarPresetColor(rgbToHex(color.red, color.green, color.blue));
  }
  return normalizeLightbarPresetColor(snapshot.settings.lightbarColor);
}

/** The name shown under the swatches; colors outside the palette read as Custom. */
export function lightbarColorName(color: string): string {
  const normalized = normalizeHexColor(color);
  return LIGHTBAR_COLOR_NAMES[normalized] ?? 'Custom';
}
