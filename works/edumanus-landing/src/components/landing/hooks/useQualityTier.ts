import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Cosmos rendering budget.
 *
 *   static — no looping animation at all. Reduced motion, small screens, or a
 *            device that has proven it can't keep up. Full composition is preserved;
 *            the frozen frame IS the design frame.
 *   low    — animation on, decorative particle count reduced, no WebGL tier.
 *   high   — everything.
 *
 * Downgrades are one-way. Upgrading after a recovery would oscillate between tiers
 * on a page whose frame cost changes as you scroll, which reads worse than staying low.
 */
export type QualityTier = 'static' | 'low' | 'high';

/** Sustained frames under this FPS trip a downgrade. */
const FPS_FLOOR = 50;
const FPS_SAMPLE_FRAMES = 50;

/**
 * Can this browser actually give us a WebGL context?
 *
 * Width and memory heuristics say nothing about this — a 1440px desktop with WebGL
 * disabled by policy, a driver blocklist, or an extension passes every other check and
 * then hard-fails the moment a shader mounts. Paper Shaders throws from render when the
 * context is refused, which takes the whole hero subtree with it, so this has to be
 * answered before `useShader` is allowed to be true.
 *
 * The probe context is released immediately via WEBGL_lose_context: browsers cap live
 * contexts at ~16 and this page legitimately wants two of them.
 */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ??
      canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function initialTier(): QualityTier {
  if (typeof window === 'undefined') return 'high';

  const narrow = window.matchMedia('(max-width: 767px)').matches;
  if (narrow) return 'static';

  if (!hasWebGL()) return 'static';

  // `deviceMemory` is Chromium-only and coarse (0.25–8, capped). Absent elsewhere,
  // which is fine — absence just means "no evidence of a weak device".
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memory === 'number' && memory <= 4) return 'low';

  if (window.matchMedia('(max-width: 1279px)').matches) return 'low';
  return 'high';
}

export function useQualityTier(): {
  tier: QualityTier;
  reducedMotion: boolean;
  resolved: boolean;
} {
  // framer-motion already ships this hook and tracks changes to the media query,
  // so landing doesn't add its own. Returns null until mounted.
  const prefersReduced = useReducedMotion();
  const reducedMotion = prefersReduced === true;

  const [tier, setTier] = useState<QualityTier>('static');
  const [resolved, setResolved] = useState(false);

  // Resolve the real tier after mount so SSR always emits the cheap, safe branch.
  useEffect(() => {
    setTier(initialTier());
    setResolved(true);

    const narrow = window.matchMedia('(max-width: 767px)');
    const onChange = () => setTier(initialTier());
    narrow.addEventListener('change', onChange);
    return () => narrow.removeEventListener('change', onChange);
  }, []);

  // FPS watchdog: sample only while animating, and only ever step down.
  useEffect(() => {
    if (reducedMotion || tier === 'static') return;

    let frame = 0;
    let samples = 0;
    let slow = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const delta = now - last;
      last = now;
      // Ignore the first frame and any frame after a tab switch / long task.
      if (delta > 0 && delta < 500) {
        samples += 1;
        if (1000 / delta < FPS_FLOOR) slow += 1;
      }
      if (samples >= FPS_SAMPLE_FRAMES) {
        // Downgrade only if most of the window was slow, not a single hiccup.
        if (slow > FPS_SAMPLE_FRAMES * 0.6) {
          setTier((current) => (current === 'high' ? 'low' : 'static'));
        }
        samples = 0;
        slow = 0;
        return; // stop sampling; one verdict per tier is enough
      }
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [tier, reducedMotion]);

  return { tier: reducedMotion ? 'static' : tier, reducedMotion, resolved };
}
