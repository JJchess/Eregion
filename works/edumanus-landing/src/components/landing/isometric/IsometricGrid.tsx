import { assetUrl } from '@/app/assets';
import Image from '@/app/adapters/image';
import { useEffect, useRef, type RefObject } from 'react';
import { useScrollContainer } from '../hooks/useScrollContainer';
import styles from './isometric-grid.module.css';

const TILES = [
  assetUrl('/landing/isometric-grids/01-course.webp'),
  assetUrl('/landing/isometric-grids/02-course.webp'),
  assetUrl('/landing/isometric-grids/03-video.webp'),
  assetUrl('/landing/isometric-grids/04-course.webp'),
  assetUrl('/landing/isometric-grids/05-course.webp'),
  assetUrl('/landing/isometric-grids/06-course.webp'),
  assetUrl('/landing/isometric-grids/07-course.webp'),
  assetUrl('/landing/isometric-grids/08-course.webp'),
  assetUrl('/landing/isometric-grids/09-course.webp'),
  assetUrl('/landing/isometric-grids/10-course.webp'),
  assetUrl('/landing/isometric-grids/11-course.webp'),
  assetUrl('/landing/isometric-grids/12-course.webp'),
  assetUrl('/landing/isometric-grids/13-video.webp'),
  assetUrl('/landing/isometric-grids/14-course.webp'),
  assetUrl('/landing/isometric-grids/15-lab.webp'),
  assetUrl('/landing/isometric-grids/16-course.webp'),
  assetUrl('/landing/isometric-grids/17-course.webp'),
  assetUrl('/landing/isometric-grids/18-course.webp'),
  assetUrl('/landing/isometric-grids/19-lab.webp'),
  assetUrl('/landing/isometric-grids/20-course.webp'),
  assetUrl('/landing/isometric-grids/21-course.webp'),
  assetUrl('/landing/isometric-grids/22-course.webp'),
  assetUrl('/landing/isometric-grids/23-course.webp'),
  assetUrl('/landing/isometric-grids/24-jupyterlab.webp'),
  assetUrl('/landing/isometric-grids/25-course.webp'),
  assetUrl('/landing/isometric-grids/26-course.webp'),
  assetUrl('/landing/isometric-grids/27-course.webp'),
  assetUrl('/landing/isometric-grids/28-jupyterlab.webp'),
  assetUrl('/landing/isometric-grids/29-course.webp'),
  assetUrl('/landing/isometric-grids/30-course.webp'),
  assetUrl('/landing/isometric-grids/31-lab.webp'),
  assetUrl('/landing/isometric-grids/32-lab.webp'),
  assetUrl('/landing/isometric-grids/33-course.webp'),
  assetUrl('/landing/isometric-grids/34-jupyterlab.webp'),
  assetUrl('/landing/isometric-grids/35-lab.webp'),
] as const;

const SOURCE_TRANSLATE_Y = 275;
const SOURCE_SCRIPTS = [
  assetUrl('/landing/vendor/isometric-grids/imagesloaded.pkgd.min.js'),
  assetUrl('/landing/vendor/isometric-grids/masonry.pkgd.min.js'),
  assetUrl('/landing/vendor/isometric-grids/dynamics.min.js'),
] as const;

const pendingScripts = new Map<string, Promise<void>>();

function loadSourceScript(src: string) {
  const pending = pendingScripts.get(src);
  if (pending) return pending;

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing?.dataset.loaded === 'true') {
      resolve();
      return;
    }

    const script = existing ?? document.createElement('script');
    script.addEventListener(
      'load',
      () => {
        script.dataset.loaded = 'true';
        resolve();
      },
      { once: true },
    );
    script.addEventListener(
      'error',
      () => reject(new Error(`Failed to load IsometricGrids runtime: ${src}`)),
      { once: true },
    );
    if (!existing) {
      script.src = src;
      script.async = false;
      script.dataset.isometricRuntime = 'true';
      document.head.appendChild(script);
    }
  });

  pendingScripts.set(src, promise);
  return promise;
}

