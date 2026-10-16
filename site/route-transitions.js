// Independently authored from observed Chrome frames, not source runtime code.
// Routing, history, scroll restoration and destination focus stay with app.js.
const ease = "cubic-bezier(.65,0,.2,1)";

function visibleRect(element) {
  const rect = element?.getBoundingClientRect();
  return rect &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < innerHeight &&
    rect.left < innerWidth
    ? rect
    : null;
}

function copyCover(cover, rect) {
  const source = cover.querySelector("img");
  if (!source || !(source.currentSrc || source.src)) return null;
  const clone = document.createElement("div");
  clone.className = "route-cover-copy";
  const style = getComputedStyle(cover);
  Object.assign(clone.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    borderRadius: style.borderRadius,
    background: style.backgroundColor,
  });
  const image = document.createElement("img");
  image.src = source.currentSrc || source.src;
  image.alt = "";
  image.draggable = false;
  image.decoding = "sync";
  image.style.objectPosition = getComputedStyle(source).objectPosition;
  clone.append(image);
  return clone;
}

function waitForVisibleMedia(main, signal) {
  const media = [...main.querySelectorAll("img, video")]
    .filter(visibleRect)
    .slice(0, 3);
  return Promise.all(
    media.map(
      (element) =>
        new Promise((resolve) => {
          let timer,
            poster,
            finished = false;
          const done = () => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            element.removeEventListener("load", done);
            element.removeEventListener("loadeddata", done);
            element.removeEventListener("error", done);
            poster?.removeEventListener("load", done);
            poster?.removeEventListener("error", done);
            signal.removeEventListener("abort", done);
            resolve();
          };
          const ready =
            element instanceof HTMLImageElement
              ? element.complete
              : element.readyState >= 2;
          if (ready || signal.aborted) {
            resolve();
            return;
          }
          element.addEventListener("load", done, { once: true });
          element.addEventListener("loadeddata", done, { once: true });
          element.addEventListener("error", done, { once: true });
          signal.addEventListener("abort", done, { once: true });
          timer = setTimeout(done, 1400);
          if (element instanceof HTMLVideoElement && element.poster) {
            // A URL is not proof that the browser can paint its poster yet.
            // Race the actual image load against video data and the same
            // bounded wait; shared browser caching avoids duplicate transfer.
            poster = new Image();
            poster.addEventListener("load", done, { once: true });
            poster.addEventListener("error", done, { once: true });
            poster.src = element.poster;
            if (poster.complete && poster.naturalWidth > 0) done();
          }
        }),
    ),
  );
}

/**
 * const transition = createRouteTransition({ main, sourceCover, reducedMotion });
 * try {
 *   // Commit link history before waiting, so browser traversal cannot be overwritten.
 *   await transition.leave();
 *   // Existing render and scroll restoration.
 *   await transition.enter();
 * } finally { transition.dispose(); }
 * // Existing focus restoration and queued-navigation handling.
 */
