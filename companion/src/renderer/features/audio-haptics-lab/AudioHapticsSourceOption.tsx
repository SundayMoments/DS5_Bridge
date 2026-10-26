import { IconBrandDeezer, IconDeviceAudioTape } from '@tabler/icons-react';
import type { AudioHapticsSession } from '@shared/types';

/** A source in the Audio Haptics source menu: the system mix or one app's audio session. */
export function AudioHapticsSourceOption({
  label,
  value,
  session,
  loading
}: {
  readonly label: string;
  readonly value: string;
  readonly session?: AudioHapticsSession;
  readonly loading?: boolean;
}) {
  const system = value === 'system-audio';
  const unavailable = !system && !session;
  let sublabel = 'System mix';
  if (!system) {
    if (!session) {
      sublabel = loading ? 'Scanning' : 'Unavailable';
    } else {
      sublabel = session.state === 'active'
        ? session.endpointName || 'Active'
        : 'Idle';
    }
  }
  return (
    <span className={`audio-haptics-source-option ${unavailable ? 'unavailable' : ''}`}>
      <span className="audio-haptics-source-icon" aria-hidden="true">
        {system ? (
          <IconDeviceAudioTape size={17} />
        ) : session?.iconDataUrl ? (
          <img src={session.iconDataUrl} alt="" />
        ) : (
          <IconBrandDeezer size={17} />
        )}
      </span>
      <span className="audio-haptics-source-copy">
        {/* App names and audio endpoint names come from Windows and stay literal. */}
        <strong data-l10n={session ? 'off' : undefined}>{label}</strong>
        <small data-l10n={session?.state === 'active' && session.endpointName ? 'off' : undefined}>{sublabel}</small>
      </span>
    </span>
  );
}
