import { loadEngine, check, near, summary } from './harness.mjs';

const { FCMath: M, FCAnalysis: A, FCPhysics: PH } = loadEngine();

function setup(src, a, b, P = {}, S) {
  const r = M.parse(src);
  const fn = M.compile(r.ast, P);
  const coeffs = M.toPoly(r.ast, P);
  const an = A.analyze({ fn, a, b, coeffs, ast: r.ast, P });
  if (!an.ok) throw new Error(an.error);
  const s = S || PH.autoScale(an);
  const track = PH.buildTrack(an, fn, { Sx: s, Sy: s });
  return { an, track, fn };
}
function ride(track, opts, maxT = 300) {
  const sim = new PH.Sim(track, opts);
  const events = [];
  while (!sim.done && sim.t < maxT) { sim.step(1 / 240); events.push(...sim.drainEvents()); }
  return { sim, stats: sim.stats, events };
}
const fmt = (st) => ({ outcome: st.outcome, t: +st.duration.toFixed(2), vmax: +st.maxSpeed.toFixed(2), maxG: +st.maxG.toFixed(2), minG: +st.minG.toFixed(2), drop: +st.maxDrop.toFixed(1), air: +st.airtime.toFixed(2), flights: st.flights.map((f) => [+f.fromX.toFixed(2), +f.toX.toFixed(2), f.landing]), rev: st.reversals, end: st.reachedEnd });

