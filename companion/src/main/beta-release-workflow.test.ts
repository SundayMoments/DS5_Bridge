import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDirectory, '..', '..', '..');
const betaWorkflow = readFileSync(
  path.join(repoRoot, '.github', 'workflows', 'beta-release.yml'),
  'utf8'
);
const releaseWorkflow = readFileSync(
  path.join(repoRoot, '.github', 'workflows', 'release.yml'),
  'utf8'
);

describe('beta release workflow', () => {
  it('always releases the tagged port-dev head as a GitHub prerelease', () => {
    expect(betaWorkflow).toContain('ref: port-dev');
    expect(betaWorkflow).toContain('git fetch origin port-dev --tags --force');
    expect(betaWorkflow).toContain('$sourceCommit = (git rev-parse origin/port-dev).Trim()');
    expect(betaWorkflow).toContain('$buildVersion = "$firmwareVersion-beta.$env:BETA_NUMBER"');
    expect(betaWorkflow).toContain('--draft `');
    expect(betaWorkflow).toContain('--prerelease `');
    expect(betaWorkflow).toContain('uses: ./.github/workflows/release.yml');
    expect(betaWorkflow).toContain('gh release edit "$RELEASE_TAG" --draft=false --prerelease=true');
  });

  it('reuses stable release jobs while preserving beta versions in every asset', () => {
    expect(releaseWorkflow).toContain('workflow_call:');
    expect(releaseWorkflow).toContain('build_version:');
    expect(releaseWorkflow).toContain('npm version $env:BUILD_VERSION --no-git-tag-version --allow-same-version');
    expect(releaseWorkflow).toContain('DS5-Bridge-Firmware-v${RELEASE_ASSET_VERSION}.uf2');
    expect(releaseWorkflow).toContain('DS5-Bridge-Firmware-Waveshare-v${RELEASE_ASSET_VERSION}.uf2');
    expect(releaseWorkflow).toContain('"DS5-Bridge-Companion-Setup-v$companionVersion.exe"');
    expect(releaseWorkflow).toContain('"DS5-Bridge-Companion-Portable-v$companionVersion-win32-x64.zip"');
  });
});
