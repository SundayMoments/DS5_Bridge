import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_BUTTON_REMAP_PROFILE_ID, type RemapButtonId } from '@shared/protocol';
import type { BridgeSnapshot } from '@shared/types';
import type { AppRuntime } from '../../composition/app-runtime';
import {
  DEFAULT_REMAP_DRAFT,
  LAST_REMAP_CONTROLLER_TYPE_STORAGE_KEY,
  REMAP_ALL_BUTTON_IDS,
  REMAP_EDGE_BUTTON_IDS,
  REMAP_LEFT_BUTTON_IDS,
  REMAP_RIGHT_BUTTON_IDS,
  REMAP_STANDARD_BUTTON_IDS,
  storedRemapControllerType,
  type DualSenseEdgeRemapButtonId,
  type KnownControllerType,
  type StandardRemapButtonId
} from './remap-buttons';
import {
  REMAP_EDGE_CONTROL_POINTS,
  REMAP_EDGE_LAYOUT_ASSET,
  REMAP_EDGE_LINE_POINTS,
  REMAP_STANDARD_LAYOUT_ASSET,
  type EdgeRemapControlLayout,
  type RemapCalloutLayout
} from './remap-layout';
import { readLastCustomRemapProfileId, remapProfileToggle, writeLastCustomRemapProfileId } from './remap-profile-toggle';

type RemapProfileDialogMode = 'save' | 'rename' | 'delete';

/**
 * Button remapping profiles and the remap draft. The layout follows the last
 * connected controller type, so DualSense Edge back buttons stay available
 * while that controller is away. Callout lines are measured while the page is open.
 */
