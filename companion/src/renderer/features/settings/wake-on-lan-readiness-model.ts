import type { WakeOnLanReadiness, WakeOnLanTarget } from '@shared/wake-on-lan-types';

// Ported from Kitsune Input's Wake-on-LAN readiness checklist.

/** ok and warning come from a live read; unknown could not be read; guide is an instruction only. */
export type WakeOnLanReadinessTone = 'ok' | 'warning' | 'unknown' | 'guide';

export interface WakeOnLanReadinessRow {
  readonly id: 'ethernet' | 'wifi' | 'device-manager' | 'shutdown-wake' | 'bios' | 'usb-power' | 'test';
  readonly text: string;
  readonly tone: WakeOnLanReadinessTone;
  /** Short live result, or null for an instruction. */
  readonly status: string | null;
  /** HelpTooltip sentences explaining a warning; each is translated separately. */
  readonly detail: readonly string[];
}

// Every string here is English source copy; the document translator localizes it.
const READINESS_COPY = {
  ethernet: 'Connect this PC to your router with Ethernet.',
  wifi: 'Use your main Wi-Fi network, not a guest network. Client isolation and broadcast filtering block the wake packet.',
  deviceManager: 'In Device Manager, let this Ethernet adapter wake the PC with a magic packet.',
  shutdownWake: 'Turn on shutdown wake in the adapter’s driver settings, if it has one.',
  bios: 'In your PC’s BIOS, turn off ErP and turn on wake from PCIe or LAN.',
  usbPower: 'Plug the bridge into a USB port that stays powered when the PC is off.',
  test: 'Test sleep and shutdown separately.',
  checking: 'Checking…',
  unknown: 'Unknown',
  connected: 'Connected',
  notConnected: 'Not connected',
  notOnThisPc: 'Not on this PC',
  usbAdapter: 'USB or dock adapter',
  usbAdapterDetail: 'Many USB and dock adapters can’t wake the PC from shutdown.',
  on: 'On',
  off: 'Off',
  notShown: 'Not shown',
  magicPacketOff: 'Magic packet off',
  wakePermissionOff: 'Wake permission off',
  modernStandbyOff: 'Off in Modern Standby',
  fastStartup: 'Fast Startup on',
  fastStartupDetail: 'Fast Startup is on. Shutdown wake depends on your network driver and motherboard.',
  modernStandby: 'Modern Standby',
  modernStandbyDetail: 'This PC uses Modern Standby. Sleep wake depends on the network driver’s Modern Standby setting.',
  both: 'Fast Startup and Modern Standby'
} as const;

const LAST_WAKE_SOURCE_LABELS: Record<WakeOnLanReadiness['lastWakeSource'], string> = {
  'network-adapter': 'Last wake: network adapter',
  usb: 'Last wake: USB device',
  'power-button': 'Last wake: power button',
  other: 'Last wake: another device',
  none: 'Last wake: not recorded',
  unknown: 'Last wake: unknown'
};

// Shown when Windows recorded no wake during this boot (always the case after shutdown).
const LAST_START_LABELS: Record<WakeOnLanReadiness['lastWakeBootType'], string | null> = {
  full: 'Last start: full boot', 'fast-startup': 'Last start: Fast Startup',
  'hibernate-resume': 'Last start: resumed from hibernation', unknown: null
};

function row(id: WakeOnLanReadinessRow['id'], text: string, tone: WakeOnLanReadinessTone = 'guide',
  status: string | null = null, detail: readonly string[] = []): WakeOnLanReadinessRow {
  return { id, text, tone, status, detail };
}

/** A first read in progress says so; a finished read that saw nothing says Unknown. */
function pending(checking: boolean): [WakeOnLanReadinessTone, string] {
  return ['unknown', checking ? READINESS_COPY.checking : READINESS_COPY.unknown];
}

function ethernetRow(readiness: WakeOnLanReadiness | null, target: WakeOnLanTarget | undefined, checking: boolean): WakeOnLanReadinessRow {
  if (readiness?.adapterPresent === false) return row('ethernet', READINESS_COPY.ethernet, 'warning', READINESS_COPY.notOnThisPc);
  // The adapter list still reports link state and bus when the readiness read is unavailable.
  const connected = readiness?.adapterConnected ?? target?.connected ?? null;
  const bus = readiness && readiness.adapterBus !== 'unknown' ? readiness.adapterBus : target?.bus ?? 'unknown';
  const internal = readiness?.adapterInternal ?? target?.internal ?? null;
  if (connected === false) return row('ethernet', READINESS_COPY.ethernet, 'warning', READINESS_COPY.notConnected);
  if (bus === 'usb' || internal === false) {
    return row('ethernet', READINESS_COPY.ethernet, 'warning', READINESS_COPY.usbAdapter, [READINESS_COPY.usbAdapterDetail]);
  }
  if (connected === true) return row('ethernet', READINESS_COPY.ethernet, 'ok', READINESS_COPY.connected);
  return row('ethernet', READINESS_COPY.ethernet, ...pending(checking && !readiness));
}

