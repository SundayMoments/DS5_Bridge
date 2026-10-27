// Walks every page of the companion and saves screenshots to artifacts/ui.
//
//   npm run visual:smoke              drives the real companion (bridges and saved settings)
//   npm run visual:smoke -- --fixture uses fixture data in a minimal host instead
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  captureWindow,
  companionRoot,
  fixtureRequested,
  launchCompanion,
  openControlTab
} from './ui-review/launch.mjs';

const outputDir = path.join(companionRoot, 'artifacts', 'ui');
const tabs = [
  'Overview', 'Devices', 'Audio', 'Haptics', 'Adaptive Triggers', 'Lighting',
  'Stick Deadzones', 'Button Remapping', 'Chords', 'Audio Haptics', 'Trigger Lab', 'System'
];
const remapProfileName = process.env.VISUAL_SMOKE_REMAP_PROFILE?.trim();

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

const { app, close } = await launchCompanion({ fixture: fixtureRequested() });
const screenshot = (name) => captureWindow(app, path.join(outputDir, name));

let page;
let originalUiScalePercent;
let originalUiThemePreset;
let originalKitsuneInputPromotionDismissed;

try {
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('.shell:not(.starting) .hero-card', { timeout: 10000 });
  await page.waitForTimeout(250);

  const featureTutorial = page.getByRole('dialog', { name: 'Feature tile tutorial' });
  if (await featureTutorial.isVisible()) {
    await featureTutorial.getByRole('button', { name: 'Toggle example effect' }).click();
    await featureTutorial.getByRole('button', { name: 'Next' }).click();
    const supportTutorial = page.getByRole('dialog', { name: 'Support DS5 Bridge' });
    await supportTutorial.getByRole('button', { name: 'Continue' }).click({ timeout: 7000 });
  }

  const originalSettings = await page.evaluate(async () => {
    const snapshot = await window.bridge.getStatus();
    return {
      uiScalePercent: snapshot.settings.uiScalePercent,
      uiThemePreset: snapshot.settings.uiThemePreset,
      kitsuneInputPromotionDismissed: snapshot.settings.kitsuneInputPromotionDismissed
    };
  });
  originalUiScalePercent = originalSettings.uiScalePercent;
  originalUiThemePreset = originalSettings.uiThemePreset;
  originalKitsuneInputPromotionDismissed = originalSettings.kitsuneInputPromotionDismissed;

  if (originalUiThemePreset !== 'dark') {
    await page.evaluate(() => window.bridge.setUiThemePreset('dark'));
  }
  if (originalUiScalePercent !== 100) {
    await page.evaluate(() => window.bridge.setUiScalePercent(100));
  }
  if (originalKitsuneInputPromotionDismissed) {
    await page.evaluate(() => window.bridge.setKitsuneInputPromotionDismissed(false));
  }
  await page.waitForTimeout(300);

  // The promotion banner sits in the center of the window bar.
  const kitsunePromotionBanner = page.locator('.window-bar-center').getByRole('button', {
    name: 'Explore Kitsune Input'
  });
  await kitsunePromotionBanner.hover();
  await page.waitForTimeout(420);
  await screenshot('kitsune-input-banner-hover.png');
  await kitsunePromotionBanner.click();
  const kitsunePromotionDialog = page.getByRole('dialog', {
    name: 'Make your controller yours.'
  });
  await kitsunePromotionDialog.waitFor();
  await page.waitForTimeout(250);
  await screenshot('kitsune-input-promotion.png');
  await kitsunePromotionDialog.getByRole('button', {
    name: 'Close Kitsune Input promotion'
  }).click();
  await kitsunePromotionDialog.waitFor({ state: 'hidden' });
  await kitsunePromotionBanner.waitFor({ state: 'visible' });
  const promotionDismissedAfterClose = await page.evaluate(async () => {
    const snapshot = await window.bridge.getStatus();
    return snapshot.settings.kitsuneInputPromotionDismissed;
  });
  if (promotionDismissedAfterClose) {
    throw new Error('Closing the Kitsune Input modal unexpectedly saved a permanent dismissal.');
  }

  await page.getByRole('button', { name: 'Open Devices' }).click();
  await page.locator('#control-panel-devices.active').waitFor();

  for (const tab of tabs) {
    await openControlTab(page, tab);
    await page.waitForTimeout(150);

    if (tab === 'Button Remapping' && remapProfileName) {
      const profileSelect = page.getByLabel('Button remapping profile');
      await profileSelect.click();
      await page.getByRole('option', { name: remapProfileName, exact: true }).click();
      await page.waitForTimeout(150);
    }

    await screenshot(`${tab.toLowerCase().replace(/\s+/g, '-')}.png`);

    if (tab === 'System') {
      const profilePanel = page.locator('.system-profile-panel');
      const panelSize = await profilePanel.evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight
      }));
      if (panelSize.scrollHeight > panelSize.clientHeight + 1) {
        throw new Error(`System profile summary overflows its panel (${panelSize.scrollHeight}px > ${panelSize.clientHeight}px).`);
      }
      const systemPageSize = await page.locator('.system-page.active').evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight
      }));
      if (systemPageSize.scrollHeight > systemPageSize.clientHeight + 1) {
        throw new Error(`System page requires vertical scrolling (${systemPageSize.scrollHeight}px > ${systemPageSize.clientHeight}px).`);
      }
    }

    if (tab === 'Audio') {
      await page.locator('.control-page.active .audio-mode-selector button').filter({ hasText: 'Mic' }).click();
      await page.waitForTimeout(150);
      await screenshot('audio-mic.png');
    }
  }

  await openControlTab(page, 'Settings');
  await page.waitForTimeout(150);
  await screenshot('settings.png');
  await page.getByRole('searchbox', { name: 'Search settings' }).fill('wake');
  await page.waitForTimeout(150);
  const searchStatus = await page.locator('#settings-search-status').textContent();
  if (!searchStatus?.includes('match')) {
    throw new Error(`Settings search did not report results (status: ${JSON.stringify(searchStatus)}).`);
  }
  await screenshot('settings-search.png');
  await page.getByRole('searchbox', { name: 'Search settings' }).fill('');
  await page.getByRole('button', { name: 'Back to app' }).click();
  await page.locator('#control-panel-system.active').waitFor();
} finally {
  if (page) {
    if (originalUiThemePreset && originalUiThemePreset !== 'dark') {
      await page.evaluate((theme) => window.bridge.setUiThemePreset(theme), originalUiThemePreset).catch(() => {});
    }
    if (originalUiScalePercent && originalUiScalePercent !== 100) {
      await page.evaluate((scale) => window.bridge.setUiScalePercent(scale), originalUiScalePercent).catch(() => {});
    }
    if (originalKitsuneInputPromotionDismissed) {
      await page.evaluate(() => window.bridge.setKitsuneInputPromotionDismissed(true)).catch(() => {});
    }
    await page.waitForTimeout(100).catch(() => {});
  }
  await close();
}
