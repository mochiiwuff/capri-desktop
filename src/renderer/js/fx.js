// Full-screen effect layer: shards, light beams, the zigzag streak between two teleport
// points, the void she collapses into and the swirl she comes back from, data glyphs,
// mane shards drifting off, the stars rising out of her mane, the satellite and the red light
// she sends up to it, the windows she takes over, red lightning, speed lines, shockwaves, and
// the cut-ins (real frames of her from the show).
// Drawn on whole frames (24 fps) and only while something is alive.

import { rand, pick, clamp } from './util.js';

export const COLORS = {
  red: '#ff2152',
  green: '#36ff7a',
  ink: '#14101c',
  violet: '#7b3dff',
  paper: '#fff4f6',
  blue: '#3d6bff',
};

const SHARD_PALETTE = ['red', 'red', 'red', 'red', 'ink', 'ink', 'green', 'green', 'violet', 'paper'];
const GLYPHS = ['01', '10', '▚', '▞', '◢', '◣', '>_', '{}', '#', '⌁', '//', '0x'];
const FRAME_MS = 1000 / 24;
const CUTIN = { w: 360, h: 240 }; // assets/capri/cutin-*.png
// her intro (see intro()): her close-up holding your screen by its edges
// (assets/capri/intro-grab.webp, cut out by tools/build-intro.py), where things are on it in its
// pixels, and when things happen, in drawings at 24 fps
const GRAB = {
  w: 1672, h: 941,
  face: { x: 830, y: 330, size: 430 }, // the middle of her face, and about how wide it is
  eyes: [{ x: 719.5, y: 382.5 }, { x: 935, y: 297.5 }],
  tilt: -0.38, // her head's tilt (radians), for her lids
  socket: 48, iris: 34, pupil: 13.5, // the ink inside her green rings, her blue iris, her white pupil
  irisColor: '#026ffe', pupilColor: '#fdfdfb', inkColor: '#010207', // the picture's own colours
  tag: { x: 1110, y: 175 }, // where "hi" pops, by her face
  hands: [{ x: 0, y: 610 }, { x: 1672, y: 520 }], // where her hands hold the edges of the screen
};
const INTRO_T = { hands: 6, right: 8, reach: 10, grab: 16, hold: 21, blink: 29, hi: 34, wave: 46, regrab: 63, happy: 65, glance: 75, slip: 80, antic: 86, shrink: 88, land: 98, end: 101 };
// her close-up's drawings (assets/capri/intro-<name>.webp), the same picture with only her mouth,
// her eyes or her right arm changed: at rest, her mouth ajar, half open and wide open, waving (her
// hand tilted left, right, straight up), her arm a smear between the edge and her face, and her
// eyes shut with joy
export const GRAB_FRAMES = ['grab', 'mouth1', 'mouth2', 'mouth3', 'wave1', 'wave2', 'wave3', 'smear', 'happy'];
// the wave, after the smear of her arm leaving the edge: three drawings each
const WAVE = ['wave1', 'wave3', 'wave2', 'wave3', 'wave1'];
// drawings whose eyes are their own (not redrawn over: they don't look around)
const OWN_EYES = new Set(['happy']);
// "hi", from her mouth starting to open (in drawings at 24 fps, two each)
const SAY_HI = ['mouth1', 'mouth1', 'mouth3', 'mouth3', 'mouth3', 'mouth3', 'mouth2', 'mouth2', 'mouth1', 'mouth1'];

const lerp = (a, b, t) => a + (b - a) * t;

// A stable random number in [0, 1) for (i, seed): the same drawing gets the same jags.
const hash = (i, seed) => {
  const v = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return v - Math.floor(v);
};

// What shows of her intro's close-up (fx.js intro): never a straight edge of the picture, always a
// jagged one, new jags every drawing (`seed`). Each adds its shape to the current path, in the
// picture's pixels.
const JAG = 70; // px of the picture between two points of a cut
const JAG_AMP = 46;

// From the sides in: rL and rR, how far in from the left and right edges (1: half the picture).
function cutEdges(ctx, rL, rR, seed) {
  const { w, h } = GRAB;
  const side = (r, left) => {
    if (r <= 0) return;
    const reach = r * w * 0.5;
    const amp = JAG_AMP * Math.min(1, r * 4);
    ctx.moveTo(left ? -60 : w + 60, -60);
    for (let y = -60, i = 0; y <= h + 60 + JAG; y += JAG, i++) {
      const x = reach + (hash(i, seed + (left ? 0 : 50)) - 0.5) * 2 * amp;
      ctx.lineTo(left ? x : w - x, y);
    }
    ctx.lineTo(left ? -60 : w + 60, h + 60 + JAG);
    ctx.closePath();
  };
  side(rL, true);
  side(rR, false);
}

