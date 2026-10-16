import { Color } from 'three';
import type { Orb } from './model';

export type InstallationState = 'installed' | 'available' | 'loading' | 'unknown';
export type PearlTones = { light: Color; deep: Color; warm: Color; rim: Color };
export type PearlTheme = 'light' | 'dark';

/** Installation changes the material only; geometry and category identity stay stable. */
export function pearlAppearance(orb: Pick<Orb, 'kind' | 'role' | 'color'>, state: InstallationState, theme: PearlTheme) {
  const neutral = orb.kind === 'skill' && state !== 'installed';
  const base = new Color(neutral ? theme === 'dark' ? '#555c76' : '#c6ccda' : orb.color);
  const white = new Color('#ffffff');
  const tones: PearlTones = neutral
    ? theme === 'dark'
      ? { light: new Color('#6b7390'), deep: new Color('#363b55'), warm: base.clone(), rim: new Color('#949cb8') }
      : { light: new Color('#e4e8f1'), deep: new Color('#929ab1'), warm: base.clone(), rim: new Color('#f5f7fc') }
    : {
        light: base.clone().lerp(white, 0.12),
        deep: base.clone().multiplyScalar(orb.role === 'center' ? 0.55 : 0.72),
        warm: base.clone().lerp(new Color('#efd4e6'), 0.06),
        rim: base.clone().lerp(white, 0.48),
      };
  // Keep violet families deep enough for pearl-white lettering. Mid-luminance
  // purples otherwise need pure black text, which also loses contrast toward the shadow.
  if (!neutral) {
    const surface = centralSurface(tones);
    const luminance = surface.r * 0.2126 + surface.g * 0.7152 + surface.b * 0.0722;
    if (luminance < 0.26) {
      const scale = Math.min(1, 0.14 / Math.max(0.001, luminance));
      for (const tone of Object.values(tones)) tone.multiplyScalar(scale);
    }
  }
  return { tones, tint: base, glow: neutral ? 0.12 : orb.kind === 'skill' ? 0.2 : 0.25 };
}

/** Matches the shader's central surface, in linear RGB, for legible overlaid text. */
export function centralSurface(tones: PearlTones): Color {
  const t = (0.15 + 1.05) / 2.05;
  const color = tones.deep.clone().lerp(tones.light, t * t * (3 - 2 * t));
  color.lerp(tones.warm, Math.exp(-(0.55 ** 2 * 2) * 2.2) * 0.45);
  color.lerp(tones.light.clone().multiplyScalar(1.05), Math.exp(-(0.25 ** 2 + 0.3 ** 2) * 2) * 0.3);
  return color;
}

export function pearlInk(surface: Color): '#252341' | '#ffffff' | '#000000' {
  const luminance = (color: Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  const background = luminance(surface);
  const dark = luminance(new Color('#252341'));
  if ((background + 0.05) / (dark + 0.05) >= 4.5) return '#252341';
  if (1.05 / (background + 0.05) >= 4.5) return '#ffffff';
  return '#000000';
}
