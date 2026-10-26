import { IconCheck as Check } from '@tabler/icons-react';

export function ProfileSaveStatus() {
  return (
    <div className="system-profile-save-status">
      <span className="autosave-check-icon" aria-hidden="true">
        <Check className="autosave-check-outline" size={16} />
        <Check className="autosave-check-fill" size={16} />
      </span>
      <span>Changes Are Automatically Saved</span>
    </div>
  );
}
