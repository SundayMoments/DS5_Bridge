#!/usr/bin/env node
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const FRAME_PREFIX_BYTES = 2;
const FRAME_BYTES = 264;
const HAPTIC_BYTES = 64;
const DEFAULT_SECONDS = 8;
const DEFAULT_START_TIMEOUT_MS = 8000;

function usage() {
  return `
Usage: node tools/audio-haptics-battery.mjs [options]

Options:
  --helper <path>              AudioHelper.exe path. Auto-detected by default.
  --seconds <n>                Seconds to capture after recording starts. Default: ${DEFAULT_SECONDS}.
  --source <system|app|both>   Source to test. Default: system.
  --mode <stdout,mirror|all>   Transport modes to test. Default: stdout,mirror.
  --bridge-device <name>       Bridge render endpoint name. Default: DS5 Bridge.
  --stimulus                   Play the bundled test tone during each run.
  --stimulus-path <path>       Audio file to play for --stimulus.
  --stimulus-device <name>     Render endpoint for stimulus playback. Omit for Windows default.
  --app-pid <pid>              App-session source process id.
  --app-path <path>            App-session source process path.
  --app-exe <name>             App-session source executable.
  --gain <0-200>               Audio haptics gain. Default: 100.
  --bass-focus <mode>          deep, balanced, punchy, bright. Default: balanced.
  --response <mode>            soft, balanced, strong. Default: balanced.
  --attack <mode>              smooth, balanced, sharp. Default: balanced.
  --release <mode>             smooth, balanced, crisp. Default: balanced.
  --json                       Print JSON instead of a compact report.
`.trim();
}

function parseArgs(argv) {
  const options = {
    helper: null,
    seconds: DEFAULT_SECONDS,
    startTimeoutMs: DEFAULT_START_TIMEOUT_MS,
    sources: ['system'],
    modes: ['stdout', 'mirror'],
    bridgeDevice: 'DS5 Bridge',
    stimulus: false,
    stimulusPath: null,
    stimulusDevice: null,
    appPid: null,
    appPath: null,
    appExe: null,
    gain: 100,
    bassFocus: 'balanced',
    response: 'balanced',
    attack: 'balanced',
    release: 'balanced',
    json: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      if (index + 1 >= argv.length) {
        throw new Error(`Missing value for ${arg}`);
      }
      return argv[++index];
    };

    switch (arg) {
      case '--help':
      case '-h':
        console.log(usage());
        process.exit(0);
        break;
      case '--helper':
        options.helper = next();
        break;
      case '--seconds':
        options.seconds = Math.max(1, Number(next()) || DEFAULT_SECONDS);
        break;
      case '--source':
        options.sources = parseList(next(), ['system', 'app', 'both']).flatMap((source) => (
          source === 'both' ? ['system', 'app'] : [source]
        ));
        break;
      case '--mode':
        options.modes = parseList(next(), ['stdout', 'mirror', 'all']).flatMap((mode) => (
          mode === 'all' ? ['stdout', 'mirror'] : [mode]
        ));
        break;
      case '--bridge-device':
        options.bridgeDevice = next();
        break;
      case '--stimulus':
        options.stimulus = true;
        break;
      case '--stimulus-path':
        options.stimulusPath = next();
        options.stimulus = true;
        break;
      case '--stimulus-device':
        options.stimulusDevice = next();
        options.stimulus = true;
        break;
      case '--app-pid':
        options.appPid = Number.parseInt(next(), 10);
        break;
      case '--app-path':
        options.appPath = next();
        break;
      case '--app-exe':
        options.appExe = next();
        break;
      case '--gain':
        options.gain = clampInt(next(), 0, 200, 100);
        break;
      case '--bass-focus':
        options.bassFocus = next();
        break;
      case '--response':
        options.response = next();
        break;
      case '--attack':
        options.attack = next();
        break;
      case '--release':
        options.release = next();
        break;
      case '--json':
        options.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  options.sources = [...new Set(options.sources)];
  options.modes = [...new Set(options.modes)];
  return options;
}

function parseList(value, allowed) {
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  for (const item of items) {
    if (!allowed.includes(item)) {
      throw new Error(`Unsupported value "${item}". Expected one of: ${allowed.join(', ')}`);
    }
  }
  return items;
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, parsed));
}

