import { loadEngine, check, near, summary } from './harness.mjs';

const { FCMath: M } = loadEngine(['00-util.js', '01-math.js']);

function val(src, x, P) {
  const r = M.parse(src);
  if (!r.ok) throw new Error(src + ': ' + r.error);
  return M.compile(r.ast, P || {})(x);
}

// --- parsing & evaluation --------------------------------------------------
const cases = [
  ['-2x^4 + 7x^3 - 4x^2 - 0.5x + 1', 2, -2 * 16 + 7 * 8 - 16 - 1 + 1],
  ['f(x) = x^2 - 4', 3, 5],
  ['y = 2x + 1', 3, 7],
  ['-x^2', 3, -9],
  ['2^-1', 0, 0.5],
  ['x^2^3', 2, 256],
  ['(x-1)(x+2)', 3, 10],
  ['3(x-1)^2+2', 4, 29],
  ['2sin(x)', Math.PI / 2, 2],
  ['sin x', Math.PI / 2, 1],
  ['sin 2x', Math.PI / 4, 1],
  ['sin x cos x', Math.PI / 4, 0.5],
  ['sinx', Math.PI / 2, 1],
  ['sin^2(x) + cos^2(x)', 1.234, 1],
  ['|x - 3|', 1, 2],
  ['|x-1||x+1|', 2, 3],
  ['||x| - 1|', -3, 2],
  ['2|x|', -2, 4],
  ['√x', 9, 3],
  ['2√(x+1)', 3, 4],
  ['x²', 5, 25],
  ['x³ − 2x', 2, 4],
  ['1/2x', 4, 2],
  ['x/2x', 4, 8],
  ['e^x', 1, Math.E],
  ['pi', 0, Math.PI],
  ['2pi x', 1, 2 * Math.PI],
  ['x^(1/3)', -8, -2],
  ['cbrt(x)', -27, -3],
  ['ln(e)', 0, 1],
  ['log(100)', 0, 2],
  ['log_2(8)', 0, 3],
  ['max(x, 2)', 1, 2],
  ['min(x, 2)', 1, 1],
  ['floor(x)', 2.7, 2],
  ['arcsin(1)', 0, Math.PI / 2],
  ['sin^-1(1)', 0, Math.PI / 2],
  ['asin(x)', Math.PI / 2, 1], // a·sin(x) with a = 1
  ['x(x+1)', 2, 6],
  ['2 x', 3, 6],
  ['-(x+1)', 2, -3],
  ['--x', 2, 2],
  ['x·2', 3, 6],
  ['x × 2 ÷ 4', 4, 2],
  ['0.25(x − 4)^2', 0, 4],
  ['8/(1 + x^2)', 1, 4],
  ['5e^(-0.3x)cos(2x) + 5', 0, 10],
  ['[x+1]*{x-1}', 3, 8],
];
for (const [src, x, expect] of cases) {
  let got;
  try { got = val(src, x); } catch (e) { check(src, false, e.message); continue; }
  check(src, near(got, expect, 1e-9), `got ${got}, expected ${expect}`);
}

// params
{
  const r = M.parse('a(x - h)^2 + k');
  check('params found', r.ok && r.params.join(',') === 'a,h,k', r.params);
  const f = M.compile(r.ast, { a: 2, h: 1, k: 3 });
  check('param eval', f(3) === 11, f(3));
}

// errors
const bad = ['', 'x^', '2x +', '(x+1', 'x+1)', 'sin()', 'y + 2', 'x = 2', '3 $ x', '|x', 'max(x)', '1..2'];
for (const src of bad) {
  const r = M.parse(src);
  check('should fail: ' + src, !r.ok, r.ok ? M.toText(r.ast) : '');
  if (!r.ok && process.env.SHOW) console.log(JSON.stringify(src), '→', r.error);
}

// --- printing round trip ----------------------------------------------------
const rt = ['-2x^4 + 7x^3 - 4x^2 - 0.5x + 1', '(x-1)(x+2)', '2sin(3x - 1) + 4', '|x - 3| + 1', 'sqrt(x + 1)/2', '1/(x^2 + 1)', '-(x+2)^3', 'e^(-x^2)', 'x*sin(x)', '2^x - x^2', 'a(x-h)^2+k', '3/(2x)', 'log_2(x)', '-x^-2', '(1/2)x'];
for (const src of rt) {
  const r = M.parse(src);
  const t = M.toText(r.ast);
  const r2 = M.parse(t);
  let ok = r2.ok;
  if (ok) {
    for (const x of [0.3, 1.7, 2.9]) {
      const P = { a: 1.5, h: 0.5, k: -1 };
      const v1 = M.compile(r.ast, P)(x), v2 = M.compile(r2.ast, P)(x);
      if (!(Number.isNaN(v1) && Number.isNaN(v2)) && !near(v1, v2, 1e-9)) ok = false;
    }
  }
  check('roundtrip ' + src + ' → ' + t, ok);
  if (process.env.SHOW) console.log(src, '→', t, '|', M.toHTML(r.ast));
}

