// Replaces the companion preload with fixture data for UI review captures.
const fs = require('node:fs');

let snapshot = JSON.parse(fs.readFileSync(process.env.DS5_UI_REVIEW_FIXTURE, 'utf8'));
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
  cancelBootloaderConfirmation: async () => update({ bootloaderConfirmation: null })
};

window.__uiReview = { update, updateSettings, snapshot: () => snapshot };
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
