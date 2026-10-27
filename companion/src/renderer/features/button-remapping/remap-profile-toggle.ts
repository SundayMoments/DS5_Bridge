import { DEFAULT_BUTTON_REMAP_PROFILE_ID } from '@shared/protocol';

// Ported from Kitsune Input's button remapping header: the header icon turns
// remapping off by switching to Default, and back on by restoring the last
// custom profile used.

export const LAST_CUSTOM_REMAP_PROFILE_STORAGE_KEY = 'ds5bridge.lastCustomRemapProfileId';

export interface RemapProfileToggle {
  /** The profile a click switches to, or null when there is nothing to restore. */
  readonly targetId: string | null;
  readonly disabled: boolean;
  /** Says which profile is active and what a click does. */
  readonly label: string;
}

export function readLastCustomRemapProfileId(storage: Pick<Storage, 'getItem'> = window.localStorage): string | null {
  try {
    const saved = storage.getItem(LAST_CUSTOM_REMAP_PROFILE_STORAGE_KEY);
    return saved && saved !== DEFAULT_BUTTON_REMAP_PROFILE_ID ? saved : null;
  } catch {
    return null;
  }
}

export function writeLastCustomRemapProfileId(profileId: string, storage: Pick<Storage, 'setItem'> = window.localStorage): void {
  if (profileId === DEFAULT_BUTTON_REMAP_PROFILE_ID) return;
  try {
    storage.setItem(LAST_CUSTOM_REMAP_PROFILE_STORAGE_KEY, profileId);
  } catch {
    // The toggle only loses its restore target.
  }
}

export function remapProfileToggle(
  profiles: ReadonlyArray<{ readonly id: string; readonly name: string }>,
  selectedProfileId: string,
  lastCustomProfileId: string | null,
  busy: boolean
): RemapProfileToggle {
  const selected = profiles.find((profile) => profile.id === selectedProfileId);
  if (selectedProfileId !== DEFAULT_BUTTON_REMAP_PROFILE_ID) {
    return {
      targetId: DEFAULT_BUTTON_REMAP_PROFILE_ID,
      disabled: busy,
      label: `${selected?.name ?? 'Custom'} button mapping profile active. Switch to Default.`
    };
  }
  const restore = profiles.find((profile) => (
    profile.id !== DEFAULT_BUTTON_REMAP_PROFILE_ID && profile.id === lastCustomProfileId
  ));
  return {
    targetId: restore?.id ?? null,
    disabled: busy || !restore,
    label: restore
      ? `Default button mapping profile active. Restore ${restore.name}.`
      : 'Default button mapping profile active. No previous custom profile available.'
  };
}
