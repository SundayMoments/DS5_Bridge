import { WOL_WORLDWIDE_COUNTRY } from '@shared/wake-on-lan-protocol';
import type { WakeOnLanStage, WakeOnLanTarget } from '@shared/wake-on-lan-types';

// Ported in spirit from Kitsune Input's Wake-on-LAN settings model, for the
// single bridge DS5 Bridge talks to.

export interface WakePcDraft {
  ssid: string;
  /** Typed for one attempt only; never prefilled and cleared after every attempt. */
  password: string;
  country: string;
  targetMac: string;
  enabled: boolean;
}

export type WakePcDraftField = 'ssid' | 'password' | 'country' | 'targetMac';

export interface WakePcDraftIssue {
  readonly field: WakePcDraftField;
  readonly message: string;
}

export const EMPTY_WAKE_PC_DRAFT: WakePcDraft = {
  ssid: '', password: '', country: WOL_WORLDWIDE_COUNTRY, targetMac: '', enabled: true
};

export const WAKE_PC_MESSAGES = {
  saved: 'Network saved. The bridge joined your Wi-Fi. Test sleep and shutdown once to confirm your router passes the wake packet to this PC.',
  savedDisabled: 'Network saved. Turn on Wake-on-LAN to use it.',
  forgotten: 'Saved network removed.',
  canceled: 'Setup canceled.',
  cancelUnconfirmed: 'Cancellation could not be confirmed. Wait for Wi-Fi cleanup to finish.',
  readFailed: 'Could not read the wake settings. Reopen Settings to try again.',
  failed: 'The wake operation failed. Check the network and bridge, then try again.'
} as const;

/**
 * Fixed messages main's Wake-on-LAN service rejects with. They reach the page
 * as error text; listing them here keeps every catalog translating them.
 */
export const WAKE_ON_LAN_SERVICE_MESSAGES = [
  'The bridge is busy. Turn off the controller, wait a few seconds, then try again.',
  'The bridge rejected the network settings.',
  'The bridge could not save or erase its network configuration.',
  'Update this bridge’s firmware to use Wake-on-LAN.',
  'The bridge did not accept the wake operation.',
  'The bridge connection was lost. Reconnect it, then try again.',
  'Couldn’t read this PC’s Ethernet adapters. Refresh to try again.',
  'The saved Wi-Fi region isn’t available on this bridge’s radio. Choose another country, then test again.',
  'The bridge restarted because Wi-Fi could not stop safely.',
  'Configure a network first.',
  'The bridge is busy.',
  'The network configuration is invalid.',
  'The configuration transaction expired or changed.',
  'The wake operation timed out.',
  'The Wi-Fi network is unavailable.',
  'The Wi-Fi network rejected the password.',
  'The wake packet could not be sent.',
  'Wi-Fi could not be stopped. Reconnect the bridge before playing.',
  'The target PC or configuration changed.',
  'The wake operation was canceled.',
  'The controller is unavailable.',
  'Could not read the wake settings. Reopen Settings to try again.',
  'Select a physical Ethernet adapter on this PC.',
  'The bridge did not verify the saved network configuration.',
  'Could not set up Wake-on-LAN. Reconnect the bridge and try again.',
  'The saved target belongs to another PC or an unavailable Ethernet adapter.',
  'The bridge could not verify the change.',
  'Could not change the saved wake settings.',
  'The network test timed out.',
  'The network test was replaced.',
  'The network test failed.',
  'The bridge did not acknowledge the wake operation.',
  'Turn off the controller before changing or testing Wake-on-LAN.',
  'A Wake-on-LAN change is already running.',
  'The companion is closing.',
  'The wake operation failed.',
  'Enter a valid Ethernet adapter MAC address.',
  'The target must be a nonzero unicast Ethernet MAC address.',
  'The network name must not contain a NUL character.',
  'The network name must contain 1 to 32 valid UTF-8 bytes.',
  'Use a WPA2 password containing 8 to 63 printable ASCII characters.',
  'Select a supported Wi-Fi country.'
] as const;

