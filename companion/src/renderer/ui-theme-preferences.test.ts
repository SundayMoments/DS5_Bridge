// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  UI_THEME_PRESET_STORAGE_KEY,
  applyStoredUiThemePreset,
  saveUiThemePreset,
  storedUiThemePreset,
  subscribeUiThemePreset
} from './ui-theme-preferences';
import {
  UI_TEXT_SCALE_PERCENT_STORAGE_KEY,
  applyStoredUiTextScalePercent,
  saveUiTextScalePercent,
  storedUiTextScalePercent
} from './ui-text-scale-preferences';

afterEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
  delete document.documentElement.dataset.textScale;
});

describe('UI theme preferences', () => {
  it('falls back to the DS5 dark theme for missing or unknown presets', () => {
    expect(storedUiThemePreset()).toBe('dark');
    window.localStorage.setItem(UI_THEME_PRESET_STORAGE_KEY, 'laserwave');
    expect(storedUiThemePreset()).toBe('dark');
  });

  it('applies the cached preset to the document before React mounts', () => {
    window.localStorage.setItem(UI_THEME_PRESET_STORAGE_KEY, 'pomegranate');
    expect(applyStoredUiThemePreset()).toBe('pomegranate');
    expect(document.documentElement.dataset.theme).toBe('pomegranate');
  });

  it('notifies subscribers in the writing window once per change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeUiThemePreset(listener);
    saveUiThemePreset('kiwi');
    saveUiThemePreset('kiwi');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(UI_THEME_PRESET_STORAGE_KEY)).toBe('kiwi');
    unsubscribe();
    saveUiThemePreset('light');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('UI text scale preferences', () => {
  it('caches only supported text sizes and applies them to the document', () => {
    expect(storedUiTextScalePercent()).toBe(100);
    window.localStorage.setItem(UI_TEXT_SCALE_PERCENT_STORAGE_KEY, '95');
    expect(storedUiTextScalePercent()).toBe(100);
    saveUiTextScalePercent(120);
    expect(applyStoredUiTextScalePercent()).toBe(120);
    expect(document.documentElement.dataset.textScale).toBe('120');
  });
});
