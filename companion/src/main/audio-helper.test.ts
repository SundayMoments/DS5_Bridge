import { beforeEach, describe, expect, it, vi } from 'vitest';

const childProcessMock = vi.hoisted(() => {
  const { EventEmitter } = require('node:events') as typeof import('node:events');

  class MockWritable extends EventEmitter {
    destroyed = false;
    writable = true;
    end = vi.fn(() => {
      this.writable = false;
    });
    write = vi.fn((_line: string, callback?: (error?: Error | null) => void) => {
      callback?.();
      return true;
    });
  }

  class MockChildProcess extends EventEmitter {
    stdout = Object.assign(new EventEmitter(), { resume: vi.fn() });
    stderr = new EventEmitter();
    stdin = new MockWritable();
    killed = false;
    kill = vi.fn((signal?: string) => {
      this.killed = true;
      this.emit('exit', null, signal ?? 'SIGTERM');
      return true;
    });
  }

  const processes: MockChildProcess[] = [];

  return {
    processes,
    spawn: vi.fn(() => {
      const process = new MockChildProcess();
      processes.push(process);
      return process;
    })
  };
});

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(() => true)
}));

vi.mock('node:child_process', () => ({
  spawn: childProcessMock.spawn
}));

vi.mock('node:fs', () => ({
  existsSync: fsMock.existsSync
}));

import {
  AudioHapticsSessionMonitor,
  playBridgeHapticsTestPattern,
  playBridgeSpeakerTestTone,
  SystemAudioHapticsEngine
} from './audio-helper';

beforeEach(() => {
  childProcessMock.processes.length = 0;
  childProcessMock.spawn.mockClear();
  fsMock.existsSync.mockClear();
  fsMock.existsSync.mockReturnValue(true);
});

describe('SystemAudioHapticsEngine app source', () => {
  it('passes selected app session identity to the helper', async () => {
    const engine = new SystemAudioHapticsEngine();
    const start = engine.start({
      source: {
        kind: 'app-session',
        processId: 1234,
        displayName: 'Game',
        executableName: 'Game.exe',
        processPath: 'C:\\Games\\Game.exe'
      },
      gainPercent: 125,
      bassFocus: 'punchy',
      response: 'strong',
      attack: 'fast',
      release: 'smooth'
    }, 'xbox');

    const helper = childProcessMock.processes[0]!;
    helper.stderr.emit('data', Buffer.from('status: recording-started\n'));
    await start;

    expect(childProcessMock.spawn).toHaveBeenCalledTimes(1);
    const args = childProcessMock.spawn.mock.calls[0]![1] as string[];
    expect(args).toContain('--haptics-app-process-id');
    expect(args).toContain('1234');
    expect(args).toContain('--haptics-app-process-path');
    expect(args).toContain('C:\\Games\\Game.exe');
    expect(args).toContain('--haptics-app-executable');
    expect(args).toContain('Game.exe');
    expect(args).toContain('--bridge-persona');
    expect(args).toContain('xbox');
    expect(args).not.toContain('--device-name');
    expect(args).not.toContain('DS5 Bridge');
    expect(args).not.toContain('--stdout-only');

    await engine.stop();
  });

});

describe('bridge haptics test', () => {
  it('launches the helper against the persona bridge endpoint with clamped haptics gain', async () => {
    const play = playBridgeHapticsTestPattern(500, 'ds4');
    const helper = childProcessMock.processes[0]!;

    helper.emit('exit', 0, null);
    await play;

    expect(childProcessMock.spawn).toHaveBeenCalledTimes(1);
    const args = childProcessMock.spawn.mock.calls[0]![1] as string[];
    expect(args).toEqual([
      '--play-test-haptics',
      '--bridge-persona',
      'ds4',
      '--haptics-gain',
      '200'
    ]);
  });
});

describe('bridge speaker test', () => {
  it('launches the helper against the persona bridge endpoint', async () => {
    const play = playBridgeSpeakerTestTone(65, 'xbox');
    const helper = childProcessMock.processes[0]!;

    helper.emit('exit', 0, null);
    await play;

    expect(childProcessMock.spawn).toHaveBeenCalledTimes(1);
    const args = childProcessMock.spawn.mock.calls[0]![1] as string[];
    expect(args).toEqual([
      '--play-test-tone',
      '--bridge-persona',
      'xbox',
      '--test-audio-path',
      expect.stringContaining('test-speaker-tone-silence-tail.mp3'),
      '--speaker-volume',
      '65'
    ]);
  });
});

describe('audio haptics session listing', () => {
  it('keeps one monitor helper alive and returns cached snapshots', async () => {
    const monitor = new AudioHapticsSessionMonitor();
    const sessionsPromise = monitor.listSessions();
    const helper = childProcessMock.processes[0]!;
    const snapshot = {
      type: 'snapshot',
      sessions: [{
        processId: 2345,
        displayName: 'Battlefront II',
        executableName: 'starwarsbattlefrontii.exe',
        processPath: 'C:\\Games\\Battlefront\\starwarsbattlefrontii.exe',
        iconPath: '',
        sessionIdentifier: 'session',
        sessionInstanceIdentifier: 'instance',
        state: 'active',
        endpointName: 'Speakers',
        isSelected: false
      }]
    };

    helper.stdout.emit('data', Buffer.from(`${JSON.stringify(snapshot)}\n`));

    await expect(sessionsPromise).resolves.toEqual([{
      processId: 2345,
      displayName: 'Battlefront II',
      executableName: 'starwarsbattlefrontii.exe',
      processPath: 'C:\\Games\\Battlefront\\starwarsbattlefrontii.exe',
      iconPath: null,
      iconDataUrl: null,
      sessionIdentifier: 'session',
      sessionInstanceIdentifier: 'instance',
      state: 'active',
      endpointName: 'Speakers',
      isSelected: false
    }]);
    await expect(monitor.listSessions()).resolves.toHaveLength(1);

    expect(childProcessMock.spawn).toHaveBeenCalledTimes(1);
    expect(childProcessMock.spawn.mock.calls[0]![1]).toEqual(['--monitor-audio-sessions']);

    await monitor.stop();
  });
});
