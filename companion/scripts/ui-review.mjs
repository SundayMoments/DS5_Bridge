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
      for (const [label, name] of [['overview', 'Overview'], ['haptics', 'Haptics'], ['system', 'System'], ['settings', 'Settings']]) {
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

  // The one-time Kitsune Input offer opens shortly after its setting reads as
  // not shown, once a day has passed since setup.
  await page.evaluate(() => {
    const overADayAgo = Date.now() - 25 * 60 * 60 * 1000;
    window.localStorage.setItem('ds5bridge.kitsuneInputAskShownAt.v1', String(overADayAgo));
    window.__uiReview.updateSettings({ kitsuneInputLaunchOfferShown: false });
  });
  await page.locator('.kitsune-launch-offer-modal').waitFor({ timeout: 10000 });
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => window.__uiReview.updateSettings({ uiThemePreset: theme }), theme);
    await settle();
    const file = `${theme}-100-kitsune-launch-offer.png`;
    await captureWindow(app, path.join(outputDir, file));
    shots.push(file);
  }
  await page.locator('.kitsune-launch-offer-close').click();

  // A haptics test the bridge refused, on the Haptics Testing card.
  const refusal = 'The controller audio endpoint is unavailable. Close any games using the controller and try again.';
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => window.__uiReview.updateSettings({ uiThemePreset: theme }), theme);
    await openControlTab(page, 'Haptics');
    await page.evaluate((message) => window.__uiReview.failNextHapticsTest(message), refusal);
    await page.locator('.control-page.active .test-card .primary-action').click();
    await page.locator('.control-page.active .feedback-test-error').waitFor();
    await settle();
    const file = `${theme}-100-haptics-test-failed.png`;
    await captureWindow(app, path.join(outputDir, file));
    shots.push(file);
  }
  // Settings > Wake PC with the controller off: a saved network, a new setup, and a running test.
  await page.evaluate(() => {
    const current = window.__uiReview.snapshot();
    window.__uiReview.update({ status: { ...current.status, controllerConnected: false } });
  });
  // Opens Settings > Wake PC with the Wake-on-LAN section expanded.
  async function openWakePc() {
    await openControlTab(page, 'Overview');
    await openControlTab(page, 'Settings');
    await page.locator('.settings-section-button', { hasText: 'Wake PC' }).click();
    await page.locator('.wake-on-lan-settings').waitFor();
    // Settings keeps the section's state between visits; expand it only when collapsed.
    const collapsed = page.locator('.wake-on-lan-heading[aria-expanded="false"]');
    if (await collapsed.count()) await collapsed.click();
    await page.locator('.wake-on-lan-form').waitFor();
    await settle();
  }
  for (const theme of ['dark', 'light']) {
    await page.evaluate((theme) => window.__uiReview.updateSettings({ uiThemePreset: theme }), theme);
    await openWakePc();
    // The saved network with the readiness checklist open.
    const checklist = page.locator('.wake-on-lan-readiness-trigger[aria-expanded="false"]');
    if (await checklist.count()) await checklist.click();
    await page.locator('.wake-on-lan-readiness-row').first().waitFor();
    await page.locator('.wake-on-lan-readiness').scrollIntoViewIfNeeded();
    await settle();
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
    const file = `${theme}-100-wake-pc-setup.png`;
    await captureWindow(app, path.join(outputDir, file));
    shots.push(file);
  }
  await page.getByLabel('Wi-Fi name (SSID)').fill('Home Network');
  await page.getByLabel('Wi-Fi password', { exact: true }).fill('correct horse');
  await page.getByRole('button', { name: 'Test and save' }).click();
  await page.locator('.wake-on-lan-operation', { hasText: 'Testing network settings' }).waitFor({ timeout: 5000 });
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
