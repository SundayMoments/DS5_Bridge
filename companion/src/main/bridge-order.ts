import type { BridgeDeviceInfo, BridgeIdentityRecord, CompanionSettings } from '../shared/types';

// Ranks and names the bridge list the way Kitsune Input's bridge device
// registry does. A bridge reattaches on a new path, with a new Windows
// container, whenever a controller connects or disconnects (bridge-only
// without one, the controller persona with one), so an identity remembers
// every container its bridge has used.

type BridgeIdentities = CompanionSettings['bridgeIdentities'];

export function sameBridgePath(left: string | null | undefined, right: string | null | undefined): boolean {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

/** The bridge-only receiver a bridge attaches as while no controller is connected. */
export function isBridgeOnlyPath(path: string | null | undefined): boolean {
  return Boolean(path && /vid_1209.*pid_db08/i.test(path));
}

/** Every container this bridge has been seen on, its latest controller-persona one first. */
export function bridgeIdentityContainers(identity: BridgeIdentityRecord | undefined): string[] {
  if (!identity) return [];
  return Array.from(new Set([identity.containerId, ...(identity.containerIds ?? [])]
    .filter((containerId): containerId is string => Boolean(containerId))
    .map((containerId) => containerId.toLowerCase())));
}

/**
 * The bridge whose identity alone records this container. A compatibility
 * persona can give different bridges the same container, so a container two
 * identities share names neither.
 */
export function uniqueIdForContainer(containerId: string | null, identities: BridgeIdentities): string | null {
  if (!containerId) return null;
  const key = containerId.toLowerCase();
  const matches = Object.entries(identities)
    .filter(([, identity]) => bridgeIdentityContainers(identity).includes(key));
  return matches.length === 1 ? matches[0]![0] : null;
}

/**
 * Records that the connected bridge `uniqueId` is on `containerId`, which
 * every other identity gives up. A controller-persona container becomes the
 * bridge's latest one; a bridge-only container is only remembered. Returns
 * null when nothing changes.
 */
export function claimBridgeContainer(
  identities: BridgeIdentities,
  uniqueId: string,
  containerId: string,
  bridgeOnly: boolean
): BridgeIdentities | null {
  const key = containerId.toLowerCase();
  const existing = identities[uniqueId];
  const primary = bridgeOnly ? existing?.containerId ?? null : key;
  const containers = Array.from(new Set([...bridgeIdentityContainers(existing), key]));
  let changed = !existing
    || existing.containerId !== primary
    || containers.length !== bridgeIdentityContainers(existing).length;
  const updated: BridgeIdentities = {};
  for (const [candidateId, identity] of Object.entries(identities)) {
    if (candidateId === uniqueId) continue;
    const remaining = bridgeIdentityContainers(identity).filter((candidate) => candidate !== key);
    if (remaining.length === bridgeIdentityContainers(identity).length) {
      updated[candidateId] = identity;
      continue;
    }
    changed = true;
    updated[candidateId] = withContainers(
      identity.label,
      identity.containerId?.toLowerCase() === key ? null : identity.containerId,
      remaining
    );
  }
  if (!changed) return null;
  // Rewritten in place, so the bridge keeps the rank of its first record.
  const claimed = withContainers(existing?.label ?? null, primary, containers);
  return existing
    ? Object.fromEntries(Object.keys(identities).map((candidateId) => [
        candidateId,
        candidateId === uniqueId ? claimed : updated[candidateId]!
      ]))
    : { ...updated, [uniqueId]: claimed };
}

function withContainers(label: string | null, containerId: string | null, containers: string[]): BridgeIdentityRecord {
  const others = containers.filter((candidate) => candidate !== containerId);
  return {
    label,
    containerId,
    ...(others.length > 0 ? { containerIds: containerId ? [containerId, ...others] : others } : {})
  };
}

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

/**
 * Kitsune Input's tie-break between rows of one physical bridge: the
 * connected row, then the selected one. This app talks to one bridge at a
 * time, so the connected row is also the only one with a known controller.
 */
function canonicalBridgePriority(bridge: BridgeDeviceInfo): number {
  return (bridge.connected ? 4 : 0) + (bridge.selected ? 1 : 0);
}

/** One row per physical bridge, at its first row's rank. Rows not yet identified all stay. */
export function uniquePhysicalBridges(bridges: readonly BridgeDeviceInfo[]): BridgeDeviceInfo[] {
  const canonical: BridgeDeviceInfo[] = [];
  const indexByUniqueId = new Map<string, number>();
  for (const bridge of bridges) {
    if (!bridge.uniqueId) {
      canonical.push(bridge);
      continue;
    }
    const existingIndex = indexByUniqueId.get(bridge.uniqueId);
    if (existingIndex === undefined) {
      indexByUniqueId.set(bridge.uniqueId, canonical.length);
      canonical.push(bridge);
    } else if (canonicalBridgePriority(bridge) > canonicalBridgePriority(canonical[existingIndex]!)) {
      canonical[existingIndex] = bridge;
    }
  }
  return canonical;
}

export interface BridgeDeviceProjection {
  readonly census: readonly { readonly path: string; readonly containerId: string | null }[];
  readonly identities: BridgeIdentities;
  readonly selectedPath: string | null;
  readonly selectedUniqueId: string | null;
  /** The connected bridge's path and the ID its firmware reported. */
  readonly activePath: string | null;
  readonly activeUniqueId: string | null;
}

/** The picker's rows, ranked and one per physical bridge. */
export function projectBridgeDevices(input: BridgeDeviceProjection): BridgeDeviceInfo[] {
  // The connected bridge's firmware ID is authoritative; any other row is
  // known by the container its identity recorded.
  const uniqueIdFor = (bridge: { path: string; containerId: string | null }) => (
    input.activeUniqueId && sameBridgePath(bridge.path, input.activePath)
      ? input.activeUniqueId
      : uniqueIdForContainer(bridge.containerId, input.identities)
  );
  const rows = orderBridgesByIdentity(input.census, input.identities, uniqueIdFor).map((bridge) => {
    const uniqueId = uniqueIdFor(bridge);
    const connected = sameBridgePath(bridge.path, input.activePath);
    return {
      path: bridge.path,
      containerId: bridge.containerId,
      selected: connected
        || sameBridgePath(bridge.path, input.selectedPath)
        || Boolean(uniqueId && uniqueId === input.selectedUniqueId),
      connected,
      uniqueId,
      name: uniqueId ? input.identities[uniqueId]?.label ?? null : null
    };
  });
  return uniquePhysicalBridges(rows);
}
