import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'artifacts', 'ui');
const tabs = ['Overview', 'Audio', 'Haptics', 'Triggers', 'Lighting', 'Button Remapping', 'Chords', 'System'];
const remapProfileName = process.env.VISUAL_SMOKE_REMAP_PROFILE?.trim();

await mkdir(outputDir, { recursive: true });
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const app = await electron.launch({
  args: ['.'],
  cwd: root,
  env: {
    ...process.env,
    DS5_BRIDGE_ALLOW_PARALLEL_AUTOMATION_INSTANCE: '1'
  }
});

let page;
let originalUiScalePercent;
let originalUiThemePreset;

try {
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('.hero-card', { timeout: 10000 });
  await page.waitForTimeout(250);

  const originalSettings = await page.evaluate(async () => {
    const snapshot = await window.bridge.getStatus();
    return {
      uiScalePercent: snapshot.settings.uiScalePercent,
      uiThemePreset: snapshot.settings.uiThemePreset
    };
  });
  originalUiScalePercent = originalSettings.uiScalePercent;
  originalUiThemePreset = originalSettings.uiThemePreset;

  if (originalUiThemePreset !== 'dark') {
    await page.evaluate(() => window.bridge.setUiThemePreset('dark'));
  }
  if (originalUiScalePercent !== 100) {
    await page.evaluate(() => window.bridge.setUiScalePercent(100));
  }
  await page.waitForTimeout(300);

  const controlsNav = page.getByRole('tablist', { name: 'Controls' });

  for (const tab of tabs) {
    if (tab === 'Chords') {
      await page.getByRole('button', { name: 'Chords' }).click();
    } else {
      await controlsNav.getByRole('tab', { name: tab }).click();
    }
    await page.waitForTimeout(150);

    if (tab === 'Button Remapping' && remapProfileName) {
      const profileSelect = page.getByLabel('Button remapping profile');
      await profileSelect.click();
      await page.getByRole('option', { name: remapProfileName, exact: true }).click();
      await page.waitForTimeout(150);
    }

    await page.screenshot({
      path: path.join(outputDir, `${tab.toLowerCase().replace(/\s+/g, '-')}.png`),
      animations: 'disabled'
    });

    if (tab === 'Audio') {
      await page.locator('.control-page:not([hidden]) .audio-mode-selector button').filter({ hasText: 'Mic' }).click();
      await page.waitForTimeout(150);
      await page.screenshot({
        path: path.join(outputDir, 'audio-mic.png'),
        animations: 'disabled'
      });
    }

    if (tab === 'Haptics') {
      await page.getByRole('switch', { name: 'Enter Audio Haptics' }).click();
      await page.waitForTimeout(150);
      await page.screenshot({
        path: path.join(outputDir, 'audio-haptics.png'),
        animations: 'disabled'
      });
      await page.getByRole('switch', { name: 'Exit Audio Haptics' }).click();
      await page.waitForTimeout(150);
    }

    if (tab === 'Triggers') {
      await page.getByRole('switch', { name: 'Enter Trigger Lab' }).click();
      await page.waitForTimeout(150);
      await page.screenshot({
        path: path.join(outputDir, 'trigger-lab.png'),
        animations: 'disabled'
      });
      await page.getByRole('switch', { name: 'Exit Trigger Lab' }).click();
      await page.waitForTimeout(150);
    }
  }

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('dialog', { name: 'Bridge settings' }).waitFor();
  await page.waitForTimeout(150);
  await page.screenshot({
    path: path.join(outputDir, 'bridge-settings.png'),
    animations: 'disabled'
  });
} finally {
  if (page) {
    if (originalUiThemePreset && originalUiThemePreset !== 'dark') {
      await page.evaluate((theme) => window.bridge.setUiThemePreset(theme), originalUiThemePreset).catch(() => {});
    }
    if (originalUiScalePercent && originalUiScalePercent !== 100) {
      await page.evaluate((scale) => window.bridge.setUiScalePercent(scale), originalUiScalePercent).catch(() => {});
    }
    await page.waitForTimeout(100).catch(() => {});
  }
  await app.close();
}
