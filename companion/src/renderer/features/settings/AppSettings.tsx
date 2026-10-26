import { CustomSelect } from '../../components/CustomSelect';
import { useLocalization } from '../../common/localization';
import { UI_SCALE_PERCENTS, UI_TEXT_SCALE_PERCENTS, type UiScalePercent, type UiTextScalePercent } from '@shared/types';
import { UI_THEME_OPTIONS } from '../../ui-themes';
import { createLanguageOptionAriaLabel, renderLanguageOption } from './LanguageSelectOption';
import { ToggleRow } from './SettingsToggleRow';
import { renderThemeOption } from './ThemeOption';
import { SearchableSetting, SettingsGroupLabel, type SettingsCategoryProps } from './SettingsCategoryContentSupport';

export const SETTINGS_UI_SCALE_OPTIONS: Array<[string, UiScalePercent]> = UI_SCALE_PERCENTS.map((value) => [`${value}%`, value]);
export const SETTINGS_UI_TEXT_SCALE_OPTIONS: Array<[string, UiTextScalePercent]> = UI_TEXT_SCALE_PERCENTS.map((value) => [`${value}%`, value]);

export function GeneralSettings({ model, actions, matchingSettingIds }: SettingsCategoryProps) {
  const localization = useLocalization();
  const { settings } = model;
  return <>
    <h3 className="settings-menu-section-label">App</h3>
    <SearchableSetting id="launch-startup" matchingSettingIds={matchingSettingIds}>
      <ToggleRow
        label="Launch at Startup"
        description="Start in the tray when Windows starts"
        checked={settings.launchAtStartupEnabled}
        disabled={model.busy}
        onToggle={actions.toggleLaunchAtStartup}
      />
    </SearchableSetting>
    <SearchableSetting id="language" matchingSettingIds={matchingSettingIds}>
      <div className={`settings-menu-row ${model.focusTarget === 'language' ? 'settings-menu-row-highlight' : ''}`}>
        <div className="settings-menu-copy">
          <strong>Language</strong>
          <span>Choose the language used throughout DS5 Bridge</span>
        </div>
        <CustomSelect
          value={localization.preference}
          options={localization.options}
          className="settings-theme-select settings-language-select"
          floatingMenu
          floatingMenuFitContent
          floatingMenuAlign="end"
          showSelectedCheck={false}
          ariaLabel="Application language"
          disabled={model.busy}
          renderValue={renderLanguageOption}
          renderOption={renderLanguageOption}
          getOptionAriaLabel={createLanguageOptionAriaLabel(localization.translate('AI-translated'))}
          onChange={actions.setLocale}
        />
      </div>
    </SearchableSetting>
  </>;
}

export function SystemTraySettings({ model, actions, matchingSettingIds }: SettingsCategoryProps) {
  return <>
    <SettingsGroupLabel label="System Tray" ids={['battery-tray']} matchingSettingIds={matchingSettingIds} />
    <SearchableSetting id="battery-tray" matchingSettingIds={matchingSettingIds}>
      <ToggleRow
        label="Battery Tray Icon"
        description="Show controller battery percentage in the tray"
        checked={model.settings.showBatteryPercentTrayIcon}
        disabled={model.busy}
        onToggle={actions.toggleBatteryTrayIcon}
      />
    </SearchableSetting>
  </>;
}

export function AppearanceSettings({ model, actions, matchingSettingIds }: SettingsCategoryProps) {
  const { settings } = model;
  return <>
    <h3 className="settings-menu-section-label">Appearance</h3>
    <SearchableSetting id="ui-scale" matchingSettingIds={matchingSettingIds}>
      <div className="settings-menu-row">
        <div className="settings-menu-copy">
          <strong>UI Scale</strong>
          <span>Scale the entire app window</span>
        </div>
        <CustomSelect
          value={settings.uiScalePercent}
          options={SETTINGS_UI_SCALE_OPTIONS}
          className="settings-scale-select"
          floatingMenu
          floatingMenuAlign="end"
          showSelectedCheck={false}
          ariaLabel="UI scale"
          disabled={model.busy}
          onChange={actions.setUiScale}
        />
      </div>
    </SearchableSetting>
    <SearchableSetting id="text-scale" matchingSettingIds={matchingSettingIds}>
      <div className="settings-menu-row">
        <div className="settings-menu-copy">
          <strong>Text Scale</strong>
          <span>Scale text without resizing the interface</span>
        </div>
        <CustomSelect
          value={settings.uiTextScalePercent}
          options={SETTINGS_UI_TEXT_SCALE_OPTIONS}
          className="settings-scale-select"
          floatingMenu
          floatingMenuAlign="end"
          showSelectedCheck={false}
          ariaLabel="UI text scale"
          disabled={model.busy}
          onChange={actions.setTextScale}
        />
      </div>
    </SearchableSetting>
    <SearchableSetting id="theme" matchingSettingIds={matchingSettingIds}>
      <div className="settings-menu-row">
        <div className="settings-menu-copy">
          <strong>Theme</strong>
          <span>Choose colors for the app</span>
        </div>
        <CustomSelect
          value={settings.uiThemePreset}
          options={UI_THEME_OPTIONS}
          className="settings-theme-select"
          floatingMenu
          floatingMenuAlign="end"
          showSelectedCheck={false}
          ariaLabel="UI theme"
          disabled={model.busy}
          renderValue={renderThemeOption}
          renderOption={renderThemeOption}
          onChange={actions.setTheme}
        />
      </div>
    </SearchableSetting>
  </>;
}

export function NotificationSettings({ model, actions, matchingSettingIds }: SettingsCategoryProps) {
  const { settings } = model;
  return <>
    <h3 className="settings-menu-section-label">Notifications</h3>
    <SearchableSetting id="controller-notifications" matchingSettingIds={matchingSettingIds}>
      <ToggleRow
        label="Controller Status"
        description="Notify when the controller connects or disconnects"
        checked={settings.notifyControllerConnection}
        disabled={model.busy}
        onToggle={actions.toggleControllerNotifications}
      />
    </SearchableSetting>
    <SearchableSetting id="low-battery-notifications" matchingSettingIds={matchingSettingIds}>
      <ToggleRow
        label="Low Battery"
        description="Notify when the battery reaches 20% or below"
        checked={settings.notifyLowBattery}
        disabled={model.busy}
        onToggle={actions.toggleLowBatteryNotifications}
      />
    </SearchableSetting>
    <SearchableSetting id="test-notification" matchingSettingIds={matchingSettingIds}>
      <div className="settings-menu-row">
        <div className="settings-menu-copy">
          <strong>Test Notification</strong>
          <span>Show a sample Windows notification</span>
        </div>
        <button className="secondary-action settings-row-action" type="button" disabled={model.busy} onClick={actions.testNotification}>
          Send Test
        </button>
      </div>
    </SearchableSetting>
  </>;
}
