// Pose-to-pose acting, timed the way cel animation is: an act is an exposure sheet,
// a list of drawings, each held for a number of frames. Nothing is tweened. A move is
// a couple of key drawings, an anticipation the other way, sometimes a smear frame, and holds.
//
// Pose fields (anything left out falls back to the stance underneath):
//   head    head tilt, radians, sprite space       mane   mane flare, + bristles, - settles
//   hair    mane sway, px                          tilt   whole-body lean, degrees, screen
//   bob     vertical offset, px, - is up           sx/sy  squash & stretch (sx < 0 mirrors her)
//   arms    both arms, radians, + raises them      armL / armR   one arm each
//   reach   in directional acts: the arm on the side the act aims at (x the act's reach,
//           a number or a function for a moving target)
//   long    that same arm drawn longer than it is, 1 = as drawn (longL / longR for one arm)
//   smear   [x, y] trail of head multiples, px     echo   [x, y] green/red afterimages, px
//   kickL / kickR   lower legs swinging outward, radians (when sitting)
//
// A key can carry a cue as third item: capri.js fires effects and sounds when it's reached.
// Directional acts are drawn leaning to screen-right; played with dir -1 they're mirrored.

export const SHEET_FPS = 12;

const rep = (n, keys) => Array.from({ length: n }, () => keys).flat();

export const NEUTRAL = {
  head: 0, mane: 0, hair: 0, tilt: 0, bob: 0, sx: 1, sy: 1, armL: 0, armR: 0, longL: 1, longR: 1,
  smear: [0, 0], echo: [0, 0], kickL: 0, kickR: 0,
};

