import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import {
  siReact, siNextdotjs, siThreedotjs, siNestjs, siNodedotjs, siRedis, siMongodb, siMysql,
  siJavascript, siTypescript, siHtml5, siCss, siDocker, siGit, siApachekafka, siElasticsearch,
  siLinux, siGithubactions
} from 'simple-icons';

/* ---------- dev icons as extruded 3D logos ---------- */

// Brand colours, adjusted where the official one disappears on black
// (Next.js, three.js, Kafka) or reads as purple (CSS).
export const DEV_ICONS = [
  [siReact], [siNextdotjs, 0xe5e5ea], [siThreedotjs, 0xe5e5ea], [siNestjs], [siNodedotjs],
  [siRedis], [siMongodb], [siMysql, 0x5b9bd5], [siJavascript], [siTypescript], [siHtml5],
  [siCss, 0x2965f1], [siDocker], [siGit], [siApachekafka, 0xd1d1d6], [siElasticsearch, 0x00bfb3],
  [siLinux], [siGithubactions]
].map(([icon, color]) => ({ title: icon.title, path: icon.path, color: color ?? parseInt(icon.hex, 16) }));

const loader = new SVGLoader();
const iconCache = new Map();

function iconAssets(index) {
  if (iconCache.has(index)) return iconCache.get(index);
  const { path, color } = DEV_ICONS[index];
  // Flip Y while parsing (SVG is y-down) so the extrusion keeps outward normals.
  const data = loader.parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path transform="scale(1,-1)" d="${path}"/></svg>`);
  const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth: 2.4, curveSegments: 5, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.14, bevelSegments: 2
  });
  geo.center();
  geo.scale(1 / 24, 1 / 24, 1 / 24);
  const c = new THREE.Color(color);
  const assets = {
    geo,
    mats: [
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.45, metalness: 0.35, roughness: 0.3 }),
      new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.55), emissive: c, emissiveIntensity: 0.12, metalness: 0.85, roughness: 0.25 })
    ],
    glow: new THREE.SpriteMaterial({ map: softDot(), color: c, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })
  };
  iconCache.set(index, assets);
  return assets;
}

export function devIcon(index) {
  const { geo, mats, glow } = iconAssets(index % DEV_ICONS.length);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mats));
  const halo = new THREE.Sprite(glow);
  halo.scale.setScalar(2.2);
  halo.position.z = -0.2;
  g.add(halo);
  return g;
}

let dotTexture = null;
export function softDot() {
  if (dotTexture) return dotTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  dotTexture = new THREE.CanvasTexture(canvas);
  dotTexture.colorSpace = THREE.SRGBColorSpace;
  return dotTexture;
}

/* ---------- deep-space backdrop: nebula sky, stars, a ringed planet ---------- */

const NOISE = /* glsl */ `
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < OCTAVES; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
`;

export function createSky(mobile) {
  const group = new THREE.Group();
  const defines = { OCTAVES: mobile ? 2 : 5 };

  const skyUniforms = { uTime: { value: 0 }, uScroll: { value: 0 } };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(100, 48, 24),
    new THREE.ShaderMaterial({
      defines,
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform float uScroll;
        varying vec3 vDir;
        ${NOISE}
        void main() {
          vec3 d = normalize(vDir);
          // The nebula drifts as you scroll, so the background travels with you.
          vec3 p = d * 2.2 + vec3(0.0, uScroll * 2.4, uTime * 0.008);
          float n = fbm(p);
          float n2 = fbm(p * 1.7 + vec3(4.1, 1.3, 7.7));
          vec3 col = vec3(0.006, 0.01, 0.026);
          col += vec3(0.04, 0.13, 0.34) * smoothstep(0.42, 0.85, n);
          col += vec3(0.02, 0.27, 0.33) * smoothstep(0.55, 0.92, n2) * 0.8;
          col += vec3(0.42, 0.13, 0.1) * smoothstep(0.6, 0.95, n * n2 * 1.7) * 0.55;
          float band = exp(-pow(d.y * 2.6 + sin(d.x * 2.0 + uScroll) * 0.45, 2.0));
          col += vec3(0.07, 0.09, 0.14) * band * (0.4 + n);
          vec3 sp = d * 260.0;
          float h = hash(floor(sp));
          float star = step(0.986, h) * smoothstep(0.45, 0.0, length(fract(sp) - 0.5));
          col += vec3(0.85, 0.9, 1.0) * star * (0.55 + 0.45 * sin(uTime * 2.0 + h * 60.0));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    })
  );
  sky.renderOrder = -2;
  group.add(sky);

  /* planet with atmosphere and rings, far away, drifting with scroll */
  const planetRig = new THREE.Group();
  group.add(planetRig);
  const planetUniforms = { uTime: { value: 0 }, uLight: { value: new THREE.Vector3(0.8, 0.5, 0.4).normalize() } };
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(13, mobile ? 32 : 64, mobile ? 24 : 48),
    new THREE.ShaderMaterial({
      defines,
      uniforms: planetUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vObj; varying vec3 vNormalW; varying vec3 vViewDir;
        void main() {
          vObj = position;
          vec4 world = modelMatrix * vec4(position, 1.0);
          vNormalW = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - world.xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uLight;
        varying vec3 vObj; varying vec3 vNormalW; varying vec3 vViewDir;
        ${NOISE}
        void main() {
          vec3 o = normalize(vObj);
          float bands = fbm(vec3(o.y * 7.0, o.x * 1.2 + uTime * 0.01, o.z * 1.2));
          vec3 surface = mix(vec3(0.05, 0.1, 0.2), vec3(0.32, 0.5, 0.62), bands);
          surface = mix(surface, vec3(0.75, 0.42, 0.25), smoothstep(0.62, 0.8, bands) * 0.5);
          float diff = smoothstep(-0.15, 0.9, dot(vNormalW, uLight));
          float rim = pow(1.0 - max(dot(vNormalW, vViewDir), 0.0), 3.0);
          vec3 col = surface * diff + vec3(0.35, 0.65, 1.0) * rim * (0.25 + diff);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    })
  );
  planetRig.add(planet);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(17, 27, 160, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vPos;
        void main() { vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
      `,
      fragmentShader: /* glsl */ `
        varying vec2 vPos;
        void main() {
          float r = (length(vPos) - 17.0) / 10.0;
          float bands = 0.55 + 0.45 * sin(r * 70.0) * sin(r * 23.0 + 1.3);
          float edge = smoothstep(0.0, 0.08, r) * smoothstep(1.0, 0.85, r);
          vec3 col = mix(vec3(0.55, 0.62, 0.7), vec3(0.9, 0.78, 0.62), r);
          gl_FragColor = vec4(col, bands * edge * 0.45);
        }
      `
    })
  );
  ring.rotation.set(1.25, 0.25, 0.3);
  planetRig.add(ring);
  planetRig.rotation.z = -0.25;

  function update(camera, time, scroll, aspect) {
    group.position.copy(camera.position);
    skyUniforms.uTime.value = time;
    skyUniforms.uScroll.value = scroll;
    planetUniforms.uTime.value = time;
    // Starts upper-right of the hero, then slowly sweeps across as you travel.
    const side = aspect < 1 ? 0.6 : 1;
    planetRig.position.set((34 - scroll * 70) * side, 16 - scroll * 30, -82 + scroll * 10);
    planet.rotation.y = time * 0.02;
    ring.rotation.z = 0.3 + time * 0.005;
  }

  return { group, update };
}
