/* End-to-end acceptance against an existing preview and official Google Chrome.
 * This script launches/stops neither server nor browser. Real video decoding and
 * pointer/keyboard input are exercised; native touchpad elasticity is not tested.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const origin = process.env.PORTFOLIO_ORIGIN || 'http://127.0.0.1:4179';
const demoPath = process.env.LANDING_DEMO_PATH || '/portfolio/demos/edumanus-landing/';
const artifacts = process.env.PORTFOLIO_ARTIFACTS || path.resolve(__dirname, '../../.portfolio-curator/research/edumanus-landing-20261018/browser');
const checkFilter = process.env.LANDING_CHECK_FILTER ? new RegExp(process.env.LANDING_CHECK_FILTER) : null;
const contexts = new Set();
const checks = [], observations = [], errors = [], failedResources = [], externalRequests = [];
const products = [
  { id: 'world-video', file: 'interactive-video.mp4', chapters: [6.8, 15.9, 25, 34.1] },
  { id: 'world-notes', file: 'interactive-lecture.mp4', chapters: [3.9, 9.2, 14.4, 19.6] },
  { id: 'world-lab', file: 'code-lab.mp4', chapters: [6.7, 15.6, 24.5, 33.4] },
  { id: 'world-interactive-lab', file: 'interactive-lab.mp4', chapters: [5.1, 12, 18.8, 25.7] },
  { id: 'world-classroom', file: 'cloud-classroom.mp4', chapters: [11.6, 27.2, 42.7, 58.2] },
];
fs.mkdirSync(artifacts, { recursive: true });
let browser, currentPage, failure;

async function check(name, action) {
  if (checkFilter && !checkFilter.test(name)) return;
  console.log('CHECK ' + name);
  await action();
  checks.push(name);
  console.log('PASS ' + name);
}

async function newPage(options = {}, webglUnavailable = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, ...options });
  contexts.add(context);
  if (webglUnavailable) await context.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
      return /^(webgl2?|experimental-webgl)$/.test(kind) ? null : getContext.call(this, kind, ...args);
    };
  });
  const page = await context.newPage();
  currentPage = page;
  page.setDefaultTimeout(20000);
  page.on('pageerror', error => errors.push({ page: page.url(), message: error.message }));
  page.on('request', request => {
    const url = new URL(request.url());
    if (/^https?:$/.test(url.protocol) && url.origin !== new URL(origin).origin) {
      externalRequests.push({ url: request.url(), type: request.resourceType() });
    }
  });
  page.on('response', response => {
    if (response.status() >= 400) failedResources.push({ url: response.url(), status: response.status() });
  });
  page.on('requestfailed', request => {
    // Closing a playing video or replacing a page legitimately aborts a request.
    const message = request.failure()?.errorText || '';
    if (!message.includes('ERR_ABORTED')) failedResources.push({ url: request.url(), message });
  });
  await page.bringToFront();
  return page;
}

async function load(page, language = 'en') {
  const response = await page.goto(origin + demoPath + '?lang=' + language, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200);
  await page.locator('h1').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('[data-cosmic-backdrop]')?.dataset.qualityResolved === 'true');
  await page.evaluate(() => document.fonts.ready);
  assert((await page.locator('html').getAttribute('lang')).startsWith(language));
  assert.equal(await page.locator('#products article').count(), 5);
}

const scrollPosition = page => page.evaluate(() => (document.querySelector('[data-landing-scroll-root]') || document.scrollingElement).scrollTop);
const scrollPage = (page, position, viewportUnits = false) => page.evaluate(({ position, viewportUnits }) => {
  const scroller = document.querySelector('[data-landing-scroll-root]') || document.scrollingElement;
  const top = position === 'end' ? scroller.scrollHeight : position * (viewportUnits ? scroller.clientHeight : 1);
  scroller.scrollTo({ top, behavior: 'instant' });
}, { position, viewportUnits });

async function geometry(page) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const scrollers = [root, document.body, ...document.querySelectorAll('body *')]
      .filter((element, index, all) => all.indexOf(element) === index)
      .filter(element => element === root || element === document.body || (
        element.getClientRects().length && /(auto|scroll)/.test(getComputedStyle(element).overflow)
      ));
    return {
      width: root.clientWidth,
      scrollWidth: root.scrollWidth,
      overflowingScrollers: scrollers.filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({ tag: element.tagName, class: element.className, width: element.clientWidth, scrollWidth: element.scrollWidth })),
      badBoundaries: scrollers.filter(element => {
        const css = getComputedStyle(element);
        return css.overscrollBehaviorX !== 'none' || css.overscrollBehaviorY !== 'none';
      }).map(element => ({ tag: element.tagName, class: element.className })),
    };
  });
  assert(result.scrollWidth <= result.width + 1, JSON.stringify(result));
  assert.deepEqual(result.overflowingScrollers, [], JSON.stringify(result));
  assert.deepEqual(result.badBoundaries, [], JSON.stringify(result));
}

async function sweepPage(page) {
  const sections = page.locator('section[id]');
  for (let i = 0; i < await sections.count(); i++) {
    await sections.nth(i).evaluate(element => element.scrollIntoView({ block: 'start', behavior: 'instant' }));
    await page.waitForTimeout(120);
    await geometry(page);
    await page.waitForFunction(() => [...document.images].filter(image => {
      const rect = image.getBoundingClientRect();
      return image.getClientRects().length && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
    }).every(image => image.complete && image.naturalWidth > 0));
  }
  // Decorative isometric cards outside a narrow viewport remain legitimately lazy.
  // Check requested assets through the response listener and all decoded images here.
  assert.deepEqual(await page.evaluate(() => [...document.images].filter(image => image.complete && !image.naturalWidth).map(image => image.currentSrc || image.src)), []);
  await scrollPage(page, 'end');
  const bottom = await scrollPosition(page);
  await page.mouse.move(30, 500);
  await page.mouse.wheel(0, 1400);
  await page.waitForTimeout(150);
  assert(Math.abs(await scrollPosition(page) - bottom) < 2, 'Bottom boundary must not move the page beyond its range');
  await scrollPage(page, 0);
  await page.mouse.wheel(0, -1400);
  await page.waitForTimeout(150);
  assert.equal(await scrollPosition(page), 0);
}

async function checkProduct(page, product, index, mobile = false) {
  const trigger = page.locator('#' + product.id + ' > button');
  await trigger.evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(350);
  await trigger.evaluate(element => {
    window.landingOpenScroll = null;
    element.addEventListener('click', () => {
      window.landingOpenScroll = (document.querySelector('[data-landing-scroll-root]') || document.scrollingElement).scrollTop;
    }, { capture: true, once: true });
  });
  await trigger.click();
  const before = await page.evaluate(() => window.landingOpenScroll);
  assert.notEqual(before, null, 'Capture the actual scroll position at the user activation event');
  const dialog = page.getByRole('dialog');
  await dialog.waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('[role=dialog]')?.dataset.transitioning === 'false');
  assert(await page.locator('main').evaluate(element => element.inert), 'Open player isolates the background from keyboard input');
  const video = dialog.locator('video');
  assert((await video.getAttribute('src')).endsWith(product.file));
  await page.waitForFunction(() => {
    const video = document.querySelector('[role=dialog] video');
    return video && video.readyState >= 3 && video.videoWidth > 0 && video.duration > 0 && !video.error;
  });
  await page.waitForFunction(() => !document.querySelector('[role=dialog] video').paused);
  const decoded = await video.evaluate(element => ({ width: element.videoWidth, height: element.videoHeight, duration: element.duration }));
  const start = await video.evaluate(element => element.currentTime);
  await page.waitForFunction(start => document.querySelector('[role=dialog] video').currentTime > start + 0.08, start);
  assert.equal(await dialog.locator('[data-content-thumb]').count(), 4);
  for (const chapter of [0, 3]) {
    await video.evaluate(element => {
      element.pause();
      window.lastLandingSeek = null;
      element.addEventListener('seeked', () => { window.lastLandingSeek = element.currentTime; }, { once: true });
    });
    await dialog.locator('[data-content-thumb]').nth(chapter).click();
    try {
      await page.waitForFunction(expected => {
        const video = document.querySelector('[role=dialog] video');
        return !video.seeking && !video.paused && window.lastLandingSeek !== null && Math.abs(window.lastLandingSeek - expected) < 0.4;
      }, product.chapters[chapter]);
    } finally {
      observations.push({ product: product.id, chapter: chapter + 1, expected: product.chapters[chapter], ...await video.evaluate(element => ({ seekedTime: window.lastLandingSeek, currentTime: element.currentTime, paused: element.paused, seeking: element.seeking, duration: element.duration })) });
    }
  }
  await geometry(page);
  const back = dialog.locator('button').first();
  await back.focus();
  await page.keyboard.press('Shift+Tab');
  assert(await dialog.locator('[data-content-thumb]').last().evaluate(element => element === document.activeElement), 'Backward Tab wraps within the dialog');
  await page.keyboard.press('Tab');
  assert(await back.evaluate(element => element === document.activeElement), 'Forward Tab wraps to the close control');
  if (mobile) {
    // Inspect overflow rather than depending on generated CSS module names.
    const boundary = await dialog.evaluate(element => {
      const scroller = [element, ...element.querySelectorAll('*')].find(node => /(auto|scroll)/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight);
      if (!scroller) return null;
      scroller.scrollTop = scroller.scrollHeight;
      const rect = scroller.getBoundingClientRect();
      return { top: scroller.scrollTop, max: scroller.scrollHeight - scroller.clientHeight, x: rect.x + rect.width / 2, y: Math.min(innerHeight - 20, rect.bottom - 20) };
    });
    assert(boundary, 'Narrow player exposes its complete content through a nested scroll container');
    assert(Math.abs(boundary.top - boundary.max) < 1, 'The end of the complete player content is reachable');
    await page.mouse.move(boundary.x, boundary.y);
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(150);
    assert(Math.abs(await scrollPosition(page) - before) < 2, 'Player scrolling must not move the document underneath');
    await dialog.evaluate(element => {
      for (const node of [element, ...element.querySelectorAll('*')]) if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) node.scrollTop = 0;
    });
  }
  await dialog.screenshot({ path: path.join(artifacts, `${mobile ? 'mobile-' : ''}${product.id}.png`) });
  if (index % 2 === 0) await page.keyboard.press('Escape');
  else await back.click();
  await dialog.waitFor({ state: 'detached' });
  assert(await trigger.evaluate(element => element === document.activeElement), 'Close restores focus to the original preview');
  assert(!(await page.locator('main').evaluate(element => element.inert)), 'Close unlocks background interaction');
  const after = await scrollPosition(page);
  observations.push({ product: product.id, mobile, scrollBeforeOpen: before, scrollAfterClose: after });
  assert(Math.abs(after - before) < 3, `Close preserves the gallery scroll position: ${before} → ${after}`);
  assert.notEqual(await page.evaluate(() => getComputedStyle(document.querySelector('[data-landing-scroll-root]') || document.scrollingElement).overflowY), 'hidden');
  assert.equal(await page.locator('#' + product.id + ' [data-product-cover]').count(), 1, 'The original cover returns to its card');
  observations.push({ product: product.id, mobile, decodedVideo: decoded });
}

async function fallback(page, label) {
  await load(page);
  const backdrop = page.locator('[data-cosmic-backdrop]');
  assert.equal(await backdrop.getAttribute('data-render-mode'), 'static');
  assert.equal(await page.locator('[data-galaxy-canvas] canvas').count(), 0);
  await page.waitForFunction(() => {
    const poster = document.querySelector('[data-galaxy-poster]');
    const image = poster?.querySelector('img');
    return image?.complete && image.naturalWidth > 0 && Number(getComputedStyle(poster).opacity) > 0.9;
  });
  assert((await page.locator('h1').innerText()).trim().length > 10);
  await sweepPage(page);
  await page.screenshot({ path: path.join(artifacts, label + '.png') });
  await checkProduct(page, products[0], 0);
}

(async () => {
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${process.env.CDP_PORT || 9224}`);
  const desktop = await newPage();
  await load(desktop);
  await check('Desktop galaxy renders, accepts drag and keyboard input, and dissolves with document scroll', async () => {
    await desktop.waitForFunction(() => document.querySelector('[data-cosmic-backdrop]')?.dataset.ready === 'true');
    const surface = desktop.locator('#landing-galaxy-drag-surface');
    const box = await surface.boundingBox();
    assert(box && box.width > 100 && box.height > 100);
    await desktop.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.6);
    await desktop.mouse.down();
    assert.notEqual(await surface.getAttribute('data-dragging'), null);
    await desktop.mouse.move(box.x + box.width * 0.75 - 100, box.y + box.height * 0.6 - 40, { steps: 6 });
    await desktop.mouse.up();
    assert.equal(await surface.getAttribute('data-dragging'), null);
    await surface.focus();
    await desktop.evaluate(() => {
      window.galaxyArrowHandled = false;
      document.addEventListener('keydown', event => { if (event.key === 'ArrowRight') window.galaxyArrowHandled = event.defaultPrevented; }, { once: true });
    });
    await desktop.keyboard.press('ArrowRight');
    assert(await desktop.evaluate(() => window.galaxyArrowHandled), 'Arrow key reaches the galaxy control');
    assert.equal(await scrollPosition(desktop), 0);
    await scrollPage(desktop, 0.45, true);
    await desktop.waitForFunction(() => {
      const progress = Number(document.querySelector('[data-cosmic-backdrop]').dataset.dissolveProgress);
      return progress > 0.2 && progress < 0.95;
    });
    assert.notEqual(await surface.getAttribute('data-transition-locked'), null);
    await scrollPage(desktop, 1, true);
    await desktop.waitForFunction(() => document.querySelector('[data-cosmic-backdrop]').dataset.transitionPhase === 'continuum');
    await scrollPage(desktop, 0);
    await desktop.waitForFunction(() => Number(document.querySelector('[data-cosmic-backdrop]').dataset.dissolveProgress) === 0);
    await geometry(desktop);
    observations.push({ galaxyQuality: await desktop.locator('[data-cosmic-backdrop]').getAttribute('data-quality') });
    await desktop.screenshot({ path: path.join(artifacts, 'desktop-hero.png') });
  });
  await check('Header anchors reach each named section in the standalone page', async () => {
    for (const id of ['world-video', 'journey', 'outcomes', 'finale']) {
      await desktop.locator(`header a[href="#${id}"]`).click();
      await desktop.waitForFunction(id => {
        const target = document.getElementById(id).getBoundingClientRect();
        return target.top < innerHeight && target.bottom > 0;
      }, id);
      assert.equal(new URL(desktop.url()).hash, '#' + id);
    }
  });
  await check('Account actions open a local explanation and return focus without entering a live service', async () => {
    const actions = desktop.locator('header a[href="#demo-information"]');
    assert(await actions.count() > 0);
    for (let index = 0; index < await actions.count(); index++) {
      const before = desktop.url();
      await actions.nth(index).click();
      const dialog = desktop.locator('dialog[open]');
      await dialog.waitFor({ state: 'visible' });
      assert.equal(desktop.url(), before);
      assert((await dialog.innerText()).includes('standalone portfolio'));
      if (index % 2 === 0) await dialog.locator('button').click();
      else await desktop.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert(await actions.nth(index).evaluate(element => element === document.activeElement));
    }
  });
  for (const [index, product] of products.entries()) {
    await check(`${product.id}: video decodes and plays, chapters seek, focus stays contained, close restores page`, () => checkProduct(desktop, product, index));
  }
  await check('Language switch updates content and URL, and survives refresh', async () => {
    await scrollPage(desktop, 0);
    const english = await desktop.locator('h1').innerText();
    await desktop.locator('[data-demo-language]').click();
    await desktop.waitForFunction(() => document.documentElement.lang.startsWith('zh'));
    assert.equal(new URL(desktop.url()).searchParams.get('lang'), 'zh');
    const chinese = await desktop.locator('h1').innerText();
    assert.notEqual(chinese, english);
    await desktop.reload({ waitUntil: 'domcontentloaded' });
    await desktop.locator('h1').waitFor();
    assert.equal(await desktop.locator('h1').innerText(), chinese);
    await desktop.locator('[data-demo-language]').click();
    await desktop.waitForFunction(() => document.documentElement.lang.startsWith('en'));
    assert.equal(new URL(desktop.url()).searchParams.get('lang'), 'en');
    assert.equal(await desktop.locator('h1').innerText(), english);
  });
  await desktop.context().close(); contexts.delete(desktop.context());
  await check('390/320 px English and Chinese pages retain all content with no horizontal overflow', async () => {
    const mobile = await newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    for (const width of [390, 320]) {
      await mobile.setViewportSize({ width, height: 844 });
      for (const lang of ['en', 'zh']) {
        await load(mobile, lang);
        await geometry(mobile);
        assert.equal(await mobile.locator('[data-cosmic-backdrop]').getAttribute('data-render-mode'), 'static');
        await sweepPage(mobile);
        await mobile.screenshot({ path: path.join(artifacts, `mobile-${width}-${lang}.png`) });
      }
    }
    await mobile.context().close(); contexts.delete(mobile.context());
  });
  await check('Short mobile player exposes all content through isolated scrolling and restores the page', async () => {
    const mobile = await newPage({ viewport: { width: 320, height: 600 }, isMobile: true, hasTouch: true });
    await load(mobile, 'zh');
    await checkProduct(mobile, products[0], 0, true);
    await mobile.context().close(); contexts.delete(mobile.context());
  });
  await check('Reduced motion preserves the poster, readable content, normal scroll and playable media', async () => {
    const page = await newPage({ reducedMotion: 'reduce' });
    await fallback(page, 'reduced-motion');
    await page.context().close(); contexts.delete(page.context());
  });
  await check('Unavailable WebGL keeps the entire page and video interactions usable', async () => {
    const page = await newPage({}, true);
    await fallback(page, 'webgl-unavailable');
    await page.context().close(); contexts.delete(page.context());
  });
  await check('Standalone demo has no uncaught errors, missing resources or external business requests', async () => {
    assert.deepEqual(errors, []);
    assert.deepEqual(failedResources, []);
    assert.deepEqual(externalRequests, []);
  });
})().catch(async error => {
  failure = error.stack;
  console.error(error);
  process.exitCode = 1;
  if (currentPage && !currentPage.isClosed()) await currentPage.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {});
}).finally(async () => {
  fs.writeFileSync(path.join(artifacts, 'report.json'), JSON.stringify({
    chrome: browser?.version(), demo: origin + demoPath, checks, observations,
    checkFilter: process.env.LANDING_CHECK_FILTER || null,
    errors, failedResources, externalRequests, failure,
    rendering: 'Official Chrome over CDP; renderer capability and performance are not overridden.',
    physicalElasticityTested: false,
  }, null, 2));
  for (const context of contexts) await context.close();
  // Disconnect this client by exiting; browser.close() would stop shared Chrome.
  process.exit(process.exitCode || 0);
});
