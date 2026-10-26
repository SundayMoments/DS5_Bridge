import {
  IconDeviceFloppy as Save,
  IconTrash as Trash2,
  IconX as X
} from '@tabler/icons-react';
import type { ButtonRemappingController } from './use-button-remapping-controller';

export interface ButtonRemappingProfileDialogProps {
  readonly controller: ButtonRemappingController;
  readonly pendingAction: string | null;
}

/** Saves, renames, or deletes a button remapping profile. */
export function ButtonRemappingProfileDialog({ controller, pendingAction }: ButtonRemappingProfileDialogProps) {
  const {
    remapProfileDialogMode,
    remapProfileNameDraft,
    setRemapProfileNameDraft,
    selectedRemapProfile,
    closeRemapProfileDialog,
    submitRemapProfileDialog
  } = controller;

  return (
    <>
      {remapProfileDialogMode && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={closeRemapProfileDialog}
        >
          <form
            className="settings-menu bridge-settings-modal remap-profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Button remapping profile"
            onMouseDown={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              submitRemapProfileDialog();
            }}
          >
            <div className="settings-menu-heading bridge-settings-modal-heading">
              <div className="modal-heading-copy">
                {remapProfileDialogMode === 'delete' ? <Trash2 size={16} /> : <Save size={16} />}
                <span>
                  {remapProfileDialogMode === 'save'
                    ? 'Save New Profile'
                    : remapProfileDialogMode === 'rename'
                      ? 'Rename Profile'
                      : 'Delete Profile'}
                </span>
              </div>
              <button
                className="modal-close-button"
                type="button"
                aria-label="Close profile dialog"
                onClick={closeRemapProfileDialog}
              >
                <X size={16} />
              </button>
            </div>
            {remapProfileDialogMode === 'delete' ? (
              <p className="remap-profile-dialog-copy">
                Delete {selectedRemapProfile?.name ?? 'this profile'}?
              </p>
            ) : (
              <label className="remap-profile-name-field">
                <span>Profile Name</span>
                <input
                  autoFocus
                  value={remapProfileNameDraft}
                  maxLength={48}
                  onChange={(event) => setRemapProfileNameDraft(event.target.value)}
                />
              </label>
            )}
            <div className="remap-profile-dialog-actions">
              <button type="button" className="secondary-action" onClick={closeRemapProfileDialog}>
                Cancel
              </button>
              <button
                type="submit"
                className={`primary-action ${remapProfileDialogMode === 'delete' ? 'danger' : ''}`}
                disabled={pendingAction !== null || (remapProfileDialogMode !== 'delete' && remapProfileNameDraft.trim().length === 0)}
              >
                {remapProfileDialogMode === 'delete' ? 'Delete' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

    </>
  );
}
