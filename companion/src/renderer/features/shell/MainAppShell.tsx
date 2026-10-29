import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { IconMinus as Minus, IconX as X } from '@tabler/icons-react';
import { ShellSidebar } from './ShellSidebar';
import type { ControlTab } from './control-tabs';

export interface MainAppShellProps {
  readonly className: string;
  readonly theme: string;
  readonly textScale: number;
  readonly activeTab: ControlTab;
  /** The device card and bridge selector shown under the brand. */
  readonly sidebarDevice: ReactNode;
  /** Replaces the navigation sidebar while Settings is open. */
  readonly settingsSidebar?: ReactNode;
  /** Centered in the window bar, such as the Kitsune Input promotion. */
  readonly windowBarCenter?: ReactNode;
  /** Tools beside the window buttons, such as the Ko-fi badge and notifications. */
  readonly windowBarTools?: ReactNode;
  readonly pages: ReactNode;
  readonly overlays?: ReactNode;
  readonly onSelectTab: (tab: ControlTab) => void;
  readonly panelIdForTab: (tab: ControlTab) => string;
  /** Called before a native window drag begins from the window chrome. */
  readonly onWindowChromeMouseDown: () => void;
  readonly onBeginWindowDrag: () => void;
  readonly onMinimize: () => void;
  readonly onHide: () => void;
  /** Quit on Close is on, so the X button quits instead of hiding to the tray. */
  readonly closeButtonQuits?: boolean;
  /** An app-wide action holds the lock; its disabled look waits briefly (see shared-controls.css). */
  readonly appActionPending?: boolean;
}

const INTERACTIVE_CHROME = [
  '.bridge-tools',
  '.window-actions',
  '.window-bar-center',
  '.control-tab-list',
  'button, input, select, textarea, a, [role="button"], [role="tab"], .custom-select, .settings-menu'
].join(', ');

export function MainAppShell({
  className,
  theme,
  textScale,
  activeTab,
  sidebarDevice,
  settingsSidebar,
  windowBarCenter,
  windowBarTools,
  pages,
  overlays,
  onSelectTab,
  panelIdForTab,
  onWindowChromeMouseDown,
  onBeginWindowDrag,
  onMinimize,
  onHide,
  closeButtonQuits = false,
  appActionPending = false
}: MainAppShellProps) {
  const closeLabel = closeButtonQuits ? 'Quit DS5 Bridge' : 'Hide to tray';
  function handleWindowChromeMouseDown(event: ReactMouseEvent<HTMLElement>): void {
    const target = event.target as HTMLElement;
    if (target.closest(INTERACTIVE_CHROME)) return;
    onWindowChromeMouseDown();
    if (event.button === 0) onBeginWindowDrag();
  }

  return (
    <div className={className} data-theme={theme} data-text-scale={textScale}
      data-app-action-pending={appActionPending ? '' : undefined}>
      <div className="window-bar" onMouseDown={handleWindowChromeMouseDown}>
        {windowBarCenter ? <div className="window-bar-center">{windowBarCenter}</div> : <span />}
        <div className="topbar-right">
          <div className="bridge-tools">
            {windowBarTools}
            <span className="bridge-tool-divider" aria-hidden="true" />
          </div>
          <div className="window-actions">
            <button type="button" title="Minimize" aria-label="Minimize" onClick={onMinimize}>
              <Minus size={16} />
            </button>
            <button type="button" title={closeLabel} aria-label={closeLabel} onClick={onHide}>
              <X size={16} />
            </button>
          </div>
        </div>
      </div>

      <main className="app-content">
        {activeTab === 'settings' && settingsSidebar ? settingsSidebar : (
          <ShellSidebar
            activeTab={activeTab}
            device={sidebarDevice}
            onChromeMouseDown={handleWindowChromeMouseDown}
            onSelectTab={onSelectTab}
            panelIdForTab={panelIdForTab}
          />
        )}
        <section className="control-panel flat-control-panel">
          <div className="control-pages">{pages}</div>
        </section>
      </main>

      {overlays}
    </div>
  );
}
