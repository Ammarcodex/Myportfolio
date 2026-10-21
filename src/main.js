import Lenis from 'lenis';
import { createUI } from './ui.js';
import { createWorld, TECH } from './world.js';

const state = {
  scroll: 0,
  heroScroll: 0,
  velocity: 0,
  pointer: { tx: 0, ty: 0 },
  core: { visible: false, index: 0 },
  reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
};

// Inertial smooth scrolling; the 3D scene reads the same eased scroll position.
const lenis = state.reduceMotion ? null : new Lenis({ lerp: 0.09, wheelMultiplier: 0.95, anchors: { offset: -70 } });
state.scrollTo = (top) => (lenis ? lenis.scrollTo(top, { duration: 1.4 }) : window.scrollTo({ top }));

const ui = createUI(state, TECH.map((t) => t.name));

let world = null;
try {
  world = createWorld(document.querySelector('#webgl'), state);
} catch (err) {
  // No WebGL: the page still works, just without the 3D layer.
  console.warn('WebGL unavailable, skipping 3D scene.', err);
  document.body.classList.add('no-webgl');
}

// Lift the intro cover once the first 3D frame is on screen (or right away without WebGL).
const loader = document.querySelector('.loader');
let revealed = false;
function reveal() {
  if (revealed) return;
  revealed = true;
  loader.classList.add('done');
  setTimeout(() => loader.remove(), 800);
}
setTimeout(reveal, 4000);

function frame(now) {
  lenis?.raf(now);
  ui.update();
  if (world) ui.renderHud(world.update(now / 1000));
  if (!revealed) requestAnimationFrame(reveal);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
