// Electron prefixes errors thrown through ipcMain.handle with its own text, so
// Wake-on-LAN calls return their fixed message as data and preload rethrows it.

export type WakeOnLanResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const WAKE_ON_LAN_OPERATION_FAILED_MESSAGE = 'The wake operation failed. Check the network and bridge, then try again.';

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
