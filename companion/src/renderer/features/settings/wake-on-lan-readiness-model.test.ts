import { describe, expect, it } from 'vitest';
import type { WakeOnLanReadiness } from '@shared/wake-on-lan-types';
import { wakeOnLanLastEvent, wakeOnLanReadinessRows } from './wake-on-lan-readiness-model';

const unknown: WakeOnLanReadiness = {
  available: false, targetMac: '02:11:22:33:44:55', checkedAt: 1, modernStandby: null, sleepS3: null, hibernate: null,
  fastStartup: 'unknown', adapterPresent: null, adapterConnected: null, adapterBus: 'unknown', adapterInternal: null,
  adapterDefaultRoute: null, magicPacket: 'unknown', shutdownWake: 'unknown', modernStandbyMagicPacket: 'unknown',
  energyEfficientEthernet: 'unknown', windowsWakeArmed: null, driverProvider: null, driverVersion: null,
  lastWakeSource: 'unknown', lastWakeBootType: 'unknown', lastWakeAt: null, lastBootAt: null
};
const ready: WakeOnLanReadiness = { ...unknown, available: true, adapterPresent: true, adapterConnected: true, adapterBus: 'pci',
  adapterInternal: true, magicPacket: 'on', windowsWakeArmed: true, shutdownWake: 'on', fastStartup: 'off', modernStandby: false };

const summary = (readiness: WakeOnLanReadiness | null, checking = false) => Object.fromEntries(
  wakeOnLanReadinessRows(readiness, undefined, checking).map((row) => [row.id, `${row.tone}:${row.status ?? ''}`]));

