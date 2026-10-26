import type { CSSProperties } from 'react';
import {
  IconDeviceFloppy as Save,
  IconLink as LinkIcon,
  IconLinkOff as LinkOffIcon,
  IconPencil as Pencil,
  IconPlayerPlay as Play,
  IconRefresh as RefreshCcw,
  IconTrash as Trash2
} from '@tabler/icons-react';
import l2GlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/L2.svg';
import r2GlyphUrl from '@product-assets/glyphs/ps5-buttons-outline-white/svg/R2.svg';
import type { BridgeSnapshot } from '@shared/types';
import { InlineSelect as CustomSelect } from '../../components/InlineSelect';
import { TRIGGER_TEST_MODE_OPTIONS } from '../adaptive-triggers/model';
import type { TriggerLabSide } from './model';
import { TriggerLabMeter } from './TriggerLabMeter';
import type { TriggerLabController } from './use-trigger-lab-controller';

export interface TriggerLabCardProps {
  readonly side: TriggerLabSide;
  readonly lab: TriggerLabController;
  readonly snapshot: BridgeSnapshot;
  readonly connected: boolean;
  readonly adaptiveTriggersSupported: boolean;
  readonly adaptiveTriggerOutputActive: boolean;
  readonly triggerTestLocked: boolean;
  readonly pendingAction: string | null;
}

