import '@fontsource/montserrat/latin-500.css';
import '@fontsource/montserrat/latin-700.css';
import { BridgeMark } from './BridgeMark';
import './shell-sidebar.css';

export function ShellSidebarHeader() {
  return (
    <div className="sidebar-brand" aria-label="DS5 Bridge" data-l10n="off">
      <BridgeMark />
      <span className="sidebar-brand-copy">
        <span className="sidebar-brand-primary">DS5</span>{' '}
        <span className="sidebar-brand-accent">Bridge</span>
      </span>
    </div>
  );
}
