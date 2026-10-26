import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export function ModalDialog({ children, className, labelledBy, busy, onClose, returnFocusRef }: {
  children: ReactNode;
  className: string;
  labelledBy: string;
  busy: boolean;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const latest = useRef({ busy, onClose });
  latest.current = { busy, onClose };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusable = () => [...(dialog.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled):not([type="file"]), [tabindex="0"]'
    ) ?? [])].filter(element => !element.closest('[inert], [hidden]'));
    (focusable()[0] ?? dialog.current)?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!latest.current.busy) latest.current.onClose();
      } else if (event.key === 'Tab') {
        const items = focusable(), first = items[0], last = items.at(-1);
        if (!first) { event.preventDefault(); dialog.current?.focus(); }
        else if (event.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      (returnFocusRef.current ?? previous)?.focus({ preventScroll: true });
    };
  }, [returnFocusRef]);
  return createPortal(<div className="modal-backdrop" role="presentation"
    onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div ref={dialog} className={`settings-menu bridge-settings-modal ${className}`}
      role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1}>
      {children}
    </div>
  </div>, document.querySelector('.shell') ?? document.body);
}
