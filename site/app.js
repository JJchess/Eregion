import { createPlaygrounds } from "./playground.js";
import { createRouteTransition } from "./route-transitions.js";
import { createFluidCursor } from "./fluid-cursor.js";

const main = document.querySelector("main");
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
const base = document.body.dataset.base;
const positions = new Map();
const filters = new Map();
const cursor = createFluidCursor();
let pageResources,
  pending,
  sequence = 0;
let displayedURL = location.pathname + location.search;
let displayedKey = history.state?.portfolioKey || crypto.randomUUID();
history.replaceState(
  { ...history.state, portfolioKey: displayedKey },
  "",
  location.href,
);
history.scrollRestoration = "manual";

function closeMenu(restoreFocus = false) {
  const menu = document.querySelector(".menu");
  const toggle = document.querySelector(".menu-toggle");
  if (!menu || !toggle) return;
  const wasOpen = !menu.hidden;
  menu.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
  toggle.querySelector("[data-menu-label]").textContent =
    toggle.dataset.openLabel;
  if (wasOpen && restoreFocus) toggle.focus();
}

function filterKey() {
  return location.pathname.replace(`${base}zh/`, base);
}
function setFilter(value, announce = true) {
  const buttons = [...main.querySelectorAll("[data-filter]")];
  if (!buttons.length) return;
  if (!buttons.some((button) => button.dataset.filter === value)) value = "all";
  buttons.forEach((button) =>
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.filter === value),
    ),
  );
  const cards = [...main.querySelectorAll(".work[data-kind]")];
  let count = 0;
  cards.forEach((card) => {
    card.hidden = value !== "all" && card.dataset.kind !== value;
    if (!card.hidden) count++;
  });
  const empty = main.querySelector(".filter-empty");
  if (empty) empty.hidden = count > 0 || cards.length === 0;
  const status = main.querySelector("[data-filter-status]");
  if (status && announce)
    status.textContent = `${count} ${main.dataset.resultsLabel}`;
  filters.set(filterKey(), value);
}

