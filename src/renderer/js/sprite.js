// WebGL renderer for the Capri cut-out.
// One texture, one quad: every bit of life (head tilt, mane sway and flare, both arms, sitting with
// dangling legs, smear frames, afterimages, line boil, speckles, the violet misregistration, glitch
// slices, teleport collapse) is done in the fragment shader.

const VERT = `
attribute vec2 aPos;
uniform vec2 uView;
uniform float uPad;
varying vec2 vPx;
void main() {
  vec2 uv = aPos * 0.5 + 0.5;
  vPx = vec2(uv.x, 1.0 - uv.y) * uView - uPad;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vPx;

uniform sampler2D uTex;
uniform vec2 uSize;
uniform float uSeed;
uniform float uBoil;
uniform float uHair;
uniform float uHead;
uniform float uMane;
uniform float uArmL;
uniform float uArmR;
uniform float uLongL;
uniform float uLongR;
uniform float uSit;
uniform float uBend;
uniform float uKickL;
uniform float uKickR;
uniform vec2 uSmear;
uniform vec2 uEcho;
uniform float uGlitch;
uniform float uGlitchSeed;
uniform float uSplit;
uniform float uCollapse;
uniform float uDissolve;
uniform float uSparkle;
uniform float uGrade;
uniform vec4 uSil;
uniform vec2 uMisreg;
uniform vec3 uRim;
uniform float uAlpha;
uniform float uPx; // sprite pixels per screen pixel

// landmarks, in sprite pixels (capri-full.png is 240x420, see tools/build-sprite.py)
const vec2 NECK = vec2(118.0, 152.0);   // the head tilts around this
const vec2 SHOULDER_L = vec2(98.0, 168.0);
const float MIRROR = 234.0;             // the right arm is the left one flipped around x = 117
const vec2 SHOULDER_R = vec2(136.0, 168.0);
const vec2 MANE = vec2(116.0, 92.0);    // middle of the mane, it flares out from here
const vec2 FACE = vec2(124.0, 132.0);   // her mask, kept rigid when the mane flares
const float AXIS = 118.0;
const float HIP = 232.0;                // bottom of the torso
const float KNEE = 305.0;               // both knees sit around here
const float KNEE_LX = 106.0;
const float KNEE_RX = 142.0;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

vec2 rot(vec2 p, vec2 c, float a) {
  float s = sin(a), k = cos(a);
  p -= c;
  return c + vec2(k * p.x - s * p.y, s * p.x + k * p.y);
}

vec4 tex(vec2 p) {
  if (p.x < 0.0 || p.y < 0.0 || p.x > uSize.x || p.y > uSize.y) return vec4(0.0);
  return texture2D(uTex, p / uSize);
}

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// The cut-out is darker and duller than the show; pull every pink/crimson toward the
// on-screen hot red and the mask toward neon green. "red" says how much of the mane it is.
vec3 grade(vec3 c, out float red) {
  vec3 h = rgb2hsv(c);
  float hx = h.x < 0.5 ? h.x + 1.0 : h.x;               // unwrap around red
  float lit = smoothstep(0.1, 0.3, h.z);
  red = smoothstep(0.78, 0.85, hx) * (1.0 - smoothstep(1.06, 1.1, hx)) * lit * smoothstep(0.06, 0.2, h.y);
  float green = smoothstep(0.22, 0.27, h.x) * (1.0 - smoothstep(0.47, 0.52, h.x)) * lit * smoothstep(0.15, 0.3, h.y);
  hx = mix(hx, 0.968, red * 0.6 * uGrade);
  h.x = fract(hx);
  h.y = mix(h.y, max(h.y, 0.86), red * uGrade);
  h.y = mix(h.y, min(1.0, h.y * 1.1 + 0.06), green * uGrade);
  h.z = mix(h.z, min(1.0, h.z * 1.5 + 0.1), (red + green) * uGrade);
  return hsv2rgb(h);
}

// Graded, speckled, premultiplied sample of the figure.
vec4 cel(vec2 s) {
  vec4 c = tex(s);
  if (c.a <= 0.0) return vec4(0.0);
  float red;
  c.rgb = grade(c.rgb, red);
  // speckles on the red parts: a fixed star field plus a few that twinkle per drawing.
  // One speck is about one screen pixel whatever her size, and sticks to the body.
  if (red > 0.0 && uSparkle > 0.0) {
    vec2 cell = floor(s / max(0.8, uPx * 1.2));
    float star = step(0.976, hash(cell + 3.1)) * 0.85;
    float tw = step(0.993, hash(cell + uSeed * 1.37));
    c.rgb = mix(c.rgb, vec3(1.0, 0.95, 0.97), clamp((star + tw) * red * uSparkle, 0.0, 1.0));
  }
  return vec4(c.rgb * c.a, c.a);
}

// Lower legs, in source pixels; the line between them leans with the stance.
float legSep(float y) { return 117.0 + max(0.0, y - 300.0) * 0.15; }
float legL(vec2 s) { return step(KNEE - 6.0, s.y) * (1.0 - step(legSep(s.y), s.x)); }
float legR(vec2 s) { return step(KNEE - 6.0, s.y) * step(legSep(s.y), s.x); }

// Sitting, seen from the front: the thighs come toward us so they shrink,
// and everything below them rides up.
float thighScale() { return mix(1.0, 0.3, uSit); }

vec2 unsit(vec2 q) {
  if (uSit <= 0.0 || q.y <= HIP) return q;
  float c = thighScale();
  if (q.y <= HIP + (KNEE - HIP) * c) q.y = HIP + (q.y - HIP) / c;
  else q.y += (KNEE - HIP) * (1.0 - c);
  return q;
}

// The reaching arm, on the left of the cut-out, between the hair spike above it and the hip
// below. The right arm is this same drawing mirrored (the original hanging one was removed).
float armL(vec2 s) {
  if (s.x > 101.0 || s.y > 234.0) return 0.0;
  float top = 159.0 + (98.0 - s.x) * 0.5;
  float bot = s.x < 50.0 ? 234.0 : 178.0 + (98.0 - s.x) * 0.62;
  return step(top, s.y) * step(s.y, bot);
}

vec2 mirrorArm(vec2 s) { return vec2(MIRROR - s.x, s.y); }

// An arm drawn longer than it is (anime exaggeration, so a reach reads past the mane):
// stretched along its length only, from the shoulder, so it stays as thin. In the left arm's
// rest frame, which is where both arms are looked up.
const vec2 ARM_DIR = vec2(-0.85954, 0.51108); // shoulder to hand at rest
vec2 stretchArm(vec2 s, float k) {
  if (k == 1.0) return s;
  vec2 v = s - SHOULDER_L;
  float along = dot(v, ARM_DIR);
  return SHOULDER_L + ARM_DIR * (along / k) + (v - ARM_DIR * along);
}
vec2 armLeft(vec2 q) { return stretchArm(rot(q, SHOULDER_L, -uArmL), uLongL); }
vec2 armRight(vec2 q) { return stretchArm(mirrorArm(rot(q, SHOULDER_R, uArmR)), uLongR); }

bool legsRigged() { return uSit > 0.0 || uKickL != 0.0 || uKickR != 0.0; }

// Bent at the hips (lying back on one arm): her legs swung around her hip, toward the left of the
// cut-out for a positive bend, easing in over the waist so nothing tears.
vec2 hips(vec2 q) {
  if (uBend == 0.0) return q;
  return rot(q, vec2(AXIS, HIP), -uBend * smoothstep(HIP - 16.0, HIP + 8.0, q.y));
}

// Everything but the arms, with each lower leg swung on its knee (outward for positive kicks).
vec4 torso(vec2 q) {
  q = hips(q);
  if (!legsRigged()) return armL(q) > 0.0 ? vec4(0.0) : cel(q);
  float kneeY = HIP + (KNEE - HIP) * thighScale();
  vec2 qB = unsit(q);
  vec2 qL = unsit(rot(q, vec2(KNEE_LX, kneeY), -uKickL));
  vec2 qR = unsit(rot(q, vec2(KNEE_RX, kneeY), uKickR));
  vec4 b = legL(qB) + legR(qB) + armL(qB) > 0.0 ? vec4(0.0) : cel(qB);
  vec4 l = legL(qL) > 0.0 ? cel(qL) : vec4(0.0);
  vec4 r = legR(qR) > 0.0 ? cel(qR) : vec4(0.0);
  vec4 c = l + b * (1.0 - l.a);
  return r + c * (1.0 - r.a);
}

// Both arms turned on their shoulders (positive raises them). They pass in front of the body
// and the mane (a hand reaching up stays visible), except right at the shoulders, which cover the joints.
float armAlpha(vec2 q) {
  vec2 qL = armLeft(q);
  vec2 qR = armRight(q);
  return max(armL(qL) * tex(qL).a, armL(qR) * tex(qR).a);
}

// The head and mane acting, on the body only: an arm raised up into the mane stays straight.
vec2 bend(vec2 q) {
  // head tilt: everything above the collar bends around the neck, the body stays put. So do the
  // tips of the mane hanging down on either side of her shoulders: they belong to the head.
  float tips = smoothstep(26.0, 40.0, abs(q.x - AXIS)) * smoothstep(195.0, 175.0, q.y);
  q = rot(q, NECK, -uHead * max(smoothstep(162.0, 138.0, q.y), tips));

  // mane flare: the shards bristle outward, unevenly, around a rigid face
  if (uMane != 0.0) {
    vec2 d = q - MANE;
    float spikes = 0.55 + 0.9 * vnoise(vec2(atan(d.y, d.x) * 2.6, 4.0));
    float w = smoothstep(182.0, 60.0, q.y) * smoothstep(16.0, 30.0, distance(q, FACE));
    q = MANE + d / (1.0 + uMane * w * 0.32 * spikes);
  }

  // mane sway, strongest at the tips
  float hw = smoothstep(175.0, 5.0, q.y);
  q.x -= uHair * hw * (0.65 + 0.35 * sin(q.y * 0.055));
  q.y -= uHair * 0.22 * hw * sin(q.x * 0.045);
  return q;
}

vec4 rig(vec2 q) {
  vec2 qL = armLeft(q);
  vec2 qR = armRight(q);
  vec4 l = armL(qL) > 0.0 ? cel(qL) : vec4(0.0);
  vec4 r = armL(qR) > 0.0 ? cel(qR) : vec4(0.0);
  vec4 arms = l + r * (1.0 - l.a);
  vec4 b = torso(bend(q));
  bool joint = distance(q, SHOULDER_L) < 18.0 || distance(q, SHOULDER_R) < 18.0;
  if (joint) return b + arms * (1.0 - b.a);
  // where an arm crosses the body or the mane, ink a violet line around it so it reads
  if (arms.a < 0.5 && b.a > 0.5 && (uArmL != 0.0 || uArmR != 0.0)) {
    float edge = max(max(armAlpha(q + vec2(1.8, 0.0)), armAlpha(q - vec2(1.8, 0.0))),
                     max(armAlpha(q + vec2(0.0, 1.8)), armAlpha(q - vec2(0.0, 1.8))));
    if (edge > 0.5) return vec4(uRim, 1.0);
  }
  return arms + b * (1.0 - arms.a);
}

float rigAlpha(vec2 q) {
  return rig(q).a;
}

// What happens to the whole drawing: the teleport collapse, glitch slices, line boil.
vec2 settle(vec2 p) {
  vec2 q = p;

  // teleport: squeeze into a vertical line of light
  q.x = AXIS + (q.x - AXIS) / max(1.0 - uCollapse, 0.025);
  q.y = 240.0 + (q.y - 240.0) / (1.0 + uCollapse * 0.4);

  // relic-style slices
  if (uGlitch > 0.0) {
    float bh = mix(5.0, 26.0, hash(vec2(uGlitchSeed, 7.0)));
    float band = floor(q.y / bh);
    float on = step(1.0 - uGlitch * 0.6, hash(vec2(band, uGlitchSeed)));
    q.x += on * (hash(vec2(band + 3.0, uGlitchSeed)) - 0.5) * 72.0 * uGlitch;
  }

  // boil: the line wobble you get when every drawing is redone by hand
  q += (vec2(vnoise(q * 0.075 + uSeed * 13.7), vnoise(q * 0.075 + uSeed * 7.3 + 31.0)) - 0.5) * 2.0 * uBoil;
  return q;
}

void main() {
  vec2 p = vPx;

  if (uDissolve > 0.0) {
    vec2 g = rot(p, vec2(110.0, 210.0), 0.55);
    vec2 cell = floor(g / vec2(16.0, 9.0));
    if (hash(cell + floor(uGlitchSeed)) < uDissolve) discard;
  }

  vec2 q = settle(p);
  vec4 c = rig(q);
  vec3 col = c.rgb;
  float a = c.a;

  // chromatic split: red and blue channels pulled apart
  if (uSplit > 0.0) {
    vec4 cr = rig(q + vec2(uSplit, 0.0));
    vec4 cb = rig(q - vec2(uSplit, uSplit * 0.3));
    col = vec3(cr.r, col.g, cb.b);
    a = max(a, max(cr.a, cb.a));
  }

  // smear frame: two multiples of the head trailing where it came from
  if (uSmear != vec2(0.0)) {
    float hw = smoothstep(178.0, 140.0, q.y);
    for (int i = 1; i <= 2; i++) {
      vec4 m = rig(q - uSmear * hw * float(i) * 0.5);
      col += m.rgb * (1.0 - a);
      a += m.a * (1.0 - a);
    }
  }

  // impact frame: flat silhouette
  col = mix(col, uSil.rgb * a, uSil.a);

  // afterimages: the other minds in her, a green and a red copy pulled apart
  if (uEcho != vec2(0.0)) {
    float e1 = rigAlpha(q - uEcho) * (1.0 - a);
    col += vec3(0.21, 1.0, 0.48) * e1;
    a += e1;
    float e2 = rigAlpha(q + uEcho) * (1.0 - a);
    col += vec3(1.0, 0.13, 0.32) * e2;
    a += e2;
  }

  // violet misregistration behind the figure
  float rim = rigAlpha(q - uMisreg) * (1.0 - a);
  col += uRim * rim;
  a += rim;

  gl_FragColor = vec4(col, a) * uAlpha;
}`;

