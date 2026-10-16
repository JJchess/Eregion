import assert from "node:assert/strict";
import test from "node:test";
import type { ComponentProps } from "react";
import type { VoiceDock } from "../app/voice-mode";
import type { OrbSource } from "../app/live";
import { orbView } from "../app/live";
import {
  DURATION,
  SCENES,
  sampleLevel,
  sampleSourceOfSegment,
  sampleSnapshot,
  words,
} from "../app/sample";

// A property function (rather than a bivariant method signature) makes strictFunctionTypes
// catch the original wiring bug: source readers cannot accept arbitrary segment IDs.
const sourceOnly = (_source: OrbSource) => () => 0;
// @ts-expect-error A source-keyed callback is not the dock's segment-keyed contract.
const invalidDockReader: ComponentProps<typeof VoiceDock>["levelOf"] =
  sourceOnly;
void invalidDockReader;

test("the dock's actual speaker IDs resolve to live sample readers, with unknown IDs quiet", () => {
  for (const scene of ["self", "agent", "peer"] as const) {
    const view = orbView(sampleSnapshot(SCENES[scene], "en", false, true));
    assert(view.speaker);
    const source = sampleSourceOfSegment(view.speaker.id);
    assert.equal(source, view.source);
    const readers = {
      none: () => 0,
      mic: () => 0.3,
      agent: () => 0.5,
      peer: () => 0.7,
    };
    assert(
      readers[source]() > 0,
      "The original dock receives an actual loudness reader",
    );
  }
  for (const id of ["", "unknown", "mic", "agent", "peer", "constructor"])
    assert.equal(sampleSourceOfSegment(id), "none");
});

test("sample scenes and turn boundaries follow the documented conversation", () => {
  for (const locale of ["en", "zh"] as const) {
    const expected = {
      listening: ["listening", "none"],
      self: ["self", "mic"],
      preparing: ["preparing", "none"],
      agent: ["agent", "agent"],
      peer: ["peer", "peer"],
    };
    for (const [scene, time] of Object.entries(SCENES)) {
      const view = orbView(sampleSnapshot(time, locale, false, true));
      assert.deepEqual(
        [view.state, view.source],
        expected[scene as keyof typeof expected],
      );
    }
    for (const time of [-1, 0, 0.8, 15.5, 21, DURATION, DURATION + 5])
      assert.equal(
        orbView(sampleSnapshot(time, locale, false, true)).state,
        "listening",
      );
    assert.equal(
      orbView(sampleSnapshot(5.2, locale, false, true)).state,
      "preparing",
    );
    assert.equal(
      orbView(sampleSnapshot(7.5, locale, false, true)).state,
      "agent",
    );
    assert.equal(
      orbView(sampleSnapshot(16, locale, false, true)).state,
      "peer",
    );
  }
});

test("mute ends self speech while preserving agent and peer turns; removing the agent affects only its turn", () => {
  const mutedSelf = sampleSnapshot(SCENES.self, "en", true, true);
  assert.equal(
    mutedSelf.live.find((segment) => segment.kind === "self")?.phase,
    "done",
  );
  assert.deepEqual(orbView(mutedSelf), {
    state: "muted",
    speaker: null,
    source: "none",
  });
  assert.equal(
    orbView(sampleSnapshot(SCENES.agent, "en", true, true)).source,
    "agent",
  );
  assert.equal(
    orbView(sampleSnapshot(SCENES.peer, "en", true, true)).source,
    "peer",
  );
  const withoutAgent = sampleSnapshot(SCENES.agent, "en", false, false);
  assert.deepEqual(withoutAgent.agents, []);
  assert(!withoutAgent.live.some((segment) => segment.kind === "agent"));
  assert.equal(orbView(withoutAgent).state, "listening");
  assert.equal(
    orbView(sampleSnapshot(SCENES.peer, "en", false, false)).state,
    "peer",
  );
});

test("localized transcripts complete exactly once and are deterministic across replay", () => {
  for (const locale of ["en", "zh"] as const) {
    const done = sampleSnapshot(DURATION, locale, false, true);
    assert.equal(done.live.length, 3);
    assert.equal(new Set(done.live.map((segment) => segment.id)).size, 3);
    assert.deepEqual(
      done.live.map((segment) => segment.text),
      [words[locale].self, words[locale].answer, words[locale].peerText],
    );
    assert(
      done.live.every(
        (segment) => segment.phase === "done" && segment.interim === "",
      ),
    );
    assert.deepEqual(sampleSnapshot(0, locale, false, true).live, []);
    assert.deepEqual(sampleSnapshot(DURATION, locale, false, true), done);
  }
});

test("illustrative activity stays finite and in range throughout the sample", () => {
  const levels = [];
  for (let tick = 0; tick <= DURATION * 60; tick++) {
    const value = sampleLevel(tick / 60);
    assert(Number.isFinite(value) && value >= 0 && value <= 1);
    assert.equal(sampleLevel(tick / 60), value);
    levels.push(value);
  }
  assert(
    Math.max(...levels) - Math.min(...levels) > 0.4,
    "The sample has visible variation rather than a constant meter",
  );
});
