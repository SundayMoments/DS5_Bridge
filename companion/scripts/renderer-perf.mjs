// Measures renderer CPU time and memory against fixture data while the host
// sends snapshots at the bridge service's 2 Hz status-poll cadence. No bridge,
// HID access, or saved settings are involved. The host drives the scenarios
// itself, without a debugger attached, so hiding or minimizing the window
// changes page visibility the way it does for users.
//
//   npm run build:app && node scripts/renderer-perf.mjs [--seconds 15] [--pages]
//
// --pages also measures each page while it is open.
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { companionRoot } from './ui-review/launch.mjs';
import { createFixtureSnapshot } from './ui-review/fixture-snapshot.mjs';

const secondsIndex = process.argv.indexOf('--seconds');
const seconds = secondsIndex > 0 ? Number(process.argv[secondsIndex + 1]) : 15;
const electronPath = createRequire(import.meta.url)('electron');

const scratch = await mkdtemp(path.join(tmpdir(), 'ds5-renderer-perf-'));
try {
  const fixturePath = path.join(scratch, 'snapshot.json');
  await writeFile(fixturePath, JSON.stringify(createFixtureSnapshot(companionRoot)), 'utf8');
  const output = await new Promise((resolve, reject) => {
    const child = spawn(electronPath, [path.join(companionRoot, 'scripts', 'ui-review', 'main.cjs')], {
      cwd: companionRoot,
      env: {
        ...process.env,
        DS5_UI_REVIEW_FIXTURE: fixturePath,
        DS5_UI_REVIEW_SHOW_TUTORIAL: '0',
        DS5_UI_REVIEW_SNAPSHOT_HZ: '2',
        DS5_UI_REVIEW_PERF_SECONDS: String(seconds),
        DS5_UI_REVIEW_PERF_SWEEP: process.argv.includes('--pages') ? '1' : '0'
      },
      stdio: ['ignore', 'pipe', 'inherit']
    });
    let text = '';
    child.stdout.on('data', (chunk) => { text += chunk; });
    child.on('error', reject);
    child.on('exit', () => resolve(text));
  });
  const error = output.match(/^PERF_ERROR (.*)$/ms);
  if (error) throw new Error(error[1]);
  const result = output.match(/^PERF_RESULT (.*)$/m);
  if (!result) throw new Error(`No performance result:\n${output}`);
  console.log(`Renderer, ${seconds} s per scenario, 2 Hz fixture snapshots:`);
  console.table(JSON.parse(result[1]));
} finally {
  await rm(scratch, { recursive: true, force: true });
}
