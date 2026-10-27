import type { CSSProperties } from 'react';
import {
  IconArrowRight as ArrowRight,
  IconDeviceFloppy as Save,
  IconDeviceGamepad3,
  IconPencil as Pencil,
  IconRefresh as RefreshCcw,
  IconTrash as Trash2
} from '@tabler/icons-react';
import { ProfileSaveStatus } from '../../common/ProfileSaveStatus';
import { InlineSelect as CustomSelect } from '../../components/InlineSelect';
import {
  REMAP_BUTTONS,
  REMAP_EDGE_BUTTON_IDS,
  REMAP_LEFT_BUTTON_IDS,
  REMAP_RIGHT_BUTTON_IDS,
  REMAP_STANDARD_BUTTON_IDS,
  RemapGlyphOption,
  RemapSourceGlyph,
  remapTargetOptionsFor
} from './remap-buttons';
import { REMAP_EDGE_CONTROL_POINTS } from './remap-layout';
import type { ButtonRemappingController } from './use-button-remapping-controller';

export interface ButtonRemappingPageProps {
  readonly active: boolean;
  readonly controller: ButtonRemappingController;
  readonly pendingAction: string | null;
}

export function ButtonRemappingPage({ active, controller, pendingAction }: ButtonRemappingPageProps) {
  const {
    remapDraft,
    remapCalloutLayout,
    edgeRemapControlLayout,
    hoveredRemapButton,
    setHoveredRemapButton,
    remappingLayoutRef,
    remappingLeftSideRef,
    remappingRightSideRef,
    remappingArtRef,
    showDualSenseEdgeRemapButtons,
    selectedRemapProfileId,
    remapProfileOptions,
    selectedRemapProfileIsDefault,
    remappingLayoutAsset,
    selectButtonRemappingProfile,
    setButtonRemap,
    restoreButtonRemappingDefaults,
    renameButtonRemappingProfile,
    saveButtonRemappingProfile,
    deleteButtonRemappingProfile
  } = controller;

  return (
    <div
      className={`control-page remapping-page ${active ? 'active' : ''}`}
      role="tabpanel"
      id="control-panel-remapping"
      aria-labelledby="control-tab-remapping"
      aria-hidden={!active}
    >
        <div className="feature-heading studio-feature-heading remapping-heading">
          <div className="studio-heading-copy">
            <span className="feature-icon"><IconDeviceGamepad3 size={20} /></span>
            <div>
              <h2>Button Remapping</h2>
              <p>Choose replacement targets for controller button slots.</p>
            </div>
          </div>
          <div className="profile-controls">
            <CustomSelect
              value={selectedRemapProfileId}
              disabled={pendingAction !== null}
              options={remapProfileOptions}
              ariaLabel="Button remapping profile"
              onChange={selectButtonRemappingProfile}
            />
            <button
              className="heading-action"
              type="button"
              disabled={pendingAction !== null}
              onClick={restoreButtonRemappingDefaults}
            >
              <RefreshCcw size={18} />
              Restore Defaults
            </button>
          </div>
        </div>
        <section className="feature-card remapping-card">
          <div className="remapping-profile-strip">
            <ProfileSaveStatus />
            <div className="remapping-profile-actions">
              <button
                type="button"
                disabled={pendingAction !== null || selectedRemapProfileIsDefault}
                onClick={renameButtonRemappingProfile}
              >
                <Pencil size={15} />
                Rename Profile
              </button>
              <button
                type="button"
                disabled={pendingAction !== null}
                onClick={saveButtonRemappingProfile}
              >
                <Save size={15} />
                Save New Profile
              </button>
              <button
                type="button"
                disabled={pendingAction !== null || selectedRemapProfileIsDefault}
                onClick={deleteButtonRemappingProfile}
              >
                <Trash2 size={15} />
                Delete Profile
              </button>
            </div>
          </div>
          <div className="remapping-layout" ref={remappingLayoutRef}>
            <svg className="remapping-callout-layer" aria-hidden="true">
              {remapCalloutLayout && (
                <g>
                  {REMAP_STANDARD_BUTTON_IDS.map((buttonId) => {
                    const remapped = remapDraft[buttonId] !== buttonId;
                    return (
                      <g key={buttonId} className={hoveredRemapButton === buttonId || remapped ? 'active' : undefined}>
                        <polyline
                          className="remapping-callout-underlay"
                          points={remapCalloutLayout[buttonId].points}
                        />
                        <polyline
                          className="remapping-callout-line"
                          points={remapCalloutLayout[buttonId].points}
                        />
                      </g>
                    );
                  })}
                </g>
              )}
              {showDualSenseEdgeRemapButtons && edgeRemapControlLayout && (
                <g>
                  {REMAP_EDGE_BUTTON_IDS.map((buttonId) => {
                    const remapped = remapDraft[buttonId] !== buttonId;
                    return (
                      <g key={buttonId} className={hoveredRemapButton === buttonId || remapped ? 'active' : undefined}>
                        <polyline
                          className="remapping-callout-underlay"
                          points={edgeRemapControlLayout[buttonId].linePoints}
                        />
                        <polyline
                          className="remapping-callout-line"
                          points={edgeRemapControlLayout[buttonId].linePoints}
                        />
                      </g>
                    );
                  })}
                </g>
              )}
            </svg>
            {showDualSenseEdgeRemapButtons && (
              <div className="remapping-edge-layer" aria-label="DualSense Edge button mappings">
                {REMAP_EDGE_BUTTON_IDS.map((buttonId) => {
                  const button = REMAP_BUTTONS[buttonId];
                  const targetOptions = remapTargetOptionsFor(buttonId);
                  const remapped = remapDraft[buttonId] !== buttonId;
                  const fallbackPoint = REMAP_EDGE_CONTROL_POINTS[buttonId];
                  const edgeLayout = edgeRemapControlLayout?.[buttonId];
                  const anchor = edgeLayout?.anchor ?? fallbackPoint.anchor;
                  return (
                    <div
                      className={`remapping-pill remapping-pill-edge remapping-pill-edge-compact remapping-edge-control remapping-edge-control-${anchor} ${remapped ? 'changed' : ''}`}
                      data-remap-button-id={buttonId}
                      key={buttonId}
                      onMouseEnter={() => setHoveredRemapButton(buttonId)}
                      onMouseLeave={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                      onFocusCapture={() => setHoveredRemapButton(buttonId)}
                      onBlurCapture={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                      style={{
                        left: edgeLayout ? `${edgeLayout.left}px` : `${(fallbackPoint.x / remappingLayoutAsset.viewBoxWidth) * 100}%`,
                        top: edgeLayout ? `${edgeLayout.top}px` : `${(fallbackPoint.y / remappingLayoutAsset.viewBoxHeight) * 100}%`
                      } as CSSProperties}
                    >
                      <CustomSelect
                        value={remapDraft[buttonId]}
                        options={targetOptions}
                        className="remapping-select remapping-edge-select"
                        showSelectedCheck={false}
                        ariaLabel={`${button.label} remap target`}
                        renderValue={(label, value) => <RemapGlyphOption label={label} value={value} />}
                        renderOption={(label, value) => <RemapGlyphOption label={label} value={value} />}
                        onChange={(value) => setButtonRemap(buttonId, value)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <div className="remapping-side remapping-side-left" ref={remappingLeftSideRef} aria-label="Left side button mappings">
              {REMAP_LEFT_BUTTON_IDS.map((buttonId) => {
                const button = REMAP_BUTTONS[buttonId];
                const targetOptions = remapTargetOptionsFor(buttonId);
                const remapped = remapDraft[buttonId] !== buttonId;
                return (
                  <div
                    className={`remapping-pill ${remapped ? 'changed' : ''}`}
                    data-remap-button-id={buttonId}
                    key={buttonId}
                    onMouseEnter={() => setHoveredRemapButton(buttonId)}
                    onMouseLeave={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                    onFocusCapture={() => setHoveredRemapButton(buttonId)}
                    onBlurCapture={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                    style={{
                      '--remapping-callout-top': remapCalloutLayout
                        ? `${remapCalloutLayout[buttonId].top}px`
                        : `${(remappingLayoutAsset.calloutY[buttonId] / remappingLayoutAsset.viewBoxHeight) * 100}%`
                    } as CSSProperties}
                  >
                    <span className="remapping-source">
                      <RemapSourceGlyph button={button} />
                    </span>
                    <span className="remapping-arrow" aria-hidden="true">
                      <ArrowRight size={15} />
                    </span>
                    <CustomSelect
                      value={remapDraft[buttonId]}
                      options={targetOptions}
                      className="remapping-select"
                      showSelectedCheck={false}
                      ariaLabel={`${button.label} remap target`}
                      renderValue={(label, value) => <RemapGlyphOption label={label} value={value} />}
                      renderOption={(label, value) => <RemapGlyphOption label={label} value={value} />}
                      onChange={(value) => setButtonRemap(buttonId, value)}
                    />
                  </div>
                );
              })}
            </div>
            <div className="remapping-controller-stage" aria-hidden="true">
              <img
                ref={remappingArtRef}
                className="remapping-controller-art"
                src={remappingLayoutAsset.src}
                alt=""
                style={{
                  '--remapping-art-aspect': remappingLayoutAsset.viewBoxWidth / remappingLayoutAsset.viewBoxHeight
                } as CSSProperties}
              />
            </div>
            <div className="remapping-side remapping-side-right" ref={remappingRightSideRef} aria-label="Right side button mappings">
              {REMAP_RIGHT_BUTTON_IDS.map((buttonId) => {
                const button = REMAP_BUTTONS[buttonId];
                const targetOptions = remapTargetOptionsFor(buttonId);
                const remapped = remapDraft[buttonId] !== buttonId;
                return (
                  <div
                    className={`remapping-pill ${remapped ? 'changed' : ''}`}
                    data-remap-button-id={buttonId}
                    key={buttonId}
                    onMouseEnter={() => setHoveredRemapButton(buttonId)}
                    onMouseLeave={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                    onFocusCapture={() => setHoveredRemapButton(buttonId)}
                    onBlurCapture={() => setHoveredRemapButton((current) => current === buttonId ? null : current)}
                    style={{
                      '--remapping-callout-top': remapCalloutLayout
                        ? `${remapCalloutLayout[buttonId].top}px`
                        : `${(remappingLayoutAsset.calloutY[buttonId] / remappingLayoutAsset.viewBoxHeight) * 100}%`
                    } as CSSProperties}
                  >
                    <span className="remapping-source">
                      <RemapSourceGlyph button={button} />
                    </span>
                    <span className="remapping-arrow" aria-hidden="true">
                      <ArrowRight size={15} />
                    </span>
                    <CustomSelect
                      value={remapDraft[buttonId]}
                      options={targetOptions}
                      className="remapping-select"
                      showSelectedCheck={false}
                      ariaLabel={`${button.label} remap target`}
                      renderValue={(label, value) => <RemapGlyphOption label={label} value={value} />}
                      renderOption={(label, value) => <RemapGlyphOption label={label} value={value} />}
                      onChange={(value) => setButtonRemap(buttonId, value)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </section>
    </div>
  );
}
