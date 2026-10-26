import { useEffect, useState } from 'react';

/** The window counts as hidden while it is minimized or in the tray. */
export function documentHidden(): boolean {
  return document.visibilityState === 'hidden';
}

/** True while the window is on screen; polling and timers pause when it is not. */
export function useDocumentVisible(): boolean {
  const [visible, setVisible] = useState(() => !documentHidden());

  useEffect(() => {
    const update = () => setVisible(!documentHidden());
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return visible;
}
