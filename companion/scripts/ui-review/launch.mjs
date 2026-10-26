// Shared launcher and navigation for the Playwright UI scripts
// (ui-review, visual-smoke, layout-check).
//
// By default visual-smoke and layout-check drive the real companion, which
// talks to connected bridges and uses the saved settings. Pass --fixture to
// run them against the built renderer with fixture data instead.
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';
import { createFixtureSnapshot } from './fixture-snapshot.mjs';

export const companionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function fixtureRequested(argv = process.argv) {
  return argv.includes('--fixture');
}

/**
 * Starts the companion. Fixture runs use a minimal host whose preload
 * replaces the bridge API, so no HID devices or saved settings are touched.
 */
export async function launchCompanion({ fixture = false, showStartupTutorial = false } = {}) {
  if (!fixture) {
    const app = await electron.launch({
      args: ['.'],
      cwd: companionRoot,
      env: { ...process.env, DS5_BRIDGE_ALLOW_PARALLEL_AUTOMATION_INSTANCE: '1' }
    });
    return { app, close: () => app.close() };
  }

  const scratch = await mkdtemp(path.join(tmpdir(), 'ds5-ui-review-fixture-'));
  const fixturePath = path.join(scratch, 'snapshot.json');
  await writeFile(fixturePath, JSON.stringify(createFixtureSnapshot(companionRoot)), 'utf8');
  const app = await electron.launch({
    args: [path.join(companionRoot, 'scripts', 'ui-review', 'main.cjs')],
    cwd: companionRoot,
    env: {
      ...process.env,
      DS5_UI_REVIEW_FIXTURE: fixturePath,
      DS5_UI_REVIEW_SHOW_TUTORIAL: showStartupTutorial ? '1' : '0'
    }
  });
  return {
    app,
    async close() {
      await app.close();
      await rm(scratch, { recursive: true, force: true });
    }
  };
}

/** Playwright crops zoomed Electron pages, so capture the native window contents instead. */
export async function captureWindow(app, file) {
  const png = await app.evaluate(async ({ BrowserWindow }) => {
    const image = await BrowserWindow.getAllWindows()[0].webContents.capturePage();
    return image.toPNG().toString('base64');
  });
  await writeFile(file, Buffer.from(png, 'base64'));
}

const TAB_GROUPS = {
  Devices: 'Controller',
  Audio: 'Controller',
  Haptics: 'Controller',
  'Adaptive Triggers': 'Controller',
  Lighting: 'Controller',
  'Stick Deadzones': 'Input',
  'Button Remapping': 'Input',
  Chords: 'Input',
  'Audio Haptics': 'Labs',
  'Trigger Lab': 'Labs'
};

/** Opens a sidebar page by its label, expanding its group or leaving Settings first. */
export async function openControlTab(page, label) {
  const back = page.getByRole('button', { name: 'Back to app' });
  if (label !== 'Settings' && await back.isVisible()) {
    await back.click();
  }
  if (label === 'Settings') {
    await page.locator('#control-tab-settings').click();
    await page.locator('#control-panel-settings.active').waitFor();
    return;
  }
  const nav = page.getByRole('navigation', { name: 'Controls' });
  const button = nav.getByRole('button', { name: label, exact: true });
  const group = TAB_GROUPS[label];
  if (group && !(await button.isVisible())) {
    await nav.getByRole('button', { name: group, exact: true }).click();
    await page.waitForTimeout(260);
  }
  await button.click();
}
