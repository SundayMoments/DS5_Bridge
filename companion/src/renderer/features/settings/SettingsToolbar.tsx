import type { SettingsNavigation } from './use-settings-navigation';

export function SettingsToolbar({ navigation }: { readonly navigation: SettingsNavigation }) {
  const { searching, currentNavigationSection, resultCount } = navigation;
  return (
    <header className="settings-page-heading">
      <div className="settings-page-title-row">
        <h2 id="settings-page-title">{searching ? 'Search results' : currentNavigationSection.label}</h2>
        {searching && (
          <span id="settings-search-status" className="settings-search-status" role="status">
            {resultCount === 1 ? '1 match' : `${resultCount} matches`}
          </span>
        )}
      </div>
    </header>
  );
}
