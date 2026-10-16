/* Review the standalone Voice Mode UI in an already running official Chrome.
 * PLAYWRIGHT_MODULE=/path/to/playwright CDP_PORT=9224 node tests/voice-browser.cjs
 * VOICE_DEMO_URL can point at the deployed demo. No microphone is used.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const target = new URL(process.env.VOICE_DEMO_URL || "http://127.0.0.1:4179/portfolio/demos/voice-mode-ui/");
assert(["http:", "https:"].includes(target.protocol) && !target.username && !target.password, "Expected an HTTP(S) demo URL without credentials");
const artifacts = process.env.PORTFOLIO_ARTIFACTS || fs.mkdtempSync(path.join(os.tmpdir(), "voice-review-"));
fs.mkdirSync(artifacts, { recursive: true });
const contexts = [], checks = [], errors = [], unexpectedRequests = [], failedResources = [], forbiddenCalls = [];
let activePage, browserVersion;

function pass(message) { checks.push(message); console.log("PASS", message); }

async function ownPage(browser, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: "block", ...options });
  contexts.push(context);
  await context.addInitScript(() => {
    const calls = [];
    Object.defineProperty(window, "__voiceForbiddenCalls", { value: calls });
    const deny = name => function () {
      calls.push(name);
      throw new Error(`Standalone voice demo unexpectedly called ${name}`);
    };
    for (const name of ["WebSocket", "EventSource", "AudioContext", "webkitAudioContext", "OfflineAudioContext", "webkitOfflineAudioContext", "RTCPeerConnection", "webkitRTCPeerConnection", "MediaRecorder", "SpeechRecognition", "webkitSpeechRecognition"]) {
      if (name in window) Object.defineProperty(window, name, { configurable: true, writable: true, value: deny(name) });
    }
    if (navigator.mediaDevices) {
      for (const name of ["getUserMedia", "getDisplayMedia"]) {
        if (name in navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, name, { configurable: true, value: deny(`mediaDevices.${name}`) });
      }
    }
    for (const name of ["getUserMedia", "webkitGetUserMedia", "mozGetUserMedia"]) {
      if (name in navigator) Object.defineProperty(navigator, name, { configurable: true, value: deny(`navigator.${name}`) });
    }
    Object.defineProperty(HTMLMediaElement.prototype, "play", { configurable: true, value: deny("HTMLMediaElement.play") });
    if (window.speechSynthesis) Object.defineProperty(window.speechSynthesis, "speak", { configurable: true, value: deny("speechSynthesis.speak") });
  });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(15000);
  // Fail closed: a regression must not reach the original business service.
  await context.route("**/*", route => {
    const request = route.request(), url = new URL(request.url());
    if (["http:", "https:"].includes(url.protocol) &&
        (url.origin !== target.origin || /\/(?:api|graphql|sessions|ws)(?:\/|$)/i.test(url.pathname))) {
      unexpectedRequests.push({ url: url.href, type: request.resourceType() });
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  page.on("response", response => {
    if (response.status() >= 400) failedResources.push({ url: response.url(), status: response.status() });
  });
  page.on("pageerror", error => errors.push({ url: page.url(), message: error.message }));
  await page.bringToFront();
  return page;
}

async function noOverflow(page) {
  await page.evaluate(() => document.fonts.ready);
  const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
  assert(size.content <= size.width + 1, `Horizontal overflow: ${JSON.stringify(size)}`);
}

async function boundaries(page) {
  const violations = await page.evaluate(() => [...document.querySelectorAll("*")].filter(node => {
    const style = getComputedStyle(node);
    return (node === document.documentElement || node === document.body || /(auto|scroll)/.test(style.overflowX + style.overflowY) || node.matches("input,textarea")) &&
      (style.overscrollBehaviorX !== "none" || style.overscrollBehaviorY !== "none");
  }).map(node => node.tagName.toLowerCase() + (typeof node.className === "string" && node.className ? "." + node.className.trim().split(/\s+/).join(".") : "")));
  assert.deepEqual(violations, [], "Root, nested and input scroll boundaries must suppress overscroll");
}

