// A connected DualSense Edge on a Pico 2 W bridge, built on the app's default settings.
import { createRequire } from 'node:module';
import path from 'node:path';

const BRIDGE_PATH = '\\\\?\\HID#VID_2E8A&PID_10F4&MI_03#fixture';

export function createFixtureSnapshot(companionRoot) {
  const require = createRequire(import.meta.url);
  const { DEFAULT_SETTINGS } = require(path.join(companionRoot, 'dist', 'main', 'main', 'settings-store.js'));
  return {
    state: 'connected',
    message: 'Connected',
    settings: {
      ...DEFAULT_SETTINGS,
      selectedBridgePath: BRIDGE_PATH,
      notifyControllerConnection: true
    },
    status: {
      controllerConnected: true,
      controllerType: 'dualsense-edge',
      batteryPercent: 75,
      rawPowerState: 0,
      audioRecent: false,
      hapticsReady: true,
      hapticsGainPercent: 100,
      speakerVolumePercent: 100,
      speakerGainLevel: 7,
      lightbarColor: { red: 0, green: 0, blue: 255, brightnessPercent: 100 },
      lightbarOverrideEnabled: false,
      micMuted: false,
      muteButtonMode: 'normal',
      muteKeyboardUsage: 0x68,
      muteKeyboardModifiers: 0,
      muteKeyboardBehavior: 'tap',
      muteKeyboardChordStarterEnabled: false,
      quietModeEnabled: false,
      audioDebug: {
        usbHostSpeakerVolumePercent: 100,
        usbHostMicVolumePercent: 100,
        usbHostSpeakerMute: false,
        usbHostMicMute: false,
        lastHostOutputLength: 0,
        lastHostOutputReportId: 0,
        lastHostOutputCount: 0
      },
      ledEnabled: true,
      idleDisconnectEnabled: false,
      idleDisconnectTimeoutMinutes: 15,
      signalStrengthDbm: -36,
      usbSuspendDisconnectEnabled: true,
      sleepKeybindEnabled: false,
      wakeOnConnectEnabled: true,
      settingsRevision: 1,
      lastCommandResult: 0,
      testHapticsBusy: false,
      testHapticsCooldown: false,
      hostOutputRecent: true,
      adaptiveTriggerOutputRecent: false,
      testAdaptiveTriggersBusy: false,
      uptimeSeconds: 5400,
      firmwareVersion: '2.0.0',
      firmwareFlags: {
        companion: true,
        dse: true,
        speakerVolumeControl: true,
        lightbarControl: true,
        lightbarOverrideControl: true,
        muteButtonActions: true,
        hapticsBufferLengthControl: true,
        adaptiveTriggersControl: true,
        usbSuspendDisconnectControl: true,
        sleepControllerControl: true,
        pollingRateControl: true,
        hostPersonaControl: true,
        audioReactiveHapticsControl: true,
        wakeOnConnectControl: true
      },
      hostPersonaMode: 'dualsense',
      supportedHostPersonaModes: ['dualsense', 'dualsense-edge', 'ds4', 'xbox'],
      protocolVersion: '1.19'
    },
    diagnostics: {
      hidPath: BRIDGE_PATH,
      protocolVersion: '1.19',
      uptimeSeconds: 5400,
      settingsRevision: 1,
      lastAck: null,
      lastError: null,
      firmwareUpdateAvailable: null,
      lastPollAt: Date.now(),
      rawDevices: [],
      deviceIdentity: null,
      firmwareLogDirectory: null,
      firmwareLogPath: null,
      firmwareLogEnabled: null,
      firmwareLogDroppedBytes: 0,
      firmwareLogLastError: null,
      audioDebugLogPath: null,
      audioDebugLogLines: [],
      audioDebugDroppedCount: 0,
      audioDebugStats: null,
      triggerTraceLines: [],
      triggerTraceDroppedCount: 0,
      feedbackTraceLines: [],
      feedbackTraceDroppedCount: 0,
      audioStatus: null
    },
    personaTransition: null,
    bridgeDevices: {
      bridges: [{
        path: BRIDGE_PATH,
        containerId: null,
        selected: true,
        connected: true,
        uniqueId: 'e6614c311b7d3a2f',
        name: 'Pico 2 W'
      }],
      directControllers: [],
      selectedBridgePath: BRIDGE_PATH
    },
    stickInputPreview: null
  };
}
