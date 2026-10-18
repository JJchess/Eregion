import { assetUrl } from '@/app/assets';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import Image from '@/app/adapters/image';
import { ArrowLeft, Play } from 'lucide-react';
import { useTranslations } from 'use-intl';
import SplitType from 'split-type';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useScrollContainer } from '../hooks/useScrollContainer';
import { SceneBackdrop } from '../SceneBackdrop';
import shell from '../landing.module.css';
import styles from './product.module.css';

gsap.registerPlugin(Flip, ScrollTrigger);

type ProductNamespace = 'video' | 'notes' | 'lab' | 'interactiveLab' | 'classroom';

type ProductCopy = {
  title: string;
  titleLines?: [string, string];
  body: string;
  frame: {
    path: string;
    badge: string;
    caption: string;
    status: string;
  };
  aside?: {
    title: string;
    body: string;
  };
  closing?: {
    title: string;
    body: string;
  };
};

type ProductSpec = {
  namespace: ProductNamespace;
  id: string;
  cover: string;
  poster: string;
  video: string;
  thumbFolder: string;
  startAt: number;
  chapters: number[];
};

type ProductShowcaseItem = ProductSpec & {
  title: string;
  titleLines: [string, string];
  summary: string;
  detailTitle: string;
  detailBody: string;
  frame: ProductCopy['frame'];
  thumbnails: string[];
};

type ScrollLock = {
  node: HTMLElement;
  overflow: string;
  overscrollBehavior: string;
};

const ANIMATION = { duration: 1.5, ease: 'power4.inOut' } as const;

const PRODUCT_SPECS: ProductSpec[] = [
  {
    namespace: 'video',
    id: 'world-video',
    cover: assetUrl('/landing/codrops-image-to-content/6.jpg'),
    poster: assetUrl('/landing/poster-video.webp'),
    video: assetUrl('/landing/product-videos/interactive-video.mp4'),
    thumbFolder: 'video',
    startAt: 9.1,
    chapters: [6.8, 15.9, 25, 34.1],
  },
  {
    namespace: 'notes',
    id: 'world-notes',
    cover: assetUrl('/landing/codrops-image-to-content/2.jpg'),
    poster: assetUrl('/landing/poster-notes.webp'),
    video: assetUrl('/landing/product-videos/interactive-lecture.mp4'),
    thumbFolder: 'notes',
    startAt: 17.4,
    chapters: [3.9, 9.2, 14.4, 19.6],
  },
  {
    namespace: 'lab',
    id: 'world-lab',
    cover: assetUrl('/landing/codrops-image-to-content/7.jpg'),
    poster: assetUrl('/landing/poster-lab.webp'),
    video: assetUrl('/landing/product-videos/code-lab.mp4'),
    thumbFolder: 'code-lab',
    startAt: 26.7,
    chapters: [6.7, 15.6, 24.5, 33.4],
  },
  {
    namespace: 'interactiveLab',
    id: 'world-interactive-lab',
    cover: assetUrl('/landing/codrops-image-to-content/4.jpg'),
    poster: assetUrl('/landing/poster-interactive-lab.webp'),
    video: assetUrl('/landing/product-videos/interactive-lab.mp4'),
    thumbFolder: 'interactive-lab',
    startAt: 22.8,
    chapters: [5.1, 12, 18.8, 25.7],
  },
  {
    namespace: 'classroom',
    id: 'world-classroom',
    cover: assetUrl('/landing/codrops-image-to-content/8.jpg'),
    poster: assetUrl('/landing/poster-classroom.webp'),
    video: assetUrl('/landing/product-videos/cloud-classroom.mp4'),
    thumbFolder: 'classroom',
    startAt: 26,
    chapters: [11.6, 27.2, 42.7, 58.2],
  },
];

