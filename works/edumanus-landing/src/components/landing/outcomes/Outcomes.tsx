import { assetUrl } from '@/app/assets';
import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import Image from '@/app/adapters/image';
import { useTranslations } from 'use-intl';
import { useReducedMotion } from 'motion/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SceneBackdrop } from '../SceneBackdrop';
import { useScrollContainer } from '../hooks/useScrollContainer';
import shell from '../landing.module.css';
import styles from './outcomes.module.css';

gsap.registerPlugin(ScrollTrigger);

type Card = {
  index: string;
  code: string;
  title: string;
  body: string;
  tags: string;
  glyph: string;
  footer: string;
};

type Direction = 'left' | 'right' | 'top' | 'bottom';
type MediaSlot = 'mediaPrimary' | 'mediaTop' | 'mediaBottom';

const CARD_MEDIA: Array<Array<{ src: string; direction: Direction; slot: MediaSlot }>> = [
  [
    { src: assetUrl('/landing/codrops-image-to-content/6.jpg'), direction: 'right', slot: 'mediaPrimary' },
    { src: assetUrl('/landing/codrops-image-to-content/2.jpg'), direction: 'top', slot: 'mediaTop' },
    { src: assetUrl('/landing/codrops-image-to-content/4.jpg'), direction: 'left', slot: 'mediaBottom' },
  ],
  [
    { src: assetUrl('/landing/codrops-image-to-content/8.jpg'), direction: 'left', slot: 'mediaPrimary' },
    { src: assetUrl('/landing/codrops-image-to-content/2.jpg'), direction: 'bottom', slot: 'mediaTop' },
    { src: assetUrl('/landing/codrops-image-to-content/6.jpg'), direction: 'right', slot: 'mediaBottom' },
  ],
  [
    { src: assetUrl('/landing/codrops-image-to-content/7.jpg'), direction: 'bottom', slot: 'mediaPrimary' },
    { src: assetUrl('/landing/codrops-image-to-content/4.jpg'), direction: 'right', slot: 'mediaTop' },
    { src: assetUrl('/landing/codrops-image-to-content/8.jpg'), direction: 'top', slot: 'mediaBottom' },
  ],
];

const CLIP_FROM: Record<Direction, string> = {
  right: 'polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)',
  left: 'polygon(100% 0%, 100% 0%, 100% 100%, 100% 100%)',
  top: 'polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%)',
  bottom: 'polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)',
};

const CLIP_OPEN = 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)';
const CHAPTER_STARTS = [0.12, 0.4, 0.68] as const;
const CHAPTER_TARGETS = [0.26, 0.54, 0.84] as const;
const OVERVIEW_TARGET = 0.04;

function cleanRichBreaks(value: string) {
  return value.replace(/<br\s*\/?>(?:<\/br>)?/gi, ' ').replace(/\s+/g, ' ').trim();
}

function splitTitleAtComma(value: string): string[] {
  const commaIndex = Math.max(value.indexOf('，'), value.indexOf(','));
  if (commaIndex < 0) return [value];
  return [value.slice(0, commaIndex + 1).trim(), value.slice(commaIndex + 1).trim()];
}

function chapterFromProgress(progress: number): number | null {
  if (progress < CHAPTER_STARTS[0]) return null;
  if (progress < CHAPTER_STARTS[1]) return 0;
  if (progress < CHAPTER_STARTS[2]) return 1;
  return 2;
}

