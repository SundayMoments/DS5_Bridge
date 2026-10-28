export type StartupTutorialStep = 'feature-toggle' | 'done';

export const STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY = 'ds5bridge.startupTutorialCompleted.v1';

export function storedStartupTutorialStep(): StartupTutorialStep {
  return window.localStorage.getItem(STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY) === '1' ? 'done' : 'feature-toggle';
}

export function saveStartupTutorialCompleted(): void {
  window.localStorage.setItem(STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY, '1');
}
