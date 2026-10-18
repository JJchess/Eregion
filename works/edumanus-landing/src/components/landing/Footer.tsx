import { assetUrl } from '@/app/assets';
import type { MouseEvent, ReactNode } from 'react';
import Image from '@/app/adapters/image';
import Link from '@/app/adapters/link';
import { ArrowUpRight } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { useDemoAction } from '@/app/demo-context';
import { Mono, Rule } from './primitives';
import { landingTokens } from './tokens';
import shell from './landing.module.css';

const COAI_URL = 'https://coai.cs.tsinghua.edu.cn/hw-ai/';
/** The same file the login page reads for its terms sheet (`app/login/page.tsx`). */
const TERMS_URL = '/legal/terms-zh.txt';

type FooterLink = {
  label: string;
  href: string;
  /** Anchors and same-tab routes differ: only true external targets get the ↗ glyph. */
  external?: boolean;
  gated?: boolean;
};

type LinkGroup = { heading: string; links: FooterLink[] };

/**
 * Quiet close: four equal link columns across the full content width, then the brand
 * and copyright as one bottom band.
 *
 * The previous version put the brand block in cols 1–5 and both link columns in 6–9,
 * which left the right third of the page empty and floated five links in the middle of
 * nowhere. Columns now span the whole rail, and a column may stack more than one group
 * so no column ends up conspicuously shorter than its neighbours. Headings stay in the
 * faint mono eyebrow voice while the links carry full ink — the hierarchy the old
 * version had backwards.
 */
export function Footer() {
  const handleRegisterClick = useDemoAction();
  const t = useTranslations('Landing.footer');

  const columns: LinkGroup[][] = [
    [
      {
        heading: t('productHeading'),
        links: [
          { label: t('linkVideo'), href: '#world-video' },
          { label: t('linkNotes'), href: '#world-notes' },
          { label: t('linkLab'), href: '#world-lab' },
          { label: t('linkInteractiveLab'), href: '#world-interactive-lab' },
          { label: t('linkClassroom'), href: '#world-classroom' },
        ],
      },
    ],
    [
      {
        heading: t('platformHeading'),
        links: [
          { label: t('linkJourney'), href: '#journey' },
          { label: t('linkFlow'), href: '#orbit' },
          { label: t('linkOutcomes'), href: '#outcomes' },
        ],
      },
    ],
    [
      {
        heading: t('startHeading'),
        links: [
          { label: t('linkLogin'), href: '/login' },
          { label: t('linkRegister'), href: '/register', gated: true },
        ],
      },
      {
        heading: t('resourcesHeading'),
        links: [{ label: t('linkManual'), href: '/manual' }],
      },
    ],
    [
      {
        heading: t('aboutHeading'),
        links: [
          { label: t('linkAbout'), href: '#finale' },
          { label: t('linkCoai'), href: COAI_URL, external: true },
          { label: t('linkTerms'), href: TERMS_URL },
        ],
      },
    ],
  ];

  return (
    <footer className={`${shell.footer} pb-6 pt-20`}>
      <div className={`${shell.shell} ${shell.footerShell}`}>
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 lg:grid-cols-4">
          {columns.map((groups, col) => (
            <div key={col} className="space-y-10">
              {groups.map((group) => (
                <div key={group.heading}>
                  <Mono>{group.heading}</Mono>
                  <ul className="mt-5 space-y-3.5">
                    {group.links.map((link) => (
                      <li key={link.href}>
                        <FooterAnchor link={link} onGatedClick={handleRegisterClick}>
                          {link.label}
                          {link.external && (
                            <ArrowUpRight size={11} strokeWidth={2} aria-hidden />
                          )}
                        </FooterAnchor>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>

        <Rule style={{ marginTop: 48 }} />

        <div className="pt-6">
          <div>
            <div className="flex items-center gap-2.5">
              <Image
                src={assetUrl('/brand/logo-static.svg')}
                alt=""
                width={24}
                height={24}
                className="shrink-0"
                aria-hidden
              />
              <span
                className="font-display-en text-[16px] font-semibold tracking-[0.06em]"
                style={{ color: landingTokens.ink }}
              >
                AI Cosmos
              </span>
            </div>
            <p className={`mt-3 ${shell.meta}`} style={{ color: landingTokens.haze }}>
              {t('tagline')}
            </p>
            <p className={`mt-2 ${shell.meta}`} style={{ color: landingTokens.faint }}>
              {t('rights')}
              <span className="mx-2" aria-hidden>
                ·
              </span>
              {t.rich('attribution', {
                link: (chunks) => (
                  <a
                    href={COAI_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline decoration-current/40 underline-offset-4 transition-opacity hover:opacity-75"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterAnchor({
  link,
  onGatedClick,
  children,
}: {
  link: FooterLink;
  onGatedClick: (event: MouseEvent<HTMLElement>) => void;
  children: ReactNode;
}) {
  const className = `${shell.meta} inline-flex items-center gap-1.5 transition-opacity hover:opacity-70`;
  const style = { color: landingTokens.ink };

  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        style={style}
      >
        {children}
      </a>
    );
  }

  // In-page anchors must stay plain <a>: next/link would treat them as a route change.
  if (link.href.startsWith('#')) {
    return (
      <a href={link.href} className={className} style={style}>
        {children}
      </a>
    );
  }

  return (
    <Link
      href={link.href}
      onClick={link.gated ? onGatedClick : undefined}
      className={className}
      style={style}
    >
      {children}
    </Link>
  );
}