function createStory(root) {
  const story = root.querySelector("[data-story]");
  if (!story) return () => {};
  const phases = [...story.querySelectorAll("[data-phase]")];
  let frame = 0;
  function update() {
    frame = 0;
    const rect = story.getBoundingClientRect();
    const progress = reduced.matches
      ? 1
      : Math.max(
          0,
          Math.min(1, -rect.top / Math.max(1, rect.height - innerHeight)),
        );
    story.style.setProperty(
      "--play-explode",
      (1 - Math.min(1, progress * 1.65)).toFixed(4),
    );
    story.style.setProperty("--play-turn", ((progress - 0.5) * 0.7).toFixed(4));
    const phase = Math.min(2, Math.floor(progress * 3));
    story.dataset.phase = phase;
    phases.forEach((item, index) => {
      item.classList.toggle("is-active", index === phase);
      if (index === phase) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
  }
  function request() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  addEventListener("scroll", request, { passive: true });
  addEventListener("resize", request, { passive: true });
  reduced.addEventListener("change", request);
  update();
  return () => {
    cancelAnimationFrame(frame);
    removeEventListener("scroll", request);
    removeEventListener("resize", request);
    reduced.removeEventListener("change", request);
  };
}

function createLetterSprings(root) {
  const section = root.querySelector("[data-contact]");
  if (!section) return () => {};
  const link = section.querySelector(".contact-link");
  link.setAttribute("aria-label", link.textContent.trim());
  const letters = [];
  for (const line of link.children) {
    const text = line.textContent;
    line.textContent = "";
    line.setAttribute("aria-hidden", "true");
    for (const char of Array.from(text)) {
      const span = document.createElement("span");
      span.className = "contact-letter";
      span.textContent = char;
      line.append(span);
      letters.push({ element: span, y: 0, velocity: 0, target: 0 });
    }
  }
  let frame = 0,
    disposed = false,
    last = 0;
  function tick(now) {
    frame = 0;
    if (disposed || document.hidden || reduced.matches) return reset();
    const dt = Math.min(2, (now - (last || now - 16)) / 16.67);
    last = now;
    let active = false;
    for (const item of letters) {
      item.velocity =
        (item.velocity + (item.target - item.y) * 0.12 * dt) * 0.72 ** dt;
      item.y += item.velocity * dt;
      if (Math.abs(item.velocity) + Math.abs(item.target - item.y) > 0.05)
        active = true;
      item.element.style.transform = `translateY(${item.y.toFixed(2)}px) rotate(${(item.y * -0.08).toFixed(2)}deg)`;
    }
    if (active) frame = requestAnimationFrame(tick);
    else last = 0;
  }
  function schedule() {
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function move(event) {
    if (event.pointerType !== "mouse" || reduced.matches) return;
    for (const item of letters) {
      const rect = item.element.getBoundingClientRect();
      const distance = Math.hypot(
        event.clientX - rect.left - rect.width / 2,
        event.clientY - rect.top - rect.height / 2 + item.y,
      );
      item.target = -24 * Math.max(0, 1 - distance / 130);
    }
    schedule();
  }
  function leave() {
    letters.forEach((item) => (item.target = 0));
    schedule();
  }
  function reset() {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
    letters.forEach((item) => {
      item.y = item.velocity = item.target = 0;
      item.element.style.transform = "";
    });
  }
  section.addEventListener("pointermove", move);
  section.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", reset);
  reduced.addEventListener("change", reset);
  return () => {
    disposed = true;
    reset();
    section.removeEventListener("pointermove", move);
    section.removeEventListener("pointerleave", leave);
    document.removeEventListener("visibilitychange", reset);
    reduced.removeEventListener("change", reset);
  };
}

function mountPage() {
  const story = createStory(main);
  const playgrounds = createPlaygrounds(main);
  const springs = createLetterSprings(main);
  setFilter(filters.get(filterKey()) || "all", false);
  return {
    dispose() {
      story();
      playgrounds.dispose();
      springs();
    },
  };
}
function remember() {
  const focus = document.activeElement;
  positions.set(displayedKey, {
    x: scrollX,
    y: scrollY,
    href:
      focus instanceof HTMLAnchorElement ? focus.getAttribute("href") : null,
    id: focus?.id || null,
  });
}
function scrollTarget(url, saved, languagePosition) {
  if (saved)
    return scrollTo({ left: saved.x, top: saved.y, behavior: "instant" });
  if (languagePosition) {
    const section = [...main.children][languagePosition.index];
    if (section)
      return scrollTo({
        top: section.offsetTop + section.offsetHeight * languagePosition.ratio,
        behavior: "instant",
      });
  }
  if (url.hash) {
    let id;
    try {
      id = decodeURIComponent(url.hash.slice(1));
    } catch {
      id = "";
    }
    const target = document.getElementById(id);
    if (target) return target.scrollIntoView({ behavior: "instant" });
  }
  scrollTo({ top: 0, left: 0, behavior: "instant" });
}
function replaceDocument(next) {
  pageResources?.dispose();
  document.documentElement.lang = next.documentElement.lang;
  document.title = next.title;
  document.body.className = next.body.className;
  document.body.dataset.locale = next.body.dataset.locale;
  document.querySelector(".header").innerHTML =
    next.querySelector(".header").innerHTML;
  document.querySelector(".footer").innerHTML =
    next.querySelector(".footer").innerHTML;
  document.querySelector(".skip-link").textContent =
    next.querySelector(".skip-link").textContent;
  const destination = next.querySelector("main");
  main.innerHTML = destination.innerHTML;
  for (const [key, value] of Object.entries(destination.dataset))
    main.dataset[key] = value;
  for (const selector of [
    'meta[name="description"]',
    'meta[property="og:title"]',
    'meta[property="og:description"]',
    'meta[property="og:url"]',
    'link[rel="canonical"]',
    'link[hreflang="en"]',
    'link[hreflang="zh-CN"]',
    'link[hreflang="x-default"]',
  ]) {
    const existing = document.head.querySelector(selector);
    const replacement = next.head.querySelector(selector);
    if (existing && replacement)
      existing.replaceWith(replacement.cloneNode(true));
  }
  pageResources = mountPage();
}

async function navigate(
  url,
  { pop = false, sourceCover = null, language = false } = {},
) {
  remember();
  const run = ++sequence;
  pending?.controller.abort();
  pending?.transition.dispose();
  const controller = new AbortController();
  let languagePosition;
  if (language) {
    const sections = [...main.children];
    let index = sections.findIndex(
      (section) => section.getBoundingClientRect().bottom > 0,
    );
    if (index >= 0)
      languagePosition = {
        index,
        ratio:
          (scrollY - sections[index].offsetTop) /
          Math.max(1, sections[index].offsetHeight),
      };
  }
  closeMenu();
  cursor.clear();
  const key = pop
    ? history.state?.portfolioKey || crypto.randomUUID()
    : crypto.randomUUID();
  // Commit before waiting: a Back event must remain authoritative during animation/fetch.
  if (!pop) history.pushState({ portfolioKey: key }, "", url.href);
  else if (!history.state?.portfolioKey)
    history.replaceState({ portfolioKey: key }, "", url.href);
  const transition = createRouteTransition({
    main,
    sourceCover,
    reducedMotion: reduced,
  });
  pending = { controller, transition };
  try {
    const request = fetch(url.href, {
      signal: controller.signal,
      headers: { Accept: "text/html" },
    }).then(async (response) => {
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("text/html")
      )
        throw new Error("Unavailable page");
      const parsed = new DOMParser().parseFromString(
        await response.text(),
        "text/html",
      );
      if (
        !parsed.querySelector("main[data-page]") ||
        parsed.body.dataset.base !== base
      )
        throw new Error("Unrecognized page");
      return parsed;
    });
    const [next] = await Promise.all([request, transition.leave()]);
    if (controller.signal.aborted || run !== sequence) return;
    replaceDocument(next);
    displayedKey = key;
    displayedURL = url.pathname + url.search;
    const saved = pop ? positions.get(key) : null;
    scrollTarget(url, saved, languagePosition);
    await transition.enter();
    if (controller.signal.aborted || run !== sequence) return;
    transition.dispose();
    let focus = saved?.id ? document.getElementById(saved.id) : null;
    if (!focus && saved?.href)
      focus = [...document.querySelectorAll("a[href]")].find(
        (a) =>
          a.getAttribute("href") === saved.href && a.getClientRects().length,
      );
    if (language) focus = document.querySelector("[data-language]");
    (focus || main).focus({ preventScroll: true });
    document.querySelector("#page-status").textContent = document.title;
  } catch (error) {
    if (controller.signal.aborted || run !== sequence) return;
    transition.dispose();
    document.querySelector("#page-status").textContent = main.dataset.navError;
    // Every page exists as HTML, so native navigation is the network/error fallback.
    location.assign(url.href);
  } finally {
    transition.dispose();
    if (run === sequence) pending = null;
  }
}

document.addEventListener("click", (event) => {
  const toggle = event.target.closest(".menu-toggle");
  if (toggle) {
    const menu = document.querySelector(".menu");
    if (!menu.hidden) closeMenu();
    else {
      menu.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      toggle.querySelector("[data-menu-label]").textContent =
        toggle.dataset.closeLabel;
      menu.querySelector("a").focus();
    }
    return;
  }
  if (!event.target.closest(".header")) closeMenu();
  const filter = event.target.closest("[data-filter]");
  if (filter) {
    setFilter(filter.dataset.filter);
    return;
  }
  const anchor = event.target.closest("a[href]");
  if (
    !anchor ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    anchor.target ||
    anchor.hasAttribute("download")
  )
    return;
  const url = new URL(anchor.href, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith(base)) return;
  const path = url.pathname.slice(base.length).replace(/^zh\//, "");
  if (!/^(?:|about\/|projects\/(?:[a-z0-9-]+\/)?)$/.test(path)) return;
  if (url.pathname + url.search === displayedURL && !pending) {
    closeMenu();
    // Preserve native anchors, history, and keyboard focus for in-page navigation.
    return;
  }
  event.preventDefault();
  navigate(url, {
    sourceCover: anchor.querySelector(".project-cover"),
    language: anchor.hasAttribute("data-language"),
  });
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu(true);
});
document.addEventListener("focusin", (event) => {
  if (!event.target.closest(".header")) closeMenu();
});
addEventListener("popstate", () =>
  navigate(new URL(location.href), { pop: true }),
);
addEventListener("pagehide", () => {
  remember();
  cursor.clear();
});
pageResources = mountPage();

// GitHub Pages serves the root 404 document even for a missing Chinese URL.
// Keep the original HTTP status and URL, while replacing its static shell with the Chinese one.
if (
  main.dataset.page === "not-found" &&
  location.pathname.startsWith(`${base}zh/`) &&
  document.documentElement.lang !== "zh-CN"
) {
  fetch(`${base}zh/404.html`)
    .then((response) => (response.ok ? response.text() : Promise.reject()))
    .then((html) => {
      if (main.dataset.page !== "not-found") return;
      replaceDocument(new DOMParser().parseFromString(html, "text/html"));
    })
    .catch(() => {});
}
