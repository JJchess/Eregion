import type { CSSProperties, ReactNode } from 'react';
import Link from '@/app/adapters/link';
import { ArrowRight, Check, Play } from 'lucide-react';
import { useDemoAction } from '@/app/demo-context';
import { landingTokens } from './tokens';
import styles from './landing.module.css';

/**
 * Shared landing primitives. Deliberately small and unabstracted — the page has ten
 * bespoke sections, so anything more clever than this gets in the way.
 */

/**
 * Mono coordinate/status label. The design's connective tissue.
 *
 * `size="micro"` is the 10px step used inside tight chrome — evidence-panel meta rows,
 * frame pills, card footers. It exists because nine call sites were reaching for
 * `style={{ fontSize: 9 }}` instead, and an inline style beats every class, so `.mono`'s
 * size was silently discarded at each of them and the page ended up rendering 9px and
 * 9.5px text that no CSS review would ever surface.
 */
export function Mono({
  children,
  color,
  size,
  plain,
  className,
  style,
}: {
  children: ReactNode;
  color?: string;
  size?: 'micro';
  /** Prose rather than a status code — skips the uppercase and the wide tracking. */
  plain?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  // Uppercase is a no-op on Chinese and 0.18em pulls it into gaps, so CJK labels get
  // the same treatment. Children is an array wherever a label is composed from parts.
  const cjk = /[\u3400-\u9fff]/.test(
    (Array.isArray(children) ? children : [children]).filter((c) => typeof c === 'string').join(''),
  );

  return (
    <span
      className={`${styles.mono} ${plain || cjk ? styles.plain : ''} ${size === 'micro' ? styles.microMono : ''} ${className ?? ''}`}
      style={{ color: color ?? landingTokens.faint, ...style }}
    >
      {children}
    </span>
  );
}

/**
 * The page's six heading roles, mapped to the type scale in landing.module.css.
 *
 * Naming them by role rather than by size is the point: `size="section"` is a decision
 * that survives a redesign, whereas the `text-[42px]` it replaces had to be re-typed in
 * every section and drifted to 40/42/44 the moment someone guessed.
 */
const DISPLAY_SIZE = {
  hero: styles.h1,
  finale: styles.h2Finale,
  section: styles.h2,
  product: styles.h3Product,
  step: styles.h3Step,
  card: styles.h3Card,
  node: styles.h3Node,
} as const;

export type DisplaySize = keyof typeof DISPLAY_SIZE;

/**
 * Noto Serif SC display heading. `as` picks the tag, `size` picks the scale step —
 * they're independent because heading level is a document-structure decision and size is
 * a visual one (the outcomes cards are `h3` at card scale, the product asides `h3` at
 * product scale).
 *
 * `size` is optional only so a genuine one-off can still pass its own `className`. Prefer
 * a role: anything that needs a new size probably needs a new entry in the scale.
 */
export function Display({
  as: Tag = 'h2',
  size,
  children,
  className,
  style,
}: {
  as?: 'h1' | 'h2' | 'h3';
  size?: DisplaySize;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Tag
      className={`${styles.display} ${size ? DISPLAY_SIZE[size] : ''} ${className ?? ''}`}
      style={{ color: landingTokens.ink, ...style }}
    >
      {children}
    </Tag>
  );
}

/**
 * Renders copy that carries the design's `<br></br>` line breaks when it came out of
 * `t.raw(...)` rather than `t.rich(...)`.
 *
 * Array items (journey steps, outcome cards) are read with `t.raw` so the whole object
 * arrives at once, which means their strings still contain the literal tag. Splitting
 * here avoids reaching back into the catalog with an index path like
 * `t.rich('cards.0.body')`, and keeps the break responsive.
 */
export function MultiLine({
  text,
  desktopOnly = true,
}: {
  text: string;
  desktopOnly?: boolean;
}) {
  const lines = text.split('<br></br>');
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br className={desktopOnly ? 'hidden md:block' : undefined} />}
          {line}
        </span>
      ))}
    </>
  );
}

/** Hairline rule used to divide card interiors and close sections. */
export function Rule({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      className={className}
      style={{ height: 1, background: landingTokens.border, ...style }}
    />
  );
}

/**
 * `<accent>` / `<br>` handlers for `t.rich`, matching legacy landing's convention
 * Both locales must carry the same tag set or
 * next-intl throws at render, so these two are the only tags landing uses.
 */
export const richTags = {
  accent: (chunks: ReactNode) => <span style={{ color: landingTokens.violet }}>{chunks}</span>,
  br: () => <br />,
};

/** Same, but the break only applies at `md` and up — for lines that should wrap freely on phones. */
export const richTagsDesktopBreak = {
  accent: (chunks: ReactNode) => <span style={{ color: landingTokens.violet }}>{chunks}</span>,
  br: () => <br className="hidden md:block" />,
};

/**
 * The primary CTA. Always routes to /register through the shared register guard, which
 * gates the `ai-cosmos.ai` host — every register CTA on the page must use this or
 * that redirect silently breaks on one button.
 */
export function CtaPrimary({ children, className }: { children: ReactNode; className?: string }) {
  const handleRegisterClick = useDemoAction();
  return (
    <Link
      href="/register"
      onClick={handleRegisterClick}
      className={`group inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-semibold transition-[transform,box-shadow] duration-200 hover:-translate-y-px ${className ?? ''}`}
      style={{
        color: landingTokens.ctaFg,
        background: landingTokens.ctaBg,
        boxShadow: landingTokens.ctaShadow,
      }}
    >
      {children}
      <ArrowRight
        size={15}
        strokeWidth={2.4}
        aria-hidden
        className="transition-transform duration-200 group-hover:translate-x-0.5"
      />
    </Link>
  );
}

/** Secondary CTA — the demo. Points at the first product world on the same page. */
export function CtaSecondary({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <a
      href="#world-video"
      className={`inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] font-medium transition-colors duration-200 ${className ?? ''}`}
      style={{
        color: landingTokens.ink,
        border: `1px solid ${landingTokens.borderStrong}`,
        background: landingTokens.surface,
      }}
    >
      <Play size={13} fill="currentColor" strokeWidth={0} aria-hidden />
      {children}
    </a>
  );
}

/** The two hero/finale CTAs together, so both sections stay in sync. */
export function CtaPair({
  primary,
  secondary,
  className,
}: {
  primary: string;
  secondary: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className ?? ''}`}>
      <CtaPrimary>{primary}</CtaPrimary>
      <CtaSecondary>{secondary}</CtaSecondary>
    </div>
  );
}

/** Small pill used for feature checks and status chips. */
export function Chip({
  children,
  accent,
  check = false,
}: {
  children: ReactNode;
  accent?: string;
  check?: boolean;
}) {
  const tone = accent ?? landingTokens.violet;
  return (
    <span
      className={`inline-flex items-center gap-2 ${styles.meta} font-medium ${
        // The design draws checks as bare tick+label and only the dot chips as pills.
        check ? 'pr-1' : 'rounded-full px-3.5 py-1.5'
      }`}
      style={
        check
          ? { color: landingTokens.haze }
          : { color: landingTokens.haze, border: `1px solid ${landingTokens.border}`, background: landingTokens.surface }
      }
    >
      {check ? (
        <Check size={12} strokeWidth={3} color={tone} aria-hidden />
      ) : (
        <span
          aria-hidden
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: tone }}
        />
      )}
      {children}
    </span>
  );
}
