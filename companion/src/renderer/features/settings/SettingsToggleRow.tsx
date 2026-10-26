import { useId, type ReactNode } from 'react';
import { HelpTooltip } from '../../components/HelpTooltip';

interface ToggleRowProps {
  readonly label: ReactNode;
  readonly description?: ReactNode;
  readonly tooltip?: ReactNode;
  readonly tooltipId?: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly unavailableReason?: string;
  readonly pending?: boolean;
  readonly highlighted?: boolean;
  readonly className?: string;
  readonly title?: string;
  readonly onToggle: () => void;
}

export function ToggleRow({
  label, description, tooltip, tooltipId, checked, disabled,
  pending = false, highlighted = false, className, title, onToggle, unavailableReason
}: ToggleRowProps) {
  const labelId = useId();
  const reasonId = useId();
  const generatedTooltipId = useId();
  const resolvedTooltipId = tooltip ? tooltipId ?? generatedTooltipId : undefined;
  const nativeControlFallback = typeof tooltip === 'string' ? tooltip : undefined;
  return (
    <div className={`settings-menu-row${className ? ` ${className}` : ''}${highlighted ? ' settings-menu-row-highlight' : ''}`}>
      <div className="settings-menu-copy">
        <strong id={labelId}>{tooltip ? <HelpTooltip id={resolvedTooltipId} label={label} tooltip={tooltip} /> : label}</strong>
        {description ? <span>{description}</span> : null}
        {disabled && unavailableReason ? <span id={reasonId} className="settings-unavailable-reason">{unavailableReason}</span> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-labelledby={labelId}
        aria-describedby={disabled && unavailableReason ? reasonId : resolvedTooltipId}
        aria-checked={checked}
        className={`switch ${checked ? 'on' : ''}${pending ? ' settings-pending-control' : ''}`}
        disabled={disabled}
        title={title ?? nativeControlFallback}
        onClick={onToggle}
      >
        <span />
      </button>
    </div>
  );
}
