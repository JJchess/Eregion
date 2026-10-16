/** The user's own Agent at the centre of the skill galaxy. Stored locally until an account API exists. */

export type PaletteId = "moon" | "lavender" | "sakura" | "lake" | "amber" | "mint";
type Ramp = { shadow: string; body: string; pearl: string };
/** `deep` is the weightier ramp the skill map uses when the Agent anchors the centre. */
export type Palette = Ramp & { name: string; deep: Ramp };

/** Colour ramps for the voice room's satin fold material; "moon" is the voice room's own look. */
export const palettes: Record<PaletteId, Palette> = {
  moon: { name: "月白", shadow: "#8b98ad", body: "#c6cfde", pearl: "#e8edf5", deep: { shadow: "#1f2550", body: "#3d4a8c", pearl: "#7d8ccc" } },
  lavender: { name: "薰衣草", shadow: "#6a55b8", body: "#a995ea", pearl: "#ebe4ff", deep: { shadow: "#1d1570", body: "#3d2fc0", pearl: "#6f5cf0" } },
  sakura: { name: "樱粉", shadow: "#b05c88", body: "#eba3c8", pearl: "#fde6f1", deep: { shadow: "#6a0f3c", body: "#c22a72", pearl: "#ee6aa6" } },
  lake: { name: "湖蓝", shadow: "#3878a3", body: "#84c6ea", pearl: "#e2f4fc", deep: { shadow: "#08305e", body: "#1162c2", pearl: "#3fa0f0" } },
  amber: { name: "琥珀", shadow: "#a86d2c", body: "#ecba72", pearl: "#fdf0d8", deep: { shadow: "#6a2c06", body: "#c95e15", pearl: "#f0954a" } },
  mint: { name: "薄荷", shadow: "#33836f", body: "#8dd6c0", pearl: "#e3f8f1", deep: { shadow: "#053f33", body: "#11876b", pearl: "#3cc39e" } },
};

/**
 * Every avatar kind fills the same circular slot and has one renderer per kind.
 * Cartoon or anime art joins this union as
 * `{ kind: "image"; src; fit: "badge" | "cutout"; accent }` (see docs/skill-market-v2.md).
 */
export type AgentAvatar = { kind: "pearl"; palette: PaletteId };
export type AgentProfile = { nickname: string; avatar: AgentAvatar };
export type AvatarPreset = { id: string; group: string; name: string; avatar: AgentAvatar };

/** The picker renders one group per `group`; new kinds only add entries here. */
export const avatarPresets: AvatarPreset[] = (Object.keys(palettes) as PaletteId[]).map((id) => ({
  id,
  group: "珠光",
  name: palettes[id].name,
  avatar: { kind: "pearl", palette: id },
}));

/** Lavender gives the deep indigo centre the reference is built around. */
export const defaultAgent: AgentProfile = { nickname: "My Agent", avatar: { kind: "pearl", palette: "lavender" } };
export const agentStorageKey = "portfolio-galaxy-agent";
export const nicknameLimit = 12;

export function normalizeNickname(value: string) {
  const nickname = value.trim();
  return nickname && [...nickname].length <= nicknameLimit ? nickname : null;
}

function parseAvatar(value: unknown): AgentAvatar | null {
  if (!value || typeof value !== "object") return null;
  const avatar = value as Record<string, unknown>;
  if (avatar.kind === "pearl" && Object.keys(palettes).includes(avatar.palette as string)) {
    return { kind: "pearl", palette: avatar.palette as PaletteId };
  }
  return null;
}

/** Each field falls back on its own, so a bad palette never costs the user their nickname. */
export function parseAgent(value: string | null): AgentProfile {
  let data: unknown = null;
  try {
    data = value === null ? null : JSON.parse(value);
  } catch {
    // Corrupt storage reads as the default profile.
  }
  const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  return {
    nickname: (typeof record.nickname === "string" && normalizeNickname(record.nickname)) || defaultAgent.nickname,
    avatar: parseAvatar(record.avatar) ?? defaultAgent.avatar,
  };
}

type Store = Pick<Storage, "getItem" | "setItem"> | null;

export function readAgent(storage: Store, account: string) {
  try {
    return parseAgent(storage?.getItem(`${agentStorageKey}:${account}`) ?? null);
  } catch {
    return defaultAgent;
  }
}

export function writeAgent(storage: Store, profile: AgentProfile, account: string) {
  if (!storage) return false;
  try {
    storage.setItem(`${agentStorageKey}:${account}`, JSON.stringify(profile));
    return true;
  } catch {
    return false;
  }
}

/** Accent colour that tints the tray glow and the Agent's label. */
export function avatarAccent(avatar: AgentAvatar) {
  switch (avatar.kind) {
    case "pearl":
      return palettes[avatar.palette].deep.body;
  }
}

export function browserStorage(): Store {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}
