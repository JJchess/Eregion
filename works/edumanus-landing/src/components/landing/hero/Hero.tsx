import type { CSSProperties } from 'react';
import { useTranslations } from 'use-intl';
import { AiCosmosLogo } from '@/components/ai-cosmos-logo';
import { SceneBackdrop } from '../SceneBackdrop';
import { landingTokens } from '../tokens';
import shell from '../landing.module.css';
import styles from './hero.module.css';

/**
 * Hero: the promise on the left, the reactive knowledge field cropped off the right.
 *
 * Everything here is server-rendered plain markup with CSS entry animations —
 * deliberately no framer-motion. A framer `initial={{ opacity: 0 }}` serializes
 * `style="opacity:0"` into the SSR HTML, which would leave the headline and copy
 * invisible until hydration and push LCP out to TTI.
 */
export function Hero() {
  const t = useTranslations('Landing.hero');

  return (
    <section
      id="hero"
      className={`${styles.hero} ${shell.sceneSection}`}
      data-landing-scene="hero"
    >
      <SceneBackdrop />
      <button
        id="landing-galaxy-drag-surface"
        type="button"
        className={styles.galaxyDragSurface}
        aria-label={t('interactionLabel')}
      />
      <div className={shell.shell}>
        <div className={styles.copy} data-scene-exit="standard">
          <span
            className={`${styles.kicker} ${styles.rise}`}
            style={{ color: landingTokens.haze, '--d': '0s' } as CSSProperties}
          >
            <AiCosmosLogo size={17} className={styles.kickerIcon} />
            {t('eyebrow')}
          </span>

          <h1
            className={`${shell.display} ${shell.h1} ${styles.headline} ${styles.rise}`}
            style={{ color: landingTokens.ink, '--d': '0.08s' } as CSSProperties}
          >
            {t.rich('headline', {
              line: (chunks) => (
                <span className={styles.headlineLine} data-headline-line>
                  {chunks}
                </span>
              ),
              accent: (chunks) => <span style={{ color: landingTokens.brand }}>{chunks}</span>,
            })}
          </h1>

          <p
            className={`${shell.leadHero} ${styles.body} ${styles.rise} mt-9`}
            style={{ color: landingTokens.haze, '--d': '0.16s' } as CSSProperties}
          >
            {t.rich('body', { br: () => <br className="hidden md:block" /> })}
          </p>

        </div>
      </div>
    </section>
  );
}