/** What an idle bridge is doing, shown with a saved network. */
export const WAKE_PC_STAGE_LABELS: Record<WakeOnLanStage, string> = {
  unsupported: 'Firmware update required',
  disabled: 'Off',
  'not-configured': 'Not set up',
  'waiting-for-sleep': 'Waiting for this PC to sleep or shut down',
  preparing: 'Getting ready for sleep',
  armed: 'Ready to wake this PC',
  'usb-wake': 'Waking this PC over USB',
  joining: 'Joining Wi-Fi',
  sending: 'Sending the wake packet',
  'stopping-wifi': 'Stopping Wi-Fi',
  failed: 'Last wake attempt failed',
  'radio-recovery-required': 'Reconnect the bridge to recover Wi-Fi',
  uploading: 'Uploading',
  validating: 'Testing Wi-Fi',
  saving: 'Saving',
  canceling: 'Canceling',
  canceled: 'Canceled'
};

/** The three steps of Test and save, in order. */
export const WAKE_PC_PROGRESS_STEPS = [
  { id: 'uploading', label: 'Uploading' },
  { id: 'testing', label: 'Testing Wi-Fi' },
  { id: 'saving', label: 'Saving' }
] as const;

export type WakePcProgressStep = typeof WAKE_PC_PROGRESS_STEPS[number]['id'];

export function wakePcProgressStep(stage: WakeOnLanStage | undefined): WakePcProgressStep {
  if (stage === 'saving') return 'saving';
  if (stage === 'validating' || stage === 'joining' || stage === 'sending' || stage === 'stopping-wifi') return 'testing';
  return 'uploading';
}

export function validateWakePcDraft(draft: WakePcDraft, availableCountries: readonly string[]): WakePcDraftIssue | null {
  const ssidBytes = new TextEncoder().encode(draft.ssid).length;
  if (ssidBytes < 1 || ssidBytes > 32 || draft.ssid.includes('\0')) {
    return { field: 'ssid', message: 'Enter the network name, up to 32 bytes.' };
  }
  if (!draft.password) return { field: 'password', message: 'Enter the Wi-Fi password.' };
  if (!/^[\x20-\x7e]{8,63}$/.test(draft.password)) {
    return { field: 'password', message: 'Use a WPA2 password with 8 to 63 printable ASCII characters.' };
  }
  if (!availableCountries.includes(draft.country)) {
    return { field: 'country', message: 'Select the country where the bridge is used.' };
  }
  if (!draft.targetMac) return { field: 'targetMac', message: 'Select this PC’s Ethernet adapter.' };
  return null;
}

/**
 * The region that matches the UI language, when the bridge offers it:
 * the UI locale's own region first, then the system language's region when it
 * is the same language. Otherwise Worldwide.
 */
export function defaultWakePcCountry(
  uiLocale: string,
  availableCountries: readonly string[],
  systemLanguage: string | undefined = typeof navigator === 'undefined' ? undefined : navigator.language
): string {
  const regionOf = (tag: string | undefined) => {
    try {
      return tag ? new Intl.Locale(tag).region : undefined;
    } catch {
      return undefined;
    }
  };
  const languageOf = (tag: string | undefined) => {
    try {
      return tag ? new Intl.Locale(tag).language : undefined;
    } catch {
      return undefined;
    }
  };
  const candidates = [regionOf(uiLocale)];
  if (languageOf(systemLanguage) === languageOf(uiLocale)) candidates.push(regionOf(systemLanguage));
  const match = candidates.find((region) => region && availableCountries.includes(region));
  return match ?? WOL_WORLDWIDE_COUNTRY;
}

/** The connected adapter, or the first one, for a new setup. */
export function preferredWakePcTarget(targets: readonly WakeOnLanTarget[]): WakeOnLanTarget | undefined {
  return targets.find((target) => target.connected) ?? targets[0];
}

export function wakePcErrorText(error: unknown, fallback: string = WAKE_PC_MESSAGES.failed): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
