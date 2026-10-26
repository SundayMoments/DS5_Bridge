import type { CSSProperties } from 'react';
import { IconViewfinder } from '@tabler/icons-react';
import { RADIAL_DEADZONE_MAX_PERCENT } from '@shared/protocol';
import type { BridgeSnapshot } from '@shared/types';
import { FeatureTipsPanel } from '../../common/FeatureTipsPanel';
import { sliderTickClass } from '../../common/slider-ticks';
import { radialDeadzonePreview, stickPositionPercent } from './radial-deadzone-preview';
import type { StickDeadzonesController } from './use-stick-deadzones-controller';

const RADIAL_DEADZONE_PRESETS = [0, 5, 10, 20] as const;
const RADIAL_DEADZONE_TICKS = Array.from({ length: 11 }, (_, index) => index * 5);

export interface StickDeadzonesPageProps {
  readonly active: boolean;
  readonly controller: StickDeadzonesController;
  readonly stickInputPreview: BridgeSnapshot['stickInputPreview'];
  /** Controls lock while the controller is away or another command runs. */
  readonly locked: boolean;
}

export function StickDeadzonesPage({ active, controller, stickInputPreview, locked }: StickDeadzonesPageProps) {
  return (
    <div
      className={`control-page deadzones-page ${active ? 'active' : ''}`}
      role="tabpanel"
      id="control-panel-deadzones"
      aria-labelledby="control-tab-deadzones"
      aria-hidden={!active}
    >
      <div className="feature-heading">
        <div>
          <h2>Stick Deadzones</h2>
          <p>Remove center drift with independent radial deadzones for each stick.</p>
        </div>
      </div>

      <div className="feature-card-grid deadzones-grid">
        {(['left', 'right'] as const).map((side) => {
          const value = controller.values[side];
          const label = side === 'left' ? 'Left Stick' : 'Right Stick';
          const rawAxes = stickInputPreview?.raw;
          const livePreview = rawAxes
            ? radialDeadzonePreview(
                side === 'left' ? rawAxes.lx : rawAxes.rx,
                side === 'left' ? rawAxes.ly : rawAxes.ry,
                value
              )
            : null;
          const disabled = locked || controller.commitPending;
          return (
            <section className="feature-card deadzone-card" key={side}>
              <div className="feature-card-title">
                <span className="feature-icon"><IconViewfinder size={20} /></span>
                <div className="title-copy">
                  <h3>{label}</h3>
                  <p>Circular center filtering with full-range rescaling.</p>
                </div>
              </div>

              <div className="deadzone-stick-preview">
                <div
                  className="deadzone-stick-field"
                  role="img"
                  aria-label={`${label} physical and deadzone-adjusted output position`}
                  style={{ '--deadzone-diameter': `${Math.max(3, value)}%` } as CSSProperties}
                >
                  <span className="deadzone-axis horizontal" />
                  <span className="deadzone-axis vertical" />
                  <span className="deadzone-radius" />
                  {livePreview ? (
                    <>
                      <span
                        className="deadzone-position-dot output"
                        style={stickPositionPercent(livePreview.output)}
                      />
                      <span
                        className="deadzone-position-dot physical"
                        style={stickPositionPercent(livePreview.physical)}
                      />
                    </>
                  ) : <span className="deadzone-center" />}
                </div>
                <div className="deadzone-preview-copy">
                  <strong>{value}%</strong>
                  <span>{value === 0 ? 'Native input' : 'Center radius'}</span>
                  <div className="deadzone-position-legend" aria-label="Stick position legend">
                    <span><i className="physical" />Physical</span>
                    <span><i className="output" />Output</span>
                  </div>
                </div>
              </div>

              <label className={`slider-row deadzone-slider-row ${disabled ? 'disabled' : ''}`}>
                <span>Radius</span>
                <div className="range-control">
                  <input
                    aria-label={`${label} radial deadzone`}
                    type="range"
                    min={0}
                    max={RADIAL_DEADZONE_MAX_PERCENT}
                    step={1}
                    value={value}
                    disabled={disabled}
                    style={{ '--range-fill': `${value * 2}%` } as CSSProperties}
                    onChange={(event) => controller.preview(side, Number(event.target.value))}
                    onPointerUp={(event) => void controller.commit(side, Number(event.currentTarget.value))}
                    onKeyUp={(event) => {
                      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
                        void controller.commit(side, Number(event.currentTarget.value));
                      }
                    }}
                    onBlur={(event) => void controller.commit(side, Number(event.currentTarget.value))}
                  />
                  <div className="range-ticks" aria-hidden="true">
                    {RADIAL_DEADZONE_TICKS.map((tick) => (
                      <span key={tick} className={sliderTickClass(tick, RADIAL_DEADZONE_MAX_PERCENT)} />
                    ))}
                  </div>
                </div>
                <strong>{value}%</strong>
              </label>

              <div className="segmented-row deadzone-presets" aria-label={`${label} deadzone presets`}>
                {RADIAL_DEADZONE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className={value === preset ? 'active' : ''}
                    disabled={disabled}
                    onClick={() => {
                      controller.preview(side, preset);
                      void controller.commit(side, preset);
                    }}
                  >
                    {preset === 0 ? 'Off' : `${preset}%`}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <FeatureTipsPanel tab="deadzones" />
    </div>
  );
}
