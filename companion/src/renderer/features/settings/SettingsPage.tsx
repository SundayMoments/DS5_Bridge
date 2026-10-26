import { useLayoutEffect, type ComponentType } from 'react';
import { useScrollContextEdges } from '../../common/use-scroll-context-edges';
import { AppearanceSettings, GeneralSettings, NotificationSettings, SystemTraySettings } from './AppSettings';
import { ConnectionPowerSettings, LightsSettings, ShortcutSettings } from './ControllerBridgeSettings';
import { AboutSettings, FirmwareSettings } from './SystemSettings';
import { WakePcSettings } from './WakePcSettings';
import type { SettingsCategoryProps } from './SettingsCategoryContentSupport';
import { SETTINGS_CATEGORIES, type SettingsCategoryId } from './settings-navigation';
import { SettingsSearchContext } from './settings-search-context';
import { SettingsToolbar } from './SettingsToolbar';
import type { SettingsPageActions, SettingsPageModel } from './types';
import type { SettingsNavigation } from './use-settings-navigation';
import './settings-page.css';

const CATEGORY_CONTENT: Record<SettingsCategoryId, ComponentType<SettingsCategoryProps>> = {
  app: GeneralSettings,
  'system-tray': SystemTraySettings,
  appearance: AppearanceSettings,
  notifications: NotificationSettings,
  'connection-power': ConnectionPowerSettings,
  lights: LightsSettings,
  input: ShortcutSettings,
  'pc-wake': WakePcSettings,
  maintenance: FirmwareSettings,
  about: AboutSettings
};

export function SettingsPage({ active, navigation, model, actions }: {
  readonly active: boolean;
  readonly navigation: SettingsNavigation;
  readonly model: SettingsPageModel;
  readonly actions: SettingsPageActions;
}) {
  const { query, currentSection, visibleCategories, matchingSettingIds, resultCount, searching } = navigation;
  const { scrollRef, scrollEdges, updateScrollEdges } = useScrollContextEdges(active);
  const normalizedQuery = query.trim();

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    updateScrollEdges();
  }, [query, currentSection]);

  useLayoutEffect(() => {
    if (!active || !model.focusTarget) return;
    scrollRef.current?.querySelector<HTMLElement>('.settings-menu-row-highlight')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active, currentSection, model.focusTarget]);

  return (
    <SettingsSearchContext.Provider value={query}>
      <div
        className={`control-page settings-page ${searching ? 'searching' : 'sectioned'} ${active ? 'active' : ''}`}
        role="region"
        id="control-panel-settings"
        aria-labelledby="settings-page-title"
        aria-hidden={!active}
      >
        <SettingsToolbar navigation={navigation} />

        <div className={`settings-page-scroll-region ${scrollEdges.up ? 'can-scroll-up' : ''} ${scrollEdges.down ? 'can-scroll-down' : ''}`}>
          <div
            ref={scrollRef}
            className="settings-page-surface"
            aria-label="Settings preferences"
            onScroll={updateScrollEdges}
          >
            <div className="settings-page-grid">
              {SETTINGS_CATEGORIES.map((category) => {
                const Content = CATEGORY_CONTENT[category.id];
                return (
                  <section
                    key={category.id}
                    id={`settings-section-${category.id}`}
                    className={`settings-category-section ${!searching && navigation.currentNavigationSection.categories.length === 1 ? 'standalone' : ''}`}
                    data-settings-category={category.id}
                    role="region"
                    aria-label={category.label}
                    hidden={!visibleCategories.has(category.id)}
                  >
                    {visibleCategories.has(category.id) ? (
                      <Content model={model} actions={actions} active={active} matchingSettingIds={matchingSettingIds} />
                    ) : null}
                  </section>
                );
              })}
              {normalizedQuery && resultCount === 0 ? (
                <div className="settings-filter-empty" role="status">
                  No settings match “{normalizedQuery}”.
                </div>
              ) : null}
            </div>
          </div>
          <span className="scroll-context-edge top" aria-hidden="true" />
          <span className="scroll-context-edge bottom" aria-hidden="true" />
        </div>
      </div>
    </SettingsSearchContext.Provider>
  );
}
