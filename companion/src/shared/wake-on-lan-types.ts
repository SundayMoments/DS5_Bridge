// Ported from Kitsune Input's Wake-on-LAN read model, for the single bridge
// the app is connected to.

/** Bridge-owned network configuration. Passwords never enter CompanionSettings. */
export interface WakeOnLanConfigurationInput {
  ssid: string;
  password: string;
  country: string;
  targetMac: string;
  enabled: boolean;
}

export type WakeOnLanAdapterBus = 'pci' | 'usb' | 'other' | 'unknown';

/** A physical Ethernet adapter on this PC that the bridge can wake. */
export interface WakeOnLanTarget {
  id: string;
  name: string;
  mac: string;
  connected: boolean;
  /** Device enumerator from the audio helper; 'unknown' from the PowerShell fallback. */
  bus?: WakeOnLanAdapterBus;
  /** Inside this PC's enclosure rather than a dock or dongle; null when unknown. */
  internal?: boolean | null;
  /** Carries this PC's default route; null when unknown. */
  defaultRoute?: boolean | null;
}

export type WakeOnLanDriverSetting = 'on' | 'off' | 'not-exposed' | 'unknown';
export type WakeOnLanWakeSource = 'network-adapter' | 'usb' | 'power-button' | 'other' | 'none' | 'unknown';
export type WakeOnLanBootType = 'full' | 'fast-startup' | 'hibernate-resume' | 'unknown';

/**
 * Read-only Windows readiness for one target adapter. DS5 Bridge never changes
 * these settings. Unknown values mean the audio helper could not observe them.
 */
export interface WakeOnLanReadiness {
  /** False when the audio helper is missing, older or returned invalid data. */
  available: boolean;
  /** Normalized adapter checked, or '' when none was valid. */
  targetMac: string;
  /** Epoch milliseconds of the helper read; 0 when never read. */
  checkedAt: number;
  modernStandby: boolean | null;
  sleepS3: boolean | null;
  hibernate: boolean | null;
  fastStartup: 'on' | 'off' | 'unknown';
  /** False when the MAC is not a physical Ethernet adapter on this PC. */
  adapterPresent: boolean | null;
  adapterConnected: boolean | null;
  adapterBus: WakeOnLanAdapterBus;
  adapterInternal: boolean | null;
  adapterDefaultRoute: boolean | null;
  magicPacket: WakeOnLanDriverSetting;
  shutdownWake: WakeOnLanDriverSetting;
  modernStandbyMagicPacket: WakeOnLanDriverSetting;
  energyEfficientEthernet: WakeOnLanDriverSetting;
  windowsWakeArmed: boolean | null;
  /** Bounded display text for the reference tooltip only. */
  driverProvider: string | null;
  driverVersion: string | null;
  lastWakeSource: WakeOnLanWakeSource;
  /** How the current boot started (newest Kernel-Boot 27 event). */
  lastWakeBootType: WakeOnLanBootType;
  /** Normalized ISO timestamp of the wake, only when it happened during the current boot; otherwise null. */
  lastWakeAt: string | null;
  /** Normalized ISO timestamp of the current boot, or null when Windows did not record it. */
  lastBootAt: string | null;
}

export type WakeOnLanStage =
  | 'unsupported' | 'disabled' | 'not-configured' | 'waiting-for-sleep'
  | 'preparing' | 'armed' | 'usb-wake' | 'joining' | 'sending'
  | 'stopping-wifi' | 'failed' | 'radio-recovery-required'
  | 'uploading' | 'validating' | 'saving' | 'canceling' | 'canceled';

/** Sanitized read model; never includes the password. */
export interface WakeOnLanMetadata {
  /** The connected bridge's hardware ID, or '' when none is connected. */
  bridgeId: string;
  /** The bridge firmware speaks companion protocol 1.24 or later. */
  supported: boolean;
  availableCountries: readonly string[];
  configured: boolean;
  enabled: boolean;
  credentialPresent: boolean;
  ssid: string;
  country: string;
  targetMac: string;
  /**
   * The saved target is a physical Ethernet adapter on this PC, regardless of
   * link state. null when adapter discovery failed, so ownership is unknown.
   */
  targetOwnedByThisPc: boolean | null;
  generation: number;
  stage: WakeOnLanStage;
  busy: boolean;
  controllerConnected: boolean;
  error: string | null;
  /** A completed failure kept by an idle, configured bridge; not a current fault. */
  lastOperationError: string | null;
  packetCount: number;
  elapsedMs: number;
}

export interface WakeOnLanApi {
  getWakeOnLan(): Promise<WakeOnLanMetadata>;
  /** Cached unless refresh is true; the cache follows adapter changes. */
  getWakeOnLanTargets(refresh?: boolean): Promise<WakeOnLanTarget[]>;
  /** Cached unless refresh is true. Unknown fields when the audio helper cannot answer. */
  getWakeOnLanReadiness(targetMac: string, refresh?: boolean): Promise<WakeOnLanReadiness>;
  configureWakeOnLan(input: WakeOnLanConfigurationInput): Promise<WakeOnLanMetadata>;
  setWakeOnLanEnabled(enabled: boolean): Promise<WakeOnLanMetadata>;
  forgetWakeOnLan(): Promise<WakeOnLanMetadata>;
  cancelWakeOnLan(): Promise<void>;
}
