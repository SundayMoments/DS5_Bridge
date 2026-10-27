import type { ComponentType, CSSProperties } from 'react';
import {
  IconAdjustmentsHorizontal,
  IconArrowRight as ArrowRight,
  IconBrandXbox,
  IconCpu,
  IconDeviceNintendo,
  IconExternalLink,
  IconHandFinger,
  IconLayersSubtract,
  IconLayoutNavbar,
  IconRotate360,
  IconStack2,
  IconSwitchHorizontal
} from '@tabler/icons-react';
import playStationLogoUrl from '@product-assets/brand/playstation-logo.svg';
import kitsuneInputLogoUrl from '../../assets/kitsune-input-logo.svg';
import { KitsuneInputWordmark } from './KitsuneInputWordmark';
import './kitsune-launch-offer.css';

/** Kitsune Input's Ko-fi price; currency text stays out of the catalogs. */
export const KITSUNE_INPUT_PRICE = '$7.99';

interface LaunchOfferFeature {
  readonly title: string;
  readonly detail: string;
  readonly Icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>;
}

// Only what Kitsune Input adds: DS5 Bridge already has Audio Haptics,
// adaptive triggers, button remapping, chords, Wake PC and themes. Wording
// follows kitsuneinput.com. Keep an even count for the two-column grid.
export const LAUNCH_OFFER_FEATURES: readonly LaunchOfferFeature[] = [
  {
    title: 'Auto-Switching Per-Game Profiles',
    detail: 'Your setup changes with the game you launch.',
    Icon: IconSwitchHorizontal
  },
  {
    title: 'Shift Layers',
    detail: 'Hold a button for a second set of controls.',
    Icon: IconLayersSubtract
  },
  {
    title: 'Gyro Aim and Flick Stick',
    detail: 'Motion aiming, activation and quick turns.',
    Icon: IconRotate360
  },
  {
    title: 'Touchpad Gestures',
    detail: 'Swipe sequences that trigger any action.',
    Icon: IconHandFinger
  },
  {
    title: 'Multi-Actions',
    detail: 'Actions built from button states, thresholds and repeats.',
    Icon: IconStack2
  },
  {
    title: 'Stick and Trigger Tuning',
    detail: 'Deadzones, range and response curves.',
    Icon: IconAdjustmentsHorizontal
  },
  {
    // DS5 Bridge's Xbox persona is an Xbox 360 controller.
    title: 'Xbox Series X Mode',
    detail: 'Games see an Xbox Series X controller.',
    Icon: IconBrandXbox
  },
  {
    title: 'Kitsune Bar and Keyboard',
    detail: 'An in-game overlay, and typing with your controller.',
    Icon: IconLayoutNavbar
  }
];

export interface KitsuneInputOfferContentProps {
  /** Prefixes the title, summary and list ids, which label the dialog. */
  readonly idPrefix: string;
  onGet(): void;
  onLearnMore(): void;
}

/**
 * The body of both Kitsune Input offers, the one-time launch offer and the
 * window-bar banner's dialog: what Kitsune adds, the bridge facts, and the price.
 */
export function KitsuneInputOfferContent({ idPrefix, onGet, onLearnMore }: KitsuneInputOfferContentProps) {
  return (
    <>
      <header className="kitsune-launch-offer-hero">
        <img className="kitsune-launch-offer-logo" src={kitsuneInputLogoUrl} alt="" />
        <div className="kitsune-launch-offer-hero-copy">
          <KitsuneInputWordmark />
          <h2 id={`${idPrefix}-title`}>Make your controller yours.</h2>
          <p id={`${idPrefix}-summary`}>
            A separate Windows app from the developer of DS5 Bridge, for the bridge you already own.
          </p>
        </div>
      </header>

      <section className="kitsune-launch-offer-adds" aria-labelledby={`${idPrefix}-adds-title`}>
        <h3 id={`${idPrefix}-adds-title`}>What Kitsune Input adds</h3>
        <ul className="kitsune-launch-offer-features">
          {LAUNCH_OFFER_FEATURES.map(({ title, detail, Icon }) => (
            <li key={title}>
              <span className="kitsune-launch-offer-feature-icon" aria-hidden="true"><Icon size={18} /></span>
              <span className="kitsune-launch-offer-feature-copy">
                <strong>{title}</strong>
                <span>{detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

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
          <li>
            <span className="kitsune-launch-offer-controller-logo" aria-hidden="true">
              <IconDeviceNintendo size={22} />
            </span>
            <strong data-l10n="off">Switch Pro Controller</strong>
            <span>Original model</span>
          </li>
        </ul>
      </section>

      <ul className="kitsune-launch-offer-facts">
        <li>
          <IconCpu size={16} aria-hidden="true" />
          <span>Same Pico 2 W or Waveshare RP2350B-Plus-W bridge. Nothing else to buy.</span>
        </li>
      </ul>

      <footer className="kitsune-launch-offer-footer">
        <div className="kitsune-launch-offer-price">
          <strong className="kitsune-launch-offer-amount" data-l10n="off">{KITSUNE_INPUT_PRICE}</strong>
          <span className="kitsune-launch-offer-terms">
            <strong>One-time purchase on Ko-fi</strong>
            <span>Your purchase supports the developer of DS5 Bridge.</span>
            <span>DS5 Bridge stays free and open source.</span>
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
    </>
  );
}