function resolveHelperPath(options) {
  if (options.helper) {
    return path.resolve(options.helper);
  }

  const candidates = [
    path.join(process.cwd(), 'companion', 'native', 'AudioHelper', 'bin', 'publish', 'win-x64', 'AudioHelper.exe'),
    path.join(process.cwd(), 'companion', 'native', 'AudioHelper', 'bin', 'Release', 'net9.0-windows10.0.19041.0', 'win-x64', 'AudioHelper.exe'),
    path.join(process.cwd(), 'companion', 'native', 'AudioHelper', 'bin', 'Debug', 'net9.0-windows10.0.19041.0', 'AudioHelper.exe')
  ];
  const helper = candidates.find((candidate) => existsSync(candidate));
  if (!helper) {
    throw new Error('AudioHelper.exe was not found. Run "npm run build:audio-helper" from companion or pass --helper.');
  }
  return helper;
}

function resolveStimulusPath(options) {
  if (options.stimulusPath) {
    return path.resolve(options.stimulusPath);
  }

  const candidates = [
    path.join(process.cwd(), 'companion', 'src', 'renderer', 'assets', 'test-speaker-tone-silence-tail.mp3'),
    path.join(process.cwd(), 'companion', 'native', 'AudioHelper', 'bin', 'publish', 'win-x64', 'test-speaker-tone-silence-tail.mp3')
  ];
  const stimulus = candidates.find((candidate) => existsSync(candidate));
  if (!stimulus) {
    throw new Error('Bundled test tone was not found. Pass --stimulus-path.');
  }
  return stimulus;
}

function buildCaptureArgs(options, source, mode, appPidOverride) {
  const args = [
    '--device-name',
    options.bridgeDevice,
    '--source',
    'render-loopback',
    '--haptics-only',
    '--haptics-gain',
    `${options.gain}`,
    '--haptics-bass-focus',
    options.bassFocus,
    '--haptics-response',
    options.response,
    '--haptics-attack',
    options.attack,
    '--haptics-release',
    options.release
  ];

  if (mode === 'stdout') {
    args.push('--stdout-only');
  }

  if (source === 'app') {
    const pid = appPidOverride ?? options.appPid;
    if (Number.isFinite(pid) && pid > 0) {
      args.push('--haptics-app-process-id', `${Math.round(pid)}`);
    }
    if (options.appPath) {
      args.push('--haptics-app-process-path', options.appPath);
    }
    if (options.appExe) {
      args.push('--haptics-app-executable', options.appExe);
    }
  }

  return args;
}

function startStimulus(helperPath, options) {
  const args = ['--play-test-tone', '--test-audio-path', resolveStimulusPath(options)];
  if (options.stimulusDevice) {
    args.unshift('--device-name', options.stimulusDevice);
  }

  const child = spawn(helperPath, args, {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe']
  });
  child.stderr.setEncoding('utf8');
  return child;
}

function stopChild(child) {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }
  child.kill();
}

