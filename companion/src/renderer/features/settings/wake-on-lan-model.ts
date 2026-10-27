import type { WakeOnLanStage, WakeOnLanTarget } from '@shared/wake-on-lan-types';
import {
  WAKE_ON_LAN_DISCOVERY_FAILED_MESSAGE,
  WAKE_ON_LAN_RADIO_RESTART_MESSAGE,
  WAKE_ON_LAN_RETIRED_REGION_MESSAGE,
  isWakeOnLanConnectionFailure
} from '@shared/wake-on-lan-result';
import { WOL_WORLDWIDE_COUNTRY, isConfigurableWakeOnLanCountry } from '@shared/wake-on-lan-protocol';

// Ported from Kitsune Input's Wake-on-LAN settings model, for the single
// bridge DS5 Bridge talks to.

export interface WakeOnLanDraft {
  ssid: string;
  password: string;
  country: string;
  targetMac: string;
}

export interface WakeOnLanDraftIssue {
  field: keyof WakeOnLanDraft;
  message: string;
}

export const EMPTY_WAKE_ON_LAN_DRAFT: WakeOnLanDraft = {
  ssid: '', password: '', country: WOL_WORLDWIDE_COUNTRY, targetMac: ''
};

export function validateWakeOnLanDraft(draft: WakeOnLanDraft, savedPassword = false): WakeOnLanDraftIssue | null {
  const ssidBytes = new TextEncoder().encode(draft.ssid).length;
  if (ssidBytes < 1 || ssidBytes > 32 || draft.ssid.includes('\0')
    || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(draft.ssid)) {
    return { field: 'ssid', message: 'Enter a Wi-Fi name between 1 and 32 UTF-8 bytes.' };
  }
  if (!draft.password) return { field: 'password', message: savedPassword
    ? 'Re-enter the saved Wi-Fi password to test or save changes.' : 'Enter the Wi-Fi password.' };
  if (!/^[\x20-\x7e]{8,63}$/.test(draft.password)) {
    return { field: 'password', message: 'Use a WPA2 password with 8–63 printable ASCII characters.' };
  }
  if (!isConfigurableWakeOnLanCountry(draft.country)) {
    return { field: 'country', message: 'Select the country where the bridge is used.' };
  }
  const mac = draft.targetMac.replace(/[:-]/g, '');
  if (!/^(?:[\da-f]{2}[:-]){5}[\da-f]{2}$/i.test(draft.targetMac) || /^0{12}$/.test(mac)
    || (parseInt(mac.slice(0, 2), 16) & 1) !== 0) {
    return { field: 'targetMac', message: 'Enter a valid physical Ethernet MAC address for this PC.' };
  }
  return null;
}

/** Normalized MAC for readiness checks, or '' while the draft is incomplete. */
export function wakeOnLanCheckableMac(value: string): string {
  const mac = value.replace(/[:-]/g, '');
  return /^(?:[\da-f]{2}[:-]){5}[\da-f]{2}$/i.test(value) && !/^0{12}$/.test(mac) && (parseInt(mac.slice(0, 2), 16) & 1) === 0
    ? value.replace(/-/g, ':').toUpperCase() : '';
}

/**
 * Preselection when nothing is saved: a built-in PCI adapter on the default route,
 * then any built-in connected adapter, then any connected adapter, then the first.
 */
export function preferredWakeOnLanTarget(targets: readonly WakeOnLanTarget[]): WakeOnLanTarget | undefined {
  return targets.find((target) => target.bus === 'pci' && target.internal === true && target.defaultRoute === true)
    ?? targets.find((target) => target.internal === true && target.connected)
    ?? targets.find((target) => target.connected) ?? targets[0];
}

const OWNERSHIP_MESSAGE = 'This bridge’s saved adapter isn’t on this PC. Select this PC’s Ethernet adapter and test again.';
const RADIO_RESTART_MESSAGE = 'The bridge restarted because Wi-Fi could not stop safely.';
const RETIRED_REGION_MESSAGE = 'The saved Wi-Fi region isn’t available on this bridge’s radio. Choose another country, then test again.';

/**
 * Only fixed, known failures may cross into the UI; never echo transport text.
 * `retiredEnable` is true only for an enable of (or status retained by) a record
 * saved with Finland or Ireland: firmware answers it with InvalidConfig, which
 * then means "choose another region". A failed new configuration never gets that reading.
 */