function findScrollContainer(node: HTMLElement): HTMLElement {
  let current = node.parentElement;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    if (/(auto|scroll)/.test(style.overflowY) && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return document.documentElement;
}

function cleanRichBreaks(value: string): string {
  return value.replace(/<br\s*\/?>(?:<\/br>)?/gi, ' ').replace(/\s+/g, ' ').trim();
}

function isInViewport(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.bottom >= 0 && rect.top <= window.innerHeight;
}

/**
 * React/Next adaptation of Codrops' MIT-licensed ImageToContent experiment:
 * https://github.com/codrops/ImageToContent
 *
 * The DOM vocabulary and GSAP choreography intentionally follow the reference. The
 * product cover is physically moved into the content view and returned on close so
 * Flip animates one real object rather than cross-fading two approximations.
 */
export function ProductShowcase() {
  const t = useTranslations('Landing');
  const rootRef = useRef<HTMLElement>(null);
  const previewRefs = useRef<Array<HTMLElement | null>>([]);
  const imageWrapRefs = useRef<Array<HTMLDivElement | null>>([]);
  const imageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const imageInnerRefs = useRef<Array<HTMLDivElement | null>>([]);
  const triggerRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const overlayRef = useRef<HTMLDivElement>(null);
  const mediaSlotRef = useRef<HTMLDivElement>(null);
  const contentTitleRef = useRef<HTMLHeadingElement>(null);
  const contentMetaRef = useRef<HTMLDivElement>(null);
  const contentBodyRef = useRef<HTMLParagraphElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const mediaTimelineRef = useRef<gsap.core.Timeline | null>(null);
  const scrollSyncFrameRef = useRef<number | null>(null);
  const scrollLockRef = useRef<ScrollLock | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const adjacentRef = useRef<Array<{ element: HTMLElement; position: number }>>([]);
  const imageScaleRef = useRef(1);
  const isAnimatingRef = useRef(false);
  const activeIndexRef = useRef<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [transitionComplete, setTransitionComplete] = useState(false);
  const [chapterIndex, setChapterIndex] = useState<number | null>(null);
  const scrollContainer = useScrollContainer(rootRef);

  const items = useMemo<ProductShowcaseItem[]>(
    () =>
      PRODUCT_SPECS.map((spec) => {
        const copy = t.raw(spec.namespace) as ProductCopy;
        const detail = copy.aside ?? copy.closing ?? { title: copy.title, body: copy.body };
        const fallbackLines: [string, string] = [copy.title, copy.frame.badge];
        return {
          ...spec,
          title: copy.title,
          titleLines: copy.titleLines ?? fallbackLines,
          summary: copy.body,
          detailTitle: detail.title,
          detailBody: cleanRichBreaks(detail.body),
          frame: copy.frame,
          thumbnails: [1, 2, 3, 4].map(
            (index) => assetUrl(`/landing/product-thumbs/${spec.thumbFolder}/${index}.webp`),
          ),
        };
      }),
    [t],
  );

  const activeItem = activeIndex === null ? null : items[activeIndex];
  activeIndexRef.current = activeIndex;
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (scrollContainer === undefined || !rootRef.current || reduceMotion()) return;

    const context = gsap.context(() => {
      previewRefs.current.forEach((preview, index) => {
        const imageInner = imageInnerRefs.current[index];
        const title = preview?.querySelector<HTMLElement>(`[data-preview-title]`);
        if (!preview || !imageInner || !title) return;

        gsap.set(imageInner, { transformOrigin: '50% 0%' });
        gsap
          .timeline({
            scrollTrigger: {
              trigger: preview,
              ...(scrollContainer ? { scroller: scrollContainer } : {}),
              start: 'top bottom',
              end: 'bottom top',
              scrub: true,
            },
          })
          .addLabel('scroll', 0)
          .to(title, { yPercent: -100, ease: 'none' }, 'scroll')
          .to(imageInner, { scaleY: 1.8, ease: 'none' }, 'scroll');
      });
    }, rootRef);

    ScrollTrigger.refresh();
    return () => context.revert();
  }, [scrollContainer]);

  const restorePage = useCallback((focusIndex?: number) => {
    const lock = scrollLockRef.current;
    if (lock) {
      lock.node.style.overflow = lock.overflow;
      lock.node.style.overscrollBehavior = lock.overscrollBehavior;
      scrollLockRef.current = null;
    }
    if (mainRef.current) {
      mainRef.current.inert = false;
      mainRef.current = null;
    }
    if (focusIndex !== undefined) {
      triggerRefs.current[focusIndex]?.focus({ preventScroll: true });
    }
  }, []);

  const openProduct = useCallback((index: number) => {
    if (isAnimatingRef.current || activeIndex !== null) return;
    const preview = previewRefs.current[index];
    const imageInner = imageInnerRefs.current[index];
    if (!preview || !imageInner) return;

    isAnimatingRef.current = true;
    imageScaleRef.current = Number(gsap.getProperty(imageInner, 'scaleY')) || 1;
    adjacentRef.current = previewRefs.current.flatMap((element, position) =>
      element && position !== index && isInViewport(element) ? [{ element, position }] : [],
    );
    setVideoReady(false);
    setVideoError(false);
    setTransitionComplete(false);
    setChapterIndex(null);
    setActiveIndex(index);
  }, [activeIndex]);

  useLayoutEffect(() => {
    if (
      activeIndex === null ||
      !overlayRef.current ||
      !mediaSlotRef.current ||
      !contentTitleRef.current ||
      !contentMetaRef.current ||
      !contentBodyRef.current ||
      !thumbsRef.current ||
      !backRef.current
    ) {
      return;
    }

    const image = imageRefs.current[activeIndex];
    const imageInner = imageInnerRefs.current[activeIndex];
    const preview = previewRefs.current[activeIndex];
    const trigger = triggerRefs.current[activeIndex];
    if (!image || !imageInner || !preview || !trigger) return;

    const overlay = overlayRef.current;
    const mediaSlot = mediaSlotRef.current;
    const previewTitleLines = preview.querySelectorAll<HTMLElement>('[data-preview-line]');
    const previewDescription = preview.querySelector<HTMLElement>('[data-preview-desc]');
    const contentTitleLines = contentTitleRef.current.querySelectorAll<HTMLElement>('[data-content-line]');
    const split = new SplitType(contentBodyRef.current, { types: 'lines' });
    const bodyLines = split.lines ?? [];
    const thumbnailItems = thumbsRef.current.querySelectorAll<HTMLElement>('[data-content-thumb]');
    const reduce = reduceMotion();

    const main = trigger.closest('main');
    const scrollNode = findScrollContainer(trigger);
    mainRef.current = main;
    if (main) main.inert = true;
    scrollLockRef.current = {
      node: scrollNode,
      overflow: scrollNode.style.overflow,
      overscrollBehavior: scrollNode.style.overscrollBehavior,
    };
    scrollNode.style.overflow = 'hidden';
    scrollNode.style.overscrollBehavior = 'none';

    gsap.set(overlay, { autoAlpha: 1 });
    gsap.set([backRef.current, contentMetaRef.current], { autoAlpha: 0 });
    gsap.set(contentTitleLines, { yPercent: -105, autoAlpha: 0 });
    gsap.set(thumbnailItems, { scale: 0, yPercent: 150, transformOrigin: '0% 0%' });
    gsap.set(bodyLines, { yPercent: 105, autoAlpha: 0, clipPath: 'inset(100% 0 0 0)' });
    if (videoRef.current) gsap.set(videoRef.current, { autoAlpha: 0 });

    const flipState = Flip.getState(image);
    mediaSlot.appendChild(image);

    const timeline = gsap.timeline({
      defaults: reduce ? { duration: 0.14, ease: 'power2.out' } : ANIMATION,
      onComplete: () => {
        isAnimatingRef.current = false;
        setTransitionComplete(true);
        backRef.current?.focus();
      },
    });
    timelineRef.current = timeline;
    timeline.addLabel('start', 0);

    if (reduce) {
      timeline.set(image, { autoAlpha: 1 }, 'start');
    } else {
      adjacentRef.current.forEach(({ element, position }) => {
        timeline.to(
          element,
          { y: position < activeIndex ? -window.innerHeight : window.innerHeight },
          'start',
        );
      });
      timeline.add(
        Flip.from(flipState, {
          duration: ANIMATION.duration,
          ease: ANIMATION.ease,
          absolute: true,
          scale: true,
          simple: true,
        }),
        'start',
      );
      timeline.to(
        previewTitleLines,
        { yPercent: 105, autoAlpha: 0, stagger: -0.03 },
        'start',
      );
      if (previewDescription) {
        timeline.to(previewDescription, { yPercent: 60, autoAlpha: 0 }, 'start');
      }
      timeline.to(imageInner, { scaleY: 1 }, 'start');
    }

    timeline.addLabel('content', reduce ? 0 : 0.15);
    timeline.to(backRef.current, { autoAlpha: 1 }, 'content');
    timeline.to(contentTitleLines, { yPercent: 0, autoAlpha: 1, stagger: -0.05 }, 'content');
    timeline.to(contentMetaRef.current, { autoAlpha: 1 }, 'content');
    timeline.to(thumbnailItems, { scale: 1, yPercent: 0, stagger: -0.05 }, 'content');
    timeline.to(
      bodyLines,
      {
        yPercent: 0,
        autoAlpha: 1,
        clipPath: 'inset(0% 0 0 0)',
        stagger: reduce ? 0 : 0.1,
      },
      'content',
    );

    return () => {
      timeline.kill();
      split.revert();
    };
  }, [activeIndex]);

  useEffect(() => {
    if (
      activeIndex === null ||
      !transitionComplete ||
      !videoReady ||
      videoError ||
      !videoRef.current
    ) {
      return;
    }
    const image = imageRefs.current[activeIndex];
    if (!image) return;
    const reduce = reduceMotion();
    const video = videoRef.current;

    mediaTimelineRef.current?.kill();
    gsap.set(image, { autoAlpha: 1 });
    gsap.set(video, { autoAlpha: 0 });
    void video.play().catch(() => {
      // Native controls remain available when autoplay is blocked.
    });
    const timeline = gsap.timeline({
      defaults: { duration: reduce ? 0.12 : 0.42, ease: 'power2.out' },
      onComplete: () => {
        mediaTimelineRef.current = null;
      },
    });
    mediaTimelineRef.current = timeline;
    timeline.to(image, { autoAlpha: 0 }, 0).to(video, { autoAlpha: 1 }, 0);

    return () => {
      timeline.kill();
      if (mediaTimelineRef.current === timeline) mediaTimelineRef.current = null;
    };
  }, [activeIndex, transitionComplete, videoError, videoReady]);

  const closeProduct = useCallback(() => {
    if (activeIndex === null || isAnimatingRef.current) return;
    const image = imageRefs.current[activeIndex];
    const imageInner = imageInnerRefs.current[activeIndex];
    const imageWrap = imageWrapRefs.current[activeIndex];
    const overlay = overlayRef.current;
    const preview = previewRefs.current[activeIndex];
    if (!image || !imageInner || !imageWrap || !overlay || !preview) return;

    isAnimatingRef.current = true;
    overlay.dataset.transitioning = 'true';
    setTransitionComplete(false);
    videoRef.current?.pause();
    mediaTimelineRef.current?.kill();
    mediaTimelineRef.current = null;
    gsap.killTweensOf(image);
    if (videoRef.current) gsap.killTweensOf(videoRef.current);
    const reduce = reduceMotion();
    const contentTitleLines = contentTitleRef.current?.querySelectorAll<HTMLElement>('[data-content-line]');
    const bodyLines = contentBodyRef.current?.querySelectorAll<HTMLElement>('.line');
    const thumbnailItems = thumbsRef.current?.querySelectorAll<HTMLElement>('[data-content-thumb]');
    const previewTitleLines = preview.querySelectorAll<HTMLElement>('[data-preview-line]');
    const previewDescription = preview.querySelector<HTMLElement>('[data-preview-desc]');

    gsap.set(image, { autoAlpha: 1 });
    if (videoRef.current) gsap.set(videoRef.current, { autoAlpha: 0 });
    const flipState = Flip.getState(image);
    imageWrap.appendChild(image);

    const timeline = gsap.timeline({
      defaults: reduce ? { duration: 0.14, ease: 'power2.inOut' } : ANIMATION,
      onComplete: () => {
        gsap.set(imageInner, { scaleY: imageScaleRef.current });
        gsap.set(overlay, { autoAlpha: 0 });
        timelineRef.current = null;
        setActiveIndex(null);
        setVideoReady(false);
        setVideoError(false);
        setTransitionComplete(false);
        restorePage(activeIndex);
        isAnimatingRef.current = false;
        scrollSyncFrameRef.current = requestAnimationFrame(() => {
          scrollSyncFrameRef.current = null;
          ScrollTrigger.update();
        });
      },
    });
    timelineRef.current = timeline;
    timeline.addLabel('start', 0);
    timeline.to(backRef.current, { autoAlpha: 0 }, 'start');
    if (contentTitleLines) {
      timeline.to(contentTitleLines, { yPercent: -105, autoAlpha: 0, stagger: 0.05 }, 'start');
    }
    timeline.to(contentMetaRef.current, { autoAlpha: 0 }, 'start');
    if (thumbnailItems) {
      timeline.to(thumbnailItems, { scale: 0, yPercent: 150, stagger: -0.05 }, 'start');
    }
    if (bodyLines) {
      timeline.to(
        bodyLines,
        { yPercent: -105, autoAlpha: 0, clipPath: 'inset(0 0 100% 0)', stagger: 0.02 },
        'start',
      );
    }
    timeline.addLabel('preview', reduce ? 0 : 0.15);

    if (!reduce) {
      timeline.to(adjacentRef.current.map(({ element }) => element), { y: 0 }, 'preview');
      timeline.add(
        Flip.from(flipState, {
          duration: ANIMATION.duration,
          ease: ANIMATION.ease,
          absolute: true,
          scale: true,
          simple: true,
        }),
        'preview',
      );
      timeline.to(previewTitleLines, { yPercent: 0, autoAlpha: 1, stagger: 0.03 }, 'preview');
      if (previewDescription) {
        timeline.to(previewDescription, { yPercent: 0, autoAlpha: 1 }, 'preview');
      }
      timeline.to(imageInner, { scaleY: imageScaleRef.current }, 'preview');
    }
  }, [activeIndex, restorePage]);

  useEffect(() => {
    if (activeIndex === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeProduct();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, closeProduct]);

  useEffect(
    () => () => {
      if (scrollSyncFrameRef.current !== null) {
        cancelAnimationFrame(scrollSyncFrameRef.current);
        scrollSyncFrameRef.current = null;
      }
      timelineRef.current?.kill();
      mediaTimelineRef.current?.kill();
      videoRef.current?.pause();
      const currentIndex = activeIndexRef.current;
      if (currentIndex !== null) {
        const image = imageRefs.current[currentIndex];
        const imageWrap = imageWrapRefs.current[currentIndex];
        if (image && imageWrap) imageWrap.appendChild(image);
      }
      restorePage();
    },
    [restorePage],
  );

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !overlayRef.current) return;
    const focusable = Array.from(
      overlayRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), video[controls]',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const seekToChapter = (index: number) => {
    if (!activeItem || !videoRef.current) return;
    videoRef.current.currentTime = activeItem.chapters[index];
    setChapterIndex(index);
    void videoRef.current.play().catch(() => undefined);
  };

  const dialog = mounted && activeItem && activeIndex !== null ? createPortal(
    <div
      ref={overlayRef}
      className={styles.contentWrap}
      role="dialog"
      aria-modal="true"
      aria-label={`${t('player.demo')}: ${activeItem.title}`}
      data-transitioning={transitionComplete ? 'false' : 'true'}
      onKeyDown={trapFocus}
    >
      <div className={styles.contentGrid}>
        <button
          ref={backRef}
          type="button"
          className={styles.backButton}
          onClick={closeProduct}
          aria-label={t('player.close')}
        >
          <ArrowLeft size={24} strokeWidth={1.6} aria-hidden />
          <span>{t('player.back')}</span>
        </button>

        <div ref={mediaSlotRef} className={styles.contentMedia}>
          {!videoReady && !videoError && (
            <div className={styles.videoLoading} aria-live="polite">
              <span>{t('player.loading')}</span>
            </div>
          )}
          {videoError && transitionComplete && (
            <div className={styles.videoError} role="status">
              {t('player.error')}
            </div>
          )}
          <video
            ref={videoRef}
            src={activeItem.video}
            poster={activeItem.poster}
            controls
            playsInline
            preload="metadata"
            onCanPlay={() => {
              setVideoError(false);
              setVideoReady(true);
            }}
            onError={() => {
              setVideoReady(false);
              setVideoError(true);
            }}
            onLoadedMetadata={(event) => {
              if (activeItem.startAt < event.currentTarget.duration) {
                event.currentTarget.currentTime = activeItem.startAt;
              }
            }}
          />
        </div>

        <div ref={thumbsRef} className={styles.contentThumbs}>
          {activeItem.thumbnails.map((src, index) => (
            <button
              key={src}
              type="button"
              data-content-thumb
              className={`${styles.contentThumb} ${chapterIndex === index ? styles.contentThumbActive : ''}`}
              onClick={() => seekToChapter(index)}
              aria-label={t('player.chapter', { number: index + 1 })}
            >
              <Image src={src} alt="" fill sizes="110px" />
            </button>
          ))}
        </div>

        <div className={styles.contentGroup}>
          <h2 ref={contentTitleRef} className={styles.contentTitle} aria-label={activeItem.title}>
            {activeItem.titleLines.map((line, index) => (
              <span key={line} className={styles.lineMask}>
                <span data-content-line className={index === 1 ? styles.titleAccent : undefined}>
                  {line}
                </span>
              </span>
            ))}
          </h2>
          <div ref={contentMetaRef} className={styles.contentMeta}>
            <span>{activeItem.frame.badge}</span>
            <span>{activeItem.frame.path}</span>
          </div>
          <h3 className={styles.contentClaim}>{activeItem.detailTitle}</h3>
          <p ref={contentBodyRef} className={styles.contentBody}>
            {activeItem.detailBody}
          </p>
          <div className={styles.contentStatus}>
            <span>{activeItem.frame.caption}</span>
            <span>{activeItem.frame.status}</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <section
      id="products"
      ref={rootRef}
      className={`${styles.showcase} ${shell.sceneSection}`}
      data-landing-scene="products"
      aria-label={t('player.collection')}
    >
      <SceneBackdrop />
      <aside className={styles.previewFrame} aria-hidden>
        <div className={styles.previewFrameMasthead}>
          <span className={`${styles.previewFrameLabel} ${styles.previewFrameBrand}`}>
            AI COSMOS
          </span>
          <span className={`${styles.previewFrameLabel} ${styles.previewFrameCollection}`}>
            {t('player.collection')}
          </span>
        </div>
        <div className={styles.previewFrameCopy} data-product-frame-copy>
          <strong className={styles.previewFrameCopyTitle} data-product-frame-copy-title>
            {t('player.railTitle')}
          </strong>
          <span className={styles.previewFrameCopyBody} data-product-frame-copy-body>
            {t('player.railBody')}
          </span>
        </div>
      </aside>
      <div className={styles.previewWrap}>
        {items.map((item, index) => (
          <article
            key={item.namespace}
            id={item.id}
            ref={(node) => {
              previewRefs.current[index] = node;
            }}
            className={styles.preview}
            data-scene-enter={index === 0 ? '' : undefined}
            data-scene-exit={index === items.length - 1 ? 'standard' : undefined}
          >
            <button
              ref={(node) => {
                triggerRefs.current[index] = node;
              }}
              type="button"
              className={styles.previewImageButton}
              onClick={() => openProduct(index)}
              aria-label={`${t('player.watch')}: ${item.frame.path}`}
            >
              <div
                ref={(node) => {
                  imageWrapRefs.current[index] = node;
                }}
                className={styles.previewImageWrap}
              >
                <div
                  ref={(node) => {
                    imageRefs.current[index] = node;
                  }}
                  className={styles.productImage}
                  data-product-cover
                >
                  <div
                    ref={(node) => {
                      imageInnerRefs.current[index] = node;
                    }}
                    className={styles.productImageInner}
                    data-product-image-inner
                  >
                    <Image
                      src={item.cover}
                      alt=""
                      width={1200}
                      height={675}
                      priority={index === 0}
                      unoptimized
                      sizes="(max-width: 1023px) 100vw, calc(100vw - 96px)"
                      className={styles.productImageAsset}
                    />
                  </div>
                </div>
              </div>
              <span className={styles.previewPlay} aria-hidden>
                <Play size={22} fill="currentColor" strokeWidth={0} />
              </span>
            </button>

            <div className={styles.previewTitle} data-preview-title>
              <h2 className={styles.previewTitleMain} aria-label={item.title}>
                <span className={styles.previewLineMask}>
                  <span data-preview-line>{item.title}</span>
                </span>
              </h2>
              <p className={styles.previewDescription} data-preview-desc>
                {item.summary}
              </p>
            </div>
          </article>
        ))}
      </div>
      {dialog}
    </section>
  );
}
