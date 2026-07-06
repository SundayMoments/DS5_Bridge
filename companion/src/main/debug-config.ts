type DiagnosticsPreset = 'off' | 'audio' | 'traces' | 'helper' | 'all';

export const DEBUG_ENV = {
  diagnosticsPreset: 'DS5_BRIDGE_DIAGNOSTICS',
  audioDebugDiagnostics: 'DS5_BRIDGE_AUDIO_DEBUG_DIAGNOSTICS',
  triggerTraceDiagnostics: 'DS5_BRIDGE_TRIGGER_TRACE_DIAGNOSTICS',
  feedbackTraceDiagnostics: 'DS5_BRIDGE_FEEDBACK_TRACE_DIAGNOSTICS',
  micKeepalive: 'DS5_BRIDGE_MIC_KEEPALIVE',
  audioHelperDiagnostics: 'DS5_BRIDGE_AUDIO_HELPER_DIAGNOSTICS'
} as const;

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : undefined;
}

function readDiagnosticsPreset(): DiagnosticsPreset {
  const value = readEnv(DEBUG_ENV.diagnosticsPreset)?.toLowerCase();
  switch (value) {
    case 'audio':
    case 'traces':
    case 'helper':
    case 'all':
      return value;
    default:
      return 'off';
  }
}

function readEnvFlag(name: string, fallback = false): boolean {
  const value = readEnv(name)?.toLowerCase();
  if (value == null) {
    return fallback;
  }
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function presetEnablesAudioDiagnostics(preset: DiagnosticsPreset): boolean {
  return preset === 'audio' || preset === 'traces' || preset === 'all';
}

function presetEnablesTraceDiagnostics(preset: DiagnosticsPreset): boolean {
  return preset === 'traces' || preset === 'all';
}

function presetEnablesAudioHelperDiagnostics(preset: DiagnosticsPreset): boolean {
  return preset === 'helper' || preset === 'all';
}

const diagnosticsPreset = readDiagnosticsPreset();

export const CompanionDebugConfig = {
  diagnosticsPreset,
  audioDebugDiagnosticsEnabled: readEnvFlag(
    DEBUG_ENV.audioDebugDiagnostics,
    presetEnablesAudioDiagnostics(diagnosticsPreset)
  ),
  triggerTraceDiagnosticsEnabled: readEnvFlag(
    DEBUG_ENV.triggerTraceDiagnostics,
    presetEnablesTraceDiagnostics(diagnosticsPreset)
  ),
  feedbackTraceDiagnosticsEnabled: readEnvFlag(
    DEBUG_ENV.feedbackTraceDiagnostics,
    presetEnablesTraceDiagnostics(diagnosticsPreset)
  ),
  micKeepaliveEnabled: readEnvFlag(DEBUG_ENV.micKeepalive),
  audioHelperDiagnosticsEnabled: readEnvFlag(
    DEBUG_ENV.audioHelperDiagnostics,
    presetEnablesAudioHelperDiagnostics(diagnosticsPreset)
  )
} as const;
