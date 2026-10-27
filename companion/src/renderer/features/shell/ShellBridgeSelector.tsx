import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconPencil, IconRefresh, IconUsb, IconX } from '@tabler/icons-react';
import { CustomSelect } from '../../components/CustomSelect';

export interface ShellBridgeOption {
  readonly path: string;
  /** The bridge's name, or its default "Bridge N". */
  readonly label: string;
}

export interface ShellDirectController {
  readonly path: string;
  readonly product: string | null;
}

export interface ShellBridgeSelectorProps {
  readonly bridges: readonly ShellBridgeOption[];
  readonly selectedPath: string;
  readonly selectedName: string | null;
  readonly selectedUniqueId: string | null;
  readonly directControllers: readonly ShellDirectController[];
  readonly busy: boolean;
  /** Shown when no bridge is selected; defaults to "No bridge detected". */
  readonly emptyLabel?: string;
  onSelect(devicePath: string): void;
  onRefresh(): void | Promise<unknown>;
  /** Saves a bridge name; the dialog stays open until it settles. */
  onRename(uniqueId: string, name: string): void | Promise<unknown>;
}

/** HID product names are hardware identifiers, so they stay out of the catalog. */
function trimProductSuffix(product: string | null): string {
  return (product ?? 'DualSense').replace(' Wireless Controller', '');
}

export function ShellBridgeSelector({
  bridges,
  selectedPath,
  selectedName,
  selectedUniqueId,
  directControllers,
  busy,
  emptyLabel = 'No bridge detected',
  onSelect,
  onRefresh,
  onRename
}: ShellBridgeSelectorProps) {
  const [renameDialog, setRenameDialog] = useState<{ uniqueId: string; value: string } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshPendingRef = useRef(false);
  const refreshIconRef = useRef<SVGSVGElement>(null);
  const refreshAnimationRef = useRef<Animation | null>(null);
  const pending = busy || refreshing;

  useEffect(() => () => refreshAnimationRef.current?.cancel(), []);

  async function refresh() {
    if (busy || refreshPendingRef.current) return;
    refreshPendingRef.current = true;
    setRefreshing(true);
    refreshAnimationRef.current?.cancel();
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      refreshAnimationRef.current = refreshIconRef.current?.animate?.(
        [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-360deg)' }],
        { duration: 480, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      ) ?? null;
    }
    try {
      await onRefresh();
    } finally {
      refreshPendingRef.current = false;
      setRefreshing(false);
    }
  }

  function closeRename() {
    if (!renaming) setRenameDialog(null);
  }

  async function confirmRename() {
    const request = renameDialog;
    const name = request?.value.trim() ?? '';
    if (!request || !name || renaming) return;
    setRenaming(true);
    try {
      await onRename(request.uniqueId, name);
    } finally {
      setRenaming(false);
      setRenameDialog(null);
    }
  }

  return (
    <div className="sidebar-bridge-area">
      <div className="sidebar-bridge-selector" aria-label="Pico bridge selector">
        <span className="sidebar-bridge-type" aria-hidden="true">
          <IconUsb size={16} />
        </span>
        <CustomSelect
          value={selectedPath}
          options={bridges.map(({ label, path }) => [label, path])}
          disabled={busy && !refreshing}
          ariaLabel="Pico bridge"
          className={`sidebar-bridge-select${pending ? ' bridge-pending' : ''}`}
          floatingMenu
          floatingMenuFitContent={false}
          isOptionDisabled={() => pending}
          onChange={(path) => {
            if (path) onSelect(String(path));
          }}
          renderValue={(label) => selectedName ?? (label || emptyLabel)}
          renderMenuFooter={(closeMenu) => (
            <div className="sidebar-bridge-menu-actions">
              <button
                type="button"
                title="Rename bridge"
                aria-disabled={pending || undefined}
                disabled={!selectedUniqueId}
                onClick={() => {
                  if (pending || !selectedUniqueId) return;
                  closeMenu();
                  setRenameDialog({ uniqueId: selectedUniqueId, value: selectedName ?? '' });
                }}
              >
                <IconPencil size={15} aria-hidden="true" />
                <span>Rename</span>
              </button>
              <button
                type="button"
                title="Refresh bridges"
                aria-disabled={pending || undefined}
                aria-busy={refreshing}
                onClick={() => void refresh()}
              >
                <IconRefresh ref={refreshIconRef} size={15} aria-hidden="true" />
                <span>Refresh</span>
              </button>
            </div>
          )}
        />
      </div>
      {directControllers.map((controller) => (
        <div key={controller.path} className="bridge-direct-controller" title={controller.path}>
          <IconUsb size={13} aria-hidden="true" />
          <span>{trimProductSuffix(controller.product)} · USB direct</span>
        </div>
      ))}
      {/* Portaled into the shell so the sidebar never clips or offsets the dialog. */}
      {renameDialog && createPortal(
        <div className="modal-backdrop" role="presentation" onMouseDown={closeRename}>
          <form
            className="settings-menu bridge-settings-modal controller-forget-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Rename bridge"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeRename();
              }
            }}
            onSubmit={(event) => {
              event.preventDefault();
              void confirmRename();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                <IconPencil size={16} />
                <span>Rename Bridge</span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close bridge rename dialog"
                disabled={renaming}
                onClick={closeRename}
              >
                <IconX size={16} />
              </button>
            </div>
            <label className="remap-profile-name-field">
              Bridge name
              <input
                type="text"
                value={renameDialog.value}
                maxLength={32}
                autoFocus
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setRenameDialog((current) => current ? { ...current, value } : null);
                }}
              />
            </label>
            <div className="remap-profile-dialog-actions">
              <button type="button" className="secondary-action" disabled={renaming} onClick={closeRename}>
                Cancel
              </button>
              <button
                type="submit"
                className="primary-action"
                disabled={renaming || renameDialog.value.trim().length === 0}
              >
                {renaming ? 'Renaming...' : 'Rename'}
              </button>
            </div>
          </form>
        </div>,
        document.querySelector('.shell') ?? document.body
      )}
    </div>
  );
}
