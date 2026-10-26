import { useId, type ReactNode } from 'react';
import './labeled-switch.css';

/** A text label with the app's standard switch, for compact option rows. */
export function LabeledSwitch({ label, checked, disabled = false, ariaLabel, className, onChange }: {
  label: ReactNode;
  checked: boolean;
  disabled?: boolean;
  /** Overrides the visible label when it is ambiguous out of context. */
  ariaLabel?: string;
  className?: string;
  onChange: (checked: boolean) => void;
}) {
  const labelId = useId();
  return (
    <div className={`labeled-switch${className ? ` ${className}` : ''}`}>
      <span id={labelId}>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        {...(ariaLabel ? { 'aria-label': ariaLabel } : { 'aria-labelledby': labelId })}
        className={`switch ${checked ? 'on' : ''}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  );
}
