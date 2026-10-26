import { describe, expect, it } from 'vitest';
import type { BridgeSnapshot } from '@shared/types';
import {
  batteryLabel,
  controllerName,
  healthLabel,
  healthTitle,
  isChargingPowerState,
  isExternalPowerState
} from './controller-status';

function snapshot({
  state = 'connected',
  message = 'Connected',
  controllerConnected = true,
  wakeOnConnectEnabled = false,
  lastError = null,
  availableVersion = null
}: {
  state?: BridgeSnapshot['state'];
  message?: string;
  controllerConnected?: boolean;
  wakeOnConnectEnabled?: boolean;
  lastError?: string | null;
  availableVersion?: string | null;
} = {}): BridgeSnapshot {
  return {
    state,
    message,
    settings: { wakeOnConnectEnabled },
    status: { controllerConnected, batteryPercent: 64 },
    diagnostics: {
      lastError,
      firmwareUpdateAvailable: availableVersion ? { availableVersion } : null
    }
  } as unknown as BridgeSnapshot;
}

describe('bridge health wording', () => {
  it('tells a ready controller apart from a bridge waiting with or without controller wake', () => {
    expect(healthLabel(snapshot())).toBe('All systems normal');
    expect(healthTitle(snapshot())).toBeUndefined();

    const waking = snapshot({ controllerConnected: false, wakeOnConnectEnabled: true });
    expect(healthLabel(waking)).toBe('Wake with controller enabled');
    expect(healthTitle(waking)).toBe('The Pico bridge is online. Controller wake is enabled, but no controller is connected.');

    const waiting = snapshot({ controllerConnected: false });
    expect(healthLabel(waiting)).toBe('Bridge online');
    expect(healthTitle(waiting)).toBe('The Pico bridge is online and waiting for a controller.');
  });

  it('puts errors, updates, and the bridge state ahead of the controller', () => {
    expect(healthLabel(snapshot({ lastError: 'Write timed out.' }))).toBe('Write timed out.');
    expect(healthLabel(snapshot({ availableVersion: '2.1.0' }))).toBe('Firmware 2.1.0 available');
    expect(healthLabel(snapshot({ state: 'incompatible', message: 'Firmware 1.4.0 update required' })))
      .toBe('Update required: Settings > Bridge Firmware');
    expect(healthLabel(snapshot({ state: 'no-bridge', message: 'Bridge not found' }))).toBe('Bridge not found');
    expect(healthLabel(null)).toBe('Unavailable');
  });
});

describe('controller power wording', () => {
  it('distinguishes active charging from connected external power', () => {
    expect(isChargingPowerState(0x01)).toBe(true);
    expect(isExternalPowerState(0x01)).toBe(true);
    expect(isChargingPowerState(0x02)).toBe(false);
    expect(isExternalPowerState(0x02)).toBe(true);
    expect(isChargingPowerState(0x00)).toBe(false);
    expect(isExternalPowerState(0x00)).toBe(false);
    expect(isExternalPowerState(undefined)).toBe(false);
  });

  it('shows the battery percentage and a dash without one', () => {
    expect(batteryLabel(snapshot())).toBe('64%');
    expect(batteryLabel(null)).toBe('—');
  });

  it('names the controller type', () => {
    expect(controllerName('dualsense-edge')).toBe('DualSense Edge');
    expect(controllerName('dualsense')).toBe('DualSense');
    expect(controllerName(undefined)).toBe('Controller');
  });
});
