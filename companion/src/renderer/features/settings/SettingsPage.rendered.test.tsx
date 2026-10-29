// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';
import { SettingsSidebar } from './SettingsSidebar';
import { useSettingsNavigation } from './use-settings-navigation';
import type { SettingsFocusTarget } from './settings-navigation';
import type { SettingsPageActions, SettingsPageModel } from './types';
import { DS5_BRIDGE_DISCORD_URL, DS5_BRIDGE_GITHUB_URL } from './SystemSettings';
import { KITSUNE_INPUT_PURCHASE_URL, KITSUNE_INPUT_URL } from '../kitsune-promotion';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

function baseModel(overrides: Partial<SettingsPageModel> = {}): SettingsPageModel {
  return {
    settings: {
      uiScalePercent: 100,
      uiTextScalePercent: 100,
      uiThemePreset: 'dark',
      launchAtStartupEnabled: false,
      showBatteryPercentTrayIcon: true,
      closeButtonQuits: false,
      ledEnabled: true,
      playerLedEnabled: true,
      idleDisconnectEnabled: true,
      idleDisconnectTimeoutMinutes: 15,
      usbSuspendDisconnectEnabled: true,
      wakeOnConnectEnabled: true,
      controllerPowerSavingEnabled: false,
      edgeProfileSwitchingBlocked: false,
      sleepKeybindEnabled: false,
      speakerVolumeShortcutEnabled: false,
      lightbarRestoreEnabled: true,
      notifyControllerConnection: true,
      notifyLowBattery: false,
      notifyPersonaChange: true
    },
    connected: true,
    busy: false,
    pendingAction: null,
    support: { usbSuspendDisconnect: true, wakeOnConnect: true, sleepController: true },
    focusTarget: null,
    picoFirmware: { message: null, error: null },
    wakeOnLan: { connectionKey: 'connected', controllerConnected: false, firmwareUpdateRequired: false },
    bridgeHealth: { firmwareVersion: '2.0.0', resetEvidence: null },
    ...overrides
  };
}

function createActions(): SettingsPageActions & Record<string, ReturnType<typeof vi.fn>> {
  const names = [
    'setTheme', 'setUiScale', 'setTextScale', 'setLocale', 'toggleLaunchAtStartup', 'toggleBatteryTrayIcon',
    'toggleCloseButtonQuits', 'toggleControllerNotifications', 'toggleLowBatteryNotifications',
    'togglePersonaNotifications', 'setIdleDisconnectTimeout',
    'toggleIdleDisconnect', 'toggleUsbSuspendDisconnect', 'toggleControllerPowerSaving', 'toggleLed', 'togglePlayerLed',
    'toggleLightbarRestore', 'toggleEdgeProfileSwitching', 'toggleSleepShortcut', 'toggleVolumeShortcut',
    'toggleWakeOnConnect', 'mountPicoBootloader', 'flashPicoFirmware', 'nukePicoFlash', 'openExternal'
  ];
  const wakeOnLan = {
    getWakeOnLan: vi.fn(async () => ({ supported: false, availableCountries: [], configured: false } as never)),
    getWakeOnLanTargets: vi.fn(async () => []),
    getWakeOnLanReadiness: vi.fn(),
    configureWakeOnLan: vi.fn(),
    setWakeOnLanEnabled: vi.fn(),
    forgetWakeOnLan: vi.fn(),
    cancelWakeOnLan: vi.fn()
  };
  return { ...Object.fromEntries(names.map((name) => [name, vi.fn()])), wakeOnLan } as never;
}

function Harness({ model, actions, onBack = vi.fn(), focusTarget = null }: {
  model: SettingsPageModel;
  actions: SettingsPageActions;
  onBack?: () => void;
  focusTarget?: SettingsFocusTarget | null;
}) {
  const navigation = useSettingsNavigation({ focusTarget });
  const [visible] = useState(true);
  return (
    <div className="shell">
      <SettingsSidebar navigation={navigation} onBack={onBack} header={<div className="header-probe" />} />
      <SettingsPage active={visible} navigation={navigation} model={{ ...model, focusTarget }} actions={actions} />
    </div>
  );
}

function render(element: React.ReactElement) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(element));
  return host;
}

function sectionButton(host: HTMLElement, label: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('.settings-section-button')]
    .find((button) => button.textContent === label)!;
}

function rowSwitch(host: HTMLElement, label: string) {
  const strong = [...host.querySelectorAll('.settings-page .settings-menu-row strong')]
    .find((element) => element.textContent === label);
  expect(strong, label).toBeTruthy();
  return strong!.closest('.settings-menu-row')!.querySelector<HTMLButtonElement>('[role="switch"]')!;
}

