import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import fontData from 'three/examples/fonts/helvetiker_bold.typeface.json';
import { createSky, devIcon, DEV_ICONS, softDot } from './space.js';

// The page scroll drives the camera down a winding path through deep space.
// A glowing double-helix orbit spirals around the path, carrying a continuous
// stream of 3D dev icons, while a small "request" craft flies ahead. The hero name is real extruded 3D type, and the
// core-stack section shows one 3D emblem (with a 3D label) per tech.

const BG = 0x02030a;
const START_Z = 10;
const DEPTH = 150;
const font = new FontLoader().parse(fontData);

const pathX = (z) => Math.sin(z * 0.045) * 2.2;
const pathY = (z) => Math.cos(z * 0.06) * 1.1;

function mulberry32(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (a, b, v) => {
  const x = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};

const gloss = (color, extra = {}) => new THREE.MeshPhysicalMaterial({
  color, metalness: 0.35, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, ...extra
});
const neon = (color, intensity = 1.2) => new THREE.MeshStandardMaterial({ color: 0x0b0d18, emissive: color, emissiveIntensity: intensity });
const lines = (color, opacity) => new THREE.LineBasicMaterial({ color, transparent: true, opacity });

function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(220,224,232,0.4)');
  g.addColorStop(1, 'rgba(200,204,214,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- 3D type ---------- */

function textGeometry(text, size, depth) {
  const geo = new TextGeometry(text, {
    font, size, depth, curveSegments: 8,
    bevelEnabled: true, bevelThickness: depth * 0.08, bevelSize: size * 0.018, bevelSegments: 3
  });
  geo.computeBoundingBox();
  return geo;
}

// Centred single-mesh label: chrome face, glowing sides in the tech colour.
function label3d(text, color) {
  const geo = textGeometry(text, 0.42, 0.14);
  geo.center();
  return new THREE.Mesh(geo, [
    gloss(0xffffff, { metalness: 0.85, roughness: 0.2 }),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, metalness: 0.4, roughness: 0.4 })
  ]);
}

// Brushed-silver gradient baked into each glyph as vertex colours, bottom to top.
const SILVER_STOPS = [[0, 0x6e6e73], [0.36, 0xd8d8dd], [0.5, 0x9c9ca2], [0.68, 0xf5f5f7], [1, 0xffffff]].map(([t, hex]) => [t, new THREE.Color(hex)]);
function silverAt(t, out) {
  for (let i = 1; i < SILVER_STOPS.length; i++) {
    const [t1, c1] = SILVER_STOPS[i];
    const [t0, c0] = SILVER_STOPS[i - 1];
    if (t <= t1) return out.copy(c0).lerp(c1, (t - t0) / (t1 - t0));
  }
  return out.copy(SILVER_STOPS[SILVER_STOPS.length - 1][1]);
}

// Centred, silver-coloured glyph geometry, cached per character.
const glyphCache = new Map();
function glyph(ch) {
  if (glyphCache.has(ch)) return glyphCache.get(ch);
  const geo = textGeometry(ch, 1, 0.4);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    silverAt(THREE.MathUtils.clamp(pos.getY(i) / 0.74, 0, 1), col);
    colors.set([col.r, col.g, col.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const center = new THREE.Vector3();
  geo.boundingBox.getCenter(center);
  geo.translate(-center.x, -center.y, -center.z);
  const entry = { geo, center };
  glyphCache.set(ch, entry);
  return entry;
}
const SCRAMBLE = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$?'].filter((ch) => font.data.glyphs[ch]);
const randomGlyph = () => glyph(SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)]).geo;

// One mesh per letter so each can scramble, rise in, wave and react to the pointer.
function buildName(lineTexts) {
  const group = new THREE.Group();
  const face = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, metalness: 0.75, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.06
  });
  const side = new THREE.MeshPhysicalMaterial({
    color: 0x8e8e93, vertexColors: true, metalness: 0.9, roughness: 0.3, emissive: 0x2c2c2e, emissiveIntensity: 0.4
  });
  const scale = 1 / font.data.resolution;
  const letters = [];
  const lineWidths = [];
  lineTexts.forEach((text, line) => {
    let x = 0;
    for (const ch of text) {
      if (ch !== ' ') {
        const { geo, center } = glyph(ch);
        const mesh = new THREE.Mesh(geo, [face, side]);
        group.add(mesh);
        letters.push({ mesh, geo, line, x: x + center.x, y: center.y, lift: 0, nextSwap: 0, glitchUntil: 0, cooldown: 0 });
      }
      x += (font.data.glyphs[ch] || font.data.glyphs['?']).ha * scale + 0.04;
    }
    lineWidths.push(x - 0.04);
  });
  return { group, letters, lineWidths, materials: [face, side] };
}

