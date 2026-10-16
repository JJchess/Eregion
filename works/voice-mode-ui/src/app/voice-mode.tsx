"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useTranslations } from "use-intl";
import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, Link2, Mic, MicOff, X } from "lucide-react";
import {
  ORB_ENDED,
  type LivePhase,
  type MemberStatus,
  type OrbState,
  type OrbView,
  type VoiceConn,
} from "./live";
import { getAvatarBgColor } from "./avatar-color";
import { VoiceOrb, type OrbPalette } from "./voice-orb/voice-orb";
import styles from "./voice-mode.module.css";

/** What a chat message needs to show that it is being spoken right now. */
export interface VoiceMessageState {
  phase: LivePhase;
  /** Words heard but not final yet. */
  interim?: string;
  /** Agents: how much of the answer has been spoken, 0..1. */
  said?: () => number;
}

const cssVar = (name: string, value: string) =>
  ({ [name]: value }) as CSSProperties;

/**
 * Follows a loudness reader every frame, smoothed (quick to rise, slower to fall), and hands each
 * value to `draw` — straight to the DOM, never through React. Idle while `level` is undefined;
 * draws 0 when it stops.
 */
function useLevelLoop(
  level: (() => number) | undefined,
  draw: (value: number, now: number) => void,
  { rise, fall }: { rise: number; fall: number },
) {
  const paint = useRef(draw);
  paint.current = draw;
  useEffect(() => {
    if (!level) return;
    let raf = 0;
    let current = 0;
    const loop = (now: number) => {
      const target = Math.max(0, level());
      current += (target - current) * (target > current ? rise : fall);
      paint.current(current, now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      paint.current(0, performance.now());
    };
  }, [level, rise, fall]);
}

/** 在说 / 正在思考 / 已打断, next to the speaker's name. */
export function VoiceStatus({
  phase,
  color,
}: {
  phase: LivePhase;
  color: string;
}) {
  const t = useTranslations("Chat.voiceMode");
  if (phase === "done") return null;
  return (
    <span
      className={styles.status}
      data-phase={phase}
      style={cssVar("--c", color)}
    >
      {t(phase)}
    </span>
  );
}

/** How many characters of `text` have been spoken; only ever grows. All of it without a reader. */
function useSpoken(text: string, said?: () => number) {
  const [spoken, setSpoken] = useState(0);
  const read = useRef(said);
  read.current = said;
  const live = !!said;
  useEffect(() => {
    if (!live) return;
    let raf = 0;
    const loop = () => {
      const n = Math.round((read.current?.() ?? 1) * text.length);
      setSpoken((prev) => Math.max(prev, n));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [live, text.length]);
  return live ? Math.min(spoken, text.length) : text.length;
}

/**
 * Text as it is being spoken; dots while thinking. People: final words, grey interim words, a caret.
 * Agents (`said`): the words light up as the voice reaches them, the rest waits faintly.
 */
export function VoiceLiveText({
  text,
  interim,
  color,
  tone,
  said,
}: {
  text: string;
  interim?: string;
  color: string;
  tone?: "onBrand" | "inBubble";
  said?: () => number;
}) {
  const spoken = useSpoken(text, said);
  if (!text && !interim && !tone) {
    return (
      <span className={styles.dots} aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    );
  }
  if (said) {
    return (
      <span>
        {text.slice(0, spoken)}
        <span className={styles.unsaid} data-unsaid>
          {text.slice(spoken)}
        </span>
      </span>
    );
  }
  return (
    <span
      className={tone ? styles[tone] : undefined}
      style={cssVar("--c", color)}
    >
      {text}
      {interim ? <span className={styles.interim}>{interim}</span> : null}
      <span className={styles.caret} aria-hidden="true" />
    </span>
  );
}

/** i18n key (Chat.voiceMode) for each member status. */
export const MEMBER_STATUS_KEY = {
  speaking: "speaking",
  thinking: "thinking",
  listening: "listening",
  muted: "statusMuted",
  ready: "ready",
} as const;

/** 在说 / 正在思考 / 在听 / 静音 / 就绪 for a person or agent row (participant list). */
export function VoiceMemberStatus({
  status,
  color,
}: {
  status: MemberStatus;
  color: string;
}) {
  const t = useTranslations("Chat.voiceMode");
  const label = t(MEMBER_STATUS_KEY[status]);
  return (
    <span
      className={styles.member}
      data-status={status}
      style={cssVar("--c", color)}
    >
      {label}
    </span>
  );
}

const ORB_SPEED: Record<OrbState, number> = {
  connecting: 0.3,
  reconnecting: 0.3,
  waiting: 0.3,
  listening: 0.45,
  muted: 0.45,
  ended: 0.3,
  preparing: 0.6,
  self: 1,
  peer: 1,
  agent: 1,
};
const ORB_PALETTE: Record<OrbState, OrbPalette> = {
  connecting: "silver",
  reconnecting: "silver",
  waiting: "silver",
  listening: "silver",
  muted: "silver",
  preparing: "silver",
  // Call ended: back to the voice button's violet, as the orb shrinks into it.
  ended: "violet",
  self: "violet",
  peer: "blue",
  agent: "lavender",
};
const ENDED_MS = 1200;

/**
 * What the orb shows: the live view while voice is open (or opening), then "call ended" for a
 * moment after it closes — only where it closed. Voice that ended because you went to another
 * session (a new chat, say) leaves no orb behind there.
 */
export function useOrbPresence(
  open: boolean,
  view: OrbView,
  sessionId: string | null,
): OrbView | null {
  const [ended, setEnded] = useState(false);
  const wasOpen = useRef(open);
  /** The session voice was open in. */
  const openIn = useRef<string | null>(null);
  useEffect(() => {
    const closed = wasOpen.current && !open;
    wasOpen.current = open;
    if (open) {
      openIn.current = sessionId;
      setEnded(false);
      return;
    }
    if (!closed || openIn.current !== sessionId) return;
    setEnded(true);
    const timer = setTimeout(() => setEnded(false), ENDED_MS);
    return () => clearTimeout(timer);
  }, [open, sessionId]);
  useEffect(() => {
    setEnded(false);
  }, [sessionId]);
  // Standalone adaptation: keep the ended frame during the first closed render too,
  // before the effect commits it, so the composer does not flash between the two.
  const justClosed = wasOpen.current && !open && openIn.current === sessionId;
  return open ? view : ended || justClosed ? ORB_ENDED : null;
}

/** A line of bars under the label, scrolling the same real level that moves the orb. */
const WAVE_BARS = 24;

function VoiceWave({ level }: { level?: () => number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const history = useRef(new Array<number>(WAVE_BARS).fill(0));
  const lastPush = useRef(0);
  // Scroll the recent loudness through the bars (~20 samples a second).
  useLevelLoop(
    level,
    (value, now) => {
      if (now - lastPush.current < 50) return;
      lastPush.current = now;
      history.current = [...history.current.slice(1), value];
      const bars = ref.current?.children ?? [];
      for (let i = 0; i < bars.length; i++)
        (bars[i] as HTMLElement).style.setProperty(
          "--h",
          history.current[i].toFixed(3),
        );
    },
    { rise: 0.4, fall: 0.15 },
  );
  return (
    <span
      ref={ref}
      className={styles.wave}
      aria-hidden="true"
      data-shown={Boolean(level)}
    >
      {Array.from({ length: WAVE_BARS }, (_, i) => (
        <i
          key={i}
          style={cssVar(
            "--w",
            String(Math.sin(((i + 0.5) / WAVE_BARS) * Math.PI)),
          )}
        />
      ))}
    </span>
  );
}

/**
 * Eases its height to its content's whenever `swap` changes (composer ↔ voice dock), so the
 * conversation above slides instead of jumping. At any other time (a composer growing as you type)
 * it follows at once. Content sits at the bottom and may overhang upward mid-swap.
 */
export function SmoothHeight({
  swap,
  children,
}: {
  swap: unknown;
  children: ReactNode;
}) {
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const [easing, setEasing] = useState(false);
  const first = useRef(true);
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setHeight(el.offsetHeight));
    observer.observe(el);
    setHeight(el.offsetHeight);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setEasing(true);
    const timer = setTimeout(() => setEasing(false), 450);
    return () => clearTimeout(timer);
  }, [swap]);
  return (
    <div
      className={styles.smoothHeight}
      data-easing={easing || undefined}
      style={height == null ? undefined : { height }}
    >
      <div ref={inner} className={styles.smoothInner}>
        {children}
      </div>
    </div>
  );
}

/** The orb and its entry button are one shared element: the orb grows out of the button and shrinks back. */
export const VOICE_ORB_LAYOUT_ID = "voice-orb";
/** How long the orb takes to grow out of the button (and back): ~400 ms, eased out. */
const ORB_MORPH = {
  layout: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const },
};

