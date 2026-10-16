/* Attach to an already running official Chrome; never launch or close it.
 * CDP_PORT=9224 PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser.cjs
 * Both HTTP servers and synthetic works exist only for this test process.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { execFileSync, spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "jj-portfolio-browser-"));
const artifacts = process.env.PORTFOLIO_ARTIFACTS || fs.mkdtempSync(path.join(os.tmpdir(), "jj-portfolio-review-"));
fs.mkdirSync(artifacts, { recursive: true });
const servers = [], pages = [], contexts = [], errors = [];

function buildFixtures() {
  execFileSync("python3", ["scripts/build.py"], { cwd: root, stdio: "inherit" });
  // Empty and populated fixtures live outside the archive, which may grow.
  execFileSync("python3", ["-c", `
import sys,json,shutil,base64
from pathlib import Path
root=Path(sys.argv[1]); fixture=Path(sys.argv[2])
sys.path.insert(0,str(root/'scripts'))
from build import build
empty=fixture.parent/'empty'
shutil.copytree(root/'site',empty/'site')
(empty/'works').mkdir()
build(empty)
shutil.copytree(root/'site',fixture/'site')
(fixture/'works').mkdir()
for i,kind in enumerate(['component','page','page']):
    folder=fixture/'works'/f'fixture-{i}'
    (folder/'src').mkdir(parents=True)
    (folder/'src/index.html').write_text('<button>Test fixture only</button>')
    (folder/'README.md').write_text('Synthetic browser fixture, never publish.')
    (folder/'preview.png').write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGZkAAAAASUVORK5CYII='))
    demo=None
    if i==0:
        (folder/'demo').mkdir()
        (folder/'demo/index.html').write_text('<h1>Local demo fixture</h1>')
        demo='demo/index.html'
    info={'title':f'Browser fixture {i}','summary':'Temporary test content; not portfolio work.',
          'kind':kind,'date':f'2026-10-{10+i}','locale':'en','tags':['Fixture'],
          'highlights':['Real static detail page'],'preview':'preview.png','demo':demo,
          'translations':{'zh':{'title':f'浏览器夹具 {i}','summary':'临时测试内容，不是作品。',
                               'tags':['测试夹具'],'highlights':['独立静态详情页']}}}
    (folder/'work.json').write_text(json.dumps(info),encoding='utf-8')
build(fixture)
`, root, path.join(temporary, "fixture")], { stdio: "inherit" });
}

async function serve(directory) {
  // Reuse the production static handler, with an ephemeral loopback port.
  const child = spawn("python3", ["-u", "-c", `
import sys
from http.server import ThreadingHTTPServer
sys.path.insert(0,sys.argv[1])
from serve import make_handler
with ThreadingHTTPServer(('127.0.0.1',0),make_handler(sys.argv[2])) as server:
    print(server.server_address[1],flush=True)
    server.serve_forever()
`, path.join(root, "scripts"), directory], { stdio: ["ignore", "pipe", "pipe"] });
  servers.push(child);
  let diagnostics = "";
  child.stderr.on("data", data => { diagnostics = (diagnostics + data).slice(-8000); });
  return new Promise((resolve, reject) => {
    const lines = readline.createInterface({ input: child.stdout });
    const timeout = setTimeout(() => reject(new Error(`Static test server did not start: ${diagnostics}`)), 10000);
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.once("exit", code => { clearTimeout(timeout); reject(new Error(`Static test server exited ${code}: ${diagnostics}`)); });
    lines.once("line", line => {
      clearTimeout(timeout); lines.close();
      const port = Number(line);
      if (!Number.isInteger(port) || port <= 0) reject(new Error(`Invalid test server port: ${line}`));
      else resolve(`http://127.0.0.1:${port}`);
    });
  });
}

async function ownPage(context) {
  const page = await context.newPage();
  pages.push(page);
  page.setDefaultTimeout(12000);
  page.on("pageerror", error => errors.push({ url: page.url(), error: error.message }));
  await page.bringToFront();
  return page;
}

async function ready(page, pathname, name, lang = "en") {
  await page.waitForFunction(({ pathname, name, lang }) =>
    location.pathname === pathname && document.documentElement.lang === lang &&
    document.querySelector("main")?.dataset.page === name &&
    history.state?.portfolioKey && !document.querySelector("main").inert &&
    !document.querySelector(".route-transition-layer"), { pathname, name, lang });
}

async function menuRoute(page, pathname, name, lang = "en") {
  await page.locator(".menu-toggle").click();
  await page.locator(`.menu a[href="${pathname}"]`).click();
  await ready(page, pathname, name, lang);
}

async function noOverflow(page) {
  await page.evaluate(() => document.fonts.ready);
  const dimensions = await page.evaluate(() => ({
    width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll("main *,header *,footer *")].filter(node => {
      const rect = node.getBoundingClientRect();
      return rect.width && (rect.right > document.documentElement.clientWidth + 1 || rect.left < -1);
    }).slice(0, 8).map(node => ({ selector: node.tagName.toLowerCase() + (node.className ? "." + String(node.className).split(" ").join(".") : ""), client: node.clientWidth, scroll: node.scrollWidth })),
  }));
  assert(dimensions.content <= dimensions.width + 1, `Horizontal overflow: ${JSON.stringify(dimensions)}`);
}

async function checkBoundaries(page) {
  const result = await page.evaluate(() => {
    const nodes = [document.documentElement, document.body, ...document.querySelectorAll("main,.menu,[data-pg-viewport],input,textarea")];
    return nodes.filter(node => getComputedStyle(node).overscrollBehavior !== "none").map(node => node.className || node.tagName);
  });
  assert.deepEqual(result, [], "Root and nested scrolling boundaries must use overscroll-behavior:none");
  // CSS policy only: native touchpad/mobile elasticity requires a physical device.
}

async function assertPlaygroundState(page, count, dark, radius) {
  const actual = await page.locator("[data-playground]").evaluateAll(hosts => hosts.map(host => ({
    count: host.querySelector("[data-pg-count-value]").textContent,
    dark: host.querySelector("[data-pg-theme]").checked,
    radius: host.querySelector("[data-pg-radius]").value,
    theme: host.dataset.theme,
  })));
  assert(actual.length > 0, "Expected interactive playground instances");
  assert.deepEqual(actual, actual.map(() => ({ count: String(count), dark, radius: String(radius), theme: dark ? "dark" : "light" })));
}

async function main() {
  try {
    buildFixtures();
    const origin = await serve(path.join(temporary, "empty/_site"));
    const fixtureOrigin = await serve(path.join(temporary, "fixture/_site"));
    const port = Number(process.env.CDP_PORT || 9224);
    assert(Number.isInteger(port) && port > 0 && port <= 65535, "Invalid CDP_PORT");
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    const context = browser.contexts()[0];
    assert(context, "Official Chrome must expose its default context");
    const page = await ownPage(context);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: "no-preference" });

    // Verify zero-work states independently of the real, growing archive.
    assert.equal((await page.goto(origin + "/portfolio/")).status(), 200);
    await ready(page, "/portfolio/", "home");
    await page.waitForFunction(() => document.querySelector("[data-playground]")?.dataset.theme === "light");
    assert.equal(await page.locator(".work").count(), 0);
    assert.equal(await page.locator(".empty").count(), 1);
    await noOverflow(page);
    await checkBoundaries(page);
    const hero = page.locator("[data-playground]").first();
    await assertPlaygroundState(page, 0, false, 24);
    // JS click() would hide browser hit-testing regressions; use real pointer input.
    await hero.locator("[data-pg-action]").click();
    await assertPlaygroundState(page, 1, false, 24);
    await hero.locator("[data-pg-theme]").check();
    await hero.locator("[data-pg-radius]").focus();
    await page.keyboard.press("End");
    await assertPlaygroundState(page, 1, true, 36);
    await hero.locator("[data-pg-assemble]").click();
    assert.equal(await hero.locator("[data-pg-assemble]").getAttribute("aria-pressed"), "true");
    await hero.locator("[data-pg-explode]").click();
    assert.equal(await hero.locator("[data-pg-explode]").getAttribute("aria-pressed"), "true");
    await page.screenshot({ path: path.join(artifacts, "home-controls-desktop.png") });

    await page.locator("[data-language]").click();
    await ready(page, "/portfolio/zh/", "home", "zh-CN");
    await assertPlaygroundState(page, 1, true, 36);
    assert(await page.locator("[data-language]").evaluate(node => node === document.activeElement));
    await menuRoute(page, "/portfolio/zh/about/", "about", "zh-CN");
    assert.equal(await page.locator("[data-playground]").count(), 0);
    await menuRoute(page, "/portfolio/zh/", "home", "zh-CN");
    await assertPlaygroundState(page, 1, true, 36);
    await page.locator("[data-language]").click();
    await ready(page, "/portfolio/", "home");
    await assertPlaygroundState(page, 1, true, 36);
    await page.locator(".menu-toggle").click();
    assert.equal(await page.locator(".menu-toggle").getAttribute("aria-expanded"), "true");
    await page.keyboard.press("Escape");
    assert(await page.locator(".menu").isHidden());
    assert(await page.locator(".menu-toggle").evaluate(node => node === document.activeElement));
    await menuRoute(page, "/portfolio/projects/", "projects");
    assert.equal(await page.locator(".work").count(), 0);
    assert.equal(await page.locator("[data-filter]").count(), 0);
    assert(await page.locator(".empty").isVisible());
    console.log("PASS empty archive, pointer controls, shared state across language/remount, menu Escape");

    // Delay one response to make Back happen during both fetch and animation.
    const delayedURL = origin + "/portfolio/about/";
    let releaseResponse, requestStarted, handlerFinished;
    const gate = new Promise(resolve => { releaseResponse = resolve; });
    const started = new Promise(resolve => { requestStarted = resolve; });
    const handled = new Promise(resolve => { handlerFinished = resolve; });
    await page.route(delayedURL, async route => {
      requestStarted(); await gate;
      try { await route.continue(); } catch { /* Back may have aborted the fetch. */ }
      finally { handlerFinished(); }
    });
    try {
      await page.locator(".menu-toggle").click();
      await page.locator('.menu a[href="/portfolio/about/"]').click();
      await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error("Delayed route was not requested")), 12000))]);
      assert.equal(new URL(page.url()).pathname, "/portfolio/about/", "History must commit before the transition finishes");
      assert.equal(await page.locator("main").getAttribute("data-page"), "projects");
      assert(await page.locator(".route-transition-layer").count());
      await page.evaluate(() => history.back());
      releaseResponse();
      await ready(page, "/portfolio/projects/", "projects");
      await handled;
      assert.equal(await page.locator("main").getAttribute("aria-busy"), null);
    } finally {
      releaseResponse(); await page.unroute(delayedURL);
    }
    console.log("PASS Back during pending navigation: destination, history and transition cleanup");

    assert.equal((await page.goto(origin + "/portfolio/projects/unknown-work/")).status(), 404);
    await ready(page, "/portfolio/projects/unknown-work/", "not-found");
    assert.equal((await page.goto(origin + "/portfolio/zh/unknown/")).status(), 404);
    await ready(page, "/portfolio/zh/unknown/", "not-found", "zh-CN");

    // Isolated fixture origin, identical deployment path.
    await page.goto(fixtureOrigin + "/portfolio/projects/");
    await ready(page, "/portfolio/projects/", "projects");
    assert.equal(await page.locator(".work").count(), 3);
    await page.locator("[data-filter=page]").click();
    assert.equal(await page.locator(".work:not([hidden])").count(), 2);
    await page.locator("[data-filter=experiment]").click();
    assert.equal(await page.locator(".work:not([hidden])").count(), 0);
    assert(await page.locator(".filter-empty").isVisible());
    await page.locator("[data-filter=component]").click();
    await page.locator("[data-language]").click();
    await ready(page, "/portfolio/zh/projects/", "projects", "zh-CN");
    assert.equal(await page.locator("[data-filter=component]").getAttribute("aria-pressed"), "true");
    assert.equal(await page.locator(".work:not([hidden]) h3").innerText(), "浏览器夹具 0");
    await page.locator(".work:not([hidden]) .project-card").click();
    await ready(page, "/portfolio/zh/projects/fixture-0/", "detail", "zh-CN");
    assert.equal(await page.locator("h1").innerText(), "浏览器夹具 0");
    assert.equal(await page.locator(".detail-notes li").innerText(), "独立静态详情页");
    assert(await page.locator(".detail-preview img").evaluate(img => img.complete && img.naturalWidth > 0));
    const demo = page.locator('.detail-links a[href="/portfolio/demos/fixture-0/"]');
    assert.equal(await demo.count(), 1);
    assert.equal((await page.request.get(fixtureOrigin + await demo.getAttribute("href"))).status(), 200);
    assert.equal(await page.locator('.detail-links a[href^="https://github.com/"]').count(), 1);
    const nextHref = await page.locator(".next-project").getAttribute("href");
    assert.match(nextHref, /^\/portfolio\/zh\/projects\/fixture-[12]\/$/);
    assert.equal((await page.request.get(fixtureOrigin + nextHref)).status(), 200);
    await page.locator("[data-language]").click();
    await ready(page, "/portfolio/projects/fixture-0/", "detail");
    assert.equal(await page.locator("h1").innerText(), "Browser fixture 0");
    await noOverflow(page);
    await page.screenshot({ path: path.join(artifacts, "fixture-detail-desktop.png") });
    console.log("PASS fixture filters, translated detail/source/demo/next routes and true 404 responses");

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await menuRoute(page, "/portfolio/", "home");
    const compact = page.locator("[data-playground]").first();
    await compact.locator("[data-pg-action]").click();
    await assertPlaygroundState(page, 1, false, 24);
    await compact.locator("[data-pg-assemble]").click();
    assert.equal(await compact.locator("[data-pg-assemble]").getAttribute("aria-pressed"), "true");
    await compact.locator("[data-pg-viewport]").scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const still = await compact.locator("[data-pg-assembly]").getAttribute("style");
    await page.waitForTimeout(180);
    assert.equal(await compact.locator("[data-pg-assembly]").getAttribute("style"), still, "Reduced motion must stop continuous pose animation");
    assert.equal(await page.locator(".route-transition-layer").count(), 0);
    await noOverflow(page); await checkBoundaries(page);
    await page.screenshot({ path: path.join(artifacts, "home-reduced-mobile.png") });
    await menuRoute(page, "/portfolio/projects/", "projects");
    await noOverflow(page);
    await page.locator("[data-filter=all]").click();
    await page.locator(".project-card").first().click();
    await ready(page, "/portfolio/projects/fixture-2/", "detail");
    await noOverflow(page);
    console.log("PASS mobile width, reduced-motion controls and static pose, nested boundary policy");

    await page.setViewportSize({ width: 320, height: 720 });
    for (const locale of ["", "zh/"]) {
      for (const route of ["", "about/", "projects/"]) {
        await page.goto(origin + "/portfolio/" + locale + route);
        await ready(page, "/portfolio/" + locale + route, route ? route.slice(0, -1) : "home", locale ? "zh-CN" : "en");
        await noOverflow(page);
      }
    }
    console.log("PASS 320px Home/About/Projects in both languages without horizontal overflow");
    await page.setViewportSize({ width: 390, height: 844 });

    // Blocked module and failed context creation are separate resilience cases.
    await page.route("**/vendor/three/three.module.js", route => route.abort());
    await page.goto(origin + "/portfolio/");
    await ready(page, "/portfolio/", "home");
    await page.locator("[data-pg-viewport]").first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector("[data-playground]")?.dataset.webgl === "fallback");
    await page.locator("[data-pg-action]").first().click();
    await assertPlaygroundState(page, 1, false, 24);
    await page.unroute("**/vendor/three/three.module.js");
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        return /webgl/i.test(type) ? null : original.call(this, type, ...args);
      };
    });
    await page.goto(origin + "/portfolio/");
    await ready(page, "/portfolio/", "home");
    await page.locator("[data-pg-viewport]").first().scrollIntoViewIfNeeded();
    await page.waitForFunction(() => document.querySelector("[data-playground]")?.dataset.webgl === "fallback");
    await page.locator("[data-pg-action]").first().click();
    await assertPlaygroundState(page, 1, false, 24);

    const noJS = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1280, height: 900 } });
    contexts.push(noJS);
    const plain = await ownPage(noJS);
    for (const [pathname, pageName, lang, heading] of [
      ["/portfolio/", "home", "en", null],
      ["/portfolio/about/", "about", "en", null],
      ["/portfolio/projects/", "projects", "en", null],
      ["/portfolio/projects/fixture-0/", "detail", "en", "Browser fixture 0"],
      ["/portfolio/zh/", "home", "zh-CN", null],
      ["/portfolio/zh/about/", "about", "zh-CN", null],
      ["/portfolio/zh/projects/", "projects", "zh-CN", null],
      ["/portfolio/zh/projects/fixture-0/", "detail", "zh-CN", "浏览器夹具 0"],
    ]) {
      assert.equal((await plain.goto(fixtureOrigin + pathname)).status(), 200);
      assert.equal(await plain.locator("html").getAttribute("lang"), lang);
      assert.equal(await plain.locator("main").getAttribute("data-page"), pageName);
      assert(await plain.locator("h1").isVisible());
      assert(await plain.locator(".no-script-nav").isVisible());
      if (heading) assert.equal(await plain.locator("h1").innerText(), heading);
      if (pageName === "projects") assert.equal(await plain.locator(".work:visible").count(), 3);
    }
    await plain.locator("[data-language]").click();
    await plain.waitForURL(fixtureOrigin + "/portfolio/projects/fixture-0/");
    assert.equal(await plain.locator("h1").innerText(), "Browser fixture 0");
    assert.equal((await plain.goto(fixtureOrigin + "/portfolio/projects/missing/")).status(), 404);
    assert.equal(await plain.locator("main").getAttribute("data-page"), "not-found");
    assert.deepEqual(errors, [], "Uncaught browser exceptions");
    console.log("PASS blocked Three, failed WebGL, eight independent no-JS routes, native language links, no uncaught exceptions");
    console.log("Chrome:", browser.version());
    console.log("Artifacts:", artifacts);
    console.log("Native touchpad/mobile rubber-banding was not physically tested.");
  } finally {
    // Close only resources owned by this script; the shared Chrome and existing tabs survive.
    for (const page of pages.reverse()) if (!page.isClosed()) await page.close().catch(() => {});
    for (const context of contexts.reverse()) await context.close().catch(() => {});
    for (const server of servers) {
      if (server.exitCode !== null) continue;
      await new Promise(resolve => {
        const timer = setTimeout(() => { server.kill("SIGKILL"); }, 1500);
        server.once("exit", () => { clearTimeout(timer); resolve(); });
        server.kill("SIGTERM");
      });
    }
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

// Process exit disconnects this CDP client without sending Browser.close.
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
