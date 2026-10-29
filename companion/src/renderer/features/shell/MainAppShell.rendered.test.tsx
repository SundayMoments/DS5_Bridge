// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MainAppShell } from './MainAppShell';
import { ShellBridgeSelector, type ShellBridgeSelectorProps } from './ShellBridgeSelector';
import { ShellNotifications, type ShellNotificationsModel } from './ShellNotifications';
import { ShellSidebarDevice, type ShellDevicePresentation } from './ShellSidebarDevice';
import { ShellSupportBadge } from './ShellSupportBadge';
import { controlPanelIdFor, type ControlTab } from './control-tabs';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

function render(element: React.ReactElement) {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(element));
  return host;
}

const device: ShellDevicePresentation = {
  title: 'DualSense Edge',
  status: 'Connected',
  tone: 'good',
  batteryLabel: '75%',
  powerLabel: null,
  controllerArt: 'controller.svg'
};

function ShellHarness({ onSelect = vi.fn(), initialTab = 'overview' as ControlTab, closeButtonQuits = false }) {
  const [activeTab, setActiveTab] = useState<ControlTab>(initialTab);
  return (
    <MainAppShell
      className="shell"
      theme="dark"
      textScale={100}
      activeTab={activeTab}
      sidebarDevice={<ShellSidebarDevice device={device} onOpenDevices={() => setActiveTab('devices')} />}
      windowBarCenter={<button type="button" className="kitsune-promotion-banner">Explore</button>}
      windowBarTools={<><ShellSupportBadge badgeUrl="kofi.png" onOpen={vi.fn()} /><span className="tool-probe" /></>}
      pages={<div className="control-page active" id={controlPanelIdFor(activeTab)}>{activeTab}</div>}
      overlays={<div className="overlay-probe" />}
      onSelectTab={(tab) => {
        onSelect(tab);
        setActiveTab(tab);
      }}
      panelIdForTab={controlPanelIdFor}
      onWindowChromeMouseDown={vi.fn()}
      onBeginWindowDrag={vi.fn()}
      onMinimize={vi.fn()}
      onHide={vi.fn()}
      closeButtonQuits={closeButtonQuits}
    />
  );
}

