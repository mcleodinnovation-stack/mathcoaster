/* =====================================================================
   FCAnalysis — numerical study of y = f(x) on [a, b]
   (zeros, turning points, inflections, gaps, symmetry, …)
   ===================================================================== */
var FCAnalysis = (function () {
  const P_ = FCMath.poly;

  /**
   * Derivative helpers. d1(x, lo, hi) / d2(x, lo, hi): the optional [lo, hi] keeps the
   * finite-difference stencil inside one continuous piece of track (so jumps don't leak in).
   */
  function makeDerivs(fn, a, b, coeffs) {
    const w = Math.max(b - a, 1e-9);
    if (coeffs) {
      const d1c = P_.deriv(coeffs), d2c = P_.deriv(d1c);
      return { d1: (x) => P_.eval(d1c, x), d2: (x) => P_.eval(d2c, x), exact: true };
    }
    const h1 = 1e-6 * w, h2 = 2e-4 * w;
    const d1 = (x, lo = -Infinity, hi = Infinity) => {
      const h = Math.max(h1, 1e-9 * Math.abs(x));
      let xa = x - h, xb = x + h;
      if (xb > hi) { xb = x; xa = x - 2 * h; } else if (xa < lo) { xa = x; xb = x + 2 * h; }
      const fa = fn(xa), fb = fn(xb);
      if (isFinite(fa) && isFinite(fb)) return (fb - fa) / (xb - xa);
      const f0 = fn(x);
      if (isFinite(fb) && isFinite(f0) && xb !== x) return (fb - f0) / (xb - x);
      if (isFinite(fa) && isFinite(f0) && xa !== x) return (f0 - fa) / (x - xa);
      const fp = fn(x + h), fm = fn(x - h);
      if (isFinite(fp) && isFinite(f0)) return (fp - f0) / h;
      if (isFinite(fm) && isFinite(f0)) return (f0 - fm) / h;
      return NaN;
    };
    const d2 = (x, lo = -Infinity, hi = Infinity) => {
      const h = Math.max(h2, 1e-7 * Math.abs(x));
      const f0 = fn(x);
      if (x + h <= hi && x - h >= lo) {
        const fp = fn(x + h), fm = fn(x - h);
        if (isFinite(fp) && isFinite(fm) && isFinite(f0)) return (fp - 2 * f0 + fm) / (h * h);
      }
      if (x + 2 * h <= hi) {
        const fp = fn(x + h), fp2 = fn(x + 2 * h);
        if (isFinite(fp) && isFinite(fp2) && isFinite(f0)) return (fp2 - 2 * fp + f0) / (h * h);
      }
      if (x - 2 * h >= lo) {
        const fm = fn(x - h), fm2 = fn(x - 2 * h);
        if (isFinite(fm) && isFinite(fm2) && isFinite(f0)) return (f0 - 2 * fm + fm2) / (h * h);
      }
      // piece is shorter than the stencil: fall back to a tiny central stencil
      const hh = Math.max(1e-9, Math.min(hi - x, x - lo) / 2);
      const fp = fn(x + hh), fm = fn(x - hh);
      if (isFinite(fp) && isFinite(fm) && isFinite(f0)) return (fp - 2 * f0 + fm) / (hh * hh);
      return NaN;
    };
    return { d1, d2, exact: false };
  }

  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    const idx = (sorted.length - 1) * q;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  /** Why is f undefined at x? Looks for the first operation that fails. */
  function explainUndefined(ast, x, P) {
    let reason = null;
    function visit(n) {
      if (reason) return;
      ['left', 'right', 'arg', 'base', 'exp'].forEach((k) => { if (n[k]) visit(n[k]); });
      if (n.args) n.args.forEach(visit);
      if (reason) return;
      const ev = (m) => FCMath.compile(m, P)(x);
      try {
        if (n.type === 'func') {
          const v = ev(n.args[0]);
          if ((n.name === 'sqrt') && v < 0) reason = 'square root of a negative number';
          else if ((n.name === 'ln' || n.name === 'log') && v <= 0) reason = 'logarithm of ' + (v === 0 ? 'zero' : 'a negative number');
          else if ((n.name === 'asin' || n.name === 'acos') && Math.abs(v) > 1) reason = 'arcsin/arccos only accept −1 to 1';
          else if (['tan', 'sec'].includes(n.name) && Math.abs(Math.cos(v)) < 1e-6) reason = n.name + ' has a vertical asymptote here';
          else if (['cot', 'csc'].includes(n.name) && Math.abs(Math.sin(v)) < 1e-6) reason = n.name + ' has a vertical asymptote here';
        } else if (n.type === 'div') {
          const d = ev(n.right);
          if (d === 0 || Math.abs(d) < 1e-9 * (1 + Math.abs(ev(n.left)))) reason = 'division by zero';
        } else if (n.type === 'pow') {
          const b = ev(n.base), e = ev(n.exp);
          if (b < 0 && !Number.isInteger(e)) reason = 'even root of a negative number';
          else if (b === 0 && e < 0) reason = 'division by zero (0 to a negative power)';
        }
      } catch (err) { /* ignore */ }
    }
    visit(ast);
    return reason;
  }

  // ------------------------------------------------------------------ piecewise
  /**
   * Check a piecewise function: compiled pieces, the joints between neighbours and
   * the problems that stop it from being a function (empty intervals, overlaps).
   * joint.kind: smooth | corner | jump | gap | undefined   (errors: empty | overlap | double)
   */
  function pwCheck(ast, P, opts = {}) {
    const info = FCMath.compilePW(ast, P || {});
    const errors = [], warnings = [], joints = [];
    const S = info.sorted;
    let lo = Infinity, hi = -Infinity, unbounded = false;
    for (const p of info.pieces) {
      if (!isFinite(p.lo) && p.lo !== -Infinity) errors.push({ kind: 'bad', pieces: [p.k], msg: 'Piece ' + (p.k + 1) + ': its starting limit isn\'t a number.' });
      if (!isFinite(p.hi) && p.hi !== Infinity) errors.push({ kind: 'bad', pieces: [p.k], msg: 'Piece ' + (p.k + 1) + ': its ending limit isn\'t a number.' });
      if (p.lo >= p.hi) errors.push({ kind: 'empty', pieces: [p.k], msg: 'Piece ' + (p.k + 1) + ' covers no x values: ' + FC.fmt(p.lo, 4) + ' to ' + FC.fmt(p.hi, 4) + '. Put the smaller number first.' });
      if (isFinite(p.lo)) lo = Math.min(lo, p.lo); else unbounded = true;
      if (isFinite(p.hi)) hi = Math.max(hi, p.hi); else unbounded = true;
    }
    const a = opts.a !== undefined ? opts.a : lo, b = opts.b !== undefined ? opts.b : hi;
    const w = Math.max(1e-9, (isFinite(b) && isFinite(a) ? b - a : 1));
    for (const p of info.pieces) {
      if (!p.d1) { const D = makeDerivs(p.f, isFinite(a) ? a : 0, isFinite(b) ? b : 1, p.coeffs); p.d1 = D.d1; p.d2 = D.d2; }
    }
    // typical size of the outputs, for tolerances
    let yScale = 1;
    for (const p of info.pieces) {
      const l = isFinite(p.lo) ? p.lo : (isFinite(a) ? a : p.hi - 1), r = isFinite(p.hi) ? p.hi : (isFinite(b) ? b : p.lo + 1);
      for (const t of [0, 0.5, 1]) { const y = p.f(l + (r - l) * t); if (isFinite(y)) yScale = Math.max(yScale, Math.abs(y)); }
    }
    const tolY = 2e-4 * yScale, tolExact = 1e-9 * yScale;
    let maxHiPiece = null;
    for (let i = 0; i < S.length; i++) {
      const B = S[i];
      if (maxHiPiece && maxHiPiece.hi > B.lo + 1e-12 * w && B.lo < B.hi) {
        const A = maxHiPiece;
        errors.push({ kind: 'overlap', pieces: [A.k, B.k], x0: B.lo, x1: Math.min(A.hi, B.hi), msg: 'Pieces ' + (A.k + 1) + ' and ' + (B.k + 1) + ' overlap for ' + FC.fmt(B.lo, 4) + ' < x < ' + FC.fmt(Math.min(A.hi, B.hi), 4) + ' — an x in there would get two heights. That breaks the vertical line test, so it isn\'t a function!' });
      }
      if (i > 0) {
        const A = S[i - 1];
        if (!(A.lo < A.hi) || !(B.lo < B.hi) || !isFinite(A.hi) || !isFinite(B.lo)) { /* reported above */ }
        else if (B.lo > A.hi + 1e-12 * w) {
          joints.push({ kind: 'gap', left: A.k, right: B.k, x: A.hi, x0: A.hi, x1: B.lo, L: A.f(A.hi), R: B.f(B.lo) });
          warnings.push({ kind: 'gap', pieces: [A.k, B.k], msg: 'No piece covers ' + FC.fmt(A.hi, 4) + ' < x < ' + FC.fmt(B.lo, 4) + ' — the track has a gap there.' });
        } else if (Math.abs(B.lo - A.hi) <= 1e-12 * w) {
          const xb = B.lo;
          const L = A.f(xb), R = B.f(xb);
          const j = { left: A.k, right: B.k, x: xb, L, R, dy: R - L, leftIncl: A.hiIncl, rightIncl: B.loIncl };
          j.sL = slopeAt(A, xb, -1); j.sR = slopeAt(B, xb, 1);
          j.hole = !A.hiIncl && !B.loIncl;
          if (!isFinite(L) || !isFinite(R)) j.kind = 'undefined';
          else if (Math.abs(R - L) > tolY) j.kind = 'jump';
          else {
            j.exact = Math.abs(R - L) <= tolExact;
            const tolS = 2e-3 * (1 + Math.abs(j.sL) + Math.abs(j.sR));
            j.kind = isFinite(j.sL) && isFinite(j.sR) && Math.abs(j.sR - j.sL) > tolS ? 'corner' : 'smooth';
          }
          if (A.hiIncl && B.loIncl && isFinite(L) && isFinite(R) && Math.abs(R - L) > tolExact) {
            errors.push({ kind: 'double', pieces: [A.k, B.k], x: xb, msg: 'x = ' + FC.fmt(xb, 4) + ' is in both piece ' + (A.k + 1) + ' and piece ' + (B.k + 1) + ', and they give different heights (' + FC.fmt(L, 4) + ' and ' + FC.fmt(R, 4) + '). A function has only one output for each x — change one ≤ to <.' });
          }
          joints.push(j);
        }
      }
      if (!maxHiPiece || B.hi > maxHiPiece.hi) maxHiPiece = B;
    }
    return { info, joints, errors, warnings, domain: { lo: isFinite(lo) ? lo : null, hi: isFinite(hi) ? hi : null, unbounded }, tolY };
  }

  function slopeAt(p, x, side) {
    let d = p.d1(x);
    if (!isFinite(d)) d = side < 0 ? p.d1(x, -Infinity, x) : p.d1(x, x, Infinity);
    return d;
  }

  /** Derivatives that use each piece's own formula (no blurring across joints). */
  function pwDerivs(info) {
    // At a segment's end use the piece on the inside (the one-sided limit), not the next piece
    const pick = (x, lo, hi) => {
      const eps = 1e-9 * (1 + Math.abs(x));
      const xq = hi !== undefined && x >= hi ? x - eps : lo !== undefined && x <= lo ? x + eps : x;
      const p = info.pieceAt(xq);
      if (p) return p;
      let best = null, bd = Infinity;
      for (const q of info.sorted) {
        const d = x < q.lo ? q.lo - x : x > q.hi ? x - q.hi : 0;
        if (d < bd) { bd = d; best = q; }
      }
      return bd < 1e-6 * (1 + Math.abs(x)) ? best : null;
    };
    return {
      d1: (x, lo, hi) => { const p = pick(x, lo, hi); return p ? p.d1(x, lo, hi) : NaN; },
      d2: (x, lo, hi) => { const p = pick(x, lo, hi); return p ? p.d2(x, lo, hi) : NaN; },
      exact: false,
      pick,
    };
  }

  function analyze(opts) {
    const { fn, a, b, coeffs, ast } = opts;
    const P = opts.P || {};
    const N = opts.samples || 2400;
    const w = b - a;
    const out = { a, b, width: w, ok: true, gaps: [], holes: [], notes: [] };
    if (!(w > 0) || !isFinite(w)) return { ok: false, error: 'The track needs a start that is less than its end (a < b).' };

    const xs = new Float64Array(N + 1), ys = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) {
      const x = i === N ? b : a + (w * i) / N;
      xs[i] = x;
      const y = fn(x);
      ys[i] = isFinite(y) ? y : NaN;
    }
    const finite = [];
    for (let i = 0; i <= N; i++) if (isFinite(ys[i])) finite.push(ys[i]);
    if (finite.length < 3) {
      const why = ast ? explainUndefined(ast, a + w / 2, P) : null;
      return { ok: false, error: 'This function has no real outputs between x = ' + FC.fmt(a) + ' and x = ' + FC.fmt(b) + (why ? ' (' + why + ')' : '') + '. Try a different domain.' };
    }
    finite.sort((p, q) => p - q);
    const q10 = quantile(finite, 0.1), q90 = quantile(finite, 0.9), med = quantile(finite, 0.5);
    let spread = q90 - q10;
    if (!(spread > 0)) spread = Math.max(1e-6, Math.abs(med) * 1e-3, finite[finite.length - 1] - finite[0]);
    const BOUND_HI = q90 + 2.5 * spread + 1e-9, BOUND_LO = q10 - 2.5 * spread - 1e-9;
    out.robust = { q10, q90, med, spread };

    // piecewise: exact joints instead of guessing from samples
    let pw = null, forced = [];
    if (ast && ast.type === 'piecewise') {
      pw = opts.pw || pwCheck(ast, P, { a, b });
      out.pw = pw.info;
      out.joints = pw.joints;
      forced = pw.joints.filter((j) => j.kind === 'jump' && j.x > a && j.x < b).map((j) => ({ x: j.x, L: j.L, R: j.R }));
    }

    // ---- 1. runs of valid samples
    const runs = [];
    let cur = null;
    for (let i = 0; i <= N; i++) {
      if (isFinite(ys[i])) { if (!cur) cur = { i0: i, i1: i }; else cur.i1 = i; }
      else if (cur) { runs.push(cur); cur = null; }
    }
    if (cur) runs.push(cur);

    // ---- 2. split runs at jump discontinuities
    const dys = [];
    for (const r of runs) for (let i = r.i0; i < r.i1; i++) dys.push(Math.abs(ys[i + 1] - ys[i]));
    dys.sort((p, q) => p - q);
    const medDy = quantile(dys, 0.5) || 0;
    const jumpThresh = Math.max(40 * medDy, 0.02 * spread);
    const pieces = []; // {xL, yL, xR, yR, iFrom, iTo, leftKind, rightKind}
    for (const r of runs) {
      let start = { x: xs[r.i0], y: ys[r.i0], kind: r.i0 === 0 ? 'domain' : 'undefined', i: r.i0 };
      for (let i = r.i0; i < r.i1; i++) {
        const fb = forced.length ? forced.find((q) => q.x > xs[i] && q.x <= xs[i + 1]) : null;
        if (fb) {
          pieces.push({ start, end: { x: fb.x, y: fb.L, kind: 'jump', i, pole: fb.x }, iFrom: start.i, iTo: i });
          start = { x: fb.x, y: fb.R, kind: 'jump', i: i + 1, pole: fb.x };
          continue;
        }
        const dy = Math.abs(ys[i + 1] - ys[i]);
        if (dy > jumpThresh) {
          const jr = testJump(fn, xs[i], ys[i], xs[i + 1], ys[i + 1]);
          if (jr) {
            pieces.push({ start, end: { x: jr.xl, y: jr.yl, kind: jr.kind, i, pole: 0.5 * (jr.xl + jr.xr) }, iFrom: start.i, iTo: i });
            start = { x: jr.xr, y: jr.yr, kind: jr.kind, i: i + 1, pole: 0.5 * (jr.xl + jr.xr) };
          }
        }
      }
      pieces.push({ start, end: { x: xs[r.i1], y: ys[r.i1], kind: r.i1 === N ? 'domain' : 'undefined', i: r.i1 }, iFrom: start.i, iTo: r.i1 });
    }

    // ---- 3. refine boundaries next to undefined regions
    for (const pc of pieces) {
      if (pc.start.kind === 'undefined' && pc.start.i > 0) {
        const xv = refineValidity(fn, xs[pc.start.i - 1], xs[pc.start.i], false);
        pc.start.x = xv; pc.start.y = fn(xv);
      }
      if (pc.end.kind === 'undefined' && pc.end.i < N) {
        const xv = refineValidity(fn, xs[pc.end.i], xs[pc.end.i + 1], true);
        pc.end.x = xv; pc.end.y = fn(xv);
      }
    }

    // ---- 4. trim runaway values next to interior boundaries (vertical asymptotes)
    for (const pc of pieces) {
      for (const side of ['start', 'end']) {
        const e = pc[side];
        if (e.kind === 'domain') continue;
        if (e.y <= BOUND_HI && e.y >= BOUND_LO) continue;
        // walk inward until inside bounds
        const inward = side === 'start' ? 1 : -1;
        let j = side === 'start' ? pc.iFrom : pc.iTo;
        // make sure we start from a sample within the piece
        let guard = 0;
        while (guard++ < N && j >= pc.iFrom && j <= pc.iTo && !(ys[j] <= BOUND_HI && ys[j] >= BOUND_LO)) j += inward;
        if (j < pc.iFrom || j > pc.iTo) { pc.dead = true; break; }
        const bound = e.y > BOUND_HI ? BOUND_HI : BOUND_LO;
        const g = (x) => fn(x) - bound;
        const xIn = xs[j];
        const xOut = e.x;
        let xc = xIn;
        const gi = g(xIn), go = g(xOut);
        if (isFinite(gi) && isFinite(go) && gi * go < 0) xc = FC.bisect(g, Math.min(xIn, xOut), Math.max(xIn, xOut), 70);
        else xc = xIn;
        e.x = xc; e.y = fn(xc); e.kind = 'asymptote';
        if (side === 'start') pc.iFrom = j; else pc.iTo = j;
      }
    }

    // ---- 5. assemble segments with dense sample arrays
    let segs = [];
    for (const pc of pieces) {
      if (pc.dead) continue;
      const x0 = pc.start.x, x1 = pc.end.x;
      if (!(x1 > x0)) continue;
      const sx = [x0], sy = [pc.start.y];
      for (let i = pc.iFrom; i <= pc.iTo; i++) {
        if (xs[i] > x0 + 1e-12 * w && xs[i] < x1 - 1e-12 * w && isFinite(ys[i])) { sx.push(xs[i]); sy.push(ys[i]); }
      }
      sx.push(x1); sy.push(pc.end.y);
      segs.push({ x0, x1, xs: sx, ys: sy, startKind: pc.start.kind, endKind: pc.end.kind, startPole: pc.start.pole, endPole: pc.end.pole });
    }
    // bridge single-point holes (removable discontinuities)
    const spacing = w / N;
    for (let k = segs.length - 2; k >= 0; k--) {
      const L = segs[k], R = segs[k + 1];
      if (L.endKind === 'undefined' && R.startKind === 'undefined' && R.x0 - L.x1 < 2.5 * spacing) {
        const yL = L.ys[L.ys.length - 1], yR = R.ys[0];
        if (Math.abs(yL - yR) < 0.02 * spread + 1e-9) {
          const hx = 0.5 * (L.x1 + R.x0);
          out.holes.push({ x: hx, y: 0.5 * (yL + yR), why: ast ? explainUndefined(ast, hx, P) : null });
          const merged = { x0: L.x0, x1: R.x1, xs: L.xs.concat(R.xs), ys: L.ys.concat(R.ys), startKind: L.startKind, endKind: R.endKind, hole: hx };
          segs.splice(k, 2, merged);
        }
      }
    }
    segs = segs.filter((s) => s.x1 - s.x0 > 1e-3 * w && s.xs.length >= 3);
    if (!segs.length) return { ok: false, error: 'This function doesn\'t make a usable track on this domain — it may be undefined or shoot off to infinity. Try a different domain.' };
    out.segments = segs;

    // gaps (including undefined edges)
    const addGap = (x0, x1, kind, extra) => {
      const at = extra && extra.pole !== undefined ? extra.pole : 0.5 * (x0 + x1);
      let why = null;
      if (pw) {
        const mid = 0.5 * (x0 + x1);
        const jj = pw.joints.find((j) => j.kind === 'jump' && Math.abs(j.x - at) < 1e-9 * Math.max(1, w));
        if (jj) { kind = 'jump'; why = 'piece ' + (jj.left + 1) + ' ends at height ' + FC.fmt(jj.L, 4) + ', piece ' + (jj.right + 1) + ' starts at ' + FC.fmt(jj.R, 4); }
        else {
          const pc = pw.info.pieceAt(mid);
          why = pc ? (explainUndefined(pc.ast, mid, P) || 'piece ' + (pc.k + 1) + ' is undefined here') : 'no piece covers this part of the domain';
          if (!pc && kind === 'undefined') kind = 'nopiece';
        }
      } else if (ast && kind !== 'jump') why = explainUndefined(ast, at, P) || explainUndefined(ast, 0.5 * (x0 + x1), P);
      out.gaps.push(Object.assign({ x0, x1, kind, why, at }, extra || {}));
    };
    if (segs[0].x0 > a + 1e-9 * w) addGap(a, segs[0].x0, segs[0].startKind === 'asymptote' ? 'asymptote' : 'undefined', { edge: 'start' });
    for (let k = 0; k < segs.length - 1; k++) {
      const L = segs[k], R = segs[k + 1];
      let kind = 'undefined';
      if (L.endKind === 'asymptote' || R.startKind === 'asymptote') kind = 'asymptote';
      else if (L.endKind === 'jump' || R.startKind === 'jump') kind = 'jump';
      const pole = L.endPole !== undefined ? L.endPole : R.startPole;
      addGap(L.x1, R.x0, kind, { yL: L.ys[L.ys.length - 1], yR: R.ys[0], pole });
    }
    const lastS = segs[segs.length - 1];
    if (lastS.x1 < b - 1e-9 * w) addGap(lastS.x1, b, lastS.endKind === 'asymptote' ? 'asymptote' : 'undefined', { edge: 'end' });

    // ---- 6. derivatives
    const D = pw ? pwDerivs(pw.info) : makeDerivs(fn, a, b, coeffs);
    out.d1 = D.d1; out.d2 = D.d2; out.exactDerivs = D.exact;

    // ---- 7. range and endpoints
    let yMin = Infinity, yMax = -Infinity, xAtMin = a, xAtMax = a;
    for (const s of segs) for (let i = 0; i < s.xs.length; i++) {
      if (s.ys[i] < yMin) { yMin = s.ys[i]; xAtMin = s.xs[i]; }
      if (s.ys[i] > yMax) { yMax = s.ys[i]; xAtMax = s.xs[i]; }
    }
    out.fa = segs[0].x0 === a ? segs[0].ys[0] : null;
    out.fb = lastS.x1 === b ? lastS.ys[lastS.ys.length - 1] : null;
    out.start = { x: segs[0].x0, y: segs[0].ys[0] };
    out.end = { x: lastS.x1, y: lastS.ys[lastS.ys.length - 1] };

    // ---- 8. zeros
    const zeros = [];
    const yScale = Math.max(1e-9, yMax - yMin, Math.abs(yMax), Math.abs(yMin));
    const inAnySeg = (x, tol = 0) => segs.some((s) => x >= s.x0 - tol && x <= s.x1 + tol);
    let polyInfo = null;
    if (coeffs) {
      polyInfo = polyFacts(coeffs);
      for (const r of polyInfo.realRoots) {
        if (inAnySeg(r.x, 2e-4 * w)) zeros.push({ x: r.x, y: 0, mult: r.mult, kind: r.mult % 2 === 0 ? 'touch' : 'cross', exact: true });
      }
    } else {
      const zt = 1e-9 * yScale;
      for (const s of segs) {
        for (let i = 0; i < s.xs.length - 1; i++) {
          const y0 = s.ys[i], y1 = s.ys[i + 1];
          if (y0 === 0 || Math.abs(y0) < zt) {
            if (i === 0 || !(Math.abs(s.ys[i - 1]) < zt)) zeros.push({ x: s.xs[i], y: 0, kind: 'cross' });
            continue;
          }
          if (y0 * y1 < 0) {
            const r = FC.brent(fn, s.xs[i], s.xs[i + 1], 1e-14 * Math.max(1, w));
            if (isFinite(r)) zeros.push({ x: r, y: 0, kind: 'cross' });
          } else if (i > 0) {
            // touching zero (like (x-1)^2): local min of |y| very close to 0
            const ym = s.ys[i - 1];
            if (Math.abs(y0) <= Math.abs(ym) && Math.abs(y0) <= Math.abs(y1) && Math.abs(y0) < 1e-3 * yScale && ym * y0 > 0 && y0 * y1 > 0) {
              const xe = refineExtremum((t) => D.d1(t, s.x0, s.x1), s.xs[i - 1], s.xs[i + 1]);
              if (xe !== null && Math.abs(fn(xe)) < 1e-7 * yScale) zeros.push({ x: xe, y: 0, kind: 'touch' });
            }
          }
        }
        const yl = s.ys[s.ys.length - 1];
        if (Math.abs(yl) < zt) zeros.push({ x: s.xs[s.xs.length - 1], y: 0, kind: 'cross' });
      }
    }
    // endpoints that sit (almost) on the ground count as zeros for the rider
    const nearTol = 2e-3 * yScale;
    for (const e of [out.start, out.end]) {
      if (Math.abs(e.y) < nearTol && !zeros.some((z) => Math.abs(z.x - e.x) < 2e-3 * w)) zeros.push({ x: e.x, y: 0, kind: 'cross', approx: true, endpoint: true });
    }
    zeros.sort((p, q) => p.x - q.x);
    for (let i = zeros.length - 1; i > 0; i--) if (Math.abs(zeros[i].x - zeros[i - 1].x) < 1e-7 * Math.max(1, w)) zeros.splice(i, 1);
    zeros.forEach((z) => { if (Math.abs(z.x - out.start.x) < 2e-3 * w) z.endpoint = 'start'; else if (Math.abs(z.x - out.end.x) < 2e-3 * w) z.endpoint = 'end'; });
    out.zeros = zeros;

    // ---- 9. turning points, flat spots, inflections, corners
    const maxima = [], minima = [], inflections = [], corners = [], flats = [];
    if (coeffs) {
      const d1c = P_.deriv(coeffs), d2c = P_.deriv(d1c);
      if (P_.degree(d1c) >= 1) {
        const cr = P_.analyzeRoots(d1c).real;
        for (const r of cr) {
          if (!(r.x > a && r.x < b)) continue;
          const y = P_.eval(coeffs, r.x);
          if (r.mult % 2 === 1) {
            const dd = P_.eval(d2c, r.x);
            let isMax = dd < 0;
            if (dd === 0 || r.mult > 1) isMax = P_.eval(d1c, r.x - 1e-4 * w) > 0;
            (isMax ? maxima : minima).push({ x: r.x, y });
          } else flats.push({ x: r.x, y });
        }
      }
      if (P_.degree(d2c) >= 1) {
        for (const r of P_.analyzeRoots(d2c).real) {
          if (r.mult % 2 === 1 && r.x > a && r.x < b) inflections.push({ x: r.x, y: P_.eval(coeffs, r.x) });
        }
      }
    } else {
      for (const s of segs) {
        const n = s.xs.length;
        const ds = new Float64Array(n), dd = new Float64Array(n);
        for (let i = 0; i < n; i++) { ds[i] = D.d1(s.xs[i], s.x0, s.x1); dd[i] = D.d2(s.xs[i], s.x0, s.x1); }
        const slopeTiny = 1e-9 * spread / w;
        let lastSign = 0, lastIdx = -1;
        for (let i = 0; i < n; i++) {
          const v = ds[i];
          if (!isFinite(v)) continue;
          const sg = Math.abs(v) <= slopeTiny ? 0 : Math.sign(v);
          if (sg === 0) continue;
          if (lastSign !== 0 && sg !== lastSign) {
            const xe = refineExtremum((t) => D.d1(t, s.x0, s.x1), s.xs[lastIdx], s.xs[i]);
            if (xe !== null && xe > s.x0 && xe < s.x1) {
              const y = fn(xe);
              if (isFinite(y)) {
                const corner = cornerAt(fn, xe, w, spread);
                const pt = { x: xe, y };
                if (corner) { pt.corner = true; corners.push(Object.assign({ x: xe, y, isExtremum: true }, corner)); }
                (lastSign > 0 ? maxima : minima).push(pt);
              }
            }
          }
          lastSign = sg; lastIdx = i;
        }
        // inflections (sign changes of f'')
        const ddAbs = [];
        for (let i = 0; i < n; i++) if (isFinite(dd[i])) ddAbs.push(Math.abs(dd[i]));
        ddAbs.sort((p, q) => p - q);
        const ddTiny = Math.max(1e-6 * spread / (w * w), 1e-4 * quantile(ddAbs, 0.5));
        let ls = 0, li = -1;
        for (let i = 0; i < n; i++) {
          const v = dd[i];
          if (!isFinite(v) || Math.abs(v) <= ddTiny) continue;
          const sg = Math.sign(v);
          if (ls !== 0 && sg !== ls) {
            let xi = null;
            if (pw) {
              const inside = pw.joints.filter((j) => j.x > s.xs[li] && j.x <= s.xs[i]);
              if (inside.length === 1) xi = inside[0].x;
              else if (inside.length > 1) { ls = sg; li = i; continue; } // a straight piece in between: no single point
            }
            if (xi === null) xi = FC.bisect((t) => D.d2(t, s.x0, s.x1), s.xs[li], s.xs[i], 60);
            const nearCorner = corners.some((c) => Math.abs(c.x - xi) < 3 * spacing) || maxima.concat(minima).some((m) => m.corner && Math.abs(m.x - xi) < 3 * spacing);
            if (!nearCorner && xi > s.x0 && xi < s.x1) { const y = fn(xi); if (isFinite(y)) inflections.push({ x: xi, y }); }
          }
          ls = sg; li = i;
        }
        // corners that are not turning points (e.g. x + |x|)
        for (let i = 1; i < n - 1; i++) {
          if (s.xs[i - 1] - s.x0 < 2 * spacing || s.x1 - s.xs[i + 1] < 2 * spacing) continue;
          const jump = Math.abs(ds[i + 1] - ds[i - 1]);
          if (!(jump > 0.3 * (Math.abs(ds[i + 1]) + Math.abs(ds[i - 1])) + 1e-6 * spread / w)) continue;
          const expected = Math.abs(dd[i]) * (s.xs[i + 1] - s.xs[i - 1]) * 3;
          if (jump <= expected) continue;
          const c = cornerAt(fn, s.xs[i], w, spread, s.xs[i - 1], s.xs[i + 1]);
          if (c && !corners.some((k) => Math.abs(k.x - c.x) < 3 * spacing)) {
            corners.push({ x: c.x, y: fn(c.x), leftSlope: c.leftSlope, rightSlope: c.rightSlope });
          }
        }
      }
    }
    if (pw) {
      for (const j of pw.joints) {
        if (j.kind !== 'corner' || !segs.some((sg) => j.x > sg.x0 && j.x < sg.x1)) continue;
        let merged = false;
        for (let k = corners.length - 1; k >= 0; k--) {
          if (Math.abs(corners[k].x - j.x) >= 3 * spacing) continue;
          if (corners[k].isExtremum && !merged) { Object.assign(corners[k], { x: j.x, y: j.L, leftSlope: j.sL, rightSlope: j.sR, joint: true }); merged = true; }
          else corners.splice(k, 1);
        }
        if (!merged) corners.push({ x: j.x, y: j.L, leftSlope: j.sL, rightSlope: j.sR, joint: true });
        for (const m of maxima.concat(minima)) if (Math.abs(m.x - j.x) < 3 * spacing) { m.x = j.x; m.y = j.L; m.corner = true; }
      }
    }
    maxima.sort((p, q) => p.x - q.x); minima.sort((p, q) => p.x - q.x); inflections.sort((p, q) => p.x - q.x); corners.sort((p, q) => p.x - q.x);
    out.maxima = maxima; out.minima = minima; out.inflections = inflections; out.corners = corners; out.flats = flats;
    out.turningPoints = maxima.length + minima.length;
    for (const m of maxima) if (m.y > yMax) { yMax = m.y; xAtMax = m.x; }
    for (const m of minima) if (m.y < yMin) { yMin = m.y; xAtMin = m.x; }
    out.yMin = yMin; out.yMax = yMax;
    out.absMax = { x: xAtMax, y: yMax }; out.absMin = { x: xAtMin, y: yMin };

    // ---- 10. y-intercept
    out.yIntercept = null;
    if (inAnySeg(0)) { const y0 = fn(0); if (isFinite(y0)) out.yIntercept = { x: 0, y: y0 }; }

    // ---- 11. increasing / decreasing and concavity intervals
    out.monotone = intervals(segs, maxima.concat(minima, flats).map((p) => p.x), D.d1, spread / w);
    out.concavity = intervals(segs, inflections.map((p) => p.x).concat(corners.map((c) => c.x)), D.d2, spread / (w * w));

    // ---- 12. steepest point & arc length
    let steep = { x: segs[0].x0, slope: 0 };
    let arc = 0;
    for (const s of segs) {
      for (let i = 0; i < s.xs.length; i++) {
        const d = D.d1(s.xs[i], s.x0, s.x1);
        if (isFinite(d) && Math.abs(d) > Math.abs(steep.slope)) steep = { x: s.xs[i], slope: d };
        if (i) arc += Math.hypot(s.xs[i] - s.xs[i - 1], s.ys[i] - s.ys[i - 1]);
      }
    }
    steep.y = fn(steep.x);
    steep.angle = Math.atan(Math.abs(steep.slope)) * 180 / Math.PI;
    out.steepest = steep;
    out.arcLength = arc;

    // ---- 13. average rate of change over the ride
    out.avgRate = (out.end.y - out.start.y) / (out.end.x - out.start.x);

    // ---- 14. symmetry
    out.symmetry = symmetry(fn, a, b, Math.max(spread, Math.abs(yMax), Math.abs(yMin)));

    // ---- 15. family facts
    out.poly = polyInfo;
    if (ast) {
      out.family = FCMath.classify(ast, P, coeffs);
      if (!coeffs) {
        out.sinusoid = FCMath.sinusoid(ast, P);
        out.absForm = FCMath.absForm(ast, P);
        out.expForm = FCMath.expForm(ast, P);
      }
    }

    // ---- 16. landmark list for ride narration
    const lm = [];
    zeros.forEach((z) => lm.push({ x: z.x, y: 0, type: 'zero', data: z }));
    maxima.forEach((m) => lm.push({ x: m.x, y: m.y, type: 'max', data: m }));
    minima.forEach((m) => lm.push({ x: m.x, y: m.y, type: 'min', data: m }));
    inflections.forEach((m) => lm.push({ x: m.x, y: m.y, type: 'inflection', data: m }));
    corners.forEach((m) => { if (!m.isExtremum) lm.push({ x: m.x, y: m.y, type: 'corner', data: m }); });
    if (out.yIntercept) lm.push({ x: 0, y: out.yIntercept.y, type: 'yint' });
    lm.push({ x: steep.x, y: steep.y, type: 'steepest', data: steep });
    if (pw) for (const j of pw.joints) if ((j.kind === 'smooth' || j.kind === 'corner') && j.x > a && j.x < b) lm.push({ x: j.x, y: j.L, type: 'joint', data: j });
    lm.sort((p, q) => p.x - q.x);
    out.landmarks = lm;

    out.thumb = thumb(segs, a, b, 48);
    return out;
  }

  function testJump(fn, xl, yl, xr, yr) {
    const dy0 = Math.abs(yr - yl);
    for (let k = 0; k < 56; k++) {
      const xm = 0.5 * (xl + xr);
      if (xm <= xl || xm >= xr) break;
      const ym = fn(xm);
      if (!isFinite(ym)) {
        // undefined point inside: treat as a (tiny) undefined gap
        return { xl, yl, xr, yr, kind: 'undefined' };
      }
      if (Math.abs(ym - yl) >= Math.abs(yr - ym)) { xr = xm; yr = ym; } else { xl = xm; yl = ym; }
    }
    const dyf = Math.abs(yr - yl);
    if (dyf > 0.25 * dy0) return { xl, yl, xr, yr, kind: 'jump' };
    return null;
  }

  /** Boundary between valid/invalid. If validLeft, [lo] is valid and [hi] invalid. Returns a valid x. */
  function refineValidity(fn, lo, hi, validLeft) {
    for (let k = 0; k < 60; k++) {
      const m = 0.5 * (lo + hi);
      if (m <= lo || m >= hi) break;
      const ok = isFinite(fn(m));
      if (ok === validLeft) lo = m; else hi = m;
    }
    return validLeft ? lo : hi;
  }

  function refineExtremum(d1, lo, hi) {
    const dl = d1(lo), dh = d1(hi);
    if (!isFinite(dl) || !isFinite(dh)) return 0.5 * (lo + hi);
    if (dl * dh > 0) return 0.5 * (lo + hi);
    return FC.bisect(d1, lo, hi, 70);
  }

  function cornerAt(fn, x, w, spread, lo, hi) {
    // locate kink precisely by comparing one-sided slopes
    let xc = x;
    if (lo !== undefined) {
      // minimize the fit error: search for the point where left & right secant slopes differ most
      let best = x, bestJ = -1;
      for (let k = 0; k <= 40; k++) {
        const t = lo + (hi - lo) * k / 40;
        const j = kinkStrength(fn, t, (hi - lo) / 80);
        if (j > bestJ) { bestJ = j; best = t; }
      }
      xc = best;
      let span = (hi - lo) / 40;
      for (let r = 0; r < 25; r++) {
        let b2 = xc, bj = -1;
        for (let k = -4; k <= 4; k++) {
          const t = xc + span * k / 4;
          const j = kinkStrength(fn, t, span / 8);
          if (j > bj) { bj = j; b2 = t; }
        }
        xc = b2; span /= 3;
      }
    }
    const d = 1e-7 * Math.max(w, 1e-9);
    const f0 = fn(xc);
    const left = (f0 - fn(xc - d)) / d, right = (fn(xc + d) - f0) / d;
    const left2 = (f0 - fn(xc - d / 10)) / (d / 10), right2 = (fn(xc + d / 10) - f0) / (d / 10);
    const diff = Math.abs(right - left), diff2 = Math.abs(right2 - left2);
    const scale = Math.abs(left) + Math.abs(right) + spread / w;
    if (diff > 0.05 * scale && diff2 > 0.8 * diff) return { x: xc, leftSlope: left, rightSlope: right };
    return null;
  }
  function kinkStrength(fn, t, h) {
    const f0 = fn(t), fl = fn(t - h), fr = fn(t + h);
    if (!isFinite(f0) || !isFinite(fl) || !isFinite(fr)) return -1;
    return Math.abs((fr - f0) - (f0 - fl));
  }

  function intervals(segs, cuts, dfn, scale) {
    const res = [];
    const tiny = 1e-9 * scale;
    for (const s of segs) {
      const pts = [s.x0].concat(cuts.filter((c) => c > s.x0 && c < s.x1).sort((p, q) => p - q), [s.x1]);
      for (let i = 0; i < pts.length - 1; i++) {
        const x0 = pts[i], x1 = pts[i + 1];
        if (x1 - x0 <= 0) continue;
        // sample a few interior points to get a robust sign
        let pos = 0, neg = 0;
        for (let k = 1; k <= 5; k++) {
          const v = dfn(x0 + (x1 - x0) * k / 6, s.x0, s.x1);
          if (!isFinite(v)) continue;
          if (v > tiny) pos++; else if (v < -tiny) neg++;
        }
        const dir = pos > neg ? 1 : neg > pos ? -1 : 0;
        const last = res[res.length - 1];
        if (last && last.dir === dir && last.seg === s) last.x1 = x1;
        else res.push({ x0, x1, dir, seg: s });
      }
    }
    return res;
  }

  function symmetry(fn, a, b, scale) {
    const res = { even: false, odd: false, domainSymmetric: Math.abs(a + b) <= 1e-9 * Math.max(1, b - a) };
    if (!(a < 0 && b > 0)) return res;
    const m = Math.min(-a, b);
    if (m < 0.15 * (b - a)) return res;
    let even = true, odd = true, count = 0;
    const tol = 1e-7 * Math.max(1, scale);
    for (let k = 1; k <= 120; k++) {
      const x = (m * k) / 120 - 1e-9 * m;
      const f1 = fn(x), f2 = fn(-x);
      if (!isFinite(f1) || !isFinite(f2)) continue;
      count++;
      if (Math.abs(f1 - f2) > tol) even = false;
      if (Math.abs(f1 + f2) > tol) odd = false;
      if (!even && !odd) break;
    }
    if (count < 12) return res;
    if (even && odd) odd = false; // f ≡ 0: call it even
    res.even = even; res.odd = odd;
    return res;
  }

  function thumb(segs, a, b, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = a + (b - a) * i / n;
      let y = null;
      for (const s of segs) {
        if (x >= s.x0 && x <= s.x1) {
          // linear interpolation in the dense samples
          let lo = 0, hi = s.xs.length - 1;
          while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s.xs[mid] <= x) lo = mid; else hi = mid; }
          const t = (x - s.xs[lo]) / ((s.xs[hi] - s.xs[lo]) || 1);
          y = s.ys[lo] + (s.ys[hi] - s.ys[lo]) * t;
          break;
        }
      }
      pts.push(y === null ? null : +y.toPrecision(5));
    }
    return pts;
  }

  function polyFacts(coeffs) {
    const c = P_.trim(coeffs);
    const deg = c.length - 1;
    const lead = c[deg];
    const roots = deg >= 1 ? P_.analyzeRoots(c) : { real: [], complex: [] };
    const info = {
      coeffs: c, degree: deg, lead,
      realRoots: roots.real, complexRoots: roots.complex,
      realRootCount: roots.real.reduce((s, r) => s + r.mult, 0),
      distinctRealRoots: roots.real.length,
      maxTurning: Math.max(0, deg - 1), maxZeros: deg,
      endBehavior: deg >= 1 ? { right: Math.sign(lead), left: Math.sign(lead) * (deg % 2 === 0 ? 1 : -1) } : null,
    };
    if (deg === 1) info.linear = { m: c[1], b: c[0], xInt: -c[0] / c[1] };
    if (deg === 2) {
      const A = c[2], B = c[1], C = c[0];
      const h = -B / (2 * A), k = P_.eval(c, h);
      info.quadratic = { a: A, b: B, c: C, h, k, disc: B * B - 4 * A * C, opensUp: A > 0 };
    }
    return info;
  }

  /** Search for zeros near/around the domain (for "snap ends to zeros"). */
  function findZeros(fn, lo, hi, n = 4000) {
    const zs = [];
    let px = lo, py = fn(lo);
    for (let i = 1; i <= n; i++) {
      const x = lo + (hi - lo) * i / n;
      const y = fn(x);
      if (isFinite(py) && isFinite(y)) {
        if (py === 0) zs.push(px);
        else if (py * y < 0) {
          const r = FC.brent(fn, px, x);
          const yr = fn(r);
          // skip sign changes that are really asymptotes
          if (isFinite(r) && Math.abs(yr) < 1e-6 * (1 + Math.abs(py) + Math.abs(y))) zs.push(r);
        }
      }
      px = x; py = y;
    }
    return zs;
  }

  return { analyze, makeDerivs, findZeros, polyFacts, explainUndefined, pwCheck, pwDerivs };
})();
if (typeof module !== 'undefined') module.exports = FCAnalysis;
