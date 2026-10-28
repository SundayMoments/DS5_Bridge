# DS5 Bridge Companion UI Style Guide

This file is the layout contract for the Electron companion app. Treat it as part of the implementation, not inspiration. If a new control page needs a different geometry, document the reason here before adding new CSS.

## Stylesheets

`src/renderer/styles.css` is an `@import` manifest; add rules to the area file that owns them, never to the manifest.

- `styles/theme-palettes.css` defines the `--palette-*` primitives for every theme preset, on `:root[data-theme]`, `.shell[data-theme]`, and `.theme-option[data-theme-preview]` (the swatches in the theme picker).
- `styles/theme-tokens.css` maps palettes to semantic tokens (`--surface-*`, `--text-*`, `--accent-*`, `--success-*`, `--danger-*`, and so on) and holds the layout and type tokens below. Components use semantic tokens only.
- `styles/theme-ds5.css` is the frozen DS5 brand reference: the default dark theme's blue tokens and command-chip recipe. Change it only for a deliberate brand change.
- Cards are flat in every theme, like Kitsune Input's: one solid `--surface-card` (the workspace color in dark), framed by `--section-border`, with the header row on the same surface as the body (only its divider line separates them). There are no card shadows (`--shadow-card`, `--shadow-panel`, and `--shadow-control` are `none`) and no glow gradients on cards. Floating menus and dialogs keep `--shadow-menu`.
- Area files (`base.css`, `app-shell.css`, `overview.css`, `audio.css`, and so on) hold page and surface rules. Components that own their markup import their own CSS from TSX (`features/shell/shell-sidebar.css`, `features/settings/settings-page.css`, `features/settings/wake-pc-settings.css`, `features/bootloader-confirmation/bootloader-confirmation.css`, `features/kitsune-promotion/kitsune-launch-offer.css`); `main.tsx` imports the fonts and `styles.css` before `App` so those files cascade after the base.
- `base.css` holds `.visually-hidden` for text that only screen readers need.
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
- `--card-radius: 12px` is the card and panel radius, the same rounded panel system as Kitsune Input. Card headers use `calc(var(--card-radius) - 1px)` on their top corners.
- `--control-radius: 6px` is the radius for buttons, selects, toggles, chips, feature icon tiles, and panels nested inside a card (framed sliders, the Overview slider list, the stick preview). Elements inset inside a control use `calc(var(--control-radius) - <inset>)` so their corners stay concentric.
- Weights follow Kitsune Input too: page and card headings are `--font-weight-semibold`, buttons and preset rows `--font-weight-medium`.
- `--card-padding: 16px` is the standard card interior padding.
- `--feature-left-column: minmax(0, 1fr)` and `--feature-right-column: minmax(0, 1fr)` keep the main paired cards equal width.
- `--feature-card-min-height: 250px` keeps feature cards aligned tab to tab.
- `--feature-card-height: 370px` is the generic control-page minimum. Haptics, Audio, Adaptive Triggers, Lighting, and System pin their paired-card row to 326px in `styles/page-layouts.css` (`auto minmax(0, 326px)`); System gives the rest to its profile panel (`minmax(148px, 1fr)`). Feature pages have no Tips panel; explain a control with its label or a `HelpTooltip`. `layout-check --fixture` fails when a tab's cards differ from that height.
- `--action-height: 48px` is the standard full-width action button height.
- `--control-height: 36px` is the standard compact control height.

Do not hardcode replacements for these values in a tab unless the component is a true exception.

## Shell

`features/shell/MainAppShell` owns the frameless window: the window bar (Kitsune Input banner centered; the Ko-fi badge, notifications, and window controls on the right), the sidebar, and the workspace panel.

