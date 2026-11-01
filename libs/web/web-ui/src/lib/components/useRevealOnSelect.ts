import { useEffect, useRef } from 'react';

/**
 * Scrolls the returned element into view when `value` becomes set (e.g. a chosen list or role).
 * Only on narrow viewports where the detail panel sits below the chooser.
 */
export function useRevealOnSelect(value: string | null | undefined, minWidthPx = 768) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!value) return;
    if (typeof window !== 'undefined' && window.matchMedia(`(min-width: ${minWidthPx}px)`).matches) return;
    // After layout paints the detail panel below the list.
    const id = window.requestAnimationFrame(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => window.cancelAnimationFrame(id);
  }, [value, minWidthPx]);
  return ref;
}
