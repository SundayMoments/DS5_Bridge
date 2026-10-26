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

/** A physical Ethernet adapter on this PC that the bridge can wake. */
export interface WakeOnLanTarget {
  id: string;
  name: string;
  mac: string;
  connected: boolean;
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
  configureWakeOnLan(input: WakeOnLanConfigurationInput): Promise<WakeOnLanMetadata>;
  setWakeOnLanEnabled(enabled: boolean): Promise<WakeOnLanMetadata>;
  forgetWakeOnLan(): Promise<WakeOnLanMetadata>;
  cancelWakeOnLan(): Promise<void>;
}
