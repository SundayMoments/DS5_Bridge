import { useState } from 'react';
import controllerImage from '../../../assets/controllers/dualsense-edge-front.svg';
import { DEFAULT_UI_THEME_PRESET, UI_THEME_KOFI_BADGES } from './ui-themes';
import { useDocumentVisible } from './common/use-document-visible';
import { DeferredPage } from './common/DeferredPage';
import type { AppRuntime } from './composition/app-runtime';
import { useAppAppearance } from './composition/use-app-appearance';
import { useBridgeSnapshots } from './composition/use-bridge-snapshots';
// Pages that load on first visit come from composition/lazy-pages; their
// controllers and dialogs are imported from their own modules so the pages stay
// out of the main chunk.
import {
  LazyButtonRemappingPage,
  LazyChordsPage,
  LazyDevicesPage,
  LazySettingsPage,
  LazyStickDeadzonesPage,
  LazySystemPage
} from './composition/lazy-pages';
import { MainAppShell } from './features/shell/MainAppShell';
import { ShellBridgeSelector } from './features/shell/ShellBridgeSelector';
import { ShellNotifications, type ShellNotificationFocusTarget } from './features/shell/ShellNotifications';
import { ShellSidebarDevice } from './features/shell/ShellSidebarDevice';
import { ShellSidebarHeader } from './features/shell/ShellSidebarHeader';
import { ShellSupportBadge } from './features/shell/ShellSupportBadge';
import { CONTROL_TAB_DEFINITIONS, controlPanelIdFor, type ControlTab } from './features/shell/control-tabs';
import { bridgeSelectorModel, sidebarDevicePresentation } from './features/shell/sidebar-device';
import { useNotificationsMenu } from './features/shell/use-notifications-menu';
import { SettingsSidebar } from './features/settings/SettingsSidebar';
import type { SettingsFocusTarget } from './features/settings/settings-navigation';
import { useSettingsNavigation } from './features/settings/use-settings-navigation';
import { useSettingsPage } from './features/settings/use-settings-page';
import {
  STARTING_BRIDGE_LABEL,
  StartupPlaceholderPage,
  StartupTutorial,
  startingDevicePresentation,
  useStartupTutorial
} from './features/startup';
import { OverviewPage, useOverviewController } from './features/overview';
import { useStickDeadzonesController } from './features/stick-deadzones/use-stick-deadzones-controller';
import { useDevicesController } from './features/devices/use-devices-controller';
import { ControllerLightingPage, useControllerLightingController } from './features/controller-lighting';
import { ControllerAudioPage, useControllerAudioController } from './features/controller-audio';
import { AdaptiveTriggersPage, useAdaptiveTriggersController } from './features/adaptive-triggers';
import { TriggerLabProfileDialog, useTriggerLabController } from './features/trigger-lab';
import { ButtonRemappingProfileDialog } from './features/button-remapping/ButtonRemappingProfileDialog';
import { useButtonRemappingController } from './features/button-remapping/use-button-remapping-controller';
import { ChordFunctionDialog } from './features/chords/ChordFunctionDialog';
import { useChordsController } from './features/chords/use-chords-controller';
import { BootloaderConfirmationDialog } from './features/bootloader-confirmation';
import { ControllerFeedbackPage, useControllerFeedbackController } from './features/controller-feedback';
import { useAudioHapticsLabController } from './features/audio-haptics-lab';
import { useSystemController } from './features/system-controls/use-system-controller';
import {
  KITSUNE_INPUT_PURCHASE_URL,
  KITSUNE_INPUT_URL,
  KitsuneInputLaunchOffer,
  KitsuneInputPromotionDialog,
  KitsunePromotionBanner,
  useKitsuneLaunchOffer
} from './features/kitsune-promotion';
import type { BridgeSnapshot } from '../shared/types';

const SUPPORT_URL = 'https://ko-fi.com/sundaymoments';

