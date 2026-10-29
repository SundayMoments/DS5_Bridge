import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const mainSource = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');

function extractFunction(name: string): string {
  const start = mainSource.indexOf(`function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const nextFunction = mainSource.indexOf('\nfunction ', start + 1);
  return mainSource.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

describe('main window behavior', () => {
  it('reapplies the saved UI scale when Windows restores a compacted window', () => {
    const showWindowCentered = extractFunction('showWindowCentered');
    const restoreMainWindowScale = extractFunction('restoreMainWindowScale');
    const currentUiScalePercent = extractFunction('currentUiScalePercent');

    expect(currentUiScalePercent).toContain('bridgeService?.getSnapshot().settings.uiScalePercent');
    expect(restoreMainWindowScale).toContain('applyWindowScale(window, currentUiScalePercent(), recenter);');
    expect(showWindowCentered.indexOf('restoreMainWindowScale(false);')).toBeGreaterThanOrEqual(0);
    expect(showWindowCentered.indexOf('restoreMainWindowScale(false);')).toBeLessThan(
      showWindowCentered.indexOf('const display = screen.getPrimaryDisplay();')
    );

    const ensureMainWindow = extractFunction('ensureMainWindow');
    expect(ensureMainWindow).toMatch(/window\.on\('show', \(\) => \{[^}]*scheduleMainWindowScaleRestore\(false\);/);
    expect(ensureMainWindow).toMatch(/window\.on\('restore', \(\) => \{[^}]*scheduleMainWindowScaleRestore\(false\);/);
    expect(ensureMainWindow).toContain("window.on('focus', () => scheduleMainWindowScaleRestore(false));");
    expect(mainSource).toContain("powerMonitor.on('resume', () => scheduleMainWindowScaleRestore(true));");
    expect(mainSource).toContain("powerMonitor.on('unlock-screen', () => scheduleMainWindowScaleRestore(true));");
    expect(mainSource).toContain("screen.on('display-metrics-changed', () => scheduleMainWindowScaleRestore(true));");
  });

  it('hides the window on close unless the user chose to quit there', () => {
    const closeMainWindow = extractFunction('closeMainWindow');
    expect(closeMainWindow).toContain('bridgeService?.getSnapshot().settings.closeButtonQuits');
    expect(closeMainWindow.indexOf('app.quit();')).toBeLessThan(closeMainWindow.indexOf('window?.hide();'));
    expect(extractFunction('createWindow')).toMatch(/window\.on\('close', \(event\) => \{\s*if \(!isQuitting\) \{\s*event\.preventDefault\(\);\s*closeMainWindow\(window\);/);
    expect(mainSource).toContain("ipcMain.handle('window:hide', () => closeMainWindow(mainWindow));");
    expect(mainSource).toContain("ipcMain.handle('bridge:setCloseButtonQuits'");
  });

  it('creates the window on demand and releases it after it stays hidden', () => {
    // A tray start creates no renderer; the tray Open item creates it.
    expect(mainSource).toMatch(/if \(!shouldStartInTray\(\)\) \{\s*showWindowCentered\(\);/);
    const showWindowCentered = extractFunction('showWindowCentered');
    expect(showWindowCentered).toContain('mainWindowShowPending = true;');
    expect(showWindowCentered).toContain('ensureMainWindow();');
    const ensureMainWindow = extractFunction('ensureMainWindow');
    expect(ensureMainWindow).toContain("window.on('hide', () => scheduleMainWindowRetirement());");
    expect(ensureMainWindow).toContain("sendToMainWindow('bridge:snapshot', bridgeService.getSnapshot());");
    const retire = extractFunction('retireHiddenMainWindow');
    // Never under a firmware action or a pending controller confirmation.
    expect(retire).toContain('mainWindowBusyTasks > 0');
    expect(retire).toContain('bootloaderConfirmation');
    expect(retire.indexOf('mainWindow = null;')).toBeLessThan(retire.indexOf('window.destroy();'));
    // Snapshots go only to a visible window.
    expect(mainSource).toMatch(/if \(mainWindow\?\.isVisible\(\)\) \{\s*sendToMainWindow\('bridge:snapshot', snapshot\);/);
  });
});
