// Replaces the companion preload with fixture data for UI review captures.
const fs = require('node:fs');

let snapshot = JSON.parse(fs.readFileSync(process.env.DS5_UI_REVIEW_FIXTURE, 'utf8'));
// Captures skip the one-time Kitsune Input offer unless a script asks for it.
if (process.env.DS5_UI_REVIEW_SHOW_LAUNCH_OFFER !== '1') {
  snapshot = { ...snapshot, settings: { ...snapshot.settings, kitsuneInputLaunchOfferShown: true } };
}
const listeners = new Set();
const emit = () => listeners.forEach((listener) => listener(snapshot));
function updateSettings(settings) {
  snapshot = { ...snapshot, settings: { ...snapshot.settings, ...settings } };
  emit();
  return snapshot;
}
// Replaces top-level snapshot fields, such as a pending bootloader confirmation.
function update(fields) {
  snapshot = { ...snapshot, ...fields };
  emit();
  return snapshot;
}

const settingSetters = {
  setUiThemePreset: 'uiThemePreset',
  setUiTextScalePercent: 'uiTextScalePercent',
  setUiScalePercent: 'uiScalePercent',
  setUiLocale: 'uiLocale',
  setNotifyControllerConnection: 'notifyControllerConnection',
  setNotifyLowBattery: 'notifyLowBattery',
  setLaunchAtStartupEnabled: 'launchAtStartupEnabled',
  setShowBatteryPercentTrayIcon: 'showBatteryPercentTrayIcon',
  setKitsuneInputPromotionDismissed: 'kitsuneInputPromotionDismissed'
};
// Holds back the first snapshot so a capture can show the startup placeholders.
const statusDelayMs = Number(process.env.DS5_UI_REVIEW_STATUS_DELAY_MS ?? 0);
// A bridge with Wake-on-LAN saved for this PC's onboard Ethernet adapter.
const WAKE_TARGETS = [
  { id: 'onboard', name: 'Realtek PCIe GbE Family Controller', mac: 'A8:A1:59:00:11:22', connected: true },
  { id: 'dock', name: 'USB 3.0 to Gigabit Ethernet Adapter', mac: '00:E0:4C:68:01:23', connected: false }
];
let wakeOnLan = {
  bridgeId: 'e6614c311b7d3a2f', supported: true,
  availableCountries: ['XX', 'AU', 'CA', 'DE', 'ES', 'FR', 'GB', 'IT', 'JP', 'KR', 'NL', 'PL', 'BR', 'SE', 'US'],
  configured: true, enabled: true, credentialPresent: true, ssid: 'Home Network', country: 'US',
  targetMac: 'A8:A1:59:00:11:22', targetOwnedByThisPc: true, generation: 1, stage: 'waiting-for-sleep',
  busy: false, controllerConnected: false, error: null, lastOperationError: null, packetCount: 0, elapsedMs: 0
};
function setWakeOnLan(fields) {
  wakeOnLan = { ...wakeOnLan, ...fields };
  return wakeOnLan;
}
const handlers = {
  getStatus: () => new Promise((resolve) => setTimeout(() => resolve(snapshot), statusDelayMs)),
  getDiagnostics: async () => snapshot.diagnostics,
  listAudioHapticsSessions: async () => [],
  listDevices: async () => [],
  isWindowMaximized: async () => false,
  onSnapshot: (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  onWindowMaximizedChange: () => () => undefined,
  cancelBootloaderConfirmation: async () => update({ bootloaderConfirmation: null }),
  markKitsuneInputLaunchOfferShown: async () => updateSettings({ kitsuneInputLaunchOfferShown: true }),
  getWakeOnLan: async () => ({ ...wakeOnLan, controllerConnected: Boolean(snapshot.status?.controllerConnected) }),
  getWakeOnLanTargets: async () => WAKE_TARGETS,
  setWakeOnLanEnabled: async (enabled) => setWakeOnLan({ enabled, stage: enabled ? 'waiting-for-sleep' : 'disabled' }),
  forgetWakeOnLan: async () => setWakeOnLan({
    configured: false, enabled: false, credentialPresent: false, ssid: '', country: '', targetMac: '', stage: 'not-configured'
  }),
  // A test that stays on "Testing Wi-Fi" until a capture cancels it.
  configureWakeOnLan: () => {
    setWakeOnLan({ busy: true, stage: 'validating' });
    return new Promise(() => undefined);
  },
  cancelWakeOnLan: async () => undefined
};

window.__uiReview = {
  update, updateSettings, setWakeOnLan, snapshot: () => snapshot, cpuUsage: () => process.cpuUsage()
};
// A poll from the host refreshes the fields the bridge service updates on every status read.
const pollStartedAt = Date.now();
const baseUptimeSeconds = snapshot.status?.uptimeSeconds ?? 0;
require('electron').ipcRenderer.on('ui-review:poll', () => {
  update({
    status: snapshot.status && {
      ...snapshot.status,
      uptimeSeconds: baseUptimeSeconds + Math.floor((Date.now() - pollStartedAt) / 1000)
    },
    diagnostics: { ...snapshot.diagnostics, lastPollAt: Date.now() }
  });
});
// Captures skip the first-run tutorial unless a script asks to check it.
if (process.env.DS5_UI_REVIEW_SHOW_TUTORIAL !== '1') {
  const skipTutorial = () => window.localStorage?.setItem('ds5bridge.startupTutorialCompleted.v1', '1');
  skipTutorial();
  window.addEventListener('DOMContentLoaded', skipTutorial);
}
window.bridge = new Proxy(handlers, {
  get(target, property) {
    if (property in target) return target[property];
    if (typeof property === 'string' && property in settingSetters) {
      return async (value) => updateSettings({ [settingSetters[property]]: value });
    }
    return async () => snapshot;
  }
});
