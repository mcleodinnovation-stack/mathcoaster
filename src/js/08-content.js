/* =====================================================================
   FCContent — presets, missions, match challenges, glossary, names
   ===================================================================== */
var FCContent = (function () {
  const PRESETS = [
    { name: "Teacher's Classic", f: '-2x^4 + 7x^3 - 4x^2 - 0.5x + 1', a: '-0.40907', b: '2.76854', tags: ['quartic', 'zeros', 'turning points'], blurb: 'Starts and ends at zeros, with 3 turning points — the most a degree-4 polynomial can have. Can you make it safe to ride?' },
    { name: 'Gentle Giant', f: '-0.02(x - 20)^2 + 8', a: '0', b: '40', tags: ['quadratic', 'vertex form', 'safe'], blurb: 'A wide parabola: vertex (20, 8), zeros at 0 and 40. Wide curves = comfortable G-forces.' },
    { name: 'Vertex Form Lab', f: 'a(x - h)^2 + k', a: '-4', b: '4', params: { a: -0.5, h: 0, k: 8 }, tags: ['quadratic', 'sliders'], blurb: 'Drag the a, h and k sliders and watch the track transform.' },
    { name: 'Tunnel & Tower', f: '-0.01x(x - 10)(x - 20)', a: '0', b: '20', tags: ['cubic', 'factored form', 'underground'], blurb: 'Factored form shows the zeros: 0, 10 and 20. Between 0 and 10 the outputs are negative — tunnel time!' },
    { name: 'Double Dip', f: '0.5x^4 - 4x^2 + 8', a: '-2', b: '2', tags: ['quartic', 'even', 'double zeros'], blurb: 'Even function, mirror image across the y-axis. It starts and ends on double zeros at x = ±2, where it just touches the ground. Very intense!' },
    { name: 'Sine Sidewinder', f: '1.5 - 1.5cos(0.5x)', a: '0', b: '8pi', tags: ['sinusoid', 'period', 'amplitude'], blurb: 'Amplitude 1.5, period 4π, midline y = 1.5. Every valley touches the ground. Two full waves.' },
    { name: 'Wave Lab', f: 'a sin(b x) + c', a: '0', b: '20', params: { a: 2, b: 0.5, c: 3 }, tags: ['sinusoid', 'sliders'], blurb: 'Amplitude a, period 2π/b, midline c — slide them around.' },
    { name: 'Bell Curve Hill', f: '8/(1 + 0.04x^2)', a: '-15', b: '15', tags: ['rational', 'even'], blurb: 'A rational function that never touches the ground: y → 0 as x → ±∞ (a horizontal asymptote).' },
    { name: 'Quintic Quake', f: '0.1x(x^2 - 4)(x^2 - 9)', a: '-3', b: '3', tags: ['quintic', 'odd', '5 zeros'], blurb: 'Degree 5 with 5 zeros and 4 turning points. Odd function: symmetric about the origin. Wild G-forces!' },
    { name: 'Sky Jump', f: '0.5*2^x', a: '0', b: '4', tags: ['exponential', 'flight'], blurb: 'Exponential growth that ends in mid-air… the coaster flies off along a parabola! Try the 🚀 Launch start.' },
    { name: 'Square Root Slide', f: '6 - 2sqrt(x)', a: '0', b: '9', tags: ['radical', 'vertical start'], blurb: 'At x = 0 the slope is undefined — the track starts straight down!' },
    { name: 'Stair Hopper', f: '-floor(x) + 5', a: '0', b: '4.99', tags: ['step', 'discontinuity'], blurb: 'A step function: flat pieces with jumps between them. The coaster has to hop down the stairs.' },
    { name: 'Tangent Trouble', f: 'tan(x) + 3', a: '0', b: '3', tags: ['trig', 'asymptote'], blurb: 'tan(x) has a vertical asymptote at x = π/2 ≈ 1.571. Mind the gap!' },
    { name: 'The V', f: '2|x - 3| + 1', a: '0', b: '6', tags: ['absolute value', 'corner'], blurb: 'Absolute value makes a V with a sharp corner at the vertex (3, 1). Ouch!' },
    { name: 'Damped Wiggle', f: '4e^(-0.08x)cos(0.25x) + 5', a: '0', b: '40', tags: ['exponential', 'trig'], blurb: 'The waves shrink as x grows: exponential decay times a cosine. Each hill is lower than the one before.' },
    { name: 'Camelback Parade', f: '3cos(0.3x) + 0.1x + 4', a: '0', b: '42', tags: ['trig', 'linear'], blurb: 'A cosine riding on a tilted line: the midline is y = 0.1x + 4. Big, smooth camelback hills.' },
  ];

  /** Piecewise examples: f is written in the app's piecewise syntax. a/b are filled in from the pieces. */
  const PW_PRESETS = [
    { name: 'Tangent Ramp', f: '{0.5x^2 if 0 <= x < 2; 2x - 2 if 2 <= x < 4; -0.5(x - 6)^2 + 8 if 4 <= x <= 10}', tags: ['smooth joints', 'tangent line'], blurb: 'A curve, then its tangent line, then a parabola. Every joint matches in height AND slope, so the ride is smooth.' },
    { name: 'Smooth Operator', f: '{x if 0 <= x < 4; -0.125(x - 8)^2 + 6 if 4 <= x < 12; -x + 16 if 12 <= x < 14; 0.125(x - 18)^2 if 14 <= x <= 18}', tags: ['4 pieces', 'smooth', 'ground to ground'], blurb: 'Lift ramp, parabolic hill, straight drop, pull-out valley. Built the way real coasters are: every joint smooth.' },
    { name: 'Linear Zigzag', f: '{2x if 0 <= x < 3; -x + 9 if 3 <= x < 6; 0.75x - 1.5 if 6 <= x < 8; -1.5x + 16.5 if 8 <= x <= 11}', tags: ['linear pieces', 'corners'], blurb: 'Every joint connects… but straight pieces always meet at sharp corners. Ouch! Can you smooth them out?' },
    { name: 'Stair Steps', f: '{6 if 0 <= x < 2; 4 if 2 <= x < 4; 2 if 4 <= x < 6; 0 if 6 <= x <= 8}', tags: ['step function', 'jumps'], blurb: 'Constant pieces make a step function. Each joint is a jump discontinuity — the train hops down the stairs.' },
    { name: 'Find k!', f: '{x^2 if 0 <= x < 2; k - x if 2 <= x <= 6}', params: { k: 1 }, tags: ['find k', 'continuity'], blurb: 'Drag the k slider until the pieces connect. Hint: set the two formulas equal at x = 2.' },
    { name: 'Tangent Takeoff', f: '{0.5x^2 if 0 <= x < 2; k*x - 2 if 2 <= x <= 4}', params: { k: 1 }, tags: ['find k', 'smooth'], blurb: 'Which k makes the straight piece continue the curve smoothly? (It\'s the tangent line!) Then enjoy the jump off the end.' },
    { name: 'Absolute V', f: '{-2x + 6 if 0 <= x < 3; 2x - 6 if 3 <= x <= 6}', tags: ['absolute value', 'corner'], blurb: 'This is 2|x − 3| written as two pieces. Absolute value IS a piecewise function.' },
    { name: 'Gap Jump', f: '{-0.5x + 6 if 0 <= x < 6; -0.5x + 5 if 8 <= x <= 10}', tags: ['gap', 'flight'], blurb: 'No piece covers 6 < x < 8. Will the train fly far enough to land on the next piece?' },
    { name: 'Mix & Match', f: '{0.125x^2 if 0 <= x < 4; x - 2 if 4 <= x < 6; 4 + 2sin(0.5(x - 6)) if 6 <= x < 6 + 2pi; 0.0625(x - 14 - 2pi)^2 if 6 + 2pi <= x <= 14 + 2pi}', tags: ['quadratic', 'linear', 'sine', 'smooth'], blurb: 'Three different kinds of functions, joined smoothly — even the sine wave starts with the right slope.' },
    { name: 'Stairway Crash', f: '{1 if 0 <= x < 2; 2 if 2 <= x < 4; 3 if 4 <= x <= 6}', tags: ['step function', 'crash'], blurb: 'Stairs going UP. A coaster can fly down a jump… but what happens at a step up?' },
  ];
  PW_PRESETS.forEach((p) => { p.piecewise = true; p.a = ''; p.b = ''; });

  // ctx = { an, poly, ride (stats), ratings, meta, fnText }
  const MISSIONS = [
    { id: 'first-ride', icon: '🎢', title: 'First Ride', concept: 'Getting started', desc: 'Ride any track all the way to the end.', hint: 'Press ▶ Ride! If the train gets stuck, try the ⛓️ chain lift start.', when: 'ride', check: (c) => c.ride && c.ride.reachedEnd },
    {
      id: 'ground-to-ground', icon: '🟢', title: 'Ground to Ground', concept: 'Zeros', desc: 'Start AND end your track at ground level: f(start) = 0 and f(end) = 0.', hint: 'Use two zeros of your function as the domain. The ⤓0 button snaps the ends to the nearest zeros.', when: 'build',
      check: (c) => { const an = c.an, tol = 2e-3 * Math.max(1, an.yMax - an.yMin); return an.fa !== null && an.fb !== null && Math.abs(an.fa) <= tol && Math.abs(an.fb) <= tol && an.yMax - an.yMin > 0.1; },
    },
    { id: 'y-int', icon: '🔷', title: 'Station at 3', concept: 'y-intercept', desc: 'Make a track that crosses the y-axis at exactly y = 3.', hint: 'The y-intercept is f(0). In y = mx + b it is b; in a polynomial it is the constant term.', when: 'build', check: (c) => c.an.yIntercept && Math.abs(c.an.yIntercept.y - 3) < 5e-4 },
    {
      id: 'underground', icon: '🚇', title: 'Subway Surfer', concept: 'Negative outputs', desc: 'Make the track dip below ground (f(x) < 0) between two zeros and come back up.', hint: 'Shift a curve down (− k) or use factored form with zeros inside your domain, like (x − 1)(x − 3).', when: 'build',
      check: (c) => { const z = c.an.zeros; for (let i = 0; i < z.length - 1; i++) { const m = (z[i].x + z[i + 1].x) / 2; const y = c.fn(m); if (isFinite(y) && y < 0) return true; } return false; },
    },
    { id: 'three-hills', icon: '⛰️', title: 'Triple Threat', concept: 'Local maxima', desc: 'Build a track with at least 3 hilltops (local maxima).', hint: 'Waves have lots of hilltops: try a sine function over a wide domain.', when: 'build', check: (c) => c.an.maxima.length >= 3 },
    { id: 'max-turns', icon: '🔄', title: 'Maxed Out', concept: 'Degree & turning points', desc: 'Use a polynomial of degree 3 or more with the MOST turning points possible: degree − 1.', hint: 'A degree-n polynomial has at most n − 1 turning points. Factored form with n different zeros usually maxes it out.', when: 'build', check: (c) => c.poly && c.poly.degree >= 3 && c.an.turningPoints === c.poly.degree - 1 },
    { id: 'vertex', icon: '🎯', title: 'Vertex Vision', concept: 'Vertex form', desc: 'Build a quadratic whose vertex is at (2, −3).', hint: 'In vertex form a(x − h)² + k, the vertex is (h, k).', when: 'build', check: (c) => c.poly && c.poly.quadratic && Math.abs(c.poly.quadratic.h - 2) < 1e-6 && Math.abs(c.poly.quadratic.k + 3) < 1e-6 },
    { id: 'mirror', icon: '🪞', title: 'Mirror Mirror', concept: 'Even functions', desc: 'Build an even-function track — symmetric about the y-axis — on a domain like [−c, c].', hint: 'Even functions satisfy f(−x) = f(x). Only even powers of x work: x², x⁴, and constants. cos(x) and |x| are even too!', when: 'build', check: (c) => c.an.symmetry.even && c.an.symmetry.domainSymmetric && c.an.yMax - c.an.yMin > 0.1 },
    { id: 'speed-demon', icon: '⚡', title: 'Speed Demon', concept: 'Energy & height', desc: 'Reach a top speed of at least 30 m/s (67 mph).', hint: 'Speed comes from dropping: v = √(2gh). You need roughly a 46 m drop — 4.6 units at 10 m per unit.', when: 'ride', check: (c) => c.ride && c.ride.maxSpeed >= 30 },
    { id: 'floater', icon: '🪂', title: 'Float Like a Feather', concept: 'Concave down = airtime', desc: 'Get at least 1 second of floating (G below 0.3).', hint: 'Hilltops that bend downward (concave down) make you feel light — especially if you go over them fast.', when: 'ride', check: (c) => c.ride && c.ride.floatTime >= 1 },
    { id: 'safe-thrill', icon: '🦺', title: 'Safety Inspector Approved', concept: 'Shape & G-forces', desc: 'Excitement 5+ and safe G-forces: max ≤ 5 G, min ≥ −1.5 G, no sharp corners, reaches the end.', hint: 'Tight valleys crush riders. Stretch horizontally (the ↔ remix) or squash vertically (½·f(x)) to make curves gentler.', when: 'ride', check: (c) => c.ride && c.ratings && c.ratings.excitement >= 5 && c.ride.maxG <= 5 && c.ride.minG >= -1.5 && !c.ride.cornerHits && c.ride.reachedEnd },
    { id: 'sky-jump', icon: '🚀', title: 'Sky Jump', concept: 'Parabolas & projectiles', desc: 'End your track in mid-air so the coaster flies off and lands at least 3 units past the end.', hint: 'Make the track end high and going up — then launch it fast. The flight path is a parabola!', when: 'ride', check: (c) => c.ride && c.ride.flights.some((f) => f.offEnd && f.distance >= 3) },
    { id: 'mind-gap', icon: '🕳️', title: 'Mind the Gap', concept: 'Domain & discontinuities', desc: 'Build a track with a break in it — a jump, a hole or a vertical asymptote.', hint: 'Try 1/(x − 2), floor(x) or tan(x).', when: 'build', check: (c) => c.an.gaps.some((g) => !g.edge) || c.an.holes.length > 0 },
    { id: 'transformer', icon: '🧬', title: 'Transformer', concept: 'Transformations', desc: 'Build a new track with one of the Remix transformations.', hint: 'Open the 🧬 Remix tab and pick any card.', when: 'build', check: (c) => c.meta.usedMutation },
    { id: 'wave-rider', icon: '🌊', title: 'Wave Rider', concept: 'Sinusoids (Algebra 2)', desc: 'Build a sine or cosine track with amplitude 3 and period 4π.', hint: 'In A·sin(Bx) + D: amplitude = |A| and period = 2π ÷ |B|.', when: 'build', check: (c) => c.an.sinusoid && Math.abs(c.an.sinusoid.amplitude - 3) < 1e-6 && Math.abs(c.an.sinusoid.period - 4 * Math.PI) < 1e-6 },
    {
      id: 'zero-hero', icon: '0️⃣', title: 'Zero Hero', concept: 'Factored form', desc: 'Build a polynomial whose real zeros are exactly x = −1, 2 and 4.', hint: 'Factored form: a(x − r₁)(x − r₂)(x − r₃). A zero at −1 comes from the factor (x + 1).', when: 'build',
      check: (c) => { if (!c.poly) return false; const r = c.poly.realRoots.map((q) => q.x); return r.length === 3 && [-1, 2, 4].every((t, i) => Math.abs(r[i] - t) < 1e-6); },
    },
    { id: 'slider', icon: '🎚️', title: 'Slider Scientist', concept: 'Families of functions', desc: 'Use a parameter letter (like a, h or k) and drag its slider.', hint: 'Type a(x − h)^2 + k — sliders appear for a, h and k.', when: 'build', check: (c) => c.meta.usedSlider },
    { id: 'fortune', icon: '🔮', title: 'Fortune Teller', concept: 'Energy & height', desc: 'Predict where the coaster will be fastest — within 5% of the track\'s width.', hint: 'Turn on 🔮 Predict first. Think about energy: where is the track lowest after the biggest drop?', when: 'ride', check: (c) => c.meta.predictionGreat },
    { id: 'gentle', icon: '🌱', title: 'Gentle Giant', concept: 'Slope', desc: 'Build a hill at least 4 units tall where every slope stays between −1 and 1 (never steeper than 45°).', hint: 'Slope = rise ÷ run. Stretch a hill horizontally — like −0.05(x − 10)^2 + 5 — to make every slope smaller.', when: 'build', check: (c) => c.an.maxima.length >= 1 && c.an.yMax - c.an.yMin >= 4 && Math.abs(c.an.steepest.slope) <= 1 && !c.an.gaps.length },
    { id: 'match-5', icon: '🎯', title: 'Track Matcher', concept: 'Graph ↔ equation', desc: 'Complete 5 Match-the-Track challenges.', hint: 'Look for key points: vertex, zeros, y-intercept. Then choose a form that shows them.', when: 'any', check: (c) => c.meta.matchesDone >= 5 },
    // ---- piecewise
    { id: 'pw-3', icon: '🧩', title: 'Piece by Piece', concept: 'Piecewise functions', desc: 'Build a coaster from at least 3 pieces.', hint: 'Switch to 🧩 Pieces at the top and press ＋ Add a piece.', when: 'build', check: (c) => c.an.pw && c.an.pw.pieces.length >= 3 },
    { id: 'pw-connected', icon: '🔗', title: 'Seamless', concept: 'Continuity', desc: 'Every joint connects: each piece starts at the height where the one before it ends.', hint: 'Plug the joint x into both formulas — the answers must match. The joint checker turns green ✓ when they do.', when: 'build', check: (c) => c.an.pw && c.an.joints.length >= 1 && c.an.joints.every((j) => j.kind === 'smooth' || j.kind === 'corner') },
    { id: 'pw-smooth', icon: '🧈', title: 'Butter Smooth', concept: 'Smooth joints', desc: 'Every joint connects AND has matching slopes on both sides — no sharp corners.', hint: 'A line that continues a curve smoothly is its tangent line. Try the Tangent Ramp example.', when: 'build', check: (c) => c.an.pw && c.an.joints.length >= 1 && c.an.joints.every((j) => j.kind === 'smooth') },
    { id: 'pw-steps', icon: '🪜', title: 'Stair Master', concept: 'Step functions', desc: 'Build a step function: at least 3 pieces that are all constants.', hint: 'Constant pieces like 6, 4, 2 make flat steps.', when: 'build', check: (c) => c.an.pw && c.an.pw.pieces.length >= 3 && c.an.pw.pieces.every((p) => p.coeffs && FCMath.poly.degree(p.coeffs) === 0) },
    { id: 'pw-k', icon: '🔑', title: 'The Missing k', concept: 'Solving for continuity', desc: 'Use a letter like k in a piece and choose its value so that every joint connects.', hint: 'Load the “Find k!” example. Set both formulas equal at the joint and solve for k.', when: 'build', check: (c) => c.an.pw && c.params.length > 0 && c.an.joints.length >= 1 && c.an.joints.every((j) => j.kind === 'smooth' || j.kind === 'corner') },
    { id: 'pw-leap', icon: '🦘', title: 'Leap of Faith', concept: 'Jump discontinuities', desc: 'Ride a piecewise coaster that flies over a jump or a gap and lands on the next piece.', hint: 'Make a piece end higher than the next one starts — or leave a gap between pieces.', when: 'ride', check: (c) => c.an.pw && c.ride && c.ride.flights.some((f) => f.landing === 'track') },
    { id: 'pw-safe', icon: '🏗️', title: 'Master Builder', concept: 'Piecewise design', desc: 'A coaster with 3+ pieces that passes the Safety Inspector: excitement 5+, max ≤ 5 G, min ≥ −1.5 G, no corners.', hint: 'Smooth joints are a must. Start from Smooth Operator and make it your own.', when: 'ride', check: (c) => c.an.pw && c.an.pw.pieces.length >= 3 && c.ride && c.ratings && c.ratings.excitement >= 5 && c.ride.maxG <= 5 && c.ride.minG >= -1.5 && !c.ride.cornerHits && c.ride.reachedEnd },
    { id: 'pw-mix', icon: '🎭', title: 'Mix & Match', concept: 'Function families', desc: 'Use at least 3 different kinds of functions in one piecewise coaster (like linear + quadratic + sine).', hint: 'Families: linear, quadratic, cubic, exponential, sine/cosine, square root, absolute value…', when: 'build', check: (c) => c.an.pw && new Set(c.an.family.pieceFamilies.map((f) => f.name === 'sinusoidal' ? 'trigonometric' : f.name)).size >= 3 },
  ];

  const MATCHES = [
    { id: 'm1', name: 'Ramp Up', f: '0.5x + 1', a: 0, b: 8, concept: 'Linear: slope & y-intercept', hint: 'y = mx + b. Where does it start on the y-axis? How much does it rise for every 1 step right?', keys: [[0, 1], [8, 5]] },
    { id: 'm2', name: 'Downhill Run', f: '-2x + 6', a: 0, b: 3, concept: 'Negative slope', hint: 'It drops 2 for every 1 to the right.', keys: [[0, 6], [3, 0]] },
    { id: 'm3', name: 'The Valley', f: '(x - 3)^2', a: 0, b: 6, concept: 'Vertex form', hint: 'Vertex at (3, 0). Vertex form: a(x − h)² + k.', keys: [[3, 0], [0, 9]] },
    { id: 'm4', name: 'The Hill', f: '-(x - 2)^2 + 4', a: 0, b: 4, concept: 'Vertex form (opens down)', hint: 'Vertex (2, 4); zeros at 0 and 4. A negative a opens downward.', keys: [[2, 4], [0, 0], [4, 0]] },
    { id: 'm5', name: 'Wide Hill', f: '-0.25(x - 4)^2 + 4', a: 0, b: 8, concept: 'Vertical compression', hint: 'Same vertex idea, but wider — |a| is less than 1.', keys: [[4, 4], [0, 0], [8, 0]] },
    { id: 'm6', name: 'Shifted Valley', f: '0.5(x + 1)^2 - 2', a: -4, b: 2, concept: 'Horizontal & vertical shifts', hint: 'Vertex (−1, −2). Remember: x − h with h = −1 becomes x + 1.', keys: [[-1, -2], [-3, 0], [1, 0]] },
    { id: 'm7', name: 'The V', f: '2|x - 3| + 1', a: 0, b: 6, concept: 'Absolute value', hint: 'Vertex (3, 1). Each side has slope ±2.', keys: [[3, 1], [0, 7], [6, 7]] },
    { id: 'm8', name: 'Cubic Zeros', f: 'x(x - 2)(x - 4)', a: -0.5, b: 4.5, concept: 'Factored form', hint: 'Zeros at 0, 2 and 4. Leading coefficient 1.', keys: [[0, 0], [2, 0], [4, 0]] },
    { id: 'm9', name: 'Flipped Cubic', f: '-0.5(x + 2)(x - 1)(x - 3)', a: -2.5, b: 3.5, concept: 'Leading coefficient', hint: 'Zeros at −2, 1 and 3. The y-intercept is −3 — use it to find a.', keys: [[-2, 0], [1, 0], [3, 0], [0, -3]] },
    { id: 'm10', name: 'Root Slide', f: '2sqrt(x - 1)', a: 1, b: 10, concept: 'Square root functions', hint: 'Starts at (1, 0). Passes through (5, 4) and (10, 6).', keys: [[1, 0], [5, 4], [10, 6]] },
    { id: 'm11', name: 'Growth Spurt', f: '2^x', a: 0, b: 3, concept: 'Exponential growth', hint: 'It doubles every time x goes up by 1.', keys: [[0, 1], [1, 2], [2, 4], [3, 8]] },
    { id: 'm12', name: 'Sine Wave', f: '2sin(x) + 2', a: 0, b: 2 * Math.PI, concept: 'Amplitude & midline', hint: 'Midline y = 2, amplitude 2, period 2π.', keys: [[Math.PI / 2, 4], [3 * Math.PI / 2, 0], [0, 2]] },
    { id: 'm13', name: 'Fast Wave', f: '3sin(2x) + 3', a: 0, b: 2 * Math.PI, concept: 'Period', hint: 'Two full waves in 2π, so the period is π. Period = 2π ÷ B.', keys: [[Math.PI / 4, 6], [3 * Math.PI / 4, 0]] },
    { id: 'm14', name: 'Mystery Quartic', f: '0.25(x^2 - 1)(x^2 - 4)', a: -2.2, b: 2.2, concept: 'Even quartic', hint: 'Zeros at ±1 and ±2; y-intercept 1.', keys: [[-2, 0], [-1, 0], [1, 0], [2, 0], [0, 1]] },
    { id: 'p1', name: 'Ramp & Plateau', f: '{x if 0 <= x < 3; 3 if 3 <= x <= 6}', a: 0, b: 6, concept: 'Piecewise: linear + constant', hint: 'Two pieces: a slope-1 ramp up to (3, 3), then flat. Switch to 🧩 Pieces.', keys: [[0, 0], [3, 3], [6, 3]] },
    { id: 'p2', name: 'Staircase', f: '{3 if 0 <= x < 2; 2 if 2 <= x < 4; 1 if 4 <= x <= 6}', a: 0, b: 6, concept: 'Step function', hint: 'Three constant pieces. Each step is 2 wide and 1 lower.', keys: [[0, 3], [2, 2], [4, 1]] },
    { id: 'p3', name: 'Rest Stop', f: '{-x + 4 if 0 <= x < 2; 2 if 2 <= x < 5; 0.5x - 0.5 if 5 <= x <= 9}', a: 0, b: 9, concept: 'Piecewise linear', hint: 'Down with slope −1, flat at height 2, then up with slope ½. All joints connect.', keys: [[0, 4], [2, 2], [5, 2], [9, 4]] },
    { id: 'p4', name: 'Up & Over', f: '{2x if 0 <= x < 2; -(x - 3)^2 + 5 if 2 <= x <= 5}', a: 0, b: 5, concept: 'Piecewise: linear + quadratic', hint: 'A straight climb, then a parabola with vertex (3, 5). They meet smoothly at (2, 4).', keys: [[0, 0], [2, 4], [3, 5], [5, 1]] },
  ];

  const GLOSSARY = {
    domain: ['Domain', 'All the x-values the track uses — where it starts and where it ends, left to right.'],
    range: ['Range', 'All the heights (y-values) the track reaches, from its lowest point to its highest point.'],
    zero: ['Zero (root, x-intercept)', 'An x where f(x) = 0. The track is at ground level there.'],
    multiplicity: ['Multiplicity', 'How many times a zero repeats, like (x − 2)². Even multiplicity: the track touches the ground and bounces back up. Odd: it crosses through.'],
    yint: ['y-intercept', 'Where the track crosses the y-axis: the point (0, f(0)).'],
    max: ['Local maximum (hilltop)', 'A point higher than the track right around it. The slope there is 0 — unless there is a sharp corner.'],
    min: ['Local minimum (valley)', 'A point lower than the track right around it.'],
    turning: ['Turning point', 'Where the track changes from going up to going down, or down to up — every local max and min. A degree-n polynomial has at most n − 1.'],
    monotone: ['Increasing / decreasing', 'Increasing: moving left to right, the track climbs (slope > 0). Decreasing: it drops (slope < 0).'],
    slope: ['Slope', 'Rise over run: how much the track goes up for each 1 unit to the right. Negative = downhill. The coaster\'s slope is the slope of the tangent line where it is.'],
    avgrate: ['Average rate of change', '(f(b) − f(a)) ÷ (b − a): the slope of the straight line (secant) that connects two points of the graph.'],
    concavity: ['Concavity', 'Concave up (∪) bends like a smile — riders feel HEAVY. Concave down (∩) bends like a frown — riders feel LIGHT (airtime!).'],
    inflection: ['Inflection point', 'Where the track switches between concave up and concave down.'],
    endbehavior: ['End behavior', 'What f(x) does as x → +∞ or x → −∞. For polynomials, the leading term (degree and sign) decides.'],
    symmetry: ['Even & odd functions', 'Even: f(−x) = f(x), a mirror image across the y-axis. Odd: f(−x) = −f(x), the same after a half-turn around the origin.'],
    asymptote: ['Vertical asymptote', 'A vertical line the graph shoots up or down beside, like x = 0 for 1/x. The function is undefined there, so the track breaks.'],
    discontinuity: ['Discontinuity', 'A break in the graph: a jump, a hole, or an asymptote. The coaster has to jump the gap…'],
    undefined: ['Undefined values', 'Inputs with no real output: square roots of negatives, logs of numbers ≤ 0, division by zero.'],
    vlt: ['Vertical line test', 'A graph is a function if every vertical line hits it at most once. That\'s why a function coaster can never do a loop!'],
    gforce: ['G-force', 'How heavy you feel. 1 G = normal. In valleys (concave up) you feel heavier; over hills (concave down) lighter. Below 0 G you\'d float out of your seat. Real coasters stay between about −1.5 G and 5 G.'],
    energy: ['Energy', 'Height energy (potential) turns into speed energy (kinetic) as the train drops: v = √(2gh). Friction turns a bit into heat, so the train can never climb higher than it started — unless a lift or launch adds energy.'],
    transform: ['Transformations', 'f(x) + k shifts up by k. f(x − h) shifts RIGHT by h. a·f(x) stretches vertically. f(x ÷ b) stretches horizontally. −f(x) flips upside down. f(−x) mirrors left ↔ right.'],
    complex: ['Complex zeros', 'Zeros that aren\'t real numbers (they involve i = √−1). They come in conjugate pairs and never touch the track — but they still count toward the degree.'],
    discriminant: ['Discriminant', 'For ax² + bx + c it is b² − 4ac. Positive → 2 real zeros; zero → 1 (the vertex touches the ground); negative → no real zeros.'],
    vertex: ['Vertex', 'The turning point of a parabola. In vertex form a(x − h)² + k it is (h, k); the axis of symmetry is x = h.'],
    factored: ['Factored form', 'a(x − r₁)(x − r₂)… — read the zeros r₁, r₂, … straight off the factors.'],
    sinusoid: ['Sinusoid', 'A·sin(B(x − C)) + D: amplitude |A|, period 2π ÷ |B|, midline y = D, phase shift C.'],
    exponential: ['Exponential function', 'a·bˣ multiplies by b every time x goes up by 1. b > 1: growth; 0 < b < 1: decay. It has a horizontal asymptote.'],
    piecewise: ['Piecewise function', 'A function made of pieces. Each piece has its own formula and its own interval of x-values, like f(x) = {2x if 0 ≤ x < 3; 6 if 3 ≤ x ≤ 5}. On a coaster, each piece is one section of track.'],
    continuity: ['Continuous joint', 'The track connects: the left piece ends at the same height where the right piece starts. In math words, the limit from the left equals the limit from the right (and the function value). No jump!'],
    smoothjoint: ['Smooth joint', 'Connected AND the same slope on both sides, so there is no sharp corner. Real coaster track must be smooth — a corner would mean an instant change of direction.'],
    endpoints: ['Open and closed dots', 'A closed dot ● means the endpoint is included (≤). An open dot ○ means it is not (<). Each x must belong to exactly one piece, so neighbors usually share a joint with one ≤ and one <.'],
    evaluatepw: ['Evaluating a piecewise function', 'First find the piece whose condition your x fits. Then plug x into THAT piece\'s formula only.'],
    stepfn: ['Step function', 'A piecewise function made of flat (constant) pieces. It looks like stairs, and every joint is a jump.'],
    flight: ['Projectile flight', 'When the track ends in mid-air, the coaster flies along a parabola until it lands — the landing spot is a zero of that parabola.'],
    curvature: ['Curvature & G', 'At a valley, G ≈ 1 + 2·(drop height)·f″(x) in graph units. Tighter curves (bigger f″) and bigger drops mean bigger G-forces — no matter how large you build it!'],
  };

  const ADJ = {
    polynomial: ['Polynomial', 'Turning', 'Rolling', 'Wild'], quadratic: ['Parabolic', 'Vertex', 'Quadratic'], cubic: ['Cubic', 'Triple', 'Twisting'], quartic: ['Quartic', 'Double-Dip', 'Four-Fold'],
    quintic: ['Quintic', 'Five-Alarm'], linear: ['Linear', 'Straight-Shot'], constant: ['Flatline', 'Level'], trig: ['Sine-ister', 'Wavy', 'Tidal', 'Periodic'], exp: ['Exponential', 'Rocket'],
    log: ['Logarithmic'], root: ['Radical', 'Root'], abs: ['Absolute', 'V-Twin'], rational: ['Asymptotic', 'Rational'], step: ['Stair-Step', 'Floor'], other: ['Mystery', 'Mighty', 'Mega'],
    piecewise: ['Patchwork', 'Piece-by-Piece', 'Puzzle', 'Modular', 'Mosaic', 'Stitched'],
  };
  const NOUNS = ['Serpent', 'Thunder', 'Comet', 'Viper', 'Cyclone', 'Dragon', 'Phoenix', 'Twister', 'Falcon', 'Stampede', 'Tempest', 'Blitz', 'Voyager', 'Screamer', 'Nova', 'Mamba', 'Avalanche', 'Rattler', 'Kraken', 'Meteor', 'Mustang', 'Griffin', 'Tornado', 'Rocket'];
  function nameFor(fnText, family) {
    const rnd = FC.rng(FC.hashString(fnText));
    let key = 'other';
    if (family) {
      if (family.family === 'polynomial') key = ADJ[family.name] ? family.name : 'polynomial';
      else if (ADJ[family.family]) key = family.family;
    }
    return 'The ' + FC.pick(rnd, ADJ[key]) + ' ' + FC.pick(rnd, NOUNS);
  }

  /** A ready-made 3-piece track for students switching to piecewise mode. */
  const PW_STARTER = PW_PRESETS[0];
  return { PRESETS, PW_PRESETS, PW_STARTER, MISSIONS, MATCHES, GLOSSARY, nameFor };
})();
