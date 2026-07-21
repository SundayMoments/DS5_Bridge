import type {
  BridgeStatusPayload,
  CompanionDeviceIdentityPayload
} from '../shared/protocol';

export const CONTROLLER_DEVICE_CACHE_STORAGE_KEY = 'ds5bridge.controllerDeviceCache.v1';
export const CONTROLLER_DEVICE_CACHE_LIMIT = 4;

export type ControllerDeviceType = BridgeStatusPayload['controllerType'];

export interface CachedControllerDevice {
  key: string;
  controllerType: ControllerDeviceType;
  controllerName: string | null;
  customName: string | null;
  bluetoothAddress: string;
  vendorId: number | null;
  productId: number | null;
  linkKeyKnown: boolean | null;
  batteryPercent: number | null;
  lastSeenAt: number;
}

export interface ControllerDeviceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DevicesInfoRow {
  id: 'controller' | 'address' | 'pairing' | 'vendor-product' | 'power';
  label: string;
  value: string;
}

export interface DevicesCardModel {
  key: string;
  controllerType: ControllerDeviceType;
  label: 'Current controller' | 'Last controller' | 'Previous controller';
  title: string;
  status: 'Connected' | 'Not connected' | 'Bridge offline';
  bluetoothAddress: string | null;
  infoRows: DevicesInfoRow[];
  tone: 'connected' | 'cached';
  forgetDisabled: boolean;
  forgetTitle: string;
}

export interface DevicesModel {
  bridgeConnected: boolean;
  controllerConnected: boolean;
  healthLabel: 'Connected' | 'Waiting' | 'Offline';
  healthTone: 'good' | 'warn' | 'idle';
  pairingActive: boolean;
  pairingAction: {
    label: string;
    title: string;
    disabled: boolean;
    pending: boolean;
  };
  forgetAllAction: {
    label: string;
    title: string;
    disabled: boolean;
    pending: boolean;
  };
  cards: DevicesCardModel[];
  emptyStatus: string;
}

function normalizedBluetoothAddress(address: unknown): string | null {
  if (typeof address !== 'string') return null;
  const normalized = address.trim().toUpperCase();
  return /^[\dA-F]{2}(?::[\dA-F]{2}){5}$/.test(normalized)
    && normalized !== '00:00:00:00:00:00'
    ? normalized
    : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nullableBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function isControllerDeviceType(value: unknown): value is ControllerDeviceType {
  return value === 'unknown' || value === 'dualsense' || value === 'dualsense-edge';
}

export function controllerDeviceName(
  type: ControllerDeviceType | undefined,
  name: string | null | undefined
): string {
  const normalized = name?.trim();
  const stockEdgeName = /^dualsense edge wireless cont/i.test(normalized ?? '');
  const stockDualSenseName = /^dualsense wireless cont/i.test(normalized ?? '');
  if (normalized && !stockEdgeName && !stockDualSenseName) return normalized;
  if (type === 'dualsense-edge' || stockEdgeName) return 'DualSense Edge';
  if (type === 'dualsense' || stockDualSenseName) return 'DualSense';
  return normalized ?? 'Controller';
}

export function controllerKnownVendorProduct(
  type: ControllerDeviceType | undefined
): { vendorId: number; productId: number } | null {
  if (type === 'dualsense-edge') return { vendorId: 0x054c, productId: 0x0df2 };
  if (type === 'dualsense') return { vendorId: 0x054c, productId: 0x0ce6 };
  return null;
}

export function cachedControllerDeviceFromSnapshot(
  status: Pick<BridgeStatusPayload, 'controllerType' | 'batteryPercent'>,
  identity: CompanionDeviceIdentityPayload | null | undefined,
  now = Date.now()
): CachedControllerDevice | null {
  const bluetoothAddress = normalizedBluetoothAddress(identity?.bluetoothAddress);
  if (!bluetoothAddress) return null;
  const known = controllerKnownVendorProduct(status.controllerType);
  return {
    key: bluetoothAddress,
    controllerType: status.controllerType,
    controllerName: controllerDeviceName(status.controllerType, identity?.controllerName),
    customName: null,
    bluetoothAddress,
    vendorId: identity?.vendorId ?? known?.vendorId ?? null,
    productId: identity?.productId ?? known?.productId ?? null,
    linkKeyKnown: identity?.linkKeyKnown ?? null,
    batteryPercent: status.batteryPercent,
    lastSeenAt: now
  };
}

export function normalizeCachedControllerDevice(
  value: unknown,
  now = Date.now()
): CachedControllerDevice | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const bluetoothAddress = normalizedBluetoothAddress(record.bluetoothAddress);
  if (!bluetoothAddress) return null;
  const controllerType = isControllerDeviceType(record.controllerType)
    ? record.controllerType
    : 'unknown';
  return {
    key: bluetoothAddress,
    controllerType,
    controllerName: nullableString(record.controllerName),
    customName: nullableString(record.customName),
    bluetoothAddress,
    vendorId: nullableNumber(record.vendorId),
    productId: nullableNumber(record.productId),
    linkKeyKnown: nullableBoolean(record.linkKeyKnown),
    batteryPercent: nullableNumber(record.batteryPercent),
    lastSeenAt: nullableNumber(record.lastSeenAt) ?? now
  };
}