async function runCase(helperPath, options, source, mode) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'ds5-audio-haptics-'));
  const frameDumpPath = path.join(tempDir, `${source}-${mode}.frames`);
  const frames = [];
  const stderrLines = [];
  const helperStats = [];
  const status = {
    ok: false,
    unavailable: null,
    exitCode: null,
    signal: null,
    recordingStartedMs: null,
    stimulusStartedMs: null
  };
  let stdoutBuffer = Buffer.alloc(0);
  let recordingStartedAt = null;
  let stimulusStartedAt = null;
  let stimulusProcess = null;

  if (source === 'app' && options.stimulus && !options.appPid && !options.appPath && !options.appExe) {
    stimulusProcess = startStimulus(helperPath, options);
    stimulusStartedAt = performance.now();
    await delay(500);
  }

  const args = buildCaptureArgs(options, source, mode, stimulusProcess?.pid);
  const startedAt = performance.now();
  const child = spawn(helperPath, args, {
    env: {
      ...process.env,
      DS5_BRIDGE_AUDIO_HELPER_DIAGNOSTICS: '1',
      DS5_BRIDGE_AUDIO_HELPER_FRAME_DUMP: frameDumpPath,
      DS5_BRIDGE_AUDIO_HELPER_FRAME_DUMP_LIMIT: `${Math.ceil(options.seconds * 120)}`
    },
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => {
    if (mode !== 'stdout') {
      return;
    }
    stdoutBuffer = Buffer.concat([stdoutBuffer, chunk]);
    while (stdoutBuffer.length >= FRAME_PREFIX_BYTES) {
      const frameLength = stdoutBuffer.readUInt16LE(0);
      if (frameLength !== FRAME_BYTES) {
        status.unavailable = `bad stdout frame length ${frameLength}`;
        stdoutBuffer = Buffer.alloc(0);
        return;
      }
      const recordBytes = FRAME_PREFIX_BYTES + frameLength;
      if (stdoutBuffer.length < recordBytes) {
        return;
      }
      const frame = Buffer.from(stdoutBuffer.subarray(FRAME_PREFIX_BYTES, recordBytes));
      stdoutBuffer = stdoutBuffer.subarray(recordBytes);
      frames.push({ frame, timeMs: performance.now() });
    }
  });

  let stderrBuffer = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderrBuffer += chunk;
    const lines = stderrBuffer.split(/\r?\n/);
    stderrBuffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line.length === 0) {
        continue;
      }
      stderrLines.push(line);
      if (line.includes('status: capture-unavailable')) {
        status.unavailable = line;
      }
      if (line.startsWith('stage=helper ')) {
        helperStats.push(parseKeyValues(line));
      }
      if (line.includes('status: recording-started') && recordingStartedAt === null) {
        recordingStartedAt = performance.now();
        status.recordingStartedMs = recordingStartedAt - startedAt;
        if (source === 'system' && options.stimulus) {
          stimulusProcess = startStimulus(helperPath, options);
          stimulusStartedAt = performance.now();
        }
      }
    }
  });

  await new Promise((resolve) => {
    let runTimer = null;
    const startTimer = setTimeout(() => {
      status.unavailable ??= 'recording start timeout';
      stopChild(child);
    }, options.startTimeoutMs);

    child.on('exit', (code, signal) => {
      clearTimeout(startTimer);
      if (runTimer) {
        clearTimeout(runTimer);
      }
      status.exitCode = code;
      status.signal = signal;
      resolve();
    });

    const poll = setInterval(() => {
      if (recordingStartedAt !== null) {
        clearInterval(poll);
        clearTimeout(startTimer);
        runTimer = setTimeout(() => stopChild(child), options.seconds * 1000);
      }
      if (child.exitCode !== null) {
        clearInterval(poll);
      }
    }, 25);
  });

  if (stderrBuffer.length > 0) {
    stderrLines.push(stderrBuffer);
  }
  stopChild(stimulusProcess);
  await waitForExit(stimulusProcess, 1000);

  const dumpFrames = parseFrameDump(frameDumpPath);
  const measuredFrames = frames.length > 0 ? frames : dumpFrames.map((frame) => ({ frame, timeMs: null }));
  const metrics = summarizeFrames(measuredFrames, recordingStartedAt, stimulusStartedAt);
  const lastStats = helperStats.at(-1) ?? null;
  status.ok = !status.unavailable && measuredFrames.length > 0;
  status.stimulusStartedMs = stimulusStartedAt !== null ? stimulusStartedAt - startedAt : null;

  rmSync(tempDir, { recursive: true, force: true });

  return {
    source,
    mode,
    args,
    status,
    metrics,
    diagnostics: summarizeDiagnostics(lastStats),
    stderrTail: stderrLines.slice(-8)
  };
}

