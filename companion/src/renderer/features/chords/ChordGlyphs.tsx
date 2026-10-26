import { IconQuestionMark } from '@tabler/icons-react';
import type { ChordStarterId } from '@shared/protocol';
import { RemapGlyphOption } from '../button-remapping/remap-buttons';
import { CHORD_STARTERS, CHORD_UNASSIGNED_BUTTON, type ChordButtonSelectValue } from './model';

export function ChordStarterGlyph({ starter, label = CHORD_STARTERS[starter].label }: { starter: ChordStarterId; label?: string }) {
  const button = CHORD_STARTERS[starter];
  const Icon = button.Icon;

  return Icon ? (
    <span className="chords-unassigned-glyph chords-starter-icon-glyph" title={label} aria-label={label}>
      <Icon size={18} />
    </span>
  ) : button.glyphUrl ? (
    <img src={button.glyphUrl} alt={label} title={label} />
  ) : (
    <span className="remap-text-glyph remap-text-glyph-source" title={label}>
      {button.textGlyph ?? button.label}
    </span>
  );
}

export function ChordStarterGlyphOption({ label, value }: { label: string; value: ChordStarterId }) {
  return (
    <span className="chords-starter-glyph-option" title={label}>
      <ChordStarterGlyph starter={value} label={label} />
    </span>
  );
}

export function ChordButtonGlyphOption({ label, value }: { label: string; value: ChordButtonSelectValue }) {
  if (value === CHORD_UNASSIGNED_BUTTON) {
    return (
      <span className="chords-unassigned-glyph" title={label} aria-label={label}>
        <IconQuestionMark size={16} />
      </span>
    );
  }

  return <RemapGlyphOption label={label} value={value} />;
}