/** A segment ID belongs to the conversation; it is not an audio-source name. */
export type VoiceLevelReader = (segmentId: string) => () => number;

/**
 * Voice takes the composer's place: mute · orb · ✕ in one row (centred on the orb), and under it
 * who is speaking (or the room's state) plus a wave. One orb in one place: its colour follows who
 * speaks — silver when quiet, violet for you, blue for another person, lavender for an agent — and
 * only real audio moves it. While it says "call ended" the buttons are already gone.
 */
export function VoiceDock({
  view,
  levelOf,
  control,
}: {
  view: OrbView;
  levelOf: VoiceLevelReader;
  control: Omit<VoiceControlProps, "active" | "children">;
}) {
  const t = useTranslations("Chat.voiceMode");
  const { state, speaker, source } = view;
  const name = speaker?.name ?? "";
  // The name stands out; what they are doing stays quiet.
  const who = (chunks: ReactNode) => (
    <span className={styles.orbWho}>{chunks}</span>
  );
  const label = {
    connecting: t("orbConnecting"),
    reconnecting: t("reconnecting"),
    waiting: t("waitingHost"),
    listening: "", // quiet and connected: the orb alone says it
    muted: t("muted"),
    ended: t("orbEnded"),
    self: t.rich("orbSelf", { who }),
    peer: t.rich("orbSpeaking", { name, who }),
    agent: t.rich("orbAnswering", { name, who }),
    preparing: t.rich("orbPreparing", { name, who }),
  }[state];
  const level = speaker && source !== "none" ? levelOf(speaker.id) : undefined;
  const palette = ORB_PALETTE[state];
  return (
    <div
      className={styles.dock}
      data-voice-orb={state}
      data-orb-state={state}
      data-orb-source={source}
      data-palette={palette}
    >
      <VoiceControl {...control} active>
        <motion.span
          layoutId={VOICE_ORB_LAYOUT_ID}
          transition={ORB_MORPH}
          className={styles.orbStage}
        >
          {/* Starts in the voice button's violet and settles into its own colour as it grows. */}
          <VoiceOrb
            className={styles.orbBall}
            level={level}
            speed={ORB_SPEED[state]}
            palette={palette}
            from="violet"
          />
          {state === "preparing" && (
            <svg
              className={styles.orbArc}
              viewBox="0 0 100 100"
              aria-hidden="true"
              data-orb-arc
            >
              <circle cx="50" cy="50" r="48" />
            </svg>
          )}
        </motion.span>
      </VoiceControl>
      {/* A new speaker's line cross-fades in over the old one; the row never changes height. */}
      <p className={styles.orbLabel} role="status">
        <AnimatePresence initial={false}>
          <motion.span
            key={`${state}:${name}`}
            className={styles.orbLine}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
          >
            {state === "peer" && (
              <span
                className={styles.orbChip}
                style={cssVar("--c", getAvatarBgColor(name))}
              >
                {name.trim().charAt(0).toUpperCase()}
              </span>
            )}
            <span className={styles.orbText}>{label}</span>
          </motion.span>
        </AnimatePresence>
      </p>
      <div className={styles.orbSub}>
        <VoiceWave level={level} />
        <span className={styles.orbHint} data-shown={state === "preparing"}>
          {t("orbThinking")}
        </span>
      </div>
    </div>
  );
}