export function App() {
  const [snapshot, setSnapshot] = useState<BridgeSnapshot | null>(null);
  const [activeControlTab, setActiveControlTab] = useState<ControlTab>('overview');
  const [settingsReturnTab, setSettingsReturnTab] = useState<ControlTab>('overview');
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [showKitsuneInputPromotion, setShowKitsuneInputPromotion] = useState(false);
  const triggerLabOpen = activeControlTab === 'trigger-lab';
  const audioHapticsOpen = activeControlTab === 'audio-haptics';
  // Hidden or minimized, the app stops rendering snapshots and pauses its polling.
  const windowVisible = useDocumentVisible();
  const appearance = useAppAppearance(snapshot);
  const startupTutorial = useStartupTutorial();

  const connected = snapshot?.state === 'connected';
  const controllerConnected = Boolean(snapshot?.status?.controllerConnected);
  const controllerControlsAvailable = connected && controllerConnected;

  async function runAction(label: string, action: () => Promise<BridgeSnapshot>) {
    if (!snapshot || pendingAction) {
      return;
    }
    setPendingAction(label);
    try {
      setSnapshot(await action());
    } catch {
      setSnapshot(await window.bridge.getStatus());
    } finally {
      setPendingAction(null);
    }
  }

  async function runQuietAction(action: () => Promise<BridgeSnapshot>) {
    if (!snapshot) {
      return;
    }
    try {
      setSnapshot(await action());
    } catch {
      setSnapshot(await window.bridge.getStatus());
    }
  }

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
  const chords = useChordsController(runtime, {
    active: activeControlTab === 'chords',
    showDualSenseEdgeRemapButtons: buttonRemapping.showDualSenseEdgeRemapButtons
  });
  const feedback = useControllerFeedbackController(runtime, {
    speakerVolumeCommitPending: audio.speakerVolumeCommitPending,
    lightbarCommitPending: lighting.lightbarCommitPending
  });
  const audioHapticsLab = useAudioHapticsLabController(runtime, { active: audioHapticsOpen });
  const system = useSystemController(runtime, { active: activeControlTab === 'system' && windowVisible });
  const overview = useOverviewController(runtime);
  const notifications = useNotificationsMenu(runtime);
  const settingsPage = useSettingsPage(runtime, { notifications });
  const settingsNavigation = useSettingsNavigation({ focusTarget: settingsPage.focusTarget });
  const { windowDragging, beginWindowDrag } = useBridgeSnapshots(applySnapshot);
  const kitsuneLaunchOffer = useKitsuneLaunchOffer({
    eligible: Boolean(snapshot) && !snapshot?.settings.kitsuneInputLaunchOfferShown,
    blocked: startupTutorial.step !== 'done'
      || Boolean(snapshot?.bootloaderConfirmation)
      || showKitsuneInputPromotion,
    markShown: () => void runQuietAction(() => window.bridge.markKitsuneInputLaunchOfferShown())
  });

  function applySnapshot(next: BridgeSnapshot) {
    setSnapshot(next);
    buttonRemapping.syncSnapshot(next);
    feedback.syncSnapshot(next);
    stickDeadzones.syncSnapshot(next);
    audio.syncSnapshot(next);
    lighting.syncSnapshot(next);
    triggers.syncSnapshot(next);
  }

  function selectControlTab(tab: ControlTab) {
    if (tab === activeControlTab) {
      return;
    }
    if (tab === 'settings') {
      setSettingsReturnTab(activeControlTab);
    }
    lighting.closeCustomColorPicker();
    notifications.close();
    devices.closeMenu();
    setActiveControlTab(tab);
  }

  /** Opens Settings with one setting highlighted, for links from Overview. */
  function focusBridgeSettings(target: SettingsFocusTarget) {
    notifications.close();
    notifications.clearFocus();
    selectControlTab('settings');
    settingsPage.requestFocus(target);
  }

  function focusNotificationSettings(target: ShellNotificationFocusTarget) {
    settingsPage.clearFocus();
    notifications.focus(target);
  }

  // The shell renders at once; until the first snapshot arrives the device card
  // and page area show placeholders instead of a full-window splash screen.
  if (!snapshot || !settingsPage.model) {
    return (
      <MainAppShell
        className="shell starting"
        theme={appearance.theme}
        textScale={appearance.textScale}
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

  const kofiBadgeUrl = UI_THEME_KOFI_BADGES[appearance.theme] ?? UI_THEME_KOFI_BADGES[DEFAULT_UI_THEME_PRESET];
  const sidebarDeviceNode = (
    <ShellSidebarDevice
      device={sidebarDevicePresentation(snapshot, devices.model.cards, controllerImage)}
      onOpenDevices={() => selectControlTab('devices')}
      bridgeSelector={(
        <ShellBridgeSelector
          {...bridgeSelectorModel(snapshot)}
          busy={pendingAction !== null}
          onSelect={(devicePath) => void runAction('bridge-select', () => window.bridge.selectBridge(devicePath))}
          onRefresh={() => runAction('bridge-refresh', () => window.bridge.refreshBridgeDevices())}
          onRename={(uniqueId, name) => void runAction('bridge-rename', () => window.bridge.setBridgeLabel(uniqueId, name))}
        />
      )}
    />
  );
  const shellClassName = [
    'shell',
    windowDragging ? 'window-dragging' : '',
    controllerControlsAvailable ? '' : 'controller-unavailable'
  ].filter(Boolean).join(' ');

  return (
    <MainAppShell
      className={shellClassName}
      theme={appearance.theme}
      textScale={appearance.textScale}
      activeTab={activeControlTab}
      panelIdForTab={controlPanelIdFor}
      onSelectTab={selectControlTab}
      onWindowChromeMouseDown={notifications.close}
      onBeginWindowDrag={beginWindowDrag}
      onMinimize={() => void window.bridge.minimizeWindow()}
      onHide={() => void window.bridge.hideWindow()}
      windowBarCenter={snapshot.settings.kitsuneInputPromotionDismissed ? null : (
        <KitsunePromotionBanner
          expanded={showKitsuneInputPromotion}
          onOpen={() => {
            notifications.close();
            setShowKitsuneInputPromotion(true);
          }}
        />
      )}
      windowBarTools={(
        <>
          <ShellSupportBadge badgeUrl={kofiBadgeUrl} onOpen={() => void window.bridge.openExternal(SUPPORT_URL)} />
          <ShellNotifications
            rootRef={notifications.rootRef}
            notifications={notifications.model}
            onToggle={notifications.toggle}
            onToggleController={notifications.toggleControllerNotifications}
            onToggleLowBattery={notifications.toggleLowBatteryNotifications}
            onTest={notifications.testNotification}
          />
        </>
      )}
      sidebarDevice={sidebarDeviceNode}
      pages={(
        <>
          {/* Each page mounts on its first visit; hidden pages skip re-rendering on new snapshots. */}
          <DeferredPage active={activeControlTab === 'overview'}>
            <OverviewPage
              active={activeControlTab === 'overview'}
              snapshot={snapshot}
              connected={connected}
              pendingAction={pendingAction}
              overview={overview}
              feedback={feedback}
              audio={audio}
              lighting={lighting}
              system={system}
              onOpenPage={selectControlTab}
              onSettingsFocusRequest={focusBridgeSettings}
              onNotificationFocusRequest={focusNotificationSettings}
            />
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
              controllerPowerSavingActive={feedback.controllerPowerSavingActive}
              restoreBlocked={feedback.hapticsCommitPending || audio.speakerVolumeCommitPending || lighting.lightbarCommitPending}
            />
          </DeferredPage>

          <DeferredPage active={activeControlTab === 'settings'}>
            <LazySettingsPage
              active={activeControlTab === 'settings'}
              navigation={settingsNavigation}
              model={settingsPage.model}
              actions={settingsPage.actions}
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
                void runAction('dismiss-kitsune-input-promotion', () => window.bridge.setKitsuneInputPromotionDismissed(true));
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
              onSupport={() => void window.bridge.openExternal(SUPPORT_URL)}
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
