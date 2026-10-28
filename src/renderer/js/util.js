export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (list) => list[Math.floor(Math.random() * list.length)];
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export const ease = {
  linear: (t) => t,
  out: (t) => 1 - Math.pow(1 - t, 4),               // power4.out
  in: (t) => t * t * t,
  inOut: (t) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
};

// Calmer animations: when Windows has its animation effects off (prefers-reduced-motion), unless
// her menu says otherwise (Animations: like Windows, full, reduced). Read live: `.matches`.
const systemReduced = matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = {
  setting: 'auto', // 'auto' (like Windows), 'full' or 'reduced'
  get matches() {
    return this.setting === 'reduced' || (this.setting === 'auto' && systemReduced.matches);
  },
  get system() {
    return systemReduced.matches;
  },
  onSystemChange(fn) {
    systemReduced.addEventListener('change', fn);
  },
};

// "{project} a fini" + {project: 'x'} -> "x a fini"
export const fmt = (str, vars = {}) => str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ''));

export function duration(ms, lang = 'fr') {
  const ru = lang === 'ru';
  const uk = lang === 'uk';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return ru || uk ? `${s} с` : `${s} s`;
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  if (m < 60) return lang === 'en' ? `${m}m ${ss}s` : ru ? `${m} мин ${ss} с` : uk ? `${m} хв ${ss} с` : `${m} min ${ss}`;
  return `${Math.floor(m / 60)} ${ru ? 'ч' : uk ? 'год' : 'h'} ${String(m % 60).padStart(2, '0')}`;
}

export const basename = (p = '') => String(p).replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';

// the local date, YYYY-MM-DD
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Tweens a set of numeric props on `target`. Values are read by the stepped render loop,
// so the result lands on whole drawing frames like cel animation.
export function tween(target, to, ms, easing = ease.out) {
  const from = {};
  for (const k of Object.keys(to)) from[k] = target[k];
  const start = performance.now();
  return new Promise((resolve) => {
    if (ms <= 0) {
      Object.assign(target, to);
      resolve();
      return;
    }
    const tick = () => {
      const t = Math.min(1, (performance.now() - start) / ms);
      const e = easing(t);
      for (const k of Object.keys(to)) target[k] = lerp(from[k], to[k], e);
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
}
