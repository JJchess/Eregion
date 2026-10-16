import {
  displayName,
  type HistoryPoint,
  type SkillSummary,
  type SkillTreeNode,
  type SkillTreeResponse,
  type SkillUsage,
} from "./contract";

/** Saturated families taken from the reference: indigo, magenta pink, periwinkle, azure, coral. */
const colors: Record<string, string> = {
  math: "#5b49e3",
  science: "#e2448f",
  language: "#ec5fa8",
  code: "#1f84ec",
  humanities: "#7c69f2",
  art: "#f0628f",
  learning: "#ef7d32",
  persona: "#4a3bd6",
  __uncategorized__: "#8e8fb0",
};
const palette = ["#5b49e3", "#e2448f", "#1f84ec", "#7c69f2", "#ef7d32"];
/** Skills take the family of what they do, so a category's ring mixes colours as the reference does. */
const functionColors: Record<string, string> = { explain: "#7c69f2", analyze: "#e2448f", create: "#1f84ec", practice: "#ef7d32", plan: "#f0628f" };

export function hash(value: string) {
  let n = 0;
  for (let i = 0; i < value.length; i++) n = (n * 31 + value.charCodeAt(i)) >>> 0;
  return n;
}
export function colorFor(id: string) {
  if (id.startsWith("persona/")) id = id.slice("persona/".length);
  return colors[id] ?? palette[hash(id) % palette.length];
}
/** Roles are coloured by the subject they speak to, tools by what they do (falling back to their subject). */
export function skillColor(skill: SkillSummary) {
  const group = skill.structured_summary?.subject?.[0], use = skill.structured_summary?.function?.[0];
  if (group === "persona") return colorFor(use ?? "persona");
  return (use && functionColors[use]) || colorFor(group ?? "__uncategorized__");
}

export function collectSkills(node: SkillTreeNode): SkillSummary[] {
  const map = new Map((node.skills ?? []).map((s) => [s.skill_id, s]));
  for (const child of Object.values(node.children ?? {})) for (const s of collectSkills(child)) map.set(s.skill_id, s);
  return [...map.values()];
}
export function filterTree(tree: SkillTreeResponse, ids: ReadonlySet<string>): SkillTreeResponse {
  const walk = (node: SkillTreeNode): SkillTreeNode => {
    const children = Object.fromEntries(
      Object.entries(node.children ?? {})
        .map(([key, value]) => [key, walk(value)] as const)
        .filter(([, child]) => child.count > 0),
    );
    const result = { ...node, children, skills: node.skills?.filter((s) => ids.has(s.skill_id)) };
    return { ...result, count: collectSkills(result).length };
  };
  return {
    tree: Object.fromEntries(
      Object.entries(tree.tree)
        .map(([id, node]) => [id, walk(node)] as const)
        .filter(([, node]) => node.count > 0),
    ),
    uncategorized: walk(tree.uncategorized),
  };
}

export type Role = "center" | "ring";
export type Orb = {
  /** `${kind}:${id}`, stable across levels so the same pearl can move between them. */
  key: string;
  id: string;
  kind: "agent" | "category" | "skill";
  role: Role;
  x: number;
  y: number;
  r: number;
  color: string;
  label: string;
  /** Categories: number of skills. Skills: cumulative adoption. */
  count: number;
  /** The owning category (itself for categories, null for the Agent). */
  category: string | null;
  skill?: SkillSummary;
};
export type Category = { id: string; label: string; color: string; count: number; skills: SkillSummary[] };
/** Category navigation comes from the full source/type catalog, before refinements. */
export function catalogCategories(tree: SkillTreeResponse, locale: "zh" | "en" = "zh"): Category[] {
  const groups = Object.entries(tree.tree);
  if (tree.uncategorized.count) groups.push(["__uncategorized__", tree.uncategorized]);
  return groups
    .map(([id, node]) => {
      const skills = collectSkills(node).sort((a, b) => (b.install_count ?? 0) - (a.install_count ?? 0) || a.skill_id.localeCompare(b.skill_id));
      return { id, label: (locale === "en" ? node.label_en || node.label_zh : node.label_zh || node.label_en) || id, color: id === "__uncategorized__" ? "#7661d9" : colorFor(id), count: skills.length, skills };
    })
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}
/** `extent` is the half width / half height that holds every orb; `tray` is the radius of the white disc. */
export type Level = { focus: string | null; orbs: Orb[]; categories: Category[]; tray: number; extent: { x: number; y: number } };