export const ACTS = {
  // ---- stances (looping) ----

  // floating: four drawings; the arms lag behind the body (down when she rises, up when she sinks)
  stand: {
    loop: true,
    keys: [
      [6, { bob: 0, hair: -2.5, arms: 0.04 }],
      [4, { bob: -2, hair: 0, arms: 0 }],
      [6, { bob: -4, hair: 2.5, arms: -0.05 }],
      [4, { bob: -2, hair: 0, arms: 0 }],
    ],
  },

  // perched on a window, hands down on the ledge, legs kicking one after the other
  sit: {
    loop: true,
    keys: [
      [5, { kickL: 0.24, kickR: -0.03, hair: -1.5, arms: -0.42 }],
      [2, { kickL: 0.08, kickR: 0.08, arms: -0.42 }],
      [5, { kickL: -0.03, kickR: 0.24, hair: 1.5, arms: -0.42 }],
      [2, { kickL: 0.08, kickR: 0.08, arms: -0.42 }],
      [5, { kickL: 0.24, kickR: -0.03, hair: -1.5, arms: -0.42 }],
      [2, { kickL: 0.08, kickR: 0.08, arms: -0.42 }],
      [5, { kickL: -0.03, kickR: 0.24, hair: 1.5, arms: -0.42 }],
      [10, { kickL: 0.04, kickR: 0.04, head: 0.08, arms: -0.4 }], // a pause, head cocked
    ],
  },

  // leaning in from the edge of the screen, toward the middle
  peek: {
    loop: true,
    directional: true,
    keys: [
      [18, { tilt: 7, head: 0.14, reach: 0.1 }],
      [1, { tilt: 7, head: 0.2, smear: [-6, 0], reach: 0.16 }],
      [14, { tilt: 7.5, head: 0.24, mane: 0.08, reach: 0.18 }],
      [1, { tilt: 6, head: 0.14, reach: 0.12 }],
      [12, { tilt: 6.5, head: 0.12, bob: -2, reach: 0.1 }],
    ],
  },

  // asleep: arms hanging, head dropped; every so often it falls a bit further and she jolts awake
  sleep: {
    loop: true,
    keys: [
      [18, { head: 0.1, mane: -0.12, bob: 2, arms: -0.3 }],
      [1, { head: 0.16, mane: -0.13, bob: 4, arms: -0.34 }],
      [10, { head: 0.21, mane: -0.15, bob: 5, arms: -0.36 }],
      [1, { head: 0.06, mane: -0.08, bob: 0, smear: [0, 8], arms: -0.18 }], // jolt
      [4, { head: 0.08, mane: -0.1, bob: 1, arms: -0.26 }],
    ],
  },

  // ---- one-shot acts ----

  // little nods while the words come out, two drawings on threes
  talk: { priority: 0, keys: rep(2, [[3, { head: 0.04, mane: 0.08 }], [3, { head: 0, mane: 0.03 }]]) },

  // the cocked head: anticipation the other way, a smear, then a long hold
  curious: {
    priority: 1,
    directional: true,
    keys: [
      [1, { head: -0.05, mane: 0.04 }],
      [1, { head: 0.12, mane: 0.15, tilt: 1, smear: [-12, 4] }],
      [10, { head: 0.19, mane: 0.14, tilt: 2 }],
      [6, { head: 0.16, mane: 0.1, tilt: 1.6 }],
      [1, { head: 0.07, tilt: 0.6 }],
    ],
  },

  // head snapping from one side to the other, held each time
  look: {
    priority: 1,
    keys: [
      [1, { head: 0.08, smear: [-8, 0] }],
      [8, { head: 0.16 }],
      [1, { head: 0 }],
      [1, { head: -0.08, smear: [8, 0] }],
      [8, { head: -0.16 }],
      [1, { head: -0.05 }],
      [3, { head: 0 }],
    ],
  },

  // The satellite, the quiet way: a glint, a beat, she notices and snaps to it, her specks
  // catch its light, she reaches for it (slow-in: the drawings bunch up as the hand gets there)
  // and holds. It twinkles back. Her hand drops with a sigh.
  gaze: {
    priority: 1,
    directional: true,
    keys: [
      [3, {}, 'glint'],
      [1, { head: -0.05, bob: 1 }],
      [1, { head: 0.14, mane: 0.12, smear: [-8, 6] }, 'notice'],
      [6, { head: 0.2, mane: 0.1, hair: 0, bob: 0 }],
      [6, { head: 0.23, mane: 0.14, hair: 0, bob: 0 }, 'starlight'],
      [3, { head: 0.23, mane: 0.15, hair: 0, bob: 0, reach: 0.25, long: 1.1 }],
      [3, { head: 0.24, mane: 0.16, hair: 0, bob: 0, reach: 0.55, long: 1.2 }],
      [2, { head: 0.24, mane: 0.16, hair: 0, bob: -1, reach: 0.8, long: 1.3 }],
      [2, { head: 0.25, mane: 0.17, hair: 0, bob: -2, reach: 0.93, long: 1.35 }],
      [14, { head: 0.25, mane: 0.17, hair: 0, bob: -3, reach: 1, long: 1.38 }],
      [1, { head: 0.27, mane: 0.22, hair: 0, bob: -4, reach: 1.02, long: 1.42 }, 'glimmer'],
      [8, { head: 0.25, mane: 0.18, hair: 0, bob: -3, reach: 1, long: 1.38 }],
      [2, { head: 0.14, mane: 0.1, bob: -2, reach: 0.45, long: 1.15 }],
      [2, { head: 0.08, mane: 0.04, bob: -1, reach: 0.12, long: 1.03 }],
      [8, { head: 0.06, mane: -0.04, reach: -0.06 }], // a sigh
      [1, {}],
    ],
  },

  // The satellite, the whole way, after the season's ending: "could we make it up there?"
  // I.   Hush. The glint; her float stops dead and the white specks of her mane lift off,
  //      hanging over her like a sky of her own, linked up like a constellation.
  // II.  She snaps to it and reaches; her stars line up into a road from her fingers to it.
  // III. Anticipation: she sinks and coils, the mane bristles, sparks crawl out of her hand,
  //      cut-in on her eyes.
  // IV.  The red light goes up the road, she's lifted with it, it hits the satellite.
  // V.   It snaps and falls apart. Silence. Then the satellite twinkles back, twice.
  //      Her stars come home and her hand drops.
  uplink: {
    priority: 1,
    directional: true,
    keys: [
      [2, { hair: 0, bob: -2 }, 'glint'],
      [3, { hair: 0, bob: -2 }, 'stars'],
      [3, { hair: 0, bob: -2, mane: 0.05 }],
      [4, { hair: 0, bob: -2, mane: 0.1, head: 0.03 }],
      [1, { hair: 0, bob: -1, head: -0.06 }],
      [1, { hair: 0, bob: -2, head: 0.16, mane: 0.16, smear: [-8, 6] }, 'notice'],
      [5, { hair: 0, bob: -2, head: 0.22, mane: 0.14 }],
      [3, { hair: 0, bob: -2, head: 0.23, mane: 0.15, reach: 0.3, long: 1.15 }],
      [3, { hair: 0, bob: -2, head: 0.24, mane: 0.16, reach: 0.6, long: 1.3 }, 'align'],
      [2, { hair: 0, bob: -3, head: 0.25, mane: 0.17, reach: 0.85, long: 1.42 }],
      [2, { hair: 0, bob: -4, head: 0.25, mane: 0.18, reach: 0.96, long: 1.5 }],
      [9, { hair: 0, bob: -5, head: 0.25, mane: 0.18, reach: 1, long: 1.52 }],
      // the arm pulls back a little as she coils, then shoots out
      [1, { hair: 0, bob: 1, head: 0.24, mane: 0.26, reach: 0.98, long: 1.45, sy: 0.95, sx: 1.03 }, 'charge'],
      [2, { hair: 0, bob: 3, head: 0.23, mane: 0.32, reach: 0.98, long: 1.42, sy: 0.93, sx: 1.04 }],
      [2, { hair: 0, bob: 4, head: 0.23, mane: 0.38, reach: 0.99, long: 1.4, sy: 0.92, sx: 1.05 }],
      [2, { hair: 0, bob: 5, head: 0.22, mane: 0.44, reach: 1, long: 1.4, sy: 0.91, sx: 1.06, echo: [2, 0] }],
      [1, { hair: 0, bob: -10, head: 0.3, mane: 0.7, reach: 1.05, long: 1.78, sy: 1.14, sx: 0.9, echo: [10, -4], smear: [0, 14] }, 'surge'],
      [1, { hair: 0, bob: -16, head: 0.31, mane: 0.86, reach: 1.06, long: 1.7, sy: 1.06, sx: 0.96, echo: [16, -6] }],
      [2, { hair: 0, bob: -19, head: 0.3, mane: 0.8, reach: 1.06, long: 1.66, echo: [9, -3] }],
      [2, { hair: 0, bob: -19, head: 0.28, mane: 0.74, reach: 1.06, long: 1.62, echo: [4, -1] }],
      [5, { hair: 0, bob: -18, head: 0.28, mane: 0.62, reach: 1.05, long: 1.6 }],
      [1, { hair: 0, bob: -15, head: 0.27, mane: 0.5, reach: 1.03, long: 1.55, smear: [0, -8] }, 'break'],
      [7, { hair: 0, bob: -13, head: 0.26, mane: 0.36, reach: 1.02, long: 1.52 }],
      [1, { hair: 0, bob: -13, head: 0.29, mane: 0.4, reach: 1.03, long: 1.54 }, 'twinkle'],
      [4, { hair: 0, bob: -12, head: 0.28, mane: 0.32, reach: 1.02, long: 1.52 }],
      [1, { hair: 0, bob: -12, head: 0.29, mane: 0.34, reach: 1.02, long: 1.53 }, 'glimmer'],
      [7, { hair: 0, bob: -11, head: 0.27, mane: 0.28, reach: 1, long: 1.5 }],
      [2, { bob: -7, head: 0.2, mane: 0.2, reach: 0.7, long: 1.3 }, 'home'],
      [2, { bob: -4, head: 0.14, mane: 0.12, reach: 0.4, long: 1.12 }],
      [2, { bob: -1, head: 0.08, mane: 0.04, reach: 0.12, long: 1.03 }],
      [10, { bob: 1, head: 0.06, mane: -0.06, reach: -0.06 }], // a sigh
      [1, {}],
    ],
  },

  // Job done. Wind-up with the mane pulled in, a stretched smear frame, then the key pose:
  // arms flung up, mane exploding, held while the lines hit. She laughs, head shaking every
  // other drawing, then drops back down with a squash and a small overshoot. She only talks
  // (the "done" panel) once she's coming down, so nothing covers the key pose.
  victory: {
    priority: 4, // nothing cuts this one off
    fps: 24,
    directional: true,
    keys: [
      [3, { sy: 0.9, sx: 1.05, bob: 6, arms: -0.3, mane: -0.15 }],
      [3, { sy: 0.82, sx: 1.1, bob: 10, arms: -0.5, mane: -0.3, head: -0.04 }, 'gather'],
      [1, { sy: 1.24, sx: 0.85, bob: -16, arms: 0.55, mane: 0.45, smear: [0, 22], echo: [12, 0] }, 'launch'],
      [2, { sy: 1.1, sx: 0.94, bob: -30, arms: 1.45, mane: 0.85, echo: [20, -4] }, 'peak'],
      [10, { bob: -36, arms: 1.32, mane: 0.78, head: 0.05 }],
      [2, { bob: -34, arms: 1.18, mane: 0.7, head: -0.08 }, 'laugh'],
      [2, { bob: -38, arms: 1.36, mane: 0.8, head: 0.08 }],
      ...rep(4, [[2, { bob: -34, arms: 1.18, mane: 0.7, head: -0.08 }], [2, { bob: -38, arms: 1.36, mane: 0.8, head: 0.08 }]]),
      [2, { bob: -24, arms: 0.7, mane: 0.45, sy: 1.04 }, 'speak'],
      [2, { bob: -8, arms: 0.15, mane: 0.2, sy: 1.06, sx: 0.96, smear: [0, -12] }],
      [2, { bob: 3, arms: -0.15, mane: -0.06, sy: 0.88, sx: 1.08 }],
      [3, { bob: 1, arms: 0.05, sy: 0.97, sx: 1.02 }],
      [2, { arms: 0 }],
    ],
  },

  // The menace: arm pulled in, then jabbed at your pointer with a jolt of red lightning,
  // held while she grins, and dropped.
  zap: {
    priority: 2,
    fps: 24,
    directional: true,
    keys: [
      [3, { reach: 0.2, long: 0.9, head: -0.06, mane: 0.1, bob: 1 }],
      [1, { reach: 1, long: 1.6, head: 0.12, mane: 0.32, smear: [-10, 0], echo: [6, 0] }, 'zap'],
      [6, { reach: 1, long: 1.52, head: 0.14, mane: 0.26 }],
      [4, { reach: 0.96, long: 1.42, head: 0.18, mane: 0.2 }, 'grin'],
      [10, { reach: 0.9, long: 1.36, head: 0.2, mane: 0.16 }],
      [3, { reach: 0.5, long: 1.15, head: 0.14, mane: 0.08 }],
      [3, { reach: 0.15, head: 0.06 }],
      [1, {}],
    ],
  },

  // Showing you something, the way she'd do it in the show. Her head snaps to it, she coils
  // up leaning away with the arm cocked back behind her, then strikes: one stretched drawing
  // where her construct arm shoots out to more than twice its length, red lightning off the
  // fingertip and the reticle slamming onto it ('lock'). The arm recoils, overshoots, settles.
  point: {
    priority: 2,
    fps: 24,
    directional: true,
    keys: [
      [2, { head: 0.16, mane: 0.15, tilt: 1, smear: [-10, 2] }, 'spot'],
      [3, { head: 0.2, mane: 0.12, tilt: 1.5 }],
      [3, { reach: -0.45, long: 0.8, head: 0.12, tilt: -5, sy: 0.9, sx: 1.06, bob: 5, mane: -0.2 }],
      [2, { reach: -0.55, long: 0.75, head: 0.1, tilt: -6, sy: 0.86, sx: 1.08, bob: 7, mane: -0.28 }, 'coil'],
      [1, { reach: 0.9, long: 2.3, head: 0.24, tilt: 8, sx: 0.94, sy: 1.1, mane: 0.6, smear: [-18, 0], echo: [14, 0] }, 'lock'],
      [1, { reach: 1.08, long: 2, head: 0.22, tilt: 7, mane: 0.55, echo: [8, 0] }],
      [2, { reach: 1.02, long: 1.42, head: 0.19, tilt: 4, mane: 0.4 }],
      [2, { reach: 0.98, long: 1.58, head: 0.18, tilt: 3, mane: 0.3 }],
      [2, { reach: 1, long: 1.5, head: 0.17, tilt: 3, mane: 0.22 }],
    ],
  },

  // ...and held while she explains, leaning in: a jab at it now and then (two taps, like on a
  // screen), and a glance back at you before her eyes go back to it. A stance: it lasts until
  // the guide moves on.
  pointing: {
    loop: true,
    directional: true,
    keys: [
      [12, { reach: 1, long: 1.5, head: 0.17, mane: 0.16, tilt: 3 }],
      [1, { reach: 1.05, long: 1.8, head: 0.2, mane: 0.24, tilt: 4 }, 'tap'],
      [2, { reach: 1, long: 1.52, head: 0.18, mane: 0.18, tilt: 3 }],
      [1, { reach: 1.05, long: 1.8, head: 0.2, mane: 0.24, tilt: 4 }, 'tap'],
      [10, { reach: 1, long: 1.5, head: 0.17, mane: 0.16, tilt: 3, bob: -2 }],
      [1, { reach: 1, long: 1.5, head: 0.02, mane: 0.12, tilt: 2, smear: [10, 0] }],
      [8, { reach: 1, long: 1.5, head: -0.1, mane: 0.1, tilt: 2 }],
      [1, { reach: 1, long: 1.5, head: 0.12, mane: 0.16, tilt: 3, smear: [-10, 0] }],
      [8, { reach: 1, long: 1.5, head: 0.17, mane: 0.16, tilt: 3, bob: -1 }],
    ],
  },

  // Done showing: the line reels back into her finger and the arm is snapped back in.
  unpoint: {
    priority: 2,
    fps: 24,
    directional: true,
    keys: [
      [1, { reach: 0.6, long: 0.9, head: 0.08, tilt: -2, smear: [12, 0], mane: 0.1 }],
      [2, { reach: 0.1, long: 0.85, head: 0.04, tilt: -1 }],
      [2, { reach: -0.06, long: 1, tilt: 0 }],
      [1, {}],
    ],
  },

  // Folding herself away into her biochip: a little cock of the head at you, then the mane
  // and the arms pulled in tight, crouching small.
  fold: {
    priority: 3,
    fps: 24,
    keys: [
      [4, { head: 0.12, mane: 0.12 }],
      [2, { head: 0.06, mane: -0.18, arms: -0.5, sy: 0.93, sx: 1.04 }],
      [3, { mane: -0.36, arms: -0.72, sy: 0.84, sx: 1.08, bob: 4 }],
    ],
  },

  // Before she dives into the window she sits on: head cocked at it, the legs swing up, she
  // coils with the mane pulled in and the arms tucked, then stretches down into it.
  dive: {
    priority: 3,
    keys: [
      [1, { head: -0.05 }],
      [5, { head: 0.18, mane: 0.1, kickL: 0.1, kickR: 0.1 }],
      [2, { head: 0.22, mane: -0.15, sy: 0.9, sx: 1.06, kickL: 0.34, kickR: 0.34, arms: -0.6 }],
      [1, { head: 0.1, mane: -0.28, sy: 1.16, sx: 0.88, smear: [0, -14], arms: -0.7 }],
    ],
  },

  // The other minds in her: her green and red copies pull away from her, hang there
  // flickering, and snap back in.
  split: {
    priority: 3,
    fps: 24,
    keys: [
      [2, { echo: [3, 0], mane: 0.1 }],
      [2, { echo: [10, -2], mane: 0.18, head: 0.05 }],
      [2, { echo: [22, -4], mane: 0.22, head: -0.06 }, 'minds'],
      [6, { echo: [34, -5], mane: 0.24, head: 0.06, bob: -3 }],
      [2, { echo: [41, -6], mane: 0.26, head: -0.05, bob: -3 }],
      [6, { echo: [36, -5], mane: 0.24, head: 0.07, bob: -3 }],
      [1, { echo: [12, 0], sx: 1.08, sy: 0.94, bob: -1 }, 'snap'],
      [1, { sx: 0.96, sy: 1.04, mane: 0.3 }],
      [3, { mane: 0.1 }],
      [1, {}],
    ],
  },

  // bristling, flickering, arms flared, leaning toward you; she stares with all her eyes
  alarm: {
    priority: 2,
    directional: true,
    keys: [
      [1, { mane: 0.34, head: 0.1, tilt: 3, arms: 0.36 }, 'stare'],
      [1, { mane: 0.12, head: 0.1, tilt: 3, arms: 0.24 }],
      ...rep(14, [[1, { mane: 0.34, head: 0.1, tilt: 3, arms: 0.36 }], [1, { mane: 0.12, head: 0.1, tilt: 3, arms: 0.24 }]]),
    ],
  },

  // knocked back by a failure, arms snapped in
  flinch: {
    priority: 2,
    keys: [
      [2, { head: 0.22, tilt: 4, sx: 0.92, sy: 1.06, mane: -0.12, bob: 5, smear: [-10, 0], arms: -0.32 }],
      [5, { head: 0.18, tilt: 3.4, mane: -0.1, bob: 4, arms: -0.22 }],
      [1, { head: 0.09, tilt: 1.5, bob: 2, arms: -0.08 }],
    ],
  },

  // turnaround: the flat cut-out squashes to a sliver and comes back mirrored
  turn: {
    priority: 3,
    fps: 24,
    flip: true,
    keys: [
      [1, { sx: 0.7, sy: 1.02, echo: [6, 0], arms: -0.1 }],
      [1, { sx: 0.25, sy: 1.04, echo: [10, 0], mane: 0.2, arms: -0.2 }],
      [1, { sx: -0.25, sy: 1.04, echo: [10, 0], mane: 0.2, arms: -0.2 }],
      [1, { sx: -0.7, sy: 1.02, arms: -0.1 }],
      [2, { sx: -1, arms: 0.04 }],
    ],
  },

  // a full spin on ones, arms thrown out, afterimages flying
  spin: {
    priority: 3,
    fps: 24,
    keys: [
      [2, { sy: 0.92, sx: 1.05, bob: 3, arms: -0.2 }], // wind-up
      [1, { sx: 0.7, echo: [8, 0], mane: 0.25, arms: 0.15 }],
      [1, { sx: 0.2, echo: [14, 0], mane: 0.35, bob: -4, arms: 0.28 }],
      [1, { sx: -0.3, echo: [14, 0], mane: 0.35, bob: -6, arms: 0.3 }],
      [1, { sx: -0.75, echo: [10, 0], mane: 0.3, bob: -6, arms: 0.3 }],
      [1, { sx: -1, echo: [6, 0], bob: -6, arms: 0.28 }],
      [1, { sx: -0.75, echo: [10, 0], mane: 0.3, bob: -5, arms: 0.3 }],
      [1, { sx: -0.3, echo: [14, 0], mane: 0.35, bob: -4, arms: 0.3 }],
      [1, { sx: 0.2, echo: [14, 0], mane: 0.35, bob: -2, arms: 0.25 }],
      [1, { sx: 0.7, echo: [8, 0], mane: 0.25, arms: 0.15 }],
      [2, { sx: 1.06, sy: 0.95, mane: 0.15, arms: -0.06 }], // overshoot
      [1, { sx: 1 }],
    ],
  },

  // a hop in place: crouch, stretch, hang at the top with the arms up, squash on landing
  hop: {
    priority: 3,
    fps: 24,
    keys: [
      [3, { sy: 0.86, sx: 1.08, bob: 6, mane: -0.08, arms: -0.3 }],
      [1, { sy: 1.18, sx: 0.9, bob: -10, smear: [0, 16], arms: 0.4 }],
      [2, { sy: 1.08, sx: 0.95, bob: -32, mane: 0.15, arms: 0.55 }],
      [4, { bob: -42, mane: 0.3, arms: 0.6 }],
      [2, { sy: 1.06, bob: -26, mane: 0.2, arms: 0.35 }],
      [1, { sy: 1.12, sx: 0.92, bob: -8, smear: [0, -14], arms: 0.15 }],
      [2, { sy: 0.82, sx: 1.12, bob: 5, mane: -0.1, arms: -0.28 }],
      [2, { sy: 0.94, sx: 1.04, bob: 2, arms: 0.06 }],
      [1, {}],
    ],
  },

  // landing after a fall: the impact pushes the arms down, they bounce back past rest
  land: {
    priority: 3,
    fps: 24,
    keys: [
      [2, { sy: 0.72, sx: 1.22, bob: 6, mane: -0.22, arms: -0.4 }],
      [2, { sy: 0.88, sx: 1.08, bob: 3, mane: -0.1, arms: -0.15 }],
      [2, { sy: 1.05, sx: 0.97, mane: 0.1, arms: 0.1 }],
      [1, {}],
    ],
  },

  // plopping down on a window ledge
  plop: {
    priority: 3,
    fps: 24,
    keys: [
      [2, { sy: 0.85, sx: 1.1, mane: -0.12, kickL: 0.3, kickR: 0.3, arms: -0.55 }],
      [2, { sy: 1.05, sx: 0.97, kickL: 0.12, kickR: 0.12, arms: -0.38 }],
      [1, {}],
    ],
  },

  // while falling: stretched, mane blown up, arms flailing every other drawing
  fall: {
    loop: true,
    fps: 24,
    keys: [
      [2, { sy: 1.12, sx: 0.92, mane: 0.36, head: 0.05, smear: [0, -16], armL: 0.8, armR: 0.55 }],
      [2, { sy: 1.1, sx: 0.93, mane: 0.26, head: -0.04, smear: [0, -12], armL: 0.55, armR: 0.82 }],
    ],
  },
};