type IsometricGridProps = {
  scrollRootRef: RefObject<HTMLElement | null>;
};

/**
 * Scoped React port of the scrollable grid in IsometricGrids/index.html.
 *
 * The source listens to window.scrollY and fixes the plane to the viewport. AI Cosmos
 * scrolls an inner app-shell element, so the same movement is driven by Motion's
 * section-relative progress and contained by Finale's sticky viewport.
 */
export function IsometricGrid({ scrollRootRef }: IsometricGridProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLUListElement>(null);
  const travelRef = useRef(0);
  const updateGridRef = useRef<(progress: number, animateReveal: boolean) => void>(() => {});
  const scrollContainer = useScrollContainer(layerRef);

  useEffect(() => {
    if (scrollContainer === undefined) return;

    const isolayer = layerRef.current;
    const grid = gridRef.current;
    const section = scrollRootRef.current;
    if (!isolayer || !grid || !section) return;

    const items = Array.from(grid.querySelectorAll<HTMLElement>('[data-isometric-item]'));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const revealed = new Set<HTMLElement>();
    let masonry: IsometricMasonry | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let removeHandlers = () => {};
    let stopAnimations = () => {};
    let scrollFrame = 0;
    let disposed = false;

    const viewportHeight = () =>
      scrollContainer instanceof HTMLElement ? scrollContainer.clientHeight : window.innerHeight;

    const currentProgress = () => {
      const viewportTop =
        scrollContainer instanceof HTMLElement ? scrollContainer.getBoundingClientRect().top : 0;
      const sectionTop = section.getBoundingClientRect().top - viewportTop;
      const distance = Math.max(1, section.offsetHeight - viewportHeight());
      return Math.min(1, Math.max(0, -sectionTop / distance));
    };

    const revealItems = (scrollDistance: number, animateReveal: boolean) => {
      const threshold = scrollDistance + viewportHeight();
      items.forEach((item) => {
        if (revealed.has(item) || item.offsetTop > threshold) return;
        revealed.add(item);
        if (animateReveal && !reducedMotion.matches) {
          item.style.animationDuration = `${(Math.random() * 0.2 + 1).toFixed(3)}s`;
          item.classList.add(styles.animate);
          const finish = () => {
            item.classList.add(styles.shown);
            item.classList.remove(styles.animate);
          };
          item.addEventListener('animationend', finish, { once: true });
        } else {
          item.classList.add(styles.shown);
        }
      });
    };

    updateGridRef.current = (progress, animateReveal) => {
      const normalized = Math.min(1, Math.max(0, progress));
      const scrollDistance = normalized * travelRef.current;
      grid.style.transform = `translate3d(0, -${scrollDistance.toFixed(2)}px, 0)`;
      revealItems(scrollDistance, animateReveal);
      isolayer.dataset.scrollProgress = normalized.toFixed(3);
    };

    const syncSceneGeometry = () => {
      const viewHeight = viewportHeight();
      const sceneHeight = Math.max(
        viewHeight,
        grid.offsetHeight + SOURCE_TRANSLATE_Y * Math.SQRT2,
      );
      section.style.setProperty('--isometric-scene-height', `${Math.ceil(sceneHeight)}px`);
      travelRef.current = Math.max(0, sceneHeight - viewHeight);
      updateGridRef.current(currentProgress(), false);
    };

    const scrollTarget = scrollContainer ?? window;
    const handleScroll = () => {
      cancelAnimationFrame(scrollFrame);
      scrollFrame = requestAnimationFrame(() => {
        updateGridRef.current(currentProgress(), true);
      });
    };
    scrollTarget.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    const initialize = async () => {
      for (const src of SOURCE_SCRIPTS) await loadSourceScript(src);
      if (disposed) return;

      const { dynamics, imagesLoaded, Masonry } = window;
      const expand = (item: HTMLElement) => {
        if (reducedMotion.matches) return;
        const link = item.querySelector<HTMLElement>('[data-isometric-link]');
        if (!link) return;
        const layers = Array.from(link.querySelectorAll<HTMLElement>('[data-isometric-layer]'));
        link.style.zIndex = item.style.zIndex = String(items.length);

        layers.forEach((layer, position) => {
          dynamics.stop(layer);
          dynamics.animate(
            layer,
            {
              translateZ: (position + 1) * 50,
              rotateZ: Math.floor(Math.random() * 7) - 3,
            },
            {
              type: dynamics.bezier,
              duration: 500,
              points: [
                { x: 0, y: 0, cp: [{ x: 0.2, y: 1 }] },
                { x: 1, y: 1, cp: [{ x: 0.3, y: 1 }] },
              ],
            },
          );
        });
      };

      const collapse = (item: HTMLElement) => {
        const link = item.querySelector<HTMLElement>('[data-isometric-link]');
        if (!link) return;
        const layers = Array.from(link.querySelectorAll<HTMLElement>('[data-isometric-layer]'));
        layers.forEach((layer) => {
          dynamics.stop(layer);
          if (reducedMotion.matches) {
            layer.style.transform = '';
            return;
          }
          dynamics.animate(
            layer,
            { translateZ: 0 },
            {
              duration: 100,
              complete: () => {
                link.style.zIndex = item.style.zIndex = '1';
              },
            },
          );
        });
      };

      const handlers = items.map((item) => {
        const enter = () => expand(item);
        const leave = () => collapse(item);
        item.addEventListener('mouseenter', enter);
        item.addEventListener('mouseleave', leave);
        return { item, enter, leave };
      });

      removeHandlers = () => {
        handlers.forEach(({ item, enter, leave }) => {
          item.removeEventListener('mouseenter', enter);
          item.removeEventListener('mouseleave', leave);
        });
      };
      stopAnimations = () => {
        items.forEach((item) => {
          item.querySelectorAll<HTMLElement>('[data-isometric-layer]').forEach((layer) =>
            dynamics.stop(layer),
          );
        });
      };

      masonry = new Masonry(grid, {
        itemSelector: '[data-isometric-item]',
        isFitWidth: true,
      });
      grid.dataset.loaded = 'true';
      syncSceneGeometry();

      resizeObserver = new ResizeObserver(syncSceneGeometry);
      resizeObserver.observe(grid);

      imagesLoaded(grid, () => {
        if (disposed) return;
        masonry?.layout();
        syncSceneGeometry();
      });
    };

    void initialize().catch(() => {
      if (disposed) return;
      grid.dataset.loaded = 'true';
      grid.dataset.runtime = 'fallback';
      items.forEach((item) => item.classList.add(styles.shown));
      syncSceneGeometry();
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(scrollFrame);
      scrollTarget.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      updateGridRef.current = () => {};
      resizeObserver?.disconnect();
      removeHandlers();
      stopAnimations();
      masonry?.destroy();
      section.style.removeProperty('--isometric-scene-height');
    };
  }, [scrollContainer, scrollRootRef]);

  return (
    <div
      ref={layerRef}
      className={styles.isolayer}
      data-isometric-grid="scrollable"
      data-scroll-progress="0.000"
      aria-hidden
    >
      <ul ref={gridRef} className={styles.grid} data-isometric-masonry>
        {TILES.map((src) => (
          <li className={styles.item} data-isometric-item key={src}>
            <div className={styles.link} data-isometric-link>
              <img
                src={assetUrl('/landing/vendor/isometric-grids/canvas.png')}
                alt=""
                width={270}
                height={203}
                className={`${styles.image} ${styles.layer}`}
                data-isometric-layer
                data-layer-kind="canvas"
              />
              <img
                src={assetUrl('/landing/vendor/isometric-grids/wireframe.png')}
                alt=""
                width={270}
                height={203}
                className={`${styles.image} ${styles.layer}`}
                data-isometric-layer
                data-layer-kind="wireframe"
              />
              <Image
                src={src}
                alt=""
                width={270}
                height={203}
                quality={92}
                sizes="270px"
                className={`${styles.image} ${styles.layer}`}
                data-isometric-layer
                data-layer-kind="final"
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
