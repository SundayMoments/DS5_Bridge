import type { TriggerTestMode, TriggerTestTarget } from '@shared/protocol';

export type TriggerLabProfileDialogMode = 'save' | 'rename' | 'delete';
export type TriggerLabBuiltinProfileId = 'default';
export type TriggerLabCustomProfileId = 'custom' | `custom-${string}`;
export type TriggerLabProfileId = TriggerLabBuiltinProfileId | TriggerLabCustomProfileId;
export type TriggerLabSide = Extract<TriggerTestTarget, 'l2' | 'r2'>;
export type TriggerLabDraft = {
  profileId: TriggerLabProfileId;
  mode: TriggerTestMode;
  startPercent: number;
  wallPercent: number;
  forcePercent: number;
};
export type TriggerLabCustomProfile = {
  id: TriggerLabCustomProfileId;
  name: string;
  mode: TriggerTestMode;
  startPercent: number;
  wallPercent: number;
  forcePercent: number;
  active: boolean;
};
export type TriggerLabProfileDialogState = {
  mode: TriggerLabProfileDialogMode;
  side: TriggerLabSide;
};
export type TriggerLabSplitState = {
  drafts: Record<TriggerLabSide, TriggerLabDraft>;
  active: Record<TriggerLabSide, boolean>;
};
export type TriggerLabWorkspaceState = {
  enabled: boolean;
  linked: boolean;
  drafts: Record<TriggerLabSide, TriggerLabDraft>;
  active: Record<TriggerLabSide, boolean>;
  splitState: TriggerLabSplitState | null;
};
export type TriggerLabInitialState = TriggerLabWorkspaceState & {
  profiles: TriggerLabCustomProfile[];
};

export const TRIGGER_LAB_SLIDER_STEP = 5;
export const TRIGGER_LAB_SLIDER_TICKS = Array.from({ length: 21 }, (_, index) => index * TRIGGER_LAB_SLIDER_STEP);

export const TRIGGER_LAB_BUILTIN_PROFILE_OPTIONS: Array<[string, TriggerLabBuiltinProfileId]> = [
  ['Default', 'default']
];
export const TRIGGER_LAB_PROFILE_PRESETS: Record<TriggerLabBuiltinProfileId, TriggerLabDraft> = {
  default: {
    profileId: 'default',
    mode: 'weapon',
    startPercent: 20,
    wallPercent: 60,
    forcePercent: 85
  }
};
export const TRIGGER_LAB_DEFAULT_DRAFT = TRIGGER_LAB_PROFILE_PRESETS.default;
export const TRIGGER_LAB_AUTO_CUSTOM_PROFILE_ID: TriggerLabCustomProfileId = 'custom';
export const TRIGGER_LAB_AUTO_CUSTOM_PROFILE_NAME = 'Custom';

export const TRIGGER_LAB_CUSTOM_PROFILES_STORAGE_KEY = 'ds5bridge.triggerLabProfiles';
export const TRIGGER_LAB_WORKSPACE_STORAGE_KEY = 'ds5bridge.triggerLabWorkspace';

export function snapTriggerLabPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value / TRIGGER_LAB_SLIDER_STEP) * TRIGGER_LAB_SLIDER_STEP));
}

export function isTriggerLabBuiltinProfileId(value: string): value is TriggerLabBuiltinProfileId {
  return value === 'default';
}

export function isTriggerTestModeValue(value: unknown): value is TriggerTestMode {
  return value === 'feedback' || value === 'weapon' || value === 'vibration';
}

