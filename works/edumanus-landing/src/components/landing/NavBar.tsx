import { assetUrl } from '@/app/assets';
import { LanguageSwitch } from '@/app/demo-context';
import Image from '@/app/adapters/image';
import Link from '@/app/adapters/link';
import { useTranslations } from 'use-intl';
import { useDemoAction } from '@/app/demo-context';
import { useVisible } from './hooks/useVisible';
import { landingTokens } from './tokens';
import shell from './landing.module.css';

/**
 * Compact transparent nav. Unlike legacy landing's floating pill, the design wants this to read as
 * part of the sky — no border until you scroll, then the whole bar (background, blur and
 * hairline together) materialises.
 */
export function NavBar() {
  const handleRegisterClick = useDemoAction();
  const t = useTranslations('Landing.nav');
  const tc = useTranslations('Common');

  /**
   * Scroll state comes from a sentinel, NOT a scroll listener.
   *
   * This app never scrolls the window: `app/providers.tsx` locks the shell to 100vh and
   * scrolls an inner `overflow: auto` Box instead, so `window.scrollY` is permanently 0
   * and a `window` scroll listener never fires. That is what left the bar's background,
   * blur and hairline switched off forever while the fixed text kept floating over the
   * content. An IntersectionObserver resolves against the viewport regardless of which
   * element actually scrolls, so it is immune to the shell's layout.
   *
   * The sentinel is 12px tall, which reproduces the previous `scrollY > 12` threshold:
   * it stops intersecting after 12px of travel.
   */
  const [sentinelRef, atTop] = useVisible<HTMLSpanElement>({ threshold: 0, initial: true });
  const scrolled = !atTop;

  const links = [
    { label: t('product'), href: '#world-video' },
    { label: t('scenes'), href: '#journey' },
    { label: t('teams'), href: '#outcomes' },
    { label: t('about'), href: '#finale' },
  ];

  return (
    <>
      {/* Lives outside the <header> on purpose: a child of a `fixed` box doesn't move
          when the page scrolls, so it could never leave the viewport. Absolute against
          `.root` (which is `position: relative`) anchors it to the top of the scrolled
          content and keeps it out of flow, so it adds no height. */}
      <span ref={sentinelRef} className={shell.navSentinel} aria-hidden />

      <header
        className="fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300"
        style={{
          height: 'var(--landing-nav-height)',
          borderBottom: `1px solid ${scrolled ? landingTokens.border : 'transparent'}`,
          background: scrolled ? 'var(--landing-veil-mid)' : 'transparent',
          backdropFilter: scrolled ? 'blur(18px) saturate(160%)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(18px) saturate(160%)' : 'none',
        }}
      >
        <div className={`${shell.shell} flex h-full items-center justify-between`}>
          <Link href="/" className="flex items-center gap-2.5" aria-label={t('homeAria')}>
            <Image
              src={assetUrl('/brand/logo-static.svg')}
              alt=""
              width={26}
              height={26}
              className="shrink-0"
              aria-hidden
            />
            <span
              className="font-display-en text-[17px] font-semibold tracking-[0.06em]"
              style={{ color: landingTokens.ink }}
            >
              AI Cosmos
            </span>
          </Link>

          <nav className="hidden items-center gap-9 lg:flex">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium transition-opacity hover:opacity-70"
                style={{ color: landingTokens.haze }}
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <LanguageSwitch />
            <Link
              href="/login"
              className="hidden rounded-full px-4 py-2 text-sm font-medium transition-colors sm:inline-flex"
              style={{ color: landingTokens.haze }}
            >
              {tc('logIn')}
            </Link>
            {/* The design labels the nav CTA 开始探索 rather than the generic sign-up
                string, so it reads as an invitation into the cosmos, not a form. */}
            <Link
              href="/register"
              onClick={handleRegisterClick}
              className={shell.navCta}
            >
              {t('cta')}
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
