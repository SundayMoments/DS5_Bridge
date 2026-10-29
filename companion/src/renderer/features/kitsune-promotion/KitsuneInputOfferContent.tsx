import type { ComponentType, CSSProperties } from 'react';
import {
  IconArrowRight as ArrowRight,
  IconBolt,
  IconBrandXbox,
  IconCards,
  IconDeviceNintendo,
  IconExternalLink,
  IconHandFinger,
  IconStack2,
  IconView360,
  IconViewfinder
} from '@tabler/icons-react';
import playStationLogoUrl from '@product-assets/brand/playstation-logo.svg';
import kitsuneInputLogoUrl from '../../assets/kitsune-input-logo.svg';
import kitsuneBarMarkUrl from '../../assets/kitsune-persona.svg';
import { KitsuneInputWordmark } from './KitsuneInputWordmark';
import './kitsune-launch-offer.css';

/** Kitsune Input's Ko-fi price; currency text stays out of the catalogs. */
export const KITSUNE_INPUT_PRICE = '$7.99';

type FeatureIcon = ComponentType<{ size?: number }>;

interface LaunchOfferFeature {
  readonly title: string;
  readonly Icon: FeatureIcon;
}

/** Kitsune Input's own Kitsune Bar mark, drawn in the tile's color. */
function KitsuneBarMark({ size = 24 }: { readonly size?: number }) {
  return (
    <span
      className="kitsune-launch-offer-feature-mark"
      style={{ '--feature-mark': `url("${kitsuneBarMarkUrl}")`, '--feature-mark-size': `${size}px` } as CSSProperties}
    />
  );
}

// Only what Kitsune Input adds: DS5 Bridge already has Audio Haptics,
// adaptive triggers, button remapping, chords, Wake PC and themes. Wording
// follows kitsuneinput.com, except that the Kitsune Bar tile says what it is
// for someone who has never seen it; each icon is the one Kitsune Input uses
// for that feature. Titles only, so the offer scans at a glance; keep a
// multiple of four for the four-across tiles.
export const LAUNCH_OFFER_FEATURES: readonly LaunchOfferFeature[] = [
  { title: 'Auto-Switching Per-Game Profiles', Icon: IconCards },
  { title: 'Shift Layers', Icon: IconStack2 },
  { title: 'Gyro Aim and Flick Stick', Icon: IconView360 },
  { title: 'Touchpad Gestures', Icon: IconHandFinger },
  { title: 'Multi-Actions', Icon: IconBolt },
  { title: 'Stick and Trigger Tuning', Icon: IconViewfinder },
  // DS5 Bridge's Xbox persona is an Xbox 360 controller.
  { title: 'Xbox Series X Mode', Icon: IconBrandXbox },
  { title: 'Game Bar Overlay and Keyboard', Icon: KitsuneBarMark }
];

export interface KitsuneInputOfferContentProps {
  /** Prefixes the title, summary and list ids, which label the dialog. */
  readonly idPrefix: string;
  /** The headline; the ask asks its own question over the same offer. Passed as JSX so it is cataloged. */
  readonly title: string;
  onGet(): void;
  onLearnMore(): void;
  /** The ask's quiet Continue, last in the actions so it sits bottom right. */
  onContinue?(): void;
}

/**
 * The body of every Kitsune Input offer, the one-time launch offer, the
 * monthly ask and the window-bar banner's dialog: what Kitsune adds, the extra
 * controllers, and the price.
 */
export function KitsuneInputOfferContent({
  idPrefix,
  title,
  onGet,
  onLearnMore,
  onContinue
}: KitsuneInputOfferContentProps) {
  return (
    <>
      {/* Scrolls on its own when a long language or large text needs it, so the footer stays in view. */}
      <div className="kitsune-launch-offer-body">
        <header className="kitsune-launch-offer-hero">
          <img className="kitsune-launch-offer-logo" src={kitsuneInputLogoUrl} alt="" />
          <div className="kitsune-launch-offer-hero-copy">
            <KitsuneInputWordmark />
            <h2 id={`${idPrefix}-title`}>{title}</h2>
            <p id={`${idPrefix}-summary`}>
              A separate Windows app from the developer of DS5 Bridge, for the bridge you already own.
            </p>
          </div>
        </header>

        <ul className="kitsune-launch-offer-features" aria-label="What Kitsune Input adds">
          {LAUNCH_OFFER_FEATURES.map(({ title, Icon }) => (
            <li key={title}>
              <span className="kitsune-launch-offer-feature-icon" aria-hidden="true"><Icon size={24} /></span>
              <strong>{title}</strong>
            </li>
          ))}
        </ul>

        <section className="kitsune-launch-offer-compat" aria-labelledby={`${idPrefix}-compat-title`}>
          <h3 id={`${idPrefix}-compat-title`}>Also works with</h3>
          <ul className="kitsune-launch-offer-controllers">
            <li>
              <span
                className="kitsune-launch-offer-controller-logo playstation"
                style={{ '--controller-logo-mask': `url("${playStationLogoUrl}")` } as CSSProperties}
                aria-hidden="true"
              />
              <strong data-l10n="off">DualShock 4</strong>
            </li>
            <li title="Original model">
              <span className="kitsune-launch-offer-controller-logo" aria-hidden="true">
                <IconDeviceNintendo size={22} />
              </span>
              <strong data-l10n="off">Switch Pro Controller</strong>
            </li>
          </ul>
        </section>
      </div>

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
          {onContinue && (
            <button type="button" className="kitsune-ask-continue-button" onClick={onContinue}>
              Continue
            </button>
          )}
        </div>
      </footer>
    </>
  );
}
