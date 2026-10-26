import { useEffect, useMemo, useState } from 'react';
import type {
  AudioReactiveHapticsAttack,
  AudioReactiveHapticsBassFocus,
  AudioReactiveHapticsConfig,
  AudioReactiveHapticsMode,
  AudioReactiveHapticsRelease,
  AudioReactiveHapticsResponse
} from '@shared/protocol';
import type { AudioHapticsSession, BridgeSnapshot } from '@shared/types';
import type { AppRuntime } from '../../composition/app-runtime';
import { useDocumentVisible } from '../../common/use-document-visible';
import {
  audioHapticsSessionKey,
  audioHapticsSourceDisplayName,
  audioHapticsSourceFromSession,
  audioHapticsSourceKey
} from './model';

/** How often the app audio sessions are listed again while the lab is open. */
export const AUDIO_HAPTICS_SESSION_REFRESH_MS = 15000;

export interface AudioHapticsLabInput {
  /** The Audio Haptics page is open. */
  readonly active: boolean;
}

/**
 * Audio Haptics: turns system or one app's audio into haptics. Lists the app
 * audio sessions while the page is open and the window is visible, and writes
 * each setting to the bridge as one config change.
 */
export function useAudioHapticsLabController(runtime: AppRuntime, { active }: AudioHapticsLabInput) {
  const { snapshot, connected, controllerConnected, pendingAction, applySnapshot } = runtime;
  const windowVisible = useDocumentVisible();
  const [sessions, setSessions] = useState<AudioHapticsSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [commitPending, setCommitPending] = useState(false);

  const source = snapshot?.settings.audioReactiveHapticsSource ?? 'system-audio';
  const sourceKey = audioHapticsSourceKey(source);
  const hapticsEnabled = Boolean(snapshot?.settings.hapticsEnabled);
  const enabled = Boolean(snapshot?.settings.audioReactiveHapticsEnabled);
  const supported = Boolean(snapshot?.status?.firmwareFlags.audioReactiveHapticsControl);

  useEffect(() => {
    const controllerAudioReady = connected && controllerConnected;
    if (!active || !controllerAudioReady) {
      setSessions([]);
      setSessionsLoading(false);
      return undefined;
    }
    if (!windowVisible) {
      // Keep the listed sessions; they refresh when the window is shown again.
      return undefined;
    }

    let cancelled = false;
    let refreshInFlight = false;
    async function refreshSessions() {
      if (refreshInFlight) {
        return;
      }
      refreshInFlight = true;
      setSessionsLoading(true);
      try {
        const listed = await window.bridge.listAudioHapticsSessions();
        if (!cancelled) {
          setSessions(listed);
        }
      } catch {
        if (!cancelled) {
          setSessions([]);
        }
      } finally {
        refreshInFlight = false;
        if (!cancelled) {
          setSessionsLoading(false);
        }
      }
    }

    void refreshSessions();
    const interval = window.setInterval(refreshSessions, AUDIO_HAPTICS_SESSION_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [active, sourceKey, connected, controllerConnected, windowVisible]);

  const sessionByKey = useMemo(() => {
    const byKey = new Map<string, AudioHapticsSession>();
    for (const session of sessions) {
      byKey.set(audioHapticsSessionKey(session), session);
    }
    return byKey;
  }, [sessions]);
  const selectedSourceDisplayName = sessionByKey.get(sourceKey)?.displayName
    ?? audioHapticsSourceDisplayName(source);
  const sourceOptions = useMemo<Array<[string, string]>>(() => {
    const options: Array<[string, string]> = [['System', 'system-audio']];
    for (const session of sessions) {
      options.push([session.displayName, audioHapticsSessionKey(session)]);
    }
    if (sourceKey !== 'system-audio' && !sessionByKey.has(sourceKey)) {
      options.push([`${audioHapticsSourceDisplayName(source)} unavailable`, sourceKey]);
    }
    return options;
  }, [sessionByKey, sessions, source, sourceKey]);

  const routeSupported = supported;
  const blocked = !connected || !supported || !routeSupported || !hapticsEnabled;
  const controlDisabled = !connected || !supported || pendingAction !== null || commitPending;
  const configDisabled = blocked || pendingAction !== null || commitPending || !enabled;
  const statusLabel = !connected
    ? 'Unavailable'
    : !supported
      ? 'Update Firmware'
      : !hapticsEnabled
        ? 'Haptics Off'
        : enabled
          ? 'Ready'
          : 'Off';
  const statusTone = enabled && hapticsEnabled && routeSupported
    ? 'good'
    : connected && (!routeSupported || !hapticsEnabled)
      ? 'warn'
      : 'idle';
  const overrideMode = snapshot?.settings.audioReactiveHapticsMode === 'replace';
  const modeBadgeLabel = enabled ? (overrideMode ? 'Override' : 'Mixed') : null;
  const modeTooltip = overrideMode
    ? 'Audio haptics are replacing native haptic output.'
    : 'Audio haptics are mixed with native haptic output.';

  async function commitConfig(config: Partial<AudioReactiveHapticsConfig>): Promise<BridgeSnapshot | null> {
    if (!snapshot || snapshot.state !== 'connected' || !supported || !hapticsEnabled || commitPending) {
      return null;
    }

    setCommitPending(true);
    try {
      const next = await window.bridge.setAudioReactiveHapticsConfig(config);
      applySnapshot(next);
      return next;
    } catch {
      const next = await window.bridge.getStatus();
      applySnapshot(next);
      return next;
    } finally {
      setCommitPending(false);
    }
  }

  async function toggleEnabled() {
    if (!snapshot || snapshot.state !== 'connected' || !supported || pendingAction !== null || commitPending) {
      return;
    }

    const nextEnabled = !snapshot.settings.audioReactiveHapticsEnabled;
    setCommitPending(true);
    try {
      // Audio haptics drive the haptics output, so turning them on turns haptics on.
      if (nextEnabled && !snapshot.settings.hapticsEnabled) {
        await window.bridge.setHapticsEnabled(true);
      }
      const next = await window.bridge.setAudioReactiveHapticsConfig({ enabled: nextEnabled });
      applySnapshot(next);
    } catch {
      const next = await window.bridge.getStatus();
      applySnapshot(next);
    } finally {
      setCommitPending(false);
    }
  }

  function setMode(mode: AudioReactiveHapticsMode) {
    if (!snapshot || mode === snapshot.settings.audioReactiveHapticsMode) return;
    void commitConfig({ mode });
  }

  function setSourceValue(value: string) {
    if (!snapshot || value === sourceKey) return;
    if (value === 'system-audio') {
      void commitConfig({ source: 'system-audio' });
      return;
    }
    const session = sessionByKey.get(value);
    if (!session) {
      return;
    }
    void commitConfig({ source: audioHapticsSourceFromSession(session) });
  }

  function setBassFocus(bassFocus: AudioReactiveHapticsBassFocus) {
    if (!snapshot || bassFocus === snapshot.settings.audioReactiveHapticsBassFocus) return;
    void commitConfig({ bassFocus });
  }

  function setResponse(response: AudioReactiveHapticsResponse) {
    if (!snapshot || response === snapshot.settings.audioReactiveHapticsResponse) return;
    void commitConfig({ response });
  }

  function setAttack(attack: AudioReactiveHapticsAttack) {
    if (!snapshot || attack === snapshot.settings.audioReactiveHapticsAttack) return;
    void commitConfig({ attack });
  }

  function setRelease(release: AudioReactiveHapticsRelease) {
    if (!snapshot || release === snapshot.settings.audioReactiveHapticsRelease) return;
    void commitConfig({ release });
  }

  return {
    sourceKey,
    enabled,
    sessionsLoading,
    sessionByKey,
    selectedSourceDisplayName,
    sourceOptions,
    controlDisabled,
    configDisabled,
    statusLabel,
    statusTone,
    overrideMode,
    modeBadgeLabel,
    modeTooltip,
    toggleEnabled,
    setMode,
    setSourceValue,
    setBassFocus,
    setResponse,
    setAttack,
    setRelease
  };
}

export type AudioHapticsLabController = ReturnType<typeof useAudioHapticsLabController>;