/* ---------- tech emblems ---------- */

function orbiters(group, count, radius, geo, mats, tilt = 0) {
  const ring = new THREE.Group();
  ring.rotation.x = tilt;
  const items = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geo, mats[i % mats.length]);
    ring.add(m);
    items.push(m);
  }
  group.add(ring);
  return (t, speed = 0.8) => items.forEach((m, i) => {
    const a = t * speed + (i / count) * Math.PI * 2;
    m.position.set(Math.cos(a) * radius, Math.sin(a * 2) * 0.12, Math.sin(a) * radius);
    m.rotation.set(t + i, t * 0.7, 0);
  });
}

function buildReact() {
  const g = new THREE.Group();
  const cyan = 0x61dafb;
  const nucleus = new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 32), gloss(cyan, { emissive: cyan, emissiveIntensity: 0.7 }));
  g.add(nucleus);
  const orbitGeo = new THREE.TorusGeometry(1.3, 0.045, 16, 180);
  const orbitMat = gloss(cyan, { metalness: 0.5, emissive: cyan, emissiveIntensity: 0.45 });
  const electronGeo = new THREE.SphereGeometry(0.085, 16, 16);
  const orbits = [0, 1, 2].map((i) => {
    const pivot = new THREE.Group();
    pivot.rotation.z = (i * Math.PI) / 3;
    const ring = new THREE.Mesh(orbitGeo, orbitMat);
    ring.scale.y = 0.38;
    pivot.add(ring);
    const electron = new THREE.Mesh(electronGeo, neon(0xffffff, 2));
    pivot.add(electron);
    g.add(pivot);
    return electron;
  });
  g.userData.animate = (t) => {
    orbits.forEach((e, i) => {
      const a = t * 2.2 + i * 2.1;
      e.position.set(Math.cos(a) * 1.3, Math.sin(a) * 1.3 * 0.38, 0);
    });
    nucleus.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
  };
  return g;
}

function buildThree() {
  // A level-2 Sierpinski tetrahedron in polished silver, a nod to the three.js mark.
  const g = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.quaternion.setFromUnitVectors(new THREE.Vector3(1, 1, 1).normalize(), new THREE.Vector3(0, 1, 0));
  g.add(tilt);
  const geo = new THREE.TetrahedronGeometry(1);
  const edges = new THREE.EdgesGeometry(geo);
  const mats = [gloss(0xf5f5f7, { metalness: 0.95, roughness: 0.18 }), gloss(0xaeaeb2, { metalness: 0.95, roughness: 0.24 })];
  const corners = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]].map((v) => new THREE.Vector3(...v).normalize());
  const pieces = [];
  const place = (center, r, level) => {
    if (level === 0) {
      const m = new THREE.Mesh(geo, mats[pieces.length % 2]);
      m.scale.setScalar(r * 0.94);
      m.position.copy(center);
      m.add(new THREE.LineSegments(edges, lines(0xffffff, 0.5)));
      m.userData.home = center.clone();
      tilt.add(m);
      pieces.push(m);
      return;
    }
    corners.forEach((v) => place(center.clone().addScaledVector(v, r / 2), r / 2, level - 1));
  };
  place(new THREE.Vector3(), 1.55, 2);
  g.userData.animate = (t) => {
    pieces.forEach((m, i) => m.position.copy(m.userData.home).multiplyScalar(1 + Math.max(0, Math.sin(t * 1.5 + i * 0.4)) * 0.08));
    tilt.rotation.y = t * 0.4;
  };
  return g;
}

function buildNext() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.26, 72), gloss(0x0d0f1a, { metalness: 0.7, roughness: 0.25 }));
  disc.rotation.x = Math.PI / 2;
  g.add(disc);
  const s = new THREE.Shape();
  [[-0.45, -0.5], [-0.45, 0.5], [-0.27, 0.5], [0.27, -0.18], [0.27, 0.5], [0.45, 0.5],
    [0.45, -0.5], [0.27, -0.5], [-0.27, 0.18], [-0.27, -0.5]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const n = new THREE.Mesh(
    new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2 }),
    gloss(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.25 })
  );
  n.scale.setScalar(1.25);
  n.position.z = 0.13;
  g.add(n);
  g.add(new THREE.Mesh(new THREE.TorusGeometry(1.34, 0.025, 12, 140), neon(0xdfe4ff, 1.6)));
  const spin = orbiters(g, 3, 1.75, new THREE.BoxGeometry(0.16, 0.16, 0.16), [gloss(0xffffff), neon(0xd1d1d6)], 0.4);
  g.userData.animate = (t) => spin(t, 0.9);
  return g;
}

