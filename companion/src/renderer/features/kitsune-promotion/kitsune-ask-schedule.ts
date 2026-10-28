/** When the month before the next Kitsune Input prompt started on this PC, in epoch milliseconds. */
export const KITSUNE_ASK_SHOWN_AT_STORAGE_KEY = 'ds5bridge.kitsuneInputAskShownAt.v1';

/** Kitsune Input prompts come at most once a month, the first a month after first-run setup. */
export const KITSUNE_ASK_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Starts the month before the next Kitsune Input prompt. Finishing first-run
 * setup starts the first month; the launch offer and each monthly ask restart it.
 */
export function recordKitsuneAskShown(now = Date.now()): void {
  try {
    window.localStorage.setItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY, String(now));
  } catch {
    // Without storage the ask can only repeat on a later run; nothing to recover.
  }
}

/** When the current month started, or null when none was recorded. */
export function kitsuneAskShownAt(): number | null {
  try {
    const shownAt = Number(window.localStorage.getItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY));
    return Number.isFinite(shownAt) && shownAt > 0 ? shownAt : null;
  } catch {
    return null;
  }
}

/** True when the current month started at least a month ago. */
export function kitsuneAskDue(shownAt: number, now = Date.now()): boolean {
  return now - shownAt >= KITSUNE_ASK_INTERVAL_MS;
}
