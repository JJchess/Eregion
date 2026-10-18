import { useRef } from 'react';
import { useTranslations } from 'use-intl';
import { IsometricGrid } from '../isometric/IsometricGrid';
import { SceneBackdrop } from '../SceneBackdrop';
import shell from '../landing.module.css';
import styles from './finale.module.css';

export function Finale() {
  const t = useTranslations('Landing.finale');
  const sectionRef = useRef<HTMLElement>(null);

  return (
    <section
      ref={sectionRef}
      id="finale"
      className={`${styles.section} ${shell.sceneSection}`}
      data-landing-scene="finale"
    >
      <SceneBackdrop />
      <div className={styles.stickyStage}>
        <div className={styles.copy} data-scene-enter>
          <h2 className={styles.heading}>
            {t.rich('title', {
              br: () => <br />,
              accent: (chunks) => chunks,
            })}
          </h2>
          <p className={styles.subtitle}>{t.rich('body', { br: () => <br /> })}</p>
        </div>
        <IsometricGrid scrollRootRef={sectionRef} />
      </div>
    </section>
  );
}
