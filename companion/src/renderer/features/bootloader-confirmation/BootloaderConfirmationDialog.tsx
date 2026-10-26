import { useEffect, useMemo, useRef, useState } from 'react';
import { IconClockHour4, IconShieldLock, IconX as X } from '@tabler/icons-react';
import type { BootloaderConfirmationPresentation } from '@shared/types';
import { FaceButtonGlyph } from './FaceButtonGlyph';
import { INCORRECT_FLASH_MS, confirmationStepState, secondsUntil } from './model';
import './bootloader-confirmation.css';

export interface BootloaderConfirmationDialogProps {
  /** The pending confirmation from the snapshot; the dialog renders nothing without one. */
  readonly confirmation: BootloaderConfirmationPresentation | null | undefined;
  readonly onCancel: () => void;
}

/**
 * Shown over every page while the bridge waits for the face-button sequence
 * that allows UF2 mode, or that pairs this computer with the bridge the first
 * time. Cancelling stops the pending Mount, Flash, or Nuke action.
 */
export function BootloaderConfirmationDialog({ confirmation, onCancel }: BootloaderConfirmationDialogProps) {
  if (!confirmation) return null;
  return <PendingConfirmation confirmation={confirmation} onCancel={onCancel} />;
}

function PendingConfirmation({ confirmation, onCancel }: {
  readonly confirmation: BootloaderConfirmationPresentation;
  readonly onCancel: () => void;
}) {
  const { purpose, sequence, progress, mistakes, expiresAtUnixMs } = confirmation;
  const [now, setNow] = useState(() => Date.now());
  // When this deadline was first seen; the time bar drains from there.
  const shownAt = useMemo(() => Date.now(), [expiresAtUnixMs]);
  const [incorrect, setIncorrect] = useState(false);
  const mistakesRef = useRef(mistakes);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [expiresAtUnixMs]);

  useEffect(() => {
    const previous = mistakesRef.current;
    mistakesRef.current = mistakes;
    if (mistakes <= previous) return undefined;
    setIncorrect(true);
    const timer = window.setTimeout(() => setIncorrect(false), INCORRECT_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [mistakes]);

  useEffect(() => {
    dialogRef.current?.focus();
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelRef.current();
    };
    document.addEventListener('keydown', cancelOnEscape);
    return () => document.removeEventListener('keydown', cancelOnEscape);
  }, []);

  const enrollment = purpose === 'enrollment';
  const secondsRemaining = secondsUntil(expiresAtUnixMs, now);
  const totalMs = Math.max(1, expiresAtUnixMs - shownAt);
  const remainingFraction = Math.min(1, Math.max(0, (expiresAtUnixMs - now) / totalMs));
  const title = enrollment ? "Confirm it's you" : 'Confirm UF2 update mode';

  return (
    <div className="modal-backdrop bootloader-confirmation-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className={`settings-menu bridge-settings-modal bootloader-confirmation-modal ${incorrect ? 'incorrect' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bootloader-confirmation-title"
        aria-describedby="bootloader-confirmation-instructions"
        data-purpose={purpose}
        tabIndex={-1}
      >
        <div className="settings-menu-heading bridge-settings-modal-heading">
          <div className="modal-heading-copy">
            <IconShieldLock size={16} />
            <span>{enrollment ? 'Pair This PC' : 'UF2 Update Mode'}</span>
          </div>
          <button
            className="modal-close-button"
            type="button"
            aria-label="Cancel controller confirmation"
            title="Cancel"
            onClick={onCancel}
          >
            <X size={16} />
          </button>
        </div>

        <div className="bootloader-confirmation-copy">
          <h2 id="bootloader-confirmation-title">{title}</h2>
          {enrollment ? (
            <p>This pairs this PC with the bridge so only DS5 Bridge on this computer can put it into update mode.</p>
          ) : null}
          <p id="bootloader-confirmation-instructions">
            Press these buttons in order on the controller connected to the bridge.
          </p>
        </div>

        <ol className="bootloader-confirmation-sequence" aria-label="Button sequence">
          {sequence.map((button, index) => {
            const state = confirmationStepState(index, progress);
            return (
              <li
                key={`${index}-${button}`}
                className={`bootloader-confirmation-step ${state}`}
                data-step-state={state}
                aria-current={state === 'current' ? 'step' : undefined}
              >
                <span className="bootloader-confirmation-step-number" aria-hidden="true">{index + 1}</span>
                <FaceButtonGlyph button={button} />
              </li>
            );
          })}
        </ol>

        <div className="bootloader-confirmation-time" aria-hidden="true">
          <span style={{ transform: `scaleX(${remainingFraction})` }} />
        </div>

        <div className="bootloader-confirmation-status">
          <span className="bootloader-confirmation-progress" role="status">
            {incorrect ? 'Incorrect, start again' : `${progress} of ${sequence.length} entered`}
          </span>
          <span className={`bootloader-confirmation-countdown ${secondsRemaining <= 10 ? 'urgent' : ''}`}>
            <IconClockHour4 size={15} aria-hidden="true" />
            {`${secondsRemaining}s left`}
          </span>
        </div>

        <div className="bootloader-confirmation-footer">
          <p className="bootloader-confirmation-hint">No controller? Hold BOOTSEL while plugging in the Pico.</p>
          <button type="button" className="secondary-action" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </section>
    </div>
  );
}
