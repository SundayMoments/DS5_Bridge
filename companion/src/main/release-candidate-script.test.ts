import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

function tempOutputRoot(): string {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'ds5-release-script-'));
  tempDirs.push(tempDir);
  return tempDir;
}

function findPowerShell(): string | null {
  const candidates = process.platform === 'win32'
    ? ['powershell.exe', 'pwsh.exe']
    : ['pwsh'];
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
      encoding: 'utf8'
    });
    if (!result.error && result.status === 0) {
      return candidate;
    }
  }
  return null;
}

describe('release candidate toolchain', () => {
  afterEach(() => {
    while (tempDirs.length > 0) {
      const tempDir = tempDirs.pop();
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
      }
    }
  });

  it('validates release inputs without building or collecting artifacts', () => {
    const powerShell = findPowerShell();
    if (!powerShell) {
      return;
    }

    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const repoRoot = path.resolve(testDir, '..', '..', '..');
    const outputRoot = tempOutputRoot();
    const scriptPath = path.join(repoRoot, 'tools', 'create-release-candidate.ps1');
    const result = spawnSync(powerShell, [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-OutputRoot',
      outputRoot,
      '-ValidateOnly'
    ], {
      cwd: repoRoot,
      encoding: 'utf8'
    });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain('Release candidate toolchain validation passed.');
    expect(result.stdout).toMatch(/Companion version: \d+\.\d+\.\d+/);
    expect(result.stdout).toMatch(/Firmware version: \d+\.\d+\.\d+/);
    expect(result.stdout).toMatch(/Bundled firmware version: \d+\.\d+\.\d+/);
    expect(readdirSync(outputRoot)).toEqual([]);
  });
});
