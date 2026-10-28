import { useEffect, useRef } from 'react';
import { IconArrowRight as ArrowRight } from '@tabler/icons-react';
import { KitsuneInputOfferContent } from './KitsuneInputOfferContent';

export interface KitsuneInputAskProps {
  onGet(): void;
  onLearnMore(): void;
  onContinue(): void;
}

/**
 * "Considering Getting Kitsune Input?": the banner's offer under its own
 * question, with a quiet Continue instead of a close button.
 */
export function KitsuneInputAsk({ onGet, onLearnMore, onContinue }: KitsuneInputAskProps) {
  return (
    <>
      <KitsuneInputOfferContent
        idPrefix="kitsune-ask"
        title="Considering Getting Kitsune Input?"
        onGet={onGet}
        onLearnMore={onLearnMore}
      />
      <div className="kitsune-ask-continue">
        <button type="button" className="kitsune-ask-continue-button" onClick={onContinue}>
          Continue
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
    </>
  );
}

export interface KitsuneInputMonthlyAskProps {
  onGet(): void;
  onLearnMore(): void;
  onClose(): void;
}

/** The ask on its own, at most once a month after the launch offer. Continue or Escape closes it. */
export function KitsuneInputMonthlyAsk({ onGet, onLearnMore, onClose }: KitsuneInputMonthlyAskProps) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeRef.current();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, []);

  return (
    <div className="modal-backdrop kitsune-promotion-backdrop" role="presentation">
      <section
        className="settings-menu kitsune-ask-panel kitsune-ask-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kitsune-ask-title"
        aria-describedby="kitsune-ask-summary"
      >
        <KitsuneInputAsk onGet={onGet} onLearnMore={onLearnMore} onContinue={onClose} />
      </section>
    </div>
  );
}
