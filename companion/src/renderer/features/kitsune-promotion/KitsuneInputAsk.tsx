import type { ReactNode } from 'react';
import { IconArrowRight as ArrowRight, IconExternalLink } from '@tabler/icons-react';
import kitsuneInputLogoUrl from '../../assets/kitsune-input-logo.svg';
import { KitsuneInputWordmark } from './KitsuneInputWordmark';
import { KITSUNE_INPUT_PRICE, LAUNCH_OFFER_FEATURES } from './KitsuneInputOfferContent';

/** The ask shows the offer's first four features, two by two. */
const ASK_FEATURES = LAUNCH_OFFER_FEATURES.slice(0, 4);

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
 * tutorial, and the monthly ask. A shorter launch offer: the same hero, four
 * of its features, and its price and buttons. Continue unlocks after a countdown.
 */
export function KitsuneInputAsk({ countdown, headingAside, onGet, onLearnMore, onContinue }: KitsuneInputAskProps) {
  return (
    <>
      <header className="kitsune-launch-offer-hero kitsune-ask-hero">
        <img className="kitsune-launch-offer-logo" src={kitsuneInputLogoUrl} alt="" />
        <div className="kitsune-launch-offer-hero-copy">
          <KitsuneInputWordmark />
          <h2>Considering Getting Kitsune Input?</h2>
          <p>A separate Windows app from the developer of DS5 Bridge, for the bridge you already own.</p>
        </div>
        {headingAside}
      </header>

      <ul className="kitsune-launch-offer-features kitsune-ask-features">
        {ASK_FEATURES.map(({ title, detail, Icon }) => (
          <li key={title}>
            <span className="kitsune-launch-offer-feature-icon" aria-hidden="true"><Icon size={18} /></span>
            <span className="kitsune-launch-offer-feature-copy">
              <strong>{title}</strong>
              <span>{detail}</span>
            </span>
          </li>
        ))}
      </ul>

      <footer className="kitsune-launch-offer-footer">
        <div className="kitsune-launch-offer-price">
          <strong className="kitsune-launch-offer-amount" data-l10n="off">{KITSUNE_INPUT_PRICE}</strong>
          <span className="kitsune-launch-offer-terms">
            <strong>One-time purchase on Ko-fi</strong>
            <span>Your purchase supports the developer of DS5 Bridge.</span>
          </span>
        </div>
        <div className="kitsune-launch-offer-actions">
          <button type="button" className="secondary-action kitsune-launch-offer-learn" onClick={onLearnMore}>
            Learn More
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className="primary-action kitsune-launch-offer-get" onClick={onGet}>
            <IconExternalLink size={16} aria-hidden="true" />
            Get Kitsune Input
          </button>
        </div>
      </footer>

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
        aria-label="Considering Getting Kitsune Input?"
      >
        <KitsuneInputAsk countdown={countdown} onGet={onGet} onLearnMore={onLearnMore} onContinue={onClose} />
      </section>
    </div>
  );
}
