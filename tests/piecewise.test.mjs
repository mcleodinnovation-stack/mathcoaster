import { loadEngine, check, near, summary } from './harness.mjs';

const { FCMath: M } = loadEngine(['00-util.js', '01-math.js']);
const P0 = {};
const ev = (ast, x, P = P0) => M.compile(ast, P)(x);

// --- parsing --------------------------------------------------------------------
const src = '{2x + 1 if 0 <= x < 2; -(x - 4)^2 + 9 if 2 <= x < 6; 0.5x + 2 if 6 <= x <= 10}';
const r = M.parse(src);
check('pw parses', r.ok && r.ast.type === 'piecewise' && r.ast.pieces.length === 3, r.error);
check('pw value piece 1', ev(r.ast, 1) === 3);
check('pw value at joint uses the closed piece', ev(r.ast, 2) === -((2 - 4) ** 2) + 9);
check('pw value piece 3', ev(r.ast, 10) === 7);
check('pw outside is undefined', Number.isNaN(ev(r.ast, 10.5)) && Number.isNaN(ev(r.ast, -0.1)));

const variants = [
  ['f(x) = {x^2, x < 2; 6 - x, x >= 2}', [[1, 1], [3, 3]]],
  ['{x^2 for 0 ≤ x < 2; 6 - x for 2 ≤ x ≤ 6}', [[1, 1], [5, 1]]],
  ['{ x if x > 0 and x <= 3 ; 3 if 3 < x }', [[2, 2], [5, 3]]],
  ['{1 if 2 < x; -1 if x <= 2}', [[3, 1], [2, -1]]],
  ['{sin(x) if 0 <= x < pi; 0 if pi <= x <= 2pi}', [[Math.PI / 2, 1], [4, 0]]],
  ['{k - x if 2 <= x <= 6; x^2 if 0 <= x < 2}', [[1, 1], [3, -2]]],
  ['{2x: 0 <= x < 1; 2: 1 <= x <= 3}', [[0.5, 1], [2, 2]]],
];
for (const [s, pts] of variants) {
  const q = M.parse(s);
  let ok = q.ok;
  if (ok) for (const [x, y] of pts) if (!near(ev(q.ast, x, { k: 1 }), y, 1e-9)) ok = false;
  check('variant ' + s, ok, q.ok ? pts.map(([x]) => ev(q.ast, x, { k: 1 })) : q.error);
}
check('params across pieces', JSON.stringify(M.parse('{k - x if 2 <= x <= 6; a x^2 if 0 <= x < 2}').params) === '["a","k"]');

const bad = ['{2x; 3}', '{2x if x = 3}', '{2x if 0 <= x < ; 3 if 2 <= x}', '{2x if 0 <= y < 2}', '{if 0 <= x < 2}', '{2x if x = 3}', '{2x if 0 < x < 1 < 3}', '{2 x^ if 0 <= x < 1}'];
for (const b of bad) {
  const q = M.parse(b);
  check('should fail: ' + b, !q.ok, q.ok ? M.toText(q.ast) : '');
  if (!q.ok && process.env.SHOW) console.log(b, '→', q.error);
}
// braces used as parentheses still work
check('braces as parens', M.parse('{x+1}*2').ok && ev(M.parse('{x+1}*2').ast, 1) === 4);

