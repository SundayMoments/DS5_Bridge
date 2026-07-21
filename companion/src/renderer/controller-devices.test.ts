import { describe, expect, it } from 'vitest';
import type {
  BridgeStatusPayload,
  CompanionDeviceIdentityPayload
} from '../shared/protocol';
import {
  CONTROLLER_DEVICE_CACHE_LIMIT,
  CONTROLLER_DEVICE_CACHE_STORAGE_KEY,
  buildDevicesModel,
  cachedControllerDeviceFromSnapshot,
  controllerDeviceCachesEqual,
  controllerDeviceName,
  loadControllerDeviceCache,
  observeControllerDevice,
  reconcileControllerDeviceCache,
  renameControllerDevice,
  saveControllerDeviceCache,
  type CachedControllerDevice,
  type ControllerDeviceStorage
} from './controller-devices';

function status(
  controllerType: BridgeStatusPayload['controllerType'] = 'dualsense',
  batteryPercent: number | null = 80
): Pick<BridgeStatusPayload, 'controllerConnected' | 'controllerType' | 'batteryPercent'> {
  return { controllerConnected: true, controllerType, batteryPercent };
}

function identity(
  bluetoothAddress: string,
  overrides: Partial<CompanionDeviceIdentityPayload> = {}
): CompanionDeviceIdentityPayload {
  return {
    schemaVersion: 1,
    controllerConnected: true,
    pairingActive: false,
    addressKnown: true,
    bluetoothAddress,
    linkKeyKnown: true,
    linkKeyType: 5,
    controllerName: 'DualSense Wireless Controller',
    vendorId: 0x054c,
    productId: 0x0ce6,
    protocolVersion: '1.17',
    ...overrides
  };
}

function device(address: string, lastSeenAt: number): CachedControllerDevice {
  return {
    key: address,
    controllerType: 'dualsense',
    controllerName: 'DualSense',
    customName: null,
    bluetoothAddress: address,
    vendorId: 0x054c,
    productId: 0x0ce6,
    linkKeyKnown: true,
    batteryPercent: 80,
    lastSeenAt
  };
}

function memoryStorage(initial: string | null = null): ControllerDeviceStorage & {
  value: string | null;
} {
  return {
    value: initial,
    getItem: () => initial,
    setItem(_key, value) {
      this.value = value;
      initial = value;
    },
    removeItem() {
      this.value = null;
      initial = null;
    }
  };
}

describe('controller device cache', () => {
  it('normalizes stock controller names and known USB identities', () => {
    expect(controllerDeviceName('dualsense', 'DualSense Wireless Controller')).toBe('DualSense');
    expect(controllerDeviceName('dualsense-edge', 'DualSense Edge Wireless Controller')).toBe('DualSense Edge');
    expect(controllerDeviceName('dualsense', 'Living Room')).toBe('Living Room');

    expect(cachedControllerDeviceFromSnapshot(
      status('dualsense-edge', 70),
      identity('aa:bb:cc:dd:ee:ff', {
        controllerName: 'DualSense Edge Wireless Controller',
        vendorId: null,
        productId: null
      }),
      100
    )).toMatchObject({
      key: 'AA:BB:CC:DD:EE:FF',
      controllerName: 'DualSense Edge',
      vendorId: 0x054c,
      productId: 0x0df2,
      batteryPercent: 70,
      lastSeenAt: 100
    });
  });

  it('keeps only unique address-backed history up to the cache limit', () => {
    const devices = Array.from({ length: CONTROLLER_DEVICE_CACHE_LIMIT + 2 }, (_, index) => (
      device(`AA:BB:CC:DD:EE:${index.toString(16).padStart(2, '0').toUpperCase()}`, index)
    ));
    const duplicate = { ...devices[0], customName: 'Desk' };
    const reconciled = reconcileControllerDeviceCache([duplicate, ...devices]);

    expect(reconciled).toHaveLength(CONTROLLER_DEVICE_CACHE_LIMIT);
    expect(reconciled[0]?.customName).toBe('Desk');
    expect(new Set(reconciled.map((entry) => entry.bluetoothAddress)).size).toBe(reconciled.length);
  });

  it('preserves a local name while refreshing live battery and bond data', () => {
    const existing = { ...device('AA:BB:CC:DD:EE:FF', 10), customName: 'Desk Pad' };
    const observed = observeControllerDevice(
      [existing],
      status('dualsense', 40),
      identity('AA:BB:CC:DD:EE:FF', { linkKeyKnown: false }),
      20
    );

    expect(observed).toHaveLength(1);
    expect(observed[0]).toMatchObject({
      customName: 'Desk Pad',
      batteryPercent: 40,
      linkKeyKnown: false,
      lastSeenAt: 20
    });
  });

  it('does not treat a last-seen timestamp refresh as a material cache change', () => {
    const before = device('AA:BB:CC:DD:EE:FF', 10);
    expect(controllerDeviceCachesEqual([before], [{ ...before, lastSeenAt: 20 }])).toBe(true);
    expect(controllerDeviceCachesEqual([before], [{ ...before, batteryPercent: 70 }])).toBe(false);
  });

  it('repairs malformed storage and persists renames', () => {
    const malformed = memoryStorage('{nope');
    expect(loadControllerDeviceCache(malformed, 100)).toEqual([]);
    expect(malformed.value).toBeNull();

    const storage = memoryStorage();
    const renamed = renameControllerDevice(
      [device('AA:BB:CC:DD:EE:FF', 10)],
      'AA:BB:CC:DD:EE:FF',
      '  Couch  ',
      30
    );
    expect(saveControllerDeviceCache(storage, renamed)).toBe(true);
    expect(storage.value).toContain('"customName":"Couch"');
    expect(loadControllerDeviceCache(storage, 40)[0]?.customName).toBe('Couch');
    expect(CONTROLLER_DEVICE_CACHE_STORAGE_KEY).toBe('ds5bridge.controllerDeviceCache.v1');
  });
});

