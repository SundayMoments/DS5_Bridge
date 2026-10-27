/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UI_THEME_PRESETS } from '../shared/ui-theme';
import { cssBlockIn, rendererStyleModule, rendererStyles } from './test-support/renderer-styles';
import { UI_THEME_PRESET_STORAGE_KEY } from './ui-theme-preferences';
import {
  UI_THEME_KOFI_BADGES,
  UI_THEME_OPTIONS,
  UI_THEME_PREVIEW_SWATCHES
} from './ui-themes';

const styles = rendererStyles();
const palettesSource = rendererStyleModule('styles/theme-palettes.css');
const tokensSource = rendererStyleModule('styles/theme-tokens.css');
const ds5ThemeSource = rendererStyleModule('styles/theme-ds5.css');
const shellSidebarSource = rendererStyleModule('features/shell/shell-sidebar.css');
const bridgeMarkSource = readFileSync(new URL('./features/shell/BridgeMark.tsx', import.meta.url), 'utf8');
const settingsPageStyles = rendererStyleModule('features/settings/settings-page.css');
const settingsSidebarStyles = rendererStyleModule('features/settings/settings-sidebar.css');
const appSettingsSource = readFileSync(new URL('./features/settings/AppSettings.tsx', import.meta.url), 'utf8');
const systemSettingsSource = readFileSync(new URL('./features/settings/SystemSettings.tsx', import.meta.url), 'utf8');
const themeOptionSource = readFileSync(new URL('./features/settings/ThemeOption.tsx', import.meta.url), 'utf8');
const normalizedStyles = styles.replace(/\s+/g, ' ').trim();

function cssBlock(selector: string, requiredText?: string): string {
  const normalizedRequiredText = requiredText?.replace(/\s+/g, ' ').trim();
  let searchFrom = 0;
  while (searchFrom < styles.length) {
    const selectorIndex = styles.indexOf(selector, searchFrom);
    if (selectorIndex === -1) {
      break;
    }
    const blockStart = styles.indexOf('{', selectorIndex);
    const blockEnd = styles.indexOf('}', blockStart);
    if (blockStart === -1 || blockEnd === -1) {
      break;
    }
    const block = styles.slice(blockStart + 1, blockEnd);
    const normalizedBlock = block.replace(/\s+/g, ' ').trim();
    if (!normalizedRequiredText || normalizedBlock.includes(normalizedRequiredText)) {
      return block;
    }
    searchFrom = blockEnd + 1;
  }

  if (requiredText) {
    throw new Error(`Missing CSS block for ${selector} containing ${requiredText}`);
  } else {
    throw new Error(`Missing CSS block for ${selector}`);
  }
}

