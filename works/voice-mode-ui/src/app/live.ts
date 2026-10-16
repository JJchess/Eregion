/** Display-only rules extracted from the chat voice UI. The demo supplies synthetic snapshots. */
export type VoiceConn =
  | "connecting"
  | "normal"
  | "waiting"
  | "reconnecting"
  | "closed";
export type LivePhase = "speaking" | "thinking" | "done" | "cut";
export type LiveKind = "self" | "peer" | "agent";

export interface LiveSegment {
  id: string;
  kind: LiveKind;
  /** Participant id (people) or role name (agents). */
  who: string;
  /** Display name: role name for agents, room display name for people. */
  name: string;
  /** Confirmed text. */
  text: string;
  /** Not yet final (people only). */
  interim: string;
  /** A final transcript arrived for it (people only). */
  final?: boolean;
  /** The words of its finals alone, without interim folded in at stop (people only). */
  settled?: string;
  phase: LivePhase;
}

export interface VoiceSnapshot {
  conn: VoiceConn;
  muted: boolean;
  live: LiveSegment[];
  /** When the room first went live on this connection (ms). */
  startedAt: number | null;
  /** Room members as last reported by the server (people only). */
  members: { id: string; name: string; muted: boolean }[];
  /** People whose microphone stream reaches us right now (participant ids). */
  audible: string[];
  /** Role ids of the agents in the room, as the server last listed them; null until it has. */
  agents: string[] | null;
}

const isOpen = (s: LiveSegment) =>
  s.phase === "speaking" || s.phase === "thinking";
/** The segment whose avatar should glow right now: whoever is audibly speaking, else whoever is about to. */
export const currentSpeaker = (live: LiveSegment[]): LiveSegment | null => {
  const open = live.filter(isOpen).reverse();
  return open.find((s) => s.phase === "speaking") ?? open[0] ?? null;
};

export type MemberStatus =
  | "speaking"
  | "thinking"
  | "muted"
  | "listening"
  | "ready";
export type StatusTarget =
  | { kind: "self" }
  | { kind: "person"; name: string }
  | { kind: "agent"; name: string };

/**
 * One rule for what to show next to anyone in the room (face pile, participant list).
 * null: this person is not in the room.
 */
export function memberStatus(
  snap: VoiceSnapshot,
  target: StatusTarget,
): MemberStatus | null {
  const open = snap.live.filter(isOpen);
  if (target.kind === "agent") {
    const seg = open.find((s) => s.kind === "agent" && s.name === target.name);
    return seg ? (seg.phase === "thinking" ? "thinking" : "speaking") : "ready";
  }
  if (target.kind === "self") {
    if (open.some((s) => s.kind === "self")) return "speaking";
    return snap.muted ? "muted" : "listening";
  }
  const member = snap.members.find((m) => m.name === target.name);
  if (!member) return null;
  if (open.some((s) => s.kind === "peer" && s.who === member.id))
    return "speaking";
  return member.muted ? "muted" : "listening";
}

export type OrbState =
  | "connecting"
  | "reconnecting"
  | "waiting"
  | "self"
  | "peer"
  | "preparing"
  | "agent"
  | "listening"
  | "muted"
  | "ended";
/** What really moves the orb: your microphone, another person's stream, the agent audio playing, or nothing. */
export type OrbSource = "mic" | "peer" | "agent" | "none";
export interface OrbView {
  state: OrbState;
  speaker: LiveSegment | null;
  source: OrbSource;
}

const still = (state: OrbState): OrbView => ({
  state,
  speaker: null,
  source: "none",
});

/**
 * One rule for the voice orb: the room's real state, who is really speaking, and whether real
 * audio of theirs reaches this tab. `closed` only shows while voice is being opened (no
 * connection yet), so it reads as connecting.
 */
export function orbView(snap: VoiceSnapshot): OrbView {
  if (snap.conn === "connecting" || snap.conn === "closed")
    return still("connecting");
  if (snap.conn === "reconnecting" || snap.conn === "waiting")
    return still(snap.conn);
  const speaker = currentSpeaker(snap.live);
  if (!speaker) return still(snap.muted ? "muted" : "listening");
  if (speaker.kind === "agent")
    return speaker.phase === "thinking"
      ? { state: "preparing", speaker, source: "none" }
      : { state: "agent", speaker, source: "agent" };
  if (speaker.kind === "self")
    return { state: "self", speaker, source: snap.muted ? "none" : "mic" };
  return {
    state: "peer",
    speaker,
    source: snap.audible.includes(speaker.who) ? "peer" : "none",
  };
}

/** The orb's last word once voice has closed. */
export const ORB_ENDED: OrbView = still("ended");
