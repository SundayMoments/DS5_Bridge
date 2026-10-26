import kofiBadgeBeigeUrl from '@product-assets/brand/support_me_on_kofi_beige.png';
import kofiBadgeBlueUrl from '@product-assets/brand/support_me_on_kofi_blue.png';
import kofiBadgeDarkUrl from '@product-assets/brand/support_me_on_kofi_dark.png';
import kofiBadgeRedUrl from '@product-assets/brand/support_me_on_kofi_red.png';
import { DEFAULT_UI_THEME_PRESET, UI_THEME_PRESETS, isUiThemePreset, type UiThemePreset } from '@shared/ui-theme';

export { DEFAULT_UI_THEME_PRESET, isUiThemePreset };

const THEME_LABELS: Record<UiThemePreset, string> = {
  dark: 'Dark',
  light: 'Light',
  'bubble-gum': 'Bubble Gum',
  pomegranate: 'Pomegranate',
  kiwi: 'Kiwi'
};

export const UI_THEME_OPTIONS: Array<[string, UiThemePreset]> = UI_THEME_PRESETS.map(
  (preset) => [THEME_LABELS[preset], preset]
);

export type UiThemePreviewSwatch = Readonly<{
  role: 'Canvas' | 'Surface' | 'Accent';
  color: string;
}>;

// Swatches resolve the preset's CSS palette on .theme-option[data-theme-preview],
// so the menu preview cannot drift from theme-palettes.css.
export const UI_THEME_PREVIEW_SWATCHES: readonly UiThemePreviewSwatch[] = [
  { role: 'Canvas', color: 'var(--palette-canvas)' },
  { role: 'Surface', color: 'var(--palette-surface)' },
  { role: 'Accent', color: 'var(--palette-accent)' }
];

export const UI_THEME_KOFI_BADGES: Record<UiThemePreset, string> = {
  dark: kofiBadgeDarkUrl,
  light: kofiBadgeBeigeUrl,
  'bubble-gum': kofiBadgeBlueUrl,
  pomegranate: kofiBadgeRedUrl,
  kiwi: kofiBadgeDarkUrl
};