export interface VoiceControlProps {
  active: boolean;
  busy: boolean;
  conn: VoiceConn;
  muted: boolean;
  host: boolean;
  /** The current user's avatar colour, for the listening ring. */
  selfColor: string;
  micLevel: () => number;
  onEnter(): void;
  onToggleMute(): void;
  onFinish(): void;
  /** Between mute and ✕ while voice is on: the orb. */
  children?: ReactNode;
}

/** Host's per-role switch in the participant list: put this agent into the voice room or take it out. */
export function VoiceAgentToggle({
  inRoom,
  onToggle,
}: {
  inRoom: boolean;
  onToggle(): void;
}) {
  const t = useTranslations("Chat.voiceMode");
  const label = t(inRoom ? "removeAgent" : "addAgent");
  return (
    <button
      type="button"
      className={styles.agentToggle}
      aria-pressed={inRoom}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <AudioLines size={16} aria-hidden="true" />
    </button>
  );
}

/** Host's invite in the participant list's Members heading while voice is on. */
export function VoiceInviteButton({
  onInvite,
  disabled,
}: {
  onInvite(): void;
  disabled?: boolean;
}) {
  const t = useTranslations("Chat.voiceMode");
  return (
    <button
      type="button"
      className={styles.inviteVoice}
      disabled={disabled}
      onClick={onInvite}
    >
      <Link2 size={14} aria-hidden="true" />
      {t("invite")}
    </button>
  );
}

