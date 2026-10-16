// The controls are real DOM. Three.js only supplies the original metal shells,
// studio lighting and orbit; the complete interaction survives a GPU failure.
const defaults = {
  count: 0,
  dark: false,
  radius: 24,
  exploded: true,
  rotateX: -8,
  rotateY: -14,
};
const state = { ...defaults };
const subscribers = new Set();
const manualRoles = new Set();
let threeModule;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const mix = (a, b, t) => a + (b - a) * t;
const radians = (degrees) => (degrees * Math.PI) / 180;
const layouts = {
  desktop: {
    status: {
      size: [560, 360],
      assembled: [0, 0, 0, 0],
      exploded: [-15, -15, -80, -2],
    },
    action: {
      size: [242, 112],
      assembled: [-135, 54, 24, 0],
      exploded: [-303, 111, 190, -7],
    },
    theme: {
      size: [172, 84],
      assembled: [168, -54, 24, 0],
      exploded: [272, -127, 150, 8],
    },
    radius: {
      size: [264, 110],
      assembled: [151, 75, 24, 0],
      exploded: [273, 151, 220, -5],
    },
  },
  mobile: {
    status: {
      size: [310, 390],
      assembled: [0, 0, 0, 0],
      exploded: [0, -50, -70, -3],
    },
    action: {
      size: [200, 104],
      assembled: [-45, -6, 24, 0],
      exploded: [-47, 37, 120, -7],
    },
    theme: {
      size: [146, 88],
      assembled: [71, -95, 24, 0],
      exploded: [95, -131, 130, 8],
    },
    radius: {
      size: [270, 108],
      assembled: [0, 96, 24, 0],
      exploded: [28, 183, 160, -4],
    },
  },
};

function publish(patch, event = {}) {
  if (event.reset) manualRoles.clear();
  Object.assign(state, patch);
  for (const notify of subscribers) notify(event);
}

