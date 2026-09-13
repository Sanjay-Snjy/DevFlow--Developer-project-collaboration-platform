'use client';

import { useEffect } from 'react';

/**
 * Toggles a `scrolled` class on an element once the page scrolls past a small
 * threshold. Used by the landing nav so its backdrop blur/tint only kicks in
 * after scrolling begins — at the very top the nav sits flush on the hero.
 *
 * Pass the CSS selector of the target element; the listener is passive and
 * cleaned up on unmount. Runs once per scroll frame via rAF coalescing.
 */
export function ScrollClassToggler({
  selector,
  className = 'scrolled',
  threshold = 8,
}: {
  /** CSS selector for the element that receives the class. */
  selector: string;
  className?: string;
  /** Scroll position (px) past which the class is applied. */
  threshold?: number;
}) {
  useEffect(() => {
    const el = document.querySelector(selector);
    if (!el) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      el.classList.toggle(className, window.scrollY > threshold);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [selector, className, threshold]);

  return null;
}
