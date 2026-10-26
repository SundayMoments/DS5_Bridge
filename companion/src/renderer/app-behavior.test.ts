import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { IconBluetooth, IconViewfinder } from '@tabler/icons-react';
import { CONTROL_TAB_DEFINITIONS, CONTROL_TAB_GROUPS } from './features/shell/control-tabs';
import { rendererStyleModule, rendererStyles } from './test-support/renderer-styles';

const appSource = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'App.tsx'), 'utf8');
const stylesSource = rendererStyles();
const shellSidebarStyles = rendererStyleModule('features/shell/shell-sidebar.css');
const rendererEntrySource = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'main.tsx'), 'utf8');

function featureSource(relativePath: string): string {
  return readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'features', relativePath), 'utf8');
}

function settingsSource(fileName: string): string {
  return featureSource(`settings/${fileName}`);
}

const settingsActionsSource = (() => {
  const start = appSource.indexOf('const settingsPageActions: SettingsPageActions = {');
  expect(start).toBeGreaterThanOrEqual(0);
  return appSource.slice(start, appSource.indexOf('\n  };', start));
})();

function extractFunction(name: string): string {
  const start = appSource.indexOf(`function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextFunction = appSource.indexOf('\n  function ', start + 1);
  return appSource.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

describe('renderer behavior guards', () => {
  it('self-hosts the Inter variable font', () => {
    expect(rendererEntrySource).toContain("import '@fontsource-variable/inter/standard.css';");
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

  it('does not expose retired host encoder controls', () => {
    expect(appSource).not.toContain('toggleHost' + 'EncodedAudioEnabled');
    expect(appSource).not.toContain('setHost' + 'EncodedAudioEnabled');
    expect(appSource).not.toContain('Disable Host ' + 'Encoding?');
    expect(appSource).not.toContain('Enable host ' + 'encoded audio');
    expect(appSource).toContain('Pico Local');
  });

  it('presents DualSense Edge as a PlayStation host persona', () => {
    // The chord persona actions are covered in features/chords/model.test.ts.
    expect(appSource).toContain("['DualSense Edge', 'dualsense-edge']");
    const option = extractFunction('HostPersonaOption');
    expect(option).toContain("value === 'dualsense-edge'");
    expect(option).toContain('host-persona-brand-icon');
  });

  it('requires explicit confirmation and a disconnected controller before emergency device repair', () => {
    const openFunction = extractFunction('openDeviceCleanupConfirm');
    const runFunction = extractFunction('runWindowsDeviceCleanup');

    expect(appSource).toContain('IconTool');
    expect(openFunction).toContain('setDeviceCleanupConfirmVisible(true)');
    expect(runFunction).toContain('controllerConnected');
    expect(runFunction).toContain('repairWindowsDeviceCache');
    expect(appSource).toContain('Emergency Device Repair');
    expect(appSource).toContain('Only run this if you are running into persistent odd controller');
    expect(appSource).toContain('Disconnect the controller from the bridge');
    expect(appSource).toContain('Controller identity based profiles');
    expect(appSource).toContain('paired directly to Windows over Bluetooth may need to be paired again');
  });

  it('does not block haptic testing just because audio is active', () => {
    const start = appSource.indexOf('const testHapticsUnavailable =');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf('const hapticsStatusReady =', start);
    const unavailableSource = appSource.slice(start, end);

    expect(unavailableSource).not.toContain('gameStreamActive');
    expect(unavailableSource).not.toContain('audioRecent');
    expect(unavailableSource).not.toContain('host' + 'AudioActive');
    expect(unavailableSource).not.toContain('streamActive');
  });

  it('does not block rumble testing while game output is active', () => {
    const start = appSource.indexOf('const testRumbleUnavailable =');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf('const hapticsStatusReady =', start);
    const unavailableSource = appSource.slice(start, end);

    expect(unavailableSource).not.toContain('gameStreamActive');
    expect(unavailableSource).not.toContain('audioRecent');
    expect(unavailableSource).not.toContain('host' + 'AudioActive');
    expect(unavailableSource).not.toContain('streamActive');
  });

  it('keeps haptic test and cooldown labels as real test state', () => {
    const start = appSource.indexOf('<button className="primary-action" type="button" disabled={activeFeedbackTestUnavailable}');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf('</button>', start);
    const buttonSource = appSource.slice(start, end);

    expect(buttonSource).not.toContain('Audio Active');
    expect(buttonSource).toContain('testLocked');
    expect(buttonSource).toContain('snapshot.status?.testHapticsCooldown');
  });

  it('does not show generic command-pending copy in renderer status badges', () => {
    expect(appSource).not.toContain('Command Pending');
  });

  it('distinguishes controller-ready, wake-enabled, and bridge-only health states', () => {
    const start = appSource.indexOf('function healthLabel');
    const end = appSource.indexOf('function hexByte', start);
    const healthSource = appSource.slice(start, end);

    expect(healthSource).toContain("return 'Wake with controller enabled';");
    expect(healthSource).toContain("return 'Bridge online';");
    expect(healthSource).toContain("return 'All systems normal';");
    expect(healthSource).toContain('snapshot.settings.wakeOnConnectEnabled');
    expect(healthSource).toContain('snapshot.status?.controllerConnected');
    expect(healthSource).toContain('The Pico bridge is online and waiting for a controller.');
    expect(appSource).toContain('title={overviewHealthTitle}');
    expect(appSource).toContain('title={healthTitle(snapshot)}');
    expect(stylesSource).toContain('.dot.info');
    expect(stylesSource).toContain('.overview-health.info');
    expect(stylesSource).toContain('.health-label.info');
  });

  // The Settings page itself is rendered in features/settings/SettingsPage.rendered.test.tsx;
  // these guards pin how App.tsx wires that page to the bridge.
  it('offers a persisted automatic lightbar restore toggle in Settings', () => {
    expect(appSource).toContain('settings: snapshot.settings,');
    expect(settingsActionsSource).toContain('window.bridge.setLightbarRestoreEnabled(!currentSettings.lightbarRestoreEnabled)');
    expect(settingsSource('ControllerBridgeSettings.tsx')).toContain('label="Automatic Restore"');
    expect(settingsSource('ControllerBridgeSettings.tsx')).toContain('Reapply the saved color after games clear it');
  });

  it('links the official DS5 Bridge Discord from About', () => {
    expect(settingsSource('SystemSettings.tsx')).toContain("DS5_BRIDGE_DISCORD_URL = 'https://discord.gg/By5jhh73wr'");
    expect(settingsSource('SystemSettings.tsx')).toContain('IconBrandDiscord');
    expect(settingsActionsSource).toContain('openExternal: (url) => void window.bridge.openExternal(url)');
  });

  it('uses the device container border instead of a compact status dot', () => {
    // The rendered card is covered in features/shell/MainAppShell.rendered.test.tsx.
    expect(appSource).toContain('const sidebarDeviceTone =');
    expect(appSource).toContain('tone: sidebarDeviceTone,');
  });

  it('exposes the firmware-gated audio buffer length control', () => {
    // The control is rendered in features/controller-audio/ControllerAudioPage.rendered.test.tsx.
    expect(featureSource('controller-audio/model.ts')).toContain('export const AUDIO_BUFFER_LENGTH_MIN = 16;');
    expect(featureSource('controller-audio/model.ts')).toContain('export const AUDIO_BUFFER_LENGTH_MAX = 128;');
    expect(featureSource('controller-audio/use-controller-audio-controller.ts')).not.toContain('Math.min(255, Math.round(length))');
  });

  it('exposes Pico firmware maintenance actions in Settings', () => {
    expect(appSource).toContain('function mountPicoBootloader()');
    expect(appSource).toContain('function flashPicoFirmware()');
    expect(appSource).toContain('function nukePicoFlash()');
    expect(appSource).toContain('window.bridge.mountPicoBootloader()');
    expect(appSource).toContain('window.bridge.flashPicoFirmware()');
    expect(appSource).toContain('window.bridge.nukePicoFlash()');
    expect(appSource).toContain('picoFirmware: { message: picoFirmwareMessage, error: picoFirmwareError }');
    expect(settingsActionsSource).toContain('mountPicoBootloader,');
    expect(settingsActionsSource).toContain('flashPicoFirmware,');
    expect(settingsActionsSource).toContain('nukePicoFlash,');
    expect(settingsSource('SystemSettings.tsx')).toContain('pico-firmware-dual-action');
  });

  it('exposes the battery percentage tray icon and wake preferences in Settings', () => {
    expect(settingsActionsSource).toContain(
      'window.bridge.setShowBatteryPercentTrayIcon(!currentSettings.showBatteryPercentTrayIcon)'
    );
    expect(settingsSource('AppSettings.tsx')).toContain('Show controller battery percentage in the tray');
    expect(appSource).toContain('firmwareFlags.wakeOnConnectControl');
    expect(appSource).toContain('wakeOnConnect: wakeOnConnectSupported,');
    expect(settingsActionsSource).toContain('window.bridge.setWakeOnConnectEnabled(!currentSettings.wakeOnConnectEnabled)');
  });

  it('exposes the DualSense Edge profile blocker and uses it to gate reserved chords', () => {
    expect(settingsSource('ControllerBridgeSettings.tsx')).toContain('label="Block Edge Profile Switching"');
    expect(settingsActionsSource).toContain(
      'window.bridge.setEdgeProfileSwitchingBlocked(!currentSettings.edgeProfileSwitchingBlocked)'
    );
    // The chord gate is rendered in features/chords/ChordsPage.rendered.test.tsx.
  });

  it('distinguishes active charging from connected external power', () => {
    expect(appSource).toContain(
      'function isChargingPowerState(rawPowerState: number | undefined): boolean {'
    );
    expect(appSource).toContain('return rawPowerState === 0x01;');
    expect(appSource).toContain(
      'function isExternalPowerState(rawPowerState: number | undefined): boolean {'
    );
    expect(appSource).toContain('return rawPowerState === 0x01 || rawPowerState === 0x02;');
    expect(appSource).toContain("batteryCharging ? 'Charging' : 'Connected to power'");
    expect(appSource).toContain('powerLabel: batteryPowerLabel,');
    expect(shellSidebarStyles).toContain('.device-power-indicator');
  });

  it('uses the compact Kitsune device card as a Devices shortcut', () => {
    // Opening Devices from the card is rendered in features/devices/DevicesPage.rendered.test.tsx.
    expect(appSource).toContain('const sidebarControllerCard = devices.model.cards.find(');
    expect(appSource).not.toContain('className={`battery-icon');
    expect(shellSidebarStyles).toContain('grid-template-columns: minmax(0, 1fr) 48px;');
    expect(shellSidebarStyles).toContain('min-height: 72px;');
    expect(shellSidebarStyles).toContain('.hero-main[role="button"]:focus-visible');
    expect(shellSidebarStyles).toContain('.device-battery-meta');
  });

  it('keeps the haptics test button actionable instead of relabeling it as game-active', () => {
    const start = appSource.indexOf('<button className="primary-action" type="button" disabled={activeFeedbackTestUnavailable}');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf('</button>', start);
    const buttonSource = appSource.slice(start, end);
    const hapticsStart = buttonSource.indexOf(': connected && testLocked');
    expect(hapticsStart).toBeGreaterThanOrEqual(0);
    const hapticsButtonSource = buttonSource.slice(hapticsStart);

    expect(hapticsButtonSource).not.toContain('Game Active');
    expect(hapticsButtonSource).toContain('testLocked');
    expect(hapticsButtonSource).toContain('Test Haptics');
  });

  it('keeps the rumble test button actionable instead of relabeling it as game-active', () => {
    const start = appSource.indexOf('<button className="primary-action" type="button" disabled={activeFeedbackTestUnavailable}');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf('</button>', start);
    const buttonSource = appSource.slice(start, end);
    const classicStart = buttonSource.indexOf('{showClassicRumbleControl');
    expect(classicStart).toBeGreaterThanOrEqual(0);
    const hapticsStart = buttonSource.indexOf(': connected && testLocked', classicStart);
    expect(hapticsStart).toBeGreaterThanOrEqual(0);
    const classicButtonSource = buttonSource.slice(classicStart, hapticsStart);

    expect(classicButtonSource).not.toContain('Game Active');
    expect(classicButtonSource).toContain('testLocked');
    expect(classicButtonSource).toContain('Test Rumble');
  });

  it('does not let initial status overwrite a newer live snapshot', () => {
    const start = appSource.indexOf('let cancelled = false;');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf('return () => {', start);
    const startupSubscriptionSource = appSource.slice(start, end);

    expect(startupSubscriptionSource).toContain('let receivedLiveSnapshot = false;');
    expect(startupSubscriptionSource).toContain('if (!cancelled && !receivedLiveSnapshot)');
    expect(startupSubscriptionSource).toContain('receivedLiveSnapshot = true;');
  });

  it('shows mute as a chord starter when chord mode or keyboard chord starter is active', () => {
    // The starter definition is covered in features/chords/model.test.ts and the
    // page behavior in features/chords/ChordsPage.rendered.test.tsx.
    expect(featureSource('chords/ChordGlyphs.tsx')).toContain('chords-starter-icon-glyph');
    expect(featureSource('chords/ChordGlyphs.tsx')).toContain('<Icon size={18} />');
    expect(stylesSource).toContain('.chords-assignment-row.mute-starter-inactive .remap-glyph-option img');
    expect(stylesSource).toContain('opacity: var(--disabled-opacity);');
    expect(appSource).toContain('Chord Starter');
    expect(appSource).toContain("window.bridge.setMuteButtonAction(mode, keyUsage, keyModifiers, keyBehavior, keyChordStarterEnabled)");
  });

  it('exposes bridge selection, stable naming, and direct USB controller status', () => {
    // The selector's rename, refresh, and USB-direct rows are rendered in
    // features/shell/MainAppShell.rendered.test.tsx.
    expect(appSource).toContain('snapshot?.bridgeDevices ?? null');
    expect(appSource).toContain('window.bridge.selectBridge(devicePath)');
    expect(appSource).toContain('window.bridge.setBridgeLabel(uniqueId, name)');
    expect(appSource).toContain('window.bridge.refreshBridgeDevices()');
    expect(appSource).toContain('directControllers={directControllers}');
    expect(stylesSource).toContain('.sidebar-bridge-selector');
    expect(stylesSource).toContain('.bridge-direct-controller');
  });

  it('groups sidebar controls like Kitsune Input and promotes the two labs to navigation destinations', () => {
    expect(CONTROL_TAB_GROUPS.map(({ id, label }) => [id, label])).toEqual([
      ['controller', 'Controller'],
      ['input', 'Input'],
      ['tools', 'Tools']
    ]);
    expect(CONTROL_TAB_DEFINITIONS['audio-haptics'].label).toBe('Audio Haptics');
    expect(CONTROL_TAB_DEFINITIONS['trigger-lab'].label).toBe('Trigger Lab');
    expect(CONTROL_TAB_GROUPS.find(({ id }) => id === 'tools')?.tabs.map(({ id }) => id))
      .toEqual(['audio-haptics', 'trigger-lab', 'system']);
    expect(appSource).toContain("const triggerLabOpen = activeControlTab === 'trigger-lab'");
    expect(appSource).toContain("const audioHapticsOpen = activeControlTab === 'audio-haptics'");
    expect(appSource).not.toContain('setTriggerLabOpen');
    expect(appSource).not.toContain('setAudioHapticsOpen');
  });

  it('exposes only radial stick deadzones from the premium analog controls', () => {
    // The page is rendered in features/stick-deadzones/StickDeadzonesPage.rendered.test.tsx.
    expect(CONTROL_TAB_DEFINITIONS.deadzones).toEqual({ id: 'deadzones', label: 'Stick Deadzones', Icon: IconViewfinder });
    for (const premiumControl of ['invertHorizontal', 'responseCurve', 'zoneRotation', 'zoneOuterLimits', 'maxRangePercent']) {
      expect(appSource).not.toContain(premiumControl);
      expect(featureSource('stick-deadzones/StickDeadzonesPage.tsx')).not.toContain(premiumControl);
    }
  });

  it('keeps all four abbreviated personas on the overview quick-actions row', () => {
    expect(stylesSource).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(appSource).toContain("dualsense: 'DS'");
    expect(appSource).toContain("'dualsense-edge': 'DSE'");
    expect(appSource).toContain("ds4: 'DS4'");
    expect(appSource).toContain("xbox: 'XBOX'");
    expect(appSource).toContain('<span>{HOST_PERSONA_SHORT_LABELS[mode]}</span>');
    expect(appSource).toContain('aria-label={`Switch to ${label} mode`}');
  });

  it('advertises Kitsune Input with a dismissible titlebar promotion', () => {
    // The banner, dialog, dismissal, and one-time launch offer are rendered in
    // features/kitsune-promotion/KitsunePromotion.rendered.test.tsx.
    const promotionSource = featureSource('kitsune-promotion/KitsuneInputPromotionDialog.tsx');
    expect(appSource).toContain("import '@fontsource/montserrat/latin-500.css';");
    for (const retiredCopy of ['Shape every movement.', 'Ready when you play.', 'Features exclusive to Kitsune Input', '<span>01</span>']) {
      expect(promotionSource).not.toContain(retiredCopy);
    }
    expect(featureSource('kitsune-promotion/links.ts')).toContain("KITSUNE_INPUT_URL = 'https://kitsuneinput.com/';");
    expect(featureSource('kitsune-promotion/links.ts')).toContain("KITSUNE_INPUT_PURCHASE_URL = 'https://ko-fi.com/s/d1f0a3b26f';");
  });

  it('keeps Audio Haptics page enablement aligned with its feature tile', () => {
    expect(appSource).toContain(
      'aria-checked={audioHapticsOpen ? audioReactiveHapticsEnabled : activeHapticsFeatureEnabled}'
    );
    expect(appSource).toContain('if (enabled && !snapshot.settings.hapticsEnabled)');
    expect(appSource).toContain('await window.bridge.setHapticsEnabled(true);');
    expect(appSource).toContain('window.bridge.setAudioReactiveHapticsConfig({ enabled })');
  });

  // Trigger Lab enablement and restore are rendered in
  // features/adaptive-triggers/AdaptiveTriggersPage.rendered.test.tsx.
});
