/* =====================================================================
   FCRemix — transformations, coaching tips, Thrill Lab, Surprise me
   ===================================================================== */
var FCRemix = (function () {
  const M = FCMath, N = M.N;
  const X = () => N.x();
  const num = (v) => N.num(v);

  function niceNum(v) {
    const s = Math.sign(v) || 1, a = Math.abs(v);
    if (a === 0) return 0;
    const mag = Math.pow(10, Math.floor(Math.log10(a)));
    const r = a / mag;
    const n = r < 1.25 ? 1 : r < 1.75 ? 1.5 : r < 2.25 ? 2 : r < 2.75 ? 2.5 : r < 3.5 ? 3 : r < 4.5 ? 4 : r < 6 ? 5 : r < 8.5 ? 8 : 10;
    return s * n * mag;
  }
  const round = (v, sig = 3) => Number(Number(v).toPrecision(sig));
  /** x scaled by 1/k — as a clean decimal (0.5x) when exact, otherwise as a fraction (x/3). */
  function scaledX(k) {
    const inv = 1 / k;
    if (Math.abs(Number(inv.toFixed(4)) - inv) < 1e-12) return N.mul(num(Number(inv.toFixed(4))), X());
    return N.div(X(), num(k));
  }

  /** Turn an AST into input text; expand long polynomials to standard form. */
  function textOf(ast, P, hasParams) {
    const simp = M.simplify(ast);
    let t = M.toText(simp);
    if (!hasParams && t.length > 70) {
      const c = M.toPoly(simp, P);
      if (c) {
        const pt = M.poly.toText(c.map((v) => (Math.abs(v) < 1e-12 ? 0 : v)), 5);
        if (pt.length < t.length) t = pt;
      }
    }
    return t;
  }

  /** Evaluate a candidate track: analysis + physics forecast. */
  function evaluate(ast, a, b, P, settings, maxT = 150) {
    try {
      // piecewise: push outer operations into the pieces; the pieces set the domain
      let hasPW = false;
      M.walk(ast, (n) => { if (n.type === 'piecewise') hasPW = true; });
      let pw = null;
      if (hasPW) {
        if (ast.type !== 'piecewise') ast = M.simplify(ast);
        pw = FCAnalysis.pwCheck(ast, P);
        if (pw.errors.length) return { ok: false, error: pw.errors[0].msg };
        const lo = Math.min(...pw.info.pieces.map((q) => q.lo)), hi = Math.max(...pw.info.pieces.map((q) => q.hi));
        if (isFinite(lo)) a = lo;
        if (isFinite(hi)) b = hi;
      }
      const fn = M.compile(ast, P);
      const coeffs = M.toPoly(ast, P);
      const an = FCAnalysis.analyze({ fn, a, b, coeffs, ast, P, pw, samples: 1200 });
      if (!an.ok) return { ok: false, error: an.error };
      const S = settings.scale === 'auto' ? FCPhysics.autoScale(an) : +settings.scale;
      const Sy = settings.vScale === 'same' || !settings.vScale ? S : +settings.vScale;
      const track = FCPhysics.buildTrack(an, fn, { Sx: S, Sy });
      const opts = { mode: settings.startMode, vLift: settings.vLift, friction: settings.friction, v0: settings.v0 || 20 };
      const stats = FCPhysics.simulate(track, opts, maxT, 1 / 120);
      const ratings = FCPhysics.ratings(stats);
      return { ok: true, an, track, stats, ratings, fn, coeffs };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }

  function isSafe(st) { return st.reachedEnd && st.maxG <= 5 && st.minG >= -1.5 && !st.cornerHits; }
  function score(ev) {
    if (!ev.ok) return -99;
    const st = ev.stats, r = ev.ratings;
    let s = r.excitement;
    if (!st.reachedEnd) s -= 3;
    if (st.maxG > 5) s -= Math.min(4, (st.maxG - 5) * 0.4);
    if (st.minG < -1.5) s -= Math.min(4, (-1.5 - st.minG) * 0.6);
    if (st.cornerHits) s -= 1.5;
    return s;
  }

  // -------------------------------------------------------------- transformations
  function transforms(base) {
    const { ast, a, b, P, an } = base;
    const hasParams = base.params && base.params.length > 0;
    const w = b - a;
    const yr = Math.max(1e-6, an.yMax - an.yMin);
    const k = niceNum(yr / 4) || 1;
    const h = niceNum(w / 5) || 1;
    const out = [];
    const mk = (id, icon, title, rule, desc, newAst, na, nb, concept) => {
      out.push({ id, icon, title, rule, desc, ast: newAst, a: na, b: nb, f: textOf(newAst, P, hasParams), concept });
    };
    const kt = FC.fmt(k, 3), ht = FC.fmt(h, 3);
    mk('up', '⬆️', 'Raise it', 'f(<i>x</i>) + ' + kt, 'Every height goes up ' + kt + '. The zeros move!', N.add(M.clone(ast), num(k)), a, b, 'Vertical shift');
    mk('down', '⬇️', 'Lower it', 'f(<i>x</i>) − ' + kt, 'Every height drops ' + kt + '. More of the ride may go underground.', N.sub(M.clone(ast), num(k)), a, b, 'Vertical shift');
    mk('right', '➡️', 'Slide right', 'f(<i>x</i> − ' + ht + ')', 'Subtracting inside moves the track RIGHT by ' + ht + ' (the domain moves too).', M.substitute(ast, N.sub(X(), num(h))), a + h, b + h, 'Horizontal shift');
    mk('left', '⬅️', 'Slide left', 'f(<i>x</i> + ' + ht + ')', 'Adding inside moves the track LEFT by ' + ht + '.', M.substitute(ast, N.add(X(), num(h))), a - h, b - h, 'Horizontal shift');
    mk('taller', '↕️', 'Stretch taller', '2·f(<i>x</i>)', 'Heights double: steeper slopes and much bigger G-forces.', N.mul(num(2), M.clone(ast)), a, b, 'Vertical stretch');
    mk('shorter', '🫓', 'Squash down', '½·f(<i>x</i>)', 'Heights are halved — zeros stay put. Gentler ride.', N.mul(num(0.5), M.clone(ast)), a, b, 'Vertical compression');
    mk('wider', '↔️', 'Stretch wider', 'f(½<i>x</i>)', 'Twice as wide. Slopes halve and curves get 4× gentler (curvature ÷ 2²).', M.substitute(ast, N.mul(num(0.5), X())), 2 * a, 2 * b, 'Horizontal stretch');
    mk('narrower', '🗜️', 'Squeeze', 'f(2<i>x</i>)', 'Half as wide. Slopes double — hold on!', M.substitute(ast, N.mul(num(2), X())), a / 2, b / 2, 'Horizontal compression');
    mk('flip', '🙃', 'Flip upside down', '−f(<i>x</i>)', 'Reflect over the x-axis: hills become valleys, valleys become hills.', N.neg(M.clone(ast)), a, b, 'Reflection');
    mk('mirror', '🪞', 'Ride it backwards', 'f(−<i>x</i>)', 'Reflect over the y-axis: the domain becomes [−b, −a].', M.substitute(ast, N.neg(X())), -b, -a, 'Reflection');
    mk('abs', '🛡️', 'Bounce off the ground', '|f(<i>x</i>)|', 'Absolute value flips every underground part up above ground.', N.func('abs', M.clone(ast)), a, b, 'Absolute value');
    const A = niceNum(yr * 0.08) || 0.2;
    const B = round((2 * Math.PI * 5) / w, 2);
    mk('wiggle', '〰️', 'Add wiggles', 'f(<i>x</i>) + ' + FC.fmt(A, 3) + 'sin(' + FC.fmt(B, 3) + '<i>x</i>)', 'Adds small waves on top: more turning points and airtime.', N.add(M.clone(ast), N.mul(num(A), N.func('sin', N.mul(num(B), X())))), a, b, 'Sum of functions');
    return out;
  }

  /** Sample a function over [a,b] into SVG path data (within a shared frame). */
  function sparkPath(fn, a, b, frame, W = 120, H = 44, n = 70) {
    let d = '', pen = false;
    for (let i = 0; i <= n; i++) {
      const x = a + ((b - a) * i) / n;
      const y = fn(x);
      if (!isFinite(y)) { pen = false; continue; }
      const px = ((x - frame.x0) / (frame.x1 - frame.x0)) * W;
      const py = H - ((FC.clamp(y, frame.y0 - (frame.y1 - frame.y0), frame.y1 + (frame.y1 - frame.y0)) - frame.y0) / (frame.y1 - frame.y0)) * H;
      d += (pen ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1);
      pen = true;
    }
    return d;
  }
  function frameFor(list, pad = 0.08) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const it of list) {
      x0 = Math.min(x0, it.a); x1 = Math.max(x1, it.b);
      for (let i = 0; i <= 60; i++) {
        const y = it.fn(it.a + ((it.b - it.a) * i) / 60);
        if (isFinite(y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      }
    }
    y0 = Math.min(y0, 0); y1 = Math.max(y1, 0);
    const dy = (y1 - y0) || 1, dx = (x1 - x0) || 1;
    return { x0: x0 - dx * 0.02, x1: x1 + dx * 0.02, y0: y0 - dy * pad, y1: y1 + dy * pad };
  }
  /** Mini graph SVG: ghost of the original + the candidate + the ground line. */
  function sparkSVG(items, W = 120, H = 44) {
    const fr = frameFor(items);
    const gy = H - ((0 - fr.y0) / (fr.y1 - fr.y0)) * H;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">';
    s += '<rect x="0" y="' + gy.toFixed(1) + '" width="' + W + '" height="' + Math.max(0, H - gy).toFixed(1) + '" fill="rgba(141,106,68,0.35)"/>';
    s += '<line x1="0" x2="' + W + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '" stroke="#58b04f" stroke-width="1.5"/>';
    items.forEach((it) => {
      s += '<path d="' + sparkPath(it.fn, it.a, it.b, fr, W, H) + '" fill="none" stroke="' + it.color + '" stroke-width="' + (it.width || 2) + '" stroke-linecap="round" stroke-linejoin="round"' + (it.dash ? ' stroke-dasharray="3 3"' : '') + ' vector-effect="non-scaling-stroke"/>';
    });
    return s + '</svg>';
  }
  function thumbSVG(thumb, W = 76, H = 44, color = '#ff4d6d') {
    const vals = thumb.filter((v) => v !== null);
    if (!vals.length) return '<svg viewBox="0 0 ' + W + ' ' + H + '"></svg>';
    let y0 = Math.min(0, ...vals), y1 = Math.max(0, ...vals);
    const dy = (y1 - y0) || 1; y0 -= dy * 0.1; y1 += dy * 0.1;
    const gy = H - ((0 - y0) / (y1 - y0)) * H;
    let d = '', pen = false;
    thumb.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      const px = (i / (thumb.length - 1)) * W, py = H - ((v - y0) / (y1 - y0)) * H;
      d += (pen ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1); pen = true;
    });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="' + gy.toFixed(1) + '" width="' + W + '" height="' + Math.max(0, H - gy).toFixed(1) + '" fill="rgba(141,106,68,0.35)"/><line x1="0" x2="' + W + '" y1="' + gy.toFixed(1) + '" y2="' + gy.toFixed(1) + '" stroke="#58b04f" stroke-width="1.5"/><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2.2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
  }

  // -------------------------------------------------------------- coaching
  /** Suggest a horizontal stretch that makes the ride safe (tested with real physics). */
  function safeStretch(base, settings) {
    const hasParams = base.params && base.params.length > 0;
    for (const k of [1.5, 2, 3, 4, 6, 8]) {
      const ast = M.substitute(base.ast, scaledX(k));
      const ev = evaluate(ast, base.a * k, base.b * k, base.P, settings);
      if (ev.ok && isSafe(ev.stats)) return { k, ev, f: textOf(ast, base.P, hasParams), a: base.a * k, b: base.b * k };
    }
    return null;
  }

  // -------------------------------------------------------------- Thrill Lab
  function randomMutation(base, rnd) {
    const hasParams = base.params && base.params.length > 0;
    let ast = M.clone(base.ast), a = base.a, b = base.b;
    const yr = Math.max(1e-6, base.an.yMax - base.an.yMin);
    const w = b - a;
    const ops = [];
    const nOps = 1 + (rnd() < 0.55 ? 1 : 0);
    const isPW = base.ast.type === 'piecewise';
    const bag = isPW ? ['stretchH', 'stretchH', 'stretchV', 'stretchV', 'wiggle', 'shift', 'tilt'] : ['stretchH', 'stretchH', 'stretchV', 'wiggle', 'shift', 'tilt', 'domain', 'flip'];
    if (base.coeffs && !hasParams) bag.push('coef', 'coef');
    for (let i = 0; i < nOps; i++) {
      const op = FC.pick(rnd, bag);
      if (op === 'stretchH') {
        const k = FC.pick(rnd, [1.5, 2, 2.5, 3, 4]);
        ast = M.substitute(ast, scaledX(k)); a = round(a * k, 6); b = round(b * k, 6); ops.push('stretched ×' + k + ' wide');
      } else if (op === 'stretchV') {
        const k = FC.pick(rnd, [0.5, 0.6, 0.75, 1.25, 1.5]);
        ast = N.mul(num(k), ast); ops.push('heights ×' + k);
      } else if (op === 'wiggle') {
        const A = niceNum(yr * (0.04 + rnd() * 0.08)), B = round((2 * Math.PI * (2 + Math.floor(rnd() * 5))) / (b - a), 2);
        ast = N.add(ast, N.mul(num(A), N.func(rnd() < 0.5 ? 'sin' : 'cos', N.mul(num(B), X())))); ops.push('+ wiggles');
      } else if (op === 'shift') {
        const k = niceNum(yr * (0.1 + rnd() * 0.25)) * (rnd() < 0.5 ? -1 : 1);
        ast = N.add(ast, num(k)); ops.push((k > 0 ? 'raised ' : 'lowered ') + FC.fmt(Math.abs(k), 3));
      } else if (op === 'tilt') {
        const m = round(((rnd() - 0.5) * yr) / (b - a), 2) || 0.1;
        ast = N.add(ast, N.mul(num(m), X())); ops.push('tilted (+' + FC.fmt(m, 2) + 'x)');
      } else if (op === 'domain') {
        const da = (rnd() - 0.5) * 0.4 * w, db = (rnd() - 0.5) * 0.4 * w;
        a = round(a + da, 4); b = round(b + db, 4);
        if (b - a < w * 0.3) { a = base.a; b = base.b; }
        ops.push('new domain');
      } else if (op === 'flip') {
        ast = N.neg(ast); ops.push('flipped');
      } else if (op === 'coef' && base.coeffs) {
        const c = base.coeffs.slice();
        const i2 = Math.floor(rnd() * c.length);
        c[i2] = round(c[i2] * (0.5 + rnd()) || (rnd() - 0.5), 3);
        ast = M.parse(M.poly.toText(c, 4)).ast; ops.push('tweaked the x' + (i2 ? FC.sup(i2) : '⁰') + ' coefficient');
      }
    }
    return { ast, a, b, ops, f: textOf(ast, base.P, hasParams) };
  }

  /** Run the lab: returns the best candidates (async-friendly, yields between evaluations). */
  async function thrillLab(base, settings, n = 12, onProgress) {
    const rnd = FC.rng((Date.now() ^ FC.hashString(base.f)) >>> 0);
    const baseEv = evaluate(base.ast, base.a, base.b, base.P, settings);
    const results = [];
    for (let i = 0; i < n; i++) {
      const m = randomMutation(base, rnd);
      const ev = evaluate(m.ast, m.a, m.b, base.P, settings);
      if (ev.ok) results.push(Object.assign(m, { ev, score: score(ev), safe: isSafe(ev.stats) }));
      if (onProgress) onProgress((i + 1) / n);
      await new Promise((r) => setTimeout(r, 0));
    }
    results.sort((p, q) => q.score - p.score);
    const seen = new Set();
    const top = results.filter((r) => { if (seen.has(r.f)) return false; seen.add(r.f); return true; }).slice(0, 3);
    return { base: baseEv, top };
  }

  // -------------------------------------------------------------- Surprise me
  const ROOTS = [-4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
  function factoredText(lead, roots) {
    const parts = roots.map((r) => (r === 0 ? 'x' : '(x ' + (r > 0 ? '- ' : '+ ') + FC.numText(Math.abs(r)) + ')'));
    const L = FC.numText(lead, 3);
    return (L === '1' ? '' : L === '-1' ? '-' : L) + parts.join('');
  }
  function genOne(rnd) {
    const kind = FC.pick(rnd, ['factored', 'factored', 'vertex', 'wave', 'wave', 'bumps', 'damped', 'camel', 'polywave']);
    if (kind === 'factored') {
      const d = FC.pick(rnd, [3, 3, 4, 4, 5]);
      const pool = ROOTS.slice();
      const roots = [];
      while (roots.length < d && pool.length) {
        const r = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
        if (roots.every((q) => Math.abs(q - r) >= 1)) roots.push(r);
      }
      roots.sort((p, q) => p - q);
      const stretch = FC.pick(rnd, [2, 3, 4]);
      const rs = roots.map((r) => r * stretch);
      const c = M.poly.fromRoots(rs, 1);
      let mx = 0;
      for (let i = 0; i <= 200; i++) { const x = rs[0] + ((rs[d - 1] - rs[0]) * i) / 200; mx = Math.max(mx, Math.abs(M.poly.eval(c, x))); }
      const H = 3 + rnd() * 5;
      let lead = Number((H / mx).toPrecision(2));
      const mid = (rs[0] + rs[1]) / 2;
      if (M.poly.eval(c, mid) * lead < 0) lead = -lead;
      return { f: factoredText(lead, rs), a: FC.numText(rs[0]), b: FC.numText(rs[d - 1]) };
    }
    if (kind === 'vertex') {
      const h = FC.pick(rnd, [0, 5, 10, 15]), k = FC.pick(rnd, [4, 5, 6, 8]), r = FC.pick(rnd, [8, 10, 12, 15]);
      const A = Number((k / (r * r)).toPrecision(2));
      const rr = Math.sqrt(k / A);
      return { f: '-' + FC.numText(A) + '(x ' + (h ? '- ' + h : '') + ')^2 + ' + k, a: FC.numText(h - rr, 5), b: FC.numText(h + rr, 5) };
    }
    if (kind === 'wave') {
      const A = FC.pick(rnd, [1, 1.5, 2, 2.5, 3]);
      const B = Number((FC.pick(rnd, [0.6, 0.8, 1]) / A).toPrecision(2));
      const P = (2 * Math.PI) / B;
      const n = FC.pick(rnd, [1.5, 2, 2.5, 3]);
      const shape = rnd();
      if (shape < 0.5) return { f: FC.numText(A) + ' - ' + FC.numText(A) + 'cos(' + FC.numText(B) + 'x)', a: '0', b: FC.numText(n * P, 5) };
      return { f: FC.numText(A) + 'sin(' + FC.numText(B) + 'x) + ' + FC.numText(A + FC.pick(rnd, [0.5, 1, 2])), a: '0', b: FC.numText(n * P, 5) };
    }
    if (kind === 'bumps') {
      const n = FC.pick(rnd, [2, 3]);
      const terms = [];
      let x = 0;
      for (let i = 0; i < n; i++) {
        x += 8 + rnd() * 8;
        const h = FC.pick(rnd, [3, 4, 5, 6, 7]), w = FC.pick(rnd, [3, 4, 5]);
        terms.push(h + '/(1 + ((x - ' + Math.round(x) + ')/' + w + ')^2)');
      }
      return { f: terms.join(' + '), a: '0', b: String(Math.round(x + 10)) };
    }
    if (kind === 'damped') {
      const A = FC.pick(rnd, [3, 4, 5]), B = Number((FC.pick(rnd, [0.8, 1]) / A).toPrecision(2)), k = FC.pick(rnd, [0.04, 0.06, 0.08]);
      return { f: A + 'e^(-' + k + 'x)cos(' + FC.numText(B) + 'x) + ' + (A + 1), a: '0', b: FC.numText(Math.round((5 * Math.PI) / B), 4) };
    }
    if (kind === 'camel') {
      const A = FC.pick(rnd, [2, 3]), B = Number((FC.pick(rnd, [0.7, 0.9]) / A).toPrecision(2)), m = FC.pick(rnd, [-0.1, 0.1, 0.15]);
      const L = Math.round((4 * Math.PI) / B);
      return { f: A + 'cos(' + FC.numText(B) + 'x) ' + (m < 0 ? '- ' : '+ ') + Math.abs(m) + 'x + ' + (A + 1 + (m < 0 ? Math.abs(m) * L : 0)).toFixed(1).replace(/\.0$/, ''), a: '0', b: String(L) };
    }
    // polywave: a gentle cubic with ripples
    const s = FC.pick(rnd, [8, 10, 12]);
    return { f: '-0.5(x/' + s + ')^3 + 1.5(x/' + s + ') + 3 + 0.6sin(' + FC.numText(Number((2 / s).toPrecision(2))) + 'x)', a: String(-2 * s), b: String(2 * s) };
  }
  async function surprise(settings) {
    const rnd = FC.rng((Date.now() * 7919) >>> 0);
    let best = null;
    for (let i = 0; i < 7; i++) {
      const g = genOne(rnd);
      const r = M.parse(g.f);
      if (!r.ok) continue;
      const A = M.evalConstExpr(g.a), B = M.evalConstExpr(g.b);
      if (!A.ok || !B.ok || !(B.value > A.value)) continue;
      const ev = evaluate(r.ast, A.value, B.value, {}, settings);
      if (!ev.ok) continue;
      // mostly pick exciting-and-safe tracks, but let a wild one through sometimes
      const sc = score(ev) + (rnd() < 0.25 ? rnd() * 4 : 0);
      if (!best || sc > best.sc) best = Object.assign(g, { sc, ev });
      await new Promise((res) => setTimeout(res, 0));
    }
    return best;
  }

  // -------------------------------------------------------------- Surprise me (piecewise)
  /**
   * A classic 4-piece coaster with smooth joints: lift ramp → parabolic crest → straight drop → pull-out.
   * Heights and slopes match at every joint by construction, and it starts and ends on the ground.
   */
  function genPW(rnd) {
    const m = FC.pick(rnd, [0.75, 1, 1.25, 1.5]);
    const L = FC.pick(rnd, [4, 5, 6, 8]);
    const W = FC.pick(rnd, [4, 5, 8, 10]);
    const Q = FC.pick(rnd, [4, 5, 8, 10].filter((q) => q / 2 < L));
    const D = L - Q / 2;
    const n = (v) => FC.numText(Number(v.toPrecision(6)));
    const y1 = m * L, x1 = L, x2 = L + W, x3 = x2 + D, x4 = x3 + Q;
    const c = m / W;
    const lin = (y0, x0, sl) => n(y0) + (sl < 0 ? ' - ' : ' + ') + (Math.abs(sl) === 1 ? '' : n(Math.abs(sl))) + '(x - ' + n(x0) + ')';
    const pieces = [
      (m === 1 ? '' : n(m)) + 'x if 0 <= x < ' + n(x1),
      lin(y1, x1, m) + ' - ' + n(c) + '(x - ' + n(x1) + ')^2 if ' + n(x1) + ' <= x < ' + n(x2),
    ];
    if (D > 0) pieces.push(lin(y1, x2, -m) + ' if ' + n(x2) + ' <= x < ' + n(x3));
    pieces.push(n(m / (2 * Q)) + '(x - ' + n(x4) + ')^2 if ' + n(x3) + ' <= x <= ' + n(x4));
    return { f: '{' + pieces.join('; ') + '}', a: '', b: '' };
  }
  async function surprisePW(settings) {
    const rnd = FC.rng((Date.now() * 7919) >>> 0);
    let best = null;
    for (let i = 0; i < 8; i++) {
      const g = genPW(rnd);
      const r = M.parse(g.f);
      if (!r.ok) continue;
      const ev = evaluate(r.ast, 0, 1, {}, settings);
      if (!ev.ok) continue;
      const sc = score(ev) + (rnd() < 0.25 ? rnd() * 3 : 0);
      if (!best || sc > best.sc) best = Object.assign(g, { sc, ev });
      await new Promise((res) => setTimeout(res, 0));
    }
    return best;
  }

  return { transforms, evaluate, sparkSVG, thumbSVG, safeStretch, thrillLab, surprise, surprisePW, genPW, textOf, isSafe, score, niceNum, scaledX };
})();