function parseKeyValues(line) {
  const values = {};
  for (const match of line.matchAll(/([A-Za-z0-9_]+)=('[^']*'|"[^"]*"|\S+)/g)) {
    const raw = match[2].replace(/^['"]|['"]$/g, '');
    const number = Number(raw);
    values[match[1]] = Number.isFinite(number) && raw !== '' ? number : raw;
  }
  return values;
}

function parseFrameDump(frameDumpPath) {
  if (!existsSync(frameDumpPath)) {
    return [];
  }

  const bytes = readFileSync(frameDumpPath);
  const frames = [];
  let offset = 0;
  while (offset + FRAME_PREFIX_BYTES <= bytes.length) {
    const frameLength = bytes.readUInt16LE(offset);
    offset += FRAME_PREFIX_BYTES;
    if (frameLength !== FRAME_BYTES || offset + frameLength > bytes.length) {
      break;
    }
    frames.push(Buffer.from(bytes.subarray(offset, offset + frameLength)));
    offset += frameLength;
  }
  return frames;
}

function summarizeFrames(records, recordingStartedAt, stimulusStartedAt) {
  let hapticPeak = 0;
  let hapticSumAbs = 0;
  let hapticNonZeroSamples = 0;
  let activeFrames = 0;
  let firstFrameMs = null;
  let firstActiveFromRecordingMs = null;
  let firstActiveFromStimulusMs = null;
  const times = records.map((record) => record.timeMs).filter((time) => Number.isFinite(time));
  const intervals = [];

  if (records.length > 0 && Number.isFinite(records[0].timeMs) && recordingStartedAt !== null) {
    firstFrameMs = records[0].timeMs - recordingStartedAt;
  }

  for (let index = 1; index < times.length; index += 1) {
    intervals.push(times[index] - times[index - 1]);
  }

  for (const record of records) {
    let framePeak = 0;
    for (let index = 0; index < HAPTIC_BYTES; index += 1) {
      const sample = record.frame.readInt8(index);
      const abs = Math.abs(sample);
      hapticSumAbs += abs;
      if (abs > 0) {
        hapticNonZeroSamples++;
      }
      if (abs > framePeak) {
        framePeak = abs;
      }
    }
    if (framePeak > hapticPeak) {
      hapticPeak = framePeak;
    }
    if (framePeak > 0) {
      activeFrames++;
      if (firstActiveFromRecordingMs === null && Number.isFinite(record.timeMs) && recordingStartedAt !== null) {
        firstActiveFromRecordingMs = record.timeMs - recordingStartedAt;
      }
      if (firstActiveFromStimulusMs === null && Number.isFinite(record.timeMs) && stimulusStartedAt !== null) {
        firstActiveFromStimulusMs = record.timeMs - stimulusStartedAt;
      }
    }
  }

  const totalSamples = records.length * HAPTIC_BYTES;
  const durationMs = times.length >= 2 ? times[times.length - 1] - times[0] : null;
  return {
    frames: records.length,
    fps: durationMs && durationMs > 0 ? (records.length - 1) * 1000 / durationMs : null,
    firstFrameMs,
    firstActiveFromRecordingMs,
    firstActiveFromStimulusMs,
    intervalMeanMs: mean(intervals),
    intervalP50Ms: percentile(intervals, 50),
    intervalP95Ms: percentile(intervals, 95),
    intervalP99Ms: percentile(intervals, 99),
    intervalMaxMs: intervals.length > 0 ? Math.max(...intervals) : null,
    activeFrames,
    activeFramePercent: records.length > 0 ? activeFrames * 100 / records.length : null,
    hapticPeak,
    hapticMeanAbs: totalSamples > 0 ? hapticSumAbs / totalSamples : null,
    hapticNonZeroPercent: totalSamples > 0 ? hapticNonZeroSamples * 100 / totalSamples : null,
    timestamped: times.length
  };
}

function summarizeDiagnostics(stats) {
  if (!stats) {
    return null;
  }
  return {
    transport: stats.transport ?? null,
    callbacks: stats.callbacks ?? null,
    capturedFrames: stats.capturedFrames ?? null,
    encodedReports: stats.encodedReports ?? null,
    writtenReports: stats.writtenReports ?? null,
    writtenFragments: stats.writtenFragments ?? null,
    droppedReports: stats.droppedReports ?? null,
    pcmDroppedChunks: stats.pcmDroppedChunks ?? null,
    pcmQueueMaxChunks: stats.pcmQueueMaxChunks ?? null,
    captureGapMaxUs: stats.captureGapMaxUs ?? null,
    captureGapOver12ms: stats.captureGapOver12ms ?? null,
    captureGapOver16ms: stats.captureGapOver16ms ?? null,
    captureGapOver20ms: stats.captureGapOver20ms ?? null,
    writerScheduleLateOver2ms: stats.writerScheduleLateOver2ms ?? null,
    writerScheduleLateOver4ms: stats.writerScheduleLateOver4ms ?? null,
    writerScheduleLateOver8ms: stats.writerScheduleLateOver8ms ?? null,
    writerScheduleLateMaxUs: stats.writerScheduleLateMaxUs ?? null,
    hidWriteOver2ms: stats.hidWriteOver2ms ?? null,
    hidWriteOver4ms: stats.hidWriteOver4ms ?? null,
    hidWriteOver8ms: stats.hidWriteOver8ms ?? null,
    hidWriteTimeouts: stats.hidWriteTimeouts ?? null,
    hidWriteMaxUs: stats.hidWriteMaxUs ?? null,
    peakPermille: stats.peakPermille ?? null
  };
}

function mean(values) {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, percent) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1));
  return sorted[index];
}

