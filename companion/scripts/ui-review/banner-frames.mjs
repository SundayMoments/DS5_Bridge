// Captures the window-bar Kitsune banner at rest, at fixed points of its hover
// animation, and settled on hover, from the fixture host.
//   node scripts/ui-review/banner-frames.mjs [--out <dir>]
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { launchCompanion } from './launch.mjs';

const outArgument = process.argv.indexOf('--out');
const outDir = path.resolve(outArgument > 0 ? process.argv[outArgument + 1] : path.join('..', 'build', 'ui-review', 'banner'));
await mkdir(outDir, { recursive: true });

const { app, close } = await launchCompanion({ fixture: true });
try {
  const page = await app.firstWindow();
  await page.locator('.shell:not(.starting)').waitFor({ timeout: 15000 });
  // The one-time offer opens shortly after startup; let it finish its countdown.
  const offer = page.locator('.kitsune-launch-offer-modal');
  if (await offer.waitFor({ timeout: 4000 }).then(() => true, () => false)) {
    await page.locator('.kitsune-launch-offer-close:not([disabled])').click({ timeout: 10000 });
    await offer.waitFor({ state: 'detached' });
  }
  const banner = page.locator('.kitsune-promotion-banner');
  await banner.waitFor();

  async function capture(name) {
    const box = await banner.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x - 14, y: rect.y - 8, width: rect.width + 28, height: rect.height + 22 };
    });
    const png = await app.evaluate(async ({ BrowserWindow }, rect) => {
      const contents = BrowserWindow.getAllWindows()[0].webContents;
      const zoom = contents.getZoomFactor();
      const image = await contents.capturePage({
        x: Math.round(rect.x * zoom),
        y: Math.round(rect.y * zoom),
        width: Math.round(rect.width * zoom),
        height: Math.round(rect.height * zoom)
      });
      return image.toPNG().toString('base64');
    }, box);
    await writeFile(path.join(outDir, `${name}.png`), Buffer.from(png, 'base64'));
  }

  await page.mouse.move(5, 300);
  await page.waitForTimeout(400);
  await capture('0-rest');

  await banner.hover();
  // Freeze the hover pass so each frame is exact.
  await page.evaluate(() => document.getAnimations().forEach((animation) => animation.pause()));
  for (const ms of [150, 350, 550, 750, 950, 1150]) {
    await page.evaluate((time) => {
      document.getAnimations().forEach((animation) => { animation.currentTime = time; });
    }, ms);
    await page.waitForTimeout(60);
    await capture(`1-hover-${String(ms).padStart(4, '0')}ms`);
  }
  await page.evaluate(() => document.getAnimations().forEach((animation) => animation.finish()));
  await page.waitForTimeout(450);
  await capture('2-hover-settled');
  console.log(`Saved banner frames to ${outDir}`);
} finally {
  await close();
}
