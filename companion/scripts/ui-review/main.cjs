// Minimal Electron host for scripts/ui-review.mjs. It loads only the built
// renderer with a fixture preload: no bridge service, HID access, or saved
// companion settings are involved.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const companionRoot = path.resolve(__dirname, '..', '..');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ds5-ui-review-')));

app.whenReady().then(() => {
  const zoomFactor = 1.25;
  const window = new BrowserWindow({
    width: Math.round(1120 * zoomFactor),
    height: Math.round(630 * zoomFactor),
    useContentSize: true,
    frame: false,
    resizable: false,
    show: true,
    backgroundColor: '#070b12',
    webPreferences: {
      preload: path.join(__dirname, 'fixture-preload.cjs'),
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      zoomFactor
    }
  });
  window.loadFile(path.join(companionRoot, 'dist', 'renderer', 'index.html'));
});

app.on('window-all-closed', () => app.quit());
