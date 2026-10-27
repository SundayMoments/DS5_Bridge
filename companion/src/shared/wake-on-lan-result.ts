// Electron prefixes errors thrown through ipcMain.handle with its own text, so
// Wake-on-LAN calls return their fixed message as data and preload rethrows it.

export type WakeOnLanResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const WAKE_ON_LAN_OPERATION_FAILED_MESSAGE = 'The wake operation failed. Check the network and bridge, then try again.';
export const WAKE_ON_LAN_CONNECTION_LOST_MESSAGE = 'The bridge connection was lost. Reconnect it, then try again.';
/** Adapter discovery failed, so this PC's ownership of a target cannot be checked. */
export const WAKE_ON_LAN_DISCOVERY_FAILED_MESSAGE = 'Couldn’t read this PC’s Ethernet adapters. Refresh to try again.';
/** Enabling a record saved with a retired region (Finland, Ireland): firmware refuses it and never arms it. */
export const WAKE_ON_LAN_RETIRED_REGION_MESSAGE = 'The saved Wi-Fi region isn’t available on this bridge’s radio. Choose another country, then test again.';
/** Firmware reboots the bridge when Wi-Fi teardown fails, then reports Failed/RadioTeardown with the radio off. */
export const WAKE_ON_LAN_RADIO_RESTART_MESSAGE = 'The bridge restarted because Wi-Fi could not stop safely.';

export function isWakeOnLanConnectionFailure(error: unknown): boolean {
  return error instanceof Error && error.message === WAKE_ON_LAN_CONNECTION_LOST_MESSAGE;
}

export async function wakeOnLanResult<T>(run: () => Promise<T>): Promise<WakeOnLanResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error && error.message ? error.message : WAKE_ON_LAN_OPERATION_FAILED_MESSAGE
    };
  }
}

export function unwrapWakeOnLanResult<T>(result: WakeOnLanResult<T>): T {
  if (result.ok) return result.value;
  throw new Error(result.error);
}
