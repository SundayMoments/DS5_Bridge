import { useEffect, useRef, useState } from 'react';
import type { WakeOnLanApi, WakeOnLanMetadata, WakeOnLanTarget } from '@shared/wake-on-lan-types';
import { WOL_WORLDWIDE_COUNTRY, isRetiredWakeOnLanCountry } from '@shared/wake-on-lan-protocol';
import { isWakeOnLanConnectionFailure } from '@shared/wake-on-lan-result';
import {
  EMPTY_WAKE_ON_LAN_DRAFT, preferredWakeOnLanTarget, validateWakeOnLanDraft, wakeOnLanFailureMessage,
  type WakeOnLanDraft, type WakeOnLanDraftIssue
} from './wake-on-lan-model';

// Ported from Kitsune Input's Wake-on-LAN settings hook, for the one bridge
// DS5 Bridge is connected to.

/** Timer functions, injectable so tests can step polling by hand. */
export interface WakeOnLanTimers {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(id: number): void;
}

export const WINDOW_TIMERS: WakeOnLanTimers = {
  setTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearTimeout: (id) => window.clearTimeout(id)
};

export interface WakeOnLanSettingsOptions {
  /** The Settings page is on screen. */
  active: boolean;
  /** A bridge is connected; DS5 Bridge talks to one bridge at a time. */
  connected: boolean;
  /** Changes when the bridge connects, disconnects or reconnects. */
  connectionKey?: string;
  /** Live from the snapshot: the bridge refuses changes while a controller is connected. */
  controllerConnected: boolean;
  api: WakeOnLanApi;
  timers?: WakeOnLanTimers;
}

interface WakeOperation {
  bridgeId: string; generation: number; canceled: boolean; settled: boolean; cleanupPolls: number;
  kind: 'test' | 'saved' | 'cleanup';
}

// The test proves the bridge joined Wi-Fi and submitted packets, not that the router delivers them here.
const WAKE_SETTINGS_MESSAGES = {
  saved: 'Network saved. The test can’t confirm that your router delivers the wake packet to this PC, so test sleep and shutdown separately.',
  // Saving never enables wake. Say so, or a saved network reads as a finished setup.
  savedDisabled: 'Network saved. The test can’t confirm that your router delivers the wake packet to this PC. Turn on Wake-on-LAN, then test sleep and shutdown separately.',
  forgotten: 'Saved wake network removed.'
};

/** A record saved with Finland or Ireland: it can be turned off or replaced, never enabled. */
export function retiredRegion(value: WakeOnLanMetadata | null | undefined): boolean {
  return Boolean(value?.configured && isRetiredWakeOnLanCountry(value.country));
}

