import { useCallback, useEffect, useRef, useState } from 'react';
import type { BridgeSnapshot } from '@shared/types';
import { documentHidden } from '../common/use-document-visible';

/** A window drag that never reports mouseup still ends after this long. */
export const WINDOW_DRAG_RELEASE_MS = 1600;

/**
 * Feeds bridge snapshots to `applySnapshot`. The bridge service sends one on
 * every status poll; while the window is dragged, hidden, or minimized only the
 * newest is kept and rendered once the window is back. The first getStatus()
 * reply is ignored if a live snapshot already arrived, so it cannot roll the
 * app back to older state.
 */
export function useBridgeSnapshots(applySnapshot: (next: BridgeSnapshot) => void) {
  const [windowDragging, setWindowDragging] = useState(false);
  const applySnapshotRef = useRef(applySnapshot);
  applySnapshotRef.current = applySnapshot;
  const windowDraggingRef = useRef(false);
  const deferredSnapshotRef = useRef<BridgeSnapshot | null>(null);
  const dragReleaseTimerRef = useRef<number | null>(null);

  const applyDeferredSnapshot = useCallback(() => {
    const deferred = deferredSnapshotRef.current;
    deferredSnapshotRef.current = null;
    if (deferred) {
      applySnapshotRef.current(deferred);
    }
  }, []);

  const finishWindowDrag = useCallback(() => {
    windowDraggingRef.current = false;
    setWindowDragging(false);
    if (dragReleaseTimerRef.current !== null) {
      window.clearTimeout(dragReleaseTimerRef.current);
      dragReleaseTimerRef.current = null;
    }
    applyDeferredSnapshot();
  }, [applyDeferredSnapshot]);

  const beginWindowDrag = useCallback(() => {
    windowDraggingRef.current = true;
    setWindowDragging(true);
    if (dragReleaseTimerRef.current !== null) {
      window.clearTimeout(dragReleaseTimerRef.current);
    }
    dragReleaseTimerRef.current = window.setTimeout(finishWindowDrag, WINDOW_DRAG_RELEASE_MS);
    window.addEventListener('mouseup', finishWindowDrag, { once: true });
    window.addEventListener('blur', finishWindowDrag, { once: true });
  }, [finishWindowDrag]);

  useEffect(() => {
    let cancelled = false;
    let receivedLiveSnapshot = false;
    const receiveSnapshot = (next: BridgeSnapshot) => {
      if (windowDraggingRef.current || documentHidden()) {
        deferredSnapshotRef.current = next;
        return;
      }
      applySnapshotRef.current(next);
    };
    const applyDeferredSnapshotWhenShown = () => {
      if (documentHidden() || windowDraggingRef.current) return;
      applyDeferredSnapshot();
    };
    void window.bridge.getStatus().then((next) => {
      if (!cancelled && !receivedLiveSnapshot) {
        receiveSnapshot(next);
      }
    });
    const unsubscribe = window.bridge.onSnapshot((next) => {
      receivedLiveSnapshot = true;
      receiveSnapshot(next);
    });
    document.addEventListener('visibilitychange', applyDeferredSnapshotWhenShown);
    return () => {
      cancelled = true;
      unsubscribe();
      document.removeEventListener('visibilitychange', applyDeferredSnapshotWhenShown);
      if (dragReleaseTimerRef.current !== null) {
        window.clearTimeout(dragReleaseTimerRef.current);
      }
      window.removeEventListener('mouseup', finishWindowDrag);
      window.removeEventListener('blur', finishWindowDrag);
    };
  }, [applyDeferredSnapshot, finishWindowDrag]);

  return { windowDragging, beginWindowDrag };
}
