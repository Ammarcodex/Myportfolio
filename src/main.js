import Lenis from 'lenis';
import { createUI } from './ui.js';
import { createWorld, TECH } from './world.js';
import { createSpaceAudio } from './audio.js';

const state = {
  scroll: 0,
  heroScroll: 0,
  velocity: 0,
  pointer: { tx: 0, ty: 0 },
  core: { visible: false, index: 0 },
  reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  // Phones and tablets: lighter 3D and no per-frame text effects.
  lowPower: window.matchMedia('(hover: none) and (pointer: coarse)').matches || window.innerWidth < 760
};
if (state.lowPower) document.documentElement.classList.add('low-power');

// Inertial smooth scrolling; the 3D scene reads the same eased scroll position.
const lenis = state.reduceMotion ? null : new Lenis({ lerp: 0.09, wheelMultiplier: 0.95, anchors: { offset: -70 } });
state.scrollTo = (top) => (lenis ? lenis.scrollTo(top, { duration: 1.4 }) : window.scrollTo({ top }));

const ui = createUI(state, TECH.map((t) => t.name));

// Space ambience: off until the visitor turns it on (browsers require a gesture).
const audio = createSpaceAudio();
const soundButton = document.querySelector('.sound-toggle');
const readPref = () => { try { return localStorage.getItem('space-sound'); } catch { return null; } };
const writePref = (v) => { try { localStorage.setItem('space-sound', v); } catch { /* storage blocked */ } };
function showSound(isOn) {
  soundButton.setAttribute('aria-pressed', String(isOn));
  soundButton.setAttribute('aria-label', isOn ? 'Turn space sound off' : 'Turn space sound on');
}
soundButton.addEventListener('click', async () => {
  soundButton.classList.remove('hint');
  soundButton.classList.add('loading'); // first start renders the loop (~1s)
  const isOn = await audio.setOn(!audio.on);
  soundButton.classList.remove('loading');
  showSound(isOn);
  writePref(isOn ? '1' : '0');
});
if (readPref() === null) soundButton.classList.add('hint');
if (readPref() === '1') {
  // They chose sound last visit: resume it on their first interaction.
  const resume = (e) => {
    if (e.target.closest?.('.sound-toggle')) return; // the button's own click handles it
    if (!audio.on) audio.setOn(true).then(showSound);
    ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.removeEventListener(e, resume));
  };
  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, resume, { passive: true }));
}

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
  if (world) {
    const hud = world.update(now / 1000);
    ui.renderHud(hud);
  }
  audio.update(state.velocity);
  if (!revealed) requestAnimationFrame(reveal);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
