import '@fontsource/montserrat/latin-500.css';
import '@fontsource/montserrat/latin-600.css';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import {
  IconAdjustmentsSpark,
  IconActivity as Activity,
  IconAlertTriangle,
  IconBatteryEco,
  IconBell as Bell,
  IconBinary,
  IconBluetooth,
  IconBolt as Zap,
  IconBrandXbox,
  IconDeviceGamepad2,
  IconMicrophone as Mic,
  IconMoon as Moon,
  IconPlayerPlay as Play,
  IconVolume as Volume2
} from '@tabler/icons-react';
import playStationLogoUrl from '../../../assets/brand/playstation-logo.svg';
import controllerImage from '../../../assets/controllers/dualsense-edge-front.svg';
import dpadDownGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Down.svg';
import dpadUpGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/D-Pad Up.svg';
import psHomeGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Home.svg';
import triangleGlyphUrl from '../../../assets/glyphs/ps5-buttons-outline-white/svg/Triangle.svg';
import { DEFAULT_UI_THEME_PRESET, UI_THEME_KOFI_BADGES } from './ui-themes';
import { saveUiThemePreset, storedUiThemePreset } from './ui-theme-preferences';
import {
  applyUiTextScalePercent,
  saveUiTextScalePercent,
  storedUiTextScalePercent
} from './ui-text-scale-preferences';
import { useDocumentTheme } from './common/use-document-theme';
import { documentHidden, useDocumentVisible } from './common/use-document-visible';
import { MainAppShell } from './features/shell/MainAppShell';
import { ShellSidebarHeader } from './features/shell/ShellSidebarHeader';
// Pages that load on first visit come from composition/lazy-pages; their
// controllers and dialogs are imported from their own modules so the pages stay
// out of the main chunk.
import { SettingsSidebar } from './features/settings/SettingsSidebar';
import { useSettingsNavigation } from './features/settings/use-settings-navigation';
import type { SettingsFocusTarget } from './features/settings/settings-navigation';
import type { SettingsPageActions, SettingsPageModel } from './features/settings/types';
import {
  LazyButtonRemappingPage,
  LazyChordsPage,
  LazyDevicesPage,
  LazySettingsPage,
  LazyStickDeadzonesPage,
  LazySystemPage
} from './composition/lazy-pages';
import { DeferredPage } from './common/DeferredPage';
import { ShellBridgeSelector } from './features/shell/ShellBridgeSelector';
import { ShellNotifications } from './features/shell/ShellNotifications';
import { ShellSidebarDevice } from './features/shell/ShellSidebarDevice';
import { ShellSupportBadge } from './features/shell/ShellSupportBadge';
import { CONTROL_TAB_DEFINITIONS, controlPanelIdFor, type ControlTab } from './features/shell/control-tabs';
import {
  STARTING_BRIDGE_LABEL,
  StartupPlaceholderPage,
  StartupTutorial,
  startingDevicePresentation,
  useStartupTutorial
} from './features/startup';
import { useLocalization } from './common/localization';
import type { AppRuntime } from './composition/app-runtime';
import { PERCENT_SLIDER_TICKS, sliderTickClass } from './common/slider-ticks';
import { CONTROLLER_POWER_SAVING_CAP_PERCENT } from './common/controller-power-saving';
import {
  batteryLabel,
  controllerName,
  healthLabel,
  healthTitle,
  isChargingPowerState,
  isExternalPowerState
} from './common/controller-status';
import { HOST_PERSONA_ABBREVIATIONS, HOST_PERSONA_OPTIONS } from './common/host-persona';
import { useStickDeadzonesController } from './features/stick-deadzones/use-stick-deadzones-controller';
import { useDevicesController } from './features/devices/use-devices-controller';
import { ControllerLightingPage, useControllerLightingController } from './features/controller-lighting';
import { LIGHTBAR_BRIGHTNESS_STEP, snapLightbarBrightness } from './features/controller-lighting/model';
import { ControllerAudioPage, useControllerAudioController } from './features/controller-audio';
import { MIC_VOLUME_STEP, SPEAKER_VOLUME_STEP, snapMicVolume, snapSpeakerVolume } from './features/controller-audio/model';
import { AdaptiveTriggersPage, useAdaptiveTriggersController } from './features/adaptive-triggers';
import { TriggerLabProfileDialog, useTriggerLabController } from './features/trigger-lab';
import { ButtonRemappingProfileDialog } from './features/button-remapping/ButtonRemappingProfileDialog';
import { useButtonRemappingController } from './features/button-remapping/use-button-remapping-controller';
import { ChordFunctionDialog } from './features/chords/ChordFunctionDialog';
import { useChordsController } from './features/chords/use-chords-controller';
import { BootloaderConfirmationDialog } from './features/bootloader-confirmation';
import { ControllerFeedbackPage, useControllerFeedbackController } from './features/controller-feedback';
import { HAPTICS_STEP, snapHapticsValue } from './features/controller-feedback/model';
import { useAudioHapticsLabController } from './features/audio-haptics-lab';
import { POLLING_RATE_OPTIONS } from './features/system-controls/model';
import { useSystemController } from './features/system-controls/use-system-controller';
import {
  KITSUNE_INPUT_PURCHASE_URL,
  KITSUNE_INPUT_URL,
  KitsuneInputLaunchOffer,
  KitsuneInputPromotionDialog,
  KitsunePromotionBanner,
  useKitsuneLaunchOffer
} from './features/kitsune-promotion';
import { normalizeUiLocalePreference } from '../shared/ui-locale-matching';
import type { HostPersonaMode } from '../shared/protocol';
import type { BridgeSnapshot, UiTextScalePercent, UiThemePreset } from '../shared/types';

type RemapProfileDialogMode = 'save' | 'rename' | 'delete';
type NotificationFocusTarget = 'controller-status' | 'low-battery' | 'all';

