import { useEffect, useMemo, useState } from 'react';
import type { AppRuntime } from '../../composition/app-runtime';
import {
  buildDevicesModel,
  controllerDeviceCachesEqual,
  loadControllerDeviceCache,
  observeControllerDevice,
  renameControllerDevice,
  saveControllerDeviceCache,
  type CachedControllerDevice,
  type DevicesModel
} from './controller-devices';
import type { ControllerDeviceForgetDialog, ControllerDeviceRenameDialog } from './ControllerDevicesPage';

export interface DevicesController {
  readonly model: DevicesModel;
  readonly openMenuKey: string | null;
  readonly renameDialog: ControllerDeviceRenameDialog | null;
  readonly forgetDialog: ControllerDeviceForgetDialog | null;
  readonly actionError: string | null;
  startPairing(): Promise<void>;
  toggleMenu(key: string): void;
  closeMenu(): void;
  openRename(key: string): void;
  updateRename(value: string): void;
  closeRename(): void;
  confirmRename(): void;
  openForgetAll(): void;
  openForgetOne(key: string): void;
  closeForget(): void;
  confirmForget(): Promise<void>;
}

/**
 * Current and remembered controllers. Names and last-seen details are cached
 * in local storage; pairing and forgetting go through the bridge.
 */
export function useDevicesController(runtime: AppRuntime): DevicesController {
  const { snapshot, connected, pendingAction, setPendingAction, applySnapshot } = runtime;
  const [controllerDevices, setControllerDevices] = useState<CachedControllerDevice[]>(
    () => loadControllerDeviceCache(window.localStorage)
  );
  const [openMenuKey, setOpenMenuKey] = useState<string | null>(null);
  const [renameDialog, setRenameDialog] = useState<ControllerDeviceRenameDialog | null>(null);
  const [forgetDialog, setForgetDialog] = useState<ControllerDeviceForgetDialog | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const model = useMemo(() => buildDevicesModel({
    bridgeConnected: connected,
    status: snapshot?.status ?? null,
    identity: snapshot?.diagnostics.deviceIdentity ?? null,
    cachedDevices: controllerDevices,
    pendingAction
  }), [
    connected,
    controllerDevices,
    pendingAction,
    snapshot?.diagnostics.deviceIdentity,
    snapshot?.status
  ]);

  useEffect(() => {
    const status = snapshot?.status;
    if (!snapshot || !connected || !status?.controllerConnected) {
      return;
    }
    const identity = snapshot.diagnostics.deviceIdentity;
    setControllerDevices((current) => {
      const next = observeControllerDevice(
        current,
        status,
        identity
      );
      if (controllerDeviceCachesEqual(current, next)) {
        return current;
      }
      saveControllerDeviceCache(window.localStorage, next);
      return next;
    });
  }, [
    connected,
    snapshot?.diagnostics.deviceIdentity?.addressKnown,
    snapshot?.diagnostics.deviceIdentity?.bluetoothAddress,
    snapshot?.diagnostics.deviceIdentity?.controllerName,
    snapshot?.diagnostics.deviceIdentity?.linkKeyKnown,
    snapshot?.diagnostics.deviceIdentity?.productId,
    snapshot?.diagnostics.deviceIdentity?.vendorId,
    snapshot?.status?.batteryPercent,
    snapshot?.status?.controllerConnected,
    snapshot?.status?.controllerType
  ]);

  useEffect(() => {
    if (!openMenuKey) {
      return undefined;
    }
    const closeMenu = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element
        && target.closest('.trusted-device-menu, .trusted-device-menu-button')) {
        return;
      }
      setOpenMenuKey(null);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
  }, [openMenuKey]);

  async function refreshSnapshotAfterError() {
    try {
      applySnapshot(await window.bridge.getStatus());
    } catch {
      // Preserve the last usable snapshot when the bridge is no longer reachable.
    }
  }

  async function startPairing() {
    if (model.pairingAction.disabled || pendingAction !== null) {
      return;
    }
    setOpenMenuKey(null);
    setActionError(null);
    setPendingAction('controller-pairing');
    try {
      applySnapshot(await window.bridge.requestControllerScan());
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Controller pairing could not start.'
      );
      await refreshSnapshotAfterError();
    } finally {
      setPendingAction(null);
    }
  }

  function toggleMenu(key: string) {
    setOpenMenuKey((current) => current === key ? null : key);
  }

  function openRename(key: string) {
    const device = model.cards.find((candidate) => candidate.key === key);
    if (!device) {
      return;
    }
    setOpenMenuKey(null);
    setActionError(null);
    setRenameDialog({
      key,
      title: device.title,
      value: device.title
    });
  }

  function confirmRename() {
    const request = renameDialog;
    const nextName = request?.value.trim() ?? '';
    if (!request || !nextName) {
      return;
    }
    let baseDevices = controllerDevices;
    if (
      !baseDevices.some((device) => device.key === request.key)
      && connected
      && snapshot?.status?.controllerConnected
    ) {
      baseDevices = observeControllerDevice(
        baseDevices,
        snapshot.status,
        snapshot.diagnostics.deviceIdentity
      );
    }
    const nextDevices = renameControllerDevice(baseDevices, request.key, nextName);
    setControllerDevices(nextDevices);
    if (!saveControllerDeviceCache(window.localStorage, nextDevices)) {
      setActionError('The controller name could not be saved to local storage.');
    }
    setRenameDialog(null);
  }

  function openForgetAll() {
    if (model.forgetAllAction.disabled) {
      return;
    }
    setOpenMenuKey(null);
    setActionError(null);
    setForgetDialog({ kind: 'all' });
  }

  function openForgetOne(key: string) {
    const device = model.cards.find((candidate) => candidate.key === key);
    if (!device?.bluetoothAddress || device.forgetDisabled) {
      return;
    }
    setOpenMenuKey(null);
    setActionError(null);
    setForgetDialog({
      kind: 'controller',
      key,
      title: device.title,
      bluetoothAddress: device.bluetoothAddress
    });
  }

  function closeForget() {
    if (
      pendingAction === 'controller-forget-all'
      || pendingAction === 'controller-forget-one'
    ) {
      return;
    }
    setForgetDialog(null);
    setActionError(null);
  }

  async function confirmForget() {
    const request = forgetDialog;
    if (!request || !connected || pendingAction !== null) {
      return;
    }
    const actionLabel = request.kind === 'all'
      ? 'controller-forget-all'
      : 'controller-forget-one';
    setActionError(null);
    setPendingAction(actionLabel);
    try {
      const nextSnapshot = request.kind === 'all'
        ? await window.bridge.forgetControllerPairings()
        : await window.bridge.forgetControllerPairing(request.bluetoothAddress);
      applySnapshot(nextSnapshot);
      setControllerDevices((current) => {
        const nextDevices = request.kind === 'all'
          ? []
          : current.filter((device) => device.key !== request.key);
        saveControllerDeviceCache(window.localStorage, nextDevices);
        return nextDevices;
      });
      setForgetDialog(null);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'The controller pairing could not be forgotten.'
      );
      await refreshSnapshotAfterError();
    } finally {
      setPendingAction(null);
    }
  }

  return {
    model,
    openMenuKey,
    renameDialog,
    forgetDialog,
    actionError,
    startPairing,
    toggleMenu,
    closeMenu: () => setOpenMenuKey(null),
    openRename,
    updateRename: (value) => setRenameDialog((current) => (current ? { ...current, value } : null)),
    closeRename: () => {
      setRenameDialog(null);
      setActionError(null);
    },
    confirmRename,
    openForgetAll,
    openForgetOne,
    closeForget,
    confirmForget
  };
}
