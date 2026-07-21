import {
  IconBluetooth,
  IconDots,
  IconPencil as Pencil,
  IconScan,
  IconTrash as Trash2,
  IconX as X
} from '@tabler/icons-react';
import controllerImage from '../../../assets/controllers/dualsense-edge-front.svg';
import type { DevicesModel } from './controller-devices';

export interface ControllerDeviceRenameDialog {
  key: string;
  title: string;
  value: string;
}

export type ControllerDeviceForgetDialog =
  | { kind: 'all' }
  | {
      kind: 'controller';
      key: string;
      title: string;
      bluetoothAddress: string;
    };

export interface ControllerDevicesPageProps {
  active: boolean;
  model: DevicesModel;
  openMenuKey: string | null;
  renameDialog: ControllerDeviceRenameDialog | null;
  forgetDialog: ControllerDeviceForgetDialog | null;
  pendingAction: string | null;
  actionError: string | null;
  onStartPairing(): void;
  onToggleMenu(key: string): void;
  onOpenRename(key: string): void;
  onUpdateRename(value: string): void;
  onCloseRename(): void;
  onConfirmRename(): void;
  onOpenForgetAll(): void;
  onOpenForgetOne(key: string): void;
  onCloseForget(): void;
  onConfirmForget(): void;
}

export function ControllerDevicesPage({
  active,
  model,
  openMenuKey,
  renameDialog,
  forgetDialog,
  pendingAction,
  actionError,
  onStartPairing,
  onToggleMenu,
  onOpenRename,
  onUpdateRename,
  onCloseRename,
  onConfirmRename,
  onOpenForgetAll,
  onOpenForgetOne,
  onCloseForget,
  onConfirmForget
}: ControllerDevicesPageProps) {
  const forgetting = pendingAction === 'controller-forget-all'
    || pendingAction === 'controller-forget-one';

  return (
    <>
      <div
        className={`control-page devices-page ${active ? 'active' : ''}`}
        role="tabpanel"
        id="control-panel-devices"
        aria-labelledby="control-tab-devices"
        aria-hidden={!active}
      >
        <div className="feature-heading devices-heading">
          <span className="feature-icon devices-heading-icon">
            <IconBluetooth size={24} />
          </span>
          <div className="devices-heading-copy">
            <h2>Devices</h2>
            <p>Current and last controllers.</p>
          </div>
          <span className={`health-label ${model.healthTone}`}>
            <span className={`dot ${model.healthTone === 'idle' ? '' : model.healthTone}`} />
            {model.healthLabel}
          </span>
        </div>

        <div className="devices-actions">
          <div className="devices-action-strip" aria-label="Controller pairing actions">
            <button
              className="primary-action"
              type="button"
              disabled={model.pairingAction.disabled}
              title={model.pairingAction.title}
              onClick={onStartPairing}
            >
              <IconScan size={16} />
              {model.pairingAction.label}
            </button>
            <button
              className="secondary-action devices-danger-action"
              type="button"
              disabled={model.forgetAllAction.disabled}
              title={model.forgetAllAction.title}
              onClick={onOpenForgetAll}
            >
              <Trash2 size={16} />
              {model.forgetAllAction.label}
            </button>
          </div>
          {actionError && !forgetDialog && (
            <div className="devices-action-error" role="alert">
              {actionError}
            </div>
          )}
        </div>

        <div className="trusted-device-scroll" aria-label="Controller devices">
          <div className="trusted-device-grid">
            {model.cards.length > 0 ? (
              model.cards.map((device) => (
                <section
                  key={device.key}
                  className={`trusted-device-card ${device.tone}`}
                  aria-label={device.title}
                >
                  <button
                    className="trusted-device-menu-button"
                    type="button"
                    title="Controller actions"
                    aria-label={`${device.title} actions`}
                    aria-haspopup="menu"
                    aria-expanded={openMenuKey === device.key}
                    onClick={() => onToggleMenu(device.key)}
                  >
                    <IconDots size={18} />
                  </button>
                  {openMenuKey === device.key && (
                    <div className="trusted-device-menu" role="menu" aria-label={`${device.title} actions`}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => onOpenRename(device.key)}
                      >
                        <Pencil size={15} />
                        Rename
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        className="danger"
                        disabled={device.forgetDisabled}
                        title={device.forgetTitle}
                        onClick={() => onOpenForgetOne(device.key)}
                      >
                        <Trash2 size={15} />
                        Delete
                      </button>
                    </div>
                  )}
                  <div className="trusted-device-copy">
                    <span className="trusted-device-slot">{device.label}</span>
                    <h3>{device.title}</h3>
                    <p>{device.status}</p>
                    <div className="trusted-device-meta-list">
                      {device.infoRows.map((row) => (
                        <div className="trusted-device-meta-row" key={row.id}>
                          <span>{row.label}</span>
                          <strong>{row.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="trusted-device-art" aria-hidden="true">
                    <img src={controllerImage} alt="" />
                  </div>
                </section>
              ))
            ) : (
              <div className="trusted-device-empty">
                <h3>No controller history</h3>
                <p>{model.emptyStatus}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {forgetDialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={onCloseForget}
        >
          <form
            className="settings-menu bridge-settings-modal controller-forget-modal"
            role="dialog"
            aria-modal="true"
            aria-label={forgetDialog.kind === 'all' ? 'Forget controllers' : 'Delete controller'}
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              onConfirmForget();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <Trash2 size={16} />
                <span>{forgetDialog.kind === 'all' ? 'Forget Controllers' : 'Delete Controller'}</span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close controller forget dialog"
                disabled={forgetting}
                onClick={onCloseForget}
              >
                <X size={16} />
              </button>
            </div>
            <div className="device-cleanup-copy">
              {forgetDialog.kind === 'all' ? (
                <>
                  <p>Forget every controller stored on the bridge?</p>
                  <p>The Pico will clear known controller pairings and return to pairing mode.</p>
                </>
              ) : (
                <>
                  <p>Delete {forgetDialog.title} from the Pico?</p>
                  <p>
                    This removes only this controller pairing from the bridge. The controller will
                    need to pair again before it can reconnect.
                  </p>
                </>
              )}
              {actionError && (
                <div className="device-cleanup-alert bad" role="alert">
                  {actionError}
                </div>
              )}
            </div>
            <div className="remap-profile-dialog-actions">
              <button
                type="button"
                className="secondary-action"
                disabled={forgetting}
                onClick={onCloseForget}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-action danger"
                disabled={pendingAction !== null || !model.bridgeConnected}
              >
                {forgetting
                  ? 'Forgetting...'
                  : forgetDialog.kind === 'all'
                    ? 'Forget Controllers'
                    : 'Delete Controller'}
              </button>
            </div>
          </form>
        </div>
      )}

      {renameDialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={onCloseRename}
        >
          <form
            className="settings-menu bridge-settings-modal controller-forget-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Rename controller"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              onConfirmRename();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <Pencil size={16} />
                <span>Rename Controller</span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close controller rename dialog"
                onClick={onCloseRename}
              >
                <X size={16} />
              </button>
            </div>
            <label className="remap-profile-name-field">
              Controller name
              <input
                type="text"
                value={renameDialog.value}
                maxLength={40}
                autoFocus
                onChange={(event) => onUpdateRename(event.currentTarget.value)}
              />
            </label>
            <div className="remap-profile-dialog-actions">
              <button
                type="button"
                className="secondary-action"
                onClick={onCloseRename}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-action"
                disabled={renameDialog.value.trim().length === 0}
              >
                Rename
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