describe('companion layout CSS', () => {
  it('keeps feature cards content-sized instead of viewport-stretched', () => {
    expect(normalizedStyles).not.toContain('--app-base-width');
    expect(normalizedStyles).not.toContain('transform: scale(var(--app-scale))');
    expect(cssBlock('.shell', 'width: 100vw;')).toContain('width: 100vw;');
    expect(cssBlock('.shell', 'height: 100vh;')).toContain('height: 100vh;');
    expect(cssBlock('.app-content', 'width: 100%;')).toContain('width: 100%;');
    expect(cssBlock('.app-content', 'grid-template-rows: minmax(0, 1fr);')).toContain(
      'grid-template-rows: minmax(0, 1fr);'
    );
    expect(cssBlock('.control-panel.flat-control-panel', 'height: 100%;')).toContain('height: 100%;');
    expect(cssBlock('.control-pages', 'min-height: 0;')).toContain('min-height: 0;');
    expect(cssBlock('.control-page', 'grid-template-rows: auto minmax(var(--feature-card-height), auto);')).toContain(
      'grid-template-rows: auto minmax(var(--feature-card-height), auto);'
    );
    expect(cssBlock('.control-page', 'visibility: hidden;')).toContain('visibility: hidden;');
    expect(cssBlock('.control-page', 'pointer-events: none;')).toContain('pointer-events: none;');
    expect(cssBlock('.control-page.active', 'visibility: visible;')).toContain('visibility: visible;');
    expect(cssBlock('.control-page.active', 'pointer-events: auto;')).toContain('pointer-events: auto;');
    expect(cssBlock('.feature-card-grid', 'height: auto;')).toContain('height: auto;');
  });

  it('delays the disabled look of controls locked by an app-wide action', () => {
    expect(tokensSource).toContain('--app-action-pending-look-delay: 300ms;');
    const delayedLook = cssBlock(
      '.shell[data-app-action-pending] :disabled,',
      'transition-delay: var(--app-action-pending-look-delay) !important;'
    );
    expect(delayedLook).toContain('transition-duration: 0s !important;');
    // The switch knob slides with transform; the delay must not hold it back.
    expect(delayedLook).not.toContain('transform');
  });

  it('animates the battery meter with transform instead of layout width', () => {
    expect(cssBlock('.battery-track div', 'transform: scaleX(var(--battery-scale, 0));')).toContain(
      'transform: scaleX(var(--battery-scale, 0));'
    );
    expect(cssBlock('.battery-track div', 'transition: transform 180ms ease, background 180ms ease;')).toContain(
      'transition: transform 180ms ease, background 180ms ease;'
    );
    expect(normalizedStyles).not.toContain('transition: width');
  });

  it('keeps system columns equal height on the shared card height', () => {
    expect(cssBlock('.system-page .feature-card-grid', 'align-items: stretch;')).toContain('align-items: stretch;');
    expect(cssBlock('.system-page .system-card', 'align-self: stretch;')).toContain('align-self: stretch;');
    expect(normalizedStyles).toContain('.lighting-page .feature-card, .deadzones-page .feature-card, .system-page .system-card');
    expect(cssBlock('.device-diagnostics', 'flex: 1 1 0;')).toContain('flex: 1 1 0;');
    expect(cssBlock('.device-diagnostics', 'overflow: auto;')).toContain('overflow: auto;');
  });

  it('content-sizes the system profile panel so summary rows stay inside its border', () => {
    // System cards match the other pages' 326px row; the profile panel keeps at least 148px.
    const systemPage = cssBlock('.system-page', 'grid-template-rows: auto minmax(0, 326px) minmax(148px, 1fr);');
    expect(systemPage).toContain('height: 100%;');
    expect(systemPage).toContain('min-height: 0;');
    const profilePanel = cssBlock('.system-profile-panel', 'grid-template-rows: auto minmax(0, 1fr);');
    expect(profilePanel).toContain('gap: 8px;');
    expect(cssBlock('.system-profile-summary-group', 'align-content: start;')).toContain('align-content: start;');
    expect(cssBlock('.system-profile-summary dt,', 'font-size: var(--font-size-subtitle);')).toContain('line-height: 1.15;');
    expect(cssBlock('.system-profile-strip .system-profile-save-status,', 'font-size: var(--font-size-subtitle);')).toContain(
      'min-height: 28px;'
    );
  });

  it('keeps test card statuses aligned and gives lighting color metadata enough room', () => {
    const sharedRows = '--feature-status-grid-rows: var(--feature-card-header-height) 76px var(--action-height) var(--action-height) minmax(40px, 1fr);';
    expect(cssBlock('.feature-card', sharedRows)).toContain(sharedRows);
    expect(normalizedStyles).toContain('--feature-card-header-height: 66px;');
    expect(cssBlock('.feature-card-title', 'min-height: var(--feature-card-header-height);')).toContain(
      'min-height: var(--feature-card-header-height);'
    );
    expect(cssBlock('.test-card', 'grid-template-rows: var(--feature-status-grid-rows);')).toContain(
      'grid-template-rows: var(--feature-status-grid-rows);'
    );
    expect(cssBlock('.behavior-card', 'grid-template-rows: var(--feature-status-grid-rows);')).toContain(
      'grid-template-rows: var(--feature-status-grid-rows);'
    );
    expect(cssBlock('.behavior-card .feature-card-title', 'align-self: start;')).toContain('align-self: start;');
    expect(cssBlock('.test-card .feature-status', 'grid-row: 5;')).toContain('grid-row: 5;');
    expect(cssBlock('.behavior-card .lighting-status', 'grid-row: 5;')).toContain('grid-row: 5;');
    expect(cssBlock('.behavior-card .light-color-panel', 'grid-row: 3 / 5;')).toContain('grid-row: 3 / 5;');
    expect(cssBlock('.light-color-meta', 'grid-row: 3;')).toContain('grid-row: 3;');
  });

  it('keeps feature cards on the darker card surface', () => {
    expect(cssBlock('.feature-card', 'background: var(--surface-card);')).toContain(
      'background: var(--surface-card);'
    );
    expect(cssBlock('.system-card', 'background: var(--surface-card);')).toContain(
      'background: var(--surface-card);'
    );
    const featureCardTitle = cssBlock('.feature-card-title', 'background: var(--surface-card-header);');
    expect(featureCardTitle).toContain('background: var(--surface-card-header);');
    expect(featureCardTitle).toContain('border-radius: calc(var(--card-radius) - 1px) calc(var(--card-radius) - 1px) 0 0;');
    expect(featureCardTitle).not.toContain('radial-gradient');
    expect(cssBlock('.hero-card,', 'background-clip: padding-box;')).toContain('background-clip: padding-box;');
  });

  it('keeps overview containers on the flat card surface with no glow', () => {
    const overviewCard = cssBlock('.overview-card', 'background:');
    expect(overviewCard).toContain('background: var(--surface-card);');
    expect(overviewCard).toContain('border: 1px solid var(--section-border);');
    expect(styles).not.toContain('overview-accent-gradient');
    const overviewControlPanel = cssBlock('.overview-control-panel', 'background: var(--surface-panel);');
    expect(overviewControlPanel).toContain('background: var(--surface-panel);');
    const overviewStatusPanel = cssBlock('.overview-status-panel', 'background: var(--surface-panel);');
    expect(overviewStatusPanel).toContain('background: var(--surface-panel);');
  });

  it('defines every preset palette, including the swatches used by the theme control', () => {
    for (const theme of UI_THEME_PRESETS) {
      expect(palettesSource).toContain(`.shell[data-theme="${theme}"]`);
      expect(palettesSource).toContain(`:root[data-theme="${theme}"]`);
      expect(palettesSource).toContain(`.theme-option[data-theme-preview="${theme}"]`);
      expect(UI_THEME_KOFI_BADGES[theme]).toBeTruthy();
    }
    expect(UI_THEME_OPTIONS.map(([, preset]) => preset)).toEqual([...UI_THEME_PRESETS]);
    expect(UI_THEME_PREVIEW_SWATCHES.map(({ color }) => color)).toEqual([
      'var(--palette-canvas)',
      'var(--palette-surface)',
      'var(--palette-accent)'
    ]);
    expect(appSettingsSource).toContain('ariaLabel="UI theme"');
    expect(appSettingsSource).toContain('className="settings-theme-select"');
    expect(appSettingsSource).toContain('renderOption={renderThemeOption}');
    expect(themeOptionSource).toContain('<span className="theme-option" data-theme-preview={value}>');
  });

  it('starts in the cached theme with placeholder cards instead of a splash screen', () => {
    // Rendering in the cached theme before the first snapshot, without a splash screen,
    // is covered in features/startup/startup.rendered.test.tsx.
    expect(UI_THEME_PRESET_STORAGE_KEY).toBe('ds5bridge.uiThemePreset');
    expect(normalizedStyles).not.toContain('startup-progress');
    expect(cssBlock('.startup-placeholder-grid span', 'background: var(--surface-card);')).toContain(
      'border: 1px solid var(--surface-border);'
    );
  });

  it('keeps theme window bars and sidebars flat instead of gradient layered', () => {
    for (const themeBlock of [
      cssBlockIn(ds5ThemeSource, '.shell[data-theme="dark"]', '--window-bar-bg:'),
      cssBlockIn(tokensSource, '.shell {', '--window-bar-bg:')
    ]) {
      expect(themeBlock).not.toContain('var(--sidebar-width)');
      expect(themeBlock).not.toContain('--window-bar-bg: linear-gradient');
      expect(themeBlock).not.toContain('--sidebar-bg: linear-gradient');
      expect(themeBlock).not.toContain('--sidebar-overlay: linear-gradient');
      expect(themeBlock).toContain('--window-bar-bg: var(--window-bar-bg-flat);');
      expect(themeBlock).toContain('--sidebar-overlay: transparent;');
    }
    expect(cssBlockIn(tokensSource, '.shell {', '--window-bar-bg-flat:')).toContain(
      '--window-bar-bg-flat: var(--palette-sidebar);'
    );
  });

  it('keeps the DS5 mark in brand blue while its primary shape follows the theme text', () => {
    expect(bridgeMarkSource).toContain('fill="var(--bridge-mark-primary)"');
    expect(bridgeMarkSource).toContain('fill="var(--bridge-mark-secondary)"');
    // The mark renders as inline SVG in features/startup/startup.rendered.test.tsx.
    const ds5Theme = cssBlockIn(ds5ThemeSource, '.shell[data-theme="dark"]', '--bridge-mark-primary:');
    expect(ds5Theme).toContain('--bridge-mark-primary: #ffffff;');
    expect(ds5Theme).toContain('--bridge-mark-secondary: #046fff;');
    const sharedTokens = cssBlockIn(tokensSource, '.shell {', '--bridge-mark-primary:');
    expect(sharedTokens).toContain('--ds5-blue: #046fff;');
    expect(sharedTokens).toContain('--bridge-mark-primary: var(--text-strong);');
    expect(sharedTokens).toContain('--bridge-mark-secondary: var(--ds5-blue);');
  });

  it('uses dedicated sidebar text tokens for section labels and nav links', () => {
    const sharedTokens = cssBlockIn(tokensSource, '.shell {', '--sidebar-label:');
    expect(sharedTokens).toContain('--sidebar-label: var(--text-muted);');
    expect(sharedTokens).toContain('--sidebar-link: var(--text-secondary);');
    expect(sharedTokens).toContain('--sidebar-link-hover: var(--text-strong);');
    expect(sharedTokens).toContain('--sidebar-link-disabled: var(--text-disabled);');
    const ds5Theme = cssBlockIn(ds5ThemeSource, '.shell[data-theme="dark"]', '--sidebar-label:');
    expect(ds5Theme).toContain('--sidebar-label: var(--text-dim);');
    expect(cssBlockIn(shellSidebarSource, '.sidebar-section-label', 'color: var(--sidebar-label);')).toContain(
      'color: var(--sidebar-label);'
    );
    expect(cssBlockIn(shellSidebarSource, '.control-tab-button,', 'color: var(--sidebar-link);')).toContain(
      'color: var(--sidebar-link);'
    );
    expect(cssBlockIn(shellSidebarSource, '.control-tab-button:not(.active):hover,', 'color: var(--sidebar-link-hover);'))
      .toContain('color: var(--sidebar-link-hover);');
    const disabledSidebarButton = cssBlockIn(shellSidebarSource, '.sidebar-nav-button:disabled', 'color: var(--sidebar-link-disabled);');
    expect(disabledSidebarButton).toContain('color: var(--sidebar-link-disabled);');
    expect(disabledSidebarButton).toContain('opacity: 1;');
  });

  it('splits page headings from card headings so themes can tint page chrome', () => {
    const ds5Theme = cssBlockIn(ds5ThemeSource, '.shell[data-theme="dark"]', '--page-heading-text:');
    expect(ds5Theme).toContain('--page-heading-text: var(--text-primary);');
    expect(ds5Theme).toContain('--page-subtitle-text: var(--text-secondary);');
    expect(ds5Theme).toContain('--card-heading-text: var(--text-primary);');
    expect(ds5Theme).toContain('--card-subtitle-text: var(--text-secondary);');
    expect(ds5Theme).toContain('--settings-copy-text: var(--text-muted);');
    const sharedTokens = cssBlockIn(tokensSource, '.shell {', '--page-heading-text:');
    expect(sharedTokens).toContain('--page-heading-text: var(--text-strong);');
    expect(sharedTokens).toContain('--page-subtitle-text: var(--text-secondary);');
    expect(sharedTokens).toContain('--card-heading-text: var(--text-strong);');
    expect(sharedTokens).toContain('--settings-copy-text: var(--text-secondary);');
    expect(cssBlock('.control-heading h2,', 'color: var(--page-heading-text);')).toContain(
      'color: var(--page-heading-text);'
    );
    expect(cssBlock('.system-card h3,', 'color: var(--card-heading-text);')).toContain(
      'color: var(--card-heading-text);'
    );
    expect(cssBlock('.control-heading p,', 'color: var(--page-subtitle-text);')).toContain(
      'color: var(--page-subtitle-text);'
    );
    expect(cssBlock('.title-copy p', 'color: var(--card-subtitle-text);')).toContain(
      'color: var(--card-subtitle-text);'
    );
    expect(cssBlock('.settings-menu-copy > span', 'color: var(--settings-copy-text);')).toContain(
      'color: var(--settings-copy-text);'
    );
    expect(cssBlock('.notifications-menu .settings-menu-row span', 'color: var(--settings-copy-text);')).toContain(
      'color: var(--settings-copy-text);'
    );
  });

  it('sizes the theme selector to its longest option instead of a fixed wide box', () => {
    const themeSelect = cssBlock('.settings-theme-select', 'width: max-content;');
    expect(themeSelect).toContain('flex: 0 0 auto;');
    expect(themeSelect).toContain('width: max-content;');
    expect(cssBlock('.settings-theme-select .custom-select-menu', 'min-width: max-content;')).toContain(
      'min-width: max-content;'
    );
  });

  it('keeps the remapping profile strip aligned with shared feature headers', () => {
    expect(cssBlock('.remapping-page', 'height: 100%;')).toContain('height: 100%;');
    expect(cssBlock('.remapping-page', 'min-height: 0;')).toContain('min-height: 0;');
    expect(cssBlock('.remapping-card', 'min-height: 0;')).toContain('min-height: 0;');
    expect(cssBlock('.remapping-card', '--remapping-profile-strip-height: var(--feature-card-header-height);')).toContain(
      '--remapping-profile-strip-height: var(--feature-card-header-height);'
    );
    expect(cssBlock('.remapping-profile-strip', 'min-height: var(--remapping-profile-strip-height);')).toContain(
      'min-height: var(--remapping-profile-strip-height);'
    );
  });

  it('keeps autosave indicators aligned with profile action button styling', () => {
    expect(styles).not.toContain('--autosave-status-bg');
    expect(styles).not.toContain('--autosave-status-border');
    expect(styles).not.toContain('--autosave-status-text');
    const systemProfileStrip = cssBlock('.system-profile-strip', 'padding: 8px 12px;');
    expect(systemProfileStrip).toContain('min-height: 52px;');
    expect(systemProfileStrip).toContain('padding: 8px 12px;');
    expect(normalizedStyles).toContain('.remapping-profile-actions button, .system-profile-save-status {');
    const profileButtonBlock = cssBlock('.remapping-profile-actions button,', 'background: var(--surface-control-soft);');
    expect(profileButtonBlock).toContain('min-height: 30px;');
    expect(profileButtonBlock).toContain('gap: 6px;');
    expect(profileButtonBlock).toContain('border: 1px solid var(--surface-border-strong);');
    expect(profileButtonBlock).toContain('color: var(--text-control);');
    expect(profileButtonBlock).toContain('background: var(--surface-control-soft);');
    expect(profileButtonBlock).toContain('font-size: var(--font-size-subtitle);');
    expect(profileButtonBlock).toContain('font-weight: var(--font-weight-strong);');
    expect(profileButtonBlock).toContain('box-shadow: none;');
    expect(cssBlock('.system-profile-save-status', 'min-width: 0;')).not.toContain('background:');
    // The markup is rendered in common/ProfileSaveStatus.rendered.test.tsx.
    expect(cssBlock('.autosave-check-outline', 'color: #ffffff;')).toContain('stroke-width: 5;');
    expect(cssBlock('.autosave-check-fill', 'color: var(--success);')).toContain('stroke-width: 2.5;');
  });

  it('mutes active toggles when the controller is unavailable', () => {
    expect(cssBlock('.shell.controller-unavailable .inline-switch', 'color: var(--text-disabled);')).toContain(
      'color: var(--text-disabled);'
    );
    expect(cssBlock('.shell.controller-unavailable .inline-switch .inline-state-badge', 'opacity: var(--disabled-opacity);')).toContain(
      'opacity: var(--disabled-opacity);'
    );
    expect(cssBlock('.shell.controller-unavailable .inline-switch .switch.on', 'background: var(--surface-disabled-strong);')).toContain(
      'background: var(--surface-disabled-strong);'
    );
    expect(cssBlock('.shell.controller-unavailable button.feature-icon.active', 'box-shadow: none;')).toContain(
      'box-shadow: none;'
    );
    expect(normalizedStyles).not.toContain('.inline-switch:has(.switch:disabled)');
    expect(normalizedStyles).not.toContain('opacity: 1; border-color: rgba(40, 124, 255, 0.88); background: #1667dc;');
  });

  it('colors the device container border by device status', () => {
    for (const [tone, token] of [['good', 'success'], ['warn', 'warning'], ['bad', 'danger']]) {
      expect(cssBlockIn(shellSidebarSource, `.hero-main.device-status-${tone}`, `border-color: var(--${token}-border-strong);`))
        .toContain(`border-color: var(--${token}-border-strong);`);
    }
  });

  it('uses Kitsune Input rounded panels app-wide', () => {
    const tokens = cssBlockIn(tokensSource, ':root {', '--card-radius:');
    expect(tokens).toContain('--card-radius: 12px;');
    expect(tokens).toContain('--control-radius: 6px;');
    // One scale everywhere; Settings no longer carries its own radii.
    expect(settingsPageStyles).not.toContain('--card-radius:');
    expect(settingsSidebarStyles).not.toContain('--control-radius:');
    expect(cssBlock('.remapping-pill', 'border-radius:')).toContain('border-radius: var(--control-radius);');
  });

  it('draws flat cards like Kitsune Input in the DS5 dark theme', () => {
    const dark = cssBlockIn(ds5ThemeSource, '.shell[data-theme="dark"] {', '--surface-card:');
    // One solid card color in the workspace color, framed by a firmer border.
    expect(dark).toContain('--surface-card: var(--app-bg-flat);');
    expect(dark).toContain('--surface-card-header: var(--surface-card);');
    expect(dark).toContain('--surface-panel: var(--surface-card);');
    expect(dark).toContain('--section-border: var(--surface-border-strong);');
    for (const shadow of ['--shadow-card', '--shadow-panel', '--shadow-control']) {
      expect(dark).toContain(`${shadow}: none;`);
    }
    // Floating menus still lift off the page.
    expect(dark).toContain('--shadow-menu: 0 24px 70px rgba(0, 0, 0, 0.52);');
    expect(cssBlock('.feature-card {', 'border-color:')).toContain('border-color: var(--section-border);');
    expect(cssBlock('.system-card {', 'border-color:')).toContain('border-color: var(--section-border);');
  });

  it('heads Controller and Input pages with Kitsune Input header cards', () => {
    const heading = cssBlock('.studio-feature-heading {', 'border-radius: var(--card-radius);');
    expect(heading).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect(heading).toContain('background: var(--surface-card);');
    expect(cssBlock('.studio-heading-copy {', 'grid-template-columns:')).toContain('grid-template-columns: 44px minmax(0, 1fr);');
    // Mode tabs keep the card title's height so presets stay level across pages.
    const modeTabs = cssBlock('.dual-selector.studio-mode-tabs {', 'min-height:');
    expect(modeTabs).toContain('min-height: var(--feature-card-header-height);');
    expect(modeTabs).toContain('margin: calc(var(--card-padding) * -1) calc(var(--card-padding) * -1) 16px;');
    expect(cssBlock('.feature-card-title.title-only', 'grid-template-columns:')).toContain('grid-template-columns: minmax(0, 1fr) auto;');
  });

  it('has no Tips panel under the feature pages', () => {
    expect(styles).not.toContain('.feature-help-');
  });

  it('uses theme text tokens for trigger lab meter labels and values', () => {
    expect(cssBlock('.trigger-lab-meter-row > span', 'color: var(--text-secondary);')).toContain(
      'color: var(--text-secondary);'
    );
    expect(cssBlock('.trigger-lab-meter-row > strong', 'color: var(--text-strong);')).toContain(
      'color: var(--text-strong);'
    );
  });

  it('uses selected tokens for active navigation and audio haptics mode chips', () => {
    const shellTokens = cssBlock('.shell', '--nav-active-bg:');
    const sharedTokens = cssBlockIn(tokensSource, '.shell {', '--nav-active-base:');
    const lightFamily = cssBlockIn(tokensSource, '.shell:is([data-theme="light"], [data-theme="bubble-gum"])', '--nav-active-base:');
    // Active rows use a neutral text-tinted fill; only the icon carries the accent.
    const activeRow = cssBlockIn(shellSidebarSource, '.control-tab-button.active', 'color: var(--nav-active-text);');
    expect(activeRow).toContain('background: color-mix(in srgb, var(--text-strong) 8%, transparent);');
    expect(activeRow).toContain('font-weight: var(--font-weight-strong);');
    expect(cssBlockIn(shellSidebarSource, '.control-tab-button.active svg,', 'color: var(--nav-active-icon);')).toContain(
      'color: var(--nav-active-icon);'
    );
    expect(cssBlock('.studio-tab-strip button.active', 'box-shadow: inset 0 -3px 0 var(--nav-active-rail);')).toContain(
      'color: var(--accent);'
    );
    expect(cssBlock('.audio-haptics-mode-state.warn', 'background: var(--info-selected);')).toContain(
      'color: var(--info-selected-text);'
    );
    expect(cssBlock('.audio-haptics-mode-state.retry', 'background: var(--info-selected);')).toContain(
      'color: var(--info-selected-text);'
    );
    expect(cssBlock('.custom-select-menu button.selected', 'background: var(--surface-control-hover);')).toContain(
      'color: var(--text-strong);'
    );
    expect(cssBlock('.custom-select-menu button.selected > svg', 'color: var(--accent);')).toContain('justify-self: end;');
    expect(cssBlock('.custom-select-menu button.selected span,', 'color: inherit;')).toContain('color: inherit;');
    expect(shellTokens).toContain(
      '--nav-active-bg: color-mix(in srgb, var(--accent) var(--nav-active-bg-weight), var(--nav-active-base));'
    );
    expect(shellTokens).toContain(
      '--nav-active-rail: color-mix(in srgb, var(--accent-strong) var(--nav-active-rail-weight), var(--accent));'
    );
    expect(sharedTokens).toContain('--nav-active-base: var(--palette-canvas);');
    expect(sharedTokens).toContain('--nav-active-bg-weight: 28%;');
    expect(lightFamily).toContain('--nav-active-base: #ffffff;');
    expect(lightFamily).toContain('--nav-active-bg-weight: 40%;');
    expect(lightFamily).toContain('--nav-active-border-weight: 78%;');
    // Filled actions use each preset's own ink instead of hardcoded white text.
    expect(sharedTokens).toContain('--accent-text: var(--palette-on-accent);');
    expect(sharedTokens).toContain('--command-chip-active-text: var(--accent-text);');
    expect(sharedTokens).toContain('--command-chip-active-bg: var(--accent-selected);');
    expect(cssBlock('.emergency-repair-button', 'background: var(--danger-selected);')).toContain(
      'color: var(--danger-selected-text);'
    );
    const ds5Chips = cssBlockIn(ds5ThemeSource, '.shell[data-theme="dark"]', '--command-chip-bg:');
    expect(ds5Chips).toContain('--command-chip-bg: color-mix(in srgb, var(--accent) 18%, var(--command-chip-base) 82%);');
    expect(ds5Chips).toContain('--command-chip-active-bg: color-mix(in srgb, var(--accent) 44%, var(--command-chip-base) 56%);');
    expect(ds5Chips).toContain('--command-chip-muted-bg: color-mix(in srgb, var(--accent) 14%, var(--command-chip-base) 86%);');
  });

  it('has no separate audio haptics gain', () => {
    // The Audio Haptics card's use of the main haptics gain is rendered in
    // features/controller-feedback/ControllerFeedbackPage.rendered.test.tsx.
    const labSource = readFileSync(new URL('./features/audio-haptics-lab/use-audio-haptics-lab-controller.ts', import.meta.url), 'utf8');
    for (const retired of ['AUDIO_REACTIVE_HAPTICS_GAIN_PERCENT', 'audioReactiveHapticsGainValue', 'commitAudioReactiveHapticsGain', 'setAudioReactiveHapticsPreset']) {
      expect(labSource).not.toContain(retired);
    }
  });

  it('keeps the audio buffer length control compact and aligned', () => {
    // The markup is rendered in features/controller-audio/ControllerAudioPage.rendered.test.tsx.
    expect(cssBlock('.audio-secondary-controls', 'margin-top: 8px;')).toContain('align-content: stretch;');
    expect(cssBlock('.audio-buffer-control', 'padding: 14px 18px;')).toContain('overflow: visible;');
    expect(cssBlock('.audio-buffer-control.disabled', 'opacity: 0.58;')).toContain('opacity: 0.58;');
    expect(cssBlock('.audio-buffer-header', 'grid-template-columns: minmax(0, 1fr) minmax(92px, auto) 30px;')).toContain(
      'display: grid;'
    );
    expect(cssBlock('.audio-buffer-title', 'text-decoration-style: dotted;')).toContain('white-space: nowrap;');
    expect(cssBlock('.audio-buffer-title .audio-haptics-config-tooltip', 'right: auto;')).toContain(
      'width: var(--audio-buffer-tooltip-width);'
    );
    expect(cssBlock('.audio-buffer-readout', 'display: inline-flex;')).toContain('gap: 9px;');
    expect(cssBlock('.audio-buffer-status-icon', 'width: 26px;')).toContain('cursor: help;');
    expect(cssBlock('.audio-buffer-zone-tooltip', 'right: 0;')).toContain('width: 250px;');
    expect(cssBlock('.audio-buffer-slider-row', 'gap: 2px;')).toContain('gap: 2px;');
    expect(cssBlock('.audio-buffer-range-control', 'gap: 0;')).toContain('min-width: 0;');
    expect(cssBlock('.audio-buffer-control input[type="range"]::-webkit-slider-runnable-track', 'height: 5px;')).toContain(
      'var(--range-track-rest)'
    );
    expect(cssBlock('.audio-buffer-control input[type="range"]::-webkit-slider-thumb', 'width: 22px;')).toContain(
      'margin-top: -8.5px;'
    );
  });

  it('keeps Pico firmware maintenance actions compact inside Settings', () => {
    expect(systemSettingsSource).toContain('className="settings-menu-row pico-firmware-row"');
    expect(systemSettingsSource).not.toContain('<strong>Pico Firmware</strong>');
    // On the Settings page the header wraps its actions under the copy instead of squeezing it.
    expect(cssBlockIn(settingsPageStyles, '.settings-page .pico-firmware-header', 'flex-wrap: wrap;'))
      .toContain('justify-content: space-between;');
    expect(cssBlockIn(settingsPageStyles, '.settings-page .pico-firmware-dual-action .heading-action:first-child', 'border-radius: 6px 0 0 6px;'))
      .toContain('border-radius: 6px 0 0 6px;');
    expect(cssBlock('.pico-firmware-row', 'grid-template-columns: minmax(0, 1fr);')).toContain('gap: 7px;');
    expect(cssBlock('.pico-firmware-header', 'grid-template-columns: minmax(0, 1fr) auto;')).toContain(
      'align-items: center;'
    );
    expect(cssBlock('.pico-firmware-actions', 'flex-wrap: wrap;')).toContain('justify-content: flex-end;');
    expect(cssBlock('.pico-firmware-actions .heading-action', 'min-height: 30px;')).toContain('white-space: nowrap;');
    expect(cssBlock('.pico-firmware-actions .heading-action.danger', 'background: var(--danger-selected);')).toContain(
      'box-shadow: inset 0 -2px 0 var(--danger-border-strong);'
    );
    expect(cssBlock('.pico-firmware-dual-action .heading-action:first-child', 'border-top-left-radius: var(--control-radius);')).toContain(
      'border-bottom-left-radius: var(--control-radius);'
    );
    expect(cssBlock('.pico-firmware-copy > span', 'overflow-wrap: anywhere;')).toContain('text-wrap: pretty;');
    expect(cssBlock('.pico-firmware-message.good', 'color: var(--success);')).toContain('color: var(--success);');
    expect(cssBlock('.pico-firmware-message.bad', 'color: var(--danger);')).toContain('color: var(--danger);');
  });

  it('uses solid command-chip tokens for overview status actions', () => {
    expect(cssBlock('.overview-chip', 'background: var(--command-chip-bg);')).toContain(
      'border: 1px solid var(--command-chip-border);'
    );
    expect(cssBlock('.overview-chip', 'background: var(--command-chip-bg);')).toContain(
      'box-shadow: inset 0 -2px 0 var(--command-chip-border);'
    );
    expect(cssBlock('button.overview-chip:hover', 'background: var(--command-chip-hover-bg);')).toContain(
      'border-color: var(--command-chip-hover-border);'
    );
    expect(cssBlock('.overview-chip.active', 'background: var(--command-chip-active-bg);')).toContain(
      'color: var(--command-chip-active-text);'
    );
    expect(cssBlock('.overview-chip.active', 'background: var(--command-chip-active-bg);')).toContain(
      'box-shadow: inset 0 -2px 0 var(--command-chip-active-border);'
    );
    expect(cssBlock('.overview-chip.success', 'background: var(--command-chip-success-bg);')).toContain(
      'color: var(--command-chip-success-text);'
    );
    expect(cssBlock('.overview-chip.muted', 'background: var(--command-chip-muted-bg);')).toContain(
      'border-color: var(--command-chip-muted-border);'
    );
  });

  it('frames overview quick controls like tab slider containers', () => {
    const overviewSliderList = cssBlock('.overview-slider-list', 'background: var(--surface-control-soft);');
    const overviewRangeTicks = cssBlock('.overview-range-ticks', 'height: 5px;');

    expect(cssBlock('.overview-sliders', 'grid-template-rows: auto minmax(0, 1fr);')).toContain(
      'grid-template-rows: auto minmax(0, 1fr);'
    );
    expect(overviewSliderList).toContain('border: 1px solid var(--surface-border);');
    expect(overviewSliderList).toContain('border-radius: var(--control-radius);');
    expect(cssBlock('.framed-slider', 'border-radius:')).toContain('border-radius: var(--control-radius);');
    expect(overviewSliderList).toContain('padding: 16px 18px 12px;');
    expect(overviewSliderList).toContain('align-self: stretch;');
    expect(overviewSliderList).toContain('background: var(--surface-control-soft);');
    const overviewRangeControl = cssBlock('.overview-range-control', 'gap: 0;');
    expect(overviewRangeControl).toContain('position: relative;');
    expect(overviewRangeControl).toContain('gap: 0;');
    expect(cssBlock('.overview-range-control input[type="range"]', 'z-index: 2;')).toContain('position: relative;');
    expect(cssBlock('.overview-range-control input[type="range"]', 'z-index: 2;')).toContain('z-index: 2;');
    expect(overviewRangeTicks).toContain('height: 5px;');
    expect(overviewRangeTicks).toContain('z-index: 1;');
    expect(overviewRangeTicks).toContain('margin-top: -2px;');
    expect(overviewRangeTicks).toContain('padding: 0 9px;');
    expect(overviewRangeTicks).toContain('overflow: visible;');
    expect(cssBlock('.overview-range-ticks span', 'height: 6px;')).toContain('height: 6px;');
    expect(cssBlock('.overview-range-ticks span.milestone', 'width: 2px;')).toContain('height: 11px;');
    expect(cssBlock('.overview-range-ticks span.endpoint', 'height: 9px;')).toContain('height: 9px;');
  });

  it('sets the Settings page in the shared type tokens and grouped rows', () => {
    expect(styles).not.toContain('.bridge-settings-preferences-modal');
    expect(cssBlockIn(settingsPageStyles, '.settings-page-heading h2', 'font-size: var(--font-size-title);'))
      .toContain('font-weight: var(--font-weight-semibold);');
    expect(cssBlockIn(settingsPageStyles, '.settings-page .settings-menu-row strong', 'font-size: var(--font-size-body);'))
      .toContain('color: var(--text-strong);');
    expect(cssBlockIn(settingsPageStyles, '.settings-page .settings-menu-copy > span', 'font-size: var(--font-size-body);'))
      .toContain('color: var(--text-secondary);');
    const row = cssBlockIn(settingsPageStyles, '.settings-page .settings-menu-row', 'min-height: 64px;');
    expect(row).toContain('background: var(--surface-section);');
    expect(row).toContain('border: 1px solid var(--section-border);');
    expect(cssBlockIn(settingsPageStyles, '.settings-page .settings-category-section > :last-child', 'border-bottom-left-radius: var(--card-radius);'))
      .toContain('border-bottom: 1px solid var(--section-border);');
    expect(settingsPageStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(settingsSidebarStyles).not.toMatch(/font-size:\s*\d/);
    expect(settingsPageStyles).not.toMatch(/font-size:\s*\d/);
  });

  it('animates collapsible sidebar groups without leaving collapsed controls focusable', () => {
    expect(cssBlockIn(shellSidebarSource, '.control-tab-list', 'flex-direction: column;')).toContain('display: flex;');
    expect(cssBlockIn(shellSidebarSource, '.control-tab-group-panel', 'grid-template-rows: 0fr;')).toContain('grid-template-rows: 0fr;');
    expect(cssBlockIn(shellSidebarSource, '.control-tab-group.expanded > .control-tab-group-panel', 'grid-template-rows: 1fr;'))
      .toContain('grid-template-rows: 1fr;');
    expect(cssBlockIn(shellSidebarSource, '.control-tab-group-clip', 'overflow: hidden;')).toContain('overflow: hidden;');
    expect(cssBlockIn(shellSidebarSource, '.control-tab-button.nested', 'padding-left: 42px;')).toContain('padding-left: 42px;');
    expect(shellSidebarSource).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('keeps the brand and device card fixed while only the navigation list scrolls', () => {
    const sidebar = cssBlockIn(shellSidebarSource, '.hero-card', 'grid-template-rows: auto auto minmax(0, 1fr);');
    expect(sidebar).toContain('overflow-y: hidden;');
    expect(sidebar).toContain('-webkit-app-region: drag;');
    expect(cssBlockIn(shellSidebarSource, '.sidebar-controls', 'grid-template-rows: auto minmax(0, 1fr);'))
      .toContain('overflow: hidden;');
    expect(cssBlockIn(shellSidebarSource, '.control-tabs', 'grid-template-rows: minmax(0, 1fr) auto;'))
      .toContain('min-height: 0;');
    const list = cssBlockIn(shellSidebarSource, '.control-tab-list', 'overflow-y: auto;');
    expect(list).toContain('-webkit-app-region: no-drag;');
    expect(cssBlockIn(shellSidebarSource, '.control-tabs > .control-tab-button.utility', '-webkit-app-region: no-drag;'))
      .toContain('-webkit-app-region: no-drag;');
    // The section label sits 12px under the bridge selector, as in Kitsune Input.
    expect(cssBlockIn(shellSidebarSource, '.sidebar-controls', 'margin-top: 12px;')).toContain('gap: 8px;');
    expect(shellSidebarSource).not.toContain('.sidebar-footer');
    expect(cssBlockIn(rendererStyleModule('styles/app-shell.css'), '.shell-kofi-link', 'height: 26px;'))
      .toContain('background: transparent;');
    expect(cssBlock('.app-content', 'grid-template-columns: var(--sidebar-width) minmax(0, 1fr);'))
      .toContain('background: var(--sidebar-bg);');
    expect(cssBlock('.app-content::before', 'border-radius: var(--workspace-corner-radius) 0 0 0;'))
      .toContain('top: var(--workspace-top-inset);');
    expect(cssBlock('.window-bar', 'left: var(--sidebar-width);')).toContain('position: absolute;');
  });

  it('centers the Kitsune promotion and gives its modal actions a clear hierarchy', () => {
    expect(cssBlock('.window-bar-center', 'place-items: center;')).toContain('grid-column: 1;');
    const banner = cssBlock('.kitsune-promotion-banner', 'width: min(330px, 100%);');
    expect(banner).toContain('border: 1px solid #ff5c00;');
    expect(banner).toContain('background: var(--kitsune-banner-bg);');
    expect(banner).not.toContain('linear-gradient');
    expect(banner).toContain('-webkit-app-region: no-drag;');
    const rootTheme = cssBlock(':root', '--kitsune-banner-bg: #111821;');
    expect(rootTheme).toContain('--kitsune-banner-bg-hover: #182330;');
    expect(rootTheme).toContain('--kitsune-banner-copy: #d7e0ec;');
    expect(rootTheme).toContain('--kitsune-banner-wordmark: #ffffff;');
    expect(cssBlock('.kitsune-promotion-banner-copy', 'color: var(--kitsune-banner-copy);'))
      .toContain('color: var(--kitsune-banner-copy);');
    expect(cssBlock('.kitsune-promotion-banner .kitsune-promotion-wordmark', 'font-size: var(--font-size-subtitle);'))
      .toContain('color: var(--kitsune-banner-wordmark);');
    const hover = cssBlock('.kitsune-promotion-banner:hover', 'background: var(--kitsune-banner-bg-hover);');
    expect(hover).not.toContain('transform');
    // A warm underglow and outer glow on hover.
    expect(hover).toContain('inset 0 -10px 16px -12px rgba(255, 106, 24, 0.75)');
    // The glint: a white core inside a warm halo, screened over the banner.
    const glint = cssBlock('.kitsune-promotion-banner::before', 'rgba(255, 255, 255, 0.78) 50%');
    expect(glint).toContain('transform: translateX(-160%) skewX(-20deg);');
    expect(glint).toContain('mix-blend-mode: screen;');
    expect(cssBlock('.kitsune-promotion-banner:hover::before,', 'animation: kitsune-promotion-gloss-wipe'))
      .toContain('animation: kitsune-promotion-gloss-wipe 1200ms cubic-bezier(0.45, 0.05, 0.25, 1) 1;');
    // The edge light traces the inner rim once.
    expect(cssBlock('.kitsune-promotion-banner::after', 'from var(--kitsune-edge-angle)'))
      .toContain('mask-composite: exclude;');
    expect(cssBlock('.kitsune-promotion-banner:hover::after,', 'animation: kitsune-promotion-edge-run'))
      .toContain('animation: kitsune-promotion-edge-run 1300ms');
    // Reduced motion keeps the glow but drops every movement.
    const reducedMotion = rendererStyleModule('styles/app-shell.css')
      .slice(rendererStyleModule('styles/app-shell.css').indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reducedMotion).toContain('.kitsune-promotion-banner:hover::after');
    expect(reducedMotion).toContain('animation: none;');
    // The banner's dialog reuses the launch offer's panel; its hide-for-good
    // option is a quiet link under the actions.
    const offerStyles = rendererStyleModule('features/kitsune-promotion/kitsune-launch-offer.css');
    // Features are four-across tiles: a plain orange glyph over each title.
    expect(cssBlockIn(offerStyles, '.kitsune-launch-offer-features {', 'grid-template-columns:'))
      .toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(cssBlockIn(offerStyles, '.kitsune-launch-offer-feature-icon {', 'color:')).not.toContain('background');
    const dismiss = cssBlockIn(offerStyles, '.kitsune-promotion-dismiss {', 'background:');
    expect(dismiss).toContain('background: transparent;');
    expect(dismiss).toContain('color: var(--text-muted);');
  });
});
