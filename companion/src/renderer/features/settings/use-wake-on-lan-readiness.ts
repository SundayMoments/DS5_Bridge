import { useEffect, useRef, useState } from 'react';
import type { WakeOnLanApi, WakeOnLanReadiness } from '@shared/wake-on-lan-types';
import { WINDOW_TIMERS, type WakeOnLanTimers } from './use-wake-on-lan-settings';

/** A typed MAC waits for typing to pause before the audio helper is started. */
export const WAKE_ON_LAN_READINESS_TYPING_DELAY_MS = 500;

/**
 * Read-only PC readiness for the adapter being set up, ported from Kitsune
 * Input. Opening the section by expanding it (`requestFresh` before the open)
 * and Check again bypass the main-process cache. Reopening on page entry or for
 * a search match, and changing the adapter, reuse it; a typed MAC (`immediate`
 * false) is read only after typing pauses. Reads never change a setting, and an
 * older helper simply reports unknown values.
 */
export function useWakeOnLanReadiness(api: WakeOnLanApi, open: boolean, targetMac: string, immediate: boolean,
  timers: WakeOnLanTimers = WINDOW_TIMERS) {
  const [readiness, setReadiness] = useState<WakeOnLanReadiness | null>(null);
  const [checking, setChecking] = useState(false);
  const request = useRef(0);
  const wasOpen = useRef(false);
  const freshOpen = useRef(false);

  async function load(refresh: boolean) {
    const id = ++request.current;
    if (!targetMac) {
      setReadiness(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      const value = await api.getWakeOnLanReadiness(targetMac, refresh);
      if (id === request.current) setReadiness(value);
    } catch {
      if (id === request.current) setReadiness(null);
    } finally {
      if (id === request.current) setChecking(false);
    }
  }

  useEffect(() => {
    if (!open) {
      wasOpen.current = false;
      request.current++;
      setChecking(false);
      return;
    }
    const opening = !wasOpen.current;
    const refresh = opening && freshOpen.current;
    if (opening) freshOpen.current = false;
    wasOpen.current = true;
    if (opening || immediate || !targetMac) {
      void load(refresh);
      // A late answer for a previous adapter or an unmounted section is ignored.
      return () => { request.current++; };
    }
    const pending = ++request.current;
    setChecking(true);
    const timer = timers.setTimeout(() => { if (pending === request.current) void load(false); },
      WAKE_ON_LAN_READINESS_TYPING_DELAY_MS);
    return () => {
      timers.clearTimeout(timer);
      request.current++;
    };
  }, [api, timers, open, targetMac, immediate]);

  return {
    // Keep a stale adapter's result out of the rows while the new one loads.
    readiness: readiness && readiness.targetMac === targetMac ? readiness : null,
    checking,
    refresh: () => { if (open && !checking) void load(true); },
    /** Whether the next opening is an explicit expand, which reads past the cache; a collapse clears it. */
    requestFresh: (fresh: boolean) => { freshOpen.current = fresh; }
  };
}
