import { useCallback, useEffect, useRef, useState } from 'react';

type ScrollContextEdges = { up: boolean; down: boolean };

const NO_SCROLL_CONTEXT_EDGES: ScrollContextEdges = { up: false, down: false };

export function useScrollContextEdges(active = true) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollEdges, setScrollEdges] = useState(NO_SCROLL_CONTEXT_EDGES);
  const updateScrollEdges = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const next = {
      up: element.scrollTop > 1,
      down: element.scrollTop + element.clientHeight < element.scrollHeight - 1
    };
    setScrollEdges((current) => (
      current.up === next.up && current.down === next.down ? current : next
    ));
  }, []);

  useEffect(() => {
    if (!active) {
      setScrollEdges((current) => current.up || current.down ? NO_SCROLL_CONTEXT_EDGES : current);
      return;
    }
    const element = scrollRef.current;
    if (!element) return;
    updateScrollEdges();
    window.addEventListener('resize', updateScrollEdges);
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updateScrollEdges);
    resizeObserver?.observe(element);
    for (const child of element.children) resizeObserver?.observe(child);
    const mutationObserver = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver((mutations) => {
        // Nested text updates affect overflow, but do not change resize targets.
        // Only update observations for direct children added or removed.
        for (const mutation of mutations) {
          if (mutation.type !== 'childList' || mutation.target !== element) continue;
          for (const child of mutation.removedNodes) {
            if (child instanceof Element && child.parentElement !== element) resizeObserver?.unobserve(child);
          }
          for (const child of mutation.addedNodes) {
            if (child instanceof Element && child.parentElement === element) resizeObserver?.observe(child);
          }
        }
        updateScrollEdges();
      });
    mutationObserver?.observe(element, { childList: true, subtree: true, characterData: true });
    return () => {
      window.removeEventListener('resize', updateScrollEdges);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
    };
  }, [active, updateScrollEdges]);

  return { scrollRef, scrollEdges, updateScrollEdges };
}
