import { useEffect, useRef, useState } from 'react';

/** How long the app has been up, showing its page, before the offer appears. */
export const LAUNCH_OFFER_DELAY_MS = 1500;

export interface KitsuneLaunchOfferInput {
  /** True while the offer has never been shown on this PC. */
  readonly eligible: boolean;
  /** The first-run tutorial or the bootloader confirmation is up; the offer waits for it. */
  readonly blocked: boolean;
  /** Persists that the offer was shown, so it never appears again. */
  readonly markShown: () => void;
}

/**
 * Opens the one-time Kitsune Input offer shortly after startup, once nothing
 * else needs the user's attention, and records it as shown when it opens.
 * It opens at most once per run even if saving that it was shown fails.
 */
export function useKitsuneLaunchOffer({ eligible, blocked, markShown }: KitsuneLaunchOfferInput) {
  const [phase, setPhase] = useState<'waiting' | 'open' | 'closed'>('waiting');
  const markShownRef = useRef(markShown);
  markShownRef.current = markShown;

  useEffect(() => {
    if (phase !== 'waiting' || !eligible || blocked) return undefined;
    const timer = window.setTimeout(() => {
      setPhase('open');
      markShownRef.current();
    }, LAUNCH_OFFER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, eligible, blocked]);

  return {
    /** Hidden again while the tutorial or a bootloader confirmation is up. */
    visible: phase === 'open' && !blocked,
    close: () => setPhase('closed')
  };
}
