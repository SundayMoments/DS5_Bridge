import { useRef, useState } from 'react';

/**
 * Owns the app-wide pending action, ported from Kitsune Input. The ref takes
 * the lock synchronously, so two actions started in one tick cannot both pass
 * a pending state that has not rendered yet. Pages that set their own label
 * through `setPendingAction` keep it: ending an action clears only its own.
 */
export function useAppActionLock(hasSnapshot: boolean) {
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const lockRef = useRef<string | null>(null);

  function beginAppAction(label: string): boolean {
    if (!hasSnapshot || pendingAction !== null || lockRef.current !== null) return false;
    lockRef.current = label;
    setPendingAction(label);
    return true;
  }

  function endAppAction(label: string): void {
    if (lockRef.current === label) lockRef.current = null;
    setPendingAction((current) => current === label ? null : current);
  }

  return { pendingAction, setPendingAction, beginAppAction, endAppAction };
}
