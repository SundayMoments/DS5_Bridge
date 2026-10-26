import { useEffect, useRef, useState } from 'react';
import type { WakeOnLanApi, WakeOnLanMetadata, WakeOnLanTarget } from '@shared/wake-on-lan-types';
import {
  EMPTY_WAKE_PC_DRAFT,
  WAKE_PC_MESSAGES,
  defaultWakePcCountry,
  preferredWakePcTarget,
  validateWakePcDraft,
  wakePcErrorText,
  type WakePcDraft,
  type WakePcDraftIssue
} from './wake-pc-model';

/** How often the bridge is read while a change or its Wi-Fi cleanup runs. */
export const WAKE_PC_POLL_MS = 1000;

export interface WakePcSettingsOptions {
  /** The Wake PC section is on screen. */
  readonly active: boolean;
  /** Changes when the bridge connects, disconnects, or the controller comes and goes. */
  readonly connectionKey: string;
  /** The bridge refuses changes while a controller is connected. */
  readonly controllerConnected: boolean;
  readonly locale: string;
  readonly api: WakeOnLanApi;
}

type WakePcOperation = 'test' | 'toggle' | 'forget';

/**
 * Wake-on-LAN setup for the connected bridge: reads the saved network and this
 * PC's Ethernet adapters, runs Test and save with progress and Cancel, and
 * changes or forgets a saved network. The password lives only in the draft for
 * one attempt.
 */
