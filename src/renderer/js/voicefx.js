// Her own voice made hers (speech-worker.js): a neural voice (Piper) bent into a personality
// construct. Plain functions on mono Float32Array samples.
//
// The traits it builds, from the way she sounds in the show:
//   small and sweet: raised a few semitones, timing kept, a little breath under it
//   many minds:      a light chorus all the time (two copies drifting), and now and then older,
//                    lower "ghost" copies rising under a few words, fighting to speak
//   glitches:        a scratched-CD stutter on a word's first syllable ("ta-ta-ta-talia"), a sudden
//                    fall of the pitch into something robotic and back, a hard freeze mid-sentence
//   "hihi", "oups":  saturated, metallic reverb, a burst of static to cut it off

// ---------- basics ----------

export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// Played faster or slower (rate > 1: higher and shorter), linear interpolation.
export function varispeed(x, rate) {
  const n = Math.max(1, Math.floor(x.length / rate));
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * rate;
    const i0 = Math.floor(p);
    const f = p - i0;
    y[i] = (x[i0] || 0) * (1 - f) + (x[i0 + 1] || 0) * f;
  }
  return y;
}

function onePoleLow(x, cutoff, sr) {
  const a = Math.exp((-2 * Math.PI * cutoff) / sr);
  const y = new Float32Array(x.length);
  let z = 0;
  for (let i = 0; i < x.length; i++) y[i] = z = (1 - a) * x[i] + a * z;
  return y;
}

// 10 ms frames: loudness, for where words start and where she pauses
function frames(x, sr) {
  const size = Math.round(sr * 0.01);
  const out = [];
  for (let i = 0; i < x.length; i += size) {
    let s = 0;
    const end = Math.min(x.length, i + size);
    for (let j = i; j < end; j++) s += x[j] * x[j];
    out.push(Math.sqrt(s / Math.max(1, end - i)));
  }
  return { rms: out, size };
}

// Where words start (sound after a gap), and the pauses between them, in samples.
export function landmarks(x, sr) {
  const { rms, size } = frames(x, sr);
  const peak = rms.reduce((m, v) => Math.max(m, v), 1e-6);
  const quiet = rms.map((v) => v < peak * 0.06);
  const onsets = [];
  const pauses = [];
  let run = 0;
  for (let i = 0; i < quiet.length; i++) {
    if (quiet[i]) run++;
    else {
      if (run >= 4 && i > 5) onsets.push(i * size);
      if (run >= 8 && i - run > 5) pauses.push(Math.round((i - run / 2) * size));
      run = 0;
    }
  }
  return { onsets, pauses };
}

const fadeIn = (x, n) => { for (let i = 0; i < Math.min(n, x.length); i++) x[i] *= i / n; return x; };
const fadeOut = (x, n) => { for (let i = 0; i < Math.min(n, x.length); i++) x[x.length - 1 - i] *= i / n; return x; };

export function concat(parts) {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const y = new Float32Array(n);
  let at = 0;
  for (const p of parts) {
    y.set(p, at);
    at += p.length;
  }
  return y;
}

// fewer bits, fewer samples: digital, broken
function crush(x, bits, hold) {
  const q = 2 ** (bits - 1);
  const y = new Float32Array(x.length);
  let v = 0;
  for (let i = 0; i < x.length; i++) {
    if (i % hold === 0) v = Math.round(x[i] * q) / q;
    y[i] = v;
  }
  return y;
}

function drive(x, amount, clip = 1) {
  const y = new Float32Array(x.length);
  const k = Math.tanh(amount);
  for (let i = 0; i < x.length; i++) y[i] = Math.max(-clip, Math.min(clip, Math.tanh(x[i] * amount) / k));
  return y;
}

