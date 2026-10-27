import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { resolveAudioHelperPath } from './audio-helper';

// Chord keyboard shortcuts are typed with SendInput by a resident audio helper,
// the way Steam Input sends keys, instead of a PowerShell process per press.

/** The helper retires after this long without a key press, like Kitsune's keyboard helper. */
export const KEYBOARD_HELPER_IDLE_MS = 5 * 60_000;
/** A staged tap takes about 120 ms; a queue of four, about half a second. */
const TAP_TIMEOUT_MS = 3_000;

export interface KeyboardInputPort {
  /** Types one shortcut: Windows virtual-key codes, modifiers and keys in any order. */
  tap(virtualKeys: readonly number[]): Promise<void>;
  stop(): void;
}

type HelperProcess = Pick<ChildProcessWithoutNullStreams, 'stdin' | 'stdout' | 'stderr' | 'kill' | 'on' | 'once'>;

interface PendingTap {
  helper: HelperProcess;
  resolve(): void;
  reject(error: Error): void;
  timeout: NodeJS.Timeout;
}

export interface KeyboardInputHelperOptions {
  spawnHelper?: () => HelperProcess;
  idleMs?: number;
}

function spawnKeyboardHelper(): HelperProcess {
  return spawn(resolveAudioHelperPath(), ['--keyboard-input-server'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });
}

export class KeyboardInputHelper implements KeyboardInputPort {
  private helper: HelperProcess | null = null;
  private readonly pending = new Map<number, PendingTap>();
  private nextId = 1;
  private idleTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(private readonly options: KeyboardInputHelperOptions = {}) {}

  tap(virtualKeys: readonly number[]): Promise<void> {
    if (this.stopped) {
      return Promise.reject(new Error('The keyboard helper is stopped.'));
    }
    let helper: HelperProcess;
    try {
      helper = this.ensureHelper();
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    this.scheduleIdleRetire();
    const id = this.nextId++;
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('The keyboard helper did not answer.'));
        // A helper that stopped answering is replaced on the next press.
        this.retire(helper, true);
      }, TAP_TIMEOUT_MS);
      this.pending.set(id, { helper, resolve, reject, timeout });
      // A press made while the helper starts waits in its input pipe instead of being dropped.
      helper.stdin.write(`${JSON.stringify({ id, op: 'tap', keys: [...virtualKeys] })}\n`, (error) => {
        if (error) this.settle(id, error);
      });
    });
  }

  stop(): void {
    this.stopped = true;
    if (this.helper) this.retire(this.helper, true);
  }

  private ensureHelper(): HelperProcess {
    if (this.helper) return this.helper;
    const helper = (this.options.spawnHelper ?? spawnKeyboardHelper)();
    this.helper = helper;
    const lines = createInterface({ input: helper.stdout });
    lines.on('line', (line) => {
      let message: { id?: unknown; ok?: unknown; error?: unknown };
      try {
        message = JSON.parse(line) as typeof message;
      } catch {
        return;
      }
      if (typeof message.id !== 'number') return;
      this.settle(message.id, message.ok === true ? null
        : new Error(typeof message.error === 'string' ? message.error : 'The key press failed.'));
    });
    helper.stderr.on('data', () => undefined);
    helper.on('error', (error: Error) => this.helperGone(helper, error));
    helper.on('exit', () => this.helperGone(helper, new Error('The keyboard helper exited.')));
    return helper;
  }

  private settle(id: number, error: Error | null): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(id);
    if (error) pending.reject(error);
    else pending.resolve();
  }

  private scheduleIdleRetire(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.pending.size > 0) {
        this.scheduleIdleRetire();
        return;
      }
      if (this.helper) this.retire(this.helper, false);
    }, this.options.idleMs ?? KEYBOARD_HELPER_IDLE_MS);
    this.idleTimer.unref?.();
  }

  /** Closing stdin ends the helper on its own; `force` also kills it. */
  private retire(helper: HelperProcess, force: boolean): void {
    if (this.helper === helper) this.helper = null;
    if (this.idleTimer && !this.helper) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    helper.stdin.end();
    if (force) helper.kill();
  }

  /** Fails only the presses this helper took; a replacement keeps its own. */
  private helperGone(helper: HelperProcess, error: Error): void {
    if (this.helper === helper) this.helper = null;
    for (const [id, pending] of [...this.pending]) {
      if (pending.helper === helper) this.settle(id, error);
    }
  }
}
