import { useEffect, useRef, useState } from 'react';
import type { BridgeSnapshot } from '@shared/types';
import { normalizeUiLocalePreference } from '@shared/ui-locale-matching';
import type { AppRuntime } from '../../composition/app-runtime';
import type { SettingsFocusTarget } from './settings-navigation';
import type { SettingsPageActions, SettingsPageModel } from './types';

/** How long a setting the Overview or a tip pointed at stays highlighted. */
export const SETTINGS_FOCUS_MS = 2200;

const PICO_FIRMWARE_FAILED_MESSAGE = 'Pico firmware action failed.';

type PicoFirmwareResult = { ok: boolean; cancelled?: boolean; message: string };

export interface SettingsPageInput {
  /** Notification toggles are shared with the window bar's notifications menu. */
  readonly notifications: Pick<SettingsPageActions, 'toggleControllerNotifications' | 'toggleLowBatteryNotifications'>;
}

/**
 * Wires the Settings page to the bridge: its model from the snapshot, every
 * toggle and picker, the Pico firmware tools and their result, and the
 * highlight for a setting another page asked to show.
 */
export function useSettingsPage(runtime: AppRuntime, { notifications }: SettingsPageInput) {
  const { snapshot, connected, controllerConnected, pendingAction, setPendingAction, runAction } = runtime;
  const [focusTarget, setFocusTarget] = useState<SettingsFocusTarget | null>(null);
  const [picoFirmwareMessage, setPicoFirmwareMessage] = useState<string | null>(null);
  const [picoFirmwareError, setPicoFirmwareError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const focusTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (focusTimerRef.current !== null) {
      window.clearTimeout(focusTimerRef.current);
    }
  }, []);

  useEffect(() => {
    let active = true;
    window.bridge.getAppVersion().then((version) => {
      if (active) setAppVersion(version);
    }, () => undefined);
    return () => {
      active = false;
    };
  }, []);

  /** Highlights a setting for a moment; the caller opens the Settings page. */
  function requestFocus(target: SettingsFocusTarget) {
    setFocusTarget(target);
    if (focusTimerRef.current !== null) {
      window.clearTimeout(focusTimerRef.current);
    }
    focusTimerRef.current = window.setTimeout(() => {
      setFocusTarget(null);
      focusTimerRef.current = null;
    }, SETTINGS_FOCUS_MS);
  }

  function clearFocus() {
    setFocusTarget(null);
  }

  async function runPicoFirmwareAction(label: string, action: () => Promise<PicoFirmwareResult>) {
    if (pendingAction !== null) {
      return;
    }
    setPendingAction(label);
    setPicoFirmwareMessage(null);
    setPicoFirmwareError(null);
    try {
      const result = await action();
      if (!result.cancelled) {
        if (result.ok) {
          setPicoFirmwareMessage(result.message);
        } else {
          setPicoFirmwareError(result.message);
        }
      }
    } catch (error) {
      setPicoFirmwareError(error instanceof Error ? error.message : PICO_FIRMWARE_FAILED_MESSAGE);
    } finally {
      setPendingAction(null);
    }
  }

  function toggle(label: string, action: (settings: BridgeSnapshot['settings']) => Promise<BridgeSnapshot>) {
    return () => {
      if (!snapshot) return;
      void runAction(label, () => action(snapshot.settings));
    };
  }

  const actions: SettingsPageActions = {
    setTheme: (value) => void runAction('ui-theme', () => window.bridge.setUiThemePreset(value)),
    setUiScale: (value) => void runAction('ui-scale', () => window.bridge.setUiScalePercent(value)),
    setTextScale: (value) => void runAction('ui-text-scale', () => window.bridge.setUiTextScalePercent(value)),
    setLocale: (value) => void runAction('ui-locale', () => window.bridge.setUiLocale(normalizeUiLocalePreference(value))),
    toggleLaunchAtStartup: toggle('launch-at-startup', (settings) => (
      window.bridge.setLaunchAtStartupEnabled(!settings.launchAtStartupEnabled)
    )),
    toggleBatteryTrayIcon: toggle('battery-tray-icon', (settings) => (
      window.bridge.setShowBatteryPercentTrayIcon(!settings.showBatteryPercentTrayIcon)
    )),
    toggleCloseButtonQuits: toggle('close-button-quits', (settings) => (
      window.bridge.setCloseButtonQuits(!settings.closeButtonQuits)
    )),
    toggleControllerNotifications: notifications.toggleControllerNotifications,
    toggleLowBatteryNotifications: notifications.toggleLowBatteryNotifications,
    togglePersonaNotifications: toggle('notify-persona', (settings) => (
      window.bridge.setNotifyPersonaChange(!settings.notifyPersonaChange)
    )),
    toggleMicMuteNotifications: toggle('notify-mic-mute', (settings) => (
      window.bridge.setNotifyMicMute(!settings.notifyMicMute)
    )),
    setIdleDisconnectTimeout: (minutes) => void runAction('idle-timeout', () => window.bridge.setIdleDisconnectTimeoutMinutes(minutes)),
    toggleIdleDisconnect: toggle('idle', (settings) => window.bridge.setIdleDisconnectEnabled(!settings.idleDisconnectEnabled)),
    toggleUsbSuspendDisconnect: toggle('usb-suspend', (settings) => (
      window.bridge.setUsbSuspendDisconnectEnabled(!settings.usbSuspendDisconnectEnabled)
    )),
    toggleControllerPowerSaving: toggle('controller-power-saving', (settings) => (
      window.bridge.setControllerPowerSavingEnabled(!settings.controllerPowerSavingEnabled)
    )),
    toggleLed: toggle('led', (settings) => window.bridge.setLedEnabled(!settings.ledEnabled)),
    togglePlayerLed: toggle('player-led', (settings) => window.bridge.setPlayerLedEnabled(!settings.playerLedEnabled)),
    toggleLightbarRestore: toggle('lightbar-restore', (settings) => (
      window.bridge.setLightbarRestoreEnabled(!settings.lightbarRestoreEnabled)
    )),
    toggleEdgeProfileSwitching: toggle('edge-profile-switching', (settings) => (
      window.bridge.setEdgeProfileSwitchingBlocked(!settings.edgeProfileSwitchingBlocked)
    )),
    toggleSleepShortcut: toggle('sleep-keybind', (settings) => window.bridge.setSleepKeybindEnabled(!settings.sleepKeybindEnabled)),
    toggleVolumeShortcut: toggle('volume-shortcut', (settings) => (
      window.bridge.setSpeakerVolumeShortcutEnabled(!settings.speakerVolumeShortcutEnabled)
    )),
    toggleWakeOnConnect: toggle('wake-on-connect', (settings) => window.bridge.setWakeOnConnectEnabled(!settings.wakeOnConnectEnabled)),
    mountPicoBootloader: () => void runPicoFirmwareAction('pico-firmware-mount', () => window.bridge.mountPicoBootloader()),
    flashPicoFirmware: () => void runPicoFirmwareAction('pico-firmware-flash', () => window.bridge.flashPicoFirmware()),
    nukePicoFlash: () => void runPicoFirmwareAction('pico-firmware-nuke', () => window.bridge.nukePicoFlash()),
    openExternal: (url) => void window.bridge.openExternal(url),
    wakeOnLan: window.bridge
  };

  const model: SettingsPageModel | null = snapshot ? {
    settings: snapshot.settings,
    connected,
    busy: pendingAction !== null,
    pendingAction,
    support: {
      usbSuspendDisconnect: Boolean(snapshot.status?.firmwareFlags.usbSuspendDisconnectControl),
      wakeOnConnect: Boolean(snapshot.status?.firmwareFlags.wakeOnConnectControl),
      sleepController: Boolean(snapshot.status?.firmwareFlags.sleepControllerControl)
    },
    focusTarget,
    picoFirmware: { message: picoFirmwareMessage, error: picoFirmwareError },
    wakeOnLan: {
      connectionKey: `${snapshot.state}:${snapshot.settings.selectedBridgePath ?? ''}:${snapshot.status?.protocolVersion ?? ''}`,
      controllerConnected,
      firmwareUpdateRequired: snapshot.state === 'incompatible'
    },
    appVersion,
    bridgeHealth: {
      firmwareVersion: snapshot.status?.firmwareVersion ?? null,
      resetEvidence: connected ? snapshot.diagnostics.resetEvidence : null
    }
  } : null;

  return { model, actions, focusTarget, requestFocus, clearFocus };
}

export type SettingsPageController = ReturnType<typeof useSettingsPage>;
