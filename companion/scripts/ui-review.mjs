// Captures the built renderer with fixture data for design review.
// The renderer runs in a minimal Electron host (scripts/ui-review/main.cjs)
// whose preload replaces the bridge API: no bridge service, HID access, or
// saved companion settings are involved.
//
//   npm run ui:review [-- --out ../build/ui-review]
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { captureWindow, companionRoot, launchCompanion, openControlTab } from './ui-review/launch.mjs';

const outArgument = process.argv.indexOf('--out');
const outputDir = path.resolve(
  companionRoot,
  outArgument > 0 ? process.argv[outArgument + 1] : path.join('..', 'build', 'ui-review')
);

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const { app, close } = await launchCompanion({ fixture: true });

try {
  const page = await app.firstWindow();
  const failures = [];
  page.on('pageerror', (error) => failures.push(error.message));
  await page.waitForSelector('.hero-card', { timeout: 20000 });

  async function settle() {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
  }

  const shots = [];
  for (const theme of ['dark', 'light']) {
    for (const textScale of [100, 120]) {
      await page.evaluate(({ theme, textScale }) => {
        window.__uiReview.updateSettings({ uiThemePreset: theme, uiTextScalePercent: textScale });
      }, { theme, textScale });
      await settle();
      for (const [label, name] of [['overview', 'Overview'], ['haptics', 'Haptics'], ['settings', 'Settings']]) {
        await openControlTab(page, name);
        await settle();
        const file = `${theme}-${textScale}-${label}.png`;
        await captureWindow(app, path.join(outputDir, file));
        shots.push(file);
      }
    }
  }
  if (failures.length) {
    throw new Error(`Renderer errors:\n${failures.join('\n')}`);
  }
  console.log(`Saved ${shots.length} screenshots to ${outputDir}`);
} finally {
  await close();
}
