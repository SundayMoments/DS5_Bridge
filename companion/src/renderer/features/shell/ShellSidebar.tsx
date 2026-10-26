import { useEffect, useState, type MouseEventHandler, type ReactNode } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { ShellSidebarHeader } from './ShellSidebarHeader';
import {
  CONTROL_TAB_DEFINITIONS,
  CONTROL_TAB_GROUPS,
  CONTROL_TAB_TRAILING_ROWS,
  controlTabGroupFor,
  type ControlTab,
  type ControlTabDefinition,
  type ControlTabGroupId
} from './control-tabs';
import './shell-sidebar.css';

export type ShellSidebarProps = Readonly<{
  activeTab: ControlTab;
  /** The device card and bridge selector. */
  device: ReactNode;
  /** Optional content above Settings, such as the support badge. */
  footer?: ReactNode;
  onChromeMouseDown: MouseEventHandler<HTMLElement>;
  onSelectTab: (tab: ControlTab) => void;
  panelIdForTab: (tab: ControlTab) => string;
}>;

export function ShellSidebar({
  activeTab,
  device,
  footer,
  onChromeMouseDown,
  onSelectTab,
  panelIdForTab
}: ShellSidebarProps) {
  const activeGroupId = controlTabGroupFor(activeTab)?.id ?? null;
  const [openGroupId, setOpenGroupId] = useState<ControlTabGroupId | null>(activeGroupId ?? 'controller');

  useEffect(() => {
    if (activeGroupId) setOpenGroupId(activeGroupId);
  }, [activeGroupId]);

  function selectTab(tab: ControlTab): void {
    const group = controlTabGroupFor(tab);
    if (group) setOpenGroupId(group.id);
    onSelectTab(tab);
  }

  function renderTabButton(
    definition: ControlTabDefinition,
    options: { nested?: boolean; groupExpanded?: boolean; utility?: boolean } = {}
  ) {
    const { id, label, Icon } = definition;
    const active = activeTab === id;
    const nested = Boolean(options.nested);
    const className = [
      'control-tab-button',
      nested ? 'nested' : '',
      options.utility ? 'utility' : '',
      active ? 'active' : ''
    ].filter(Boolean).join(' ');

    return (
      <button
        key={id}
        id={`control-tab-${id}`}
        type="button"
        aria-current={active ? 'page' : undefined}
        aria-controls={panelIdForTab(id)}
        className={className}
        tabIndex={nested && !options.groupExpanded ? -1 : undefined}
        onClick={() => selectTab(id)}
      >
        {!nested && <Icon size={18} stroke={2} />}
        <span>{label}</span>
      </button>
    );
  }

  return (
    <section className="hero-card" onMouseDown={onChromeMouseDown}>
      <ShellSidebarHeader />
      {device}
      <div className="sidebar-controls">
        <h2 className="sidebar-section-label">Controls</h2>
        <nav className="control-tabs" aria-label="Controls">
          <div className="control-tab-list">
            {renderTabButton(CONTROL_TAB_DEFINITIONS.overview)}
            {CONTROL_TAB_GROUPS.map(({ id, label, Icon, tabs }) => {
              const expanded = openGroupId === id;
              const containsActiveTab = tabs.some(({ id: tabId }) => tabId === activeTab);
              const triggerId = `control-group-${id}`;
              const panelId = `control-group-panel-${id}`;
              return (
                <div
                  key={id}
                  className={`control-tab-group ${expanded ? 'expanded' : ''} ${containsActiveTab ? 'contains-active' : ''}`}
                >
                  <button
                    id={triggerId}
                    type="button"
                    className="control-tab-group-trigger"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setOpenGroupId((current) => current === id ? null : id)}
                  >
                    <Icon size={18} stroke={2} />
                    <span>{label}</span>
                    <IconChevronDown className="control-tab-group-chevron" size={16} stroke={2} aria-hidden="true" />
                  </button>
                  <div id={panelId} className="control-tab-group-panel" aria-hidden={!expanded}>
                    <div className="control-tab-group-clip">
                      <div className="control-tab-group-items" role="group" aria-labelledby={triggerId}>
                        {tabs.map((tab) => renderTabButton(tab, { nested: true, groupExpanded: expanded }))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {CONTROL_TAB_TRAILING_ROWS.map((definition) => renderTabButton(definition))}
          </div>
          <div className="sidebar-footer">
            {footer}
            {renderTabButton(CONTROL_TAB_DEFINITIONS.settings, { utility: true })}
          </div>
        </nav>
      </div>
    </section>
  );
}
