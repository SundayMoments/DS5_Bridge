import type { CompanionSettings } from '../shared/types';

/**
 * Orders bridges as Kitsune Input does: by when this app first recorded each
 * one (bridgeIdentities keeps insertion order, and records are updated in
 * place), so the picker and the default "Bridge N" names stay stable across
 * reconnects. Bridges not recorded yet follow, by container ID, then path.
 */
export function orderBridgesByIdentity<T extends { readonly path: string; readonly containerId: string | null }>(
  bridges: readonly T[],
  identities: CompanionSettings['bridgeIdentities'],
  uniqueIdFor: (bridge: T) => string | null
): T[] {
  const identityOrder = new Map(Object.keys(identities).map((uniqueId, index) => [uniqueId, index]));
  const orderOf = (bridge: T) => {
    const uniqueId = uniqueIdFor(bridge);
    return uniqueId ? identityOrder.get(uniqueId) : undefined;
  };
  return [...bridges].sort((left, right) => {
    const leftOrder = orderOf(left);
    const rightOrder = orderOf(right);
    if (leftOrder !== undefined || rightOrder !== undefined) {
      if (leftOrder === undefined) return 1;
      if (rightOrder === undefined) return -1;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    }
    const leftKey = left.containerId ?? left.path.toLowerCase();
    const rightKey = right.containerId ?? right.path.toLowerCase();
    return leftKey.localeCompare(rightKey);
  });
}
