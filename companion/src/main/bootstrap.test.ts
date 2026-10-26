import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const bootstrapSource = readFileSync(new URL('./bootstrap.ts', import.meta.url), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { main: string };

describe('main process bootstrap', () => {
  it('is the Electron entry point and loads main only after enabling the compile cache', () => {
    expect(manifest.main).toBe('dist/main/main/bootstrap.js');
    const enable = bootstrapSource.indexOf('enableCompileCache?.(');
    const load = bootstrapSource.indexOf("require('./main');");
    expect(enable).toBeGreaterThan(0);
    expect(load).toBeGreaterThan(enable);
  });

  it('imports nothing local, so no app module loads before the cache is on', () => {
    const imports = [...bootstrapSource.matchAll(/^import .* from '([^']+)';$/gm)].map((match) => match[1]);
    expect(imports).toEqual(['node:path', 'node:module', 'electron']);
  });
});
