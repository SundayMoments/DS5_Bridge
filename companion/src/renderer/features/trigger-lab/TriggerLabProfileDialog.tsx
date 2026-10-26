import {
  IconDeviceFloppy as Save,
  IconTrash as Trash2,
  IconX as X
} from '@tabler/icons-react';
import type { TriggerLabController } from './use-trigger-lab-controller';

export interface TriggerLabProfileDialogProps {
  readonly lab: TriggerLabController;
  readonly pendingAction: string | null;
}

/** Saves, renames, or deletes a custom Trigger Lab profile. */
export function TriggerLabProfileDialog({ lab, pendingAction }: TriggerLabProfileDialogProps) {
  const {
    triggerLabProfileDialog,
    triggerLabProfileNameDraft,
    setTriggerLabProfileNameDraft,
    triggerLabDrafts,
    triggerLabProfileName,
    closeTriggerLabProfileDialog,
    submitTriggerLabProfileDialog
  } = lab;

  return (
    <>
    {triggerLabProfileDialog && (
      <div
        className="modal-backdrop"
        role="presentation"
        onMouseDown={closeTriggerLabProfileDialog}
      >
        <form
          className="settings-menu bridge-settings-modal remap-profile-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Trigger Lab profile"
          onMouseDown={(event) => event.stopPropagation()}
          onSubmit={(event) => {
            event.preventDefault();
            submitTriggerLabProfileDialog();
          }}
        >
          <div className="settings-menu-heading bridge-settings-modal-heading">
            <div className="modal-heading-copy">
              {triggerLabProfileDialog.mode === 'delete' ? <Trash2 size={16} /> : <Save size={16} />}
              <span>
                {triggerLabProfileDialog.mode === 'save'
                  ? 'Save Trigger Profile'
                  : triggerLabProfileDialog.mode === 'rename'
                    ? 'Rename Trigger Profile'
                    : 'Delete Trigger Profile'}
              </span>
            </div>
            <button
              className="modal-close-button"
              type="button"
              aria-label="Close Trigger Lab profile dialog"
              onClick={closeTriggerLabProfileDialog}
            >
              <X size={16} />
            </button>
          </div>
          {triggerLabProfileDialog.mode === 'delete' ? (
            <p className="remap-profile-dialog-copy">
              Delete {triggerLabProfileName(triggerLabDrafts[triggerLabProfileDialog.side].profileId)}?
            </p>
          ) : (
            <label className="remap-profile-name-field">
              <span>Profile Name</span>
              <input
                autoFocus
                value={triggerLabProfileNameDraft}
                maxLength={48}
                onChange={(event) => setTriggerLabProfileNameDraft(event.target.value)}
              />
            </label>
          )}
          <div className="remap-profile-dialog-actions">
            <button type="button" className="secondary-action" onClick={closeTriggerLabProfileDialog}>
              Cancel
            </button>
            <button
              type="submit"
              className={`primary-action ${triggerLabProfileDialog.mode === 'delete' ? 'danger' : ''}`}
              disabled={pendingAction !== null || (triggerLabProfileDialog.mode !== 'delete' && triggerLabProfileNameDraft.trim().length === 0)}
            >
              {triggerLabProfileDialog.mode === 'delete' ? 'Delete' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    )}

    </>
  );
}
