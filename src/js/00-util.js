'use strict';
/* =====================================================================
   Function Coaster — shared helpers
   ===================================================================== */
var FC = (typeof FC !== 'undefined') ? FC : {};

/** Public web version (GitHub Pages) — the easiest way to open the app on phones. */
FC.WEB_URL = 'https://hackthemarket.github.io/functional_rollercoaster/';

/** One color per piece of a piecewise track (UI, graph and 3D rails all match). */
FC.PIECE_COLORS = ['#ff4d6d', '#3a8dff', '#10b981', '#f5a400', '#a06cf0', '#ff7f2a', '#ef4fa6', '#14b8a6'];
FC.pieceColor = (k) => FC.PIECE_COLORS[((k % FC.PIECE_COLORS.length) + FC.PIECE_COLORS.length) % FC.PIECE_COLORS.length];

FC.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
FC.lerp = (a, b, t) => a + (b - a) * t;
FC.smooth = (t) => t * t * (3 - 2 * t);

/** Human-friendly number for display (uses the real minus sign). */
FC.fmt = function (v, dp = 3) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'undefined';
  if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
  const av = Math.abs(v);
  if (av === 0) return '0';
  let s;
  if (av >= 1e7 || av < 1e-6) {
    const e = Math.floor(Math.log10(av));
    const m = v / Math.pow(10, e);
    s = FC.fmt(m, 2) + '×10' + FC.sup(String(e));
    return s;
  }
  let d = dp;
  if (av < 1) d = Math.min(8, Math.max(dp, Math.ceil(-Math.log10(av)) + 1));
  s = v.toFixed(d);
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s.replace('-', '−');
};

/** Round a value that is extremely close to zero to zero (for display). */
FC.fmtZ = function (v, scale = 1, dp = 3) {
  if (isFinite(v) && Math.abs(v) < 1e-9 * Math.max(1, Math.abs(scale))) return '0';
  if (isFinite(v) && v !== 0 && Math.abs(v) < 2e-5 * Math.max(1, Math.abs(scale))) return '≈0';
  return FC.fmt(v, dp);
};

const SUPMAP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '−': '⁻', '+': '⁺' };
FC.sup = (s) => String(s).split('').map((c) => SUPMAP[c] || c).join('');

/** ASCII number that our own parser can read back (no exponent notation). */
FC.numText = function (v, sig = 6) {
  if (!isFinite(v)) return 'NaN';
  const av = Math.abs(v);
  if (av < 1e-10) return '0';
  if (av >= 1e15) return v.toFixed(0);
  const p = Number(v.toPrecision(sig));
  const dec = Math.max(0, sig - 1 - Math.floor(Math.log10(av)));
  let s = p.toFixed(Math.min(dec, 12));
  if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s;
};

/** "Nice" step for axis ticks. */
FC.niceStep = function (range, targetTicks = 8) {
  if (!(range > 0) || !isFinite(range)) return 1;
  const raw = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / mag;
  let n;
  if (r < 1.5) n = 1;
  else if (r < 3.5) n = 2;
  else if (r < 7.5) n = 5;
  else n = 10;
  return n * mag;
};

/** Pick from 1-2-5 sequence close to v. */
FC.nice125 = function (v) {
  if (!(v > 0)) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const r = v / mag;
  const n = r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10;
  return n * mag;
};

FC.hashString = function (str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** Small deterministic RNG (mulberry32). */
FC.rng = function (seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

FC.escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

FC.pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length) % arr.length];

FC.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/** Bisection on a sign change of g over [lo, hi]. Assumes g(lo), g(hi) have opposite signs. */
FC.bisect = function (g, lo, hi, iters = 80) {
  let glo = g(lo);
  for (let i = 0; i < iters; i++) {
    const mid = 0.5 * (lo + hi);
    if (mid === lo || mid === hi) break;
    const gm = g(mid);
    if (!isFinite(gm)) { hi = mid; continue; }
    if (gm === 0) return mid;
    if ((gm < 0) === (glo < 0)) { lo = mid; glo = gm; } else hi = mid;
  }
  return 0.5 * (lo + hi);
};

/** Brent's method root finder on [a,b] with f(a)·f(b) < 0. */
FC.brent = function (f, a, b, tol = 1e-13, maxIter = 100) {
  let fa = f(a), fb = f(b);
  if (!isFinite(fa) || !isFinite(fb)) return FC.bisect(f, a, b);
  if (fa === 0) return a;
  if (fb === 0) return b;
  if (fa * fb > 0) return NaN;
  let c = a, fc = fa, d = b - a, e = d;
  for (let i = 0; i < maxIter; i++) {
    if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
    if (Math.abs(fc) < Math.abs(fb)) { a = b; b = c; c = a; fa = fb; fb = fc; fc = fa; }
    const tol1 = 2 * Number.EPSILON * Math.abs(b) + 0.5 * tol;
    const xm = 0.5 * (c - b);
    if (Math.abs(xm) <= tol1 || fb === 0) return b;
    if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
      let s = fb / fa, p, q;
      if (a === c) { p = 2 * xm * s; q = 1 - s; }
      else {
        const qq = fa / fc, r = fb / fc;
        p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
        q = (qq - 1) * (r - 1) * (s - 1);
      }
      if (p > 0) q = -q;
      p = Math.abs(p);
      const min1 = 3 * xm * q - Math.abs(tol1 * q), min2 = Math.abs(e * q);
      if (2 * p < Math.min(min1, min2)) { e = d; d = p / q; } else { d = xm; e = d; }
    } else { d = xm; e = d; }
    a = b; fa = fb;
    b += Math.abs(d) > tol1 ? d : (xm > 0 ? tol1 : -tol1);
    fb = f(b);
    if (!isFinite(fb)) return FC.bisect(f, Math.min(a, c), Math.max(a, c));
  }
  return b;
};
