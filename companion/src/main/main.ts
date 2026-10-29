import { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, nativeImage, powerMonitor, safeStorage, screen, shell } from 'electron';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BootloaderAuthorizationStore } from './bootloader-authorization-store';
import { wakeOnLanResult } from '../shared/wake-on-lan-result';
import type { WakeOnLanConfigurationInput } from '../shared/wake-on-lan-types';
import { BridgeService } from './bridge-service';
import {
  PICO_UNIVERSAL_FLASH_NUKE_FILE,
  PICO_UNIVERSAL_FLASH_NUKE_SHA256_FILE,
  flashPicoFirmwareUf2,
  mountPicoBootloaderDrive,
  nukePicoFlash as copyPicoFlashNuke
} from './pico-firmware-updater';
import { DEFAULT_SETTINGS, SettingsStore } from './settings-store';
import { fitMainWindowToWorkArea, type MainWindowPresentation } from './main-window-sizing';
import {
  TRAY_BATTERY_ICON_SCALE_FACTOR,
  TRAY_BATTERY_ICON_SIZE,
  createTrayBatteryIconBuffer
} from './tray-icon-bitmap';
import type {
  AdaptiveTriggerPreviewEffect,
  AudioReactiveHapticsConfig,
  BridgePresetId,
  ChordAssignment,
  ChordFunction,
  HostPersonaMode,
  MuteButtonMode,
  MuteKeyboardBehavior,
  PollingRateMode,
  RemapButtonId,
  TriggerTestMode,
  TriggerTestTarget
} from '../shared/protocol';
import type { BridgeToast } from './bridge-service';
import type {
  AudioHapticsSession,
  BridgeSnapshot,
  PicoFirmwareAction,
  PicoFirmwareActionResult,
  UiLocalePreference,
  UiScalePercent,
  UiTextScalePercent,
  UiThemePreset
} from '../shared/types';

const APP_NAME = 'DS5 Bridge';
const WINDOWS_APP_USER_MODEL_ID = 'io.github.sundaymoments.ds5bridge';
const WINDOWS_TOAST_ACTIVATOR_CLSID = '{A8B3700D-4BB5-4E22-BF57-0C43B7C2FDF6}';
const APP_MARK_PNG = path.join('assets', 'controllers', 'ds5-bridge_mark.png');
const APP_TRAY_ICON_ICO = path.join('assets', 'controllers', 'ds5-bridge_mark.ico');
const APP_TRAY_ICON_PNG = path.join('assets', 'controllers', 'ds5-bridge_mark.png');
const APP_ICON_ICO = path.join('assets', 'controllers', 'ds5-bridge_app-icon-tile.ico');
const PICO_UNIVERSAL_FLASH_NUKE_RELATIVE_PATH = path.join('firmware', PICO_UNIVERSAL_FLASH_NUKE_FILE);
const PICO_UNIVERSAL_FLASH_NUKE_SHA256_RELATIVE_PATH = path.join('firmware', PICO_UNIVERSAL_FLASH_NUKE_SHA256_FILE);
const START_IN_TRAY_ARG = '--start-in-tray';
const ALLOW_PARALLEL_AUTOMATION_INSTANCE = process.env.DS5_BRIDGE_ALLOW_PARALLEL_AUTOMATION_INSTANCE === '1';
// Automation instances (Playwright, smoke checks) share the installed app's
// settings, Run value and Start Menu shortcut. Registering from one would
// delete the real login item or point login and toasts at a development
// electron.exe, so they leave Windows integration alone.
const WINDOWS_REGISTRATION_ENABLED = !ALLOW_PARALLEL_AUTOMATION_INSTANCE;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let trayDefaultIcon: Electron.NativeImage | null = null;
let bridgeService: BridgeService | null = null;
let isQuitting = false;
let shutdownComplete = false;
// Ported from Kitsune Input: a tray start creates no window, and a window
// left hidden this long is released (about 25-50 MiB of renderer memory)
// and recreated on the next open.
const MAIN_WINDOW_RETIRE_AFTER_HIDDEN_MS = 10 * 60_000;
const MAIN_WINDOW_RETIRE_RETRY_MS = 60_000;
let mainWindowRetireTimer: NodeJS.Timeout | null = null;
let mainWindowShowPending = false;
// Firmware actions own a renderer-visible result; never retire under them.
let mainWindowBusyTasks = 0;
let appSettingsStore: SettingsStore | null = null;
const hasSingleInstanceLock = ALLOW_PARALLEL_AUTOMATION_INSTANCE || app.requestSingleInstanceLock();
const audioHapticsIconCache = new Map<string, Promise<string | null> | string | null>();
const trayBatteryIconCache = new Map<string, Electron.NativeImage>();

function windowsAppUserModelId(): string {
  return WINDOWS_APP_USER_MODEL_ID;
}

if (process.platform === 'win32') {
  app.setAppUserModelId(windowsAppUserModelId());
}

if (!hasSingleInstanceLock) {
  app.quit();
}

function appResourcePath(relativePath: string): string {
  const packagedPath = path.join(app.getAppPath(), relativePath);
  if (fs.existsSync(packagedPath)) {
    return packagedPath;
  }
  return path.resolve(app.getAppPath(), '..', relativePath);
}

function createImageAsset(relativePath: string): Electron.NativeImage {
  const image = nativeImage.createFromPath(appResourcePath(relativePath));
  return image.isEmpty() ? nativeImage.createEmpty() : image;
}

function createRuntimeIcon(): Electron.NativeImage {
  return createImageAsset(APP_MARK_PNG);
}

function sendToMainWindow(channel: string, ...args: unknown[]): void {
  const window = mainWindow;
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
    return;
  }
  window.webContents.send(channel, ...args);
}

async function createTrayIcon(): Promise<Electron.NativeImage> {
  const icon = createImageAsset(APP_TRAY_ICON_ICO);
  if (!icon.isEmpty()) {
    return icon;
  }

  const pngIcon = createImageAsset(APP_TRAY_ICON_PNG);
  return pngIcon.isEmpty() ? nativeImage.createEmpty() : pngIcon;
}

function scaledWindowPresentation(
  uiScalePercent: UiScalePercent,
  workArea: Electron.Rectangle | null
): MainWindowPresentation {
  return fitMainWindowToWorkArea(uiScalePercent, workArea);
}

