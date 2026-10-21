import { loadEngine, check, near, summary } from './harness.mjs';

const { FCMath: M, FCAnalysis: A } = loadEngine(['00-util.js', '01-math.js', '02-analysis.js']);

function run(src, a, b, P = {}) {
  const r = M.parse(src);
  if (!r.ok) throw new Error(r.error);
  const fn = M.compile(r.ast, P);
  const coeffs = M.toPoly(r.ast, P);
  return A.analyze({ fn, a, b, coeffs, ast: r.ast, P });
}
const xsOf = (arr) => arr.map((p) => +p.x.toFixed(4));
const show = (label, an) => {
  if (!process.env.SHOW) return;
  console.log('\n==', label, an.ok ? '' : an.error);
  if (!an.ok) return;
  console.log(' segs', an.segments.map((s) => [+s.x0.toFixed(5), +s.x1.toFixed(5), s.startKind, s.endKind]));
  console.log(' zeros', an.zeros.map((z) => [+z.x.toFixed(5), z.kind, z.mult]), 'max', xsOf(an.maxima), 'min', xsOf(an.minima), 'infl', xsOf(an.inflections));
  console.log(' corners', xsOf(an.corners), 'gaps', an.gaps.map((g) => [+g.x0.toFixed(4), +g.x1.toFixed(4), g.kind, g.why]), 'holes', an.holes.map((h) => [h.x, h.why]));
  console.log(' range', an.yMin, an.yMax, 'yint', an.yIntercept, 'sym', an.symmetry, 'steep', an.steepest.x.toFixed(3), an.steepest.slope.toFixed(3), an.steepest.angle.toFixed(1));
  console.log(' mono', an.monotone.map((m) => [+m.x0.toFixed(3), +m.x1.toFixed(3), m.dir]), 'conc', an.concavity.map((m) => [+m.x0.toFixed(3), +m.x1.toFixed(3), m.dir]));
  console.log(' family', an.family && an.family.label, 'turning', an.turningPoints);
};

