/** The Ko-fi support badge in the window bar; the artwork changes with the theme. */
export function ShellSupportBadge({ badgeUrl, onOpen }: {
  readonly badgeUrl: string;
  readonly onOpen: () => void;
}) {
  return (
    <button
      className="shell-kofi-link"
      type="button"
      aria-label="Support SundayMoments on Ko-fi"
      title="Support SundayMoments on Ko-fi"
      onClick={onOpen}
    >
      <img className="shell-kofi-badge" src={badgeUrl} alt="" />
    </button>
  );
}