export function createRouteTransition({
  main,
  sourceCover = null,
  reducedMotion = false,
}) {
  const reduced =
    typeof reducedMotion === "boolean" ? reducedMotion : reducedMotion.matches;
  const motionQuery = typeof reducedMotion === "object" ? reducedMotion : null;
  const controller = new AbortController();
  const animations = new Set();
  const header = document.querySelector(".header");
  const wasInert = main.inert;
  const wasBusy = main.getAttribute("aria-busy");
  let disposed = false,
    left = false,
    layer,
    field,
    mark;
  const rect = !reduced && visibleRect(sourceCover);
  const cardTransition = Boolean(rect && sourceCover.querySelector("img"));

  if (!reduced) {
    layer = document.createElement("div");
    layer.className = `route-transition-layer ${cardTransition ? "is-card" : "is-page"}`;
    layer.setAttribute("aria-hidden", "true");
    if (cardTransition) {
      field = document.createElement("div");
      field.className = "route-cover-field";
      const neighbors = [...main.querySelectorAll(".project-cover")].filter(
        visibleRect,
      );
      if (!neighbors.includes(sourceCover)) neighbors.push(sourceCover);
      for (const cover of neighbors) {
        const clone = copyCover(cover, cover.getBoundingClientRect());
        if (clone) field.append(clone);
      }
      field.style.transformOrigin = `${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px`;
      layer.append(field);
    } else {
      mark = document.createElement("span");
      mark.className = "route-loading-mark";
      const logo = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      logo.setAttribute("viewBox", "0 0 64 64");
      logo.setAttribute("focusable", "false");
      const symbol = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "use",
      );
      symbol.setAttribute(
        "href",
        `${document.body.dataset.base}assets/brand.svg#mark`,
      );
      logo.append(symbol);
      mark.append(logo);
      layer.append(mark);
    }
    document.body.append(layer);
  }

  async function animate(element, frames, options) {
    if (disposed || !element) return;
    const animation = element.animate(frames, { fill: "forwards", ...options });
    animations.add(animation);
    await animation.finished.catch(() => {});
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    motionQuery?.removeEventListener("change", onMotionChange);
    controller.abort();
    for (const animation of animations) animation.cancel();
    animations.clear();
    layer?.remove();
    main.inert = wasInert;
    if (wasBusy === null) main.removeAttribute("aria-busy");
    else main.setAttribute("aria-busy", wasBusy);
  }

  function onMotionChange(event) {
    if (event.matches) dispose();
  }
  motionQuery?.addEventListener("change", onMotionChange);

  return {
    async leave() {
      if (left || disposed) return;
      left = true;
      main.inert = true;
      main.setAttribute("aria-busy", "true");
      if (reduced) return;
      if (cardTransition) {
        const scale =
          Math.max(innerWidth / rect.width, innerHeight / rect.height) * 1.2;
        const x = innerWidth / 2 - (rect.left + rect.width / 2);
        const y = innerHeight / 2 - (rect.top + rect.height / 2);
        const end = `translate(${x}px,${y}px) perspective(1800px) rotateY(-5deg) rotateZ(3deg) scale(${scale})`;
        await Promise.all([
          animate(main, [{ opacity: 1 }, { opacity: 0 }], {
            duration: 400,
            easing: "ease-out",
          }),
          animate(
            field,
            [
              { transform: "none", offset: 0 },
              { transform: "none", offset: 0.12 },
              { transform: end, offset: 1 },
            ],
            { duration: 900, easing: ease },
          ),
        ]);
      } else {
        await Promise.all([
          animate(layer, [{ opacity: 0 }, { opacity: 1 }], {
            duration: 420,
            easing: "ease-in-out",
          }),
          animate(
            header,
            [
              { opacity: 1, offset: 0 },
              { opacity: 1, offset: 0.65 },
              { opacity: 0, offset: 1 },
            ],
            { duration: 420 },
          ),
        ]);
        if (disposed) return;
        layer.classList.add("is-covered");
        await animate(
          mark,
          [
            { opacity: 0, transform: "scale(.7)" },
            { opacity: 1, transform: "scale(1)" },
          ],
          { duration: 180, easing: "ease-out" },
        );
      }
    },
    async enter() {
      if (disposed) return;
      if (!left) await this.leave();
      if (reduced) {
        dispose();
        return;
      }
      await waitForVisibleMedia(main, controller.signal);
      if (disposed) return;
      if (cardTransition) {
        layer.style.background =
          getComputedStyle(document.documentElement)
            .getPropertyValue("--paper")
            .trim() || "#000";
        await animate(
          field,
          [
            { opacity: 1, filter: "blur(0px)" },
            { opacity: 0, filter: "blur(12px)" },
          ],
          { duration: 260, easing: "ease-in" },
        );
        await Promise.all([
          animate(main, [{ opacity: 0 }, { opacity: 1 }], {
            duration: 320,
            easing: "ease-out",
          }),
          animate(layer, [{ opacity: 1 }, { opacity: 0 }], {
            duration: 320,
            easing: "ease-out",
          }),
        ]);
      } else {
        await animate(
          mark,
          [
            { opacity: 1, transform: "scale(1)" },
            { opacity: 0, transform: "scale(.18)" },
          ],
          { duration: 280, easing: ease },
        );
        await Promise.all([
          animate(layer, [{ opacity: 1 }, { opacity: 0 }], {
            duration: 240,
            easing: "ease-out",
          }),
          animate(header, [{ opacity: 0 }, { opacity: 1 }], {
            duration: 240,
            easing: "ease-out",
          }),
        ]);
      }
      dispose();
    },
    dispose,
  };
}