// 1. frictionless energy conservation: v at bottom = sqrt(2 g h)
{
  const { track } = setup('0.25(x - 4)^2', 0, 8, {}, 10);
  // start at height 4 units = 40 m, gravity only, no friction
  const { stats, sim } = ride(track, { mode: 'gravity', friction: false });
  const expect = Math.sqrt(0.4 * 0.4 + 2 * 9.81 * 40);
  check('energy: top speed = sqrt(2gh)', near(stats.maxSpeed, expect, 2e-3), [stats.maxSpeed, expect]);
  check('energy: frictionless oscillates, reaches other side height', stats.outcome === 'stuck' || stats.outcome === 'station' || stats.reachedEnd, fmt(stats));
  if (process.env.SHOW) console.log('valley ideal', fmt(stats));
}
// 2. G at the bottom of a parabola valley: G = 1 + v^2 κ / g
{
  const { track } = setup('0.05x^2', -10, 10, {}, 1); // world = math (meters)
  const sim = new PH.Sim(track, { mode: 'gravity', friction: false });
  let gAtBottom = null, vAtBottom = null;
  while (!sim.done && sim.t < 60) {
    const xOld = sim.pose.x;
    sim.step(1 / 480);
    if (xOld < 0 && sim.pose.x >= 0) { gAtBottom = sim.G; vAtBottom = sim.v; break; }
  }
  const kappa = 0.1; // f'' = 0.1 at the vertex
  const expectG = 1 + vAtBottom * vAtBottom * kappa / 9.81;
  check('G at valley = 1 + v²κ/g', gAtBottom !== null && near(gAtBottom, expectG, 5e-3), [gAtBottom, expectG]);
  // v at bottom = sqrt(2 g * 5)
  check('v at valley', near(vAtBottom, Math.sqrt(0.4 * 0.4 + 2 * 9.81 * 5), 3e-3), vAtBottom);
}
// 3. teacher's example with the chain lift
{
  const { track, an } = setup('-2x^4 + 7x^3 - 4x^2 - 0.5x + 1', -0.40907, 2.76854);
  const { stats, events } = ride(track, { mode: 'lift', vLift: 6, friction: true });
  if (process.env.SHOW) console.log('teacher lift', fmt(stats), 'len', track.totalLength.toFixed(1), 'S', track.Sx);
  check('example completes', stats.outcome === 'station' && stats.reachedEnd, fmt(stats));
  check('example top speed ~38-41 m/s', stats.maxSpeed > 36 && stats.maxSpeed < 41.5, stats.maxSpeed);
  check('example landmark events', events.filter((e) => e.type === 'landmark').length >= 5);
  const r = PH.ratings(stats);
  if (process.env.SHOW) console.log(' ratings', r.excitement.toFixed(2), r.intensity.toFixed(2), r.nausea.toFixed(2), r.safety);
  // gravity only: starts uphill -> rolls back
  const g = ride(track, { mode: 'gravity' });
  check('gravity-only rolls back', g.stats.outcome === 'rollback', fmt(g.stats));
  // first-lift only: can't clear the big hill -> stuck in the valley
  const f = ride(track, { mode: 'firstlift', vLift: 6 });
  if (process.env.SHOW) console.log('teacher firstlift', fmt(f.stats));
  check('first lift only cannot clear the big hill', ['stuck', 'rollback'].includes(f.stats.outcome) && !f.stats.reachedEnd, fmt(f.stats));
  const vmin = PH.minLaunchSpeed(track, { friction: true });
  if (process.env.SHOW) console.log(' min launch', vmin, 'ideal', Math.sqrt(2 * 9.81 * (track.bounds.trackMaxY - 0)));
  check('min launch above ideal', vmin > Math.sqrt(2 * 9.81 * track.bounds.trackMaxY) && vmin < 60, vmin);
  const l = ride(track, { mode: 'launch', v0: vmin * 1.02 });
  check('launch at min completes', l.stats.reachedEnd, fmt(l.stats));
  const l2 = ride(track, { mode: 'launch', v0: vmin * 0.95 });
  check('launch below min fails', !l2.stats.reachedEnd, fmt(l2.stats));
}
// 4. ends in mid-air -> flight to ground, parabola check
{
  const { track } = setup('0.5*2^x', 0, 4, {}, 10);
  const { stats, events } = ride(track, { mode: 'lift', vLift: 8 });
  if (process.env.SHOW) console.log('ramp', fmt(stats), events.find((e) => e.type === 'takeoff'));
  check('ramp flies off end', stats.flights.length === 1 && stats.flights[0].landing === 'ground' && stats.outcome === 'crash-landing', fmt(stats));
  const f = stats.flights[0];
  // landing x should be a zero of the parabola
  const p = f.parab;
  const yAtLand = p.A * (f.toX - p.h) ** 2 + p.k;
  check('landing is a zero of the flight parabola', Math.abs(yAtLand) < 1e-3, yAtLand);
  check('parabola passes through takeoff', Math.abs(p.A * (p.x0 - p.h) ** 2 + p.k - p.y0) < 1e-9);
}
// 5. stairs down: hop from step to step
{
  const { track } = setup('-floor(x) + 5', 0, 4.99, {}, 10);
  const { stats } = ride(track, { mode: 'lift', vLift: 8 });
  if (process.env.SHOW) console.log('stairs', fmt(stats));
  check('stairs hops', stats.flights.length >= 2 && stats.flights.every((f, i) => i === stats.flights.length - 1 || f.landing === 'track') && stats.reachedEnd, fmt(stats));
}
// 6. stairs up: crash into a wall
{
  const { track } = setup('floor(x)', 0.2, 4.5, {}, 10);
  const { stats } = ride(track, { mode: 'lift', vLift: 8 });
  if (process.env.SHOW) console.log('stairs up', fmt(stats));
  check('wall crash', stats.outcome === 'wall', fmt(stats));
}
// 7. |x| corner
{
  const { track } = setup('|x - 2| * 2', 0, 4, {}, 10);
  const { stats } = ride(track, { mode: 'lift' });
  if (process.env.SHOW) console.log('abs', fmt(stats), stats.cornerHits);
  check('corner hit counted', stats.cornerHits === 1, stats.cornerHits);
  check('abs G sane', stats.maxG < 5 && stats.minG > -1, [stats.maxG, stats.minG]);
}
// 8. 1/x asymptote gap
{
  const { track } = setup('1/x', -2, 2);
  const { stats } = ride(track, { mode: 'lift' });
  if (process.env.SHOW) console.log('1/x', fmt(stats));
  check('1/x ride ends', stats.outcome !== 'timeout', fmt(stats));
}
// 9. sine wave: many landmarks, finishes
{
  const { track } = setup('2sin(x) + 3', 0, 4 * Math.PI);
  const { stats } = ride(track, { mode: 'lift' });
  if (process.env.SHOW) console.log('sine', fmt(stats));
  check('sine done', stats.reachedEnd, fmt(stats));
}
// 10. flat constant track with lift -> station
{
  const { track } = setup('0', 0, 10, {}, 10);
  const { stats } = ride(track, { mode: 'lift' });
  check('flat ground track rides to station', stats.outcome === 'station', fmt(stats));
}
summary();
