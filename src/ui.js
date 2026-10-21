const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const KEYWORDS = 'import|from|export|default|async|await|function|const|let|return|if|new|class|private|readonly|constructor'
  + '|START|TRANSACTION|UPDATE|SET|WHERE|AND|INSERT|INTO|VALUES|COMMIT|SELECT|FROM|JOIN';
const TOKENS = new RegExp(
  [
    '(\\/\\/.*$)', // comment
    '(\'[^\']*\'|`[^`]*`|"[^"]*")', // string
    '(@\\w+)', // decorator
    `(\\b(?:${KEYWORDS})\\b)`, // keyword
    '(\\$\\w+)', // mongo operator
    '(\\b\\d+\\b)', // number
    '(\\b[A-Za-z_]\\w*(?=\\())' // call
  ].join('|'),
  'gm'
);
const TOKEN_CLASSES = ['tk-com', 'tk-str', 'tk-dec', 'tk-key', 'tk-op', 'tk-num', 'tk-fn'];
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const SCRAMBLE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&@$';

// Cycle each letter through random characters, settling left to right.
function scrambleText(el, duration = 1100) {
  const final = el.dataset.text || el.textContent;
  el.dataset.text = final;
  const start = performance.now();
  const tick = (now) => {
    const p = (now - start) / duration;
    el.textContent = [...final].map((ch, i) => (ch === ' ' || p > (i + 1) / final.length
      ? ch
      : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)])).join('');
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = final;
  };
  requestAnimationFrame(tick);
}