// World units; the camera turns them into pixels. Proportions are measured from the reference frame (tray radius T).
const CENTER_R = 1.3;
/** Reference: the centre is about 0.39 of the tray radius. */
const CENTER_SHARE = 0.39;
/** Breathing room between neighbours, as in the reference (0.15–0.35 of the centre radius). */
const ROOM = 0.18 * CENTER_R;
/** Inner-ring pearls cover about this share of the annulus between the centre and the tray edge. */
const FILL = 0.42;


type Circle = { x: number; y: number; r: number };
const clearance = (c: Circle, placed: Circle[]) => Math.min(Infinity, ...placed.map((p) => Math.hypot(c.x - p.x, c.y - p.y) - c.r - p.r));

/** mulberry32: a small seeded PRNG, so a level always lays out the same way. */
function seeded(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), t | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Best-candidate placement (Mitchell's algorithm): each circle, largest first, samples spots in its region and
 * keeps the one with the most room around it, as long as that room is at least `room`. Capping the score
 * keeps pearls from all fleeing to the rim, so the result is even but irregular, like the reference.
 * When a region is full it widens (`grow`), so no pearl is ever dropped.
 */
function scatterInto(
  radii: number[],
  placed: Circle[],
  region: (r: number, grow: number, rand: () => number) => { x: number; y: number },
  room: number,
  cap: number,
  rand: () => number,
) {
  return radii.map((r) => {
    for (let grow = 0; ; grow++) {
      let best: Circle | null = null, score = -Infinity;
      for (let i = 0; i < 96; i++) {
        const c = { ...region(r, grow, rand), r };
        const space = clearance(c, placed);
        if (space >= room && Math.min(space, cap) > score) [best, score] = [c, Math.min(space, cap)];
      }
      if (best) {
        placed.push(best);
        return best;
      }
    }
  });
}

/** A random point on a ring between two distances from the origin, stretched by `sx`/`sy`. */
const ringPoint = (rand: () => number, min: number, max: number, sx = 1, sy = 1) => {
  const a = rand() * Math.PI * 2, d = min + Math.sqrt(rand()) * Math.max(0, max - min);
  return { x: Math.cos(a) * d * sx, y: Math.sin(a) * d * sy };
};

const share = (value: number, max: number) => Math.sqrt(Math.max(0, value) / Math.max(1, max));

/** Overview contains the Agent and categories; a category contains only its own skills. */
export function layoutLevel(tree: SkillTreeResponse, focus: string | null, locale: "zh" | "en" = "zh"): Level {
  const categories = catalogCategories(tree, locale);
  const current = categories.find((c) => c.id === focus) ?? null;
  const maxCount = Math.max(1, ...categories.map((c) => c.count));
  const skillOrb = (s: SkillSummary, role: Role, circle: Circle, category: string): Orb => ({
    key: `skill:${s.skill_id}`, id: s.skill_id, kind: "skill", role, ...circle, color: categories.find((c) => c.id === category)!.color, label: displayName(s, locale), count: s.install_count ?? 0, category, skill: s,
  });
  const categoryOrb = (c: Category, role: Role, circle: Circle): Orb => ({ key: `category:${c.id}`, id: c.id, kind: "category", role, ...circle, color: c.color, label: c.label, count: c.count, category: c.id });
  const agentOrb = (role: Role, circle: Circle): Orb => ({ key: "agent:agent", id: "agent", kind: "agent", role, ...circle, color: "#5a4ae0", label: "", count: 0, category: null });
  const center: Circle = { x: 0, y: 0, r: CENTER_R };
  const orbs: Orb[] = [current ? categoryOrb(current, "center", center) : agentOrb("center", center)];

  // Inner ring: radius by weight, clamped to the reference's 0.24–0.7 of the centre.
  const ring: { make: (c: Circle) => Orb; key: string; r: number }[] = current
    ? (() => {
        const local = Math.max(1, ...current.skills.map((s) => s.install_count ?? 0));
        return current.skills.map((s) => ({ key: `skill:${s.skill_id}`, r: CENTER_R * Math.max(0.32, 0.75 * share(s.install_count ?? 0, local)), make: (c: Circle) => skillOrb(s, "ring", c, current.id) }));
      })()
    : categories.map((c) => ({ key: `category:${c.id}`, r: CENTER_R * Math.max(0.32, 0.75 * share(c.count, maxCount)), make: (circle: Circle) => categoryOrb(c, "ring", circle) }));
  const rmax = Math.max(0, ...ring.map((o) => o.r));
  const area = ring.reduce((n, o) => n + o.r * o.r, 0);
  const tray = Math.max(CENTER_R / CENTER_SHARE, CENTER_R + ROOM + 1.9 * rmax, Math.sqrt(area / FILL + CENTER_R * CENTER_R));
  const rand = seeded(hash([current?.id ?? "root", ...ring.map((o) => o.key)].join("|")));
  const placed: Circle[] = [center];
  // Large pearls stay on the tray; smaller ones may sit across its edge, as the reference's do.
  const ringCircles = scatterInto(
    ring.map((o) => o.r),
    placed,
    (r, grow, random) => ringPoint(random, CENTER_R + ROOM + r, (r < 0.45 * CENTER_R ? tray * 1.04 : tray - 0.9 * r) + grow * 0.2),
    ROOM,
    ROOM * 2.6,
    rand,
  );
  ring.forEach((o, i) => orbs.push(o.make(ringCircles[i])));

  const extent = {
    x: Math.max(tray, ...orbs.map((o) => Math.abs(o.x) + o.r)) + 0.3,
    y: Math.max(tray, ...orbs.map((o) => Math.abs(o.y) + o.r)) + 0.3,
  };
  return { focus: current?.id ?? null, orbs, categories, tray, extent };
}

/** CSS pixel dimensions, measured independently of the camera and pearl animation. */
export type LabelSize = { width: number; height: number };
export const LABEL_GAP = 4;
const LABEL_CLEARANCE = 6;
type Footprint = { left: number; right: number; bottom: number; top: number };

/**
 * A conservative envelope around the sphere and its centered caption. At larger zooms the
 * pixel-sized caption occupies less world space, so this envelope stays safe without repacking.
 * Reserve the whole 56–60px crossfade band and the 5% hover enlargement in advance.
 */
function labelFootprint(orb: Orb, size: LabelSize | undefined, zoom: number): Footprint {
  const outside = orb.r * 2 * zoom <= 60;
  const r = orb.r * 1.05;
  const width = outside ? (size?.width ?? 140) / zoom : 0;
  const tail = outside ? (LABEL_GAP + (size?.height ?? 18)) / zoom : 0;
  const half = Math.max(r, width / 2);
  const padding = LABEL_CLEARANCE / 2 / zoom;
  return { left: orb.x - half - padding, right: orb.x + half + padding, bottom: orb.y - r - tail - padding, top: orb.y + r + padding };
}

const footprintsOverlap = (a: Footprint, b: Footprint) =>
  a.left < b.right && a.right > b.left && a.bottom < b.top && a.top > b.bottom;

/**
 * Keep the existing composition, radius weights and identities, but place each sphere and label
 * together. The center never moves. Stable seeded candidates prefer the original location;
 * crowded levels can grow instead of dropping labels or reducing their font size.
 */
export function layoutLabeledLevel(level: Level, labels: ReadonlyMap<string, LabelSize>, minZoom: number): Level {
  const zoom = Math.max(0.01, minZoom);
  const placed: Footprint[] = [];
  const resolved = new Map<string, Orb>();
  const rank = { center: 0, ring: 1 };
  const ordered = [...level.orbs].sort((a, b) => rank[a.role] - rank[b.role] || b.r - a.r || a.key.localeCompare(b.key));
  for (const orb of ordered) {
    const size = labels.get(orb.key);
    const footprint = (candidate: Orb) => labelFootprint(candidate, size, zoom);
    const free = (candidate: Orb) => {
      const box = footprint(candidate);
      return placed.every(other => !footprintsOverlap(box, other));
    };
    let next = orb;
    if (orb.role !== "center" && !free(orb)) {
      const rand = seeded(hash(`${level.focus ?? "root"}|label|${orb.key}`));
      const step = Math.max(0.12, Math.min(orb.r, (size?.width ?? 140) / (2 * zoom)) * 0.5);
      let found: Orb | null = null;
      for (let grow = 1; grow <= 128 && !found; grow++) {
        let distance = Infinity;
        for (let sample = 0; sample < 64; sample++) {
          const angle = rand() * Math.PI * 2;
          const radius = step * (grow - 0.5 + rand() * 0.5);
          const candidate = { ...orb, x: orb.x + Math.cos(angle) * radius, y: orb.y + Math.sin(angle) * radius };
          if (radius < distance && free(candidate)) { found = candidate; distance = radius; }
        }
      }
      // Bounded search with a guaranteed free slot, even for exceptionally large catalogs.
      if (!found) {
        const box = footprint(orb);
        const edge = Math.max(level.tray * 0.97 + orb.r, ...placed.map(p => p.right));
        found = { ...orb, x: edge + (orb.x - box.left) + LABEL_CLEARANCE / zoom };
      }
      next = found;
    }
    placed.push(footprint(next));
    resolved.set(orb.key, next);
  }
  return {
    ...level,
    orbs: level.orbs.map(orb => resolved.get(orb.key)!),
    extent: {
      x: Math.max(level.tray, ...placed.flatMap(p => [Math.abs(p.left), Math.abs(p.right)])),
      y: Math.max(level.tray, ...placed.flatMap(p => [Math.abs(p.bottom), Math.abs(p.top)])),
    },
  };
}

export type View = { x: number; y: number; zoom: number };
export type MotionValue = { value: number; velocity: number };
export const motionValue = (value: number): MotionValue => ({ value, velocity: 0 });

/**
 * Exact critically damped motion: 99.8% of a resting step in 600ms, independent of frame rate.
 * Retargeting preserves both position and velocity. Only snap below a caller's visual tolerance.
 * Mutates a ref-owned value to avoid allocating or rendering React state on every frame.
 */
export function stepMotion(state: MotionValue, target: number, dt: number, reduced = false, epsilon = 0.0001): boolean {
  const omega = 14;
  if (reduced) {
    state.value = target;
    state.velocity = 0;
    return false;
  }
  if (dt > 0 && Number.isFinite(dt)) {
    const offset = state.value - target;
    const c = state.velocity + omega * offset;
    const decay = Math.exp(-omega * dt);
    state.value = target + (offset + c * dt) * decay;
    state.velocity = (state.velocity - omega * c * dt) * decay;
  }
  if (Math.abs(state.value - target) <= epsilon && Math.abs(state.velocity) <= epsilon * omega) {
    state.value = target;
    state.velocity = 0;
    return false;
  }
  return true;
}

export type SceneOrb = { orb: Orb; leaving: boolean };
/** Reconcile before committing children, so an exiting key is never unmounted and re-created. */
export function reconcileOrbs(previous: readonly SceneOrb[], next: readonly Orb[], reduced = false): SceneOrb[] {
  const remaining = new Map(next.map((orb) => [orb.key, orb]));
  // Keep mounted order too: moving an R3F subtree reapplies its declarative initial props.
  const retained = previous.flatMap((entry) => {
    const orb = remaining.get(entry.orb.key);
    if (orb) {
      remaining.delete(orb.key);
      return [{ orb, leaving: false }];
    }
    return reduced ? [] : [{ orb: entry.orb, leaving: true }];
  });
  return [
    ...retained,
    ...Array.from(remaining.values(), (orb) => ({ orb, leaving: false })),
  ];
}

export function summarize(items: SkillSummary[]) {
  const unique = [...new Map(items.map((s) => [s.skill_id, s])).values()];
  const measured = unique.filter((s) => s.usage && s.usage.calls > 0);
  const calls = measured.reduce((n, s) => n + s.usage!.calls, 0);
  const successes = measured.reduce((n, s) => n + s.usage!.successes, 0);
  return {
    count: unique.length,
    calls,
    rate: calls ? successes / calls : null,
    installs: unique.reduce((n, s) => n + (s.install_count ?? 0), 0),
    measured: measured.length,
  };
}
export function historyWindow(history: HistoryPoint[] | null | undefined, range: "month" | "quarter" | "year" | "all") {
  const valid = [
    ...new Map(
      (history ?? []).filter((p) => Number.isFinite(Date.parse(p.date)) && Number.isFinite(p.count) && p.count >= 0).map((p) => [p.date, p]),
    ).values(),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const end = valid.at(-1);
  if (!end) return { points: [], growth: null };
  const days = { month: 30, quarter: 90, year: 365, all: Infinity }[range];
  const cutoff = Date.parse(end.date) - days * 86400000;
  const points = valid.filter((p) => Date.parse(p.date) >= cutoff);
  const covered = range === "all" || Date.parse(valid[0].date) <= cutoff;
  return { points, growth: covered && points.length >= 2 ? points.at(-1)!.count - points[0].count : null };
}

const compacts = { zh: new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }), en: new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }) };
/** The one format for counts; only a chart's headline value uses `fullNumber`. */
export const shortNumber = (n: number, locale: "zh" | "en" = "zh") => Number.isFinite(n) ? compacts[locale].format(n) : "—";
export const fullNumber = (n: number, locale: "zh" | "en" = "zh") => Number.isFinite(n) ? new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en").format(n) : "—";
export const percent = (rate: number | null) => (rate === null ? "—" : `${(rate * 100).toFixed(1)}%`);
/** Success rate is successes over calls, never an average of percentages. */
export const successRate = (usage: SkillUsage | null | undefined) => (usage?.calls ? usage.successes / usage.calls : null);