function deviceManagerRow(readiness: WakeOnLanReadiness | null, checking: boolean): WakeOnLanReadinessRow {
  const text = READINESS_COPY.deviceManager;
  if (!readiness?.available || !readiness.adapterPresent) return row('device-manager', text, ...pending(checking && !readiness));
  if (readiness.magicPacket === 'off') return row('device-manager', text, 'warning', READINESS_COPY.magicPacketOff);
  if (readiness.windowsWakeArmed === false) return row('device-manager', text, 'warning', READINESS_COPY.wakePermissionOff);
  if (readiness.modernStandby === true && readiness.modernStandbyMagicPacket === 'off') {
    return row('device-manager', text, 'warning', READINESS_COPY.modernStandbyOff, [READINESS_COPY.modernStandbyDetail]);
  }
  if (readiness.magicPacket === 'on' || readiness.windowsWakeArmed === true) return row('device-manager', text, 'ok', READINESS_COPY.on);
  return row('device-manager', text, 'unknown', readiness.magicPacket === 'not-exposed' ? READINESS_COPY.notShown : READINESS_COPY.unknown);
}

function shutdownWakeRow(readiness: WakeOnLanReadiness | null, checking: boolean): WakeOnLanReadinessRow {
  const text = READINESS_COPY.shutdownWake;
  if (!readiness?.available || !readiness.adapterPresent) return row('shutdown-wake', text, ...pending(checking && !readiness));
  if (readiness.shutdownWake === 'on') return row('shutdown-wake', text, 'ok', READINESS_COPY.on);
  if (readiness.shutdownWake === 'off') return row('shutdown-wake', text, 'warning', READINESS_COPY.off);
  return row('shutdown-wake', text, 'unknown', readiness.shutdownWake === 'not-exposed' ? READINESS_COPY.notShown : READINESS_COPY.unknown);
}

function testRow(readiness: WakeOnLanReadiness | null): WakeOnLanReadinessRow {
  const fastStartup = readiness?.fastStartup === 'on';
  const modernStandby = readiness?.modernStandby === true;
  if (fastStartup && modernStandby) {
    return row('test', READINESS_COPY.test, 'warning', READINESS_COPY.both,
      [READINESS_COPY.fastStartupDetail, READINESS_COPY.modernStandbyDetail]);
  }
  if (fastStartup) return row('test', READINESS_COPY.test, 'warning', READINESS_COPY.fastStartup, [READINESS_COPY.fastStartupDetail]);
  if (modernStandby) return row('test', READINESS_COPY.test, 'warning', READINESS_COPY.modernStandby, [READINESS_COPY.modernStandbyDetail]);
  return row('test', READINESS_COPY.test);
}

/**
 * The fixed checklist, in setup order. Live results only change a row's status in
 * place, so the block never grows or reflows when readiness arrives.
 */
export function wakeOnLanReadinessRows(readiness: WakeOnLanReadiness | null, target: WakeOnLanTarget | undefined,
  checking = false): WakeOnLanReadinessRow[] {
  return [
    ethernetRow(readiness, target, checking),
    row('wifi', READINESS_COPY.wifi),
    deviceManagerRow(readiness, checking),
    shutdownWakeRow(readiness, checking),
    row('bios', READINESS_COPY.bios),
    row('usb-power', READINESS_COPY.usbPower),
    testRow(readiness)
  ];
}

/**
 * Quiet after-wake evidence from one event only: the wake during this boot with its
 * time, otherwise how this boot started with the boot time. The main process has
 * already dropped any wake older than the boot, so a wake source is never paired
 * with a boot type from a different event.
 */
export function wakeOnLanLastEvent(readiness: WakeOnLanReadiness | null): { label: string; at: string | null } {
  if (!readiness?.available) return { label: LAST_WAKE_SOURCE_LABELS.unknown, at: null };
  if (readiness.lastWakeAt && readiness.lastWakeSource !== 'none') {
    return { label: LAST_WAKE_SOURCE_LABELS[readiness.lastWakeSource], at: readiness.lastWakeAt };
  }
  const start = LAST_START_LABELS[readiness.lastWakeBootType];
  return start ? { label: start, at: readiness.lastBootAt } : { label: LAST_WAKE_SOURCE_LABELS[readiness.lastWakeSource], at: null };
}