- The sidebar shows the DS5 Bridge wordmark (Montserrat, "Bridge" in `--brand-wordmark-accent`), the device card (opens Devices), the bridge selector (rename, refresh, USB-direct rows), then Overview and the Controller, Input, and Tools groups (Controller holds Devices and DualSense; Tools holds Audio Haptics, Trigger Lab, and System). Settings sits alone below the list.
- DualSense is Kitsune Input's Controller Studio: one sidebar entry for Audio, Haptics, Triggers, and Lighting, with `DualSenseSectionTabs` (`.studio-tab-strip`) above each page's own header to move between them. The entry reopens the section last used and shows as current on all four; each section keeps its tab ID, so links into a section still work. Audio Haptics and Trigger Lab reuse the Haptics and Triggers pages without the strip.
- The device card's border carries the state (green connected, amber waiting or switching, red on a bridge error); there is no status dot. `features/shell/sidebar-device.ts` builds the card and bridge selector from the snapshot.
- Navigation entries are defined once in `features/shell/control-tabs.tsx`. Nav rows are buttons with `aria-current="page"`, not tabs.
- Settings is a full page. While it is open, `features/settings/SettingsSidebar` replaces the navigation with search, grouped sections, and Back to app. Add a setting by giving it a search entry in `settings-navigation.ts` and a `SearchableSetting` row in the matching category component, then wire its action in `features/settings/use-settings-page.ts`. Wake PC holds USB wake and the Wake-on-LAN panel ported from Kitsune Input: a collapsible header with its status and switch, setup locked while a controller is connected, and the read-only "Before you rely on it" checklist; Bridge Firmware holds the Pico tools and the Last restart row.
- There is no splash screen. Until the first snapshot arrives the shell renders with `className="shell starting"`, a placeholder device card, "Looking for bridges…", and `StartupPlaceholderPage` in the page area, in the theme and text size saved from the last run (`composition/use-app-appearance.ts`).

## App Composition

`App.tsx` owns the `AppRuntime` (snapshot, `pendingAction`, `runAction`, `runQuietAction`), creates each feature's controller, and composes the pages. It holds no page markup. `runAction` takes the app-wide lock synchronously (`useAppActionLock`), so two actions started in one tick cannot both run. While it holds the lock the shell carries `data-app-action-pending`: locked controls refuse input at once, but their disabled look waits `--app-action-pending-look-delay` (300 ms), so quick commands never flash the page.

