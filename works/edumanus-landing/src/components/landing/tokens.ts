/**
 * Landing token indirection keeps components coupled to semantic roles rather than
 * concrete color values.
 *
 * Every value resolves to a CSS variable declared on `.root` in `landing.module.css`
 * (light) and overridden under `:global([data-theme='dark']) .root` (dark). That is what
 * lets the whole page adapt to the theme toggle without a second implementation:
 * components never name a colour, only a role.
 */
export const landingTokens = {
  bg: 'var(--landing-bg)',
  surface: 'var(--landing-surface)',
  surfaceRaised: 'var(--landing-surface-raised)',
  ink: 'var(--landing-text)',
  haze: 'var(--landing-text-muted)',
  faint: 'var(--landing-text-faint)',
  border: 'var(--landing-border)',
  borderStrong: 'var(--landing-border-strong)',
  ctaBg: 'var(--landing-cta-bg)',
  ctaFg: 'var(--landing-cta-fg)',
  ctaShadow: 'var(--landing-cta-shadow)',
  brand: 'var(--landing-brand)',
  brandSoft: 'var(--landing-brand-soft)',
  violet: 'var(--landing-violet)',
  lilac: 'var(--landing-lilac)',
  cyan: 'var(--landing-cyan)',
  green: 'var(--landing-green)',
  pink: 'var(--landing-pink)',
  mono: 'var(--landing-font-mono)',
  displayZh: 'var(--font-display-zh)',
} as const;

/** The four product worlds, in the order the design orbits them. */
export const WORLD_IDS = ['video', 'notes', 'lab', 'citation'] as const;
export type WorldId = (typeof WORLD_IDS)[number];

/** Identity accent per world — cyan video, violet notes, green lab, pink citation. */
export const WORLD_ACCENT: Record<WorldId, string> = {
  video: landingTokens.cyan,
  notes: landingTokens.violet,
  lab: landingTokens.green,
  citation: landingTokens.pink,
};

/**
 * Where each world sits in the cosmos SVG's 1200×1200 coordinate space, mirroring the
 * `<g id="world-*">` transforms in `public/landing/cosmos-core.svg`. The DOM label layer
 * positions itself off these so labels stay glued to their body at any stage size.
 *
 * `depth` records whether the body paints in front of or behind the core; the SVG already
 * encodes this through paint order, and the label layer reuses it to dim the far ones.
 */
export const WORLD_GEOMETRY: Record<
  WorldId,
  { x: number; y: number; r: number; depth: 'front' | 'back'; labelSide: 'left' | 'right' }
> = {
  video: { x: 220, y: 432, r: 48, depth: 'back', labelSide: 'left' },
  notes: { x: 490, y: 151, r: 42, depth: 'back', labelSide: 'right' },
  lab: { x: 1034, y: 489, r: 45, depth: 'front', labelSide: 'left' },
  citation: { x: 926, y: 1006, r: 49, depth: 'front', labelSide: 'left' },
};

/** The cosmos SVG's own viewBox and core circle, so overlays can share one coordinate system. */
export const COSMOS_VIEWBOX = 1200;
export const COSMOS_CORE = { x: 664, y: 654, r: 322 } as const;
