import type { BridgeSnapshot } from '@shared/types';

/**
 * The bridge state and command helpers every feature controller shares.
 * App owns the values; controllers receive them each render.
 */
export interface AppRuntime {
  readonly snapshot: BridgeSnapshot | null;
  /** The bridge reports `connected`. */
  readonly connected: boolean;
  readonly controllerConnected: boolean;
  /** Bridge and controller are both connected. */
  readonly controllerControlsAvailable: boolean;
  /** The label of the command in flight, if any. Most controls lock while one runs. */
  readonly pendingAction: string | null;
  setSnapshot(next: BridgeSnapshot): void;
  setPendingAction(label: string | null): void;
  /** Runs a labelled command that locks other commands until it settles. */
  runAction(label: string, action: () => Promise<BridgeSnapshot>): Promise<void>;
  /** Runs a command without taking the command lock. */
  runQuietAction(action: () => Promise<BridgeSnapshot>): Promise<void>;
}
