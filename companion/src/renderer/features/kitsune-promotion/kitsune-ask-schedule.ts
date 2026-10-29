/**
 * When the wait before the next Kitsune Input prompt started on this PC, in
 * epoch milliseconds: when first-run setup finished or the last prompt showed.
 */
export const KITSUNE_ASK_SHOWN_AT_STORAGE_KEY = 'ds5bridge.kitsuneInputAskShownAt.v1';

/** The launch offer waits a day after first-run setup, so the user has had time with the app. */
export const KITSUNE_LAUNCH_OFFER_WAIT_MS = 24 * 60 * 60 * 1000;

/** After the launch offer, Kitsune Input prompts come at most once a month. */
export const KITSUNE_ASK_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Starts the wait before the next Kitsune Input prompt. Finishing first-run
 * setup starts the day before the launch offer; the launch offer and each
 * monthly ask start a month.
 */
export function recordKitsuneAskShown(now = Date.now()): void {
  try {
    window.localStorage.setItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY, String(now));
  } catch {
    // Without storage the ask can only repeat on a later run; nothing to recover.
  }
}

/** When the current wait started, or null when none was recorded. */
export function kitsuneAskShownAt(): number | null {
  try {
    const shownAt = Number(window.localStorage.getItem(KITSUNE_ASK_SHOWN_AT_STORAGE_KEY));
    return Number.isFinite(shownAt) && shownAt > 0 ? shownAt : null;
  } catch {
    return null;
  }
}

/** True when the launch offer's day has passed since setup finished. */
export function kitsuneLaunchOfferDue(setupFinishedAt: number, now = Date.now()): boolean {
  return now - setupFinishedAt >= KITSUNE_LAUNCH_OFFER_WAIT_MS;
}

/** True when the last Kitsune Input prompt was at least a month ago. */
export function kitsuneAskDue(shownAt: number, now = Date.now()): boolean {
  return now - shownAt >= KITSUNE_ASK_INTERVAL_MS;
}
