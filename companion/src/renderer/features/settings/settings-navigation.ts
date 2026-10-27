/** A setting another page links to; 'shortcuts' frames every controller shortcut. */
export type SettingsFocusTarget = 'controller-power-saving' | 'sleep-shortcut' | 'volume-shortcut' | 'shortcuts' | 'language';

export const SETTINGS_CATEGORIES = [
  { id: 'app', label: 'App' },
  { id: 'system-tray', label: 'System Tray' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'connection-power', label: 'Connection & Power' },
  { id: 'lights', label: 'Lights & Indicators' },
  { id: 'input', label: 'Shortcuts' },
  { id: 'pc-wake', label: 'Wake PC' },
  { id: 'maintenance', label: 'Bridge Firmware' },
  { id: 'about', label: 'Help & About' }
] as const;

export type SettingsCategoryId = typeof SETTINGS_CATEGORIES[number]['id'];

export const SETTINGS_SECTIONS = [
  { id: 'general', label: 'General', categories: ['app', 'system-tray'] },
  { id: 'appearance', label: 'Appearance', categories: ['appearance'] },
  { id: 'notifications', label: 'Notifications', categories: ['notifications'] },
  { id: 'connection-power', label: 'Connection & Power', categories: ['connection-power'] },
  { id: 'lights', label: 'Lights & Indicators', categories: ['lights'] },
  { id: 'shortcuts', label: 'Shortcuts', categories: ['input'] },
  { id: 'pc-wake', label: 'Wake PC', categories: ['pc-wake'] },
  { id: 'maintenance', label: 'Bridge Firmware', categories: ['maintenance'] },
  { id: 'about', label: 'Help & About', categories: ['about'] }
] as const satisfies readonly {
  readonly id: string;
  readonly label: string;
  readonly categories: readonly SettingsCategoryId[];
}[];

export type SettingsSectionId = typeof SETTINGS_SECTIONS[number]['id'];

export const SETTINGS_NAV_GROUPS = [
  { id: 'app', label: 'App', sections: ['general', 'appearance', 'notifications'] },
  { id: 'controller', label: 'Controller & Bridge', sections: ['connection-power', 'lights', 'shortcuts'] },
  { id: 'system', label: 'System', sections: ['pc-wake', 'maintenance', 'about'] }
] as const satisfies readonly {
  readonly id: string;
  readonly label: string;
  readonly sections: readonly SettingsSectionId[];
}[];

export function settingsSectionForCategory(category: SettingsCategoryId) {
  return SETTINGS_SECTIONS.find(({ categories }) => categories.some((id) => id === category))!;
}

export type SettingsSearchEntryId =
  | 'launch-startup'
  | 'language'
  | 'battery-tray'
  | 'ui-scale'
  | 'text-scale'
  | 'theme'
  | 'controller-notifications'
  | 'low-battery-notifications'
  | 'idle-disconnect'
  | 'pc-sleep-disconnect'
  | 'controller-power-saving'
  | 'pico-led'
  | 'player-slot-led'
  | 'lightbar-restore'
  | 'edge-profile-switching'
  | 'sleep-shortcut'
  | 'volume-shortcut'
  | 'remote-wake'
  | 'wake-on-lan'
  | 'pico-tools'
  | 'last-restart'
  | 'kitsune-input'
  | 'github'
  | 'discord';

export interface SettingsSearchResult {
  readonly id: SettingsSearchEntryId;
  readonly label: string;
  readonly category: SettingsCategoryId;
  readonly categoryLabel: string;
  readonly keywords: string;
}

const CATEGORY_LABELS = new Map<SettingsCategoryId, string>(
  SETTINGS_CATEGORIES.map(({ id, label }) => [id, label])
);

