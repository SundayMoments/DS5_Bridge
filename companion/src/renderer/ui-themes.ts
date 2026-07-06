import kofiBadgeBeigeUrl from '../../../assets/brand/support_me_on_kofi_beige.png';
import kofiBadgeBlueUrl from '../../../assets/brand/support_me_on_kofi_blue.png';
import kofiBadgeDarkUrl from '../../../assets/brand/support_me_on_kofi_dark.png';
import kofiBadgeRedUrl from '../../../assets/brand/support_me_on_kofi_red.png';
import type { UiThemePreset } from '../shared/types';

export const DEFAULT_UI_THEME_PRESET: UiThemePreset = 'dark';

export const UI_THEME_OPTIONS: Array<[string, UiThemePreset]> = [
  ['Light', 'light'],
  ['Dark', 'dark'],
  ['Bubble Gum', 'bubble-gum'],
  ['Pomegranate', 'pomegranate'],
  ['Kiwi', 'kiwi']
];

export type UiThemePreviewSwatch = Readonly<{
  role: 'Canvas' | 'Surface' | 'Accent' | 'Signal';
  color: string;
}>;

export const UI_THEME_PREVIEW_SWATCHES: Record<UiThemePreset, readonly UiThemePreviewSwatch[]> = {
  light: [
    { role: 'Canvas', color: '#f4f7fb' },
    { role: 'Surface', color: '#dce7f5' },
    { role: 'Accent', color: '#1f6bd6' }
  ],
  dark: [
    { role: 'Canvas', color: '#050913' },
    { role: 'Surface', color: '#07111c' },
    { role: 'Accent', color: '#287cff' }
  ],
  'bubble-gum': [
    { role: 'Canvas', color: '#f69bd7' },
    { role: 'Surface', color: '#dc78c4' },
    { role: 'Accent', color: '#d44799' }
  ],
  pomegranate: [
    { role: 'Canvas', color: '#170d1d' },
    { role: 'Accent', color: '#d01868' },
    { role: 'Signal', color: '#8cff00' }
  ],
  kiwi: [
    { role: 'Canvas', color: '#030705' },
    { role: 'Surface', color: '#0d1f13' },
    { role: 'Accent', color: '#9cff2f' }
  ]
};

export const UI_THEME_KOFI_BADGES: Record<UiThemePreset, string> = {
  light: kofiBadgeBeigeUrl,
  dark: kofiBadgeDarkUrl,
  'bubble-gum': kofiBadgeBlueUrl,
  pomegranate: kofiBadgeRedUrl,
  kiwi: kofiBadgeDarkUrl
};
