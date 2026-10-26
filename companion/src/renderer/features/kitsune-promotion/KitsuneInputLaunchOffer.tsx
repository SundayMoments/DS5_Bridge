import { useEffect, useRef, useState } from 'react';
import {
  IconArrowRight as ArrowRight,
  IconCheck,
  IconCpu,
  IconDeviceGamepad2,
  IconExternalLink,
  IconX as X
} from '@tabler/icons-react';
import kitsuneInputLogoUrl from '../../assets/kitsune-input-logo.svg';
import { KitsuneInputWordmark } from './KitsuneInputWordmark';
import './kitsune-launch-offer.css';

/** Seconds before the offer can be closed. */
export const LAUNCH_OFFER_CLOSE_DELAY_SECONDS = 5;

// Feature names as kitsuneinput.com lists them; several share DS5 Bridge's page names.
export const LAUNCH_OFFER_FEATURE_LABELS = [
  'Auto-Switching Per-Game Profiles',
  'Button Remapping',
  'Gyro Aim and Flick Stick',
  'Touchpad Gestures',
  'Multi-Actions',
  'Audio Haptics',
  'Adaptive Triggers',
  'Kitsune Bar Overlay',
  'PC Wake',
  'Themes'
] as const;

// Controller names are product names and stay in English.
const SUPPORTED_CONTROLLERS = ['DualSense', 'DualSense Edge', 'DualShock 4', 'Switch Pro Controller'];

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

        <header className="kitsune-launch-offer-hero">
          <img className="kitsune-launch-offer-logo" src={kitsuneInputLogoUrl} alt="" />
          <div className="kitsune-launch-offer-hero-copy">
            <KitsuneInputWordmark />
            <h2 id="kitsune-launch-offer-title">Make your controller yours.</h2>
            <p>The full controller app for the bridge you already own.</p>
          </div>
        </header>

        <div className="kitsune-launch-offer-bridge">
          <span className="kitsune-launch-offer-bridge-icon" aria-hidden="true"><IconCpu size={22} /></span>
          <div>
            <strong>Runs on the bridge you already own</strong>
            <p>
              Kitsune Input uses the same Pico 2 W or Waveshare RP2350B-Plus-W bridge, so there is nothing new to buy but the app.
            </p>
          </div>
        </div>

        <ul className="kitsune-launch-offer-features">
          {LAUNCH_OFFER_FEATURE_LABELS.map((feature) => (
            <li key={feature}>
              <IconCheck size={15} aria-hidden="true" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        <div className="kitsune-launch-offer-controllers">
          <IconDeviceGamepad2 size={16} aria-hidden="true" />
          <span>Works with</span>
          <span className="kitsune-launch-offer-controller-names" data-l10n="off">
            {SUPPORTED_CONTROLLERS.join(' · ')}
          </span>
        </div>

        <footer className="kitsune-launch-offer-footer">
          <div className="kitsune-launch-offer-terms">
            <strong>One-time purchase on Ko-fi</strong>
            <span>DS5 Bridge stays free and open source.</span>
          </div>
          <div className="kitsune-launch-offer-actions">
            <button type="button" className="secondary-action kitsune-launch-offer-learn" onClick={onLearnMore}>
              Learn More
              <ArrowRight size={16} aria-hidden="true" />
            </button>
            <button type="button" className="primary-action kitsune-launch-offer-get" onClick={onGet}>
              <IconExternalLink size={16} aria-hidden="true" />
              Get Kitsune Input — $7.99
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
