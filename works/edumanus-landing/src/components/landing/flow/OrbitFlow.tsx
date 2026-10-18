import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';
import { useTranslations } from 'use-intl';
import { useReducedMotion } from 'motion/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useScrollContainer } from '../hooks/useScrollContainer';
import { SceneBackdrop } from '../SceneBackdrop';
import shell from '../landing.module.css';
import styles from './flow.module.css';

gsap.registerPlugin(ScrollTrigger);

type Node = { index: string; title: string; caption: string };

const ACCENTS = ['var(--landing-cyan)', 'var(--landing-violet)', 'var(--landing-pink)', 'var(--landing-green)'];
const VISUAL_CYCLES = 2;

/**
 * React adaptation of the MIT-licensed Codrops Dual Wave Text Animation:
 * https://github.com/ValentinDBS/codrops-tutorial-text-animation
 *
 * The two text columns keep the upstream sine-wave positioning and quickTo damping.
 * ScrollSmoother is intentionally omitted because the app shell owns scrolling.
 */
export function OrbitFlow() {
  const t = useTranslations('Landing.flow');
  const nodes = t.raw('nodes') as Node[];
  const rootRef = useRef<HTMLElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const scrollContainer = useScrollContainer(rootRef);
  const reduceMotion = useReducedMotion();

  const visualNodes = useMemo(
    () => Array.from({ length: VISUAL_CYCLES }, () => nodes).flat(),
    [nodes],
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    const wave = waveRef.current;
    if (!root || !wave || scrollContainer === undefined || reduceMotion) return;

    const desktop = window.matchMedia('(min-width: 1024px)');
    if (!desktop.matches) return;

    const context = gsap.context(() => {
      const leftColumn = wave.querySelector<HTMLElement>('[data-wave-column="left"]');
      const rightColumn = wave.querySelector<HTMLElement>('[data-wave-column="right"]');
      const leftItems = gsap.utils.toArray<HTMLElement>('[data-wave-item="left"]', wave);
      const rightItems = gsap.utils.toArray<HTMLElement>('[data-wave-item="right"]', wave);
      const flowSteps = gsap.utils.toArray<HTMLElement>('[data-flow-step]', wave);

      if (!leftColumn || !rightColumn || !leftItems.length || !rightItems.length) {
        return;
      }

      let leftRange = 0;
      let rightRange = 0;

      const leftSetters = leftItems.map((item) =>
        gsap.quickTo(item, 'x', { duration: 0.6, ease: 'power4.out' }),
      );
      const rightSetters = rightItems.map((item) =>
        gsap.quickTo(item, 'x', { duration: 0.6, ease: 'power4.out' }),
      );

      const calculateRanges = () => {
        const leftMax = Math.max(...leftItems.map((item) => item.offsetWidth));
        const rightMax = Math.max(...rightItems.map((item) => item.offsetWidth));
        leftRange = Math.max(0, leftColumn.clientWidth - leftMax);
        rightRange = Math.max(0, rightColumn.clientWidth - rightMax);
      };

      const waveX = (index: number, progress: number, range: number) => {
        const phase = index * 1.12 + progress * Math.PI * 2 - Math.PI / 2;
        return ((Math.sin(phase) + 1) / 2) * range;
      };

      const viewportCenter = () => {
        if (!scrollContainer) return window.innerHeight / 2;
        const rect = scrollContainer.getBoundingClientRect();
        return rect.top + rect.height / 2;
      };

      const closestItemIndex = () => {
        const center = viewportCenter();
        let nearestIndex = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;

        leftItems.forEach((item, index) => {
          const rect = item.getBoundingClientRect();
          const distance = Math.abs(rect.top + rect.height / 2 - center);
          if (distance < nearestDistance) {
            nearestIndex = index;
            nearestDistance = distance;
          }
        });

        return nearestIndex;
      };

      const update = (progress: number) => {
        const focusedIndex = closestItemIndex();
        const focusedNodeIndex = focusedIndex % nodes.length;

        leftItems.forEach((item, index) => {
          leftSetters[index](waveX(index, progress, leftRange));
          item.classList.toggle(styles.focused, index === focusedIndex);
        });
        rightItems.forEach((item, index) => {
          rightSetters[index](-waveX(index, progress, rightRange));
          item.classList.toggle(styles.focused, index === focusedIndex);
        });
        flowSteps.forEach((step, index) => {
          step.classList.toggle(styles.focusedStep, index === focusedNodeIndex);
        });
      };

      calculateRanges();
      leftItems.forEach((item, index) => gsap.set(item, { x: waveX(index, 0, leftRange) }));
      rightItems.forEach((item, index) => gsap.set(item, { x: -waveX(index, 0, rightRange) }));
      const trigger = ScrollTrigger.create({
        trigger: wave,
        scroller: scrollContainer ?? undefined,
        start: 'top bottom',
        end: 'bottom top',
        invalidateOnRefresh: true,
        onRefresh: calculateRanges,
        onUpdate: (self) => update(self.progress),
      });

      update(trigger.progress);
    }, root);

    ScrollTrigger.refresh();
    return () => context.revert();
  }, [nodes.length, reduceMotion, scrollContainer]);

  return (
    <section
      ref={rootRef}
      id="orbit"
      className={`${styles.section} ${shell.sceneSection}`}
      data-landing-scene="orbit"
      aria-label={t('ariaLabel')}
    >
      <SceneBackdrop />
      <div className={shell.shell} data-scene-enter>
        <ol className="sr-only">
          {nodes.map((node) => (
            <li key={node.index}>
              {node.title}: {node.caption}
            </li>
          ))}
        </ol>

        <div ref={waveRef} className={styles.waveDesktop} aria-hidden="true">
          <div className={styles.waveColumns}>
            <div
              className={`${styles.waveColumn} ${styles.waveColumnLeft}`}
              data-wave-column="left"
              data-scene-exit="left"
            >
              {visualNodes.map((node, index) => (
                <p
                  key={`left-${index}`}
                  className={styles.waveItem}
                  data-wave-item="left"
                  style={{ '--flow-accent': ACCENTS[index % nodes.length] } as CSSProperties}
                >
                  {node.title}
                </p>
              ))}
            </div>

            <div
              className={`${styles.waveColumn} ${styles.waveColumnRight}`}
              data-wave-column="right"
              data-scene-exit="right"
            >
              {visualNodes.map((node, index) => (
                <p
                  key={`right-${index}`}
                  className={styles.waveItem}
                  data-wave-item="right"
                  style={{ '--flow-accent': ACCENTS[index % nodes.length] } as CSSProperties}
                >
                  {node.title}
                </p>
              ))}
            </div>
          </div>

          <ol className={styles.flowSpine} data-scene-exit="standard">
            {nodes.map((node, index) => (
              <li
                key={node.index}
                className={`${styles.flowStep} ${index === 0 ? styles.focusedStep : ''}`}
                data-flow-step
                style={{ '--flow-accent': ACCENTS[index] } as CSSProperties}
              >
                <span className={styles.flowIndex}>{node.index}</span>
                <span className={styles.flowCopy}>
                  <strong>{node.title}</strong>
                  <span>{node.caption}</span>
                </span>
              </li>
            ))}
          </ol>

        </div>

        <div className={styles.flowFallback} data-scene-exit="standard">
          {nodes.map((node, index) => (
            <article
              key={node.index}
              className={styles.fallbackItem}
              style={{ '--flow-accent': ACCENTS[index] } as CSSProperties}
            >
              <div className={styles.fallbackCopy}>
                <span>{node.index}</span>
                <h3>{node.title}</h3>
                <p>{node.caption}</p>
              </div>
            </article>
          ))}
        </div>

      </div>
    </section>
  );
}
