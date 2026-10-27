import type { ReactNode } from 'react';
import { IconArrowRight as ArrowRight } from '@tabler/icons-react';
import { KitsuneInputOfferContent } from './KitsuneInputOfferContent';

export interface KitsuneInputAskProps {
  /** Seconds until Continue unlocks. */
  readonly countdown: number;
  /** Shown beside the title, such as the tutorial's step count. */
  readonly headingAside?: ReactNode;
  onGet(): void;
  onLearnMore(): void;
  onContinue(): void;
}

/**
 * "Considering Getting Kitsune Input?": the last step of the first-run
 * tutorial, and the monthly ask. The banner's offer under its own question,
 * with a quiet Continue that unlocks after a countdown instead of a close button.
 */
export function KitsuneInputAsk({ countdown, headingAside, onGet, onLearnMore, onContinue }: KitsuneInputAskProps) {
  return (
    <>
      <KitsuneInputOfferContent
        idPrefix="kitsune-ask"
        title="Considering Getting Kitsune Input?"
        heroAside={headingAside}
        onGet={onGet}
        onLearnMore={onLearnMore}
      />
      <div className="kitsune-ask-continue">
        <button type="button" className="kitsune-ask-continue-button" disabled={countdown > 0} onClick={onContinue}>
          {countdown > 0 ? `Continue In ${countdown}` : 'Continue'}
          {countdown > 0 ? null : <ArrowRight size={14} aria-hidden="true" />}
        </button>
      </div>
    </>
  );
}

export interface KitsuneInputMonthlyAskProps {
  readonly countdown: number;
  onGet(): void;
  onLearnMore(): void;
  onClose(): void;
}

/** The ask on its own, at most once a month after the launch offer. */
export function KitsuneInputMonthlyAsk({ countdown, onGet, onLearnMore, onClose }: KitsuneInputMonthlyAskProps) {
  return (
    <div className="modal-backdrop kitsune-promotion-backdrop" role="presentation">
      <section
        className="settings-menu kitsune-ask-panel kitsune-ask-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kitsune-ask-title"
        aria-describedby="kitsune-ask-summary"
      >
        <KitsuneInputAsk countdown={countdown} onGet={onGet} onLearnMore={onLearnMore} onContinue={onClose} />
      </section>
    </div>
  );
}