export function wakeOnLanFailureMessage(error: unknown, bridgeError?: string | null, retiredEnable = false): string {
  if (isWakeOnLanConnectionFailure(error)) return 'The bridge connection was lost. Reconnect it, then refresh wake settings.';
  // A rejected action can leave an older failure in the bridge's retained status.
  for (const candidate of [error instanceof Error ? error.message : error, bridgeError]) {
    if (typeof candidate !== 'string') continue;
    switch (candidate) {
      case 'Turn off the controller before changing or testing Wake-on-LAN.':
        return 'Turn off the controller before changing or testing Wake-on-LAN.';
      case 'Update this bridge’s firmware to use Wake-on-LAN.':
        return 'Update this bridge’s firmware to use Wake-on-LAN.';
      case 'The Wi-Fi network rejected the password.':
        return 'Wi-Fi authentication failed. Check the password and use WPA2-Personal.';
      case 'The Wi-Fi network is unavailable.':
        return 'The bridge could not find or join the Wi-Fi network. Check its name, signal, and 2.4 GHz support.';
      case 'The wake operation timed out.':
        return 'The wake operation timed out.';
      // A wrong password usually ends as a timeout too, so name both causes.
      case 'The network test timed out.':
        return 'Wi-Fi didn’t connect. Check the password, then move the bridge closer to the router.';
      case 'Wi-Fi could not be stopped. Reconnect the bridge before playing.':
        return 'Wi-Fi could not stop safely. Reconnect the bridge before playing.';
      case 'The bridge is busy.':
        return 'The bridge is busy. Disconnect the controller and wait for pairing to stop before testing Wi-Fi.';
      case 'The bridge is busy. Turn off the controller, wait a few seconds, then try again.':
        return 'The bridge is busy. Turn off the controller, wait a few seconds, then try again.';
      case 'The saved target belongs to another PC or an unavailable Ethernet adapter.':
        return OWNERSHIP_MESSAGE;
      // Also a fresh setup with a typed or selected MAC: never call it the saved adapter.
      case 'Select a physical Ethernet adapter on this PC.':
        return 'That adapter isn’t on this PC. Select this PC’s Ethernet adapter, then test again.';
      case WAKE_ON_LAN_DISCOVERY_FAILED_MESSAGE:
        return 'Couldn’t read this PC’s Ethernet adapters. Refresh to try again.';
      case 'The controller is unavailable.':
        return 'The controller disconnected during the wake attempt.';
      case 'The bridge could not save or erase its network configuration.':
        return 'The bridge couldn’t save its network settings. Reconnect the bridge and try again.';
      case 'The bridge did not acknowledge the wake operation.':
        return 'The bridge didn’t respond. Reconnect the bridge and try again.';
      case WAKE_ON_LAN_RADIO_RESTART_MESSAGE:
        return RADIO_RESTART_MESSAGE;
      case WAKE_ON_LAN_RETIRED_REGION_MESSAGE:
        return RETIRED_REGION_MESSAGE;
      case 'The network configuration is invalid.':
      case 'Configure a network first.':
        if (retiredEnable) return RETIRED_REGION_MESSAGE;
        break;
      default: break;
    }
  }
  return 'Wake operation failed. Check the network and bridge, then try again.';
}

/** Completed history retained by an idle bridge: quiet, not a current fault. */
export function wakeOnLanHistoryMessage(lastOperationError: string | null | undefined): string | null {
  if (!lastOperationError) return null;
  return lastOperationError === WAKE_ON_LAN_RADIO_RESTART_MESSAGE ? RADIO_RESTART_MESSAGE : 'Previous operation timed out.';
}

export const WAKE_ON_LAN_OWNERSHIP_MESSAGE = OWNERSHIP_MESSAGE;

export const WAKE_ON_LAN_STAGE_LABELS: Record<WakeOnLanStage, string> = {
  unsupported: 'Firmware update required',
  disabled: 'Disabled',
  'not-configured': 'Not configured',
  'waiting-for-sleep': 'Waiting for PC sleep or shutdown',
  preparing: 'Preparing for PC sleep or shutdown',
  armed: 'Ready for a controller wake request',
  'usb-wake': 'USB wake requested',
  joining: 'Joining Wi-Fi',
  sending: 'Submitting wake packet',
  'stopping-wifi': 'Stopping Wi-Fi',
  failed: 'Wake operation failed',
  'radio-recovery-required': 'Radio recovery required',
  uploading: 'Sending network settings to bridge',
  validating: 'Testing network settings',
  saving: 'Saving network settings',
  canceling: 'Canceling and stopping Wi-Fi',
  canceled: 'Operation canceled.'
};
