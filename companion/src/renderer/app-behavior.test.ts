import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'App.tsx'), 'utf8');
const stylesSource = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'styles.css'), 'utf8');

function extractFunction(name: string): string {
  const start = appSource.indexOf(`function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextFunction = appSource.indexOf('\n  function ', start + 1);
  return appSource.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

describe('renderer behavior guards', () => {
  it('does not expose retired host encoder controls', () => {
    expect(appSource).not.toContain('toggleHost' + 'EncodedAudioEnabled');
    expect(appSource).not.toContain('setHost' + 'EncodedAudioEnabled');
    expect(appSource).not.toContain('Disable Host ' + 'Encoding?');
    expect(appSource).not.toContain('Enable host ' + 'encoded audio');
    expect(appSource).toContain('Pico Local');
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
});
