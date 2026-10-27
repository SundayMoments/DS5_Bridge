import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createInterface } from 'node:readline';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KeyboardInputHelper } from './keyboard-input-helper';

/** A stand-in for `AudioHelper --keyboard-input-server` that answers each tap. */
function fakeHelper(answer: (request: { id: number; keys: number[] }) => { ok: boolean; error?: string } | null = () => ({ ok: true })) {
  const events = new EventEmitter();
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const requests: Array<{ id: number; op: string; keys: number[] }> = [];
  createInterface({ input: stdin }).on('line', (line) => {
    const request = JSON.parse(line) as { id: number; op: string; keys: number[] };
    requests.push(request);
    const response = answer(request);
    if (response) stdout.write(`${JSON.stringify({ id: request.id, ...response })}\n`);
  });
  const helper = {
    stdin, stdout, stderr,
    kill: vi.fn(() => { events.emit('exit', null, 'SIGTERM'); return true; }),
    on: (event: string, listener: (...args: unknown[]) => void) => { events.on(event, listener); return helper; },
    once: (event: string, listener: (...args: unknown[]) => void) => { events.once(event, listener); return helper; },
    exit: () => events.emit('exit', 0, null)
  };
  return { helper, requests };
}

afterEach(() => { vi.useRealTimers(); });

describe('Keyboard input helper', () => {
  it('starts one resident helper and types every shortcut through it', async () => {
    const fake = fakeHelper();
    const spawnHelper = vi.fn(() => fake.helper as never);
    const keyboard = new KeyboardInputHelper({ spawnHelper });
    await keyboard.tap([0x11, 0x10, 0x1b]);
    await keyboard.tap([0xb3]);
    expect(spawnHelper).toHaveBeenCalledOnce();
    expect(fake.requests).toEqual([
      { id: 1, op: 'tap', keys: [0x11, 0x10, 0x1b] },
      { id: 2, op: 'tap', keys: [0xb3] }
    ]);
    keyboard.stop();
  });

  it('reports why a key press was not sent', async () => {
    const fake = fakeHelper(() => ({ ok: false, error: 'Windows blocked the key press.' }));
    const keyboard = new KeyboardInputHelper({ spawnHelper: () => fake.helper as never });
    await expect(keyboard.tap([0x41])).rejects.toThrow('Windows blocked the key press.');
    keyboard.stop();
  });

  it('fails the presses of a helper that exits and starts a new one for the next press', async () => {
    const first = fakeHelper(() => null);
    const second = fakeHelper();
    const helpers = [first.helper, second.helper];
    const keyboard = new KeyboardInputHelper({ spawnHelper: () => helpers.shift() as never });
    const lost = keyboard.tap([0x41]);
    await new Promise((resolve) => setImmediate(resolve));
    first.helper.exit();
    await expect(lost).rejects.toThrow('The keyboard helper exited.');
    await keyboard.tap([0x42]);
    expect(second.requests).toEqual([{ id: 2, op: 'tap', keys: [0x42] }]);
    keyboard.stop();
  });

  it('retires the helper after it sits idle and replaces one that stops answering', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const quiet = fakeHelper(() => null);
    const next = fakeHelper();
    const helpers = [quiet.helper, next.helper];
    const spawnHelper = vi.fn(() => helpers.shift() as never);
    const keyboard = new KeyboardInputHelper({ spawnHelper, idleMs: 60_000 });
    const unanswered = keyboard.tap([0x41]);
    const settled = expect(unanswered).rejects.toThrow('The keyboard helper did not answer.');
    await vi.advanceTimersByTimeAsync(3_000);
    await settled;
    expect(quiet.helper.kill).toHaveBeenCalled();

    const answered = keyboard.tap([0x42]);
    await vi.advanceTimersByTimeAsync(0);
    await answered;
    expect(spawnHelper).toHaveBeenCalledTimes(2);
    const ended = new Promise((resolve) => next.helper.stdin.once('finish', resolve));
    await vi.advanceTimersByTimeAsync(60_000);
    await ended;
    expect(next.helper.kill).not.toHaveBeenCalled();
    keyboard.stop();
  });

  it('refuses presses after the app stops', async () => {
    const fake = fakeHelper();
    const keyboard = new KeyboardInputHelper({ spawnHelper: () => fake.helper as never });
    await keyboard.tap([0x41]);
    keyboard.stop();
    expect(fake.helper.kill).toHaveBeenCalled();
    await expect(keyboard.tap([0x41])).rejects.toThrow('The keyboard helper is stopped.');
  });
});
