"use client";

import { Canvas, events as pointerEvents, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { useReducedMotion } from "motion/react";
import {
  Component,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { ArrowLeft, Crosshair } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";
import { useNightMode } from "./theme";
import { centralSurface, pearlAppearance, pearlInk, type InstallationState, type PearlTheme, type PearlTones } from "./appearance";
import type { Locale } from "./contract";
import * as THREE from "three";
import { avatarAccent, palettes, type AgentAvatar, type AgentProfile } from "./agent";
import { displayName } from "./contract";
import { LABEL_GAP, layoutLabeledLevel, motionValue, stepMotion, reconcileOrbs, shortNumber, type LabelSize, type Level, type Orb, type View, type MotionValue } from "./model";
import { AvatarThumb } from "./views";

export type GalaxyProps = {
  level: Level;
  selected: string | null;
  installed: ReadonlySet<string>;
  installationStatus: "ready" | "loading" | "unknown";
  agent: AgentProfile;
  agentEditing: boolean;
  /** A click on empty space (not a drag) closes the open skill detail. */
  onBackdrop: () => void;
  /** Bumped to fly back to the framed level after free exploration. */
  recenter: number;
  onRecenter: () => void;
  onAgent: (source: HTMLElement | null) => void;
  onCategory: (id: string) => void;
  /** The current category center returns to the overview. */
  onBack: () => void;
  /** `category` is where the skill lives, so the level can follow it there. */
  onSkill: (id: string, source: HTMLElement | null, category: string | null) => void;
};
type SceneProps = GalaxyProps & { theme: PearlTheme; reduced: boolean; container: RefObject<HTMLDivElement | null>; dragged: RefObject<boolean>; onUnavailable: () => void };
/** Keys of pearls still springing toward their slots; empty once a level has settled. */
type Motion = RefObject<Set<string>>;
type FrameClock = RefObject<{ delta: number; active: boolean }>;
type OrbPose = { x: MotionValue; y: MotionValue; z: MotionValue; r: MotionValue; opacity: MotionValue };
type Poses = RefObject<Map<string, OrbPose>>;
type RigProps = SceneProps & { clock: FrameClock; minZoom: number };

const MAX_ZOOM = 400;
/** Leave the single toolbar row and right-hand recenter control clear when framing a level. */
const INSET = { top: 64, bottom: 24, side: 72 };
const Z = { center: 0.7, ring: 0.5 };

const vertex = /* glsl */ `
varying vec3 vNormal; varying vec3 vLocal;
void main(){vNormal=normalize(normalMatrix*normal);vLocal=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
/**
 * Soft matte pearl, after the reference: a diagonal from a bright upper-left to a saturated lower-right, a warm
 * glow low on the left, a broad inner core, an edge that brightens (never darkens) and a slightly frosted
 * silhouette. No point highlight. A designed shader, not PBR.
 */
const pearl = /* glsl */ `
varying vec3 vNormal; varying vec3 vLocal;
uniform vec3 light; uniform vec3 deep; uniform vec3 warm; uniform vec3 rim; uniform float lift; uniform float opacity;
float noise(vec2 q){return fract(sin(dot(q,vec2(12.9898,78.233)))*43758.5453);}
void main(){
 vec3 n=normalize(vNormal); vec3 p=normalize(vLocal);
 vec3 c=mix(deep,light,smoothstep(-1.05,1.,(p.y-p.x)*.7+.15));
 vec2 w=p.xy-vec2(-.55,-.55); c=mix(c,warm,exp(-dot(w,w)*2.2)*.45);
 vec2 k=p.xy-vec2(-.25,.3); c=mix(c,light*1.05,exp(-dot(k,k)*2.)*.3);
 c=mix(c,rim,pow(1.-max(n.z,0.),3.)*.55);
 c=c*(1.+lift)+(noise(gl_FragCoord.xy)-.5)/255.;
 gl_FragColor=vec4(c,smoothstep(0.,.2,n.z)*opacity);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;
const penumbra = /* glsl */ `
varying vec3 vLocal; uniform vec3 tint; uniform float strength;
void main(){float d=length(vLocal.xy);float alpha=exp(-d*d*4.2)*smoothstep(1.,.55,d)*strength;gl_FragColor=vec4(tint,alpha);
#include <colorspace_fragment>
}`;

const white = new THREE.Color("#ffffff");
type Tones = PearlTones;
/** One look per avatar kind; every kind fills the unit circle. A pearl avatar uses its palette's deep ramp. */
function avatarTones(avatar: AgentAvatar): Tones {
  switch (avatar.kind) {
    case "pearl": {
      const ramp = palettes[avatar.palette].deep;
      return {
        light: new THREE.Color(ramp.pearl),
        deep: new THREE.Color(ramp.shadow),
        warm: new THREE.Color(ramp.body).offsetHSL(0.06, 0, 0.1),
        rim: new THREE.Color(ramp.pearl).lerp(white, 0.4),
      };
    }
  }
}

type GlowUniforms = { tint: { value: THREE.Color }; strength: { value: number } };
/** Glows use the same motion and presence as the pearl; no independent entrance or exit clock. */
function Penumbra({ uniforms, shader }: { uniforms: GlowUniforms; shader: RefObject<THREE.ShaderMaterial | null> }) {
  const mesh = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (mesh.current && shader.current) mesh.current.visible = shader.current.uniforms.strength.value > 0.0001;
  }, -0.5);
  return (
    <mesh ref={mesh} position={[0.24, -0.34, -1.05]} scale={[3.2, 3, 1]}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial ref={shader} vertexShader={vertex} fragmentShader={penumbra} uniforms={uniforms} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

const toneKeys = ["light", "deep", "warm", "rim"] as const;
const channels = ["r", "g", "b"] as const;
function colorMotion(color: THREE.Color) {
  return { r: motionValue(color.r), g: motionValue(color.g), b: motionValue(color.b) };
}
function moveColor(value: THREE.Color, state: ReturnType<typeof colorMotion>, target: THREE.Color, dt: number, reduced: boolean) {
  let moving = false;
  for (const channel of channels) {
    moving = stepMotion(state[channel], target[channel], dt, reduced, 0.001) || moving;
    value[channel] = state[channel].value;
  }
  return moving;
}
/** Only write changed DOM values; the motion loop never drives React renders. */
function cssValue(el: HTMLElement, key: string, value: string) {
  if (el.style.getPropertyValue(key) !== value) el.style.setProperty(key, value);
}
function bounded(state: MotionValue, min: number, max = Infinity) {
  if (state.value < min) { state.value = min; state.velocity = Math.max(0, state.velocity); }
  if (state.value > max) { state.value = max; state.velocity = Math.min(0, state.velocity); }
}

type PearlProps = {
  orb: Orb;
  leaving: boolean;
  installation: InstallationState;
  theme: PearlTheme;
  selected: boolean;
  agent: AgentProfile;
  agentAction: 'editAgent' | 'closeAgent';
  reduced: boolean;
  motion: Motion;
  clock: FrameClock;
  poses: Poses;
  finished: RefObject<Set<string>>;
  geometry: THREE.SphereGeometry;
  onLabelSize: (key: string, size: LabelSize) => void;
  onPick: (orb: Orb, source: HTMLElement | null) => void;
};

const Pearl = memo(function Pearl({ orb, leaving, installation, theme, selected, agent, agentAction, reduced, motion, clock, poses, finished, geometry, onLabelSize, onPick }: PearlProps) {
  const [hover, setHover] = useState(false);
  const label = useRef<HTMLDivElement>(null);
  const group = useRef<THREE.Group>(null), body = useRef<THREE.Group>(null);
  const shader = useRef<THREE.ShaderMaterial>(null), glowShader = useRef<THREE.ShaderMaterial>(null);
  const { camera, gl, invalidate } = useThree();
  const labelPortal = useMemo(() => ({ current: gl.domElement.parentElement! }), [gl]);
  const isAgent = orb.kind === "agent";
  const isBack = orb.kind === "category" && orb.role === "center";
  const installed = orb.kind === "skill" && installation === "installed";
  const interactive = !leaving;
  const appearance = useMemo(() => pearlAppearance(orb, installation, theme), [orb, installation, theme]);
  const caption = isAgent ? agent.nickname : orb.label;
  const measureCaption = useCallback((element: HTMLSpanElement | null) => {
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      // Round outwards; Html only translates these nodes, never scales the fixed-size caption.
      onLabelSize(orb.key, { width: Math.ceil(rect.width), height: Math.ceil(rect.height) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
    // Re-measure when text changes even if its clipped width remains the same.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLabelSize, orb.key, caption]);
  const pose = useRef<OrbPose | null>(null);
  if (!pose.current) {
    const origin = poses.current.get(`category:${orb.category}`) ?? poses.current.get("agent:agent");
    pose.current = {
      x: motionValue(reduced ? orb.x : origin?.x.value ?? 0),
      y: motionValue(reduced ? orb.y : origin?.y.value ?? 0),
      z: motionValue(reduced ? Z[orb.role] : origin?.z.value ?? Z[orb.role]),
      r: motionValue(reduced ? orb.r : 0),
      opacity: motionValue(reduced ? 1 : 0),
    };
  }
  const exit = useRef({ x: orb.x, y: orb.y, z: Z[orb.role] });
  useLayoutEffect(() => {
    if (leaving) {
      const s = pose.current!;
      exit.current = { x: s.x.value, y: s.y.value, z: s.z.value };
    }
  }, [leaving]);
  useLayoutEffect(() => {
    const currentPoses = poses.current, currentMotion = motion.current, currentFinished = finished.current;
    currentPoses.set(orb.key, pose.current!);
    return () => {
      currentPoses.delete(orb.key);
      currentMotion.delete(orb.key);
      currentFinished.delete(orb.key);
    };
  }, [orb.key, poses, motion, finished]);
  useLayoutEffect(() => { invalidate(); });

  const targetTones = useMemo(() => isAgent ? avatarTones(agent.avatar) : appearance.tones, [isAgent, agent.avatar, appearance]);
  const glowTarget = useMemo(() => isAgent ? new THREE.Color(avatarAccent(agent.avatar)) : appearance.tint, [isAgent, agent.avatar, appearance]);
  const material = useMemo(() => {
    const initial = targetTones;
    return {
      shades: { light: colorMotion(initial.light), deep: colorMotion(initial.deep), warm: colorMotion(initial.warm), rim: colorMotion(initial.rim) },
      uniforms: { light: { value: initial.light }, deep: { value: initial.deep }, warm: { value: initial.warm }, rim: { value: initial.rim }, lift: { value: 0 }, opacity: { value: 0 } },
      tint: colorMotion(glowTarget),
      glow: { tint: { value: glowTarget.clone() }, strength: { value: 0 } },
      strength: motionValue(0), lift: motionValue(0), center: motionValue(orb.role === "center" ? 1 : 0), installed: motionValue(installed ? 1 : 0),
    };
    // This is the initial material state; subsequent targets are interpolated in the frame loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const labelMode = useRef({ outside: false, blend: 0 });

  useFrame(() => {
    if (!group.current || !body.current || !shader.current || !glowShader.current) return;
    const s = pose.current!, dt = clock.current.delta;
    // Mutate the mounted materials: R3F can copy uniform props while reconciling a subtree.
    const uniforms = shader.current.uniforms, glow = glowShader.current.uniforms;
    let moving = false;
    const advance = (value: MotionValue, target: number, epsilon = 0.001) => {
      moving = stepMotion(value, target, dt, reduced, epsilon) || moving;
    };
    advance(s.x, leaving ? exit.current.x : orb.x);
    advance(s.y, leaving ? exit.current.y : orb.y);
    advance(s.z, leaving ? exit.current.z : Z[orb.role]);
    advance(s.r, leaving ? 0 : orb.r * (hover && interactive ? 1.05 : 1), 0.0005);
    advance(s.opacity, leaving ? 0 : 1);
    bounded(s.r, 0);
    bounded(s.opacity, 0, 1);
    group.current.position.set(s.x.value, s.y.value, s.z.value);
    body.current.scale.setScalar(Math.max(0.0001, s.r.value));
    for (const key of toneKeys) moving = moveColor(uniforms[key].value, material.shades[key], targetTones[key], dt, reduced) || moving;
    moving = moveColor(glow.tint.value, material.tint, glowTarget, dt, reduced) || moving;
    advance(material.strength, isAgent ? 0.25 : appearance.glow);
    advance(material.installed, installed ? 1 : 0);
    advance(material.lift, 0);
    advance(material.center, orb.role === "center" ? 1 : 0);
    uniforms.lift.value = material.lift.value;
    uniforms.opacity.value = s.opacity.value;
    glow.strength.value = material.strength.value * s.opacity.value;

    const pixels = s.r.value * 2 * camera.zoom;
    const mode = labelMode.current;
    // Hysteresis avoids toggling labels repeatedly at a size threshold while zooming.
    mode.outside = pixels < (mode.outside ? 60 : 56);
    const desired = mode.outside ? 1 : 0;
    mode.blend = reduced ? desired : THREE.MathUtils.clamp(desired, mode.blend - dt / 0.16, mode.blend + dt / 0.16);
    moving = mode.blend !== desired || moving;
    if (label.current) {
      if (label.current.dataset.orbInstance !== group.current.uuid) label.current.dataset.orbInstance = group.current.uuid;
      cssValue(label.current, "--d", (s.r.value * 2).toFixed(4));
      cssValue(label.current, "--presence", s.opacity.value.toFixed(4));
      cssValue(label.current, "--label-outside", mode.blend.toFixed(4));
      cssValue(label.current, "--label-center", material.center.value.toFixed(4));
      cssValue(label.current, "--installed-presence", material.installed.value.toFixed(4));
      const surface = centralSurface(Object.fromEntries(toneKeys.map(key => [key, uniforms[key].value])) as Tones);
      cssValue(label.current, "--pearl-ink", pearlInk(surface));
    }
    if (leaving && s.r.value === 0 && s.opacity.value === 0) finished.current.add(orb.key);
    if (moving) {
      motion.current.add(orb.key);
      clock.current.active = true;
    } else motion.current.delete(orb.key);
  }, -1);

  const events = {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta > 5 || !interactive) return;
      onPick(orb, label.current);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (!interactive) return;
      setHover(true);
      (e.nativeEvent.target as HTMLElement).style.cursor = "pointer";
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      setHover(false);
      (e.nativeEvent.target as HTMLElement).style.cursor = "";
    },
  };
  const t = useTranslations("Starport.v2");
  const locale = useLocale() as Locale;
  const status = orb.kind === "skill" ? t(installation === "installed" ? "installedBadge" : installation === "available" ? "notInstalled" : installation === "loading" ? "installationLoading" : "installationUnknown") : "";
  const name = isAgent
    ? `${agent.nickname}, ${t(agentAction)}`
    : `${orb.label}, ${orb.kind === "skill" ? t("adoptionCount", { count: shortNumber(orb.count, locale) }) : t("skillCount", { count: orb.count })}${status ? `, ${status}` : ""}${isBack ? `, ${t("returnOverview")}` : ""}`;
  return (
    <group ref={group}>
      <group ref={body}>
        <mesh {...events} geometry={geometry}>
          <shaderMaterial ref={shader} vertexShader={vertex} fragmentShader={pearl} uniforms={material.uniforms} transparent depthWrite={false} toneMapped={false} />
        </mesh>
        <Penumbra uniforms={material.glow} shader={glowShader} />
        <Html portal={labelPortal} center position={[0, 0, 1.05]} zIndexRange={[isAgent ? 6 : 5, 0]} wrapperClass="sk-label-wrap" style={{ pointerEvents: "none" }}>
          <div
            ref={label}
            role={interactive ? "button" : "img"}
            className={`sk-body is-${orb.kind} is-${orb.role}${installed ? " is-installed" : ""}${hover && interactive ? " is-hover" : ""}${selected ? " is-selected" : ""}`}
            style={{ "--d": 0, "--presence": 0, "--label-gap": `${LABEL_GAP}px` } as CSSProperties}
            data-orb-key={orb.key}
            data-leaving={leaving}
            data-installation={orb.kind === "skill" ? installation : undefined}
            aria-label={name}
            aria-expanded={isAgent ? agentAction === 'closeAgent' : undefined}
            aria-controls={isAgent && agentAction === 'closeAgent' ? 'sk-side-panel' : undefined}
            aria-hidden={leaving || undefined}
            tabIndex={interactive ? 0 : -1}
            onKeyDown={(event) => {
              if (interactive && (event.key === "Enter" || event.key === " ")) {
                event.preventDefault();
                event.stopPropagation();
                if (!event.repeat) onPick(orb, event.currentTarget);
              }
            }}
            onClick={(e) => {
              // Keyboard activation must not also reach the canvas's empty-space click handler.
              e.stopPropagation();
              if (interactive) onPick(orb, e.currentTarget);
            }}
          >
            <div className="sk-label-inside" aria-hidden="true">
              <span>{isAgent ? agent.nickname : orb.label}</span>
              {isAgent ? (
                <small>{t(agentAction)}</small>
              ) : (
                <small>{orb.kind === "skill" ? t("adoptionCount", { count: shortNumber(orb.count, locale) }) : t("skillCount", { count: orb.count })}</small>
              )}
            </div>
            <span ref={measureCaption} className="sk-label-outside" aria-hidden="true">{caption}</span>
            {isBack && <span className="sk-orb-tooltip" role="tooltip">{t("returnOverview")}</span>}
            {orb.kind === "skill" && <>
              <i className="sk-installed-rim" aria-hidden="true" />
              <span className="sk-orb-tooltip" role="tooltip">{orb.label}<small>{status}</small></span>
            </>}
          </div>
        </Html>
      </group>
    </group>
  );
});

/** Frames a world box inside the part of the canvas the controls and footer leave free. */
function frame(hx: number, hy: number, size: { width: number; height: number }, minZoom = 0): View {
  const width = Math.max(1, size.width - INSET.side * 2), height = Math.max(1, size.height - INSET.top - INSET.bottom);
  const zoom = Math.max(minZoom, Math.min(MAX_ZOOM, width / (2 * hx), height / (2 * hy)));
  return { x: -(INSET.side + width / 2 - size.width / 2) / zoom, y: (INSET.top + height / 2 - size.height / 2) / zoom, zoom };
}

/** Camera, world-space tray and pearls share a clock and retain velocity when their targets change. */
function CameraRig({ level, minZoom, recenter, reduced, container, clock, dragged, onUnavailable }: RigProps) {
  const { camera, size, gl, invalidate } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    if (!canvas?.isConnected) return;
    canvas.addEventListener('webglcontextlost', onUnavailable);
    return () => canvas.removeEventListener('webglcontextlost', onUnavailable);
  }, [gl, onUnavailable]);
  const view = useRef<View | null>(null);
  const state = useRef<{ x: MotionValue; y: MotionValue; zoom: MotionValue; tray: MotionValue } | null>(null);
  const destination = useRef<View | null>(null);
  const wheel = useRef<{ zoom: number; anchor: { x: number; y: number }; cursor: { x: number; y: number } } | null>(null);
  const target = useMemo(() => frame(level.extent.x, level.extent.y, { width: size.width, height: size.height }, minZoom), [level.extent.x, level.extent.y, size.width, size.height, minZoom]);
  const limits = useRef({ min: minZoom, x: level.extent.x, y: level.extent.y });
  limits.current = { min: minZoom, x: level.extent.x, y: level.extent.y };

  useLayoutEffect(() => {
    if (size.width < 80 || size.height < 80) return;
    if (!state.current) {
      state.current = { x: motionValue(target.x), y: motionValue(target.y), zoom: motionValue(Math.log(target.zoom)), tray: motionValue(level.tray) };
      view.current = target;
    }
    wheel.current = null;
    // Resize notifications update the destination without restarting or resetting motion.
    destination.current = target;
    invalidate();
  }, [target, recenter, level.focus, level.tray, reduced, size.width, size.height, invalidate]);

  useEffect(() => {
    const el = gl.domElement;
    if (!el?.isConnected) return;
    let drag: { x: number; y: number; moved: boolean; id: number } | null = null;
    const clamp = (v: View): View => ({
      zoom: v.zoom,
      x: THREE.MathUtils.clamp(v.x, -limits.current.x, limits.current.x),
      y: THREE.MathUtils.clamp(v.y, -limits.current.y, limits.current.y),
    });
    const down = (e: PointerEvent) => {
      if (e.button === 0) {
        drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
        dragged.current = false;
      }
    };
    const move = (e: PointerEvent) => {
      if (!drag || !view.current || !state.current) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      if (!drag.moved) {
        drag.moved = true;
        el.setPointerCapture(drag.id);
        el.style.cursor = "grabbing";
      }
      destination.current = null;
      wheel.current = null;
      const v = view.current;
      const next = clamp({ x: v.x - dx / v.zoom, y: v.y + dy / v.zoom, zoom: v.zoom });
      view.current = next;
      Object.assign(state.current.x, motionValue(next.x));
      Object.assign(state.current.y, motionValue(next.y));
      Object.assign(state.current.zoom, motionValue(Math.log(next.zoom)));
      drag.x = e.clientX;
      drag.y = e.clientY;
      invalidate();
    };
    const up = () => {
      dragged.current = Boolean(drag?.moved);
      if (drag?.moved) {
        if (el.hasPointerCapture(drag.id)) el.releasePointerCapture(drag.id);
        el.style.cursor = "";
      }
      drag = null;
    };
    const zoom = (e: WheelEvent) => {
      if (!view.current || !state.current) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect(), v = view.current;
      const cursor = { x: e.clientX - rect.left - rect.width / 2, y: e.clientY - rect.top - rect.height / 2 };
      const goal = (wheel.current?.zoom ?? v.zoom) * Math.exp(-(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * 0.0015);
      destination.current = null;
      wheel.current = {
        zoom: THREE.MathUtils.clamp(goal, limits.current.min, MAX_ZOOM),
        anchor: { x: v.x + cursor.x / v.zoom, y: v.y - cursor.y / v.zoom },
        cursor,
      };
      invalidate();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("wheel", zoom, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("wheel", zoom);
    };
  }, [gl, invalidate, dragged]);

  useFrame(() => {
    const s = state.current;
    if (!s || size.width < 80) return;
    const dt = clock.current.delta;
    let moving = false;
    if (wheel.current) {
      const { zoom, anchor, cursor } = wheel.current;
      moving = stepMotion(s.zoom, Math.log(zoom), dt, reduced);
      const next = Math.exp(s.zoom.value);
      Object.assign(s.x, motionValue(THREE.MathUtils.clamp(anchor.x - cursor.x / next, -limits.current.x, limits.current.x)));
      Object.assign(s.y, motionValue(THREE.MathUtils.clamp(anchor.y + cursor.y / next, -limits.current.y, limits.current.y)));
      if (!moving) wheel.current = null;
    } else if (destination.current) {
      const to = destination.current;
      moving = stepMotion(s.x, to.x, dt, reduced, 0.001) || moving;
      moving = stepMotion(s.y, to.y, dt, reduced, 0.001) || moving;
      moving = stepMotion(s.zoom, Math.log(to.zoom), dt, reduced) || moving;
      if (!moving) destination.current = null;
    }
    const trayMoving = stepMotion(s.tray, level.tray, dt, reduced, 0.001);
    const v = { x: s.x.value, y: s.y.value, zoom: Math.exp(s.zoom.value) };
    view.current = v;
    camera.position.set(v.x, v.y, 22);
    if (camera.zoom !== v.zoom) {
      camera.zoom = v.zoom;
      camera.updateProjectionMatrix();
    }
    const box = container.current;
    if (box) {
      cssValue(box, "--zoom", v.zoom.toFixed(4));
      box.dataset.view = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.zoom.toFixed(3)}`;
      box.dataset.minZoom = minZoom.toFixed(4);
      box.dataset.moving = String(moving || trayMoving);
      const stage = box.closest<HTMLElement>(".sk-stage");
      if (stage) {
        cssValue(stage, "--tray-x", `${(size.width / 2 - v.x * v.zoom).toFixed(2)}px`);
        cssValue(stage, "--tray-y", `${(size.height / 2 + v.y * v.zoom).toFixed(2)}px`);
        cssValue(stage, "--tray-d", `${(s.tray.value * 2 * v.zoom).toFixed(2)}px`);
      }
    }
    if (moving || trayMoving) clock.current.active = true;
  }, -2);
  return null;
}

const Scene = memo(function Scene(props: SceneProps) {
  const { level: sourceLevel, selected, installed, installationStatus, theme, agent, agentEditing, reduced, onAgent, onCategory, onBack, onSkill, container } = props;
  const { invalidate, size } = useThree();
  const [labelSizes, setLabelSizes] = useState<ReadonlyMap<string, LabelSize>>(() => new Map());
  const onLabelSize = useCallback((key: string, measured: LabelSize) => {
    setLabelSizes(previous => {
      const old = previous.get(key);
      if (old?.width === measured.width && old.height === measured.height) return previous;
      const next = new Map(previous);
      next.set(key, measured);
      return next;
    });
  }, []);
  // Derive the readability floor from the original composition, never the expanded layout.
  // This prevents an expand/refit/shrink feedback loop. Panning and zooming do not repack nodes.
  const minZoom = frame(sourceLevel.extent.x, sourceLevel.extent.y, size).zoom * 0.85;
  const level = useMemo(() => layoutLabeledLevel(sourceLevel, labelSizes, minZoom), [sourceLevel, labelSizes, minZoom]);
  const agentAction = agentEditing ? 'closeAgent' : 'editAgent';
  const motion = useRef(new Set<string>()), finished = useRef(new Set<string>());
  const poses = useRef(new Map<string, OrbPose>());
  const clock = useRef({ delta: 0, active: false });
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 64, 48), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const [population, setPopulation] = useState(() => ({ orbs: level.orbs, reduced, entries: reconcileOrbs([], level.orbs, reduced) }));
  // Adjust during render, before children commit. An effect here would first unmount missing keys.
  if (population.orbs !== level.orbs || population.reduced !== reduced) {
    setPopulation({ orbs: level.orbs, reduced, entries: reconcileOrbs(population.entries, level.orbs, reduced) });
  }
  useLayoutEffect(() => { invalidate(); }, [level, reduced, invalidate]);
  useFrame((_, delta) => {
    // The first frame after being idle establishes the start; idle time must not finish a new trip.
    clock.current.delta = clock.current.active ? delta : 0;
    clock.current.active = false;
  }, -3);
  useFrame(() => {
    if (finished.current.size) {
      const keys = new Set(finished.current);
      finished.current.clear();
      setPopulation((previous) => ({ ...previous, entries: previous.entries.filter(({ orb, leaving }) => !leaving || !keys.has(orb.key)) }));
    }
    if (container.current) container.current.dataset.morphing = String(motion.current.size > 0);
    if (clock.current.active) invalidate();
  });
  const pick = useMemo(
    () => (orb: Orb, source: HTMLElement | null) => {
      if (orb.kind === "agent") onAgent(source);
      else if (orb.kind === "category") {
        if (orb.role === "center") onBack();
        else onCategory(orb.id);
      }
      else if (orb.kind === "skill") onSkill(orb.id, source, orb.category);
    },
    [onAgent, onCategory, onBack, onSkill],
  );
  return (
    <>
      <CameraRig {...props} level={level} minZoom={minZoom} clock={clock} />
      {population.entries.map(({ orb, leaving }) => (
        <Pearl
          key={orb.key}
          orb={orb}
          leaving={leaving}
          installation={installed.has(orb.id) ? "installed" : installationStatus === "ready" ? "available" : installationStatus}
          theme={theme}
          selected={selected === orb.id && orb.kind === "skill"}
          agent={agent}
          agentAction={agentAction}
          reduced={reduced}
          motion={motion}
          clock={clock}
          poses={poses}
          finished={finished}
          geometry={geometry}
          onLabelSize={onLabelSize}
          onPick={pick}
        />
      ))}
    </>
  );
});

/** Without WebGL the same navigation runs on plain buttons. */
function GalaxyFallback({ level, agent, agentEditing, installed, installationStatus, onAgent, onCategory, onBack, onSkill }: GalaxyProps) {
  const t = useTranslations("Starport.v2");
  const locale = useLocale() as Locale;
  const { mode } = useNightMode();
  const current = level.categories.find((c) => c.id === level.focus);
  const agentAction = agentEditing ? 'closeAgent' : 'editAgent';
  return (
    <div className="sk-scene-fallback" onKeyDown={(event) => {
      if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
    }}>
      {current ? <button className="sk-fallback-context" onClick={onBack} aria-label={`${current.label}, ${t("skillCount", { count: current.count })}, ${t("returnOverview")}`}>
        <ArrowLeft size={16} aria-hidden="true" /><strong>{current.label}</strong><span>{t("skillCount", { count: current.count })}</span><small>{t("returnOverview")}</small>
      </button> :
        <button onClick={(event) => onAgent(event.currentTarget)} aria-label={`${agent.nickname}, ${t(agentAction)}`} aria-expanded={agentEditing} aria-controls={agentEditing ? 'sk-side-panel' : undefined}>
          <AvatarThumb avatar={agent.avatar} size={16} /><span>{agent.nickname}</span><small>{t(agentAction)}</small>
        </button>}
      {current ? current.skills.map((skill) => {
        const state = installed.has(skill.skill_id) ? "installed" : installationStatus === "ready" ? "available" : installationStatus;
        const color = pearlAppearance({ kind: "skill", role: "ring", color: current.color }, state, mode).tint.getStyle();
        const status = t(state === "installed" ? "installedBadge" : state === "available" ? "notInstalled" : state === "loading" ? "installationLoading" : "installationUnknown");
        return <button key={skill.skill_id} data-skill={skill.skill_id} data-installation={state} onClick={(e) => onSkill(skill.skill_id, e.currentTarget, current.id)}>
          <i style={{ background: color }} /><span>{displayName(skill, locale)}</span><small>{status}</small><strong>{shortNumber(skill.install_count ?? 0, locale)}</strong>
        </button>;
      }) : level.categories.map((c) => (
        <button key={c.id} data-orb-key={`category:${c.id}`} data-leaving="false" onClick={() => onCategory(c.id)}>
          <i style={{ background: c.color }} /><span>{c.label}</span><strong>{c.count}</strong>
        </button>
      ))}
    </div>
  );
}

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Discard late event registration when a fast search/view switch has removed the canvas. */
function sceneEvents(store: Parameters<typeof pointerEvents>[0]) {
  const events = pointerEvents(store);
  return {
    ...events,
    connect(target: HTMLElement) {
      if (target?.isConnected) events.connect?.(target);
    },
  };
}

export default function Universe(props: GalaxyProps) {
  const t = useTranslations("Starport.v2");
  const { mode } = useNightMode();
  const [supported, setSupported] = useState<boolean | null>(null);
  const reduced = Boolean(useReducedMotion());
  const container = useRef<HTMLDivElement>(null), dragged = useRef(false);
  useEffect(() => {
    const gl = document.createElement("canvas").getContext("webgl2");
    setSupported(Boolean(gl));
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  }, []);
  const fallback = <GalaxyFallback {...props} />;
  if (supported === null) return <div className="sk-loading" role="status">{t("loadingMap")}</div>;
  if (!supported) return fallback;
  return (
    <div className="sk-galaxy" ref={container}>
      <SceneBoundary fallback={fallback}>
        <Canvas
          events={sceneEvents}
          orthographic
          camera={{ position: [0, 0, 22], near: 0.1, far: 60 }}
          dpr={[1, 1.75]}
          frameloop="demand"
          gl={{ antialias: true, alpha: true }}
          onPointerMissed={() => {
            if (!dragged.current) props.onBackdrop();
          }}
        >
          <Suspense fallback={null}>
            <Scene {...props} theme={mode} reduced={reduced} container={container} dragged={dragged} onUnavailable={() => setSupported(false)} />
          </Suspense>
        </Canvas>
        <button className="sk-recenter" aria-label={t("resetMapView")} title={t("resetMapView")} onClick={props.onRecenter}><Crosshair size={17} /></button>
      </SceneBoundary>
    </div>
  );
}