export function useButtonRemappingController(runtime: AppRuntime, active: boolean) {
  const { snapshot, runAction } = runtime;
  const [remapDraft, setRemapDraft] = useState<Record<RemapButtonId, RemapButtonId>>(DEFAULT_REMAP_DRAFT);
  const [remapProfileDialogMode, setRemapProfileDialogMode] = useState<RemapProfileDialogMode | null>(null);
  const [remapProfileNameDraft, setRemapProfileNameDraft] = useState('');

  const [remapCalloutLayout, setRemapCalloutLayout] = useState<Record<StandardRemapButtonId, RemapCalloutLayout> | null>(null);
  const [edgeRemapControlLayout, setEdgeRemapControlLayout] = useState<Record<DualSenseEdgeRemapButtonId, EdgeRemapControlLayout> | null>(null);
  const [hoveredRemapButton, setHoveredRemapButton] = useState<RemapButtonId | null>(null);

  const [lastRemapControllerType, setLastRemapControllerType] = useState<KnownControllerType>(storedRemapControllerType);
  const [lastCustomRemapProfileId, setLastCustomRemapProfileId] = useState(() => readLastCustomRemapProfileId());

  const remappingLayoutRef = useRef<HTMLDivElement>(null);
  const remappingLeftSideRef = useRef<HTMLDivElement>(null);
  const remappingRightSideRef = useRef<HTMLDivElement>(null);
  const remappingArtRef = useRef<HTMLImageElement>(null);

  const liveControllerType = snapshot?.status?.controllerType;
  const remapControllerType = snapshot?.status?.controllerConnected && liveControllerType && liveControllerType !== 'unknown'
    ? liveControllerType
    : lastRemapControllerType;
  const showDualSenseEdgeRemapButtons = remapControllerType === 'dualsense-edge';
  const remapModifiedCount = useMemo(() => (
    REMAP_ALL_BUTTON_IDS.filter((buttonId) => remapDraft[buttonId] !== buttonId).length
  ), [remapDraft]);

  const selectedRemapProfile = snapshot?.settings.buttonRemappingProfiles.find((profile) => (
    profile.id === snapshot.settings.selectedButtonRemappingProfileId
  ));
  const selectedRemapProfileId = selectedRemapProfile?.id ?? DEFAULT_BUTTON_REMAP_PROFILE_ID;
  const remapProfileOptions = useMemo<Array<[string, string]>>(() => (
    snapshot?.settings.buttonRemappingProfiles.map((profile) => [profile.name, profile.id]) ?? [['Default', DEFAULT_BUTTON_REMAP_PROFILE_ID]]
  ), [snapshot?.settings.buttonRemappingProfiles]);
  const selectedRemapProfileIsDefault = selectedRemapProfileId === DEFAULT_BUTTON_REMAP_PROFILE_ID;
  const remapProfileToggleState = remapProfileToggle(
    snapshot?.settings.buttonRemappingProfiles ?? [],
    selectedRemapProfileId,
    lastCustomRemapProfileId,
    runtime.pendingAction !== null
  );
  const remappingLayoutAsset = showDualSenseEdgeRemapButtons ? REMAP_EDGE_LAYOUT_ASSET : REMAP_STANDARD_LAYOUT_ASSET;

  // Whatever picks a custom profile (this page, a chord or a saved profile), the header can restore it later.
  useEffect(() => {
    if (selectedRemapProfileIsDefault) return;
    setLastCustomRemapProfileId(selectedRemapProfileId);
    writeLastCustomRemapProfileId(selectedRemapProfileId);
  }, [selectedRemapProfileId, selectedRemapProfileIsDefault]);

  useEffect(() => {
    if (snapshot?.status?.controllerConnected && liveControllerType && liveControllerType !== 'unknown') {
      setLastRemapControllerType(liveControllerType);
      window.localStorage.setItem(LAST_REMAP_CONTROLLER_TYPE_STORAGE_KEY, liveControllerType);
    }
  }, [liveControllerType, snapshot?.status?.controllerConnected]);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const leftSide = remappingLeftSideRef.current;
    const rightSide = remappingRightSideRef.current;
    const layout = remappingLayoutRef.current;
    const art = remappingArtRef.current;
    if (!leftSide || !rightSide || !layout || !art) {
      return undefined;
    }
    const leftSideElement = leftSide;
    const rightSideElement = rightSide;
    const layoutElement = layout;
    const artElement = art;

    function updateRemapCalloutPositions() {
      const artRect = artElement.getBoundingClientRect();
      const leftRect = leftSideElement.getBoundingClientRect();
      const rightRect = rightSideElement.getBoundingClientRect();
      const layoutRect = layoutElement.getBoundingClientRect();
      const layoutScaleX = layoutRect.width / layoutElement.offsetWidth || 1;
      const layoutScaleY = layoutRect.height / layoutElement.offsetHeight || 1;
      const toLocalX = (clientX: number) => (clientX - layoutRect.left) / layoutScaleX;
      const toLocalY = (clientY: number) => (clientY - layoutRect.top) / layoutScaleY;
      const artLeft = toLocalX(artRect.left);
      const artTop = toLocalY(artRect.top);
      const artWidth = artRect.width / layoutScaleX;
      const artHeight = artRect.height / layoutScaleY;
      const leftTop = toLocalY(leftRect.top);
      const rightTop = toLocalY(rightRect.top);
      const viewBoxAspect = remappingLayoutAsset.viewBoxWidth / remappingLayoutAsset.viewBoxHeight;
      const renderedSvgHeight = Math.min(artHeight, artWidth / viewBoxAspect);
      const renderedSvgWidth = renderedSvgHeight * viewBoxAspect;
      const renderedSvgTop = artTop + (artHeight - renderedSvgHeight) / 2;
      const renderedSvgLeft = artLeft + (artWidth - renderedSvgWidth) / 2;
      const nextLayout = {} as Record<StandardRemapButtonId, RemapCalloutLayout>;
      const mapSvgPoint = ([x, y]: [number, number]) => (
        `${renderedSvgLeft + (x / remappingLayoutAsset.viewBoxWidth) * renderedSvgWidth},${renderedSvgTop + (y / remappingLayoutAsset.viewBoxHeight) * renderedSvgHeight}`
      );
      const mapSvgX = (x: number) => renderedSvgLeft + (x / remappingLayoutAsset.viewBoxWidth) * renderedSvgWidth;
      const mapSvgY = (y: number) => renderedSvgTop + (y / remappingLayoutAsset.viewBoxHeight) * renderedSvgHeight;
      const remapPillEdgeX = (side: HTMLElement, buttonId: StandardRemapButtonId, edge: 'left' | 'right') => {
        const pill = side.querySelector<HTMLElement>(`[data-remap-button-id="${buttonId}"]`);
        if (!pill) {
          return edge === 'right' ? toLocalX(side.getBoundingClientRect().right) : toLocalX(side.getBoundingClientRect().left);
        }
        const pillRect = pill.getBoundingClientRect();
        return toLocalX(edge === 'right' ? pillRect.right : pillRect.left);
      };

      for (const buttonId of REMAP_LEFT_BUTTON_IDS) {
        const top = renderedSvgTop + (remappingLayoutAsset.calloutY[buttonId] / remappingLayoutAsset.viewBoxHeight) * renderedSvgHeight - leftTop;
        const pillRightX = remapPillEdgeX(leftSideElement, buttonId, 'right');
        nextLayout[buttonId] = {
          top,
          points: [
            `${pillRightX},${leftTop + top}`,
            ...remappingLayoutAsset.calloutPoints[buttonId].map(mapSvgPoint)
          ].join(' ')
        };
      }
      for (const buttonId of REMAP_RIGHT_BUTTON_IDS) {
        const top = renderedSvgTop + (remappingLayoutAsset.calloutY[buttonId] / remappingLayoutAsset.viewBoxHeight) * renderedSvgHeight - rightTop;
        const pillLeftX = remapPillEdgeX(rightSideElement, buttonId, 'left');
        nextLayout[buttonId] = {
          top,
          points: [
            `${pillLeftX},${rightTop + top}`,
            ...remappingLayoutAsset.calloutPoints[buttonId].map(mapSvgPoint)
          ].join(' ')
        };
      }

      setRemapCalloutLayout((current) => {
        if (current && REMAP_STANDARD_BUTTON_IDS.every((buttonId) => (
          Math.abs(current[buttonId].top - nextLayout[buttonId].top) < 0.5
          && current[buttonId].points === nextLayout[buttonId].points
        ))) {
          return current;
        }
        return nextLayout;
      });

      if (showDualSenseEdgeRemapButtons) {
        const nextEdgeLayout = {} as Record<DualSenseEdgeRemapButtonId, EdgeRemapControlLayout>;
        for (const buttonId of REMAP_EDGE_BUTTON_IDS) {
          const point = REMAP_EDGE_CONTROL_POINTS[buttonId];
          nextEdgeLayout[buttonId] = {
            left: mapSvgX(point.x),
            top: mapSvgY(point.y),
            anchor: point.anchor,
            linePoints: REMAP_EDGE_LINE_POINTS[buttonId].map(mapSvgPoint).join(' ')
          };
        }
        setEdgeRemapControlLayout((current) => {
          if (current && REMAP_EDGE_BUTTON_IDS.every((buttonId) => (
            Math.abs(current[buttonId].left - nextEdgeLayout[buttonId].left) < 0.5
            && Math.abs(current[buttonId].top - nextEdgeLayout[buttonId].top) < 0.5
            && current[buttonId].anchor === nextEdgeLayout[buttonId].anchor
            && current[buttonId].linePoints === nextEdgeLayout[buttonId].linePoints
          ))) {
            return current;
          }
          return nextEdgeLayout;
        });
      } else {
        setEdgeRemapControlLayout(null);
      }
    }

    updateRemapCalloutPositions();
    const resizeObserver = new ResizeObserver(updateRemapCalloutPositions);
    resizeObserver.observe(leftSideElement);
    resizeObserver.observe(rightSideElement);
    resizeObserver.observe(layoutElement);
    resizeObserver.observe(artElement);
    window.addEventListener('resize', updateRemapCalloutPositions);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', updateRemapCalloutPositions);
    };
  }, [active, remappingLayoutAsset, showDualSenseEdgeRemapButtons]);

  function selectButtonRemappingProfile(profileId: string) {
    void runAction('remap-profile', () => window.bridge.selectButtonRemappingProfile(profileId));
  }

  /** The header icon: Default when a custom profile is active, otherwise the last custom profile. */
  function toggleButtonRemappingProfile() {
    const { targetId, disabled } = remapProfileToggleState;
    if (disabled || !targetId || targetId === selectedRemapProfileId) return;
    selectButtonRemappingProfile(targetId);
  }

  function setButtonRemap(buttonId: RemapButtonId, targetId: RemapButtonId) {
    setRemapDraft((draft) => ({ ...draft, [buttonId]: targetId }));
    void runAction(`remap-${buttonId}`, () => window.bridge.setButtonRemap(buttonId, targetId));
  }

  function restoreButtonRemappingDefaults() {
    void runAction('remap-restore', () => window.bridge.restoreButtonRemappingDefaults());
  }

  function renameButtonRemappingProfile() {
    if (!selectedRemapProfile || selectedRemapProfileIsDefault) {
      return;
    }
    setRemapProfileNameDraft(selectedRemapProfile.name);
    setRemapProfileDialogMode('rename');
  }

  function saveButtonRemappingProfile() {
    setRemapProfileNameDraft(`Custom Profile ${snapshot?.settings.buttonRemappingProfiles.length ?? 1}`);
    setRemapProfileDialogMode('save');
  }

  function deleteButtonRemappingProfile() {
    if (!selectedRemapProfile || selectedRemapProfileIsDefault) {
      return;
    }
    setRemapProfileDialogMode('delete');
  }

  function closeRemapProfileDialog() {
    setRemapProfileDialogMode(null);
    setRemapProfileNameDraft('');
  }

  function submitRemapProfileDialog() {
    if (!selectedRemapProfile && remapProfileDialogMode !== 'save') {
      return;
    }
    if (remapProfileDialogMode === 'save') {
      const nextName = remapProfileNameDraft.trim();
      if (!nextName) {
        return;
      }
      closeRemapProfileDialog();
      void runAction('remap-save-profile', () => window.bridge.saveButtonRemappingProfile(nextName));
      return;
    }
    if (remapProfileDialogMode === 'rename' && selectedRemapProfile && !selectedRemapProfileIsDefault) {
      const nextName = remapProfileNameDraft.trim();
      if (!nextName || nextName === selectedRemapProfile.name) {
        closeRemapProfileDialog();
        return;
      }
      closeRemapProfileDialog();
      void runAction('remap-rename-profile', () => (
        window.bridge.renameButtonRemappingProfile(selectedRemapProfile.id, nextName)
      ));
      return;
    }
    if (remapProfileDialogMode === 'delete' && selectedRemapProfile && !selectedRemapProfileIsDefault) {
      closeRemapProfileDialog();
      void runAction('remap-delete-profile', () => window.bridge.deleteButtonRemappingProfile(selectedRemapProfile.id));
    }
  }

  function syncSnapshot(next: BridgeSnapshot) {
    setRemapDraft(next.settings.buttonRemappingDraft);
  }

  return {
    remapDraft,
    remapProfileDialogMode,
    remapProfileNameDraft,
    setRemapProfileNameDraft,
    remapCalloutLayout,
    edgeRemapControlLayout,
    hoveredRemapButton,
    setHoveredRemapButton,
    remappingLayoutRef,
    remappingLeftSideRef,
    remappingRightSideRef,
    remappingArtRef,
    showDualSenseEdgeRemapButtons,
    remapModifiedCount,
    selectedRemapProfile,
    selectedRemapProfileId,
    remapProfileOptions,
    selectedRemapProfileIsDefault,
    remapProfileToggle: remapProfileToggleState,
    remappingLayoutAsset,
    selectButtonRemappingProfile,
    toggleButtonRemappingProfile,
    setButtonRemap,
    restoreButtonRemappingDefaults,
    renameButtonRemappingProfile,
    saveButtonRemappingProfile,
    deleteButtonRemappingProfile,
    closeRemapProfileDialog,
    submitRemapProfileDialog,
    syncSnapshot
  };
}

export type ButtonRemappingController = ReturnType<typeof useButtonRemappingController>;
