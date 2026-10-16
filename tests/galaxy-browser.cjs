/* Run against a built Galaxy demo using an already running official Chrome.
 * PLAYWRIGHT_MODULE=/path/to/playwright CDP_PORT=9224 node tests/galaxy-browser.cjs
 * GALAXY_DEMO_URL may point to the deployed demo; no API or account is needed.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const target = new URL(process.env.GALAXY_DEMO_URL || "http://127.0.0.1:4179/portfolio/demos/galaxy-skill-market/");
assert(["http:", "https:"].includes(target.protocol) && !target.username && !target.password, "Expected a public HTTP(S) demo URL without credentials");
const artifacts = process.env.PORTFOLIO_ARTIFACTS || fs.mkdtempSync(path.join(os.tmpdir(), "galaxy-review-"));
fs.mkdirSync(artifacts, { recursive: true });
const contexts = [], pages = [], checks = [], errors = [], unexpectedRequests = [], failedResources = [];
let activePage, browserVersion;

function pass(message) { checks.push(message); console.log("PASS", message); }

async function ownPage(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
  contexts.push(context);
  const page = await context.newPage();
  pages.push(page);
  activePage = page;
  page.setDefaultTimeout(15000);
  const requests = [];
  page.on("request", request => {
    const value = request.url();
    requests.push({ url: value, type: request.resourceType() });
    const url = new URL(value);
    if (["http:", "https:"].includes(url.protocol) &&
        (url.origin !== target.origin || /\/(?:api|graphql)(?:\/|$)/i.test(url.pathname)))
      unexpectedRequests.push({ url: value, type: request.resourceType() });
  });
  page.on("response", response => {
    if (response.status() >= 400) failedResources.push({ url: response.url(), status: response.status() });
  });
  page.on("pageerror", error => errors.push({ url: page.url(), message: error.message }));
  await page.bringToFront();
  return { page, requests };
}

async function noOverflow(page) {
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  assert(result.content <= result.width + 1, `Horizontal overflow: ${JSON.stringify(result)}`);
}

async function boundaries(page) {
  const violations = await page.evaluate(() => [...document.querySelectorAll("*")].filter(node => {
    const style = getComputedStyle(node);
    const scrolls = /(auto|scroll)/.test(style.overflowX + style.overflowY);
    return (node === document.documentElement || node === document.body || scrolls || node.matches("input,textarea")) &&
      (style.overscrollBehaviorX !== "none" || style.overscrollBehaviorY !== "none");
  }).map(node => node.tagName.toLowerCase() + (typeof node.className === "string" && node.className ? "." + node.className.trim().split(/\s+/).join(".") : "")));
  assert.deepEqual(violations, [], "All root, nested and input scroll boundaries must suppress overscroll");
}

function report(status, error) {
  fs.writeFileSync(path.join(artifacts, "galaxy-report.json"), JSON.stringify({
    status, target: target.href, chrome: browserVersion, checks, errors,
    unexpectedRequests, failedResources, error: error?.stack,
    limits: ["Native physical phone/trackpad elasticity and hardware frame rates were not tested."],
  }, null, 2) + "\n");
}

async function testMapControls(page) {
  const canvas = page.locator(".sk-galaxy canvas");
  await canvas.waitFor({ state: "visible", timeout: 45000 });
  const category = page.locator('[data-orb-key="category:math"][data-leaving="false"]');
  await category.waitFor({ state: "visible" });
  await settledMap(page);
  const before = await mapView(page);
  const bounds = await canvas.boundingBox();
  await page.mouse.move(bounds.x + bounds.width * 0.85, bounds.y + bounds.height * 0.85);
  await page.mouse.wheel(0, -240);
  await page.waitForFunction(zoom => Number(document.querySelector('.sk-galaxy')?.dataset.view?.split(',')[2]) > zoom, before[2]);
  await settledMap(page);
  const zoomed = await mapView(page);
  await page.mouse.move(bounds.x + bounds.width * 0.84, bounds.y + bounds.height * 0.83);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.94, bounds.y + bounds.height * 0.92, { steps: 10 });
  await page.mouse.up();
  await settledMap(page);
  const panned = await mapView(page);
  assert(Math.hypot(panned[0] - zoomed[0], panned[1] - zoomed[1]) > 0.01, "Dragging empty space should pan the map");
  await page.locator(".sk-recenter").click();
  await settledMap(page);
  const restored = await mapView(page);
  assert(Math.abs(restored[2] - before[2]) < 0.2 && Math.hypot(restored[0] - before[0], restored[1] - before[1]) < 0.05, "Reset view should restore the original framing");
  pass("Desktop map wheel zoom, empty-space pan and recenter");
}

async function mapView(page) {
  return (await page.locator('.sk-galaxy').getAttribute('data-view')).split(',').map(Number);
}

async function settledMap(page) {
  // Give a just-dispatched input a chance to start its demand-rendered motion.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => {
    const scene = document.querySelector('.sk-galaxy');
    return scene?.dataset.view && scene.dataset.moving === 'false' && scene.dataset.morphing === 'false';
  }, null, { timeout: 45000 });
  // Let a final label measurement or React commit invalidate one more frame.
  await page.waitForTimeout(100);
  await page.waitForFunction(() => {
    const scene = document.querySelector('.sk-galaxy');
    return scene?.dataset.moving === 'false' && scene.dataset.morphing === 'false';
  }, null, { timeout: 45000 });
}

async function openPanel(page, kind) {
  await page.waitForFunction(kind => {
    const panel = document.querySelector(`[data-panel-kind="${kind}"]`);
    return panel && !panel.inert && panel.dataset.panelState === 'open';
  }, kind);
  return page.locator(`[data-panel-kind="${kind}"]`);
}

async function closedPanel(page) {
  await page.waitForFunction(() => !document.querySelector('[data-panel-kind]') &&
    document.querySelector('.sk-sidebar')?.dataset.contentPhase === 'open');
}

async function load(page) {
  assert.equal((await page.goto(target.href, { waitUntil: 'domcontentloaded' })).status(), 200);
  await page.locator('.demo-shell').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  await page.evaluate(() => document.fonts.ready);
}

async function toggleInstallation(page, id, touch = false) {
  const panel = await openPanel(page, 'skill');
  const button = panel.locator(`[data-install-skill="${id}"]`);
  const previous = await button.getAttribute('aria-pressed');
  if (touch) await button.tap(); else await button.click();
  await page.waitForFunction(({ id, previous }) => document.querySelector(`[data-install-skill="${id}"]`)?.getAttribute('aria-pressed') !== previous, { id, previous });
  assert.equal(await button.getAttribute('aria-pressed'), String(previous !== 'true'));
  return previous !== 'true';
}

async function clickOrb(page, locator) {
  // The accessible HTML label has pointer-events:none. Real pointer input is
  // received by the canvas and raycast against the sphere beneath that label.
  await locator.waitFor({ state: 'visible' });
  await settledMap(page);
  let previous, stable = 0;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const box = await locator.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      const unchanged = previous && ['x', 'y', 'width', 'height'].every(key => Math.abs(box[key] - previous[key]) <= 0.5);
      stable = unchanged ? stable + 1 : 0;
      if (stable >= 2) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        return;
      }
      previous = box;
    }
    await page.waitForTimeout(50);
  }
  assert.fail('Sphere label did not settle enough for a real pointer click');
}

async function main() {
  try {
    const port = Number(process.env.CDP_PORT || 9224);
    assert(Number.isInteger(port) && port > 0 && port <= 65535, 'Invalid CDP_PORT');
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    browserVersion = browser.version();
    const { page } = await ownPage(browser);
    await load(page);
    await page.locator('.sk-galaxy canvas').waitFor({ state: 'visible', timeout: 45000 });
    await settledMap(page);
    await noOverflow(page);
    await boundaries(page);
    await page.screenshot({ path: path.join(artifacts, 'galaxy-desktop.png') });
    await testMapControls(page);

    const category = page.locator('[data-orb-key="category:math"][data-leaving="false"]');
    await clickOrb(page, category);
    await page.waitForURL(url => url.searchParams.get('category') === 'math');
    await settledMap(page);
    await clickOrb(page, page.locator('[data-orb-key="skill:proof"][data-leaving="false"]'));
    const detail = await openPanel(page, 'skill');
    assert.equal(await detail.locator('h3').innerText(), 'Proof builder');
    assert.equal(await detail.locator('[data-install-skill="proof"]').getAttribute('aria-pressed'), 'false');
    assert.equal(await toggleInstallation(page, 'proof'), true);
    assert.equal(await page.locator('[data-orb-key="skill:proof"][data-leaving="false"]').getAttribute('data-installation'), 'installed');
    assert.equal(await toggleInstallation(page, 'proof'), false);
    assert.equal(await toggleInstallation(page, 'proof'), true);
    await detail.locator('[data-close-panel]').click();
    await closedPanel(page);
    assert.equal(new URL(page.url()).searchParams.get('skill'), null);
    await category.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(url => !url.searchParams.has('category'));
    await settledMap(page);
    pass('Pointer category/skill selection, installation/removal and keyboard return to overview');

    const agentButton = page.locator('[data-agent-trigger]:visible');
    await agentButton.click();
    let agent = await openPanel(page, 'agent');
    const originalName = await agent.getByRole('textbox', { name: 'Nickname', exact: true }).inputValue();
    await agent.getByRole('textbox', { name: 'Nickname', exact: true }).fill('Discard me');
    await agent.getByRole('radio', { name: 'Lake', exact: true }).check();
    await agent.locator('[data-close-panel]').click();
    await closedPanel(page);
    await agentButton.click();
    agent = await openPanel(page, 'agent');
    assert.equal(await agent.getByRole('textbox', { name: 'Nickname', exact: true }).inputValue(), originalName);
    assert.equal(await agent.getByRole('radio', { name: 'Lake', exact: true }).isChecked(), false);
    await agent.getByRole('textbox', { name: 'Nickname', exact: true }).fill('Orbit Nova');
    await agent.getByRole('radio', { name: 'Lake', exact: true }).check();
    await agent.locator('[data-save-agent]').click();
    await closedPanel(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('[data-agent-trigger]:visible').click();
    agent = await openPanel(page, 'agent');
    assert.equal(await agent.getByRole('textbox', { name: 'Nickname', exact: true }).inputValue(), 'Orbit Nova');
    assert(await agent.getByRole('radio', { name: 'Lake', exact: true }).isChecked());
    await agent.locator('[data-close-panel]').click();
    await closedPanel(page);
    pass('Agent cancel discards edits; save retains nickname and palette after refresh');

    const search = page.getByRole('searchbox');
    await search.fill('zz-no-matching-skill-8372');
    await page.locator('.sk-empty').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.demo-skill-row').count(), 0);
    await search.fill('Geometry');
    await page.locator('.demo-skill-row[data-skill="geometry"]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.demo-skill-row').count(), 1);
    await page.locator('[data-locale-toggle]').click();
    await page.waitForFunction(() => document.documentElement.lang === 'zh-CN');
    assert.equal(await page.locator('.demo-skill-row strong').innerText(), '几何视角');
    await page.locator('[data-theme-toggle]').click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.locator('[data-locale-toggle]').click();
    await page.waitForFunction(() => document.documentElement.lang === 'en');
    assert.equal(await page.locator('.demo-skill-row strong').innerText(), 'Geometry lens');
    await page.locator('[data-theme-toggle]').click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await search.fill('');
    await settledMap(page);
    pass('Search empty/result states, English/Chinese content and light/dark theme');

    // Return immediately, while the map is still changing levels.
    for (let i = 0; i < 3; i++) {
      await page.locator('.sk-body.is-ring[data-orb-key="category:math"][data-leaving="false"]').focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(url => url.searchParams.get('category') === 'math');
      await page.locator('.market-header h1 button').click();
      await page.waitForURL(url => !url.searchParams.has('category'));
    }
    await settledMap(page);
    const keys = await page.locator('[data-orb-key][data-leaving="false"]').evaluateAll(nodes => nodes.map(node => node.dataset.orbKey));
    assert.equal(keys.length, new Set(keys).size, 'Rapid drilldown should not duplicate live nodes');
    assert.equal(await page.locator('[data-orb-key][data-leaving="true"]').count(), 0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await clickOrb(page, category);
    await settledMap(page);
    await clickOrb(page, page.locator('[data-orb-key="skill:proof"][data-leaving="false"]'));
    const reducedDetail = await openPanel(page, 'skill');
    assert.equal(await reducedDetail.locator('[data-install-skill="proof"]').getAttribute('aria-pressed'), 'true', 'Installation should also survive refresh');
    await page.keyboard.press('Escape');
    await closedPanel(page);
    pass('Rapid drilldown returns without duplicate/leaving nodes; reduced-motion details and Escape remain usable');

    for (const width of [390, 320]) {
      const { page: mobile, requests } = await ownPage(browser, {
        viewport: { width, height: 844 }, isMobile: true, hasTouch: true,
        deviceScaleFactor: 1, reducedMotion: 'reduce',
      });
      await load(mobile);
      await mobile.locator('[data-mobile-list]').waitFor({ state: 'visible' });
      assert.equal(await mobile.locator('canvas').count(), 0);
      await mobile.getByRole('combobox', { name: 'Any category', exact: true }).selectOption('math');
      const row = mobile.locator('[data-mobile-list] [data-skill="proof"]');
      await row.tap();
      const dialog = await openPanel(mobile, 'skill');
      assert.equal(await dialog.getAttribute('role'), 'dialog');
      assert.equal(await dialog.getAttribute('aria-modal'), 'true');
      await toggleInstallation(mobile, 'proof', true);
      await noOverflow(mobile);
      await boundaries(mobile);
      await dialog.locator('[data-close-panel]').tap();
      await closedPanel(mobile);
      assert(await row.isVisible());
      assert.equal(await mobile.locator('main').evaluate(node => node.inert), false);
      await noOverflow(mobile);
      await mobile.screenshot({ path: path.join(artifacts, `galaxy-${width}.png`) });
      assert.deepEqual(requests.filter(request => /\/(?:universe|three|fiber)[^/]*\.js(?:$|\?)/i.test(new URL(request.url).pathname)), [], `${width}px list must not download the desktop 3D chunk`);
      await mobile.context().close();
      pass(`${width}px responsive list, touch detail/install/back, no overflow and no 3D download`);
    }

    const { page: fallback } = await ownPage(browser, { reducedMotion: 'reduce' });
    await fallback.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        return /webgl/i.test(type) ? null : original.call(this, type, ...args);
      };
    });
    await load(fallback);
    await fallback.locator('.sk-scene-fallback').waitFor({ state: 'visible', timeout: 45000 });
    await fallback.locator('.sk-scene-fallback [data-orb-key="category:math"]').click();
    await fallback.locator('.sk-scene-fallback [data-skill="proof"]').click();
    await toggleInstallation(fallback, 'proof');
    await fallback.locator('[data-close-panel]').click();
    await closedPanel(fallback);
    await fallback.locator('.sk-fallback-context').click();
    assert.equal(new URL(fallback.url()).searchParams.get('category'), null);
    await boundaries(fallback);
    await noOverflow(fallback);
    await fallback.screenshot({ path: path.join(artifacts, 'galaxy-webgl-fallback.png') });
    pass('Unavailable WebGL retains category, detail, installation and return flows');

    assert.deepEqual(errors, [], 'Unexpected uncaught browser exceptions');
    assert.deepEqual(unexpectedRequests, [], 'Demo must not request business APIs or remote assets');
    assert.deepEqual(failedResources, [], 'All requested demo assets must load');
    pass('No business API/remote assets, no failed HTTP resources and no uncaught exceptions');
    report('passed');
    console.log('Chrome:', browserVersion);
    console.log('Artifacts:', artifacts);
  } catch (error) {
    if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: path.join(artifacts, 'galaxy-failure.png'), timeout: 3000 }).catch(() => {});
    report('failed', error);
    throw error;
  } finally {
    for (const page of pages.reverse()) if (!page.isClosed()) await page.close().catch(() => {});
    for (const context of contexts.reverse()) await context.close().catch(() => {});
    // Do not close the shared Chrome. Process exit disconnects this CDP client.
  }
}

main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
