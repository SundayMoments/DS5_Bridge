import { useEffect, useMemo, useRef, useState } from 'react';
import type { TriggerTestMode, TriggerTestTarget } from '@shared/protocol';
import type { AppRuntime } from '../../composition/app-runtime';
import { TEST_TRIGGER_LOCK_MS } from '../adaptive-triggers/model';
import {
  TRIGGER_LAB_AUTO_CUSTOM_PROFILE_ID,
  TRIGGER_LAB_AUTO_CUSTOM_PROFILE_NAME,
  TRIGGER_LAB_BUILTIN_PROFILE_OPTIONS,
  TRIGGER_LAB_DEFAULT_DRAFT,
  TRIGGER_LAB_PROFILE_PRESETS,
  createTriggerLabProfileId,
  isTriggerLabBuiltinProfileId,
  loadTriggerLabInitialState,
  saveTriggerLabCustomProfiles,
  saveTriggerLabWorkspaceState,
  snapTriggerLabPercent,
  type TriggerLabCustomProfile,
  type TriggerLabCustomProfileId,
  type TriggerLabDraft,
  type TriggerLabInitialState,
  type TriggerLabProfileDialogMode,
  type TriggerLabProfileDialogState,
  type TriggerLabProfileId,
  type TriggerLabSide,
  type TriggerLabSplitState
} from './model';

export interface TriggerLabControllerInput {
  readonly adaptiveTriggersSupported: boolean;
  readonly adaptiveTriggersEnabled: boolean;
  /** Previews share the Adaptive Triggers test lock. */
  readonly setTriggerTestLocked: (locked: boolean) => void;
}

/**
 * The Trigger Lab workspace: per-trigger drafts, linked or split editing,
 * custom profiles, and persistent lab effects. The workspace and profiles are
 * kept in local storage, and active effects are reapplied when the bridge reconnects.
 */
