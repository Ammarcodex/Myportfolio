// Scroll-scrubbed space ambience, built with the Web Audio API (no audio files).
//
// A calm 32s loop (soft pad, breathing space air, bell twinkles, long reverb)
// is rendered once in the browser, then played like a tape whose speed follows
// the scroll: still = normal speed, scrolling down = faster and higher,
// scrolling up = slows, stops, then plays backwards (rewind).

const LOOP = 32; // seconds
const RENDER_RATE = 24000; // the loop is low-passed well under 12kHz, so half rate is plenty
const FADE = 4; // seconds of crossfade at the loop seam
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Cmaj9 → Am9 → Fmaj7(#11) → Gsus2: open, unresolved, restful.
const CHORDS = [
  [48, 52, 55, 59, 62],
  [45, 48, 52, 55, 59],
  [41, 45, 48, 52, 59],
  [43, 45, 50, 55, 57]
].map((chord) => chord.map(midi));
// C major pentatonic, two octaves up: always consonant over the pad.
const TWINKLE = [72, 74, 76, 79, 81, 84, 86, 88].map(midi);

// Plays a stereo buffer at a variable, signed rate with linear interpolation.
const SCRUB_PROCESSOR = `
class Scrub extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = null; this.pos = 0; this.rate = 1; this.target = 1;
    this.port.onmessage = (e) => {
      if (e.data.buffer) { this.buf = e.data.buffer; this.len = this.buf[0].length; }
      if (e.data.rate !== undefined) this.target = e.data.rate;
    };
  }
  process(inputs, outputs) {
    const out = outputs[0];
    if (!this.buf) return true;
    const L = this.buf[0], R = this.buf[1], len = this.len;
    for (let i = 0; i < out[0].length; i++) {
      this.rate += (this.target - this.rate) * 0.00025; // ~0.1s glide, tape-like
      this.pos += this.rate;
      if (this.pos >= len) this.pos -= len; else if (this.pos < 0) this.pos += len;
      const i0 = this.pos | 0, i1 = i0 + 1 === len ? 0 : i0 + 1, f = this.pos - i0;
      out[0][i] = L[i0] + (L[i1] - L[i0]) * f;
      if (out[1]) out[1][i] = R[i0] + (R[i1] - R[i0]) * f;
    }
    return true;
  }
}
registerProcessor('scrub', Scrub);
`;

function impulse(ctx, seconds, decay) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return buffer;
}

function brownNoise(ctx, seconds) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < data.length; i++) {
    brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = brown * 3.5;
  }
  return buffer;
}

// Render the ambient loop offline. Chords cycle with period LOOP, so the
// extra FADE seconds match the start and can be crossfaded into a seamless loop.
async function renderLoop(sampleRate) {
  const total = LOOP + FADE;
  const off = new OfflineAudioContext(2, Math.floor(sampleRate * total), sampleRate);
  const master = off.createGain();
  master.gain.value = 0.9;
  master.connect(off.destination);
  const reverb = off.createConvolver();
  reverb.buffer = impulse(off, 4.5, 2.6);
  reverb.connect(master);

  const padFilter = off.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 1100;
  const padGain = off.createGain();
  padGain.gain.value = 0.11;
  padFilter.connect(padGain);
  padGain.connect(master);
  padGain.connect(reverb);
  const swell = off.createOscillator();
  swell.frequency.value = 1 / 8; // one breath per chord, so the seam lines up
  const swellDepth = off.createGain();
  swellDepth.gain.value = 0.035;
  swell.connect(swellDepth).connect(padGain.gain);
  swell.start();
  const step = LOOP / CHORDS.length;
  CHORDS[0].forEach((_, voice) => {
    [['sine', 0, 0.6], ['triangle', 6, 0.25]].forEach(([type, detune, level]) => {
      const osc = off.createOscillator();
      osc.type = type;
      osc.detune.value = detune;
      osc.frequency.setValueAtTime(CHORDS[0][voice], 0);
      for (let k = 1; k * step < total; k++) osc.frequency.setTargetAtTime(CHORDS[k % CHORDS.length][voice], k * step, 1.2);
      const g = off.createGain();
      g.gain.value = level;
      osc.connect(g).connect(padFilter);
      osc.start();
    });
  });

  const noise = off.createBufferSource();
  noise.buffer = brownNoise(off, total);
  const airFilter = off.createBiquadFilter();
  airFilter.type = 'lowpass';
  airFilter.frequency.value = 520;
  const tide = off.createOscillator();
  tide.frequency.value = 1 / 8;
  const tideDepth = off.createGain();
  tideDepth.gain.value = 260;
  tide.connect(tideDepth).connect(airFilter.frequency);
  tide.start();
  const airGain = off.createGain();
  airGain.gain.value = 0.05;
  noise.connect(airFilter).connect(airGain);
  airGain.connect(master);
  airGain.connect(reverb);
  noise.start();

  // Twinkles every ~1.6–3s: calm at normal speed, a shower when scrubbed fast.
  for (let t = 0.8; t < LOOP - 1; t += 1.6 + Math.random() * 1.4) {
    const freq = TWINKLE[Math.floor(Math.random() * TWINKLE.length)];
    const env = off.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.04, t + 0.04);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    env.connect(reverb);
    const dry = off.createGain();
    dry.gain.value = 0.35;
    env.connect(dry).connect(master);
    [[freq, 1], [freq * 3, 0.06]].forEach(([f, level]) => {
      const osc = off.createOscillator();
      osc.frequency.value = f;
      const g = off.createGain();
      g.gain.value = level;
      osc.connect(g).connect(env);
      osc.start(t);
      osc.stop(t + 3.4);
    });
  }

  const rendered = await off.startRendering();
  const loopLen = Math.floor(sampleRate * LOOP);
  const fadeLen = Math.floor(sampleRate * FADE);
  return [0, 1].map((ch) => {
    const src = rendered.getChannelData(ch);
    const out = new Float32Array(loopLen);
    out.set(src.subarray(0, loopLen));
    for (let i = 0; i < fadeLen; i++) {
      const a = i / fadeLen;
      out[i] = src[i] * a + src[loopLen + i] * (1 - a);
    }
    return out;
  });
}

