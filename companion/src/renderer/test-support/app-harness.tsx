import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi, type Mock } from 'vitest';
import { DEFAULT_SETTINGS } from '../../main/settings-store';
import type { BridgeSnapshot, CompanionSettings } from '../../shared/types';
import type { BridgeStatusPayload } from '../../shared/protocol';
import { App } from '../App';
import { RendererLocalization } from '../composition/RendererLocalization';

export const FIXTURE_BRIDGE_PATH = '\\\\?\\HID#VID_2E8A&PID_10F4&MI_03#fixture';

type DeepPartialSnapshot = Omit<Partial<BridgeSnapshot>, 'settings' | 'status' | 'diagnostics'> & {
  settings?: Partial<CompanionSettings>;
  status?: Partial<BridgeStatusPayload> | null;
  diagnostics?: Partial<BridgeSnapshot['diagnostics']>;
};

/** A connected DualSense Edge on a Pico 2 W bridge with every firmware feature available. */
export function fixtureSnapshot(overrides: DeepPartialSnapshot = {}): BridgeSnapshot {
  const status: BridgeStatusPayload = {
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
    signalStrengthDbm: -14,
    usbSuspendDisconnectEnabled: true,
    sleepKeybindEnabled: false,
    wakeOnConnectEnabled: true,
    settingsRevision: 1,
    lastCommandResult: 0,
    testHapticsBusy: false,
    testHapticsCooldown: false,
    hostOutputRecent: false,
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
  } as unknown as BridgeStatusPayload;
  const base: BridgeSnapshot = {
    state: 'connected',
    message: 'Connected',
    settings: {
      ...DEFAULT_SETTINGS,
      selectedBridgePath: FIXTURE_BRIDGE_PATH,
      notifyControllerConnection: true
    },
    status,
    diagnostics: {
      hidPath: FIXTURE_BRIDGE_PATH,
      protocolVersion: '1.19',
      uptimeSeconds: 5400,
      settingsRevision: 1,
      lastAck: null,
      lastError: null,
      firmwareUpdateAvailable: null,
      lastPollAt: 0,
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
        path: FIXTURE_BRIDGE_PATH,
        containerId: null,
        selected: true,
        connected: true,
        uniqueId: 'e6614c311b7d3a2f',
        name: 'Pico 2 W'
      }],
      directControllers: [],
      selectedBridgePath: FIXTURE_BRIDGE_PATH
    },
    stickInputPreview: null
  } as unknown as BridgeSnapshot;
  const { settings, status: statusOverrides, diagnostics, ...rest } = overrides;
  return {
    ...base,
    ...rest,
    settings: { ...base.settings, ...settings },
    status: statusOverrides === null ? null : { ...base.status!, ...statusOverrides } as BridgeStatusPayload,
    diagnostics: { ...base.diagnostics, ...diagnostics }
  } as BridgeSnapshot;
}

export interface BridgeMock {
  /** The vi.fn standing in for one bridge method; created on first use. */
  fn(name: string): Mock;
  /** Pushes a new snapshot as the main process would. */
  emit(next: BridgeSnapshot): void;
  snapshot(): BridgeSnapshot;
}

const SNAPSHOT_GETTERS = new Set(['getStatus']);

/**
 * Installs window.bridge. Every method resolves with the current snapshot
 * unless a test replaces its implementation with fn(name).mockImplementation.
 */
export function installBridgeMock(initial: BridgeSnapshot = fixtureSnapshot()): BridgeMock {
  let current = initial;
  const listeners = new Set<(snapshot: BridgeSnapshot) => void>();
  const fns = new Map<string, Mock>();
  const special: Record<string, (...args: unknown[]) => unknown> = {
    onSnapshot: (listener) => {
      listeners.add(listener as (snapshot: BridgeSnapshot) => void);
      return () => listeners.delete(listener as (snapshot: BridgeSnapshot) => void);
    },
    onWindowMaximizedChange: () => () => undefined,
    isWindowMaximized: async () => false,
    listAudioHapticsSessions: async () => [],
    listDevices: async () => [],
    getDiagnostics: async () => current.diagnostics
  };
  function fn(name: string): Mock {
    let mock = fns.get(name);
    if (!mock) {
      mock = vi.fn(special[name] ?? (async () => current));
      fns.set(name, mock);
    }
    return mock;
  }
  for (const name of SNAPSHOT_GETTERS) fn(name);
  window.bridge = new Proxy({}, {
    get: (_target, property) => (typeof property === 'string' ? fn(property) : undefined)
  }) as typeof window.bridge;
  return {
    fn,
    emit(next) {
      current = next;
      act(() => listeners.forEach((listener) => listener(next)));
    },
    snapshot: () => current
  };
}

let mountedRoot: Root | null = null;

/** Mounts the full renderer as main.tsx does and waits past the startup screen. */
export async function renderApp(): Promise<HTMLElement> {
  window.localStorage.setItem('ds5bridge.startupTutorialCompleted.v1', '1');
  const host = document.createElement('div');
  document.body.append(host);
  mountedRoot = createRoot(host);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  try {
    await act(async () => {
      mountedRoot!.render(<RendererLocalization><App /></RendererLocalization>);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
  } finally {
    vi.useRealTimers();
  }
  return host;
}

export function unmountApp(): void {
  if (mountedRoot) {
    act(() => mountedRoot!.unmount());
    mountedRoot = null;
  }
  document.body.innerHTML = '';
  window.localStorage.clear();
}

export function installDomStubs(): void {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
  }
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false
    })) as typeof window.matchMedia;
  }
}

/** Opens a page through the sidebar, as a person would. */
export async function openPage(host: HTMLElement, tabId: string): Promise<HTMLElement> {
  const button = host.querySelector<HTMLButtonElement>(`#control-tab-${tabId}`);
  if (!button) throw new Error(`No sidebar entry for ${tabId}`);
  await act(async () => button.click());
  const panel = host.querySelector<HTMLElement>('.control-page.active');
  if (!panel) throw new Error(`No active page after opening ${tabId}`);
  return panel;
}

export async function click(element: Element | null | undefined): Promise<void> {
  if (!element) throw new Error('Nothing to click');
  await act(async () => (element as HTMLElement).click());
}

export function buttonByText(root: ParentNode, text: string | RegExp): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>('button')].find((button) => (
    typeof text === 'string' ? button.textContent?.trim() === text : text.test(button.textContent ?? '')
  ));
}

/** Opens a CustomSelect by its accessible name and picks an option by label. */
export async function chooseOption(root: ParentNode, selectLabel: string, optionLabel: string): Promise<void> {
  const button = root.querySelector<HTMLButtonElement>(`button.custom-select-button[aria-label="${selectLabel}"]`);
  if (!button) throw new Error(`No select named ${selectLabel}`);
  await click(button);
  const option = document.querySelector<HTMLButtonElement>(
    `[role="listbox"][aria-label="${selectLabel}"] button[role="option"][aria-label="${optionLabel}"]`
  );
  if (!option) throw new Error(`No option ${optionLabel} in ${selectLabel}`);
  await click(option);
}

export async function setRange(input: HTMLInputElement, value: number, commit = true): Promise<void> {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (commit) {
      input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' }));
    }
  });
}
