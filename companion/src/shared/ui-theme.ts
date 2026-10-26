/** Persisted preset IDs shared by settings and every renderer. */
export const UI_THEME_PRESETS = [
  'dark',
  'light',
  'bubble-gum',
  'pomegranate',
  'kiwi'
] as const;
export type UiThemePreset = typeof UI_THEME_PRESETS[number];
export const DEFAULT_UI_THEME_PRESET: UiThemePreset = 'dark';

export function isUiThemePreset(value: unknown): value is UiThemePreset {
  return UI_THEME_PRESETS.some((preset) => preset === value);
}
