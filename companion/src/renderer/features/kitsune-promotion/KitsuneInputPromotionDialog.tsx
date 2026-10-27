import { useEffect, useRef } from 'react';
import { IconX as X } from '@tabler/icons-react';
import { KitsuneInputOfferContent } from './KitsuneInputOfferContent';

export interface KitsuneInputPromotionDialogProps {
  onClose(): void;
  onLearnMore(): void;
  onPurchase(): void;
}

/**
 * Opened from the window-bar banner: the launch offer's content, closable at
 * once with Escape or the backdrop.
 */
export function KitsuneInputPromotionDialog({
  onClose,
  onLearnMore,
  onPurchase
}: KitsuneInputPromotionDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeRef.current();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, []);

  return (
    <div className="modal-backdrop kitsune-promotion-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="settings-menu kitsune-launch-offer-modal kitsune-promotion-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="kitsune-promotion-title"
        aria-describedby="kitsune-promotion-summary"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="kitsune-launch-offer-close"
          type="button"
          aria-label="Close Kitsune Input promotion"
          title="Close"
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
        <KitsuneInputOfferContent
          idPrefix="kitsune-promotion"
          title="Make your controller yours."
          onGet={onPurchase}
          onLearnMore={onLearnMore}
        />
      </section>
    </div>
  );
}