export function useWakeOnLanSettings(options: WakeOnLanSettingsOptions) {
  const { active, connected, connectionKey, api } = options;
  const timers = options.timers ?? WINDOW_TIMERS;
  const [metadata, setMetadata] = useState<WakeOnLanMetadata | null>(null);
  const [targets, setTargets] = useState<WakeOnLanTarget[]>([]);
  const [draft, setDraft] = useState<WakeOnLanDraft>(EMPTY_WAKE_ON_LAN_DRAFT);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<WakeOnLanDraftIssue | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [targetsUnavailable, setTargetsUnavailable] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [refreshingTargets, setRefreshingTargets] = useState(false);
  const generation = useRef(0);
  const operation = useRef<WakeOperation | null>(null);
  const pollTimer = useRef<number | null>(null);
  const [recoveryAttempts, setRecoveryAttempts] = useState(0);
  const latest = useRef(options);
  latest.current = options;

  function stopPolling() {
    if (pollTimer.current !== null) timers.clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }

  function current(candidate: WakeOperation): boolean {
    return operation.current === candidate && candidate.generation === generation.current;
  }

  function finish(candidate: WakeOperation) {
    if (!current(candidate)) return;
    stopPolling();
    operation.current = null;
    setBusy(false);
    setCanceling(false);
  }

  function applyMetadata(value: WakeOnLanMetadata, updateDraft = false) {
    setMetadata(value);
    if (updateDraft) setValidation(null);
    // A retired saved region must be chosen again before the next test.
    if (updateDraft) setDraft({
      ssid: value.ssid, password: '',
      country: value.country ? (value.availableCountries.includes(value.country) ? value.country : '')
        : value.availableCountries.includes(WOL_WORLDWIDE_COUNTRY) ? WOL_WORLDWIDE_COUNTRY : '',
      targetMac: value.targetMac
    });
  }

  function connectionLost(candidate: WakeOperation, failure: unknown) {
    if (!current(candidate)) return;
    setNeedsRefresh(true);
    setValidation(null);
    setError(wakeOnLanFailureMessage(failure));
    setMessage(null);
    setDraft((value) => ({ ...value, password: '' }));
    finish(candidate);
  }

  function watchCleanup(value: WakeOnLanMetadata) {
    if (!value.busy) return;
    const pending: WakeOperation = { bridgeId: value.bridgeId, generation: generation.current,
      canceled: false, settled: true, cleanupPolls: 60, kind: 'cleanup' };
    operation.current = pending;
    setBusy(true);
    poll(pending);
  }

  async function refresh(automatic = false) {
    if (!latest.current.active || !latest.current.connected || loading || operation.current) return;
    const epoch = generation.current;
    if (!automatic) setRecoveryAttempts(0);
    setLoading(true);
    // A manual refresh, or any refresh after adapter discovery failed, reads the adapter list again.
    // Only the manual one forces discovery; a failed discovery is retried by the cached read anyway.
    const adapters = !automatic || targetsUnavailable
      ? api.getWakeOnLanTargets(!automatic).then((value) => value, () => null) : null;
    try {
      const value = await api.getWakeOnLan();
      if (epoch !== generation.current) return;
      if (!value.bridgeId) throw new Error('No bridge');
      applyMetadata(value, !automatic || needsRefresh || !metadata);
      setNeedsRefresh(false);
      setError(null);
      setMessage(null);
      watchCleanup(value);
      const list = adapters ? await adapters : undefined;
      if (epoch !== generation.current || list === undefined) return;
      setTargetsUnavailable(list === null);
      if (list) {
        setTargets(list);
        const preferred = value.targetMac ? undefined : preferredWakeOnLanTarget(list);
        if (preferred) setDraft((draftValue) => draftValue.targetMac ? draftValue : { ...draftValue, targetMac: preferred.mac });
      }
    } catch (failure) {
      if (epoch !== generation.current) return;
      setNeedsRefresh(true);
      setError(isWakeOnLanConnectionFailure(failure) ? wakeOnLanFailureMessage(failure)
        : 'Could not read wake settings. Refresh to try again.');
    } finally { if (epoch === generation.current) setLoading(false); }
  }

  /** Rediscovers this PC's adapters without touching the draft's network, password or region. */
  async function refreshTargets() {
    if (!latest.current.active || !latest.current.connected || loading || refreshingTargets) return;
    const epoch = generation.current;
    setRefreshingTargets(true);
    try {
      const list = await api.getWakeOnLanTargets(true).then((value) => value, () => null);
      if (epoch !== generation.current) return;
      setTargetsUnavailable(list === null);
      if (list) {
        setTargets(list);
        const preferred = metadata?.targetMac ? undefined : preferredWakeOnLanTarget(list);
        if (preferred) setDraft((value) => value.targetMac ? value : { ...value, targetMac: preferred.mac });
      }
    } finally { if (epoch === generation.current) setRefreshingTargets(false); }
  }

  useEffect(() => {
    const epoch = ++generation.current;
    setRecoveryAttempts(0);
    setRefreshingTargets(false);
    setMetadata(null);
    setTargets([]);
    setDraft(EMPTY_WAKE_ON_LAN_DRAFT);
    setError(null);
    setValidation(null);
    setMessage(null);
    setBusy(false);
    setCanceling(false);
    setTargetsUnavailable(false);
    setNeedsRefresh(false);
    setLoading(active && connected);
    if (active && connected) {
      // Entering Settings reuses the adapter cache; Refresh adapters and every save or enable decision rediscover.
      void Promise.allSettled([api.getWakeOnLan(), api.getWakeOnLanTargets()])
        .then(([status, adapters]) => {
          if (generation.current !== epoch) return;
          setLoading(false);
          if (adapters.status === 'fulfilled') setTargets(adapters.value);
          else setTargetsUnavailable(true);
          if (status.status !== 'fulfilled' || !status.value.bridgeId) {
            setNeedsRefresh(true);
            const connectionUnavailable = status.status === 'rejected' && isWakeOnLanConnectionFailure(status.reason);
            setError(connectionUnavailable
              ? wakeOnLanFailureMessage(status.reason) : 'Could not read wake settings. Refresh to try again.');
            return;
          }
          applyMetadata(status.value, true);
          watchCleanup(status.value);
          if (adapters.status === 'fulfilled') {
            const preferred = preferredWakeOnLanTarget(adapters.value);
            if (!status.value.targetMac && preferred) {
              setDraft((value) => ({ ...value, targetMac: preferred.mac }));
            }
          }
        });
    }
    return () => {
      generation.current++;
      stopPolling();
      const pending = operation.current;
      operation.current = null;
      if (pending) void api.cancelWakeOnLan().catch(() => undefined);
    };
  }, [active, connected, connectionKey, api, timers]);

  useEffect(() => {
    if (!active || !connected || loading || busy || !needsRefresh || recoveryAttempts >= 5) return;
    // Read-only reconciliation after reconnects. Never replay a toggle, erase, or enrollment.
    const timer = timers.setTimeout(() => {
      setRecoveryAttempts((attempts) => attempts + 1);
      void refresh(true);
    }, 1_000);
    return () => timers.clearTimeout(timer);
  }, [active, connected, connectionKey, loading, busy, needsRefresh, recoveryAttempts, api, timers]);

  function poll(candidate: WakeOperation) {
    if (!current(candidate)) return;
    pollTimer.current = timers.setTimeout(() => {
      pollTimer.current = null;
      if (!current(candidate)) return;
      const cleanupRead = candidate.settled;
      void api.getWakeOnLan().then((value) => {
        if (!current(candidate) || value.bridgeId !== candidate.bridgeId) return;
        applyMetadata(value);
        if (cleanupRead && !value.busy) finish(candidate);
      }).catch((failure: unknown) => {
        if (isWakeOnLanConnectionFailure(failure)) connectionLost(candidate, failure);
      }).finally(() => {
        if (!current(candidate)) return;
        if (cleanupRead && --candidate.cleanupPolls <= 0) {
          setNeedsRefresh(true);
          setError('Could not read wake settings. Refresh to try again.');
          finish(candidate);
        } else poll(candidate);
      });
    }, 500);
  }

  async function run(
    kind: 'test' | 'saved',
    action: () => Promise<WakeOnLanMetadata>,
    successMessage: (result: WakeOnLanMetadata) => string | null,
    updateDraft = false,
    // Only an enable of a retired-region record reads InvalidConfig as "choose another region".
    retiredEnable = false
  ) {
    if (!latest.current.active || !latest.current.connected || latest.current.controllerConnected || loading || needsRefresh
      || operation.current || !metadata?.supported || metadata.busy) return;
    const candidate: WakeOperation = {
      bridgeId: metadata.bridgeId, generation: generation.current, canceled: false,
      settled: false, cleanupPolls: 60, kind
    };
    operation.current = candidate;
    setBusy(true);
    setError(null);
    setValidation(null);
    setMessage(null);
    poll(candidate);
    let cleanupPending = true;
    try {
      const result = await action();
      if (!current(candidate)) return;
      if (result.bridgeId !== candidate.bridgeId) throw new Error('Wrong bridge');
      applyMetadata(result, updateDraft);
      cleanupPending = result.busy;
      if (candidate.canceled) setMessage('Operation canceled.');
      else if (result.error || result.stage === 'failed' || result.stage === 'radio-recovery-required') {
        setError(wakeOnLanFailureMessage(result.error, null, retiredEnable && retiredRegion(result)));
      } else setMessage(successMessage(result));
    } catch (failure) {
      if (current(candidate)) {
        if (isWakeOnLanConnectionFailure(failure)) {
          connectionLost(candidate, failure);
          return;
        }
        let bridgeError: string | null = null;
        let retired = retiredRegion(metadata);
        // A failed/canceled enrollment can finish after the last busy poll.
        // Refresh the bridge's authoritative cleanup state before unlocking.
        try {
          const settled = await api.getWakeOnLan();
          if (current(candidate) && settled.bridgeId === candidate.bridgeId) {
            applyMetadata(settled);
            cleanupPending = settled.busy;
            bridgeError = settled.error;
            retired = retiredRegion(settled);
          }
        } catch (readFailure) {
          if (isWakeOnLanConnectionFailure(readFailure)) {
            connectionLost(candidate, readFailure);
            return;
          }
          // No authoritative state: require a successful refresh before another write.
          if (current(candidate)) setNeedsRefresh(true);
          cleanupPending = false;
        }
        if (!current(candidate)) return;
        if (candidate.canceled) setMessage('Operation canceled.');
        else setError(wakeOnLanFailureMessage(failure, bridgeError, retiredEnable && retired));
      }
    } finally {
      if (current(candidate)) {
        candidate.settled = true;
        if (cleanupPending) candidate.kind = 'cleanup';
        if (!cleanupPending) finish(candidate);
        setDraft((value) => ({ ...value, password: '' }));
      }
    }
  }

  async function testAndSave() {
    if (latest.current.controllerConnected) return;
    const issue = validateWakeOnLanDraft(draft, Boolean(metadata?.credentialPresent && draft.ssid === metadata.ssid));
    setValidation(issue);
    if (issue) return;
    // Saving never changes whether wake is on; the header switch does.
    const input = { ...draft, enabled: metadata?.enabled ?? false };
    await run('test', () => api.configureWakeOnLan(input),
      (result) => result.enabled ? WAKE_SETTINGS_MESSAGES.saved : WAKE_SETTINGS_MESSAGES.savedDisabled, true);
  }

  async function cancel() {
    const candidate = operation.current;
    if (!candidate || candidate.canceled || candidate.kind === 'saved') return;
    candidate.canceled = true;
    setCanceling(true);
    setDraft((value) => ({ ...value, password: '' }));
    try { await api.cancelWakeOnLan(); }
    catch {
      if (current(candidate)) {
        setError('Cancellation could not be confirmed. Wait for Wi-Fi cleanup to finish.');
      }
    }
  }

  return {
    metadata, targets, draft, loading, busy, canceling, error, validation, message, targetsUnavailable, needsRefresh,
    refreshingTargets, refreshTargets,
    recovering: needsRefresh && (recoveryAttempts < 5 || loading),
    showProgress: busy && operation.current?.kind !== 'saved',
    // A network test is running (not just the radio cleanup that follows one).
    testing: busy && operation.current?.kind === 'test',
    setDraft: (value: WakeOnLanDraft) => { setValidation(null); setDraft(value); }, testAndSave, cancel, refresh,
    toggleEnabled: () => run('saved', () => api.setWakeOnLanEnabled(!metadata?.enabled), () => null, false,
      !metadata?.enabled && retiredRegion(metadata)),
    forget: () => run('saved', () => api.forgetWakeOnLan(), () => WAKE_SETTINGS_MESSAGES.forgotten, true)
  };
}
