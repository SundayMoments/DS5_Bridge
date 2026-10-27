// Captures the Devices page from the fixture host: with no saved controllers,
// and with the live controller plus saved DualSense history, and its menu open.
//   node scripts/ui-review/devices-capture.mjs [--out <dir>]
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { captureWindow, launchCompanion } from './launch.mjs';

const outArgument = process.argv.indexOf('--out');
const outDir = path.resolve(outArgument > 0 ? process.argv[outArgument + 1] : path.join('..', 'build', 'ui-review', 'devices'));
await mkdir(outDir, { recursive: true });

const { app, close } = await launchCompanion({ fixture: true });
try {
  const page = await app.firstWindow();
  const ready = async () => {
    await page.locator('.shell:not(.starting)').waitFor({ timeout: 15000 });
    const offer = page.locator('.kitsune-launch-offer-modal');
    if (await offer.waitFor({ timeout: 4000 }).then(() => true, () => false)) {
      await page.locator('.kitsune-launch-offer-close:not([disabled])').click({ timeout: 10000 });
      await offer.waitFor({ state: 'detached' });
    }
    const devicesTab = page.locator('#control-tab-devices');
    if (!(await devicesTab.isVisible())) await page.locator('#control-tab-controller, [aria-controls*="controller"]').first().click();
    await devicesTab.click();
    await page.locator('.devices-page.active').waitFor();
    await page.waitForTimeout(500);
  };

  await page.evaluate(() => localStorage.removeItem('ds5bridge.controllerDeviceCache.v1'));
  await page.reload();
  await ready();
  await captureWindow(app, path.join(outDir, 'devices-current-only.png'));

  await page.evaluate(() => {
    const now = Date.now();
    localStorage.setItem('ds5bridge.controllerDeviceCache.v1', JSON.stringify([
      { key: '02:11:22:33:44:66', controllerType: 'dualsense', controllerName: 'DualSense',
        customName: null, bluetoothAddress: '02:11:22:33:44:66', vendorId: 0x054c, productId: 0x0ce6,
        linkKeyKnown: true, batteryPercent: 34, lastSeenAt: now - 3600000 },
      { key: '02:11:22:33:44:77', controllerType: 'dualsense-edge', controllerName: 'DualSense Edge',
        customName: 'Couch Edge', bluetoothAddress: '02:11:22:33:44:77', vendorId: 0x054c, productId: 0x0df2,
        linkKeyKnown: true, batteryPercent: 90, lastSeenAt: now - 7200000 }
    ]));
  });
  await page.reload();
  await ready();
  await captureWindow(app, path.join(outDir, 'devices-cards.png'));
  await page.locator('.trusted-device-menu-button').first().click();
  await page.waitForTimeout(300);
  await captureWindow(app, path.join(outDir, 'devices-menu.png'));
  console.log(`Saved Devices captures to ${outDir}`);
} finally {
  await close();
}
