import { execFile } from 'node:child_process';
import { resolveAudioHelperPath } from './audio-helper';

// Ported from Kitsune Input's Windows host one-shot runner. DS5 Bridge's
// read-only Windows queries live in its audio helper.

/**
 * The audio helper is missing, or it is an older build that does not know the
 * requested command (usage errors exit 2). Callers may fall back to their
 * previous implementation; any other failure is a real operation failure.
 */
export class AudioHelperUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'AudioHelperUnavailableError';
  }
}

export interface AudioHelperOneShotDependencies {
  execFile: typeof execFile;
  resolveAudioHelperPath: () => string;
}

export interface AudioHelperOneShotOptions {
  timeoutMs: number;
  maxBuffer?: number;
}

const defaultDependencies: AudioHelperOneShotDependencies = { execFile, resolveAudioHelperPath };

/** Runs one bounded helper command asynchronously and resolves its stdout. */
export function runAudioHelperOneShot(
  args: string[],
  options: AudioHelperOneShotOptions,
  dependencies: AudioHelperOneShotDependencies = defaultDependencies
): Promise<string> {
  let helperPath: string;
  try {
    helperPath = dependencies.resolveAudioHelperPath();
  } catch (error) {
    return Promise.reject(new AudioHelperUnavailableError('The audio helper is missing.', error));
  }
  return new Promise((resolve, reject) => {
    dependencies.execFile(helperPath, args, {
      windowsHide: true,
      timeout: options.timeoutMs,
      maxBuffer: options.maxBuffer ?? 64 * 1024,
      encoding: 'utf8'
    }, (error, stdout, stderr) => {
      if (!error) {
        resolve(stdout);
        return;
      }
      // Spawn failures carry an errno string; non-zero exits carry the number.
      const code: unknown = (error as { code?: unknown }).code;
      if (code === 'ENOENT' || code === 2) {
        reject(new AudioHelperUnavailableError(
          `The audio helper does not support ${args[0] ?? 'this command'}.`,
          error
        ));
        return;
      }
      const detail = typeof stderr === 'string' ? stderr.trim() : '';
      reject(new Error(detail || error.message, { cause: error }));
    });
  });
}
