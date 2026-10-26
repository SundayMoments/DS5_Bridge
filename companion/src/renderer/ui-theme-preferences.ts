import { DEFAULT_UI_THEME_PRESET, isUiThemePreset, type UiThemePreset } from '@shared/ui-theme';

export const UI_THEME_PRESET_STORAGE_KEY = 'ds5bridge.uiThemePreset';
const UI_THEME_CHANGED_EVENT = 'ds5bridge:theme-changed';

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** The cached preset, used before the first settings snapshot arrives. */
export function storedUiThemePreset(): UiThemePreset {
  const saved = readStorage(UI_THEME_PRESET_STORAGE_KEY);
  return isUiThemePreset(saved) ? saved : DEFAULT_UI_THEME_PRESET;
}

export function saveUiThemePreset(preset: UiThemePreset): void {
  const next = isUiThemePreset(preset) ? preset : DEFAULT_UI_THEME_PRESET;
  if (readStorage(UI_THEME_PRESET_STORAGE_KEY) === next) return;
  try {
    window.localStorage.setItem(UI_THEME_PRESET_STORAGE_KEY, next);
  } catch {
    return;
  }
  window.dispatchEvent(new Event(UI_THEME_CHANGED_EVENT));
}

/** Applies the cached preset to the document before React mounts. */
export function applyStoredUiThemePreset(): UiThemePreset {
  const theme = storedUiThemePreset();
  document.documentElement.dataset.theme = theme;
  return theme;
}

/** Other windows receive storage events; the writer receives the local event. */
export function subscribeUiThemePreset(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === UI_THEME_PRESET_STORAGE_KEY || event.key === null) onChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(UI_THEME_CHANGED_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(UI_THEME_CHANGED_EVENT, onChange);
  };
}
