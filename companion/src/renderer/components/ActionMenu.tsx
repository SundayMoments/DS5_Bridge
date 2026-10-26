import { IconDots } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState } from 'react';
import './action-menu.css';

interface ActionMenuItem {
  label: string;
  danger?: boolean;
  onSelect: () => void;
}

export function ActionMenu({ label, disabled = false, items }: {
  label: string;
  disabled?: boolean;
  items: ActionMenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const visible = open && !disabled;

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!visible) return;
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [visible]);

  function closeAndFocusTrigger() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div ref={rootRef} className="action-menu" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }} onKeyDown={(event) => {
      if (event.key === 'Escape' && visible) {
        event.preventDefault();
        event.stopPropagation();
        closeAndFocusTrigger();
      }
    }}>
      <button ref={triggerRef} type="button" className="heading-icon-action action-menu-trigger"
        id={`${id}-trigger`} aria-label={label} title={label} aria-haspopup="menu"
        aria-expanded={visible} aria-controls={visible ? `${id}-menu` : undefined}
        disabled={disabled} onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
          }
        }}>
        <IconDots size={20} aria-hidden="true" />
      </button>
      {visible ? <div ref={menuRef} id={`${id}-menu`} role="menu"
        aria-labelledby={`${id}-trigger`} className="action-menu-popup" onKeyDown={(event) => {
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
          const current = buttons.indexOf(event.target as HTMLButtonElement);
          let next: number;
          switch (event.key) {
            case 'ArrowDown': next = (current + 1) % buttons.length; break;
            case 'ArrowUp': next = (current - 1 + buttons.length) % buttons.length; break;
            case 'Home': next = 0; break;
            case 'End': next = buttons.length - 1; break;
            default: return;
          }
          event.preventDefault();
          buttons[next]?.focus();
        }}>
        {items.map((item) => <button key={item.label} type="button" role="menuitem" tabIndex={-1}
          className={item.danger ? 'danger' : undefined} onClick={() => {
            closeAndFocusTrigger();
            item.onSelect();
          }}>{item.label}</button>)}
      </div> : null}
    </div>
  );
}
