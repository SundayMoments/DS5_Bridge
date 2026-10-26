/** How long the "incorrect, start again" state stays up after a wrong press. */
export const INCORRECT_FLASH_MS = 1600;

export type ConfirmationStepState = 'complete' | 'current' | 'pending';

export function confirmationStepState(index: number, progress: number): ConfirmationStepState {
  if (index < progress) return 'complete';
  if (index === progress) return 'current';
  return 'pending';
}

export function secondsUntil(expiresAtUnixMs: number, now: number): number {
  return Math.max(0, Math.ceil((expiresAtUnixMs - now) / 1000));
}

/**
 * Readable reasons main gives when Mount, Flash, or Nuke stops at the controller
 * confirmation. They reach Settings as the action's result; listing them here
 * keeps every catalog translating them.
 */
export const BOOTLOADER_CONFIRMATION_FAILURE_MESSAGES = [
  'Pico UF2 mode was cancelled.',
  'The confirmation timed out. Start again and enter the displayed eight-button sequence on the controller.',
  'The confirmation stopped because the controller disconnected or the time ran out.',
  'Connect a controller to this Pico to confirm UF2 mode, or hold BOOTSEL while plugging the Pico in.',
  'The Pico refused UF2 mode. Start again and enter the displayed sequence on the controller.',
  'The Pico paused bootloader authorization after repeated failures. Wait 30 seconds, then try again.',
  'Pico bootloader authorization is busy. Try again in a moment.',
  'The Pico refused to start the controller confirmation.',
  'The Pico did not start the controller confirmation.'
] as const;
