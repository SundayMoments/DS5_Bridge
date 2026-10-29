import { useState } from 'react';
import { recordKitsuneAskShown } from '../kitsune-promotion/kitsune-ask-schedule';
import {
  saveStartupTutorialCompleted,
  storedStartupTutorialStep,
  type StartupTutorialStep
} from './startup-tutorial-storage';

/**
 * The first-run tutorial: toggle an example feature tile, then continue. It
 * never mentions Kitsune Input; finishing it starts the day before the first
 * Kitsune Input prompt.
 */
export function useStartupTutorial() {
  const [step, setStep] = useState<StartupTutorialStep>(storedStartupTutorialStep);
  const [featureExampleActive, setFeatureExampleActive] = useState(false);

  return {
    step,
    featureExampleActive,
    toggleFeatureExample: () => setFeatureExampleActive((active) => !active),
    finish: () => {
      saveStartupTutorialCompleted();
      recordKitsuneAskShown();
      setStep('done');
    }
  };
}

export type StartupTutorialController = ReturnType<typeof useStartupTutorial>;
