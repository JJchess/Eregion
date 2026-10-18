import { useEffect, useRef, useState } from 'react';

/**
 * Reports whether an element is on screen. Used for two things on this page:
 *   - gating `<video>` playback so the landing never downloads 11.6MB up front
 *   - releasing compositor layers (`will-change`) when the cosmos scrolls away
 *
 * `threshold` is the visible fraction required; `once` latches true and disconnects,
 * for entrances that should not replay.
 *
 * `initial` is the value reported before the observer's first callback. It defaults to
 * false, which is right for entrances and for gating work you don't want to start early.
 * Callers that *invert* the result need `true` instead — the nav's scrolled state is
 * `!visible`, and defaulting to false there would render the scrolled bar on load and
 * then transition it away once the observer corrected it.
 */
export function useVisible<T extends HTMLElement = HTMLDivElement>(
  { threshold = 0.4, once = false, rootMargin = '0px', initial = false } = {},
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(initial);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    // Without IntersectionObserver, assume visible — a missing enhancement should
    // never mean missing content or a video that can't start.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, once, rootMargin]);

  return [ref, visible];
}
