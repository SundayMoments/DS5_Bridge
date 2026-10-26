import type { ReactNode } from 'react';
import type { SettingsSearchEntryId } from './settings-navigation';
import type { SettingsPageActions, SettingsPageModel } from './types';

export interface SettingsCategoryProps {
  readonly model: SettingsPageModel;
  readonly actions: SettingsPageActions;
  readonly matchingSettingIds: ReadonlySet<SettingsSearchEntryId> | null;
}

export function SearchableSetting({ id, matchingSettingIds, children }: {
  readonly id: SettingsSearchEntryId;
  readonly matchingSettingIds: ReadonlySet<SettingsSearchEntryId> | null;
  readonly children: ReactNode;
}) {
  const excluded = Boolean(matchingSettingIds && !matchingSettingIds.has(id));
  return excluded ? null : <>{children}</>;
}

export function SettingsGroupLabel({ label, ids, matchingSettingIds }: {
  readonly label: string;
  readonly ids: readonly SettingsSearchEntryId[];
  readonly matchingSettingIds: ReadonlySet<SettingsSearchEntryId> | null;
}) {
  if (matchingSettingIds && !ids.some((id) => matchingSettingIds.has(id))) return null;
  return <h3 className="settings-menu-section-label">{label}</h3>;
}

/**
 * Says once per page that bridge-stored settings need a connected bridge, in
 * place of the same reason under every row. In search results it appears only
 * above sections where one of `ids` matches.
 */
export function SettingsBridgeNotice({ model, ids, matchingSettingIds }: {
  readonly model: SettingsPageModel;
  readonly ids: readonly SettingsSearchEntryId[];
  readonly matchingSettingIds: ReadonlySet<SettingsSearchEntryId> | null;
}) {
  if (model.connected) return null;
  if (matchingSettingIds && !ids.some((id) => matchingSettingIds.has(id))) return null;
  return <p className="settings-bridge-notice" role="note">Connect a bridge to change the settings stored on it.</p>;
}

/** Explains a control the connected firmware does not offer. A missing bridge is explained once by SettingsBridgeNotice. */
export function settingsUnsupportedMessage(model: SettingsPageModel, supported: boolean): string | undefined {
  return model.connected && !supported ? 'Not supported by this bridge firmware.' : undefined;
}
