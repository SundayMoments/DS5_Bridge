import { useMemo, useState } from 'react';
import {
  DEFAULT_CONTROLLER_PROFILE_ID,
  ackResultName,
  type HostPersonaMode,
  type MuteButtonMode,
  type MuteKeyboardBehavior,
  type PollingRateMode
} from '@shared/protocol';
import type { AppRuntime } from '../../composition/app-runtime';
import { HOST_PERSONA_OPTIONS } from '../../common/host-persona';
import { audioDebugReport, firmwareLogStatus } from './diagnostics';

export type ControllerProfileDialogMode = 'save' | 'rename' | 'delete';

const NO_COMMANDS_MESSAGE = 'No commands yet';

export interface SystemControllerInput {
  /** The System page is open and the window is visible, so diagnostics are on screen. */
  readonly active: boolean;
}

/**
 * The System page: controller profiles, the mute button, polling rate and host
 * persona, diagnostics, firmware log capture, and emergency device repair.
 */
export function useSystemController(runtime: AppRuntime, { active }: SystemControllerInput) {
  const { snapshot, connected, controllerConnected, pendingAction, setPendingAction, applySnapshot, runAction } = runtime;
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [controllerProfileDialogMode, setControllerProfileDialogMode] = useState<ControllerProfileDialogMode | null>(null);
  const [controllerProfileNameDraft, setControllerProfileNameDraft] = useState('');
  const [deviceCleanupConfirmVisible, setDeviceCleanupConfirmVisible] = useState(false);
  const [deviceCleanupMessage, setDeviceCleanupMessage] = useState<string | null>(null);
  const [deviceCleanupError, setDeviceCleanupError] = useState<string | null>(null);

  const personaTransitionActive = Boolean(snapshot?.personaTransition);
  const selectedControllerProfile = snapshot?.settings.controllerProfiles.find((profile) => (
    profile.id === snapshot.settings.selectedControllerProfileId
  ));
  const selectedControllerProfileId = selectedControllerProfile?.id ?? DEFAULT_CONTROLLER_PROFILE_ID;
  const controllerProfileOptions = useMemo<Array<[string, string]>>(() => (
    snapshot?.settings.controllerProfiles.map((profile) => [profile.name, profile.id]) ?? [['Default', DEFAULT_CONTROLLER_PROFILE_ID]]
  ), [snapshot?.settings.controllerProfiles]);
  const selectedControllerProfileIsDefault = selectedControllerProfileId === DEFAULT_CONTROLLER_PROFILE_ID;
  const canDeleteControllerProfile = !selectedControllerProfileIsDefault;
  const muteButtonActionsSupported = Boolean(snapshot?.status?.firmwareFlags.muteButtonActions);
  const pollingRateControlSupported = Boolean(snapshot?.status?.firmwareFlags.pollingRateControl);
  const hostPersonaControlSupported = Boolean(snapshot?.status?.firmwareFlags.hostPersonaControl);
  // A persona is how the bridge presents a connected controller; without one
  // there is nothing to switch, and the bridge would only reattach bridge-only.
  const hostPersonaSwitchAvailable = connected
    && controllerConnected
    && hostPersonaControlSupported
    && pendingAction === null
    && !personaTransitionActive;
  const supportedHostPersonaModes: HostPersonaMode[] = snapshot?.status?.supportedHostPersonaModes ?? ['dualsense'];
  const hostPersonaOptions = HOST_PERSONA_OPTIONS.filter(([, mode]) => (
    supportedHostPersonaModes.includes(mode) || snapshot?.settings.hostPersonaMode === mode
  ));
  const firmwareUpdateAvailable = Boolean(snapshot?.diagnostics.firmwareUpdateAvailable);
  const statusTone = personaTransitionActive
    ? 'warn'
    : connected
      ? 'good'
      : snapshot?.state === 'error' || snapshot?.state === 'incompatible'
        ? 'bad'
        : 'idle';
  const systemHealthTone = personaTransitionActive
    ? 'warn'
    : snapshot?.diagnostics.lastError
      ? 'bad'
      : firmwareUpdateAvailable
        ? 'warn'
        : connected && !controllerConnected
          ? 'info'
          : 'good';

  // Diagnostics text is built only while it is on screen.
  const diagnosticsVisible = active && showDiagnostics;
  const lastAck = snapshot?.diagnostics.lastAck;
  const ackLine = useMemo(() => {
    if (!diagnosticsVisible) return '';
    if (!lastAck) return NO_COMMANDS_MESSAGE;
    return `${ackResultName(lastAck.resultCode)} - seq ${lastAck.commandSequence}`;
  }, [diagnosticsVisible, lastAck]);
  const audioDebugLines = useMemo(() => (
    diagnosticsVisible ? audioDebugReport(snapshot) : ''
  ), [diagnosticsVisible, snapshot]);
  const audioEventLogText = useMemo(() => {
    if (!diagnosticsVisible) {
      return '';
    }
    const lines = snapshot?.diagnostics.audioDebugLogLines ?? [];
    return lines.length > 0 ? lines.join('\n') : 'No audio debug events captured yet.';
  }, [diagnosticsVisible, snapshot?.diagnostics.audioDebugLogLines]);
  const triggerTraceText = useMemo(() => {
    if (!diagnosticsVisible) {
      return '';
    }
    const lines = snapshot?.diagnostics.triggerTraceLines ?? [];
    return lines.length > 0 ? lines.join('\n') : 'No trigger trace events captured yet.';
  }, [diagnosticsVisible, snapshot?.diagnostics.triggerTraceLines]);
  const feedbackTraceText = useMemo(() => {
    if (!diagnosticsVisible) {
      return '';
    }
    const lines = snapshot?.diagnostics.feedbackTraceLines ?? [];
    return lines.length > 0 ? lines.join('\n') : 'No non-zero feedback trace events captured yet.';
  }, [diagnosticsVisible, snapshot?.diagnostics.feedbackTraceLines]);

  function selectControllerProfile(profileId: string) {
    void runAction('controller-profile', () => window.bridge.selectControllerProfile(profileId));
  }

  function renameControllerProfile() {
    if (!selectedControllerProfile || selectedControllerProfileIsDefault) {
      return;
    }
    setControllerProfileNameDraft(selectedControllerProfile.name);
    setControllerProfileDialogMode('rename');
  }

  function saveControllerProfile() {
    setControllerProfileNameDraft(`Custom Profile ${snapshot?.settings.controllerProfiles.length ?? 1}`);
    setControllerProfileDialogMode('save');
  }

  function deleteControllerProfile() {
    if (!selectedControllerProfile || !canDeleteControllerProfile) {
      return;
    }
    setControllerProfileDialogMode('delete');
  }

  function closeControllerProfileDialog() {
    setControllerProfileDialogMode(null);
    setControllerProfileNameDraft('');
  }

  function submitControllerProfileDialog() {
    if (!selectedControllerProfile && controllerProfileDialogMode !== 'save') {
      return;
    }
    if (controllerProfileDialogMode === 'save') {
      const nextName = controllerProfileNameDraft.trim();
      if (!nextName) {
        return;
      }
      closeControllerProfileDialog();
      void runAction('controller-save-profile', () => window.bridge.saveControllerProfile(nextName));
      return;
    }
    if (controllerProfileDialogMode === 'rename' && selectedControllerProfile && !selectedControllerProfileIsDefault) {
      const nextName = controllerProfileNameDraft.trim();
      if (!nextName || nextName === selectedControllerProfile.name) {
        closeControllerProfileDialog();
        return;
      }
      closeControllerProfileDialog();
      void runAction('controller-rename-profile', () => (
        window.bridge.renameControllerProfile(selectedControllerProfile.id, nextName)
      ));
      return;
    }
    if (controllerProfileDialogMode === 'delete' && selectedControllerProfile && canDeleteControllerProfile) {
      closeControllerProfileDialog();
      void runAction('controller-delete-profile', () => (
        window.bridge.deleteControllerProfile(selectedControllerProfile.id)
      ));
    }
  }

  function chooseFirmwareLogDirectory() {
    void runAction('firmware-log-directory', () => window.bridge.selectFirmwareLogDirectory());
  }

  function clearFirmwareLogDirectory() {
    void runAction('firmware-log-directory', () => window.bridge.clearFirmwareLogDirectory());
  }

  function openDeviceCleanupConfirm() {
    setDeviceCleanupMessage(null);
    setDeviceCleanupError(null);
    setDeviceCleanupConfirmVisible(true);
  }

  function closeDeviceCleanupConfirm() {
    if (pendingAction === 'device-cleanup') {
      return;
    }
    setDeviceCleanupConfirmVisible(false);
  }

  async function runWindowsDeviceCleanup() {
    if (!snapshot || pendingAction) {
      return;
    }
    setDeviceCleanupMessage(null);
    if (controllerConnected) {
      setDeviceCleanupError('Disconnect the controller from the bridge before running emergency repair.');
      return;
    }

    setPendingAction('device-cleanup');
    setDeviceCleanupError(null);
    try {
      const result = await window.bridge.repairWindowsDeviceCache();
      setDeviceCleanupMessage(result.message);
    } catch (error) {
      setDeviceCleanupError(error instanceof Error ? error.message : 'Emergency device repair could not run.');
    } finally {
      try {
        applySnapshot(await window.bridge.getStatus());
      } catch {
        // Keep the existing snapshot if status refresh fails after the repair process.
      }
      setPendingAction(null);
    }
  }

  function setMuteButtonAction(
    mode: MuteButtonMode,
    usage?: number,
    modifiers?: number,
    behavior?: MuteKeyboardBehavior,
    chordStarterEnabled?: boolean
  ) {
    if (!snapshot) {
      return;
    }
    const keyUsage = usage ?? snapshot.settings.muteKeyboardUsage;
    const keyModifiers = modifiers ?? snapshot.settings.muteKeyboardModifiers;
    const keyBehavior = behavior ?? snapshot.settings.muteKeyboardBehavior;
    const keyChordStarterEnabled = chordStarterEnabled ?? snapshot.settings.muteKeyboardChordStarterEnabled;
    void runAction('mute-button', () => (
      window.bridge.setMuteButtonAction(mode, keyUsage, keyModifiers, keyBehavior, keyChordStarterEnabled)
    ));
  }

  function setMuteModifier(bit: number, enabled: boolean) {
    if (!snapshot) {
      return;
    }
    const nextModifiers = enabled
      ? snapshot.settings.muteKeyboardModifiers | bit
      : snapshot.settings.muteKeyboardModifiers & ~bit;
    setMuteButtonAction(
      snapshot.settings.muteButtonMode,
      snapshot.settings.muteKeyboardUsage,
      nextModifiers,
      snapshot.settings.muteKeyboardBehavior,
      snapshot.settings.muteKeyboardChordStarterEnabled
    );
  }

  function setPollingRateMode(mode: PollingRateMode) {
    void runAction('polling-rate', () => window.bridge.setPollingRateMode(mode));
  }

  function setHostPersonaMode(mode: HostPersonaMode) {
    if (!hostPersonaSwitchAvailable) {
      return;
    }
    void runAction('host-persona', () => window.bridge.setHostPersonaMode(mode));
  }

  function restoreDefaults() {
    void runAction('restore', () => window.bridge.restoreDefaults());
  }

  return {
    showDiagnostics,
    setShowDiagnostics,
    controllerProfileDialogMode,
    controllerProfileNameDraft,
    setControllerProfileNameDraft,
    deviceCleanupConfirmVisible,
    deviceCleanupMessage,
    deviceCleanupError,
    selectedControllerProfile,
    selectedControllerProfileId,
    controllerProfileOptions,
    selectedControllerProfileIsDefault,
    canDeleteControllerProfile,
    muteButtonActionsSupported,
    pollingRateControlSupported,
    hostPersonaControlSupported,
    hostPersonaSwitchAvailable,
    supportedHostPersonaModes,
    hostPersonaOptions,
    personaTransitionActive,
    statusTone,
    systemHealthTone,
    diagnosticsVisible,
    ackText: ackLine,
    audioDebugText: audioDebugLines,
    audioEventLogText,
    triggerTraceText,
    feedbackTraceText,
    firmwareLogStatus: firmwareLogStatus(snapshot),
    selectControllerProfile,
    renameControllerProfile,
    saveControllerProfile,
    deleteControllerProfile,
    closeControllerProfileDialog,
    submitControllerProfileDialog,
    chooseFirmwareLogDirectory,
    clearFirmwareLogDirectory,
    openDeviceCleanupConfirm,
    closeDeviceCleanupConfirm,
    runWindowsDeviceCleanup,
    setMuteButtonAction,
    setMuteModifier,
    setPollingRateMode,
    setHostPersonaMode,
    restoreDefaults
  };
}

export type SystemController = ReturnType<typeof useSystemController>;