describe('Wake-on-LAN readiness rows', () => {
  it('always returns the same seven rows in setup order', () => {
    for (const readiness of [null, unknown, ready]) {
      expect(wakeOnLanReadinessRows(readiness, undefined).map((row) => row.id))
        .toEqual(['ethernet', 'wifi', 'device-manager', 'shutdown-wake', 'bios', 'usb-power', 'test']);
    }
  });

  it('marks a fully ready PC and keeps instructions as guides', () => {
    expect(summary(ready)).toEqual({ ethernet: 'ok:Connected', wifi: 'guide:', 'device-manager': 'ok:On',
      'shutdown-wake': 'ok:On', bios: 'guide:', 'usb-power': 'guide:', test: 'guide:' });
  });

  it('says Checking only for a first read and Unknown once the helper could not answer', () => {
    expect(summary(null, true)).toMatchObject({ ethernet: 'unknown:Checking…', 'device-manager': 'unknown:Checking…' });
    expect(summary(unknown, true)).toMatchObject({ ethernet: 'unknown:Unknown', 'device-manager': 'unknown:Unknown',
      'shutdown-wake': 'unknown:Unknown', test: 'guide:' });
  });

  it('uses the adapter list for link state and bus when the readiness read is unavailable', () => {
    const rows = (target: Parameters<typeof wakeOnLanReadinessRows>[1]) => wakeOnLanReadinessRows(unknown, target)[0];
    expect(rows({ id: 'a', name: 'A', mac: unknown.targetMac, connected: false })).toMatchObject({ tone: 'warning', status: 'Not connected' });
    expect(rows({ id: 'a', name: 'A', mac: unknown.targetMac, connected: true, bus: 'usb' }))
      .toMatchObject({ tone: 'warning', status: 'USB or dock adapter', detail: ['Many USB and dock adapters can’t wake the PC from shutdown.'] });
    expect(rows({ id: 'a', name: 'A', mac: unknown.targetMac, connected: true })).toMatchObject({ tone: 'ok', status: 'Connected' });
  });

  it('prioritizes the cable, then a dock adapter, and reports an adapter missing from this PC', () => {
    expect(summary({ ...ready, adapterConnected: false, adapterBus: 'usb' }).ethernet).toBe('warning:Not connected');
    expect(summary({ ...ready, adapterInternal: false }).ethernet).toBe('warning:USB or dock adapter');
    expect(summary({ ...ready, adapterPresent: false })).toMatchObject({ ethernet: 'warning:Not on this PC',
      'device-manager': 'unknown:Unknown', 'shutdown-wake': 'unknown:Unknown' });
  });

  it('names the Device Manager setting that blocks wake', () => {
    expect(summary({ ...ready, magicPacket: 'off', windowsWakeArmed: false })['device-manager']).toBe('warning:Magic packet off');
    expect(summary({ ...ready, windowsWakeArmed: false })['device-manager']).toBe('warning:Wake permission off');
    expect(summary({ ...ready, modernStandby: true, modernStandbyMagicPacket: 'off' })['device-manager']).toBe('warning:Off in Modern Standby');
    // Not applicable without Modern Standby.
    expect(summary({ ...ready, modernStandbyMagicPacket: 'off' })['device-manager']).toBe('ok:On');
    expect(summary({ ...ready, magicPacket: 'not-exposed', windowsWakeArmed: null })['device-manager']).toBe('unknown:Not shown');
    expect(summary({ ...ready, magicPacket: 'not-exposed', windowsWakeArmed: true })['device-manager']).toBe('ok:On');
    expect(summary({ ...ready, shutdownWake: 'off' })['shutdown-wake']).toBe('warning:Off');
    expect(summary({ ...ready, shutdownWake: 'not-exposed' })['shutdown-wake']).toBe('unknown:Not shown');
  });

  it('explains Fast Startup and Modern Standby in separately translated sentences', () => {
    const test = (readiness: WakeOnLanReadiness) => wakeOnLanReadinessRows(readiness, undefined).at(-1)!;
    expect(test({ ...ready, fastStartup: 'on' })).toMatchObject({ tone: 'warning', status: 'Fast Startup on',
      detail: ['Fast Startup is on. Shutdown wake depends on your network driver and motherboard.'] });
    expect(test({ ...ready, modernStandby: true })).toMatchObject({ status: 'Modern Standby',
      detail: ['This PC uses Modern Standby. Sleep wake depends on the network driver’s Modern Standby setting.'] });
    expect(test({ ...ready, fastStartup: 'on', modernStandby: true })).toMatchObject({ status: 'Fast Startup and Modern Standby' });
    expect(test({ ...ready, fastStartup: 'on', modernStandby: true }).detail).toHaveLength(2);
  });

  it('describes one event with its own time: the wake during this boot, otherwise how this boot started', () => {
    const wake = '2026-10-10T20:00:00.000Z', boot = '2026-10-10T19:30:00.000Z';
    expect(wakeOnLanLastEvent(null)).toEqual({ label: 'Last wake: unknown', at: null });
    expect(wakeOnLanLastEvent({ ...unknown, lastWakeSource: 'network-adapter', lastWakeAt: wake })).toEqual({ label: 'Last wake: unknown', at: null });
    // A current wake never borrows the boot type, which describes a different event.
    expect(wakeOnLanLastEvent({ ...ready, lastWakeSource: 'usb', lastWakeAt: wake, lastWakeBootType: 'fast-startup', lastBootAt: boot }))
      .toEqual({ label: 'Last wake: USB device', at: wake });
    expect(wakeOnLanLastEvent({ ...ready, lastWakeSource: 'network-adapter', lastWakeAt: wake, lastWakeBootType: 'unknown' }))
      .toEqual({ label: 'Last wake: network adapter', at: wake });
    // A shutdown wake records no source; an older sleep wake was already reduced to none with no time.
    expect(wakeOnLanLastEvent({ ...ready, lastWakeSource: 'none', lastWakeBootType: 'full', lastBootAt: boot }))
      .toEqual({ label: 'Last start: full boot', at: boot });
    expect(wakeOnLanLastEvent({ ...ready, lastWakeSource: 'unknown', lastWakeBootType: 'hibernate-resume', lastBootAt: null }))
      .toEqual({ label: 'Last start: resumed from hibernation', at: null });
    expect(wakeOnLanLastEvent({ ...ready, lastWakeSource: 'none', lastWakeBootType: 'unknown' })).toEqual({ label: 'Last wake: not recorded', at: null });
  });
});
