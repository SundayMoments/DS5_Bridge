import { useRef } from 'react';
import { KitsuneInputOfferContent } from './KitsuneInputOfferContent';
import { useOfferDialogKeyboard } from './use-offer-dialog-keyboard';

export interface KitsuneInputAskProps {
  onGet(): void;
  onLearnMore(): void;
  onContinue(): void;
}

/**
 * "Considering Getting Kitsune Input?": the banner's offer under its own
 * question, with a quiet Continue after its actions instead of a close button.
 */
export function KitsuneInputAsk({ onGet, onLearnMore, onContinue }: KitsuneInputAskProps) {
  return (
    <KitsuneInputOfferContent
      idPrefix="kitsune-ask"
      title="Considering Getting Kitsune Input?"
      onGet={onGet}
      onLearnMore={onLearnMore}
      onContinue={onContinue}
    />
  );
}

export interface KitsuneInputMonthlyAskProps {
  onGet(): void;
  onLearnMore(): void;
  onClose(): void;
}

/** The ask on its own, at most once a month after the launch offer. Continue or Escape closes it. */
export function KitsuneInputMonthlyAsk({ onGet, onLearnMore, onClose }: KitsuneInputMonthlyAskProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useOfferDialogKeyboard(dialogRef, onClose);

  return (
    <div className="modal-backdrop kitsune-promotion-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="settings-menu kitsune-ask-panel kitsune-ask-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kitsune-ask-title"
        aria-describedby="kitsune-ask-summary"
        tabIndex={-1}
      >
        <KitsuneInputAsk onGet={onGet} onLearnMore={onLearnMore} onContinue={onClose} />
      </section>
    </div>
  );
}
