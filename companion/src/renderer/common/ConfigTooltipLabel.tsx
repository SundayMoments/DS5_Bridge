import { HelpTooltip } from '../components/HelpTooltip';

/** A field label that explains its setting in the shared help popup. */
export function ConfigTooltipLabel({
  id,
  label,
  tooltip,
  className,
  showQuestionMark = true
}: {
  readonly id: string;
  readonly label: string;
  readonly tooltip: string;
  readonly className?: string;
  readonly showQuestionMark?: boolean;
}) {
  return (
    <HelpTooltip id={id} label={label} tooltip={tooltip} icon={showQuestionMark}
      className={`config-tooltip-label ${className ?? ''}`.trim()} />
  );
}