// 1. teacher's example
{
  const an = run('-2x^4 + 7x^3 - 4x^2 - 0.5x + 1', -0.40907, 2.76854);
  show('teacher', an);
  check('example ok', an.ok);
  check('example one segment', an.segments.length === 1);
  check('example 2 zeros at ends', an.zeros.length === 2 && near(an.zeros[0].x, -0.40907, 1e-4) && near(an.zeros[1].x, 2.76854, 1e-4), xsOf(an.zeros));
  check('example 2 maxima', an.maxima.length === 2 && near(an.maxima[1].x, 2.1453, 1e-3), xsOf(an.maxima));
  check('example 1 minimum', an.minima.length === 1 && near(an.minima[0].x, 0.53, 2e-2), xsOf(an.minima));
  check('example 2 inflections', an.inflections.length === 2, xsOf(an.inflections));
  check('example 3 turning points', an.turningPoints === 3);
  check('example yint 1', an.yIntercept && an.yIntercept.y === 1);
  check('example yMax ~8.27', near(an.yMax, 8.27, 2e-3), an.yMax);
  check('example family quartic', an.family.name === 'quartic');
  check('example steepest at end', an.steepest.x > 2.7 && an.steepest.angle > 85, an.steepest);
}
// 2. sqrt with undefined start
{
  const an = run('sqrt(x)', -2, 4);
  show('sqrt', an);
  check('sqrt starts at 0', an.segments.length === 1 && Math.abs(an.segments[0].x0) < 1e-9, an.segments[0].x0);
  check('sqrt gap reason', an.gaps.length === 1 && an.gaps[0].kind === 'undefined' && /square root/.test(an.gaps[0].why), an.gaps);
  check('sqrt zero at 0', an.zeros.length === 1 && Math.abs(an.zeros[0].x) < 1e-6, xsOf(an.zeros));
}
// 3. 1/x
{
  const an = run('1/x', -2, 2);
  show('1/x', an);
  check('1/x two segments', an.segments.length === 2);
  check('1/x asymptote gap', an.gaps.length === 1 && an.gaps[0].kind === 'asymptote', an.gaps);
  check('1/x odd', an.symmetry.odd === true);
  const an2 = run('1/x', -2.1, 2);
  show('1/x shifted', an2);
  check('1/x (no sample at 0) two segments', an2.segments.length === 2 && an2.gaps[0].kind === 'asymptote' && an2.gaps[0].why === 'division by zero', an2.gaps);
}
// 4. tan
{
  const an = run('tan(x) + 3', 0, 3);
  show('tan', an);
  check('tan reason', /asymptote/.test(an.gaps[0].why || ''), an.gaps[0].why);
  check('tan split', an.segments.length === 2 && an.gaps.length === 1 && an.gaps[0].x0 < Math.PI / 2 && an.gaps[0].x1 > Math.PI / 2, an.gaps);
}
// 5. floor
{
  const an = run('floor(x)', 0, 5);
  show('floor', an);
  check('floor 5 pieces', an.segments.length === 5, an.segments.length);
  check('floor jumps', an.gaps.every((g) => g.kind === 'jump'), an.gaps.map((g) => g.kind));
  check('floor jump at 1', near(an.gaps[0].x0, 1, 1e-9), an.gaps[0]);
  check('floor no spurious features', an.inflections.length === 0 && an.corners.length === 0 && an.steepest.slope === 0, [an.inflections.length, an.corners.length, an.steepest.slope]);
}
// 6. |x-2|
{
  const an = run('|x - 2|', 0, 4);
  show('abs', an);
  check('abs corner min at 2', an.minima.length === 1 && near(an.minima[0].x, 2, 1e-6) && an.minima[0].corner, an.minima);
  check('abs no inflections', an.inflections.length === 0, xsOf(an.inflections));
  check('abs form', an.absForm && an.absForm.h === 2);
}
// 7. x + |x|
{
  const an = run('x + |x|', -2, 2);
  show('x+|x|', an);
  check('kink corner', an.corners.length === 1 && Math.abs(an.corners[0].x) < 1e-4, an.corners);
}
// 8. sin
{
  const an = run('sin(x)', 0, 4 * Math.PI);
  show('sin', an);
  check('sin zeros', an.zeros.length === 5, xsOf(an.zeros));
  check('sin maxima', an.maxima.length === 2 && near(an.maxima[0].x, Math.PI / 2, 1e-7));
  check('sin minima', an.minima.length === 2);
  check('sin inflections', an.inflections.length === 3 && near(an.inflections[0].x, Math.PI, 1e-5), xsOf(an.inflections));
  check('sin sinusoid', an.sinusoid && near(an.sinusoid.period, 2 * Math.PI));
}
// 9. hole
{
  const an = run('(x^2 - 1)/(x - 1)', -2, 3);
  show('hole', an);
  check('hole bridged', an.segments.length === 1 && an.holes.length === 1 && near(an.holes[0].x, 1, 1e-3), an.holes);
}
// 10. double roots / even
{
  const an = run('0.5(x^2 - 4)^2', -3, 3);
  show('double', an);
  check('touch zeros', an.zeros.length === 2 && an.zeros.every((z) => z.kind === 'touch'), an.zeros);
  check('even', an.symmetry.even && an.symmetry.domainSymmetric);
  check('W shape', an.maxima.length === 1 && an.minima.length === 2);
}
// 11. x^3
{
  const an = run('x^3', -2, 2);
  show('x^3', an);
  check('x^3 flat spot', an.flats.length === 1 && an.turningPoints === 0);
  check('x^3 odd', an.symmetry.odd);
  check('x^3 inflection', an.inflections.length === 1);
}
// 12. ln
{
  const an = run('ln(x)', -1, 5);
  show('ln', an);
  check('ln segment', an.segments.length === 1 && an.segments[0].x0 > 0 && an.segments[0].x0 < 0.01, an.segments[0].x0);
  check('ln zero at 1', an.zeros.length === 1 && near(an.zeros[0].x, 1, 1e-9));
}
// 13. constant
{
  const an = run('3', 0, 5);
  show('const', an);
  check('const ok', an.ok && an.turningPoints === 0 && an.zeros.length === 0);
}
// 14. witch of Agnesi
{
  const an = run('8/(1 + x^2)', -5, 5);
  show('agnesi', an);
  check('agnesi max', an.maxima.length === 1 && Math.abs(an.maxima[0].x) < 1e-6);
  check('agnesi inflections', an.inflections.length === 2 && near(Math.abs(an.inflections[0].x), 1 / Math.sqrt(3), 1e-5), xsOf(an.inflections));
}
// 15. undefined everywhere
{
  const an = run('sqrt(x)', -5, -1);
  check('undefined everywhere', !an.ok && /square root/.test(an.error), an.error);
}
// 16. damped wave
{
  const an = run('5e^(-0.3x)cos(2x) + 5', 0, 12);
  show('damped', an);
  check('damped ok', an.ok && an.maxima.length >= 3);
}
// 17. -floor(x)+5 stairs down
{
  const an = run('-floor(x) + 5', 0, 4.99);
  show('stairs', an);
  check('stairs', an.segments.length === 5 && an.inflections.length === 0 && an.corners.length === 0, [an.inflections, an.corners]);
}
// 18. vertex form param
{
  const an = run('a(x-h)^2+k', -3, 5, { a: -0.5, h: 1, k: 8 });
  show('vertex', an);
  check('vertex quad', an.poly.quadratic && near(an.poly.quadratic.h, 1) && near(an.poly.quadratic.k, 8));
}
summary();
