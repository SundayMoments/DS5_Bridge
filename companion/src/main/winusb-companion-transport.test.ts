import { Buffer } from 'node:buffer';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const childProcessMock = vi.hoisted(() => {
  const { EventEmitter } = require('node:events') as typeof import('node:events');

  class MockWritable extends EventEmitter {
    destroyed = false;
    writable = true;
    writes: string[] = [];

    write(chunk: string, callback?: (error?: Error | null) => void): boolean {
      this.writes.push(chunk);
      callback?.();
      return true;
    }

    end(): void {
      this.writable = false;
    }
  }

  class MockChildProcess extends EventEmitter {
    stdout = new EventEmitter();
    stderr = new EventEmitter();
    stdin = new MockWritable();
    killed = false;
    kill = vi.fn(() => {
      this.killed = true;
      return true;
    });
  }

  const state = {
    processes: [] as MockChildProcess[]
  };

  return {
    state,
    spawn: vi.fn(() => {
      const process = new MockChildProcess();
      state.processes.push(process);
      return process;
    })
  };
});

vi.mock('node:child_process', () => ({
  spawn: childProcessMock.spawn
}));

vi.mock('./audio-helper', () => ({
  resolveAudioHelperPath: () => 'AudioHelper.exe'
}));

import { WinUsbCompanionTransport } from './winusb-companion-transport';

function helperProcess() {
  const process = childProcessMock.state.processes.at(-1);
  if (!process) {
    throw new Error('Expected helper process to be spawned');
  }
  return process;
}

function emitJsonLine(stream: { emit(event: string, chunk: Buffer): boolean }, value: unknown): void {
  stream.emit('data', Buffer.from(`${JSON.stringify(value)}\n`, 'utf8'));
}

function takeRequest(): Record<string, unknown> {
  const process = helperProcess();
  const raw = process.stdin.writes.shift();
  if (!raw) {
    throw new Error('Expected helper stdin write');
  }
  return JSON.parse(raw.trim()) as Record<string, unknown>;
}

async function openTransport(): Promise<WinUsbCompanionTransport> {
  const opening = WinUsbCompanionTransport.open();
  const process = helperProcess();
  emitJsonLine(process.stdout, { id: 0, ok: true, path: 'winusb://bridge' });
  return opening;
}

describe('WinUsbCompanionTransport', () => {
  beforeEach(() => {
    childProcessMock.spawn.mockClear();
    childProcessMock.state.processes = [];
  });

  it('spawns the helper transport mode and opens after a ready response', async () => {
    const transport = await openTransport();

    expect(childProcessMock.spawn).toHaveBeenCalledWith(
      'AudioHelper.exe',
      ['--companion-transport'],
      expect.objectContaining({
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true
      })
    );
    expect(transport.path).toBe('winusb://bridge');
  });

  it('rejects a controlled helper startup failure without waiting for a crash', async () => {
    const opening = WinUsbCompanionTransport.open();
    const process = helperProcess();

    emitJsonLine(process.stdout, {
      id: 0,
      ok: false,
      error: 'IOException: DS5 Bridge WinUSB interface was not found.'
    });

    await expect(opening).rejects.toThrow('DS5 Bridge WinUSB interface was not found');
    expect(process.kill).toHaveBeenCalled();
  });

  it('routes feature report requests by id and returns the matching helper response', async () => {
    const transport = await openTransport();
    const report = new Array<number>(64).fill(0).map((_, index) => index);

    const pending = transport.getFeatureReport(0x123);
    const request = takeRequest();
    expect(request).toMatchObject({
      id: 1,
      op: 'get',
      reportId: 0x23
    });

    emitJsonLine(helperProcess().stdout, { id: request.id, ok: true, report });

    await expect(pending).resolves.toEqual(report);
  });

  it('normalizes report bytes before sending set and write operations', async () => {
    const transport = await openTransport();
    const report = new Array<number>(64).fill(0).map((_, index) => 0x100 + index);

    const setPending = transport.sendFeatureReport(report);
    const setRequest = takeRequest();
    expect(setRequest).toMatchObject({
      id: 1,
      op: 'set'
    });
    expect((setRequest.report as number[])[0]).toBe(0);
    expect((setRequest.report as number[])[63]).toBe(63);
    emitJsonLine(helperProcess().stdout, { id: setRequest.id, ok: true });
    await expect(setPending).resolves.toBeUndefined();

    const writePending = transport.write(report);
    const writeRequest = takeRequest();
    expect(writeRequest).toMatchObject({
      id: 2,
      op: 'write'
    });
    emitJsonLine(helperProcess().stdout, { id: writeRequest.id, ok: true });
    await expect(writePending).resolves.toBeUndefined();
  });

  it('rejects helper error responses and malformed outgoing reports', async () => {
    const transport = await openTransport();

    const pending = transport.getFeatureReport(1);
    const request = takeRequest();
    emitJsonLine(helperProcess().stdout, { id: request.id, ok: false, error: 'bridge unplugged' });

    await expect(pending).rejects.toThrow('bridge unplugged');
    await expect(transport.write(new Array<number>(63).fill(0))).rejects.toThrow(
      'Expected 64 report bytes'
    );
  });

  it('emits parse errors for malformed helper output without completing pending requests', async () => {
    const transport = await openTransport();
    const errors: Error[] = [];
    transport.on('error', (error) => errors.push(error));

    const pending = transport.getFeatureReport(1);
    const request = takeRequest();
    helperProcess().stdout.emit('data', Buffer.from('{bad json}\n', 'utf8'));
    emitJsonLine(helperProcess().stdout, { id: request.id, ok: true, report: new Array<number>(64).fill(7) });

    expect(errors).toHaveLength(1);
    await expect(pending).resolves.toEqual(new Array<number>(64).fill(7));
  });

  it('rejects pending requests and emits close when the helper exits', async () => {
    const transport = await openTransport();
    const closed: boolean[] = [];
    transport.on('close', () => closed.push(true));

    const pending = transport.getFeatureReport(1);
    takeRequest();
    helperProcess().emit('exit', 2, null);

    await expect(pending).rejects.toThrow('WinUSB bridge helper exited (2)');
    expect(closed).toEqual([true]);
    await expect(transport.getFeatureReport(1)).rejects.toThrow('WinUSB bridge helper is not running');
  });

  it('sends close to the helper and rejects future requests', async () => {
    const transport = await openTransport();

    transport.close();

    expect(takeRequest()).toMatchObject({
      id: 1,
      op: 'close'
    });
    expect(helperProcess().stdin.writable).toBe(false);
    expect(helperProcess().kill).toHaveBeenCalled();
    await expect(transport.getFeatureReport(1)).rejects.toThrow('WinUSB bridge helper is not running');
  });
});
