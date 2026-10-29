import type { BridgeSnapshot } from '@shared/types';
import { batteryLabel, controllerName, isChargingPowerState, isExternalPowerState } from '../../common/controller-status';
import type { ShellBridgeSelectorProps } from './ShellBridgeSelector';
import type { ShellDevicePresentation } from './ShellSidebarDevice';

/** The Devices card the sidebar mirrors: the current controller, else the first saved one. */
interface SidebarControllerCard {
  readonly label: string;
  readonly title: string;
}

const NO_VALUE = '—';

/**
 * The sidebar device card. The card's border carries the tone instead of a
 * status dot: green connected, amber waiting or switching, red on a bridge error.
 */
export function sidebarDevicePresentation(
  snapshot: BridgeSnapshot,
  cards: readonly SidebarControllerCard[],
  controllerArt: string
): ShellDevicePresentation {
  const switching = Boolean(snapshot.personaTransition);
  const connected = snapshot.state === 'connected';
  const controllerConnected = connected && Boolean(snapshot.status?.controllerConnected);
  const card = cards.find((device) => device.label === 'Current controller') ?? cards[0] ?? null;
  const charging = isChargingPowerState(snapshot.status?.rawPowerState);
  const externalPower = isExternalPowerState(snapshot.status?.rawPowerState);
  return {
    title: switching
      ? 'Switching Mode'
      : card?.title ?? (controllerConnected ? controllerName(snapshot.status?.controllerType) : 'Controller'),
    status: switching ? 'Switching' : controllerConnected ? 'Connected' : 'Disconnected',
    tone: switching
      ? 'warn'
      : controllerConnected
        ? 'good'
        : connected
          ? 'warn'
          : snapshot.state === 'error' || snapshot.state === 'incompatible'
            ? 'bad'
            : 'idle',
    batteryLabel: !switching && controllerConnected ? batteryLabel(snapshot) : NO_VALUE,
    powerLabel: externalPower ? charging ? 'Charging' : 'Connected to power' : null,
    controllerArt
  };
}

/**
 * The bridge picker under the device card: every bridge in the bridge
 * service's rank order, the selected one, and USB-direct controllers. As in
 * Kitsune Input, a list with no selected bridge asks for one instead of naming
 * a bridge that is not in use.
 */
export function bridgeSelectorModel(
  snapshot: BridgeSnapshot
): Pick<ShellBridgeSelectorProps,
  'bridges' | 'selectedPath' | 'selectedName' | 'selectedUniqueId' | 'directControllers' | 'emptyLabel'> {
  const bridges = snapshot.bridgeDevices?.bridges ?? [];
  const selected = bridges.find((bridge) => bridge.selected)
    ?? bridges.find((bridge) => bridge.connected)
    ?? null;
  return {
    emptyLabel: bridges.length > 0 ? 'Select bridge' : 'No bridge detected',
    bridges: bridges.map((bridge, index) => ({
      label: bridge.name ?? `Bridge ${index + 1}`,
      path: bridge.path
    })),
    selectedPath: selected?.path ?? '',
    selectedName: selected?.name ?? null,
    selectedUniqueId: selected?.uniqueId ?? null,
    directControllers: snapshot.bridgeDevices?.directControllers ?? []
  };
}
