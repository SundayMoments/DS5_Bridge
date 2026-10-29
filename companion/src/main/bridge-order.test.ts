import { describe, expect, it } from 'vitest';
import type { CompanionSettings } from '../shared/types';
import {
  claimBridgeContainer,
  orderBridgesByIdentity,
  projectBridgeDevices,
  uniqueIdForContainer,
  uniquePhysicalBridges
} from './bridge-order';

const DESK = 'aaaaaaaaaaaaaaaa';
const COUCH = 'bbbbbbbbbbbbbbbb';
const C_DESK = '11111111-1111-1111-1111-111111111111';
const C_DESK_BRIDGE_ONLY = '11111111-0000-0000-0000-000000000000';
const C_COUCH = '22222222-2222-2222-2222-222222222222';
const C_NEW = '33333333-3333-3333-3333-333333333333';
const PERSONA_PATH = 'winusb://vid_054c&pid_0ce6&mi_05#desk';
const BRIDGE_ONLY_PATH = 'winusb://vid_1209&pid_db08&mi_01#desk';

function identities(): CompanionSettings['bridgeIdentities'] {
  return {
    [DESK]: { label: 'Desk', containerId: C_DESK, containerIds: [C_DESK, C_DESK_BRIDGE_ONLY] },
    [COUCH]: { label: null, containerId: C_COUCH }
  };
}

function project(overrides: Partial<Parameters<typeof projectBridgeDevices>[0]> = {}) {
  return projectBridgeDevices({
    census: [],
    identities: identities(),
    selectedPath: null,
    selectedUniqueId: null,
    activePath: null,
    activeUniqueId: null,
    ...overrides
  });
}

describe('bridge ranking', () => {
  it('ranks bridges by when they were first recorded, then unrecorded ones by container and path', () => {
    const bridges = project({
      census: [
        { path: 'winusb://zz-unknown', containerId: null },
        { path: 'winusb://new', containerId: C_NEW },
        { path: 'winusb://couch', containerId: C_COUCH },
        { path: BRIDGE_ONLY_PATH, containerId: C_DESK_BRIDGE_ONLY }
      ]
    });

    expect(bridges.map((bridge) => [bridge.path, bridge.uniqueId, bridge.name])).toEqual([
      [BRIDGE_ONLY_PATH, DESK, 'Desk'],
      ['winusb://couch', COUCH, null],
      ['winusb://new', null, null],
      ['winusb://zz-unknown', null, null]
    ]);
  });

  it('knows a bridge on any container it has used, so it keeps its name and rank across a reattach', () => {
    const asPersona = project({ census: [{ path: PERSONA_PATH, containerId: C_DESK }] });
    const asBridgeOnly = project({ census: [{ path: BRIDGE_ONLY_PATH, containerId: C_DESK_BRIDGE_ONLY }] });

    expect(asPersona[0]).toMatchObject({ uniqueId: DESK, name: 'Desk' });
    expect(asBridgeOnly[0]).toMatchObject({ uniqueId: DESK, name: 'Desk' });
  });

  it('knows a bridge-only receiver by the board ID in its USB serial, even on a new container', () => {
    const [bridge] = project({
      census: [{ path: 'winusb://vid_1209&pid_db08&mi_01#new-port', containerId: C_NEW, uniqueId: COUCH }]
    });

    expect(bridge).toMatchObject({ uniqueId: COUCH, name: null });
    expect(project({ census: [{ path: 'winusb://x', containerId: C_COUCH, uniqueId: DESK }] })[0])
      .toMatchObject({ uniqueId: DESK, name: 'Desk' });
  });

  it('names no bridge from a container two identities share', () => {
    const shared: CompanionSettings['bridgeIdentities'] = {
      [DESK]: { label: 'Desk', containerId: C_DESK },
      [COUCH]: { label: 'Couch', containerId: C_DESK }
    };

    expect(uniqueIdForContainer(C_DESK, shared)).toBeNull();
    expect(uniqueIdForContainer(C_DESK.toUpperCase(), identities())).toBe(DESK);
  });

  it('takes the connected bridge’s firmware ID over a container record', () => {
    const [bridge] = project({
      census: [{ path: 'winusb://couch', containerId: C_COUCH }],
      activePath: 'WINUSB://COUCH',
      activeUniqueId: DESK
    });

    expect(bridge).toMatchObject({ uniqueId: DESK, name: 'Desk', connected: true, selected: true });
  });

  it('marks the selected bridge by path or by identity', () => {
    const byIdentity = project({
      census: [
        { path: 'winusb://couch', containerId: C_COUCH },
        { path: BRIDGE_ONLY_PATH, containerId: C_DESK_BRIDGE_ONLY }
      ],
      // Saved on the persona path; the bridge is now on its bridge-only one.
      selectedPath: PERSONA_PATH,
      selectedUniqueId: DESK
    });

    expect(byIdentity.map((bridge) => [bridge.path, bridge.selected])).toEqual([
      [BRIDGE_ONLY_PATH, true],
      ['winusb://couch', false]
    ]);
  });

  it('lists each physical bridge once, keeping the connected row at the first row’s rank', () => {
    const bridges = project({
      census: [
        { path: 'winusb://couch', containerId: C_COUCH },
        { path: PERSONA_PATH, containerId: C_DESK },
        // Still listed from before the bridge reattached; it ranks first of the two.
        { path: BRIDGE_ONLY_PATH, containerId: C_DESK_BRIDGE_ONLY },
        { path: 'winusb://unknown-b', containerId: null },
        { path: 'winusb://unknown-a', containerId: null }
      ],
      activePath: PERSONA_PATH,
      activeUniqueId: DESK
    });

    expect(bridges.map((bridge) => [bridge.path, bridge.connected])).toEqual([
      [PERSONA_PATH, true],
      ['winusb://couch', false],
      ['winusb://unknown-a', false],
      ['winusb://unknown-b', false]
    ]);
  });

  it('prefers the connected row, then the selected one, between rows of one bridge', () => {
    const row = (path: string, connected: boolean, selected: boolean) => ({
      path, containerId: null, uniqueId: DESK, name: null, connected, selected
    });

    expect(uniquePhysicalBridges([row('a', false, false), row('b', false, true)])[0]!.path).toBe('b');
    expect(uniquePhysicalBridges([row('a', false, true), row('b', true, false)])[0]!.path).toBe('b');
    expect(uniquePhysicalBridges([row('a', true, false), row('b', false, true)])[0]!.path).toBe('a');
  });

  it('keeps the shared identity-order rule for any row type', () => {
    const ordered = orderBridgesByIdentity(
      [{ path: 'b', containerId: C_COUCH }, { path: 'a', containerId: C_DESK }],
      identities(),
      (bridge) => uniqueIdForContainer(bridge.containerId, identities())
    );
    expect(ordered.map((bridge) => bridge.path)).toEqual(['a', 'b']);
  });
});

