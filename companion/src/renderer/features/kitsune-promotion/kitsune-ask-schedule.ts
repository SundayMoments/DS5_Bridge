/** When a Kitsune Input prompt was last shown on this PC, in epoch milliseconds. */
export const KITSUNE_ASK_SHOWN_AT_STORAGE_KEY = 'ds5bridge.kitsuneInputAskShownAt.v1';

/** The "Considering Getting Kitsune Input?" ask comes back at most once a month. */
export const KITSUNE_ASK_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Records that a Kitsune Input prompt was shown: the first-run ask, the launch
 * offer, or the monthly ask. Each one restarts the month.
 */
export function recordKitsuneAskShown(now = Date.now()): void {
  try {
    window.localStorage.setItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY, String(now));
  } catch {
    // Without storage the ask can only repeat on a later run; nothing to recover.
  }
}

/** When a Kitsune Input prompt was last shown, or null when none was recorded. */
export function kitsuneAskShownAt(): number | null {
  try {
    const shownAt = Number(window.localStorage.getItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY));
    return Number.isFinite(shownAt) && shownAt > 0 ? shownAt : null;
  } catch {
    return null;
  }
}

/** True when the last Kitsune Input prompt was at least a month ago. */
export function kitsuneAskDue(shownAt: number, now = Date.now()): boolean {
  return now - shownAt >= KITSUNE_ASK_INTERVAL_MS;
}
