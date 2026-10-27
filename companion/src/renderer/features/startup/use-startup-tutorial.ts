import { useEffect, useState } from 'react';
import { recordKitsuneAskShown } from '../kitsune-promotion/kitsune-ask-schedule';
import {
  saveStartupTutorialCompleted,
  storedStartupTutorialStep,
  type StartupTutorialStep
} from './startup-tutorial-storage';

/** Seconds the Kitsune Input ask waits before Continue is enabled. */
export const STARTUP_KITSUNE_ASK_COUNTDOWN_SECONDS = 5;

/**
 * The two-step first-run tutorial: toggle an example feature tile, then
 * "Considering Getting Kitsune Input?", whose Continue unlocks after a countdown.
 */
export function useStartupTutorial() {
  const [step, setStep] = useState<StartupTutorialStep>(storedStartupTutorialStep);
  const [featureExampleActive, setFeatureExampleActive] = useState(false);
  const [askCountdown, setAskCountdown] = useState(STARTUP_KITSUNE_ASK_COUNTDOWN_SECONDS);
  // The ask counts as this run's Kitsune Input prompt, so the launch offer waits for a later run.
  const [kitsuneAskShownThisRun, setKitsuneAskShownThisRun] = useState(false);

  // One timeout per second while counting; nothing runs once it reaches zero.
  useEffect(() => {
    if (step !== 'kitsune-ask' || askCountdown <= 0) return undefined;
    const timer = window.setTimeout(() => setAskCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [step, askCountdown]);

  return {
    step,
    featureExampleActive,
    askCountdown,
    kitsuneAskShownThisRun,
    toggleFeatureExample: () => setFeatureExampleActive((active) => !active),
    completeFeatureStep: () => {
      setAskCountdown(STARTUP_KITSUNE_ASK_COUNTDOWN_SECONDS);
      setStep('kitsune-ask');
      setKitsuneAskShownThisRun(true);
      recordKitsuneAskShown();
    },
    finish: () => {
      saveStartupTutorialCompleted();
      setStep('done');
    }
  };
}

export type StartupTutorialController = ReturnType<typeof useStartupTutorial>;
