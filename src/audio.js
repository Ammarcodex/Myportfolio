// Calm generative space ambience built with the Web Audio API (no audio files).
// A soft pad drifting through slow chords, breathing filtered "space air",
// and sparse bell-like twinkles, all bathed in a long reverb.
// Scrolling gently quickens the twinkles and chord changes and brightens the
// pad; it never gets loud or busy.

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

function impulse(ctx, seconds, decay) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return buffer;
}

export function createSpaceAudio() {
  let ctx = null;
  let n = null;
  let on = false;
  let chordIndex = 0;
  let nextChord = 0;
  let nextTwinkle = 0;
  let suspendTimer = 0;

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    master.connect(comp).connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 4.5, 2.6);
    const reverbLevel = ctx.createGain();
    reverbLevel.gain.value = 0.9;
    reverb.connect(reverbLevel).connect(master);

    // Pad: five voices, each a sine + a slightly detuned triangle, softly filtered.
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 900;
    padFilter.Q.value = 0.5;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.11;
    padFilter.connect(padGain);
    padGain.connect(master);
    padGain.connect(reverb);
    // Slow swell so the pad breathes instead of sitting still.
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.05;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.035;
    swell.connect(swellDepth).connect(padGain.gain);
    swell.start();
    const voices = CHORDS[0].map((freq) => {
      const oscs = [['sine', 0, 0.6], ['triangle', 6, 0.25]].map(([type, detune, level]) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.value = level;
        osc.connect(g).connect(padFilter);
        osc.start();
        return osc;
      });
      return oscs;
    });

    // Space air: low-passed noise with a slow, wave-like sweep.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < data.length; i++) {
      brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = brown * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'lowpass';
    airFilter.frequency.value = 500;
    const airGain = ctx.createGain();
    airGain.gain.value = 0.05;
    const tide = ctx.createOscillator();
    tide.frequency.value = 0.07;
    const tideDepth = ctx.createGain();
    tideDepth.gain.value = 260;
    tide.connect(tideDepth).connect(airFilter.frequency);
    tide.start();
    noise.connect(airFilter).connect(airGain);
    airGain.connect(master);
    airGain.connect(reverb);
    noise.start();

    n = { master, reverb, padFilter, swell, voices, airFilter, airGain, tide };
  }

  function twinkle(time, freq, level) {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(level, time + 0.04);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 3.2);
    env.connect(n.reverb);
    const dry = ctx.createGain();
    dry.gain.value = 0.35;
    env.connect(dry).connect(n.master);
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = freq;
    const overtone = ctx.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.value = freq * 3;
    const overtoneLevel = ctx.createGain();
    overtoneLevel.gain.value = 0.06;
    tone.connect(env);
    overtone.connect(overtoneLevel).connect(env);
    tone.start(time);
    overtone.start(time);
    tone.stop(time + 3.4);
    overtone.stop(time + 3.4);
  }

  // speed: 0 (still) .. ~1.5 (fast scroll); depth: 0 (top) .. 1 (bottom).
  function update(speed, depth) {
    if (!on || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const s = Math.min(speed / 1.2, 1);

    // Scrolling brightens the pad, quickens its breathing and lifts the air a touch.
    n.padFilter.frequency.setTargetAtTime(900 + s * 900 + depth * 400, now, 0.6);
    n.swell.frequency.setTargetAtTime(0.05 + s * 0.2, now, 1);
    n.tide.frequency.setTargetAtTime(0.07 + s * 0.18, now, 1);
    n.airGain.gain.setTargetAtTime(0.05 + s * 0.04, now, 0.5);

    // Chords glide every ~14s at rest, every ~6s while scrolling.
    if (now >= nextChord) {
      chordIndex = (chordIndex + 1) % CHORDS.length;
      n.voices.forEach((oscs, i) => oscs.forEach((osc) => osc.frequency.setTargetAtTime(CHORDS[chordIndex][i], now, 2.5)));
      nextChord = now + 14 - s * 8;
    }

    // Twinkles: every 2.5–4.5s at rest, every ~0.5–0.9s while scrolling.
    if (nextTwinkle < now) nextTwinkle = now + 0.3;
    if (nextTwinkle < now + 0.1) {
      const freq = TWINKLE[Math.floor(Math.random() * TWINKLE.length)];
      twinkle(nextTwinkle, freq, 0.035 + s * 0.015);
      const rest = 2.5 + Math.random() * 2;
      const busy = 0.5 + Math.random() * 0.4;
      nextTwinkle += rest + (busy - rest) * s;
    }
  }

  async function setOn(value) {
    on = value;
    clearTimeout(suspendTimer);
    if (on) {
      if (!ctx) build();
      await ctx.resume();
      nextChord = ctx.currentTime + 6;
      n.master.gain.setTargetAtTime(0.45, ctx.currentTime, 1.2);
    } else if (ctx) {
      n.master.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
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
