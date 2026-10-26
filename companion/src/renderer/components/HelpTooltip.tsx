import {
  useEffect, useId, useLayoutEffect, useRef, useState,
  type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject
} from 'react';
import { createPortal } from 'react-dom';
import { IconQuestionMark } from '@tabler/icons-react';
import './help-tooltip.css';

interface HelpTooltipProps {
  /** What the popup explains. */
  readonly tooltip: ReactNode;
  /**
   * Text that opens the popup, drawn with a dotted underline and a question
   * mark. Leave it out to wrap a control that is already focusable instead.
   */
  readonly label?: ReactNode;
  /** The wrapped control when there is no label. */
  readonly children?: ReactNode;
  /** The popup's id, for a wrapped control's aria-describedby. */
  readonly id?: string;
  readonly className?: string;
  /** Shows the question mark after the label. */
  readonly icon?: boolean;
  /** Popup width in pixels, or 'auto' to fit short content. */
  readonly width?: number | 'auto';
}

interface PopupPlacement {
  readonly left: number;
  readonly top: number;
  readonly caret: number;
  readonly side: 'above' | 'below';
}

const GAP = 10;
const EDGE = 8;
// Matches the content padding of rows and cards, so the popup lines up with their text.
const INSET = 16;

function scrollAreaTop(element: HTMLElement): number {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node.getBoundingClientRect().top;
  }
  return EDGE;
}

/** The nearest bordered or filled surface around the trigger that fits the popup. */
function surroundingSurface(trigger: HTMLElement, width: number): { left: number; right: number } {
  for (let node = trigger.parentElement; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    const surface = Number.parseFloat(style.borderTopWidth) > 0
      || (style.backgroundColor !== 'transparent' && style.backgroundColor !== 'rgba(0, 0, 0, 0)');
    const rect = node.getBoundingClientRect();
    if (surface && rect.width >= width + INSET * 2) return rect;
  }
  return { left: 0, right: window.innerWidth };
}

/**
 * Keeps an open popup next to its trigger: above it when the scroll area has
 * room, otherwise the same distance below it. It centres on the question mark, or
 * on a wrapped control, and stays inside the panel around it, so the pointer
 * sits under the popup wherever the trigger is.
 */
function usePopupPlacement(open: boolean, triggerRef: RefObject<HTMLElement | null>,
  popupRef: RefObject<HTMLElement | null>): PopupPlacement | null {
  const [placement, setPlacement] = useState<PopupPlacement | null>(null);
  useLayoutEffect(() => {
    if (!open) { setPlacement(null); return undefined; }
    function place() {
      const trigger = triggerRef.current;
      const popup = popupRef.current;
      if (!trigger || !popup) return;
      const anchor = trigger.getBoundingClientRect();
      const mark = trigger.querySelector('.help-tooltip-mark')?.getBoundingClientRect() ?? anchor;
      const aim = mark.left + mark.width / 2;
      const width = popup.offsetWidth;
      const surface = surroundingSurface(trigger, width);
      const minLeft = Math.max(EDGE, surface.left + INSET);
      const maxLeft = Math.min(window.innerWidth - EDGE, surface.right - INSET) - width;
      const left = Math.max(minLeft, Math.min(aim - width / 2, maxLeft));
      const caret = Math.max(16, Math.min(aim - left, popup.offsetWidth - 16));
      const aboveTop = anchor.top - GAP - popup.offsetHeight;
      if (aboveTop >= scrollAreaTop(trigger)) {
        setPlacement({ left, top: aboveTop, caret, side: 'above' });
        return;
      }
      setPlacement({ left, top: anchor.bottom + GAP, caret, side: 'below' });
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, triggerRef, popupRef]);
  return placement;
}

/**
 * Explains a setting in a popup that floats above the page, like a floating
 * dropdown menu, so scroll areas and cards cannot clip it. It opens on hover or
 * keyboard focus and closes on leave, blur or Escape.
 */
export function HelpTooltip({ tooltip, label, children, id, className, icon = true, width = 300 }: HelpTooltipProps) {
  const generatedId = useId();
  const popupId = id ?? generatedId;
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const placement = usePopupPlacement(open, triggerRef, popupRef);
  useEffect(() => { setHost(triggerRef.current?.closest<HTMLElement>('.shell') ?? document.body); }, []);
  const labelled = label !== undefined;
  function dismiss(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      setOpen(false);
    }
  }
  const popupStyle = {
    ...(width === 'auto' ? {} : { width }),
    ...(placement ? { left: placement.left, top: placement.top, '--help-tooltip-caret': `${placement.caret}px` } : {})
  } as CSSProperties;
  const popup = (
    <span ref={popupRef} id={popupId} role="tooltip" data-side={placement?.side}
      className={`help-tooltip${width === 'auto' ? ' fit' : ''}${open && placement ? ' open' : ''}`} style={popupStyle}>
      {tooltip}
    </span>
  );
  return (
    <span ref={triggerRef}
      className={`help-tooltip-trigger${labelled ? ' labelled' : ''}${className ? ` ${className}` : ''}`}
      tabIndex={labelled ? 0 : undefined} aria-describedby={labelled ? popupId : undefined}
      onPointerEnter={() => setOpen(true)} onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={dismiss}>
      {labelled ? <span className="help-tooltip-label">{label}</span> : children}
      {labelled && icon ? <IconQuestionMark className="help-tooltip-mark" size={12} stroke={2.6} aria-hidden="true" /> : null}
      {host ? createPortal(popup, host) : null}
    </span>
  );
}
