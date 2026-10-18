import { useRef } from 'react';
import { NavBar } from './NavBar';
import { Hero } from './hero/Hero';
import { ProductPrelude } from './journey/ProductPrelude';
import { ProductShowcase } from './product/ProductShowcase';
import { OrbitFlow } from './flow/OrbitFlow';
import { Outcomes } from './outcomes/Outcomes';
import { Finale } from './finale/Finale';
import { Footer } from './Footer';
import { CosmicBackdrop } from './cosmos/CosmicBackdrop';
import { useSectionTransitions } from './hooks/useSectionTransitions';
import styles from './landing.module.css';

const LANDING_THEME = 'dark' as const;

export function LandingPage() {
  const rootRef = useRef<HTMLElement>(null);
  useSectionTransitions(rootRef);

  return (
    <main
      ref={rootRef}
      className={styles.root}
      data-landing-theme={LANDING_THEME}
    >
      <CosmicBackdrop mode={LANDING_THEME} />
      <div className={styles.foreground}>
        <NavBar />
        <Hero />
        <ProductPrelude />
        <ProductShowcase />
        <OrbitFlow />
        <Outcomes />
        <Finale />
        <Footer />
      </div>
    </main>
  );
}