function buildNest() {
  const g = new THREE.Group();
  const red = 0xff3d6e;
  const rings = [1.25, 0.95, 0.66].map((r, i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06 - i * 0.008, 16, 120),
      i === 1 ? neon(red, 1.4) : gloss(red, { metalness: 0.5, emissive: red, emissiveIntensity: 0.25 }));
    g.add(m);
    return m;
  });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), gloss(red, { emissive: red, emissiveIntensity: 0.6, flatShading: true }));
  core.add(new THREE.LineSegments(new THREE.EdgesGeometry(core.geometry), lines(0xffffff, 0.8)));
  g.add(core);
  g.userData.animate = (t) => {
    rings[0].rotation.set(t * 0.5, t * 0.3, 0);
    rings[1].rotation.set(1 - t * 0.4, 0, t * 0.6);
    rings[2].rotation.set(t * 0.9, t * 0.7, 0);
    core.rotation.set(t * 0.6, t, 0);
  };
  return g;
}

function buildNode() {
  const g = new THREE.Group();
  const hex = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.42, 6), gloss(0x5fa04e, { metalness: 0.45, emissive: 0x2f6a22, emissiveIntensity: 0.4 }));
  hex.rotation.x = Math.PI / 2;
  g.add(hex);
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(hex.geometry), lines(0xc8ffb0, 0.8));
  outline.rotation.copy(hex.rotation);
  g.add(outline);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 6), gloss(0x0d1410, { metalness: 0.8 }));
  inner.rotation.x = Math.PI / 2;
  inner.add(new THREE.LineSegments(new THREE.EdgesGeometry(inner.geometry), lines(0x7cc35f, 1)));
  g.add(inner);
  // Small hexes circling the core read as the event loop.
  const spin = orbiters(g, 6, 1.75, new THREE.CylinderGeometry(0.15, 0.15, 0.08, 6), [neon(0x7cc35f, 1.5), gloss(0xbfe5b4)], Math.PI / 2 - 0.35);
  g.userData.animate = (t) => {
    inner.rotation.y = t * 0.8;
    spin(t, 1.3);
  };
  return g;
}

function buildRedis() {
  const g = new THREE.Group();
  const stack = new THREE.Group();
  stack.rotation.x = 0.5;
  g.add(stack);
  const slabGeo = new THREE.BoxGeometry(1.5, 0.3, 1.5);
  const slabEdges = new THREE.EdgesGeometry(slabGeo);
  const slabs = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(slabGeo, gloss(i === 0 ? 0xff5a4a : 0xdc382c, { metalness: 0.35, emissive: 0xff3a2a, emissiveIntensity: i === 0 ? 0.35 : 0.15 }));
    m.rotation.y = Math.PI / 4;
    m.add(new THREE.LineSegments(slabEdges, lines(0xffd0c8, 0.7)));
    stack.add(m);
    return m;
  });
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.17), neon(0xffffff, 2));
  stack.add(star);
  // Cached keys orbiting the store.
  const spin = orbiters(g, 8, 1.7, new THREE.BoxGeometry(0.13, 0.13, 0.13), [gloss(0xffffff), neon(0xff5a4a, 1.6)], 0.25);
  g.userData.animate = (t) => {
    slabs.forEach((m, i) => { m.position.y = (1 - i) * 0.46 + Math.sin(t * 1.6 + i * 0.9) * 0.06; });
    star.position.y = slabs[0].position.y + 0.32;
    star.rotation.y = t * 2;
    stack.rotation.y = t * 0.35;
    spin(t, 1.1);
  };
  return g;
}

function buildMongo() {
  const g = new THREE.Group();
  const pts = [];
  for (let i = 0; i <= 28; i++) {
    const t = i / 28;
    const r = Math.pow(Math.sin(Math.PI * t), 0.85) * 0.62 * (1 - 0.35 * t);
    pts.push(new THREE.Vector2(r, (t - 0.5) * 2.7));
  }
  const leafGeo = new THREE.LatheGeometry(pts, 64);
  const leaf = new THREE.Mesh(leafGeo, gloss(0x13aa52, { metalness: 0.3, emissive: 0x0a7a35, emissiveIntensity: 0.45 }));
  leaf.scale.z = 0.42;
  g.add(leaf);
  const shell = new THREE.Mesh(leafGeo, new THREE.MeshBasicMaterial({ color: 0x3dffa0, wireframe: true, transparent: true, opacity: 0.12 }));
  shell.scale.set(1.04, 1.02, 0.46);
  g.add(shell);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 0.5, 12), neon(0x19d36b, 1.2));
  stem.position.y = -1.55;
  g.add(stem);
  // Documents orbiting the collection.
  const spin = orbiters(g, 5, 1.65, new THREE.BoxGeometry(0.34, 0.24, 0.03), [gloss(0xffffff), neon(0x19d36b, 1.2)], 0.3);
  g.userData.animate = (t) => {
    leaf.rotation.y = shell.rotation.y = t * 0.6;
    spin(t, 0.8);
  };
  return g;
}

