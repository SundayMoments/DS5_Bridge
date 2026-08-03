import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const executableName = process.platform === 'win32' ? 'dotnet.exe' : 'dotnet';
const configuredRoots = [
  process.env.DOTNET_ROOT,
  process.env.DOTNET_ROOT_X64,
  process.env.DOTNET_ROOT_X86
].filter((value) => typeof value === 'string' && value.trim().length > 0);

const candidates = configuredRoots
  .map((root) => path.join(root, executableName))
  .filter((candidate) => existsSync(candidate));
candidates.push('dotnet');

const uniqueCandidates = [...new Map(candidates.map((candidate) => [
  process.platform === 'win32' ? candidate.toLowerCase() : candidate,
  candidate
])).values()];

let selected = null;
for (const candidate of uniqueCandidates) {
  const probe = spawnSync(candidate, ['--list-sdks'], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (probe.status === 0 && probe.stdout.trim().length > 0) {
    selected = candidate;
    break;
  }
}

if (!selected) {
  console.error(
    'No .NET SDK was found. Install an SDK or set DOTNET_ROOT to a directory containing an SDK-enabled dotnet executable.'
  );
  process.exit(1);
}

const result = spawnSync(selected, process.argv.slice(2), {
  stdio: 'inherit',
  windowsHide: true
});

if (result.error) {
  console.error(`Unable to launch ${selected}: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