/** One trigger's lab effect: profile, mode, start/wall/force, preview, and the persistent switch. */
export function TriggerLabCard({
  side,
  lab,
  snapshot,
  connected,
  adaptiveTriggersSupported,
  adaptiveTriggerOutputActive,
  triggerTestLocked,
  pendingAction
}: TriggerLabCardProps) {
  const {
    triggerLabDrafts,
    triggerLabEnabled,
    triggerLabLinked,
    triggerLabProfileOptions,
    triggerLabProfileDialog,
    triggerLabActiveForSide,
    toggleTriggerLabActive,
    setTriggerLabProfile,
    triggerLabProfileIsCustom,
    openTriggerLabProfileDialog,
    toggleTriggerLabLinked,
    setTriggerLabMode,
    setTriggerLabPercent,
    commitTriggerLabPercent,
    previewTriggerLab,
    resetTriggerLab
  } = lab;
  const draft = triggerLabDrafts[side];
  const label = side === 'l2' ? 'Left Trigger' : 'Right Trigger';
  const glyphUrl = side === 'l2' ? l2GlyphUrl : r2GlyphUrl;
  const targetLabel = side.toUpperCase();
  const active = triggerLabActiveForSide(side);
  const labActionDisabled = !connected
    || !adaptiveTriggersSupported
    || !triggerLabEnabled
    || pendingAction !== null;
  const activeDisabled = labActionDisabled || (!active && draft.forcePercent <= 0);
  const previewDisabled = labActionDisabled
    || triggerTestLocked
    || adaptiveTriggerOutputActive
    || Boolean(snapshot.status?.testAdaptiveTriggersBusy);

  return (
    <section className="feature-card trigger-lab-card trigger-lab-trigger-card" key={side}>
      <div className="feature-card-title">
        <button
          type="button"
          className={`feature-icon triggers-enable-button trigger-lab-trigger-badge ${active ? 'active' : ''}`}
          aria-pressed={active}
          aria-label={`${label} persistent lab effect`}
          disabled={activeDisabled}
          onClick={() => toggleTriggerLabActive(side, !active)}
        >
          <span
            className="trigger-lab-trigger-glyph"
            style={{
              WebkitMaskImage: `url("${glyphUrl}")`,
              maskImage: `url("${glyphUrl}")`
            } as CSSProperties}
          />
        </button>
        <div className="title-copy">
          <h3>{label}</h3>
          <p>Shape the {targetLabel} trigger feel</p>
        </div>
        <div className="inline-switch trigger-lab-card-active">
          <span>Active</span>
          <button
            type="button"
            role="switch"
            aria-checked={active}
            aria-label={`${label} persistent lab effect`}
            className={`switch trigger-lab-active-switch ${active ? 'on' : ''}`}
            disabled={activeDisabled}
            onClick={() => toggleTriggerLabActive(side, !active)}
          >
            <span />
          </button>
        </div>
      </div>
      <div className="trigger-lab-editor">
        <div className="trigger-lab-profile-row">
          <CustomSelect
            value={draft.profileId}
            options={triggerLabProfileOptions}
            ariaLabel={`${label} lab profile`}
            className="trigger-lab-profile-select"
            closeOnSelect={false}
            floatingMenu
            suspendOutsideClose={triggerLabProfileDialog?.side === side}
            onChange={(profileId) => setTriggerLabProfile(side, profileId)}
            renderMenuFooter={() => {
              const customProfile = triggerLabProfileIsCustom(draft.profileId);
              return (
                <div className="trigger-lab-profile-actions">
                  <button
                    type="button"
                    aria-label="Save new trigger profile"
                    title="Save New"
                    onClick={() => {
                      openTriggerLabProfileDialog('save', side);
                    }}
                  >
                    <Save size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Rename trigger profile"
                    title="Rename"
                    disabled={!customProfile}
                    onClick={() => {
                      openTriggerLabProfileDialog('rename', side);
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete trigger profile"
                    title="Delete"
                    disabled={!customProfile}
                    onClick={() => {
                      openTriggerLabProfileDialog('delete', side);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            }}
          />
          <button
            type="button"
            className={`trigger-lab-chip compact ${triggerLabLinked ? 'active' : ''}`}
            aria-pressed={triggerLabLinked}
            onClick={() => toggleTriggerLabLinked(side)}
          >
            {triggerLabLinked ? <LinkIcon size={13} /> : <LinkOffIcon size={13} />}
            <span className="trigger-lab-chip-label">{triggerLabLinked ? 'Linked' : 'Split'}</span>
          </button>
        </div>
        <div className="trigger-lab-mode-grid">
          {TRIGGER_TEST_MODE_OPTIONS.map(([modeLabel, mode]) => (
            <button
              key={mode}
              type="button"
              className={`trigger-lab-mode-button ${draft.mode === mode ? 'active' : ''}`}
              onClick={() => setTriggerLabMode(side, mode)}
            >
              {modeLabel}
            </button>
          ))}
        </div>
        <div className="trigger-lab-meter-row">
          <span>Start</span>
          <TriggerLabMeter
            label={`${label} start`}
            value={draft.startPercent}
            onChange={(value) => setTriggerLabPercent(side, 'startPercent', value)}
            onCommit={(value) => commitTriggerLabPercent(side, 'startPercent', value)}
          />
          <strong>{draft.startPercent}%</strong>
        </div>
        <div className="trigger-lab-meter-row">
          <span>Wall</span>
          <TriggerLabMeter
            label={`${label} wall`}
            value={draft.wallPercent}
            onChange={(value) => setTriggerLabPercent(side, 'wallPercent', value)}
            onCommit={(value) => commitTriggerLabPercent(side, 'wallPercent', value)}
          />
          <strong>{draft.wallPercent}%</strong>
        </div>
        <div className="trigger-lab-meter-row">
          <span>Force</span>
          <TriggerLabMeter
            label={`${label} force`}
            value={draft.forcePercent}
            onChange={(value) => setTriggerLabPercent(side, 'forcePercent', value)}
            onCommit={(value) => commitTriggerLabPercent(side, 'forcePercent', value)}
          />
          <strong>{draft.forcePercent}%</strong>
        </div>
        <div className="trigger-lab-button-row two-up">
          <button type="button" disabled={previewDisabled} onClick={() => previewTriggerLab(side)}>
            <Play size={14} /> Preview
          </button>
          <button type="button" disabled={labActionDisabled} onClick={resetTriggerLab}>
            <RefreshCcw size={14} /> Reset
          </button>
        </div>
      </div>
    </section>
  );
}