// --- polynomials -------------------------------------------------------------
{
  const r = M.parse('-2x^4 + 7x^3 - 4x^2 - 0.5x + 1');
  const c = M.toPoly(r.ast, {});
  check('poly coeffs', JSON.stringify(c) === JSON.stringify([1, -0.5, -4, 7, -2]), c);
  const roots = M.poly.analyzeRoots(c);
  check('two real roots', roots.real.length === 2, roots);
  check('root near -0.40907', near(roots.real[0].x, -0.40907, 1e-4), roots.real[0]);
  check('root near 2.76854', near(roots.real[1].x, 2.76854, 1e-4), roots.real[1]);
  check('one complex pair', roots.complex.length === 1, roots.complex);
  if (process.env.SHOW) console.log(roots);
}
{
  const c = M.toPoly(M.parse('(x-1)^2(x+2)').ast);
  const roots = M.poly.analyzeRoots(c);
  check('double root', roots.real.length === 2 && roots.real[1].mult === 2 && roots.real[1].x === 1 && roots.real[0].x === -2, JSON.stringify(roots.real));
}
{
  const c = M.toPoly(M.parse('(x-1)^3 (x+1)').ast);
  const roots = M.poly.analyzeRoots(c);
  check('triple root', roots.real.length === 2 && roots.real[1].mult === 3 && near(roots.real[1].x, 1, 1e-8), JSON.stringify(roots.real));
}
{
  const c = M.toPoly(M.parse('0.5(x^2 - 4)^2').ast);
  const roots = M.poly.analyzeRoots(c);
  check('two double roots', roots.real.length === 2 && roots.real.every((r) => r.mult === 2) && near(roots.real[0].x, -2) && near(roots.real[1].x, 2), JSON.stringify(roots.real));
}
{
  const c = M.poly.fromRoots([-3, -1.5, 0, 2, 3.5, 4], 0.1);
  const roots = M.poly.analyzeRoots(c);
  check('six roots', roots.real.length === 6 && near(roots.real[1].x, -1.5, 1e-9) && roots.real[2].x === 0, JSON.stringify(roots.real));
}
check('not poly: sin', M.toPoly(M.parse('sin(x)').ast) === null);
check('not poly: 1/x', M.toPoly(M.parse('1/x').ast) === null);
check('poly: x/2', JSON.stringify(M.toPoly(M.parse('x/2').ast)) === '[0,0.5]');
check('poly text', M.poly.toText([1, -0.5, -4, 7, -2]) === '-2x^4 + 7x^3 - 4x^2 - 0.5x + 1', M.poly.toText([1, -0.5, -4, 7, -2]));

// --- structure detection ---------------------------------------------------------
{
  const s = M.sinusoid(M.parse('3sin(2x - 1) + 4').ast, {});
  check('sinusoid', s && s.amplitude === 3 && near(s.period, Math.PI) && s.midline === 4 && near(s.phaseShift, 0.5), s);
  const s2 = M.sinusoid(M.parse('-2cos(pi/2 x)').ast, {});
  check('cosine', s2 && s2.amplitude === 2 && near(s2.period, 4), s2);
  const a = M.absForm(M.parse('-2|x - 3| + 5').ast, {});
  check('abs form', a && a.h === 3 && a.k === 5 && a.A === -2, a);
  const e = M.expForm(M.parse('3(0.5)^x + 1').ast, {});
  check('exp form', e && e.factor === 0.5 && e.D === 1 && !e.growth, e);
  const cl = M.classify(M.parse('2sin(x)+1').ast, {}, null);
  check('classify sinusoid', cl.name === 'sinusoidal', cl);
  const cl2 = M.classify(M.parse('1/(x-2)').ast, {}, null);
  check('classify rational', cl2.family === 'rational', cl2);
}

// --- transforms ---------------------------------------------------------------------
{
  const f = M.parse('x^2 + 1').ast;
  const shifted = M.substitute(f, M.N.sub(M.N.x(), M.N.num(2)));
  check('substitute text', M.toText(shifted) === '(x - 2)^2 + 1', M.toText(shifted));
  const up = M.simplify(M.N.add(f, M.N.num(2)));
  check('simplify fold', M.toText(up) === 'x^2 + 3', M.toText(up));
  const neg = M.simplify(M.N.mul(M.N.num(-1), f));
  check('simplify neg', M.toText(neg) === '-(x^2 + 1)', M.toText(neg));
}

summary();
