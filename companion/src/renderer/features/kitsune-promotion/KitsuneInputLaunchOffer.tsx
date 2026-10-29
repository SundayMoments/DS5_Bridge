import { useRef } from 'react';
import { IconX as X } from '@tabler/icons-react';
import { KitsuneInputOfferContent } from './KitsuneInputOfferContent';
import { useOfferDialogKeyboard } from './use-offer-dialog-keyboard';

export interface KitsuneInputLaunchOfferProps {
  onGet(): void;
  onLearnMore(): void;
  onClose(): void;
}

/** The one-time Kitsune Input offer, closable at once with its close button, Escape, or the backdrop. */
export function KitsuneInputLaunchOffer({ onGet, onLearnMore, onClose }: KitsuneInputLaunchOfferProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useOfferDialogKeyboard(dialogRef, onClose);

  return (
    <div
      className="modal-backdrop kitsune-promotion-backdrop kitsune-launch-offer-backdrop"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={dialogRef}
        className="settings-menu kitsune-launch-offer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kitsune-launch-offer-title"
        aria-describedby="kitsune-launch-offer-summary"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="kitsune-launch-offer-close" type="button" aria-label="Close" title="Close" onClick={onClose}>
          <X size={18} aria-hidden="true" />
        </button>
        <KitsuneInputOfferContent
          idPrefix="kitsune-launch-offer"
          title="Make your controller yours."
          onGet={onGet}
          onLearnMore={onLearnMore}
        />
      </section>
    </div>
  );
}