export class Player {
  constructor(name, { dir = 0, reach = 1, at = performance.now() } = {}) {
    this.name = name;
    this.act = ACTS[name];
    this.dir = dir;
    this.reach = reach;
    this.start = at;
    this.total = this.act.keys.reduce((n, [hold]) => n + hold, 0);
  }

  get priority() {
    return this.act.priority ?? 0;
  }

  // The drawing on screen at `now` ({ pose, index, cue }), or null once a one-shot act is over.
  sample(now) {
    const fps = this.act.fps || SHEET_FPS;
    let f = Math.floor((now - this.start) / (1000 / fps));
    if (f >= this.total) {
      if (!this.act.loop) return null;
      f %= this.total;
    }
    const { keys } = this.act;
    for (let i = 0; i < keys.length; i++) {
      const [hold, pose, cue] = keys[i];
      if (f < hold) return { pose, index: i, cue };
      f -= hold;
    }
    return null;
  }

  // Turn a drawing into plain fields: mirror it toward the act's direction (`facing` maps
  // screen to sprite space) and spell out arms / reach as armL / armR.
  resolve(pose, facing) {
    const out = { ...pose };
    const lean = this.act.directional && this.dir ? this.dir * facing : 0;
    if (lean) {
      if (pose.head !== undefined) out.head = pose.head * lean;
      if (pose.tilt !== undefined) out.tilt = pose.tilt * this.dir;
      if (pose.smear) out.smear = [pose.smear[0] * lean, pose.smear[1]];
      if (pose.echo) out.echo = [pose.echo[0] * lean, pose.echo[1]];
    }
    if (pose.arms !== undefined) {
      out.armL = pose.arms;
      out.armR = pose.arms;
    }
    if (pose.reach !== undefined) {
      // the left arm of the sprite points to sprite-left; reach can follow a moving target
      const scale = typeof this.reach === 'function' ? this.reach() : this.reach;
      out[lean < 0 ? 'armL' : 'armR'] = pose.reach * scale;
    }
    if (pose.long !== undefined) out[lean < 0 ? 'longL' : 'longR'] = pose.long;
    delete out.arms;
    delete out.reach;
    delete out.long;
    return out;
  }
}