- Each page lives in `features/<feature>/`: a `<Name>Page.tsx` that renders, a `use-<feature>-controller.ts` hook `(runtime, input)` that returns state and actions (and `syncSnapshot` when it keeps slider drafts), a pure `model.ts` for anything worked out from the snapshot, and an `index.ts`.
- Overview, Haptics/Audio Haptics, Audio, Adaptive Triggers/Trigger Lab, and Lighting are in the main chunk. Devices, Stick Deadzones, Button Remapping, Chords, System, and Settings load on first visit through `composition/lazy-pages.tsx` (`lazyPage` with a `pageShell` placeholder that keeps the page's classes). App imports those pages' controllers and dialogs from their module files, never the feature index, so the pages stay out of the main chunk.
- Every page sits in `common/DeferredPage`: it mounts on first visit and stops re-rendering while hidden. `composition/use-bridge-snapshots.ts` keeps only the newest snapshot while the window is dragged, hidden, or minimized, and controllers that poll take an `active` flag that includes window visibility.
- Window-bar and sidebar state lives in hooks too: `features/shell/use-notifications-menu.ts` and `features/settings/use-settings-page.ts`.

## Dialogs

Modal dialogs use `modal-backdrop` with a `role="dialog"` form or panel, a labelled close button, and Escape to close unless the dialog is locked.

- The controller confirmation for UF2 mode (`features/bootloader-confirmation`) sits above everything (z-index 200), on any page, and can only be cancelled.
- No Kitsune Input prompt appears during first-run setup or on the run that finishes it. Finishing setup starts a month (`kitsune-ask-schedule.ts`); a user who finished setup in 1.x starts it on their first 2.x run instead.
- The one-time Kitsune Input offer opens shortly after the first snapshot once that month has passed, never over the first-run tutorial, the controller confirmation, or the promotion dialog. Its X, Escape, and the backdrop close it at once; `kitsuneInputLaunchOfferShown` records that it was shown.
- "Considering Getting Kitsune Input?" (`KitsuneInputMonthlyAsk`) comes back on its own at most once a month after the launch offer: the launch offer's content under its own question, with a quiet Continue that, like Escape, closes it at once. A run shows at most one Kitsune Input prompt: the launch offer, else the monthly ask; each restarts the month. The monthly ask never appears for anyone who chose "Don't show Kitsune Input promotions again" in an earlier version (`kitsuneInputPromotionDismissed`, which also hides the window-bar banner). That option is gone, but the choice is kept.
- The prompts' Learn More and Get Kitsune Input buttons open kitsuneinput.com with `?src=ds5-popup` (`KITSUNE_INPUT_POPUP_URL`, `KITSUNE_INPUT_POPUP_PURCHASE_URL`), so the website can count their clicks; the app records nothing. The Settings card keeps the untagged links.
- Settings › Help & About always opens with `KitsuneInputSupportCard`: the banner's fox and wordmark, "Consider supporting Kitsune Input", the price, Learn More and an orange Get Kitsune Input. It is not a prompt: it never opens on its own, is never dismissed, and shows even for an earlier promotions dismissal.
- Kitsune Input panels are flat like the app: no orange top strip; the orange marks the icons and the Get Kitsune Input button only.
- The window-bar banner opens the same offer (`KitsuneInputOfferContent`), without a way to hide promotions for good. Keep the two in step: change the shared content, not one dialog.
- A row that another page links to (Overview's chips, Settings search) is framed briefly in `--focus-ring` (`settings-menu-row-highlight`), never tinted.
- System's emergency device repair asks first and refuses while a controller is connected; its profile dialogs save, rename, and delete.

## Shared Primitives

Reuse these before writing new controls: `components/CustomSelect` (floating menu by default; feature cards use `components/InlineSelect`, which opens inline), `components/HelpTooltip`, `components/ActionMenu`, `components/TabStrip`, `common/LabeledSwitch`, `common/ModalDialog`, `common/DeferredPage`, `common/RendererFailureBoundary`, and `features/settings/SettingsToggleRow` (`ToggleRow`).

## Localization

Copy is written in English in JSX and translated at runtime by `composition/RendererLocalization`, which rewrites text and labels in the DOM. Locales: English, Spanish (Latin America), Spanish (Spain), Portuguese (Brazil), Italian, French, Polish, Korean, and Simplified Chinese.

1. Write the English string in a component under `components/`, `common/`, `composition/`, or `features/` (or `ui-themes.ts`). Every page now lives there, so all visible copy is cataloged.
2. Run `npm run localize:extract` to update `common/localization/locales/master.en.json`.
3. Add the translation for that exact English key to every locale file in `common/localization/locales/`.
4. `npm run localize:check` (part of `build:app`) and `catalogs.test.ts` fail when the master is stale, a locale misses a key, or a multi-word phrase is left in English.

The extractor reads JSX text, visible attributes (`aria-label`, `title`, and so on), and string literals in variables, properties, and functions whose names say they are shown (`label`, `status`, `message`, `title`, ...). It skips single lowercase words. Name values accordingly (`audioRouteLabel`, not `audioPathState`). Messages the renderer only receives at runtime, such as the haptics test failures main sends, go in `seededMessages`. Product names, key legends (F1–F24), and units that read the same in every language go in `allowedSourceIdenticalPhrases`.

Mark brand names, device names, and user-entered text with `data-l10n="off"`. Use `useLocalization().translate` for strings set outside rendered text, such as input placeholders.

## Page Structure

Every main tab should follow this order:

1. `feature-heading`
   - Left: page title and one short sentence.
   - Right: page-level enabled switch when the feature supports a kill switch.
   - Controller and Input pages (Audio, Haptics, Adaptive Triggers, Lighting, Stick Deadzones, Button Remapping, Chords, and the Audio Haptics and Trigger Lab tools) use Kitsune Input's header card: `feature-heading studio-feature-heading` with a `studio-heading-copy` holding the page's icon tile and its title. Where the page has an on/off toggle, that icon tile is the toggle button (`feature-icon … -enable-button`), so the left card no longer carries one. Overview, Devices, System, and Settings keep their own headings.
2. `feature-card-grid`
   - Left card: primary setting or value control. Its header is `feature-card-title title-only` (title and description, no icon) or, when the card switches modes, `dual-selector studio-mode-tabs` (full-width icon tabs such as Speaker / Mic and Haptics / Rumble) at the title's height.
   - Right card: testing, behavior, status, or secondary controls.

The outer `control-panel` is intentionally flat. Do not wrap feature cards in another visual card; the repeated paired-card layout is the page structure. Pages fill the workspace (`.control-page` is `width: 100%`), so the left and right gutters match, as in Kitsune Input.

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
- Testing cards are slotted, not free-flowing. The primary and secondary action rows must stay in the same vertical grid rows across Haptics, Audio, and Triggers, even when the setup content above them differs. The row above the actions holds test options (Triggers) or the reason a test failed (`feedback-test-error`, `role="alert"`, linked to the test button with `aria-describedby`).
- Status copy at the bottom of test cards uses `feature-status`. A test the bridge refused reads Failed in the warn tone, keeps its button enabled for a retry, and clears on the next test or a mode switch.
- Overview's Quick Actions match Kitsune Input: the host persona tiles, then one full-width Sleep Controller row (`overview-sleep-row`). Tests run from their own pages.
- Preset rows sit at the same offset in every preset card (`layout-check` compares them). Switches under the presets, such as Boost and v1 Rumble on Haptics, follow them on the 16px rhythm in one row instead of pinning to the card's bottom edge.
- Preset or level buttons use `segmented-row`.
- Dropdowns must use `CustomSelect`; do not use native `select` elements in the app surface.
- Icon buttons and navigation rows use `@tabler/icons-react` icons.

## Lighting Preview

The Lighting tab sends raw RGB bytes plus a separate brightness percentage to the firmware. Firmware scales the bytes linearly before writing the DualSense lightbar report. The live lightbar preview is intentionally hidden for now because it created misleading expectations about real controller brightness. Use `selected-color-info` for the selected name and hex value instead.

Light color selection belongs in the Lighting behavior card. Preset swatches should use literal, saturated send values so the preview square matches the bytes sent to the controller: `#FFFF00`, `#0000FF`, `#00FF00`, `#FF0000`, `#8000FF`, and `#FFFFFF`. The custom swatch stores the last picker value separately from preset selection: one click returns to that saved custom color, while double-click opens the compact dark palette-grid color popover. The selected custom swatch should show the custom color as the interior fill with a gradient border only around the edge. Animate that border only on hover/focus or while the picker is open, and keep it as a slow shimmer rather than a spinning rainbow. Palette-cell clicks should immediately preview the color on the controller; the "Use Color" action saves that previewed color as the remembered custom color. Palette color names are exact labels owned by the grid data, not approximate nearest-color guesses.

Shelved research note: DualSense lightbar output is likely raw PWM rather than display-managed sRGB. A future calibrated mode could test gamma and per-channel weights against real hardware, but guessing those values in the normal UI made brightness misleading.

## Tests

Prefer rendered tests. `src/renderer/test-support/app-harness.tsx` mounts the whole renderer against a mocked `window.bridge`: `fixtureSnapshot(overrides)` builds a connected DualSense Edge snapshot, `installBridgeMock` returns `fn(name)` mocks and `emit(snapshot)`, and `renderApp`, `openPage`, `click`, `buttonByText`, `chooseOption`, and `setRange` drive it like a person would. Pure models get plain unit tests next to them (`model.test.ts`).

Source-text tests (`app-behavior.test.ts`, `styles-layout.test.ts`) are for what rendering cannot see: stylesheet rules, entry imports, and code that must stay out of a feature. No test reads `App.tsx`.

## Visual QA

Before considering a UI change finished:

1. Run `npm run typecheck`, `npm run test:companion`, and `npm run localize:check` from `companion/`.
2. Run `npm run ui:review` and inspect `build/ui-review/`: Overview, Haptics, System, and Settings in dark and light at 100% and 120% text, the controller confirmation and Kitsune Input offer, a refused haptics test, and the Wake PC states. It uses fixture data in a minimal Electron host, so it never touches a bridge or saved settings.
3. `node scripts/visual-smoke.mjs --fixture` and `node scripts/layout-check.mjs --fixture` walk every page with the same fixture data (run `npm run build:app` first).
4. `npm run perf:renderer` measures renderer CPU and memory in the fixture host for visible, hidden, and minimized windows.
5. Only run `npm run visual:smoke` or `npm run layout:check` against the real app when the user explicitly asks for it; then inspect the screenshots in `companion/artifacts/ui/`.
6. When manually testing the app, flip between Haptics, Audio, Triggers, Lighting, and System and check that repeated controls do not jump around without a clear reason.

The app should look like a tool surface: dense, calm, consistent, and readable. Avoid decorative layout changes that make one tab feel like it was designed in isolation.
