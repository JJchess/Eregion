import { useLayoutEffect, type RefObject } from 'react';
import { useReducedMotion } from 'motion/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useScrollContainer } from './useScrollContainer';

gsap.registerPlugin(ScrollTrigger);

type SceneName = 'hero' | 'journey' | 'products' | 'orbit' | 'outcomes' | 'finale';

const ENTER_FROM: Record<Exclude<SceneName, 'hero'>, gsap.TweenVars> = {
  journey: { yPercent: 9, scale: 0.985, opacity: 0.24 },
  products: { yPercent: 8, scale: 0.98, opacity: 0.24 },
  orbit: { yPercent: 10, scale: 0.985, opacity: 0.22 },
  outcomes: { yPercent: 10, scale: 0.985, opacity: 0.22 },
  finale: { yPercent: 12, scale: 0.985, opacity: 0.16 },
};

const EXIT_TO: Record<Exclude<SceneName, 'hero'>, gsap.TweenVars> = {
  journey: { yPercent: -12, scale: 0.96, opacity: 0.22 },
  products: { yPercent: -3, scale: 0.965, opacity: 0.24 },
  orbit: { yPercent: -5, scale: 0.94, opacity: 0.2 },
  outcomes: { yPercent: -4, scale: 0.965, opacity: 0.2 },
  finale: { yPercent: -4, scale: 0.955, opacity: 0.2 },
};

function sceneName(section: HTMLElement): SceneName | null {
  const value = section.dataset.landingScene;
  if (
    value === 'hero' ||
    value === 'journey' ||
    value === 'products' ||
    value === 'orbit' ||
    value === 'outcomes' ||
    value === 'finale'
  ) {
    return value;
  }
  return null;
}

/**
 * Coordinates only the hand-off between scenes. Every section keeps ownership of its
 * internal animation; these timelines target one explicit outer stage so nested GSAP
 * transforms (product covers, the orbit wave and the isometric grid) never compete.
 */
export function useSectionTransitions(rootRef: RefObject<HTMLElement | null>) {
  const scrollContainer = useScrollContainer(rootRef);
  const reducedMotion = useReducedMotion() === true;

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || scrollContainer === undefined) return;

    const sections = Array.from(
      root.querySelectorAll<HTMLElement>('[data-landing-scene]'),
    );
    const motionTargets = sections.flatMap((section) =>
      Array.from(section.querySelectorAll<HTMLElement>('[data-scene-enter], [data-scene-exit]')),
    );

    if (reducedMotion) {
      gsap.set(motionTargets, { clearProps: 'transform,opacity,willChange' });
      return;
    }

    const context = gsap.context(() => {
      sections.slice(1).forEach((incoming, index) => {
        const incomingName = sceneName(incoming);
        const outgoing = sections[index];
        if (!incomingName || incomingName === 'hero' || !outgoing) return;
        const outgoingName = sceneName(outgoing);

        const incomingTargets = Array.from(
          incoming.querySelectorAll<HTMLElement>('[data-scene-enter]'),
        );
        const outgoingTargets = Array.from(
          outgoing.querySelectorAll<HTMLElement>('[data-scene-exit]'),
        );
        if (!incomingTargets.length || !outgoingTargets.length) return;

        const allTargets = [...outgoingTargets, ...incomingTargets];
        const setCompositingHint = (active: boolean) => {
          allTargets.forEach((target) => {
            target.style.willChange = active ? 'transform, opacity' : '';
          });
        };

        const timeline = gsap.timeline({
          defaults: { ease: 'power2.inOut' },
          scrollTrigger: {
            trigger: incoming,
            ...(scrollContainer ? { scroller: scrollContainer } : {}),
            start: 'top bottom',
            end: 'top top',
            scrub: 0.35,
            invalidateOnRefresh: true,
            onToggle: (self) => setCompositingHint(self.isActive),
          },
        });

        timeline.addLabel('handoff', 0);

        const splitColumns = outgoingTargets.filter(
          (target) => target.dataset.sceneExit === 'left' || target.dataset.sceneExit === 'right',
        );
        // The hero copy shares the galaxy's dedicated orient/release/settle timeline.
        // Letting this generic handoff animate it as well creates two competing scroll
        // owners and is the source of the former soft pause at the first section seam.
        const standardTargets = outgoingName === 'hero'
          ? []
          : outgoingTargets.filter(
              (target) => target.dataset.sceneExit !== 'left' && target.dataset.sceneExit !== 'right',
            );

        if (standardTargets.length) {
          const exitState =
            outgoingName === 'hero'
              ? { ...EXIT_TO[incomingName], opacity: 0 }
              : EXIT_TO[incomingName];
          timeline.to(
            standardTargets,
            { ...exitState, duration: 0.72, force3D: true },
            'handoff',
          );
        }

        splitColumns.forEach((column) => {
          const direction = column.dataset.sceneExit === 'left' ? -1 : 1;
          timeline.to(
            column,
            { xPercent: direction * 12, scale: 0.98, opacity: 0.18, duration: 0.74, force3D: true },
            'handoff',
          );
        });

        timeline.fromTo(
          incomingTargets,
          { ...ENTER_FROM[incomingName], force3D: true },
          { yPercent: 0, xPercent: 0, scale: 1, opacity: 1, duration: 0.82, stagger: 0.04, force3D: true },
          'handoff+=0.18',
        );
      });

      requestAnimationFrame(() => ScrollTrigger.refresh());
    }, root);

    return () => context.revert();
  }, [reducedMotion, rootRef, scrollContainer]);
}
