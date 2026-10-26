# DS5 Bridge Companion UI Style Guide

This file is the layout contract for the Electron companion app. Treat it as part of the implementation, not inspiration. If a new control page needs a different geometry, document the reason here before adding new CSS.

## Stylesheets

`src/renderer/styles.css` is an `@import` manifest; add rules to the area file that owns them, never to the manifest.

- `styles/theme-palettes.css` defines the `--palette-*` primitives for every theme preset, on `:root[data-theme]`, `.shell[data-theme]`, and `.theme-option[data-theme-preview]` (the swatches in the theme picker).
- `styles/theme-tokens.css` maps palettes to semantic tokens (`--surface-*`, `--text-*`, `--accent-*`, `--success-*`, `--danger-*`, and so on) and holds the layout and type tokens below. Components use semantic tokens only.
- `styles/theme-ds5.css` is the frozen DS5 brand reference: the default dark theme's blue tokens and command-chip recipe. Change it only for a deliberate brand change.
- Area files (`base.css`, `app-shell.css`, `overview.css`, `audio.css`, and so on) hold page and surface rules. Components that own their markup import their own CSS from TSX (`features/shell/shell-sidebar.css`, `features/settings/settings-page.css`, `components/custom-select.css`); `main.tsx` imports `styles.css` before `App` so those files cascade after the base.
- No per-theme patches in area files. If a theme reads badly, fix its palette or add a semantic token.

Tests read styles through `src/renderer/test-support/renderer-styles.ts` (`rendererStyles()` follows the manifest, `rendererStyleModule(path)` reads one file, `cssBlockIn` finds a rule).

## Themes and Type

- Presets: Dark (default, DS5 blue), Light, Bubble Gum, Pomegranate, Kiwi. IDs live in `src/shared/ui-theme.ts`; labels and Ko-fi badges in `src/renderer/ui-themes.ts`. A new preset needs a palette block, a label, a badge, and must pass `theme-contrast.test.ts`.
- Type uses three sizes: `--font-size-title` (14.4px), `--font-size-body` (11.2px), and `--font-size-subtitle` (9.6px), with `--font-weight-regular|medium|semibold|strong`. Larger display text uses `calc()` multiples of the title token. Do not write px font sizes.
- Text size (80–120%) rescales the three type tokens through `[data-text-scale]`. UI scale (60–120%) is the Electron zoom on top of a 1.25 base factor, so layout px values are authored for a 1120×630 CSS px window.

## Layout Tokens

The shared grid values live in `styles/theme-tokens.css` under `:root, .shell`.

- `--window-bar-height: 40px` and `--top-chrome-height: 56px` size the frameless window bar and the page heading clearance.
- `--sidebar-width: 244px` is the navigation column. `--workspace-top-inset` and `--workspace-corner-radius: 12px` shape the workspace panel drawn by `.app-content::before`.
- `--card-gap: 12px` is the gap between sibling cards.
- `--card-radius: 4px` is the standard card radius for the flatter desktop style. The Settings page uses 12px grouped rows like Kitsune Input.
- `--control-radius: 3px` is the standard radius for buttons, selects, toggles, and framed controls.
- `--card-padding: 16px` is the standard card interior padding.
- `--feature-left-column: minmax(0, 1fr)` and `--feature-right-column: minmax(0, 1fr)` keep the main paired cards equal width.
- `--feature-card-min-height: 250px` keeps feature cards aligned tab to tab.
- `--feature-card-height: 370px` sets the shared minimum for Haptics, Audio, Triggers, Lighting, and System paired cards. Cards should stay content-sized above that minimum instead of stretching to the viewport.
- `--action-height: 48px` is the standard full-width action button height.
- `--control-height: 36px` is the standard compact control height.

Do not hardcode replacements for these values in a tab unless the component is a true exception.

## Shell

`features/shell/MainAppShell` owns the frameless window: the window bar (Kitsune Input banner centered, notifications, window controls), the sidebar, and the workspace panel.

- The sidebar shows the DS5 Bridge wordmark (Montserrat, "Bridge" in `--brand-wordmark-accent`), the device card (opens Devices), the bridge selector (rename, refresh, USB-direct rows), then Overview, the Controller, Input, and Labs groups, the System row, and a pinned footer with the Ko-fi badge and Settings.
- Navigation entries are defined once in `features/shell/control-tabs.tsx`. Nav rows are buttons with `aria-current="page"`, not tabs.
- Settings is a full page. While it is open, `features/settings/SettingsSidebar` replaces the navigation with search, grouped sections, and Back to app. Add a setting by giving it a search entry in `settings-navigation.ts` and a `SearchableSetting` row in the matching category component.

## Shared Primitives

Reuse these before writing new controls: `components/CustomSelect` (floating menu by default; legacy pages pass `floatingMenu={false}` through the `App.tsx` wrapper), `components/HelpTooltip`, `components/ActionMenu`, `components/TabStrip`, `common/LabeledSwitch`, `common/ModalDialog`, `common/DeferredPage`, `common/RendererFailureBoundary`, and `features/settings/SettingsToggleRow` (`ToggleRow`).

## Localization

