// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BridgeSnapshot } from '@shared/types';
import type { AppRuntime } from '../../composition/app-runtime';
import { fixtureSnapshot, installBridgeMock, installDomStubs, type BridgeMock } from '../../test-support/app-harness';
import type { SettingsPageActions } from './types';
import { SETTINGS_FOCUS_MS, useSettingsPage, type SettingsPageController } from './use-settings-page';

let root: Root | null = null;
let current: SettingsPageController;

beforeAll(installDomStubs);
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  vi.useRealTimers();
});

const notifications = {
  toggleControllerNotifications: vi.fn(),
  toggleLowBatteryNotifications: vi.fn()
};

function runtimeFor(snapshot: BridgeSnapshot, overrides: Partial<AppRuntime> = {}): AppRuntime {
  return {
    snapshot,
    connected: snapshot.state === 'connected',
    controllerConnected: Boolean(snapshot.status?.controllerConnected),
    controllerControlsAvailable: Boolean(snapshot.status?.controllerConnected),
    pendingAction: null,
    setSnapshot: vi.fn(),
    setPendingAction: vi.fn(),
    applySnapshot: vi.fn(),
    runAction: vi.fn(async (_label: string, action: () => Promise<BridgeSnapshot>) => { await action(); }),
    runQuietAction: vi.fn(async (action: () => Promise<BridgeSnapshot>) => { await action(); }),
    ...overrides
  };
}

function Probe({ runtime }: { readonly runtime: AppRuntime }) {
  current = useSettingsPage(runtime, { notifications });
  return null;
}

async function mount(runtime: AppRuntime) {
  root = createRoot(document.createElement('div'));
  await act(async () => root!.render(<Probe runtime={runtime} />));
}

describe('Settings page wiring', () => {
  it('sends every toggle to the bridge as the opposite of the saved setting', async () => {
    const snapshot = fixtureSnapshot({
      settings: {
        launchAtStartupEnabled: false,
        showBatteryPercentTrayIcon: true,
        closeButtonQuits: false,
        idleDisconnectEnabled: false,
        usbSuspendDisconnectEnabled: true,
        controllerPowerSavingEnabled: false,
        ledEnabled: true,
        playerLedEnabled: false,
        lightbarRestoreEnabled: false,
        edgeProfileSwitchingBlocked: false,
        sleepKeybindEnabled: true,
        speakerVolumeShortcutEnabled: false,
        wakeOnConnectEnabled: true,
        notifyPersonaChange: true,
        notifyMicMute: false
      }
    });
    const bridge: BridgeMock = installBridgeMock(snapshot);
    await mount(runtimeFor(snapshot));

    const toggles: Array<[keyof SettingsPageActions, string, boolean]> = [
      ['toggleLaunchAtStartup', 'setLaunchAtStartupEnabled', true],
      ['toggleBatteryTrayIcon', 'setShowBatteryPercentTrayIcon', false],
      ['toggleCloseButtonQuits', 'setCloseButtonQuits', true],
      ['toggleIdleDisconnect', 'setIdleDisconnectEnabled', true],
      ['toggleUsbSuspendDisconnect', 'setUsbSuspendDisconnectEnabled', false],
      ['toggleControllerPowerSaving', 'setControllerPowerSavingEnabled', true],
      ['toggleLed', 'setLedEnabled', false],
      ['togglePlayerLed', 'setPlayerLedEnabled', true],
      ['toggleLightbarRestore', 'setLightbarRestoreEnabled', true],
      ['toggleEdgeProfileSwitching', 'setEdgeProfileSwitchingBlocked', true],
      ['toggleSleepShortcut', 'setSleepKeybindEnabled', false],
      ['toggleVolumeShortcut', 'setSpeakerVolumeShortcutEnabled', true],
      ['toggleWakeOnConnect', 'setWakeOnConnectEnabled', false],
      ['togglePersonaNotifications', 'setNotifyPersonaChange', false],
      ['toggleMicMuteNotifications', 'setNotifyMicMute', true]
    ];
    for (const [action, method, value] of toggles) {
      await act(async () => (current.actions[action] as () => void)());
      expect(bridge.fn(method), action).toHaveBeenCalledWith(value);
    }

    await act(async () => current.actions.setIdleDisconnectTimeout(30));
    expect(bridge.fn('setIdleDisconnectTimeoutMinutes')).toHaveBeenCalledWith(30);
    await act(async () => current.actions.setTheme('light'));
    expect(bridge.fn('setUiThemePreset')).toHaveBeenCalledWith('light');
    await act(async () => current.actions.openExternal('https://discord.gg/By5jhh73wr'));
    expect(bridge.fn('openExternal')).toHaveBeenCalledWith('https://discord.gg/By5jhh73wr');
    expect(current.actions.toggleControllerNotifications).toBe(notifications.toggleControllerNotifications);
    expect(current.actions.wakeOnLan).toBe(window.bridge);
  });

  it('asks the main process for the app version once', async () => {
    const snapshot = fixtureSnapshot();
    const bridge = installBridgeMock(snapshot);
    await mount(runtimeFor(snapshot));
    expect(current.model?.appVersion).toBe('2.0.0');
    expect(bridge.fn('getAppVersion')).toHaveBeenCalledOnce();
  });

  it('reports what the Pico firmware tools did', async () => {
    const snapshot = fixtureSnapshot();
    const bridge = installBridgeMock(snapshot);
    bridge.fn('flashPicoFirmware').mockResolvedValue({ ok: true, action: 'flash', message: 'Firmware written.' });
    bridge.fn('nukePicoFlash').mockRejectedValue(new Error('The Pico drive disappeared.'));
    bridge.fn('mountPicoBootloader').mockResolvedValue({ ok: false, cancelled: true, message: 'Cancelled.' });
    await mount(runtimeFor(snapshot));

    await act(async () => current.actions.flashPicoFirmware());
    expect(current.model?.picoFirmware).toEqual({ message: 'Firmware written.', error: null });
    await act(async () => current.actions.nukePicoFlash());
    expect(current.model?.picoFirmware).toEqual({ message: null, error: 'The Pico drive disappeared.' });
    await act(async () => current.actions.mountPicoBootloader());
    expect(current.model?.picoFirmware).toEqual({ message: null, error: null });
  });

  it('reads support from the firmware flags and highlights a requested setting for a moment', async () => {
    const snapshot = fixtureSnapshot({ status: { firmwareFlags: { wakeOnConnectControl: false } as never } });
    installBridgeMock(snapshot);
    await mount(runtimeFor(snapshot));
    expect(current.model?.support.wakeOnConnect).toBe(false);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => current.requestFocus('sleep-shortcut'));
    expect(current.model?.focusTarget).toBe('sleep-shortcut');
    await act(async () => { vi.advanceTimersByTime(SETTINGS_FOCUS_MS); });
    expect(current.model?.focusTarget).toBeNull();
  });
});
