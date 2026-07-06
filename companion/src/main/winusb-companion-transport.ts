import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { resolveAudioHelperPath } from './audio-helper';

type TransportReadySuccess = {
  id: 0;
  ok: true;
  path: string;
};

type TransportReadyFailure = {
  id: 0;
  ok: false;
  error: string;
};

type TransportReady = TransportReadySuccess | TransportReadyFailure;

type TransportResponse = {
  id: number;
  ok: true;
  report?: number[];
  path?: string;
} | {
  id: number;
  ok: false;
  error: string;
};

type PendingRequest = {
  resolve: (response: TransportResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};

type OpenOptions = {
  retryTimeoutMs?: number;
  retryDelayMs?: number;
};

const REQUEST_TIMEOUT_MS = 1500;
const START_TIMEOUT_MS = 2500;
const DEFAULT_OPEN_RETRY_DELAY_MS = 50;
const REPORT_LENGTH = 64;

export class WinUsbCompanionTransport extends EventEmitter {
  private nextRequestId = 1;
  private buffer = '';
  private closed = false;
  private readonly pending = new Map<number, PendingRequest>();

  private constructor(
    private readonly helper: ChildProcessWithoutNullStreams,
    readonly path: string
  ) {
    super();
    helper.stdout.on('data', (chunk: Buffer) => this.handleStdout(chunk));
    helper.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8').trim();
      if (text) {
        this.emit('status', text);
      }
    });
    helper.on('error', (error) => this.failAll(error));
    helper.on('exit', (code, signal) => {
      this.closed = true;
      this.failAll(new Error(`WinUSB bridge helper exited (${signal ?? code ?? 'unknown'})`));
      this.emit('close');
    });
  }

  static async open(options: OpenOptions = {}): Promise<WinUsbCompanionTransport> {
    const retryTimeoutMs = Math.max(0, options.retryTimeoutMs ?? 0);
    const retryDelayMs = Math.max(1, options.retryDelayMs ?? DEFAULT_OPEN_RETRY_DELAY_MS);
    const startedAt = Date.now();
    let lastError: Error | null = null;

    while (true) {
      try {
        return await WinUsbCompanionTransport.openOnce();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const elapsedMs = Date.now() - startedAt;
        if (retryTimeoutMs <= 0 || elapsedMs >= retryTimeoutMs) {
          throw lastError;
        }
        await delay(Math.min(retryDelayMs, retryTimeoutMs - elapsedMs));
      }
    }
  }

  private static async openOnce(): Promise<WinUsbCompanionTransport> {
    const helper = spawn(resolveAudioHelperPath(), ['--companion-transport'], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const ready = await new Promise<TransportReadySuccess>((resolve, reject) => {
      let settled = false;
      let stdout = '';
      let stderr = '';
      let timeout: NodeJS.Timeout;
      function finish(message?: TransportReadySuccess, error?: Error) {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        helper.stdout.off('data', onStdout);
        helper.stderr.off('data', onStderr);
        helper.off('error', onError);
        helper.off('exit', onExit);
        if (error) {
          if (!helper.killed) {
            helper.kill();
          }
          reject(error);
        } else {
          resolve(message!);
        }
      }
      timeout = setTimeout(() => {
        finish(undefined, new Error(`WinUSB bridge helper did not become ready within ${START_TIMEOUT_MS}ms.${stderr ? ` ${stderr}` : ''}`));
      }, START_TIMEOUT_MS);
      function onStdout(chunk: Buffer) {
        stdout += chunk.toString('utf8');
        const newlineIndex = stdout.indexOf('\n');
        if (newlineIndex < 0) {
          return;
        }
        const line = stdout.slice(0, newlineIndex).trim();
        try {
          const message = JSON.parse(line) as TransportReady;
          if (message.ok && message.id === 0 && message.path) {
            finish(message);
          } else if (message.ok === false && message.id === 0 && message.error) {
            finish(undefined, new Error(message.error));
          } else {
            finish(undefined, new Error('WinUSB bridge helper returned an invalid ready response.'));
          }
        } catch (error) {
          finish(undefined, error instanceof Error ? error : new Error(String(error)));
        }
      }
      function onStderr(chunk: Buffer) {
        stderr += chunk.toString('utf8');
        if (stderr.length > 2048) {
          stderr = stderr.slice(-2048);
        }
      }
      function onError(error: Error) {
        finish(undefined, error);
      }
      function onExit(code: number | null, signal: NodeJS.Signals | null) {
        finish(undefined, new Error(`WinUSB bridge helper exited before ready (${signal ?? code ?? 'unknown'}).${stderr ? ` ${stderr}` : ''}`));
      }
      helper.stdout.on('data', onStdout);
      helper.stderr.on('data', onStderr);
      helper.on('error', onError);
      helper.on('exit', onExit);
    });

    return new WinUsbCompanionTransport(helper, ready.path);
  }

  async getFeatureReport(reportId: number, _length = REPORT_LENGTH): Promise<number[]> {
    const response = await this.request({ op: 'get', reportId: reportId & 0xff });
    if (!response.ok) {
      throw new Error(response.error);
    }
    if (!Array.isArray(response.report)) {
      throw new Error('WinUSB bridge helper did not return a report.');
    }
    return response.report;
  }

  async sendFeatureReport(report: ArrayLike<number>): Promise<void> {
    await this.writeReport(report, 'set');
  }

  async write(report: ArrayLike<number>): Promise<void> {
    await this.writeReport(report, 'write');
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.helper.stdin.write(`${JSON.stringify({ id: this.nextRequestId++, op: 'close' })}\n`, () => {
      this.helper.stdin.end();
      this.helper.kill();
    });
    this.failAll(new Error('WinUSB bridge helper closed.'));
  }

  private async writeReport(report: ArrayLike<number>, op: 'set' | 'write'): Promise<void> {
    const response = await this.request({
      op,
      report: normalizeReport(report)
    });
    if (!response.ok) {
      throw new Error(response.error);
    }
  }

  private request(payload: Record<string, unknown>): Promise<TransportResponse> {
    if (this.closed || this.helper.stdin.destroyed || !this.helper.stdin.writable) {
      return Promise.reject(new Error('WinUSB bridge helper is not running.'));
    }
    const id = this.nextRequestId++;
    const message = JSON.stringify({ id, ...payload });
    return new Promise<TransportResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('WinUSB bridge helper request timed out.'));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timeout });
      this.helper.stdin.write(`${message}\n`, (error) => {
        if (!error) {
          return;
        }
        const pending = this.pending.get(id);
        if (!pending) {
          return;
        }
        clearTimeout(pending.timeout);
        this.pending.delete(id);
        pending.reject(error);
      });
    });
  }

  private handleStdout(chunk: Buffer): void {
    this.buffer += chunk.toString('utf8');
    while (true) {
      const newlineIndex = this.buffer.indexOf('\n');
      if (newlineIndex < 0) {
        return;
      }
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }
      this.handleResponse(line);
    }
  }

  private handleResponse(line: string): void {
    let response: TransportResponse;
    try {
      response = JSON.parse(line) as TransportResponse;
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      return;
    }
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timeout);
    this.pending.delete(response.id);
    pending.resolve(response);
  }

  private failAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

function normalizeReport(report: ArrayLike<number>): number[] {
  if (report.length !== REPORT_LENGTH) {
    throw new Error(`Expected ${REPORT_LENGTH} report bytes, received ${report.length}.`);
  }
  return Array.from({ length: REPORT_LENGTH }, (_, index) => report[index] & 0xff);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
