import { assetUrl } from '@/app/assets';
import { lazy, Suspense, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useMotionValue } from 'motion/react';
import { gsap } from 'gsap';
import { useQualityTier } from '../hooks/useQualityTier';
import { useScrollContainer } from '../hooks/useScrollContainer';
import type { GalaxyRenderMode } from './CosmicGalaxyCanvas';
import styles from './cosmic-backdrop.module.css';

const CosmicGalaxyCanvas = lazy(() => import('./CosmicGalaxyCanvas').then((module) => ({ default: module.CosmicGalaxyCanvas })));

const GLINT_COUNT = 8;

type CosmicBackdropProps = {
  mode: 'light' | 'dark';
};

/**
 * One continuous visual ground for the whole landing page.
 *
 * A single particle identity spans the whole page: the hero galaxy morphs into a
 * frozen full-viewport star field, while deterministic page-length dust provides
 * depth below it. The scroll timeline targets the application's inner scroller.
 */
export function CosmicBackdrop({ mode }: CosmicBackdropProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollContainer = useScrollContainer(rootRef);
  const { tier, reducedMotion, resolved } = useQualityTier();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [renderMode, setRenderMode] = useState<GalaxyRenderMode>('intro');

  const dissolve = useMotionValue(0);
  const animated = tier !== 'static' && !reducedMotion && !failed;

  const commitDissolve = useCallback((value: number) => {
    const normalized = Math.min(1, Math.max(0, value));
    dissolve.set(normalized);

    const root = rootRef.current;
    if (!root) return;
    root.style.setProperty('--galaxy-dissolve', normalized.toFixed(4));
    root.style.setProperty('--continuum-reveal', (0.04 + normalized * 0.32).toFixed(4));
    root.dataset.dissolveProgress = normalized.toFixed(3);
    root.dataset.transitionPhase = normalized < 0.34
      ? 'orient'
      : normalized < 0.7
        ? 'release'
        : normalized < 0.999
          ? 'settle'
          : 'continuum';
  }, [dissolve]);

  useLayoutEffect(() => {
    const backdrop = rootRef.current;
    if (!backdrop || scrollContainer === undefined) return;
    const pageRoot = backdrop.parentElement;
    const hero = pageRoot?.querySelector<HTMLElement>('[data-landing-scene="hero"]');
    if (!pageRoot || !hero) return;

    const heroExitTargets = Array.from(
      hero.querySelectorAll<HTMLElement>('[data-scene-exit]'),
    );

    if (!animated) {
      commitDissolve(0);
      gsap.set(heroExitTargets, { clearProps: 'transform,opacity,willChange' });
      return;
    }

    const physicalProgress = () => {
      const viewportHeight = scrollContainer?.clientHeight ?? window.innerHeight;
      const scrollTop = scrollContainer?.scrollTop ?? window.scrollY;
      const pageTop = scrollContainer
        ? scrollTop + pageRoot.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top
        : scrollTop + pageRoot.getBoundingClientRect().top;

      return Math.min(1, Math.max(0, (scrollTop - pageTop) / Math.max(1, viewportHeight * 0.85)));
    };

    const initialProgress = physicalProgress();
    const proxy = { progress: initialProgress };
    commitDissolve(initialProgress);
    let syncFrame = 0;
    let timeline: gsap.core.Timeline | null = null;
    const scrollTarget: HTMLElement | Window = scrollContainer ?? window;
    let scheduleSync = () => {};
    const context = gsap.context(() => {
      timeline = gsap.timeline({
        paused: true,
        defaults: { ease: 'none' },
      });

      timeline
        .addLabel('orient', 0)
        .addLabel('release', 0.34)
        .addLabel('settle', 0.7)
        .fromTo(
          proxy,
          { progress: 0 },
          {
            progress: 1,
            duration: 1,
            immediateRender: false,
            onUpdate: () => commitDissolve(proxy.progress),
          },
          'orient',
        )
        .to(
          heroExitTargets,
          {
            yPercent: -10,
            scale: 0.97,
            opacity: 0,
            duration: 0.3,
            ease: 'power2.in',
            force3D: true,
          },
          'orient+=0.04',
        );

      const syncToPhysicalScroll = (immediate = false) => {
        if (!timeline) return;
        const nextProgress = physicalProgress();
        const isTransitioning = nextProgress > 0 && nextProgress < 1;
        heroExitTargets.forEach((target) => {
          target.style.willChange = isTransitioning ? 'transform, opacity' : '';
        });

        if (immediate) {
          gsap.killTweensOf(timeline);
          timeline.progress(nextProgress, false);
        } else {
          gsap.to(timeline, {
            progress: nextProgress,
            duration: 0.2,
            ease: 'none',
            overwrite: true,
          });
        }
        commitDissolve(proxy.progress);
      };

      scheduleSync = () => {
        if (syncFrame) return;
        syncFrame = requestAnimationFrame(() => {
          syncFrame = 0;
          syncToPhysicalScroll();
        });
      };

      syncToPhysicalScroll(true);
      scrollTarget.addEventListener('scroll', scheduleSync, { passive: true });
      window.addEventListener('resize', scheduleSync, { passive: true });
    }, pageRoot);

    return () => {
      scrollTarget.removeEventListener('scroll', scheduleSync);
      window.removeEventListener('resize', scheduleSync);
      if (syncFrame) cancelAnimationFrame(syncFrame);
      if (timeline) gsap.killTweensOf(timeline);
      context.revert();
    };
  }, [animated, commitDissolve, scrollContainer]);

  const handleReady = useCallback(() => setReady(true), []);
  const handleError = useCallback(() => {
    setReady(false);
    setFailed(true);
  }, []);

  return (
    <div
      ref={rootRef}
      className={styles.backdrop}
      data-cosmic-backdrop
      data-quality={tier}
      data-quality-resolved={resolved ? 'true' : 'false'}
      data-failed={failed ? 'true' : 'false'}
      data-ready={animated && ready ? 'true' : 'false'}
      data-render-mode={animated ? renderMode : 'static'}
      data-theme-mode={mode}
      data-dissolve-progress="0.000"
      data-transition-phase="orient"
      aria-hidden
    >
      <div className={styles.atmosphere} data-cosmic-atmosphere />
      <div className={styles.dust} data-star-dust />
      <div className={styles.glints} data-star-glints>
        {Array.from({ length: GLINT_COUNT }, (_, index) => (
          <span key={index} className={styles.glint} data-star-glint />
        ))}
      </div>

      <div className={styles.heroRail}>
        <div className={styles.heroViewport}>
          <div className={styles.galaxy}>
            <span className={styles.galaxyAura} data-galaxy-aura />
            <picture className={styles.posterFrame} data-galaxy-poster>
              <source
                media="(max-width: 767px)"
                srcSet={
                  mode === 'dark'
                    ? assetUrl('/landing/hero-galaxy-dark-mobile.webp')
                    : assetUrl('/landing/hero-galaxy-light-mobile.webp')
                }
              />
              <img
                src={
                  mode === 'dark'
                    ? assetUrl('/landing/hero-galaxy-dark.webp')
                    : assetUrl('/landing/hero-galaxy-light.webp')
                }
                alt=""
                className={styles.poster}
                fetchPriority="high"
                decoding="async"
              />
            </picture>
            {animated && (
              <Suspense fallback={null}><CosmicGalaxyCanvas
                quality={tier}
                mode={mode}
                dissolve={dissolve}
                onReady={handleReady}
                onError={handleError}
                onModeChange={setRenderMode}
              /></Suspense>
            )}
          </div>
          <div className={styles.copyScrim} />
          <div className={styles.bottomFade} />
        </div>
      </div>
    </div>
  );
}