async function checkDevices(page) {
  const calls = await page.evaluate(() => window.__voiceForbiddenCalls);
  forbiddenCalls.push(...calls.map(name => ({ url: page.url(), name })));
  assert.deepEqual(calls, [], "This visual demo must not open microphones, audio engines or business transports");
}

function report(status, error) {
  fs.writeFileSync(path.join(artifacts, "voice-report.json"), JSON.stringify({
    status, target: target.href, chrome: browserVersion, checks, errors,
    unexpectedRequests, failedResources, forbiddenCalls, error: error?.stack,
    limits: ["The demo uses simulated visual states; real recording, speech services and physical phone/trackpad elasticity were not tested."],
  }, null, 2) + "\n");
}

async function load(page) {
  assert.equal((await page.goto(target.href, { waitUntil: "domcontentloaded" })).status(), 200);
  await page.locator(".voice-demo").waitFor({ state: "visible" });
  await page.waitForFunction(() => document.documentElement.lang === "en");
  await state(page, "listening", "none");
  assert.match(await page.locator(".demo-notice").innerText(), /No microphone, recording, or sound/);
}

async function state(page, expected, source) {
  await page.waitForFunction(({ expected, source }) => {
    const orb = document.querySelector("[data-voice-orb]");
    return orb?.dataset.orbState === expected && (!source || orb.dataset.orbSource === source);
  }, { expected, source });
  assert.equal(await page.locator("[data-voice-orb]").count(), 1, "Only one voice orb should be mounted");
  const palettes = { listening: "silver", muted: "silver", preparing: "silver", self: "violet", agent: "lavender", peer: "blue", ended: "violet" };
  if (palettes[expected]) assert.equal(await page.locator("[data-render-state]").getAttribute("data-orb-palette"), palettes[expected]);
}

async function scene(page, value, expected = value, source) {
  await page.locator(".scene-select select").selectOption(value);
  await state(page, expected, source);
  assert.equal(await page.locator(".voice-demo").getAttribute("data-playback"), "paused");
}

async function play(page, playing = true) {
  const shell = page.locator(".voice-demo");
  if ((await shell.getAttribute("data-playback") === "playing") !== playing) await page.locator('[data-action="play"]').click();
  await page.waitForFunction(playing => document.querySelector(".voice-demo")?.dataset.playback === (playing ? "playing" : "paused"), playing);
}

async function activity(page) {
  await page.waitForFunction(() => Number(document.querySelector("[data-activity]")?.getAttribute("data-activity")) > 0);
}

async function members(page, touch = false) {
  const trigger = page.getByRole("button", { name: "Participants", exact: true });
  if (touch) await trigger.tap(); else await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Participants", exact: true });
  await dialog.waitFor({ state: "visible" });
  assert(await dialog.evaluate(node => node.open && node.contains(document.activeElement)), "Participants dialog should receive focus");
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    assert(await dialog.evaluate(node => node.contains(document.activeElement) || document.activeElement === document.body), "Tab must not reach page controls behind the modal dialog");
  }
  const agent = dialog.getByRole("button", { name: "Remove from voice", exact: true });
  assert.equal(await agent.getAttribute("aria-pressed"), "true");
  if (touch) await agent.tap(); else await agent.click();
  const add = dialog.getByRole("button", { name: "Add to voice", exact: true });
  assert.equal(await add.getAttribute("aria-pressed"), "false");
  if (touch) await add.tap(); else await add.click();
  await boundaries(page);
  await noOverflow(page);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  assert(await trigger.evaluate(node => node === document.activeElement), "Escape should return focus to the participant trigger");
  assert.equal(await trigger.getAttribute("aria-expanded"), "false");
}

