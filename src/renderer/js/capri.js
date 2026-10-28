// Capri herself: where she is, how she moves, how she reacts.
// She acts with her head and her mane like in the show, and she's timed like cel animation:
// pose-to-pose acts (acting.js) drawn on twos, on ones for the action beats.
//
// Stances: floating ("stand"), perched on a window ("sit"), peeking in from a screen edge
// ("peek"), falling ("fall") when the window under her goes away or you drop her, held up by the
// pointer ("held"), flying through the air when you throw her or she jumps to another screen
// ("fly"), and knocked down on the floor after a crash ("down").

import { SpriteRenderer, SPRITE } from './sprite.js';
import { ACTS, NEUTRAL, Player } from './acting.js';
import { sleep, rand, pick, clamp, lerp, ease, tween, reducedMotion, today } from './util.js';

const ON_TWOS = 1000 / 12;
const ON_ONES = 1000 / 24;
const ASLEEP = 1000 / 6;
const SLEEP_AFTER = 10 * 60 * 1000;
const DOZE_AFTER = 20 * 1000; // asleep this long, she comes apart down to her mask
const GRAVITY = 2600; // px/s²
const THIGH = 73;     // hip to knee, sprite px (see sprite.js)
const DEG = Math.PI / 180;

// Thrown (throwHer): her middle, where she spins and where she's held while she flies (sprite px),
// how fast the pointer has to be going when you let go of her for her to fly instead of drop
// (px/s), and as fast as she goes.
const MID = { x: 118, y: 232 };
const THROW_MIN = 650;
const THROW_MAX = 4200;
const THROW_GRAVITY = 2500;
const LEAP_GRAVITY = 3000;
// the stances where she's turned by her own spin (this.spin) instead of her acts' lean
const SPUN = new Set(['held', 'fly', 'down']);

const UPLINK_DAY = 'capri.uplinkDay'; // the last day she sent the red light up

const GREEN = [0.21, 1, 0.48];
const INK = [0.08, 0.06, 0.11];
const RED = [1, 0.13, 0.32];

