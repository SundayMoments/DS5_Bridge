import { IconArrowRight as ArrowRight } from '@tabler/icons-react';
import kitsuneInputLogoUrl from '../../assets/kitsune-input-logo.svg';
import { KitsuneInputWordmark } from './KitsuneInputWordmark';

/** The window-bar button that opens the Kitsune Input promotion: the brand first, then "Explore". */
export function KitsunePromotionBanner({ expanded, onOpen }: {
  readonly expanded: boolean;
  readonly onOpen: () => void;
}) {
  return (
    <button
      className="kitsune-promotion-banner"
      type="button"
      aria-label="Explore Kitsune Input"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onClick={onOpen}
    >
      <img src={kitsuneInputLogoUrl} alt="" />
      <KitsuneInputWordmark />
      <span className="kitsune-promotion-banner-copy">
        Explore
        <ArrowRight size={13} aria-hidden="true" />
      </span>
    </button>
  );
}