function formatMs(value) {
  return value === null || value === undefined ? '--' : `${value.toFixed(2)}ms`;
}

function formatNumber(value, digits = 1) {
  return value === null || value === undefined ? '--' : value.toFixed(digits);
}

function printReport(helperPath, options, results) {
  console.log('DS5 Bridge audio haptics battery');
  console.log(`Helper: ${helperPath}`);
  console.log(`Capture: ${options.seconds}s, gain=${options.gain}, response=${options.response}, attack=${options.attack}, release=${options.release}`);
  if (options.stimulus) {
    console.log(`Stimulus: ${resolveStimulusPath(options)}${options.stimulusDevice ? ` -> ${options.stimulusDevice}` : ' -> Windows default render'}`);
  }
  console.log('');

  for (const result of results) {
    const { metrics, diagnostics, status } = result;
    const label = `${result.source}/${result.mode}`;
    const state = status.ok ? 'ok' : `unavailable (${status.unavailable ?? `exit ${status.signal ?? status.exitCode ?? 'unknown'}`})`;
    console.log(`${label}: ${state}`);
    console.log(`  frames=${metrics.frames} fps=${formatNumber(metrics.fps)} first=${formatMs(metrics.firstFrameMs)} first-active=${formatMs(metrics.firstActiveFromRecordingMs)} stimulus-active=${formatMs(metrics.firstActiveFromStimulusMs)} active=${formatNumber(metrics.activeFramePercent)}%`);
    console.log(`  cadence mean=${formatMs(metrics.intervalMeanMs)} p95=${formatMs(metrics.intervalP95Ms)} p99=${formatMs(metrics.intervalP99Ms)} max=${formatMs(metrics.intervalMaxMs)}`);
    console.log(`  strength peak=${metrics.hapticPeak} meanAbs=${formatNumber(metrics.hapticMeanAbs, 2)} nonzero=${formatNumber(metrics.hapticNonZeroPercent)}% timestamped=${metrics.timestamped}`);
    if (diagnostics) {
      console.log(`  helper transport=${diagnostics.transport ?? '--'} captureGapMax=${diagnostics.captureGapMaxUs ?? '--'}us drops=${diagnostics.droppedReports ?? '--'} pcmDrops=${diagnostics.pcmDroppedChunks ?? '--'} queueMax=${diagnostics.pcmQueueMaxChunks ?? '--'}`);
      console.log(`  writerLate>2/4/8ms=${diagnostics.writerScheduleLateOver2ms ?? '--'}/${diagnostics.writerScheduleLateOver4ms ?? '--'}/${diagnostics.writerScheduleLateOver8ms ?? '--'} max=${diagnostics.writerScheduleLateMaxUs ?? '--'}us hidLate>2/4/8ms=${diagnostics.hidWriteOver2ms ?? '--'}/${diagnostics.hidWriteOver4ms ?? '--'}/${diagnostics.hidWriteOver8ms ?? '--'} hidMax=${diagnostics.hidWriteMaxUs ?? '--'}us`);
    }
    if (!status.ok && result.stderrTail.length > 0) {
      console.log(`  tail: ${result.stderrTail.join(' | ')}`);
    }
    console.log('');
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForExit(child, timeoutMs) {
  if (!child || child.exitCode !== null) {
    return;
  }
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const helperPath = resolveHelperPath(options);
  const results = [];
  for (const source of options.sources) {
    if (
      source === 'app'
      && !options.stimulus
      && !options.appPid
      && !options.appPath
      && !options.appExe
    ) {
      results.push({
        source,
        mode: 'skipped',
        args: [],
        status: {
          ok: false,
          unavailable: 'app source requires --app-pid, --app-path, --app-exe, or --stimulus',
          exitCode: null,
          signal: null,
          recordingStartedMs: null,
          stimulusStartedMs: null
        },
        metrics: summarizeFrames([], null, null),
        diagnostics: null,
        stderrTail: []
      });
      continue;
    }

    for (const mode of options.modes) {
      results.push(await runCase(helperPath, options, source, mode));
    }
  }

  if (options.json) {
    console.log(JSON.stringify({ helperPath, options, results }, null, 2));
    return;
  }
  printReport(helperPath, options, results);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
