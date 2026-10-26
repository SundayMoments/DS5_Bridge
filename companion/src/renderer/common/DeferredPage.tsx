import { type ReactNode, useState } from 'react';

interface HeldPage {
  readonly children: ReactNode;
}

export function DeferredPage({ active, live = false, children }: {
  readonly active: boolean;
  /**
   * Keeps a hidden page receiving new props, for example while it shows a
   * portaled dialog driven by App-level state.
   */
  readonly live?: boolean;
  readonly children: ReactNode;
}) {
  const [visited, setVisited] = useState(active);
  // The element rendered when the page was deactivated. Returning the same
  // element lets React skip the hidden subtree while App keeps re-rendering.
  const [held, setHeld] = useState<HeldPage | null>(null);
  if (active || live) {
    if (active && !visited) setVisited(true);
    if (held !== null) setHeld(null);
    return active || visited ? children : null;
  }
  if (!visited) return null;
  // Keep visited pages mounted so their drafts, scroll positions, and cleanup
  // effects retain the same behavior when the user switches between tabs. The
  // first inactive render still reaches the page so it can observe `active`
  // becoming false; later renders reuse that element until reactivation.
  if (held === null) {
    setHeld({ children });
    return children;
  }
  return held.children;
}
