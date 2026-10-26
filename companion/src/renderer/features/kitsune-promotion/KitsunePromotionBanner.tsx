import kitsuneInputLogoUrl from '../../assets/kitsune-input-logo.svg';
import { KitsuneInputWordmark } from './KitsuneInputWordmark';

/** The window-bar button that opens the Kitsune Input promotion. */
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
      <span className="kitsune-promotion-banner-copy">Explore</span>
      <KitsuneInputWordmark />
    </button>
  );
}