const UNIFORMS = [
  'uView', 'uPad', 'uTex', 'uSize', 'uSeed', 'uBoil', 'uHair', 'uHead', 'uMane', 'uArmL', 'uArmR', 'uLongL', 'uLongR',
  'uSit', 'uBend', 'uKickL', 'uKickR',
  'uSmear', 'uEcho', 'uGlitch', 'uGlitchSeed',
  'uSplit', 'uCollapse', 'uDissolve', 'uSparkle', 'uGrade', 'uSil', 'uMisreg', 'uRim', 'uAlpha', 'uPx',
];

export const SPRITE = {
  width: 240, height: 420, pad: 56,
  head: { x: 116, y: 132 },
  feet: { x: 128, y: 418 },
  hip: 232, // where she sits
  // the reaching arm, as in the shader; the right arm is it mirrored around x = mirror / 2
  shoulder: { x: 98, y: 168 },
  hand: { x: 24, y: 212 },
  mirror: 234,
  armL(x, y) {
    if (x > 101 || y > 234) return false;
    const top = 159 + (98 - x) * 0.5;
    const bot = x < 50 ? 234 : 178 + (98 - x) * 0.62;
    return y >= top && y <= bot;
  },
};

export class SpriteRenderer {
  constructor(canvas, image) {
    this.canvas = canvas;
    this.image = image;
    this.scale = null;
    this.setup();
    // the GPU can be reset (waking from sleep, a driver update): without this she'd stay gone
    canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
    canvas.addEventListener('webglcontextrestored', () => {
      this.setup();
      if (this.scale) this.resize(this.scale);
    });
  }