function applyWindowScale(window: BrowserWindow, uiScalePercent: UiScalePercent, recenter: boolean): void {
  const currentBounds = window.getBounds();
  const display = screen.getDisplayMatching(currentBounds);
  const workArea = display.workArea;
  const { width, height, zoomFactor } = scaledWindowPresentation(uiScalePercent, workArea);
  const centerX = currentBounds.x + (currentBounds.width / 2);
  const centerY = currentBounds.y + (currentBounds.height / 2);
  const x = recenter
    ? Math.round(Math.max(workArea.x, Math.min(centerX - (width / 2), workArea.x + workArea.width - width)))
    : currentBounds.x;
  const y = recenter
    ? Math.round(Math.max(workArea.y, Math.min(centerY - (height / 2), workArea.y + workArea.height - height)))
    : currentBounds.y;

  window.webContents.setZoomFactor(zoomFactor);
  window.setMinimumSize(width, height);
  window.setMaximumSize(width, height);
  window.setBounds({ x, y, width, height }, false);
  window.setResizable(false);
  window.setMaximizable(false);
  window.setFullScreenable(false);
}

function applySnapshotWindowScale(snapshot: { settings: { uiScalePercent: UiScalePercent } }): void {
  if (mainWindow) {
    applyWindowScale(mainWindow, snapshot.settings.uiScalePercent, true);
  }
}

function currentUiScalePercent(): UiScalePercent {
  return bridgeService?.getSnapshot().settings.uiScalePercent ?? DEFAULT_SETTINGS.uiScalePercent;
}

function trayControllerName(type: NonNullable<BridgeSnapshot['status']>['controllerType'] | undefined): string {
  if (type === 'dualsense-edge') return 'DualSense Edge';
  if (type === 'dualsense') return 'DualSense';
  return 'Controller';
}

function trayTooltipForSnapshot(snapshot: BridgeSnapshot): string {
  if (!snapshot.status?.controllerConnected) {
    return APP_NAME;
  }

  const name = trayControllerName(snapshot.status.controllerType);
  const powerState = trayBatteryPowerState(snapshot.status.rawPowerState);
  return snapshot.status.batteryPercent === null
    ? trayTooltipWithoutBatteryPercent(name, powerState)
    : trayTooltipWithBatteryPercent(name, snapshot.status.batteryPercent, powerState);
}

type TrayBatteryPowerState = 'battery' | 'charging' | 'external-power';

function trayBatteryPowerState(rawPowerState: number | undefined): TrayBatteryPowerState {
  if (rawPowerState === 0x01) return 'charging';
  if (rawPowerState === 0x02) return 'external-power';
  return 'battery';
}

function trayTooltipWithoutBatteryPercent(
  name: string,
  powerState: TrayBatteryPowerState
): string {
  if (powerState === 'charging') return `${name} \u2014 Charging`;
  if (powerState === 'external-power') return `${name} \u2014 Connected to power`;
  return name;
}

function trayTooltipWithBatteryPercent(
  name: string,
  batteryPercent: number,
  powerState: TrayBatteryPowerState
): string {
  if (powerState === 'charging') return `${name} \u2014 ${batteryPercent}% (charging)`;
  if (powerState === 'external-power') {
    return `${name} \u2014 ${batteryPercent}% (connected to power)`;
  }
  return `${name} \u2014 ${batteryPercent}%`;
}

function batteryTrayIcon(
  percent: number,
  powerState: TrayBatteryPowerState
): Electron.NativeImage {
  const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));
  const powered = powerState !== 'battery';
  const key = `${clampedPercent}:${powered}`;
  const cached = trayBatteryIconCache.get(key);
  if (cached) {
    return cached;
  }

  const buffer = createTrayBatteryIconBuffer(clampedPercent, powered);
  const image = nativeImage.createFromBitmap(buffer, {
    width: TRAY_BATTERY_ICON_SIZE,
    height: TRAY_BATTERY_ICON_SIZE,
    scaleFactor: TRAY_BATTERY_ICON_SCALE_FACTOR
  });
  trayBatteryIconCache.set(key, image);
  return image;
}

function trayIconForSnapshot(snapshot: BridgeSnapshot): Electron.NativeImage | null {
  if (
    !snapshot.settings.showBatteryPercentTrayIcon
    || !snapshot.status?.controllerConnected
    || snapshot.status.batteryPercent === null
  ) {
    return trayDefaultIcon;
  }

  return batteryTrayIcon(
    snapshot.status.batteryPercent,
    trayBatteryPowerState(snapshot.status.rawPowerState)
  );
}

function updateTrayTooltip(snapshot: BridgeSnapshot): void {
  tray?.setToolTip(trayTooltipForSnapshot(snapshot));
}

function updateTrayIcon(snapshot: BridgeSnapshot): void {
  const icon = trayIconForSnapshot(snapshot);
  if (icon) {
    tray?.setImage(icon);
  }
}

function updateTrayPresentation(snapshot: BridgeSnapshot): void {
  updateTrayTooltip(snapshot);
  updateTrayIcon(snapshot);
}

function restoreMainWindowScale(recenter: boolean): void {
  const window = mainWindow;
  if (!window || window.isDestroyed()) {
    return;
  }
  applyWindowScale(window, currentUiScalePercent(), recenter);
}

function scheduleMainWindowScaleRestore(recenter: boolean): void {
  setTimeout(() => restoreMainWindowScale(recenter), 0);
  setTimeout(() => restoreMainWindowScale(recenter), 250);
}

function shouldStartInTray(argv = process.argv): boolean {
  return argv.includes(START_IN_TRAY_ARG);
}

function loginItemArgs(): string[] {
  return process.defaultApp
    ? [app.getAppPath(), START_IN_TRAY_ARG]
    : [START_IN_TRAY_ARG];
}

function applyLaunchAtStartup(enabled: boolean): void {
  if (process.platform !== 'win32' || !WINDOWS_REGISTRATION_ENABLED) {
    return;
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: enabled,
      path: process.execPath,
      args: loginItemArgs()
    });
  } catch (error) {
    console.warn('Failed to update launch at startup setting:', error);
  }
}

function normalizeFilePath(value: string): string {
  return path.normalize(value).toLowerCase();
}