export function loadTriggerLabCustomProfiles(): TriggerLabCustomProfile[] {
  try {
    const rawProfiles = JSON.parse(window.localStorage.getItem(TRIGGER_LAB_CUSTOM_PROFILES_STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(rawProfiles)) {
      return [];
    }
    return rawProfiles.flatMap((profile): TriggerLabCustomProfile[] => {
      if (!profile || typeof profile !== 'object') {
        return [];
      }
      const candidate = profile as Partial<TriggerLabCustomProfile>;
      if (
        typeof candidate.id !== 'string'
        || (candidate.id !== TRIGGER_LAB_AUTO_CUSTOM_PROFILE_ID && !candidate.id.startsWith('custom-'))
        || typeof candidate.name !== 'string'
        || candidate.name.trim().length === 0
        || !isTriggerTestModeValue(candidate.mode)
      ) {
        return [];
      }
      return [{
        id: candidate.id as TriggerLabCustomProfileId,
        name: candidate.name.trim().slice(0, 48),
        mode: candidate.mode,
        startPercent: snapTriggerLabPercent(Number(candidate.startPercent ?? 0)),
        wallPercent: snapTriggerLabPercent(Number(candidate.wallPercent ?? 0)),
        forcePercent: snapTriggerLabPercent(Number(candidate.forcePercent ?? 0)),
        active: candidate.active === true
      }];
    });
  } catch {
    return [];
  }
}

export function saveTriggerLabCustomProfiles(profiles: TriggerLabCustomProfile[]) {
  window.localStorage.setItem(TRIGGER_LAB_CUSTOM_PROFILES_STORAGE_KEY, JSON.stringify(profiles));
}

export function createTriggerLabProfileId(): TriggerLabCustomProfileId {
  return `custom-${window.crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`}`;
}

export function defaultTriggerLabWorkspaceState(): TriggerLabWorkspaceState {
  return {
    enabled: false,
    linked: true,
    drafts: {
      l2: { ...TRIGGER_LAB_DEFAULT_DRAFT },
      r2: { ...TRIGGER_LAB_DEFAULT_DRAFT }
    },
    active: {
      l2: false,
      r2: false
    },
    splitState: null
  };
}

export function triggerLabProfileDraftFromProfile(profile: TriggerLabCustomProfile): TriggerLabDraft {
  return {
    profileId: profile.id,
    mode: profile.mode,
    startPercent: profile.startPercent,
    wallPercent: profile.wallPercent,
    forcePercent: profile.forcePercent
  };
}

export function normalizeTriggerLabWorkspaceDraft(
  value: unknown,
  profiles: TriggerLabCustomProfile[]
): TriggerLabDraft {
  if (!value || typeof value !== 'object') {
    return { ...TRIGGER_LAB_DEFAULT_DRAFT };
  }

  const candidate = value as Partial<TriggerLabDraft>;
  if (candidate.profileId === 'default') {
    return { ...TRIGGER_LAB_DEFAULT_DRAFT };
  }

  if (typeof candidate.profileId === 'string') {
    const customProfile = profiles.find((profile) => profile.id === candidate.profileId);
    if (customProfile) {
      return triggerLabProfileDraftFromProfile(customProfile);
    }
  }

  return { ...TRIGGER_LAB_DEFAULT_DRAFT };
}

export function triggerLabWorkspaceDraftActive(
  draft: TriggerLabDraft,
  storedActive: unknown,
  profiles: TriggerLabCustomProfile[]
): boolean {
  if (draft.profileId === 'default') {
    return false;
  }
  const profileActive = profiles.find((profile) => profile.id === draft.profileId)?.active ?? false;
  const active = typeof storedActive === 'boolean' ? storedActive : profileActive;
  return active && draft.forcePercent > 0;
}

export function loadTriggerLabWorkspaceState(profiles: TriggerLabCustomProfile[]): TriggerLabWorkspaceState {
  const fallback = defaultTriggerLabWorkspaceState();
  try {
    const value = JSON.parse(window.localStorage.getItem(TRIGGER_LAB_WORKSPACE_STORAGE_KEY) ?? 'null') as unknown;
    if (!value || typeof value !== 'object') {
      return fallback;
    }

    const candidate = value as Partial<TriggerLabWorkspaceState>;
    const l2Draft = normalizeTriggerLabWorkspaceDraft(candidate.drafts?.l2, profiles);
    const r2Draft = normalizeTriggerLabWorkspaceDraft(candidate.drafts?.r2, profiles);
    const active = {
      l2: triggerLabWorkspaceDraftActive(l2Draft, candidate.active?.l2, profiles),
      r2: triggerLabWorkspaceDraftActive(r2Draft, candidate.active?.r2, profiles)
    };

    let splitState: TriggerLabSplitState | null = null;
    if (candidate.splitState && typeof candidate.splitState === 'object') {
      const splitL2Draft = normalizeTriggerLabWorkspaceDraft(candidate.splitState.drafts?.l2, profiles);
      const splitR2Draft = normalizeTriggerLabWorkspaceDraft(candidate.splitState.drafts?.r2, profiles);
      splitState = {
        drafts: {
          l2: splitL2Draft,
          r2: splitR2Draft
        },
        active: {
          l2: triggerLabWorkspaceDraftActive(splitL2Draft, candidate.splitState.active?.l2, profiles),
          r2: triggerLabWorkspaceDraftActive(splitR2Draft, candidate.splitState.active?.r2, profiles)
        }
      };
    }

    const linked = candidate.linked !== false;
    const workspaceActive = linked
      ? { l2: active.l2 || active.r2, r2: active.l2 || active.r2 }
      : active;

    return {
      enabled: typeof candidate.enabled === 'boolean'
        ? candidate.enabled
        : workspaceActive.l2 || workspaceActive.r2,
      linked,
      drafts: {
        l2: l2Draft,
        r2: r2Draft
      },
      active: workspaceActive,
      splitState
    };
  } catch {
    return fallback;
  }
}

export function loadTriggerLabInitialState(): TriggerLabInitialState {
  const profiles = loadTriggerLabCustomProfiles();
  return {
    ...loadTriggerLabWorkspaceState(profiles),
    profiles
  };
}

export function saveTriggerLabWorkspaceState(state: TriggerLabWorkspaceState) {
  window.localStorage.setItem(TRIGGER_LAB_WORKSPACE_STORAGE_KEY, JSON.stringify(state));
}
