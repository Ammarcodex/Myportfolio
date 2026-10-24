// Calm space ambience built with the Web Audio API (no audio files).
// A warm pad drifting slowly through major chords, a soft bass, and the odd
// music-box twinkle, in a gentle reverb. It plays steadily and does not react
// to scrolling.

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
// Cmaj7 → Fmaj7 → G6 → Fmaj7: warm, major, unhurried. [bass, ...pad voices]
const CHORDS = [
  [48, 60, 64, 67, 71],
  [41, 57, 60, 64, 65],
  [43, 59, 62, 64, 67],
  [41, 57, 60, 64, 69]
].map((chord) => chord.map(midi));
// C major pentatonic, an octave above the pad.
const TWINKLE = [72, 74, 76, 79, 81, 84].map(midi);
const CHORD_SECONDS = 12;

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
  let timer = 0;
  let suspendTimer = 0;

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, 3.2, 3);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    reverb.connect(wet).connect(master);

    // Pad: each voice a sine with a quiet triangle an octave up, warmly filtered.
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 1500;
    const pad = ctx.createGain();
    pad.gain.value = 0.07;
    padFilter.connect(pad);
    pad.connect(master);
    pad.connect(reverb);
    const voices = CHORDS[0].map((freq, i) => {
      const isBass = i === 0;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const level = ctx.createGain();
      level.gain.value = isBass ? 0.5 : 0.45;
      osc.connect(level).connect(padFilter);
      osc.start();
      const oscs = [{ osc, mul: 1 }];
      if (!isBass) {
        const air = ctx.createOscillator();
        air.type = 'triangle';
        air.frequency.value = freq * 2;
        air.detune.value = 3;
        const airLevel = ctx.createGain();
        airLevel.gain.value = 0.06;
        air.connect(airLevel).connect(padFilter);
        air.start();
        oscs.push({ osc: air, mul: 2 });
      }
      return oscs;
    });

    n = { master, reverb, voices };
  }

  function twinkle(time) {
    const freq = TWINKLE[Math.floor(Math.random() * TWINKLE.length)];
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(0.03, time + 0.02);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 2.4);
    env.connect(n.master);
    env.connect(n.reverb);
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = freq;
    tone.connect(env);
    tone.start(time);
    tone.stop(time + 2.5);
  }

  // Look a little ahead and schedule chord glides and twinkles.
  function tick() {
    if (!on || !n || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now >= nextChord) {
      chordIndex = (chordIndex + 1) % CHORDS.length;
      n.voices.forEach((oscs, i) => oscs.forEach(({ osc, mul }) => osc.frequency.setTargetAtTime(CHORDS[chordIndex][i] * mul, now, 2)));
      nextChord = now + CHORD_SECONDS;
    }
    if (nextTwinkle < now + 0.3) {
      twinkle(Math.max(nextTwinkle, now + 0.05));
      nextTwinkle = Math.max(nextTwinkle, now) + 3 + Math.random() * 3;
    }
  }

  async function setOn(value) {
    on = value;
    clearTimeout(suspendTimer);
    if (on) {
      if (!ctx) build();
      await ctx.resume();
      nextChord = ctx.currentTime + CHORD_SECONDS;
      nextTwinkle = ctx.currentTime + 2;
      clearInterval(timer);
      timer = setInterval(tick, 200);
      n.master.gain.setTargetAtTime(0.4, ctx.currentTime, 1.5);
    } else if (ctx) {
      clearInterval(timer);
      n.master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
      suspendTimer = setTimeout(() => { if (!on) ctx.suspend(); }, 1600);
    }
    return on;
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend();
    else if (on) ctx.resume();
  });

  return { setOn, get on() { return on; } };
}