const SLEEP_CONFIRM_MS = 2400;
export function App() {
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null);
  const [bridgeRenameDraft, setBridgeRenameDraft] = useState<{ uniqueId: string; value: string } | null>(null);
  const [activeControlTab, setActiveControlTab] = useState<ControlTab>('overview');
  const triggerLabOpen = activeControlTab === 'trigger-lab';
  const audioHapticsOpen = activeControlTab === 'audio-haptics';
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [settingsReturnTab, setSettingsReturnTab] = useState<ControlTab>('overview');
  const [settingsFocusTarget, setSettingsFocusTarget] = useState<SettingsFocusTarget | null>(null);
  const [notificationFocusTarget, setNotificationFocusTarget] = useState<NotificationFocusTarget | null>(null);
  const [showNotificationsMenu, setShowNotificationsMenu] = useState(false);
  const [showKitsuneInputPromotion, setShowKitsuneInputPromotion] = useState(false);
  const [windowDragging, setWindowDragging] = useState(false);
  const [startupTheme, setStartupTheme] = useState<UiThemePreset>(storedUiThemePreset);
  const [startupTextScale, setStartupTextScale] = useState<UiTextScalePercent>(storedUiTextScalePercent);
  const localization = useLocalization();
  // Hidden or minimized, the app stops rendering snapshots and pauses its polling.
  const windowVisible = useDocumentVisible();
  const [overviewSleepConfirmVisible, setOverviewSleepConfirmVisible] = useState(false);
  const startupTutorial = useStartupTutorial();
  const [picoFirmwareMessage, setPicoFirmwareMessage] = useState<string | null>(null);
  const [picoFirmwareError, setPicoFirmwareError] = useState<string | null>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const bridgeRenameCancelledRef = useRef(false);
  const overviewSleepConfirmTimerRef = useRef<number | null>(null);
  const settingsFocusTimerRef = useRef<number | null>(null);
  const notificationFocusTimerRef = useRef<number | null>(null);
  const windowDraggingRef = useRef(false);
  const windowDragReleaseTimerRef = useRef<number | null>(null);
  const deferredSnapshotRef = useRef<BridgeSnapshot | null>(null);
  const overviewSleepConfirmArmedRef = useRef(false);
  const kitsuneLaunchOffer = useKitsuneLaunchOffer({
    eligible: Boolean(snapshot) && !snapshot?.settings.kitsuneInputLaunchOfferShown,
    blocked: startupTutorial.step !== 'done'
      || Boolean(snapshot?.bootloaderConfirmation)
      || showKitsuneInputPromotion,
    markShown: () => void runQuietAction(() => window.bridge.markKitsuneInputLaunchOfferShown())
  });

  useEffect(() => {
    const liveTheme = snapshot?.settings.uiThemePreset;
    if (!liveTheme) return;
    setStartupTheme(liveTheme);
    saveUiThemePreset(liveTheme);
  }, [snapshot?.settings.uiThemePreset]);

  useEffect(() => {
    const liveLocale = snapshot?.settings.uiLocale;
    if (!liveLocale || liveLocale === localization.preference) return;
    localization.setPreference(liveLocale);
  }, [snapshot?.settings.uiLocale]);

  useEffect(() => {
    const liveTextScale = snapshot?.settings.uiTextScalePercent;
    if (!liveTextScale) return;
    setStartupTextScale(liveTextScale);
    applyUiTextScalePercent(liveTextScale);
    saveUiTextScalePercent(liveTextScale);
  }, [snapshot?.settings.uiTextScalePercent]);

  const personaTransition = snapshot?.personaTransition ?? null;
  const personaTransitionActive = Boolean(personaTransition);
  const connected = snapshot?.state === 'connected';
  const controllerConnected = Boolean(snapshot?.status?.controllerConnected);
  const controllerControlsAvailable = connected && controllerConnected;
  const runtime: AppRuntime = {
    snapshot,
    connected,
    controllerConnected,
    controllerControlsAvailable,
    pendingAction,
    setSnapshot,
    setPendingAction,
    applySnapshot,
    runAction,
    runQuietAction
  };
  const stickDeadzones = useStickDeadzonesController(runtime, activeControlTab === 'deadzones' && windowVisible);
  const devices = useDevicesController(runtime);
  const lighting = useControllerLightingController(runtime);
  const audio = useControllerAudioController(runtime, { lightbarCommitPending: lighting.lightbarCommitPending });
  const triggers = useAdaptiveTriggersController(runtime);
  const triggerLab = useTriggerLabController(runtime, triggers);
  const buttonRemapping = useButtonRemappingController(runtime, activeControlTab === 'remapping');
  const { showDualSenseEdgeRemapButtons } = buttonRemapping;
  const chords = useChordsController(runtime, { active: activeControlTab === 'chords', showDualSenseEdgeRemapButtons });
  const feedback = useControllerFeedbackController(runtime, {
    speakerVolumeCommitPending: audio.speakerVolumeCommitPending,
    lightbarCommitPending: lighting.lightbarCommitPending
  });
  const audioHapticsLab = useAudioHapticsLabController(runtime, { active: audioHapticsOpen });
  const system = useSystemController(runtime, { active: activeControlTab === 'system' && windowVisible });
  const {
    hapticsValue,
    setHapticsValue,
    hapticsEditingRef,
    hapticsCommitPending,
    hapticsSliderMax,
    hapticsSliderTicks,
    controllerPowerSavingActive,
    activeFeedbackTestUnavailable,
    commitHapticsValue,
    runFeedbackTest
  } = feedback;
  function applySnapshot(next: BridgeSnapshot) {
    setSnapshot(next);
    buttonRemapping.syncSnapshot(next);
    feedback.syncSnapshot(next);
    stickDeadzones.syncSnapshot(next);
    audio.syncSnapshot(next);
    lighting.syncSnapshot(next);
    triggers.syncSnapshot(next);
  }

  function finishWindowDrag() {
    windowDraggingRef.current = false;
    setWindowDragging(false);
    if (windowDragReleaseTimerRef.current !== null) {
      window.clearTimeout(windowDragReleaseTimerRef.current);
      windowDragReleaseTimerRef.current = null;
    }
    const deferredSnapshot = deferredSnapshotRef.current;
    deferredSnapshotRef.current = null;
    if (deferredSnapshot) {
      applySnapshot(deferredSnapshot);
    }
  }

  function beginWindowDrag() {
    windowDraggingRef.current = true;
    setWindowDragging(true);
    if (windowDragReleaseTimerRef.current !== null) {
      window.clearTimeout(windowDragReleaseTimerRef.current);
    }
    windowDragReleaseTimerRef.current = window.setTimeout(finishWindowDrag, 1600);
    window.addEventListener('mouseup', finishWindowDrag, { once: true });
    window.addEventListener('blur', finishWindowDrag, { once: true });
  }

  useEffect(() => {
    let cancelled = false;
    let receivedLiveSnapshot = false;
    // The bridge service sends a snapshot on every status poll. While the window
    // is being dragged, hidden, or minimized only the newest one is kept, and it
    // is rendered once the window is back.
    const receiveSnapshot = (next: BridgeSnapshot) => {
      if (windowDraggingRef.current || documentHidden()) {
        deferredSnapshotRef.current = next;
        return;
      }
      applySnapshot(next);
    };
    const applyDeferredSnapshotWhenShown = () => {
      if (documentHidden() || windowDraggingRef.current) return;
      const deferredSnapshot = deferredSnapshotRef.current;
      deferredSnapshotRef.current = null;
      if (deferredSnapshot) {
        applySnapshot(deferredSnapshot);
      }
    };
    window.bridge.getStatus().then((next) => {
      if (!cancelled && !receivedLiveSnapshot) {
        receiveSnapshot(next);
      }
    });
    const unsubscribe = window.bridge.onSnapshot((next) => {
      receivedLiveSnapshot = true;
      receiveSnapshot(next);
    });
    document.addEventListener('visibilitychange', applyDeferredSnapshotWhenShown);
    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', applyDeferredSnapshotWhenShown);
      if (overviewSleepConfirmTimerRef.current !== null) {
        window.clearTimeout(overviewSleepConfirmTimerRef.current);
      }
      if (settingsFocusTimerRef.current !== null) {
        window.clearTimeout(settingsFocusTimerRef.current);
      }
      if (notificationFocusTimerRef.current !== null) {
        window.clearTimeout(notificationFocusTimerRef.current);
      }
      if (windowDragReleaseTimerRef.current !== null) {
        window.clearTimeout(windowDragReleaseTimerRef.current);
      }
      window.removeEventListener('mouseup', finishWindowDrag);
      window.removeEventListener('blur', finishWindowDrag);
    };
  }, []);

  useEffect(() => {
    if (!showNotificationsMenu) {
      return;
    }

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (showNotificationsMenu && !notificationsRef.current?.contains(event.target as Node)) {
        setShowNotificationsMenu(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotificationsMenu(false);
      }
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [showNotificationsMenu]);

  const batteryPercentLabel = batteryLabel(snapshot);
  const batteryCharging = isChargingPowerState(snapshot?.status?.rawPowerState);
  const batteryExternalPower = isExternalPowerState(snapshot?.status?.rawPowerState);
  const batteryPowerLabel = batteryExternalPower
    ? batteryCharging ? 'Charging' : 'Connected to power'
    : null;
  const speakerVolumeSupported = Boolean(snapshot?.status?.firmwareFlags.speakerVolumeControl);
  const lightbarSupported = Boolean(snapshot?.status?.firmwareFlags.lightbarControl);
  const lightbarOverrideSupported = Boolean(snapshot?.status?.firmwareFlags.lightbarOverrideControl);
  const adaptiveTriggersSupported = Boolean(snapshot?.status?.firmwareFlags.adaptiveTriggersControl);
  const usbSuspendDisconnectSupported = Boolean(snapshot?.status?.firmwareFlags.usbSuspendDisconnectControl);
  const wakeOnConnectSupported = Boolean(snapshot?.status?.firmwareFlags.wakeOnConnectControl);
  const sleepControllerSupported = Boolean(snapshot?.status?.firmwareFlags.sleepControllerControl);
  const pollingRateControlSupported = Boolean(snapshot?.status?.firmwareFlags.pollingRateControl);
  const hostPersonaControlSupported = Boolean(snapshot?.status?.firmwareFlags.hostPersonaControl);
  const audioBufferLengthControlSupported = Boolean(snapshot?.status?.firmwareFlags.hapticsBufferLengthControl);
  const supportedHostPersonaModes: HostPersonaMode[] = snapshot?.status?.supportedHostPersonaModes ?? ['dualsense'];
  const overviewHostPersonaMode = personaTransition?.to ?? snapshot?.settings.hostPersonaMode ?? 'dualsense';
  const adaptiveTriggersEnabled = Boolean(snapshot?.settings.adaptiveTriggersEnabled);
  const lightbarEnabled = Boolean(snapshot?.settings.lightbarEnabled);
  const sleepKeybindEnabled = Boolean(snapshot?.settings.sleepKeybindEnabled);
  const controllerToastEnabled = Boolean(snapshot?.settings.notifyControllerConnection);
  const lowBatteryToastEnabled = Boolean(snapshot?.settings.notifyLowBattery);
  const notificationsEnabled = controllerToastEnabled || lowBatteryToastEnabled;
  const adaptiveTriggerOutputActive = Boolean(snapshot?.status?.adaptiveTriggerOutputRecent);
  const audioStatus = snapshot?.diagnostics.audioStatus;
  const headsetOutputDetected = Boolean(audioStatus?.headsetPlugged);
  const percentSliderMax = controllerPowerSavingActive ? CONTROLLER_POWER_SAVING_CAP_PERCENT : 100;
  const sidebarControllerCard = devices.model.cards.find(
    (device) => device.label === 'Current controller'
  ) ?? devices.model.cards[0] ?? null;
  const sidebarDeviceTitle = personaTransitionActive
    ? 'Switching Mode'
    : sidebarControllerCard?.title
      ?? (connected && controllerConnected ? controllerName(snapshot.status?.controllerType) : 'Controller');
  const sidebarDeviceStatus = personaTransitionActive
    ? 'Switching'
    : connected && controllerConnected
    ? 'Connected'
    : 'Disconnected';
  const sidebarDeviceTone = personaTransitionActive
    ? 'warn'
    : connected && controllerConnected
      ? 'good'
      : connected
        ? 'warn'
        : snapshot?.state === 'error' || snapshot?.state === 'incompatible'
          ? 'bad'
          : 'idle';
  const sidebarBatteryLabel = personaTransitionActive
    ? '\u2014'
    : connected && controllerConnected
    ? batteryPercentLabel
    : '\u2014';
  const bridgeDevices = snapshot?.bridgeDevices ?? null;
  const bridgeSelectOptions: Array<[string, string]> = (bridgeDevices?.bridges ?? []).map((bridge, index) => [
    `${bridge.name ?? `Bridge ${index + 1}`}${bridge.connected ? ' (active)' : ''}`,
    bridge.path
  ]);
  const selectedBridgeInfo = bridgeDevices?.bridges.find((bridge) => bridge.selected)
    ?? bridgeDevices?.bridges.find((bridge) => bridge.connected)
    ?? bridgeDevices?.bridges[0]
    ?? null;
  const activeBridgeSelectValue = selectedBridgeInfo?.path ?? '';
  const directControllers = bridgeDevices?.directControllers ?? [];
  const pollingRateLabel = POLLING_RATE_OPTIONS.find(([, mode]) => mode === snapshot?.settings.pollingRateMode)?.[0]
    .replace(' / Real-time', '')
    ?? '--';
  const firmwareUpdateAvailable = Boolean(snapshot?.diagnostics.firmwareUpdateAvailable);
  const overviewHealthLabel = healthLabel(snapshot);
  const overviewHealthTitle = healthTitle(snapshot);
  const overviewHealthTone = personaTransitionActive
    ? 'warn'
    : snapshot?.diagnostics.lastError
    ? 'bad'
    : firmwareUpdateAvailable
    ? 'warn'
    : connected && controllerConnected
      ? 'good'
      : connected
        ? 'info'
        : 'idle';
  const overviewConnectionStatus = personaTransitionActive
    ? 'Switching'
    : connected && controllerConnected
    ? 'Stable'
    : connected
      ? 'Waiting'
      : 'Offline';
  const overviewAudioPathState = !connected
    ? '--'
    : 'Pico Local';
  const overviewAudioPathDetail = personaTransitionActive
    ? 'Switching Mode'
    : !connected
    ? '--'
    : audioStatus?.controllerStateReady
      ? 'Controller Ready'
      : 'Waiting';
  const overviewAudioOutputLabel = connected ? (headsetOutputDetected ? 'Headphones' : 'Speaker') : '--';
  const overviewSpeakerVolumeValue = `${audio.speakerVolumeValue}%`;
  const overviewFirmwareLabel = snapshot?.status?.firmwareVersion ?? '--';
  const overviewSignalValue = connected ? snapshot?.status?.signalStrengthDbm : null;
  const overviewSignalQuality = overviewSignalValue === null || overviewSignalValue === undefined
    ? null
    : overviewSignalValue >= -15
      ? 'Excellent'
      : overviewSignalValue >= -22
        ? 'Good'
        : overviewSignalValue >= -27
          ? 'Audio Risk'
          : 'Poor';
  const overviewSignalTone = overviewSignalQuality === 'Excellent' || overviewSignalQuality === 'Good'
    ? 'good'
    : overviewSignalQuality === 'Audio Risk'
      ? 'warn'
      : overviewSignalQuality === 'Poor'
        ? 'bad'
        : 'idle';
  const overviewSignalTitle = overviewSignalValue !== null && overviewSignalValue !== undefined
    ? `${overviewSignalValue} dBm`
    : undefined;
  const overviewSignalLabel = overviewSignalQuality
    ? overviewSignalQuality
    : '--';
  const overviewShortcutItems = [
    snapshot?.settings.sleepKeybindEnabled ? { id: 'sleep', label: 'Sleep Shortcut' } : null,
    snapshot?.settings.speakerVolumeShortcutEnabled ? { id: 'volume', label: 'Volume Shortcut' } : null
  ].filter((item): item is { id: 'sleep' | 'volume'; label: string } => Boolean(item));
  const overviewNotificationItems = [
    controllerToastEnabled ? { id: 'controller-status', label: 'Controller Status' } : null,
    lowBatteryToastEnabled ? { id: 'low-battery', label: 'Low Battery' } : null
  ].filter((item): item is { id: NotificationFocusTarget; label: string } => Boolean(item));
  const overviewPowerSavingLabel = snapshot?.settings.controllerPowerSavingEnabled
    ? controllerPowerSavingActive
      ? 'Active'
      : 'Enabled'
    : 'Off';
  async function runAction(label: string, action: () => Promise<BridgeSnapshot>) {
    if (!snapshot || pendingAction) {
      return;
    }
    setPendingAction(label);
    try {
      const next = await action();
      setSnapshot(next);
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
    } finally {
      setPendingAction(null);
    }
  }

  async function runQuietAction(action: () => Promise<BridgeSnapshot>) {
    if (!snapshot) {
      return;
    }
    try {
      const next = await action();
      setSnapshot(next);
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
    }
  }

  async function runPicoFirmwareAction(
    label: string,
    action: () => Promise<{ ok: boolean; cancelled?: boolean; message: string }>
  ) {
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
      setPicoFirmwareError(error instanceof Error ? error.message : 'Pico firmware action failed.');
    } finally {
      setPendingAction(null);
    }
  }

  function mountPicoBootloader() {
    void runPicoFirmwareAction('pico-firmware-mount', () => window.bridge.mountPicoBootloader());
  }

  function flashPicoFirmware() {
    void runPicoFirmwareAction('pico-firmware-flash', () => window.bridge.flashPicoFirmware());
  }

  function nukePicoFlash() {
    void runPicoFirmwareAction('pico-firmware-nuke', () => window.bridge.nukePicoFlash());
  }

  function focusBridgeSettings(target: SettingsFocusTarget) {
    setShowNotificationsMenu(false);
    selectControlTab('settings');
    setNotificationFocusTarget(null);
    setSettingsFocusTarget(target);
    if (settingsFocusTimerRef.current !== null) {
      window.clearTimeout(settingsFocusTimerRef.current);
    }
    settingsFocusTimerRef.current = window.setTimeout(() => {
      setSettingsFocusTarget(null);
      settingsFocusTimerRef.current = null;
    }, 2200);
  }

  function focusNotificationSettings(target: NotificationFocusTarget) {
    setShowNotificationsMenu(true);
    setSettingsFocusTarget(null);
    setNotificationFocusTarget(target);
    if (notificationFocusTimerRef.current !== null) {
      window.clearTimeout(notificationFocusTimerRef.current);
    }
    notificationFocusTimerRef.current = window.setTimeout(() => {
      setNotificationFocusTarget(null);
      notificationFocusTimerRef.current = null;
    }, 2200);
  }

    function clearOverviewSleepConfirmation() {
    overviewSleepConfirmArmedRef.current = false;
    setOverviewSleepConfirmVisible(false);
    if (overviewSleepConfirmTimerRef.current !== null) {
      window.clearTimeout(overviewSleepConfirmTimerRef.current);
      overviewSleepConfirmTimerRef.current = null;
    }
  }

  function armOverviewSleepConfirmation() {
    overviewSleepConfirmArmedRef.current = true;
    setOverviewSleepConfirmVisible(true);
    if (overviewSleepConfirmTimerRef.current !== null) {
      window.clearTimeout(overviewSleepConfirmTimerRef.current);
    }
    overviewSleepConfirmTimerRef.current = window.setTimeout(() => {
      overviewSleepConfirmArmedRef.current = false;
      setOverviewSleepConfirmVisible(false);
      overviewSleepConfirmTimerRef.current = null;
    }, SLEEP_CONFIRM_MS);
  }

  function handleOverviewSleepController() {
    if (!snapshot || !connected || !sleepControllerSupported || !controllerConnected || pendingAction !== null) {
      return;
    }
    if (!overviewSleepConfirmArmedRef.current) {
      armOverviewSleepConfirmation();
      return;
    }
    clearOverviewSleepConfirmation();
    void runAction('overview-sleep-controller', () => window.bridge.sleepController());
  }

  function toggleControllerNotifications() {
    if (!snapshot) return;
    void runAction('notify-controller', () => (
      window.bridge.setNotifyControllerConnection(!snapshot.settings.notifyControllerConnection)
    ));
  }

  function toggleLowBatteryNotifications() {
    if (!snapshot) return;
    void runAction('notify-battery', () => (
      window.bridge.setNotifyLowBattery(!snapshot.settings.notifyLowBattery)
    ));
  }

  function testNotifications() {
    void runAction('notify-test', () => window.bridge.testNotification());
  }

  function selectControlTab(tab: ControlTab) {
    if (tab === activeControlTab) {
      return;
    }
    if (tab === 'settings') {
      setSettingsReturnTab(activeControlTab);
    }
    lighting.closeCustomColorPicker();
    setShowNotificationsMenu(false);
    devices.closeMenu();
    setActiveControlTab(tab);
  }

  const activeTheme = snapshot?.settings.uiThemePreset ?? startupTheme;
  const activeTextScale = snapshot?.settings.uiTextScalePercent ?? startupTextScale;
  useDocumentTheme(activeTheme, activeTextScale);
  const settingsNavigation = useSettingsNavigation({ focusTarget: settingsFocusTarget });

  // The shell renders at once; until the first snapshot arrives the device card
  // and page area show placeholders instead of a full-window splash screen.
  if (!snapshot) {
    return (
      <MainAppShell
        className="shell starting"
        theme={activeTheme}
        textScale={activeTextScale}
        activeTab={activeControlTab}
        panelIdForTab={controlPanelIdFor}
        onSelectTab={selectControlTab}
        onWindowChromeMouseDown={() => undefined}
        onBeginWindowDrag={beginWindowDrag}
        onMinimize={() => void window.bridge.minimizeWindow()}
        onHide={() => void window.bridge.hideWindow()}
        sidebarDevice={(
          <ShellSidebarDevice
            device={startingDevicePresentation(controllerImage)}
            bridgeSelector={(
              <ShellBridgeSelector
                bridges={[]}
                selectedPath=""
                selectedName={null}
                selectedUniqueId={null}
                directControllers={[]}
                busy
                emptyLabel={STARTING_BRIDGE_LABEL}
                onSelect={() => undefined}
                onRefresh={() => undefined}
                onRename={() => undefined}
              />
            )}
          />
        )}
        pages={<StartupPlaceholderPage title={CONTROL_TAB_DEFINITIONS[activeControlTab].label} />}
      />
    );
  }

  const kofiBadgeUrl = UI_THEME_KOFI_BADGES[activeTheme] ?? UI_THEME_KOFI_BADGES[DEFAULT_UI_THEME_PRESET];

  const sidebarDeviceNode = (
    <ShellSidebarDevice
      device={{
        title: sidebarDeviceTitle,
        status: sidebarDeviceStatus,
        tone: sidebarDeviceTone,
        batteryLabel: sidebarBatteryLabel,
        powerLabel: batteryPowerLabel,
        controllerArt: controllerImage
      }}
      onOpenDevices={() => selectControlTab('devices')}
      bridgeSelector={(
        <ShellBridgeSelector
          bridges={bridgeSelectOptions.map(([label, path]) => ({ label, path }))}
          selectedPath={activeBridgeSelectValue}
          selectedName={selectedBridgeInfo?.name ?? null}
          selectedUniqueId={selectedBridgeInfo?.uniqueId ?? null}
          directControllers={directControllers}
          busy={pendingAction !== null}
          onSelect={(devicePath) => void runAction('bridge-select', () => window.bridge.selectBridge(devicePath))}
          onRefresh={() => runAction('bridge-refresh', () => window.bridge.refreshBridgeDevices())}
          onRename={(uniqueId, name) => void runAction(
            'bridge-rename',
            () => window.bridge.setBridgeLabel(uniqueId, name)
          )}
        />
      )}
    />
  );

  const settingsPageModel: SettingsPageModel = {
    settings: snapshot.settings,
    connected,
    busy: pendingAction !== null,
    pendingAction,
    support: {
      usbSuspendDisconnect: usbSuspendDisconnectSupported,
      wakeOnConnect: wakeOnConnectSupported,
      sleepController: sleepControllerSupported
    },
    focusTarget: settingsFocusTarget,
    picoFirmware: { message: picoFirmwareMessage, error: picoFirmwareError },
    wakeOnLan: {
      connectionKey: `${snapshot.state}:${snapshot.settings.selectedBridgePath ?? ''}:${snapshot.status?.protocolVersion ?? ''}:${controllerConnected}`,
      controllerConnected
    },
    bridgeHealth: {
      firmwareVersion: snapshot.status?.firmwareVersion ?? null,
      resetEvidence: connected ? snapshot.diagnostics.resetEvidence : null
    }
  };
  const currentSettings = snapshot.settings;
  const settingsPageActions: SettingsPageActions = {
    setTheme: (value) => void runAction('ui-theme', () => window.bridge.setUiThemePreset(value)),
    setUiScale: (value) => void runAction('ui-scale', () => window.bridge.setUiScalePercent(value)),
    setTextScale: (value) => void runAction('ui-text-scale', () => window.bridge.setUiTextScalePercent(value)),
    setLocale: (value) => void runAction('ui-locale', () => window.bridge.setUiLocale(normalizeUiLocalePreference(value))),
    toggleLaunchAtStartup: () => void runAction('launch-at-startup', () => (
      window.bridge.setLaunchAtStartupEnabled(!currentSettings.launchAtStartupEnabled)
    )),
    toggleBatteryTrayIcon: () => void runAction('battery-tray-icon', () => (
      window.bridge.setShowBatteryPercentTrayIcon(!currentSettings.showBatteryPercentTrayIcon)
    )),
    toggleControllerNotifications,
    toggleLowBatteryNotifications,
    testNotification: testNotifications,
    setIdleDisconnectTimeout: (minutes) => void runAction('idle-timeout', () => window.bridge.setIdleDisconnectTimeoutMinutes(minutes)),
    toggleIdleDisconnect: () => void runAction('idle', () => (
      window.bridge.setIdleDisconnectEnabled(!currentSettings.idleDisconnectEnabled)
    )),
    toggleUsbSuspendDisconnect: () => void runAction('usb-suspend', () => (
      window.bridge.setUsbSuspendDisconnectEnabled(!currentSettings.usbSuspendDisconnectEnabled)
    )),
    toggleControllerPowerSaving: () => void runAction('controller-power-saving', () => (
      window.bridge.setControllerPowerSavingEnabled(!currentSettings.controllerPowerSavingEnabled)
    )),
    toggleLed: () => void runAction('led', () => window.bridge.setLedEnabled(!currentSettings.ledEnabled)),
    togglePlayerLed: () => void runAction('player-led', () => window.bridge.setPlayerLedEnabled(!currentSettings.playerLedEnabled)),
    toggleLightbarRestore: () => void runAction('lightbar-restore', () => (
      window.bridge.setLightbarRestoreEnabled(!currentSettings.lightbarRestoreEnabled)
    )),
    toggleEdgeProfileSwitching: () => void runAction('edge-profile-switching', () => (
      window.bridge.setEdgeProfileSwitchingBlocked(!currentSettings.edgeProfileSwitchingBlocked)
    )),
    toggleSleepShortcut: () => void runAction('sleep-keybind', () => (
      window.bridge.setSleepKeybindEnabled(!currentSettings.sleepKeybindEnabled)
    )),
    toggleVolumeShortcut: () => void runAction('volume-shortcut', () => (
      window.bridge.setSpeakerVolumeShortcutEnabled(!currentSettings.speakerVolumeShortcutEnabled)
    )),
    toggleWakeOnConnect: () => void runAction('wake-on-connect', () => (
      window.bridge.setWakeOnConnectEnabled(!currentSettings.wakeOnConnectEnabled)
    )),
    mountPicoBootloader,
    flashPicoFirmware,
    nukePicoFlash,
    openExternal: (url) => void window.bridge.openExternal(url),
    wakeOnLan: window.bridge
  };

  const shellClassName = [
    'shell',
    windowDragging ? 'window-dragging' : '',
    controllerControlsAvailable ? '' : 'controller-unavailable'
  ].filter(Boolean).join(' ');

  return (
    <MainAppShell
      className={shellClassName}
      theme={activeTheme}
      textScale={activeTextScale}
      activeTab={activeControlTab}
      panelIdForTab={controlPanelIdFor}
      onSelectTab={selectControlTab}
      onWindowChromeMouseDown={() => setShowNotificationsMenu(false)}
      onBeginWindowDrag={beginWindowDrag}
      onMinimize={() => void window.bridge.minimizeWindow()}
      onHide={() => void window.bridge.hideWindow()}
      windowBarCenter={snapshot.settings.kitsuneInputPromotionDismissed ? null : (
        <KitsunePromotionBanner
          expanded={showKitsuneInputPromotion}
          onOpen={() => {
            setShowNotificationsMenu(false);
            setShowKitsuneInputPromotion(true);
          }}
        />
      )}
      windowBarTools={(
        <>
          <ShellSupportBadge
            badgeUrl={kofiBadgeUrl}
            onOpen={() => void window.bridge.openExternal('https://ko-fi.com/sundaymoments')}
          />
          <ShellNotifications
          rootRef={notificationsRef}
          notifications={{
            menuOpen: showNotificationsMenu,
            controllerEnabled: controllerToastEnabled,
            lowBatteryEnabled: lowBatteryToastEnabled,
            controlsDisabled: pendingAction !== null,
            focusTarget: notificationFocusTarget
          }}
          onToggle={() => setShowNotificationsMenu((value) => !value)}
          onToggleController={toggleControllerNotifications}
          onToggleLowBattery={toggleLowBatteryNotifications}
          onTest={testNotifications}
          />
        </>
      )}
      sidebarDevice={sidebarDeviceNode}
      pages={(
        <>
          {/* Each page mounts on its first visit; hidden pages skip re-rendering on new snapshots. */}
          <DeferredPage active={activeControlTab === 'overview'}>
          <div
            className={`control-page overview-page ${activeControlTab === 'overview' ? 'active' : ''}`}
            role="tabpanel"
            id="control-panel-overview"
            aria-labelledby="control-tab-overview"
            aria-hidden={activeControlTab !== 'overview'}
          >
            <div className="feature-heading overview-heading">
              <div>
                <h2>Overview</h2>
                <p>At-a-glance status of your controller and active settings.</p>
              </div>
              <span className={`overview-health health-label ${overviewHealthTone}`} title={overviewHealthTitle}>
                <span className={`dot ${overviewHealthTone}`} />
                {overviewHealthLabel}
              </span>
            </div>

            <div className="overview-card-grid">
              <button className="overview-card" type="button" onClick={() => selectControlTab('system')}>
                <div className="overview-card-title">
                  <span className="feature-icon overview-icon"><Activity size={19} /></span>
                  <h3>Connection</h3>
                </div>
                <div className="overview-fields">
                  <div>
                    <span>USB</span>
                    <strong className={overviewConnectionStatus === 'Stable' ? 'success-value' : ''}>
                      {overviewConnectionStatus}
                    </strong>
                  </div>
                  <div>
                    <span>Polling Rate</span>
                    <strong>{connected && pollingRateControlSupported ? pollingRateLabel : '--'}</strong>
                  </div>
                </div>
              </button>

              <button className="overview-card" type="button" onClick={() => selectControlTab('audio')}>
                <div className="overview-card-title">
                  <span className="feature-icon overview-icon"><IconBinary size={26} /></span>
                  <h3>Audio Path</h3>
                </div>
                <div className="overview-fields">
                  <div>
                    <span>Route</span>
                    <strong className={overviewAudioPathState === 'Pico Local' ? 'success-value' : ''}>
                      {overviewAudioPathState}
                    </strong>
                  </div>
                  <div>
                    <span>Status</span>
                    <strong>{overviewAudioPathDetail}</strong>
                  </div>
                </div>
              </button>

              <button className="overview-card" type="button" onClick={() => selectControlTab('audio')}>
                <div className="overview-card-title">
                  <span className="feature-icon overview-icon"><Volume2 size={19} /></span>
                  <h3>Audio</h3>
                </div>
                <div className="overview-fields">
                  <div>
                    <span>Route</span>
                    <strong>{overviewAudioOutputLabel}</strong>
                  </div>
                  <div>
                    <span>Volume</span>
                    <strong>{overviewSpeakerVolumeValue}</strong>
                  </div>
                </div>
              </button>

              <button className="overview-card" type="button" onClick={() => selectControlTab('system')}>
                <div className="overview-card-title">
                  <span className="feature-icon overview-icon"><IconBluetooth size={19} /></span>
                  <h3>Wireless</h3>
                </div>
                <div className="overview-fields">
                  <div>
                    <span>Signal</span>
                    <strong className={`signal-value ${overviewSignalTone}`} title={overviewSignalTitle}>
                      {overviewSignalLabel}
                    </strong>
                  </div>
                  <div>
                    <span>Firmware</span>
                    <strong>{overviewFirmwareLabel}</strong>
                  </div>
                </div>
              </button>
            </div>

            <div className="overview-control-grid">
              <section className="overview-control-panel overview-quick-actions" aria-label="Quick actions">
                <div className="overview-panel-heading">
                  <span className="feature-icon overview-icon"><Zap size={18} /></span>
                  <div>
                    <h3>Quick Actions</h3>
                  </div>
                </div>
                <div className="overview-action-grid">
                  <button
                    type="button"
                    className={feedback.feedbackTestError ? 'failed' : undefined}
                    disabled={activeFeedbackTestUnavailable}
                    title={feedback.feedbackTestError ?? undefined}
                    aria-describedby={feedback.feedbackTestError ? 'overview-feedback-test-error' : undefined}
                    onClick={runFeedbackTest}
                  >
                    {feedback.feedbackTestError ? <IconAlertTriangle size={15} /> : <Play size={15} />}
                    {feedback.feedbackTestError ? 'Failed' : 'Test Haptics'}
                  </button>
                  {feedback.feedbackTestError ? (
                    <span id="overview-feedback-test-error" className="visually-hidden" role="alert">
                      {feedback.feedbackTestError}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    disabled={audio.testSpeakerUnavailable}
                    onClick={audio.runTestSpeaker}
                  >
                    <Volume2 size={15} />
                    Test Speaker
                  </button>
                  <button
                    type="button"
                    disabled={audio.testMicUnavailable}
                    onClick={audio.runTestMic}
                  >
                    <Mic size={15} />
                    Listen Mic
                  </button>
                  <button
                    type="button"
                    className={overviewSleepConfirmVisible ? 'confirm' : undefined}
                    disabled={!connected || !sleepControllerSupported || !controllerConnected || pendingAction !== null}
                    onClick={handleOverviewSleepController}
                  >
                    <Moon size={15} />
                    {overviewSleepConfirmVisible ? 'Confirm Sleep' : 'Sleep Controller'}
                  </button>
                </div>
                <div className="overview-persona-grid" aria-label="Host controller persona">
                  {HOST_PERSONA_OPTIONS.map(([label, mode]) => {
                    const active = overviewHostPersonaMode === mode;
                    const supported = supportedHostPersonaModes.includes(mode);
                    const disabled = !connected
                      || !hostPersonaControlSupported
                      || pendingAction !== null
                      || personaTransitionActive
                      || (!supported && !active);
                    return (
                      <button
                        key={mode}
                        type="button"
                        className={`overview-persona-button persona-${mode} ${active ? 'active' : ''}`}
                        aria-pressed={active}
                        aria-label={`Switch to ${label} mode`}
                        disabled={disabled}
                        title={`Switch to ${label} mode`}
                        onClick={() => {
                          if (!active) {
                            system.setHostPersonaMode(mode);
                          }
                        }}
                      >
                        {mode === 'xbox' ? (
                          <IconBrandXbox className="overview-persona-logo" aria-hidden="true" />
                        ) : (
                          <span
                            className="overview-persona-logo playstation"
                            style={{ '--overview-persona-logo-mask': `url("${playStationLogoUrl}")` } as CSSProperties}
                            aria-hidden="true"
                          />
                        )}
                        <span>{HOST_PERSONA_ABBREVIATIONS[mode]}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="overview-control-panel overview-sliders" aria-label="Quick controls">
                <div className="overview-panel-heading">
                  <span className="feature-icon overview-icon"><IconAdjustmentsSpark size={18} /></span>
                  <div>
                    <h3>Quick Controls</h3>
                  </div>
                </div>
                <div className="overview-slider-list">
                  <label className={`overview-slider-row ${(!connected || !snapshot.settings.hapticsEnabled) ? 'disabled' : ''}`}>
                    <span>Haptics</span>
                    <div className="overview-range-control">
                      <input
                        type="range"
                        min="0"
                        max={hapticsSliderMax}
                        step={HAPTICS_STEP}
                        value={hapticsValue}
                        disabled={!connected || !snapshot.settings.hapticsEnabled}
                        style={{ '--range-fill': `${(hapticsValue / hapticsSliderMax) * 100}%` } as CSSProperties}
                        onPointerDown={() => {
                          hapticsEditingRef.current = true;
                        }}
                        onChange={(event) => setHapticsValue(snapHapticsValue(
                          Number(event.currentTarget.value),
                          hapticsSliderMax
                        ))}
                        onPointerUp={() => void commitHapticsValue()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            hapticsEditingRef.current = true;
                          }
                        }}
                        onKeyUp={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            void commitHapticsValue();
                          }
                        }}
                        onBlur={() => void commitHapticsValue()}
                      />
                      <div className="overview-range-ticks" aria-hidden="true">
                        {hapticsSliderTicks.map((value) => (
                          <span key={value} className={sliderTickClass(value, hapticsSliderMax)} />
                        ))}
                      </div>
                    </div>
                    <strong>{hapticsValue}%</strong>
                  </label>
                  <label className={`overview-slider-row ${(!connected || !speakerVolumeSupported || !snapshot.settings.speakerEnabled || audio.speakerVolumeCommitPending) ? 'disabled' : ''}`}>
                    <span>Speaker</span>
                    <div className="overview-range-control">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step={SPEAKER_VOLUME_STEP}
                        value={audio.speakerVolumeValue}
                        disabled={!connected || !speakerVolumeSupported || !snapshot.settings.speakerEnabled || audio.speakerVolumeCommitPending}
                        style={{ '--range-fill': `${audio.speakerVolumeValue}%` } as CSSProperties}
                        onPointerDown={() => {
                          audio.speakerVolumeEditingRef.current = true;
                        }}
                        onChange={(event) => audio.setSpeakerVolumeValue(snapSpeakerVolume(Number(event.currentTarget.value)))}
                        onPointerUp={() => void audio.commitSpeakerVolume()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            audio.speakerVolumeEditingRef.current = true;
                          }
                        }}
                        onKeyUp={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            void audio.commitSpeakerVolume();
                          }
                        }}
                        onBlur={() => void audio.commitSpeakerVolume()}
                      />
                      <div className="overview-range-ticks" aria-hidden="true">
                        {PERCENT_SLIDER_TICKS.map((value) => (
                          <span key={value} className={sliderTickClass(value, 100)} />
                        ))}
                      </div>
                    </div>
                    <strong>{audio.speakerVolumeValue}%</strong>
                  </label>
                  <label className={`overview-slider-row ${(!connected || !audio.duplexMicEnabled || audio.micVolumeCommitPending) ? 'disabled' : ''}`}>
                    <span>Mic</span>
                    <div className="overview-range-control">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step={MIC_VOLUME_STEP}
                        value={audio.micVolumeValue}
                        disabled={!connected || !audio.duplexMicEnabled || audio.micVolumeCommitPending}
                        style={{ '--range-fill': `${audio.micVolumeValue}%` } as CSSProperties}
                        onPointerDown={() => {
                          audio.micVolumeEditingRef.current = true;
                        }}
                        onChange={(event) => audio.setMicVolumeValue(snapMicVolume(Number(event.currentTarget.value)))}
                        onPointerUp={() => void audio.commitMicVolume()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            audio.micVolumeEditingRef.current = true;
                          }
                        }}
                        onKeyUp={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            void audio.commitMicVolume();
                          }
                        }}
                        onBlur={() => void audio.commitMicVolume()}
                      />
                      <div className="overview-range-ticks" aria-hidden="true">
                        {PERCENT_SLIDER_TICKS.map((value) => (
                          <span key={value} className={sliderTickClass(value, 100)} />
                        ))}
                      </div>
                    </div>
                    <strong>{audio.micVolumeValue}%</strong>
                  </label>
                  <label className={`overview-slider-row ${(!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled || lighting.lightbarCommitPending) ? 'disabled' : ''}`}>
                    <span>Lightbar</span>
                    <div className="overview-range-control">
                      <input
                        type="range"
                        min="0"
                        max={percentSliderMax}
                        step={LIGHTBAR_BRIGHTNESS_STEP}
                        value={lighting.lightbarBrightnessValue}
                        disabled={!connected || !lightbarSupported || !snapshot.settings.lightbarEnabled || lighting.lightbarCommitPending}
                        style={{ '--range-fill': `${(lighting.lightbarBrightnessValue / percentSliderMax) * 100}%` } as CSSProperties}
                        onPointerDown={() => {
                          lighting.lightbarBrightnessEditingRef.current = true;
                        }}
                        onChange={(event) => lighting.setLightbarBrightnessValue(snapLightbarBrightness(Number(event.currentTarget.value)))}
                        onPointerUp={() => void lighting.commitLightbar()}
                        onKeyDown={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            lighting.lightbarBrightnessEditingRef.current = true;
                          }
                        }}
                        onKeyUp={(event) => {
                          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                            void lighting.commitLightbar();
                          }
                        }}
                        onBlur={() => void lighting.commitLightbar()}
                      />
                      <div className="overview-range-ticks" aria-hidden="true">
                        {PERCENT_SLIDER_TICKS.map((value) => (
                          <span key={value} className={sliderTickClass(value, 100)} />
                        ))}
                      </div>
                    </div>
                    <strong>{lighting.lightbarBrightnessValue}%</strong>
                  </label>
                </div>
              </section>
            </div>

            <section className="overview-status-panel" aria-label="Active settings summary">
              <div className="overview-status-group">
                <div className="overview-status-heading">
                  <IconDeviceGamepad2 size={15} />
                  <span>Shortcuts</span>
                </div>
                <div className="overview-chip-row">
                  {overviewShortcutItems.length > 0 ? (
                    overviewShortcutItems.map((item) => (
                      <button
                        className="overview-chip overview-shortcut-chip active"
                        key={item.id}
                        type="button"
                        onClick={() => focusBridgeSettings(item.id === 'sleep' ? 'sleep-shortcut' : 'volume-shortcut')}
                      >
                        {item.label}
                        {item.id === 'sleep' ? (
                          <span className="settings-shortcut-tooltip shortcut-glyph-tooltip overview-shortcut-tooltip" role="tooltip">
                            <span>Put controller to sleep with</span>
                            <span className="shortcut-glyph-row" aria-label="PlayStation Home and Triangle">
                              <span className="shortcut-glyph-key">
                                <img src={psHomeGlyphUrl} alt="PlayStation Home" />
                              </span>
                              <span className="shortcut-plus" aria-hidden="true">+</span>
                              <span className="shortcut-glyph-key">
                                <img src={triangleGlyphUrl} alt="Triangle" />
                              </span>
                            </span>
                          </span>
                        ) : (
                          <span className="settings-shortcut-tooltip shortcut-glyph-tooltip overview-shortcut-tooltip" role="tooltip">
                            <span>Controller volume up/down with</span>
                            <span className="shortcut-glyph-row" aria-label="PlayStation Home and D-pad Up or D-pad Down">
                              <span className="shortcut-glyph-key">
                                <img src={psHomeGlyphUrl} alt="PlayStation Home" />
                              </span>
                              <span className="shortcut-plus" aria-hidden="true">+</span>
                              <span className="shortcut-glyph-pair">
                                <span className="shortcut-glyph-key">
                                  <img src={dpadUpGlyphUrl} alt="D-pad Up" />
                                </span>
                                <span className="shortcut-glyph-key">
                                  <img src={dpadDownGlyphUrl} alt="D-pad Down" />
                                </span>
                              </span>
                            </span>
                          </span>
                        )}
                      </button>
                    ))
                  ) : (
                    <span className="overview-chip muted">None enabled</span>
                  )}
                </div>
              </div>
              <div className="overview-status-group">
                <div className="overview-status-heading">
                  <IconBatteryEco size={15} />
                  <span>Power Saving</span>
                </div>
                <div className="overview-chip-row">
                  <button
                    className={`overview-chip ${snapshot.settings.controllerPowerSavingEnabled ? 'active success' : 'muted'}`}
                    type="button"
                    onClick={() => focusBridgeSettings('controller-power-saving')}
                  >
                    {overviewPowerSavingLabel}
                  </button>
                </div>
              </div>
              <div className="overview-status-group">
                <div className="overview-status-heading">
                  <Bell size={15} />
                  <span>Notifications</span>
                </div>
                <div className="overview-chip-row">
                  {overviewNotificationItems.length > 0 ? (
                    overviewNotificationItems.map((item) => (
                      <button
                        className="overview-chip active"
                        key={item.id}
                        type="button"
                        onClick={() => focusNotificationSettings(item.id)}
                      >
                        {item.label}
                      </button>
                    ))
                  ) : (
                    <button
                      className="overview-chip muted"
                      type="button"
                      onClick={() => focusNotificationSettings('all')}
                    >
                      Off
                    </button>
                  )}
                </div>
              </div>
            </section>
          </div>
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'devices'}>
            <LazyDevicesPage active={activeControlTab === 'devices'} controller={devices} pendingAction={pendingAction} />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'deadzones'}>
            <LazyStickDeadzonesPage
              active={activeControlTab === 'deadzones'}
              controller={stickDeadzones}
              stickInputPreview={snapshot.stickInputPreview}
              locked={!controllerControlsAvailable || pendingAction !== null}
            />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'haptics' || audioHapticsOpen}>
          <ControllerFeedbackPage
            active={activeControlTab === 'haptics' || audioHapticsOpen}
            audioHapticsOpen={audioHapticsOpen}
            feedback={feedback}
            lab={audioHapticsLab}
            snapshot={snapshot}
            connected={connected}
            controllerControlsAvailable={controllerControlsAvailable}
            pendingAction={pendingAction}
            onSettingsFocusRequest={focusBridgeSettings}
          />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'audio'}>
            <ControllerAudioPage
              active={activeControlTab === 'audio'}
              controller={audio}
              snapshot={snapshot}
              connected={connected}
              controllerControlsAvailable={controllerControlsAvailable}
              pendingAction={pendingAction}
            />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'triggers' || triggerLabOpen}>
            <AdaptiveTriggersPage
              active={activeControlTab === 'triggers' || triggerLabOpen}
              triggerLabOpen={triggerLabOpen}
              triggers={triggers}
              lab={triggerLab}
              snapshot={snapshot}
              connected={connected}
              controllerControlsAvailable={controllerControlsAvailable}
              pendingAction={pendingAction}
              onSettingsFocusRequest={focusBridgeSettings}
            />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'lighting'}>
            <ControllerLightingPage
              active={activeControlTab === 'lighting'}
              controller={lighting}
              snapshot={snapshot}
              connected={connected}
              controllerControlsAvailable={controllerControlsAvailable}
              pendingAction={pendingAction}
              onSettingsFocusRequest={focusBridgeSettings}
            />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'remapping'}>
            <LazyButtonRemappingPage
              active={activeControlTab === 'remapping'}
              controller={buttonRemapping}
              pendingAction={pendingAction}
            />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'chords'}>
            <LazyChordsPage
              active={activeControlTab === 'chords'}
              controller={chords}
              snapshot={snapshot}
              pendingAction={pendingAction}
            />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'system'}>
            <LazySystemPage
              active={activeControlTab === 'system'}
              controller={system}
              snapshot={snapshot}
              connected={connected}
              controllerConnected={controllerConnected}
              pendingAction={pendingAction}
              controllerPowerSavingActive={controllerPowerSavingActive}
              restoreBlocked={hapticsCommitPending || audio.speakerVolumeCommitPending || lighting.lightbarCommitPending}
            />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'settings'}>
            <LazySettingsPage
              active={activeControlTab === 'settings'}
              navigation={settingsNavigation}
              model={settingsPageModel}
              actions={settingsPageActions}
            />
          </DeferredPage>
        </>
      )}
      settingsSidebar={(
        <SettingsSidebar
          navigation={settingsNavigation}
          onBack={() => selectControlTab(settingsReturnTab)}
          header={<><ShellSidebarHeader />{sidebarDeviceNode}</>}
        />
      )}
      overlays={(
        <>

      {showKitsuneInputPromotion && !snapshot.settings.kitsuneInputPromotionDismissed && (
        <KitsuneInputPromotionDialog
          dismissing={pendingAction === 'dismiss-kitsune-input-promotion'}
          onClose={() => setShowKitsuneInputPromotion(false)}
          onPurchase={() => void window.bridge.openExternal(KITSUNE_INPUT_PURCHASE_URL)}
          onLearnMore={() => void window.bridge.openExternal(KITSUNE_INPUT_URL)}
          onDismissForever={() => {
            setShowKitsuneInputPromotion(false);
            void runAction(
              'dismiss-kitsune-input-promotion',
              () => window.bridge.setKitsuneInputPromotionDismissed(true)
            );
          }}
        />
      )}

      {kitsuneLaunchOffer.visible && (
        <KitsuneInputLaunchOffer
          onGet={() => {
            void window.bridge.openExternal(KITSUNE_INPUT_PURCHASE_URL);
            kitsuneLaunchOffer.close();
          }}
          onLearnMore={() => void window.bridge.openExternal(KITSUNE_INPUT_URL)}
          onClose={kitsuneLaunchOffer.close}
        />
      )}

      {startupTutorial.step !== 'done' && (
        <StartupTutorial
          step={startupTutorial.step}
          featureExampleActive={startupTutorial.featureExampleActive}
          supportCountdown={startupTutorial.supportCountdown}
          kofiBadgeUrl={kofiBadgeUrl}
          onFeatureExampleToggle={startupTutorial.toggleFeatureExample}
          onFeatureStepComplete={startupTutorial.completeFeatureStep}
          onSupport={() => void window.bridge.openExternal('https://ko-fi.com/sundaymoments')}
          onFinish={startupTutorial.finish}
        />
      )}

      <ChordFunctionDialog controller={chords} pendingAction={pendingAction} />

      <TriggerLabProfileDialog lab={triggerLab} pendingAction={pendingAction} />

      <ButtonRemappingProfileDialog controller={buttonRemapping} pendingAction={pendingAction} />

      <BootloaderConfirmationDialog
        confirmation={snapshot.bootloaderConfirmation}
        onCancel={() => void runQuietAction(() => window.bridge.cancelBootloaderConfirmation())}
      />



        </>
      )}
    />
  );
}