function isAppFileUrl(url: string, appIndexPath: string): boolean {
  try {
    return normalizeFilePath(fileURLToPath(url)) === normalizeFilePath(appIndexPath);
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(url: string): boolean {
  return /^https:\/\/ko-fi\.com\/sundaymoments\/?$/i.test(url)
    || /^https:\/\/ko-fi\.com\/s\/d1f0a3b26f\/?$/i.test(url)
    || /^https:\/\/github\.com\/SundayMoments\/?$/i.test(url)
    || /^https:\/\/discord\.gg\/By5jhh73wr\/?$/i.test(url)
    || /^https:\/\/kitsuneinput\.com\/?$/i.test(url)
    || /^https:\/\/kitsuneinput\.com\/\?src=ds5-popup$/i.test(url)
    || /^https:\/\/kitsuneinput\.com\/buy\?src=ds5-popup$/i.test(url);
}

function createWindow(uiScalePercent: UiScalePercent): BrowserWindow {
  const { width, height, zoomFactor } = scaledWindowPresentation(
    uiScalePercent,
    screen.getPrimaryDisplay().workArea
  );
  const rendererIndexPath = path.join(__dirname, '..', '..', 'renderer', 'index.html');
  const window = new BrowserWindow({
    width,
    height,
    minWidth: width,
    minHeight: height,
    maxWidth: width,
    maxHeight: height,
    show: false,
    title: 'DS5 Bridge',
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    transparent: false,
    backgroundColor: '#0b1017',
    skipTaskbar: false,
    icon: createRuntimeIcon(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      zoomFactor,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  // Clipboard writes back the Copy buttons (Last Restart); reads stay denied.
  window.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(
      webContents === window.webContents
      && (permission === 'media' || permission === 'speaker-selection' || permission === 'clipboard-sanitized-write')
    );
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (isAppFileUrl(url, rendererIndexPath)) {
      return;
    }
    event.preventDefault();
  });

  window.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      closeMainWindow(window);
    }
  });
  window.on('will-move', () => bridgeService?.pausePollingFor(1200));
  window.on('move', () => bridgeService?.pausePollingFor(700));

  window.loadFile(rendererIndexPath);
  window.webContents.once('did-finish-load', () => {
    applyWindowScale(window, uiScalePercent, false);
  });
  return window;
}

// The close button hides to the tray unless the user chose to quit there.
function closeMainWindow(window: BrowserWindow | null): void {
  if (bridgeService?.getSnapshot().settings.closeButtonQuits) {
    app.quit();
    return;
  }
  window?.hide();
}

function sendWindowMaximizedState(): void {
  if (!mainWindow || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send('window:maximizedChanged', mainWindow.isMaximized());
}

function clearMainWindowRetireTimer(): void {
  if (mainWindowRetireTimer) {
    clearTimeout(mainWindowRetireTimer);
    mainWindowRetireTimer = null;
  }
}

function scheduleMainWindowRetirement(delayMs = MAIN_WINDOW_RETIRE_AFTER_HIDDEN_MS): void {
  clearMainWindowRetireTimer();
  mainWindowRetireTimer = setTimeout(retireHiddenMainWindow, delayMs);
  mainWindowRetireTimer.unref();
}

function retireHiddenMainWindow(): void {
  mainWindowRetireTimer = null;
  const window = mainWindow;
  if (!window || window.isDestroyed() || window.isVisible() || isQuitting) {
    return;
  }
  if (mainWindowBusyTasks > 0 || bridgeService?.getSnapshot().bootloaderConfirmation) {
    scheduleMainWindowRetirement(MAIN_WINDOW_RETIRE_RETRY_MS);
    return;
  }
  mainWindow = null;
  // destroy() skips the close handler, which would only hide it again.
  window.destroy();
}

function ensureMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }
  const window = createWindow(appSettingsStore?.get().uiScalePercent ?? currentUiScalePercent());
  mainWindow = window;
  window.on('maximize', sendWindowMaximizedState);
  window.on('unmaximize', sendWindowMaximizedState);
  // Snapshots are not pushed to a hidden window; catch it up when it returns.
  const sendLatestSnapshot = () => {
    if (bridgeService) {
      sendToMainWindow('bridge:snapshot', bridgeService.getSnapshot());
    }
  };
  window.on('show', () => {
    clearMainWindowRetireTimer();
    scheduleMainWindowScaleRestore(false);
    sendLatestSnapshot();
  });
  window.on('hide', () => scheduleMainWindowRetirement());
  window.on('restore', () => {
    scheduleMainWindowScaleRestore(false);
    sendLatestSnapshot();
  });
  window.on('focus', () => scheduleMainWindowScaleRestore(false));
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
  window.once('ready-to-show', () => {
    if (mainWindowShowPending) {
      mainWindowShowPending = false;
      showWindowCentered();
    }
  });
  return window;
}

function showWindowCentered(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    // Created hidden; shown once its first paint is ready.
    mainWindowShowPending = true;
    ensureMainWindow();
    return;
  }
  if (mainWindowShowPending) {
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  restoreMainWindowScale(false);

  const display = screen.getPrimaryDisplay();
  const windowBounds = mainWindow.getBounds();
  const x = Math.round(display.workArea.x + (display.workArea.width - windowBounds.width) / 2);
  const y = Math.round(display.workArea.y + (display.workArea.height - windowBounds.height) / 2);

  mainWindow.setPosition(x, y, false);
  mainWindow.show();
  mainWindow.focus();
}

function powerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function writeBasicWindowsShortcut(details: {
  shortcutPath: string;
  target: string;
  args: string;
  cwd: string;
  description: string;
  icon: string;
  iconIndex: number;
}): boolean {
  const script = `
$ErrorActionPreference = 'Stop'
$shortcutPath = ${powerShellString(details.shortcutPath)}
$target = ${powerShellString(details.target)}
$arguments = ${powerShellString(details.args)}
$cwd = ${powerShellString(details.cwd)}
$description = ${powerShellString(details.description)}
$icon = ${powerShellString(details.icon)}
$iconIndex = ${details.iconIndex}
$appUserModelId = ${powerShellString(WINDOWS_APP_USER_MODEL_ID)}
$toastActivatorClsid = ${powerShellString(WINDOWS_TOAST_ACTIVATOR_CLSID)}
$source = @'
using System;
using System.Runtime.InteropServices;
using System.Text;

namespace Ds5BridgeShortcut {
  [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
  public class ShellLink { }

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
  public interface IShellLinkW {
    void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszFile, int cchMaxPath, IntPtr pfd, uint fFlags);
    void GetIDList(out IntPtr ppidl);
    void SetIDList(IntPtr pidl);
    void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszName, int cchMaxName);
    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszDir, int cchMaxPath);
    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
    void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszArgs, int cchMaxPath);
    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
    void GetHotkey(out short pwHotkey);
    void SetHotkey(short wHotkey);
    void GetShowCmd(out int piShowCmd);
    void SetShowCmd(int iShowCmd);
    void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder pszIconPath, int cchIconPath, out int piIcon);
    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
    void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, uint dwReserved);
    void Resolve(IntPtr hwnd, uint fFlags);
    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
  }

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("0000010b-0000-0000-C000-000000000046")]
  public interface IPersistFile {
    void GetClassID(out Guid pClassID);
    [PreserveSig] int IsDirty();
    void Load([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, uint dwMode);
    void Save([MarshalAs(UnmanagedType.LPWStr)] string pszFileName, bool fRemember);
    void SaveCompleted([MarshalAs(UnmanagedType.LPWStr)] string pszFileName);
    void GetCurFile([MarshalAs(UnmanagedType.LPWStr)] out string ppszFileName);
  }

  [StructLayout(LayoutKind.Sequential, Pack = 4)]
  public struct PropertyKey {
    public Guid fmtid;
    public uint pid;
    public PropertyKey(Guid fmtid, uint pid) { this.fmtid = fmtid; this.pid = pid; }
  }

  [StructLayout(LayoutKind.Sequential)]
  public struct PropVariant {
    public ushort vt;
    public ushort wReserved1;
    public ushort wReserved2;
    public ushort wReserved3;
    public IntPtr p;
    public int p2;

    public static PropVariant FromString(string value) {
      return new PropVariant { vt = 31, p = Marshal.StringToCoTaskMemUni(value) };
    }

    public static PropVariant FromGuid(Guid value) {
      IntPtr pointer = Marshal.AllocCoTaskMem(16);
      Marshal.StructureToPtr(value, pointer, false);
      return new PropVariant { vt = 72, p = pointer };
    }
  }

  [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
  public interface IPropertyStore {
    [PreserveSig] int GetCount(out uint cProps);
    [PreserveSig] int GetAt(uint iProp, out PropertyKey pkey);
    [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant pv);
    [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant pv);
    [PreserveSig] int Commit();
  }

  public static class ShortcutWriter {
    [DllImport("ole32.dll", PreserveSig = true)]
    private static extern int PropVariantClear(ref PropVariant pvar);

    public static void Write(
      string shortcutPath,
      string target,
      string args,
      string cwd,
      string description,
      string icon,
      int iconIndex,
      string appUserModelId,
      string toastActivatorClsid
    ) {
      var link = (IShellLinkW)new ShellLink();
      link.SetPath(target);
      if (!String.IsNullOrEmpty(args)) link.SetArguments(args);
      if (!String.IsNullOrEmpty(cwd)) link.SetWorkingDirectory(cwd);
      if (!String.IsNullOrEmpty(description)) link.SetDescription(description);
      if (!String.IsNullOrEmpty(icon)) link.SetIconLocation(icon, iconIndex);

      var store = (IPropertyStore)link;
      var appKey = new PropertyKey(new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), 5);
      var appValue = PropVariant.FromString(appUserModelId);
      int hr = store.SetValue(ref appKey, ref appValue);
      PropVariantClear(ref appValue);
      if (hr != 0) Marshal.ThrowExceptionForHR(hr);

      if (!String.IsNullOrEmpty(toastActivatorClsid)) {
        var clsidKey = new PropertyKey(new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), 26);
        var clsidValue = PropVariant.FromGuid(new Guid(toastActivatorClsid));
        hr = store.SetValue(ref clsidKey, ref clsidValue);
        PropVariantClear(ref clsidValue);
        if (hr != 0) Marshal.ThrowExceptionForHR(hr);
      }

      hr = store.Commit();
      if (hr != 0) Marshal.ThrowExceptionForHR(hr);
      ((IPersistFile)link).Save(shortcutPath, true);
    }
  }
}
'@
Add-Type -TypeDefinition $source
[Ds5BridgeShortcut.ShortcutWriter]::Write(
  $shortcutPath,
  $target,
  $arguments,
  $cwd,
  $description,
  $icon,
  $iconIndex,
  $appUserModelId,
  $toastActivatorClsid
)
$registryPath = "HKCU:\\Software\\Classes\\AppUserModelId\\$appUserModelId"
New-Item -Path $registryPath -Force | Out-Null
New-ItemProperty -Path $registryPath -Name 'DisplayName' -Value $description -PropertyType String -Force | Out-Null
New-ItemProperty -Path $registryPath -Name 'IconUri' -Value $icon -PropertyType String -Force | Out-Null
`;
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script
  ], {
    encoding: 'utf8',
    windowsHide: true
  });

  if (result.status !== 0) {
    console.warn('Failed to create Windows notification shortcut:', result.stderr.trim() || result.error);
    return false;
  }
  return fs.existsSync(details.shortcutPath);
}

function updateWindowsAppIconRegistry(iconPath: string): void {
  const script = `
$ErrorActionPreference = 'Stop'
$registryPath = "HKCU:\\Software\\Classes\\AppUserModelId\\${WINDOWS_APP_USER_MODEL_ID}"
New-Item -Path $registryPath -Force | Out-Null
New-ItemProperty -Path $registryPath -Name 'DisplayName' -Value ${powerShellString(`${APP_NAME} companion`)} -PropertyType String -Force | Out-Null
New-ItemProperty -Path $registryPath -Name 'IconUri' -Value ${powerShellString(iconPath)} -PropertyType String -Force | Out-Null
`;
  spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script
  ], {
    encoding: 'utf8',
    windowsHide: true
  });
}

function ensureWindowsNotificationShortcut(): void {
  if (process.platform !== 'win32' || !WINDOWS_REGISTRATION_ENABLED) {
    return;
  }

  try {
    const programsPath = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const appPath = app.getAppPath();
    const appUserModelId = windowsAppUserModelId();
    const shortcutPath = path.join(programsPath, `${APP_NAME}.lnk`);
    const shortcutDetails = {
      shortcutPath,
      target: process.execPath,
      args: process.defaultApp ? `"${appPath}"` : '',
      cwd: process.defaultApp ? appPath : path.dirname(process.execPath),
      description: `${APP_NAME} companion`,
      icon: appResourcePath(APP_ICON_ICO),
      iconIndex: 0
    };

    updateWindowsAppIconRegistry(shortcutDetails.icon);
    fs.mkdirSync(programsPath, { recursive: true });
    const created = shell.writeShortcutLink(shortcutPath, 'replace', {
      target: shortcutDetails.target,
      args: shortcutDetails.args,
      cwd: shortcutDetails.cwd,
      description: shortcutDetails.description,
      icon: shortcutDetails.icon,
      iconIndex: shortcutDetails.iconIndex,
      appUserModelId,
      toastActivatorClsid: WINDOWS_TOAST_ACTIVATOR_CLSID
    });
    if (!created && !writeBasicWindowsShortcut(shortcutDetails)) {
      console.warn('Windows notification shortcut was not created.');
    }
  } catch {
    // Windows toasts may be unavailable, but shortcut setup should not block
    // the tray app from starting.
  }
}

function showBridgeNotification(toast: BridgeToast): void {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: toast.title,
      body: toast.body,
      icon: createRuntimeIcon(),
      silent: false
    });
    notification.once('failed', (_event, error) => {
      console.warn('Windows notification failed:', error);
    });
    notification.show();
  }
}

async function addAudioHapticsSessionIcons(sessions: AudioHapticsSession[]): Promise<AudioHapticsSession[]> {
  return Promise.all(sessions.map(async (session) => ({
    ...session,
    iconDataUrl: await audioHapticsSessionIconDataUrl(session)
  })));
}

