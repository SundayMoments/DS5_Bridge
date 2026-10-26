import { useEffect, useState } from 'react';
import type { BridgeSnapshot, UiTextScalePercent, UiThemePreset } from '@shared/types';
import { useLocalization } from '../common/localization';
import { useDocumentTheme } from '../common/use-document-theme';
import { saveUiThemePreset, storedUiThemePreset } from '../ui-theme-preferences';
import {
  applyUiTextScalePercent,
  saveUiTextScalePercent,
  storedUiTextScalePercent
} from '../ui-text-scale-preferences';

/**
 * Theme, text size, and language. Until the first snapshot arrives the window
 * uses the theme and text size saved from the last run, so it opens in the
 * right colors; afterwards the bridge settings win and are saved for next time.
 */
export function useAppAppearance(snapshot: BridgeSnapshot | null) {
  const localization = useLocalization();
  const [savedTheme, setSavedTheme] = useState<UiThemePreset>(storedUiThemePreset);
  const [savedTextScale, setSavedTextScale] = useState<UiTextScalePercent>(storedUiTextScalePercent);
  const liveTheme = snapshot?.settings.uiThemePreset;
  const liveTextScale = snapshot?.settings.uiTextScalePercent;
  const liveLocale = snapshot?.settings.uiLocale;

  useEffect(() => {
    if (!liveTheme) return;
    setSavedTheme(liveTheme);
    saveUiThemePreset(liveTheme);
  }, [liveTheme]);

  useEffect(() => {
    if (!liveLocale || liveLocale === localization.preference) return;
    localization.setPreference(liveLocale);
  }, [liveLocale]);

  useEffect(() => {
    if (!liveTextScale) return;
    setSavedTextScale(liveTextScale);
    applyUiTextScalePercent(liveTextScale);
    saveUiTextScalePercent(liveTextScale);
  }, [liveTextScale]);

  const theme = liveTheme ?? savedTheme;
  const textScale = liveTextScale ?? savedTextScale;
  useDocumentTheme(theme, textScale);
  return { theme, textScale };
}
