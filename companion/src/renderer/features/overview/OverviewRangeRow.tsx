import type { CSSProperties, RefObject } from 'react';
import { sliderTickClass } from '../../common/slider-ticks';

const RANGE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End']);

export interface OverviewRangeRowProps {
  readonly label: string;
  readonly value: number;
  readonly max: number;
  readonly step: number;
  readonly disabled: boolean;
  readonly ticks: readonly number[];
  /** The value the tick marks are laid out against; the slider can stop short of it while power saving caps it. */
  readonly tickMax: number;
  /** Set while the user drags or steps, so new snapshots do not move the thumb under them. */
  readonly editingRef: RefObject<boolean>;
  readonly onChange: (value: number) => void;
  readonly onCommit: () => void;
}

/** One Quick Controls slider: it previews while moving and writes on release, key up, or blur. */
export function OverviewRangeRow({
  label,
  value,
  max,
  step,
  disabled,
  ticks,
  tickMax,
  editingRef,
  onChange,
  onCommit
}: OverviewRangeRowProps) {
  return (
    <label className={`overview-slider-row ${disabled ? 'disabled' : ''}`}>
      <span>{label}</span>
      <div className="overview-range-control">
        <input
          type="range"
          min="0"
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          style={{ '--range-fill': `${(value / max) * 100}%` } as CSSProperties}
          onPointerDown={() => {
            editingRef.current = true;
          }}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          onPointerUp={onCommit}
          onKeyDown={(event) => {
            if (RANGE_KEYS.has(event.key)) {
              editingRef.current = true;
            }
          }}
          onKeyUp={(event) => {
            if (RANGE_KEYS.has(event.key)) {
              onCommit();
            }
          }}
          onBlur={onCommit}
        />
        <div className="overview-range-ticks" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} className={sliderTickClass(tick, tickMax)} />
          ))}
        </div>
      </div>
      <strong>{value}%</strong>
    </label>
  );
}