// From the middle out: a band `half` wide on each side of her face.
function cutBand(ctx, half, seed) {
  const { h } = GRAB;
  const cx = GRAB.face.x;
  const ys = [];
  for (let y = -60; y <= h + 60 + JAG; y += JAG) ys.push(y);
  ys.forEach((y, i) => {
    const x = cx - half - (hash(i, seed) - 0.5) * 2 * JAG_AMP;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  for (let i = ys.length - 1; i >= 0; i--) ctx.lineTo(cx + half + (hash(i, seed + 50) - 0.5) * 2 * JAG_AMP, ys[i]);
  ctx.closePath();
}

// Her head and mane: a spiky disc of radius R around her face, long points and short ones.
function cutHead(ctx, R, seed) {
  const N = 30;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const r = R * (i % 2 ? 0.78 : 1) * (0.92 + hash(i, seed) * 0.16);
    const x = GRAB.face.x + Math.cos(a) * r * 1.15, y = GRAB.face.y + Math.sin(a) * r * 0.95;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}
const onTwos = (ms) => Math.floor(ms / (FRAME_MS * 2)) * FRAME_MS * 2;

// Her mask, what she is at heart in the show once the mane and the body are gone: a green
// slab of a face with a hooked spike rising from it, two eyes (ink almonds, green ring, blue
// iris, white pupil turned toward `look`), and a white fang under it, all over a violet copy.
// Drawn around (x, y) = the middle of the face, k = scale (1: about 95 px wide).
//   eyes   how open each eye is, [left, right]; under 0.15 it's shut (a thick sleepy curve)
//   spike  draw the hooked spike above it
//   flat   one colour for the whole thing (an impact frame)
const MASK = {
  face: [[-48, -20], [-12, -22], [48, -26], [46, 20], [-45, 23]],
  spike: [[-32, -20], [-37, -50], [-22, -63], [6, -67], [24, -75], [34, -99], [49, -90], [44, -66], [30, -48], [2, -42], [-10, -40], [-12, -21]],
  fang: [[-6, 22], [1, 27], [8, 22], [13, 26], [22, 21], [8, 52]],
  eyes: [[-23, 0], [22, -3]],
};

export function drawMask(ctx, x, y, k, { eyes = [1, 1], look = null, spike = true, flat = null } = {}) {
  const poly = (pts, dx = 0, dy = 0) => {
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px + dx, py + dy) : ctx.moveTo(px + dx, py + dy)));
    ctx.closePath();
  };
  const shapes = spike ? [MASK.spike, MASK.face, MASK.fang] : [MASK.face, MASK.fang];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  ctx.lineJoin = 'miter';
  for (const s of shapes) {
    poly(s, 3, 3);
    ctx.fillStyle = flat || COLORS.violet;
    ctx.fill();
  }
  if (flat) {
    for (const s of shapes) {
      poly(s);
      ctx.fill();
    }
    ctx.restore();
    return;
  }
  if (spike) {
    poly(MASK.spike);
    ctx.fillStyle = COLORS.green;
    ctx.fill();
  }
  poly(MASK.face);
  ctx.fillStyle = COLORS.green;
  ctx.fill();
  poly(MASK.fang);
  ctx.fillStyle = COLORS.paper;
  ctx.fill();
  ctx.strokeStyle = COLORS.green;
  ctx.lineWidth = 2.2;
  ctx.stroke();
  MASK.eyes.forEach(([ex, ey], i) => {
    const o = eyes[i];
    if (o < 0.15) {
      // shut
      ctx.beginPath();
      ctx.moveTo(ex - 15, ey - 4);
      ctx.lineTo(ex, ey + 5);
      ctx.lineTo(ex + 15, ey - 4);
      ctx.strokeStyle = COLORS.ink;
      ctx.lineWidth = 4.5;
      ctx.stroke();
      return;
    }
    let px = 0, py = 0;
    if (look) {
      const d = Math.hypot(look.x - (x + ex * k), look.y - (y + ey * k)) || 1;
      px = ((look.x - (x + ex * k)) / d) * 2.6;
      py = ((look.y - (y + ey * k)) / d) * 2.2;
    }
    ctx.save();
    ctx.translate(ex, ey);
    ctx.scale(1, o);
    ctx.beginPath(); // an almond of ink
    ctx.moveTo(-19, 0);
    ctx.quadraticCurveTo(0, -24, 19, 0);
    ctx.quadraticCurveTo(0, 24, -19, 0);
    ctx.fillStyle = COLORS.ink;
    ctx.fill();
    const disk = (dx, dy, r, color) => {
      ctx.beginPath();
      ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };
    disk(px * 0.4, py * 0.4, 10.5, COLORS.green);
    disk(px * 0.4, py * 0.4, 8.8, COLORS.ink);
    disk(px * 0.7, py * 0.7, 7.6, COLORS.blue);
    ctx.beginPath();
    ctx.ellipse(px, py, 3, 4, 0, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.paper;
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}

// One of her eyes: green ring, blue iris, white pupil turned toward `look`, over an ink disk
// with its violet copy. `open` squashes it shut. (The eyes all over a window she possesses.)
export function drawEye(ctx, x, y, R, open, look = null) {
  let px = 0, py = 0;
  if (look) {
    const d = Math.hypot(look.x - x, look.y - y) || 1;
    px = ((look.x - x) / d) * R * 0.2;
    py = ((look.y - y) / d) * R * 0.2;
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, open);
  const disk = (dx, dy, r, color) => {
    ctx.beginPath();
    ctx.arc(dx, dy, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  };
  disk(-3, 3, R, COLORS.violet);
  disk(0, 0, R, COLORS.ink);
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.8, 0, Math.PI * 2);
  ctx.strokeStyle = COLORS.green;
  ctx.lineWidth = R * 0.16;
  ctx.stroke();
  disk(px * 0.6, py * 0.6, R * 0.52, COLORS.blue);
  ctx.beginPath();
  ctx.ellipse(px, py, R * 0.16, R * 0.24, 0, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.paper;
  ctx.fill();
  ctx.restore();
}

export class FxLayer {
  constructor(canvas, { cutins = {}, intro = null, loadIntro = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cutins = cutins;
    this.loadIntro = loadIntro;
    this.setIntro(intro);
    this.items = [];
    this.running = false;
    this.last = 0;
  }

  resize(width, height) {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.size = { w: width, h: height };
  }

  // Showing you something: a lock-on reticle that slams onto `rect`, a dashed wire from her
  // fingertip (`from`, a function) to `aim` with data running down it, two of her eyes opening
  // on the reticle's corners, and a word on a tag. When `rect` is off her screen (the tray, down
  // in the taskbar), an arrow on the edge points the rest of the way.
  // Handle: tap() (she jabs at it: the reticle pulses), retract() (the wire reels back into her
  // finger, the reticle lets go), fade().
  pointer(from, rect, aim, { label = '' } = {}) {
    const item = this.add({ type: 'pointer', life: 10 * 60 * 1000, from, rect, aim, label, fadeAt: 0, tapAt: 0, retractAt: 0 });
    return {
      tap: () => { item.tapAt = performance.now(); },
      retract: () => { item.retractAt ||= performance.now(); },
      fade: () => { item.fadeAt ||= performance.now(); },
    };
  }

  add(item) {
    item.born = performance.now();
    this.items.push(item);
    if (!this.running) {
      this.running = true;
      requestAnimationFrame((t) => this.frame(t));
    }
    return item;
  }

  // ---------- shards and light ----------

  // Shards thrown out (or sucked in) around a point.
  burst(x, y, { count = 22, power = 1, inward = false, spread = 70 } = {}) {
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2);
      const speed = rand(220, 680) * power;
      const ox = x + rand(-spread, spread) * 0.5;
      const oy = y + rand(-spread, spread);
      const life = rand(260, 620);
      this.add({
        type: 'shard',
        life,
        x: inward ? ox + Math.cos(angle) * speed * life / 1600 : ox,
        y: inward ? oy + Math.sin(angle) * speed * life / 1600 : oy,
        vx: Math.cos(angle) * speed * (inward ? -1 : 1),
        vy: Math.sin(angle) * speed * (inward ? -1 : 1),
        rot: rand(0, Math.PI * 2),
        vr: rand(-9, 9),
        len: rand(10, 36),
        wid: rand(3, 10),
        color: COLORS[pick(SHARD_PALETTE)],
      });
    }
  }

  // Vertical pillar of light, from the top of the screen down to `bottom` (shrinking or landing).
  beam(x, bottom, { down = false, life = 200, width = 30 } = {}) {
    this.add({ type: 'beam', life, x, bottom, down, width });
  }

  // Jagged line between two points, a frame or two long. It tells the eye where she went.
  streak(x1, y1, x2, y2, { life = 120 } = {}) {
    const pts = [];
    const n = 9;
    const nx = -(y2 - y1), ny = x2 - x1;
    const len = Math.hypot(nx, ny) || 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const off = i === 0 || i === n ? 0 : rand(-1, 1) * Math.min(60, len * 0.08);
      pts.push([x1 + (x2 - x1) * t + (nx / len) * off, y1 + (y2 - y1) * t + (ny / len) * off]);
    }
    this.add({ type: 'streak', life, pts });
  }

  // Horizontal slivers of the body knocked sideways.
  slices(x, y, w, h, { count = 7, life = 160 } = {}) {
    for (let i = 0; i < count; i++) {
      this.add({
        type: 'slice',
        life: life * rand(0.6, 1),
        x: x + rand(-w * 0.3, w * 0.3),
        y: y + rand(0, h),
        w: rand(w * 0.3, w * 1.1),
        h: rand(2, 7),
        dx: rand(-60, 60),
        color: COLORS[pick(['red', 'green', 'violet', 'paper'])],
      });
    }
  }

  // The void she collapses into, like in the show: a black slit with her as a red line inside.
  slit(x, top, bottom, { width = 60, life = 210 } = {}) {
    this.add({ type: 'slit', life, x, top, bottom, width });
  }

  // How she comes back in the show: her pieces spiralling in, mane shards and green eye-stars.
  vortex(x, y, { radius = 170, life = 360, count = 18 } = {}) {
    const ps = Array.from({ length: count }, (_, i) => ({
      a: (i / count) * Math.PI * 2 + rand(-0.25, 0.25),
      r: rand(0.65, 1.1),
      eye: i % 4 === 0,
      color: COLORS[pick(['red', 'red', 'red', 'ink', 'violet'])],
      len: rand(14, 34),
      wid: rand(4, 9),
    }));
    this.add({ type: 'vortex', life, x, y, radius, ps });
  }

  // Manga concentration lines closing in on a point, redrawn every other frame.
  lines(x, y, { inner = 140, life = 480 } = {}) {
    this.add({ type: 'lines', life, x, y, inner });
  }

  // A hard-edged shockwave.
  ring(x, y, { size = 1 } = {}) {
    this.add({ type: 'ring', life: 280, x, y, size });
  }

  // Red lightning, her hacking power: a jagged bolt with forks, re-struck every frame.
  // `to` can be a function of time, for a moving target.
  bolt(from, to, { life = 380, forks = 2, width = 3 } = {}) {
    this.add({ type: 'bolt', life, from, to, forks, width });
  }

  glyph(x, y) {
    this.add({ type: 'glyph', life: rand(900, 1400), x: x + rand(-40, 40), y, text: pick(GLYPHS), drift: rand(-12, 12) });
  }

  // One shard coming loose from the mane and floating away, slowly, outward and up.
  drift(x, y, angle) {
    const speed = rand(16, 34);
    this.add({
      type: 'drift',
      life: rand(1900, 2900),
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 10,
      rot: angle + rand(-0.4, 0.4),
      vr: rand(-0.8, 0.8),
      len: rand(9, 20),
      wid: rand(3, 6),
      color: COLORS[pick(['red', 'red', 'red', 'ink', 'paper'])],
    });
  }

  // ---------- the satellite ----------

  // The white specks of her mane lifting off as a sky of her own, linked up like a
  // constellation (all the minds in her). Handle:
  //   align(ends)  they line up into a road between the two points ends() returns
  //   light(ms)    they flare one after the other, from her end up, over ms
  //   dim()        back to plain specks
  //   home(dx, dy) they fly back into her mane (shifted by how far she moved since)
  motes(sources, { lift = 220, spread = 300 } = {}) {
    const ps = sources.map((s) => ({
      x0: s.x, y0: s.y,
      x1: s.x + rand(-spread, spread) * 0.5,
      y1: s.y - rand(lift * 0.45, lift * 1.3),
      size: rand(2, 4),
      phase: rand(0, 6),
      delay: rand(0, 500),
      u: 0,
      off: rand(-7, 7),
    }));
    // each star linked to its nearest neighbour in the sky
    const links = [];
    ps.forEach((p, i) => {
      let best = -1, d = Infinity;
      ps.forEach((q, j) => {
        const dd = Math.hypot(q.x1 - p.x1, q.y1 - p.y1);
        if (j !== i && dd < d) [best, d] = [j, dd];
      });
      if (best >= 0 && !links.some(([a, b]) => a === best && b === i)) links.push([i, best]);
    });
    const item = this.add({
      type: 'motes', life: 60000, ps, links,
      ends: null, alignAt: 0, litAt: 0, litMs: 0, dimAt: 0, homeAt: 0, shift: [0, 0],
    });
    return {
      align: (ends) => {
        const [a, b] = ends();
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        // whoever is closest to her end goes first, so the stars don't cross each other's paths
        const along = (p) => ((p.x1 - a.x) * (b.x - a.x) + (p.y1 - a.y) * (b.y - a.y)) / len;
        [...ps].sort((p, q) => along(p) - along(q)).forEach((p, i) => { p.u = 0.1 + (0.82 * i) / Math.max(1, ps.length - 1); });
        item.ends = ends;
        item.alignAt = performance.now();
      },
      light: (ms = 125) => { item.litAt = performance.now(); item.litMs = ms; },
      dim: () => { item.dimAt ||= performance.now(); },
      home: (dx = 0, dy = 0) => {
        if (item.homeAt) return;
        item.homeAt = performance.now();
        item.shift = [dx, dy];
      },
    };
  }

  // A satellite crossing the sky, slowly: it blinks into view, then glints on threes, with a
  // short trail. Handle: pos(now), twinkle(size) (a big four-point flare, it answers her), fade().
  satellite(from, to, { duration = 9000 } = {}) {
    const item = this.add({ type: 'satellite', life: 60000, from, to, duration, flare: null, fadeAt: 0 });
    const pos = (now = performance.now()) => {
      const k = Math.min(1, Math.max(0, (now - item.born) / duration));
      return { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) };
    };
    item.pos = pos;
    return {
      pos,
      twinkle: (size = 1) => { item.flare = { at: performance.now(), size }; },
      fade: () => { item.fadeAt ||= performance.now(); },
    };
  }

  // The red light going up: a heavy bolt from her hand to the satellite (ends() returns both).
  // Its head races up in three drawings, the first one in negative (an impact frame), then it
  // holds, struck fresh on every drawing with light running up it, until break(): it snaps and
  // the pieces fall. onHit runs when it reaches the top.
  surge(ends, { onHit = null } = {}) {
    const item = this.add({ type: 'surge', life: 60000, ends, onHit, pts: null, breakAt: 0, pieces: null });
    return { break: () => { item.breakAt ||= performance.now(); } };
  }

  // She takes over a window: lightning races round its frame from where she dove in, slices
  // of it glitch, and it looks at you with her eyes and her grin, more eyes opening all over it,
  // every pupil on your pointer. rect() gives the window now (null once it's gone), covers() the
  // windows in front of it (nothing is drawn over those), look() the pointer.
  // Handle: leave() closes the eyes and ends it.
  possess(rect, { covers = () => [], entry = 0, look = () => null } = {}) {
    const extra = Array.from({ length: 7 }, (_, i) => {
      // around the face, not on it
      const a = (i / 7) * Math.PI * 2 + rand(-0.3, 0.3);
      return { u: 0.5 + Math.cos(a) * rand(0.28, 0.42), v: 0.46 + Math.sin(a) * rand(0.26, 0.4), size: rand(0.35, 0.65), at: 650 + i * 95 };
    });
    const item = this.add({ type: 'possess', life: 60000, rect, covers, entry, look, extra, leaveAt: 0, off: null });
    return { leave: () => { item.leaveAt ||= performance.now(); } };
  }

  // Little red sparks crawling out of a point (her hand charging up), wider as it goes.
  // `at` can be a function, for a moving point.
  crackle(at, { life = 700, radius = 46, count = 3 } = {}) {
    this.add({ type: 'crackle', life, at, radius, count });
  }

  // ---------- cut-ins ----------

  // Anime cut-in: a slanted band with a close-up of her (a real frame from the show),
  // pushed in, speed lines behind. Kinds: grin, laugh, eyes, many, look. Resolves when gone.
  cutin(x, y, dir = 1, { kind = 'grin', life = 760 } = {}) {
    const image = this.cutins[kind] || this.cutins.grin;
    if (!image) return Promise.resolve();
    return new Promise((done) => this.add({ type: 'cutin', life, x, y, dir, image, done }));
  }

  // ---------- her intro ----------

  // Her first appearance: she grabs your screen. Its edges crackle red; her left hand slams onto
  // its edge, then her right; her arms reach in along them, faster and faster, as she hauls herself
  // up, and her face hits the glass: a white flash of her, an ink one, her colours pulled apart,
  // the screen shaking. She looks around, blinks, says "hi" with her mouth (a tag pops by her face,
  // her name typed under it), lets go of the right edge to wave, grabs it again, glances at where
  // she's going, and lets go: her arms come apart into shards from her hands in, her head crouches
  // and dives down to `to` (her face where she'll stand: { x, y, size }), and closes into a slit
  // there. Never a straight edge of the picture on screen. Her moves follow the clock at the
  // screen's rate (smooth), her drawings change on whole frames, like cels.
  // Cues to onCue: 'open', 'hand' (three times), 'grab', 'hi', 'wave', 'slip'. Resolves as it
  // lands, for her body to unfold.
  // `still` (reduced motion): it comes and goes where it is, in four steps each way.
  setIntro(intro) {
    this.grabFrames = intro || {};
    this.grab = this.grabFrames.grab || null;
    this.grabCopies = null;
    if (this.grab) this.prepareGrab();
  }

  releaseIntro() {
    const c = this.grabCopies;
    if (c) {
      for (const canvas of [c.paper, c.ink, c.violet, ...(c.channels || [])]) {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
    for (const image of new Set(Object.values(this.grabFrames || {}))) image?.close?.();
    this.grab = null;
    this.grabFrames = {};
    this.grabCopies = null;
  }

  async intro({ to, label = 'hi', caption = '', still = false, onCue = () => {} }) {
    if (!this.grab && this.loadIntro) this.setIntro(await this.loadIntro());
    if (!this.grab || !this.size) {
      this.releaseIntro();
      return;
    }
    const { w, h } = this.size;
    const s = Math.max(w / GRAB.w, h / GRAB.h); // filling the screen, her hands on its edges
    const at = { x: (w - GRAB.w * s) / 2 + GRAB.face.x * s, y: (h - GRAB.h * s) / 2 + GRAB.face.y * s };
    // the dive swings out a little toward the middle of the screen on its way down to her
    const ctrl = { x: lerp(at.x, to.x, 0.25) - (to.x - at.x) * 0.2, y: lerp(at.y, to.y, 0.15) };
    try {
      await new Promise((land) => {
        this.add({ type: 'intro', smooth: true, life: FRAME_MS * (INTRO_T.end + 1), s, at, to, ctrl, label, caption, still, onCue, land, cued: -1 });
      });
    } finally {
      this.releaseIntro();
    }
  }

  // Her flat silhouettes for the impact frames, and her red, green and blue apart: made once,
  // ahead, so nothing is left to work out while she's on screen.
  prepareGrab() {
    const copy = (fill, mode) => {
      const c = document.createElement('canvas');
      c.width = GRAB.w;
      c.height = GRAB.h;
      const g = c.getContext('2d');
      g.drawImage(this.grab, 0, 0);
      g.globalCompositeOperation = mode;
      g.fillStyle = fill;
      g.fillRect(0, 0, c.width, c.height);
      if (mode === 'multiply') {
        g.globalCompositeOperation = 'destination-in'; // multiply fills her cut-out background too
        g.drawImage(this.grab, 0, 0);
      }
      return c;
    };
    this.grabCopies = {
      paper: copy(COLORS.paper, 'source-in'),
      ink: copy(COLORS.ink, 'source-in'),
      violet: copy(COLORS.violet, 'source-in'),
      channels: ['#ff0000', '#00ff00', '#0000ff'].map((c) => copy(c, 'multiply')),
    };
  }

  // Her close-up, its face at (x, y), `k` times its size on screen (squashed sx, sy), turned `rot`:
  // the picture (or a flat copy of it: 'paper', 'ink', 'violet'), her colours pulled `split` px
  // apart, and her eyes drawn over its own (looking `look`, image px; `open` 1, 0.5 or 0).
  // `clip`: what shows of it (a cut: cutEdges, cutBand, cutHead), else all of it. `cel`: which of
  // its drawings (GRAB_FRAMES), else her at rest.
  grabbed(it, x, y, k, { rot = 0, sx = 1, sy = 1, flat = null, split = 0, look = { x: 0, y: 0 }, open = 1, clip = null, cel = 'grab' } = {}) {
    const { ctx } = this;
    const c = this.grabCopies;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(it.s * k * sx, it.s * k * sy);
    ctx.translate(-GRAB.face.x, -GRAB.face.y);
    if (clip) {
      ctx.beginPath();
      clip(ctx);
      ctx.clip();
    }
    ctx.imageSmoothingQuality = 'high';
    if (flat) {
      ctx.drawImage(c[flat], 0, 0);
    } else if (split) {
      const d = split / (it.s * k);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(c.channels[0], -d, d * 0.3);
      ctx.drawImage(c.channels[1], 0, 0);
      ctx.drawImage(c.channels[2], d, -d * 0.3);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.drawImage(this.grabFrames[cel] || this.grab, 0, 0);
      if (!OWN_EYES.has(cel) || !this.grabFrames[cel]) GRAB.eyes.forEach((e) => this.grabEye(e, look, open));
    }
    ctx.restore();
  }

  // One of her eyes on the close-up, over the picture's own: the iris and pupil turned `look`,
  // or her lid half down (0.5) or shut (0): ink, with a green line for its edge.
  grabEye(e, look, open) {
    const { ctx } = this;
    const disk = (x, y, r, color) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };
    ctx.save();
    disk(e.x, e.y, GRAB.socket, GRAB.inkColor);
    ctx.clip();
    if (open > 0) {
      disk(e.x + look.x, e.y + look.y, GRAB.iris, GRAB.irisColor);
      disk(e.x + look.x * 1.15, e.y + look.y * 1.15, GRAB.pupil + 1.6, GRAB.inkColor);
      disk(e.x + look.x * 1.15, e.y + look.y * 1.15, GRAB.pupil, GRAB.pupilColor);
    }
    if (open < 1) {
      ctx.translate(e.x, e.y);
      ctx.rotate(GRAB.tilt);
      const edge = open > 0 ? -GRAB.socket * 0.1 : GRAB.socket * 0.15;
      ctx.fillStyle = GRAB.inkColor;
      ctx.fillRect(-GRAB.socket, -GRAB.socket, GRAB.socket * 2, GRAB.socket + edge);
      ctx.beginPath();
      ctx.moveTo(-GRAB.socket, edge - 6);
      ctx.quadraticCurveTo(0, edge + 10, GRAB.socket, edge - 6);
      ctx.strokeStyle = COLORS.green;
      ctx.lineWidth = 6;
      ctx.stroke();
    }
    ctx.restore();
  }

  // The tag she says hi on: red, slanted, its left end at (x, y), its letters fs px, scaled by `k`
  // from that end (`ky`: squashed flat).
  hiTag(x, y, text, fs, k = 1, ky = 1) {
    const { ctx } = this;
    ctx.save();
    ctx.font = `600 ${fs}px "Chakra Petch", sans-serif`;
    ctx.letterSpacing = `${(-fs * 0.03).toFixed(1)}px`;
    const skew = fs * 0.32, th = fs * 1.18;
    const tw = ctx.measureText(text).width + fs * 0.9 + skew;
    ctx.translate(x, y);
    ctx.scale(k, k * ky);
    const band = (dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(skew + dx, -th / 2 + dy);
      ctx.lineTo(tw + dx, -th / 2 + dy);
      ctx.lineTo(tw - skew + dx, th / 2 + dy);
      ctx.lineTo(dx, th / 2 + dy);
      ctx.closePath();
    };
    band(7, 7);
    ctx.fillStyle = COLORS.violet;
    ctx.fill();
    band(0, 0);
    ctx.fillStyle = COLORS.red;
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = COLORS.paper;
    ctx.fillText(text, tw / 2, fs * 0.04);
    ctx.restore();
  }

  // A line typed out on an ink strip from (x, y), a red block for a cursor, blinking once it's all there.
  typed(x, y, full, text, frame) {
    const { ctx } = this;
    ctx.save();
    ctx.font = '400 12px "JetBrains Mono", monospace';
    ctx.letterSpacing = '2px';
    const tw = ctx.measureText(full).width;
    ctx.fillStyle = COLORS.violet;
    ctx.fillRect(x + 3, y - 12, tw + 28, 22);
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(x, y - 15, tw + 28, 22);
    ctx.fillStyle = COLORS.paper;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x + 9, y + 1);
    if (text.length < full.length || (frame >> 2) % 2) {
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(x + 10 + ctx.measureText(text).width, y - 10, 8, 13);
    }
    ctx.restore();
  }

  // The edges of the screen crackling red, in broken runs on their violet copy (new ones for each `seed`).
  screenEdges(w, h, seed) {
    const { ctx } = this;
    let i = 0;
    const r = (a, b) => a + hash(i++, seed) * (b - a);
    const runs = (horizontal, fixed, len) => {
      for (let p = r(-60, 0); p < len; p += r(70, 230)) {
        const l = r(50, 190), t = r(4, 9);
        const [x, y, rw, rh] = horizontal ? [p, fixed, l, t] : [fixed, p, t, l];
        ctx.fillStyle = COLORS.violet;
        ctx.fillRect(x + 3, y + 3, rw, rh);
        ctx.fillStyle = COLORS.red;
        ctx.fillRect(x, y, rw, rh);
      }
    };
    runs(true, 0, w);
    runs(true, h - 9, w);
    runs(false, 0, h);
    runs(false, w - 9, h);
  }

  // The void, as she leaves or lands (see slit): black, with her as a red line in it.
  voidSlit(x, y, w, h) {
    const { ctx } = this;
    ctx.fillStyle = COLORS.violet;
    ctx.fillRect(x - w / 2 - 3, y - h / 2, w + 6, h);
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = COLORS.red;
    ctx.fillRect(x - 1, y - h * 0.42, 2, h * 0.84);
  }

  // ---------- loop ----------

  // Whole frames at 24 fps, or every screen refresh while something that moves smoothly is on
  // (her intro: its camera moves follow the clock, its drawings still change on whole frames).
  frame(now) {
    if (now - this.last < FRAME_MS - 2 && !this.items.some((it) => it.smooth)) {
      requestAnimationFrame((t) => this.frame(t));
      return;
    }
    const dt = Math.min(0.08, (now - (this.last || now)) / 1000);
    this.last = now;

    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.items = this.items.filter((it) => {
      const alive = now - it.born < it.life;
      if (!alive) it.done?.();
      return alive;
    });
    for (const it of this.items) this.draw(it, (now - it.born) / it.life, dt, now);

    if (this.items.length) {
      requestAnimationFrame((t) => this.frame(t));
    } else {
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.running = false;
      this.last = 0;
    }
  }

  // Fade-out in four steps, like cels swapped for lighter ones. Kills the item when done.
  fadeStep(it, now, ms) {
    if (!it.fadeAt) return 1;
    const k = (now - it.fadeAt) / ms;
    if (k >= 1) {
      it.life = 0;
      return 0;
    }
    return 1 - Math.floor(k * 4) / 4;
  }

  // A shard shape centred on the origin, with its violet copy.
  shard(len, wid, color) {
    const { ctx } = this;
    const shape = (dx, dy) => {
      ctx.beginPath();
      ctx.moveTo(-len * 0.5 + dx, dy);
      ctx.lineTo(dx, -wid * 0.5 + dy);
      ctx.lineTo(len * 0.5 + dx, wid * 0.15 + dy);
      ctx.lineTo(-len * 0.1 + dx, wid * 0.5 + dy);
      ctx.closePath();
    };
    shape(-2, 2);
    ctx.fillStyle = COLORS.violet;
    ctx.fill();
    shape(0, 0);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // A four-point star (her eyes look like these when she comes apart), with its violet copy.
  sparkle(x, y, s, fill, core = null) {
    const { ctx } = this;
    const path = (dx, dy, k) => {
      const r = s * k, w = r * 0.24;
      ctx.beginPath();
      ctx.moveTo(x + dx, y - r + dy);
      ctx.lineTo(x + w + dx, y - w + dy);
      ctx.lineTo(x + r + dx, y + dy);
      ctx.lineTo(x + w + dx, y + w + dy);
      ctx.lineTo(x + dx, y + r + dy);
      ctx.lineTo(x - w + dx, y + w + dy);
      ctx.lineTo(x - r + dx, y + dy);
      ctx.lineTo(x - w + dx, y - w + dy);
      ctx.closePath();
    };
    path(-2, 2, 1);
    ctx.fillStyle = COLORS.violet;
    ctx.fill();
    path(0, 0, 1);
    ctx.fillStyle = fill;
    ctx.fill();
    if (core) {
      path(0, 0, 0.36);
      ctx.fillStyle = core;
      ctx.fill();
    }
  }

  eye(x, y, R, open, look) {
    drawEye(this.ctx, x, y, R, open, look);
  }

  // A window she's in (see possess()): what's drawn on it, in screen coordinates.
  possession(it, r, now, leaving) {
    const { ctx } = this;
    const age = now - it.born;
    const frame = Math.floor(age / FRAME_MS);
    const look = it.look();

    // an impact frame as she hits it
    if (frame === 0) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = COLORS.ink;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.globalAlpha = 1;
    }

    // slices of it knocked sideways, re-rolled every other drawing
    if (!it.slices || it.drawn !== frame >> 1) {
      it.drawn = frame >> 1;
      it.slices = Array.from({ length: leaving >= 0 ? 2 : 6 }, () => ({
        y: rand(0, r.h), h: rand(2, 9), x: rand(-0.1, 0.7), w: rand(0.2, 0.6),
        color: COLORS[pick(['red', 'red', 'green', 'violet', 'paper'])],
      }));
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.globalAlpha = 0.9;
    for (const s of it.slices) {
      ctx.fillStyle = s.color;
      ctx.fillRect(r.x + s.x * r.w, r.y + s.y, s.w * r.w, s.h);
    }
    ctx.restore();

    // its frame: lightning racing round from where she dove in, both ways, struck fresh every drawing
    const P = 2 * (r.w + r.h);
    const grow = leaving >= 0 ? Math.max(0, 1 - leaving / (FRAME_MS * 5)) : Math.min(1, (frame + 1) / 8);
    const edge = (s) => {
      s = ((s % P) + P) % P;
      if (s < r.w) return { x: r.x + s, y: r.y, nx: 0, ny: -1 };
      if (s < r.w + r.h) return { x: r.x + r.w, y: r.y + s - r.w, nx: 1, ny: 0 };
      if (s < 2 * r.w + r.h) return { x: r.x + r.w - (s - r.w - r.h), y: r.y + r.h, nx: 0, ny: 1 };
      return { x: r.x, y: r.y + r.h - (s - 2 * r.w - r.h), nx: -1, ny: 0 };
    };
    const half = (grow * P) / 2;
    ctx.save();
    ctx.lineJoin = 'miter';
    for (const way of [1, -1]) {
      const n = Math.max(2, Math.ceil(half / 28));
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const p = edge(it.entry + way * half * (i / n));
        const off = i === 0 || i === n ? 0 : (i % 2 ? 1 : -1) * rand(2, 7);
        pts.push([p.x + p.nx * off, p.y + p.ny * off]);
      }
      this.stroke(pts, COLORS.violet, 5, -2, 2);
      this.stroke(pts, COLORS.red, 3.5);
      this.stroke(pts, COLORS.paper, 1.2);
    }
    ctx.restore();

    // her face in it: the eyes open in three drawings, blink once, shut as she leaves
    const stepOf = (ms) => Math.floor(ms / (FRAME_MS * 2));
    let open = age < 250 ? 0 : [0.25, 0.6, 1][Math.min(2, stepOf(age - 250))];
    if (age > 1150 && age < 1150 + FRAME_MS * 4) open = 0.12;
    if (leaving >= 0) open = [0.6, 0.2, 0][Math.min(2, stepOf(leaving))];
    if (!open) return;
    const R = Math.max(20, Math.min(72, Math.min(r.w, r.h) * 0.13));
    const cx = r.x + r.w / 2 + rand(-1.5, 1.5), cy = r.y + r.h * 0.46 + rand(-1.5, 1.5); // shaking on ones
    for (const e of it.extra) {
      if (age < e.at) continue;
      const k = leaving >= 0 ? open : Math.min(1, (stepOf(age - e.at) + 1) / 3);
      this.eye(r.x + e.u * r.w, r.y + e.v * r.h, R * e.size, k, look);
    }
    this.eye(cx - R * 1.6, cy - R * 0.3, R, open, look);
    this.eye(cx + R * 1.6, cy - R * 0.3, R, open, look);
    if (open >= 0.6) {
      // the zigzag grin
      const pts = Array.from({ length: 7 }, (_, i) => [cx - R * 2.4 + (i * R * 4.8) / 6, cy + R * 1.4 + (i % 2 ? R * 0.6 : -R * 0.1)]);
      ctx.save();
      ctx.lineJoin = 'miter';
      this.stroke(pts, COLORS.violet, R * 0.42, -3, 3);
      this.stroke(pts, COLORS.ink, R * 0.42);
      this.stroke(pts, COLORS.paper, R * 0.22);
      ctx.restore();
    }
  }

  // A jagged polyline from a to b, rolled fresh each call. `zig` makes it swing from side to
  // side (mostly) with uneven steps, like drawn lightning, instead of wandering.
  jag(a, b, jitter, zig = false) {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    const n = Math.max(5, Math.round(len / (zig ? 34 : 26)));
    let side = Math.random() < 0.5 ? 1 : -1;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      let t = i / n, off = 0;
      if (i > 0 && i < n) {
        if (zig) {
          t += rand(-0.3, 0.3) / n;
          if (Math.random() < 0.8) side = -side;
          off = side * rand(0.2, 1) * jitter;
        } else {
          off = rand(-1, 1) * jitter;
        }
      }
      pts.push([lerp(a.x, b.x, t) + nx * off, lerp(a.y, b.y, t) + ny * off]);
    }
    return pts;
  }

  // A polyline thickened into a flat shape, w0 wide at its start tapering to w1 at its end.
  ribbon(pts, w0, w1, dx = 0, dy = 0) {
    const { ctx } = this;
    const left = [], right = [];
    pts.forEach(([x, y], i) => {
      const [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
      const l = Math.hypot(bx - ax, by - ay) || 1;
      const w = lerp(w0, w1, i / (pts.length - 1)) / 2;
      const nx = (-(by - ay) / l) * w, ny = ((bx - ax) / l) * w;
      left.push([x + nx + dx, y + ny + dy]);
      right.push([x - nx + dx, y - ny + dy]);
    });
    ctx.beginPath();
    [...left, ...right.reverse()].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  }

  // The point a fraction u of the way along a polyline (by index, close enough for a bolt).
  along(pts, u) {
    const f = Math.min(pts.length - 1.001, Math.max(0, u * (pts.length - 1)));
    const i = Math.floor(f), k = f - i;
    return { x: lerp(pts[i][0], pts[i + 1][0], k), y: lerp(pts[i][1], pts[i + 1][1], k) };
  }

  stroke(pts, color, width, dx = 0, dy = 0) {
    const { ctx } = this;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y + dy) : ctx.moveTo(x + dx, y + dy)));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  draw(it, t, dt, now) {
    const { ctx } = this;
    switch (it.type) {
      case 'shard': {
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.vx *= 0.86;
        it.vy *= 0.86;
        it.rot += it.vr * dt;
        const k = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.rotate(it.rot);
        this.shard(it.len * k, it.wid * k, it.color);
        ctx.restore();
        break;
      }
      case 'beam': {
        const k = it.down ? 1 - t : t;
        const w = it.width * (1 - t) + 2;
        const top = it.down ? it.bottom * k * 0.15 : 0;
        const h = it.bottom - top;
        ctx.save();
        // jagged edges, re-rolled every frame
        const edge = (side) => {
          const pts = [];
          for (let y = top; y <= it.bottom; y += 18) pts.push([it.x + side * (w / 2 + rand(0, w * 0.35)), y]);
          return pts;
        };
        const left = edge(-1), right = edge(1).reverse();
        const poly = (dx) => {
          ctx.beginPath();
          [...left, ...right].forEach(([x, y], i) => (i ? ctx.lineTo(x + dx, y) : ctx.moveTo(x + dx, y)));
          ctx.closePath();
        };
        poly(-4);
        ctx.fillStyle = COLORS.violet;
        ctx.fill();
        poly(0);
        ctx.fillStyle = COLORS.red;
        ctx.fill();
        ctx.fillStyle = COLORS.paper;
        ctx.fillRect(it.x - Math.max(1, w * 0.12), top, Math.max(2, w * 0.24), h);
        ctx.restore();
        break;
      }
      case 'streak': {
        ctx.save();
        ctx.lineJoin = 'miter';
        ctx.globalAlpha = 1 - t * 0.6;
        this.stroke(it.pts, COLORS.violet, 5, -3, 3);
        this.stroke(it.pts, COLORS.red, 4);
        this.stroke(it.pts, COLORS.paper, 1.2);
        ctx.restore();
        break;
      }
      case 'slice': {
        ctx.fillStyle = it.color;
        ctx.globalAlpha = 1 - t;
        ctx.fillRect(it.x + it.dx * t, it.y, it.w, it.h);
        ctx.globalAlpha = 1;
        break;
      }
      case 'slit': {
        const k = Math.floor(t * 5) / 5; // closes in five drawings
        const w = Math.max(3, it.width * (1 - k));
        const h = it.bottom - it.top;
        ctx.fillStyle = COLORS.violet;
        ctx.fillRect(it.x - w / 2 - 3, it.top, w + 6, h);
        ctx.fillStyle = COLORS.ink;
        ctx.fillRect(it.x - w / 2, it.top, w, h);
        ctx.fillStyle = COLORS.red;
        ctx.fillRect(it.x - 1, it.top + h * 0.08, 2, h * 0.84);
        break;
      }
      case 'vortex': {
        const k = Math.floor(t * 8) / 8; // eight drawings
        for (const p of it.ps) {
          const ang = p.a + k * 4.2;
          const rr = it.radius * p.r * (1 - k);
          const px = it.x + Math.cos(ang) * rr, py = it.y + Math.sin(ang) * rr * 0.85;
          if (p.eye) {
            this.sparkle(px, py, 11 * (1 - k) + 3, COLORS.green, COLORS.ink);
          } else {
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(ang + Math.PI / 2);
            this.shard(p.len * (1 - k * 0.6), p.wid * (1 - k * 0.5), p.color);
            ctx.restore();
          }
        }
        break;
      }
      case 'drift': {
        // moved on twos, like the body it came from
        const age = Math.floor((t * it.life) / 1000 * 12) / 12;
        const k = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
        ctx.save();
        ctx.translate(Math.round(it.x + it.vx * age), Math.round(it.y + it.vy * age));
        ctx.rotate(it.rot + it.vr * age);
        this.shard(it.len * (0.6 + 0.4 * k), it.wid * k, it.color);
        ctx.restore();
        break;
      }
      case 'motes': {
        const age = now - it.born;
        const frame = Math.floor(age / FRAME_MS);
        const step = (since, ms) => Math.min(1, Math.max(0, onTwos(since) / ms)); // 0..1, on twos
        const road = it.ends?.();
        let nx = 0, ny = 0;
        if (road) {
          const [a, b] = road;
          const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          nx = -(b.y - a.y) / l;
          ny = (b.x - a.x) / l;
        }
        const pos = it.ps.map((p) => {
          // up off her mane with a slow-in, then swaying
          const e = 1 - Math.pow(1 - step(age - p.delay, 1100), 3);
          let x = lerp(p.x0, p.x1, e) + Math.sin(onTwos(age) / 650 + p.phase) * 4 * e;
          let y = lerp(p.y0, p.y1, e);
          if (road) {
            // into line, the ones nearest her first
            const u = step(now - it.alignAt - p.u * 300, 450);
            const k = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
            const [a, b] = road;
            x = lerp(x, lerp(a.x, b.x, p.u) + nx * p.off, k);
            y = lerp(y, lerp(a.y, b.y, p.u) + ny * p.off, k);
          }
          if (it.homeAt) {
            const k = step(now - it.homeAt - p.u * 160, 330);
            x = lerp(x, p.x0 + it.shift[0], k * k);
            y = lerp(y, p.y0 + it.shift[1], k * k);
          }
          return { x, y };
        });
        if (it.homeAt && now - it.homeAt > 160 + 330 + FRAME_MS * 2) {
          it.life = 0;
          break;
        }
        ctx.save();
        // the constellation, a line at a time once they're up, gone when they line up;
        // white over a violet copy, so it reads on a dark desktop and a light one
        if (!it.alignAt || now - it.alignAt < 160) {
          ctx.lineWidth = 1;
          it.links.forEach(([i, j], n) => {
            if (onTwos(age) < 900 + n * 60) return;
            for (const [d, color] of [[1, COLORS.violet], [0, COLORS.paper]]) {
              ctx.beginPath();
              ctx.moveTo(Math.round(pos[i].x) + 0.5 - d, Math.round(pos[i].y) + 0.5 + d);
              ctx.lineTo(Math.round(pos[j].x) + 0.5 - d, Math.round(pos[j].y) + 0.5 + d);
              ctx.strokeStyle = color;
              ctx.globalAlpha = d ? 1 : 0.75;
              ctx.stroke();
            }
          });
          ctx.globalAlpha = 1;
        }
        it.ps.forEach((p, i) => {
          const { x, y } = pos[i];
          let s = (frame + Math.round(p.phase * 3)) % 6 < 3 ? p.size : p.size * 0.6;
          // the light going up lights them as it passes, and they stay bright while it holds
          if (it.litAt && !it.homeAt && !(it.dimAt && now > it.dimAt)) {
            const since = now - it.litAt - p.u * it.litMs;
            if (since >= 0) s = since < FRAME_MS * 2 ? p.size * 3 : p.size * (frame % 2 ? 1.8 : 1.5);
          }
          ctx.fillStyle = COLORS.violet;
          ctx.fillRect(Math.round(x - s / 2) - 1, Math.round(y - s / 2) + 1, s, s);
          ctx.fillStyle = COLORS.paper;
          ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), s, s);
          if (s > 3) {
            ctx.fillRect(Math.round(x - s), Math.round(y) - 0.5, s * 2, 1);
            ctx.fillRect(Math.round(x) - 0.5, Math.round(y - s), 1, s * 2);
          }
        });
        // her fingertip, where the road starts, glinting on threes
        if (road && !it.homeAt) {
          this.sparkle(road[0].x, road[0].y, [6, 9, 5, 10][Math.floor(frame / 3) % 4], COLORS.paper, COLORS.red);
        }
        ctx.restore();
        break;
      }
      case 'satellite': {
        const fade = this.fadeStep(it, now, 500);
        if (!fade) break;
        const age = now - it.born;
        const frame = Math.floor(age / FRAME_MS);
        const { x, y } = it.pos(now);
        const rays = (ray, w) => {
          for (const [dx, dy, color] of [[-2, 2, COLORS.violet], [0, 0, COLORS.paper]]) {
            ctx.fillStyle = color;
            ctx.fillRect(x - ray + dx, y - w / 2 + dy, ray * 2, w);
            ctx.fillRect(x - w / 2 + dx, y - ray + dy, w, ray * 2);
          }
        };
        ctx.save();
        ctx.globalAlpha = fade;
        // trail: where it was, a dot every few drawings back
        for (let k = 1; k <= 5; k++) {
          const p = it.pos(now - onTwos(k * 140));
          ctx.fillStyle = k % 2 ? COLORS.violet : COLORS.paper;
          const s = Math.max(1, 3.4 - k * 0.5);
          ctx.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
        }
        const since = it.flare ? now - it.flare.at : Infinity;
        if (since < 460) {
          // a big four-point flare with long rays, shrinking over seven drawings
          const k = Math.floor(since / (FRAME_MS * 2));
          const size = [44, 38, 32, 26, 20, 16, 13][Math.min(6, k)] * it.flare.size;
          rays(size * 3, 2);
          this.sparkle(x, y, size, COLORS.paper, COLORS.red);
        } else {
          // blinks in (a speck, a flash, settling), then glints on threes
          const size = frame < 8 ? [2, 3, 20, 20, 14, 14, 11, 11][frame] : [8, 11, 7, 12][Math.floor(frame / 3) % 4];
          if (size >= 14) rays(size * 2.4, 2);
          this.sparkle(x, y, size, COLORS.paper);
          ctx.fillStyle = COLORS.paper;
          ctx.fillRect(Math.round(x) - 1.5, Math.round(y) - 1.5, 3, 3);
        }
        ctx.restore();
        break;
      }
      case 'surge': {
        const [a, b] = it.ends();
        ctx.save();
        ctx.lineJoin = 'miter';
        if (it.breakAt) {
          // snapped: one white drawing, then the pieces fall, fading out in four steps
          const pts = it.pts || [[a.x, a.y], [b.x, b.y]];
          it.pieces ||= pts.slice(1).map((end, i) => ({
            a: pts[i], b: end,
            vx: rand(-50, 50), vy: rand(-80, 0), vr: rand(-4, 4),
            w: lerp(22, 7, i / (pts.length - 1)),
          }));
          const since = now - it.breakAt;
          const k = since / 620;
          if (k >= 1) {
            it.life = 0;
            ctx.restore();
            break;
          }
          if (since < FRAME_MS) this.stroke(pts, COLORS.paper, 7);
          const tau = onTwos(since) / 1000;
          ctx.globalAlpha = 1 - Math.floor(k * 4) / 4;
          for (const pc of it.pieces) {
            const mx = (pc.a[0] + pc.b[0]) / 2 + pc.vx * tau;
            const my = (pc.a[1] + pc.b[1]) / 2 + pc.vy * tau + 450 * tau * tau;
            const hx = ((pc.b[0] - pc.a[0]) / 2) * (1 - k * 0.4), hy = ((pc.b[1] - pc.a[1]) / 2) * (1 - k * 0.4);
            const c = Math.cos(pc.vr * tau), s = Math.sin(pc.vr * tau);
            const rx = hx * c - hy * s, ry = hx * s + hy * c;
            const seg = [[mx - rx, my - ry], [mx + rx, my + ry]];
            const w = pc.w * (1 - k * 0.5);
            this.stroke(seg, COLORS.violet, w + 2, -2, 2);
            this.stroke(seg, COLORS.red, w);
            this.stroke(seg, COLORS.paper, Math.max(1, w * 0.2));
          }
          ctx.restore();
          break;
        }
        const frame = Math.floor((now - it.born) / FRAME_MS);
        const reach = [0.4, 0.74, 1][Math.min(2, frame)];
        const end = { x: lerp(a.x, b.x, reach), y: lerp(a.y, b.y, reach) };
        if (reach === 1 && it.onHit) {
          const hit = it.onHit;
          it.onHit = null;
          hit();
        }
        const len = Math.hypot(end.x - a.x, end.y - a.y);
        const pts = this.jag(a, end, Math.min(24, Math.max(10, len * 0.05)), true);
        it.pts = pts;
        if (frame === 0) {
          // impact frame: the bolt in negative
          this.ribbon(pts, 40, 22);
          ctx.fillStyle = COLORS.ink;
          ctx.fill();
          this.ribbon(pts, 10, 4);
          ctx.fillStyle = COLORS.paper;
          ctx.fill();
        } else {
          const k = frame % 2 ? 1 : 0.75; // throbs on ones
          this.ribbon(pts, 26 * k, 8 * k, -4, 4);
          ctx.fillStyle = COLORS.violet;
          ctx.fill();
          this.ribbon(pts, 26 * k, 8 * k);
          ctx.fillStyle = COLORS.red;
          ctx.fill();
          this.ribbon(pts, 8 * k, 2.5);
          ctx.fillStyle = COLORS.paper;
          ctx.fill();
          for (let f = 0; f < 3; f++) {
            const from = this.along(pts, rand(0.1, 0.9));
            const ang = Math.atan2(b.y - a.y, b.x - a.x) + rand(-1.2, 1.2);
            const l = rand(24, 70);
            const fork = this.jag(from, { x: from.x + Math.cos(ang) * l, y: from.y + Math.sin(ang) * l }, 9, true);
            this.stroke(fork, COLORS.violet, 4, -2, 2);
            this.stroke(fork, COLORS.red, 3);
            this.stroke(fork, COLORS.paper, 1);
          }
          // light running up it, toward the sky
          if (reach === 1) {
            for (let i = 0; i < 2; i++) {
              const p = this.along(pts, ((frame - 2) * 0.11 + i * 0.5) % 1);
              this.sparkle(p.x, p.y, 9, COLORS.paper, COLORS.red);
            }
          }
        }
        ctx.restore();
        break;
      }
      case 'possess': {
        const r = it.rect();
        const leaving = it.leaveAt ? now - it.leaveAt : -1;
        if (!r || leaving > FRAME_MS * 6) {
          it.life = 0;
          break;
        }
        // drawn on its own canvas so the windows in front of it can be cut out
        const M = 16, dpr = window.devicePixelRatio || 1;
        const cw = Math.ceil(r.w + M * 2), ch = Math.ceil(r.h + M * 2);
        it.off ||= document.createElement('canvas');
        if (it.off.width !== Math.round(cw * dpr) || it.off.height !== Math.round(ch * dpr)) {
          it.off.width = Math.round(cw * dpr);
          it.off.height = Math.round(ch * dpr);
        }
        const o = it.off.getContext('2d');
        o.setTransform(dpr, 0, 0, dpr, 0, 0);
        o.clearRect(0, 0, cw, ch);
        o.translate(M - r.x, M - r.y);
        this.ctx = o; // the drawing helpers draw on this.ctx
        try {
          this.possession(it, r, now, leaving);
        } finally {
          this.ctx = ctx;
        }
        o.setTransform(dpr, 0, 0, dpr, 0, 0);
        for (const c of it.covers()) o.clearRect(c.x - r.x + M, c.y - r.y + M, c.w, c.h);
        ctx.drawImage(it.off, r.x - M, r.y - M, cw, ch);
        break;
      }
      case 'crackle': {
        const frame = Math.floor((now - it.born) / FRAME_MS);
        if (frame % 4 === 3) break;
        const c = typeof it.at === 'function' ? it.at() : it.at;
        const r = it.radius * (0.45 + t * 0.8);
        ctx.save();
        ctx.lineJoin = 'miter';
        for (let i = 0; i < it.count; i++) {
          const ang = rand(0, Math.PI * 2);
          const from = { x: c.x + Math.cos(ang) * 4, y: c.y + Math.sin(ang) * 4 };
          const to = { x: c.x + Math.cos(ang) * r * rand(0.5, 1), y: c.y + Math.sin(ang) * r * rand(0.5, 1) };
          const pts = this.jag(from, to, 7, true);
          this.stroke(pts, COLORS.violet, 3.5, -2, 2);
          this.stroke(pts, COLORS.red, 2.5);
          this.stroke(pts, COLORS.paper, 1);
        }
        ctx.restore();
        break;
      }
      case 'bolt': {
        const frame = Math.floor((now - it.born) / FRAME_MS);
        if (frame % 3 === 2) break; // strobes
        const b = typeof it.to === 'function' ? it.to(now) : it.to;
        const len = Math.hypot(b.x - it.from.x, b.y - it.from.y);
        const pts = this.jag(it.from, b, Math.min(22, Math.max(7, len * 0.06)), true);
        ctx.save();
        ctx.lineJoin = 'miter';
        this.stroke(pts, COLORS.violet, it.width + 1, -1.5, 1.5);
        this.stroke(pts, COLORS.red, it.width + 1);
        this.stroke(pts, COLORS.paper, Math.max(0.8, it.width * 0.35));
        for (let f = 0; f < it.forks; f++) {
          const [fx, fy] = pts[1 + Math.floor(rand(0, pts.length - 2))];
          const a = Math.atan2(b.y - it.from.y, b.x - it.from.x) + rand(-1.1, 1.1);
          const l = rand(20, 55);
          const fork = this.jag({ x: fx, y: fy }, { x: fx + Math.cos(a) * l, y: fy + Math.sin(a) * l }, 7);
          this.stroke(fork, COLORS.red, Math.max(1, it.width * 0.6));
          this.stroke(fork, COLORS.paper, 0.8);
        }
        ctx.restore();
        break;
      }
      case 'lines': {
        const frame = Math.floor((t * it.life) / FRAME_MS);
        if (!it.strokes || it.drawn !== frame >> 1) {
          it.drawn = frame >> 1;
          it.strokes = Array.from({ length: 32 }, () => ({
            a: rand(0, Math.PI * 2),
            w: rand(0.008, 0.026),
            r0: it.inner * rand(1, 1.6),
            color: COLORS[pick(['paper', 'paper', 'paper', 'violet', 'red'])],
          }));
        }
        const outer = it.inner * 3.6;
        ctx.save();
        ctx.globalAlpha = t > 0.7 ? 1 - Math.floor(((t - 0.7) / 0.3) * 3) / 3 : 1;
        for (const s of it.strokes) {
          ctx.beginPath();
          ctx.moveTo(it.x + Math.cos(s.a - s.w) * outer, it.y + Math.sin(s.a - s.w) * outer);
          ctx.lineTo(it.x + Math.cos(s.a) * s.r0, it.y + Math.sin(s.a) * s.r0);
          ctx.lineTo(it.x + Math.cos(s.a + s.w) * outer, it.y + Math.sin(s.a + s.w) * outer);
          ctx.closePath();
          ctx.fillStyle = s.color;
          ctx.fill();
        }
        ctx.restore();
        break;
      }
      case 'ring': {
        const k = Math.floor(t * 6) / 6; // six drawings
        const r = (40 + 230 * k) * it.size;
        const lw = Math.max(1, 8 * (1 - k) * it.size);
        ctx.save();
        for (const [dx, color] of [[-3, COLORS.violet], [0, COLORS.red]]) {
          ctx.beginPath();
          ctx.arc(it.x + dx, it.y - dx, r, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = lw;
          ctx.stroke();
        }
        ctx.restore();
        break;
      }
      case 'cutin': {
        const W = 250, H = 96, skew = 24;
        // three-frame wipe in, two-frame squash out
        const open = t < 0.06 ? 0.3 : t < 0.12 ? 0.7 : 1;
        const tall = t > 0.9 ? 0.12 : t > 0.82 ? 0.5 : 1;
        const w = W * open, h = H * tall;
        const x0 = it.dir > 0 ? it.x : it.x - w;
        const y0 = it.y - h / 2;
        const band = (dx, dy) => {
          ctx.beginPath();
          ctx.moveTo(x0 + skew + dx, y0 + dy);
          ctx.lineTo(x0 + w + skew + dx, y0 + dy);
          ctx.lineTo(x0 + w + dx, y0 + h + dy);
          ctx.lineTo(x0 + dx, y0 + h + dy);
          ctx.closePath();
        };
        ctx.save();
        band(6, 6);
        ctx.fillStyle = COLORS.violet;
        ctx.fill();
        band(0, 0);
        ctx.fillStyle = COLORS.ink;
        ctx.fill();
        ctx.clip();
        // speed lines, re-drawn every frame, rushing away from her
        for (let i = 0; i < 9; i++) {
          ctx.fillStyle = i % 3 ? COLORS.red : COLORS.paper;
          ctx.fillRect(x0 + rand(-20, w), y0 + rand(0, h), rand(30, 110), rand(1, 3));
        }
        // the close-up, pushed in a little more every frame, shaking on ones
        const zoom = ((h * 1.1) / CUTIN.h) * (1 + t * 0.08);
        const fw = CUTIN.w * zoom, fh = CUTIN.h * zoom;
        const cx = x0 + w / 2 + skew / 2 + rand(-2, 2), cy = y0 + h / 2 + rand(-2, 2);
        ctx.drawImage(it.image, cx - fw / 2, cy - fh / 2, fw, fh);
        ctx.fillStyle = COLORS.red;
        ctx.fillRect(x0, y0, w + skew, 3);
        ctx.restore();
        break;
      }
      case 'intro': {
        const T = INTRO_T;
        const { s, at, to } = it;
        const { w: vw, h: vh } = this.size;
        const t = (now - it.born) / FRAME_MS; // in frames, not rounded: the moves follow it smoothly
        const frame = Math.floor(t); // the drawings change on whole frames
        // a point of the close-up (its pixels) on screen, its face at (x, y), k times its size
        const onScreen = (p, x = at.x, y = at.y, k = 1) => ({ x: x + (p.x - GRAB.face.x) * s * k, y: y + (p.y - GRAB.face.y) * s * k });
        const hands = GRAB.hands.map((p) => {
          const q = onScreen(p);
          return { x: clamp(q.x, 14, vw - 14), y: q.y };
        });
        for (let f = it.cued + 1; f <= frame; f++) {
          if (f === 0) it.onCue('open');
          if (it.still) {
            if (f === T.grab) it.onCue('grab');
          } else {
            if (f === 3) for (const q of hands) this.crackle(q, { life: 260, radius: 70 });
            if (f === T.hands || f === T.right) {
              // a hand slams onto the edge of the screen
              const q = hands[f === T.hands ? 0 : 1];
              it.onCue('hand');
              this.burst(q.x, q.y, { count: 10, power: 0.7, spread: 90 });
              this.crackle(q, { life: 220, radius: 50 });
            }
            if (f === T.reach + 3) this.lines(at.x, at.y, { inner: Math.min(vw, vh) * 0.5, life: 260 });
            if (f === T.grab) {
              it.onCue('grab');
              this.lines(at.x, at.y, { inner: Math.min(vw, vh) * 0.45, life: 320 });
              this.burst(at.x, at.y, { count: 16, power: 1, spread: 160 });
            }
            if (f === T.slip) for (const q of hands) this.crackle(q, { life: 240, radius: 60 });
          }
          if (f === T.hi + 2) it.onCue('hi'); // her mouth wide open
          if (f === T.wave) it.onCue('wave');
          if (f === T.happy) {
            it.onCue('hand'); // her hand back on the edge
            if (!it.still) this.crackle(hands[1], { life: 220, radius: 50 });
          }
          if (f === T.slip) it.onCue('slip');
          if (f === (it.still ? T.slip + 4 : T.land)) it.land();
        }
        it.cued = frame;

        // "hi" on its tag by her face, popping in, her name typed under it
        const tagAt = onScreen(GRAB.tag);
        const fs = Math.round(clamp(vh * 0.06, 40, 76));
        const hi = (k = 1, ky = 1) => {
          this.hiTag(tagAt.x, tagAt.y, it.label, fs, k, ky);
          if (it.caption && frame >= T.hi + 6 && ky === 1) {
            this.typed(tagAt.x + fs * 0.5, tagAt.y + fs * 1.15, it.caption, it.caption.slice(0, (frame - T.hi - 6) * 2), frame);
          }
        };
        // her eyes: centred as she lands, darting left and right, on you for "hi", a blink, then
        // toward where she's going
        const toward = { x: Math.sign(to.x - at.x) || 1, y: Math.sign(to.y - at.y) || 1 };
        const since = frame - T.hold;
        let look = { x: 0, y: 3 };
        if (since < 3) look = { x: 0, y: 0 };
        else if (since < 7) look = { x: -10, y: -3 };
        else if (since < 11) look = { x: 10, y: -4 };
        else if (frame >= T.glance) look = { x: toward.x * 10, y: toward.y * 7 };
        const b = frame - T.blink;
        const open = b === 0 || b === 3 ? 0.5 : b === 1 || b === 2 ? 0 : 1;
        // the line boiling: a new drawing every other frame, a pixel or two off the last
        const n = frame >> 1;
        const noise = (k) => (hash(n, k) * 2 - 1);

        if (it.still) {
          const a = frame < 4 ? (frame + 1) / 4 : frame >= T.slip ? 1 - (frame - T.slip + 1) / 4 : 1;
          if (a <= 0) break;
          ctx.save();
          ctx.globalAlpha = a;
          this.grabbed(it, at.x, at.y, 1.02, { look: { x: 0, y: 3 } });
          if (frame >= T.hi) hi();
          ctx.restore();
          break;
        }

        if (frame < T.hands) {
          // the edges of the screen crackle red: something's about to grab them
          if (frame % 2 === 0 || frame === T.hands - 1) this.screenEdges(vw, vh, frame);
          break;
        }

        if (frame < T.reach) {
          // her hands: the left one slams onto the edge, then the right, the screen jolting each time
          const rL = 0.16, rR = frame >= T.right ? 0.16 : 0;
          const g = frame - (frame >= T.right ? T.right : T.hands);
          const jolt = [7, -3][g] ?? 0;
          this.grabbed(it, at.x + jolt * (frame >= T.right ? 1 : -1), at.y + 70 * s, 1.04, {
            look, open, clip: (c) => cutEdges(c, rL, rR, frame),
          });
          break;
        }

        if (frame < T.grab) {
          // her arms reaching in along them, faster and faster, as she hauls herself up to the glass
          const u = clamp((t - T.reach + 1) / (T.grab - T.reach), 0, 1);
          const r = lerp(0.16, 1.2, u * u);
          this.grabbed(it, at.x, at.y + 70 * s * (1 - u * u), lerp(1.04, 1.02, u), {
            look, open, clip: (c) => cutEdges(c, r, r, frame),
          });
          break;
        }

        if (frame < T.hold) {
          // her face hits it: a white flash of her, an ink one on its violet copy, then the
          // picture with its colours apart, settling as the shake dies down
          const g = frame - T.grab;
          const shake = [24, -17, 11, -6, 3][g];
          const x = at.x + shake, y = at.y - shake * 0.4;
          if (g === 0) {
            this.grabbed(it, x, y, 1.22, { flat: 'paper' });
          } else if (g === 1) {
            this.grabbed(it, x + 10, y + 10, 1.1, { flat: 'violet' });
            this.grabbed(it, x, y, 1.1, { flat: 'ink' });
          } else {
            this.grabbed(it, x, y, [1.05, 1.02, 1.03][g - 2], { split: [16, 7, 2][g - 2] });
          }
          break;
        }

        if (frame < T.slip) {
          // holding on: she breathes and boils, the camera creeping in on her, shards of her mane
          // drifting off. She says "hi" (her mouth opening over three drawings, wide on the tag
          // popping, her head bobbing), then her arm leaves the right edge in a smear and she waves,
          // her hand tilting left, up, right, up, left on threes; a smear back onto the edge, and
          // she shuts her eyes with joy. Now and then her colours slip.
          const h0 = frame - T.hi - 2;
          let cel = SAY_HI[frame - T.hi] ?? 'grab';
          let shake = 0;
          if (frame >= T.wave && frame < T.wave + 2) {
            cel = 'smear'; // her arm off the edge
            if (frame === T.wave) shake = 6;
          } else if (frame >= T.wave + 2 && frame < T.regrab) {
            cel = WAVE[Math.floor((frame - T.wave - 2) / 3)] ?? 'wave1';
          } else if (frame >= T.regrab && frame < T.happy) {
            cel = 'smear'; // and back onto it
          } else if (frame >= T.happy && frame < T.glance) {
            cel = 'happy';
            if (frame < T.happy + 2) shake = [8, -4][frame - T.happy]; // her hand slamming onto it
          }
          if (frame % 5 === 0 && it.drifted !== frame) {
            it.drifted = frame; // once per frame, however often it's drawn
            const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
            const r = Math.min(vw, vh) * rand(0.36, 0.5);
            this.drift(at.x + Math.cos(a) * r * 1.3, at.y + Math.sin(a) * r, a);
          }
          const creep = 0.03 * clamp((t - T.hold) / (T.slip - T.hold), 0, 1);
          const bob = h0 >= 0 && h0 < 8 ? [0.024, 0.024, -0.017, -0.017, 0.009, 0.009, 0, 0][h0] : 0;
          const pop = h0 === 0 || h0 === 1 ? [0.025, 0.012][h0] : 0;
          const k = 1.025 + pop + creep + 0.006 * Math.sin(t / 7);
          const glitch = frame % 24 === 19 && cel === 'grab' ? 6 : 0; // (the split is of her at rest)
          this.grabbed(it, at.x + noise(1) * 1.5 + shake, at.y + noise(2) * 1.5, k, { rot: noise(3) * 0.003 + bob, look, open, cel, split: glitch });
          if (h0 >= 0) hi([0.35, 1.22, 0.94][h0] ?? 1);
          break;
        }

        const kHold = 1.055;
        if (frame < T.antic) {
          // she lets go: her arms come apart into shards from her hands in, the screen's edges
          // free again, and she sags a little; the tag squashed away
          const g = frame - T.slip;
          const u = clamp((t - T.slip + 1) / (T.antic - T.slip), 0, 1);
          const half = lerp(GRAB.w * 0.5 + 60, 330, 1 - (1 - u) * (1 - u));
          const y = at.y + 56 * s * u * u;
          this.grabbed(it, at.x, y, kHold, { look, open, clip: (c) => cutBand(c, half, frame) });
          // the shards where her arms break off, once per frame
          if (it.shattered !== frame) {
            it.shattered = frame;
            for (const side of [-1, 1]) {
              for (let j = 0; j < 2; j++) {
                const q = onScreen({ x: GRAB.face.x + side * half, y: rand(250, 800) }, at.x, y, kHold);
                this.burst(q.x, q.y, { count: 4, power: 0.55, spread: 40 });
              }
            }
          }
          if (g === 0) hi(1, 0.45);
          break;
        }

        // her head and mane, all that's left: a crouch to take off, then the dive
        const R = 370;
        const start = { x: at.x, y: at.y + 56 * s };
        if (frame < T.shrink) {
          const g = frame - T.antic;
          const [sx, sy, dy] = [[1.08, 0.88, 24], [0.94, 1.12, -30]][g];
          this.grabbed(it, start.x, start.y + dy * s, kHold * 0.9, { sx, sy, look, clip: (c) => cutHead(c, R, frame) });
          break;
        }

        if (frame < T.land) {
          // the dive: shrinking fast, then falling faster and faster into her, smeared along the
          // way, where she was a moment ago left behind her in violet, a zigzag where she's been
          const u = clamp((t - T.shrink + 1) / (T.land - T.shrink), 0, 1);
          const lag = 0.12; // how far back her violet afterimages are
          const k0 = kHold * 0.9, k1 = (to.size * 1.5) / (GRAB.face.size * s);
          const place = (v) => {
            const e = v * v;
            const a = (1 - e) * (1 - e), c2 = 2 * e * (1 - e), c = e * e;
            return {
              x: a * start.x + c2 * it.ctrl.x + c * to.x,
              y: a * start.y + c2 * it.ctrl.y + c * to.y,
              k: lerp(k0, k1, 1 - (1 - v) * (1 - v)),
            };
          };
          const trail = [];
          for (let j = 0; j <= 10; j++) {
            const q = place(Math.max(0, u - 0.45 + (j / 10) * 0.45));
            trail.push([q.x + (j % 2 ? 1 : -1) * (3 + hash(j, frame) * 6), q.y]);
          }
          ctx.save();
          ctx.lineJoin = 'miter';
          this.stroke(trail, COLORS.violet, 5, -3, 3);
          this.stroke(trail, COLORS.red, 4);
          this.stroke(trail, COLORS.paper, 1.2);
          ctx.restore();
          const head = (c) => cutHead(c, R, frame);
          for (const [back, alpha] of [[2, 0.14], [1, 0.3]]) {
            const v = u - back * lag;
            if (v <= 0) continue;
            const q = place(v);
            ctx.save();
            ctx.globalAlpha = alpha;
            this.grabbed(it, q.x, q.y, q.k, { flat: 'violet', clip: head });
            ctx.restore();
          }
          const q = place(u), prev = place(Math.max(0, u - lag * 0.5));
          const ang = Math.atan2(q.y - prev.y, q.x - prev.x);
          const size = R * 2 * s * q.k;
          const st = clamp(1 + (Math.hypot(q.x - prev.x, q.y - prev.y) / size) * 0.3, 1, 2);
          ctx.save();
          ctx.translate(q.x, q.y);
          ctx.rotate(ang);
          ctx.scale(st, 1 / Math.sqrt(st));
          ctx.rotate(-ang);
          this.grabbed(it, 0, 0, q.k, { look: { x: toward.x * 10, y: toward.y * 7 }, clip: head });
          ctx.restore();
          break;
        }

        // landed: it closes into a slit where her face will be
        const g = frame - T.land;
        if (g < 2) this.voidSlit(to.x, to.y, to.size * [0.4, 0.1][g], to.size * 1.5);
        break;
      }
      case 'pointer': {
        const fade = this.fadeStep(it, now, 260);
        if (!fade) break;
        const { w: vw, h: vh } = this.size || { w: 1e5, h: 1e5 };
        const age = now - it.born;
        const frame = Math.floor(age / FRAME_MS);
        // reeling back in: the wire shortens toward her finger over four drawings, then it's gone
        const back = it.retractAt ? Math.floor((now - it.retractAt) / FRAME_MS) / 4 : 0;
        if (back >= 1) {
          it.life = 0;
          break;
        }
        const a = it.from(), b = it.aim;
        const grow = Math.min(1, (frame + 1) / 2) * (1 - back);
        const ex = lerp(a.x, b.x, grow), ey = lerp(a.y, b.y, grow);
        const off = it.rect.y > vh - 2 ? [0, 1] : it.rect.y + it.rect.h < 2 ? [0, -1] : it.rect.x > vw - 2 ? [1, 0] : it.rect.x + it.rect.w < 2 ? [-1, 0] : null;
        ctx.save();
        ctx.globalAlpha = fade;

        // the wire, dashes crawling toward it on twos, and data running down it
        ctx.setLineDash([9, 6]);
        ctx.lineDashOffset = -Math.floor(frame / 2) * 5;
        const line = [[a.x, a.y], [ex, ey]];
        this.stroke(line, COLORS.violet, 4, -2, 2);
        this.stroke(line, COLORS.paper, 2);
        ctx.setLineDash([]);
        if (!back) {
          for (let i = 0; i < 3; i++) {
            const u = (Math.floor(frame / 2) * 0.06 + i / 3) % 1;
            if (u > grow) continue;
            const px = lerp(a.x, b.x, u), py = lerp(a.y, b.y, u);
            ctx.fillStyle = COLORS.violet;
            ctx.fillRect(Math.round(px) - 3, Math.round(py) - 1, 5, 5);
            ctx.fillStyle = i ? COLORS.green : COLORS.paper;
            ctx.fillRect(Math.round(px) - 2, Math.round(py) - 2, 5, 5);
          }
        }

        if (grow >= 1 && !off) {
          // arrowhead, with its violet copy
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          for (const [dx, dy, color] of [[-2, 2, COLORS.violet], [0, 0, COLORS.red]]) {
            ctx.beginPath();
            ctx.moveTo(b.x + dx, b.y + dy);
            ctx.lineTo(b.x - Math.cos(ang - 0.45) * 16 + dx, b.y - Math.sin(ang - 0.45) * 16 + dy);
            ctx.lineTo(b.x - Math.cos(ang + 0.45) * 16 + dx, b.y - Math.sin(ang + 0.45) * 16 + dy);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
          }
        }

        // the reticle: comes in from wide and slams on (four drawings), bounces once, then holds.
        // A tap makes it pulse; letting go, it opens back out.
        const SLAM = [64, 36, 16, 4, 11, 7];
        const tapK = it.tapAt ? Math.floor((now - it.tapAt) / FRAME_MS) : 99;
        let pad = frame < SLAM.length ? SLAM[frame] : 7;
        if (tapK < 2) pad += 6;
        if (back) pad += back * 60;
        const x0 = Math.max(4, it.rect.x - pad), y0 = Math.max(4, it.rect.y - pad);
        const x1 = Math.min(vw - 4, it.rect.x + it.rect.w + pad), y1 = Math.min(vh - 4, it.rect.y + it.rect.h + pad);
        const flash = frame < 5 || tapK < 2; // white as it lands
        if ((frame % 8 !== 7 || frame < 8) && x1 > x0 && y1 > y0) {
          const arm = Math.min(28, (x1 - x0) / 3, (y1 - y0) / 3);
          const corners = [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]];
          for (const [dx, dy, color, width] of [[-2, 2, COLORS.violet, 5], [0, 0, flash ? COLORS.paper : COLORS.red, 4]]) {
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            for (const [cx, cy, sx, sy] of corners) {
              ctx.beginPath();
              ctx.moveTo(cx + dx, cy + sy * arm + dy);
              ctx.lineTo(cx + dx, cy + dy);
              ctx.lineTo(cx + sx * arm + dx, cy + dy);
              ctx.stroke();
            }
          }
          // two of her eyes open on its corners and watch it, blinking now and then
          if (!back && frame >= 6 && x1 - x0 > 90 && y1 - y0 > 60) {
            const open = Math.min(1, (frame - 6) / 3);
            const blink = frame % 70 > 66 ? 0.15 : 1;
            const center = { x: it.rect.x + it.rect.w / 2, y: it.rect.y + it.rect.h / 2 };
            this.eye(x1 - 4, y0 + 4, 8, open * blink, center);
            this.eye(x0 + 4, y1 - 4, 8, open * blink, center);
          }
        }

        // off her screen: an arrow on the edge, bobbing on twos, pointing the rest of the way
        let tagAt = null;
        if (off && grow >= 1) {
          const bob = Math.floor(frame / 2) % 2 ? 3 : 0;
          const px = clamp(it.rect.x + it.rect.w / 2, 14, vw - 14) - off[0] * (14 + bob);
          const py = clamp(it.rect.y + it.rect.h / 2, 14, vh - 14) - off[1] * (14 + bob);
          tagAt = { x: px - off[0] * 50, y: py - off[1] * 30 };
          const ang2 = Math.atan2(off[1], off[0]);
          for (const [dx, dy, color] of [[-2, 2, COLORS.violet], [0, 0, flash ? COLORS.paper : COLORS.red]]) {
            ctx.beginPath();
            ctx.moveTo(px + Math.cos(ang2) * 13 + dx, py + Math.sin(ang2) * 13 + dy);
            ctx.lineTo(px + Math.cos(ang2 + 2.4) * 13 + dx, py + Math.sin(ang2 + 2.4) * 13 + dy);
            ctx.lineTo(px + Math.cos(ang2 - 2.4) * 13 + dx, py + Math.sin(ang2 - 2.4) * 13 + dy);
            ctx.closePath();
            ctx.fillStyle = color;
            ctx.fill();
          }
        }

        // the word, on a red tag: at the reticle's top corner (under it at the top of the screen),
        // or next to the edge arrow; it drops in once the reticle has landed
        if (it.label && !back && frame >= 4 && (x1 > x0 || tagAt)) {
          ctx.font = '600 11px "JetBrains Mono", monospace';
          const tw = ctx.measureText(it.label).width + 14;
          const drop = frame < 6 ? (6 - frame) * 4 : 0;
          const tx = clamp(tagAt ? tagAt.x - tw / 2 : x0, 4, vw - tw - 4);
          const ty = (tagAt ? clamp(tagAt.y - 10, 4, vh - 23) : y0 > 30 ? y0 - 24 : y1 + 6) - drop;
          ctx.fillStyle = COLORS.violet;
          ctx.fillRect(tx - 2, ty + 2, tw, 19);
          ctx.fillStyle = COLORS.red;
          ctx.fillRect(tx, ty, tw, 19);
          ctx.fillStyle = COLORS.paper;
          ctx.fillText(it.label, tx + 7, ty + 13.5);
        }
        ctx.restore();
        break;
      }
      case 'glyph': {
        ctx.save();
        ctx.font = '600 11px "JetBrains Mono", monospace';
        ctx.globalAlpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
        // stepped rise: whole pixels, every frame
        const y = Math.round(it.y - t * 46);
        const x = Math.round(it.x + it.drift * t);
        ctx.fillStyle = COLORS.violet;
        ctx.fillText(it.text, x - 1, y + 1);
        ctx.fillStyle = COLORS.green;
        ctx.fillText(it.text, x, y);
        ctx.restore();
        break;
      }
    }
  }
}
