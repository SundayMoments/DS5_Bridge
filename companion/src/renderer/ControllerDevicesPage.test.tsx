import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DevicesModel } from './controller-devices';
import {
  ControllerDevicesPage,
  type ControllerDevicesPageProps
} from './ControllerDevicesPage';

function devicesModel(): DevicesModel {
  return {
    bridgeConnected: true,
    controllerConnected: true,
    healthLabel: 'Connected',
    healthTone: 'good',
    pairingActive: false,
    pairingAction: {
      label: 'Disconnect & Pair New',
      title: 'Disconnect the current controller and enter pairing mode',
      disabled: false,
      pending: false
    },
    forgetAllAction: {
      label: 'Forget Controllers',
      title: 'Forget stored controller pairings',
      disabled: false,
      pending: false
    },
    cards: [{
      key: 'AA:BB:CC:DD:EE:FF',
      controllerType: 'dualsense-edge',
      label: 'Current controller',
      title: 'Desk Edge',
      status: 'Connected',
      bluetoothAddress: 'AA:BB:CC:DD:EE:FF',
      infoRows: [
        { id: 'controller', label: 'Controller', value: 'DualSense Edge' },
        { id: 'address', label: 'Address', value: 'AA:BB:CC:DD:EE:FF' },
        { id: 'pairing', label: 'Pairing', value: 'Standard key' },
        { id: 'vendor-product', label: 'VID / PID', value: '0x054C / 0x0DF2' },
        { id: 'power', label: 'Power', value: '80%' }
      ],
      tone: 'connected',
      forgetDisabled: false,
      forgetTitle: 'Delete this controller from the Pico'
    }],
    emptyStatus: 'Connect a controller to save it here.'
  };
}

function render(overrides: Partial<ControllerDevicesPageProps> = {}): string {
  return renderToStaticMarkup(
    <ControllerDevicesPage
      active
      model={devicesModel()}
      openMenuKey={null}
      renameDialog={null}
      forgetDialog={null}
      pendingAction={null}
      actionError={null}
      onStartPairing={() => undefined}
      onToggleMenu={() => undefined}
      onOpenRename={() => undefined}
      onUpdateRename={() => undefined}
      onCloseRename={() => undefined}
      onConfirmRename={() => undefined}
      onOpenForgetAll={() => undefined}
      onOpenForgetOne={() => undefined}
      onCloseForget={() => undefined}
      onConfirmForget={() => undefined}
      {...overrides}
    />
  );
}

describe('ControllerDevicesPage', () => {
  it('renders live identity, cached metadata, and controller actions', () => {
    const html = render({ openMenuKey: 'AA:BB:CC:DD:EE:FF' });

    expect(html).toContain('id="control-panel-devices"');
    expect(html).toContain('Desk Edge');
    expect(html).toContain('Current controller');
    expect(html).toContain('AA:BB:CC:DD:EE:FF');
    expect(html).toContain('Standard key');
    expect(html).toContain('0x054C / 0x0DF2');
    expect(html).toContain('Disconnect &amp; Pair New');
    expect(html).toContain('trusted-device-menu');
    expect(html).toContain('Rename');
    expect(html).toContain('Delete');
  });

  it('renders targeted forget and local rename confirmation dialogs', () => {
    const forgetHtml = render({
      forgetDialog: {
        kind: 'controller',
        key: 'AA:BB:CC:DD:EE:FF',
        title: 'Desk Edge',
        bluetoothAddress: 'AA:BB:CC:DD:EE:FF'
      }
    });
    expect(forgetHtml).toContain('aria-label="Delete controller"');
    expect(forgetHtml).toContain('Delete Desk Edge from the Pico?');
    expect(forgetHtml).toContain('Delete Controller');

    const renameHtml = render({
      renameDialog: {
        key: 'AA:BB:CC:DD:EE:FF',
        title: 'Desk Edge',
        value: 'Living Room'
      }
    });
    expect(renameHtml).toContain('aria-label="Rename controller"');
    expect(renameHtml).toContain('value="Living Room"');
  });

  it('renders an explicit empty history state', () => {
    const html = render({
      model: {
        ...devicesModel(),
        controllerConnected: false,
        healthLabel: 'Waiting',
        healthTone: 'warn',
        cards: []
      }
    });

    expect(html).toContain('No controller history');
    expect(html).toContain('Connect a controller to save it here.');
  });
});
