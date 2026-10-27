import { useEffect, useRef, useState } from 'react';
import { IconX as X } from '@tabler/icons-react';
import { KitsuneInputOfferContent } from './KitsuneInputOfferContent';

/** Seconds before the offer can be closed. */
export const LAUNCH_OFFER_CLOSE_DELAY_SECONDS = 5;

export interface KitsuneInputLaunchOfferProps {
  onGet(): void;
  onLearnMore(): void;
  onClose(): void;
}

/**
 * The one-time Kitsune Input offer. It can only be closed after a short
 * countdown; the close button, Escape, and the backdrop are inert until then.
 */
export function KitsuneInputLaunchOffer({ onGet, onLearnMore, onClose }: KitsuneInputLaunchOfferProps) {
  const [closeCountdown, setCloseCountdown] = useState(LAUNCH_OFFER_CLOSE_DELAY_SECONDS);
  const closeLocked = closeCountdown > 0;
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const lockedRef = useRef(closeLocked);
  lockedRef.current = closeLocked;

  useEffect(() => {
    if (!closeLocked) return undefined;
    const timer = window.setTimeout(() => setCloseCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [closeCountdown]);

  useEffect(() => {
    dialogRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (!lockedRef.current) closeRef.current();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, []);

  const closeLabel = closeLocked ? `Close in ${closeCountdown}` : 'Close';

  return (
    <div
      className="modal-backdrop kitsune-promotion-backdrop kitsune-launch-offer-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (!lockedRef.current) closeRef.current();
      }}
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
        <button
          className={`kitsune-launch-offer-close ${closeLocked ? 'locked' : ''}`}
          type="button"
          disabled={closeLocked}
          aria-label={closeLabel}
          title={closeLabel}
          onClick={onClose}
        >
          {closeLocked ? <span>{closeLabel}</span> : <X size={18} aria-hidden="true" />}
        </button>
        <KitsuneInputOfferContent idPrefix="kitsune-launch-offer" onGet={onGet} onLearnMore={onLearnMore} />
      </section>
    </div>
  );
}