describe('MainAppShell', () => {
  it('renders the Kitsune shell regions with the DS5 brand', () => {
    const host = render(<ShellHarness />);
    const shell = host.querySelector('.shell')!;
    expect(shell.getAttribute('data-theme')).toBe('dark');
    expect(shell.getAttribute('data-text-scale')).toBe('100');
    expect(shell.querySelector('.window-bar .window-bar-center .kitsune-promotion-banner')).not.toBeNull();
    expect(shell.querySelector('.window-bar .bridge-tools .tool-probe')).not.toBeNull();
    expect([...shell.querySelectorAll('.window-actions button')].map((button) => button.getAttribute('aria-label')))
      .toEqual(['Minimize', 'Hide to tray']);

    const brand = shell.querySelector('.hero-card .sidebar-brand')!;
    expect(brand.getAttribute('data-l10n')).toBe('off');
    expect(brand.getAttribute('aria-label')).toBe('DS5 Bridge');
    expect(brand.querySelector('.sidebar-brand-primary')?.textContent).toBe('DS5');
    expect(brand.querySelector('.sidebar-brand-accent')?.textContent).toBe('Bridge');
    expect(brand.querySelector('svg.bridge-mark')).not.toBeNull();

    expect(shell.querySelector('.app-content > .control-panel.flat-control-panel > .control-pages')).not.toBeNull();
    expect(shell.querySelector(':scope > .overlay-probe')).not.toBeNull();
  });

  it('labels the X button Quit when Quit on Close is on', () => {
    const host = render(<ShellHarness closeButtonQuits />);
    const close = host.querySelectorAll('.window-actions button')[1];
    expect(close.getAttribute('aria-label')).toBe('Quit DS5 Bridge');
    expect(close.getAttribute('title')).toBe('Quit DS5 Bridge');
  });

  it('groups navigation like Kitsune Input and pins Settings alone below the list', () => {
    const host = render(<ShellHarness />);
    const nav = host.querySelector('nav.control-tabs[aria-label="Controls"]')!;
    const groups = [...nav.querySelectorAll('.control-tab-group-trigger')].map((button) => button.textContent);
    expect(groups).toEqual(['Controller', 'Input', 'Tools']);
    const topLevel = [...nav.querySelectorAll('.control-tab-list > .control-tab-button')].map((button) => button.textContent);
    expect(topLevel).toEqual(['Overview']);
    expect(nav.lastElementChild?.id).toBe('control-tab-settings');
    expect(nav.querySelector('.shell-kofi-link')).toBeNull();
    const kofi = host.querySelector('.window-bar .bridge-tools .shell-kofi-link');
    expect(kofi?.getAttribute('aria-label')).toBe('Support SundayMoments on Ko-fi');
    expect(host.querySelector('#control-tab-overview')?.getAttribute('aria-current')).toBe('page');
  });

  it('expands one group at a time and keeps collapsed rows out of the tab order', () => {
    const onSelect = vi.fn();
    const host = render(<ShellHarness onSelect={onSelect} />);
    const trigger = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.control-tab-group-trigger')]
      .find((button) => button.textContent === label)!;
    expect(trigger('Controller').getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector<HTMLButtonElement>('#control-tab-trigger-lab')?.tabIndex).toBe(-1);

    act(() => trigger('Tools').click());
    expect(trigger('Tools').getAttribute('aria-expanded')).toBe('true');
    expect(trigger('Controller').getAttribute('aria-expanded')).toBe('false');
    const triggerLab = host.querySelector<HTMLButtonElement>('#control-tab-trigger-lab')!;
    expect(triggerLab.tabIndex).toBe(0);
    expect(triggerLab.getAttribute('aria-controls')).toBe('control-panel-triggers');

    act(() => triggerLab.click());
    expect(onSelect).toHaveBeenLastCalledWith('trigger-lab');
    expect(triggerLab.getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('.control-tab-group.contains-active .control-tab-group-trigger')?.textContent).toBe('Tools');
  });

  it('opens Devices from the device card', () => {
    const host = render(<ShellHarness />);
    const card = host.querySelector<HTMLElement>('.hero-main[role="button"]')!;
    expect(card.getAttribute('aria-label')).toBe('Open Devices');
    act(() => card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(host.querySelector('#control-tab-devices')?.getAttribute('aria-current')).toBe('page');
  });
});

describe('ShellSidebarDevice', () => {
  it('shows status through the card border and marks external power', () => {
    const host = render(<ShellSidebarDevice device={{ ...device, tone: 'warn', powerLabel: 'Charging' }} />);
    const card = host.querySelector('.hero-main')!;
    expect(card.classList.contains('device-status-warn')).toBe(true);
    expect(card.getAttribute('role')).toBeNull();
    expect(host.querySelector('.compact-device-status .dot')).toBeNull();
    expect(host.querySelector('.device-power-indicator')?.getAttribute('aria-label')).toBe('Charging');
    expect(host.querySelector('.device-battery-percentage')?.textContent).toBe('75%');
  });
});

describe('ShellBridgeSelector', () => {
  const baseProps: ShellBridgeSelectorProps = {
    bridges: [{ label: 'Pico 2 W', path: 'hid-1' }],
    selectedPath: 'hid-1',
    selectedName: 'Pico 2 W',
    selectedUniqueId: 'e6614c311b7d3a2f',
    directControllers: [{ path: 'usb-1', product: 'DualSense Wireless Controller' }],
    busy: false,
    onSelect: vi.fn(),
    onRefresh: vi.fn(),
    onRename: vi.fn()
  };

  function openMenu(host: HTMLElement) {
    act(() => host.querySelector<HTMLButtonElement>('.custom-select-button')!.click());
  }

  it('shows the selected bridge and USB-direct controllers', () => {
    const host = render(<ShellBridgeSelector {...baseProps} />);
    expect(host.querySelector('.custom-select-button')?.textContent).toContain('Pico 2 W');
    expect(host.querySelector('.bridge-direct-controller')?.textContent).toBe('DualSense · USB direct');
  });

  it('falls back to a clear empty state', () => {
    const host = render(<ShellBridgeSelector {...baseProps} bridges={[]} selectedPath="" selectedName={null} />);
    expect(host.querySelector('.custom-select-button')?.textContent).toContain('No bridge detected');
  });

  function openRename(host: HTMLElement) {
    openMenu(host);
    act(() => document.querySelector<HTMLButtonElement>('button[title="Rename bridge"]')!.click());
    return document.querySelector<HTMLFormElement>('[role="dialog"][aria-label="Rename bridge"]')!;
  }

  function typeName(input: HTMLInputElement, value: string) {
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('renames in a dialog, not in the picker, and trims the name', async () => {
    let finish!: () => void;
    const onRename = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const host = render(<ShellBridgeSelector {...baseProps} onRename={onRename} />);
    const dialog = openRename(host);
    // The picker keeps showing the bridge; the name is edited in the dialog.
    expect(host.querySelector('.custom-select-button')?.textContent).toContain('Pico 2 W');
    const input = dialog.querySelector<HTMLInputElement>('input')!;
    expect(input.value).toBe('Pico 2 W');
    typeName(input, '  Desk Pico  ');
    await act(async () => dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
    expect(onRename).toHaveBeenCalledWith('e6614c311b7d3a2f', 'Desk Pico');
    expect(dialog.querySelector('button[type="submit"]')?.textContent).toBe('Renaming...');
    await act(async () => finish());
    expect(document.querySelector('[aria-label="Rename bridge"]')).toBeNull();
  });

  it('needs a name, and Escape or Cancel close the dialog without renaming', () => {
    const onRename = vi.fn();
    const host = render(<ShellBridgeSelector {...baseProps} onRename={onRename} />);
    let dialog = openRename(host);
    typeName(dialog.querySelector<HTMLInputElement>('input')!, '   ');
    expect(dialog.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
    act(() => dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('[aria-label="Rename bridge"]')).toBeNull();

    dialog = openRename(host);
    act(() => dialog.querySelector<HTMLButtonElement>('button.secondary-action')!.click());
    expect(document.querySelector('[aria-label="Rename bridge"]')).toBeNull();
    expect(onRename).not.toHaveBeenCalled();
  });

  it('refreshes from the menu footer', async () => {
    const onRefresh = vi.fn(async () => undefined);
    const host = render(<ShellBridgeSelector {...baseProps} onRefresh={onRefresh} />);
    openMenu(host);
    await act(async () => document.querySelector<HTMLButtonElement>('button[title="Refresh bridges"]')!.click());
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});

describe('ShellNotifications', () => {
  const model: ShellNotificationsModel = {
    menuOpen: true,
    controllerEnabled: true,
    lowBatteryEnabled: false,
    controlsDisabled: false,
    focusTarget: 'low-battery'
  };

  it('keeps the menu mounted and toggles each notification', () => {
    const handlers = { onToggle: vi.fn(), onToggleController: vi.fn(), onToggleLowBattery: vi.fn(), onTest: vi.fn() };
    const host = render(<ShellNotifications notifications={model} {...handlers} />);
    const tool = host.querySelector('.notification-tool')!;
    expect(tool.classList.contains('armed')).toBe(true);
    expect(tool.getAttribute('aria-expanded')).toBe('true');
    const menu = host.querySelector('#shell-notifications')!;
    expect(menu.getAttribute('data-open')).toBe('true');
    const switches = [...menu.querySelectorAll<HTMLButtonElement>('[role="switch"]')];
    expect(switches.map((button) => button.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(switches[1]!.closest('.settings-menu-row')?.classList.contains('settings-menu-row-highlight')).toBe(true);
    act(() => switches[0]!.click());
    act(() => switches[1]!.click());
    act(() => menu.querySelector<HTMLButtonElement>('.notifications-actions button')!.click());
    expect(handlers.onToggleController).toHaveBeenCalledOnce();
    expect(handlers.onToggleLowBattery).toHaveBeenCalledOnce();
    expect(handlers.onTest).toHaveBeenCalledOnce();
    act(() => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(handlers.onToggle).toHaveBeenCalledOnce();
  });

  it('hides the closed menu from assistive technology', () => {
    const host = render(
      <ShellNotifications
        notifications={{ ...model, menuOpen: false, controllerEnabled: false, focusTarget: null }}
        onToggle={vi.fn()}
        onToggleController={vi.fn()}
        onToggleLowBattery={vi.fn()}
        onTest={vi.fn()}
      />
    );
    const menu = host.querySelector('#shell-notifications')!;
    expect(menu.getAttribute('aria-hidden')).toBe('true');
    expect(menu.hasAttribute('inert')).toBe(true);
    expect(host.querySelector('.notification-tool')?.classList.contains('armed')).toBe(false);
  });
});
