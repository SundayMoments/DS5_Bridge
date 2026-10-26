import {
  IconPencil as Pencil,
  IconTrash as Trash2,
  IconX as X
} from '@tabler/icons-react';
import type { ChordsController } from './use-chords-controller';
import { MAX_CHORD_FUNCTION_NAME_LENGTH } from '@shared/protocol';

export interface ChordFunctionDialogProps {
  readonly controller: ChordsController;
  readonly pendingAction: string | null;
}

/** Renames or deletes a chord function. */
export function ChordFunctionDialog({ controller, pendingAction }: ChordFunctionDialogProps) {
  const {
    chordFunctionDialog,
    chordFunctionNameDraft,
    setChordFunctionNameDraft,
    chordFunctionDialogFunction,
    closeChordFunctionDialog,
    submitChordFunctionDialog
  } = controller;

  return (
    <>
      {chordFunctionDialog && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeChordFunctionDialog}
        >
          <form
            className="settings-menu bridge-settings-modal remap-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Chord function"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              submitChordFunctionDialog();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                {chordFunctionDialog.mode === 'delete' ? <Trash2 size={16} /> : <Pencil size={16} />}
                <span>
                  {chordFunctionDialog.mode === 'delete' ? 'Delete Function' : 'Rename Function'}
                </span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close chord function dialog"
                onClick={closeChordFunctionDialog}
              >
                <X size={16} />
              </button>
            </div>
            {chordFunctionDialog.mode === 'delete' ? (
              <p className="remap-profile-dialog-copy">
                Delete {chordFunctionDialogFunction?.name ?? 'this function'}?
              </p>
            ) : (
              <label className="remap-profile-name-field">
                <span>Function Name</span>
                <input
                  autoFocus
                  value={chordFunctionNameDraft}
                  maxLength={MAX_CHORD_FUNCTION_NAME_LENGTH}
                  onChange={(event) => setChordFunctionNameDraft(event.target.value)}
                />
              </label>
            )}
            <div className="remap-profile-dialog-actions">
              <button type="button" className="secondary-action" onClick={closeChordFunctionDialog}>
                Cancel
              </button>
              <button
                type="submit"
                className={`primary-action ${chordFunctionDialog.mode === 'delete' ? 'danger' : ''}`}
                disabled={pendingAction !== null || (chordFunctionDialog.mode !== 'delete' && chordFunctionNameDraft.trim().length === 0)}
              >
                {chordFunctionDialog.mode === 'delete' ? 'Delete' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

    </>
  );
}
