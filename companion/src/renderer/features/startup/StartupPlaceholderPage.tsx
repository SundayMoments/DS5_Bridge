import type { ShellDevicePresentation } from '../shell/ShellSidebarDevice';

/** The bridge selector's text before the first snapshot lists the bridges. */
export const STARTING_BRIDGE_LABEL = 'Looking for bridges…';

/** The sidebar device card before the first snapshot. */
export function startingDevicePresentation(controllerArt: string): ShellDevicePresentation {
  return {
    title: 'Controller',
    status: 'Starting',
    tone: 'idle',
    batteryLabel: '—',
    powerLabel: null,
    controllerArt
  };
}

/**
 * Shown in the page area for the moment before the first bridge snapshot
 * arrives, so the shell renders immediately instead of behind a splash screen.
 */
export function StartupPlaceholderPage({ title }: { readonly title: string }) {
  return (
    <div
      className="control-page startup-placeholder-page active"
      role="status"
      aria-busy="true"
      aria-label="Starting DS5 Bridge"
    >
      <div className="feature-heading">
        <div>
          <h2>{title}</h2>
          <p>Starting DS5 Bridge…</p>
        </div>
      </div>
      <div className="startup-placeholder-grid" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span className="wide" />
      </div>
    </div>
  );
}
