// Minimal Electron host for scripts/ui-review.mjs and scripts/renderer-perf.mjs.
// It loads only the built renderer with a fixture preload: no bridge service,
// HID access, or saved companion settings are involved.
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

  // The real bridge service sends a snapshot on every 500 ms status poll, even
  // while the window is hidden. Performance runs ask for the same cadence.
  const pollHz = Number(process.env.DS5_UI_REVIEW_SNAPSHOT_HZ ?? 0);
  if (pollHz > 0) {
    const timer = setInterval(() => {
      if (!window.isDestroyed()) window.webContents.send('ui-review:poll');
    }, 1000 / pollHz);
    window.on('closed', () => clearInterval(timer));
  }

  const perfSeconds = Number(process.env.DS5_UI_REVIEW_PERF_SECONDS ?? 0);
  if (perfSeconds > 0) {
    runPerformanceScenarios(window, perfSeconds).then(
      (rows) => process.stdout.write(`PERF_RESULT ${JSON.stringify(rows)}\n`),
      (error) => process.stdout.write(`PERF_ERROR ${error?.stack ?? error}\n`)
    ).finally(() => app.quit());
  }
});

app.on('window-all-closed', () => app.quit());

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Driven from the main process without a debugger attached, so hiding or
// minimizing the window changes the page's visibility as it does for users.
async function runPerformanceScenarios(window, seconds) {
  const contents = window.webContents;
  const js = (code) => contents.executeJavaScript(code, true);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await js("Boolean(document.querySelector('.shell:not(.starting) .hero-card'))")) break;
    await sleep(100);
  }
  await sleep(3000);

  const openPage = async (id) => {
    if (id !== 'settings') {
      await js(`[...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Back to app')?.click()`);
      await sleep(150);
    }
    await js(`document.querySelector('#control-tab-${id}')?.click()`);
  };
  const rendererMemory = () => {
    const pid = contents.getOSProcessId();
    const metric = app.getAppMetrics().find((candidate) => candidate.pid === pid);
    return {
      workingSetMb: metric ? metric.memory.workingSetSize / 1024 : null,
      privateMb: metric?.memory.privateBytes ? metric.memory.privateBytes / 1024 : null
    };
  };
  const sample = () => js(`(() => {
    const cpu = window.__uiReview.cpuUsage();
    return {
      cpuMicros: cpu.user + cpu.system,
      mutations: window.__perfMutations ?? 0,
      jsHeapMb: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : null,
      domNodes: document.getElementsByTagName('*').length,
      visibility: document.visibilityState
    };
  })()`);
  await js(`(() => {
    window.__perfMutations = 0;
    new MutationObserver((records) => { window.__perfMutations += records.length; })
      .observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
  })()`);

  const rows = [];
  async function measure(scenario, prepare) {
    await prepare();
    await sleep(1500);
    const start = await sample();
    const startedAt = Date.now();
    await sleep(seconds * 1000);
    const end = await sample();
    const elapsedSeconds = (Date.now() - startedAt) / 1000;
    const memory = rendererMemory();
    rows.push({
      scenario,
      visibility: end.visibility,
      cpuMsPerSecond: Number(((end.cpuMicros - start.cpuMicros) / 1000 / elapsedSeconds).toFixed(2)),
      domMutationsPerSecond: Number(((end.mutations - start.mutations) / elapsedSeconds).toFixed(1)),
      jsHeapMb: Number(end.jsHeapMb?.toFixed(1)),
      domNodes: end.domNodes,
      workingSetMb: Number(memory.workingSetMb?.toFixed(1)),
      privateMb: Number(memory.privateMb?.toFixed(1))
    });
  }

  const pages = [
    'devices', 'audio', 'haptics', 'triggers', 'lighting', 'deadzones', 'remapping',
    'chords', 'audio-haptics', 'trigger-lab', 'system', 'settings'
  ];
  await measure('Overview, visible', async () => {});
  if (process.env.DS5_UI_REVIEW_PERF_SWEEP === '1') {
    // Each page while it is open, to find the one that costs the most.
    for (const id of pages) {
      await measure(`${id}, open`, () => openPage(id));
    }
  }
  await measure('every page visited, back on Overview', async () => {
    for (const id of pages) {
      await openPage(id);
      await sleep(250);
    }
    await openPage('overview');
  });
  await measure('hidden to tray', async () => window.hide());
  await measure('minimized', async () => {
    window.show();
    await sleep(500);
    window.minimize();
  });
  window.restore();
  return rows;
}