const SEARCH_ENTRIES: ReadonlyArray<Omit<SettingsSearchResult, 'categoryLabel'>> = [
  { id: 'launch-startup', label: 'Launch at Startup', category: 'app', keywords: 'windows start boot tray startup' },
  { id: 'language', label: 'Language', category: 'app', keywords: 'localization locale translation' },
  { id: 'battery-tray', label: 'Battery Tray Icon', category: 'system-tray', keywords: 'controller percentage taskbar' },
  { id: 'ui-scale', label: 'UI Scale', category: 'appearance', keywords: 'appearance interface size zoom window' },
  { id: 'text-scale', label: 'Text Scale', category: 'appearance', keywords: 'appearance font size accessibility' },
  { id: 'theme', label: 'Theme', category: 'appearance', keywords: 'appearance color dark light' },
  { id: 'controller-notifications', label: 'Controller Status', category: 'notifications', keywords: 'Notify when the controller connects or disconnects' },
  { id: 'low-battery-notifications', label: 'Low Battery', category: 'notifications', keywords: 'Notify when the battery reaches 20% or below' },
  { id: 'idle-disconnect', label: 'Idle Disconnect', category: 'connection-power', keywords: 'controller timeout sleep minutes' },
  { id: 'pc-sleep-disconnect', label: 'PC Sleep Disconnect', category: 'connection-power', keywords: 'usb suspend windows' },
  { id: 'controller-power-saving', label: 'Controller Power Saving', category: 'connection-power', keywords: 'headphones haptics triggers light bar lightbar' },
  { id: 'pico-led', label: 'Bridge LED', category: 'lights', keywords: 'pico bridge device light indicator' },
  { id: 'player-slot-led', label: 'Player LEDs', category: 'lights', keywords: 'controller player slot number indicator lights' },
  { id: 'lightbar-restore', label: 'Light Bar Restore', category: 'lights', keywords: 'lightbar color reapply games automatic' },
  { id: 'edge-profile-switching', label: 'Block Edge Profile Switching', category: 'input', keywords: 'dualsense lfn rfn triangle circle cross square face buttons chords onboard profile' },
  { id: 'sleep-shortcut', label: 'Controller Sleep Shortcut', category: 'input', keywords: 'controller sleep shortcut chord triangle' },
  { id: 'volume-shortcut', label: 'Volume Shortcut', category: 'input', keywords: 'controller chord d-pad speaker' },
  { id: 'remote-wake', label: 'Wake PC via USB', category: 'pc-wake', keywords: 'usb remote wake sleep windows controller reconnect' },
  { id: 'wake-on-lan', label: 'Wake-on-LAN', category: 'pc-wake', keywords: 'wifi wi-fi network ethernet magic packet lan sleep shutdown router' },
  { id: 'pico-tools', label: 'Bridge Firmware', category: 'maintenance', keywords: 'pico bridge firmware update recovery erase mount flash nuke uf2' },
  { id: 'last-restart', label: 'Last Restart', category: 'maintenance', keywords: 'reset crash freeze watchdog reboot diagnostics bug report' },
  { id: 'kitsune-input', label: 'Kitsune Input', category: 'about', keywords: 'support purchase fox ko-fi' },
  { id: 'github', label: 'GitHub', category: 'about', keywords: 'sunday moments profile developer source' },
  { id: 'discord', label: 'Support & Community', category: 'about', keywords: 'discord invite help server' }
];

export function settingsSearchIdsForCategory(category: SettingsCategoryId): SettingsSearchEntryId[] {
  return SEARCH_ENTRIES.filter((entry) => entry.category === category).map(({ id }) => id);
}

export function searchSettings(
  query: string,
  translate: (source: string) => string = (source) => source
): SettingsSearchResult[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  return SEARCH_ENTRIES
    .filter((entry) => {
      const haystack = `${translate(entry.label)} ${translate(entry.keywords)} ${translate(CATEGORY_LABELS.get(entry.category) ?? '')} ${translate(settingsSectionForCategory(entry.category).label)}`
        .toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .map((entry) => ({
      ...entry,
      categoryLabel: CATEGORY_LABELS.get(entry.category) ?? entry.category
    }));
}

export function settingsCategoryForFocusTarget(target: SettingsFocusTarget | null): SettingsCategoryId | null {
  if (target === 'language') return 'app';
  if (target === 'controller-power-saving') return 'connection-power';
  if (target === 'sleep-shortcut' || target === 'volume-shortcut' || target === 'shortcuts') return 'input';
  return null;
}
