import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalization } from '../../common/localization';
import {
  SETTINGS_SECTIONS,
  searchSettings,
  settingsCategoryForFocusTarget,
  settingsSectionForCategory,
  type SettingsCategoryId,
  type SettingsFocusTarget,
  type SettingsSectionId
} from './settings-navigation';

export function useSettingsNavigation({ focusTarget }: {
  readonly focusTarget: SettingsFocusTarget | null;
}) {
  const [query, setQuery] = useState('');
  const [currentSection, setCurrentSection] = useState<SettingsSectionId>('general');
  const currentNavigationSection = SETTINGS_SECTIONS.find(({ id }) => id === currentSection)!;
  const { locale, translate } = useLocalization();
  const searching = query.trim().length > 0;
  const searchResults = useMemo(() => searchSettings(query, translate), [query, locale, translate]);
  const selectNavigationSection = useCallback((id: SettingsSectionId) => {
    setQuery('');
    setCurrentSection(id);
  }, []);

  useEffect(() => {
    const category = settingsCategoryForFocusTarget(focusTarget);
    if (category) selectNavigationSection(settingsSectionForCategory(category).id);
  }, [focusTarget, selectNavigationSection]);

  return {
    query, setQuery, currentSection, searching, selectNavigationSection, currentNavigationSection,
    resultCount: searchResults.length,
    matchingSettingIds: searching ? new Set(searchResults.map(({ id }) => id)) : null,
    visibleCategories: searching
      ? new Set(searchResults.map(({ category }) => category))
      : new Set<SettingsCategoryId>(currentNavigationSection.categories)
  };
}

export type SettingsNavigation = ReturnType<typeof useSettingsNavigation>;
