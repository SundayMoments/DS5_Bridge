export function ShellSupportBadge({ badgeUrl, onOpen }: {
  readonly badgeUrl: string;
  readonly onOpen: () => void;
}) {
  return (
    <div className="sidebar-support">
      <button
        className="sidebar-kofi-link"
        type="button"
        aria-label="Support SundayMoments on Ko-fi"
        onClick={onOpen}
      >
        <img className="sidebar-kofi-badge" src={badgeUrl} alt="" />
      </button>
    </div>
  );
}
