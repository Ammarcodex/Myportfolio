// Generative space ambience built with the Web Audio API (no audio files).
// A low drone, filtered "solar wind" noise and echoing pentatonic pings.
// Scroll speed tightens the ping rhythm, speeds the drone's wobble and opens
// the filters; scroll depth slowly raises the pitch.

const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22];
const BASE = 55; // A1

export function createSpaceAudio() {
  let ctx = null;
  let n = null;
  let on = false;
  let nextNote = 0;
  let step = 0;
  let suspendTimer = 0;

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);

    // Long feedback echo, darkened each repeat, for the sense of empty space.
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.46;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.5;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2200;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    delay.connect(damp).connect(feedback).connect(delay);
    damp.connect(wet).connect(master);

    // Drone: detuned stack through a resonant low-pass, its cutoff swept by an LFO.
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 380;
    droneFilter.Q.value = 4;
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.22;
    droneFilter.connect(droneGain).connect(master);
    const droneSend = ctx.createGain();
    droneSend.gain.value = 0.12;
    droneGain.connect(droneSend).connect(delay);
    const drones = [[1, 'sawtooth', -6, 0.22], [1.5, 'triangle', 4, 0.32], [2, 'sine', 0, 0.35], [3, 'sine', 7, 0.18]].map(([mul, type, detune, level]) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = BASE * mul;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(droneFilter);
      osc.start();
      return { osc, mul };
    });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 180;
    lfo.connect(lfoDepth).connect(droneFilter.frequency);
    lfo.start();

    // Solar wind: looping white noise through a moving band-pass.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 450;
    windFilter.Q.value = 0.8;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.025;
    noise.connect(windFilter).connect(windGain).connect(master);
    noise.start();

    n = { master, delay, droneFilter, drones, lfo, windFilter, windGain };
  }

  function ping(time, freq, level) {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(level, time + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 1.8);
    env.connect(n.master);
    env.connect(n.delay);
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = freq;
    const shimmer = ctx.createOscillator();
    shimmer.type = 'triangle';
    shimmer.frequency.value = freq * 2.003;
    const shimmerLevel = ctx.createGain();
    shimmerLevel.gain.value = 0.18;
    tone.connect(env);
    shimmer.connect(shimmerLevel).connect(env);
    tone.start(time);
    shimmer.start(time);
    tone.stop(time + 1.9);
    shimmer.stop(time + 1.9);
  }

  // speed: 0 (still) .. ~1.5 (fast scroll); depth: 0 (top) .. 1 (bottom).
  function update(speed, depth) {
    if (!on || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const s = Math.min(speed / 1.2, 1);
    const pitch = Math.pow(2, (depth * 5) / 12);
    n.drones.forEach(({ osc, mul }) => osc.frequency.setTargetAtTime(BASE * mul * pitch, now, 0.8));
    n.droneFilter.frequency.setTargetAtTime(380 + s * 1400 + depth * 300, now, 0.25);
    n.lfo.frequency.setTargetAtTime(0.08 + s * 1.6, now, 0.3);
    n.windFilter.frequency.setTargetAtTime(420 + s * 2600, now, 0.15);
    n.windGain.gain.setTargetAtTime(0.025 + s * 0.12, now, 0.15);

    // Ping rhythm: one every 1.4s at rest, down to ~0.13s while scrolling fast.
    if (nextNote < now) nextNote = now + 0.05;
    while (nextNote < now + 0.12) {
      const semis = SCALE[step % SCALE.length];
      ping(nextNote, 220 * pitch * Math.pow(2, semis / 12), 0.05 + s * 0.03);
      step += Math.random() < 0.7 ? 1 : 3;
      nextNote += 1.4 - s * 1.27;
    }
  }

  async function setOn(value) {
    on = value;
    clearTimeout(suspendTimer);
    if (on) {
      if (!ctx) build();
      await ctx.resume();
      n.master.gain.setTargetAtTime(0.5, ctx.currentTime, 0.6);
    } else if (ctx) {
      n.master.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      suspendTimer = setTimeout(() => { if (!on) ctx.suspend(); }, 900);
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