export class Capri {
  constructor({ root, canvas, image, fx, voice }) {
    this.root = root;
    this.canvas = canvas;
    this.sprite = new SpriteRenderer(canvas, image);
    this.fx = fx;
    this.voice = voice;

    this.scale = 0.6;
    this.view = { w: innerWidth, h: innerHeight, floor: innerHeight }; // floor: the top of the taskbar
    this.pos = { x: innerWidth - 200, y: innerHeight - 6 }; // her feet
    this.facing = 1; // 1: as drawn (reaching left), -1: mirrored
    this.mode = 'idle'; // idle | work | alert | sleep
    this.stance = 'stand';
    this.perch = null;    // { id, dx }: the window she sits on, and where along it
    this.peekSide = null; // left | right | top
    this.windows = { fg: 0, wins: [] };
    this.busy = false;
    this.hidden = false;
    this.stowed = false;  // folded away in her biochip (Ctrl+Alt+C)
    this.dormant = false; // asleep, down to her mask
    this.wander = true;
    this.possessWindows = true; // tray: "Possess my windows"
    this.restOn = 'corner'; // where she rests when nothing's going on: her corner, or 'taskbar' (her menu)
    this.nextHome = 0;
    this.dragging = false;
    this.track = [];      // where the pointer was lately while it holds her: [{ x, y, t }]
    this.spin = 0;        // degrees she's turned while held, flying or knocked down
    this.held = null;     // { at: the sprite point you're holding her by, w: how fast she swings }
    this.flight = null;   // thrown, or jumping to another screen (see throwHer)
    this.lying = null;    // knocked down: { c: her middle on screen, side }
    this.skid = null;     // sliding on her feet after landing a throw: { v, last }
    this.squash = null;   // flattened against what she just hit, on screen
    this.override = null; // a pose laid over her acts, drawing by drawing (getting back up)
    this.throwId = 0;     // bumped by every throw and every grab: what was going on after a throw stops
    this.refuseUntil = 0; // thrown once too often: she won't let you pick her up before then
    this.fondness = 0;    // how close she is to you, 0 to 4 (bond.js stages)

    this.p = {
      seed: 0, boil: 0.9, hair: 0, head: 0, mane: 0, armL: 0, armR: 0, longL: 1, longR: 1, sit: 0, kickL: 0, kickR: 0,
      smear: [0, 0], echo: [0, 0],
      glitch: 0, glitchSeed: 0, split: 0, collapse: 0, dissolve: 0, sparkle: 1, grade: 1,
      sil: INK, silAmount: 0, misreg: [-2.6, 2.2], alpha: 1,
    };
    this.bob = 0;
    this.tilt = 0;
    this.sx = 1;
    this.sy = 1;
    this.base = new Player('stand');
    this.act = null;
    this.lastDraw = 0;

    const now = performance.now();
    this.lastActivity = now;
    this.nextTwitch = now + rand(4000, 9000);
    this.nextMove = now + rand(40000, 80000);
    this.nextGaze = now + rand(40000, 90000);
    this.nextShed = now + rand(3000, 8000);
    this.nextNotice = 0;
    this.peekUntil = 0;
    this.lastGlyph = 0;
    this.sleptAt = 0;
    this.uplinkDue = false;
    this.pointing = null; // what she's showing you: { rect, aim, dir, side, reach, label, pointer }
    this.mouse = null; // last pointer position seen

    this.onMove = null;     // her head moved on screen
    this.onTeleport = null; // ('start' | 'end')
    this.onClick = null;
    this.onMenu = null;   // right-click on her
    this.onGaze = null;
    this.onMode = null;   // (mode, previous)
    this.onStow = null;   // she's in her biochip
    this.onUnstow = null; // she's coming out of it
    this.chipAt = null;   // () => the biochip's middle on screen
    this.onDoze = null;   // ('start', face) | 'waking' | 'end': down to her mask and back
    this.onThrown = null; // ({ how: 'ko' | 'feet' | 'ledge' | 'leap', hard, hits }) once she's back to herself
    this.onDodge = null;  // she got away from your pointer instead of letting you pick her up
    this.canCross = null; // (side, y) => is there another screen past that side's edge, at that height
    this.onCross = null;  // async (side, at) => moves her window over to it: { y } there, or null
    this.onScreenOf = null; // async (cursor) => her window moved to the screen the pointer is on: the pointer there

    this.alphaMap = this.buildAlphaMap(image);
    this.hull = buildHull(this.alphaMap);
    this.setScale(this.scale);
    this.bindPointer();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // ---------- geometry ----------

  // Her silhouette at rest, for hit tests: the cut-out plus the mirrored right arm the shader adds.
  buildAlphaMap(image) {
    const { width: w, height: h, mirror } = SPRITE;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!SPRITE.armL(x, y) || mirror - x >= w) continue;
        const to = (y * w + mirror - x) * 4 + 3;
        data[to] = Math.max(data[to], data[(y * w + x) * 4 + 3]);
      }
    }
    return data;
  }

  setScale(scale) {
    this.scale = scale;
    this.sprite.resize(scale);
    this.pivot();
    this.place();
  }

  // Flip, lean and squash all pivot on her feet, or on her seat when she sits on a ledge (so a
  // squash presses her onto it instead of pulling her down through it), on where you hold her
  // (she swings from it), or on her middle while she flies or lies on the floor.
  pivotPoint() {
    if (this.stance === 'held' && this.held) return this.held.at;
    if (this.stance === 'fly' || this.stance === 'down') return MID;
    if (this.stance === 'sit') return { x: SPRITE.feet.x, y: SPRITE.hip };
    return SPRITE.feet;
  }

  pivot() {
    const s = this.scale;
    const P = this.pivotPoint();
    this.canvas.style.transformOrigin = `${(SPRITE.pad + P.x) * s}px ${(SPRITE.pad + P.y) * s}px`;
  }

  // A point of the sprite on screen, as it's drawn before she's turned: from her feet, the way she faces.
  flat(sx, sy) {
    const s = this.scale;
    return { x: this.pos.x + (sx - SPRITE.feet.x) * s * this.facing, y: this.pos.y + (sy - SPRITE.feet.y) * s + this.bob };
  }

  // How far she's turned on screen, degrees: her lean or spin, and upside down when she hangs from the top.
  get turn() {
    return (this.upside ? 180 : 0) + this.tilt;
  }

  // ...and where that point really is, once she's turned around her pivot.
  screenPoint(sx, sy) {
    const p = this.flat(sx, sy);
    if (!this.turn) return p;
    const P = this.pivotPoint();
    return turnAround(p, this.flat(P.x, P.y), this.turn * DEG);
  }

  // The other way: the point of the sprite under screen point (x, y).
  spritePoint(x, y) {
    let at = { x, y };
    if (this.turn) {
      const P = this.pivotPoint();
      at = turnAround(at, this.flat(P.x, P.y), -this.turn * DEG);
    }
    const s = this.scale;
    return { x: SPRITE.feet.x + ((at.x - this.pos.x) / s) * this.facing, y: SPRITE.feet.y - (this.pos.y + this.bob - at.y) / s };
  }

  // Her box on screen (css px), with room to spare while she turns: on Linux her window only takes
  // the pointer there (app.js), and hit() sorts out her body from the air around it. null: hidden.
  screenBox(pad = 24) {
    if (this.hidden || this.p.alpha < 0.5) return null;
    const s = this.scale;
    const more = this.turn ? SPRITE.height * s * 0.5 : 0;
    const xs = [0, SPRITE.width].map((sx) => this.pos.x + (sx - SPRITE.feet.x) * s * this.facing);
    const ys = [0, SPRITE.height].map((sy) => this.pos.y + this.bob - (SPRITE.feet.y - sy) * s);
    const p = pad + more;
    return { x: Math.min(...xs) - p, y: Math.min(...ys) - p, w: Math.abs(xs[1] - xs[0]) + 2 * p, h: Math.abs(ys[1] - ys[0]) + 2 * p };
  }

  // How far her outline reaches from her middle on screen once turned `deg` (px): { minX, maxX,
  // minY, maxY }, and `low`, the x of her lowest point (where she touches the floor). Her outline
  // at rest, mane and all: she bounces off the edges of the screen with the tips of her mane.
  reachAt(deg, facing = this.facing) {
    const a = deg * DEG, c = Math.cos(a), sn = Math.sin(a), s = this.scale;
    const r = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, low: 0 };
    for (const [hx, hy] of this.hull) {
      const x = hx * facing;
      const X = (x * c - hy * sn) * s, Y = (x * sn + hy * c) * s;
      if (X < r.minX) r.minX = X;
      if (X > r.maxX) r.maxX = X;
      if (Y < r.minY) r.minY = Y;
      if (Y > r.maxY) {
        r.maxY = Y;
        r.low = X;
      }
    }
    return r;
  }

  // Flying or lying there, she's placed by her middle: her feet follow from it.
  setMid(c) {
    const s = this.scale;
    this.pos = { x: c.x - (MID.x - SPRITE.feet.x) * s * this.facing, y: c.y - (MID.y - SPRITE.feet.y) * s };
  }

  setView(w, h, floor = h) {
    this.view = { w, h, floor };
    if (this.stance === 'stand') {
      this.pos.x = clamp(this.pos.x, 60, w - 60);
      this.pos.y = clamp(this.pos.y, SPRITE.height * this.scale, floor - 4);
    }
    this.place();
  }

  get upside() {
    return this.stance === 'peek' && this.peekSide === 'top';
  }

  place() {
    const s = this.scale;
    const P = this.pivotPoint();
    const o = this.flat(P.x, P.y);
    const left = Math.round(o.x - (SPRITE.pad + P.x) * s);
    const top = Math.round(o.y - (SPRITE.pad + P.y) * s);
    let move = `translate3d(${left}px, ${top}px, 0)`;
    // flattened against a wall or the floor: squashed on screen, around where she hit it
    const sq = this.squashNow();
    if (sq) {
      const ox = (sq.at.x - left).toFixed(1), oy = (sq.at.y - top).toFixed(1);
      move += ` translate(${ox}px, ${oy}px) scale(${sq.x.toFixed(3)}, ${sq.y.toFixed(3)}) translate(${-ox}px, ${-oy}px)`;
    }
    this.root.style.transform = move;
    this.canvas.style.transform = `rotate(${this.turn.toFixed(2)}deg) scale(${(this.facing * this.sx).toFixed(3)}, ${this.sy.toFixed(3)})`;
    this.onMove?.(this.head());
  }

  // her face on screen, plus `top`: the tips of her mane
  head(at = this.pos, facing = this.facing) {
    const s = this.scale;
    const bob = at === this.pos ? this.bob : 0;
    const dx = (SPRITE.head.x - SPRITE.feet.x) * s * facing;
    const dy = (SPRITE.feet.y - SPRITE.head.y) * s;
    if (at === this.pos && this.upside) {
      const y = at.y + dy + bob;
      return { x: at.x - dx, y, top: y - 30 * s };
    }
    if (at === this.pos && SPUN.has(this.stance) && this.tilt) {
      // turned around (held, thrown, lying there): her face where it really is, the tips of her mane above it
      const face = this.screenPoint(SPRITE.head.x, SPRITE.head.y);
      return { ...face, top: face.y - 70 * s };
    }
    return { x: at.x + dx, y: at.y - dy + bob, top: at.y - SPRITE.feet.y * s + bob };
  }

  // Is this screen point on her body? Uses the cut-out's alpha so empty space stays click-through.
  hit(x, y) {
    if (this.hidden || this.p.alpha < 0.5) return false;
    if (this.perch?.id === 'taskbar' && y > this.view.floor) return false; // the taskbar under her legs stays clickable
    const at = this.spritePoint(x, y);
    const sx = at.x;
    let sy = at.y;
    if (this.p.sit > 0 && sy > SPRITE.hip) {
      // same fold as the shader: short thighs, legs ridden up
      const c = lerp(1, 0.3, this.p.sit);
      sy = sy <= SPRITE.hip + THIGH * c ? SPRITE.hip + (sy - SPRITE.hip) / c : sy + THIGH * (1 - c);
    }
    for (const [dx, dy] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4]]) {
      const px = Math.round(sx + dx), py = Math.round(sy + dy);
      if (px < 0 || py < 0 || px >= SPRITE.width || py >= SPRITE.height) continue;
      if (this.alphaMap[(py * SPRITE.width + px) * 4 + 3] > 40) return true;
    }
    return false;
  }

  faceCenter() {
    this.facing = this.pos.x > this.view.w / 2 ? 1 : -1;
  }

  // Which way is the middle of the screen from her, -1 or 1.
  towardCenter() {
    return this.pos.x > this.view.w / 2 ? -1 : 1;
  }

  // the reaching side of the cut-out points toward screen x
  faceToward(x) {
    this.facing = x < this.pos.x ? 1 : -1;
  }

  get floor() {
    return this.view.floor - 6;
  }

  spot(name) {
    const { w } = this.view;
    const s = this.scale;
    const side = 150 * s + 30;
    switch (name) {
      case 'post':
        return { x: w - side - 30, y: this.floor };
      case 'stage':
        return { x: w * 0.5 + rand(-w * 0.12, w * 0.12), y: this.floor };
      case 'chip': // next to her biochip, bottom left
        return { x: side + 30, y: this.floor };
      default: {
        const y = Math.random() < 0.65 ? this.floor : rand(SPRITE.height * s + 200, this.floor);
        let x = rand(side, w - side);
        if (Math.abs(x - this.pos.x) < w * 0.2) x = clamp(w - x, side, w - side);
        return { x, y };
      }
    }
  }

  // ---------- windows ----------

  setWindows(data) {
    this.windows = data;
    if (this.stance !== 'sit' || this.busy || this.dragging) return;
    const win = this.perchWin(this.perch.id);
    const dx = win ? clamp(this.perch.dx, 50, win.w - 60) : 0;
    if (!win || !this.canSit(win) || this.covered(win, win.x + dx)) {
      this.fall(); // the ledge is gone (closed, minimized, maximized or covered)
      return;
    }
    const to = this.seat(win, dx);
    if (to.x !== this.pos.x || to.y !== this.pos.y) {
      this.pos = to; // ride along with the window
      this.place();
    }
  }

  // Where her feet go so that her hips rest on the window's top edge.
  seat(win, dx) {
    return { x: win.x + dx, y: win.y + 3 + (SPRITE.feet.y - SPRITE.hip) * this.scale };
  }

  canSit(win) {
    if (win.id === 'taskbar') return true;
    const roomAbove = SPRITE.hip * this.scale + 12;
    return !win.max && win.w > 260 && win.y > roomAbove && win.y < this.view.floor - 80;
  }

  // Is her spot on that ledge hidden under a window that's above it?
  covered(win, x) {
    if (win.id === 'taskbar') return false; // nothing goes over the taskbar
    const half = 34 * this.scale;
    const { wins } = this.windows;
    for (const o of wins) {
      if (o === win || o.id === win.id) return false; // reached it: everything after is below
      if (o.x < x + half && o.x + o.w > x - half && o.y <= win.y && o.y + o.h >= win.y) return true;
    }
    return false; // window not in the list any more
  }

  // A window she could sit on, the one in front first. Returns { win, dx } or null.
  // The top of the taskbar (the bottom of her screen), as a ledge to sit on like a window's: her
  // legs hang down behind it.
  ledge() {
    return { id: 'taskbar', x: 0, y: this.view.floor, w: this.view.w, h: this.view.h - this.view.floor, max: false };
  }

  // What she's perched on, from its id: a window, or the taskbar.
  perchWin(id) {
    return id === 'taskbar' ? this.ledge() : this.windows.wins.find((w) => w.id === id);
  }

  // Back to where she rests: her corner, or sitting on the taskbar below it.
  goHome() {
    const post = this.spot('post');
    if (this.restOn !== 'taskbar') return this.teleport(post);
    if (this.stance === 'sit' && this.perch?.id === 'taskbar') return Promise.resolve();
    // left of the clock and the tray icons, right of the middle (the app icons, on Windows 11)
    return this.sitOn({ win: this.ledge(), dx: clamp(this.view.w - 440, this.view.w * 0.6, post.x) });
  }

  pickSeat({ frontOnly = false, except = null } = {}) {
    const options = [];
    for (const win of this.windows.wins) {
      if (win.id === except || !this.canSit(win)) continue;
      const dx = clamp(rand(win.w * 0.18, win.w * 0.6), 60, Math.max(60, win.w - 190));
      if (this.covered(win, win.x + dx)) continue;
      options.push({ win, dx });
    }
    const front = options.find((o) => o.win.id === this.windows.fg);
    if (frontOnly) return front || null;
    return front || options[0] || null;
  }

  // ---------- frame loop ----------

  interval() {
    if (this.busy || this.stance === 'fall' || SPUN.has(this.stance) || this.skid || this.act?.player.act.fps === 24) return ON_ONES;
    return this.mode === 'sleep' ? ASLEEP : ON_TWOS;
  }

  loop(now) {
    requestAnimationFrame(this.loop);
    if (this.hidden) return;
    if (now - this.lastDraw < this.interval() - 1) return;
    this.drawFrame(now);
    this.behave(now);
  }

  drawFrame(now = performance.now()) {
    this.lastDraw = now;
    this.animate(now);
    this.sprite.draw(this.p);
    this.place();
  }

  // Pick the drawing: the stance's cycle underneath, the current act on top.
  animate(now) {
    const p = this.p;
    p.seed = Math.random() * 100; // a fresh drawing, so the line boils

    const under = this.base.sample(now);
    const base = under ? this.base.resolve(under.pose, this.facing) : {};
    let act = null;
    let cue = null;
    if (under && under.index !== this.baseIndex) {
      this.baseIndex = under.index;
      if (!this.act) cue = under.cue; // the stance's own cues, when no act is on top
    }
    if (this.act) {
      const drawing = this.act.player.sample(now);
      if (drawing) {
        act = this.act.player.resolve(drawing.pose, this.facing);
        if (drawing.index !== this.act.index) {
          this.act.index = drawing.index;
          cue = drawing.cue;
        }
      } else {
        this.endAct(true);
      }
    }
    const pose = { ...NEUTRAL, ...base, ...act };
    if (this.mode === 'sleep' && this.stance === 'sit' && !act) {
      Object.assign(pose, { head: 0.12, mane: -0.1, kickL: 0.03, kickR: 0.03, armL: -0.45, armR: -0.45 }); // dozing on the ledge
    }
    if (this.stance === 'fly') this.flyPose(pose);
    else if (this.stance === 'held') this.heldPose(pose);
    if (this.override) Object.assign(pose, this.override);

    p.head = pose.head;
    p.mane = pose.mane;
    p.hair = pose.hair;
    p.armL = pose.armL;
    p.armR = pose.armR;
    p.longL = pose.longL;
    p.longR = pose.longR;
    p.kickL = pose.kickL;
    p.kickR = pose.kickR;
    p.smear = pose.smear;
    p.echo = pose.echo;
    // on a ledge she stays seated: no lifting off it, no sinking through it
    const bob = this.stance === 'sit' ? clamp(pose.bob, -3, 2) : pose.bob;
    const spun = SPUN.has(this.stance);
    this.bob = spun || this.dragging ? 0 : bob;
    this.tilt = spun ? this.spin + pose.tilt : pose.tilt;
    this.sx = pose.sx;
    this.sy = pose.sy;
    if (this.debug) Object.assign(p, this.debug); // --dev pose overrides
    if (cue) this.onCue(cue);
  }

  behave(now) {
    if (this.stance === 'fall') {
      this.updateFall(now);
      return;
    }
    if (this.stance === 'fly') {
      this.updateFly(now);
      return;
    }
    if (this.stance === 'held') {
      this.swing(now);
      return;
    }
    if (this.skid) this.updateSkid(now);
    if (this.busy || this.dragging) return;

    if (now > this.nextTwitch) {
      this.nextTwitch = now + rand(5000, 13000);
      if (!reducedMotion.matches && this.mode !== 'sleep') this.twitch();
    }

    // a shard of her mane breaks off now and then and drifts away
    if (now > this.nextShed) {
      this.nextShed = now + rand(4000, 11000) * (this.mode === 'sleep' ? 2.5 : 1);
      if (!reducedMotion.matches && this.stance !== 'peek') this.shed();
    }

    if (this.mode === 'idle' && this.stance !== 'peek' && now > this.nextGaze) {
      this.nextGaze = now + rand(90000, 180000);
      this.gaze();
    }

    if (this.mode === 'idle' && now - this.lastActivity > SLEEP_AFTER) this.setMode('sleep');
    if (this.mode === 'sleep' && now - this.sleptAt > DOZE_AFTER) {
      this.doze();
      return;
    }

    if (this.stance === 'peek' && now > this.peekUntil) {
      this.unpeek();
      return;
    }

    // resting on the taskbar: a little while after anything happens, she goes back to sit on it
    if (this.restOn === 'taskbar' && this.mode === 'idle' && this.stance === 'stand'
      && now - this.lastActivity > 6000 && now > this.nextHome) {
      this.nextHome = now + 8000;
      this.goHome();
      return;
    }

    if (this.mode === 'idle' && now > this.nextMove) {
      this.nextMove = now + rand(25000, 70000);
      this.wanderStep();
    }

    if (this.mode === 'work' && now - this.lastGlyph > 420) {
      this.lastGlyph = now;
      const h = this.head();
      this.fx.glyph(h.x, h.y - 30);
    }
  }

  // What she does with herself when nobody needs her.
  wanderStep() {
    if (!this.wander || this.stance === 'peek') {
      if (this.stance !== 'peek') this.flourish();
      return;
    }
    // attached to you (bond.js): now and then she just comes over to where your pointer is
    if (this.fondness >= 3 && this.mouse && Math.random() < 0.2) {
      const to = this.summonSpot(this.mouse);
      if (Math.hypot(to.x - this.pos.x, to.y - this.pos.y) > 200) {
        this.teleport(to, { face: this.mouse.x < to.x ? 1 : -1 }).then(() => this.perform('curious', this.mouse && this.mouse.x < this.pos.x ? -1 : 1));
        return;
      }
    }
    if (this.stance === 'sit' && this.perch?.id === 'taskbar') {
      // nothing to hop off or take over down there: a flourish, or off for a bit (she comes back)
      if (Math.random() < 0.6) this.flourish();
      else this.teleport(this.spot('random'));
      return;
    }
    if (this.stance === 'sit') {
      const r = Math.random();
      if (r < 0.3) this.flourish();
      else if (r < 0.5 && this.canPossess()) this.possess();
      else if (r < 0.75) this.fall(); // just hops off the ledge
      else this.teleport(this.spot('random'));
      return;
    }
    const seat = this.pickSeat();
    const r = Math.random();
    if (seat && r < 0.35) this.sitOn(seat);
    else if (r < 0.6) this.peek();
    else if (r < 0.85) this.teleport(this.spot('random'));
    else this.flourish();
  }

  flourish() {
    if (this.stance === 'sit') this.perform(pick(['look', 'look', 'split']));
    else this.perform(pick(['spin', 'look', 'hop', 'curious', 'split']), this.towardCenter());
  }

  // ---------- acting ----------

  // Play an act from acting.js. Resolves when it's over (or cut off by a stronger one).
  perform(name, dir = 0, { reach = 1 } = {}) {
    if (this.stowed || this.dormant) return Promise.resolve(); // nobody to act: she's in her biochip, or just her mask
    if (SPUN.has(this.stance) && name !== 'grabbed') return Promise.resolve(); // held, flying or knocked down: not now
    const act = ACTS[name];
    if (reducedMotion.matches && act.fps === 24) {
      if (act.flip) this.facing *= -1;
      return Promise.resolve();
    }
    const next = new Player(name, { dir, reach });
    if (this.act && this.act.player.priority > next.priority) return Promise.resolve();
    this.endAct(false);
    return new Promise((done) => {
      this.act = { player: next, done };
    });
  }

  endAct(completed) {
    const current = this.act;
    if (!current) return;
    this.act = null;
    if (completed && current.player.act.flip) this.facing *= -1;
    current.done();
  }

  setStance(stance, { perch = null, peekSide = null, dir = 0 } = {}) {
    this.stance = stance;
    this.perch = perch;
    this.peekSide = peekSide;
    this.p.sit = stance === 'sit' ? 1 : 0;
    if (!SPUN.has(stance)) this.spin = 0;
    if (stance !== 'held') this.held = null;
    if (stance !== 'down') this.lying = null;
    this.base = this.restBase(dir);
    this.pivot();
  }

  // The cycle under her acts: her stance's, or holding her arm out at what she's showing you.
  restBase(dir = 0) {
    const pt = this.pointing;
    if (pt && (this.stance === 'stand' || this.stance === 'sit')) return new Player('pointing', { dir: pt.dir, reach: pt.reach });
    return new Player(this.baseAct(), { dir });
  }

  baseAct() {
    if (this.stance === 'sit') return 'sit';
    if (this.stance === 'peek') return 'peek';
    if (this.stance === 'fall') return 'fall';
    if (this.stance === 'held') return 'held';
    if (this.stance === 'fly') return this.flight?.kind === 'leap' ? 'leap' : 'tumble';
    if (this.stance === 'down') return 'ko';
    return this.mode === 'sleep' ? 'sleep' : 'stand';
  }

  setMode(mode) {
    const now = performance.now();
    if (mode !== 'sleep') this.lastActivity = now;
    // after anything happens, stay put a while (so she doesn't wander off right after "done")
    this.nextMove = Math.max(this.nextMove, now + rand(55000, 120000));
    this.nextGaze = Math.max(this.nextGaze, now + rand(30000, 70000));
    if (this.mode === mode) return;
    const prev = this.mode;
    this.mode = mode;
    if (mode === 'sleep') this.sleptAt = now;
    this.onMode?.(mode, prev);
    if (this.stance === 'stand') this.base = this.restBase();
    const p = this.p;
    if (mode === 'sleep') tween(p, { alpha: 0.55, sparkle: 0.35, boil: 0.4 }, 900, ease.inOut);
    else tween(p, { alpha: 1, sparkle: 1, boil: 0.9 }, 250, ease.out);
  }

  wake() {
    if (this.mode === 'sleep') this.setMode('idle');
    this.lastActivity = performance.now();
    if (this.dormant) this.rouse(); // down to her mask: she comes back
  }

  // Somewhere to be while Claude works: on the window in front if she can sit on it, else her corner.
  goToWork() {
    this.setMode('work');
    const seat = this.pickSeat({ frontOnly: true });
    if (seat) {
      if (this.stance === 'sit' && this.perch?.id === seat.win.id) return;
      this.sitOn(seat);
      return;
    }
    if (this.restOn === 'taskbar') {
      this.goHome();
      return;
    }
    const post = this.spot('post');
    if (this.stance !== 'stand' || Math.hypot(post.x - this.pos.x, post.y - this.pos.y) > 320) this.teleport(post);
  }

  // Claude did something: come out of hiding.
  attend() {
    this.wake();
    if (this.stance === 'peek' && !this.busy) this.teleport(this.spot('post'));
  }

  twitch() {
    const p = this.p;
    p.glitchSeed = Math.random() * 100;
    p.glitch = rand(0.15, 0.3);
    p.split = 2;
    setTimeout(() => {
      p.glitch = 0;
      p.split = 0;
    }, ON_TWOS * 2);
  }

  // a small jolt each time Claude touches something
  pulse() {
    if (this.busy || reducedMotion.matches) return;
    const p = this.p;
    p.glitchSeed = Math.random() * 100;
    p.glitch = 0.12;
    setTimeout(() => { p.glitch = 0; }, ON_TWOS);
  }

  shed() {
    const s = this.scale;
    const h = this.head();
    const a = rand(-Math.PI * 0.95, -Math.PI * 0.05); // somewhere on the upper rim of the mane
    const r = rand(70, 100) * s;
    this.fx.drift(h.x + Math.cos(a) * r, h.y - 40 * s + Math.sin(a) * r * 0.85, a);
  }

  // A point of the sprite (sprite px) on screen, where she stands, the way she faces.
  toScreen(sx, sy) {
    const s = this.scale;
    return {
      x: this.pos.x + (sx - SPRITE.feet.x) * s * this.facing,
      y: this.pos.y - (SPRITE.feet.y - sy) * s + this.bob,
    };
  }

  // Which arm points to screen side `dir`: 'L' or 'R' (the sprite may be mirrored).
  armToward(dir) {
    return dir * this.facing < 0 ? 'L' : 'R';
  }

  // Shoulder and hand of one arm on screen, at the arm's current angle (same turn as the shader).
  limb(side) {
    const { shoulder, hand, mirror } = SPRITE;
    const a = side === 'L' ? this.p.armL : this.p.armR;
    const k = side === 'L' ? this.p.longL : this.p.longR;
    const vx = (hand.x - shoulder.x) * k, vy = (hand.y - shoulder.y) * k;
    let hx = shoulder.x + Math.cos(a) * vx - Math.sin(a) * vy;
    const hy = shoulder.y + Math.sin(a) * vx + Math.cos(a) * vy;
    let sx = shoulder.x;
    if (side === 'R') {
      hx = mirror - hx;
      sx = mirror - sx;
    }
    return { shoulder: this.toScreen(sx, shoulder.y), hand: this.toScreen(hx, hy) };
  }

  // The satellite. It crosses high over the open side of the screen, slowly, and her hand
  // follows it. Mostly she just looks at it ("gaze"). She sends the red light up to it
  // ("uplink") only when it means something: the first time of the day, and a little while
  // after Claude finishes a long job (earnUplink). The cues in onCue do the sky.
  gaze({ big } = {}) {
    if (this.busy || this.hidden || this.act || this.stance === 'peek' || this.stance === 'fall') return false;
    big ??= this.uplinkDue || this.lastUplinkDay() !== today();
    if (reducedMotion.matches) big = false; // no strobing bolt
    if (big) {
      this.uplinkDue = false;
      try {
        localStorage.setItem(UPLINK_DAY, today());
      } catch {
        // no storage: she'll just do it again next launch
      }
    }
    const dir = this.towardCenter();
    const { w } = this.view;
    const side = this.armToward(dir);
    const { shoulder } = this.limb(side);
    // up and well off to the side, so her arm points at it clear of her mane
    const y = clamp(shoulder.y - rand(280, 400), 50, shoulder.y - 180);
    const x = clamp(shoulder.x + dir * rand(380, 520), 40, w - 40);
    const to = { x: clamp(x + dir * rand(170, 260), 30, w - 30), y: y - rand(10, 40) };
    const sat = this.fx.satellite({ x, y }, to, { duration: 9500 });
    // how far up the arm must come to point at it right now (it hangs ~30 degrees low at rest)
    const reach = () => {
      const at = sat.pos();
      const sh = this.limb(side).shoulder;
      return clamp(Math.atan2(sh.y - at.y, Math.abs(at.x - sh.x)) + 0.52, 0.5, 1.6);
    };
    // from her fingertips to it
    const road = () => [this.limb(side).hand, sat.pos()];
    this.sky = { sat, road, dir, side, motes: null, surge: null, head: null };
    if (!big) this.onGaze?.('start');
    this.perform(big ? 'uplink' : 'gaze', dir, { reach }).then(() => {
      this.clearSky();
      if (big) this.onGaze?.('end');
    });
    return true;
  }

  lastUplinkDay() {
    try {
      return localStorage.getItem(UPLINK_DAY);
    } catch {
      return null;
    }
  }

  // Claude just finished a long job: the next time she looks up, once things have settled, it's the whole thing.
  earnUplink() {
    this.uplinkDue = true;
    this.nextGaze = performance.now() + rand(25000, 40000);
  }

  clearSky() {
    if (!this.sky) return;
    const { sat, motes, surge } = this.sky;
    surge?.break();
    motes?.home(...this.moved());
    sat.fade();
    this.sky = null;
    tween(this.p, { sparkle: this.mode === 'sleep' ? 0.35 : 1 }, 400, ease.out);
  }

  // How far her head has moved since her stars lifted off it.
  moved() {
    const was = this.sky?.head;
    if (!was) return [0, 0];
    const h = this.head();
    return [h.x - was.x, h.y - was.y];
  }

  // Points on her mane, where her white specks are (for the stars that lift off it).
  manePoints(n) {
    const s = this.scale;
    const h = this.head();
    return Array.from({ length: n }, () => {
      const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random());
      return { x: h.x + Math.cos(a) * r * 92 * s, y: h.y - 44 * s + Math.sin(a) * r * 66 * s };
    });
  }

  // Red sparks off her fingers: she's hacking something. On a window, she jacks into it:
  // the sparks go down into the ledge and run along it.
  spark() {
    if (this.busy || this.hidden || reducedMotion.matches || this.stance === 'peek' || this.stance === 'fall') return;
    const s = this.scale;
    const side = Math.random() < 0.5 ? 'L' : 'R';
    const { hand } = this.limb(side);
    const out = (side === 'L' ? -1 : 1) * this.facing;
    if (this.stance === 'sit') {
      const ledge = this.pos.y - (SPRITE.feet.y - SPRITE.hip) * s - 3;
      const at = { x: hand.x + out * rand(10, 40) * s, y: ledge };
      const run = { x: at.x + out * rand(90, 200), y: ledge + rand(-2, 2) };
      this.fx.bolt(hand, at, { life: 200, forks: 1, width: 2 });
      this.fx.bolt(at, run, { life: 260, forks: 2, width: 2 });
    } else {
      for (let i = 0; i < 2; i++) {
        const to = { x: hand.x + out * rand(30, 80) * s, y: hand.y + rand(-50, 30) * s };
        this.fx.bolt(hand, to, { life: rand(140, 220), forks: 1, width: 2 });
      }
    }
    this.voice.play('bolt', { soft: true });
  }

  // The menace: a jolt of red lightning at your pointer, and a grin.
  zap(x, y) {
    if (this.busy || this.hidden || this.act || reducedMotion.matches || this.stance !== 'stand') return false;
    const dir = x < this.pos.x ? -1 : 1;
    const side = this.armToward(dir);
    const reach = () => {
      const sh = this.limb(side).shoulder;
      return clamp(Math.atan2(sh.y - y, Math.abs(x - sh.x)) + 0.52, -0.3, 1.6);
    };
    this.zapAt = { x, y, side, dir };
    this.perform('zap', dir, { reach });
    return true;
  }

  // Where a cut-in goes, as fx.cutin's (x, y, dir): next to her head on the `dir` side, else on
  // the other side (unless `flip` is off because something is going on there), else over her mane.
  cutinAt(dir, { flip = true } = {}) {
    const s = this.scale;
    const h = this.head();
    const gap = 85 * s + 24, width = 274; // the band plus its slant, see fx.js
    const fits = (d) => (d > 0 ? h.x + gap + width < this.view.w - 8 : h.x - gap - width > 8);
    if (fits(dir)) return [h.x + dir * gap, h.y - 18, dir];
    if (flip && fits(-dir)) return [h.x - dir * gap, h.y - 18, -dir];
    return [clamp(h.x - width / 2, 8, this.view.w - width - 8), Math.max(56, h.top - 58), 1];
  }

  // Flat-colour impact frames, one drawing each.
  async flash(colors) {
    const p = this.p;
    for (const color of colors) {
      p.sil = color;
      p.silAmount = 1;
      this.drawFrame();
      await sleep(ON_ONES);
    }
    p.silAmount = 0;
  }

  // Effects and sounds pinned to drawings of an act (the third item of a key in acting.js).
  onCue(cue) {
    const s = this.scale;
    const h = this.head();
    const mane = { x: h.x, y: h.y - 40 * s };
    switch (cue) {
      case 'gather': // shards sucked into the mane before it blows
        this.fx.burst(mane.x, mane.y, { count: 18, inward: true, power: 0.7, spread: 170 * s });
        break;
      case 'launch':
        this.voice.play('rise');
        this.fx.slices(h.x - 70 * s, h.y - 40 * s, 170 * s, 300 * s, { count: 5 });
        break;
      case 'peak':
        this.voice.play('done');
        this.fx.lines(mane.x, mane.y, { inner: 150 * s + 30 });
        this.fx.ring(mane.x, mane.y);
        this.fx.burst(mane.x, mane.y, { count: 34, power: 1.2, spread: 140 * s });
        setTimeout(() => this.flash([GREEN, INK, GREEN]), 0);
        break;
      case 'speak':
        this.fireSpeak();
        break;
      case 'laugh':
        this.fx.cutin(...this.cutinAt(this.act?.player.dir || this.towardCenter()), { kind: pick(['laugh', 'grin']) });
        break;
      case 'stare': // every eye she has, on you
        this.fx.cutin(...this.cutinAt(this.act?.player.dir || this.towardCenter()), { kind: 'many', life: 640 });
        break;
      case 'notice':
        this.twitch();
        break;
      case 'zap':
        if (this.zapAt) {
          const { x, y, side } = this.zapAt;
          this.fx.bolt(this.limb(side).hand, { x, y }, { life: 240, forks: 2, width: 3 });
          this.fx.burst(x, y, { count: 8, power: 0.35, spread: 16 });
          this.fx.ring(x, y, { size: 0.22 });
          this.voice.play('bolt');
        }
        break;
      case 'grin':
        if (this.zapAt && Math.random() < 0.6) this.fx.cutin(...this.cutinAt(-this.zapAt.dir), { kind: 'look', life: 560 });
        this.zapAt = null;
        break;
      // pointing at something (pointAt)
      case 'spot': // her head snaps to it: a glint where she's looking
        if (this.pointing) {
          const { aim } = this.pointing;
          this.fx.ring(aim.x, aim.y, { size: 0.18 });
          this.voice.play('tick');
        }
        break;
      case 'coil': // winding up: shards pulled into her, a crackle
        this.fx.burst(h.x, h.y + 40 * s, { count: 10, inward: true, power: 0.45, spread: 90 * s });
        this.voice.play('bolt', { soft: true });
        break;
      case 'lock': { // the strike: lightning off her fingertip, the reticle slams onto it
        const pt = this.pointing;
        if (pt && !pt.pointer) {
          const hand = this.limb(pt.side).hand;
          pt.pointer = this.fx.pointer(() => this.limb(pt.side).hand, pt.rect, pt.aim, { label: pt.label });
          if (!reducedMotion.matches) {
            this.fx.bolt(hand, pt.aim, { life: 260, forks: 3, width: 3 });
            this.fx.ring(pt.aim.x, pt.aim.y, { size: 0.55 });
            this.fx.burst(pt.aim.x, pt.aim.y, { count: 12, power: 0.5, spread: 20 });
            // her eyes lock on, on the side away from it
            this.fx.cutin(...this.cutinAt(-pt.dir, { flip: false }), { kind: 'eyes', life: 480 });
          }
          this.voice.play('bolt');
        }
        break;
      }
      case 'tap':
        this.pointing?.pointer?.tap();
        break;
      case 'minds':
        this.twitch();
        break;
      case 'snap':
        this.twitch();
        this.voice.play('tick');
        break;
      case 'dust': // shaking off a crash: her mane flares and the shards fly off it
        this.fx.burst(mane.x, mane.y, { count: 16, power: 0.7, spread: 150 * s });
        this.voice.play('tick');
        break;
      case 'steam': { // overheating: heat coming off her, and she flushes red for a drawing
        this.fx.heat(h.x + rand(-30, 30) * s, h.top + 20 * s);
        const p = this.p;
        p.sil = RED;
        p.silAmount = 0.32;
        setTimeout(() => {
          if (p.sil === RED && p.silAmount < 0.5) p.silAmount = 0;
        }, ON_TWOS);
        break;
      }
      case 'hiss': // jealous: sparks crawling over her, and a hiss
        this.fx.crackle(() => this.head(), { life: 520, radius: 90 * s + 20, count: 3 });
        this.voice.play('jealous');
        break;
      default:
        if (this.sky) this.skyCue(cue);
        break;
    }
  }

  // The satellite's cues (acting.js "gaze" and "uplink").
  skyCue(cue) {
    const s = this.scale;
    const sky = this.sky;
    const hand = () => this.limb(sky.side).hand;
    switch (cue) {
      case 'glint':
        this.voice.play('star');
        break;
      case 'starlight': // her specks catch its light
        tween(this.p, { sparkle: 1.8 }, 500, ease.out);
        break;
      case 'stars': // they lift off and become a sky; her mane goes dark without them
        sky.head = this.head();
        sky.motes = this.fx.motes(this.manePoints(30), { lift: 230 * s + 60, spread: 320 * s + 80 });
        tween(this.p, { sparkle: 0.15 }, 500, ease.out);
        break;
      case 'align': // into a road, from her fingers to it
        sky.motes?.align(sky.road);
        this.voice.play('tick');
        break;
      case 'charge': {
        this.fx.crackle(hand, { life: 640, radius: 70 * s + 14, count: 3 });
        const at = hand();
        this.fx.burst(at.x, at.y, { count: 14, inward: true, power: 0.5, spread: 90 * s });
        this.fx.cutin(...this.cutinAt(-sky.dir, { flip: false }), { kind: 'eyes', life: 600 }); // never over the road
        this.voice.play('charge');
        break;
      }
      case 'surge': { // the red light goes up
        const at = hand();
        sky.surge = this.fx.surge(sky.road, {
          onHit: () => {
            const top = sky.sat.pos();
            sky.sat.twinkle(1.25);
            this.fx.ring(top.x, top.y, { size: 0.55 });
            this.fx.lines(top.x, top.y, { inner: 60, life: 460 });
            this.voice.play('star');
          },
        });
        sky.motes?.light(125);
        this.fx.ring(at.x, at.y, { size: 0.6 });
        this.flash([INK, RED]);
        this.voice.play('bolt');
        this.voice.play('rise');
        break;
      }
      case 'break':
        sky.surge?.break();
        sky.surge = null;
        sky.motes?.dim();
        this.voice.play('tick');
        break;
      case 'twinkle': { // and it answers
        const at = sky.sat.pos();
        sky.sat.twinkle(1);
        this.fx.ring(at.x, at.y, { size: 0.4 });
        this.voice.play('star');
        break;
      }
      case 'glimmer':
        sky.sat.twinkle(0.55);
        if (!sky.motes) this.voice.play('star');
        break;
      case 'home': // her stars come back to her, and her mane lights up with them
        sky.motes?.home(...this.moved());
        sky.motes = null;
        tween(this.p, { sparkle: 1.7 }, 400, ease.out).then(() => tween(this.p, { sparkle: 1 }, 700, ease.inOut));
        break;
    }
  }

  fireSpeak() {
    const fn = this.onSpeak;
    this.onSpeak = null;
    fn?.();
  }

  async hurt() {
    this.perform('flinch');
    if (reducedMotion.matches) return;
    const p = this.p;
    p.sil = RED;
    p.silAmount = 1;
    this.drawFrame();
    await sleep(ON_TWOS);
    p.silAmount = 0;
    p.glitchSeed = Math.random() * 100;
    p.glitch = 0.7;
    p.split = 7;
    await tween(p, { glitch: 0, split: 0 }, 450, ease.out);
  }

  // Job done: the victory sequence (acting.js), its effects on cue. onSpeak runs when she
  // comes back down (that's when the "done" panel comes in), or at the end if anything cut it short.
  async celebrate({ onSpeak } = {}) {
    this.onSpeak = onSpeak;
    if (reducedMotion.matches || this.stowed || this.dormant || SPUN.has(this.stance)) {
      this.voice.play('done');
      this.fireSpeak();
      return;
    }
    await this.perform('victory', this.towardCenter());
    this.fireSpeak();
  }

  // ---------- moving around ----------

  // Collapse into a line of light and go. Leaves her invisible; the caller puts her somewhere.
  async vanish({ beam = true } = {}) {
    const p = this.p;
    const s = this.scale;
    const from = { ...this.pos };
    const head = this.head();
    if (this.sky) this.endAct(false); // the satellite stays here, she doesn't
    this.stopPointing(); // nor does what she was showing you
    if (reducedMotion.matches) {
      await tween(p, { alpha: 0 }, 160, ease.linear);
      return head;
    }
    this.voice.play('teleport-out');
    p.glitchSeed = Math.random() * 100;
    await tween(p, { glitch: 0.35, split: 3 }, 90, ease.linear);
    this.fx.burst(head.x, head.y + 70 * s, { count: 22, spread: 150 * s });
    this.fx.slices(head.x - 70 * s, head.y - 40 * s, 170 * s, 320 * s);
    await tween(p, { collapse: 1, glitch: 1, dissolve: 0.5, split: 9 }, 170, ease.in);
    p.alpha = 0;
    const ground = from.y - (this.p.sit ? (SPRITE.feet.y - SPRITE.hip) * s : 0);
    if (!this.upside) {
      // the void she leaves behind, like in the show: a black slit with a red line in it
      this.fx.slit(from.x - 10 * s * this.facing, head.top, ground, { width: 56 * s + 10 });
      if (beam) this.fx.beam(from.x, ground, { width: 40 * s + 8 });
    }
    return head;
  }

  // Come back at `to`: a column of light down to her, the body unfolding, two impact frames.
  async arrive(to, { face = null, stance = 'stand', perch = null, peekSide = null, dir = 0, fromHead = null, beam = true } = {}) {
    const p = this.p;
    const s = this.scale;
    const facing = face ?? (to.x > this.view.w / 2 ? 1 : -1);
    const toHead = this.head(to, facing);
    if (fromHead && !reducedMotion.matches) {
      this.fx.streak(fromHead.x, fromHead.y, toHead.x, toHead.y);
      await sleep(60);
    }
    this.pos = { ...to };
    this.facing = facing;
    this.setStance(stance, { perch, peekSide, dir });
    this.place();

    if (reducedMotion.matches) {
      p.collapse = 0;
      p.dissolve = 0;
      await tween(p, { alpha: this.mode === 'sleep' ? 0.55 : 1 }, 160, ease.linear);
      return;
    }
    const ground = stance === 'sit' ? to.y - (SPRITE.feet.y - SPRITE.hip) * s : to.y;
    if (beam) this.fx.beam(to.x, ground, { down: true, width: 40 * s + 8 });
    // her pieces spiral back in, mane shards and green eye-stars
    this.fx.vortex(toHead.x, toHead.y + 30 * s, { radius: 170 * s + 40 });
    this.voice.play('teleport-in');
    await sleep(50);

    p.alpha = this.mode === 'sleep' ? 0.55 : 1;
    p.glitchSeed = Math.random() * 100;
    await tween(p, { collapse: 0, dissolve: 0, glitch: 0.6, split: 6 }, 200, ease.out);

    // two impact frames, the anime way
    p.sil = GREEN;
    p.silAmount = 1;
    this.drawFrame();
    await sleep(ON_ONES);
    p.sil = INK;
    this.drawFrame();
    await sleep(ON_ONES);
    p.silAmount = 0;
    this.fx.burst(toHead.x, toHead.y + 60 * s, { count: 10, power: 0.55, spread: 110 * s });
    if (stance === 'sit') this.perform('plop');
    await tween(p, { glitch: 0, split: 0 }, 220, ease.out);
  }

  // Leave in a column of light, reappear somewhere else.
  async teleport(to, opts = {}) {
    if (this.stowed) return; // put away: she stays in her biochip
    if (this.busy || this.dormant) {
      this.pending = { to, opts };
      if (this.dormant) this.rouse(); // asleep, down to her mask: she comes back first, then goes
      return;
    }
    this.busy = true;
    this.wake();
    this.onTeleport?.('start');
    const fromHead = await this.vanish();
    await sleep(70);
    await this.arrive(to, { ...opts, fromHead });
    await this.settle();
  }

  // After a move: free again, stay put a while, the panel back, and the move that was waiting, if any.
  async settle() {
    this.busy = false;
    this.nextMove = Math.max(this.nextMove, performance.now() + rand(25000, 60000));
    this.onTeleport?.('end');
    if (this.pending) {
      const next = this.pending;
      this.pending = null;
      await this.teleport(next.to, next.opts);
    }
  }

  // Ctrl+Alt+C: she folds herself into her biochip in the corner (she pulls in, collapses, and
  // a streak runs from her to the chip). Asleep down to her mask, it's the mask that goes.
  async stow() {
    if (this.stowed || this.stowing) return;
    this.stowing = true;
    for (let i = 0; this.busy && i < 30; i++) await sleep(100); // let a move finish
    this.busy = true;
    this.endAct(false);
    this.onTeleport?.('start');
    let from = null;
    if (this.dormant) {
      from = this.head();
      this.dormant = false;
      this.onDoze?.('end');
    }
    if (reducedMotion.matches) {
      await tween(this.p, { alpha: 0 }, 160, ease.linear);
    } else {
      if (!from) {
        await this.perform('fold');
        from = await this.vanish({ beam: false });
      }
      const chip = this.chipAt();
      this.fx.streak(from.x, from.y, chip.x, chip.y);
      await sleep(60);
      this.fx.burst(chip.x, chip.y, { count: 12, inward: true, power: 0.45, spread: 40 });
      this.fx.ring(chip.x, chip.y, { size: 0.3 });
      this.voice.play('land');
    }
    this.setStance('stand');
    this.stowed = true;
    this.stowing = false;
    this.hidden = true;
    this.root.hidden = true;
    this.onStow?.();
    this.busy = false;
    if (this.unstowAfter) this.unstow(); // called back out while she was folding herself away
  }

  // Already in it, no show (put away last time, she starts in it).
  stowNow() {
    this.stowed = true;
    this.hidden = true;
    this.root.hidden = true;
    this.p.alpha = 0;
    this.onTeleport?.('start');
    this.onStow?.();
  }

  // Asleep a while: her mane and her body come apart (shards drifting down, the drawing
  // dissolving) and all that's left is her mask, floating there, eyes shut (chip.js Mask).
  async doze() {
    if (this.busy || this.dormant || this.stowed || this.hidden) return;
    this.busy = true;
    this.endAct(false);
    this.onTeleport?.('start');
    this.dozedOn = this.stance === 'sit' ? { ...this.perch } : null;
    const s = this.scale;
    const h = this.head();
    if (!reducedMotion.matches) {
      for (let i = 0; i < 10; i++) this.shed();
      this.fx.burst(h.x, h.y + 60 * s, { count: 10, power: 0.3, spread: 120 * s });
      this.p.glitchSeed = Math.random() * 100;
      await tween(this.p, { dissolve: 0.9, glitch: 0.25, sparkle: 0 }, 700, ease.in);
    }
    this.setStance('stand'); // no ledge to fall off while she's away
    Object.assign(this.p, { alpha: 0, dissolve: 0, glitch: 0 });
    this.hidden = true;
    this.root.hidden = true;
    this.dormant = true;
    this.onDoze?.('start', h);
    this.busy = false;
  }

  // Back from her mask: her eyes snap open, then she comes back together around it,
  // on her ledge again if it's still there.
  async rouse() {
    if (!this.dormant) return;
    this.dormant = false;
    this.busy = true;
    this.onDoze?.('waking');
    if (this.mode === 'sleep') this.setMode('idle');
    this.lastActivity = performance.now();
    await sleep(reducedMotion.matches ? 0 : 280);
    this.onDoze?.('end');
    this.hidden = false;
    this.root.hidden = false;
    Object.assign(this.p, { alpha: 0, collapse: 0.6, dissolve: 0.5, glitch: 0, split: 0, sparkle: 1 });
    const win = this.dozedOn && this.perchWin(this.dozedOn.id);
    if (win && this.canSit(win) && !this.covered(win, win.x + this.dozedOn.dx)) {
      await this.arrive(this.seat(win, this.dozedOn.dx), { face: this.facing, stance: 'sit', perch: this.dozedOn, beam: false });
    } else {
      await this.arrive({ x: this.pos.x, y: this.dozedOn ? this.floor : this.pos.y }, { face: this.facing, beam: false });
    }
    this.dozedOn = null;
    await this.settle();
  }

  // Out of her biochip: a streak from the chip, and she arrives next to it.
  async unstow() {
    this.unstowAfter = this.stowing;
    if (!this.stowed) return;
    this.stowed = false;
    this.busy = true;
    this.onUnstow?.();
    this.hidden = false;
    this.root.hidden = false;
    if (this.mode === 'sleep') this.setMode('idle');
    this.lastActivity = performance.now();
    Object.assign(this.p, { alpha: 0, collapse: 1, dissolve: 0.5, glitch: 0, split: 0 });
    const chip = this.chipAt();
    const to = this.spot('chip');
    const face = to.x > this.view.w / 2 ? 1 : -1;
    if (!reducedMotion.matches) {
      const toHead = this.head(to, face);
      this.fx.burst(chip.x, chip.y, { count: 10, power: 0.5, spread: 30 });
      this.fx.streak(chip.x, chip.y, toHead.x, toHead.y);
      await sleep(60);
    }
    await this.arrive(to, { face, beam: false });
    await this.settle();
  }

  sitOn({ win, dx }) {
    return this.teleport(this.seat(win, dx), { stance: 'sit', perch: { id: win.id, dx }, face: this.facing });
  }

  canPossess() {
    return this.possessWindows && !this.busy && !this.hidden && this.stance === 'sit' && !reducedMotion.matches
      && this.windows.wins.some((w) => w.id === this.perch?.id);
  }

  // The windows in front of window `id` (nothing of hers is drawn over those).
  coversOf(id) {
    const front = [];
    for (const o of this.windows.wins) {
      if (o.id === id) break;
      front.push(o);
    }
    return front;
  }

  // Like in the show, she gets into things: she dives into the window she sits on and takes it
  // over (fx.possess: its frame crackles, it glitches, it looks at you with her eyes), then comes
  // out of another window, or further along this one if there's no other. Jealous (`angry`), it
  // glares at you, with `say` written across it.
  async possess({ say = '', angry = false } = {}) {
    if (!this.canPossess()) return false;
    const s = this.scale;
    const id = this.perch.id;
    const win = this.windows.wins.find((w) => w.id === id);
    const entry = this.pos.x - win.x;
    this.busy = true;
    this.wake();
    this.onTeleport?.('start');
    await this.perform('dive');
    const head = await this.vanish({ beam: false });
    this.fx.streak(head.x, head.y, this.pos.x, win.y + 40 * s);

    const rect = () => this.windows.wins.find((w) => w.id === id) || null;
    const covers = () => this.coversOf(id);
    const taken = this.fx.possess(rect, { covers, entry, look: () => this.mouse, say, angry });
    this.voice.play('bolt');
    await sleep(300);
    this.voice.play(angry ? 'jealous' : 'possess');
    await sleep(say ? 2600 : 1600); // a line written across it: time to read it
    taken.leave();
    await sleep(260);

    const here = rect();
    let seat = this.pickSeat({ except: id });
    if (!seat && here && this.canSit(here)) {
      const dx = clamp(here.w - entry + rand(-60, 60), 60, Math.max(60, here.w - 190)); // the other end of it
      if (!this.covered(here, here.x + dx)) seat = { win: here, dx };
    }
    const to = seat ? this.seat(seat.win, seat.dx) : this.spot('random');
    const toHead = this.head(to);
    if (here) {
      // out through the system, from the middle of the window to where she comes out
      this.fx.streak(here.x + here.w / 2, here.y + here.h * 0.46, toHead.x, toHead.y);
      await sleep(60);
    }
    if (seat) this.fx.slit(to.x, toHead.top, seat.win.y, { width: 56 * s + 10 }); // the void she climbs out of
    await this.arrive(to, seat ? { stance: 'sit', perch: { id: seat.win.id, dx: seat.dx }, beam: false } : {});
    await this.settle();
    return true;
  }

  // Lean in from an edge of the screen: vanish, then slide in on twos, three drawings.
  async peek(side = pick(['left', 'right', 'top'])) {
    if (this.busy) return;
    const s = this.scale;
    const { w, h } = this.view;
    let at, from, facing, dir;
    if (side === 'left') {
      const y = rand(h * 0.55, this.floor);
      facing = -1;
      dir = 1;
      at = { x: 14 * s, y };
      from = { x: -170 * s, y };
    } else if (side === 'right') {
      const y = rand(h * 0.55, this.floor);
      facing = 1;
      dir = -1;
      at = { x: w - 14 * s, y };
      from = { x: w + 170 * s, y };
    } else {
      // hanging upside down from the top edge, only the head and the mane showing
      const x = rand(w * 0.2, w * 0.8);
      facing = pick([1, -1]);
      dir = x > w / 2 ? -1 : 1;
      at = { x, y: -226 * s };
      from = { x, y: -470 * s };
    }

    this.busy = true;
    this.wake();
    this.onTeleport?.('start');
    if (this.p.alpha > 0) await this.vanish();
    this.pos = { ...from };
    this.facing = facing;
    this.setStance('peek', { peekSide: side, dir });
    this.p.collapse = 0;
    this.p.dissolve = 0;
    this.p.glitch = 0;
    this.p.split = 0;
    this.p.alpha = this.mode === 'sleep' ? 0.55 : 1;
    if (reducedMotion.matches) {
      this.pos = at;
    } else {
      for (const k of [0.45, 0.8, 1]) {
        this.pos = { x: lerp(from.x, at.x, k), y: lerp(from.y, at.y, k) };
        this.drawFrame();
        await sleep(ON_TWOS);
      }
    }
    this.peekFrom = from;
    this.peekUntil = performance.now() + rand(15000, 40000);
    this.busy = false;
    this.onTeleport?.('end');
  }

  // Duck back out of view, then show up somewhere else (or peek from another edge, if shy).
  async unpeek({ shy = false } = {}) {
    if (this.busy || this.stance !== 'peek') return;
    this.busy = true;
    const at = { ...this.pos };
    const from = this.peekFrom || at;
    if (!reducedMotion.matches) {
      for (const k of [0.4, 0.8, 1]) {
        this.pos = { x: lerp(at.x, from.x, k), y: lerp(at.y, from.y, k) };
        this.drawFrame();
        await sleep(ON_TWOS);
      }
    }
    this.p.alpha = 0;
    this.p.collapse = 1;
    this.p.dissolve = 0.5;
    this.busy = false;
    const side = this.peekSide;
    this.setStance('stand');
    if (shy && Math.random() < 0.6) {
      this.peek(pick(['left', 'right', 'top'].filter((x) => x !== side)));
      return;
    }
    this.busy = true;
    this.onTeleport?.('start');
    const seat = this.wander ? this.pickSeat() : null;
    if (seat && Math.random() < 0.4) {
      await this.arrive(this.seat(seat.win, seat.dx), { stance: 'sit', perch: { id: seat.win.id, dx: seat.dx } });
    } else {
      await this.arrive(this.spot('random'));
    }
    this.busy = false;
    this.onTeleport?.('end');
  }

  // Where she'd end up falling straight down from here: a free ledge under her, or the floor.
  landing() {
    const hip = this.pos.y - (SPRITE.feet.y - SPRITE.hip) * this.scale;
    let best = null;
    for (const win of this.windows.wins) {
      if (!this.canSit(win) || win.y < hip - 4) continue;
      if (this.pos.x < win.x + 40 || this.pos.x > win.x + win.w - 40) continue;
      if (this.covered(win, this.pos.x)) continue;
      if (!best || win.y < best.y) best = win;
    }
    if (best) {
      const dx = this.pos.x - best.x;
      return { y: this.seat(best, dx).y, stance: 'sit', perch: { id: best.id, dx } };
    }
    return { y: this.floor, stance: 'stand', perch: null };
  }

  fall() {
    if (this.stance === 'fall') return;
    if (this.sky) this.endAct(false);
    this.landingSpot = this.landing();
    this.setStance('fall');
    this.vy = 0;
    this.lastFall = performance.now();
    if (reducedMotion.matches) this.updateFall(this.lastFall + 10000);
  }

  updateFall(now) {
    const target = this.landingSpot;
    const dt = Math.min(0.05, (now - this.lastFall) / 1000);
    this.lastFall = now;
    this.vy = Math.min(this.vy + GRAVITY * dt, 1900);
    const y = reducedMotion.matches ? target.y : this.pos.y + this.vy * dt;
    if (y < target.y) {
      this.pos.y = y;
      return;
    }
    this.pos.y = target.y;
    this.setStance(target.stance, { perch: target.perch });
    const s = this.scale;
    if (target.stance === 'sit') {
      this.perform('plop');
    } else {
      this.perform('land');
      this.fx.burst(this.pos.x, this.pos.y - 20 * s, { count: 12, power: 0.6, spread: 60 * s });
    }
    this.voice.play('land');
    const p = this.p;
    p.glitchSeed = Math.random() * 100;
    p.glitch = 0.3;
    setTimeout(() => { p.glitch = 0; }, ON_ONES * 3);
  }

  // First appearance: drop in from the top of the screen.
  async materialize(at) {
    const p = this.p;
    this.pos = { ...at };
    this.faceCenter();
    this.setStance('stand');
    if (reducedMotion.matches) {
      p.alpha = 0;
      this.place();
      await tween(p, { alpha: 1 }, 300, ease.linear);
      return;
    }
    this.busy = true;
    p.alpha = 0;
    p.collapse = 1;
    p.dissolve = 0.5;
    this.place();
    await sleep(250);
    this.fx.beam(at.x, at.y, { down: true, width: 40 * this.scale + 8, life: 260 });
    this.voice.play('teleport-in');
    await sleep(80);
    p.alpha = 1;
    await tween(p, { collapse: 0, dissolve: 0, glitch: 0.5, split: 5 }, 240, ease.out);
    await tween(p, { glitch: 0, split: 0 }, 260, ease.out);
    this.busy = false;
  }

  // Her intro, when she starts: she grabs your screen by its edges, huge, says hi, then her hands
  // slip and she dives down to where she stands, and her body unfolds from her face (fx.intro).
  // `still`: no motion, it comes and goes where it is (Windows' animations off).
  async intro(at, { label = 'hi', caption = 'PROJECT CAPRICORN', still = reducedMotion.matches } = {}) {
    const p = this.p;
    this.pos = { ...at };
    this.faceCenter();
    this.setStance('stand');
    this.busy = true;
    this.onTeleport?.('start'); // the panel waits for her
    p.alpha = 0;
    p.collapse = 1;
    p.dissolve = 0.5;
    this.place();
    const head = this.head(at, this.facing);
    await this.fx.intro({
      to: { x: head.x, y: head.y, size: 100 * this.scale },
      label,
      caption,
      still,
      onCue: (cue) => {
        if (cue === 'open') this.voice.play('charge'); // the edges of the screen crackling
        else if (cue === 'hand') this.voice.play('land'); // a hand on the edge
        else if (cue === 'wave') this.voice.play('rise'); // a hand off it, to wave
        else if (cue === 'grab') {
          this.voice.play('land'); // she slams into it
          this.voice.play('bolt');
        } else if (cue === 'hi') this.voice.play('hello');
        else if (cue === 'slip') this.voice.play('teleport-out');
      },
    });
    await this.arrive(at, { face: this.facing, beam: false });
    this.busy = false;
    this.onTeleport?.('end');
  }

  // ---------- showing you things ----------

  // The point of `rect` (overlay coordinates) she aims at from where she is: its closest point,
  // a little inside. Off her screen (the tray, down in the taskbar), the edge of her screen.
  aimPoint(rect) {
    const { w, h } = this.view;
    const sh = this.limb(this.armToward(rect.x + rect.w / 2 < this.pos.x ? -1 : 1)).shoulder;
    const inset = Math.min(24, rect.w / 3, rect.h / 3);
    return {
      x: clamp(clamp(sh.x, rect.x + inset, rect.x + rect.w - inset), 6, w - 6),
      y: clamp(clamp(sh.y, rect.y + inset, rect.y + rect.h - inset), 6, h - 4),
    };
  }

  // Where to stand to point at `rect`: beside it, on the side with more room, her shoulder a bit
  // below its middle (on the floor for things low on the screen).
  spotNear(rect) {
    const s = this.scale;
    const { w, h } = this.view;
    const side = 150 * s + 30;
    const reach = 230 * s + 90; // from her feet to what she points at: room for the arm to shoot out
    const roomLeft = rect.x, roomRight = w - (rect.x + rect.w);
    let x;
    if (Math.max(roomLeft, roomRight) >= side + 40) {
      x = roomRight >= roomLeft ? rect.x + rect.w + reach : rect.x - reach;
    } else {
      x = rect.x + rect.w / 2 < w / 2 ? w - side : side; // nowhere beside it: the far side of the screen
    }
    x = clamp(x, side, w - side);
    const cy = clamp(rect.y + rect.h / 2, 0, h);
    const shoulderToFeet = (SPRITE.feet.y - SPRITE.shoulder.y) * s;
    const y = cy > h * 0.6 ? this.floor : clamp(cy + shoulderToFeet + 50, SPRITE.height * s + 40, this.floor);
    return { x, y, face: rect.x + rect.w / 2 < x ? 1 : -1 };
  }

  // Go and point at `rect`, and keep pointing (a dashed line from her finger, brackets, `label`)
  // until stopPointing(). Resolves once she's there with her arm out.
  async pointAt(rect, { label = '' } = {}) {
    if (this.stowed) return false;
    this.stopPointing();
    const spot = this.spotNear(rect);
    if (this.stance !== 'stand' || Math.hypot(spot.x - this.pos.x, spot.y - this.pos.y) > 140) {
      await this.teleport({ x: spot.x, y: spot.y }, { face: spot.face });
    }
    if (this.stowed || this.hidden) return false;
    const aim = this.aimPoint(rect);
    const dir = aim.x < this.pos.x ? -1 : 1;
    const side = this.armToward(dir);
    // how far up the arm comes to point at it (it hangs ~30 degrees low at rest)
    const reach = () => {
      const sh = this.limb(side).shoulder;
      return clamp(Math.atan2(sh.y - aim.y, Math.abs(aim.x - sh.x)) + 0.52, -0.6, 1.7);
    };
    this.pointing = { rect, aim, dir, side, reach, label, pointer: null };
    this.base = this.restBase();
    await this.perform('point', dir, { reach });
    if (this.pointing && !this.pointing.pointer) this.onCue('lock'); // the act was cut short
    return true;
  }

  // Done showing: the line reels back into her finger, the reticle lets go, the arm snaps back.
  stopPointing() {
    const pt = this.pointing;
    if (!pt) return;
    this.pointing = null;
    pt.pointer?.retract();
    this.base = this.restBase();
    if (!this.busy && !this.hidden && this.stance === 'stand') this.perform('unpoint', pt.dir);
  }

  // Can she point at this window so you'd see it: not maximized, its top not under other windows.
  canPoint(win) {
    return Boolean(win && !win.max && win.w > 120 && win.y > -10 && !this.covered(win, win.x + win.w / 2));
  }

  // Where to stand next to the mouse pointer.
  summonSpot(cursor) {
    const { w } = this.view;
    const s = this.scale;
    const side = 150 * s + 30;
    const dx = cursor.x > w / 2 ? -260 : 260;
    return {
      x: clamp(cursor.x + dx, side, w - side),
      y: clamp(cursor.y + SPRITE.height * s * 0.45, SPRITE.height * s + 120, this.floor),
    };
  }

  // Show up next to the mouse pointer (used when Claude needs you).
  async summon(cursor) {
    const to = this.summonSpot(cursor);
    if (this.stance === 'stand' && Math.hypot(to.x - this.pos.x, to.y - this.pos.y) < 160) {
      this.facing = cursor.x < this.pos.x ? 1 : -1;
      return;
    }
    await this.teleport(to, { face: cursor.x < to.x ? 1 : -1 });
  }

  // Next to the pointer wherever it is: on her screen, or on another one (she goes over to it
  // first). Resolves with the pointer as seen from where she ends up, or null.
  async toPointer(cursor) {
    if (!cursor) return null;
    if (cursor.inside) {
      await this.summon(cursor);
      return cursor;
    }
    if (cursor.display == null || !this.onScreenOf) return null;
    return this.onScreenOf(cursor);
  }

  setHidden(hidden) {
    this.hidden = hidden;
    this.root.hidden = hidden;
  }

  // ---------- pointer ----------

  bindPointer() {
    let down = null;
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.hit(e.clientX, e.clientY)) this.onMenu?.(); // right-click: her menu
    });
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !this.hit(e.clientX, e.clientY)) return;
      // thrown: you can catch her on the fly, or pick her up off the floor
      const thrown = this.stance === 'fly' || this.stance === 'down';
      if (this.busy && !thrown) return;
      if (!thrown && performance.now() < this.refuseUntil) {
        this.dodge(); // thrown around once too often: not again
        return;
      }
      down = { x: e.clientX, y: e.clientY, pos: { ...this.pos }, at: this.spritePoint(e.clientX, e.clientY) };
      this.track = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      if (thrown) this.pickUp(down);
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse = { x: e.clientX, y: e.clientY }; // a window she's in watches it
      if (down) {
        const now = performance.now();
        this.track.push({ x: e.clientX, y: e.clientY, t: now });
        while (this.track.length > 2 && now - this.track[0].t > 160) this.track.shift();
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!this.dragging && Math.hypot(dx, dy) > 5 && !this.busy) this.pickUp(down);
        if (this.dragging) {
          this.pos = {
            x: clamp(down.pos.x + dx, 40, this.view.w - 40),
            y: clamp(down.pos.y + dy, SPRITE.height * this.scale * 0.5, this.floor),
          };
          this.p.glitchSeed = Math.random() * 100;
          this.place();
        }
        return;
      }
      this.notice(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => {
      if (!down) return;
      const wasDragging = this.dragging;
      down = null;
      this.dragging = false;
      if (!wasDragging) {
        this.onClick?.();
        return;
      }
      tween(this.p, { glitch: 0, split: 0 }, 200, ease.out);
      // let go while the pointer was still moving fast: she flies off with it
      const v = this.pointerSpeed();
      if (Math.hypot(v.x, v.y) >= THROW_MIN && !reducedMotion.matches) {
        this.throwHer(v.x, v.y); // the panel stays away until she's back to herself
        return;
      }
      this.setStance('stand'); // upright again, under where you held her
      this.onTeleport?.('end');
      this.drop();
    });
  }

  // How fast the pointer holding her was going just now (px/s): none if it had stopped.
  pointerSpeed() {
    const now = performance.now();
    const pts = this.track.filter((p) => now - p.t < 80);
    if (pts.length < 2 || now - pts.at(-1).t > 60) return { x: 0, y: 0 };
    const a = pts[0], b = pts.at(-1);
    const dt = Math.max(0.012, (b.t - a.t) / 1000);
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
  }

  // Picked up, or caught in the air: she hangs from the point you hold her by, turned as she was.
  pickUp(down) {
    const was = this.stance;
    const spin = SPUN.has(was) ? norm(this.spin) : 0;
    this.throwId += 1; // whatever was going on after a throw is over
    this.flight = null;
    this.skid = null;
    this.squash = null;
    this.override = null;
    this.busy = false;
    this.dragging = true;
    if (this.upside) down.at = { x: SPRITE.head.x, y: SPRITE.head.y }; // hanging from the top: upright again, by the head
    this.endAct(false);
    const at = { x: clamp(down.at.x, 24, SPRITE.width - 24), y: clamp(down.at.y, 24, SPRITE.height - 24) };
    this.held = { at, w: 0, last: performance.now() };
    this.setStance('held');
    this.spin = spin;
    // the point you hold stays right under the pointer, whatever she does around it
    const s = this.scale;
    this.pos = { x: down.x - (at.x - SPRITE.feet.x) * s * this.facing, y: down.y - (at.y - SPRITE.feet.y) * s };
    down.pos = { ...this.pos };
    this.perform('grabbed');
    this.p.glitchSeed = Math.random() * 100;
    this.p.glitch = 0.18;
    this.p.split = 2;
    this.onTeleport?.('start');
    this.voice.play('tick');
    this.place();
  }

  // Held: moving the pointer swings her the other way, like something hanging from it, and she
  // swings back and forth a little once it stops. A spring, in degrees.
  swing(now) {
    const h = this.held;
    if (!h) return;
    const dt = Math.min(0.05, (now - h.last) / 1000);
    h.last = now;
    const v = this.pointerSpeed();
    const target = clamp(v.x * 0.014, -40, 40);
    h.w += ((target - this.spin) * 95 - h.w * 8.5) * dt;
    this.spin += h.w * dt;
  }

  // Held: her mane trailing the way the pointer drags her, a smear when it goes fast.
  heldPose(pose) {
    const v = this.pointerSpeed();
    const speed = Math.hypot(v.x, v.y);
    if (speed < 80) return;
    const [ux, uy] = this.inFrame(v.x / speed, v.y / speed);
    const k = Math.min(1, speed / 2200);
    pose.hair = clamp(-ux * 7 * k, -7, 7);
    pose.mane += 0.25 * k;
    if (k > 0.35) pose.smear = [-ux * 20 * k, -uy * 20 * k];
  }

  // A direction on screen in the frame of her drawing (turned and mirrored like it).
  inFrame(x, y) {
    const a = -this.spin * DEG;
    return [(x * Math.cos(a) - y * Math.sin(a)) * this.facing, x * Math.sin(a) + y * Math.cos(a)];
  }

  // ---------- thrown ----------

  // Let go of her while the pointer was moving: she flies off with its speed (px/s), tumbling.
  // For the first two drawings she's one long streak along the throw, head first (or feet first,
  // held by the legs), then she spins. She bounces off the edges of the screen (or goes through to
  // the next screen, if there's one there), catches a window ledge if she comes down on it slowly
  // enough or bounces off it, lands on her feet if she comes down upright, or crashes, slides along
  // the floor and lies there a moment, seeing stars, before she gets back up and shakes it off.
  // onThrown tells app.js how it went, for what she says about it.
  throwHer(vx, vy) {
    if (reducedMotion.matches || this.stowed || this.dormant) {
      this.setStance('stand');
      this.onTeleport?.('end');
      this.drop();
      return;
    }
    const s = this.scale;
    const speed = Math.hypot(vx, vy);
    if (speed > THROW_MAX) {
      vx *= THROW_MAX / speed;
      vy *= THROW_MAX / speed;
    }
    // where her middle is right now (held, she turns on where you held her)
    const c = this.screenPoint(MID.x, MID.y);
    const feetFirst = this.held && this.held.at.y > MID.y;
    this.throwId += 1;
    this.busy = true;
    this.setStance('fly');
    // her body along the throw, for the streak
    const along = Math.atan2(vx, -vy) / DEG + (feetFirst ? 180 : 0);
    // the faster sideways, the faster she spins; thrown straight up or down she spins anyway
    const w = clamp(vx * 0.32, -900, 900) + rand(-80, 80) + (Math.abs(vx) < 300 ? pick([-1, 1]) * rand(220, 420) : 0);
    this.flight = {
      kind: 'throw', id: this.throwId, c, v: { x: vx, y: vy }, a: along, w,
      last: performance.now(), freezeUntil: 0, release: 2, frame: 0, phase: 'air', lie: 0, hits: 0, hard: 0,
    };
    this.spin = along;
    this.setMid(c);
    this.voice.play('throw', { power: Math.min(1, Math.hypot(vx, vy) / THROW_MAX) });
    this.fx.burst(c.x, c.y, { count: 8, power: 0.45, spread: 50 * s });
    this.p.glitchSeed = Math.random() * 100;
    this.p.glitch = 0.22;
    this.p.split = 3;
    tween(this.p, { glitch: 0, split: 0 }, 260, ease.out);
    this.place();
  }

  // Flying: her trail and her mane follow where she's going, in her own (turned, mirrored) frame.
  flyPose(pose) {
    const f = this.flight;
    if (!f) return;
    const speed = Math.hypot(f.v.x, f.v.y);
    if (speed < 1) return;
    const [ux, uy] = this.inFrame(f.v.x / speed, f.v.y / speed);
    const k = Math.min(1, speed / 2400);
    pose.hair = clamp(-ux * 9 * k, -8, 8);
    pose.mane = Math.max(pose.mane, 0.28 + 0.4 * k);
    pose.smear = [-ux * 24 * k, -uy * 24 * k];
    pose.echo = f.kind === 'throw' && k > 0.5 ? [ux * 12 * k, uy * 12 * k] : [0, 0];
    if (f.release > 0) {
      // the drawings right as she leaves: one long streak, her other minds pulled out along it
      Object.assign(pose, { sy: 1.32, sx: 0.76, mane: 0.7, smear: [-ux * 34, -uy * 34], echo: [ux * 16, uy * 16] });
    }
  }

  // One drawing of her flight: gravity, a little air, her spin; then whatever she runs into.
  updateFly(now) {
    const f = this.flight;
    if (!f || f.crossing) return;
    const dt = Math.min(0.05, Math.max(0.001, (now - f.last) / 1000));
    f.last = now;
    if (now < f.freezeUntil) {
      this.place(); // the hit stop: stuck to what she hit for a few drawings
      return;
    }
    f.frame += 1;
    if (f.release > 0) f.release -= 1;
    const { w } = this.view;
    const ground = this.view.floor - 2;
    const before = this.reachAt(f.a);
    const prev = { ...f.c };
    if (f.phase === 'air') {
      f.v.y += (f.kind === 'leap' ? LEAP_GRAVITY : THROW_GRAVITY) * dt;
      f.v.x *= Math.pow(0.8, dt);
      f.a += f.w * dt;
      f.c.x += f.v.x * dt;
      f.c.y += f.v.y * dt;
    } else {
      // down on the floor: sliding on her side, slowing down, settling flat
      f.a += clamp(f.lie - f.a, -540 * dt, 540 * dt);
      const brake = 2800 * dt;
      f.v.x = Math.abs(f.v.x) <= brake ? 0 : f.v.x - Math.sign(f.v.x) * brake;
      f.c.x += f.v.x * dt;
    }
    const r = this.reachAt(f.a);

    // the sides of the screen: through to the next screen if there's one there, else she hits them
    for (const side of [-1, 1]) {
      const out = side < 0 ? f.c.x + r.minX < 0 : f.c.x + r.maxX > w;
      if (!out || Math.sign(f.v.x) !== side) continue;
      if (f.phase === 'air' && this.canCross?.(side, f.c.y)) {
        if (side < 0 ? f.c.x + r.maxX < -6 : f.c.x + r.minX > w + 6) {
          this.crossOver(side);
          return;
        }
        continue;
      }
      f.c.x = side < 0 ? -r.minX : w - r.maxX;
      this.impact({ x: -side, y: 0 }, Math.abs(f.v.x), { x: side < 0 ? 0 : w, y: f.c.y });
      f.v.x = -f.v.x * 0.42;
      f.v.y *= 0.85;
      f.w = -f.w * 0.55 + rand(-90, 90);
    }

    if (f.phase === 'air') {
      // the top of the screen
      if (f.c.y + r.minY < 0 && f.v.y < 0) {
        f.c.y = -r.minY;
        this.impact({ x: 0, y: 1 }, -f.v.y, { x: f.c.x, y: 0 });
        f.v.y = -f.v.y * 0.35;
        f.w *= 0.7;
      }
      // the top edge of a window, on her way down
      if (f.v.y > 0) {
        const win = this.ledgeUnder(prev.y + before.maxY, f.c.y + r.maxY, f.c.x);
        if (win && this.onLedge(f, win, r)) return;
      }
      if (f.c.y + r.maxY >= ground) {
        f.c.y = ground - r.maxY;
        if (this.onFloor(f, r)) return;
      }
      // her trail: shards of her mane left hanging in the air behind her
      if (f.frame % 3 === 0 && Math.hypot(f.v.x, f.v.y) > 900) {
        const h = this.screenPoint(SPRITE.head.x, SPRITE.head.y - 30);
        this.fx.drift(h.x, h.y, Math.atan2(-f.v.y, -f.v.x) + rand(-0.5, 0.5));
      }
    } else {
      f.c.y = ground - r.maxY;
      if (Math.abs(f.v.x) > 140 && f.frame % 2 === 0) this.fx.sparks(f.c.x + r.low, ground, -Math.sign(f.v.x));
      if (!f.v.x && Math.abs(f.lie - f.a) < 0.5) {
        this.knockedDown();
        return;
      }
    }
    this.spin = f.a;
    this.setMid(f.c);
    this.place();
  }

  // She hits something at `speed` px/s, at screen point `at`, `n` pointing away from what she hit:
  // the harder, the longer she sticks to it (the hit stop), the flatter she gets against it, the
  // bigger the shockwave and the cracks it leaves. A window she hits shakes under her.
  impact(n, speed, at, win = null) {
    const f = this.flight;
    const s = this.scale;
    const hard = clamp((speed - 250) / 2300, 0, 1);
    const now = performance.now();
    f.hits += 1;
    f.hard = Math.max(f.hard, hard);
    const hold = Math.round(lerp(1, 4, hard)); // drawings she stays stuck to it
    if (hard > 0.12) f.freezeUntil = now + hold * ON_ONES;
    const mid = this.flat(MID.x, MID.y);
    this.squash = { n, k: lerp(0.84, 0.56, hard), t: now, hold, rel: { x: at.x - mid.x, y: at.y - mid.y } };
    this.voice.play('crash', { power: hard });
    this.fx.ring(at.x, at.y, { size: lerp(0.18, 0.7, hard) });
    this.fx.burst(at.x, at.y, { count: Math.round(lerp(5, 20, hard)), power: lerp(0.3, 0.95, hard), spread: 30 });
    const rect = win ? () => this.windows.wins.find((o) => o.id === win.id) || null : null;
    const covers = win ? () => this.coversOf(win.id) : null;
    if (hard > 0.22) this.fx.crack(at, n, { size: lerp(50, 180, hard), rect, covers });
    if (win) this.fx.jolt(rect, { covers, power: Math.max(0.3, hard) });
    if (hard > 0.62) this.fx.lines(mid.x, mid.y, { inner: 110 * s + 50, life: 360 });
    if (hard > 0.3) this.flash(hard > 0.65 ? [INK, RED] : [INK]);
    const p = this.p;
    p.glitchSeed = Math.random() * 100;
    p.glitch = 0.2 + hard * 0.45;
    p.split = 2 + hard * 6;
    tween(p, { glitch: 0, split: 0 }, 300, ease.out);
  }

  // Flattened against what she just hit, on screen (whichever way she's turned), around where she
  // hit it: held while the hit stop lasts, then back through an overshoot, a drawing each.
  squashNow() {
    const q = this.squash;
    if (!q) return null;
    const frame = Math.floor((performance.now() - q.t) / ON_ONES);
    const k = frame < q.hold ? q.k : [1 + (1 - q.k) * 0.5, 0.95, 1.02][frame - q.hold];
    if (k === undefined) {
      this.squash = null;
      return null;
    }
    const across = 1 + (1 - k) * 0.6;
    const mid = this.flat(MID.x, MID.y);
    const at = { x: mid.x + q.rel.x, y: mid.y + q.rel.y };
    return Math.abs(q.n.x) > Math.abs(q.n.y) ? { x: k, y: across, at } : { x: across, y: k, at };
  }

  // Coming down on the floor: on her feet if she's upright, a bounce if she comes down hard, else
  // she's down: she slides along it and settles on her side. True when she's done flying.
  onFloor(f, r) {
    const n = norm(f.a);
    const at = { x: f.c.x + r.low, y: this.view.floor - 2 };
    if (Math.abs(n) < 30) {
      this.landOnFeet(f);
      return true;
    }
    if (f.v.y > 420) {
      this.impact({ x: 0, y: -1 }, f.v.y, at);
      f.v.y = -f.v.y * 0.36;
      f.v.x *= 0.72;
      f.w = f.w * 0.5 - f.v.x * 0.12;
      return false;
    }
    f.phase = 'slide';
    f.v.y = 0;
    f.lie = f.a + ((n >= 0 ? 90 : -90) - n); // the nearest way to lie on her side, without spinning round
    this.voice.play('land');
    return false;
  }

  // The window ledge she's coming down onto this drawing (her lowest point went from fromY to toY), if any.
  ledgeUnder(fromY, toY, x) {
    for (const win of this.windows.wins) {
      if (!this.canSit(win) || fromY > win.y + 2 || toY < win.y) continue;
      if (x < win.x + 30 || x > win.x + win.w - 30 || this.covered(win, x)) continue;
      return win;
    }
    return null;
  }

  // Coming down on a window ledge: she catches it and sits there if she's about upright or slow
  // enough, else she bounces off it and it shakes. True when she's done flying.
  onLedge(f, win, r) {
    const n = norm(f.a);
    if (Math.abs(n) < 45 || f.v.y < 600) {
      this.catchLedge(f, win);
      return true;
    }
    f.c.y = win.y - r.maxY;
    this.impact({ x: 0, y: -1 }, f.v.y, { x: f.c.x + r.low, y: win.y }, win);
    f.v.y = -f.v.y * 0.38;
    f.v.x *= 0.8;
    f.w = f.w * 0.6 + rand(-120, 120);
    return false;
  }

  catchLedge(f, win) {
    const id = f.id;
    this.flight = null;
    const dx = clamp(f.c.x - win.x, 50, win.w - 60);
    this.pos = this.seat(win, dx);
    this.setStance('sit', { perch: { id: win.id, dx } });
    this.voice.play('land');
    this.fx.burst(this.pos.x, win.y, { count: 8, power: 0.4, spread: 40 });
    this.place();
    this.perform('plop').then(async () => {
      if (id !== this.throwId) return;
      await this.settle();
      this.onThrown?.({ how: 'ledge', hard: f.hard, hits: f.hits });
    });
  }

  // Down on her feet: the hard landing, sliding on along the floor if she was going sideways.
  landOnFeet(f) {
    const id = f.id;
    const s = this.scale;
    this.flight = null;
    this.setStance('stand');
    this.pos = { x: clamp(f.c.x - (MID.x - SPRITE.feet.x) * s * this.facing, 40, this.view.w - 40), y: this.floor };
    this.skid = Math.abs(f.v.x) > 150 ? { v: f.v.x * 0.8, last: performance.now() } : null;
    const hard = clamp((f.v.y - 250) / 2300, 0, 1);
    this.voice.play(hard > 0.3 ? 'crash' : 'land', { power: hard * 0.7 });
    this.fx.ring(this.pos.x, this.pos.y, { size: 0.25 + hard * 0.4 });
    this.fx.burst(this.pos.x, this.pos.y - 10 * s, { count: 10 + Math.round(hard * 10), power: 0.5 + hard * 0.5, spread: 70 * s });
    this.place();
    this.perform('touchdown').then(async () => {
      if (id !== this.throwId) return;
      this.skid = null;
      await this.settle();
      this.onThrown?.({ how: f.kind === 'leap' ? 'leap' : 'feet', hard: f.hard, hits: f.hits });
    });
  }

  // Sliding on along the floor on her feet after a landing, sparks under them.
  updateSkid(now) {
    const k = this.skid;
    const dt = Math.min(0.05, (now - k.last) / 1000);
    k.last = now;
    const brake = 3200 * dt;
    k.v = Math.abs(k.v) <= brake ? 0 : k.v - Math.sign(k.v) * brake;
    this.pos.x = clamp(this.pos.x + k.v * dt, 40, this.view.w - 40);
    if (Math.abs(k.v) > 120) this.fx.sparks(this.pos.x, this.view.floor - 2, -Math.sign(k.v), { count: 2 });
    if (!k.v) this.skid = null;
    this.place();
  }

  // Knocked down: on her side on the floor, seeing stars, until she gets back up (or you pick her
  // up). Just tossed onto it (nothing hit hard), she's back up in a moment, no stars.
  knockedDown() {
    const f = this.flight;
    const side = norm(f.a) >= 0 ? 1 : -1;
    const soft = f.hard < 0.15;
    this.flight = null;
    this.setStance('down');
    this.spin = side * 90;
    this.lying = { c: { ...f.c }, side };
    this.layDown();
    this.place();
    if (!soft) this.fx.dizzy(() => this.screenPoint(SPRITE.head.x, SPRITE.head.y - 20), { life: 2400 });
    this.koSequence(f.id, side, { hard: f.hard, hits: f.hits, soft });
  }

  // Lying there (or getting up): her middle just high enough for her outline to rest on the floor.
  layDown() {
    const r = this.reachAt(this.spin);
    const c = this.lying.c;
    c.y = this.view.floor - 2 - r.maxY;
    c.x = clamp(c.x, -r.minX, this.view.w - r.maxX);
    this.setMid(c);
  }

  async koSequence(id, side, outcome) {
    // a moment on the floor, a twitch now and then
    const until = performance.now() + (outcome.soft ? rand(400, 700) : rand(1500, 2100));
    while (performance.now() < until) {
      await sleep(ON_TWOS * 4);
      if (id !== this.throwId) return;
      if (Math.random() < 0.3) this.twitch();
    }
    // back up: she curls up a little further first, springs up past upright, lands on her feet
    const steps = [
      [3, 97, { mane: -0.28, armL: -0.45, armR: -0.4, kickL: 0.3, kickR: 0.3, sy: 0.93, sx: 1.05 }],
      [1, 62, { mane: 0.3, armL: 0.55, armR: 0.45, sy: 1.15, sx: 0.9, smear: [0, 16] }],
      [1, 28, { mane: 0.4, armL: 0.38, armR: 0.32, sy: 1.08, sx: 0.94, smear: [0, 10] }],
      [2, -8, { mane: 0.22, armL: 0.06, armR: 0.06, sy: 0.86, sx: 1.12 }],
      [2, 3, { mane: 0.14, sy: 1.03, sx: 0.98 }],
    ];
    this.voice.play('rise');
    for (const [hold, deg, pose] of steps) {
      this.spin = side * deg;
      this.override = pose;
      this.layDown();
      this.drawFrame();
      await sleep(hold * ON_ONES);
      if (id !== this.throwId) return;
    }
    this.override = null;
    this.setStance('stand');
    this.pos = { x: clamp(this.pos.x, 60, this.view.w - 60), y: this.floor };
    this.place();
    this.voice.play('land');
    await this.perform('shake');
    if (id !== this.throwId) return;
    await this.settle();
    this.onThrown?.({ how: 'ko', ...outcome });
  }

  // Thrown around once too often: she won't be picked up, and goes somewhere else instead.
  dodge() {
    if (this.busy) return;
    this.onDodge?.();
    this.teleport(this.spot('random'));
  }

  // ---------- other screens ----------

  // Through the edge of her screen to the next one (thrown, or jumping over): her window moves
  // there (onCross), and she comes in through the matching edge, going on the same way.
  async crossOver(side) {
    const f = this.flight;
    f.crossing = true;
    this.root.hidden = true; // past the edge: nothing of her left here while her window moves
    this.fx.clear();
    const there = this.onCross ? await this.onCross(side, { ...f.c }).catch(() => null) : null;
    if (this.flight !== f) return;
    this.root.hidden = this.hidden;
    const r = this.reachAt(f.a);
    f.crossing = false;
    f.last = performance.now();
    if (!there) {
      // nowhere to go after all: back in through the edge she left by
      f.c.x = side > 0 ? this.view.w - r.maxX : -r.minX;
      f.v.x = -f.v.x * 0.4;
      return;
    }
    // just outside the edge she comes in by, on the other screen
    f.c = { x: side > 0 ? -r.maxX - 4 : this.view.w - r.minX + 4, y: clamp(there.y, 80, this.view.floor - 80) };
    this.fx.rift(side > 0 ? 0 : this.view.w, f.c.y, { h: 260 * this.scale + 60, side });
    this.voice.play('teleport-in');
    this.setMid(f.c);
    this.place();
  }

  // Over to the screen next to this one, through their shared edge (`side`: -1 left, 1 right): she
  // turns to it, crouches, and jumps, leading with her arm. She goes through the edge like a throw
  // would (canCross / onCross), and lands on her feet over there.
  async leapTo(side) {
    if (this.busy || this.stowed || this.dormant || this.hidden || this.dragging || reducedMotion.matches) return false;
    if (this.stance !== 'stand' && this.stance !== 'sit') return false;
    this.busy = true;
    this.wake();
    this.onTeleport?.('start');
    this.stopPointing();
    this.endAct(false);
    this.facing = side > 0 ? -1 : 1;
    await this.perform('crouch', side);
    const s = this.scale;
    const c = this.flat(MID.x, MID.y);
    const dist = Math.max(80, side > 0 ? this.view.w - c.x : c.x) + 160 * s;
    const T = clamp(dist / 1700, 0.32, 0.85); // seconds to the edge
    const through = clamp(c.y - 140, 120, c.y); // she goes through it a bit higher than she leaves from
    this.throwId += 1;
    this.flight = {
      kind: 'leap', id: this.throwId, c, v: { x: (side * dist) / T, y: (through - c.y - 0.5 * LEAP_GRAVITY * T * T) / T },
      a: side * 10, w: 0, last: performance.now(), freezeUntil: 0, release: 1, frame: 0, phase: 'air', lie: 0, hits: 0, hard: 0,
    };
    this.setStance('fly', { dir: side });
    this.spin = side * 10;
    this.setMid(c);
    this.voice.play('rise');
    this.fx.burst(this.pos.x, this.pos.y, { count: 10, power: 0.5, spread: 50 * s });
    this.place();
    return true;
  }

  // To a screen that isn't right next to hers (or picked in her menu): she leaves in her column of
  // light, `go` moves her window (and resolves with the pointer, as seen from there), and she comes
  // down over there: next to the pointer if it's there, else in her corner.
  async jumpScreen(go, { toPointer = false } = {}) {
    if (this.stowed) {
      await go(); // put away: her biochip just goes along with her window
      return;
    }
    if (this.dormant) await this.rouse();
    for (let i = 0; (this.busy || this.dragging) && i < 40; i++) await sleep(100);
    this.busy = true;
    this.wake();
    this.onTeleport?.('start');
    await this.vanish();
    this.root.hidden = true;
    this.fx.clear();
    this.setStance('stand');
    const cursor = await go().catch(() => null);
    this.root.hidden = this.hidden;
    const near = toPointer && cursor?.inside;
    const to = near ? this.summonSpot(cursor) : this.spot('post');
    await this.arrive(to, { face: near ? (cursor.x < to.x ? 1 : -1) : null });
    await this.settle();
    return cursor;
  }

  // ---------- your PC (pc.js) ----------

  // Is she out and free to act, with nothing else going on?
  get free() {
    return !this.busy && !this.stowed && !this.dormant && !this.hidden && !this.dragging && !this.act
      && (this.stance === 'stand' || this.stance === 'sit');
  }

  // The battery running out: she sags and flickers, fading, then holds on.
  async drain() {
    if (!this.free) return false;
    this.perform('drained');
    if (reducedMotion.matches) return true;
    const p = this.p;
    for (const [alpha, ms] of [[0.45, 120], [1, 90], [0.3, 160], [0.85, 110], [0.5, 140], [1, 0]]) {
      p.alpha = alpha;
      p.glitchSeed = Math.random() * 100;
      p.glitch = alpha < 0.6 ? 0.25 : 0;
      await sleep(ms);
    }
    p.glitch = 0;
    return true;
  }

  // Plugged back in: the power rushes into her, her specks light up, a hop.
  recharge() {
    if (this.stowed || this.dormant || this.hidden) return;
    const h = this.head();
    if (!reducedMotion.matches) {
      this.fx.burst(h.x, h.y + 60 * this.scale, { count: 16, inward: true, power: 0.6, spread: 140 * this.scale });
      tween(this.p, { sparkle: 1.9 }, 300, ease.out).then(() => tween(this.p, { sparkle: 1 }, 700, ease.inOut));
    }
    this.voice.play('rise');
    if (this.free) this.perform('hop');
  }

  // A USB stick plugged in: she dives down into it (by the clock, where Windows shows it), has a
  // look around in there, and comes back out to her spot.
  async visit(at) {
    if (!this.free || reducedMotion.matches) return false;
    this.busy = true;
    this.wake();
    this.onTeleport?.('start');
    await this.perform('dive');
    const head = await this.vanish({ beam: false });
    this.fx.streak(head.x, head.y, at.x, at.y);
    this.fx.burst(at.x, at.y, { count: 12, inward: true, power: 0.5, spread: 30 });
    this.fx.ring(at.x, at.y, { size: 0.3 });
    this.voice.play('bolt');
    for (let i = 0; i < 3; i++) {
      await sleep(650);
      this.fx.crackle(at, { life: 380, radius: 40, count: 2 }); // her, rummaging in there
    }
    await sleep(300);
    const to = this.spot('post');
    const toHead = this.head(to);
    this.fx.ring(at.x, at.y, { size: 0.35 });
    this.fx.burst(at.x, at.y, { count: 12, power: 0.6, spread: 30 });
    this.fx.streak(at.x, at.y, toHead.x, toHead.y);
    await sleep(60);
    await this.arrive(to);
    await this.settle();
    return true;
  }

  // ---------- jealous ----------

  // You're on another AI: she goes and sits on its window and glares at you, then takes it over
  // for a moment, `say` written across it. When it fills the screen (nothing to sit on), she stands
  // in front of it instead and gets into it with a bolt. False if she couldn't.
  async jealous(win, { say = '', takeOver = true } = {}) {
    if (this.busy || this.stowed || this.dormant || this.hidden || this.dragging || SPUN.has(this.stance) || this.stance === 'fall') return false;
    const take = takeOver && this.possessWindows && !reducedMotion.matches;
    if (this.canSit(win) && win.id !== 'taskbar' && !this.covered(win, win.x + win.w * 0.5)) {
      if (!(this.stance === 'sit' && this.perch?.id === win.id)) {
        await this.sitOn({ win, dx: clamp(win.w * 0.5, 60, Math.max(60, win.w - 190)) });
      }
      if (this.stance !== 'sit' || this.perch?.id !== win.id) return false;
      await this.perform('glare', this.mouse && this.mouse.x < this.pos.x ? -1 : 1);
      if (take) await this.possess({ say, angry: true });
      return true;
    }
    if (this.stance !== 'stand' || Math.abs(this.pos.y - this.floor) > 8) await this.teleport(this.spot('stage'));
    if (this.busy || this.stance !== 'stand') return false;
    await this.perform('glare', this.towardCenter());
    if (!take) return true;
    // a bolt off her hand into it, and it's hers for a moment
    this.busy = true;
    const dir = win.x + win.w / 2 < this.pos.x ? -1 : 1;
    const side = this.armToward(dir);
    const into = { x: clamp(win.x + win.w / 2, 40, this.view.w - 40), y: clamp(win.y + win.h * 0.46, 40, this.view.floor - 40) };
    this.zapAt = null;
    this.fx.bolt(this.limb(side).hand, into, { life: 320, forks: 3, width: 3 });
    this.voice.play('bolt');
    const rect = () => this.windows.wins.find((o) => o.id === win.id) || null;
    const taken = this.fx.possess(rect, { covers: () => this.coversOf(win.id), entry: win.w / 2, look: () => this.mouse, say, angry: true });
    await sleep(300);
    this.voice.play('jealous');
    await sleep(say ? 2600 : 1600);
    taken.leave();
    await sleep(260);
    this.busy = false;
    return true;
  }

  // Let go of her: onto a ledge if her hips are right at one, otherwise she falls.
  drop() {
    const s = this.scale;
    const hip = this.pos.y - (SPRITE.feet.y - SPRITE.hip) * s;
    for (const win of this.windows.wins) {
      if (!this.canSit(win) || Math.abs(hip - win.y) > 26) continue;
      if (this.pos.x < win.x + 40 || this.pos.x > win.x + win.w - 40 || this.covered(win, this.pos.x)) continue;
      const dx = this.pos.x - win.x;
      this.pos = this.seat(win, dx);
      this.setStance('sit', { perch: { id: win.id, dx } });
      this.perform('plop');
      this.voice.play('land');
      return;
    }
    if (this.pos.y < this.floor - 2) this.fall();
    else this.perform('land');
  }

  // When the pointer comes close she turns around to face it and cocks her head;
  // if she's peeking, she's shy and ducks away.
  notice(x, y) {
    if (this.busy || this.hidden || this.stance === 'fall' || this.sky) return; // the satellite has all her attention
    const h = this.head();
    if (Math.hypot(x - h.x, y - h.y) > 230) return;
    const now = performance.now();
    if (this.mode === 'sleep') this.wake();
    if (now < this.nextNotice) return;
    this.nextNotice = now + 15000;
    if (this.stance === 'peek') {
      this.unpeek({ shy: true });
      return;
    }
    const wanted = x < this.pos.x ? 1 : -1;
    if (wanted !== this.facing && this.stance === 'stand') {
      this.perform('turn');
      return;
    }
    if (this.mode !== 'idle') return;
    // now and then she's a little menace about it
    if (Math.random() < 0.3 && this.zap(x, y)) return;
    this.perform('curious', x < h.x ? -1 : 1);
  }
}

// p turned by `a` radians around o, the way CSS rotate() turns things (clockwise on screen).
function turnAround(p, o, a) {
  const c = Math.cos(a), s = Math.sin(a), dx = p.x - o.x, dy = p.y - o.y;
  return { x: o.x + dx * c - dy * s, y: o.y + dx * s + dy * c };
}

// An angle in degrees, brought back between -180 and 180.
function norm(deg) {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

// Her outline at rest (the alpha map), as a convex hull around her middle, in sprite px: how far
// she reaches in any direction once she's turned (reachAt). Her mane is most of it.
function buildHull(alpha) {
  const { width: w, height: h } = SPRITE;
  const pts = [];
  for (let y = 0; y < h; y += 3) {
    let a = -1, b = -1;
    for (let x = 0; x < w; x++) {
      if (alpha[(y * w + x) * 4 + 3] > 40) {
        if (a < 0) a = x;
        b = x;
      }
    }
    if (a >= 0) pts.push([a - MID.x, y - MID.y], [b - MID.x, y - MID.y]);
  }
  // Andrew's monotone chain
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(pts), ...half([...pts].reverse())];
}
