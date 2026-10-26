import { useEffect, useRef, useState } from 'react';
import { normalizeRadialDeadzonePercent } from '@shared/protocol';
import type { BridgeSnapshot } from '@shared/types';
import type { AppRuntime } from '../../composition/app-runtime';

export type StickSide = 'left' | 'right';

export interface StickDeadzonesController {
  readonly values: Readonly<Record<StickSide, number>>;
  readonly commitPending: boolean;
  /** Shows a dragged value before it is committed. */
  preview(side: StickSide, value: number): void;
  commit(side: StickSide, value: number): Promise<void>;
  /** Adopts snapshot values for sliders that are not being dragged. */
  syncSnapshot(next: BridgeSnapshot): void;
}

/**
 * Radial deadzones for both sticks. While the page is open the bridge streams
 * raw stick positions for the live preview.
 */
export function useStickDeadzonesController(runtime: AppRuntime, active: boolean): StickDeadzonesController {
  const { snapshot, setSnapshot } = runtime;
  const [leftValue, setLeftValue] = useState(0);
  const [rightValue, setRightValue] = useState(0);
  const [commitPending, setCommitPending] = useState(false);
  const editingRef = useRef({ left: false, right: false });

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    void window.bridge.requestStickInputPreview();
    const heartbeat = window.setInterval(() => {
      void window.bridge.requestStickInputPreview();
    }, 1000);
    return () => {
      window.clearInterval(heartbeat);
      void window.bridge.releaseStickInputPreview();
    };
  }, [active]);

  function syncSnapshot(next: BridgeSnapshot) {
    if (!editingRef.current.left) {
      setLeftValue(next.settings.leftStickRadialDeadzonePercent);
    }
    if (!editingRef.current.right) {
      setRightValue(next.settings.rightStickRadialDeadzonePercent);
    }
  }

  function preview(side: StickSide, value: number) {
    editingRef.current[side] = true;
    (side === 'left' ? setLeftValue : setRightValue)(normalizeRadialDeadzonePercent(value));
  }

  async function commit(side: StickSide, value: number) {
    const percent = normalizeRadialDeadzonePercent(value);
    const leftPercent = side === 'left' ? percent : leftValue;
    const rightPercent = side === 'right' ? percent : rightValue;
    editingRef.current[side] = true;
    if (
      !snapshot
      || snapshot.state !== 'connected'
      || commitPending
      || (
        leftPercent === snapshot.settings.leftStickRadialDeadzonePercent
        && rightPercent === snapshot.settings.rightStickRadialDeadzonePercent
      )
    ) {
      editingRef.current[side] = false;
      return;
    }

    setCommitPending(true);
    try {
      const next = await window.bridge.setRadialDeadzones(leftPercent, rightPercent);
      setSnapshot(next);
      setLeftValue(next.settings.leftStickRadialDeadzonePercent);
      setRightValue(next.settings.rightStickRadialDeadzonePercent);
    } catch {
      const next = await window.bridge.getStatus();
      setSnapshot(next);
      setLeftValue(next.settings.leftStickRadialDeadzonePercent);
      setRightValue(next.settings.rightStickRadialDeadzonePercent);
    } finally {
      setCommitPending(false);
      editingRef.current.left = false;
      editingRef.current.right = false;
    }
  }

  return {
    values: { left: leftValue, right: rightValue },
    commitPending,
    preview,
    commit,
    syncSnapshot
  };
}
