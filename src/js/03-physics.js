/* =====================================================================
   FCPhysics — the coaster moving along y = f(x)
   World units are meters: X = (x − xc)·Sx, Y = f(x)·Sy
   ===================================================================== */
var FCPhysics = (function () {
  const GRAV = 9.81;
  const CAR_SPACING = 2.9;
  const N_CARS = 3;

  /** Meters per graph unit: 10 m unless the track would be tiny (< 30 m) or huge (> 600 m). */
  function autoScale(an) {
    const ex = an.width;
    const ey = Math.max(an.yMax, 0) - Math.min(an.yMin, 0);
    const m = Math.max(ex, ey, 1e-9);
    if (m >= 3 && m <= 60) return 10;
    if (m > 60) return FC.nice125(600 / m);
    return FC.nice125(30 / m);
  }

  // ------------------------------------------------------------------ track model
  function buildTrack(an, fn, opts) {
    const Sx = opts.Sx, Sy = opts.Sy;
    const xc = 0.5 * (an.a + an.b);
    const d1 = an.d1, d2 = an.d2;
    const cornerXs = an.corners.map((c) => c.x);
    const cornerTol = 6e-4 * an.width;

    let approx = 0;
    for (const s of an.segments) for (let i = 1; i < s.xs.length; i++) approx += Math.hypot((s.xs[i] - s.xs[i - 1]) * Sx, (s.ys[i] - s.ys[i - 1]) * Sy);
    const maxChord = FC.clamp(approx / 5000, 0.02, 1.5);

    const segs = an.segments.map((s, idx) => {
      const xs = [s.xs[0]], X = [(s.xs[0] - xc) * Sx], Y = [s.ys[0] * Sy];
      for (let i = 0; i < s.xs.length - 1; i++) {
        const xa = s.xs[i], xb = s.xs[i + 1], ya = s.ys[i], yb = s.ys[i + 1];
        const c = Math.hypot((xb - xa) * Sx, (yb - ya) * Sy);
        const k = Math.min(96, Math.max(1, Math.ceil(c / maxChord)));
        for (let j = 1; j <= k; j++) {
          const x = j === k ? xb : xa + ((xb - xa) * j) / k;
          const y = j === k ? yb : fn(x);
          if (!isFinite(y)) continue;
          xs.push(x); X.push((x - xc) * Sx); Y.push(y * Sy);
        }
      }
      const n = xs.length;
      const cum = new Float64Array(n);
      for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);
      return {
        idx, x0: s.x0, x1: s.x1, xs: Float64Array.from(xs), X: Float64Array.from(X), Y: Float64Array.from(Y), cum, L: cum[n - 1],
        startKind: s.startKind, endKind: s.endKind,
      };
    });

    let minX = Infinity, maxX = -Infinity, minY = 0, maxY = 0;
    for (const s of segs) for (let i = 0; i < s.X.length; i++) {
      if (s.X[i] < minX) minX = s.X[i]; if (s.X[i] > maxX) maxX = s.X[i];
      if (s.Y[i] < minY) minY = s.Y[i]; if (s.Y[i] > maxY) maxY = s.Y[i];
    }
    const track = {
      an, fn, Sx, Sy, xc, segs, cornerXs, cornerTol,
      totalLength: segs.reduce((t, s) => t + s.L, 0),
      bounds: { minX, maxX, minY, maxY, trackMinY: Math.min(...segs.map((s) => Math.min(...s.Y))), trackMaxY: Math.max(...segs.map((s) => Math.max(...s.Y))) },
      toMath: (X, Y) => ({ x: X / Sx + xc, y: Y / Sy }),
      toWorld: (x, y) => ({ X: (x - xc) * Sx, Y: y * Sy }),
    };
    track.poseAt = (seg, s) => poseAt(track, seg, s);
    return track;
  }

  function poseAt(track, seg, s) {
    const { Sx, Sy, xc, fn } = track;
    const n = seg.xs.length;
    if (s <= 0) s = 0; else if (s >= seg.L) s = seg.L;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (seg.cum[mid] <= s) lo = mid; else hi = mid; }
    const span = seg.cum[hi] - seg.cum[lo];
    const t = span > 0 ? (s - seg.cum[lo]) / span : 0;
    const x = seg.xs[lo] + (seg.xs[hi] - seg.xs[lo]) * t;
    // a segment's end points come from its own side of a jump (one-sided limits), so read them from the table
    let y = x >= seg.x1 ? seg.Y[n - 1] / Sy : x <= seg.x0 ? seg.Y[0] / Sy : fn(x);
    if (!isFinite(y)) y = (seg.Y[lo] + (seg.Y[hi] - seg.Y[lo]) * t) / Sy;
    let p = track.an.d1(x, seg.x0, seg.x1);
    if (!isFinite(p)) p = ((seg.Y[hi] - seg.Y[lo]) / Sy) / ((seg.xs[hi] - seg.xs[lo]) || 1e-12);
    let q = track.an.d2(x, seg.x0, seg.x1);
    if (!isFinite(q)) q = 0;
    for (const cx of track.cornerXs) if (Math.abs(x - cx) < track.cornerTol) { q = 0; break; }
    const m = (p * Sy) / Sx;
    const den = Math.sqrt(1 + m * m);
    const tx = 1 / den, ty = m / den;
    const kappa = ((q * Sy) / (Sx * Sx)) / (den * den * den);
    return { X: (x - xc) * Sx, Y: y * Sy, x, y, tx, ty, nx: -ty, ny: tx, slope: p, kappa, seg: seg.idx };
  }

  function segStartS(seg, x) {
    // arc length at math x (binary search on xs)
    let lo = 0, hi = seg.xs.length - 1;
    if (x <= seg.xs[0]) return 0;
    if (x >= seg.xs[hi]) return seg.L;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (seg.xs[mid] <= x) lo = mid; else hi = mid; }
    const t = (x - seg.xs[lo]) / ((seg.xs[hi] - seg.xs[lo]) || 1);
    return seg.cum[lo] + (seg.cum[hi] - seg.cum[lo]) * t;
  }

  // ------------------------------------------------------------------ simulation
  const DEFAULTS = { mode: 'lift', v0: 20, vLift: 6, friction: true, g: GRAV };

  class Sim {
    constructor(track, opts) {
      this.track = track;
      this.o = Object.assign({}, DEFAULTS, opts || {});
      this.mu = this.o.friction ? 0.015 : 0;
      this.kd = this.o.friction ? 0.00035 : 0;
      const seg0 = track.segs[0];
      this.pieces = [{ kind: 'track', seg: seg0, s0: 0, s1: seg0.L, u0: 0, L: seg0.L }];
      this.pi = 0;
      this.u = 0;
      const m = this.o.mode;
      this.v = m === 'launch' ? Math.max(0, this.o.v0) : (m === 'lift' || m === 'firstlift') ? this.o.vLift : 0.4;
      this.liftEnabled = m === 'lift' || m === 'firstlift';
      this.t = 0;
      this.done = false;
      this.reason = null;
      this.events = [];
      this.G = 1; this.Gdisp = 1;
      this.lifting = false;
      this.firstCrestPassed = false;
      this.stuckTimer = 0;
      this.lastSign = Math.sign(this.v) || 1;
      this.flightT = 0;
      this.lmSeen = new Map();
      const p0 = track.poseAt(seg0, 0);
      this.pose = p0;
      this.mathX = p0.x;
      this.Ymin = track.bounds.trackMinY;
      this.energy = { pe: this.o.g * (p0.Y - this.Ymin), ke: 0.5 * this.v * this.v, heat: 0, lift: 0, launch: 0.5 * this.v * this.v };
      this.stats = {
        maxSpeed: this.v, maxSpeedX: p0.x, maxG: -Infinity, maxGX: p0.x, minG: Infinity, minGX: p0.x,
        airtime: 0, floatTime: 0, heavyTime: 0, maxDrop: 0, maxHeight: p0.Y, distance: 0, reversals: 0, liftTime: 0,
        landmarksPassed: 0, turningPassed: 0, gSwitches: 0, steepestDeg: 0, cornerHits: 0,
        flights: [], flightTime: 0, landingImpact: 0, duration: 0, reachedEnd: false, outcome: null,
        startY: p0.Y, startSpeed: this.v,
      };
      this._desc = false; this._descTop = p0.Y; this._lastY = p0.Y; this._lowG = false;
      this.emit({ type: 'start', x: p0.x, y: p0.y, mode: m, v: this.v });
    }

    emit(e) { e.t = this.t; this.events.push(e); }
    drainEvents() { const e = this.events; this.events = []; return e; }

    piece() { return this.pieces[this.pi]; }

    accel(piece, u, v) {
      const s = piece.s0 + (u - piece.u0);
      const p = this.track.poseAt(piece.seg, s);
      const g = this.o.g;
      const N = g * p.tx + v * v * p.kappa;
      let a = -g * p.ty;
      if (v !== 0) a -= Math.sign(v) * (this.mu * Math.abs(N) + this.kd * v * v);
      return { a, p, N };
    }

    step(dt) {
      if (this.done) return;
      const piece = this.piece();
      if (piece.kind === 'track') this.stepTrack(piece, dt);
      else if (piece.kind === 'flight') this.stepFlight(piece, dt);
      else this.stepBrake(piece, dt);
      this.t += dt;
      this.stats.duration = this.t;
      this.stats.maxSpeed = Math.max(this.stats.maxSpeed, Math.abs(this.v));
      if (this.t > 900 && !this.done) this.finish('timeout', 'The ride went on for 15 minutes — that\'s enough!');
    }

    stepTrack(piece, dt) {
      const g = this.o.g;
      const st = this.stats;
      const before = this.accel(piece, this.u, this.v);
      const p = before.p;
      // --- drive (chain lift / booster tires)
      let driving = false;
      if (this.liftEnabled && p.ty > -0.02 && this.v < this.o.vLift + 1e-9 && this.v > -0.5) {
        if (this.o.mode === 'lift' || !this.firstCrestPassed) driving = true;
      }
      if (driving !== this.lifting) {
        this.lifting = driving;
        this.emit({ type: driving ? 'lift-on' : 'lift-off', x: p.x, y: p.y });
        if (!driving && this.o.mode === 'firstlift' && p.ty <= 0) this.firstCrestPassed = true;
      }
      const u0 = this.u, v0 = this.v;
      // along-track force the rider feels (pressed into the seat back on a lift, ~0 when coasting)
      this.Glong = ((driving ? 0 : before.a) + g * p.ty) / g;
      if (driving) {
        this.v = this.o.vLift;
        this.u += this.v * dt;
        st.liftTime += dt;
        this.energy.lift += g * Math.max(0, p.ty) * this.v * dt + (this.mu * Math.abs(before.N)) * this.v * dt;
      } else {
        // RK4 on (u, v)
        const f = (u, v) => this.accel(piece, u, v).a;
        const k1v = before.a, k1u = v0;
        const k2v = f(u0 + 0.5 * dt * k1u, v0 + 0.5 * dt * k1v), k2u = v0 + 0.5 * dt * k1v;
        const k3v = f(u0 + 0.5 * dt * k2u, v0 + 0.5 * dt * k2v), k3u = v0 + 0.5 * dt * k2v;
        const k4v = f(u0 + dt * k3u, v0 + dt * k3v), k4u = v0 + dt * k3v;
        let vNew = v0 + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
        const uNew = u0 + (dt / 6) * (k1u + 2 * k2u + 2 * k3u + k4u);
        // friction can stop the car but never push it backwards
        const gravA = -g * p.ty;
        if (v0 !== 0 && Math.sign(vNew) !== Math.sign(v0) && Math.abs(gravA) < this.mu * Math.abs(before.N) + 1e-3) vNew = 0;
        this.v = vNew; this.u = uNew;
        this.energy.heat += (this.mu * Math.abs(before.N) + this.kd * v0 * v0) * Math.abs(v0) * dt;
      }
      // --- after-step pose & stats
      const sNow = piece.s0 + (this.u - piece.u0);
      const pN = this.track.poseAt(piece.seg, Math.min(Math.max(sNow, 0), piece.seg.L));
      this.pose = pN;
      const Nn = g * pN.tx + this.v * this.v * pN.kappa;
      this.G = Nn / g;
      this.Gdisp += (this.G - this.Gdisp) * Math.min(1, dt / 0.06);
      st.distance += Math.abs(this.v) * dt;
      const speed = Math.abs(this.v);
      if (speed >= st.maxSpeed) { st.maxSpeed = speed; st.maxSpeedX = pN.x; }
      if (this.G > st.maxG) { st.maxG = this.G; st.maxGX = pN.x; }
      if (this.G < st.minG) { st.minG = this.G; st.minGX = pN.x; }
      this.Gtotal = Math.hypot(this.G, this.Glong || 0);
      if (this.G < 0) st.airtime += dt;
      if (this.Gtotal < 0.35) st.floatTime += dt;
      if (this.G > 3) st.heavyTime += dt;
      const low = this.G < 0.5;
      if (low !== this._lowG) { st.gSwitches++; this._lowG = low; }
      if (this.G < 0 && !this._inAir) { this._inAir = true; this.emit({ type: 'airtime', x: pN.x, y: pN.y, G: this.G }); }
      else if (this.G > 0.2) this._inAir = false;
      if (this.G > 3.5 && !this._heavy) { this._heavy = true; this.emit({ type: 'heavy', x: pN.x, y: pN.y, G: this.G }); }
      else if (this.G < 2.5) this._heavy = false;
      st.steepestDeg = Math.max(st.steepestDeg, Math.abs(Math.atan2(pN.ty, pN.tx)) * 180 / Math.PI);
      st.maxHeight = Math.max(st.maxHeight, pN.Y);
      // drops
      if (pN.Y < this._lastY - 1e-7) {
        if (!this._desc) { this._desc = true; this._descTop = this._lastY; }
        st.maxDrop = Math.max(st.maxDrop, this._descTop - pN.Y);
      } else if (pN.Y > this._lastY + 1e-7) this._desc = false;
      this._lastY = pN.Y;
      this.energy.pe = g * (pN.Y - this.Ymin);
      this.energy.ke = 0.5 * this.v * this.v;
      // landmarks crossed
      this.crossLandmarks(this.mathX, pN.x);
      this.mathX = pN.x;
      // reversals / stuck
      const sg = Math.sign(this.v);
      if (sg !== 0 && sg !== this.lastSign) {
        st.reversals++;
        this.lastSign = sg;
        if (sg < 0) this.emit({ type: 'rollback', x: pN.x, y: pN.y });
      }
      if (Math.abs(this.v) < 0.05 && !driving) {
        this.stuckTimer += dt;
        if (this.stuckTimer > 1.2) return this.finish('stuck', null, pN);
      } else this.stuckTimer = 0;
      if (st.reversals >= 9) return this.finish('stuck', null, pN);
      // --- boundaries
      if (sNow >= piece.s1) return this.onTrackEnd(piece);
      if (sNow <= piece.s0 && this.v < 0) {
        if (piece.seg.idx === 0 && piece.s0 === 0) return this.finish('rollback', null, pN);
        return this.finish('fell-back', null, pN);
      }
    }

    crossLandmarks(xOld, xNew) {
      if (xOld === xNew) return;
      const lo = Math.min(xOld, xNew), hi = Math.max(xOld, xNew);
      const lms = this.track.an.landmarks;
      for (let i = 0; i < lms.length; i++) {
        const lm = lms[i];
        if (lm.x > lo && lm.x <= hi) {
          const last = this.lmSeen.get(i);
          if (last === undefined) {
            this.stats.landmarksPassed++;
            if (lm.type === 'max' || lm.type === 'min') this.stats.turningPassed++;
          }
          if (last === undefined || this.t - last > 4) this.emit({ type: 'landmark', lm, x: lm.x, y: lm.y, first: last === undefined, G: this.G, v: this.v });
          this.lmSeen.set(i, this.t);
          if (last === undefined && (lm.type === 'corner' || (lm.data && lm.data.corner))) { this.stats.cornerHits++; this.emit({ type: 'corner', x: lm.x, y: lm.y }); }
        }
      }
    }

    onTrackEnd(piece) {
      const seg = piece.seg;
      const segs = this.track.segs;
      const pEnd = this.track.poseAt(seg, seg.L);
      const speed = Math.max(this.v, 0);
      const isLast = seg.idx === segs.length - 1;
      const heightRange = Math.max(1, this.track.bounds.maxY - this.track.bounds.minY);
      if (isLast) {
        this.stats.reachedEnd = true;
        this.stats.endSpeed = speed;
        const groundish = Math.abs(pEnd.Y) <= Math.max(1.5, 0.03 * heightRange) || pEnd.Y < 0;
        if (groundish) {
          this.appendPiece({ kind: 'station', X0: pEnd.X, Y0: pEnd.Y, L: 60 });
          this.emit({ type: 'station', x: pEnd.x, y: pEnd.y, v: speed, slope: pEnd.slope });
          return;
        }
      }
      this.takeoff(pEnd, speed, seg.idx, isLast);
    }

    appendPiece(pc) {
      const cur = this.pieces[this.pieces.length - 1];
      pc.u0 = cur.u0 + cur.L;
      this.pieces.push(pc);
      this.pi = this.pieces.length - 1;
      this.u = pc.u0 + 1e-9;
      return pc;
    }

    takeoff(p, speed, segIdx, offEnd) {
      const g = this.o.g;
      const tr = this.track;
      const VX = speed * p.tx, VY = speed * p.ty;
      const X0 = p.X, Y0 = p.Y;
      const pts = [[X0, Y0]];
      const dtf = FC.clamp(0.25 / Math.max(speed, 1), 0.0005, 0.02);
      let landing = null, t = 0;
      const segAt = (x, minIdx) => tr.segs.find((s) => s.idx >= minIdx && x >= s.x0 && x <= s.x1) || null;
      let prevInside = null;
      for (let k = 0; k < 400000; k++) {
        const tn = t + dtf;
        const Xn = X0 + VX * tn, Yn = Y0 + VY * tn - 0.5 * g * tn * tn;
        const xm = Xn / tr.Sx + tr.xc;
        const s = segAt(xm, segIdx + 1);
        if (s) {
          const yT = tr.fn(xm) * tr.Sy;
          if (isFinite(yT) && Yn <= yT) {
            if (prevInside !== s) { landing = { type: 'wall', X: Xn, Y: Yn, t: tn, seg: s }; pts.push([Xn, Math.min(Yn, yT)]); break; }
            // refine landing time
            const h = (tt) => (Y0 + VY * tt - 0.5 * g * tt * tt) - tr.fn((X0 + VX * tt) / tr.Sx + tr.xc) * tr.Sy;
            const tl = FC.bisect(h, t, tn, 50);
            const XL = X0 + VX * tl, YL = Y0 + VY * tl - 0.5 * g * tl * tl;
            landing = { type: 'track', X: XL, Y: YL, t: tl, seg: s, x: XL / tr.Sx + tr.xc };
            pts.push([XL, YL]);
            break;
          }
          prevInside = s;
        } else {
          prevInside = null;
          const overAny = tr.segs.some((q) => xm >= q.x0 && xm <= q.x1);
          if (!overAny && Yn <= 0 && Y0 >= 0) {
            const tl = FC.bisect((tt) => Y0 + VY * tt - 0.5 * g * tt * tt, t, tn, 50);
            const XL = X0 + VX * tl;
            landing = { type: 'ground', X: XL, Y: 0, t: tl };
            pts.push([XL, 0]);
            break;
          }
          if (!overAny && Y0 < 0 && Yn <= Y0 - 1) {
            landing = { type: 'ground', X: Xn, Y: Yn, t: tn, underground: true };
            pts.push([Xn, Yn]);
            break;
          }
        }
        if (Yn < tr.bounds.minY - 200 || tn > 120) { landing = { type: 'ground', X: Xn, Y: Yn, t: tn }; pts.push([Xn, Yn]); break; }
        pts.push([Xn, Yn]);
        t = tn;
      }
      // polyline with arc length
      const n = pts.length;
      const cum = new Float64Array(n);
      for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      // flight parabola in math units:  y = A(x − h)² + k
      const Sx = tr.Sx, Sy = tr.Sy;
      const x0m = X0 / Sx + tr.xc, y0m = Y0 / Sy;
      let parab = null;
      if (Math.abs(VX) > 1e-6) {
        const A = -(g * Sx * Sx) / (2 * VX * VX * Sy);
        const B = (VY / VX) * (Sx / Sy);
        // y = y0 + B (x − x0) + A (x − x0)²  → vertex form
        const hh = x0m - B / (2 * A), kk = y0m - (B * B) / (4 * A);
        parab = { A, h: hh, k: kk, x0: x0m, y0: y0m };
      }
      const flight = {
        kind: 'flight', pts, cum, L: cum[n - 1], X0, Y0, VX, VY, tLand: landing.t, landing, parab, offEnd,
        fromX: x0m, toX: landing.X / Sx + tr.xc, peakY: VY > 0 ? (Y0 + VY * VY / (2 * g)) / Sy : y0m,
      };
      this.appendPiece(flight);
      this.flightT = 0;
      this.stats.flights.push({ fromX: flight.fromX, toX: flight.toX, distance: Math.abs(flight.toX - flight.fromX), time: landing.t, parab, landing: landing.type, peakY: flight.peakY, offEnd });
      this.emit({ type: 'takeoff', x: x0m, y: y0m, v: speed, parab, landing, offEnd });
    }

    stepFlight(piece, dt) {
      const g = this.o.g;
      this.flightT += dt;
      const tt = Math.min(this.flightT, piece.tLand);
      const X = piece.X0 + piece.VX * tt;
      // arc length at X (X is monotone along the polyline)
      const pts = piece.pts;
      let lo = 0, hi = pts.length - 1;
      if (X <= pts[0][0]) hi = 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid][0] <= X) lo = mid; else hi = mid; }
      const segLen = pts[hi][0] - pts[lo][0];
      const f = segLen > 0 ? FC.clamp((X - pts[lo][0]) / segLen, 0, 1) : 0;
      this.u = piece.u0 + piece.cum[lo] + (piece.cum[hi] - piece.cum[lo]) * f;
      const vy = piece.VY - g * tt;
      this.v = Math.hypot(piece.VX, vy);
      this.G = 0; this.Glong = 0; this.Gtotal = 0;
      this.Gdisp += (0 - this.Gdisp) * Math.min(1, dt / 0.06);
      this.stats.flightTime += dt;
      this.stats.distance += this.v * dt;
      const Y = piece.Y0 + piece.VY * tt - 0.5 * g * tt * tt;
      this.stats.maxHeight = Math.max(this.stats.maxHeight, Y);
      this.pose = { X, Y, x: X / this.track.Sx + this.track.xc, y: Y / this.track.Sy, tx: piece.VX / this.v, ty: vy / this.v };
      this.energy.pe = g * (Y - this.Ymin); this.energy.ke = 0.5 * this.v * this.v;
      if (this.flightT >= piece.tLand) this.land(piece, vy);
    }

    land(piece, vyLand) {
      const L = piece.landing;
      const tr = this.track;
      this.u = piece.u0 + piece.L;
      if (L.type === 'track') {
        const s = segStartS(L.seg, L.x);
        const p = tr.poseAt(L.seg, s);
        const vt = piece.VX * p.tx + vyLand * p.ty;
        const vn = piece.VX * p.nx + vyLand * p.ny;
        this.stats.landingImpact = Math.max(this.stats.landingImpact, Math.abs(vn));
        this.emit({ type: 'land', x: L.x, y: p.y, impact: Math.abs(vn), onto: 'track' });
        this.appendPiece({ kind: 'track', seg: L.seg, s0: s, s1: L.seg.L, L: L.seg.L - s });
        this.v = vt;
        this.lastSign = Math.sign(vt) || 1;
        this.mathX = L.x;
        this.G = 1 + Math.abs(vn) / 2;
        return;
      }
      if (L.type === 'wall') {
        this.v = 0;
        this.emit({ type: 'crash', x: L.X / tr.Sx + tr.xc, y: L.Y / tr.Sy, wall: true });
        return this.finish('wall');
      }
      // ground
      const impact = Math.abs(vyLand);
      this.stats.landingImpact = Math.max(this.stats.landingImpact, impact);
      this.emit({ type: 'land', x: L.X / tr.Sx + tr.xc, y: L.Y / tr.Sy, impact, onto: 'ground' });
      this.appendPiece({ kind: 'ground', X0: L.X, Y0: L.Y, L: 400 });
      this.v = Math.abs(piece.VX) * 0.55;
    }

    stepBrake(piece, dt) {
      const decel = piece.kind === 'station' ? 0.55 * this.o.g : 0.7 * this.o.g;
      const v0 = this.v;
      this.v = Math.max(0, this.v - decel * dt);
      this.u += 0.5 * (v0 + this.v) * dt;
      this.G = 1; this.Glong = -decel / this.o.g; this.Gtotal = Math.hypot(1, this.Glong); this.Gdisp += (1 - this.Gdisp) * Math.min(1, dt / 0.1);
      const d = this.u - piece.u0;
      this.pose = { X: piece.X0 + d, Y: piece.Y0, x: (piece.X0 + d) / this.track.Sx + this.track.xc, y: piece.Y0 / this.track.Sy, tx: 1, ty: 0 };
      this.energy.ke = 0.5 * this.v * this.v; this.energy.heat += 0.5 * (v0 * v0 - this.v * this.v);
      if (this.v <= 0 || d >= piece.L - 0.5) {
        if (piece.kind === 'station') this.finish('station');
        else this.finish('crash-landing');
      }
    }

    finish(reason, msg, pose) {
      if (this.done) return;
      this.done = true;
      this.reason = reason;
      this.stats.outcome = reason;
      this.stats.duration = this.t;
      const p = pose || this.pose;
      this.stats.endX = p ? p.x : null;
      this.emit({ type: 'finish', reason, msg, x: p && p.x, y: p && p.y });
    }

    /** Pose of the point u meters along the ride path (for cars). */
    poseAtU(u) {
      if (u < 0) {
        // waiting in the start station: a short level platform behind the first point
        const p = this.track.poseAt(this.track.segs[0], 0);
        const X = p.X + u;
        return { X, Y: p.Y, x: X / this.track.Sx + this.track.xc, y: p.y, tx: 1, ty: 0, nx: 0, ny: 1, station: true, hidden: u < -9 };
      }
      let k = Math.min(this.pi, this.pieces.length - 1);
      while (k > 0 && u < this.pieces[k].u0) k--;
      const pc = this.pieces[k];
      const d = u - pc.u0;
      if (pc.kind === 'track') {
        const p = this.track.poseAt(pc.seg, pc.s0 + d);
        return p;
      }
      if (pc.kind === 'flight') {
        const pts = pc.pts;
        let lo = 0, hi = pts.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pc.cum[mid] <= d) lo = mid; else hi = mid; }
        const span = pc.cum[hi] - pc.cum[lo];
        const f = span > 0 ? FC.clamp((d - pc.cum[lo]) / span, 0, 1) : 0;
        const X = pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, Y = pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f;
        const tt = pc.VX !== 0 ? (X - pc.X0) / pc.VX : 0;
        const vy = pc.VY - this.o.g * tt;
        const sp = Math.hypot(pc.VX, vy) || 1;
        const tx = pc.VX / sp, ty = vy / sp;
        return { X, Y, x: X / this.track.Sx + this.track.xc, y: Y / this.track.Sy, tx, ty, nx: -ty, ny: tx, flying: true };
      }
      const X = pc.X0 + d;
      const hidden = pc.kind === 'station' && d > 7;
      return { X, Y: pc.Y0, x: X / this.track.Sx + this.track.xc, y: pc.Y0 / this.track.Sy, tx: 1, ty: 0, nx: 0, ny: 1, hidden, onGround: pc.kind === 'ground' };
    }

    carPoses(n = N_CARS, spacing = CAR_SPACING) {
      const out = [];
      for (let i = 0; i < n; i++) out.push(this.poseAtU(this.u - i * spacing));
      return out;
    }
  }

  function simulate(track, opts, maxT = 240, dt = 1 / 120) {
    const sim = new Sim(track, opts);
    while (!sim.done && sim.t < maxT) {
      sim.step(dt);
      sim.events.length = 0;
    }
    if (!sim.done) sim.finish('timeout');
    return sim.stats;
  }

  /** Smallest launch speed that gets the train to the end of the last track piece. */
  function minLaunchSpeed(track, opts) {
    const g = (opts && opts.g) || GRAV;
    const rise = Math.max(0, track.bounds.trackMaxY - track.segs[0].Y[0]);
    let lo = 0, hi = Math.sqrt(2 * g * rise) * 1.6 + 25;
    const ok = (v) => simulate(track, Object.assign({}, opts, { mode: 'launch', v0: v }), 180, 1 / 90).reachedEnd;
    if (!ok(hi)) { hi *= 2.5; if (!ok(hi)) return null; }
    if (ok(0.4)) return 0;
    for (let i = 0; i < 18; i++) {
      const mid = 0.5 * (lo + hi);
      if (ok(mid)) hi = mid; else lo = mid;
    }
    return hi;
  }

  // ------------------------------------------------------------------ ratings
  function ratings(st) {
    const clamp = FC.clamp;
    const vmax = st.maxSpeed || 0;
    const maxG = isFinite(st.maxG) ? st.maxG : 1, minG = isFinite(st.minG) ? st.minG : 1;
    const flightDist = st.flights.reduce((s, f) => s + f.distance, 0);
    let ex = 2.2 * clamp(vmax / 35, 0, 1.4)
      + 1.6 * clamp(st.maxDrop / 50, 0, 1.4)
      + 1.4 * clamp(st.floatTime / 2, 0, 1.2)
      + 0.35 * Math.min(st.turningPassed, 8)
      + 0.8 * clamp(st.duration / 45, 0, 1)
      + 0.6 * clamp(st.steepestDeg / 80, 0, 1)
      + (st.flights.length ? 1 : 0);
    let penalty = 0;
    if (maxG > 5) penalty += (maxG - 5) * 0.45;
    if (minG < -1.5) penalty += (-1.5 - minG) * 0.45;
    penalty += st.cornerHits * 0.6;
    ex -= Math.min(penalty, 3.5);
    if (!st.reachedEnd) ex *= 0.6;
    if (vmax < 3) ex = Math.min(ex, 1);
    let inten = Math.max(0, maxG - 1) * 1.1 + Math.max(0, -minG) * 1.4 + vmax / 18 + st.steepestDeg / 45 + st.cornerHits * 1.5 + (st.landingImpact > 5 ? 1.5 : 0);
    let naus = st.airtime * 1.2 + st.gSwitches * 0.18 + (st.flights.length ? 1.5 : 0) + st.reversals * 0.7 + Math.max(0, maxG - 4) * 0.35 + st.cornerHits * 0.8;
    const lab = (v) => v < 2 ? 'Low' : v < 4 ? 'Medium' : v < 6 ? 'High' : v < 8 ? 'Very high' : v < 10 ? 'Extreme' : 'Ultra-extreme';
    ex = clamp(ex, 0, 10);
    const r = {
      excitement: ex, intensity: Math.max(0, inten), nausea: Math.max(0, naus),
      flightDist,
    };
    r.labels = { excitement: lab(r.excitement), intensity: lab(r.intensity), nausea: lab(r.nausea) };
    r.safety = safety(st);
    return r;
  }

  function safety(st) {
    const notes = [];
    let level = 'ok';
    if (st.maxG > 6) { notes.push({ lvl: 'bad', text: 'Max ' + FC.fmt(st.maxG, 1) + ' G — riders would black out (real coasters stay under ~5 G).' }); level = 'bad'; }
    else if (st.maxG > 4.5) { notes.push({ lvl: 'warn', text: 'Max ' + FC.fmt(st.maxG, 1) + ' G — very intense (limit is about 5 G).' }); if (level === 'ok') level = 'warn'; }
    if (st.minG < -2) { notes.push({ lvl: 'bad', text: 'Min ' + FC.fmt(st.minG, 1) + ' G — riders would be thrown against the lap bars (real coasters stay above ~−1.5 G).' }); level = 'bad'; }
    else if (st.minG < -1) { notes.push({ lvl: 'warn', text: 'Min ' + FC.fmt(st.minG, 1) + ' G — strong "ejector" airtime.' }); if (level === 'ok') level = 'warn'; }
    if (st.cornerHits) { notes.push({ lvl: 'bad', text: 'Sharp corner! Real track must be smooth — a corner means an instant change of direction (infinite G in theory).' }); level = 'bad'; }
    if (st.landingImpact > 6) { notes.push({ lvl: 'bad', text: 'Hard landing at ' + FC.fmt(st.landingImpact, 1) + ' m/s.' }); level = 'bad'; }
    if (st.endSpeed > 25 && st.outcome === 'station') notes.push({ lvl: 'warn', text: 'Hits the station at ' + FC.fmt(st.endSpeed, 1) + ' m/s — needs strong brakes!' });
    return { level, notes };
  }

  return { buildTrack, Sim, simulate, minLaunchSpeed, ratings, autoScale, GRAV, CAR_SPACING, N_CARS, segStartS };
})();
if (typeof module !== 'undefined') module.exports = FCPhysics;
