import type { BridgeWorkspace, CompanionSettings } from '../shared/types';

// Each bridge keeps its own profiles and controller settings, as in Kitsune
// Input. The live settings always hold the selected bridge's workspace; every
// write stores them under that bridge's key, and selecting another bridge
// stores the outgoing workspace and loads the incoming one in the same write.

/** Every per-bridge setting. Anything else in CompanionSettings stays app-wide. */
export const BRIDGE_WORKSPACE_KEYS = [
  'leftStickRadialDeadzonePercent', 'rightStickRadialDeadzonePercent',
  'hapticsEnabled', 'hapticsGainPercent', 'feedbackBoostEnabled', 'hapticsBufferLength',
  'classicRumbleEnabled', 'classicRumbleGainPercent', 'classicRumbleV1Enabled',
  'adaptiveTriggersEnabled', 'triggerEffectIntensityPercent', 'triggerTestMode',
  'speakerEnabled', 'speakerVolumePercent', 'speakerGainLevel',
  'micVolumePercent', 'micMuted',
  'audioReactiveHapticsEnabled', 'audioReactiveHapticsSource', 'audioReactiveHapticsMode',
  'audioReactiveHapticsGainPercent', 'audioReactiveHapticsBassFocus', 'audioReactiveHapticsResponse',
  'audioReactiveHapticsAttack', 'audioReactiveHapticsRelease',
  'lightbarEnabled', 'lightbarColor', 'lightbarBrightnessPercent',
  'lightbarOverrideEnabled', 'lightbarRestoreEnabled',
  'muteButtonMode', 'muteKeyboardUsage', 'muteKeyboardModifiers', 'muteKeyboardBehavior',
  'muteKeyboardChordStarterEnabled', 'edgeProfileSwitchingBlocked',
  'ledEnabled', 'playerLedEnabled', 'idleDisconnectEnabled', 'idleDisconnectTimeoutMinutes',
  'usbSuspendDisconnectEnabled', 'wakeOnConnectEnabled',
  'sleepKeybindEnabled', 'speakerVolumeShortcutEnabled',
  'pollingRateMode', 'hostPersonaMode', 'duplexMicEnabled', 'controllerPowerSavingEnabled',
  'controllerBindings',
  'selectedControllerProfileId', 'controllerProfiles',
  'selectedButtonRemappingProfileId', 'buttonRemappingProfiles', 'buttonRemappingDraft',
  'chordFunctions', 'chordAssignments'
] as const satisfies readonly (keyof BridgeWorkspace)[];

const UNIQUE_ID_PATTERN = /^[0-9a-f]{16}$/;

/** A bridge's unique ID once its firmware has reported it, else its device path. */
export function bridgeWorkspaceKey(
  uniqueId: string | null | undefined,
  path: string | null | undefined
): string | null {
  const normalizedUniqueId = uniqueId?.trim().toLowerCase() ?? '';
  if (UNIQUE_ID_PATTERN.test(normalizedUniqueId)) return normalizedUniqueId;
  const normalizedPath = path?.trim().toLowerCase() ?? '';
  return normalizedPath ? `path:${normalizedPath}` : null;
}

export function isBridgeWorkspaceKey(key: string): boolean {
  return UNIQUE_ID_PATTERN.test(key) || (key.startsWith('path:') && key.length > 'path:'.length);
}

function selectedWorkspaceKey(settings: CompanionSettings): string | null {
  return bridgeWorkspaceKey(settings.selectedBridgeUniqueId, settings.selectedBridgePath);
}

export function captureBridgeWorkspace(settings: CompanionSettings): BridgeWorkspace {
  return structuredClone(Object.fromEntries(
    BRIDGE_WORKSPACE_KEYS.map((key) => [key, settings[key]])
  )) as BridgeWorkspace;
}

/** Stores the live settings as the selected bridge's workspace. */
export function saveSelectedBridgeWorkspace(settings: CompanionSettings): CompanionSettings {
  const key = selectedWorkspaceKey(settings);
  if (!key) return settings;
  return {
    ...settings,
    bridgeWorkspaces: { ...settings.bridgeWorkspaces, [key]: captureBridgeWorkspace(settings) }
  };
}

/**
 * Applies a change of selected bridge. The outgoing bridge keeps the live
 * settings as its workspace. The incoming bridge loads, in order: its stored
 * workspace; the live settings when only its key changed (its unique ID
 * arrived for the same path) or when no bridge was selected before, which is
 * how settings from before workspaces reach the bridge last used; otherwise
 * defaults. Workspace values sent with the selection are replaced.
 */
export function transitionBridgeWorkspace(
  previous: CompanionSettings,
  next: CompanionSettings,
  defaults: BridgeWorkspace
): CompanionSettings {
  const previousKey = selectedWorkspaceKey(previous);
  const nextKey = selectedWorkspaceKey(next);
  if (previousKey === nextKey) return next;
  const workspaces = { ...next.bridgeWorkspaces };
  if (previousKey) workspaces[previousKey] = captureBridgeWorkspace(previous);
  if (!nextKey) return { ...next, bridgeWorkspaces: workspaces };
  const samePath = Boolean(previous.selectedBridgePath && next.selectedBridgePath
    && previous.selectedBridgePath.toLowerCase() === next.selectedBridgePath.toLowerCase());
  const incoming = workspaces[nextKey]
    ?? (!previousKey || samePath ? captureBridgeWorkspace(next) : defaults);
  return {
    ...next,
    ...structuredClone(incoming),
    bridgeWorkspaces: { ...workspaces, [nextKey]: structuredClone(incoming) }
  };
}
