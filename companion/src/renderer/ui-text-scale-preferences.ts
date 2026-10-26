import { isUiTextScalePercent, type UiTextScalePercent } from '@shared/types';

export const DEFAULT_UI_TEXT_SCALE_PERCENT: UiTextScalePercent = 100;
export const UI_TEXT_SCALE_PERCENT_STORAGE_KEY = 'ds5bridge.uiTextScalePercent';

export function storedUiTextScalePercent(): UiTextScalePercent {
  try {
    const saved = Number(window.localStorage.getItem(UI_TEXT_SCALE_PERCENT_STORAGE_KEY));
    return isUiTextScalePercent(saved) ? saved : DEFAULT_UI_TEXT_SCALE_PERCENT;
  } catch {
    return DEFAULT_UI_TEXT_SCALE_PERCENT;
  }
}

export function saveUiTextScalePercent(value: UiTextScalePercent): void {
  try {
    window.localStorage.setItem(UI_TEXT_SCALE_PERCENT_STORAGE_KEY, String(value));
  } catch {
    // The settings snapshot remains authoritative; the cache only avoids a startup flash.
  }
}

export function applyUiTextScalePercent(value: UiTextScalePercent): void {
  document.documentElement.dataset.textScale = String(value);
}

export function applyStoredUiTextScalePercent(): UiTextScalePercent {
  const value = storedUiTextScalePercent();
  applyUiTextScalePercent(value);
  return value;
}
