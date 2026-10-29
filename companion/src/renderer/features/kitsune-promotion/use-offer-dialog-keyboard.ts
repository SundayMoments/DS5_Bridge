import { useEffect, useRef, type RefObject } from 'react';

/**
 * Keyboard handling for the Kitsune Input dialogs: focus moves to the dialog
 * when it opens, Tab and Shift+Tab stay inside it, Escape closes it, and focus
 * returns to where it was when it closes.
 */
export function useOfferDialogKeyboard(dialogRef: RefObject<HTMLElement | null>, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]')];
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const active = document.activeElement;
      const outside = !dialog.contains(active);
      if (event.shiftKey && (outside || active === dialog || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      previous?.focus({ preventScroll: true });
    };
  }, [dialogRef]);
}