export function createSpaceAudio() {
  let ctx = null;
  let n = null;
  let on = false;
  let ready = null;
  let suspendTimer = 0;
  let rate = 1;

  async function build() {
    // Created synchronously inside the click, so the browser allows playback.
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 7000; // keeps sped-up playback from turning shrill
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 3;
    master.connect(tone).connect(comp).connect(ctx.destination);

    // Tape whoosh: band-passed noise that rises with how hard you scrub.
    const whoosh = ctx.createBufferSource();
    whoosh.buffer = brownNoise(ctx, 3);
    whoosh.loop = true;
    const whooshFilter = ctx.createBiquadFilter();
    whooshFilter.type = 'bandpass';
    whooshFilter.Q.value = 0.7;
    whooshFilter.frequency.value = 400;
    const whooshGain = ctx.createGain();
    whooshGain.gain.value = 0;
    whoosh.connect(whooshFilter).connect(whooshGain).connect(master);
    whoosh.start();

    const channels = await renderLoop(RENDER_RATE);
    const rateScale = RENDER_RATE / ctx.sampleRate; // play the half-rate loop at true pitch
    let player;
    if (ctx.audioWorklet) {
      const url = URL.createObjectURL(new Blob([SCRUB_PROCESSOR], { type: 'application/javascript' }));
      await ctx.audioWorklet.addModule(url);
      URL.revokeObjectURL(url);
      const node = new AudioWorkletNode(ctx, 'scrub', { numberOfInputs: 0, outputChannelCount: [2] });
      node.port.postMessage({ buffer: channels });
      node.connect(master);
      player = { setRate: (r) => node.port.postMessage({ rate: r * rateScale }) };
    } else {
      // Older browsers: speed up/down only, no reverse.
      const buffer = ctx.createBuffer(2, channels[0].length, RENDER_RATE);
      channels.forEach((data, ch) => buffer.copyToChannel(data, ch));
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(master);
      src.start();
      player = { setRate: (r) => src.playbackRate.setTargetAtTime(Math.max(0.3, r), ctx.currentTime, 0.1) };
    }
    n = { master, player, whooshFilter, whooshGain };
  }

  // velocity: signed scroll speed in px/frame (positive = scrolling down).
  function update(velocity) {
    if (!on || !n || ctx.state !== 'running') return;
    // 1 at rest; up to 3.5x scrolling down; scrolling up slows through 0 into reverse.
    const target = Math.max(-3, Math.min(3.5, 1 + velocity / (velocity > 0 ? 15 : 9)));
    if (Math.abs(target - rate) > 0.01) {
      rate = target;
      n.player.setRate(rate);
    }
    const scrub = Math.min(Math.abs(rate - 1) / 3, 1);
    const now = ctx.currentTime;
    n.whooshGain.gain.setTargetAtTime(scrub * 0.09, now, 0.08);
    n.whooshFilter.frequency.setTargetAtTime(300 + Math.abs(rate) * 700, now, 0.08);
  }

  async function setOn(value) {
    on = value;
    clearTimeout(suspendTimer);
    if (on) {
      if (!ctx) ready = build();
      const resumed = ctx.resume();
      await ready;
      await resumed;
      if (on) n.master.gain.setTargetAtTime(0.5, ctx.currentTime, 1);
    } else if (ctx) {
      n?.master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
      suspendTimer = setTimeout(() => { if (!on) ctx.suspend(); }, 1400);
    }
    return on;
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (on) ctx.resume();
  });

  return { setOn, update, get on() { return on; } };
}