export function reconcileControllerDeviceCache(
  devices: readonly CachedControllerDevice[],
  nextDevice?: CachedControllerDevice | null,
  limit = CONTROLLER_DEVICE_CACHE_LIMIT
): CachedControllerDevice[] {
  const resolved: CachedControllerDevice[] = [];
  for (const candidate of nextDevice ? [nextDevice, ...devices] : devices) {
    const address = normalizedBluetoothAddress(candidate.bluetoothAddress);
    if (!address) continue;
    const existing = resolved.find((device) => device.bluetoothAddress === address);
    if (existing) {
      if (!existing.customName && candidate.customName) {
        existing.customName = candidate.customName;
      }
      continue;
    }
    resolved.push({
      ...candidate,
      key: address,
      bluetoothAddress: address
    });
  }
  return resolved.slice(0, Math.max(0, limit));
}

export function controllerDeviceCachesEqual(
  left: readonly CachedControllerDevice[],
  right: readonly CachedControllerDevice[]
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  return left.every((device, index) => {
    const other = right[index];
    return other !== undefined
      && device.key === other.key
      && device.controllerType === other.controllerType
      && device.controllerName === other.controllerName
      && device.customName === other.customName
      && device.bluetoothAddress === other.bluetoothAddress
      && device.vendorId === other.vendorId
      && device.productId === other.productId
      && device.linkKeyKnown === other.linkKeyKnown
      && device.batteryPercent === other.batteryPercent;
  });
}

export function observeControllerDevice(
  devices: readonly CachedControllerDevice[],
  status: Pick<BridgeStatusPayload, 'controllerType' | 'batteryPercent'>,
  identity: CompanionDeviceIdentityPayload | null | undefined,
  now = Date.now()
): CachedControllerDevice[] {
  const observation = cachedControllerDeviceFromSnapshot(status, identity, now);
  if (!observation) return [...devices];
  const existing = devices.find(
    (device) => device.bluetoothAddress === observation.bluetoothAddress
  );
  return reconcileControllerDeviceCache(devices, {
    ...observation,
    customName: existing?.customName ?? null
  });
}

export function loadControllerDeviceCache(
  storage: ControllerDeviceStorage,
  now = Date.now()
): CachedControllerDevice[] {
  try {
    const serialized = storage.getItem(CONTROLLER_DEVICE_CACHE_STORAGE_KEY);
    if (serialized === null) return [];
    const parsed = JSON.parse(serialized) as unknown;
    if (!Array.isArray(parsed)) {
      storage.removeItem(CONTROLLER_DEVICE_CACHE_STORAGE_KEY);
      return [];
    }
    const devices = reconcileControllerDeviceCache(
      parsed
        .map((value) => normalizeCachedControllerDevice(value, now))
        .filter((device): device is CachedControllerDevice => device !== null)
    );
    saveControllerDeviceCache(storage, devices);
    return devices;
  } catch {
    try {
      storage.removeItem(CONTROLLER_DEVICE_CACHE_STORAGE_KEY);
    } catch {
      // Keep an empty in-memory cache if browser storage is unavailable.
    }
    return [];
  }
}

export function saveControllerDeviceCache(
  storage: ControllerDeviceStorage,
  devices: readonly CachedControllerDevice[]
): boolean {
  try {
    const normalized = reconcileControllerDeviceCache(devices);
    if (normalized.length === 0) {
      storage.removeItem(CONTROLLER_DEVICE_CACHE_STORAGE_KEY);
    } else {
      storage.setItem(CONTROLLER_DEVICE_CACHE_STORAGE_KEY, JSON.stringify(normalized));
    }
    return true;
  } catch {
    return false;
  }
}

export function renameControllerDevice(
  devices: readonly CachedControllerDevice[],
  key: string,
  name: string,
  now = Date.now()
): CachedControllerDevice[] {
  const customName = name.trim();
  if (!customName) return [...devices];
  return devices.map((device) => device.key === key
    ? { ...device, customName, lastSeenAt: now }
    : device);
}

