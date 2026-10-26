import type { CSSProperties } from 'react';
import { sliderTickClass } from '../../common/slider-ticks';
import { TRIGGER_LAB_SLIDER_STEP, TRIGGER_LAB_SLIDER_TICKS, snapTriggerLabPercent } from './model';

export type TriggerLabMeterProps = {
  label: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
};

export function TriggerLabMeter({ label, value, disabled = false, onChange, onCommit }: TriggerLabMeterProps) {
  function commitValue(element: HTMLInputElement) {
    onCommit(snapTriggerLabPercent(Number(element.value)));
  }

  return (
    <div className="range-control trigger-lab-meter">
      <input
        type="range"
        min="0"
        max="100"
        step={TRIGGER_LAB_SLIDER_STEP}
        value={value}
        disabled={disabled}
        aria-label={label}
        style={{ '--range-fill': `${value}%` } as CSSProperties}
        onChange={(event) => onChange(snapTriggerLabPercent(Number(event.currentTarget.value)))}
        onBlur={(event) => commitValue(event.currentTarget)}
        onKeyUp={(event) => commitValue(event.currentTarget)}
        onPointerCancel={(event) => commitValue(event.currentTarget)}
        onPointerUp={(event) => commitValue(event.currentTarget)}
      />
      <div className="range-ticks" aria-hidden="true">
        {TRIGGER_LAB_SLIDER_TICKS.map((tick) => (
          <span key={tick} className={sliderTickClass(tick, 100)} />
        ))}
      </div>
    </div>
  );
}