describe('Devices model', () => {
  it('projects current and last controllers with pairing actions', () => {
    const currentIdentity = identity('AA:BB:CC:DD:EE:FF', {
      pairingActive: false
    });
    const cached = [
      device('11:22:33:44:55:66', 5),
      device('22:33:44:55:66:77', 3),
      { ...device('AA:BB:CC:DD:EE:FF', 4), customName: 'Primary' }
    ];
    const model = buildDevicesModel({
      bridgeConnected: true,
      status: status('dualsense-edge', 60) as BridgeStatusPayload,
      identity: currentIdentity,
      cachedDevices: cached,
      pendingAction: null,
      now: 10
    });

    expect(model.healthLabel).toBe('Connected');
    expect(model.pairingAction.label).toBe('Disconnect & Pair New');
    expect(model.cards.map((card) => card.label)).toEqual([
      'Current controller',
      'Last controller',
      'Previous controller'
    ]);
    expect(model.cards[0]?.title).toBe('Primary');
    expect(model.cards[0]?.infoRows).toContainEqual({
      id: 'address',
      label: 'Address',
      value: 'AA:BB:CC:DD:EE:FF'
    });
  });

  it('labels only the newest cached device as the last controller while offline', () => {
    const model = buildDevicesModel({
      bridgeConnected: false,
      status: null,
      identity: null,
      cachedDevices: [
        device('AA:BB:CC:DD:EE:FF', 20),
        device('11:22:33:44:55:66', 10)
      ],
      pendingAction: null
    });

    expect(model.cards.map((card) => card.label)).toEqual([
      'Last controller',
      'Previous controller'
    ]);
  });

  it('locks actions while firmware pairing is active', () => {
    const model = buildDevicesModel({
      bridgeConnected: true,
      status: null,
      identity: identity('AA:BB:CC:DD:EE:FF', {
        controllerConnected: false,
        pairingActive: true
      }),
      cachedDevices: [],
      pendingAction: null
    });

    expect(model.pairingAction).toMatchObject({
      label: 'Pairing...',
      disabled: true
    });
    expect(model.emptyStatus).toBe('Connect a controller to save it here.');
  });

  it('describes pairing accurately when the bridge is waiting or offline', () => {
    const waiting = buildDevicesModel({
      bridgeConnected: true,
      status: null,
      identity: null,
      cachedDevices: [],
      pendingAction: null
    });
    expect(waiting.pairingAction).toMatchObject({
      label: 'Enter Pairing Mode',
      title: 'Enter controller pairing mode',
      disabled: false
    });

    const offline = buildDevicesModel({
      bridgeConnected: false,
      status: null,
      identity: null,
      cachedDevices: [],
      pendingAction: null
    });
    expect(offline.pairingAction).toMatchObject({
      label: 'Bridge Not Connected',
      title: 'Connect the bridge to manage controller pairing',
      disabled: true
    });
  });
});
