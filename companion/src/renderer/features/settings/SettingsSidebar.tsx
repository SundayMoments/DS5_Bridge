import { useEffect, useRef, type ComponentType, type ReactNode } from 'react';
import {
  IconArrowLeft, IconBell, IconBulb, IconInfoCircle, IconKeyboard, IconPalette, IconPlug,
  IconSearch, IconSettings, IconTools, IconUsb, IconX
} from '@tabler/icons-react';
import { useLocalization } from '../../common/localization';
import { SETTINGS_NAV_GROUPS, SETTINGS_SECTIONS, type SettingsSectionId } from './settings-navigation';
import type { SettingsNavigation } from './use-settings-navigation';
import './settings-sidebar.css';

const SECTION_ICONS = {
  general: IconSettings,
  appearance: IconPalette,
  notifications: IconBell,
  'connection-power': IconPlug,
  lights: IconBulb,
  shortcuts: IconKeyboard,
  'pc-wake': IconUsb,
  maintenance: IconTools,
  about: IconInfoCircle
} satisfies Record<SettingsSectionId, ComponentType<{ readonly size?: number }>>;

export function SettingsSidebar({ navigation, onBack, header }: {
  readonly navigation: SettingsNavigation;
  readonly onBack: () => void;
  readonly header?: ReactNode;
}) {
  const { query, setQuery, currentNavigationSection, selectNavigationSection, searching } = navigation;
  const { translate } = useLocalization();
  const backRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { backRef.current?.focus({ preventScroll: true }); }, []);

  return (
    <aside className="settings-sidebar" aria-label="Settings">
      {header && <div className="settings-sidebar-header">{header}</div>}
      <div className="settings-search" role="search">
        <IconSearch size={17} aria-hidden="true" />
        <input
          ref={searchRef}
          type="search"
          aria-label="Search settings"
          placeholder={translate('Search settings')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') { event.preventDefault(); setQuery(''); }
          }}
        />
        {query && (
          <button type="button" className="settings-search-clear" aria-label="Clear search"
            onClick={() => { setQuery(''); searchRef.current?.focus(); }}>
            <IconX size={15} aria-hidden="true" />
          </button>
        )}
      </div>
      <nav className="settings-section-nav" aria-label="Settings sections">
        {SETTINGS_NAV_GROUPS.map((group) => (
          <div key={group.id} className="settings-nav-group" role="group" aria-labelledby={`settings-nav-${group.id}`}>
            <h3 id={`settings-nav-${group.id}`} className="settings-nav-group-label">{group.label}</h3>
            {group.sections.map((id) => {
              const { label } = SETTINGS_SECTIONS.find((section) => section.id === id)!;
              const Icon = SECTION_ICONS[id];
              const selected = !searching && currentNavigationSection.id === id;
              return (
                <button key={id} type="button" className={`settings-section-button ${selected ? 'active' : ''}`}
                  aria-current={selected ? 'page' : undefined}
                  aria-controls="control-panel-settings"
                  onClick={() => selectNavigationSection(id)}>
                  <Icon size={16} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      <button ref={backRef} type="button" className="settings-back-button" onClick={onBack}>
        <IconArrowLeft size={18} aria-hidden="true" />
        <span>Back to app</span>
      </button>
    </aside>
  );
}
