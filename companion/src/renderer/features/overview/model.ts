import type { HostPersonaMode } from '@shared/protocol';
import type { BridgeSnapshot } from '@shared/types';
import { healthLabel, healthTitle } from '../../common/controller-status';
import type { ShellNotificationFocusTarget } from '../shell/ShellNotifications';
import { POLLING_RATE_OPTIONS } from '../system-controls/model';

export type OverviewTone = 'good' | 'warn' | 'bad' | 'info' | 'idle';

export interface OverviewChip<Id extends string> {
  readonly id: Id;
  readonly label: string;
}

/** Everything the Overview shows that is worked out from the snapshot alone. */
export interface OverviewStatus {
  readonly healthLabel: string;
  readonly healthTitle: string | undefined;
  readonly healthTone: OverviewTone;
  readonly connectionStatus: 'Switching' | 'Stable' | 'Waiting' | 'Offline';
  readonly pollingRateLabel: string;
  readonly audioRouteLabel: string;
  readonly audioPathStatus: string;
  readonly audioOutputLabel: string;
  readonly firmwareLabel: string;
  readonly signalLabel: string;
  readonly signalTone: OverviewTone;
  readonly signalTitle: string | undefined;
  readonly hostPersonaMode: HostPersonaMode;
  readonly shortcutItems: ReadonlyArray<OverviewChip<'sleep' | 'volume'>>;
  readonly notificationItems: ReadonlyArray<OverviewChip<ShellNotificationFocusTarget>>;
  readonly powerSavingLabel: 'Active' | 'Enabled' | 'Off';
}

type SignalQuality = 'Excellent' | 'Good' | 'Audio Risk' | 'Poor';

/** How strong the bridge's Bluetooth link is; audio drops out first, below -22 dBm. */
export function signalQualityLabel(dbm: number | null | undefined): SignalQuality | null {
  if (dbm === null || dbm === undefined) return null;
  if (dbm >= -15) return 'Excellent';
  if (dbm >= -22) return 'Good';
  if (dbm >= -27) return 'Audio Risk';
  return 'Poor';
}

const SIGNAL_TONES: Record<SignalQuality, OverviewTone> = {
  Excellent: 'good',
  Good: 'good',
  'Audio Risk': 'warn',
  Poor: 'bad'
};

export function overviewStatus(
  snapshot: BridgeSnapshot,
  { controllerPowerSavingActive }: { readonly controllerPowerSavingActive: boolean }
): OverviewStatus {
  const switching = Boolean(snapshot.personaTransition);
  const connected = snapshot.state === 'connected';
  const controllerConnected = Boolean(snapshot.status?.controllerConnected);
  const pollingRateSupported = Boolean(snapshot.status?.firmwareFlags.pollingRateControl);
  const audioStatus = snapshot.diagnostics.audioStatus;
  const signalDbm = connected ? snapshot.status?.signalStrengthDbm : null;
  const signal = signalQualityLabel(signalDbm);
  const pollingRate = POLLING_RATE_OPTIONS.find(([, mode]) => mode === snapshot.settings.pollingRateMode)?.[0]
    .replace(' / Real-time', '');

  return {
    healthLabel: healthLabel(snapshot),
    healthTitle: healthTitle(snapshot),
    healthTone: switching
      ? 'warn'
      : snapshot.diagnostics.lastError
        ? 'bad'
        : snapshot.diagnostics.firmwareUpdateAvailable
          ? 'warn'
          : connected && controllerConnected
            ? 'good'
            : connected
              ? 'info'
              : 'idle',
    connectionStatus: switching
      ? 'Switching'
      : connected && controllerConnected
        ? 'Stable'
        : connected
          ? 'Waiting'
          : 'Offline',
    pollingRateLabel: connected && pollingRateSupported && pollingRate ? pollingRate : '--',
    audioRouteLabel: connected ? 'Pico Local' : '--',
    audioPathStatus: switching
      ? 'Switching Mode'
      : !connected
        ? '--'
        : audioStatus?.controllerStateReady
          ? 'Controller Ready'
          : 'Waiting',
    audioOutputLabel: connected ? (audioStatus?.headsetPlugged ? 'Headphones' : 'Speaker') : '--',
    firmwareLabel: snapshot.status?.firmwareVersion ?? '--',
    signalLabel: signal ?? '--',
    signalTone: signal ? SIGNAL_TONES[signal] : 'idle',
    signalTitle: signalDbm === null || signalDbm === undefined ? undefined : `${signalDbm} dBm`,
    hostPersonaMode: snapshot.personaTransition?.to ?? snapshot.settings.hostPersonaMode ?? 'dualsense',
    shortcutItems: [
      snapshot.settings.sleepKeybindEnabled ? { id: 'sleep', label: 'Sleep Shortcut' } as const : null,
      snapshot.settings.speakerVolumeShortcutEnabled ? { id: 'volume', label: 'Volume Shortcut' } as const : null
    ].filter((item) => item !== null),
    notificationItems: [
      snapshot.settings.notifyControllerConnection ? { id: 'controller-status', label: 'Controller Status' } as const : null,
      snapshot.settings.notifyLowBattery ? { id: 'low-battery', label: 'Low Battery' } as const : null
    ].filter((item) => item !== null),
    powerSavingLabel: snapshot.settings.controllerPowerSavingEnabled
      ? controllerPowerSavingActive ? 'Active' : 'Enabled'
      : 'Off'
  };
}
