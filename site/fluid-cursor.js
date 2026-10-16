// Native backdrop refraction keeps the real DOM, video and WebGL pixels live.
// The flow map below is independently generated; no reference runtime is used.
const SVG = "http://www.w3.org/2000/svg";
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
function node(name, attributes = {}, parent) {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes))
    element.setAttribute(key, value);
  parent?.append(element);
  return element;
}

export function createFluidCursor() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  if (!CSS.supports("backdrop-filter", "url(#portfolio-cursor-refraction)"))
    return { clear() {}, dispose() {} };
  const definitions = node("svg", {
    width: 0,
    height: 0,
    "aria-hidden": "true",
    focusable: "false",
  });
  definitions.style.cssText =
    "position:fixed;pointer-events:none;overflow:clip";
  const filter = node(
    "filter",
    {
      id: "portfolio-cursor-refraction",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      "color-interpolation-filters": "sRGB",
    },
    node("defs", {}, definitions),
  );
  const image = node(
    "feImage",
    { result: "flow", preserveAspectRatio: "none" },
    filter,
  );
  const corrected = node(
    "feComponentTransfer",
    { in: "flow", result: "vector" },
    filter,
  );
  for (const channel of ["R", "G"])
    node(
      `feFunc${channel}`,
      {
        type: "linear",
        slope: 1,
        intercept: -1 / 510,
      },
      corrected,
    );
  for (const [index, name, scale] of [
    [0, "red", 64],
    [1, "green", 70],
    [2, "blue", 78],
  ]) {
    node(
      "feDisplacementMap",
      {
        in: "SourceGraphic",
        in2: "vector",
        scale,
        xChannelSelector: "R",
        yChannelSelector: "G",
        result: `${name}Warp`,
      },
      filter,
    );
    const matrix = Array(20).fill(0);
    matrix[index * 6] = 1;
    matrix[18] = 1;
    node(
      "feColorMatrix",
      {
        in: `${name}Warp`,
        type: "matrix",
        values: matrix.join(" "),
        result: name,
      },
      filter,
    );
  }
  node(
    "feComposite",
    {
      in: "red",
      in2: "green",
      operator: "arithmetic",
      k2: 1,
      k3: 1,
      result: "rg",
    },
    filter,
  );
  node(
    "feComposite",
    {
      in: "rg",
      in2: "blue",
      operator: "arithmetic",
      k2: 1,
      k3: 1,
      result: "refracted",
    },
    filter,
  );
  node(
    "feColorMatrix",
    {
      in: "flow",
      type: "matrix",
      result: "height",
      values: "0 0 1 0 0  0 0 1 0 0  0 0 1 0 0  0 0 1 0 0",
    },
    filter,
  );
  const specular = node(
    "feSpecularLighting",
    {
      in: "height",
      surfaceScale: 7,
      specularConstant: 0.42,
      specularExponent: 28,
      "lighting-color": "#b9eaff",
      result: "reflection",
    },
    filter,
  );
  node("feDistantLight", { azimuth: 225, elevation: 38 }, specular);
  node(
    "feComposite",
    { in: "reflection", in2: "height", operator: "in", result: "glint" },
    filter,
  );
  const diffuse = node(
    "feDiffuseLighting",
    {
      in: "height",
      surfaceScale: 12,
      diffuseConstant: 0.9,
      "lighting-color": "#c1d7e6",
      result: "surfaceShade",
    },
    filter,
  );
  node("feDistantLight", { azimuth: 225, elevation: 38 }, diffuse);
  const shadeMask = node(
    "feComponentTransfer",
    { in: "height", result: "shadeMask" },
    filter,
  );
  node("feFuncA", { type: "linear", slope: 0.18 }, shadeMask);
  node(
    "feComposite",
    { in: "surfaceShade", in2: "shadeMask", operator: "in", result: "shade" },
    filter,
  );
  node(
    "feBlend",
    { in: "refracted", in2: "shade", mode: "multiply", result: "glass" },
    filter,
  );
  node("feBlend", { in: "glass", in2: "glint", mode: "screen" }, filter);
  const overlay = document.createElement("div");
  overlay.className = "fluid-cursor";
  overlay.setAttribute("aria-hidden", "true");
  overlay.hidden = true;
  document.body.append(definitions, overlay);
  const map = document.createElement("canvas");
  const context = map.getContext("2d", { alpha: false });
  const particles = [];
  let previous = null,
    frame = 0,
    lastDraw = 0,
    disposed = false;
  let density = new Float32Array(0),
    pixels,
    columns = 0,
    rows = 0;

  function clear() {
    particles.length = 0;
    previous = null;
    cancelAnimationFrame(frame);
    frame = 0;
    overlay.hidden = true;
    overlay.style.removeProperty("backdrop-filter");
  }
  function schedule() {
    if (!frame && !disposed) frame = requestAnimationFrame(draw);
  }
  function move(event) {
    if (event.pointerType !== "mouse" || reduced.matches || document.hidden)
      return;
    // Do not paint over boot or route loading overlays.
    if (
      document.querySelector(".boot-loader:not(.done)") ||
      document.querySelector(".route-transition-layer")
    ) {
      previous = null;
      return;
    }
    const now = performance.now();
    const point = { x: event.clientX, y: event.clientY, time: now };
    if (!previous || now - previous.time > 180) {
      previous = point;
      return;
    }
    const dx = point.x - previous.x,
      dy = point.y - previous.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1.2) return;
    const elapsed = Math.max(10, now - previous.time);
    const speed = Math.min(2400, (distance / elapsed) * 1000);
    const radius = 6 + Math.min(20, speed * 0.013);
    const count = Math.min(
      32,
      Math.ceil(distance / Math.max(5, radius * 0.35)),
    );
    const tx = dx / distance,
      ty = dy / distance;
    for (let i = 1; i <= count; i++) {
      const fraction = i / count;
      particles.push({
        x: previous.x + dx * fraction,
        y: previous.y + dy * fraction,
        born: now,
        life: 1200 + speed * 0.25,
        radius,
        tx,
        ty,
        drift: speed * 0.014,
        phase: (point.x + point.y * 1.7) * 0.017,
      });
    }
    if (particles.length > 160) particles.splice(0, particles.length - 160);
    previous = point;
    schedule();
  }
  function draw(now) {
    frame = 0;
    if (disposed || document.hidden || reduced.matches) {
      clear();
      return;
    }
    if (now - lastDraw < 32) {
      schedule();
      return;
    }
    lastDraw = now;
    for (let i = particles.length - 1; i >= 0; i--)
      if (now - particles[i].born >= particles[i].life) particles.splice(i, 1);
    if (!particles.length) {
      clear();
      return;
    }
    let minX = innerWidth,
      minY = innerHeight,
      maxX = 0,
      maxY = 0;
    const samples = particles.map((p) => {
      const age = clamp((now - p.born) / p.life);
      const curl = Math.sin(age * 5.5 + p.phase) * age * (1 - age) * 22;
      const x = p.x + p.tx * p.drift * age - p.ty * curl;
      const y = p.y + p.ty * p.drift * age + p.tx * curl;
      const radius = p.radius * (0.72 + 0.28 * (1 - age));
      minX = Math.min(minX, x - radius - 48);
      minY = Math.min(minY, y - radius - 48);
      maxX = Math.max(maxX, x + radius + 48);
      maxY = Math.max(maxY, y + radius + 48);
      return { ...p, x, y, radius, fade: (1 - age) ** 1.7 };
    });
    const left = Math.max(0, Math.floor(minX)),
      top = Math.max(0, Math.floor(minY));
    const width = Math.min(innerWidth, Math.ceil(maxX)) - left;
    const height = Math.min(innerHeight, Math.ceil(maxY)) - top;
    if (width <= 0 || height <= 0) {
      clear();
      return;
    }
    // The cropped simulation grid limits CPU work to the moving trail.
    const cell = Math.max(2, Math.max(width, height) / 420);
    const nextColumns = Math.ceil(width / cell),
      nextRows = Math.ceil(height / cell);
    if (nextColumns !== columns || nextRows !== rows) {
      columns = nextColumns;
      rows = nextRows;
      map.width = columns;
      map.height = rows;
      density = new Float32Array(columns * rows);
      pixels = context.createImageData(columns, rows);
    } else density.fill(0);
    for (const p of samples) {
      const x = (p.x - left) / cell,
        y = (p.y - top) / cell,
        r = p.radius / cell;
      const fromX = Math.max(1, Math.floor(x - r * 1.5)),
        toX = Math.min(columns - 2, Math.ceil(x + r * 1.5));
      const fromY = Math.max(1, Math.floor(y - r * 1.5)),
        toY = Math.min(rows - 2, Math.ceil(y + r * 1.5));
      for (let gy = fromY; gy <= toY; gy++)
        for (let gx = fromX; gx <= toX; gx++) {
          const rx = (gx - x) / r,
            ry = (gy - y) / r;
          const across = -rx * p.ty + ry * p.tx;
          const along = rx * p.tx + ry * p.ty;
          const d = across * across + along * along * 0.65;
          if (d < 2.2)
            density[gy * columns + gx] += Math.exp(-d * 3.4) * p.fade * 0.48;
        }
    }
    const rgba = pixels.data;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < columns; x++) {
        const i = y * columns + x,
          b = i * 4;
        const dx =
          x > 0 && x < columns - 1 ? density[i + 1] - density[i - 1] : 0;
        const dy =
          y > 0 && y < rows - 1
            ? density[i + columns] - density[i - columns]
            : 0;
        rgba[b] = clamp(128 + dx * 190, 0, 255);
        rgba[b + 1] = clamp(128 + dy * 190, 0, 255);
        rgba[b + 2] = clamp(density[i] * 100, 0, 210);
        rgba[b + 3] = 255;
      }
    context.putImageData(pixels, 0, 0);
    image.setAttribute("href", map.toDataURL("image/png"));
    Object.assign(overlay.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
      backdropFilter: "url(#portfolio-cursor-refraction)",
    });
    overlay.hidden = false;
    schedule();
  }
  const leave = () => {
    previous = null;
  };
  const visibility = () => {
    if (document.hidden) clear();
  };
  document.addEventListener("pointermove", move, { passive: true });
  document.documentElement.addEventListener("pointerleave", leave);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("blur", clear);
  window.addEventListener("resize", clear, { passive: true });
  reduced.addEventListener("change", clear);
  return {
    clear,
    dispose() {
      disposed = true;
      clear();
      document.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", clear);
      window.removeEventListener("resize", clear);
      reduced.removeEventListener("change", clear);
      definitions.remove();
      overlay.remove();
    },
  };
}
