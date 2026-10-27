import { describe, expect, it } from 'vitest';
import {
  LAST_CUSTOM_REMAP_PROFILE_STORAGE_KEY,
  readLastCustomRemapProfileId,
  remapProfileToggle,
  writeLastCustomRemapProfileId
} from './remap-profile-toggle';

const PROFILES = [{ id: 'default', name: 'Default' }, { id: 'fps', name: 'FPS' }, { id: 'racing', name: 'Racing' }];

describe('Button remapping profile toggle', () => {
  it('switches a custom profile to Default', () => {
    expect(remapProfileToggle(PROFILES, 'racing', 'fps', false)).toEqual({
      targetId: 'default', disabled: false, label: 'Racing button mapping profile active. Switch to Default.'
    });
  });

  it('restores the last custom profile from Default, and only one that still exists', () => {
    expect(remapProfileToggle(PROFILES, 'default', 'fps', false)).toEqual({
      targetId: 'fps', disabled: false, label: 'Default button mapping profile active. Restore FPS.'
    });
    expect(remapProfileToggle(PROFILES, 'default', 'deleted', false)).toEqual({
      targetId: null, disabled: true,
      label: 'Default button mapping profile active. No previous custom profile available.'
    });
    expect(remapProfileToggle(PROFILES, 'default', null, false).disabled).toBe(true);
  });

  it('locks while another action is pending', () => {
    expect(remapProfileToggle(PROFILES, 'fps', null, true).disabled).toBe(true);
    expect(remapProfileToggle(PROFILES, 'default', 'fps', true).disabled).toBe(true);
  });

  it('remembers only custom profiles and survives storage failures', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); }
    };
    writeLastCustomRemapProfileId('default', storage);
    expect(readLastCustomRemapProfileId(storage)).toBeNull();
    writeLastCustomRemapProfileId('fps', storage);
    expect(values.get(LAST_CUSTOM_REMAP_PROFILE_STORAGE_KEY)).toBe('fps');
    expect(readLastCustomRemapProfileId(storage)).toBe('fps');
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readLastCustomRemapProfileId(broken)).toBeNull();
    expect(() => writeLastCustomRemapProfileId('fps', broken)).not.toThrow();
  });
});