// static: noise in bursts, crackling
function staticBurst(sr, ms, level, random) {
  const n = Math.round((sr * ms) / 1000);
  const y = new Float32Array(n);
  let hold = 0;
  let v = 0;
  for (let i = 0; i < n; i++) {
    if (hold-- <= 0) {
      hold = Math.floor(random() * 40);
      v = random() < 0.35 ? (random() * 2 - 1) : 0;
    }
    y[i] = v * level * (1 - i / n) * (0.6 + random() * 0.4);
  }
  return y;
}

// ---------- the effects ----------

// Two copies drifting a few milliseconds around her (a chorus): the minds in her, always there.
export function chorus(x, sr, { mix = 0.28, depthMs = 3.5, baseMs = [11, 17], rates = [0.33, 0.51] } = {}) {
  const y = Float32Array.from(x);
  baseMs.forEach((base, v) => {
    for (let i = 0; i < x.length; i++) {
      const d = ((base + depthMs * Math.sin((2 * Math.PI * rates[v] * i) / sr + v)) * sr) / 1000;
      const p = i - d;
      const i0 = Math.floor(p);
      const f = p - i0;
      const s = (x[i0] || 0) * (1 - f) + (x[i0 + 1] || 0) * f;
      y[i] += s * mix * (v ? -0.8 : 1);
    }
  });
  return y;
}

// A small metallic room: short combs, bright.
export function metal(x, sr, { mix = 0.18, feedback = 0.62 } = {}) {
  const delays = [7.1, 9.7, 12.3, 15.9].map((ms) => Math.round((ms * sr) / 1000));
  const tail = Math.round(sr * 0.35);
  const y = new Float32Array(x.length + tail);
  y.set(x);
  const wet = new Float32Array(y.length);
  for (const d of delays) {
    const buf = new Float32Array(y.length);
    for (let i = 0; i < y.length; i++) {
      buf[i] = (y[i] || 0) + (i >= d ? buf[i - d] * feedback : 0);
      wet[i] += buf[i] / delays.length;
    }
  }
  for (let i = 0; i < y.length; i++) y[i] = (i < x.length ? x[i] : 0) + wet[i] * mix;
  return y;
}

// Breath under her voice, following it: whispered, soft.
export function breath(x, sr, { level = 0.05 } = {}, random = Math.random) {
  const env = onePoleLow(Float32Array.from(x, Math.abs), 30, sr);
  const white = Float32Array.from(x, () => random() * 2 - 1);
  const low = onePoleLow(white, 2500, sr); // what's left above it: a hiss, not a rumble
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i] + (white[i] - low[i]) * env[i] * level * 6;
  return y;
}

// "Ta-ta-ta-talia": the start of the word at `at` repeated, more crushed each time.
export function stutter(x, sr, at, { times = 3, ms = 85 } = {}) {
  const n = Math.round((sr * ms) / 1000);
  const grain = x.slice(at, at + n);
  const reps = [];
  for (let k = 0; k < times; k++) {
    const g = crush(grain, 8 - k * 2, 1 + k * 2);
    reps.push(fadeOut(fadeIn(Float32Array.from(g), 40), 60));
    reps.push(new Float32Array(Math.round(sr * 0.012)));
  }
  return concat([x.slice(0, at), ...reps, x.slice(at)]);
}

// The voice falls through the floor for a moment (robotic, far below), then snaps back up.
export function drop(x, sr, at, { ms = 260, rate = 0.38 } = {}) {
  const n = Math.round((sr * ms) / 1000);
  const low = crush(varispeed(x.slice(at, at + n), rate), 7, 2);
  return concat([x.slice(0, at), fadeOut(fadeIn(drive(low, 2.2), 60), 80), x.slice(at + n)]);
}

