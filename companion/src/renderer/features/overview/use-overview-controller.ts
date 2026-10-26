import { useEffect, useRef, useState } from 'react';
import type { AppRuntime } from '../../composition/app-runtime';

/** How long Sleep Controller waits for the confirming second press. */
export const SLEEP_CONFIRM_MS = 2400;

/** The Overview's own state: Sleep Controller asks for a second press before it acts. */
export function useOverviewController(runtime: AppRuntime) {
  const { snapshot, connected, controllerConnected, pendingAction, runAction } = runtime;
  const [sleepConfirmVisible, setSleepConfirmVisible] = useState(false);
  const sleepConfirmArmedRef = useRef(false);
  const sleepConfirmTimerRef = useRef<number | null>(null);
  const sleepControllerSupported = Boolean(snapshot?.status?.firmwareFlags.sleepControllerControl);
  const sleepUnavailable = !connected || !sleepControllerSupported || !controllerConnected || pendingAction !== null;

  useEffect(() => () => {
    if (sleepConfirmTimerRef.current !== null) {
      window.clearTimeout(sleepConfirmTimerRef.current);
    }
  }, []);

  function clearSleepConfirmation() {
    sleepConfirmArmedRef.current = false;
    setSleepConfirmVisible(false);
    if (sleepConfirmTimerRef.current !== null) {
      window.clearTimeout(sleepConfirmTimerRef.current);
      sleepConfirmTimerRef.current = null;
    }
  }

  function armSleepConfirmation() {
    sleepConfirmArmedRef.current = true;
    setSleepConfirmVisible(true);
    if (sleepConfirmTimerRef.current !== null) {
      window.clearTimeout(sleepConfirmTimerRef.current);
    }
    sleepConfirmTimerRef.current = window.setTimeout(() => {
      sleepConfirmArmedRef.current = false;
      setSleepConfirmVisible(false);
      sleepConfirmTimerRef.current = null;
    }, SLEEP_CONFIRM_MS);
  }

  function sleepController() {
    if (!snapshot || sleepUnavailable) {
      return;
    }
    if (!sleepConfirmArmedRef.current) {
      armSleepConfirmation();
      return;
    }
    clearSleepConfirmation();
    void runAction('overview-sleep-controller', () => window.bridge.sleepController());
  }

  return {
    sleepConfirmVisible,
    sleepUnavailable,
    sleepController
  };
}

export type OverviewController = ReturnType<typeof useOverviewController>;
