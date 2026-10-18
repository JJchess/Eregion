import { useEffect, useState, type RefObject } from 'react';

/**
 * Finds the element that actually scrolls above `from`.
 *
 * This page cannot assume the window scrolls. `app/providers.tsx` locks the app shell to
 * `height: 100vh; overflow: hidden` and puts the scrolling on an inner `overflow: auto`
 * Box, so `document.documentElement.scrollHeight` equals the viewport height and
 * `window.scrollY` never moves. Anything that reads window scroll — a listener, or
 * framer-motion's `useScroll` with its default container — silently does nothing.
 *
 * The landing shell exposes an explicit data marker, which must win over geometry:
 * during a fast reload React can run this effect before the page has its final height.
 * Falling back to the DOM walk keeps the hook reusable outside that shell.
 *
 * Returns:
 *   undefined — not resolved yet (first render, or `from` not attached)
 *   null      — resolved: nothing scrollable above it, so the viewport scrolls
 *   Element   — resolved: this is the scroll container
 *
 * The three-way result matters. Consumers that must hand a populated ref to something
 * else need to distinguish "still looking" from "looked, and it's the window".
 */
export function useScrollContainer(
  from: RefObject<HTMLElement | null>,
): HTMLElement | null | undefined {
  const [container, setContainer] = useState<HTMLElement | null | undefined>(undefined);

  useEffect(() => {
    const node = from.current;
    if (!node) return;

    const landingRoot = node.closest<HTMLElement>('[data-landing-scroll-root="true"]');
    if (landingRoot) {
      setContainer(landingRoot);
      return;
    }

    let el = node.parentElement;
    while (el && el !== document.body && el !== document.documentElement) {
      const overflowY = getComputedStyle(el).overflowY;
      // Both conditions are required. `overflow: auto` on a box that doesn't overflow is
      // not a scroll container, and matching on the style alone would return the shell's
      // outer wrappers — which are `overflow: hidden` — or a box that never scrolls.
      if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        setContainer(el);
        return;
      }
      el = el.parentElement;
    }

    setContainer(null);
  }, [from]);

  return container;
}
