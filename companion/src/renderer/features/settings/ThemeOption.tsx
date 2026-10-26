import type { UiThemePreset } from '@shared/ui-theme';
import { UI_THEME_PREVIEW_SWATCHES } from '../../ui-themes';

/** A theme name with swatches resolved from its own palette in theme-palettes.css. */
export function ThemeOption({ label, value }: { readonly label: string; readonly value: UiThemePreset }) {
  return (
    <span className="theme-option" data-theme-preview={value}>
      <span className="theme-option-swatches" aria-hidden="true">
        {UI_THEME_PREVIEW_SWATCHES.map((swatch) => (
          <span key={`${value}-${swatch.role}`} title={swatch.role} style={{ background: swatch.color }} />
        ))}
      </span>
      <span className="theme-option-label">{label}</span>
    </span>
  );
}

export function renderThemeOption(label: string, value: UiThemePreset) {
  return <ThemeOption label={label} value={value} />;
}
