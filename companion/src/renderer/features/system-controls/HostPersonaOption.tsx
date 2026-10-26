import type { CSSProperties } from 'react';
import { IconBrandXbox } from '@tabler/icons-react';
import type { HostPersonaMode } from '@shared/protocol';
import playStationLogoUrl from '@product-assets/brand/playstation-logo.svg';

/** A host persona in the Host Controller menu, with its platform mark. */
export function HostPersonaOption({ label, value }: { label: string; value: HostPersonaMode }) {
  const sonyPersona = value === 'dualsense' || value === 'dualsense-edge' || value === 'ds4';
  return (
    <span className="host-persona-option">
      {sonyPersona ? (
        <span
          className="host-persona-brand-icon"
          style={{ '--host-persona-brand-mask': `url("${playStationLogoUrl}")` } as CSSProperties}
          aria-hidden="true"
        />
      ) : (
        <IconBrandXbox size={18} aria-hidden="true" />
      )}
      <span className="host-persona-label">{label}</span>
    </span>
  );
}
