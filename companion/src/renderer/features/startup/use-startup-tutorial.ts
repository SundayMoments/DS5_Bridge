import { useEffect, useState } from 'react';
import {
  saveStartupTutorialCompleted,
  storedStartupTutorialStep,
  type StartupTutorialStep
} from './startup-tutorial-storage';

/** Seconds the support step waits before Continue is enabled. */
export const STARTUP_SUPPORT_COUNTDOWN_SECONDS = 5;

/**
 * The two-step first-run tutorial: toggle an example feature tile, then a
 * short support ask whose Continue button unlocks after a countdown.
 */
export function useStartupTutorial() {
  const [step, setStep] = useState<StartupTutorialStep>(storedStartupTutorialStep);
  const [featureExampleActive, setFeatureExampleActive] = useState(false);
  const [supportCountdown, setSupportCountdown] = useState(STARTUP_SUPPORT_COUNTDOWN_SECONDS);

  // One timeout per second while counting; nothing runs once it reaches zero.
  useEffect(() => {
    if (step !== 'support' || supportCountdown <= 0) return undefined;
    const timer = window.setTimeout(() => setSupportCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [step, supportCountdown]);

  return {
    step,
    featureExampleActive,
    supportCountdown,
    toggleFeatureExample: () => setFeatureExampleActive((active) => !active),
    completeFeatureStep: () => {
      setSupportCountdown(STARTUP_SUPPORT_COUNTDOWN_SECONDS);
      setStep('support');
    },
    finish: () => {
      saveStartupTutorialCompleted();
      setStep('done');
    }
  };
}

export type StartupTutorialController = ReturnType<typeof useStartupTutorial>;