export function useTriggerLabController(
  runtime: AppRuntime,
  { adaptiveTriggersSupported, adaptiveTriggersEnabled, setTriggerTestLocked }: TriggerLabControllerInput
) {
  const { connected, pendingAction, runAction } = runtime;
  const triggerLabInitialStateRef = useRef<TriggerLabInitialState | null>(null);
  if (triggerLabInitialStateRef.current === null) {
    triggerLabInitialStateRef.current = loadTriggerLabInitialState();
  }
  const triggerLabInitialState = triggerLabInitialStateRef.current;

  const [triggerLabEnabled, setTriggerLabEnabled] = useState(triggerLabInitialState.enabled);
  const [triggerLabLinked, setTriggerLabLinked] = useState(triggerLabInitialState.linked);
  const [triggerLabDrafts, setTriggerLabDrafts] = useState<Record<TriggerLabSide, TriggerLabDraft>>(triggerLabInitialState.drafts);
  const [triggerLabActive, setTriggerLabActive] = useState<Record<TriggerLabSide, boolean>>(triggerLabInitialState.active);
  const [triggerLabSplitState, setTriggerLabSplitState] = useState<TriggerLabSplitState | null>(triggerLabInitialState.splitState);
  const [triggerLabCustomProfiles, setTriggerLabCustomProfiles] = useState<TriggerLabCustomProfile[]>(triggerLabInitialState.profiles);
  const [triggerLabProfileDialog, setTriggerLabProfileDialog] = useState<TriggerLabProfileDialogState | null>(null);
  const [triggerLabProfileNameDraft, setTriggerLabProfileNameDraft] = useState('');

  const triggerLabRestoreAppliedRef = useRef(false);

  useEffect(() => {
    saveTriggerLabCustomProfiles(triggerLabCustomProfiles);
  }, [triggerLabCustomProfiles]);

  useEffect(() => {
    saveTriggerLabWorkspaceState({
      enabled: triggerLabEnabled,
      linked: triggerLabLinked,
      drafts: triggerLabDrafts,
      active: triggerLabActive,
      splitState: triggerLabSplitState
    });
  }, [triggerLabActive, triggerLabDrafts, triggerLabEnabled, triggerLabLinked, triggerLabSplitState]);

  const triggerLabProfileOptions = useMemo<Array<[string, TriggerLabProfileId]>>(() => ([
    ...TRIGGER_LAB_BUILTIN_PROFILE_OPTIONS,
    ...triggerLabCustomProfiles.map((profile): [string, TriggerLabProfileId] => [profile.name, profile.id])
  ]), [triggerLabCustomProfiles]);
  const triggerLabAnyActive = triggerLabActive.l2 || triggerLabActive.r2;

  useEffect(() => {
    triggerLabRestoreAppliedRef.current = false;
  }, [adaptiveTriggersEnabled, connected, triggerLabEnabled]);

  useEffect(() => {
    if (
      triggerLabRestoreAppliedRef.current
      || !connected
      || !adaptiveTriggersSupported
      || !triggerLabEnabled
      || pendingAction !== null
    ) {
      return;
    }

    triggerLabRestoreAppliedRef.current = true;
    if (!triggerLabAnyActive) {
      return;
    }

    if (triggerLabLinked) {
      const active = triggerLabActive.l2 && triggerLabActive.r2 && triggerLabDrafts.l2.forcePercent > 0;
      persistTriggerLab('l2', triggerLabDrafts.l2, active, 'trigger-lab-restore', 'both');
      return;
    }

    persistTriggerLabSplitState({
      drafts: triggerLabDrafts,
      active: triggerLabActive
    }, 'trigger-lab-restore');
  }, [
    adaptiveTriggersEnabled,
    adaptiveTriggersSupported,
    connected,
    pendingAction,
    triggerLabActive,
    triggerLabAnyActive,
    triggerLabDrafts,
    triggerLabEnabled,
    triggerLabLinked
  ]);

  function updateTriggerLabSide(side: TriggerLabSide, update: (current: TriggerLabDraft) => TriggerLabDraft) {
    setTriggerLabDrafts((current) => {
      const nextSide = update(current[side]);
      if (triggerLabLinked) {
        return { l2: nextSide, r2: nextSide };
      }
      return { ...current, [side]: nextSide };
    });
  }

  function triggerLabActiveForSide(side: TriggerLabSide) {
    return triggerLabLinked ? triggerLabActive.l2 && triggerLabActive.r2 : triggerLabActive[side];
  }

  function setTriggerLabActiveForTarget(side: TriggerLabSide, active: boolean) {
    setTriggerLabActive((current) => (
      triggerLabLinked ? { l2: active, r2: active } : { ...current, [side]: active }
    ));
  }

  function triggerLabProfileDraft(profileId: TriggerLabProfileId): TriggerLabDraft | null {
    if (isTriggerLabBuiltinProfileId(profileId)) {
      return { ...TRIGGER_LAB_PROFILE_PRESETS[profileId] };
    }
    const profile = triggerLabCustomProfiles.find((candidate) => candidate.id === profileId);
    if (!profile) {
      return null;
    }
    return {
      profileId: profile.id,
      mode: profile.mode,
      startPercent: profile.startPercent,
      wallPercent: profile.wallPercent,
      forcePercent: profile.forcePercent
    };
  }

  function triggerLabProfileName(profileId: TriggerLabProfileId): string {
    const builtin = TRIGGER_LAB_BUILTIN_PROFILE_OPTIONS.find(([, value]) => value === profileId);
    if (builtin) {
      return builtin[0];
    }
    return triggerLabCustomProfiles.find((profile) => profile.id === profileId)?.name
      ?? (profileId === TRIGGER_LAB_AUTO_CUSTOM_PROFILE_ID ? TRIGGER_LAB_AUTO_CUSTOM_PROFILE_NAME : 'Profile');
  }

  function triggerLabProfileIsCustom(profileId: TriggerLabProfileId): boolean {
    return triggerLabCustomProfiles.some((profile) => profile.id === profileId);
  }

  function triggerLabProfileActive(profileId: TriggerLabProfileId): boolean {
    if (isTriggerLabBuiltinProfileId(profileId)) {
      return false;
    }
    return triggerLabCustomProfiles.find((profile) => profile.id === profileId)?.active ?? false;
  }

  function triggerLabCustomProfileFromDraft(
    id: TriggerLabCustomProfileId,
    name: string,
    draft: TriggerLabDraft,
    active: boolean
  ): TriggerLabCustomProfile {
    return {
      id,
      name: name.trim().slice(0, 48) || TRIGGER_LAB_AUTO_CUSTOM_PROFILE_NAME,
      mode: draft.mode,
      startPercent: draft.startPercent,
      wallPercent: draft.wallPercent,
      forcePercent: draft.forcePercent,
      active: active && draft.forcePercent > 0
    };
  }

  function upsertTriggerLabCustomProfile(profile: TriggerLabCustomProfile) {
    setTriggerLabCustomProfiles((current) => {
      const existingProfile = current.find((candidate) => candidate.id === profile.id);
      if (!existingProfile) {
        return [...current, profile];
      }
      return current.map((candidate) => (
        candidate.id === profile.id ? profile : candidate
      ));
    });
  }

  function saveTriggerLabDraftToProfile(draft: TriggerLabDraft, active: boolean) {
    if (isTriggerLabBuiltinProfileId(draft.profileId)) {
      return;
    }
    upsertTriggerLabCustomProfile(triggerLabCustomProfileFromDraft(
      draft.profileId,
      triggerLabProfileName(draft.profileId),
      draft,
      active
    ));
  }

  function editableTriggerLabDraft(draft: TriggerLabDraft, active: boolean): TriggerLabDraft {
    if (isTriggerLabBuiltinProfileId(draft.profileId)) {
      const nextDraft = {
        ...draft,
        profileId: TRIGGER_LAB_AUTO_CUSTOM_PROFILE_ID
      };
      upsertTriggerLabCustomProfile(triggerLabCustomProfileFromDraft(
        TRIGGER_LAB_AUTO_CUSTOM_PROFILE_ID,
        TRIGGER_LAB_AUTO_CUSTOM_PROFILE_NAME,
        nextDraft,
        active
      ));
      return nextDraft;
    }

    upsertTriggerLabCustomProfile(triggerLabCustomProfileFromDraft(
      draft.profileId,
      triggerLabProfileName(draft.profileId),
      draft,
      active
    ));
    return draft;
  }

  function updateEditableTriggerLabSide(
    side: TriggerLabSide,
    update: (current: TriggerLabDraft) => TriggerLabDraft
  ): TriggerLabDraft {
    const nextDraft = editableTriggerLabDraft(update(triggerLabDrafts[side]), triggerLabActiveForSide(side));
    updateTriggerLabSide(side, () => nextDraft);
    return nextDraft;
  }

  function persistTriggerLab(
    side: TriggerLabSide,
    draft: TriggerLabDraft,
    active: boolean,
    label: string,
    target: TriggerTestTarget = triggerLabLinked ? 'both' : side
  ) {
    void runAction(label, () => (
      window.bridge.applyAdaptiveTriggerEffect({
        mode: draft.mode,
        target,
        startPercent: draft.startPercent,
        wallPercent: draft.wallPercent,
        forcePercent: active ? draft.forcePercent : 0
      })
    ));
  }

  function persistTriggerLabSplitState(nextState: TriggerLabSplitState, label: string) {
    void runAction(label, async () => {
      await window.bridge.applyAdaptiveTriggerEffect({
        mode: nextState.drafts.l2.mode,
        target: 'l2',
        startPercent: nextState.drafts.l2.startPercent,
        wallPercent: nextState.drafts.l2.wallPercent,
        forcePercent: nextState.active.l2 ? nextState.drafts.l2.forcePercent : 0
      });
      return window.bridge.applyAdaptiveTriggerEffect({
        mode: nextState.drafts.r2.mode,
        target: 'r2',
        startPercent: nextState.drafts.r2.startPercent,
        wallPercent: nextState.drafts.r2.wallPercent,
        forcePercent: nextState.active.r2 ? nextState.drafts.r2.forcePercent : 0
      });
    });
  }

  function setTriggerLabProfile(side: TriggerLabSide, profileId: TriggerLabProfileId) {
    const profileDraft = triggerLabProfileDraft(profileId);
    if (!profileDraft) {
      return;
    }
    const previousActive = triggerLabActiveForSide(side);
    const nextActive = triggerLabProfileActive(profileId) && profileDraft.forcePercent > 0;
    const nextDraft = { ...profileDraft, profileId };
    updateTriggerLabSide(side, () => nextDraft);
    setTriggerLabActiveForTarget(side, nextActive);
    if (previousActive || nextActive) {
      persistTriggerLab(side, nextDraft, nextActive, `trigger-lab-update-${side}`);
    }
  }

  function openTriggerLabProfileDialog(mode: TriggerLabProfileDialogMode, side: TriggerLabSide) {
    const profileId = triggerLabDrafts[side].profileId;
    if ((mode === 'rename' || mode === 'delete') && !triggerLabProfileIsCustom(profileId)) {
      return;
    }
    setTriggerLabProfileNameDraft(
      mode === 'save'
        ? `Custom Trigger ${triggerLabCustomProfiles.length + 1}`
        : triggerLabProfileName(profileId)
    );
    setTriggerLabProfileDialog({ mode, side });
  }

  function closeTriggerLabProfileDialog() {
    setTriggerLabProfileDialog(null);
    setTriggerLabProfileNameDraft('');
  }

  function submitTriggerLabProfileDialog() {
    if (!triggerLabProfileDialog) {
      return;
    }

    const side = triggerLabProfileDialog.side;
    const draft = triggerLabDrafts[side];
    const nextName = triggerLabProfileNameDraft.trim();

    if (triggerLabProfileDialog.mode === 'save') {
      if (!nextName) {
        return;
      }
      const id = createTriggerLabProfileId();
      const nextProfile: TriggerLabCustomProfile = {
        id,
        name: nextName,
        mode: draft.mode,
        startPercent: draft.startPercent,
        wallPercent: draft.wallPercent,
        forcePercent: draft.forcePercent,
        active: triggerLabActiveForSide(side) && draft.forcePercent > 0
      };
      setTriggerLabCustomProfiles((current) => [...current, nextProfile]);
      updateTriggerLabSide(side, (current) => ({ ...current, profileId: id }));
      closeTriggerLabProfileDialog();
      return;
    }

    if (!triggerLabProfileIsCustom(draft.profileId)) {
      closeTriggerLabProfileDialog();
      return;
    }

    if (triggerLabProfileDialog.mode === 'rename') {
      if (!nextName || nextName === triggerLabProfileName(draft.profileId)) {
        closeTriggerLabProfileDialog();
        return;
      }
      setTriggerLabCustomProfiles((current) => current.map((profile) => (
        profile.id === draft.profileId ? { ...profile, name: nextName } : profile
      )));
      closeTriggerLabProfileDialog();
      return;
    }

    if (triggerLabProfileDialog.mode === 'delete') {
      const profileId = draft.profileId;
      const nextDrafts = {
        l2: triggerLabDrafts.l2.profileId === profileId ? { ...TRIGGER_LAB_DEFAULT_DRAFT } : triggerLabDrafts.l2,
        r2: triggerLabDrafts.r2.profileId === profileId ? { ...TRIGGER_LAB_DEFAULT_DRAFT } : triggerLabDrafts.r2
      };
      const nextActive = {
        l2: triggerLabDrafts.l2.profileId === profileId ? false : triggerLabActive.l2,
        r2: triggerLabDrafts.r2.profileId === profileId ? false : triggerLabActive.r2
      };
      setTriggerLabCustomProfiles((current) => current.filter((profile) => profile.id !== profileId));
      setTriggerLabDrafts(nextDrafts);
      setTriggerLabActive(nextActive);
      setTriggerLabSplitState((current) => current
        ? {
            drafts: {
              l2: current.drafts.l2.profileId === profileId ? { ...TRIGGER_LAB_DEFAULT_DRAFT } : current.drafts.l2,
              r2: current.drafts.r2.profileId === profileId ? { ...TRIGGER_LAB_DEFAULT_DRAFT } : current.drafts.r2
            },
            active: {
              l2: current.drafts.l2.profileId === profileId ? false : current.active.l2,
              r2: current.drafts.r2.profileId === profileId ? false : current.active.r2
            }
          }
        : null);
      if (triggerLabActive.l2 || triggerLabActive.r2) {
        if (triggerLabLinked) {
          persistTriggerLab('l2', nextDrafts.l2, false, 'trigger-lab-delete-profile', 'both');
        } else {
          persistTriggerLabSplitState({ drafts: nextDrafts, active: nextActive }, 'trigger-lab-delete-profile');
        }
      }
      closeTriggerLabProfileDialog();
    }
  }

  function setTriggerLabMode(side: TriggerLabSide, mode: TriggerTestMode) {
    const nextDraft = updateEditableTriggerLabSide(side, (current) => ({ ...current, mode }));
    if (triggerLabActiveForSide(side)) {
      persistTriggerLab(side, nextDraft, nextDraft.forcePercent > 0, `trigger-lab-update-${side}`);
      setTriggerLabActiveForTarget(side, nextDraft.forcePercent > 0);
    }
  }

  function setTriggerLabPercent(side: TriggerLabSide, key: 'startPercent' | 'wallPercent' | 'forcePercent', value: number) {
    updateEditableTriggerLabSide(side, (current) => ({
      ...current,
      [key]: snapTriggerLabPercent(value),
    }));
  }

  function commitTriggerLabPercent(side: TriggerLabSide, key: 'startPercent' | 'wallPercent' | 'forcePercent', value: number) {
    const nextDraft = updateEditableTriggerLabSide(side, (current) => ({
      ...current,
      [key]: snapTriggerLabPercent(value),
    }));
    if (triggerLabActiveForSide(side)) {
      const nextActive = nextDraft.forcePercent > 0;
      saveTriggerLabDraftToProfile(nextDraft, nextActive);
      persistTriggerLab(side, nextDraft, nextActive, `trigger-lab-update-${side}`);
      setTriggerLabActiveForTarget(side, nextActive);
    }
  }

  function toggleTriggerLabLinked(sourceSide: TriggerLabSide) {
    if (triggerLabLinked) {
      if (triggerLabSplitState) {
        setTriggerLabDrafts({
          l2: { ...triggerLabSplitState.drafts.l2 },
          r2: { ...triggerLabSplitState.drafts.r2 }
        });
        setTriggerLabActive({ ...triggerLabSplitState.active });
        persistTriggerLabSplitState(triggerLabSplitState, `trigger-lab-unlink-${sourceSide}`);
      }
      setTriggerLabLinked(false);
      return;
    }

    const sourceDraft = { ...triggerLabDrafts[sourceSide] };
    const sourceActive = triggerLabActive[sourceSide];
    setTriggerLabSplitState({
      drafts: {
        l2: { ...triggerLabDrafts.l2 },
        r2: { ...triggerLabDrafts.r2 }
      },
      active: { ...triggerLabActive }
    });
    setTriggerLabDrafts({ l2: sourceDraft, r2: { ...sourceDraft } });
    setTriggerLabActive({ l2: sourceActive, r2: sourceActive });
    setTriggerLabLinked(true);
    if (sourceActive || triggerLabActive.l2 || triggerLabActive.r2) {
      persistTriggerLab(sourceSide, sourceDraft, sourceActive, `trigger-lab-link-${sourceSide}`, 'both');
    }
  }

  function previewTriggerLab(side: TriggerLabSide) {
    const draft = triggerLabDrafts[side];
    setTriggerTestLocked(true);
    void runAction(`trigger-lab-${side}`, () => (
      window.bridge.previewAdaptiveTriggerEffect({
        mode: draft.mode,
        target: triggerLabLinked ? 'both' : side,
        startPercent: draft.startPercent,
        wallPercent: draft.wallPercent,
        forcePercent: draft.forcePercent
      })
    )).finally(() => {
      window.setTimeout(() => setTriggerTestLocked(false), TEST_TRIGGER_LOCK_MS);
    });
  }

  function toggleTriggerLabActive(side: TriggerLabSide, active: boolean) {
    const draft = active
      ? editableTriggerLabDraft(triggerLabDrafts[side], active)
      : editableTriggerLabDraft(triggerLabDrafts[side], false);
    updateTriggerLabSide(side, () => draft);
    setTriggerLabActiveForTarget(side, active);
    persistTriggerLab(side, draft, active, `trigger-lab-active-${side}`);
  }

  function resetAdaptiveTriggers() {
    saveTriggerLabDraftToProfile(triggerLabDrafts.l2, false);
    saveTriggerLabDraftToProfile(triggerLabDrafts.r2, false);
    setTriggerLabActive({ l2: false, r2: false });
    void runAction('triggers-reset', () => window.bridge.resetAdaptiveTriggers());
  }

  function resetTriggerLab() {
    resetAdaptiveTriggers();
  }

  function toggleTriggerLabEnabled() {
    const enabled = !triggerLabEnabled;
    setTriggerLabEnabled(enabled);
    if (!enabled) {
      void runAction('trigger-lab-enabled', () => window.bridge.resetAdaptiveTriggers());
    }
  }
  return {
    triggerLabEnabled,
    triggerLabLinked,
    triggerLabDrafts,
    triggerLabActive,
    triggerLabProfileDialog,
    triggerLabProfileNameDraft,
    setTriggerLabProfileNameDraft,
    triggerLabProfileOptions,
    triggerLabAnyActive,
    triggerLabActiveForSide,
    triggerLabProfileName,
    triggerLabProfileIsCustom,
    setTriggerLabProfile,
    openTriggerLabProfileDialog,
    closeTriggerLabProfileDialog,
    submitTriggerLabProfileDialog,
    setTriggerLabMode,
    setTriggerLabPercent,
    commitTriggerLabPercent,
    toggleTriggerLabLinked,
    previewTriggerLab,
    toggleTriggerLabActive,
    resetAdaptiveTriggers,
    resetTriggerLab,
    toggleTriggerLabEnabled
  };
}

export type TriggerLabController = ReturnType<typeof useTriggerLabController>;
