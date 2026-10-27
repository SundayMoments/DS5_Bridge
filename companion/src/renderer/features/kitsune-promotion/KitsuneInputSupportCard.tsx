import { IconArrowRight as ArrowRight, IconExternalLink } from '@tabler/icons-react';
import kitsuneInputLogoUrl from '../../assets/kitsune-input-logo.svg';
import { KITSUNE_INPUT_PRICE } from './KitsuneInputOfferContent';
import { KitsuneInputWordmark } from './KitsuneInputWordmark';
import './kitsune-support-card.css';

export interface KitsuneInputSupportCardProps {
  onGet(): void;
  onLearnMore(): void;
}

/**
 * The permanent Kitsune Input card at the top of Help & About. Unlike the
 * launch offer and the monthly ask, it never opens on its own and is never
 * dismissed, so it ignores the promotion's "don't show again".
 */
export function KitsuneInputSupportCard({ onGet, onLearnMore }: KitsuneInputSupportCardProps) {
  return (
    <section className="kitsune-support-card" aria-labelledby="kitsune-support-title">
      <img className="kitsune-support-logo" src={kitsuneInputLogoUrl} alt="" />
      <div className="kitsune-support-copy">
        <KitsuneInputWordmark />
        <h4 id="kitsune-support-title">Consider supporting Kitsune Input</h4>
        <p>
          <span>A separate Windows app from the developer of DS5 Bridge, for the bridge you already own.</span>
          {' '}
          <span>Your purchase supports the developer of DS5 Bridge.</span>
        </p>
      </div>
      <div className="kitsune-support-actions">
        <div className="kitsune-support-buttons">
          <button type="button" className="secondary-action kitsune-support-learn" onClick={onLearnMore}>
            Learn More
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className="primary-action kitsune-support-get" onClick={onGet}>
            <IconExternalLink size={16} aria-hidden="true" />
            Get Kitsune Input
          </button>
        </div>
        <span className="kitsune-support-price">
          <strong data-l10n="off">{KITSUNE_INPUT_PRICE}</strong>
          {' · '}
          <span>One-time purchase on Ko-fi</span>
        </span>
      </div>
    </section>
  );
}
