// Calm space ambience built with the Web Audio API (no audio files).
// Several presets share one engine (output, reverb, scheduler); each preset
// builds its own voices and schedules its own events. None react to scrolling.

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (a, b) => a + Math.random() * (b - a);

function impulse(ctx, seconds, decay) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return buffer;
}

function noiseBuffer(ctx, seconds) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    brown = (brown + 0.02 * white) / 1.02;
    data[i] = brown * 2.5 + white * 0.08; // mostly soft brown, a touch of hiss
  }
  return buffer;
}

// A single enveloped tone: sine partials with independent levels and decay.
function strike(ctx, dest, time, partials, attack = 0.01) {
  partials.forEach(({ freq, level, decay, type = 'sine' }) => {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(level, time + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    env.connect(dest);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(env);
    osc.start(time);
    osc.stop(time + decay + 0.05);
  });
}

export const PRESETS = {
  // Meditation bowls struck every few seconds over a faint hum.
  bowls: {
    label: 'Singing bowls',
    reverb: [4, 2.6, 0.5],
    build(ctx, { dry, wet }) {
      const hum = ctx.createGain();
      hum.gain.value = 0.035;
      hum.connect(dry);
      hum.connect(wet);
      [110, 164.8].forEach((f) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = f;
        osc.connect(hum);
        osc.start();
      });
      const bowl = ctx.createGain();
      bowl.gain.value = 0.5;
      bowl.connect(dry);
      bowl.connect(wet);
      let next = ctx.currentTime + 0.5;
      return (now) => {
        if (next > now + 0.3) return;
        const f = pick([196, 220, 261.6, 293.7, 329.6]);
        // Bowls ring with inharmonic partials; slight detuned pairs make the slow "wah".
        const partials = [[1, 0.09, 9], [2.71, 0.035, 6], [5.15, 0.015, 4], [8.4, 0.006, 2.5]]
          .flatMap(([ratio, level, decay]) => [
            { freq: f * ratio, level, decay },
            { freq: f * ratio + 1.3, level: level * 0.7, decay }
          ]);
        strike(ctx, bowl, Math.max(next, now + 0.05), partials, 0.008);
        next = Math.max(next, now) + between(5, 8);
      };
    }
  },

  // Slow waves washing in and out, with the odd soft chime.
  ocean: {
    label: 'Ocean of stars',
    reverb: [3.5, 3, 0.45],
    build(ctx, { dry, wet }) {
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer(ctx, 4);
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;
      const swell = ctx.createGain();
      swell.gain.value = 0.05;
      noise.connect(filter).connect(swell);
      swell.connect(dry);
      swell.connect(wet);
      noise.start();
      const chime = ctx.createGain();
      chime.gain.value = 1;
      chime.connect(dry);
      chime.connect(wet);
      let nextWave = ctx.currentTime + 0.2;
      let nextChime = ctx.currentTime + 3;
      return (now) => {
        if (nextWave < now + 0.3) {
          const t = Math.max(nextWave, now);
          const rise = between(2.5, 3.5);
          const fall = between(4.5, 6);
          swell.gain.setTargetAtTime(between(0.26, 0.36), t, rise / 3);
          swell.gain.setTargetAtTime(0.05, t + rise, fall / 3);
          filter.frequency.setTargetAtTime(between(900, 1400), t, rise / 3);
          filter.frequency.setTargetAtTime(280, t + rise, fall / 3);
          nextWave = t + rise + fall * 0.8;
        }
        if (nextChime < now + 0.3) {
          const t = Math.max(nextChime, now + 0.05);
          const notes = [84, 86, 88, 91, 93, 96];
          for (let i = 0; i < (Math.random() < 0.5 ? 2 : 3); i++) {
            strike(ctx, chime, t + i * between(0.18, 0.35), [{ freq: midi(pick(notes)), level: 0.03, decay: 1.8, type: 'triangle' }]);
          }
          nextChime = t + between(4, 7);
        }
      };
    }
  },

  // Sparse, soft piano-like notes with an echo, in the spirit of airport ambient.
  piano: {
    label: 'Space piano',
    reverb: [3, 3, 0.5],
    build(ctx, { dry, wet }) {
      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2400;
      const echo = ctx.createDelay(2);
      echo.delayTime.value = 0.62;
      const feedback = ctx.createGain();
      feedback.gain.value = 0.35;
      echo.connect(feedback).connect(echo);
      const echoLevel = ctx.createGain();
      echoLevel.gain.value = 0.4;
      echo.connect(echoLevel).connect(tone);
      tone.connect(dry);
      tone.connect(wet);
      const keys = ctx.createGain();
      keys.gain.value = 1;
      keys.connect(tone);
      keys.connect(echo);
      const scale = [53, 57, 60, 62, 65, 67, 69, 72, 74, 77];
      let next = ctx.currentTime + 0.5;
      return (now) => {
        if (next > now + 0.3) return;
        const t = Math.max(next, now + 0.05);
        const play = (m, at) => {
          const f = midi(m);
          strike(ctx, keys, at, [
            { freq: f, level: 0.07, decay: 4.5 },
            { freq: f * 2, level: 0.022, decay: 2.5 },
            { freq: f * 3, level: 0.007, decay: 1.4 }
          ], 0.006);
        };
        play(pick(scale), t);
        if (Math.random() < 0.3) play(pick(scale), t + between(0.4, 0.9));
        next = t + between(2.5, 5);
      };
    }
  },

  // A slow, warm organ-like drone that swells and shifts every 16s.
  hum: {
    label: 'Deep hum',
    reverb: [4, 2.4, 0.5],
    build(ctx, { dry, wet }) {
      const chords = [[45, 52, 57, 61], [42, 49, 54, 57], [38, 45, 50, 54], [40, 47, 52, 56]].map((c) => c.map(midi));
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1100;
      const organ = ctx.createGain();
      organ.gain.value = 0.05;
      filter.connect(organ);
      organ.connect(dry);
      organ.connect(wet);
      const swell = ctx.createOscillator();
      swell.frequency.value = 0.04;
      const swellDepth = ctx.createGain();
      swellDepth.gain.value = 0.02;
      swell.connect(swellDepth).connect(organ.gain);
      swell.start();
      // Each voice: fundamental + octave + twelfth, like soft organ stops.
      const voices = chords[0].map((f) => [[1, 0.5], [2, 0.18], [3, 0.06]].map(([mul, level]) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = f * mul;
        const g = ctx.createGain();
        g.gain.value = level;
        osc.connect(g).connect(filter);
        osc.start();
        return { osc, mul };
      }));
      let index = 0;
      let next = ctx.currentTime + 16;
      return (now) => {
        if (now < next) return;
        index = (index + 1) % chords.length;
        voices.forEach((stops, i) => stops.forEach(({ osc, mul }) => osc.frequency.setTargetAtTime(chords[index][i] * mul, now, 3)));
        next = now + 16;
      };
    }
  },

  // The previous sound: warm major-chord pad with music-box twinkles.
  pad: {
    label: 'Warm pad',
    reverb: [3.2, 3, 0.55],
    build(ctx, { dry, wet }) {
      const chords = [[48, 60, 64, 67, 71], [41, 57, 60, 64, 65], [43, 59, 62, 64, 67], [41, 57, 60, 64, 69]].map((c) => c.map(midi));
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1500;
      const pad = ctx.createGain();
      pad.gain.value = 0.07;
      filter.connect(pad);
      pad.connect(dry);
      pad.connect(wet);
      const voices = chords[0].map((f) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = f;
        const g = ctx.createGain();
        g.gain.value = 0.45;
        osc.connect(g).connect(filter);
        osc.start();
        return osc;
      });
      const twinkles = ctx.createGain();
      twinkles.gain.value = 1;
      twinkles.connect(dry);
      twinkles.connect(wet);
      let index = 0;
      let nextChord = ctx.currentTime + 12;
      let nextTwinkle = ctx.currentTime + 2;
      return (now) => {
        if (now >= nextChord) {
          index = (index + 1) % chords.length;
          voices.forEach((osc, i) => osc.frequency.setTargetAtTime(chords[index][i], now, 2));
          nextChord = now + 12;
        }
        if (nextTwinkle < now + 0.3) {
          const t = Math.max(nextTwinkle, now + 0.05);
          strike(ctx, twinkles, t, [{ freq: midi(pick([72, 74, 76, 79, 81, 84])), level: 0.03, decay: 2.4 }], 0.02);
          nextTwinkle = t + between(3, 6);
        }
      };
    }
  }
};

export function createSpaceAudio(presetName = 'ocean') {
  const preset = PRESETS[presetName] || PRESETS.ocean;
  let ctx = null;
  let master = null;
  let tick = null;
  let on = false;
  let timer = 0;
  let suspendTimer = 0;

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const [seconds, decay, wetLevel] = preset.reverb;
    const reverb = ctx.createConvolver();
    reverb.buffer = impulse(ctx, seconds, decay);
    const wetGain = ctx.createGain();
    wetGain.gain.value = wetLevel;
    reverb.connect(wetGain).connect(master);
    tick = preset.build(ctx, { dry: master, wet: reverb });
  }

  async function setOn(value) {
    on = value;
    clearTimeout(suspendTimer);
    clearInterval(timer);
    if (on) {
      if (!ctx) build();
      await ctx.resume();
      // Schedule a little ahead on a timer; events are timed on the audio clock.
      timer = setInterval(() => { if (ctx.state === 'running') tick(ctx.currentTime); }, 200);
      master.gain.setTargetAtTime(0.4, ctx.currentTime, 1.5);
    } else if (ctx) {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
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
