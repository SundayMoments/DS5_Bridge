import { useEffect, useState } from 'react';
import { kitsuneAskDue, kitsuneAskShownAt, recordKitsuneAskShown } from './kitsune-ask-schedule';
import { LAUNCH_OFFER_DELAY_MS } from './use-kitsune-launch-offer';

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

  return {
    visible: phase === 'open' && !blocked,
    close: () => setPhase('closed')
  };
}