async function audioHapticsSessionIconDataUrl(session: AudioHapticsSession): Promise<string | null> {
  const cacheKey = audioHapticsSessionIconCacheKey(session);
  if (!cacheKey) {
    return null;
  }
  const cached = audioHapticsIconCache.get(cacheKey);
  if (cached !== undefined) {
    return cached instanceof Promise ? cached : cached;
  }
  const pending = loadAudioHapticsSessionIconDataUrl(session);
  audioHapticsIconCache.set(cacheKey, pending);
  const value = await pending;
  audioHapticsIconCache.set(cacheKey, value);
  return value;
}

function audioHapticsSessionIconCacheKey(session: AudioHapticsSession): string | null {
  return session.iconPath
    || session.processPath
    || session.executableName
    || (session.processId > 0 ? `pid:${session.processId}` : null);
}

async function loadAudioHapticsSessionIconDataUrl(session: AudioHapticsSession): Promise<string | null> {
  // 1. Try loading a native image directly from the icon path (handles
  //    UWP / packaged-app .png icons that the C# shell APIs miss).
  for (const imagePath of audioHapticsSessionIconFileCandidates(session.iconPath)) {
    const sessionIcon = nativeImageFromPath(imagePath);
    if (sessionIcon && !sessionIcon.isEmpty()) {
      return sessionIcon.resize({ width: 32, height: 32 }).toDataURL();
    }
  }

  // 2. Prefer the icon already resolved by the native helper via
  //    ExtractAssociatedIcon / SHGetFileInfo (best result for regular apps).
  if (session.iconDataUrl) {
    return session.iconDataUrl;
  }

  // 3. Fall back to Electron's shell icon extraction as a last resort.
  for (const iconPath of audioHapticsSessionIconFileCandidates(session.processPath, session.iconPath)) {
    try {
      const image = await app.getFileIcon(iconPath, { size: 'normal' });
      if (!image.isEmpty()) {
        return image.resize({ width: 32, height: 32 }).toDataURL();
      }
    } catch {
    }
  }
  return null;
}

function nativeImageFromPath(filePath: string | null): Electron.NativeImage | null {
  if (!filePath || !fs.existsSync(filePath) || !/\.(ico|png|jpg|jpeg|bmp)$/i.test(filePath)) {
    return null;
  }
  try {
    return nativeImage.createFromPath(filePath);
  } catch {
    return null;
  }
}

function audioHapticsSessionIconFileCandidates(...paths: Array<string | null | undefined>): string[] {
  const candidates = new Set<string>();
  for (const candidate of paths) {
    const normalized = normalizeAudioHapticsSessionIconPath(candidate);
    if (normalized) {
      candidates.add(normalized);
    }
  }
  // Fall back to raw trimmed paths for entries that didn't survive
  // normalization (e.g. paths that don't pass existsSync but can still
  // be resolved by Electron's getFileIcon).
  for (const candidate of paths) {
    const raw = candidate?.trim();
    if (raw) {
      candidates.add(raw);
    }
  }
  return [...candidates];
}

function normalizeAudioHapticsSessionIconPath(filePath: string | null | undefined): string | null {
  if (!filePath?.trim()) {
    return null;
  }
  const candidates = [
    filePath.trim(),
    stripAudioHapticsIconResourceIndex(filePath)
  ];
  for (const candidate of candidates) {
    if (!candidate?.trim()) {
      continue;
    }
    const normalized = candidate.trim().replace(/^@/, '').replace(/^"|"$/g, '');
    if (fs.existsSync(normalized)) {
      return normalized;
    }
  }
  return null;
}

function stripAudioHapticsIconResourceIndex(filePath: string): string | null {
  let value = filePath.trim();
  if (value.startsWith('@')) {
    value = value.slice(1).trim();
  }
  if (value.startsWith('"')) {
    const quoteEnd = value.indexOf('"', 1);
    return quoteEnd > 1 ? value.slice(1, quoteEnd) : value.replace(/^"|"$/g, '');
  }
  const commaIndex = value.lastIndexOf(',');
  if (commaIndex > 0 && /^-?\d+$/.test(value.slice(commaIndex + 1).trim())) {
    return value.slice(0, commaIndex).trim().replace(/^"|"$/g, '');
  }
  return value.replace(/^"|"$/g, '');
}

async function selectPicoFirmwareUf2Path(): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Choose Pico firmware UF2',
    properties: ['openFile'],
    filters: [
      { name: 'UF2 firmware', extensions: ['uf2'] },
      { name: 'All files', extensions: ['*'] }
    ]
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0] ?? null;
}

async function selectFirmwareLogDirectory(currentDirectory: string | null): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Choose firmware log folder',
    properties: ['openDirectory', 'createDirectory'],
    ...(currentDirectory && fs.existsSync(currentDirectory) ? { defaultPath: currentDirectory } : {})
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);
  return result.canceled ? null : result.filePaths[0] ?? null;
}

function picoFirmwareOptions(service: BridgeService, includeNukeUf2 = false) {
  return {
    enterBootloader: () => service.mountPicoBootloader(),
    ...(includeNukeUf2
      ? {
          nukeUf2Path: resolvePicoUniversalFlashNukePath(),
          nukeUf2Sha256Path: resolvePicoUniversalFlashNukeSha256Path()
        }
      : {})
  };
}

function resolvePicoUniversalFlashNukePath(): string {
  const packagedCandidate = process.resourcesPath
    ? path.join(process.resourcesPath, PICO_UNIVERSAL_FLASH_NUKE_RELATIVE_PATH)
    : null;
  const candidates = [
    packagedCandidate,
    path.resolve(process.cwd(), PICO_UNIVERSAL_FLASH_NUKE_RELATIVE_PATH),
    path.resolve(__dirname, '..', '..', '..', PICO_UNIVERSAL_FLASH_NUKE_RELATIVE_PATH)
  ].filter((candidate): candidate is string => Boolean(candidate));

  const nukePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!nukePath) {
    throw new Error('Pico flash nuke UF2 is missing. Run tools\\build-pico-universal-flash-nuke.ps1 from the repository root.');
  }
  return nukePath;
}

function resolvePicoUniversalFlashNukeSha256Path(): string {
  const packagedCandidate = process.resourcesPath
    ? path.join(process.resourcesPath, PICO_UNIVERSAL_FLASH_NUKE_SHA256_RELATIVE_PATH)
    : null;
  const candidates = [
    packagedCandidate,
    path.resolve(process.cwd(), PICO_UNIVERSAL_FLASH_NUKE_SHA256_RELATIVE_PATH),
    path.resolve(__dirname, '..', '..', '..', PICO_UNIVERSAL_FLASH_NUKE_SHA256_RELATIVE_PATH)
  ].filter((candidate): candidate is string => Boolean(candidate));

  const sha256Path = candidates.find((candidate) => fs.existsSync(candidate));
  if (!sha256Path) {
    throw new Error('Pico flash nuke SHA-256 manifest is missing. Run tools\\build-pico-universal-flash-nuke.ps1 from the repository root.');
  }
  return sha256Path;
}

