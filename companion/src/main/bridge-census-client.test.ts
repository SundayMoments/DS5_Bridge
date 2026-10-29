import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { BridgeCensus } from './audio-helper';
import { BRIDGE_CENSUS_HELPER_RETRY_DELAYS_MS, BridgeCensusClient } from './bridge-census-client';

type Reply = (request: number) => string | null;

class FakeCensusHelper extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  requests = 0;
  killed = false;

  constructor(reply: Reply) {
    super();
    let buffered = '';
    this.stdin.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8');
      let newline = buffered.indexOf('\n');
      while (newline >= 0) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        if (line === 'snapshot') {
          this.requests += 1;
          const answer = reply(this.requests);
          if (answer !== null) this.stdout.write(`${answer}\n`);
        }
        newline = buffered.indexOf('\n');
      }
    });
  }

  kill(): boolean {
    if (!this.killed) {
      this.killed = true;
      this.emit('exit', null, 'SIGTERM');
    }
    return true;
  }
}

function census(path: string): string {
  return JSON.stringify({ bridges: [{ path, containerId: 'AAAAAAAA-0000-0000-0000-000000000000' }], hidDevices: [] });
}

const ONE_SHOT: BridgeCensus = { bridges: [{ path: 'winusb://one-shot', containerId: null }], hidDevices: [] };

function client(replies: Reply[], options: { now?: () => number } = {}) {
  const helpers: FakeCensusHelper[] = [];
  const listOnce = vi.fn(async () => ONE_SHOT);
  const censusClient = new BridgeCensusClient({
    spawnHelper: () => {
      const helper = new FakeCensusHelper(replies[Math.min(helpers.length, replies.length - 1)]!);
      helpers.push(helper);
      return helper;
    },
    listOnce,
    timeoutMs: 30,
    ...options
  });
  return { censusClient, helpers, listOnce };
}

describe('bridge census client', () => {
  it('answers every census from one resident helper', async () => {
    const { censusClient, helpers, listOnce } = client([(request) => census(`winusb://bridge-${request}`)]);

    const [first, second] = await Promise.all([censusClient.list(), censusClient.list()]);
    const third = await censusClient.list();

    expect([first, second, third].map((result) => result.bridges[0]!.path)).toEqual([
      'winusb://bridge-1',
      'winusb://bridge-2',
      'winusb://bridge-3'
    ]);
    expect(first.bridges[0]!.containerId).toBe('aaaaaaaa-0000-0000-0000-000000000000');
    expect(helpers).toHaveLength(1);
    expect(helpers[0]!.requests).toBe(3);
    expect(listOnce).not.toHaveBeenCalled();
    censusClient.stop();
  });

  it('keeps a bridge’s board ID from its USB serial only when it is one', async () => {
    const { censusClient } = client([() => JSON.stringify({
      bridges: [
        { path: 'winusb://bridge-only', containerId: null, uniqueId: 'C7A9C48819B4825A' },
        { path: 'winusb://persona', containerId: null, uniqueId: null },
        { path: 'winusb://odd', containerId: null, uniqueId: 'not-a-board-id' }
      ],
      hidDevices: []
    })]);

    const { bridges } = await censusClient.list();

    expect(bridges).toEqual([
      { path: 'winusb://bridge-only', containerId: null, uniqueId: 'c7a9c48819b4825a' },
      { path: 'winusb://persona', containerId: null },
      { path: 'winusb://odd', containerId: null }
    ]);
    censusClient.stop();
  });

  it('falls back to one-shot censuses after the helper fails, and starts it again after Kitsune’s backoff', async () => {
    let now = 1_000;
    const { censusClient, helpers, listOnce } = client([
      (request) => request === 1 ? census('winusb://resident') : null,
      () => census('winusb://restarted')
    ], { now: () => now });

    expect((await censusClient.list()).bridges[0]!.path).toBe('winusb://resident');
    expect(censusClient.isResident()).toBe(true);
    // The helper stops answering: this census and the next come from one-shot helpers.
    expect(await censusClient.list()).toEqual(ONE_SHOT);
    expect(await censusClient.list()).toEqual(ONE_SHOT);
    expect(censusClient.isResident()).toBe(false);
    expect(helpers).toHaveLength(1);
    expect(helpers[0]!.killed).toBe(true);
    expect(listOnce).toHaveBeenCalledTimes(2);

    now += BRIDGE_CENSUS_HELPER_RETRY_DELAYS_MS[0];
    expect(censusClient.isResident()).toBe(true);
    expect((await censusClient.list()).bridges[0]!.path).toBe('winusb://restarted');
    expect(helpers).toHaveLength(2);
    censusClient.stop();
  });

  it('keeps an audio helper that never answers, one from before the server, on one-shot censuses', async () => {
    let now = 1_000;
    const { censusClient, helpers, listOnce } = client([() => null], { now: () => now });

    expect(await censusClient.list()).toEqual(ONE_SHOT);
    now += 10 * 60_000;
    expect(await censusClient.list()).toEqual(ONE_SHOT);

    expect(censusClient.isResident()).toBe(false);
    expect(helpers).toHaveLength(1);
    expect(helpers[0]!.killed).toBe(true);
    expect(listOnce).toHaveBeenCalledTimes(2);
  });

  it('treats a reply that is not a census as no server', async () => {
    const { censusClient, helpers, listOnce } = client([() => 'status: render loopback started']);

    expect(await censusClient.list()).toEqual(ONE_SHOT);
    expect(await censusClient.list()).toEqual(ONE_SHOT);
    expect(helpers).toHaveLength(1);
    expect(listOnce).toHaveBeenCalledTimes(2);
  });

  it('asks the helper to stop and lists nothing once stopped', async () => {
    const { censusClient, helpers, listOnce } = client([() => census('winusb://bridge')]);
    await censusClient.list();
    const stdinEnded = new Promise<void>((resolve) => helpers[0]!.stdin.on('finish', resolve));

    censusClient.stop();

    await stdinEnded;
    expect(await censusClient.list()).toEqual({ bridges: [], hidDevices: [] });
    expect(listOnce).not.toHaveBeenCalled();
  });
});