  // Her shader and picture on the GPU (again, after a reset).
  setup() {
    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) throw new Error('WebGL unavailable');
    this.gl = gl;

    const prog = gl.createProgram();
    for (const [type, src] of [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    for (const name of UNIFORMS) this.u[name] = gl.getUniformLocation(prog, name);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.uniform1i(this.u.uTex, 0);
    gl.uniform2f(this.u.uSize, SPRITE.width, SPRITE.height);
    gl.uniform1f(this.u.uPad, SPRITE.pad);
    gl.uniform2f(this.u.uView, SPRITE.width + SPRITE.pad * 2, SPRITE.height + SPRITE.pad * 2);
    gl.clearColor(0, 0, 0, 0);
  }

  // css size of the canvas for a given sprite scale
  static cssSize(scale) {
    return {
      width: Math.round((SPRITE.width + SPRITE.pad * 2) * scale),
      height: Math.round((SPRITE.height + SPRITE.pad * 2) * scale),
    };
  }

  resize(scale) {
    this.scale = scale;
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = SpriteRenderer.cssSize(scale);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.uniform1f(this.u.uPx, 1 / (scale * dpr));
  }

  draw(s) {
    const { gl, u } = this;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(u.uSeed, s.seed);
    gl.uniform1f(u.uBoil, s.boil);
    gl.uniform1f(u.uHair, s.hair);
    gl.uniform1f(u.uHead, s.head);
    gl.uniform1f(u.uMane, s.mane);
    gl.uniform1f(u.uArmL, s.armL);
    gl.uniform1f(u.uArmR, s.armR);
    gl.uniform1f(u.uLongL, s.longL);
    gl.uniform1f(u.uLongR, s.longR);
    gl.uniform1f(u.uSit, s.sit);
    gl.uniform1f(u.uBend, s.bend);
    gl.uniform1f(u.uKickL, s.kickL);
    gl.uniform1f(u.uKickR, s.kickR);
    gl.uniform2f(u.uSmear, s.smear[0], s.smear[1]);
    gl.uniform2f(u.uEcho, s.echo[0], s.echo[1]);
    gl.uniform1f(u.uGlitch, s.glitch);
    gl.uniform1f(u.uGlitchSeed, s.glitchSeed);
    gl.uniform1f(u.uSplit, s.split);
    gl.uniform1f(u.uCollapse, s.collapse);
    gl.uniform1f(u.uDissolve, s.dissolve);
    gl.uniform1f(u.uSparkle, s.sparkle);
    gl.uniform1f(u.uGrade, s.grade);
    gl.uniform4f(u.uSil, s.sil[0], s.sil[1], s.sil[2], s.silAmount);
    gl.uniform2f(u.uMisreg, s.misreg[0], s.misreg[1]);
    gl.uniform3f(u.uRim, 0.48, 0.24, 1.0);
    gl.uniform1f(u.uAlpha, s.alpha);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
