import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'App.tsx'), 'utf8');
const stylesSource = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'styles.css'), 'utf8');
const rendererEntrySource = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'main.tsx'), 'utf8');
const controllerDevicesPageSource = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'ControllerDevicesPage.tsx'),
  'utf8'
);

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
    expect(appSource).toContain("{ id: 'devices', label: 'Devices', Icon: IconBluetooth }");
    expect(appSource).toContain('<ControllerDevicesPage');
    expect(appSource).toContain('window.bridge.requestControllerScan()');
    expect(appSource).toContain('window.bridge.forgetControllerPairings()');
    expect(appSource).toContain('window.bridge.forgetControllerPairing(request.bluetoothAddress)');
    expect(appSource).toContain('observeControllerDevice(');
    expect(appSource).toContain('saveControllerDeviceCache(window.localStorage');
    expect(controllerDevicesPageSource).toContain('id="control-panel-devices"');
    expect(controllerDevicesPageSource).toContain('Current and last controllers.');
    expect(controllerDevicesPageSource).toContain('className="devices-heading-copy"');
    expect(controllerDevicesPageSource).toContain('<IconScan size={16} />');
    expect(controllerDevicesPageSource).toContain('Forget Controllers');
    expect(controllerDevicesPageSource).toContain('className="trusted-device-menu"');
    expect(controllerDevicesPageSource).toContain('controller-forget-modal');
    expect(controllerDevicesPageSource).not.toContain('ControllerProfile');
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
    expect(appSource).toContain("['DualSense Edge', 'dualsense-edge']");
    expect(appSource).toContain("['DualSense Edge', 'persona-dualsense-edge']");
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

  it('dims primary feature toggles when the controller is unavailable', () => {
    expect(appSource).toContain('const controllerControlsAvailable = connected && controllerConnected;');
    expect(appSource).toContain("controllerControlsAvailable ? '' : 'controller-unavailable'");
    expect(appSource).toContain('disabled={!controllerControlsAvailable || pendingAction !== null}');
    expect(appSource).toContain('!controllerControlsAvailable || !speakerVolumeSupported || pendingAction !== null');
    expect(appSource).toContain('!controllerControlsAvailable || !adaptiveTriggersSupported || pendingAction !== null');
    expect(appSource).toContain('!controllerControlsAvailable || !lightbarSupported || pendingAction !== null');
  });

  it('offers a persisted automatic lightbar restore toggle in bridge settings', () => {
    expect(appSource).toContain('<strong>Automatic Restore</strong>');
    expect(appSource).toContain('Reapply the saved color after games clear it');
    expect(appSource).toContain('snapshot.settings.lightbarRestoreEnabled');
    expect(appSource).toContain('window.bridge.setLightbarRestoreEnabled(');
    expect(appSource.indexOf('>Lightbar</div>')).toBeLessThan(appSource.indexOf('>About</div>'));
  });

  it('links the official DS5 Bridge Discord from About', () => {
    expect(appSource).toContain('IconBrandDiscord');
    expect(appSource).toContain("window.bridge.openExternal('https://discord.gg/By5jhh73wr')");
    expect(appSource).toContain('<strong>Discord</strong>');
    expect(appSource).toContain('<span>Official DS5 Bridge Discord</span>');
  });

  it('uses the device container border instead of a compact status dot', () => {
    expect(appSource).toContain('const sidebarDeviceTone =');
    expect(appSource).toContain('className={`hero-main device-status-${sidebarDeviceTone}`}');
    const start = appSource.indexOf('<div className="bridge-state compact-device-status">');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf('</div>', start);
    const compactStatusSource = appSource.slice(start, end);

    expect(compactStatusSource).not.toContain('className={`dot');
  });

  it('exposes the firmware-gated audio buffer length control', () => {
    expect(appSource).toContain('const AUDIO_BUFFER_LENGTH_MIN = 16;');
    expect(appSource).toContain('const AUDIO_BUFFER_LENGTH_MAX = 128;');
    expect(appSource).toContain('audioBufferLengthControlSupported');
    expect(appSource).toContain('firmwareFlags.hapticsBufferLengthControl');
    expect(appSource).toContain('window.bridge.setHapticsBufferLength(snappedValue)');
    expect(appSource).toContain('Audio Buffer Length');
    expect(appSource).toContain('audio-buffer-readout');
    expect(appSource).toContain("className={`audio-buffer-control framed-slider ${audioBufferLengthControlDisabled ? 'disabled' : ''}`}");
    expect(appSource).toContain('className="audio-buffer-title"');
    expect(appSource).toContain('aria-valuetext={`${audioBufferLengthValue}, ${audioBufferDelayLabel(audioBufferLengthValue)}, ${audioBufferZoneLabel(audioBufferLengthValue)}`}');
    const micPresetIndex = appSource.indexOf('{MIC_VOLUME_PRESETS.map(([label, value]) => (');
    const speakerPresetIndex = appSource.indexOf('{SPEAKER_VOLUME_PRESETS.map(([label, value]) => (');
    const bufferControlIndex = appSource.indexOf('className={`audio-buffer-control framed-slider');
    const testCardIndex = appSource.indexOf('<section className="feature-card test-card">', speakerPresetIndex);
    const bufferControlSource = appSource.slice(bufferControlIndex, testCardIndex);
    expect(micPresetIndex).toBeGreaterThanOrEqual(0);
    expect(speakerPresetIndex).toBeGreaterThan(micPresetIndex);
    expect(bufferControlIndex).toBeGreaterThan(speakerPresetIndex);
    expect(bufferControlIndex).toBeLessThan(testCardIndex);
    expect(bufferControlSource).not.toContain('showQuestionMark={true}');
    expect(appSource.slice(micPresetIndex, speakerPresetIndex)).not.toContain('audio-buffer-control');
    expect(appSource).not.toContain('Math.min(255, Math.round(length))');
  });

  it('exposes Pico firmware maintenance actions in Bridge Settings', () => {
    expect(appSource).toContain('function mountPicoBootloader()');
    expect(appSource).toContain('function flashPicoFirmware()');
    expect(appSource).toContain('function nukePicoFlash()');
    expect(appSource).toContain('window.bridge.mountPicoBootloader()');
    expect(appSource).toContain('window.bridge.flashPicoFirmware()');
    expect(appSource).toContain('window.bridge.nukePicoFlash()');
    expect(appSource).toContain('<strong>Firmware</strong>');
    expect(appSource).not.toContain('<strong>Pico Firmware</strong>');
    expect(appSource).toContain('pico-firmware-dual-action');
    expect(appSource).toContain('picoFirmwareMessage');
    expect(appSource).toContain('picoFirmwareError');
  });

  it('exposes the battery percentage tray icon preference in Bridge Settings', () => {
    expect(appSource).toContain('Battery Tray Icon');
    expect(appSource).toContain('Show controller battery percentage in the tray');
    expect(appSource).toContain('snapshot.settings.showBatteryPercentTrayIcon');
    expect(appSource).toContain('window.bridge.setShowBatteryPercentTrayIcon(!snapshot.settings.showBatteryPercentTrayIcon)');
    expect(appSource).toContain('<strong>Wake PC on Controller</strong>');
    expect(appSource).toContain('firmwareFlags.wakeOnConnectControl');
    expect(appSource).toContain('window.bridge.setWakeOnConnectEnabled(!snapshot.settings.wakeOnConnectEnabled)');
  });

  it('exposes the DualSense Edge profile blocker and uses it to gate reserved chords', () => {
    expect(appSource).toContain('Block Edge Profile Switching');
    expect(appSource).toContain('snapshot.settings.edgeProfileSwitchingBlocked');
    expect(appSource).toContain('window.bridge.setEdgeProfileSwitchingBlocked');
    expect(appSource).toContain('edgeProfileSwitchingBlocked');
    expect(appSource).toContain('isChordBindingAllowed(');
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
    expect(appSource).toContain('className="device-power-indicator"');
    expect(stylesSource).toContain('.device-power-indicator');
  });

  it('uses the compact Kitsune device card as a Devices shortcut', () => {
    expect(appSource).toContain('const sidebarControllerCard = controllerDevicesModel.cards.find(');
    expect(appSource).toContain('aria-label="Open Devices"');
    expect(appSource).toContain("onClick={() => selectControlTab('devices')}");
    expect(appSource).toContain('className="device-meta-row"');
    expect(appSource).toContain('className="device-battery-percentage"');
    expect(appSource).not.toContain('className={`battery-icon');
    expect(stylesSource).toContain('grid-template-columns: minmax(0, 1fr) 60px;');
    expect(stylesSource).toContain('min-height: 70px;');
    expect(stylesSource).toContain('.hero-main[role="button"]:focus-visible');
    expect(stylesSource).toContain('.device-battery-meta');
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

  it('does not snap snapshot values back to coarse slider notches', () => {
    const start = appSource.indexOf('function displayHapticsValue');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = appSource.indexOf('function sliderTickClass', start);
    expect(end).toBeGreaterThan(start);
    const displaySource = appSource.slice(start, end);

    expect(displaySource).not.toContain('snapHapticsValue');
    expect(displaySource).not.toContain('snapLightbarBrightness');
    expect(displaySource).not.toContain('snapTriggerEffectIntensity');
    expect(displaySource).toContain('snapshot.settings.hapticsGainPercent');
    expect(displaySource).toContain('snapshot.settings.lightbarBrightnessPercent');
    expect(displaySource).toContain('snapshot.settings.triggerEffectIntensityPercent');
  });

  it('shows mute as a chord starter when chord mode or keyboard chord starter is active', () => {
    expect(appSource).toContain("mute: { id: CHORD_MUTE_STARTER_ID, label: 'Mute Button', Icon: MicOff }");
    expect(appSource).toContain('[CHORD_STARTERS.mute.label, CHORD_MUTE_STARTER_ID]');
    expect(appSource).toContain('chords-starter-icon-glyph');
    expect(appSource).toContain('<Icon size={18} />');
    expect(appSource).toContain('function chordStarterOptionsFor(currentStarter?: ChordStarterId)');
    expect(appSource).toContain("currentStarter === CHORD_MUTE_STARTER_ID");
    expect(appSource).toContain('mute-starter-inactive');
    expect(appSource).toContain('muteButtonChordStarterActive');
    expect(appSource).toContain("snapshot?.settings.muteButtonMode === 'chord'");
    expect(appSource).toContain("snapshot?.settings.muteButtonMode === 'keyboard'");
    expect(appSource).toContain('snapshot.settings.muteKeyboardChordStarterEnabled');
    expect(appSource).toContain("assignment.starter === CHORD_MUTE_STARTER_ID && !muteButtonChordStarterActive");
    expect(appSource).toContain('Duplicate, inactive, or shortcut-shadowed chord bindings');
    expect(stylesSource).toContain('.chords-assignment-row.mute-starter-inactive .remap-glyph-option img');
    expect(stylesSource).toContain('opacity: var(--disabled-opacity);');
    expect(appSource).toContain("starter === CHORD_MUTE_STARTER_ID");
    expect(appSource).toContain('Chord Starter');
    expect(appSource).toContain("window.bridge.setMuteButtonAction(mode, keyUsage, keyModifiers, keyBehavior, keyChordStarterEnabled)");
    expect(appSource).toContain('Pair PS, LFN, RFN, or Mute with a button.');
  });

  it('offers Print Screen and numpad numerals as chord keyboard shortcut keys', () => {
    const optionsStart = appSource.indexOf('const CHORD_KEYBOARD_KEY_OPTIONS');
    expect(optionsStart).toBeGreaterThanOrEqual(0);
    const optionsEnd = appSource.indexOf('const CHORD_KEYBOARD_KEY_MAX_LABEL_LENGTH', optionsStart);
    expect(optionsEnd).toBeGreaterThan(optionsStart);
    const optionsSource = appSource.slice(optionsStart, optionsEnd);

    expect(optionsSource).toContain("['Print Screen', 'Print Screen']");
    expect(optionsSource).toContain('`Numpad ${digit}`');
    expect(optionsSource).toContain('`Numpad${digit}`');

    const normalizeSource = extractFunction('normalizeChordKeyLabel');
    expect(normalizeSource).toContain("case 'print screen':");
    expect(normalizeSource).toContain("case 'printscreen':");
    expect(normalizeSource).toContain("case 'prtsc':");
    expect(normalizeSource).toContain("case 'prtscn':");
    expect(normalizeSource).toContain("return 'Print Screen';");
  });

  it('exposes bridge selection, stable naming, and direct USB controller status', () => {
    expect(appSource).toContain('snapshot?.bridgeDevices ?? null');
    expect(appSource).toContain("window.bridge.selectBridge(String(devicePath))");
    expect(appSource).toContain('window.bridge.setBridgeLabel(draft.uniqueId, draft.value.trim() || null)');
    expect(appSource).toContain('title="Rename bridge"');
    expect(appSource).toContain('title="Refresh bridges"');
    expect(appSource).toContain('window.bridge.refreshBridgeDevices()');
    expect(appSource).toContain("label || 'No bridge detected'");
    expect(appSource).toContain('USB direct');
    expect(stylesSource).toContain('.sidebar-bridge-selector');
    expect(stylesSource).toContain('.hero-card > .sidebar-actions');
  });

  it('groups sidebar controls and promotes the two labs to navigation destinations', () => {
    expect(appSource).toContain("type ControlTabGroupId = 'controller' | 'input' | 'labs'");
    expect(appSource).toContain("id: 'labs',");
    expect(appSource).toContain("label: 'Labs',");
    expect(appSource).toContain("'audio-haptics': { id: 'audio-haptics', label: 'Audio Haptics'");
    expect(appSource).toContain("'trigger-lab': { id: 'trigger-lab', label: 'Trigger Lab'");
    expect(appSource).toContain('CONTROL_TAB_GROUPS.map(({ id, label, Icon, tabs }) =>');
    expect(appSource).toContain('aria-expanded={expanded}');
    expect(appSource).toContain('tabIndex={expanded ? undefined : -1}');
    expect(appSource).toContain("const triggerLabOpen = activeControlTab === 'trigger-lab'");
    expect(appSource).toContain("const audioHapticsOpen = activeControlTab === 'audio-haptics'");
    expect(appSource).toContain('className={`sidebar-action-button ${activeControlTab === \'system\' ? \'active\' : \'\'}`}');
    expect(appSource).not.toContain("id: 'tools',");
    expect(appSource).not.toContain('setTriggerLabOpen');
    expect(appSource).not.toContain('setAudioHapticsOpen');
  });

  it('exposes only radial stick deadzones from the premium analog controls', () => {
    const deadzonesPanelStart = appSource.indexOf('id="control-panel-deadzones"');
    const deadzonesPanelEnd = appSource.indexOf('<FeatureTipsPanel tab="deadzones" />', deadzonesPanelStart);
    const deadzonesPanelSource = appSource.slice(deadzonesPanelStart, deadzonesPanelEnd);

    expect(appSource).toContain("deadzones: { id: 'deadzones', label: 'Stick Deadzones'");
    expect(appSource).toContain("deadzones: { id: 'deadzones', label: 'Stick Deadzones', Icon: IconViewfinder }");
    expect(deadzonesPanelSource).toContain('<span className="feature-icon"><IconViewfinder size={20} /></span>');
    expect(deadzonesPanelSource).not.toContain('<ProfileSaveStatus />');
    expect(appSource).toContain('window.bridge.setRadialDeadzones(leftPercent, rightPercent)');
    expect(appSource).toContain('window.bridge.requestStickInputPreview()');
    expect(appSource).toContain('window.bridge.releaseStickInputPreview()');
    expect(appSource).toContain("`${Math.max(3, value)}%`");
    expect(appSource).toContain('radialDeadzonePreview(');
    expect(appSource).toContain('Physical</span>');
    expect(appSource).toContain('Output</span>');
    expect(appSource).toContain("'Left Stick' : 'Right Stick'");
    expect(appSource).toContain('aria-label={`${label} radial deadzone`}');
    expect(appSource).toContain('<FeatureTipsPanel tab="deadzones" />');
    expect(appSource).toContain("title: 'Tune Each Stick'");
    expect(appSource).toContain("title: 'Keep It Low'");
    expect(appSource).not.toContain('How Radial Deadzones Work');
    expect(appSource).not.toContain('All Personas');
    expect(appSource).not.toContain('invertHorizontal');
    expect(appSource).not.toContain('responseCurve');
    expect(appSource).not.toContain('zoneRotation');
    expect(appSource).not.toContain('zoneOuterLimits');
    expect(appSource).not.toContain('maxRangePercent');
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
    expect(appSource).toContain("import '@fontsource/montserrat/latin-500.css';");
    expect(appSource).toContain("import kitsuneInputLogoUrl from './assets/kitsune-input-logo.svg';");
    expect(appSource).toContain('!snapshot.settings.kitsuneInputPromotionDismissed');
    expect(appSource).toContain('aria-label="Explore Kitsune Input"');
    expect(appSource).toContain('aria-label="Close Kitsune Input promotion"');
    expect(appSource).toContain('Take controller customization further');
    expect(appSource).toContain('Deeper tuning, smarter profiles, and controller-first tools.');
    expect(appSource).not.toContain('Shape every movement.');
    expect(appSource).not.toContain('Ready when you play.');
    expect(appSource).not.toContain('Features exclusive to Kitsune Input');
    expect(appSource).toContain('<li>Advanced Stick Tuning</li>');
    expect(appSource).toContain('<li>Advanced Trigger Tuning</li>');
    expect(appSource).toContain('<li>Touchpad Gestures</li>');
    expect(appSource).toContain('<li>Multi-Actions</li>');
    expect(appSource).toContain('<li>Per-game Profiles</li>');
    expect(appSource).toContain('<li>Kitsune Game Bar</li>');
    expect(appSource).toContain('<li>More Personas &amp; Xbox Impulse Triggers</li>');
    expect(appSource).toContain('<li>Mod API</li>');
    expect(appSource).toContain('Purchase');
    expect(appSource).toContain('Learn More');
    expect(appSource).toContain('secondary-action kitsune-promotion-learn');
    expect(appSource).toContain('<ArrowRight size={16} />');
    expect(appSource).toContain("Don't show Kitsune Input promotions again");
    expect(appSource).toContain("const KITSUNE_INPUT_URL = 'https://kitsuneinput.com/';");
    expect(appSource).toContain("const KITSUNE_INPUT_PURCHASE_URL = 'https://ko-fi.com/s/d1f0a3b26f';");
    expect(appSource).toContain('window.bridge.setKitsuneInputPromotionDismissed(true)');
  });

  it('keeps Audio Haptics page enablement aligned with its feature tile', () => {
    expect(appSource).toContain(
      'aria-checked={audioHapticsOpen ? audioReactiveHapticsEnabled : activeHapticsFeatureEnabled}'
    );
    expect(appSource).toContain('if (enabled && !snapshot.settings.hapticsEnabled)');
    expect(appSource).toContain('await window.bridge.setHapticsEnabled(true);');
    expect(appSource).toContain('window.bridge.setAudioReactiveHapticsConfig({ enabled })');
  });

  it('keeps Trigger Lab enablement independent from the global adaptive-trigger setting', () => {
    expect(appSource).toContain('const [triggerLabEnabled, setTriggerLabEnabled] = useState(triggerLabInitialState.enabled);');
    expect(appSource).toContain('const triggerPageEnabled = triggerLabOpen ? triggerLabEnabled : adaptiveTriggersEnabled;');
    expect(appSource).toContain('{triggerLabEnabled && triggerLabAnyActive ? (');
    expect(appSource).toContain('aria-checked={triggerPageEnabled}');
    expect(appSource).toContain('onClick={triggerLabOpen ? toggleTriggerLabEnabled : toggleAdaptiveTriggersEnabled}');
    expect(appSource).toContain("void runAction('trigger-lab-enabled', () => window.bridge.resetAdaptiveTriggers());");
  });

  it('restores Trigger Lab independently, including after global trigger settings change', () => {
    expect(appSource).toContain('}, [adaptiveTriggersEnabled, connected, triggerLabEnabled]);');
    expect(appSource).toContain('|| !triggerLabEnabled');
    expect(appSource).toContain('triggerLabRestoreAppliedRef.current = false;');
  });
});
