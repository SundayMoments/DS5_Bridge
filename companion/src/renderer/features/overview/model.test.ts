import { describe, expect, it } from 'vitest';
import type { BridgeSnapshot } from '@shared/types';
import { overviewStatus, signalQualityLabel } from './model';

function snapshot({
  state = 'connected',
  controllerConnected = true,
  personaTransition = null,
  settings = {}
}: {
  state?: BridgeSnapshot['state'];
  controllerConnected?: boolean;
  personaTransition?: unknown;
  settings?: Record<string, unknown>;
} = {}): BridgeSnapshot {
  return {
    state,
    message: 'Connected',
    personaTransition,
    settings: { hostPersonaMode: 'dualsense', pollingRateMode: '500', ...settings },
    status: {
      controllerConnected,
      signalStrengthDbm: -24,
      firmwareVersion: '2.0.0',
      firmwareFlags: { pollingRateControl: true }
    },
    diagnostics: { lastError: null, firmwareUpdateAvailable: null, audioStatus: { controllerStateReady: true, headsetPlugged: true } }
  } as unknown as BridgeSnapshot;
}

describe('Overview status', () => {
  it('rates the wireless signal where audio starts to suffer', () => {
    expect(signalQualityLabel(-15)).toBe('Excellent');
    expect(signalQualityLabel(-22)).toBe('Good');
    expect(signalQualityLabel(-27)).toBe('Audio Risk');
    expect(signalQualityLabel(-28)).toBe('Poor');
    expect(signalQualityLabel(null)).toBeNull();
  });

  it('describes a connected controller', () => {
    const status = overviewStatus(snapshot(), { controllerPowerSavingActive: false });
    expect(status).toMatchObject({
      healthTone: 'good',
      connectionStatus: 'Stable',
      pollingRateLabel: '500 Hz',
      audioRouteLabel: 'Pico Local',
      audioPathStatus: 'Controller Ready',
      audioOutputLabel: 'Headphones',
      signalLabel: 'Audio Risk',
      signalTone: 'warn',
      signalTitle: '-24 dBm',
      powerSavingLabel: 'Off'
    });
  });

  it('shows a waiting bridge, a mode switch, and an offline bridge', () => {
    expect(overviewStatus(snapshot({ controllerConnected: false }), { controllerPowerSavingActive: false }))
      .toMatchObject({ healthTone: 'info', connectionStatus: 'Waiting' });
    expect(overviewStatus(
      snapshot({ personaTransition: { from: 'dualsense', to: 'xbox' } }),
      { controllerPowerSavingActive: false }
    )).toMatchObject({ healthTone: 'warn', connectionStatus: 'Switching', audioPathStatus: 'Switching Mode', hostPersonaMode: 'xbox' });
    expect(overviewStatus(snapshot({ state: 'no-bridge' }), { controllerPowerSavingActive: false })).toMatchObject({
      healthTone: 'idle',
      connectionStatus: 'Offline',
      pollingRateLabel: '--',
      audioRouteLabel: '--',
      signalLabel: '--'
    });
  });

  it('lists enabled shortcuts and notifications and the power saving state', () => {
    const status = overviewStatus(snapshot({
      settings: {
        sleepKeybindEnabled: true,
        speakerVolumeShortcutEnabled: true,
        notifyLowBattery: true,
        controllerPowerSavingEnabled: true
      }
    }), { controllerPowerSavingActive: true });
    expect(status.shortcutItems.map((item) => item.label)).toEqual(['Sleep Shortcut', 'Volume Shortcut']);
    expect(status.notificationItems.map((item) => item.id)).toEqual(['low-battery']);
    expect(status.powerSavingLabel).toBe('Active');
  });
});
