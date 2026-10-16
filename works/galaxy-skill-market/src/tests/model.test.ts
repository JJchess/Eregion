import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Color } from 'three';
import { categories, makeTree, skills } from '../app/data';
import { layoutLevel, motionValue, stepMotion } from '../app/model';
import { centralSurface, pearlAppearance, pearlInk } from '../app/appearance';
import { defaultAgent, normalizeNickname, parseAgent, readAgent, writeAgent } from '../app/agent';

test('every synthetic skill is reachable once, with non-overlapping pearls', () => {
  assert.equal(skills.length, 24);
  assert.equal(categories.length, 6);
  for (const kind of ['task', 'role'] as const) {
    const items = skills.filter(skill => skill.skill_type === kind);
    const tree = makeTree(items);
    const overview = layoutLevel(tree, null, 'en');
    assert.equal(overview.orbs.filter(orb => orb.kind === 'category').length, 6);
    const visited: string[] = [];
    for (const category of overview.categories) {
      const level = layoutLevel(tree, category.id, 'zh');
      visited.push(...level.orbs.filter(orb => orb.kind === 'skill').map(orb => orb.id));
      assert.equal(level.orbs.filter(orb => orb.role === 'center').length, 1);
      for (let a = 0; a < level.orbs.length; a++) for (let b = a + 1; b < level.orbs.length; b++) {
        const first = level.orbs[a], second = level.orbs[b];
        assert(Math.hypot(first.x - second.x, first.y - second.y) > first.r + second.r);
      }
    }
    assert.equal(new Set(visited).size, visited.length);
    assert.deepEqual(visited.sort(), items.map(skill => skill.skill_id).sort());
  }
});

test('spring motion is frame-rate independent and reduced motion settles immediately', () => {
  const results = [15, 30, 60, 120].map(fps => {
    const value = motionValue(-8);
    for (let frame = 0; frame < fps * .6; frame++) stepMotion(value, 12, 1 / fps);
    return value;
  });
  for (const result of results) {
    assert(Math.abs(result.value - results[0].value) < 1e-9);
    assert(Math.abs(result.velocity - results[0].velocity) < 1e-9);
  }
  const immediate = motionValue(-8);
  stepMotion(immediate, 12, 1 / 60, true);
  assert.deepEqual(immediate, { value: 12, velocity: 0 });
});

test('installation changes material without moving or recoloring unknown-state geometry', () => {
  const level = layoutLevel(makeTree(skills), 'math', 'en');
  const orb = level.orbs.find(item => item.kind === 'skill')!;
  const before = structuredClone(orb);
  const luminance = (color: Color) => color.r * .2126 + color.g * .7152 + color.b * .0722;
  for (const theme of ['light', 'dark'] as const) {
    const available = pearlAppearance(orb, 'available', theme);
    for (const state of ['installed', 'available', 'loading', 'unknown'] as const) {
      const appearance = pearlAppearance(orb, state, theme);
      if (state === 'loading' || state === 'unknown') assert.deepEqual(appearance, available);
      const surface = centralSurface(appearance.tones);
      const ink = new Color(pearlInk(surface));
      const contrast = (Math.max(luminance(surface), luminance(ink)) + .05) / (Math.min(luminance(surface), luminance(ink)) + .05);
      assert(contrast >= 4.5, `${theme}/${state} contrast ${contrast}`);
    }
  }
  assert.deepEqual(orb, before);
});

test('Agent validation and unavailable browser storage preserve safe local defaults', () => {
  assert.equal(normalizeNickname('   '), null);
  assert.equal(normalizeNickname('🙂'.repeat(12)), '🙂'.repeat(12));
  assert.equal(normalizeNickname('🙂'.repeat(13)), null);
  assert.deepEqual(parseAgent('{broken'), defaultAgent);
  assert.deepEqual(parseAgent(JSON.stringify({ nickname: 'Demo', avatar: { kind: 'pearl', palette: 'invalid' } })), { ...defaultAgent, nickname: 'Demo' });
  const denied = { getItem(): string | null { throw new Error('denied'); }, setItem(): void { throw new Error('denied'); } };
  assert.deepEqual(readAgent(denied, 'demo'), defaultAgent);
  assert.equal(writeAgent(denied, defaultAgent, 'demo'), false);
});
