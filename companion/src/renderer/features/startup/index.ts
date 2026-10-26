export { STARTING_BRIDGE_LABEL, StartupPlaceholderPage, startingDevicePresentation } from './StartupPlaceholderPage';
export { StartupTutorial, type StartupTutorialProps } from './StartupTutorial';
export {
  STARTUP_TUTORIAL_COMPLETED_STORAGE_KEY,
  saveStartupTutorialCompleted,
  storedStartupTutorialStep,
  type StartupTutorialStep
} from './startup-tutorial-storage';
export {
  STARTUP_SUPPORT_COUNTDOWN_SECONDS,
  useStartupTutorial,
  type StartupTutorialController
} from './use-startup-tutorial';