function makePlayground(host) {
  const viewport = host.querySelector("[data-pg-viewport]");
  const assembly = host.querySelector("[data-pg-assembly]");
  const rendererHost = host.querySelector("[data-pg-renderer]");
  const pieces = new Map(
    [...host.querySelectorAll("[data-pg-piece]")].map((piece) => [
      piece.dataset.pgPiece,
      piece,
    ]),
  );
  const theme = host.querySelector("[data-pg-theme]");
  const radius = host.querySelector("[data-pg-radius]");
  const assemble = host.querySelector("[data-pg-assemble]");
  const explode = host.querySelector("[data-pg-explode]");
  const announcement = host.querySelector("[data-pg-announcement]");
  if (!viewport || !assembly || !theme || !radius) return () => {};
  const story = host.closest("[data-story]");
  const role = story ? "story" : "hero";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const compact = matchMedia("(max-width: 700px)");
  const fine = matchMedia("(pointer: fine)");
  const removers = [];
  let disposed = false;
  let visible = false;
  let loading = false;
  let webgl = null;
  let frame = 0;
  let last = 0;
  let width = 0;
  let height = 0;
  let scale = 1;
  let drag = null;
  const pose = {
    spread: Number(state.exploded),
    rotateX: state.rotateX,
    rotateY: state.rotateY,
  };

  function listen(target, name, fn, options) {
    if (!target) return;
    target.addEventListener(name, fn, options);
    removers.push(() => target.removeEventListener(name, fn, options));
  }

  function requestFrame() {
    if (!disposed && visible && !document.hidden && !frame)
      frame = requestAnimationFrame(render);
  }

  function values(event = {}) {
    host.dataset.theme = state.dark ? "dark" : "light";
    host.style.setProperty("--pg-radius", `${state.radius}px`);
    host.style.setProperty("--pg-fill", `${((state.radius - 4) / 32) * 100}%`);
    theme.checked = state.dark;
    radius.value = String(state.radius);
    for (const node of host.querySelectorAll("[data-pg-count]"))
      node.textContent = String(state.count).padStart(2, "0");
    for (const node of host.querySelectorAll("[data-pg-count-value]"))
      node.textContent = String(state.count);
    for (const node of host.querySelectorAll("[data-pg-radius-value]"))
      node.textContent = String(state.radius);
    for (const node of host.querySelectorAll("[data-pg-theme-value]"))
      node.textContent = state.dark
        ? host.dataset.labelDark
        : host.dataset.labelLight;
    showView(targetPose().spread);
    if (event.reset && announcement)
      announcement.textContent = host.dataset.labelReset;
    requestFrame();
  }

  function targetPose() {
    let spread = Number(state.exploded);
    let turn = 0;
    if (story && !manualRoles.has(role) && !reduced.matches) {
      const style = getComputedStyle(story);
      const storySpread = parseFloat(style.getPropertyValue("--play-explode"));
      const storyTurn = parseFloat(style.getPropertyValue("--play-turn"));
      if (Number.isFinite(storySpread)) spread = clamp(storySpread, 0, 1);
      if (Number.isFinite(storyTurn)) turn = clamp(storyTurn, -1, 1) * 24;
    }
    return { spread, turn };
  }

  function showView(spread) {
    const isExploded = spread > 0.5;
    const next = String(isExploded);
    if (explode?.getAttribute("aria-pressed") !== next) {
      assemble?.setAttribute("aria-pressed", String(!isExploded));
      explode?.setAttribute("aria-pressed", next);
    }
    const label = isExploded
      ? host.dataset.labelExploded
      : host.dataset.labelAssembled;
    const output = host.querySelector("[data-pg-view]");
    if (output && output.textContent !== label) output.textContent = label;
  }

  function resize() {
    const rect = viewport.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    if (!width || !height) return;
    scale = compact.matches
      ? Math.min(0.98, (width - 24) / 390, (height - 15) / 515)
      : Math.min(1.1, (width - 80) / 940, (height - 40) / 520);
    scale = Math.max(0.5, scale);
    host.style.setProperty("--pg-scale", String(scale));
    webgl?.resize(width, height, compact.matches);
    requestFrame();
  }

  async function initialize3D() {
    if (loading || webgl || disposed) return;
    loading = true;
    try {
      threeModule ||= import("./vendor/three/three.module.js");
      const THREE = await threeModule;
      if (disposed) return;
      webgl = createShells(THREE, rendererHost);
      webgl.resize(width, height, compact.matches);
      host.dataset.webgl = "ready";
      requestFrame();
    } catch {
      // The original CSS casing and every DOM control remain usable.
      webgl?.dispose();
      webgl = null;
      host.dataset.webgl = "fallback";
    }
  }

  function render(now) {
    frame = 0;
    if (disposed || !visible || document.hidden) return;
    if (!reduced.matches && last && now - last < 30) {
      requestFrame();
      return;
    }
    const delta = last ? Math.min(80, now - last) : 80;
    last = now;
    const { spread, turn } = targetPose();
    showView(spread);
    const smoothing = reduced.matches || drag ? 1 : 1 - Math.exp(-delta / 125);
    pose.spread = mix(pose.spread, spread, smoothing);
    pose.rotateX = mix(pose.rotateX, state.rotateX, smoothing);
    pose.rotateY = mix(pose.rotateY, state.rotateY + turn, smoothing);
    const breathing =
      reduced.matches || drag ? 0 : Math.sin(now * 0.00042) * 0.65;
    const rx = pose.rotateX * (compact.matches ? 0.45 : 1);
    const ry = pose.rotateY * (compact.matches ? 0.55 : 1) + breathing;
    assembly.style.transform = `scale(${scale}) rotateX(${rx}deg) rotateY(${ry}deg)`;
    const layout = compact.matches ? layouts.mobile : layouts.desktop;
    const positions = {};
    let index = 0;
    for (const [name, element] of pieces) {
      const entry = layout[name];
      if (!entry) continue;
      const next = entry.assembled.map((value, i) =>
        mix(value, entry.exploded[i], pose.spread),
      );
      if (!reduced.matches && !drag)
        next[1] += Math.sin(now * 0.00065 + index * 1.6) * pose.spread * 2;
      element.style.transform = `translate3d(${next[0]}px, ${next[1]}px, ${next[2]}px) rotateZ(${next[3]}deg) translate(-50%, -50%)`;
      positions[name] = { pose: next, size: entry.size };
      index++;
    }
    webgl?.render({
      width,
      height,
      scale,
      rx,
      ry,
      positions,
      radius: state.radius,
      dark: state.dark,
    });
    if (!reduced.matches) requestFrame();
  }

  listen(host.querySelector("[data-pg-action]"), "click", () => {
    publish({ count: state.count + 1 });
    if (announcement)
      announcement.textContent = `${state.count} ${host.querySelector(".pg-count-display > span").textContent}`;
  });
  listen(theme, "change", () => publish({ dark: theme.checked }));
  listen(radius, "input", () =>
    publish({ radius: clamp(Number(radius.value), 4, 36) }),
  );
  listen(assemble, "click", () => {
    manualRoles.add(role);
    publish({ exploded: false });
    if (announcement) announcement.textContent = host.dataset.labelAssembled;
  });
  listen(explode, "click", () => {
    manualRoles.add(role);
    publish({ exploded: true });
    if (announcement) announcement.textContent = host.dataset.labelExploded;
  });
  listen(host.querySelector("[data-pg-reset]"), "click", () =>
    publish({ ...defaults }, { reset: true }),
  );
  for (const button of host.querySelectorAll("[data-pg-turn]"))
    listen(button, "click", () => {
      manualRoles.add(role);
      publish({
        rotateY: clamp(
          state.rotateY + Number(button.dataset.pgTurn) * 12,
          -38,
          38,
        ),
      });
    });

  function releaseDrag() {
    const previous = drag;
    drag = null;
    if (previous && viewport.hasPointerCapture?.(previous.id))
      viewport.releasePointerCapture(previous.id);
    delete viewport.dataset.dragging;
  }
  listen(viewport, "pointerdown", (event) => {
    if (
      compact.matches ||
      !fine.matches ||
      event.pointerType !== "mouse" ||
      event.button !== 0 ||
      event.target.closest(".pg-piece, button, input, label, a")
    )
      return;
    manualRoles.add(role);
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      rx: state.rotateX,
      ry: state.rotateY,
    };
    viewport.dataset.dragging = "";
    viewport.setPointerCapture(event.pointerId);
  });
  listen(viewport, "pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    publish({
      rotateX: clamp(drag.rx - (event.clientY - drag.y) * 0.14, -26, 24),
      rotateY: clamp(drag.ry + (event.clientX - drag.x) * 0.14, -38, 38),
    });
  });
  listen(viewport, "pointerup", releaseDrag);
  listen(viewport, "pointercancel", releaseDrag);
  listen(viewport, "lostpointercapture", releaseDrag);
  listen(document, "visibilitychange", () => {
    last = 0;
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
      releaseDrag();
    } else requestFrame();
  });
  listen(reduced, "change", () => {
    last = 0;
    requestFrame();
  });
  listen(compact, "change", () => {
    releaseDrag();
    resize();
  });
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(viewport);
  const observer = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        resize();
        initialize3D();
        requestFrame();
      } else {
        cancelAnimationFrame(frame);
        frame = 0;
        last = 0;
        releaseDrag();
      }
    },
    { rootMargin: "100px" },
  );
  observer.observe(host);
  subscribers.add(values);
  values();
  resize();

  return () => {
    if (disposed) return;
    disposed = true;
    releaseDrag();
    cancelAnimationFrame(frame);
    observer.disconnect();
    resizeObserver.disconnect();
    subscribers.delete(values);
    for (const remove of removers) remove();
    webgl?.dispose();
  };
}

