import { useRef, type Ref } from 'react';
import { IconBell, IconX } from '@tabler/icons-react';

export type ShellNotificationFocusTarget = 'controller-status' | 'low-battery' | 'all';

export interface ShellNotificationsModel {
  readonly menuOpen: boolean;
  readonly controllerEnabled: boolean;
  readonly lowBatteryEnabled: boolean;
  readonly controlsDisabled: boolean;
  /** Briefly highlights a row when another page links to it. */
  readonly focusTarget: ShellNotificationFocusTarget | null;
}

export function ShellNotifications({
  notifications,
  rootRef,
  onToggle,
  onToggleController,
  onToggleLowBattery,
  onTest
}: {
  readonly notifications: ShellNotificationsModel;
  readonly rootRef?: Ref<HTMLDivElement>;
  readonly onToggle: () => void;
  readonly onToggleController: () => void;
  readonly onToggleLowBattery: () => void;
  readonly onTest: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const enabled = notifications.controllerEnabled || notifications.lowBatteryEnabled;
  const highlighted = (target: Exclude<ShellNotificationFocusTarget, 'all'>) => (
    notifications.focusTarget === target || notifications.focusTarget === 'all'
  );

  function close(): void {
    triggerRef.current?.focus({ preventScroll: true });
    onToggle();
  }

  return (
    <div className="notifications-control" ref={rootRef}>
      <button
        ref={triggerRef}
        className={`topbar-tool notification-tool ${notifications.menuOpen ? 'active' : ''} ${enabled ? 'armed' : ''}`}
        type="button"
        aria-label="Notifications"
        aria-haspopup="dialog"
        aria-expanded={notifications.menuOpen}
        aria-controls="shell-notifications"
        onClick={onToggle}
      >
        <IconBell size={18} />
      </button>
      <div
        id="shell-notifications"
        className="settings-menu notifications-menu"
        role="dialog"
        aria-label="Notifications"
        aria-hidden={!notifications.menuOpen}
        inert={!notifications.menuOpen}
        data-open={notifications.menuOpen}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        <div className="settings-menu-heading">
          <span>Notifications</span>
          <button className="notifications-close" type="button" aria-label="Close" onClick={close}>
            <IconX size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="notifications-options">
          <div className={`settings-menu-row${highlighted('controller-status') ? ' settings-menu-row-highlight' : ''}`}>
            <div>
              <strong id="notification-controller-label">Controller Status</strong>
              <span id="notification-controller-description">Notify when the controller connects or disconnects</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-labelledby="notification-controller-label"
              aria-describedby="notification-controller-description"
              aria-checked={notifications.controllerEnabled}
              className={`switch ${notifications.controllerEnabled ? 'on' : ''}`}
              disabled={notifications.controlsDisabled}
              onClick={onToggleController}
            >
              <span />
            </button>
          </div>
          <div className={`settings-menu-row${highlighted('low-battery') ? ' settings-menu-row-highlight' : ''}`}>
            <div>
              <strong id="notification-battery-label">Low Battery</strong>
              <span id="notification-battery-description">Notify when the battery reaches 20% or below</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-labelledby="notification-battery-label"
              aria-describedby="notification-battery-description"
              aria-checked={notifications.lowBatteryEnabled}
              className={`switch ${notifications.lowBatteryEnabled ? 'on' : ''}`}
              disabled={notifications.controlsDisabled}
              onClick={onToggleLowBattery}
            >
              <span />
            </button>
          </div>
        </div>
        <div className="notifications-actions">
          <button
            className="secondary-action"
            type="button"
            disabled={notifications.controlsDisabled}
            onClick={onTest}
          >
            Send Test Notification
          </button>
        </div>
      </div>
    </div>
  );
}
