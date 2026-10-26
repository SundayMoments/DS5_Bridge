/** The product name stays in English in every language, so the translator skips it. */
export function KitsuneInputWordmark() {
  return (
    <span className="kitsune-promotion-wordmark" aria-label="Kitsune Input" data-l10n="off">
      <span className="kitsune-promotion-wordmark-kitsune">Kitsune</span>
      <span className="kitsune-promotion-wordmark-input">Input</span>
    </span>
  );
}
