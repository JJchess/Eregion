"use client";

/**
 * The voice orb: a grainy liquid sphere whose inside flows with real voice. Adapted from beUI
 * Voice Orb (MIT, Copyright (c) 2026 Saurabh Chauhan — see ./LICENSE); the shell is rewritten for
 * this app. Loudness comes from `level`, read once per frame (no React renders) and smoothed here;
 * a palette change blends over ~400 ms in the same frame loop. The orb never scales with voice and
 * never touches audio: callers own their analysers.
 */
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { createOrbRenderer, type Rgb } from "./renderer";
import styles from "./voice-orb.module.css";

const hex = (value: string): Rgb => {
  const n = Number.parseInt(value.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Base, highlight, shadow for each kind of moment. */
export const ORB_PALETTES = {
  /** Connected and quiet, connecting, ended. */
  silver: [hex("#c9c9d3"), hex("#ffffff"), hex("#8d8d9c")],
  /** You. */
  violet: [hex("#ac95f6"), hex("#ffffff"), hex("#7a5fe6")],
  /** Another person. */
  blue: [hex("#7ea8f8"), hex("#ffffff"), hex("#4c7be8")],
  /** An agent answering. */
  lavender: [hex("#bbb2f7"), hex("#ffffff"), hex("#8b83ea")],
} as const satisfies Record<string, readonly [Rgb, Rgb, Rgb]>;
export type OrbPalette = keyof typeof ORB_PALETTES;

export interface VoiceOrbProps {
  /** Current loudness 0..1 of a real source. Omitted, or below 0: there is no source, the orb idles. */
  level?: () => number;
  /** How fast the inside drifts. */
  speed?: number;
  palette?: OrbPalette;
  /** Colours to start from, blending into `palette` (e.g. the button the orb grows out of). */
  from?: OrbPalette;
  className?: string;
}

/**
 * The live (WebGL) orb starts once its entrance is over: compiling shaders blocks the main thread,
 * and doing it mid-transition drops every frame of it. Until then a still sphere stands in.
 */
const LIVE_AFTER_MS = 420;

export function VoiceOrb({
  level,
  speed = 1,
  palette = "silver",
  from,
  className,
}: VoiceOrbProps) {
  const reducedMotion = useReducedMotion() ?? false;
  const [live, setLive] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLive(true), LIVE_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<ReturnType<typeof createOrbRenderer> | null>(null);
  const [failed, setFailed] = useState(false);
  const latest = useRef({ level, speed, palette, reducedMotion });
  const start = useRef(from ?? palette);
  latest.current = { level, speed, palette, reducedMotion };

  // A paused orb (reduced motion) still repaints once when what it shows changes.
  useEffect(() => {
    renderer.current?.requestDraw();
  }, [level, speed, palette, reducedMotion]);

  useEffect(() => {
    const element = canvas.current;
    if (!live || !element) return;
    let smooth = 0;
    let last = 0;
    let shown = "";
    const colors = ORB_PALETTES[
      latest.current.reducedMotion ? latest.current.palette : start.current
    ].map((c) => [...c]) as [number, number, number][];
    const fail = (error?: unknown) => {
      console.warn(
        "[voice-orb] WebGL unavailable, showing a still orb:",
        error,
      );
      setFailed(true);
    };
    try {
      renderer.current = createOrbRenderer(
        element,
        () => {
          const {
            level: read,
            speed: pace,
            palette: name,
            reducedMotion: still,
          } = latest.current;
          const now = performance.now();
          const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
          last = now;
          const raw = read && !still ? read() : 0;
          const target = Number.isFinite(raw) && raw > 0 ? Math.min(1, raw) : 0;
          // Quick to rise, slower to settle; the same at any frame rate.
          smooth +=
            (target - smooth) *
            (1 - Math.exp(-(target > smooth ? 18 : 5) * dt));
          const text = smooth.toFixed(1);
          if (text !== shown && box.current) {
            shown = text;
            box.current.dataset.activity = text;
          }
          // A new speaker's colours blend in (~400 ms); reduced motion switches at once.
          const blend = still ? 1 : 1 - Math.exp(-8 * dt);
          const goal = ORB_PALETTES[name];
          for (let i = 0; i < 3; i++)
            for (let k = 0; k < 3; k++)
              colors[i][k] += (goal[i][k] - colors[i][k]) * blend;
          const settling = colors.some((c, i) =>
            c.some((v, k) => Math.abs(v - goal[i][k]) > 0.002),
          );
          return {
            activity: smooth,
            colors: colors as unknown as readonly [Rgb, Rgb, Rgb],
            speed: pace,
            animated: !still || settling,
          };
        },
        fail,
      );
    } catch (error) {
      fail(error);
    }
    return () => {
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [live]);

  return (
    <div
      ref={box}
      className={`${styles.orb} ${className ?? ""}`}
      aria-hidden="true"
      data-render-state={failed ? "fallback" : live ? "ready" : "pending"}
      data-orb-palette={palette}
      data-activity="0.0"
    >
      {/* Stand-in before the live orb (in the colours it starts from), and the fallback without WebGL. */}
      <div
        className={styles.still}
        data-orb-palette={failed ? palette : (from ?? palette)}
      />
      {live && !failed && <canvas ref={canvas} className={styles.canvas} />}
    </div>
  );
}
