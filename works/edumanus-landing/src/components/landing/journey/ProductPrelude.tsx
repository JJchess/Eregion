import { useLayoutEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { useTranslations } from 'use-intl';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useScrollContainer } from '../hooks/useScrollContainer';
import { SceneBackdrop } from '../SceneBackdrop';
import shell from '../landing.module.css';
import styles from './journey.module.css';

gsap.registerPlugin(Flip, ScrollTrigger);

type Step = {
  index: string;
  tag: string;
  title: string;
  body: string;
};

const POSITION_KEYS = [
  ['scatterOne', 'sequenceOne'],
  ['scatterTwo', 'sequenceTwo'],
  ['scatterThree', 'sequenceThree'],
  ['scatterFour', 'sequenceFour'],
] as const;

function cleanRichBreaks(value: string): string {
  return value.replace(/<br\s*\/?>(?:<\/br>)?/gi, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * A compact bridge between the reactive hero and the product gallery.
 *
 * The choreography follows Codrops' ScrollTextMotion experiment: each text group owns
 * a scattered class and an alternate ordered class. Flip captures the alternate state,
 * then ScrollTrigger scrubs into and back out of it. We intentionally keep the app's
 * native scroll container instead of adding the reference demo's ScrollSmoother.
 */
export function ProductPrelude() {
  const t = useTranslations('Landing.journey');
  const steps = t.raw('steps') as Step[];
  const rootRef = useRef<HTMLElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const scrollContainer = useScrollContainer(rootRef);
  const reducedMotion = useReducedMotion() === true;

  useLayoutEffect(() => {
    const root = rootRef.current;
    const scene = sceneRef.current;
    if (!root || !scene || scrollContainer === undefined || reducedMotion) return;

    const media = gsap.matchMedia();
    let flipContext: gsap.Context | null = null;
    let resizeFrame = 0;

    const buildFlips = () => {
      flipContext?.revert();
      flipContext = gsap.context(() => {
        const groups = gsap.utils.toArray<HTMLElement>('[data-motion-group]', scene);

        groups.forEach((group, index) => {
          const keys = POSITION_KEYS[index];
          if (!keys) return;

          const [scatterKey, sequenceKey] = keys;
          const scatterClass = styles[scatterKey];
          const sequenceClass = styles[sequenceKey];

          gsap.set(group, { clearProps: 'transform,opacity' });
          group.classList.add(sequenceClass);
          group.classList.remove(scatterClass);

          const sequenceState = Flip.getState(group, { props: 'opacity' });

          group.classList.add(scatterClass);
          group.classList.remove(sequenceClass);

          const trigger = {
            trigger: root,
            ...(scrollContainer ? { scroller: scrollContainer } : {}),
            scrub: true,
            invalidateOnRefresh: true,
          } as const;

          Flip.to(sequenceState, {
            ease: 'expo.inOut',
            simple: true,
            scrollTrigger: {
              ...trigger,
              start: 'clamp(top bottom-=8%)',
              end: 'clamp(center center)',
            },
          });

          Flip.from(sequenceState, {
            ease: 'expo.inOut',
            simple: true,
            scrollTrigger: {
              ...trigger,
              start: 'clamp(center center)',
              end: 'clamp(bottom top+=8%)',
            },
          });
        });
      }, scene);
    };

    media.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      buildFlips();

      const rebuildOnResize = () => {
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
          buildFlips();
          ScrollTrigger.refresh();
        });
      };

      window.addEventListener('resize', rebuildOnResize);
      return () => window.removeEventListener('resize', rebuildOnResize);
    });

    ScrollTrigger.refresh();

    return () => {
      cancelAnimationFrame(resizeFrame);
      flipContext?.revert();
      media.revert();
    };
  }, [reducedMotion, scrollContainer]);

  return (
    <section
      id="journey"
      ref={rootRef}
      className={`${styles.section} ${shell.sceneSection}`}
      data-landing-scene="journey"
      aria-labelledby="journey-title"
    >
      <SceneBackdrop />
      <div
        ref={sceneRef}
        className={styles.scene}
        data-scene-exit="standard"
      >
        <div className={styles.ruleTop} data-scene-enter aria-hidden />
        <div className={styles.titleStage} data-scene-enter>
          <h2 id="journey-title" className={styles.title}>
            {t('title')}
          </h2>
        </div>

        <div className={styles.motionField} data-scene-enter aria-hidden>
          {steps.map((step, index) => {
            const position = POSITION_KEYS[index];
            return (
              <article
                key={step.index}
                className={`${styles.cluster} ${position ? styles[position[0]] : ''}`}
                data-motion-group
              >
                <div className={styles.clusterMeta}>
                  <span>{step.index}</span>
                  <span>{step.tag}</span>
                </div>
                <h3>{step.title}</h3>
                <p>{cleanRichBreaks(step.body)}</p>
              </article>
            );
          })}
        </div>

        <ol className={styles.accessibleSteps}>
          {steps.map((step) => (
            <li key={step.index}>
              {step.index} {step.tag}: {step.title}. {cleanRichBreaks(step.body)}
            </li>
          ))}
        </ol>

        <ol className={styles.staticSteps} data-scene-enter>
          {steps.map((step) => (
            <li key={step.index}>
              <div className={styles.staticMeta}>
                <span>{step.index}</span>
                <span>{step.tag}</span>
              </div>
              <div>
                <h3>{step.title}</h3>
                <p>{cleanRichBreaks(step.body)}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