async function endAndReopen(page, touch = false, typeMessage = false) {
  const end = page.getByRole("button", { name: "End voice", exact: true });
  if (touch) await end.tap(); else await end.click();
  await state(page, "ended", "none");
  assert.match(await page.locator("[data-voice-orb]").innerText(), /Call ended/);
  await page.locator("[data-voice-orb]").waitFor({ state: "detached" });
  const entry = page.getByRole("button", { name: "Voice mode", exact: true });
  await entry.waitFor({ state: "visible" });
  await page.waitForFunction(() => document.activeElement?.closest('[data-voice-control="off"]'));
  if (typeMessage) {
    await page.keyboard.press("Shift+Tab");
    const textbox = page.getByRole("textbox", { name: "Write a sample message…", exact: true });
    const focus = await textbox.evaluate(node => ({ focused: node === document.activeElement, style: getComputedStyle(node).outlineStyle, width: parseFloat(getComputedStyle(node).outlineWidth) }));
    assert(focus.focused && focus.style !== "none" && focus.width > 0, `Keyboard-focused composer needs a visible outline: ${JSON.stringify(focus)}`);
    const message = "A local sample message, without any service.";
    await textbox.fill(message);
    await page.getByRole("button", { name: "Send sample message", exact: true }).click();
    assert.equal(await page.locator(".conversation").getByText(message, { exact: true }).count(), 1);
  }
  if (touch) await entry.tap(); else await entry.click();
  await state(page, "listening", "none");
  await page.waitForFunction(() => ["ready", "fallback"].includes(document.querySelector('[data-render-state]')?.dataset.renderState));
  const rendering = await page.locator("[data-render-state]").getAttribute("data-render-state");
  assert.equal(await page.locator("[data-voice-orb] canvas").count(), rendering === "fallback" ? 0 : 1);
}

