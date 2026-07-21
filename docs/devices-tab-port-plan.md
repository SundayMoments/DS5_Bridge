# Devices Tab Port Plan

## Goal

Port the controller-management behavior from Kitsune Input into DS5_Bridge
without transplanting Kitsune's companion architecture. The finished feature
must let a user identify, pair, rename, and selectively forget DualSense
controllers while preserving DS5_Bridge's existing controller profiles and
connectivity recovery behavior.

## Source and destination

- Source: `C:\Users\aaron\Documents\Kitsune-Input`
- Destination: `C:\Users\aaron\Documents\DS5_Bridge`
- Development branch: `codex/port-dev`
- Source behavior:
  - Device identity feature report
  - Explicit pairing command
  - Forget-all and forget-by-address commands
  - Durable forgotten-device blacklist
  - Current/last controller cards, local names, and confirmation dialogs

## Architectural boundary

This is a behavior port. DS5_Bridge keeps its existing:

- monolithic firmware Bluetooth session implementation;
- `BridgeService`, Electron IPC, and preload API;
- renderer state/action conventions and visual system;
- controller and button-remapping profile ownership.

The port will not introduce Kitsune's service catalog, runtime port/composition
layers, snapshot mutation coordinator, Switch Pro support, or controller
profile deletion behavior.

## Gap analysis

### Firmware

DS5_Bridge already has explicit scan and forget-all entry points, but lacks:

- a stable controller identity snapshot;
- a feature report carrying Bluetooth address and bond information;
- targeted link-key removal by Bluetooth address;
- durable forgotten-address storage;
- admission checks that reject forgotten controllers;
- removal of a forgotten address only after an explicit successful pairing.

### Companion protocol and bridge

DS5_Bridge lacks:

- the device identity report parser;
- commands for scan, forget all, and forget one;
- identity polling in `BridgeService`;
- identity data in `BridgeDiagnostics`;
- IPC/preload methods for controller management.

### Renderer

DS5_Bridge lacks:

- a Devices navigation entry and page;
- an address-backed controller history cache;
- local controller renaming;
- pair, forget-one, and forget-all flows;
- destructive-action confirmation dialogs.

## Protocol additions

The port retains the source wire identifiers so firmware and companion tooling
remain easy to compare:

| Contract | ID |
| --- | ---: |
| Device identity feature report | `0x0D` |
| Request controller scan | `0x27` |
| Forget controller pairings | `0x28` |
| Forget one controller pairing | `0x2E` |

The companion protocol minor version advances from `1.16` to `1.17`.

The 64-byte device identity feature report contains:

- standard report ID, magic, and protocol version;
- schema version;
- flags for address known, link key known, controller connected, and pairing
  window active;
- link-key type;
- uppercase Bluetooth address text;
- a normalized controller display name;
- USB vendor and product IDs inferred from the detected controller type.

The targeted-forget command carries a six-byte Bluetooth address in canonical
wire order and rejects malformed or all-zero addresses.

## Durable forgotten-device policy

The blacklist is a small TLV-backed set capped at BTstack's link-key capacity.

1. Forget one adds that address to the blacklist and verifies the TLV write
   before dropping the matching link key.
2. Forget all adds every stored address plus the active address, verifies the
   TLV write, and then removes all link keys.
3. Incoming ACL admission rejects blacklisted addresses even if stale BTstack
   key state still exists.
4. An explicit outbound pairing attempt may connect to a blacklisted address.
5. The address is removed from the blacklist only after the new link key is
   durably stored and the HID session reaches ready.
6. Failed TLV mutations remain fail-closed and do not silently resurrect a
   forgotten controller.

Flash mutations continue to use the existing core-0/watchdog-safe Bluetooth
path; the renderer never writes pairing state directly.

## Implementation sequence

### Commit 1: plan

- Record this dependency map, protocol allocation, safety policy, and
  validation matrix.

### Commit 2: firmware device management

- Add the identity snapshot API.
- Add TLV-backed blacklist load/store/add/remove helpers.
- Enforce blacklist checks in both incoming ACL filtering and late connection
  completion handling.
- Add targeted forget and strengthen forget-all ordering.
- Clear a blacklist entry after explicit durable re-pairing.
- Add scan/pairing state accessors needed by the identity report.
- Add source-contract tests for persistence and admission invariants.

### Commit 3: protocol and bridge

- Add report and command constants and advance protocol version.
- Implement and test the device identity report.
- Implement scan, forget-all, and forget-one command dispatch.
- Parse and test identity payloads in TypeScript.
- Poll identity as best-effort diagnostics after status.
- Add bridge, IPC, and preload methods.

### Commit 4: renderer model and cache

- Add an address-backed cache capped at four controllers.
- Normalize addresses and stock controller names.
- Reconcile live snapshots with cached custom names.
- Keep rename metadata local to the companion.
- Add focused model/cache tests.

### Commit 5: Devices UI

- Add Devices to the sidebar.
- Render current and last-controller cards.
- Add Pair Controller / Disconnect & Pair.
- Add Rename, Delete, and Forget Controllers flows.
- Use confirmation dialogs for firmware mutations.
- Match DS5_Bridge's existing styles and action/pending behavior.
- Preserve controller and remapping profiles on every device action.

### Commit 6: integration hardening

- Add IPC contract and renderer behavior coverage.
- Run companion unit tests, type checking, and production build.
- Run firmware source-contract tests and firmware builds.
- Review protocol parity and the complete diff.

## Validation matrix

### Automated

- Protocol parser accepts canonical identity reports and rejects wrong versions.
- Address encoder accepts canonical addresses and rejects malformed values.
- Firmware source contracts verify blacklist persistence and command dispatch.
- Cache keeps only address-backed entries, preserves names, deduplicates, and
  caps history.
- UI exposes the tab, cards, menu actions, and confirmation copy.
- Existing companion and firmware suites remain green.
- Firmware and companion production builds succeed.

### Hardware

1. Upgrade firmware and open Devices; verify the connected controller address,
   type, VID/PID, battery, and bond status.
2. Rename the controller, restart the app, and verify the local name persists.
3. Disconnect and pair; verify the current card becomes history and pairing
   begins without rebooting the Pico.
4. Forget a disconnected controller; verify another bonded controller remains.
5. Attempt passive reconnect from the forgotten controller; verify rejection.
6. Explicitly pair that same controller; verify it reconnects and the blacklist
   entry is cleared only after the bond is durable.
7. Forget the active controller; verify disconnect, pairing mode, and no
   watchdog reset.
8. Forget all; verify every stored controller requires explicit pairing.
9. Power-cycle after forget-one and forget-all; repeat passive reconnect checks.
10. Exercise BOOTSEL single-click and hold gestures to confirm their existing
    behavior remains unchanged.

## Completion criteria

- Every device-management action is available through the companion UI.
- Forget-one is address-specific and survives reboot.
- Explicit re-pair is the only path that clears a forgotten address.
- No device action deletes or mutates controller/game profiles.
- No new watchdog, flash-write, or Bluetooth reconnect regression appears in
  automated checks or the hardware matrix.
