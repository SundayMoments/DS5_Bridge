import { IconQuestionMark } from '@tabler/icons-react';

/** A focusable field label that shows its tooltip on hover or focus. */
export function AudioHapticsConfigLabel({
  id,
  label,
  tooltip,
  className = '',
  showQuestionMark = false
}: {
  id: string;
  label: string;
  tooltip: string;
  className?: string;
  showQuestionMark?: boolean;
}) {
  return (
    <span className={`audio-haptics-config-label ${className}`.trim()} tabIndex={0} aria-describedby={id}>
      {label}
      {showQuestionMark ? <IconQuestionMark size={12} stroke={3} aria-hidden="true" /> : null}
      <span id={id} className="settings-shortcut-tooltip shortcut-glyph-tooltip audio-haptics-config-tooltip" role="tooltip">
        {tooltip}
      </span>
    </span>
  );
}