function highlight(code) {
  const src = code.textContent;
  let out = '';
  let last = 0;
  for (const m of src.matchAll(TOKENS)) {
    const group = m.slice(1).findIndex(Boolean);
    out += escapeHtml(src.slice(last, m.index)) + `<span class="${TOKEN_CLASSES[group]}">${escapeHtml(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  code.innerHTML = out + escapeHtml(src.slice(last));
}

export function createUI(state, techNames) {
  const root = document.documentElement;
  const topbar = document.querySelector('.topbar');
  const progressBar = document.querySelector('.scroll-progress span');
  const cursor = document.querySelector('.cursor-glow');
  const track = document.querySelector('.core-track');
  const sticky = document.querySelector('.core-sticky');
  const panels = [...document.querySelectorAll('.core-panel')];
  const railButtons = [...document.querySelectorAll('.core-rail button')];
  const railFill = document.querySelector('.core-rail-fill');
  const coreCount = document.querySelector('.core-count b');
  const words3d = [...document.querySelectorAll('.t3d')];
  const hudZ = document.querySelector('#hud-z');
  const hudV = document.querySelector('#hud-v');
  const hudLayer = document.querySelector('#hud-layer');
  const hudBar = document.querySelector('#hud-bar');
  const hudBox = document.querySelector('.hud');
  let lastY = window.scrollY;
  let layer = 'ORIGIN';
  let frame = 0;
  const tilt = { x: 0, y: 0 };

  document.querySelectorAll('.code-window code').forEach(highlight);

  if (!state.reduceMotion) {
    document.querySelectorAll('[data-scramble]').forEach((el) => {
      setTimeout(() => scrambleText(el), 250);
      el.closest('a')?.addEventListener('pointerenter', () => scrambleText(el, 700));
    });
  }

  window.addEventListener('pointermove', (e) => {
    state.pointer.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    state.pointer.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    cursor.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    cursor.classList.add('on');
  }, { passive: true });
  document.addEventListener('pointerleave', () => cursor.classList.remove('on'));

  // Reveal-on-scroll, staggered within each parent.
  const revealTargets = document.querySelectorAll('.project-card, .section-heading, .about-copy, .stack-intro, .skill-group, .flow-diagram, .flow-card');
  revealTargets.forEach((el) => {
    el.classList.add('reveal');
    const siblings = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
    el.style.setProperty('--rd', `${siblings.indexOf(el) * 0.09}s`);
  });
  const revealer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('visible');
      revealer.unobserve(entry.target);
    });
  }, { threshold: 0.12 });
  revealTargets.forEach((el) => revealer.observe(el));

  // Which section is crossing the middle of the screen, for the HUD.
  const layerWatcher = new IntersectionObserver((entries) => {
    entries.forEach((entry) => { if (entry.isIntersecting) layer = entry.target.dataset.layer; });
  }, { rootMargin: '-50% 0px -50% 0px' });
  document.querySelectorAll('[data-layer]').forEach((el) => layerWatcher.observe(el));

  // 3D tilt + glare on project cards.
  document.querySelectorAll('[data-tilt]').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.setProperty('--ry', `${(px - 0.5) * 12}deg`);
      card.style.setProperty('--rx', `${(0.5 - py) * 10}deg`);
      card.style.setProperty('--mx', `${px * 100}%`);
      card.style.setProperty('--my', `${py * 100}%`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    });
  });

  // Buttons that lean toward the pointer.
  document.querySelectorAll('.magnetic').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.translate = `${(e.clientX - r.left - r.width / 2) * 0.25}px ${(e.clientY - r.top - r.height / 2) * 0.35}px`;
    });
    el.addEventListener('pointerleave', () => { el.style.translate = '0 0'; });
  });

  // Rotating tech word in the hero.
  const swap = document.querySelector('.word-swap');
  const words = swap.dataset.words.split('|');
  const colors = swap.dataset.colors.split('|');
  let wordIndex = 0;
  swap.style.color = colors[0];
  setInterval(() => {
    swap.classList.add('out');
    setTimeout(() => {
      wordIndex = (wordIndex + 1) % words.length;
      swap.textContent = words[wordIndex];
      swap.style.color = colors[wordIndex];
      swap.classList.remove('out');
    }, 320);
  }, 2400);

  // Core stack: pinned section, one station per slice of scroll.
  function stationTop(i) {
    const span = track.offsetHeight - window.innerHeight;
    return track.getBoundingClientRect().top + window.scrollY + span * ((i + 0.5) / panels.length);
  }
  railButtons.forEach((btn, i) => btn.addEventListener('click', () => state.scrollTo(stationTop(i))));

  function setStation(i) {
    state.core.index = i;
    panels.forEach((p, j) => {
      p.classList.toggle('active', j === i);
      p.classList.toggle('past', j < i);
    });
    railButtons.forEach((b, j) => b.classList.toggle('active', j === i));
    coreCount.textContent = String(i + 1).padStart(2, '0');
    sticky.style.setProperty('--tech', panels[i].style.getPropertyValue('--c'));
  }
  sticky.style.setProperty('--tech', panels[0].style.getPropertyValue('--c'));

  function update() {
    const y = window.scrollY;
    const max = root.scrollHeight - window.innerHeight;
    state.scroll = max > 0 ? y / max : 0;
    state.heroScroll = y / window.innerHeight;
    state.velocity += (y - lastY - state.velocity) * 0.2;
    lastY = y;

    topbar.classList.toggle('scrolled', y > 40);
    progressBar.style.transform = `scaleX(${state.scroll})`;

    const rect = track.getBoundingClientRect();
    const span = rect.height - window.innerHeight;
    const p = clamp(-rect.top / span, 0, 1);
    state.core.visible = rect.top < window.innerHeight * 0.3 && rect.bottom > window.innerHeight * 0.7;
    const index = Math.min(panels.length - 1, Math.floor(p * panels.length));
    if (index !== state.core.index) setStation(index);
    railFill.style.setProperty('--p', p.toFixed(4));

    // 3D words: tilt with their position on screen and lean away from the
    // pointer, while the extrusion shifts the opposite way like a lit object.
    tilt.x += (state.pointer.tx - tilt.x) * 0.08;
    tilt.y += (state.pointer.ty - tilt.y) * 0.08;
    words3d.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      const cy = (r.top + r.height / 2) / window.innerHeight - 0.5;
      el.style.setProperty('--tx', `${(-cy * 18 - tilt.y * 5).toFixed(2)}deg`);
      el.style.setProperty('--ty', `${(tilt.x * 9).toFixed(2)}deg`);
      el.style.setProperty('--sx', (-tilt.x * 1.1).toFixed(3));
      el.style.setProperty('--sy', (0.9 - tilt.y * 0.6 + cy * 0.6).toFixed(3));
    });
  }

  function renderHud(hud) {
    if (frame++ % 4) return;
    const z = Math.abs(hud.z).toFixed(1).padStart(5, '0');
    hudZ.textContent = `${hud.z < 0 ? '-' : '+'}${z}`;
    hudV.textContent = hud.v.toFixed(2);
    hudLayer.textContent = layer === 'CORE' && state.core.visible ? techNames[state.core.index] : layer;
    hudBar.style.transform = `scaleX(${hud.depth})`;
    // Step aside at the contact section so it never covers the footer links.
    hudBox.classList.toggle('away', layer === 'DESTINATION');
  }

  return { update, renderHud };
}
