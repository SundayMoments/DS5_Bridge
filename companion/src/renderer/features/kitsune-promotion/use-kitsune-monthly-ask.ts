import { useEffect, useState } from 'react';
import { kitsuneAskDue, kitsuneAskShownAt, recordKitsuneAskShown } from './kitsune-ask-schedule';
import { LAUNCH_OFFER_DELAY_MS } from './use-kitsune-launch-offer';

/** Seconds before the ask's Continue button unlocks. */
export const KITSUNE_ASK_COUNTDOWN_SECONDS = 5;

export interface KitsuneMonthlyAskInput {
  /** The launch offer has been shown and the user has not hidden Kitsune Input promotions. */
  readonly eligible: boolean;
  /** Something else is up, or another Kitsune prompt already showed this run. */
  readonly blocked: boolean;
}

/**
 * Opens "Considering Getting Kitsune Input?" shortly after startup when no
 * Kitsune prompt has shown in a month, and restarts the month when it opens.
 */
export function useKitsuneMonthlyAsk({ eligible, blocked }: KitsuneMonthlyAskInput) {
  const [phase, setPhase] = useState<'waiting' | 'open' | 'closed'>('waiting');
  const [countdown, setCountdown] = useState(KITSUNE_ASK_COUNTDOWN_SECONDS);

  useEffect(() => {
    if (phase !== 'waiting' || !eligible || blocked) return undefined;
    const shownAt = kitsuneAskShownAt();
    if (shownAt === null) {
      // The launch offer was shown before the month was tracked; start it now.
      recordKitsuneAskShown();
      return undefined;
    }
    if (!kitsuneAskDue(shownAt)) return undefined;
    const timer = window.setTimeout(() => {
      setPhase('open');
      recordKitsuneAskShown();
    }, LAUNCH_OFFER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, eligible, blocked]);

  useEffect(() => {
    if (phase !== 'open' || countdown <= 0) return undefined;
    const timer = window.setTimeout(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [phase, countdown]);

  return {
    visible: phase === 'open' && !blocked,
    countdown,
    close: () => setPhase('closed')
  };
}
