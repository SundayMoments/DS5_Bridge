import { describe, expect, it } from 'vitest';
import { WindowsWakeOnLanTargets, parseWakeOnLanTargets } from './wake-on-lan-targets';

const row = (name: string, mac: string, status = 'Up') => ({ InterfaceGuid: `{${name}}`, Name: name, MacAddress: mac, Status: status });

describe('Wake-on-LAN adapter discovery', () => {
  it('parses Get-NetAdapter JSON, skipping unusable rows and duplicates', () => {
    expect(parseWakeOnLanTargets(JSON.stringify(row('Ethernet', '02-11-22-33-44-55')))).toEqual([{
      id: '{Ethernet}', name: 'Ethernet', mac: '02:11:22:33:44:55', connected: true,
      bus: 'unknown', internal: null, defaultRoute: null
    }]);
    const targets = parseWakeOnLanTargets(JSON.stringify([
      row('Dock', '02-AA-BB-CC-DD-EE', 'Disconnected'),
      row('Ethernet', '02-11-22-33-44-55'),
      row('Copy', '02-11-22-33-44-55'),
      row('Broken', 'not-a-mac'),
      { Name: 'No guid', MacAddress: '02-00-00-00-00-01' }
    ]));
    expect(targets.map((target) => target.name)).toEqual(['Ethernet', 'Dock']);
    expect(parseWakeOnLanTargets('')).toEqual([]);
  });

  it('caches discovery and keeps the last good list when a refresh fails', async () => {
    let reads = 0;
    let fail = false;
    let clock = 0;
    const targets = new WindowsWakeOnLanTargets({
      now: () => clock,
      ttlMs: 60_000,
      interfaces: () => ({}),
      read: async () => {
        reads += 1;
        if (fail) throw new Error('powershell failed');
        return JSON.stringify([row('Ethernet', '02-11-22-33-44-55')]);
      }
    });
    expect(targets.ownershipKnown()).toBe(false);
    expect(await targets.list()).toHaveLength(1);
    await targets.list();
    expect(reads).toBe(1);
    expect(targets.owns('02:11:22:33:44:55')).toBe(true);
    expect(targets.owns('02-11-22-33-44-55')).toBe(true);
    expect(targets.owns('02:99:99:99:99:99')).toBe(false);
    clock = 61_000;
    await targets.list();
    expect(reads).toBe(2);
    fail = true;
    await expect(targets.list(true)).rejects.toThrow(/physical Ethernet adapters/);
    expect(targets.ownershipKnown()).toBe(false);
    expect(targets.owns('02:11:22:33:44:55')).toBe(true);
  });

  it('reads the helper’s bus, enclosure and default route, treating anything else as unknown', () => {
    const adapter = (overrides: Record<string, unknown>) => parseWakeOnLanTargets(JSON.stringify({ InterfaceGuid: 'nic', Name: 'Ethernet',
      MacAddress: '02-11-22-33-44-55', Status: 'Up', ...overrides }))[0];
    expect(adapter({ EnumeratorName: 'PCI', InLocalMachineContainer: true, DefaultRoute: true }))
      .toMatchObject({ bus: 'pci', internal: true, defaultRoute: true });
    expect(adapter({ EnumeratorName: 'usb', InLocalMachineContainer: false, DefaultRoute: false }))
      .toMatchObject({ bus: 'usb', internal: false, defaultRoute: false });
    expect(adapter({ EnumeratorName: 'SWD', InLocalMachineContainer: null, DefaultRoute: null }))
      .toMatchObject({ bus: 'other', internal: null, defaultRoute: null });
    expect(adapter({ EnumeratorName: null, InLocalMachineContainer: 'true', DefaultRoute: 1 }))
      .toMatchObject({ bus: 'unknown', internal: null, defaultRoute: null });
  });
});