async function mobileTranscriptFollowing(page) {
  // A short, real mobile viewport ensures the conversation actually overflows.
  // Never programmatically scroll captions into view: that would hide regressions.
  await page.setViewportSize({ width: 390, height: 640 });
  await scene(page, "self", "self", "mic");
  await play(page);
  await state(page, "agent", "agent");
  await page.waitForFunction(() => {
    const node = document.querySelector(".conversation");
    return node.scrollHeight - node.clientHeight > 100 && node.scrollHeight - node.scrollTop - node.clientHeight <= 2;
  });
  await play(page, false);
  const client = await page.context().newCDPSession(page);
  try {
    const box = await page.locator(".conversation").boundingBox();
    const x = box.x + box.width / 2;
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: box.y + 56 }] });
    for (let distance = 20; distance <= 220; distance += 20) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: box.y + 56 + distance }] });
      await page.waitForTimeout(20);
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForFunction(() => {
      const node = document.querySelector(".conversation");
      return node.scrollHeight - node.scrollTop - node.clientHeight > 80;
    });
    await play(page);
    // Continue the real sample through a new peer caption, rather than changing
    // hidden clock state or forcing a DOM scroll position.
    await page.waitForFunction(() => Number(document.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")) >= 17, null, { timeout: 25000 });
    await state(page, "peer", "peer");
    assert((await page.locator('[data-message="sample-peer"] p').innerText()).length > 0);
    const gap = await page.locator(".conversation").evaluate(node => node.scrollHeight - node.scrollTop - node.clientHeight);
    assert(gap > 80, `New captions must not pull a reader back to the bottom after an upward touch scroll: gap=${gap}`);
    await play(page, false);
  } finally {
    await client.detach();
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.getByRole("button", { name: "Replay", exact: true }).tap();
  await state(page, "listening", "none");
  await play(page, false);
  pass("390px mobile follows self-to-agent caption growth, then respects an upward touch scroll during later captions");
}

async function main() {
  try {
    const port = Number(process.env.CDP_PORT || 9224);
    assert(Number.isInteger(port) && port > 0 && port <= 65535, "Invalid CDP_PORT");
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
    browserVersion = browser.version();
    const page = await ownPage(browser);
    await load(page);
    await page.locator('[data-render-state="ready"]').waitFor({ state: "visible" });
    await noOverflow(page);
    await boundaries(page);
    assert.match(await page.locator('.sr-only[role="status"]').innerText(), /Listening/);
    await page.screenshot({ path: path.join(artifacts, "voice-desktop.png") });

    await play(page);
    await state(page, "self", "mic");
    await activity(page);
    const self = page.locator('[data-message="sample-self"] p');
    await page.waitForFunction(() => document.querySelector('[data-message="sample-self"] p')?.textContent.trim().length > 0);
    await play(page, false);
    const pausedText = await self.innerText();
    const pausedProgress = await page.getByRole("progressbar").getAttribute("aria-valuenow");
    await page.waitForTimeout(450);
    assert.equal(await self.innerText(), pausedText, "Pause must stop transcript advancement");
    assert.equal(await page.getByRole("progressbar").getAttribute("aria-valuenow"), pausedProgress, "Pause must stop the sample clock");
    await page.getByRole("button", { name: "Replay", exact: true }).click();
    await state(page, "listening", "none");
    assert.equal(await page.getByRole("progressbar").getAttribute("aria-valuenow"), "0");
    assert.equal(await page.locator("[data-message]").count(), 0, "Replay starts a new sample without duplicate transcripts");
    await play(page, false);
    pass("Play drives self speech and synthetic activity; pause freezes captions; replay resets the sample");

    await scene(page, "self", "self", "mic");
    assert.match(await page.locator("[data-voice-orb]").innerText(), /You are speaking/);
    await scene(page, "preparing", "preparing", "none");
    assert.equal(await page.locator("[data-orb-arc]").count(), 1);
    assert.equal(await page.locator('[data-message="sample-agent"]').getAttribute("data-phase"), "thinking");
    await play(page);
    await state(page, "agent", "agent");
    await activity(page);
    const unsaid = page.locator('[data-message="sample-agent"] [data-unsaid]');
    await unsaid.waitFor({ state: "visible" });
    const initiallyUnsaid = (await unsaid.innerText()).length;
    await page.waitForFunction(initial => (document.querySelector('[data-message="sample-agent"] [data-unsaid]')?.textContent.length ?? 0) < initial, initiallyUnsaid);
    assert.equal(await page.locator("[data-orb-arc]").count(), 0);
    await play(page, false);
    await scene(page, "peer", "peer", "peer");
    assert.match(await page.locator("[data-voice-orb]").innerText(), /Sam is speaking/);
    assert((await page.locator('[data-message="sample-peer"] p').innerText()).length > 0);
    assert.equal(await page.locator("[data-message]").count(), 3);
    await play(page);
    await activity(page);
    await play(page, false);
    await page.screenshot({ path: path.join(artifacts, "voice-conversation.png") });
    pass("Self, preparing, agent and peer states retain their palettes/captions; answer text progressively becomes spoken");

    await scene(page, "self", "self", "mic");
    await page.getByRole("button", { name: "Mute", exact: true }).click();
    await state(page, "muted", "none");
    assert.equal(await page.getByRole("button", { name: "Unmute", exact: true }).getAttribute("aria-pressed"), "true");
    await scene(page, "agent", "agent", "agent");
    await play(page);
    await activity(page);
    await play(page, false);
    await scene(page, "listening", "muted", "none");
    await page.getByRole("button", { name: "Unmute", exact: true }).click();
    await state(page, "listening", "none");
    assert.equal(await page.getByRole("button", { name: "Mute", exact: true }).getAttribute("aria-pressed"), "false");
    await members(page);
    await endAndReopen(page, false, true);
    pass("Mute silences only self activity; participants, Escape, end/composer and a single reopened orb remain usable");

    await page.getByRole("button", { name: "切换到中文", exact: true }).click();
    await page.waitForFunction(() => document.documentElement.lang.startsWith("zh"));
    await page.getByRole("button", { name: "切换明暗主题", exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    await scene(page, "listening", "listening", "none");
    await page.getByRole("button", { name: "静音", exact: true }).click();
    await state(page, "muted", "none");
    const announced = await page.locator('.sr-only[role="status"]').innerText();
    assert.match(announced, /静音/);
    assert.doesNotMatch(announced, /\bmuted\b/i, "Chinese screen-reader status must not leak an English state key");
    await page.getByRole("button", { name: "取消静音", exact: true }).click();
    await state(page, "listening", "none");
    await scene(page, "peer", "peer", "peer");
    assert.match(await page.locator("[data-voice-orb]").innerText(), /小林 正在发言/);
    assert.match(await page.locator('[data-message="sample-peer"] p').innerText(), /这个想法/);
    await noOverflow(page);
    await page.screenshot({ path: path.join(artifacts, "voice-zh-dark.png") });
    await page.getByRole("button", { name: "Switch to English", exact: true }).click();
    await page.waitForFunction(() => document.documentElement.lang === "en");
    assert.match(await page.locator("[data-voice-orb]").innerText(), /Sam is speaking/);
    assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
    await page.getByRole("button", { name: "Switch theme", exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "light");
    await checkDevices(page);
    pass("English/Chinese captions and controls switch in place; light/dark themes preserve the scene");

    for (const width of [390, 320]) {
      const mobile = await ownPage(browser, { viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: "reduce" });
      await load(mobile);
      if (width === 390) await mobileTranscriptFollowing(mobile);
      await scene(mobile, "peer", "peer", "peer");
      const lastMessage = mobile.locator('[data-message="sample-peer"]');
      await mobile.waitForFunction(() => {
        const node = document.querySelector(".conversation");
        return node.scrollHeight - node.scrollTop - node.clientHeight <= 2;
      });
      const [messageBox, dockBox] = await Promise.all([lastMessage.boundingBox(), mobile.locator("[data-voice-orb]").boundingBox()]);
      assert(messageBox && dockBox && messageBox.y + messageBox.height <= dockBox.y + 1, "The dock must not cover the last transcript");
      await members(mobile, true);
      await scene(mobile, "listening", "listening", "none");
      await mobile.getByRole("button", { name: "Mute", exact: true }).tap();
      await state(mobile, "muted", "none");
      await mobile.getByRole("button", { name: "Unmute", exact: true }).tap();
      await state(mobile, "listening", "none");
      await endAndReopen(mobile, true);
      await scene(mobile, "preparing", "preparing", "none");
      const animation = await mobile.locator("[data-orb-arc]").evaluate(node => getComputedStyle(node).animationName);
      assert.equal(animation, "none", "Reduced motion should stop the preparing arc animation");
      await noOverflow(mobile);
      await boundaries(mobile);
      await mobile.screenshot({ path: path.join(artifacts, `voice-${width}.png`) });
      await checkDevices(mobile);
      await mobile.context().close();
      pass(`${width}px touch controls, modal focus/Escape, unclipped captions, reduced motion and no horizontal overflow`);
    }

    const fallback = await ownPage(browser, { reducedMotion: "reduce" });
    await fallback.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/i.test(type) ? null : original.call(this, type, ...args); };
    });
    await load(fallback);
    await fallback.locator('[data-render-state="fallback"]').waitFor({ state: "visible" });
    await scene(fallback, "agent", "agent", "agent");
    assert.match(await fallback.locator("[data-voice-orb]").innerText(), /Guide is answering/);
    await fallback.getByRole("button", { name: "Mute", exact: true }).click();
    await scene(fallback, "listening", "muted", "none");
    await endAndReopen(fallback);
    await fallback.locator('[data-render-state="fallback"]').waitFor({ state: "visible" });
    await boundaries(fallback);
    await noOverflow(fallback);
    await checkDevices(fallback);
    await fallback.screenshot({ path: path.join(artifacts, "voice-webgl-fallback.png") });
    pass("Unavailable WebGL keeps the still orb, captions, mute and end/reopen controls functional");

    assert.deepEqual(errors, [], "Unexpected uncaught browser exceptions");
    assert.deepEqual(unexpectedRequests, [], "No business API or remote asset requests");
    assert.deepEqual(failedResources, [], "All demo resources must load");
    assert.deepEqual(forbiddenCalls, [], "No microphone, speech, media playback, audio engine or real-time transport was opened");
    pass("No audio/device/transport calls, business requests, remote assets, failed resources or uncaught exceptions");
    report("passed");
    console.log("Chrome:", browserVersion);
    console.log("Artifacts:", artifacts);
  } catch (error) {
    if (activePage && !activePage.isClosed()) {
      const calls = await activePage.evaluate(() => window.__voiceForbiddenCalls || []).catch(() => []);
      forbiddenCalls.push(...calls.map(name => ({ url: activePage.url(), name })));
      await activePage.screenshot({ path: path.join(artifacts, "voice-failure.png"), timeout: 3000 }).catch(() => {});
    }
    report("failed", error);
    throw error;
  } finally {
    // Close only contexts this test created; never close the shared Chrome.
    for (const context of contexts.reverse()) await context.close().catch(() => {});
  }
}

main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
