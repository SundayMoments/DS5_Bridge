import type { CompanionSettings, UiScalePercent, UiTextScalePercent, UiThemePreset } from '@shared/types';
import type { SettingsFocusTarget } from './settings-navigation';

/** Everything the Settings page reads. Values come straight from the bridge snapshot. */
export interface SettingsPageModel {
  readonly settings: Pick<CompanionSettings,
    | 'uiScalePercent'
    | 'uiTextScalePercent'
    | 'uiThemePreset'
    | 'launchAtStartupEnabled'
    | 'showBatteryPercentTrayIcon'
    | 'ledEnabled'
    | 'playerLedEnabled'
    | 'idleDisconnectEnabled'
    | 'idleDisconnectTimeoutMinutes'
    | 'usbSuspendDisconnectEnabled'
    | 'wakeOnConnectEnabled'
    | 'controllerPowerSavingEnabled'
    | 'edgeProfileSwitchingBlocked'
    | 'sleepKeybindEnabled'
    | 'speakerVolumeShortcutEnabled'
    | 'lightbarRestoreEnabled'
    | 'notifyControllerConnection'
    | 'notifyLowBattery'
  >;
  /** The selected bridge is connected and can store settings. */
  readonly connected: boolean;
  /** Another app-wide action is running. */
  readonly busy: boolean;
  /** The running action, so firmware buttons can show their own progress. */
  readonly pendingAction: string | null;
  readonly support: {
    readonly usbSuspendDisconnect: boolean;
    readonly wakeOnConnect: boolean;
    readonly sleepController: boolean;
  };
  readonly focusTarget: SettingsFocusTarget | null;
  readonly picoFirmware: {
    readonly message: string | null;
    readonly error: string | null;
  };
}

export interface SettingsPageActions {
  setTheme(value: UiThemePreset): void;
  setUiScale(value: UiScalePercent): void;
  setTextScale(value: UiTextScalePercent): void;
  /** Accepts a catalog option; settings normalize it to a bundled language or the system language. */
  setLocale(value: string): void;
  toggleLaunchAtStartup(): void;
  toggleBatteryTrayIcon(): void;
  toggleControllerNotifications(): void;
  toggleLowBatteryNotifications(): void;
  testNotification(): void;
  setIdleDisconnectTimeout(minutes: number): void;
  toggleIdleDisconnect(): void;
  toggleUsbSuspendDisconnect(): void;
  toggleControllerPowerSaving(): void;
  toggleLed(): void;
  togglePlayerLed(): void;
  toggleLightbarRestore(): void;
  toggleEdgeProfileSwitching(): void;
  toggleSleepShortcut(): void;
  toggleVolumeShortcut(): void;
  toggleWakeOnConnect(): void;
  mountPicoBootloader(): void;
  flashPicoFirmware(): void;
  nukePicoFlash(): void;
  openExternal(url: string): void;
}