Copy is written in English in JSX and translated at runtime by `composition/RendererLocalization`, which rewrites text and labels in the DOM. Locales: English, Spanish (Latin America), Spanish (Spain), Portuguese (Brazil), Italian, French, Polish, Korean, and Simplified Chinese.

1. Write the English string in a component under `components/`, `common/`, `composition/`, or `features/` (or `ui-themes.ts`). Strings in `App.tsx` are not cataloged until its pages move into `features/`.
2. Run `npm run localize:extract` to update `common/localization/locales/master.en.json`.
3. Add the translation for that exact English key to every locale file in `common/localization/locales/`.
4. `npm run localize:check` (part of `build:app`) and `catalogs.test.ts` fail when the master is stale or a locale misses a key.

Mark brand names, device names, and user-entered text with `data-l10n="off"`. Use `useLocalization().translate` for strings set outside rendered text, such as input placeholders.

## Page Structure

Every main tab should follow this order:

1. `feature-heading`
   - Left: page title and one short sentence.
   - Right: page-level enabled switch when the feature supports a kill switch.
2. `feature-card-grid`
   - Left card: primary setting or value control.
   - Right card: testing, behavior, status, or secondary controls.

The outer `control-panel` is intentionally flat. Do not wrap feature cards in another visual card; the repeated paired-card layout is the page structure.

Lighting and System must preserve the same two-column card geometry as Haptics, Audio, and Triggers. Their card bottoms should align within the active tab and their rendered card heights should match the other main tabs.

## Card Grid

Feature tabs must use:

```tsx
<div className="feature-card-grid">
  <section className="feature-card">...</section>
  <section className="feature-card">...</section>
</div>
```

The left and right cards should be the same width and height by default. The right column should not choose its own width. The card row should size to its content and shared minimum, not to the full remaining window height. If one right-column card needs a width or height adjustment, change the shared grid token or add a named grid variant so the rule is visible and reusable.

System may use `system-card` for semantic naming, but it still follows the same paired-card width and height contract as `feature-card`.

## Controls

- Sliders use `stacked-slider` plus `framed-slider` when they are the primary setting in a card.
- Slider labels, track, and value should stay in the same vertical position between Haptics, Audio, and Triggers.
- Percent sliders should use the shared `slider-row`, `range-control`, and `range-ticks` geometry. If a slider is intentionally notched, its native range `step` must match visible tick positions and it must not add tab-specific grid sizing.
- Testing buttons use `primary-action` and `secondary-action`.
- Testing cards are slotted, not free-flowing. The primary and secondary action rows must stay in the same vertical grid rows across Haptics, Audio, and Triggers, even when the setup content above them differs.
- Status copy at the bottom of test cards uses `feature-status`.
- Preset or level buttons use `segmented-row`.
- Dropdowns must use `CustomSelect`; do not use native `select` elements in the app surface.
- Icon buttons and navigation rows use `@tabler/icons-react` icons.

## Lighting Preview

The Lighting tab sends raw RGB bytes plus a separate brightness percentage to the firmware. Firmware scales the bytes linearly before writing the DualSense lightbar report. The live lightbar preview is intentionally hidden for now because it created misleading expectations about real controller brightness. Use `selected-color-info` for the selected name and hex value instead.

Light color selection belongs in the Lighting behavior card. Preset swatches should use literal, saturated send values so the preview square matches the bytes sent to the controller: `#FFFF00`, `#0000FF`, `#00FF00`, `#FF0000`, `#8000FF`, and `#FFFFFF`. The custom swatch stores the last picker value separately from preset selection: one click returns to that saved custom color, while double-click opens the compact dark palette-grid color popover. The selected custom swatch should show the custom color as the interior fill with a gradient border only around the edge. Animate that border only on hover/focus or while the picker is open, and keep it as a slow shimmer rather than a spinning rainbow. Palette-cell clicks should immediately preview the color on the controller; the "Use Color" action saves that previewed color as the remembered custom color. Palette color names are exact labels owned by the grid data, not approximate nearest-color guesses.

Shelved research note: DualSense lightbar output is likely raw PWM rather than display-managed sRGB. A future calibrated mode could test gamma and per-channel weights against real hardware, but guessing those values in the normal UI made brightness misleading.

## Visual QA

Before considering a UI change finished:

1. Run `npm run typecheck` and `npm run test:companion` from `companion/`.
2. Run `npm run ui:review` and inspect `build/ui-review/` (Overview, Haptics, and Settings in dark and light at 100% and 120% text). It uses fixture data in a minimal Electron host, so it never touches a bridge or saved settings.
3. `node scripts/visual-smoke.mjs --fixture` and `node scripts/layout-check.mjs --fixture` walk every page with the same fixture data (run `npm run build:app` first).
4. Only run `npm run visual:smoke` or `npm run layout:check` against the real app when the user explicitly asks for it; then inspect the screenshots in `companion/artifacts/ui/`.
5. When manually testing the app, flip between Haptics, Audio, Triggers, Lighting, and System and check that repeated controls do not jump around without a clear reason.

The app should look like a tool surface: dense, calm, consistent, and readable. Avoid decorative layout changes that make one tab feel like it was designed in isolation.
