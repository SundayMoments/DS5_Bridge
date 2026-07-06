import { afterEach, describe, expect, it, vi } from 'vitest';

const DEBUG_ENV_KEYS = [
  'DS5_BRIDGE_DIAGNOSTICS',
  'DS5_BRIDGE_AUDIO_DEBUG_DIAGNOSTICS',
  'DS5_BRIDGE_TRIGGER_TRACE_DIAGNOSTICS',
  'DS5_BRIDGE_FEEDBACK_TRACE_DIAGNOSTICS',
  'DS5_BRIDGE_MIC_KEEPALIVE',
  'DS5_BRIDGE_AUDIO_HELPER_DIAGNOSTICS'
] as const;

const originalEnv = { ...process.env };

async function loadConfig(env: Record<string, string | undefined>) {
  for (const key of DEBUG_ENV_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.resetModules();
  const module = await import('./debug-config');
  return module.CompanionDebugConfig;
}

afterEach(() => {
  for (const key of DEBUG_ENV_KEYS) {
    delete process.env[key];
    const original = originalEnv[key];
    if (original != null) {
      process.env[key] = original;
    }
  }
  vi.resetModules();
});

describe('CompanionDebugConfig', () => {
  it('defaults to diagnostics off', async () => {
    const config = await loadConfig({});

    expect(config).toMatchObject({
      diagnosticsPreset: 'off',
      audioDebugDiagnosticsEnabled: false,
      triggerTraceDiagnosticsEnabled: false,
      feedbackTraceDiagnosticsEnabled: false,
      micKeepaliveEnabled: false,
      audioHelperDiagnosticsEnabled: false
    });
  });

  it('maps diagnostics presets to the intended feature families', async () => {
    await expect(loadConfig({ DS5_BRIDGE_DIAGNOSTICS: ' audio ' })).resolves.toMatchObject({
      diagnosticsPreset: 'audio',
      audioDebugDiagnosticsEnabled: true,
      triggerTraceDiagnosticsEnabled: false,
      feedbackTraceDiagnosticsEnabled: false,
      audioHelperDiagnosticsEnabled: false
    });

    await expect(loadConfig({ DS5_BRIDGE_DIAGNOSTICS: 'traces' })).resolves.toMatchObject({
      diagnosticsPreset: 'traces',
      audioDebugDiagnosticsEnabled: true,
      triggerTraceDiagnosticsEnabled: true,
      feedbackTraceDiagnosticsEnabled: true,
      audioHelperDiagnosticsEnabled: false
    });

    await expect(loadConfig({ DS5_BRIDGE_DIAGNOSTICS: 'helper' })).resolves.toMatchObject({
      diagnosticsPreset: 'helper',
      audioDebugDiagnosticsEnabled: false,
      triggerTraceDiagnosticsEnabled: false,
      feedbackTraceDiagnosticsEnabled: false,
      audioHelperDiagnosticsEnabled: true
    });

    await expect(loadConfig({ DS5_BRIDGE_DIAGNOSTICS: 'all' })).resolves.toMatchObject({
      diagnosticsPreset: 'all',
      audioDebugDiagnosticsEnabled: true,
      triggerTraceDiagnosticsEnabled: true,
      feedbackTraceDiagnosticsEnabled: true,
      audioHelperDiagnosticsEnabled: true
    });
  });

  it('lets explicit env flags override preset defaults', async () => {
    const config = await loadConfig({
      DS5_BRIDGE_DIAGNOSTICS: 'all',
      DS5_BRIDGE_AUDIO_DEBUG_DIAGNOSTICS: '0',
      DS5_BRIDGE_TRIGGER_TRACE_DIAGNOSTICS: 'false',
      DS5_BRIDGE_FEEDBACK_TRACE_DIAGNOSTICS: 'off',
      DS5_BRIDGE_AUDIO_HELPER_DIAGNOSTICS: 'no',
      DS5_BRIDGE_MIC_KEEPALIVE: 'yes'
    });

    expect(config).toMatchObject({
      diagnosticsPreset: 'all',
      audioDebugDiagnosticsEnabled: false,
      triggerTraceDiagnosticsEnabled: false,
      feedbackTraceDiagnosticsEnabled: false,
      audioHelperDiagnosticsEnabled: false,
      micKeepaliveEnabled: true
    });
  });
});
