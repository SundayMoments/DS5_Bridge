import { describe, expect, it } from 'vitest';
import type { BridgeSnapshot } from '@shared/types';
import { bridgeSelectorModel, sidebarDevicePresentation } from './sidebar-device';

function snapshot({
  state = 'connected',
  controllerConnected = true,
  rawPowerState = 0,
  personaTransition = null,
  bridgeDevices = null
}: {
  state?: BridgeSnapshot['state'];
  controllerConnected?: boolean;
  rawPowerState?: number;
  personaTransition?: unknown;
  bridgeDevices?: unknown;
} = {}): BridgeSnapshot {
  return {
    state,
    personaTransition,
    bridgeDevices,
    status: { controllerConnected, controllerType: 'dualsense-edge', batteryPercent: 64, rawPowerState }
  } as unknown as BridgeSnapshot;
}

const CARDS = [
  { label: 'Saved controller', title: 'Living Room' },
  { label: 'Current controller', title: 'Desk Edge' }
];

describe('sidebar device card', () => {
  it('mirrors the current controller card from Devices', () => {
    expect(sidebarDevicePresentation(snapshot(), CARDS, 'art.svg')).toEqual({
      title: 'Desk Edge',
      status: 'Connected',
      tone: 'good',
      batteryLabel: '64%',
      powerLabel: null,
      controllerArt: 'art.svg'
    });
    expect(sidebarDevicePresentation(snapshot(), [CARDS[0]], 'art.svg').title).toBe('Living Room');
    expect(sidebarDevicePresentation(snapshot(), [], 'art.svg').title).toBe('DualSense Edge');
  });

  it('carries the state in the card border tone', () => {
    expect(sidebarDevicePresentation(snapshot({ controllerConnected: false }), [], 'a').tone).toBe('warn');
    expect(sidebarDevicePresentation(snapshot({ state: 'error' }), [], 'a').tone).toBe('bad');
    expect(sidebarDevicePresentation(snapshot({ state: 'incompatible' }), [], 'a').tone).toBe('bad');
    expect(sidebarDevicePresentation(snapshot({ state: 'no-bridge' }), [], 'a')).toMatchObject({
      tone: 'idle',
      status: 'Disconnected',
      title: 'Controller',
      batteryLabel: '—'
    });
    expect(sidebarDevicePresentation(snapshot({ personaTransition: { to: 'xbox' } }), CARDS, 'a')).toMatchObject({
      tone: 'warn',
      status: 'Switching',
      title: 'Switching Mode',
      batteryLabel: '—'
    });
  });

  it('tells charging apart from external power', () => {
    expect(sidebarDevicePresentation(snapshot({ rawPowerState: 0x01 }), [], 'a').powerLabel).toBe('Charging');
    expect(sidebarDevicePresentation(snapshot({ rawPowerState: 0x02 }), [], 'a').powerLabel).toBe('Connected to power');
  });
});

describe('bridge selector', () => {
  it('names each bridge without an active marker and picks the selected bridge', () => {
    const model = bridgeSelectorModel(snapshot({
      bridgeDevices: {
        bridges: [
          { path: 'a', name: 'Desk', uniqueId: '1', selected: false, connected: false },
          { path: 'b', name: null, uniqueId: '2', selected: true, connected: true }
        ],
        directControllers: [{ path: 'usb', product: 'DualSense' }]
      }
    }));
    expect(model.bridges).toEqual([
      { label: 'Desk', path: 'a' },
      { label: 'Bridge 2', path: 'b' }
    ]);
    expect(model).toMatchObject({ selectedPath: 'b', selectedName: null, selectedUniqueId: '2' });
    expect(model.directControllers).toEqual([{ path: 'usb', product: 'DualSense' }]);
  });

  it('falls back to the connected bridge, then asks for one as Kitsune Input does', () => {
    const bridges = [
      { path: 'a', name: 'A', uniqueId: '1', selected: false, connected: false },
      { path: 'b', name: 'B', uniqueId: '2', selected: false, connected: true }
    ];
    expect(bridgeSelectorModel(snapshot({ bridgeDevices: { bridges, directControllers: [] } })).selectedPath).toBe('b');
    // The selected bridge was unplugged: the one left is listed, not shown as in use.
    expect(bridgeSelectorModel(snapshot({ bridgeDevices: { bridges: [bridges[0]], directControllers: [] } })))
      .toMatchObject({ selectedPath: '', selectedName: null, emptyLabel: 'Select bridge' });
    expect(bridgeSelectorModel(snapshot())).toMatchObject({
      bridges: [],
      selectedPath: '',
      directControllers: [],
      emptyLabel: 'No bridge detected'
    });
  });
});