function search(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>('.settings-search input')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('Settings page', () => {
  it('groups every settings section in the Kitsune-style sidebar', () => {
    const host = render(<Harness model={baseModel()} actions={createActions()} />);
    const groups = [...host.querySelectorAll('.settings-nav-group')].map((group) => ({
      label: group.querySelector('.settings-nav-group-label')?.textContent,
      sections: [...group.querySelectorAll('.settings-section-button')].map((button) => button.textContent)
    }));
    expect(groups).toEqual([
      { label: 'App', sections: ['General', 'Appearance', 'Notifications'] },
      { label: 'Controller & Bridge', sections: ['Connection & Power', 'Lights & Indicators', 'Shortcuts'] },
      { label: 'System', sections: ['Wake PC', 'Bridge Firmware', 'Help & About'] }
    ]);
    expect(host.querySelector('.header-probe')).not.toBeNull();
    expect(host.querySelector('#settings-page-title')?.textContent).toBe('General');
    expect(sectionButton(host, 'General').getAttribute('aria-current')).toBe('page');
  });

  it('keeps every existing setting reachable and wired to its action', () => {
    const actions = createActions();
    const host = render(<Harness model={baseModel()} actions={actions} />);
    const expectations: Array<[section: string, label: string, action: string]> = [
      ['General', 'Launch at Startup', 'toggleLaunchAtStartup'],
      ['General', 'Battery Tray Icon', 'toggleBatteryTrayIcon'],
      ['General', 'Quit on Close', 'toggleCloseButtonQuits'],
      ['Notifications', 'Controller Status', 'toggleControllerNotifications'],
      ['Notifications', 'Low Battery', 'toggleLowBatteryNotifications'],
      ['Notifications', 'Host Controller Switch', 'togglePersonaNotifications'],
      ['Connection & Power', 'PC Sleep Disconnect', 'toggleUsbSuspendDisconnect'],
      ['Connection & Power', 'Controller Power Saving', 'toggleControllerPowerSaving'],
      ['Lights & Indicators', 'Bridge LED', 'toggleLed'],
      ['Lights & Indicators', 'Player LEDs', 'togglePlayerLed'],
      ['Lights & Indicators', 'Automatic Restore', 'toggleLightbarRestore'],
      ['Shortcuts', 'Block Edge Profile Switching', 'toggleEdgeProfileSwitching'],
      ['Wake PC', 'Wake PC on Controller', 'toggleWakeOnConnect']
    ];
    for (const [section, label, action] of expectations) {
      act(() => sectionButton(host, section).click());
      act(() => rowSwitch(host, label).click());
      expect(actions[action], `${section} › ${label}`).toHaveBeenCalledOnce();
    }

    act(() => sectionButton(host, 'Shortcuts').click());
    const shortcutLabels = [...host.querySelectorAll('.settings-page .settings-menu-row strong')].map((element) => element.textContent);
    expect(shortcutLabels).toEqual(expect.arrayContaining(['Sleep Shortcut', 'Volume Shortcut']));

    act(() => sectionButton(host, 'Connection & Power').click());
    act(() => host.querySelector<HTMLButtonElement>('[aria-labelledby="settings-idle-disconnect-label"]')!.click());
    expect(actions.toggleIdleDisconnect).toHaveBeenCalledOnce();
    expect(host.querySelector('[aria-label="Idle disconnect timeout"]')?.textContent).toContain('15 min');

    act(() => sectionButton(host, 'Notifications').click());
    expect([...host.querySelectorAll('.settings-page .settings-menu-row strong')].map((element) => element.textContent))
      .toEqual(['Controller Status', 'Low Battery', 'Host Controller Switch']);

    act(() => sectionButton(host, 'Appearance').click());
    expect([...host.querySelectorAll('.settings-page [aria-label]')].map((element) => element.getAttribute('aria-label')))
      .toEqual(expect.arrayContaining(['UI scale', 'UI text scale', 'UI theme']));

    act(() => sectionButton(host, 'General').click());
    expect(host.querySelector('[aria-label="Application language"]')).not.toBeNull();
  });

  it('runs the Pico firmware tools and shows their results', () => {
    const actions = createActions();
    const host = render(<Harness
      model={baseModel({ pendingAction: 'pico-firmware-mount', picoFirmware: { message: 'Mounted RP2350', error: 'Drive missing' } })}
      actions={actions}
    />);
    act(() => sectionButton(host, 'Bridge Firmware').click());
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.pico-firmware-actions button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['Nuke', 'Mounting…', 'Flash']);
    buttons.forEach((button) => act(() => button.click()));
    expect(actions.nukePicoFlash).toHaveBeenCalledOnce();
    expect(actions.mountPicoBootloader).toHaveBeenCalledOnce();
    expect(actions.flashPicoFirmware).toHaveBeenCalledOnce();
    expect(host.querySelector('.pico-firmware-message.good')?.textContent).toBe('Mounted RP2350');
    expect(host.querySelector('.pico-firmware-message.bad')?.textContent).toBe('Drive missing');
  });

  it('shows the last restart under the firmware tools when the firmware reports it', () => {
    const resetEvidence = {
      watchdogReset: true, evidenceValid: true, phase: 'companion', reason: 'watchdog-timeout',
      consecutiveAbnormalResets: 1, uptimeBeforeResetMs: 600_000, detail: 0, uptimeMs: 5_000
    };
    const host = render(<Harness model={baseModel({ bridgeHealth: { firmwareVersion: '2.0.0', resetEvidence } })} actions={createActions()} />);
    act(() => sectionButton(host, 'Bridge Firmware').click());
    const row = host.querySelector('#settings-section-maintenance .last-restart-row');
    expect(row?.querySelector('.last-restart-text')?.textContent).toBe('Recovered from a system freeze in app commands after 10m');

    act(() => root?.unmount());
    root = null;
    const older = render(<Harness model={baseModel()} actions={createActions()} />);
    act(() => sectionButton(older, 'Bridge Firmware').click());
    expect(older.querySelector('.last-restart-row')).toBeNull();
  });

  it('links Discord and GitHub from Help & About', () => {
    const actions = createActions();
    const host = render(<Harness model={baseModel()} actions={actions} />);
    act(() => sectionButton(host, 'Help & About').click());
    const links = [...host.querySelectorAll<HTMLButtonElement>('.settings-menu-link-row')];
    expect(links.map((link) => link.querySelector('strong')?.textContent)).toEqual(['Discord', 'GitHub']);
    expect(links[0]?.textContent).toContain('Official DS5 Bridge Discord');
    links.forEach((link) => act(() => link.click()));
    expect(vi.mocked(actions.openExternal).mock.calls).toEqual([[DS5_BRIDGE_DISCORD_URL], [DS5_BRIDGE_GITHUB_URL]]);
  });

  it('keeps a Kitsune Input card above the links in Help & About', () => {
    const actions = createActions();
    const host = render(<Harness model={baseModel()} actions={actions} />);
    act(() => sectionButton(host, 'Help & About').click());
    const card = host.querySelector<HTMLElement>('.kitsune-support-card')!;
    expect(card.querySelector('h4')?.textContent).toBe('Consider supporting Kitsune Input');
    expect(card.compareDocumentPosition(host.querySelector('.settings-menu-link-row')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    act(() => card.querySelector<HTMLButtonElement>('.kitsune-support-get')!.click());
    act(() => card.querySelector<HTMLButtonElement>('.kitsune-support-learn')!.click());
    expect(vi.mocked(actions.openExternal).mock.calls).toEqual([[KITSUNE_INPUT_PURCHASE_URL], [KITSUNE_INPUT_URL]]);
  });

  it('explains a missing bridge once and keeps bridge settings locked', () => {
    const host = render(<Harness model={baseModel({ connected: false })} actions={createActions()} />);
    act(() => sectionButton(host, 'Lights & Indicators').click());
    expect(host.querySelectorAll('.settings-bridge-notice')).toHaveLength(1);
    expect(rowSwitch(host, 'Bridge LED').disabled).toBe(true);
    expect(host.querySelector('.settings-unavailable-reason')).toBeNull();
  });

  it('names firmware that cannot use a setting', () => {
    const host = render(<Harness
      model={baseModel({ support: { usbSuspendDisconnect: true, wakeOnConnect: false, sleepController: true } })}
      actions={createActions()}
    />);
    act(() => sectionButton(host, 'Wake PC').click());
    expect(rowSwitch(host, 'Wake PC on Controller').disabled).toBe(true);
    expect(host.querySelector('.settings-unavailable-reason')?.textContent).toBe('Not supported by this bridge firmware.');
  });

  it('searches across sections and reports the result count', () => {
    const host = render(<Harness model={baseModel()} actions={createActions()} />);
    search(host, 'magic packet');
    expect(host.querySelector('#settings-page-title')?.textContent).toBe('Search results');
    expect(host.querySelector('#settings-search-status')?.textContent).toBe('1 match');
    const visible = [...host.querySelectorAll('.settings-category-section:not([hidden])')]
      .map((section) => section.getAttribute('data-settings-category'));
    expect(visible).toEqual(['pc-wake']);
    expect(host.querySelector('.settings-section-button.active')).toBeNull();

    search(host, 'zzz');
    expect(host.querySelector('.settings-filter-empty')?.textContent).toContain('No settings match');

    act(() => host.querySelector<HTMLButtonElement>('.settings-search-clear')!.click());
    expect(host.querySelector('#settings-page-title')?.textContent).toBe('General');
  });

  it('opens the linked section and frames the linked row', () => {
    const host = render(<Harness model={baseModel()} actions={createActions()} focusTarget="sleep-shortcut" />);
    expect(host.querySelector('#settings-page-title')?.textContent).toBe('Shortcuts');
    const highlighted = host.querySelector('.settings-menu-row-highlight strong');
    expect(highlighted?.textContent).toContain('Sleep Shortcut');
  });

  it('returns to the app from the sidebar', () => {
    const onBack = vi.fn();
    const host = render(<Harness model={baseModel()} actions={createActions()} onBack={onBack} />);
    const back = host.querySelector<HTMLButtonElement>('.settings-back-button')!;
    expect(document.activeElement).toBe(back);
    act(() => back.click());
    expect(onBack).toHaveBeenCalledOnce();
  });
});