function vendorProductLabel(device: CachedControllerDevice): string {
  const known = controllerKnownVendorProduct(device.controllerType);
  const vendorId = device.vendorId ?? known?.vendorId;
  const productId = device.productId ?? known?.productId;
  if (vendorId === null || vendorId === undefined || productId === null || productId === undefined) {
    return '--';
  }
  return `0x${vendorId.toString(16).padStart(4, '0').toUpperCase()} / 0x${productId.toString(16).padStart(4, '0').toUpperCase()}`;
}

function deviceTitle(device: CachedControllerDevice): string {
  return device.customName?.trim()
    || controllerDeviceName(device.controllerType, device.controllerName);
}

function infoRows(device: CachedControllerDevice): DevicesInfoRow[] {
  const actualName = controllerDeviceName(device.controllerType, device.controllerName);
  return [
    ...(device.customName
      ? [{ id: 'controller', label: 'Controller', value: actualName } as const]
      : []),
    { id: 'address', label: 'Address', value: device.bluetoothAddress },
    {
      id: 'pairing',
      label: 'Pairing',
      value: device.linkKeyKnown ? 'Standard key' : 'Address only'
    },
    { id: 'vendor-product', label: 'VID / PID', value: vendorProductLabel(device) },
    {
      id: 'power',
      label: 'Power',
      value: device.batteryPercent === null ? '--' : `${device.batteryPercent}%`
    }
  ];
}

export function buildDevicesModel(input: {
  bridgeConnected: boolean;
  status: BridgeStatusPayload | null;
  identity: CompanionDeviceIdentityPayload | null;
  cachedDevices: readonly CachedControllerDevice[];
  pendingAction: string | null;
  now?: number;
}): DevicesModel {
  const controllerConnected = Boolean(input.status?.controllerConnected);
  const pairingActive = Boolean(input.identity?.pairingActive);
  const pairingPending = input.pendingAction === 'controller-pairing';
  const forgetPending = input.pendingAction === 'controller-forget-all';
  const liveDevice = input.bridgeConnected && controllerConnected && input.status
    ? cachedControllerDeviceFromSnapshot(input.status, input.identity, input.now)
    : null;
  const cachedLive = liveDevice
    ? input.cachedDevices.find((device) => device.key === liveDevice.key)
    : null;
  const resolvedLive = liveDevice
    ? { ...liveDevice, customName: cachedLive?.customName ?? null }
    : null;
  const devices = [
    ...(resolvedLive ? [resolvedLive] : []),
    ...input.cachedDevices.filter((device) => device.key !== resolvedLive?.key)
  ];
  const cards = devices.map((device, index): DevicesCardModel => {
    const live = resolvedLive !== null && index === 0;
    const historyIndex = resolvedLive === null ? index : index - 1;
    return {
      key: device.key,
      controllerType: device.controllerType,
      label: live
        ? 'Current controller'
        : historyIndex === 0
          ? 'Last controller'
          : 'Previous controller',
      title: deviceTitle(device),
      status: live ? 'Connected' : input.bridgeConnected ? 'Not connected' : 'Bridge offline',
      bluetoothAddress: device.bluetoothAddress,
      infoRows: infoRows(device),
      tone: live ? 'connected' : 'cached',
      forgetDisabled: !input.bridgeConnected || input.pendingAction !== null,
      forgetTitle: input.bridgeConnected
        ? 'Delete this controller from the Pico'
        : 'Bridge offline'
    };
  });

  return {
    bridgeConnected: input.bridgeConnected,
    controllerConnected,
    healthLabel: input.bridgeConnected && controllerConnected
      ? 'Connected'
      : input.bridgeConnected ? 'Waiting' : 'Offline',
    healthTone: input.bridgeConnected && controllerConnected
      ? 'good'
      : input.bridgeConnected ? 'warn' : 'idle',
    pairingActive,
    pairingAction: {
      label: pairingActive || pairingPending
        ? 'Pairing...'
        : !input.bridgeConnected
          ? 'Bridge Not Connected'
          : controllerConnected ? 'Disconnect & Pair New' : 'Enter Pairing Mode',
      title: !input.bridgeConnected
        ? 'Connect the bridge to manage controller pairing'
        : pairingActive
          ? 'Controller pairing is already active'
          : controllerConnected
            ? 'Disconnect the current controller and enter pairing mode'
            : 'Enter controller pairing mode',
      disabled: !input.bridgeConnected || pairingActive || input.pendingAction !== null,
      pending: pairingPending
    },
    forgetAllAction: {
      label: forgetPending ? 'Clearing...' : 'Forget Controllers',
      title: input.bridgeConnected ? 'Forget stored controller pairings' : 'Bridge offline',
      disabled: !input.bridgeConnected || input.pendingAction !== null,
      pending: forgetPending
    },
    cards,
    emptyStatus: input.bridgeConnected
      ? 'Connect a controller to save it here.'
      : 'Connect the bridge and a controller once to save it here.'
  };
}