describe('bridge container records', () => {
  it('adds a bridge-only container without replacing the controller-persona one', () => {
    const before = { [DESK]: { label: 'Desk', containerId: C_DESK } };

    const after = claimBridgeContainer(before, DESK, C_DESK_BRIDGE_ONLY, true);

    expect(after).toEqual({
      [DESK]: { label: 'Desk', containerId: C_DESK, containerIds: [C_DESK, C_DESK_BRIDGE_ONLY] }
    });
    expect(claimBridgeContainer(after!, DESK, C_DESK_BRIDGE_ONLY, true)).toBeNull();
    expect(claimBridgeContainer(after!, DESK, C_DESK, false)).toBeNull();
  });

  it('makes a new controller-persona container the latest one and keeps the others', () => {
    const after = claimBridgeContainer(identities(), DESK, C_NEW, false);

    expect(after?.[DESK]).toEqual({
      label: 'Desk',
      containerId: C_NEW,
      containerIds: [C_NEW, C_DESK, C_DESK_BRIDGE_ONLY]
    });
  });

  it('takes the container from any other identity and keeps every bridge’s rank', () => {
    const after = claimBridgeContainer(identities(), COUCH, C_DESK_BRIDGE_ONLY, true);

    expect(Object.keys(after!)).toEqual([DESK, COUCH]);
    expect(after?.[DESK]).toEqual({ label: 'Desk', containerId: C_DESK });
    expect(after?.[COUCH]).toEqual({
      label: null,
      containerId: C_COUCH,
      containerIds: [C_COUCH, C_DESK_BRIDGE_ONLY]
    });
  });

  it('records a bridge first seen as bridge-only after the bridges recorded before it', () => {
    const after = claimBridgeContainer(identities(), 'cccccccccccccccc', C_NEW, true);

    expect(Object.keys(after!)).toEqual([DESK, COUCH, 'cccccccccccccccc']);
    expect(after?.cccccccccccccccc).toEqual({ label: null, containerId: null, containerIds: [C_NEW] });
  });
});