// Her processor freezes mid-sentence: the sound stops dead, a hum, a click, and she goes on.
export function freeze(x, sr, at, { ms = 240 } = {}, random = Math.random) {
  const n = Math.round((sr * ms) / 1000);
  const gap = new Float32Array(n);
  for (let i = 0; i < n; i++) gap[i] = Math.sin((2 * Math.PI * 58 * i) / sr) * 0.025 + (random() < 0.002 ? 0.3 : 0);
  const click = staticBurst(sr, 18, 0.5, random);
  // the last few milliseconds before it held and repeated, like a frame stuck on screen
  const held = x.slice(Math.max(0, at - Math.round(sr * 0.03)), at);
  return concat([x.slice(0, at), held, held, gap, click, x.slice(at)]);
}

// Other minds rising under a few words: lower, older copies, half a beat behind.
export function ghosts(x, sr, at, { ms = 750, level = 0.45 } = {}) {
  const n = Math.round((sr * ms) / 1000);
  const y = Float32Array.from(x);
  const piece = x.slice(at, at + n);
  for (const [rate, gain, lag] of [[0.72, level, 0.03], [0.58, level * 0.7, 0.06], [0.86, level * 0.5, 0.015]]) {
    const v = onePoleLow(varispeed(piece, rate), 2500, sr);
    const start = at + Math.round(sr * lag);
    for (let i = 0; i < Math.min(v.length, n); i++) {
      const env = Math.sin((Math.PI * i) / n); // swells in and out
      if (start + i < y.length) y[start + i] += v[i] * gain * env;
    }
  }
  return y;
}

// "Hihi !", "Oups !": pushed into the red, metallic, and cut off by static.
export function giggle(x, sr, random = Math.random) {
  return concat([metal(drive(x, 5, 0.85), sr, { mix: 0.45, feedback: 0.7 }), staticBurst(sr, 140, 0.4, random)]);
}

export function normalize(x, peak = 0.89) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  const k = m ? peak / m : 1;
  return Float32Array.from(x, (v) => v * k);
}

// ---------- her voice ----------

// The whole of it, for a sentence the neural voice spoke (`raw`, spoken `pitch` times slower so it
// keeps its pace once raised). style: how unstable she is, 0 (clean) to 1 (falling apart).
export function capriVoice(raw, sr, { pitch = 1.22, style = 0.5, breathLevel = 0.04, seed = 7, glitches = null } = {}) {
  const random = rng(seed);
  let x = varispeed(raw, pitch);
  x = breath(x, sr, { level: breathLevel }, random);
  const { onsets, pauses } = landmarks(x, sr);
  // which glitches, and where: from the end backwards, so earlier positions stay right
  const plan = glitches || [];
  if (!glitches) {
    const pickFrom = (list, from = 0.15, to = 0.85) => {
      const ok = list.filter((p) => p > x.length * from && p < x.length * to);
      return ok.length ? ok[Math.floor(random() * ok.length)] : null;
    };
    if (style > 0.25 && random() < 0.4 + style * 0.5) plan.push(['stutter', pickFrom(onsets)]);
    if (style > 0.3 && random() < style * 0.8) plan.push(['freeze', pickFrom(pauses, 0.2, 0.8)]);
    if (style > 0.55 && random() < style * 0.7) plan.push(['drop', pickFrom(onsets, 0.3, 0.9)]);
    if (style > 0.4 && random() < style) plan.push(['ghosts', pickFrom(onsets, 0.1, 0.7)]);
  }
  const done = new Set();
  for (const [kind, at] of plan.filter(([, at]) => at !== null).sort((a, b) => b[1] - a[1])) {
    if (done.has(at)) continue;
    done.add(at);
    if (kind === 'stutter') x = stutter(x, sr, at);
    else if (kind === 'freeze') x = freeze(x, sr, at, {}, random);
    else if (kind === 'drop') x = drop(x, sr, at);
    else if (kind === 'ghosts') x = ghosts(x, sr, at, { level: 0.3 + style * 0.3 });
  }
  x = chorus(x, sr, { mix: 0.18 + style * 0.15 });
  x = metal(x, sr, { mix: 0.08 + style * 0.1 });
  x = drive(x, 1.3 + style * 0.8);
  return normalize(x);
}