export function Outcomes() {
  const t = useTranslations('Landing.outcomes');
  const cards = t.raw('cards') as Card[];
  const title = t('title');
  const titleLines = splitTitleAtComma(title);
  const reduceMotion = useReducedMotion() === true;
  const rootRef = useRef<HTMLElement>(null);
  const idleRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const panelRefs = useRef<Array<HTMLElement | null>>([]);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const activeRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const scrollContainer = useScrollContainer(rootRef);

  const activateOutcome = useCallback(
    (index: number | null, immediate = false) => {
      const idle = idleRef.current;
      if (!idle || activeRef.current === index) return;

      const previousIndex = activeRef.current;
      const previousPanel = previousIndex === null ? null : panelRefs.current[previousIndex] ?? null;
      const nextPanel = index === null ? null : panelRefs.current[index] ?? null;
      if (index !== null && !nextPanel) return;

      timelineRef.current?.kill();
      gsap.killTweensOf([idle, ...panelRefs.current.filter(Boolean)]);

      const panelsToHide = panelRefs.current.filter(
        (panel): panel is HTMLElement => Boolean(panel && panel !== previousPanel && panel !== nextPanel),
      );
      gsap.set(panelsToHide, { autoAlpha: 0, visibility: 'hidden', zIndex: 0 });

      if (index === null) {
        if (!previousPanel || immediate || reduceMotion) {
          if (previousPanel) {
            gsap.set(previousPanel, { autoAlpha: 0, visibility: 'hidden', zIndex: 0 });
          }
          gsap.set(idle, { autoAlpha: 1 });
        } else {
          const previousCard = previousPanel.querySelector<HTMLElement>('[data-outcome-card]');
          const previousImages = gsap.utils.toArray<HTMLElement>(
            '[data-outcome-image]',
            previousPanel,
          );
          const previousInnerImages = gsap.utils.toArray<HTMLElement>(
            '[data-outcome-image-inner]',
            previousPanel,
          );

          timelineRef.current = gsap
            .timeline({ defaults: { ease: 'power3.inOut', overwrite: 'auto' } })
            .addLabel('return', 0)
            .to(idle, { autoAlpha: 1, duration: 0.52 }, 'return')
            .to(
              previousCard,
              { autoAlpha: 0, y: 16, scale: 0.985, duration: 0.4 },
              'return',
            )
            .to(
              previousImages,
              {
                clipPath: (_, element) =>
                  CLIP_FROM[(element as HTMLElement).dataset.dir as Direction],
                duration: 0.64,
                stagger: 0.025,
              },
              'return+=0.08',
            )
            .to(previousInnerImages, { scale: 1.1, duration: 0.64 }, 'return+=0.08')
            .set(previousPanel, { autoAlpha: 0, visibility: 'hidden', zIndex: 0 });
        }
      } else if (nextPanel) {
        const nextCard = nextPanel.querySelector<HTMLElement>('[data-outcome-card]');
        const nextTitle = nextPanel.querySelector<HTMLElement>('[data-outcome-title]');
        const nextBody = nextPanel.querySelector<HTMLElement>('[data-outcome-body]');
        const nextImages = gsap.utils.toArray<HTMLElement>('[data-outcome-image]', nextPanel);
        const nextInnerImages = gsap.utils.toArray<HTMLElement>(
          '[data-outcome-image-inner]',
          nextPanel,
        );

        if (previousPanel) gsap.set(previousPanel, { zIndex: 1 });
        gsap.set(nextPanel, { autoAlpha: 1, visibility: 'visible', zIndex: 2 });

        if (immediate || reduceMotion) {
          if (previousPanel) {
            gsap.set(previousPanel, { autoAlpha: 0, visibility: 'hidden', zIndex: 0 });
          }
          gsap.set(idle, { autoAlpha: 0 });
          gsap.set(nextCard, { autoAlpha: 1, x: 0, y: 0, scale: 1 });
          gsap.set([nextTitle, nextBody], { autoAlpha: 1, x: 0, y: 0, scale: 1 });
          gsap.set(nextImages, { clipPath: CLIP_OPEN, xPercent: 0, yPercent: 0 });
          gsap.set(nextInnerImages, { scale: 1 });
        } else {
          gsap.set(nextImages, {
            clipPath: (_, element) =>
              CLIP_FROM[(element as HTMLElement).dataset.dir as Direction],
          });

          timelineRef.current = gsap
            .timeline({ defaults: { ease: 'power4.inOut', overwrite: 'auto' } })
            .addLabel('reveal', 0)
            .to(idle, { autoAlpha: 0, duration: 0.5 }, 'reveal')
            .fromTo(
              nextCard,
              { autoAlpha: 0, y: 8, scale: 0.982 },
              { autoAlpha: 1, y: 0, scale: 1, duration: 0.64 },
              'reveal',
            )
            .fromTo(
              nextTitle,
              { autoAlpha: 0, y: 12, scale: 0.965 },
              { autoAlpha: 1, y: 0, scale: 1, duration: 0.72 },
              'reveal+=0.06',
            )
            .fromTo(
              nextBody,
              { autoAlpha: 0, y: 18 },
              { autoAlpha: 1, y: 0, duration: 0.64 },
              'reveal+=0.12',
            )
            .fromTo(
              nextImages,
              {
                xPercent: (imageIndex) => [-3, 2, -2][imageIndex] ?? 0,
                yPercent: (imageIndex) => [2, -3, 2][imageIndex] ?? 0,
              },
              {
                xPercent: 0,
                yPercent: 0,
                clipPath: CLIP_OPEN,
                duration: 0.78,
                stagger: 0.035,
              },
              'reveal+=0.18',
            )
            .fromTo(
              nextInnerImages,
              { scale: 1.08 },
              { scale: 1, duration: 0.78 },
              'reveal+=0.18',
            );

          if (previousPanel) {
            timelineRef.current
              .to(previousPanel, { autoAlpha: 0, duration: 0.44 }, 'reveal+=0.22')
              .set(previousPanel, { visibility: 'hidden', zIndex: 0 });
          }
        }
      }

      activeRef.current = index;
      setActiveIndex(index);
    },
    [reduceMotion],
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const context = gsap.context(() => {
      gsap.set(panelRefs.current.filter(Boolean), {
        autoAlpha: 0,
        visibility: 'hidden',
        zIndex: 0,
      });
      if (idleRef.current) gsap.set(idleRef.current, { autoAlpha: 1 });
    }, root);

    return () => {
      timelineRef.current?.kill();
      context.revert();
    };
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || scrollContainer === undefined || reduceMotion) return;

    const context = gsap.context(() => {
      const syncChapter = (progress: number, immediate = false) => {
        activateOutcome(chapterFromProgress(progress), immediate);
      };

      const trigger = ScrollTrigger.create({
        trigger: root,
        ...(scrollContainer ? { scroller: scrollContainer } : {}),
        start: 'top top',
        end: 'bottom bottom',
        invalidateOnRefresh: true,
        onUpdate: (self) => syncChapter(self.progress),
        onRefresh: (self) => syncChapter(self.progress, true),
      });

      syncChapter(trigger.progress, true);
      root.dataset.outcomesReady = 'true';
    }, root);

    requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => {
      delete root.dataset.outcomesReady;
      context.revert();
    };
  }, [activateOutcome, reduceMotion, scrollContainer]);

  const scrollToProgress = useCallback(
    (progress: number) => {
      const root = rootRef.current;
      if (!root) return;

      const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth';
      if (scrollContainer) {
        const rootTop =
          scrollContainer.scrollTop +
          root.getBoundingClientRect().top -
          scrollContainer.getBoundingClientRect().top;
        const travel = Math.max(0, root.offsetHeight - scrollContainer.clientHeight);
        scrollContainer.scrollTo({ top: rootTop + travel * progress, behavior });
        return;
      }

      const rootTop = window.scrollY + root.getBoundingClientRect().top;
      const travel = Math.max(0, root.offsetHeight - window.innerHeight);
      window.scrollTo({ top: rootTop + travel * progress, behavior });
    },
    [reduceMotion, scrollContainer],
  );

  const navigateToOutcome = useCallback(
    (index: number) => scrollToProgress(CHAPTER_TARGETS[index] ?? CHAPTER_TARGETS[0]),
    [scrollToProgress],
  );

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      let nextIndex: number | null = null;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        nextIndex = (index + 1) % cards.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        nextIndex = (index - 1 + cards.length) % cards.length;
      } else if (event.key === 'Home') {
        nextIndex = 0;
      } else if (event.key === 'End') {
        nextIndex = cards.length - 1;
      } else if (event.key === 'Escape') {
        event.preventDefault();
        scrollToProgress(OVERVIEW_TARGET);
        return;
      }

      if (nextIndex === null) return;
      event.preventDefault();
      buttonRefs.current[nextIndex]?.focus({ preventScroll: true });
      navigateToOutcome(nextIndex);
    },
    [cards.length, navigateToOutcome, scrollToProgress],
  );

  return (
    <section
      ref={rootRef}
      id="outcomes"
      className={`${styles.section} ${shell.sceneSection}`}
      data-landing-scene="outcomes"
      data-outcomes-active={activeIndex ?? 'overview'}
      aria-labelledby="outcomes-title"
    >
      <SceneBackdrop />
      <div className={styles.desktopScene} data-outcomes-stage data-scene-exit="standard">
        <div ref={idleRef} className={styles.idle}>
          <div className={styles.idleCopy} data-scene-enter>
            <h2 id="outcomes-title" className={styles.idleTitle}>
              {titleLines.map((line) => (
                <span key={line} className={styles.titleLine}>{line}</span>
              ))}
            </h2>
            <p>{t('body')}</p>
          </div>
        </div>

        <div className={styles.audienceNavAnchor} data-outcome-nav-anchor>
          <nav className={styles.audienceNav} data-scene-enter aria-label={title}>
            {cards.map((card, index) => (
              <button
                key={card.index}
                ref={(node) => {
                  buttonRefs.current[index] = node;
                }}
                type="button"
                className={styles.audienceButton}
                data-outcome-tab={index}
                aria-expanded={activeIndex === index}
                aria-controls={`outcome-panel-${index}`}
                onClick={() => navigateToOutcome(index)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
              >
                <span>{card.index}</span>
                <strong>{card.code}</strong>
              </button>
            ))}
          </nav>
        </div>

        <div className={styles.panelHost}>
          {cards.map((card, index) => (
            <article
              key={card.index}
              id={`outcome-panel-${index}`}
              ref={(node) => {
                panelRefs.current[index] = node;
              }}
              className={styles.panel}
              aria-hidden={activeIndex !== index}
            >
              {CARD_MEDIA[index].map((media) => (
                <div
                  key={`${card.index}-${media.slot}`}
                  className={`${styles.mediaSlot} ${styles[media.slot]}`}
                  data-dir={media.direction}
                  data-outcome-image
                >
                  <div className={styles.mediaInner} data-outcome-image-inner>
                    <Image
                      src={media.src}
                      alt=""
                      fill
                      sizes="(max-width: 767px) 58vw, (max-width: 1023px) 56vw, 44vw"
                      className={styles.panelImage}
                    />
                  </div>
                </div>
              ))}

              <div className={styles.panelCopyAnchor}>
                <div className={styles.panelCopy} data-outcome-card>
                  <div data-outcome-title>
                    <span className={styles.panelCode}>{card.code}</span>
                    <h3>{card.title}</h3>
                  </div>
                  <div className={styles.panelBody} data-outcome-body>
                    <p>{cleanRichBreaks(card.body)}</p>
                    <ul aria-label={card.tags}>
                      {card.tags.split(' · ').map((tag) => (
                        <li key={tag}>{tag}</li>
                      ))}
                    </ul>
                    <span>{card.footer}</span>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className={`${shell.shell} ${styles.mobileScene}`} data-scene-exit="standard">
        <h2 className={`${shell.display} ${shell.h2} ${styles.mobileTitle}`} data-scene-enter>
          {titleLines.map((line) => (
            <span key={line} className={styles.titleLine}>{line}</span>
          ))}
        </h2>
        <p className={`${shell.lead} ${styles.mobileIntro}`} data-scene-enter>
          {t('body')}
        </p>
        <div className={styles.mobileList} data-scene-enter>
          {cards.map((card, index) => (
            <article key={card.index} className={styles.mobileCard}>
              <div className={styles.mobileMedia}>
                <Image
                  src={CARD_MEDIA[index][0].src}
                  alt=""
                  fill
                  sizes="(max-width: 1023px) 100vw, 33vw"
                  className={styles.panelImage}
                />
              </div>
              <span className={styles.mobileCode}>{card.code}</span>
              <h3>{card.title}</h3>
              <p>{cleanRichBreaks(card.body)}</p>
              <ul aria-label={card.tags}>
                {card.tags.split(' · ').map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
