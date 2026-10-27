import { describe, expect, it, vi } from 'vitest';
import { parseWakeOnLanReadiness, unknownWakeOnLanReadiness, WakeOnLanReadinessService } from './wake-on-lan-readiness';
import { AudioHelperUnavailableError, runAudioHelperOneShot } from './audio-helper-one-shot';

const MAC = '02:11:22:33:44:55';
const helperResult = {
  version: 1,
  power: { modernStandby: false, sleepS3: true, hibernate: true, fastStartup: 'on' },
  adapter: { connected: true, bus: 'pci', internal: true, defaultRoute: true, magicPacket: 'on', shutdownWake: 'off',
    modernStandbyMagicPacket: 'not-exposed', energyEfficientEthernet: 'off', windowsWakeArmed: true,
    driverProvider: 'Realtek', driverVersion: '1125.29.50.202' },
  adapterStatus: 'present',
  lastWake: { source: 'network-adapter', bootType: 'hibernate-resume', at: '2026-10-10T08:12:00+02:00', bootAt: '2026-10-10T06:11:30.250Z' }
};

function harness(run = vi.fn(async (_args: string[], _options: { timeoutMs: number; maxBuffer: number }) => JSON.stringify(helperResult))) {
  let now = 1_000;
  const service = new WakeOnLanReadinessService({ run, now: () => now, uptimeBootAt: () => Date.parse('2026-10-10T00:00:00.000Z') });
  return { service, run, advance: (ms: number) => { now += ms; } };
}

