import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outputDir = path.join(root, 'artifacts', 'ui');
const tabs = ['Overview', 'Devices', 'Audio', 'Haptics', 'Adaptive Triggers', 'Lighting', 'Stick Deadzones', 'Button Remapping', 'Chords', 'System'];
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
let originalKitsuneInputPromotionDismissed;

try {
  page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('.hero-card', { timeout: 10000 });
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

  const kitsunePromotionBanner = page.getByRole('button', {
    name: 'Explore Kitsune Input'
  });
  await kitsunePromotionBanner.hover();
  await page.waitForTimeout(420);
  await page.screenshot({
    path: path.join(outputDir, 'kitsune-input-banner-hover.png'),
    animations: 'allow'
  });
  await kitsunePromotionBanner.click();
  const kitsunePromotionDialog = page.getByRole('dialog', {
    name: 'Take controller customization further'
  });
  await kitsunePromotionDialog.waitFor();
  await page.screenshot({
    path: path.join(outputDir, 'kitsune-input-promotion.png'),
    animations: 'disabled'
  });
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

  const controlsNav = page.getByRole('navigation', { name: 'Controls' });
  await page.getByRole('button', { name: 'Open Devices' }).click();
  await page.locator('#control-panel-devices.active').waitFor();

  for (const tab of tabs) {
    if (tab === 'System') {
      await page.getByRole('button', { name: 'System', exact: true }).click();
    } else {
      const tabButton = controlsNav.getByRole('tab', { name: tab, exact: true });
      if (!(await tabButton.isVisible())) {
        const group = ['Stick Deadzones', 'Button Remapping', 'Chords'].includes(tab)
          ? 'Input'
          : 'Controller';
        await controlsNav.getByRole('button', { name: group, exact: true }).click();
      }
      await tabButton.click();
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
      await page.screenshot({
        path: path.join(outputDir, 'system-profile-summary.png'),
        animations: 'disabled'
      });
    }

    if (tab === 'Audio') {
      await page.locator('.control-page:not([hidden]) .audio-mode-selector button').filter({ hasText: 'Mic' }).click();
      await page.waitForTimeout(150);
      await page.screenshot({
        path: path.join(outputDir, 'audio-mic.png'),
        animations: 'disabled'
      });
    }

    if (tab === 'Haptics') {
      const enterAudioHaptics = page.getByRole('switch', { name: 'Enter Audio Haptics' });
      if (await enterAudioHaptics.count()) {
        await enterAudioHaptics.click();
        await page.waitForTimeout(150);
        await page.screenshot({
          path: path.join(outputDir, 'audio-haptics.png'),
          animations: 'disabled'
        });
        await page.getByRole('switch', { name: 'Exit Audio Haptics' }).click();
        await page.waitForTimeout(150);
      }
    }

    if (tab === 'Adaptive Triggers') {
      const enterTriggerLab = page.getByRole('switch', { name: 'Enter Trigger Lab' });
      if (await enterTriggerLab.count()) {
        await enterTriggerLab.click();
        await page.waitForTimeout(150);
        await page.screenshot({
          path: path.join(outputDir, 'trigger-lab.png'),
          animations: 'disabled'
        });
        await page.getByRole('switch', { name: 'Exit Trigger Lab' }).click();
        await page.waitForTimeout(150);
      }
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
    if (originalKitsuneInputPromotionDismissed) {
      await page.evaluate(() => window.bridge.setKitsuneInputPromotionDismissed(true)).catch(() => {});
    }
    await page.waitForTimeout(100).catch(() => {});
  }
  await app.close();
}
