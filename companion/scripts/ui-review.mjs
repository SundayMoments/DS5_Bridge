// Captures the built renderer with fixture data for design review.
// The renderer runs in a minimal Electron host (scripts/ui-review/main.cjs)
// whose preload replaces the bridge API: no bridge service, HID access, or
// saved companion settings are involved.
//
//   npm run build:app && node scripts/ui-review.mjs [--out ../build/ui-review]
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outArgument = process.argv.indexOf('--out');
const outputDir = path.resolve(root, outArgument > 0 ? process.argv[outArgument + 1] : path.join('..', 'build', 'ui-review'));
const require = createRequire(import.meta.url);
const { DEFAULT_SETTINGS } = require(path.join(root, 'dist', 'main', 'main', 'settings-store.js'));

const BRIDGE_PATH = '\\\\?\\HID#VID_2E8A&PID_10F4&MI_03#fixture';
const fixtureSnapshot = {
  state: 'connected',
  message: 'Connected',
  settings: {
    ...DEFAULT_SETTINGS,
    selectedBridgePath: BRIDGE_PATH,
    notifyControllerConnection: true
  },
  status: {
    controllerConnected: true,
    controllerType: 'dualsense-edge',
    batteryPercent: 75,
    rawPowerState: 0,
    audioRecent: false,
    hapticsReady: true,
    hapticsGainPercent: 100,
    speakerVolumePercent: 100,
    speakerGainLevel: 7,
    lightbarColor: { red: 0, green: 0, blue: 255, brightnessPercent: 100 },
    lightbarOverrideEnabled: false,
    micMuted: false,
    muteButtonMode: 'normal',
    muteKeyboardUsage: 0x68,
    muteKeyboardModifiers: 0,
    muteKeyboardBehavior: 'tap',
    muteKeyboardChordStarterEnabled: false,
    quietModeEnabled: false,
    audioDebug: {
      usbHostSpeakerVolumePercent: 100,
      usbHostMicVolumePercent: 100,
      usbHostSpeakerMute: false,
      usbHostMicMute: false,
      lastHostOutputLength: 0,
      lastHostOutputReportId: 0,
      lastHostOutputCount: 0
    },
    ledEnabled: true,
    idleDisconnectEnabled: false,
    idleDisconnectTimeoutMinutes: 15,
    signalStrengthDbm: -36,
    usbSuspendDisconnectEnabled: true,
    sleepKeybindEnabled: false,
    wakeOnConnectEnabled: true,
    settingsRevision: 1,
    lastCommandResult: 0,
    testHapticsBusy: false,
    testHapticsCooldown: false,
    hostOutputRecent: true,
    adaptiveTriggerOutputRecent: false,
    testAdaptiveTriggersBusy: false,
    uptimeSeconds: 5400,
    firmwareVersion: '2.0.0',
    firmwareFlags: {
      companion: true,
      dse: true,
      speakerVolumeControl: true,
      lightbarControl: true,
      lightbarOverrideControl: true,
      muteButtonActions: true,
      hapticsBufferLengthControl: true,
      adaptiveTriggersControl: true,
      usbSuspendDisconnectControl: true,
      sleepControllerControl: true,
      pollingRateControl: true,
      hostPersonaControl: true,
      audioReactiveHapticsControl: true,
      wakeOnConnectControl: true
    },
    hostPersonaMode: 'dualsense',
    supportedHostPersonaModes: ['dualsense', 'dualsense-edge', 'dualshock4', 'xbox'],
    protocolVersion: '1.19'
  },
  diagnostics: {
    hidPath: BRIDGE_PATH,
    protocolVersion: '1.19',
    uptimeSeconds: 5400,
    settingsRevision: 1,
    lastAck: null,
    lastError: null,
    firmwareUpdateAvailable: null,
    lastPollAt: Date.now(),
    rawDevices: [],
    deviceIdentity: null,
    firmwareLogDirectory: null,
    firmwareLogPath: null,
    firmwareLogEnabled: null,
    firmwareLogDroppedBytes: 0,
    firmwareLogLastError: null,
    audioDebugLogPath: null,
    audioDebugLogLines: [],
    audioDebugDroppedCount: 0,
    audioDebugStats: null,
    triggerTraceLines: [],
    triggerTraceDroppedCount: 0,
    feedbackTraceLines: [],
    feedbackTraceDroppedCount: 0,
    audioStatus: null
  },
  personaTransition: null,
  bridgeDevices: {
    bridges: [{
      path: BRIDGE_PATH,
      containerId: null,
      selected: true,
      connected: true,
      uniqueId: 'e6614c311b7d3a2f',
      name: 'Pico 2 W'
    }],
    directControllers: [],
    selectedBridgePath: BRIDGE_PATH
  },
  stickInputPreview: null
};

const scratch = await mkdtemp(path.join(tmpdir(), 'ds5-ui-review-fixture-'));
const fixturePath = path.join(scratch, 'snapshot.json');
await writeFile(fixturePath, JSON.stringify(fixtureSnapshot), 'utf8');
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const app = await electron.launch({
  args: [path.join(root, 'scripts', 'ui-review', 'main.cjs')],
  cwd: root,
  env: { ...process.env, DS5_UI_REVIEW_FIXTURE: fixturePath }
});

try {
  const page = await app.firstWindow();
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.waitForSelector('.hero-card', { timeout: 20000 });

  async function settle() {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
  }

  // Playwright crops zoomed Electron pages, so capture the native window contents instead.
  async function capture(file) {
    const png = await app.evaluate(async ({ BrowserWindow }) => {
      const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage();
      return image.toPNG().toString('base64');
    });
    await writeFile(file, Buffer.from(png, 'base64'));
  }

  async function openTab(name, groupName) {
    const nav = page.getByRole('navigation', { name: 'Controls' });
    if (name === 'Settings') {
      await page.locator('#control-tab-settings').click();
      await settle();
      return;
    }
    const tab = nav.getByRole('button', { name, exact: true });
    if (!(await tab.isVisible()) && groupName) {
      await nav.getByRole('button', { name: groupName, exact: true }).click();
      await page.waitForTimeout(260);
    }
    await tab.click();
    await settle();
  }

  async function leaveSettings() {
    const back = page.getByRole('button', { name: 'Back to app' });
    if (await back.count()) {
      await back.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await settle();
  }

  const shots = [];
  for (const theme of ['dark', 'light']) {
    for (const textScale of [100, 120]) {
      await page.evaluate(({ theme, textScale }) => {
        window.__uiReview.updateSettings({ uiThemePreset: theme, uiTextScalePercent: textScale });
      }, { theme, textScale });
      await settle();
      for (const [label, name, group] of [
        ['overview', 'Overview'],
        ['haptics', 'Haptics', 'Controller'],
        ['settings', 'Settings']
      ]) {
        await openTab(name, group);
        const file = `${theme}-${textScale}-${label}.png`;
        await capture(path.join(outputDir, file));
        shots.push(file);
        if (name === 'Settings') await leaveSettings();
      }
    }
  }
  if (failures.length) {
    throw new Error(`Renderer errors:\n${failures.join('\n')}`);
  }
  console.log(`Saved ${shots.length} screenshots to ${outputDir}`);
} finally {
  await app.close();
  await rm(scratch, { recursive: true, force: true });
}