describe('Wake-on-LAN readiness', () => {
  it('projects every documented field and normalizes the timestamp', () => {
    expect(parseWakeOnLanReadiness(JSON.stringify(helperResult), MAC, 5)).toEqual({
      available: true, targetMac: MAC, checkedAt: 5, modernStandby: false, sleepS3: true, hibernate: true, fastStartup: 'on',
      adapterPresent: true, adapterConnected: true, adapterBus: 'pci', adapterInternal: true, adapterDefaultRoute: true,
      magicPacket: 'on', shutdownWake: 'off', modernStandbyMagicPacket: 'not-exposed', energyEfficientEthernet: 'off',
      windowsWakeArmed: true, driverProvider: 'Realtek', driverVersion: '1125.29.50.202',
      lastWakeSource: 'network-adapter', lastWakeBootType: 'hibernate-resume', lastWakeAt: '2026-10-10T06:12:00.000Z',
      lastBootAt: '2026-10-10T06:11:30.250Z'
    });
  });

  it('turns unexpected values into unknown without failing the whole result', () => {
    const odd = { version: 1, power: { modernStandby: 'yes', fastStartup: 'maybe', sleepS3: 1 },
      adapter: { connected: 'up', bus: 'thunderbolt', internal: null, magicPacket: 'enabled', shutdownWake: 3,
        windowsWakeArmed: 'true', driverProvider: `Vendor\u0000‮${'x'.repeat(200)}`, driverVersion: 7 },
      lastWake: { source: 'keyboard', bootType: 'warm', at: 'yesterday' }, extra: { secret: 'ignored' } };
    const parsed = parseWakeOnLanReadiness(JSON.stringify(odd), MAC, 5);
    expect(parsed).toMatchObject({ available: true, modernStandby: null, fastStartup: 'unknown', sleepS3: null, adapterPresent: true,
      adapterConnected: null, adapterBus: 'unknown', adapterInternal: null, magicPacket: 'unknown', shutdownWake: 'unknown',
      windowsWakeArmed: null, driverVersion: null, lastWakeSource: 'unknown', lastWakeBootType: 'unknown', lastWakeAt: null, lastBootAt: null });
    expect(parsed.driverProvider).toMatch(/^Vendorx+$/);
    expect(parsed.driverProvider!.length).toBeLessThanOrEqual(64);
    expect(JSON.stringify(parsed)).not.toContain('ignored');
  });

  it('distinguishes an adapter that is not on this PC from one the helper could not look up', () => {
    expect(parseWakeOnLanReadiness(JSON.stringify({ ...helperResult, adapterStatus: 'absent', adapter: null }), MAC, 5)).toMatchObject({
      adapterPresent: false, adapterConnected: null, magicPacket: 'unknown', fastStartup: 'on' });
    expect(parseWakeOnLanReadiness(JSON.stringify({ ...helperResult, adapterStatus: 'unknown', adapter: null }), MAC, 5).adapterPresent).toBeNull();
    // Without adapterStatus, adapter implies it.
    const { adapterStatus: _status, ...legacy } = helperResult;
    expect(parseWakeOnLanReadiness(JSON.stringify({ ...legacy, adapter: null }), MAC, 5).adapterPresent).toBe(false);
    const { adapter: _adapter, ...withoutAdapter } = legacy;
    expect(parseWakeOnLanReadiness(JSON.stringify(withoutAdapter), MAC, 5).adapterPresent).toBeNull();
  });

  it.each(['not json', '[]', JSON.stringify({ ...helperResult, version: 2 }), ''])('rejects an unsupported result: %s', (stdout) => {
    expect(() => parseWakeOnLanReadiness(stdout, MAC, 5)).toThrow();
  });

  it('asks the helper with a dashed MAC and a bounded time, then caches the result', async () => {
    const h = harness();
    const first = await h.service.get('02-11-22-33-44-55');
    expect(first).toMatchObject({ available: true, targetMac: MAC, checkedAt: 1_000 });
    expect(h.run).toHaveBeenCalledExactlyOnceWith(['--wake-on-lan-readiness', '--target-mac', '02-11-22-33-44-55'],
      { timeoutMs: 4_500, maxBuffer: 16 * 1024 });
    h.advance(30_000);
    expect(await h.service.get(MAC)).toEqual(first);
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(await h.service.get(MAC, true)).toMatchObject({ checkedAt: 31_000 });
    h.advance(61_000);
    await h.service.get(MAC);
    expect(h.run).toHaveBeenCalledTimes(3);
  });

  it('shares one in-flight read and returns independent copies', async () => {
    let finish!: (value: string) => void;
    const h = harness(vi.fn(() => new Promise<string>((resolve) => { finish = resolve; })));
    const reads = [h.service.get(MAC, true), h.service.get(MAC, true), h.service.get(MAC)];
    finish(JSON.stringify(helperResult));
    const [a, b, c] = await Promise.all(reads);
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    a.fastStartup = 'off';
    expect(c.fastStartup).toBe('on');
  });

  it.each([
    ['a missing or older helper', new AudioHelperUnavailableError('The audio helper does not support --wake-on-lan-readiness.')],
    ['a timeout or read failure', Object.assign(new Error('Command failed'), { killed: true })]
  ])('reports every field unknown for %s, with no fallback process', async (_case, failure) => {
    const h = harness(vi.fn(async () => { throw failure; }));
    expect(await h.service.get(MAC)).toEqual(unknownWakeOnLanReadiness(MAC, 1_000));
    expect(h.run).toHaveBeenCalledTimes(1);
  });

  it('treats a helper that exits 2 with no output as unavailable', async () => {
    const execFile = vi.fn((_file: string, _args: readonly string[], _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void) => {
      callback(Object.assign(new Error('Command failed'), { code: 2 }), '', 'usage');
    });
    const service = new WakeOnLanReadinessService({ now: () => 7, uptimeBootAt: () => 0,
      run: (args, options) => runAudioHelperOneShot(args, options, { execFile: execFile as never, resolveAudioHelperPath: () => 'AudioHelper.exe' }) });
    expect(await service.get(MAC)).toEqual(unknownWakeOnLanReadiness(MAC, 7));
    expect(execFile).toHaveBeenCalledWith('AudioHelper.exe', ['--wake-on-lan-readiness', '--target-mac', '02-11-22-33-44-55'],
      expect.objectContaining({ timeout: 4_500, windowsHide: true }), expect.any(Function));
  });

  it('counts a wake only when it is newer than the recorded boot, and drops a stale wake time whatever its source', () => {
    const bootAt = '2026-10-10T19:30:00.000Z';
    const wake = (at: string | null, source = 'usb', recordedBoot: string | null = bootAt) =>
      JSON.stringify({ ...helperResult, lastWake: { source, bootType: 'full', at, bootAt: recordedBoot } });
    // A full boot logs no wake event: the newest one is from before this boot.
    expect(parseWakeOnLanReadiness(wake('2026-10-10T19:20:35.783Z'), MAC, 5)).toMatchObject({
      lastWakeSource: 'none', lastWakeBootType: 'full', lastWakeAt: null, lastBootAt: bootAt });
    // The boot event wins over uptime, which survives hibernation and hybrid boots.
    expect(parseWakeOnLanReadiness(wake('2026-10-10T19:20:35.783Z'), MAC, 5, Date.parse('2026-10-01T00:00:00.000Z')))
      .toMatchObject({ lastWakeSource: 'none', lastWakeAt: null });
    expect(parseWakeOnLanReadiness(wake('2026-10-10T19:31:00.000Z'), MAC, 5)).toMatchObject({
      lastWakeSource: 'usb', lastWakeAt: '2026-10-10T19:31:00.000Z', lastBootAt: bootAt });
    for (const source of ['unknown', 'none', 'network-adapter']) {
      expect(parseWakeOnLanReadiness(wake('2026-10-01T08:00:00.000Z', source), MAC, 5).lastWakeAt).toBeNull();
    }
    expect(parseWakeOnLanReadiness(wake('2026-10-01T08:00:00.000Z', 'unknown'), MAC, 5).lastWakeSource).toBe('unknown');
    // Without a timestamp the source cannot be shown as current.
    expect(parseWakeOnLanReadiness(wake(null, 'network-adapter'), MAC, 5)).toMatchObject({ lastWakeSource: 'none', lastWakeAt: null });
    // No recorded boot: uptime is the fallback.
    const uptimeBoot = Date.parse('2026-10-10T19:00:00.000Z');
    expect(parseWakeOnLanReadiness(wake('2026-10-10T19:20:35.783Z', 'usb', null), MAC, 5, uptimeBoot))
      .toMatchObject({ lastWakeSource: 'usb', lastWakeAt: '2026-10-10T19:20:35.783Z', lastBootAt: null });
    expect(parseWakeOnLanReadiness(wake('2026-10-10T18:20:35.783Z', 'usb', null), MAC, 5, uptimeBoot))
      .toMatchObject({ lastWakeSource: 'none', lastWakeAt: null });
  });

  it('never starts the helper for an incomplete or multicast MAC', async () => {
    const h = harness();
    for (const value of ['', '02:11:22', '01:11:22:33:44:55', 42, null]) {
      expect(await h.service.get(value)).toEqual(unknownWakeOnLanReadiness());
    }
    expect(h.run).not.toHaveBeenCalled();
  });

  it('bounds its cache to recent adapters', async () => {
    const h = harness();
    for (let index = 0; index < 10; index++) await h.service.get(`02:00:00:00:00:${index.toString(16).padStart(2, '0')}`);
    await h.service.get('02:00:00:00:00:00');
    expect(h.run).toHaveBeenCalledTimes(11);
    await h.service.get('02:00:00:00:00:09');
    expect(h.run).toHaveBeenCalledTimes(11);
  });
});
