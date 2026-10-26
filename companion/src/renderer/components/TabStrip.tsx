import type { ComponentType } from 'react';

export type TabStripIcon = ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>;

export type TabDefinition<TTab extends string> = {
  readonly id: TTab;
  readonly label: string;
  readonly Icon?: TabStripIcon;
};

export interface TabStripProps<TTab extends string> {
  readonly activeTab: TTab;
  readonly tabs: readonly TabDefinition<TTab>[];
  readonly ariaLabel: string;
  readonly className?: string;
  /** Prefix for tab and panel ids, so each tab can name the panel it controls. */
  readonly idPrefix?: string;
  onSelect(tab: TTab): void;
}

/** A segmented tab list with roving focus, used above Studio and Lab pages. */
export function TabStrip<TTab extends string>({
  activeTab,
  tabs,
  ariaLabel,
  className = 'studio-tab-strip',
  idPrefix,
  onSelect
}: TabStripProps<TTab>) {
  return (
    <div className={className} role="tablist" aria-label={ariaLabel}>
      {tabs.map(({ id, label, Icon }, index) => (
        <button
          key={id}
          id={idPrefix ? `${idPrefix}-tab-${id}` : undefined}
          type="button"
          role="tab"
          aria-selected={activeTab === id}
          aria-controls={idPrefix ? `${idPrefix}-panel-${id}` : undefined}
          tabIndex={activeTab === id ? 0 : -1}
          className={activeTab === id ? 'active' : ''}
          onClick={() => onSelect(id)}
          onKeyDown={(event) => {
            let nextIndex: number | null = null;
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              nextIndex = (index + 1) % tabs.length;
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              nextIndex = (index - 1 + tabs.length) % tabs.length;
            } else if (event.key === 'Home') {
              nextIndex = 0;
            } else if (event.key === 'End') {
              nextIndex = tabs.length - 1;
            }
            if (nextIndex === null) return;
            event.preventDefault();
            const next = tabs[nextIndex];
            if (!next) return;
            onSelect(next.id);
            event.currentTarget.parentElement
              ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
              .item(nextIndex)
              .focus();
          }}
        >
          {Icon ? <Icon size={18} aria-hidden="true" /> : null}
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
