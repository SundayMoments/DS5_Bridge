import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_BUTTON_REMAP_PROFILE_ID, DEFAULT_CONTROLLER_PROFILE_ID } from '../shared/protocol';
import { orderBridgesByIdentity } from './bridge-order';
import { bridgeWorkspaceKey } from './settings-bridge-workspaces';
import { SettingsStore } from './settings-store';

const BRIDGE_A = { selectedBridgePath: 'winusb://bridge-a', selectedBridgeUniqueId: 'aaaaaaaaaaaaaaaa' };
const BRIDGE_B = { selectedBridgePath: 'winusb://bridge-b', selectedBridgeUniqueId: 'bbbbbbbbbbbbbbbb' };

describe('bridge workspaces', () => {
  const tempDirs: string[] = [];

  function tempUserDataPath(): string {
    const tempDir = mkdtempSync(path.join(tmpdir(), 'ds5-bridge-workspaces-'));
    tempDirs.push(tempDir);
    return tempDir;
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  const profileNames = (store: SettingsStore) => store.get().controllerProfiles.map((profile) => profile.name);
  const remapProfileNames = (store: SettingsStore) => store.get().buttonRemappingProfiles.map((profile) => profile.name);

  it('keeps profiles and controller settings with the bridge they were made on', () => {
    const store = new SettingsStore(tempUserDataPath());
    store.update(BRIDGE_A);
    store.update({ hapticsGainPercent: 150 });
    store.saveControllerProfile('Racing');
    store.saveButtonRemappingProfile('Swap');

    // A bridge seen for the first time starts from defaults.
    store.update(BRIDGE_B);
    expect(profileNames(store)).toEqual(['Default']);
    expect(remapProfileNames(store)).toEqual(['Default']);
    expect(store.get()).toMatchObject({
      hapticsGainPercent: 100,
      selectedControllerProfileId: DEFAULT_CONTROLLER_PROFILE_ID,
      selectedButtonRemappingProfileId: DEFAULT_BUTTON_REMAP_PROFILE_ID
    });
    store.saveControllerProfile('Couch');

    store.update(BRIDGE_A);
    // Editing a setting on Default made A's Custom profile before Racing was saved.
    expect(profileNames(store)).toEqual(['Default', 'Custom', 'Racing']);
    expect(remapProfileNames(store)).toEqual(['Default', 'Swap']);
    expect(store.get().hapticsGainPercent).toBe(150);

    store.update(BRIDGE_B);
    expect(profileNames(store)).toEqual(['Default', 'Couch']);
  });

  it('keeps app-wide settings shared between bridges', () => {
    const store = new SettingsStore(tempUserDataPath());
    store.update(BRIDGE_A);
    store.update({ uiThemePreset: 'light', notifyLowBattery: true });
    store.update(BRIDGE_B);
    expect(store.get()).toMatchObject({ uiThemePreset: 'light', notifyLowBattery: true });
  });

  it('gives settings saved before workspaces to the bridge last used', () => {
    const userDataPath = tempUserDataPath();
    writeFileSync(path.join(userDataPath, 'settings.json'), JSON.stringify({
      selectedBridgePath: BRIDGE_A.selectedBridgePath,
      hapticsGainPercent: 175,
      controllerProfiles: [
        { id: DEFAULT_CONTROLLER_PROFILE_ID, name: 'Default', settings: {} },
        { id: 'profile-old', name: 'Old Favourite', settings: {} }
      ]
    }));
    const store = new SettingsStore(userDataPath);
    // The firmware reports the bridge's ID for the same path: only the key changes.
    store.update({ selectedBridgeUniqueId: BRIDGE_A.selectedBridgeUniqueId });
    expect(profileNames(store)).toEqual(['Default', 'Old Favourite']);

    store.update(BRIDGE_B);
    expect(profileNames(store)).toEqual(['Default']);
    store.update(BRIDGE_A);
    expect(profileNames(store)).toEqual(['Default', 'Old Favourite']);
    expect(store.get().hapticsGainPercent).toBe(175);
  });

  it('lets the first bridge selected inherit the live settings', () => {
    const store = new SettingsStore(tempUserDataPath());
    store.saveControllerProfile('Before Any Bridge');
    store.update(BRIDGE_A);
    expect(profileNames(store)).toEqual(['Default', 'Before Any Bridge']);
  });

  it('moves a path-keyed workspace to the unique ID when the bridge reports it', () => {
    const store = new SettingsStore(tempUserDataPath());
    store.update(BRIDGE_A);
    store.update({ selectedBridgePath: 'winusb://new-bridge', selectedBridgeUniqueId: null });
    store.saveControllerProfile('Made Before Identity');
    store.update({ selectedBridgeUniqueId: 'cccccccccccccccc' });
    expect(profileNames(store)).toEqual(['Default', 'Made Before Identity']);
    expect(store.get().bridgeWorkspaces.cccccccccccccccc.controllerProfiles.map((profile) => profile.name))
      .toEqual(['Default', 'Made Before Identity']);
  });

  it('restores defaults on the selected bridge only', () => {
    const store = new SettingsStore(tempUserDataPath());
    store.update(BRIDGE_A);
    store.saveControllerProfile('Keep Me');
    store.update(BRIDGE_B);
    store.update({ hapticsGainPercent: 50 });
    store.restoreDefaults();
    expect(store.get()).toMatchObject({ ...BRIDGE_B, hapticsGainPercent: 100 });
    store.update(BRIDGE_A);
    expect(profileNames(store)).toEqual(['Default', 'Keep Me']);
  });

  it('persists workspaces and normalizes them on load', () => {
    const userDataPath = tempUserDataPath();
    const store = new SettingsStore(userDataPath);
    store.update(BRIDGE_A);
    store.saveControllerProfile('Racing');
    store.update(BRIDGE_B);
    const persisted = JSON.parse(readFileSync(path.join(userDataPath, 'settings.json'), 'utf8'));
    persisted.bridgeWorkspaces['not a key'] = { hapticsGainPercent: 10 };
    persisted.bridgeWorkspaces.bbbbbbbbbbbbbbbb.hapticsGainPercent = 9999;
    writeFileSync(path.join(userDataPath, 'settings.json'), JSON.stringify(persisted));

    const reloaded = new SettingsStore(userDataPath);
    expect(Object.keys(reloaded.get().bridgeWorkspaces).sort()).toEqual(['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb']);
    expect(reloaded.get().bridgeWorkspaces.bbbbbbbbbbbbbbbb.hapticsGainPercent).toBe(500);
    reloaded.update(BRIDGE_A);
    expect(profileNames(reloaded)).toEqual(['Default', 'Racing']);
  });

  it('keys a workspace by unique ID, falling back to the device path', () => {
    expect(bridgeWorkspaceKey('AAAAAAAAAAAAAAAA', 'winusb://x')).toBe('aaaaaaaaaaaaaaaa');
    expect(bridgeWorkspaceKey(null, 'WinUSB://X')).toBe('path:winusb://x');
    expect(bridgeWorkspaceKey('not-an-id', null)).toBeNull();
  });
});

describe('orderBridgesByIdentity', () => {
  it('lists bridges in the order they were first recorded, then the rest by container', () => {
    const identities = {
      bbbbbbbbbbbbbbbb: { label: null, containerId: 'container-b' },
      aaaaaaaaaaaaaaaa: { label: null, containerId: 'container-a' }
    };
    const idByContainer: Record<string, string> = { 'container-a': 'aaaaaaaaaaaaaaaa', 'container-b': 'bbbbbbbbbbbbbbbb' };
    const bridges = [
      { path: 'a', containerId: 'container-a' },
      { path: 'z', containerId: 'container-z' },
      { path: 'b', containerId: 'container-b' },
      { path: 'y', containerId: 'container-y' }
    ];
    const ordered = orderBridgesByIdentity(bridges, identities, (bridge) => idByContainer[bridge.containerId] ?? null);
    expect(ordered.map((bridge) => bridge.path)).toEqual(['b', 'a', 'y', 'z']);
  });
});
