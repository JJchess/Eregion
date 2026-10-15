// The homepage stays complete without this optional, locally hosted 3D module.
const art = document.querySelector("[data-hero]");
const sceneElement = document.querySelector("[data-scene]");
const controls = document.querySelector("[data-hero-controls]");
const explodeButton = document.querySelector("[data-explode]");
const resetButton = document.querySelector("[data-reset]");
const caption = document.querySelector("[data-scene-caption]");
const status = document.querySelector("[data-hero-status]");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let disposeScene = () => {};

function fallback() {
  disposeScene();
  art.dataset.state = "fallback";
  controls.hidden = true;
  document.querySelector("[data-fallback-note]").hidden = false;
  sceneElement.setAttribute("aria-label", "银白色 JJ 立体标识，静态预览");
  caption.textContent = "AN IDEA TAKING SHAPE.";
}

async function initialize() {
  try {
    const THREE = await import("./vendor/three/three.module.js");
    createScene(THREE);
  } catch (error) {
    console.info("JJ preview is using its static fallback.", error.message);
    fallback();
  }
}

function createScene(T) {
  const compact = matchMedia("(max-width: 700px)").matches;
  const renderer = new T.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");
  renderer.setPixelRatio(Math.min(devicePixelRatio, compact ? 1.25 : 1.5));
  renderer.setClearColor(0x080b11, 0);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  sceneElement.append(canvas);
  // If initialization fails before the complete scene exists, release the context too.
  disposeScene = () => {
    renderer.dispose();
    canvas.remove();
  };

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(36, 1, 0.1, 80);
  camera.position.set(0, 0.35, 8.8);
  camera.lookAt(0, -0.1, 0);
  // An original procedural studio environment: no external textures or models.
  const studio = new T.Scene();
  studio.background = new T.Color(0x182130);
  const panelGeometry = new T.PlaneGeometry(1, 1);
  function panel(color, intensity, x, y, z, w, h) {
    const light = new T.Mesh(
      panelGeometry,
      new T.MeshBasicMaterial({ color, side: T.DoubleSide }),
    );
    light.material.color.multiplyScalar(intensity);
    light.position.set(x, y, z);
    light.scale.set(w, h, 1);
    light.lookAt(0, 0, 0);
    studio.add(light);
  }
  panel(0xffffff, 5, -4, 3, 3, 3, 7);
  panel(0xddeaff, 4, 3, 4, 1, 2, 7);
  panel(0xffffff, 3, 0, 5, -3, 7, 2);
  panel(0x3267ff, 5, 4, -1, -2, 3, 6);
  panel(0x4663b6, 2, -3, -3, 2, 6, 2);
  const pmrem = new T.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(studio, 0.05);
  scene.environment = environment.texture;
  pmrem.dispose();
  panelGeometry.dispose();
  studio.traverse((node) => node.material?.dispose());
  const silver = new T.MeshStandardMaterial({
    color: 0xcbd3e1,
    metalness: 1,
    roughness: 0.21,
    envMapIntensity: 1.15,
  });
  const blue = new T.MeshStandardMaterial({
    color: 0x416eff,
    metalness: 0.65,
    roughness: 0.24,
    emissive: 0x1748f5,
    emissiveIntensity: 1.8,
  });
  scene.add(new T.HemisphereLight(0xc5ddff, 0x080b11, 2));
  const keyLight = new T.DirectionalLight(0xf5f7ff, 2.5);
  keyLight.position.set(-3, 4, 5);
  scene.add(keyLight);
  const rig = new T.Group();
  scene.add(rig);
  const pieces = [];
  const pickables = [];
  function rectangle(x1, y1, x2, y2) {
    const shape = new T.Shape();
    shape.moveTo(x1, y1);
    shape.lineTo(x2, y1);
    shape.lineTo(x2, y2);
    shape.lineTo(x1, y2);
    shape.closePath();
    return shape;
  }
  const capShape = rectangle(-0.68, 0.98, 0.68, 1.5);
  const stemShape = rectangle(0.12, -0.35, 0.68, 0.85);
  const hookShape = new T.Shape();
  hookShape.moveTo(0.68, -0.48);
  hookShape.lineTo(0.68, -0.66);
  hookShape.bezierCurveTo(0.68, -1.25, 0.33, -1.5, -0.23, -1.5);
  hookShape.bezierCurveTo(-0.8, -1.5, -1.05, -1.17, -1.05, -0.69);
  hookShape.lineTo(-0.48, -0.69);
  hookShape.quadraticCurveTo(-0.48, -0.97, -0.21, -0.97);
  hookShape.quadraticCurveTo(0.12, -0.97, 0.12, -0.64);
  hookShape.lineTo(0.12, -0.48);
  hookShape.closePath();
  const geometries = [capShape, stemShape, hookShape].map(
    (shape) =>
      new T.ExtrudeGeometry(shape, {
        depth: 0.48,
        bevelEnabled: true,
        bevelSegments: compact ? 3 : 5,
        steps: 1,
        bevelSize: 0.05,
        bevelThickness: 0.06,
        curveSegments: compact ? 16 : 24,
      }),
  );
  for (let letterIndex = 0; letterIndex < 2; letterIndex++) {
    const letter = new T.Group();
    letter.position.set(
      letterIndex ? 0.99 : -0.83,
      letterIndex ? -0.12 : 0.18,
      letterIndex ? 0.18 : -0.08,
    );
    rig.add(letter);
    geometries.forEach((geometry, index) => {
      const mesh = new T.Mesh(geometry, silver);
      mesh.position.z = -0.24;
      letter.add(mesh);
      pieces.push({
        mesh,
        base: mesh.position.clone(),
        offset: new T.Vector3(
          (letterIndex ? 1 : -1) * (index === 1 ? 0.22 : 0.12),
          [0.62, 0, -0.6][index],
          [0.25, 0.7, 0.15][index],
        ),
        tilt: (letterIndex ? -1 : 1) * (index - 1) * 0.1,
      });
      pickables.push(mesh);
    });
    for (const y of [0.915, -0.415]) {
      const seam = new T.Mesh(new T.BoxGeometry(0.57, 0.025, 0.5), blue);
      seam.position.set(0.4, y, 0);
      letter.add(seam);
      pieces.push({
        mesh: seam,
        base: seam.position.clone(),
        offset: new T.Vector3(
          letterIndex ? 0.12 : -0.12,
          y > 0 ? 0.3 : -0.3,
          -0.25,
        ),
        tilt: 0,
      });
    }
  }
  // A faint orbital line provides orientation without a rectangular canvas backdrop.
  const orbit = new T.Mesh(
    new T.TorusGeometry(2.65, 0.005, 4, 100),
    new T.MeshBasicMaterial({
      color: 0x46628e,
      transparent: true,
      opacity: 0.32,
    }),
  );
  orbit.rotation.x = Math.PI / 2.4;
  orbit.position.y = -1.9;
  scene.add(orbit);
  const raycaster = new T.Raycaster();
  const pointer = new T.Vector2();
  let exploded = false;
  let spread = reducedMotion.matches ? 0 : 0.65;
  let rotationX = 0.12,
    rotationY = -0.43;
  let targetX = rotationX,
    targetY = rotationY;
  let hoverX = 0,
    hoverY = 0;
  let drag = null;
  let raf = 0,
    lastTime = 0,
    elapsed = 0,
    visible = true,
    disposed = false;
  let frames = 0;

  const setState = () => {
    explodeButton.setAttribute("aria-pressed", String(exploded));
    explodeButton.innerHTML = `${exploded ? "重组" : "拆解"} <span aria-hidden="true">${exploded ? "↙" : "↗"}</span>`;
    caption.textContent = exploded
      ? "TAKE IT APART. MAKE IT YOURS."
      : "DRAG TO ROTATE. CLICK TO EXPLORE.";
    status.textContent = exploded
      ? "JJ 标识已拆解，可以继续旋转探索"
      : "JJ 标识已重组";
    art.dataset.exploded = String(exploded);
  };
  const toggle = () => {
    exploded = !exploded;
    setState();
    wake();
  };
  const reset = () => {
    exploded = false;
    targetX = 0.12;
    targetY = -0.43;
    hoverX = 0;
    hoverY = 0;
    setState();
    wake();
  };
  const abort = new AbortController();
  const listen = (target, type, listener, extra = {}) =>
    target.addEventListener(type, listener, { signal: abort.signal, ...extra });
  listen(explodeButton, "click", toggle);
  listen(resetButton, "click", reset);
  listen(canvas, "pointerdown", (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: targetX,
      startY: targetY,
      distance: 0,
      touch: event.pointerType === "touch",
    };
    canvas.setPointerCapture(event.pointerId);
  });
  listen(canvas, "pointermove", (event) => {
    if (drag && event.pointerId === drag.id) {
      const dx = event.clientX - drag.x,
        dy = event.clientY - drag.y;
      drag.distance = Math.max(drag.distance, Math.hypot(dx, dy));
      if (drag.touch && Math.abs(dy) > Math.abs(dx) && Math.abs(dx) < 12)
        return;
      targetY = drag.startY + dx * 0.008;
      if (!drag.touch)
        targetX = T.MathUtils.clamp(drag.startX + dy * 0.005, -0.7, 0.7);
      wake();
    } else if (event.pointerType !== "touch" && !reducedMotion.matches) {
      const rect = canvas.getBoundingClientRect();
      hoverX = ((event.clientX - rect.left) / rect.width - 0.5) * 0.12;
      hoverY = ((event.clientY - rect.top) / rect.height - 0.5) * 0.06;
      wake();
    }
  });
  listen(canvas, "pointerup", (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const wasClick = drag.distance < 6;
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId))
      canvas.releasePointerCapture(event.pointerId);
    if (!wasClick) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.intersectObjects(pickables).length) toggle();
  });
  listen(canvas, "pointercancel", () => {
    drag = null;
  });
  listen(canvas, "lostpointercapture", () => {
    drag = null;
  });
  listen(canvas, "pointerleave", () => {
    hoverX = 0;
    hoverY = 0;
  });

  function render(time) {
    raf = 0;
    if (disposed || !visible || document.hidden) {
      art.dataset.rendering = "paused";
      return;
    }
    // Touch devices need at most 30 fps. A low-power desktop loop caps at 60.
    const minStep = compact ? 1000 / 30 : 1000 / 60;
    if (lastTime && time - lastTime < minStep - 1) {
      raf = requestAnimationFrame(render);
      return;
    }
    const dt = lastTime ? Math.min((time - lastTime) / 1000, 0.06) : 0.016;
    lastTime = time;
    elapsed += dt;
    const easing = reducedMotion.matches ? 1 : 1 - Math.exp(-dt * 7);
    spread += ((exploded ? 1 : 0) - spread) * easing;
    rotationX += (targetX - rotationX) * easing;
    rotationY += (targetY - rotationY) * easing;
    const ambient = reducedMotion.matches ? 0 : Math.sin(elapsed * 0.65);
    rig.rotation.set(
      rotationX + hoverY,
      rotationY + hoverX + ambient * 0.035,
      -0.12,
    );
    rig.position.y = reducedMotion.matches
      ? 0
      : Math.sin(elapsed * 0.85) * 0.045;
    pieces.forEach(({ mesh, base, offset, tilt }) => {
      mesh.position.copy(base).addScaledVector(offset, spread);
      mesh.rotation.z = tilt * spread;
    });
    camera.position.z = (compact ? 9.1 : 8.8) + spread * 0.75;
    renderer.render(scene, camera);
    frames += 1;
    art.dataset.rendering = reducedMotion.matches ? "still" : "active";
    art.dataset.frames = String(frames);
    if (!reducedMotion.matches) raf = requestAnimationFrame(render);
  }
  function wake() {
    if (disposed || !visible || document.hidden || raf) return;
    raf = requestAnimationFrame(render);
  }
  const resize = new ResizeObserver(() => {
    if (disposed) return;
    const { width, height } = sceneElement.getBoundingClientRect();
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
    wake();
  });
  resize.observe(sceneElement);
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible) {
      cancelAnimationFrame(raf);
      raf = 0;
      lastTime = 0;
      art.dataset.rendering = "paused";
    } else wake();
  });
  observer.observe(art);
  listen(document, "visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
      lastTime = 0;
      art.dataset.rendering = "paused";
    } else wake();
  });
  listen(reducedMotion, "change", () => {
    hoverX = 0;
    hoverY = 0;
    wake();
  });
  disposeScene = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    abort.abort();
    resize.disconnect();
    observer.disconnect();
    const geometrySet = new Set(),
      materialSet = new Set();
    scene.traverse((node) => {
      if (node.geometry) geometrySet.add(node.geometry);
      if (node.material) materialSet.add(node.material);
    });
    geometrySet.forEach((geometry) => geometry.dispose());
    materialSet.forEach((material) => material.dispose());
    environment.dispose();
    renderer.dispose();
    canvas.remove();
    art.dataset.rendering = "paused";
  };
  listen(canvas, "webglcontextlost", (event) => {
    event.preventDefault();
    fallback();
  });
  // Draw one complete frame before fading out the fallback.
  const rect = sceneElement.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
  render(performance.now());
  art.dataset.state = "ready";
  controls.hidden = false;
  caption.textContent = "DRAG TO ROTATE. CLICK TO EXPLORE.";
}

const startObserver = new IntersectionObserver(
  ([entry]) => {
    if (!entry.isIntersecting) return;
    startObserver.disconnect();
    initialize();
  },
  { rootMargin: "100px" },
);
startObserver.observe(art);