/**
 * Voice controls, like ChatGPT. Off: the composer's voice entry (the button the orb grows out of).
 * On: mute · orb · ✕ in the voice dock. ✕ ends at once (hosts end the room, members leave).
 */
export function VoiceControl(props: VoiceControlProps) {
  const { active, busy, conn, muted, host, selfColor, micLevel } = props;
  const t = useTranslations("Chat.voiceMode");
  const ref = useRef<HTMLDivElement>(null);
  useLevelLoop(
    active ? micLevel : undefined,
    (value) => ref.current?.style.setProperty("--mic", value.toFixed(3)),
    { rise: 0.3, fall: 0.3 },
  );

  const micLabel = !active ? t("enter") : muted ? t("unmute") : t("mute");
  const closeLabel = t(host ? "end" : "leave");
  return (
    <div
      ref={ref}
      className={styles.control}
      data-voice-control={active ? "on" : "off"}
      data-on={active || undefined}
      data-muted={(active && muted) || undefined}
      data-conn={conn}
      style={cssVar("--self-c", selfColor)}
    >
      <motion.button
        type="button"
        layoutId={active ? undefined : VOICE_ORB_LAYOUT_ID}
        transition={ORB_MORPH}
        className={styles.mic}
        aria-label={micLabel}
        aria-pressed={active ? muted : undefined}
        title={active && muted ? t("muted") : micLabel}
        disabled={busy && !active}
        onClick={active ? props.onToggleMute : props.onEnter}
      >
        {!active ? (
          <AudioLines size={18} aria-hidden="true" />
        ) : muted ? (
          <MicOff size={18} aria-hidden="true" />
        ) : (
          <Mic size={18} aria-hidden="true" />
        )}
      </motion.button>
      {props.children}
      {active && (
        <button
          type="button"
          className={styles.close}
          aria-label={closeLabel}
          title={closeLabel}
          disabled={busy}
          onClick={props.onFinish}
        >
          <X size={18} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