function createShells(T, host) {
  const renderer = new T.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.append(renderer.domElement);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(30, 1, 1, 3500);
  camera.position.z = 1100;
  const object = new T.Group();
  scene.add(object);
  const silver = new T.MeshStandardMaterial({
    color: 0xc6cedb,
    metalness: 0.94,
    roughness: 0.23,
  });
  const dark = new T.MeshStandardMaterial({
    color: 0x252a34,
    metalness: 0.82,
    roughness: 0.26,
  });
  const blue = new T.MeshStandardMaterial({
    color: 0x153dff,
    metalness: 0.55,
    roughness: 0.23,
  });
  const shells = new Map();
  const studio = new T.Scene();
  studio.background = new T.Color(0x687080);
  const plane = new T.PlaneGeometry(1, 1);
  for (const [x, y, z, width, height, color, power] of [
    [-4, 3, 3, 3, 7, 0xffffff, 5],
    [4, 1, 0, 2, 5, 0xe9f1ff, 4],
    [0, 5, -2, 7, 2, 0xffffff, 4],
    [2, -3, 1, 3, 4, 0x204cff, 2],
  ]) {
    const material = new T.MeshBasicMaterial({ color, side: T.DoubleSide });
    material.color.multiplyScalar(power);
    const panel = new T.Mesh(plane, material);
    panel.position.set(x, y, z);
    panel.scale.set(width, height, 1);
    panel.lookAt(0, 0, 0);
    studio.add(panel);
  }
  const pmrem = new T.PMREMGenerator(renderer);
  let environment;
  try {
    environment = pmrem.fromScene(studio, 0.06);
    scene.environment = environment.texture;
  } catch {
    // Direct lights also give the casing a useful fallback.
  } finally {
    pmrem.dispose();
    plane.dispose();
    studio.traverse((node) => node.material?.dispose());
  }
  const key = new T.DirectionalLight(0xffffff, 4);
  key.position.set(-400, 600, 800);
  const edge = new T.DirectionalLight(0x4063ff, 1.5);
  edge.position.set(600, -100, 500);
  scene.add(key, edge, new T.HemisphereLight(0xf6f8ff, 0x788398, 2));
  const orbitMaterial = new T.MeshStandardMaterial({
    color: 0xa6b3cb,
    metalness: 0.75,
    roughness: 0.34,
    transparent: true,
    opacity: 0.42,
  });
  const orbit = new T.Mesh(
    new T.TorusGeometry(414, 0.7, 6, 128),
    orbitMaterial,
  );
  orbit.rotation.set(1.08, -0.15, -0.2);
  orbit.position.set(0, -130, -220);
  object.add(orbit);
  const arc = new T.Mesh(
    new T.TorusGeometry(414, 1.2, 6, 64, Math.PI * 0.25),
    blue,
  );
  arc.rotation.copy(orbit.rotation);
  arc.position.copy(orbit.position);
  object.add(arc);

  function casing(width, height, radius) {
    const w = width / 2 + 7;
    const h = height / 2 + 7;
    const r = Math.min(radius + 7, h - 1);
    const shape = new T.Shape();
    shape.moveTo(-w + r, -h);
    shape.lineTo(w - r, -h);
    shape.quadraticCurveTo(w, -h, w, -h + r);
    shape.lineTo(w, h - r);
    shape.quadraticCurveTo(w, h, w - r, h);
    shape.lineTo(-w + r, h);
    shape.quadraticCurveTo(-w, h, -w, h - r);
    shape.lineTo(-w, -h + r);
    shape.quadraticCurveTo(-w, -h, -w + r, -h);
    const geometry = new T.ExtrudeGeometry(shape, {
      depth: 9,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 3,
      bevelThickness: 3,
      curveSegments: 6,
    });
    geometry.translate(0, 0, -16);
    return geometry;
  }

  return {
    resize(width, height, compact) {
      if (!width || !height) return;
      renderer.setPixelRatio(
        Math.min(devicePixelRatio || 1, compact ? 1.1 : 1.4),
      );
      renderer.setSize(width, height, false);
      camera.fov = T.MathUtils.radToDeg(2 * Math.atan(height / 2200));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      orbit.visible = arc.visible = !compact;
    },
    render({ height, scale, rx, ry, positions, radius, dark: isDark }) {
      object.position.y = height * 0.04;
      object.rotation.set(-radians(rx), radians(ry), 0, "XYZ");
      object.scale.setScalar(scale);
      for (const [name, { pose, size }] of Object.entries(positions)) {
        const signature = `${size[0]}:${size[1]}:${radius}`;
        let shell = shells.get(name);
        if (!shell) {
          shell = new T.Mesh(casing(...size, radius), silver);
          object.add(shell);
          shells.set(name, shell);
          shell.userData.signature = signature;
        } else if (shell.userData.signature !== signature) {
          shell.geometry.dispose();
          shell.geometry = casing(...size, radius);
          shell.userData.signature = signature;
        }
        shell.material = name === "action" ? blue : isDark ? dark : silver;
        shell.position.set(pose[0], -pose[1], pose[2]);
        shell.rotation.z = -radians(pose[3]);
      }
      renderer.render(scene, camera);
    },
    dispose() {
      scene.traverse((node) => node.geometry?.dispose());
      silver.dispose();
      dark.dispose();
      blue.dispose();
      orbitMaterial.dispose();
      environment?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

export function createPlaygrounds(root = document) {
  const hosts = [...root.querySelectorAll("[data-playground]")];
  if (root.matches?.("[data-playground]")) hosts.unshift(root);
  const dispose = hosts.map(makePlayground);
  return { dispose: () => dispose.forEach((cleanup) => cleanup()) };
}
