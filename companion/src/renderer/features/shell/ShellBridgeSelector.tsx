import { useEffect, useRef, useState } from 'react';
import { IconPencil, IconRefresh, IconUsb } from '@tabler/icons-react';
import { CustomSelect } from '../../components/CustomSelect';

export interface ShellBridgeOption {
  readonly path: string;
  /** Menu label, including the active marker. */
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
  /** Saves a bridge name; an empty name restores the default label. */
  onRename(uniqueId: string, name: string | null): void;
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
  const [renameDraft, setRenameDraft] = useState<{ uniqueId: string; value: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const renameCancelledRef = useRef(false);
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

  return (
    <div className="sidebar-bridge-area">
      <div className="sidebar-bridge-selector" aria-label="Pico bridge selector">
        <span className="sidebar-bridge-type" aria-hidden="true">
          <IconUsb size={16} />
        </span>
        {renameDraft === null ? (
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
                    renameCancelledRef.current = false;
                    setRenameDraft({ uniqueId: selectedUniqueId, value: selectedName ?? '' });
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
        ) : (
          <input
            className="bridge-rename-input"
            type="text"
            autoFocus
            maxLength={32}
            aria-label="Bridge name"
            placeholder="Bridge name"
            value={renameDraft.value}
            onChange={(event) => setRenameDraft({ ...renameDraft, value: event.currentTarget.value })}
            onBlur={() => {
              const draft = renameDraft;
              setRenameDraft(null);
              if (renameCancelledRef.current) {
                renameCancelledRef.current = false;
                return;
              }
              onRename(draft.uniqueId, draft.value.trim() || null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              } else if (event.key === 'Escape') {
                renameCancelledRef.current = true;
                event.currentTarget.blur();
              }
            }}
          />
        )}
      </div>
      {directControllers.map((controller) => (
        <div key={controller.path} className="bridge-direct-controller" title={controller.path}>
          <IconUsb size={13} aria-hidden="true" />
          <span>{trimProductSuffix(controller.product)} · USB direct</span>
        </div>
      ))}
    </div>
  );
}
