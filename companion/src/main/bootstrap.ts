// Electron entry point, ported from Kitsune Input. Enable Node's on-disk compile
// cache before the main process modules load, so later launches reuse their
// compiled code instead of recompiling it. Keep this file free of local imports
// so nothing loads before the cache is on.
import path from 'node:path';
import nodeModule from 'node:module';
import { app } from 'electron';

const COMPILE_CACHE_FLUSH_DELAY_MS = 30_000;

let compileCacheEnabled = false;
try {
  // Node keys entries by file content, so a new build never reuses stale code.
  const result = nodeModule.enableCompileCache?.(path.join(app.getPath('userData'), 'Compile Cache'));
  compileCacheEnabled = result?.status === nodeModule.constants?.compileCacheStatus?.ENABLED
    || result?.status === nodeModule.constants?.compileCacheStatus?.ALREADY_ENABLED;
} catch {
  // The cache is only an optimization; start normally without it.
}

// eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after the cache is enabled.
require('./main');

if (compileCacheEnabled) {
  // Persist entries once startup and deferred modules have compiled rather than
  // relying only on a clean process exit to write them.
  void app.whenReady().then(() => {
    setTimeout(() => {
      try { nodeModule.flushCompileCache?.(); } catch { /* optional */ }
    }, COMPILE_CACHE_FLUSH_DELAY_MS).unref();
  });
}
