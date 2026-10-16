'use client';

import { useCallback, useLayoutEffect, useRef, useState, type RefObject, type TransitionEvent } from 'react';

// Match the content motion tokens in skill-market.css. Timers are a fallback
// for removed/loading groups or browsers that do not deliver transitionend.
const EXIT_DURATION = 120;
const ENTER_DURATION = 180;
const MAX_STAGGER = 100;
type Phase = 'open' | 'exiting' | 'staged' | 'entering';
type Content<T> = { key: string; value: T | null; phase: Phase; reversing: boolean };

/** Retain the outgoing identity until it fades, then enter only the latest request. */
export function usePanelPresence<T>(value: T | null, key: string, element: RefObject<HTMLElement | null>) {
  const latest = useRef({ key, value });
  latest.current = { key, value };
  const reduced = useRef(false);
  const [shown, setShown] = useState<Content<T>>({ key, value, phase: 'open', reversing: false });
  // Same-view edits remain live; a different requested identity must not replace
  // the outgoing skill ID, draft or error before its exit finishes.
  if (shown.key === key && shown.value !== value) setShown({ ...shown, value });
  const current = useRef(shown);
  current.current = shown;
  const groups = useCallback(() => Array.from(element.current?.querySelectorAll<HTMLElement>(
    '[data-sidebar-view][data-active="true"] [data-motion-group]',
  ) ?? []).filter(group => group.getClientRects().length > 0), [element]);

  const settle = useCallback(() => {
    setShown({ ...latest.current, phase: 'open', reversing: false });
  }, []);
  const finish = useCallback(() => {
    setShown(previous => {
      const target = latest.current;
      if (reduced.current || document.hidden) return { ...target, phase: 'open', reversing: false };
      if (previous.phase === 'exiting') {
        return previous.key === target.key
          ? { ...target, phase: 'entering', reversing: true }
          : { ...target, phase: 'staged', reversing: false };
      }
      if (previous.phase === 'entering' && previous.key === target.key)
        return { ...target, phase: 'open', reversing: false };
      return previous;
    });
  }, []);

  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      reduced.current = media.matches;
      if (media.matches || document.hidden) settle();
    };
    update();
    media.addEventListener('change', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      media.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [settle]);

  useLayoutEffect(() => {
    if (shown.key === key && shown.phase === 'open') return;
    if (reduced.current || document.hidden) {
      settle();
      return;
    }
    if (shown.key !== key && shown.phase !== 'exiting') {
      // An interrupted entry fades from its current pose without snapping to x=0.
      for (const group of groups())
        group.style.setProperty('--sk-exit-transform', getComputedStyle(group).transform);
      setShown(previous => ({ ...previous, phase: 'exiting', reversing: false }));
    } else if (shown.key === key && shown.phase === 'exiting') {
      setShown(previous => ({ ...previous, phase: 'entering', reversing: true }));
    } else if (shown.key === key && shown.phase === 'staged') {
      // Resolve each transparent group's starting pose before changing targets.
      for (const group of groups()) void getComputedStyle(group).transform;
      setShown(previous => ({ ...previous, phase: 'entering' }));
    }
  }, [key, shown.key, shown.phase, groups, settle]);

  useLayoutEffect(() => {
    if (shown.phase !== 'exiting' && shown.phase !== 'entering') return;
    if (!groups().length) {
      finish(); // The collection is hidden on mobile; there is nothing to fade.
      return;
    }
    const duration = shown.phase === 'exiting' ? EXIT_DURATION : ENTER_DURATION + MAX_STAGGER;
    const timer = setTimeout(finish, duration + 60);
    return () => clearTimeout(timer);
  }, [shown.key, shown.phase, groups, finish]);

  const onTransitionEnd = useCallback((event: TransitionEvent<HTMLElement>) => {
    if (!(event.target instanceof HTMLElement) || !event.target.hasAttribute('data-motion-group') || event.propertyName !== 'opacity') return;
    const phase = current.current.phase;
    if (phase !== 'entering' && phase !== 'exiting') return;
    const target = phase === 'entering' ? 1 : 0;
    // Earlier staggered groups and stale events cannot complete the whole view.
    if (groups().every(group => Math.abs(Number(getComputedStyle(group).opacity) - target) < 0.001)) finish();
  }, [finish, groups]);

  return { content: shown.value, key: shown.key, phase: shown.phase, reversing: shown.reversing, onTransitionEnd };
}
