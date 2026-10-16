import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createRoot } from "react-dom/client";
import { IntlProvider } from "use-intl";
import {
  AnimatePresence,
  LayoutGroup,
  MotionConfig,
  motion,
} from "framer-motion";
import {
  ArrowUp,
  AudioLines,
  Languages,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Sun,
  Users,
  X,
} from "lucide-react";
import {
  SmoothHeight,
  VoiceAgentToggle,
  VoiceControl,
  VoiceDock,
  VoiceLiveText,
  VoiceMemberStatus,
  VoiceStatus,
  useOrbPresence,
  type VoiceControlProps,
  type VoiceLevelReader,
} from "./voice-mode";
import {
  currentSpeaker,
  memberStatus,
  orbView,
  type LiveSegment,
  type OrbSource,
} from "./live";
import { getAvatarBgColor } from "./avatar-color";
import {
  DURATION,
  SCENES,
  sampleLevel,
  sampleSourceOfSegment,
  sampleSnapshot,
  words,
  type Locale,
} from "./sample";
import en from "./en.json";
import zh from "./zh.json";
import "@fontsource-variable/geist";
import "./demo.css";

const zero = () => 0;

function App() {
  const [locale, setLocale] = useState<Locale>("en");
  const [dark, setDark] = useState(false);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${words[locale].title} · ${words[locale].demo}`;
  }, [locale]);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  return (
    <IntlProvider locale={locale} messages={locale === "en" ? en : zh}>
      <MotionConfig reducedMotion="user">
        <Chat
          locale={locale}
          dark={dark}
          onLocale={() => setLocale(locale === "en" ? "zh" : "en")}
          onTheme={() => setDark(!dark)}
        />
      </MotionConfig>
    </IntlProvider>
  );
}

function Chat({
  locale,
  dark,
  onLocale,
  onTheme,
}: {
  locale: Locale;
  dark: boolean;
  onLocale(): void;
  onTheme(): void;
}) {
  const copy = words[locale];
  const [active, setActive] = useState(true);
  const [muted, setMuted] = useState(false);
  const [agentInRoom, setAgentInRoom] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [sampleRun, setSampleRun] = useState(0);
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [membersOpen, setMembersOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const memberButton = useRef<HTMLButtonElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const dock = useRef<HTMLDivElement>(null);
  const restoreEntry = useRef(false);
  const focusDock = useRef(false);
  const clock = useRef(0);
  const last = useRef(0);
  const latest = useRef({ playing, active, muted, time, agentInRoom });
  latest.current = { playing, active, muted, time, agentInRoom };
  const snapshot = sampleSnapshot(time, locale, muted, agentInRoom);
  const view = orbView(snapshot);
  const orbShown = useOrbPresence(active, view, "sample-conversation");
  const speaker = active ? currentSpeaker(snapshot.live) : null;
  const progress = useCallback(
    () => Math.min(1, Math.max(0, (clock.current - 7.5) / 8)),
    [],
  );

  useEffect(() => {
    if (!playing || !active) return;
    let frame = 0;
    last.current = 0;
    const tick = (now: number) => {
      if (document.hidden) {
        last.current = 0;
        frame = requestAnimationFrame(tick);
        return;
      }
      const delta = last.current
        ? Math.min(0.1, (now - last.current) / 1000)
        : 0;
      last.current = now;
      clock.current = Math.min(DURATION, clock.current + delta);
      setTime(clock.current);
      if (clock.current < DURATION) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, active]);

  const readers = useRef<Record<OrbSource, () => number>>({
    none: zero,
    mic: () =>
      latest.current.active &&
      latest.current.playing &&
      !latest.current.muted &&
      clock.current > 0.8 &&
      clock.current < 5.2
        ? sampleLevel(clock.current)
        : 0,
    agent: () =>
      latest.current.active &&
      latest.current.playing &&
      latest.current.agentInRoom &&
      clock.current >= 7.5 &&
      clock.current < 15.5
        ? sampleLevel(clock.current + 3)
        : 0,
    peer: () =>
      latest.current.active &&
      latest.current.playing &&
      clock.current >= 16 &&
      clock.current < 21
        ? sampleLevel(clock.current + 7)
        : 0,
  });
  const levelOf = useCallback<VoiceLevelReader>(
    (segmentId) => readers.current[sampleSourceOfSegment(segmentId)],
    [],
  );

  function seek(next: number, run = false) {
    // A deliberate new scene/replay resumes following, even if the old scene had
    // shrunk to a non-scrollable height without dispatching a scroll event.
    following.current = true;
    clock.current = next;
    last.current = 0;
    setTime(next);
    setPlaying(run);
    setSampleRun((value) => value + 1);
  }
  function enter() {
    focusDock.current = true;
    setActive(true);
    setMuted(false);
    seek(0);
  }
  function finish() {
    setPlaying(false);
    setActive(false);
    restoreEntry.current = true;
  }
  function togglePlay() {
    if (!active) {
      setActive(true);
      setMuted(false);
    }
    if (time >= DURATION) seek(0, true);
    else setPlaying(!playing);
  }
  function replay() {
    setActive(true);
    seek(0, true);
  }

  useEffect(() => {
    if (!active || !focusDock.current) return;
    const frame = requestAnimationFrame(() => {
      focusDock.current = false;
      dock.current
        ?.querySelector<HTMLButtonElement>('[data-voice-control="on"] button')
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [active]);
  useEffect(() => {
    if (active || !restoreEntry.current) return;
    // Allow the source's 1.2-second ended state and exit transition to finish.
    const timer = setTimeout(() => {
      restoreEntry.current = false;
      dock.current
        ?.querySelector<HTMLButtonElement>('[data-voice-control="off"] button')
        ?.focus({ preventScroll: true });
    }, 1450);
    return () => clearTimeout(timer);
  }, [active]);
  useLayoutEffect(() => {
    following.current = true;
    const node = thread.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [sampleRun]);
  useEffect(() => {
    const node = thread.current;
    const content = node?.querySelector(".thread-inner");
    if (!node || !content) return;
    const onScroll = () => {
      following.current =
        node.scrollHeight - node.scrollTop - node.clientHeight < 80;
    };
    const resize = new ResizeObserver(() => {
      if (following.current) node.scrollTop = node.scrollHeight;
    });
    resize.observe(content);
    resize.observe(node);
    node.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      resize.disconnect();
      node.removeEventListener("scroll", onScroll);
    };
  }, []);
  useEffect(() => {
    if (membersOpen) dialog.current?.showModal();
    else dialog.current?.close();
  }, [membersOpen]);
  function closeMembers() {
    setMembersOpen(false);
    memberButton.current?.focus({ preventScroll: true });
  }
  function send(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setMessages((prev) => [...prev, text.trim()]);
    setText("");
  }

  const control: VoiceControlProps = {
    active,
    busy: !active && !!orbShown,
    conn: "normal",
    muted,
    host: true,
    selfColor: "#ac95f6",
    micLevel: readers.current.mic,
    onEnter: enter,
    onToggleMute: () => setMuted(!muted),
    onFinish: finish,
  };
  const status =
    time >= DURATION
      ? copy.finished
      : playing
        ? copy.playing
        : time > 0
          ? copy.paused
          : copy.sample;
  const samples: LiveSegment[] = active || time > 0 ? snapshot.live : [];
  const voiceWords = (locale === "en" ? en : zh).Chat.voiceMode;
  const announcedState = {
    ...copy.scenes,
    connecting: voiceWords.orbConnecting,
    reconnecting: voiceWords.reconnecting,
    waiting: voiceWords.waitingHost,
    muted: voiceWords.muted,
    ended: voiceWords.orbEnded,
  }[orbShown?.state ?? view.state];
  const shownScene =
    Object.entries(SCENES).find(([, at]) => Math.abs(time - at) < 0.01)?.[0] ??
    "";

  return (
    <div
      className="voice-demo"
      data-playback={playing ? "playing" : "paused"}
      data-voice-active={active}
    >
      <header className="chat-header">
        <div className="chat-title">
          <AudioLines size={18} aria-hidden="true" />
          <h1>{copy.title}</h1>
          <span className="demo-badge">{copy.demo}</span>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="icon-button"
            aria-label={copy.language}
            title={copy.language}
            onClick={onLocale}
          >
            <Languages size={18} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label={copy.theme}
            title={copy.theme}
            onClick={onTheme}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            ref={memberButton}
            type="button"
            className="members-button"
            aria-label={copy.members}
            aria-haspopup="dialog"
            aria-expanded={membersOpen}
            onClick={() => setMembersOpen(true)}
          >
            <span className="face-pile" aria-hidden="true">
              <Avatar name={copy.you} color="#aa75dd" />
              <Avatar name={copy.peer} color="#648fe0" />
              <Avatar name={copy.agent} color="#8875c1" />
            </span>
            <Users size={18} />
          </button>
        </div>
      </header>
      <main className="chat-main">
        <div
          className="conversation"
          ref={thread}
          tabIndex={0}
          aria-label={copy.sample}
        >
          <div className="thread-inner">
            <div className="message self">
              <Avatar name={copy.you} color="#aa75dd" />
              <div className="message-body">
                <p className="bubble">{copy.intro}</p>
              </div>
            </div>
            <div className="message">
              <Avatar name={copy.agent} color="#8875c1" />
              <div className="message-body">
                <div className="message-meta">
                  {copy.agent}
                  <span className="role-label">{copy.agentType}</span>
                </div>
                <p>{copy.welcome}</p>
              </div>
            </div>
            {samples.map((segment) => {
              const color =
                segment.kind === "self"
                  ? "#aa75dd"
                  : segment.kind === "peer"
                    ? "#648fe0"
                    : "#8875c1";
              const live =
                active &&
                (segment.phase === "speaking" || segment.phase === "thinking");
              return (
                <div
                  key={`${segment.id}-${sampleRun}-${locale}`}
                  className={`message ${segment.kind}`}
                  data-message={segment.id}
                  data-phase={segment.phase}
                >
                  <Avatar
                    name={segment.name}
                    color={color}
                    speaking={speaker?.id === segment.id}
                  />
                  <div className="message-body">
                    <div className="message-meta">
                      {segment.name}
                      {live && (
                        <VoiceStatus phase={segment.phase} color={color} />
                      )}
                    </div>
                    <p
                      className={segment.kind === "self" ? "bubble" : undefined}
                    >
                      {live ? (
                        <VoiceLiveText
                          text={segment.text}
                          interim={segment.interim}
                          color={color}
                          tone={segment.kind === "self" ? "onBrand" : undefined}
                          said={
                            segment.kind === "agent" &&
                            segment.phase === "speaking"
                              ? progress
                              : undefined
                          }
                        />
                      ) : (
                        segment.text || segment.interim
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
            {messages.map((message, index) => (
              <div className="message self" key={`typed-${index}`}>
                <Avatar name={copy.you} color="#aa75dd" />
                <div className="message-body">
                  <p className="bubble">{message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="composer-area" ref={dock}>
          <div className="sample-controls" aria-label={copy.sample}>
            <button
              type="button"
              className="play-button"
              onClick={togglePlay}
              data-action="play"
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
              <span>
                {playing
                  ? copy.pause
                  : time > 0 && time < DURATION
                    ? copy.resume
                    : copy.play}
              </span>
            </button>
            <button
              type="button"
              className="icon-button replay"
              aria-label={copy.replay}
              title={copy.replay}
              onClick={replay}
            >
              <RotateCcw size={15} />
            </button>
            <label className="scene-select">
              <span className="sr-only">{copy.scene}</span>
              <select
                value={shownScene}
                onChange={(event) => {
                  setActive(true);
                  seek(SCENES[event.target.value as keyof typeof SCENES]);
                }}
              >
                <option value="" disabled>
                  {copy.scene}
                </option>
                {Object.keys(SCENES).map((name) => (
                  <option value={name} key={name}>
                    {copy.scenes[name as keyof typeof SCENES]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            className="sample-progress"
            role="progressbar"
            aria-label={copy.sample}
            aria-valuemin={0}
            aria-valuemax={22}
            aria-valuenow={Math.floor(time)}
          >
            <span style={{ transform: `scaleX(${time / DURATION})` }} />
          </div>
          <p className="sr-only" role="status">
            {status}. {orbShown ? announcedState : copy.entryHint}
          </p>
          <LayoutGroup id="voice-demo">
            <SmoothHeight swap={Boolean(orbShown)}>
              <AnimatePresence initial={false} mode="popLayout">
                {orbShown ? (
                  <motion.div
                    key="voice-dock"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <VoiceDock
                      view={orbShown}
                      levelOf={levelOf}
                      control={control}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="composer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.12 }}
                  >
                    <form className="text-composer" onSubmit={send}>
                      <textarea
                        rows={2}
                        aria-label={copy.placeholder}
                        placeholder={copy.placeholder}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" &&
                            !event.shiftKey &&
                            !event.nativeEvent.isComposing
                          ) {
                            event.preventDefault();
                            send(event);
                          }
                        }}
                      />
                      <div className="composer-actions">
                        <span>{copy.entryHint}</span>
                        <VoiceControl {...control} active={false} />
                        <button
                          type="submit"
                          className="send-button"
                          disabled={!text.trim()}
                          aria-label={copy.send}
                        >
                          <ArrowUp size={18} />
                        </button>
                      </div>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </SmoothHeight>
          </LayoutGroup>
          <p className="demo-notice">
            {copy.sample}
            <span aria-hidden="true"> · </span>
            {copy.notice}
          </p>
        </div>
      </main>
      <dialog
        ref={dialog}
        className="participants-dialog"
        aria-labelledby="participants-title"
        onCancel={(event) => {
          event.preventDefault();
          closeMembers();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeMembers();
        }}
        onClose={() => {
          if (membersOpen) closeMembers();
        }}
      >
        <div className="participants-content">
          <div className="participants-heading">
            <h2 id="participants-title">{copy.members}</h2>
            <button
              className="icon-button"
              aria-label={copy.closeMembers}
              onClick={closeMembers}
            >
              <X size={18} />
            </button>
          </div>
          <p className="participants-note">
            {copy.sample} · {copy.localOnly}
          </p>
          {(["self", "peer", "agent"] as const).map((kind) => {
            const name =
              kind === "self"
                ? copy.you
                : kind === "peer"
                  ? copy.peer
                  : copy.agent;
            const color =
              kind === "self"
                ? "#aa75dd"
                : kind === "peer"
                  ? "#648fe0"
                  : "#8875c1";
            const state =
              active && (kind !== "agent" || agentInRoom)
                ? memberStatus(
                    snapshot,
                    kind === "self"
                      ? { kind: "self" }
                      : { kind: kind === "peer" ? "person" : "agent", name },
                  )
                : null;
            return (
              <div className="participant" key={kind}>
                <Avatar name={name} color={color} />
                <div className="participant-info">
                  <strong>{name}</strong>
                  {state ? (
                    <VoiceMemberStatus status={state} color={color} />
                  ) : (
                    <span className="outside">{copy.outside}</span>
                  )}
                </div>
                {kind === "agent" && (
                  <VoiceAgentToggle
                    inRoom={agentInRoom}
                    onToggle={() => setAgentInRoom(!agentInRoom)}
                  />
                )}
              </div>
            );
          })}
        </div>
      </dialog>
    </div>
  );
}

function Avatar({
  name,
  color = getAvatarBgColor(name),
  speaking = false,
}: {
  name: string;
  color?: string;
  speaking?: boolean;
}) {
  return (
    <span
      className="avatar"
      data-speaking={speaking}
      aria-hidden="true"
      style={{ "--avatar-color": color } as CSSProperties}
    >
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
