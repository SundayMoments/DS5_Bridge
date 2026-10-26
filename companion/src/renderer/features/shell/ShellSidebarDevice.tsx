import { IconBolt } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import './shell-sidebar.css';

export type ShellTone = 'good' | 'warn' | 'bad' | 'idle';

export interface ShellDevicePresentation {
  readonly title: string;
  readonly status: string;
  readonly tone: ShellTone;
  readonly batteryLabel: string;
  /** Shown beside the battery when the controller is charging or on external power. */
  readonly powerLabel: string | null;
  readonly controllerArt: string;
}

export function ShellSidebarDevice({ device, bridgeSelector, onOpenDevices }: {
  readonly device: ShellDevicePresentation;
  readonly bridgeSelector?: ReactNode;
  readonly onOpenDevices?: () => void;
}) {
  const devicesAvailable = Boolean(onOpenDevices);
  const openDevices = () => onOpenDevices?.();

  return (
    <div className="sidebar-device-controls">
      <div
        className={`hero-main device-status-${device.tone}`}
        role={devicesAvailable ? 'button' : undefined}
        tabIndex={devicesAvailable ? 0 : undefined}
        aria-label={devicesAvailable ? 'Open Devices' : undefined}
        onClick={openDevices}
        onKeyDown={(event) => {
          if (!devicesAvailable || (event.key !== 'Enter' && event.key !== ' ')) return;
          event.preventDefault();
          openDevices();
        }}
      >
        <div className="status-copy">
          <div className="connection-row">
            <strong title={device.title}>{device.title}</strong>
          </div>
          <div className="device-meta-row">
            <div className="bridge-state compact-device-status"><span>{device.status}</span></div>
            <div className="device-battery-meta">
              <span className="device-meta-separator" aria-hidden="true">·</span>
              <span className="device-battery-percentage">{device.batteryLabel}</span>
              {device.powerLabel && (
                <span className="device-power-indicator" title={device.powerLabel} aria-label={device.powerLabel}>
                  <IconBolt size={13} stroke={2} aria-hidden="true" />
                </span>
              )}
            </div>
          </div>
        </div>
        <img className="controller-art" src={device.controllerArt} alt="" />
      </div>
      {bridgeSelector}
    </div>
  );
}