function buildMySQL() {
  const g = new THREE.Group();
  const db = new THREE.Group();
  db.rotation.x = 0.38;
  g.add(db);
  // The classic database cylinder: three stacked platters with glowing seams.
  const discGeo = new THREE.CylinderGeometry(0.95, 0.95, 0.42, 64);
  const seamGeo = new THREE.TorusGeometry(0.955, 0.022, 8, 96);
  const discs = [0, 1, 2].map((i) => {
    const d = new THREE.Mesh(discGeo, gloss(i === 0 ? 0x4cc0ea : 0x2a8fbd, { metalness: 0.45, emissive: 0x0d5a80, emissiveIntensity: 0.35 }));
    const seam = new THREE.Mesh(seamGeo, neon(0xf29111, 1.6));
    seam.rotation.x = Math.PI / 2;
    seam.position.y = 0.21;
    d.add(seam);
    db.add(d);
    return d;
  });
  // Rows orbiting the store.
  const spin = orbiters(g, 6, 1.7, new THREE.BoxGeometry(0.44, 0.07, 0.26), [gloss(0xffffff), neon(0x39a9d6, 1.5), neon(0xf29111, 1.3)], 0.3);
  g.userData.animate = (t) => {
    discs.forEach((d, i) => { d.position.y = (1 - i) * 0.5 + Math.sin(t * 1.4 + i) * 0.05; });
    db.rotation.y = t * 0.3;
    spin(t, 0.9);
  };
  return g;
}

export const TECH = [
  { name: 'REACT', color: 0x61dafb, build: buildReact },
  { name: 'NEXT.JS', color: 0xf5f5f7, build: buildNext },
  { name: 'THREE.JS', color: 0xd1d1d6, build: buildThree },
  { name: 'NESTJS', color: 0xff3d6e, build: buildNest },
  { name: 'NODE.JS', color: 0x7cc35f, build: buildNode },
  { name: 'REDIS', color: 0xff5a4a, build: buildRedis },
  { name: 'MONGODB', color: 0x19d36b, build: buildMongo },
  { name: 'MYSQL', color: 0x39a9d6, build: buildMySQL }
];

/* ---------- world ---------- */