export function useWakePcSettings({ active, connectionKey, controllerConnected, locale, api }: WakePcSettingsOptions) {
  const [metadata, setMetadata] = useState<WakeOnLanMetadata | null>(null);
  const [targets, setTargets] = useState<WakeOnLanTarget[]>([]);
  const [targetsUnavailable, setTargetsUnavailable] = useState(false);
  const [refreshingTargets, setRefreshingTargets] = useState(false);
  const [loading, setLoading] = useState(false);
  const [operation, setOperation] = useState<WakePcOperation | null>(null);
  const [canceling, setCanceling] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingForget, setConfirmingForget] = useState(false);
  const [draft, setDraftState] = useState<WakePcDraft>(EMPTY_WAKE_PC_DRAFT);
  const [validation, setValidation] = useState<WakePcDraftIssue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pollTick, setPollTick] = useState(0);
  const operationRef = useRef<WakePcOperation | null>(null);
  const cancelRequestedRef = useRef(false);
  // Poll answers that started before an operation settled must not overwrite its result.
  const epochRef = useRef(0);
  const draftTouchedRef = useRef(false);
  const latest = useRef({ locale, targets });
  latest.current = { locale, targets };

  const busy = operation !== null || Boolean(metadata?.busy);

  function draftFrom(value: WakeOnLanMetadata, list = latest.current.targets): WakePcDraft {
    const country = value.country && value.availableCountries.includes(value.country)
      ? value.country
      : defaultWakePcCountry(latest.current.locale, value.availableCountries);
    return {
      ssid: value.ssid,
      password: '',
      country,
      targetMac: value.targetMac || preferredWakePcTarget(list)?.mac || '',
      enabled: value.configured ? value.enabled : true
    };
  }

  function applyMetadata(value: WakeOnLanMetadata, resetDraft = false, list = latest.current.targets) {
    setMetadata(value);
    if (resetDraft || !draftTouchedRef.current) {
      draftTouchedRef.current = false;
      setDraftState(draftFrom(value, list));
    }
  }

  function applyTargets(list: WakeOnLanTarget[]) {
    setTargets(list);
    setTargetsUnavailable(false);
    setDraftState((value) => value.targetMac ? value : { ...value, targetMac: preferredWakePcTarget(list)?.mac ?? '' });
  }

  // Idle: read on opening the section and whenever the connection changes.
  useEffect(() => {
    if (!active || operationRef.current) return undefined;
    let cancelled = false;
    const epoch = epochRef.current;
    setLoading(true);
    void Promise.allSettled([api.getWakeOnLan(), api.getWakeOnLanTargets()]).then(([status, list]) => {
      if (cancelled || epoch !== epochRef.current) return;
      setLoading(false);
      if (list.status === 'fulfilled') applyTargets(list.value);
      else setTargetsUnavailable(true);
      if (status.status === 'fulfilled') {
        applyMetadata(status.value, false, list.status === 'fulfilled' ? list.value : latest.current.targets);
        setError(null);
      } else {
        setError(wakePcErrorText(status.reason, WAKE_PC_MESSAGES.readFailed));
      }
    });
    return () => { cancelled = true; };
  }, [active, connectionKey]);

  // Busy: follow the bridge about once a second until it is idle again.
  useEffect(() => {
    if (!active || !busy) return undefined;
    const epoch = epochRef.current;
    const timer = window.setTimeout(() => {
      void api.getWakeOnLan().then((value) => {
        if (epoch !== epochRef.current) return;
        setMetadata(value);
      }, () => undefined).finally(() => setPollTick((tick) => tick + 1));
    }, WAKE_PC_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [active, busy, pollTick]);

  async function run(kind: WakePcOperation, action: () => Promise<WakeOnLanMetadata>, onSuccess: (result: WakeOnLanMetadata) => void) {
    if (operationRef.current || controllerConnected || !metadata?.supported) return false;
    operationRef.current = kind;
    cancelRequestedRef.current = false;
    setOperation(kind);
    setCanceling(false);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      epochRef.current += 1;
      onSuccess(result);
      return true;
    } catch (failure) {
      epochRef.current += 1;
      if (cancelRequestedRef.current) setMessage(WAKE_PC_MESSAGES.canceled);
      else setError(wakePcErrorText(failure));
      // The bridge may still be cleaning up; read where it ended.
      try {
        setMetadata(await api.getWakeOnLan());
      } catch {
        // Keep the last known state; the next open or connection change reads again.
      }
      return false;
    } finally {
      operationRef.current = null;
      setOperation(null);
      setCanceling(false);
    }
  }

  async function testAndSave() {
    if (!metadata) return;
    const issue = validateWakePcDraft(draft, metadata.availableCountries);
    setValidation(issue);
    if (issue) return;
    const input = { ...draft };
    // The password is sent once and never kept, whatever the outcome.
    setDraftState((value) => ({ ...value, password: '' }));
    await run('test', () => api.configureWakeOnLan(input), (result) => {
      applyMetadata(result, true);
      setEditing(false);
      setMessage(result.enabled ? WAKE_PC_MESSAGES.saved : WAKE_PC_MESSAGES.savedDisabled);
    });
    input.password = '';
  }

  async function cancel() {
    if (operationRef.current !== 'test' || cancelRequestedRef.current) return;
    cancelRequestedRef.current = true;
    setCanceling(true);
    try {
      await api.cancelWakeOnLan();
    } catch {
      setError(WAKE_PC_MESSAGES.cancelUnconfirmed);
    }
  }

  async function refreshTargets() {
    if (refreshingTargets) return;
    setRefreshingTargets(true);
    try {
      applyTargets(await api.getWakeOnLanTargets(true));
    } catch {
      setTargetsUnavailable(true);
    } finally {
      setRefreshingTargets(false);
    }
  }

  return {
    metadata,
    targets,
    targetsUnavailable,
    refreshingTargets,
    loading,
    operation,
    busy,
    canceling,
    editing,
    confirmingForget,
    draft,
    validation,
    error,
    message,
    setDraft(next: WakePcDraft) {
      draftTouchedRef.current = true;
      setValidation(null);
      setDraftState(next);
    },
    startChange() {
      if (!metadata) return;
      draftTouchedRef.current = true;
      setDraftState(draftFrom(metadata, targets));
      setValidation(null);
      setMessage(null);
      setError(null);
      setEditing(true);
    },
    cancelChange() {
      draftTouchedRef.current = false;
      if (metadata) setDraftState(draftFrom(metadata, targets));
      setValidation(null);
      setEditing(false);
    },
    testAndSave,
    cancel,
    refreshTargets,
    toggleEnabled() {
      if (!metadata) return;
      void run('toggle', () => api.setWakeOnLanEnabled(!metadata.enabled), (result) => setMetadata(result));
    },
    askToForget() {
      setMessage(null);
      setError(null);
      setConfirmingForget(true);
    },
    keepSavedNetwork() {
      setConfirmingForget(false);
    },
    async forget() {
      setConfirmingForget(false);
      await run('forget', () => api.forgetWakeOnLan(), (result) => {
        applyMetadata(result, true);
        setEditing(false);
        setMessage(WAKE_PC_MESSAGES.forgotten);
      });
    }
  };
}

export type WakePcSettingsController = ReturnType<typeof useWakePcSettings>;
