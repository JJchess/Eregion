/* Optional integration check: PLAYWRIGHT_MODULE=/path/to/playwright node tests/browser.cjs */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "jj-portfolio-browser-"),
);
const artifacts =
  process.env.PORTFOLIO_ARTIFACTS ||
  fs.mkdtempSync(path.join(os.tmpdir(), "jj-portfolio-review-"));
fs.mkdirSync(artifacts, { recursive: true });

execFileSync("python3", ["scripts/build.py"], { cwd: root });
// Synthetic content is created outside works/ and cannot enter the Pages deployment.
execFileSync("python3", [
  "-c",
  `
import sys,json,shutil,base64
from pathlib import Path
root=Path(sys.argv[1]); fixture=Path(sys.argv[2])
sys.path.insert(0,str(root/'scripts'))
from build import build
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
  (folder/'demo').mkdir(); (folder/'demo/index.html').write_text('<h1>Local demo fixture</h1>'); demo='demo/index.html'
 info={'title':f'测试夹具 {i}','summary':'仅供自动化验证，不是作品。','kind':kind,'date':f'2026-10-{10+i}', 'tags':['Fixture'],'highlights':['Keyboard and focus check'],'preview':'preview.png','demo':demo}
 (folder/'work.json').write_text(json.dumps(info))
build(fixture)
`,
  root,
  path.join(temporary, "fixture"),
]);

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  const isFixture = url.pathname.startsWith("/fixture/");
  const prefix = isFixture ? "/fixture/" : "/portfolio/";
  if (!url.pathname.startsWith(prefix)) {
    response.writeHead(404).end();
    return;
  }
  const base = isFixture
    ? path.join(temporary, "fixture/_site")
    : path.join(root, "_site");
  const file = path.resolve(
    base,
    decodeURIComponent(url.pathname.slice(prefix.length)) || "index.html",
  );
  if (!file.startsWith(base + path.sep)) {
    response.writeHead(403).end();
    return;
  }
  const target =
    fs.existsSync(file) && fs.statSync(file).isDirectory()
      ? path.join(file, "index.html")
      : file;
  if (!fs.existsSync(target)) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": mime[path.extname(target)] || "text/plain",
  });
  fs.createReadStream(target).pipe(response);
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE }
      : {}),
    args: [
      "--enable-webgl",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const errors = [];
  const checkPage = (page) =>
    page.on("pageerror", (error) => errors.push(error.message));
  const waitReady = (page) =>
    page.waitForFunction(
      () => document.querySelector("[data-hero]").dataset.state === "ready",
      null,
      { timeout: 30000 },
    );
  const checkOverflow = async (page) => {
    const result = await page.evaluate(() => ({
      viewport: innerWidth,
      width: document.documentElement.scrollWidth,
      overflowing: [...document.querySelectorAll("body *")]
        .filter(
          (element) => element.getBoundingClientRect().right > innerWidth + 1,
        )
        .map((element) => element.className)
        .slice(0, 12),
    }));
    assert(
      result.width <= result.viewport,
      `horizontal overflow: ${JSON.stringify(result)}`,
    );
  };
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      recordVideo: { dir: artifacts, size: { width: 1440, height: 1000 } },
    });
    const page = await context.newPage();
    checkPage(page);
    await page.goto(origin + "/portfolio/");
    await waitReady(page);
    await page.waitForTimeout(800);
    assert.equal(await page.locator(".work").count(), 0);
    await checkOverflow(page);
    await page.screenshot({
      path: path.join(artifacts, "desktop.png"),
      fullPage: true,
    });
    await page.locator("[data-explode]").click();
    assert.equal(
      await page.locator("[data-explode]").getAttribute("aria-pressed"),
      "true",
    );
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(artifacts, "exploded.png") });
    const rect = await page.locator("[data-scene]").boundingBox();
    await page.mouse.move(
      rect.x + rect.width * 0.5,
      rect.y + rect.height * 0.5,
    );
    await page.mouse.down();
    await page.mouse.move(
      rect.x + rect.width * 0.7,
      rect.y + rect.height * 0.55,
      { steps: 16 },
    );
    await page.mouse.up();
    await page.waitForTimeout(500);
    await page.locator("[data-reset]").click();
    assert.equal(
      await page.locator("[data-explode]").getAttribute("aria-pressed"),
      "false",
    );
    await page.evaluate(() =>
      document.querySelector("#about").scrollIntoView({ behavior: "instant" }),
    );
    await page.waitForFunction(
      () =>
        document.querySelector("[data-hero]").dataset.rendering === "paused",
    );
    const pausedFrames = await page
      .locator("[data-hero]")
      .getAttribute("data-frames");
    await page.waitForTimeout(150);
    assert.equal(
      await page.locator("[data-hero]").getAttribute("data-frames"),
      pausedFrames,
    );
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForFunction(
      () =>
        document.querySelector("[data-hero]").dataset.rendering === "active",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(
      () => document.querySelector("[data-hero]").dataset.rendering === "still",
    );
    const stillFrames = await page
      .locator("[data-hero]")
      .getAttribute("data-frames");
    await page.waitForTimeout(150);
    assert.equal(
      await page.locator("[data-hero]").getAttribute("data-frames"),
      stillFrames,
    );
    await page.locator("[data-explode]").focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.locator("[data-explode]").getAttribute("aria-pressed"),
      "true",
    );
    await page.evaluate(() =>
      document
        .querySelector("canvas")
        .getContext("webgl2")
        .getExtension("WEBGL_lose_context")
        .loseContext(),
    );
    await page.waitForFunction(
      () => document.querySelector("[data-hero]").dataset.state === "fallback",
    );
    assert(await page.locator("[data-fallback-note]").isVisible());
    const video = page.video();
    await context.close();
    await video.saveAs(path.join(artifacts, "interaction.webm"));
    await video.delete();
    console.log(
      "PASS desktop: render, drag, buttons, offscreen pause, reduced motion, context-loss fallback",
    );

    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const phone = await mobile.newPage();
    checkPage(phone);
    await phone.goto(origin + "/portfolio/");
    await waitReady(phone);
    await checkOverflow(phone);
    await phone.screenshot({
      path: path.join(artifacts, "mobile.png"),
      fullPage: true,
    });
    const session = await mobile.newCDPSession(phone);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: 220, y: 650 }],
    });
    for (let y = 625; y >= 430; y -= 25) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 220, y }],
      });
      await phone.waitForTimeout(20);
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await phone.waitForTimeout(150);
    assert(
      await phone.evaluate(() => scrollY > 50),
      "vertical touch on canvas must scroll",
    );
    assert.notEqual(
      await phone.locator("[data-explode]").getAttribute("aria-pressed"),
      "true",
    );
    await mobile.close();
    console.log(
      "PASS mobile: no overflow, screenshot, vertical canvas touch scroll",
    );

    const fixtureContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const fixture = await fixtureContext.newPage();
    checkPage(fixture);
    await fixture.goto(origin + "/fixture/#works");
    assert.equal(await fixture.locator(".work").count(), 3);
    await fixture.locator("[data-filter=page]").click();
    assert.equal(await fixture.locator(".work:visible").count(), 2);
    await fixture.locator("[data-filter=experiment]").click();
    assert(await fixture.locator(".filter-empty").isVisible());
    await fixture.locator("[data-filter=all]").click();
    await fixture.locator("[data-view=index]").click();
    assert.equal(
      await fixture.locator(".works-grid").getAttribute("data-layout"),
      "index",
    );
    await fixture.waitForTimeout(500);
    const trigger = fixture.locator("[data-detail]").first();
    await trigger.focus();
    const before = await fixture.evaluate(() => scrollY);
    await fixture.keyboard.press("Enter");
    await fixture.waitForFunction(
      () => !!document.querySelector("dialog[open]"),
    );
    await fixture.waitForTimeout(500);
    assert.equal(
      await fixture.locator("dialog[open] h2").innerText(),
      "测试夹具 2",
    );
    assert(
      await fixture
        .locator("dialog[open] [data-close]")
        .evaluate((element) => element === document.activeElement),
    );
    await fixture.keyboard.press("Escape");
    await fixture.waitForFunction(
      () => !document.querySelector("dialog[open]"),
    );
    await fixture.waitForTimeout(500);
    assert(
      await trigger.evaluate((element) => element === document.activeElement),
    );
    assert(
      Math.abs((await fixture.evaluate(() => scrollY)) - before) <= 1,
      "close must restore scroll",
    );
    await fixture.locator("[data-view=gallery]").click();
    await fixture.waitForTimeout(500);
    await checkOverflow(fixture);
    assert.equal(
      await fixture.locator('.work-dialog a[href="demos/fixture-0/"]').count(),
      1,
    );
    assert.equal(
      (
        await fixture.request.get(origin + "/fixture/demos/fixture-0/")
      ).status(),
      200,
    );
    // Reduced-motion open/close, including actual pointer dismissal on the backdrop.
    await fixture.emulateMedia({ reducedMotion: "reduce" });
    await trigger.click();
    await fixture.waitForFunction(
      () => !!document.querySelector("dialog[open]"),
    );
    await fixture.mouse.click(5, 5);
    await fixture.waitForFunction(
      () => !document.querySelector("dialog[open]"),
    );
    await fixture.setViewportSize({ width: 390, height: 844 });
    await checkOverflow(fixture);
    await fixtureContext.close();
    console.log(
      "PASS archive: filter/empty category, gallery/index, keyboard dialog, focus/scroll restore, backdrop, subpath demo",
    );

    const offline = await browser.newContext();
    const failed = await offline.newPage();
    checkPage(failed);
    await failed.route("**/vendor/three/three.module.js", (route) =>
      route.abort(),
    );
    await failed.goto(origin + "/portfolio/");
    await failed.waitForFunction(
      () => document.querySelector("[data-hero]").dataset.state === "fallback",
    );
    assert(await failed.locator("h1").isVisible());
    await offline.close();
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const plain = await noJs.newPage();
    await plain.goto(origin + "/fixture/#works");
    assert.equal(await plain.locator(".work:visible").count(), 3);
    assert(!(await plain.locator(".filters").isVisible()));
    assert(
      (
        await plain.locator("[data-detail]").first().getAttribute("href")
      ).startsWith("https://github.com/"),
    );
    await noJs.close();
    assert.deepEqual(errors, [], "uncaught browser exceptions");
    console.log(
      "PASS resilience: blocked module, no-JS archive links, no uncaught exceptions",
    );
    console.log("Artifacts:", artifacts);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