// --- printing -------------------------------------------------------------------
const t = M.toText(r.ast);
check('toText canonical', t === '{2x + 1 if 0 <= x < 2; -(x - 4)^2 + 9 if 2 <= x < 6; 0.5x + 2 if 6 <= x <= 10}', t);
const r2 = M.parse(t);
check('toText round trip', r2.ok && [0.5, 2, 3.3, 6, 9.9].every((x) => ev(r2.ast, x) === ev(r.ast, x)));
const h = M.toHTML(r.ast), hs = M.toHTML(r.ast, { stacked: true });
check('html inline', /m-pw-inline/.test(h) && (h.match(/m-pw-dot/g) || []).length === 3);
check('html stacked', /m-pw-brace/.test(hs) && (hs.match(/m-pw-row"/g) || []).length === 3);
check('one-sided text', M.toText(M.parse('{x^2 if x < 2; 6 - x if x >= 2}').ast) === '{x^2 if x < 2; 6 - x if x >= 2}');

// --- compilePW ----------------------------------------------------------------------
const info = M.compilePW(M.parse('{3 if 4 <= x <= 6; x if 0 <= x < 4}').ast, {});
check('compilePW sorts by start', info.sorted[0].lo === 0 && info.sorted[1].lo === 4 && info.sorted[0].k === 1);
check('pieceAt', info.pieceAt(4).k === 0 && info.pieceAt(3.9).k === 1 && info.pieceAt(7) === null);
check('poly pieces', JSON.stringify(info.pieces[1].coeffs) === '[0,1]');

// --- transformations -------------------------------------------------------------------
const base = M.parse('{x if 0 <= x < 4; 8 - x if 4 <= x <= 8}').ast;
const up = M.simplify(M.N.add(M.clone(base), M.N.num(2)));
check('shift up distributes', M.toText(up) === '{x + 2 if 0 <= x < 4; 8 - x + 2 if 4 <= x <= 8}', M.toText(up));
const right = M.substitute(base, M.N.sub(M.N.x(), M.N.num(1)));
check('shift right moves intervals', M.toText(M.simplify(right)) === '{x - 1 if 1 <= x < 5; 8 - (x - 1) if 5 <= x <= 9}', M.toText(M.simplify(right)));
const wide = M.substitute(base, M.N.div(M.N.x(), M.N.num(3)));
const wt = M.toText(M.simplify(wide));
check('stretch ×3 moves intervals', /0 <= x < 12/.test(wt) && /12 <= x <= 24/.test(wt), wt);
const mir = M.substitute(base, M.N.neg(M.N.x()));
const mt = M.toText(M.simplify(mir));
check('mirror flips intervals and endpoints', mt === '{8 - -x if -8 <= x <= -4; -x if -4 < x <= 0}' || /-8 <= x <= -4/.test(mt) && /-4 < x <= 0/.test(mt), mt);
const mirAst = M.simplify(mir);
check('mirror values', [-7, -4, -2, 0].every((x) => near(ev(mirAst, x), ev(base, -x), 1e-12)));
const sq = M.simplify(M.N.mul(M.N.num(0.5), M.clone(base)));
check('scale distributes', near(ev(sq, 6), 1) && sq.type === 'piecewise');
const ab = M.simplify(M.N.func('abs', M.N.sub(M.clone(base), M.N.num(5))));
check('abs distributes', ab.type === 'piecewise' && ev(ab, 1) === 4 && ev(ab, 7) === 4);
const cls = M.classify(base, {}, null);
check('classify piecewise', cls.family === 'piecewise' && cls.label === 'Piecewise · 2 pieces' && cls.pieceFamilies[0].name === 'linear', cls);
check('not a polynomial', M.toPoly(base, {}) === null);


// ======================================================================= analysis & physics
{
  const E = loadEngine();
  const { FCMath: MM, FCAnalysis: A, FCPhysics: PH } = E;
  const setup = (src, P = {}) => {
    const r = MM.parse(src);
    if (!r.ok) throw new Error(r.error);
    const chk = A.pwCheck(r.ast, P);
    const fn = MM.compile(r.ast, P);
    const an = A.analyze({ fn, a: chk.domain.lo, b: chk.domain.hi, coeffs: null, ast: r.ast, P });
    const S = an.ok ? PH.autoScale(an) : 10;
    const track = an.ok ? PH.buildTrack(an, fn, { Sx: S, Sy: S }) : null;
    return { r, chk, an, track };
  };
  const ride = (track, opts = { mode: 'lift', vLift: 6 }) => { const sim = new PH.Sim(track, opts); while (!sim.done && sim.t < 300) { sim.step(1 / 240); sim.drainEvents(); } return sim.stats; };
  const kinds = (chk) => chk.joints.map((j) => j.kind).join(',');

  // smooth: all joints match height and slope
  const smooth = setup('{x if 0 <= x < 4; -0.125(x - 8)^2 + 6 if 4 <= x < 12; -x + 16 if 12 <= x < 14; 0.125(x - 18)^2 if 14 <= x <= 18}');
  check('smooth joints', kinds(smooth.chk) === 'smooth,smooth,smooth' && !smooth.chk.errors.length, kinds(smooth.chk));
  check('smooth one segment, no corners', smooth.an.segments.length === 1 && smooth.an.corners.length === 0, [smooth.an.segments.length, smooth.an.corners]);
  check('smooth hilltop (8, 6)', smooth.an.maxima.length === 1 && near(smooth.an.maxima[0].x, 8, 1e-6) && near(smooth.an.maxima[0].y, 6, 1e-9), smooth.an.maxima);
  check('smooth zeros at ends', smooth.an.zeros.length === 2 && near(smooth.an.zeros[0].x, 0, 1e-9) && near(smooth.an.zeros[1].x, 18, 1e-6), smooth.an.zeros.map((z) => z.x));
  const st1 = ride(smooth.track);
  check('smooth ride: station, no corners, safe', st1.outcome === 'station' && st1.cornerHits === 0 && st1.maxG <= 5 && st1.minG >= -1.5, [st1.outcome, st1.cornerHits, st1.maxG, st1.minG]);
  check('smooth joint landmarks', smooth.an.landmarks.filter((l) => l.type === 'joint').length === 3);

  // zigzag: continuous with corners
  const zig = setup('{2x if 0 <= x < 3; -x + 9 if 3 <= x < 6; 0.75x - 1.5 if 6 <= x < 8; -1.5x + 16.5 if 8 <= x <= 11}');
  check('zigzag corners', kinds(zig.chk) === 'corner,corner,corner', kinds(zig.chk));
  check('zigzag exact corner x', zig.an.corners.length === 3 && zig.an.corners.map((c) => c.x).join() === '3,6,8', zig.an.corners.map((c) => c.x));
  check('zigzag corner peak is a max', zig.an.maxima.some((m) => m.x === 3 && m.corner));
  const st2 = ride(zig.track);
  check('zigzag ride hits 3 corners', st2.cornerHits === 3, st2.cornerHits);

  // stairs: jumps → flights that land on the next piece
  const stairs = setup('{6 if 0 <= x < 2; 4 if 2 <= x < 4; 2 if 4 <= x < 6; 0 if 6 <= x <= 8}');
  check('stairs jumps', kinds(stairs.chk) === 'jump,jump,jump', kinds(stairs.chk));
  check('stairs 4 segments', stairs.an.segments.length === 4 && stairs.an.gaps.every((g) => g.kind === 'jump'), stairs.an.gaps.map((g) => g.kind));
  check('stairs segment ends exact', near(stairs.an.segments[0].x1, 2, 1e-12) && stairs.an.segments[1].ys[0] === 4);
  const st3 = ride(stairs.track);
  check('stairs ride lands and finishes', st3.flights.length >= 1 && st3.flights.every((f) => f.landing === 'track') && st3.outcome === 'station', [st3.outcome, st3.flights.map((f) => f.landing)]);

  // find k: jump with k = 1, connected (corner) with k = 6
  const k1 = setup('{x^2 if 0 <= x < 2; k - x if 2 <= x <= 6}', { k: 1 });
  check('find k: k=1 jump of 5', k1.chk.joints[0].kind === 'jump' && near(k1.chk.joints[0].dy, -5, 1e-12));
  const k6 = setup('{x^2 if 0 <= x < 2; k - x if 2 <= x <= 6}', { k: 6 });
  check('find k: k=6 connected with a corner', k6.chk.joints[0].kind === 'corner' && k6.chk.joints[0].exact && near(k6.chk.joints[0].sL, 4, 1e-6) && near(k6.chk.joints[0].sR, -1, 1e-6), k6.chk.joints[0]);

  // tangent line continuation is smooth
  const tan = setup('{0.5x^2 if 0 <= x < 2; k*x - 2 if 2 <= x <= 4}', { k: 2 });
  check('tangent takeoff smooth', tan.chk.joints[0].kind === 'smooth', tan.chk.joints[0]);

  // gap in the domain
  const gap = setup('{x if 0 <= x < 2; 1 if 3 <= x <= 5}');
  check('gap joint', kinds(gap.chk) === 'gap' && gap.chk.warnings.length === 1);
  check('gap segments', gap.an.segments.length === 2 && gap.an.gaps.some((g) => g.kind === 'nopiece' && /no piece/.test(g.why)), gap.an.gaps);

  // not functions
  const ov = MM.parse('{x if 0 <= x < 3; 2 if 2 <= x <= 5}');
  const ovc = A.pwCheck(ov.ast, {});
  check('overlap error', ovc.errors.some((e) => e.kind === 'overlap' && e.x0 === 2 && e.x1 === 3), ovc.errors);
  const dbl = A.pwCheck(MM.parse('{x if 0 <= x <= 2; 3 if 2 <= x <= 4}').ast, {});
  check('double endpoint error', dbl.errors.some((e) => e.kind === 'double'), dbl.errors);
  const same = A.pwCheck(MM.parse('{x if 0 <= x <= 2; 2 if 2 <= x <= 4}').ast, {});
  check('shared endpoint with equal values is fine', !same.errors.length && same.joints[0].kind === 'corner');
  const empty = A.pwCheck(MM.parse('{x if 3 <= x < 1; 2 if 3 <= x <= 4}').ast, {});
  check('empty interval error', empty.errors.some((e) => e.kind === 'empty'), empty.errors);

  // hole: neither piece includes the joint
  const hole = setup('{x if 0 <= x < 2; x if 2 < x <= 4}');
  check('hole joint', hole.chk.joints[0].hole && hole.chk.joints[0].kind === 'smooth');
  check('hole bridged', hole.an.segments.length === 1, hole.an.segments.length);

  // concavity flips exactly at the joint
  const infl = setup('{x^2 if -2 <= x < 0; -x^2 if 0 <= x <= 2}');
  check('inflection at joint', infl.an.inflections.length === 1 && infl.an.inflections[0].x === 0, infl.an.inflections);
  check('x^2 / -x^2 joint is smooth', infl.chk.joints[0].kind === 'smooth');

  // transforms keep joints
  const stretched = MM.simplify(MM.substitute(smooth.r.ast, MM.N.mul(MM.N.num(0.5), MM.N.x())));
  const sc = A.pwCheck(stretched, {});
  check('stretched stays smooth', sc.joints.map((j) => j.kind).join() === 'smooth,smooth,smooth' && sc.domain.lo === 0 && sc.domain.hi === 36, [sc.joints.map((j) => j.kind), sc.domain]);
}

summary();
