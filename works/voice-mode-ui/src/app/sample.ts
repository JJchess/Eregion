import type { LiveSegment, OrbSource, VoiceSnapshot } from "./live";

export type Locale = "en" | "zh";
export const DURATION = 22;
export const SCENES = {
  listening: 0,
  self: 2,
  preparing: 6.1,
  agent: 9.5,
  peer: 18,
} as const;

/** Adapt the original dock's segment-keyed reader to this sample's source readers. */
export function sampleSourceOfSegment(segmentId: string): OrbSource {
  switch (segmentId) {
    case "sample-self":
      return "mic";
    case "sample-agent":
      return "agent";
    case "sample-peer":
      return "peer";
    default:
      return "none";
  }
}

export const words = {
  en: {
    title: "Voice discussion",
    demo: "Interactive demo",
    sample: "Sample conversation",
    notice: "Visual simulation. No microphone, recording, or sound.",
    play: "Play sample",
    pause: "Pause",
    resume: "Resume",
    replay: "Replay",
    finished: "Sample complete",
    paused: "Paused",
    playing: "Playing sample",
    members: "Participants",
    closeMembers: "Close participants",
    you: "You",
    peer: "Sam",
    agent: "Guide",
    agentType: "AI companion",
    localOnly: "Only this sample changes.",
    outside: "Not in voice",
    theme: "Switch theme",
    language: "切换到中文",
    scene: "Scene",
    scenes: {
      listening: "Listening",
      self: "You speaking",
      preparing: "AI preparing",
      agent: "AI answering",
      peer: "Sam speaking",
    },
    placeholder: "Write a sample message…",
    send: "Send sample message",
    intro: "Let’s plan a little garden for the neighbourhood.",
    welcome:
      "A small shared space can make a lovely start. What would you like people to do there?",
    self: "I’d like a quiet corner for reading, with herbs that everyone can help look after.",
    answer:
      "Let’s give the reading corner some shade, then place a few raised herb beds along the sunny edge. We can start small and let the garden grow with the people who use it.",
    peerText:
      "I like that. We could also leave a little space for children to plant their own seeds.",
    entryHint: "Open voice mode to try the sample.",
    agentRemoved: "Guide was removed from the sample.",
  },
  zh: {
    title: "语音讨论",
    demo: "交互演示",
    sample: "示例对话",
    notice: "纯视觉模拟，不使用麦克风、录音或声音。",
    play: "播放示例",
    pause: "暂停",
    resume: "继续",
    replay: "重播",
    finished: "示例播放完毕",
    paused: "已暂停",
    playing: "正在播放示例",
    members: "参与者",
    closeMembers: "关闭参与者",
    you: "你",
    peer: "小林",
    agent: "向导",
    agentType: "AI 伙伴",
    localOnly: "仅影响本次示例。",
    outside: "未加入语音",
    theme: "切换明暗主题",
    language: "Switch to English",
    scene: "场景",
    scenes: {
      listening: "在听",
      self: "自己发言",
      preparing: "AI 准备回答",
      agent: "AI 正在回答",
      peer: "同伴发言",
    },
    placeholder: "写一条示例消息…",
    send: "发送示例消息",
    intro: "我们一起设计一个社区小花园吧。",
    welcome: "一个小小的共享空间就是很好的开始。你希望大家在花园里做些什么？",
    self: "我想留一个安静的阅读角，再种些大家都能照料的香草。",
    answer:
      "可以先为阅读角留出树荫，再沿着阳光充足的一侧放几组香草种植箱。我们从小处开始，让花园和使用它的人一起慢慢成长。",
    peerText:
      "这个想法真好。也可以给孩子们留一小块地方，让他们播下自己的种子。",
    entryHint: "打开语音模式，体验这段示例。",
    agentRemoved: "向导已移出本次示例。",
  },
};

const segment = (
  id: string,
  kind: LiveSegment["kind"],
  name: string,
  text: string,
  phase: LiveSegment["phase"],
  interim = "",
): LiveSegment => ({ id, kind, who: kind, name, text, interim, phase });

/** A deterministic, entirely synthetic timeline. It does not consume audio or service events. */
export function sampleSnapshot(
  time: number,
  locale: Locale,
  muted: boolean,
  agentInRoom: boolean,
): VoiceSnapshot {
  const copy = words[locale];
  const t = Math.max(0, Math.min(DURATION, time));
  const live: LiveSegment[] = [];
  if (t > 0.8) {
    const speaking = t < 5.2 && !muted;
    const count = Math.round(copy.self.length * Math.min(1, (t - 0.8) / 4.4));
    live.push(
      segment(
        "sample-self",
        "self",
        copy.you,
        speaking ? "" : copy.self.slice(0, count),
        speaking ? "speaking" : "done",
        speaking ? copy.self.slice(0, count) : "",
      ),
    );
  }
  if (agentInRoom && t >= 5.2) {
    const phase = t < 7.5 ? "thinking" : t < 15.5 ? "speaking" : "done";
    live.push(
      segment(
        "sample-agent",
        "agent",
        copy.agent,
        phase === "thinking" ? "" : copy.answer,
        phase,
      ),
    );
  }
  if (t >= 16) {
    const speaking = t < 21;
    const count = Math.round(copy.peerText.length * Math.min(1, (t - 16) / 5));
    live.push(
      segment(
        "sample-peer",
        "peer",
        copy.peer,
        speaking ? "" : copy.peerText,
        speaking ? "speaking" : "done",
        speaking ? copy.peerText.slice(0, count) : "",
      ),
    );
  }
  return {
    conn: "normal",
    muted,
    live,
    startedAt: 0,
    members: [{ id: "peer", name: copy.peer, muted: false }],
    audible: t >= 16 && t < 21 ? ["peer"] : [],
    agents: agentInRoom ? ["agent"] : [],
  };
}

/** Illustrative loudness, not a microphone measurement. Reads the sample clock only. */
export function sampleLevel(time: number): number {
  return Math.max(
    0,
    Math.min(
      1,
      0.16 +
        Math.sin(time * 3.8) * 0.18 +
        Math.abs(Math.sin(time * 12.4)) * 0.45 +
        Math.sin(time * 1.7) * 0.12,
    ),
  );
}
