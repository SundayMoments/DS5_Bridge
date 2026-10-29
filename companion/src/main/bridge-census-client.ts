import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { listBridges, parseBridgeCensus, resolveAudioHelperPath, type BridgeCensus } from './audio-helper';

// Bridge censuses come from a resident audio helper that answers one
// "snapshot" line at a time, as Kitsune Input's bridge device server does,
// so the bridge list can be refreshed every couple of seconds without starting
// a process each time. While the resident helper is unavailable, each census
// runs the one-shot `--list-bridges` helper instead.

export interface BridgeCensusPort {
  list(): Promise<BridgeCensus>;
  stop(): void;
}

type HelperProcess = Pick<ChildProcessWithoutNullStreams, 'stdin' | 'stdout' | 'stderr' | 'kill' | 'on'>;

export interface BridgeCensusClientOptions {
  spawnHelper?: () => HelperProcess;
  listOnce?: () => Promise<BridgeCensus>;
  timeoutMs?: number;
  now?: () => number;
}

const QUERY_TIMEOUT_MS = 5000;
const HELPER_STOP_TIMEOUT_MS = 250;
/** Kitsune Input's backoff before a failed resident helper is started again. */
export const BRIDGE_CENSUS_HELPER_RETRY_DELAYS_MS = [5000, 10000, 20000, 40000, 60000] as const;

function spawnCensusHelper(): HelperProcess {
  return spawn(resolveAudioHelperPath(), ['--bridge-device-server'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

interface PendingCensus {
  resolve(census: BridgeCensus): void;
  reject(error: Error): void;
  timeout: NodeJS.Timeout;
}

class ResidentCensusHelper {
  private pending: PendingCensus | null = null;
  private stopped = false;
  /** Set by the first census; a helper that never sent one may predate the server. */
  answered = false;

  constructor(private readonly helper: HelperProcess, private readonly timeoutMs: number) {
    createInterface({ input: helper.stdout }).on('line', (line) => this.receive(line));
    helper.stderr.on('data', () => undefined);
    helper.stdin.on('error', (error: Error) => this.fail(error));
    helper.on('error', (error: Error) => this.fail(error));
    helper.on('exit', () => this.fail(new Error('The bridge census helper exited.')));
  }

  query(): Promise<BridgeCensus> {
    if (this.stopped) return Promise.reject(new Error('The bridge census helper is not running.'));
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => this.fail(new Error('The bridge census helper timed out.')), this.timeoutMs);
      timeout.unref?.();
      this.pending = { resolve, reject, timeout };
      this.helper.stdin.write('snapshot\n', (error) => {
        if (error) this.fail(error);
      });
    });
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.rejectPending(new Error('The bridge census helper stopped.'));
    try {
      this.helper.stdin.end('stop\n');
    } catch {
      // The helper may already be gone.
    }
    setTimeout(() => this.helper.kill(), HELPER_STOP_TIMEOUT_MS).unref?.();
  }

  private receive(line: string): void {
    const text = line.trim();
    const pending = this.pending;
    if (!text || !pending) return;
    this.pending = null;
    clearTimeout(pending.timeout);
    let census: BridgeCensus;
    try {
      census = parseBridgeCensus(text);
    } catch (error) {
      pending.reject(error instanceof Error ? error : new Error(String(error)));
      this.fail(new Error('The bridge census helper sent something other than a census.'));
      return;
    }
    this.answered = true;
    pending.resolve(census);
  }

  private fail(error: Error): void {
    if (this.stopped) return;
    this.stopped = true;
    this.rejectPending(error);
    this.helper.kill();
  }

  private rejectPending(error: Error): void {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    clearTimeout(pending.timeout);
    pending.reject(error);
  }
}

export class BridgeCensusClient implements BridgeCensusPort {
  private helper: ResidentCensusHelper | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private retryAt = 0;
  private failures = 0;
  private stopped = false;

  constructor(private readonly options: BridgeCensusClientOptions = {}) {}

  /** Censuses run one at a time, in the order they were asked for. */
  list(): Promise<BridgeCensus> {
    const result = this.queue.then(() => this.listNow(), () => this.listNow());
    this.queue = result.catch(() => undefined);
    return result;
  }

  stop(): void {
    this.stopped = true;
    this.helper?.stop();
    this.helper = null;
  }

  private async listNow(): Promise<BridgeCensus> {
    if (this.stopped) return { bridges: [], hidDevices: [] };
    const now = this.options.now ?? Date.now;
    if (now() >= this.retryAt) {
      const helper = this.helper ?? this.startHelper();
      try {
        const census = await helper.query();
        this.failures = 0;
        return census;
      } catch {
        helper.stop();
        if (this.helper === helper) this.helper = null;
        // The audio helper ignores options it does not know, so one from
        // before the server never answers; leave it on the one-shot census.
        this.retryAt = helper.answered
          ? now() + BRIDGE_CENSUS_HELPER_RETRY_DELAYS_MS[Math.min(this.failures, BRIDGE_CENSUS_HELPER_RETRY_DELAYS_MS.length - 1)]
          : Number.POSITIVE_INFINITY;
        this.failures += 1;
      }
    }
    if (this.stopped) return { bridges: [], hidDevices: [] };
    return (this.options.listOnce ?? listBridges)();
  }

  private startHelper(): ResidentCensusHelper {
    this.helper = new ResidentCensusHelper(
      (this.options.spawnHelper ?? spawnCensusHelper)(),
      this.options.timeoutMs ?? QUERY_TIMEOUT_MS
    );
    return this.helper;
  }
}