async function flashSelectedPicoFirmware(service: BridgeService): Promise<PicoFirmwareActionResult> {
  const sourcePath = await selectPicoFirmwareUf2Path();
  if (!sourcePath) {
    return {
      ok: false,
      action: 'flash',
      cancelled: true,
      message: 'Firmware flash cancelled.'
    };
  }
  return flashPicoFirmwareUf2(sourcePath, picoFirmwareOptions(service));
}

async function confirmPicoFlashNuke(): Promise<boolean> {
  const options: Electron.MessageBoxOptions = {
    type: 'warning',
    title: 'Nuke Pico flash?',
    message: 'Nuke Pico flash?',
    detail: 'This will copy the bundled Pico Universal Flash Nuke UF2 to the mounted Pico bootloader drive and erase the Pico flash.\n\nThe bridge will not work again until you flash the DS5 Bridge firmware back onto the Pico. Use this only when recovering from a bad or stuck firmware install.',
    buttons: ['Nuke Pico', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  };
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);
  return result.response === 0;
}

async function nukePicoFlash(service: BridgeService): Promise<PicoFirmwareActionResult> {
  if (!await confirmPicoFlashNuke()) {
    return {
      ok: false,
      action: 'nuke',
      cancelled: true,
      message: 'Pico flash nuke cancelled.'
    };
  }
  return copyPicoFlashNuke(picoFirmwareOptions(service, true));
}

function picoFirmwareErrorMessage(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : '';
  const cleaned = message
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();

  if (/No companion bridge is connected/i.test(cleaned)) {
    return 'No companion bridge is connected. Connect the companion bridge, then try again.';
  }

  return cleaned || 'Pico firmware action failed.';
}

async function runPicoFirmwareIpcAction(
  action: PicoFirmwareAction,
  task: () => Promise<PicoFirmwareActionResult>
): Promise<PicoFirmwareActionResult> {
  mainWindowBusyTasks += 1;
  try {
    return await task();
  } catch (error) {
    return {
      ok: false,
      action,
      message: picoFirmwareErrorMessage(error)
    };
  } finally {
    mainWindowBusyTasks -= 1;
  }
}