export function createWorld(container, state) {
  const motion = state.reduceMotion ? 0.25 : 1;
  const mobileAtStart = window.innerWidth < 760;
  const rand = mulberry32(7);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(BG, 0.02);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 140);
  camera.position.set(0, 0, START_Z);
  scene.add(camera);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobileAtStart ? 1.5 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;

  scene.add(new THREE.HemisphereLight(0xd0d4dc, BG, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(5, 8, 6);
  camera.add(sun);
  const keyLight = new THREE.PointLight(0xe8f0ff, 34, 30);
  keyLight.position.set(4, 3, -4);
  camera.add(keyLight);
  const violetLight = new THREE.PointLight(0xffffff, 24, 28);
  violetLight.position.set(-5, -2, -3);
  camera.add(violetLight);

  const sky = createSky(mobileAtStart);
  scene.add(sky.group);

  /* hero name in 3D, pinned to the .hero-name box in the page */
  const nameEl = document.querySelector('.hero-name');
  const nameRig = new THREE.Group();
  camera.add(nameRig);
  const nameLayouts = {
    wide: buildName(['AMMAR KHAN']),
    stacked: buildName(['AMMAR', 'KHAN'])
  };
  Object.values(nameLayouts).forEach((layout) => {
    const width = Math.max(...layout.lineWidths);
    const lineCount = layout.lineWidths.length;
    const lineGap = 1.22;
    layout.width = width;
    layout.height = 1 + (lineCount - 1) * lineGap;
    layout.letters.forEach((l, i) => {
      l.home = new THREE.Vector3(l.x - width / 2, l.y + ((lineCount - 1) / 2 - l.line) * lineGap - 0.5, 0);
      l.u = l.x / width;
      l.dir = new THREE.Vector3((rand() - 0.5) * 2 + (l.u - 0.5) * 3, (rand() - 0.3) * 2.5, 2 + rand() * 4);
      l.spin = new THREE.Vector3((rand() - 0.5) * 4, (rand() - 0.5) * 4, (rand() - 0.5) * 2);
      l.order = i;
    });
    layout.group.visible = false;
    nameRig.add(layout.group);
  });
  let nameLayout = null;
  let nextGlitch = 3;

  /* the orbit: helix strands spiralling around the flight path, with light flowing along them */
  const helixPoint = (z, radius, twist, phase) => {
    const a = z * twist + phase;
    return new THREE.Vector3(pathX(z) + Math.cos(a) * radius, pathY(z) + Math.sin(a) * radius * 0.85, z);
  };
  const makeStrand = (radius, twist, phase) => {
    const pts = [];
    for (let z = START_Z + 14; z > -DEPTH - 30; z -= 1) pts.push(helixPoint(z, radius, twist, phase));
    const curve = new THREE.CatmullRomCurve3(pts);
    curve.arcLengthDivisions = 3000;
    return curve;
  };
  const flowUniforms = { uTime: { value: 0 } };
  const flowMaterial = (color, intensity, pulses) => new THREE.ShaderMaterial({
    uniforms: { ...flowUniforms, uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uPulses: { value: pulses } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying float vU; varying float vDepth;
      void main() {
        vU = uv.x;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uIntensity; uniform float uPulses;
      varying float vU; varying float vDepth;
      void main() {
        // Bright pulses stream along the line toward the viewer.
        float f = fract(vU * uPulses + uTime * 0.5);
        float pulse = smoothstep(0.0, 0.06, f) * smoothstep(0.4, 0.06, f);
        float fade = exp(-vDepth * 0.03) * smoothstep(2.5, 9.0, vDepth);
        gl_FragColor = vec4(uColor * (0.3 + pulse * 1.8) * uIntensity * fade, 1.0);
      }
    `
  });
  const strands = [
    { curve: makeStrand(4, 0.34, 0), color: 0xf5f5f7, intensity: 1, tube: 0.03, pulses: 90 },
    { curve: makeStrand(4, 0.34, Math.PI), color: 0x9fd2ff, intensity: 0.8, tube: 0.026, pulses: 90 },
    { curve: makeStrand(8.5, 0.11, 1.2), color: 0xb8c7d9, intensity: 0.45, tube: 0.04, pulses: 40 }
  ];
  const tubeSegments = mobileAtStart ? 1400 : 2600;
  strands.forEach((st) => {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(st.curve, tubeSegments, st.tube, 6, false), flowMaterial(st.color, st.intensity, st.pulses));
    tube.frustumCulled = false;
    scene.add(tube);
  });

  // Icons ride the two inner strands, evenly spaced, cycling through every logo.
  const riders = [];
  const riderCount = mobileAtStart ? 30 : 46;
  for (let i = 0; i < riderCount; i++) {
    const icon = devIcon(i % DEV_ICONS.length);
    icon.userData = { strand: strands[i % 2].curve, u: i / riderCount, phase: rand() * 6, pop: 0 };
    scene.add(icon);
    riders.push(icon);
  }
  let flow = 0;

  /* star dust */
  const dustCount = mobileAtStart ? 700 : 1400;
  const dustPos = new Float32Array(dustCount * 3);
  const dustCol = new Float32Array(dustCount * 3);
  const c = new THREE.Color();
  for (let i = 0; i < dustCount; i++) {
    dustPos.set([(rand() - 0.5) * 32, (rand() - 0.5) * 18, START_Z + 4 - rand() * (DEPTH + 40)], i * 3);
    c.setHSL(0.55 + rand() * 0.1, 0.35, 0.6 + rand() * 0.35);
    dustCol.set([c.r, c.g, c.b], i * 3);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  scene.add(new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.12, map: softDot(), vertexColors: true, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false
  })));

  /* speed streaks: stretch with scroll velocity */
  const streakCount = mobileAtStart ? 120 : 240;
  const streaks = [];
  const streakPos = new Float32Array(streakCount * 6);
  for (let i = 0; i < streakCount; i++) streaks.push(new THREE.Vector3((rand() - 0.5) * 24, (rand() - 0.5) * 14, START_Z - rand() * 70));
  const streakGeo = new THREE.BufferGeometry();
  streakGeo.setAttribute('position', new THREE.BufferAttribute(streakPos, 3));
  const streakMat = new THREE.LineBasicMaterial({ color: 0xf2f2f7, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const streakLines = new THREE.LineSegments(streakGeo, streakMat);
  streakLines.frustumCulled = false;
  scene.add(streakLines);

  /* the request craft */
  const craft = new THREE.Group();
  const hullMat = gloss(0xd1d1d6, { metalness: 0.95, roughness: 0.18, emissive: 0x3a3a3c, emissiveIntensity: 0.4 });
  const hull = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 6), hullMat);
  hull.rotation.x = Math.PI / 2; // tip points +z, which lookAt() aims forward
  craft.add(hull);
  const wings = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.025, 0.22), gloss(0xdfe4ff, { metalness: 0.7 }));
  wings.position.z = -0.12;
  craft.add(wings);
  const fins = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.28, 0.18), hullMat);
  fins.position.set(0, 0.12, -0.2);
  craft.add(fins);
  const coreMesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  coreMesh.position.z = -0.3;
  craft.add(coreMesh);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(1.5);
  glow.position.z = -0.25;
  craft.add(glow);
  scene.add(craft);

  const TRAIL = 56;
  const trailPos = new Float32Array(TRAIL * 3);
  const trailCol = new Float32Array(TRAIL * 3);
  const head = new THREE.Color(0xf5f5f7);
  const tail = new THREE.Color(BG);
  for (let i = 0; i < TRAIL; i++) {
    c.copy(head).lerp(tail, i / (TRAIL - 1));
    trailCol.set([c.r, c.g, c.b], i * 3);
  }
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ vertexColors: true }));
  trail.frustumCulled = false;
  scene.add(trail);

  /* core-stack emblems, parented to the camera so they stay in frame */
  const coreGroup = new THREE.Group();
  camera.add(coreGroup);
  const emblems = TECH.map((tech) => {
    const e = tech.build();
    const name = label3d(tech.name, tech.color);
    name.position.y = -2.3;
    e.add(name);
    e.userData.s = 0;
    e.scale.setScalar(0.001);
    coreGroup.add(e);
    return e;
  });
  const haloMat = new THREE.MeshBasicMaterial({ color: TECH[0].color, transparent: true, opacity: 0.4 });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.01, 6, 160), haloMat);
  coreGroup.add(halo);
  const haloDots = new Float32Array(48 * 3);
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    haloDots.set([Math.cos(a) * 2.45, 0, Math.sin(a) * 2.45], i * 3);
  }
  const haloDotGeo = new THREE.BufferGeometry();
  haloDotGeo.setAttribute('position', new THREE.BufferAttribute(haloDots, 3));
  const haloDotMat = new THREE.PointsMaterial({ color: TECH[0].color, size: 0.07, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const haloOrbit = new THREE.Points(haloDotGeo, haloDotMat);
  haloOrbit.rotation.x = 1.25;
  coreGroup.add(haloOrbit);
  const haloTarget = new THREE.Color();

  /* frame state */
  const pointer = { x: 0, y: 0 };
  const craftTarget = new THREE.Vector3();
  const prevCraft = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();
  let camZ = START_Z;
  let speed = 0;
  let coreAmount = 0;
  let trailReady = false;
  let last = 0;
  const hud = { z: START_Z, v: 0, depth: 0 };

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }
  window.addEventListener('resize', resize);

  function updateName(time, t, dt, mobile) {
    const layout = mobile ? nameLayouts.stacked : nameLayouts.wide;
    if (layout !== nameLayout) {
      if (nameLayout) nameLayout.group.visible = false;
      layout.group.visible = true;
      nameLayout = layout;
    }
    const rect = nameEl.getBoundingClientRect();
    nameRig.visible = rect.bottom > -window.innerHeight * 0.5 && rect.width > 0;
    if (!nameRig.visible) return;

    // Fit the type into the DOM box, left-aligned, in camera space.
    const dist = 12;
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
    const perPx = (2 * halfH) / window.innerHeight;
    const s = Math.min((rect.width * perPx) / layout.width, (rect.height * perPx) / layout.height);
    nameRig.position.set(
      (rect.left - window.innerWidth / 2) * perPx + (layout.width * s) / 2,
      (window.innerHeight / 2 - (rect.top + rect.height / 2)) * perPx,
      -dist
    );
    nameRig.scale.setScalar(s);
    nameRig.rotation.set(pointer.y * 0.12, pointer.x * 0.2, 0);

    // Pointer position across the word, in letter units.
    const pu = (((state.pointer.tx + 1) / 2) * window.innerWidth - rect.left) / rect.width;
    const py = ((state.pointer.ty + 1) / 2) * window.innerHeight;
    const near = 1 - smoothstep(0, 160, Math.max(rect.top - py, py - rect.bottom, 0));
    const scatter = smoothstep(0.05, 1.1, state.heroScroll);

    // Every few seconds one letter glitches through random characters.
    if (time > nextGlitch) {
      const l = layout.letters[Math.floor(Math.random() * layout.letters.length)];
      l.glitchUntil = time + 0.4;
      nextGlitch = time + 2 + Math.random() * 2.5;
    }

    layout.letters.forEach((l) => {
      // Name comes up letter by letter, cycling characters until it settles.
      const local = time - 0.25 - l.order * 0.09;
      const rise = 1 - Math.pow(1 - THREE.MathUtils.clamp(local / 0.9, 0, 1), 3);
      const d = (l.u - pu) * layout.width;
      l.lift = THREE.MathUtils.damp(l.lift, Math.exp(-d * d * 1.2) * near, 8, dt);
      if (l.lift > 0.55 && time > l.cooldown) {
        l.glitchUntil = time + 0.3;
        l.cooldown = time + 1.4;
      }
      const scrambling = local > 0 && (local < 0.85 || time < l.glitchUntil);
      if (scrambling && !state.reduceMotion) {
        if (time > l.nextSwap) {
          l.mesh.geometry = randomGlyph();
          l.nextSwap = time + 0.05;
        }
      } else if (l.mesh.geometry !== l.geo) {
        l.mesh.geometry = l.geo;
      }
      const wave = Math.sin(t * 1.4 + l.order * 0.55) * 0.05;
      l.mesh.position.set(
        l.home.x + l.dir.x * scatter * 3,
        l.home.y - (1 - rise) * 1.6 + wave + l.lift * 0.18 + l.dir.y * scatter * 2.5,
        (1 - rise) * -1.5 + l.lift * 0.9 + l.dir.z * scatter * 4
      );
      l.mesh.rotation.set(
        (1 - rise) * 1.1 - l.lift * 0.35 + l.spin.x * scatter,
        Math.sin(t * 0.7 + l.order) * 0.06 + l.spin.y * scatter,
        l.spin.z * scatter
      );
      l.mesh.scale.setScalar(local > 0 ? Math.max(0.001, 0.4 + rise * 0.6) : 0.001);
    });
    layout.materials[1].emissiveIntensity = 0.35 + Math.sin(time * 1.6) * 0.1 + speed * 0.5;
  }

  function update(time) {
    const dt = Math.min(0.05, last ? time - last : 0.016);
    last = time;
    const t = time * motion;
    const mobile = window.innerWidth < 760;
    const ease = 1 - Math.exp(-dt * 6);
    const follow = 1 - Math.exp(-dt * 12);

    pointer.x += (state.pointer.tx - pointer.x) * (1 - Math.exp(-dt * 3));
    pointer.y += (state.pointer.ty - pointer.y) * (1 - Math.exp(-dt * 3));
    speed = THREE.MathUtils.damp(speed, Math.min(Math.abs(state.velocity) / 40, 1.5), 4, dt);

    /* camera follows the path, scroll sets depth */
    camZ += (START_Z - state.scroll * DEPTH - camZ) * follow;
    camera.position.set(pathX(camZ) + pointer.x * 0.35, pathY(camZ) - pointer.y * 0.25, camZ);
    look.set(pathX(camZ - 12), pathY(camZ - 12), camZ - 12);
    camera.lookAt(look);
    sky.update(camera, t, state.scroll, camera.aspect);

    updateName(time, t, dt, mobile);

    /* craft: launches once the hero starts to scroll */
    const launch = smoothstep(0.04, 0.4, state.heroScroll);
    const craftZ = camZ - 7.5;
    craftTarget.set(
      pathX(craftZ) + Math.sin(t * 0.8) * 0.9 + pointer.x * 1.3,
      pathY(craftZ) - 0.55 + Math.sin(t * 1.3) * 0.35 - pointer.y * 0.8 - (1 - launch) * 3,
      craftZ
    );
    prevCraft.copy(craft.position);
    craft.position.x = THREE.MathUtils.damp(craft.position.x, craftTarget.x, 8, dt);
    craft.position.y = THREE.MathUtils.damp(craft.position.y, craftTarget.y, 8, dt);
    craft.position.z = craftZ;
    craft.visible = trail.visible = launch > 0.01;
    craft.scale.setScalar(Math.max(0.001, launch));
    tmp.set(craft.position.x - prevCraft.x, craft.position.y - prevCraft.y, -0.06);
    craft.lookAt(tmp.add(craft.position));
    craft.rotateZ(THREE.MathUtils.clamp((craftTarget.x - craft.position.x) * -0.8, -0.8, 0.8));
    glow.material.opacity = 0.7 + Math.sin(time * 8) * 0.25;

    if (!trailReady || !craft.visible) {
      for (let i = 0; i < TRAIL; i++) trailPos.set([craft.position.x, craft.position.y, craft.position.z], i * 3);
      trailReady = true;
    } else {
      trailPos.copyWithin(3, 0, (TRAIL - 1) * 3);
      trailPos.set([craft.position.x, craft.position.y, craft.position.z + 0.3], 0);
    }
    trailGeo.attributes.position.needsUpdate = true;

    /* icons stream along the orbit; scrolling speeds the flow */
    flow += dt * (0.0035 + speed * 0.01) * motion;
    flowUniforms.uTime.value = t + flow * 60;
    for (const icon of riders) {
      const d = icon.userData;
      const u = (((d.u - flow) % 1) + 1) % 1;
      d.strand.getPointAt(u, icon.position);
      icon.visible = icon.position.z < camZ + 2 && icon.position.z > camZ - 80;
      if (!icon.visible) continue;
      if (craft.visible && icon.position.distanceTo(craft.position) < 2.2) d.pop = 1;
      d.pop = THREE.MathUtils.damp(d.pop, 0, 2.5, dt);
      icon.quaternion.copy(camera.quaternion);
      icon.rotateY(Math.sin(t * 0.8 + d.phase) * 0.6 + d.pop * Math.PI * 2);
      icon.rotateX(Math.cos(t * 0.6 + d.phase) * 0.2);
      // Shrink away as an icon brushes past the camera, so it never blocks the text.
      const near = smoothstep(3, 7, icon.position.distanceTo(camera.position));
      icon.scale.setScalar(Math.max(0.001, (0.9 + d.pop * 0.35) * near));
    }

    /* streaks */
    const len = 0.05 + Math.min(speed * 5, 7);
    const dir = state.velocity >= 0 ? 1 : -1;
    streakMat.opacity = Math.min(0.8, speed * 1.1) * motion;
    streaks.forEach((p, i) => {
      if (p.z > camZ + 1) p.z -= 70;
      else if (p.z < camZ - 71) p.z += 70;
      streakPos.set([p.x + pathX(p.z), p.y + pathY(p.z), p.z, p.x + pathX(p.z), p.y + pathY(p.z), p.z + len * dir], i * 6);
    });
    streakGeo.attributes.position.needsUpdate = true;

    /* core emblems */
    coreAmount = THREE.MathUtils.damp(coreAmount, state.core.visible ? 1 : 0, 5, dt);
    coreGroup.visible = coreAmount > 0.01;
    if (coreGroup.visible) {
      const dist = mobile ? 10 : 7.5;
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * dist;
      const halfW = halfH * camera.aspect;
      if (mobile) coreGroup.position.set(0, halfH * 0.52, -dist);
      else coreGroup.position.set(halfW * 0.58, halfH * 0.06, -dist);
      coreGroup.scale.setScalar(coreAmount * (mobile ? 0.56 : 0.74));
      emblems.forEach((e, i) => {
        const target = i === state.core.index ? 1 : 0;
        e.userData.s = THREE.MathUtils.damp(e.userData.s, target, 6, dt);
        const s = e.userData.s;
        e.visible = s > 0.01;
        if (!e.visible) return;
        e.scale.setScalar(s);
        e.position.y = (1 - s) * (target ? -1.2 : 1.2);
        e.rotation.set(pointer.y * 0.15, Math.sin(t * 0.5) * 0.4 + pointer.x * 0.3 + (1 - s) * 2.4, 0);
        e.userData.animate(t);
      });
      haloTarget.setHex(TECH[state.core.index].color);
      haloMat.color.lerp(haloTarget, ease);
      haloDotMat.color.lerp(haloTarget, ease);
      halo.rotation.set(Math.sin(t * 0.3) * 0.2, Math.cos(t * 0.25) * 0.2, 0);
      haloOrbit.rotation.y = t * 0.3;
    }

    renderer.render(scene, camera);
    hud.z = camZ;
    hud.v = speed;
    hud.depth = THREE.MathUtils.clamp((START_Z - camZ) / DEPTH, 0, 1);
    return hud;
  }

  // Compile every material up front so new icons don't hitch mid-scroll.
  renderer.compile(scene, camera);

  return { update };
}
