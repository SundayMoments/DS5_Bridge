import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { IconBluetooth, IconViewfinder } from '@tabler/icons-react';
import { CONTROL_TAB_DEFINITIONS, CONTROL_TAB_GROUPS } from './features/shell/control-tabs';
import { rendererStyleModule, rendererStyles } from './test-support/renderer-styles';

// App behavior is rendered in App.rendered.test.tsx and each feature's rendered
// tests. These guards cover what rendering cannot see: stylesheet rules, entry
// imports, and code that must stay out of a feature.
const stylesSource = rendererStyles();
const shellSidebarStyles = rendererStyleModule('features/shell/shell-sidebar.css');
const rendererEntrySource = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'main.tsx'), 'utf8');

function featureSource(relativePath: string): string {
  return readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'features', relativePath), 'utf8');
}

function settingsSource(fileName: string): string {
  return featureSource(`settings/${fileName}`);
}

describe('renderer behavior guards', () => {
  it('self-hosts the Inter variable font and the Montserrat wordmark weights', () => {
    expect(rendererEntrySource).toContain("import '@fontsource-variable/inter/standard.css';");
    expect(rendererEntrySource).toContain("import '@fontsource/montserrat/latin-500.css';");
    expect(rendererEntrySource).toContain("import '@fontsource/montserrat/latin-600.css';");
    expect(stylesSource).toContain('font-family: "Inter Variable", Inter, ui-sans-serif');
  });

  it('ports Devices as a firmware-backed controller management tab', () => {
    // Pairing, forgetting, and renaming are rendered in features/devices/DevicesPage.rendered.test.tsx.
    expect(CONTROL_TAB_DEFINITIONS.devices).toEqual({ id: 'devices', label: 'Devices', Icon: IconBluetooth });
    expect(featureSource('devices/ControllerDevicesPage.tsx')).not.toContain('ControllerProfile');
    expect(stylesSource).toContain('.devices-page');
    expect(stylesSource).toContain('.feature-heading.devices-heading');
    expect(stylesSource).toContain('.devices-heading-copy');
    expect(stylesSource).toContain('.trusted-device-card.connected');
    expect(stylesSource).toContain('.controller-forget-modal');
  });

  // Retired host encoder controls and generic "Command Pending" copy are checked
  // on every rendered page in App.rendered.test.tsx; the Overview's Pico Local
  // audio route is rendered in features/overview/OverviewPage.rendered.test.tsx.

  // The DualSense Edge host persona, the emergency device repair dialog, the
  // Device card health label, and Mute as a chord starter are rendered in
  // features/system-controls/SystemPage.rendered.test.tsx; the health and power
  // wording is covered in common/controller-status.test.ts. The chord persona
  // actions are covered in features/chords/model.test.ts.

  // Haptics and rumble tests staying available while game audio plays, and their
  // Testing, Cooling Down, and Failed labels, are rendered in
  // features/controller-feedback/ControllerFeedbackPage.rendered.test.tsx.

  it('styles the bridge-only health state', () => {
    expect(stylesSource).toContain('.dot.info');
    expect(stylesSource).toContain('.overview-health.info');
    expect(stylesSource).toContain('.health-label.info');
  });

  // The Settings page is rendered in features/settings/SettingsPage.rendered.test.tsx,
  // and every Settings action reaching the bridge in
  // features/settings/use-settings-page.rendered.test.tsx.
  it('offers a persisted automatic lightbar restore toggle in Settings', () => {
    expect(settingsSource('ControllerBridgeSettings.tsx')).toContain('label="Automatic Restore"');
    expect(settingsSource('ControllerBridgeSettings.tsx')).toContain('Reapply the saved color after games clear it');
  });

  it('links the official DS5 Bridge Discord from About', () => {
    expect(settingsSource('SystemSettings.tsx')).toContain("DS5_BRIDGE_DISCORD_URL = 'https://discord.gg/By5jhh73wr'");
    expect(settingsSource('SystemSettings.tsx')).toContain('IconBrandDiscord');
  });

  it('exposes the firmware-gated audio buffer length control', () => {
    // The control is rendered in features/controller-audio/ControllerAudioPage.rendered.test.tsx.
    expect(featureSource('controller-audio/model.ts')).toContain('export const AUDIO_BUFFER_LENGTH_MIN = 16;');
    expect(featureSource('controller-audio/model.ts')).toContain('export const AUDIO_BUFFER_LENGTH_MAX = 128;');
    expect(featureSource('controller-audio/use-controller-audio-controller.ts')).not.toContain('Math.min(255, Math.round(length))');
  });

  it('keeps the Pico firmware tools side by side in Settings', () => {
    expect(settingsSource('SystemSettings.tsx')).toContain('pico-firmware-dual-action');
  });

  it('describes the battery percentage tray icon in Settings', () => {
    expect(settingsSource('AppSettings.tsx')).toContain('Show controller battery percentage in the tray');
  });

  it('exposes the DualSense Edge profile blocker', () => {
    expect(settingsSource('ControllerBridgeSettings.tsx')).toContain('label="Block Edge Profile Switching"');
    // The chord gate is rendered in features/chords/ChordsPage.rendered.test.tsx.
  });

  it('styles the sidebar device card as a Devices shortcut with a power indicator', () => {
    // The card's tone border, power label, and Devices link are rendered in
    // App.rendered.test.tsx and features/devices/DevicesPage.rendered.test.tsx;
    // features/shell/sidebar-device.test.ts covers the card model.
    expect(shellSidebarStyles).toContain('.device-power-indicator');
    expect(shellSidebarStyles).toContain('grid-template-columns: minmax(0, 1fr) 48px;');
    expect(shellSidebarStyles).toContain('min-height: 72px;');
    expect(shellSidebarStyles).toContain('.hero-main[role="button"]:focus-visible');
    expect(shellSidebarStyles).toContain('.device-battery-meta');
  });

  it('shows mute as a chord starter when chord mode or keyboard chord starter is active', () => {
    // The starter definition is covered in features/chords/model.test.ts and the
    // page behavior in features/chords/ChordsPage.rendered.test.tsx.
    expect(featureSource('chords/ChordGlyphs.tsx')).toContain('chords-starter-icon-glyph');
    expect(featureSource('chords/ChordGlyphs.tsx')).toContain('<Icon size={18} />');
    expect(stylesSource).toContain('.chords-assignment-row.mute-starter-inactive .remap-glyph-option img');
    expect(stylesSource).toContain('opacity: var(--disabled-opacity);');
  });

  it('styles bridge selection and direct USB controller status', () => {
    // Selecting, refreshing, and renaming bridges is rendered in App.rendered.test.tsx.
    expect(stylesSource).toContain('.sidebar-bridge-selector');
    expect(stylesSource).toContain('.bridge-direct-controller');
  });

  it('groups sidebar controls like Kitsune Input and promotes the two labs to navigation destinations', () => {
    // Opening each lab as its own page is rendered in App.rendered.test.tsx.
    expect(CONTROL_TAB_GROUPS.map(({ id, label }) => [id, label])).toEqual([
      ['controller', 'Controller'],
      ['input', 'Input'],
      ['tools', 'Tools']
    ]);
    expect(CONTROL_TAB_DEFINITIONS['audio-haptics'].label).toBe('Audio Haptics');
    expect(CONTROL_TAB_DEFINITIONS['trigger-lab'].label).toBe('Trigger Lab');
    expect(CONTROL_TAB_GROUPS.find(({ id }) => id === 'tools')?.tabs.map(({ id }) => id))
      .toEqual(['audio-haptics', 'trigger-lab', 'system']);
  });

  it('exposes only radial stick deadzones from the premium analog controls', () => {
    // The page is rendered in features/stick-deadzones/StickDeadzonesPage.rendered.test.tsx.
    expect(CONTROL_TAB_DEFINITIONS.deadzones).toEqual({ id: 'deadzones', label: 'Stick Deadzones', Icon: IconViewfinder });
    for (const premiumControl of ['invertHorizontal', 'responseCurve', 'zoneRotation', 'zoneOuterLimits', 'maxRangePercent']) {
      expect(featureSource('stick-deadzones/StickDeadzonesPage.tsx')).not.toContain(premiumControl);
      expect(featureSource('stick-deadzones/use-stick-deadzones-controller.ts')).not.toContain(premiumControl);
    }
  });

  it('lays the four abbreviated personas out two by two in Quick Actions', () => {
    // The buttons are rendered in features/overview/OverviewPage.rendered.test.tsx.
    expect(stylesSource.replace(/\s+/g, ' ')).toContain(
      '.overview-persona-grid { min-height: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr));'
    );
  });

  it('advertises Kitsune Input with a dismissible titlebar promotion', () => {
    // The banner, dialog, dismissal, and one-time launch offer are rendered in
    // features/kitsune-promotion/KitsunePromotion.rendered.test.tsx.
    const promotionSource = featureSource('kitsune-promotion/KitsuneInputPromotionDialog.tsx');
    for (const retiredCopy of ['Shape every movement.', 'Ready when you play.', 'Features exclusive to Kitsune Input', '<span>01</span>']) {
      expect(promotionSource).not.toContain(retiredCopy);
    }
    expect(featureSource('kitsune-promotion/links.ts')).toContain("KITSUNE_INPUT_URL = 'https://kitsuneinput.com/';");
    expect(featureSource('kitsune-promotion/links.ts')).toContain("KITSUNE_INPUT_PURCHASE_URL = 'https://ko-fi.com/s/d1f0a3b26f';");
  });

  // Trigger Lab enablement and restore are rendered in
  // features/adaptive-triggers/AdaptiveTriggersPage.rendered.test.tsx.
});