function registerIpc(service: BridgeService): void {
  ipcMain.handle('bridge:getStatus', () => service.getSnapshot());
  ipcMain.handle('bridge:listDevices', () => service.listDevices());
  ipcMain.handle('bridge:listAudioHapticsSessions', async () => (
    addAudioHapticsSessionIcons(await service.listAudioHapticsSessions())
  ));
  ipcMain.handle('bridge:applyPreset', (_event, value: BridgePresetId) => service.applyPreset(value));
  ipcMain.handle('bridge:selectControllerProfile', (_event, profileId: string) => (
    service.selectControllerProfile(profileId)
  ));
  ipcMain.handle('bridge:saveControllerProfile', (_event, name?: string) => service.saveControllerProfile(name));
  ipcMain.handle('bridge:updateControllerProfile', (_event, profileId: string) => (
    service.updateControllerProfile(profileId)
  ));
  ipcMain.handle('bridge:renameControllerProfile', (_event, profileId: string, name: string) => (
    service.renameControllerProfile(profileId, name)
  ));
  ipcMain.handle('bridge:deleteControllerProfile', (_event, profileId: string) => (
    service.deleteControllerProfile(profileId)
  ));
  ipcMain.handle('bridge:setHapticsGain', (_event, value: number) => service.setHapticsGain(value));
  ipcMain.handle('bridge:setRadialDeadzones', (_event, leftPercent: number, rightPercent: number) => (
    service.setRadialDeadzones(leftPercent, rightPercent)
  ));
  ipcMain.handle('bridge:requestStickInputPreview', () => service.requestStickInputPreview());
  ipcMain.handle('bridge:releaseStickInputPreview', () => service.releaseStickInputPreview());
  ipcMain.handle('bridge:setHapticsEnabled', (_event, value: boolean) => service.setHapticsEnabled(value));
  ipcMain.handle('bridge:setFeedbackBoostEnabled', (_event, value: boolean) => (
    service.setFeedbackBoostEnabled(value)
  ));
  ipcMain.handle('bridge:setHapticsBufferLength', (_event, value: number) => service.setHapticsBufferLength(value));
  ipcMain.handle('bridge:setAudioInterleave', (_event, maxConsecutiveAudioSends: number, stateMaxAgeUs: number) => (
    service.setAudioInterleave(maxConsecutiveAudioSends, stateMaxAgeUs)
  ));
  ipcMain.handle('bridge:setClassicRumbleGain', (_event, value: number) => service.setClassicRumbleGain(value));
  ipcMain.handle('bridge:setClassicRumbleEnabled', (_event, value: boolean) => service.setClassicRumbleEnabled(value));
  ipcMain.handle('bridge:setClassicRumbleV1Enabled', (_event, value: boolean) => (
    service.setClassicRumbleV1Enabled(value)
  ));
  ipcMain.handle('bridge:setTriggerEffectIntensity', (_event, value: number) => (
    service.setTriggerEffectIntensity(value)
  ));
  ipcMain.handle('bridge:setTriggerTestMode', (_event, value: TriggerTestMode) => service.setTriggerTestMode(value));
  ipcMain.handle('bridge:setAdaptiveTriggersEnabled', (_event, value: boolean) => (
    service.setAdaptiveTriggersEnabled(value)
  ));
  ipcMain.handle('bridge:setSpeakerVolume', (_event, value: number) => service.setSpeakerVolume(value));
  ipcMain.handle('bridge:setSpeakerGainLevel', (_event, value: number) => service.setSpeakerGainLevel(value));
  ipcMain.handle('bridge:selectBridge', (_event, devicePath: string | null) => service.selectBridge(devicePath));
  ipcMain.handle('bridge:refreshBridgeDevices', () => service.refreshBridgeDevices());
  ipcMain.handle('bridge:setBridgeLabel', (_event, uniqueId: string, label: string | null) => (
    service.setBridgeLabel(uniqueId, label)
  ));
  ipcMain.handle('bridge:setSpeakerEnabled', (_event, value: boolean) => service.setSpeakerEnabled(value));
  ipcMain.handle('bridge:setMicVolume', (_event, value: number) => service.setMicVolume(value));
  ipcMain.handle('bridge:setMicMute', (_event, value: boolean) => service.setMicMute(value));
  ipcMain.handle('bridge:setAudioReactiveHapticsConfig', (
    _event,
    value: Partial<AudioReactiveHapticsConfig>
  ) => (
    service.setAudioReactiveHapticsConfig(value)
  ));
  ipcMain.handle('bridge:setDuplexMicEnabled', (_event, value: boolean) => service.setDuplexMicEnabled(value));
  ipcMain.handle('bridge:setLightbarColor', (_event, color: string, brightness: number) => (
    service.setLightbarColor(color, brightness)
  ));
  ipcMain.handle('bridge:setLightbarEnabled', (_event, value: boolean) => service.setLightbarEnabled(value));
  ipcMain.handle('bridge:setLightbarOverrideEnabled', (_event, value: boolean) => (
    service.setLightbarOverrideEnabled(value)
  ));
  ipcMain.handle('bridge:setMuteButtonAction', (
    _event,
    mode: MuteButtonMode,
    usage: number,
    modifiers: number,
    behavior: MuteKeyboardBehavior,
    chordStarterEnabled?: boolean
  ) => (
    service.setMuteButtonAction(mode, usage, modifiers, behavior, chordStarterEnabled)
  ));
  ipcMain.handle('bridge:setLedEnabled', (_event, value: boolean) => service.setLedEnabled(value));
  ipcMain.handle('bridge:setPlayerLedEnabled', (_event, value: boolean) => service.setPlayerLedEnabled(value));
  ipcMain.handle('bridge:setLightbarRestoreEnabled', (_event, value: boolean) => (
    service.setLightbarRestoreEnabled(value)
  ));
  ipcMain.handle('bridge:setIdleDisconnectEnabled', (_event, value: boolean) => service.setIdleDisconnectEnabled(value));
  ipcMain.handle('bridge:setIdleDisconnectTimeoutMinutes', (_event, value: number) => (
    service.setIdleDisconnectTimeoutMinutes(value)
  ));
  ipcMain.handle('bridge:setUsbSuspendDisconnectEnabled', (_event, value: boolean) => (
    service.setUsbSuspendDisconnectEnabled(value)
  ));
  ipcMain.handle('bridge:setWakeOnConnectEnabled', (_event, value: boolean) => (
    service.setWakeOnConnectEnabled(value)
  ));
  ipcMain.handle('bridge:setSleepKeybindEnabled', (_event, value: boolean) => (
    service.setSleepKeybindEnabled(value)
  ));
  ipcMain.handle('bridge:setSpeakerVolumeShortcutEnabled', (_event, value: boolean) => (
    service.setSpeakerVolumeShortcutEnabled(value)
  ));
  ipcMain.handle('bridge:setControllerPowerSavingEnabled', (_event, value: boolean) => (
    service.setControllerPowerSavingEnabled(value)
  ));
  ipcMain.handle('bridge:setUiScalePercent', (_event, value: UiScalePercent) => {
    const snapshot = service.setUiScalePercent(value);
    applySnapshotWindowScale(snapshot);
    return snapshot;
  });
  ipcMain.handle('bridge:setUiTextScalePercent', (_event, value: UiTextScalePercent) => (
    service.setUiTextScalePercent(value)
  ));
  ipcMain.handle('bridge:setUiLocale', (_event, value: UiLocalePreference) => (
    service.setUiLocale(value)
  ));
  ipcMain.handle('bridge:setUiThemePreset', (_event, value: UiThemePreset) => (
    service.setUiThemePreset(value)
  ));
  ipcMain.handle('bridge:setLaunchAtStartupEnabled', (_event, value: boolean) => {
    const snapshot = service.setLaunchAtStartupEnabled(Boolean(value));
    applyLaunchAtStartup(snapshot.settings.launchAtStartupEnabled);
    return snapshot;
  });
  ipcMain.handle('bridge:setShowBatteryPercentTrayIcon', (_event, value: boolean) => (
    service.setShowBatteryPercentTrayIcon(Boolean(value))
  ));
  ipcMain.handle('bridge:setCloseButtonQuits', (_event, value: boolean) => (
    service.setCloseButtonQuits(Boolean(value))
  ));
  ipcMain.handle('bridge:markKitsuneInputLaunchOfferShown', () => service.markKitsuneInputLaunchOfferShown());
  ipcMain.handle('bridge:setPollingRateMode', (_event, value: PollingRateMode) => (
    service.setPollingRateMode(value)
  ));
  ipcMain.handle('bridge:setHostPersonaMode', (_event, value: HostPersonaMode) => (
    service.setHostPersonaMode(value)
  ));
  ipcMain.handle('bridge:sleepController', () => service.sleepController());
  ipcMain.handle('bridge:requestControllerScan', () => service.requestControllerScan());
  ipcMain.handle('bridge:forgetControllerPairings', () => service.forgetControllerPairings());
  ipcMain.handle('bridge:forgetControllerPairing', (_event, bluetoothAddress: string) => (
    service.forgetControllerPairing(bluetoothAddress)
  ));
  ipcMain.handle('bridge:mountPicoBootloader', () => runPicoFirmwareIpcAction(
    'mount',
    () => mountPicoBootloaderDrive(picoFirmwareOptions(service))
  ));
  ipcMain.handle('bridge:cancelBootloaderConfirmation', () => service.cancelBootloaderConfirmation());
  ipcMain.handle('bridge:getWakeOnLan', () => wakeOnLanResult(() => service.getWakeOnLan()));
  ipcMain.handle('bridge:getWakeOnLanTargets', (_event, refresh: unknown) => wakeOnLanResult(
    () => service.getWakeOnLanTargets(refresh === true)
  ));
  ipcMain.handle('bridge:getWakeOnLanReadiness', (_event, targetMac: unknown, refresh: unknown) => wakeOnLanResult(
    () => service.getWakeOnLanReadiness(targetMac, refresh === true)
  ));
  ipcMain.handle('bridge:configureWakeOnLan', (_event, input: unknown) => wakeOnLanResult(
    () => service.configureWakeOnLan(input as WakeOnLanConfigurationInput)
  ));
  ipcMain.handle('bridge:setWakeOnLanEnabled', (_event, enabled: unknown) => wakeOnLanResult(
    () => service.setWakeOnLanEnabled(enabled as boolean)
  ));
  ipcMain.handle('bridge:forgetWakeOnLan', () => wakeOnLanResult(() => service.forgetWakeOnLan()));
  ipcMain.handle('bridge:cancelWakeOnLan', () => wakeOnLanResult(() => service.cancelWakeOnLan()));
  ipcMain.handle('bridge:flashPicoFirmware', () => runPicoFirmwareIpcAction(
    'flash',
    () => flashSelectedPicoFirmware(service)
  ));
  ipcMain.handle('bridge:nukePicoFlash', () => runPicoFirmwareIpcAction(
    'nuke',
    () => nukePicoFlash(service)
  ));
  ipcMain.handle('bridge:setNotifyControllerConnection', (_event, value: boolean) => (
    service.setNotifyControllerConnection(value)
  ));
  ipcMain.handle('bridge:setNotifyLowBattery', (_event, value: boolean) => (
    service.setNotifyLowBattery(value)
  ));
  ipcMain.handle('bridge:setNotifyPersonaChange', (_event, value: boolean) => (
    service.setNotifyPersonaChange(Boolean(value))
  ));
  ipcMain.handle('bridge:testNotification', () => service.testNotification());
  ipcMain.handle('bridge:testHaptics', () => service.testHaptics());
  ipcMain.handle('bridge:testSpeaker', () => service.testSpeaker());
  ipcMain.handle('bridge:testClassicRumble', () => service.testClassicRumble());
  ipcMain.handle('bridge:testAdaptiveTriggers', (_event, value?: TriggerTestMode, target?: TriggerTestTarget) => (
    service.testAdaptiveTriggers(value, target)
  ));
  ipcMain.handle('bridge:previewAdaptiveTriggerEffect', (_event, effect: AdaptiveTriggerPreviewEffect) => (
    service.previewAdaptiveTriggerEffect(effect)
  ));
  ipcMain.handle('bridge:applyAdaptiveTriggerEffect', (_event, effect: AdaptiveTriggerPreviewEffect) => (
    service.applyAdaptiveTriggerEffect(effect)
  ));
  ipcMain.handle('bridge:resetAdaptiveTriggers', () => service.resetAdaptiveTriggers());
  ipcMain.handle('bridge:restoreDefaults', async () => {
    const snapshot = await service.restoreDefaults();
    applySnapshotWindowScale(snapshot);
    applyLaunchAtStartup(snapshot.settings.launchAtStartupEnabled);
    return snapshot;
  });
  ipcMain.handle('bridge:setButtonRemap', (_event, buttonId: RemapButtonId, targetId: RemapButtonId) => (
    service.setButtonRemap(buttonId, targetId)
  ));
  ipcMain.handle('bridge:selectButtonRemappingProfile', (_event, profileId: string) => (
    service.selectButtonRemappingProfile(profileId)
  ));
  ipcMain.handle('bridge:saveButtonRemappingProfile', (_event, name?: string) => (
    service.saveButtonRemappingProfile(name)
  ));
  ipcMain.handle('bridge:updateButtonRemappingProfile', (_event, profileId: string) => (
    service.updateButtonRemappingProfile(profileId)
  ));
  ipcMain.handle('bridge:renameButtonRemappingProfile', (_event, profileId: string, name: string) => (
    service.renameButtonRemappingProfile(profileId, name)
  ));
  ipcMain.handle('bridge:deleteButtonRemappingProfile', (_event, profileId: string) => (
    service.deleteButtonRemappingProfile(profileId)
  ));
  ipcMain.handle('bridge:restoreButtonRemappingDefaults', () => service.restoreButtonRemappingDefaults());
  ipcMain.handle('bridge:setChordConfiguration', (_event, functions: ChordFunction[], assignments: ChordAssignment[]) => (
    service.setChordConfiguration(functions, assignments)
  ));
  ipcMain.handle('bridge:setEdgeProfileSwitchingBlocked', (_event, value: boolean) => (
    service.setEdgeProfileSwitchingBlocked(value)
  ));
  ipcMain.handle('bridge:setChordFunctions', (_event, functions: ChordFunction[]) => (
    service.setChordFunctions(functions)
  ));
  ipcMain.handle('bridge:setChordAssignments', (_event, assignments: ChordAssignment[]) => (
    service.setChordAssignments(assignments)
  ));
  ipcMain.handle('bridge:repairWindowsDeviceCache', () => service.repairWindowsDeviceCache());
  ipcMain.handle('bridge:selectFirmwareLogDirectory', async () => {
    const currentDirectory = service.getSnapshot().settings.firmwareLogDirectory;
    const selectedDirectory = await selectFirmwareLogDirectory(currentDirectory);
    return selectedDirectory === null
      ? service.getSnapshot()
      : service.setFirmwareLogDirectory(selectedDirectory);
  });
  ipcMain.handle('bridge:clearFirmwareLogDirectory', () => service.setFirmwareLogDirectory(null));
  ipcMain.handle('bridge:getDiagnostics', () => service.getSnapshot().diagnostics);
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:toggleMaximize', () => {
    if (!mainWindow || !mainWindow.isMaximizable()) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.handle('window:isMaximized', () => Boolean(mainWindow?.isMaximized()));
  ipcMain.handle('window:hide', () => closeMainWindow(mainWindow));
  ipcMain.handle('window:openExternal', (_event, url: string) => {
    if (!isAllowedExternalUrl(url)) {
      return;
    }
    void shell.openExternal(url);
  });
}

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) {
    return;
  }

  app.setName(APP_NAME);
  ensureWindowsNotificationShortcut();
  Menu.setApplicationMenu(null);
  const settingsStore = new SettingsStore(app.getPath('userData'));
  appSettingsStore = settingsStore;
  applyLaunchAtStartup(settingsStore.get().launchAtStartupEnabled);
  bridgeService = new BridgeService(
    settingsStore,
    new BootloaderAuthorizationStore(app.getPath('userData'), safeStorage)
  );
  registerIpc(bridgeService);

  // A login (tray) start creates no renderer until the tray opens it.
  if (!shouldStartInTray()) {
    showWindowCentered();
  }
  powerMonitor.on('resume', () => scheduleMainWindowScaleRestore(true));
  powerMonitor.on('unlock-screen', () => scheduleMainWindowScaleRestore(true));
  screen.on('display-metrics-changed', () => scheduleMainWindowScaleRestore(true));

  trayDefaultIcon = await createTrayIcon();
  tray = new Tray(trayDefaultIcon);
  updateTrayPresentation(bridgeService.getSnapshot());
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: `Open ${APP_NAME}`, click: showWindowCentered },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ]));
  tray.on('click', showWindowCentered);

  bridgeService.on('snapshot', (snapshot) => {
    updateTrayPresentation(snapshot);
    // A hidden renderer would only re-render for nothing; 'show' catches it up.
    if (mainWindow?.isVisible()) {
      sendToMainWindow('bridge:snapshot', snapshot);
    }
  });
  bridgeService.on('toast', (toast) => {
    showBridgeNotification(toast);
  });
  bridgeService.start();
});

app.on('second-instance', (_event, argv) => {
  if (!shouldStartInTray(argv)) {
    showWindowCentered();
  }
});

app.on('window-all-closed', () => {
  // Keep the companion alive as a tray app after the popover is closed.
});

app.on('before-quit', (event) => {
  if (shutdownComplete) {
    return;
  }
  event.preventDefault();
  isQuitting = true;
  const service = bridgeService;
  bridgeService = null;
  void (async () => {
    try {
      await service?.stop();
    } finally {
      shutdownComplete = true;
      app.quit();
    }
  })();
});
