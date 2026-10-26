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
  await page.waitForSelector('.shell:not(.starting) .hero-card', { timeout: 20000 });

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
  // Dialogs that appear over any page.
  const sequence = ['triangle', 'circle', 'cross', 'square', 'cross', 'triangle', 'square', 'circle'];
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => {
      window.__uiReview.updateSettings({ uiThemePreset: theme, uiTextScalePercent: 100 });
    }, theme);
    await openControlTab(page, 'Overview');
    for (const purpose of ['enrollment', 'bootloader-entry']) {
      await page.evaluate(({ purpose, sequence }) => {
        window.__uiReview.update({
          bootloaderConfirmation: { purpose, sequence, progress: 3, mistakes: 0, expiresAtUnixMs: Date.now() + 27_000 }
        });
      }, { purpose, sequence });
      await page.locator('.bootloader-confirmation-modal').waitFor();
      await settle();
      const file = `${theme}-100-${purpose === 'enrollment' ? 'bootloader-enrollment' : 'bootloader-entry'}.png`;
      await captureWindow(app, path.join(outputDir, file));
      shots.push(file);
    }
    // A wrong press restarts the sequence and briefly shows the incorrect state.
    await page.evaluate(() => {
      const pending = window.__uiReview.snapshot().bootloaderConfirmation;
      window.__uiReview.update({ bootloaderConfirmation: { ...pending, progress: 0, mistakes: 1 } });
    });
    await page.locator('.bootloader-confirmation-modal.incorrect').waitFor();
    await page.waitForTimeout(400);
    const incorrectFile = `${theme}-100-bootloader-incorrect.png`;
    await captureWindow(app, path.join(outputDir, incorrectFile));
    shots.push(incorrectFile);
    await page.evaluate(() => window.__uiReview.update({ bootloaderConfirmation: null }));
  }

  // The one-time Kitsune Input offer opens shortly after its setting reads as not shown.
  await page.evaluate(() => window.__uiReview.updateSettings({ kitsuneInputLaunchOfferShown: false }));
  await page.locator('.kitsune-launch-offer-modal').waitFor({ timeout: 10000 });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => window.__uiReview.updateSettings({ uiThemePreset: theme }), theme);
    await settle();
    const file = `${theme}-100-kitsune-launch-offer.png`;
    await captureWindow(app, path.join(outputDir, file));
    shots.push(file);
  }
  const offerClose = page.locator('.kitsune-launch-offer-close');
  await offerClose.and(page.locator(':enabled')).waitFor({ timeout: 10000 });
  await offerClose.click();

  // Settings > Wake PC with the controller off: a saved network, a new setup, and a running test.
  await page.evaluate(() => {
    const current = window.__uiReview.snapshot();
    window.__uiReview.update({ status: { ...current.status, controllerConnected: false } });
  });
  async function openWakePc() {
    await openControlTab(page, 'Overview');
    await openControlTab(page, 'Settings');
    await page.locator('.settings-section-button', { hasText: 'Wake PC' }).click();
    await page.locator('.wake-pc-panel').waitFor();
    await settle();
  }
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => window.__uiReview.updateSettings({ uiThemePreset: theme }), theme);
    await openWakePc();
    await page.locator('.wake-pc-summary').waitFor();
    const file = `${theme}-100-wake-pc-saved.png`;
    await captureWindow(app, path.join(outputDir, file));
    shots.push(file);
  }
  await page.evaluate(() => window.__uiReview.setWakeOnLan({
    configured: false, enabled: false, credentialPresent: false, ssid: '', country: '', targetMac: '', stage: 'not-configured'
  }));
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => window.__uiReview.updateSettings({ uiThemePreset: theme }), theme);
    await openWakePc();
    await page.locator('.wake-pc-form').waitFor();
    const file = `${theme}-100-wake-pc-setup.png`;
    await captureWindow(app, path.join(outputDir, file));
    shots.push(file);
  }
  await page.getByLabel('Network name').fill('Home Network');
  await page.getByLabel('Password', { exact: true }).fill('correct horse');
  await page.getByRole('button', { name: 'Test and Save' }).click();
  await page.locator('.wake-pc-progress li.current', { hasText: 'Testing Wi-Fi' }).waitFor({ timeout: 5000 });
  await settle();
  await captureWindow(app, path.join(outputDir, 'dark-100-wake-pc-testing.png'));
  shots.push('dark-100-wake-pc-testing.png');
  if (failures.length) {
    throw new Error(`Renderer errors:\n${failures.join('\n')}`);
  }
  console.log(`Saved ${shots.length} screenshots to ${outputDir}`);
} finally {
  await close();
}
