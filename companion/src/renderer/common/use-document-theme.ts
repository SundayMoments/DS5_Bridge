import { useLayoutEffect } from 'react';
import type { UiTextScalePercent } from '@shared/types';
import type { UiThemePreset } from '@shared/ui-theme';

/** Keep portals and native form controls on the same palette before paint. */
export function useDocumentTheme(theme: UiThemePreset, textScale: UiTextScalePercent): void {
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useLayoutEffect(() => {
    document.documentElement.dataset.textScale = String(textScale);
  }, [textScale]);
}
