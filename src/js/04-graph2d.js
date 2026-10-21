/* =====================================================================
   FCGraph — the 2D coordinate-plane view of the track
   ===================================================================== */
var FCGraph = (function () {
  const COLORS = {
    skyTop: '#bfe2ff', skyBottom: '#eef8ff', earthTop: '#d5b48a', earthBottom: '#8e6a44', grass: '#58b04f',
    grid: 'rgba(29, 53, 110, 0.13)', gridEarth: 'rgba(255, 255, 255, 0.16)', axis: '#23355f', label: '#2a3a66', labelEarth: '#fff7ea',
    rail: '#e63956', railHi: '#ff9fb1', tie: '#6b4a33', support: 'rgba(120, 132, 160, 0.75)',
    up: '#15a86b', down: '#e63956', cup: '#2f7fe0', cdown: '#f08a24',
    zero: '#06b27f', max: '#e63956', min: '#2f7fe0', infl: '#8a55e6', yint: '#e0a100', corner: '#ff7a00', target: '#8a55e6',
  };
  const CAR_COLORS = ['#ff4d6d', '#ffd166', '#2ec4b6', '#a06cf0', '#4cc9f0'];

  class Graph {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.opts = { labels: true, tangent: true, secant: false, colorMode: 'plain', equal: false };
      this.data = null;
      this.view = { x0: -1, x1: 1, y0: -1, y1: 1 };
      this.userView = false;
      this.sim = null;
      this.target = null;
      this.prediction = null;
      this.hover = null;
      this.pulse = null;
      this.speedProfile = null;
      this.W = 300; this.H = 150; this.dpr = 1;
      this.onPick = null;
      this.onHover = null;
      this.pickMode = false;
      this._bind();
    }

    // ------------------------------------------------------------ setup
    setData(d) {
      this.data = d;
      this.speedProfile = null;
      if (!this.userView) this.fit();
    }
    setTarget(t) { this.target = t; if (!this.userView) this.fit(); }
    resize() {
      const r = this.cv.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      this.dpr = dpr;
      this.W = Math.max(50, r.width); this.H = Math.max(50, r.height);
      this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
      if (!this.userView && this.data) this.fit();
    }
    fit() {
      if (!this.data) return;
      const an = this.data.an;
      let x0 = an.a, x1 = an.b, y0 = an.yMin, y1 = an.yMax;
      if (this.target && this.target.an) {
        x0 = Math.min(x0, this.target.an.a); x1 = Math.max(x1, this.target.an.b);
        y0 = Math.min(y0, this.target.an.yMin); y1 = Math.max(y1, this.target.an.yMax);
      }
      if (this.extraPts) for (const p of this.extraPts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
      let yr = y1 - y0;
      if (!(yr > 1e-9)) { yr = Math.max(1, Math.abs(y0)); y0 -= yr / 2; y1 += yr / 2; }
      if (y0 > 0 && y0 <= 0.6 * (y1 - y0)) y0 = 0;
      if (y1 < 0 && -y1 <= 0.6 * (y1 - y0)) y1 = 0;
      // pixel paddings: room for the tool chips on top, labels and stations around
      const padL = 58, padR = 40, padT = 64, padB = 34;
      const W = Math.max(this.W - padL - padR, 40), H = Math.max(this.H - padT - padB, 40);
      const kx = (x1 - x0) / W, ky = (y1 - y0) / H;
      x0 -= padL * kx; x1 += padR * kx; y0 -= padB * ky; y1 += padT * ky;
      if (this.opts.equal) {
        const sx = (x1 - x0) / this.W, sy = (y1 - y0) / this.H;
        if (sx > sy) { const c = (y0 + y1) / 2, h = sx * this.H; y0 = c - h / 2; y1 = c + h / 2; }
        else { const c = (x0 + x1) / 2, w = sy * this.W; x0 = c - w / 2; x1 = c + w / 2; }
      }
      this.view = { x0, x1, y0, y1 };
    }
    includePoints(pts) {
      this.extraPts = pts;
      if (!this.userView) this.fit();
    }
    resetView() { this.userView = false; this.extraPts = null; this.fit(); }

    sx(x) { return ((x - this.view.x0) / (this.view.x1 - this.view.x0)) * this.W; }
    sy(y) { return this.H - ((y - this.view.y0) / (this.view.y1 - this.view.y0)) * this.H; }
    mx(px) { return this.view.x0 + (px / this.W) * (this.view.x1 - this.view.x0); }
    my(py) { return this.view.y0 + ((this.H - py) / this.H) * (this.view.y1 - this.view.y0); }
    clampY(py) { return py < -1e5 ? -1e5 : py > 1e5 ? 1e5 : py; }

    // ------------------------------------------------------------ events
    _bind() {
      const cv = this.cv;
      let down = null;
      cv.addEventListener('pointerdown', (e) => {
        cv.setPointerCapture(e.pointerId);
        down = { x: e.offsetX, y: e.offsetY, view: Object.assign({}, this.view), moved: false };
      });
      cv.addEventListener('pointermove', (e) => {
        if (down) {
          const dx = e.offsetX - down.x, dy = e.offsetY - down.y;
          if (!down.moved && Math.hypot(dx, dy) > 5) down.moved = true;
          if (down.moved && !this.pickMode) {
            const kx = (down.view.x1 - down.view.x0) / this.W, ky = (down.view.y1 - down.view.y0) / this.H;
            this.view = { x0: down.view.x0 - dx * kx, x1: down.view.x1 - dx * kx, y0: down.view.y0 + dy * ky, y1: down.view.y1 + dy * ky };
            this.userView = true;
            this.dirty = true;
          }
        }
        this.hover = { px: e.offsetX, py: e.offsetY };
        this.dirty = true;
        if (this.onHover) this.onHover(this.mx(e.offsetX));
      });
      cv.addEventListener('pointerup', (e) => {
        if (down && !down.moved && this.onPick) this.onPick(this.mx(e.offsetX), this.my(e.offsetY));
        down = null;
      });
      cv.addEventListener('pointerleave', () => { this.hover = null; this.dirty = true; if (this.onHover) this.onHover(null); });
      cv.addEventListener('wheel', (e) => {
        e.preventDefault();
        const f = Math.exp(e.deltaY * 0.0015);
        const mx = this.mx(e.offsetX), my = this.my(e.offsetY);
        const v = this.view;
        this.view = { x0: mx + (v.x0 - mx) * f, x1: mx + (v.x1 - mx) * f, y0: my + (v.y0 - my) * f, y1: my + (v.y1 - my) * f };
        this.userView = true;
        this.dirty = true;
      }, { passive: false });
      cv.addEventListener('dblclick', () => { this.resetView(); this.dirty = true; });
    }

    // ------------------------------------------------------------ drawing
    draw() {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.W, this.H);
      this.drawBackground();
      this.drawGrid();
      if (!this.data) return;
      this.drawGaps();
      if (this.target) this.drawTarget();
      this.drawSupports();
      this.drawTrack();
      this.drawFlights();
      this.placed = [];
      if (this.data.an.pw) this.drawPieceMarks();
      this.drawLandmarks();
      if (this.prediction !== null && this.prediction !== undefined) this.drawPrediction();
      if (this.sim) this.drawTrain();
      if (this.hover && !this.riding) this.drawHover();
      if (this.pulse) this.drawPulse();
      this.drawFooter();
      this.dirty = false;
    }

    drawBackground() {
      const ctx = this.ctx, W = this.W, H = this.H;
      const gy = FC.clamp(this.sy(0), -10, H + 10);
      if (gy > 0) {
        const g = ctx.createLinearGradient(0, 0, 0, Math.max(gy, 1));
        g.addColorStop(0, COLORS.skyTop); g.addColorStop(1, COLORS.skyBottom);
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, Math.min(gy, H));
      }
      if (gy < H) {
        const g = ctx.createLinearGradient(0, Math.max(gy, 0), 0, H);
        g.addColorStop(0, COLORS.earthTop); g.addColorStop(1, COLORS.earthBottom);
        ctx.fillStyle = g; ctx.fillRect(0, Math.max(gy, 0), W, H - Math.max(gy, 0));
        // strata
        ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
        for (let y = Math.max(gy, 0) + 14; y < H; y += 18) {
          ctx.beginPath();
          for (let x = 0; x <= W; x += 24) ctx.lineTo(x, y + Math.sin(x * 0.03 + y) * 2.5);
          ctx.stroke();
        }
      }
      if (gy > -4 && gy < H + 4) {
        ctx.fillStyle = COLORS.grass; ctx.fillRect(0, gy - 2, W, 5);
      }
    }

    ticks(lo, hi, px) {
      const step = FC.niceStep(hi - lo, Math.max(2, px));
      const out = [];
      const start = Math.ceil(lo / step) * step;
      for (let v = start; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
      return { step, vals: out };
    }
    fmtTick(v, step) {
      const dec = Math.max(0, Math.ceil(-Math.log10(step) - 1e-9) + (FC.nice125(step) / Math.pow(10, Math.floor(Math.log10(step))) === 5 ? 0 : 0));
      if (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-4 && v !== 0)) return FC.fmt(v, 2);
      return v.toFixed(Math.min(dec, 6)).replace('-', '−');
    }

    drawGrid() {
      const ctx = this.ctx, W = this.W, H = this.H;
      const tx = this.ticks(this.view.x0, this.view.x1, W / 85);
      const ty = this.ticks(this.view.y0, this.view.y1, H / 55);
      this._ticks = { tx, ty };
      const gy = this.sy(0);
      ctx.lineWidth = 1;
      for (const v of tx.vals) {
        const x = Math.round(this.sx(v)) + 0.5;
        ctx.strokeStyle = COLORS.grid;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, Math.min(H, gy)); ctx.stroke();
        if (gy < H) { ctx.strokeStyle = COLORS.gridEarth; ctx.beginPath(); ctx.moveTo(x, Math.max(0, gy)); ctx.lineTo(x, H); ctx.stroke(); }
      }
      for (const v of ty.vals) {
        const y = Math.round(this.sy(v)) + 0.5;
        ctx.strokeStyle = v < 0 ? COLORS.gridEarth : COLORS.grid;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      // axes
      ctx.strokeStyle = COLORS.axis; ctx.lineWidth = 2;
      const x0s = this.sx(0);
      if (x0s >= 0 && x0s <= W) { ctx.beginPath(); ctx.moveTo(x0s, 0); ctx.lineTo(x0s, H); ctx.stroke(); }
      if (gy >= 0 && gy <= H) { ctx.strokeStyle = 'rgba(35, 53, 95, 0.9)'; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
      // tick labels
      ctx.font = '600 11px Nunito, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const labelY = FC.clamp(gy + 6, 4, H - 16);
      for (const v of tx.vals) {
        if (v === 0 && x0s > 0 && x0s < W) continue;
        const x = this.sx(v);
        if (x < 14 || x > W - 14) continue;
        this.tag(this.fmtTick(v, tx.step), x, labelY, labelY > gy ? COLORS.labelEarth : COLORS.label, 'center', 'top', labelY !== gy + 6);
      }
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      const labelX = FC.clamp(x0s - 6, 30, W - 6);
      for (const v of ty.vals) {
        const y = this.sy(v);
        if (y < 10 || y > H - 10 || v === 0) continue;
        this.tag(this.fmtTick(v, ty.step), labelX, y, v < 0 ? COLORS.labelEarth : COLORS.label, 'right', 'middle', labelX !== x0s - 6);
      }
      // axis names
      ctx.font = 'italic 600 14px "Times New Roman", serif';
      ctx.fillStyle = COLORS.axis; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      if (gy >= 0 && gy <= H) ctx.fillText('x', W - 6, gy - 4);
      if (x0s >= 0 && x0s <= W) { ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('y', x0s + 5, 4); }
    }
    tag(text, x, y, color, align, base, boxed) {
      const ctx = this.ctx;
      ctx.textAlign = align; ctx.textBaseline = base;
      if (boxed) {
        const w = ctx.measureText(text).width + 6;
        const bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w + 3 : x - 3;
        const by = base === 'top' ? y - 1 : y - 8;
        ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(bx, by, w, 15);
        color = COLORS.label;
      }
      ctx.fillStyle = color; ctx.fillText(text, x, y);
    }

    drawGaps() {
      const ctx = this.ctx, an = this.data.an;
      for (const g of an.gaps) {
        const xa = this.sx(g.x0), xb = this.sx(g.x1);
        if (xb < 0 || xa > this.W) continue;
        ctx.save();
        if (g.kind === 'asymptote') {
          const xp = this.sx(g.at !== undefined ? g.at : (g.x0 + g.x1) / 2);
          ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(230, 57, 86, 0.8)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(xp, 0); ctx.lineTo(xp, this.H); ctx.stroke();
          ctx.setLineDash([]);
          this.label('asymptote', xp + 4, 14, '#c21f3d', 'left');
        } else if ((g.kind === 'undefined' || g.kind === 'nopiece') && xb - xa > 3) {
          ctx.fillStyle = 'rgba(255, 159, 67, 0.12)'; ctx.fillRect(xa, 0, xb - xa, this.H);
          ctx.strokeStyle = 'rgba(255, 159, 67, 0.35)'; ctx.lineWidth = 1;
          for (let x = xa - this.H; x < xb; x += 12) { ctx.beginPath(); ctx.moveTo(Math.max(x, xa), x < xa ? this.H - (xa - x) : this.H); ctx.lineTo(Math.min(x + this.H, xb), x + this.H > xb ? this.H - (xb - x) : 0); ctx.stroke(); }
          if (xb - xa > 60) this.label(g.kind === 'nopiece' ? 'no piece here' : 'undefined', (xa + xb) / 2, 14, '#b35c00', 'center');
        }
        ctx.restore();
      }
      for (const h of an.holes) {
        const x = this.sx(h.x), y = this.sy(h.y);
        ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = COLORS.rail; ctx.stroke();
      }
    }

    segScreenPts(seg, step = 1) {
      const pts = [];
      const W = this.W;
      const n = seg.xs.length;
      let lastPx = -Infinity;
      for (let i = 0; i < n; i++) {
        const px = this.sx(seg.xs[i]);
        if (px < -40 && i < n - 1 && this.sx(seg.xs[i + 1]) < -40) continue;
        if (px > W + 40 && i > 0 && this.sx(seg.xs[i - 1]) > W + 40) break;
        if (i !== 0 && i !== n - 1 && px - lastPx < step * 0.35) {
          // keep extreme points so steep parts stay sharp
          const py = this.sy(seg.ys[i]);
          const prev = pts[pts.length - 1];
          if (prev && Math.abs(py - prev[1]) < 1.5) continue;
        }
        pts.push([px, this.clampY(this.sy(seg.ys[i])), seg.xs[i], seg.ys[i]]);
        lastPx = px;
      }
      return pts;
    }

    drawTarget() {
      const ctx = this.ctx, an = this.target.an;
      ctx.save();
      for (const seg of an.segments) {
        const pts = this.segScreenPts(seg);
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(138, 85, 230, 0.18)'; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
        ctx.setLineDash([10, 8]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(138, 85, 230, 0.85)'; ctx.stroke();
      }
      ctx.restore();
      if (this.target.hints) {
        for (const h of this.target.hints) {
          const x = this.sx(h.x), y = this.sy(h.y);
          ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = 'rgba(138, 85, 230, 0.9)'; ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
          this.label('(' + FC.fmt(h.x, 2) + ', ' + FC.fmt(h.y, 2) + ')', x + 8, y - 12, '#5b2fb0', 'left');
        }
      }
    }

    drawSupports() {
      const ctx = this.ctx, an = this.data.an;
      const gy = this.sy(0);
      ctx.save();
      ctx.strokeStyle = COLORS.support; ctx.lineWidth = 1.5;
      const every = 22;
      for (const seg of an.segments) {
        const x0 = Math.max(this.sx(seg.x0), 0), x1 = Math.min(this.sx(seg.x1), this.W);
        const start = Math.ceil(x0 / every) * every;
        for (let px = start; px <= x1; px += every) {
          const xm = this.mx(px);
          const y = this.data.fn(xm);
          if (!isFinite(y) || y <= 0) continue;
          const py = this.sy(y);
          if (py > this.H) continue;
          ctx.beginPath(); ctx.moveTo(px, Math.max(py + 4, -5)); ctx.lineTo(px, Math.min(gy, this.H)); ctx.stroke();
          if (gy - py > 40) {
            ctx.beginPath(); ctx.moveTo(px - 4, Math.min(gy, this.H)); ctx.lineTo(px + 4, Math.min(gy, this.H)); ctx.stroke();
          }
        }
      }
      ctx.restore();
    }

    colorMode() { return this.opts.colorMode === 'plain' && this.data && this.data.an.pw ? 'pieces' : this.opts.colorMode; }
    colorAt(x, seg) {
      const m = this.colorMode();
      const an = this.data.an;
      if (m === 'pieces') {
        const info = an.pw;
        const p = info.pieceAt(x) || info.pieceAt(x - 1e-9 * (1 + Math.abs(x))) || info.pieceAt(x + 1e-9 * (1 + Math.abs(x)));
        return p ? FC.pieceColor(p.k) : COLORS.rail;
      }
      if (m === 'slope') {
        const d = an.d1(x, seg.x0, seg.x1);
        return !isFinite(d) || Math.abs(d) < 1e-9 ? '#7d8aa8' : d > 0 ? COLORS.up : COLORS.down;
      }
      if (m === 'concavity') {
        const d = an.d2(x, seg.x0, seg.x1);
        return !isFinite(d) || Math.abs(d) < 1e-9 ? '#7d8aa8' : d > 0 ? COLORS.cup : COLORS.cdown;
      }
      if (m === 'speed' && this.speedProfile) {
        const sp = this.speedProfile;
        const i = Math.floor(((x - sp.a) / (sp.b - sp.a)) * sp.bins.length);
        const v = sp.bins[FC.clamp(i, 0, sp.bins.length - 1)];
        if (v === null || v === undefined) return '#9aa3b8';
        return heat(v / (sp.vmax || 1));
      }
      return COLORS.rail;
    }

    drawTrack() {
      const ctx = this.ctx, an = this.data.an;
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      for (const seg of an.segments) {
        const pts = this.segScreenPts(seg);
        if (pts.length < 2) continue;
        // shadow
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
        ctx.strokeStyle = 'rgba(20, 20, 40, 0.28)'; ctx.lineWidth = 9; ctx.stroke();
        // ties
        ctx.strokeStyle = COLORS.tie; ctx.lineWidth = 2;
        let acc = 0;
        for (let i = 1; i < pts.length; i++) {
          const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1];
          const L = Math.hypot(dx, dy);
          acc += L;
          if (acc >= 11 && L > 0) {
            acc = 0;
            const nx = -dy / L, ny = dx / L;
            ctx.beginPath(); ctx.moveTo(pts[i][0] - nx * 6, pts[i][1] - ny * 6); ctx.lineTo(pts[i][0] + nx * 6, pts[i][1] + ny * 6); ctx.stroke();
          }
        }
        // rails (colored runs)
        ctx.lineWidth = 4.5;
        let runColor = null;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const c = this.colorMode() === 'plain' ? COLORS.rail : this.colorAt(i === 0 ? pts[0][2] : 0.5 * (pts[i][2] + pts[i - 1][2]), seg);
          if (i === 0) { runColor = c; ctx.moveTo(pts[0][0], pts[0][1]); continue; }
          if (c !== runColor) {
            ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.strokeStyle = runColor; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); runColor = c;
          } else ctx.lineTo(pts[i][0], pts[i][1]);
        }
        ctx.strokeStyle = runColor; ctx.stroke();
        // highlight
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1] - 1.2) : ctx.moveTo(p[0], p[1] - 1.2)));
        ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();
        // segment end caps (gaps)
        const ends = [];
        if (an.pw) continue; // piecewise tracks show open/closed endpoint dots instead
        if (seg.startKind !== 'domain') ends.push(pts[0]);
        if (seg.endKind !== 'domain') ends.push(pts[pts.length - 1]);
        for (const e of ends) {
          ctx.fillStyle = '#fff'; ctx.strokeStyle = '#c21f3d'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.rect(e[0] - 4, e[1] - 7, 8, 14); ctx.fill(); ctx.stroke();
        }
      }
      // stations at the ends
      const st = an.segments[0], en = an.segments[an.segments.length - 1];
      this.drawStation(this.sx(st.x0), this.sy(st.ys[0]), -1);
      const endY = en.ys[en.ys.length - 1];
      const heightRange = Math.max(1e-9, an.yMax - Math.min(an.yMin, 0));
      if (Math.abs(endY) < 0.03 * heightRange || endY < 0) this.drawStation(this.sx(en.x1), this.sy(endY), 1);
      else this.drawRamp(this.sx(en.x1), this.sy(endY));
      ctx.restore();
    }
    drawStation(px, py, dir) {
      const ctx = this.ctx;
      if (px < -60 || px > this.W + 60) return;
      ctx.save();
      ctx.translate(px + dir * 22, py);
      ctx.fillStyle = '#fff4dc'; ctx.strokeStyle = '#6b4a33'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.rect(-16, -20, 32, 18); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e63956';
      ctx.beginPath(); ctx.moveTo(-20, -20); ctx.lineTo(0, -32); ctx.lineTo(20, -20); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6b4a33'; ctx.font = '800 7px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('STATION', 0, -11);
      ctx.restore();
    }
    drawRamp(px, py) {
      const ctx = this.ctx;
      ctx.save();
      ctx.fillStyle = '#ffd166'; ctx.strokeStyle = '#7a5200'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px, py - 4); ctx.lineTo(px + 10, py - 12); ctx.lineTo(px + 10, py + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    drawFlights() {
      if (!this.sim) return;
      const ctx = this.ctx, tr = this.data.track;
      for (const pc of this.sim.pieces) {
        if (pc.kind !== 'flight') continue;
        ctx.save();
        ctx.setLineDash([7, 6]); ctx.strokeStyle = '#8a55e6'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        pc.pts.forEach((p, i) => {
          const m = tr.toMath(p[0], p[1]);
          const X = this.sx(m.x), Y = this.clampY(this.sy(m.y));
          i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
        });
        ctx.stroke(); ctx.setLineDash([]);
        const last = pc.pts[pc.pts.length - 1];
        const lm = tr.toMath(last[0], last[1]);
        ctx.fillStyle = '#8a55e6';
        ctx.beginPath(); ctx.arc(this.sx(lm.x), this.sy(lm.y), 5, 0, Math.PI * 2); ctx.fill();
        if (pc.parab && this.opts.labels) {
          const p = pc.parab;
          const eq = 'y = ' + FC.fmt(p.A, 3) + '(x − ' + FC.fmt(p.h, 3) + ')² + ' + FC.fmt(p.k, 3);
          const apexX = pc.VY > 0 ? p.h : p.x0;
          const apexY = pc.VY > 0 ? p.k : p.y0;
          const ly = Math.max(this.sy(apexY) - 22, 58);
          this.label(eq.replace('− −', '+ ').replace('+ −', '− '), FC.clamp(this.sx(apexX), 120, this.W - 120), ly, '#5b2fb0', 'center', true);
        }
        ctx.restore();
      }
    }

    label(text, x, y, color, align = 'center', strong = false) {
      const ctx = this.ctx;
      ctx.font = (strong ? '800 ' : '700 ') + '11.5px Nunito, system-ui, sans-serif';
      const w = ctx.measureText(text).width + 10;
      let bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      bx = FC.clamp(bx, 2, this.W - w - 2);
      const by = FC.clamp(y - 9, 2, this.H - 20);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      roundRect(ctx, bx, by, w, 18, 6); ctx.fill();
      ctx.strokeStyle = color; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + 5, by + 9.5);
      return { x: bx, y: by, w, h: 18 };
    }

    drawLandmarks() {
      const ctx = this.ctx, an = this.data.an;
      const placed = this.placed || [];
      // while riding, keep the area around the train clear for the slope/coordinate guides
      if (this.sim && this.riding) {
        const lead = this.sim.carPoses(1)[0];
        if (lead && !lead.hidden) { const px = this.sx(lead.x), py = this.sy(lead.y); placed.push({ x: px - 90, y: py - 60, w: 180, h: 110 }); }
      }
      const tryLabel = (text, x, y, color, prefs) => {
        if (!this.opts.labels) return;
        ctx.font = '700 11.5px Nunito, system-ui, sans-serif';
        const w = ctx.measureText(text).width + 10, h = 18;
        for (const [dx, dy] of prefs) {
          const r = { x: FC.clamp(x + dx - w / 2, 2, this.W - w - 2), y: FC.clamp(y + dy - h / 2, 2, this.H - h - 2), w, h };
          if (!placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y)) {
            placed.push(r);
            this.label(text, r.x + w / 2, r.y + 9, color, 'center');
            return;
          }
        }
      };
      const coord = (p) => '(' + FC.fmtZ(p.x, 1) + ', ' + FC.fmtZ(p.y, 1) + ')';
      const vis = (x, y) => { const px = this.sx(x), py = this.sy(y); return px > -10 && px < this.W + 10 && py > -10 && py < this.H + 10; };
      // markers first
      for (const z of an.zeros) if (vis(z.x, 0)) { const x = this.sx(z.x), y = this.sy(0); marker(ctx, 'circle', x, y, COLORS.zero); }
      for (const m of an.maxima) if (vis(m.x, m.y)) marker(ctx, 'up', this.sx(m.x), this.sy(m.y), COLORS.max);
      for (const m of an.minima) if (vis(m.x, m.y)) marker(ctx, 'down', this.sx(m.x), this.sy(m.y), COLORS.min);
      for (const m of an.inflections) if (vis(m.x, m.y)) marker(ctx, 'diamond', this.sx(m.x), this.sy(m.y), COLORS.infl);
      for (const c of an.corners) if (!c.isExtremum && vis(c.x, c.y)) marker(ctx, 'x', this.sx(c.x), this.sy(c.y), COLORS.corner);
      if (an.yIntercept && vis(0, an.yIntercept.y)) marker(ctx, 'square', this.sx(0), this.sy(an.yIntercept.y), COLORS.yint);
      // labels (priority order)
      for (const m of an.maxima) if (vis(m.x, m.y)) tryLabel('max ' + coord(m), this.sx(m.x), this.sy(m.y), COLORS.max, [[0, -22], [0, -40], [50, -22], [-50, -22], [0, 22]]);
      for (const m of an.minima) if (vis(m.x, m.y)) tryLabel('min ' + coord(m), this.sx(m.x), this.sy(m.y), COLORS.min, [[0, 22], [0, 40], [50, 22], [-50, 22], [0, -22]]);
      for (const z of an.zeros) if (vis(z.x, 0)) tryLabel('zero ' + coord({ x: z.x, y: 0 }), this.sx(z.x), this.sy(0), COLORS.zero, [[0, 20], [0, 38], [44, 20], [-44, 20], [0, -20]]);
      if (an.yIntercept && vis(0, an.yIntercept.y)) tryLabel('y-int ' + coord(an.yIntercept), this.sx(0), this.sy(an.yIntercept.y), COLORS.yint, [[-48, -16], [48, -16], [-48, 16], [48, 16], [0, -30]]);
      for (const m of an.inflections) if (vis(m.x, m.y)) tryLabel('inflection ' + coord(m), this.sx(m.x), this.sy(m.y), COLORS.infl, [[56, 0], [-56, 0], [0, -22], [0, 22]]);
    }

    /** Piecewise: numbered badge on each piece and open ○ / closed ● dots at every endpoint. */
    drawPieceMarks() {
      const ctx = this.ctx, an = this.data.an, info = an.pw;
      const dots = [];
      for (const p of info.pieces) {
        const lo = Math.max(p.lo, an.a), hi = Math.min(p.hi, an.b);
        if (!(hi > lo)) continue;
        if (isFinite(p.lo) && p.lo >= an.a - 1e-9) { const y = p.f(p.lo); if (isFinite(y)) dots.push({ x: p.lo, y, filled: p.loIncl, k: p.k }); }
        if (isFinite(p.hi) && p.hi <= an.b + 1e-9) { const y = p.f(p.hi); if (isFinite(y)) dots.push({ x: p.hi, y, filled: p.hiIncl, k: p.k }); }
        // badge above the middle of the piece
        const xm = (lo + hi) / 2, ym = p.f(xm);
        if (!isFinite(ym)) continue;
        const px = this.sx(xm), py = this.sy(ym) - 22;
        if (px < 10 || px > this.W - 10 || py < 10 || py > this.H - 10) continue;
        ctx.save();
        ctx.beginPath(); ctx.arc(px, py, 10, 0, Math.PI * 2);
        ctx.fillStyle = FC.pieceColor(p.k); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '800 12px Nunito, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(p.k + 1), px, py + 0.5);
        ctx.restore();
        this.placed.push({ x: px - 12, y: py - 12, w: 24, h: 24 });
      }
      // open dots first, so a closed dot at the same joint covers them
      dots.sort((p, q) => (p.filled === q.filled ? 0 : p.filled ? 1 : -1));
      for (const d of dots) {
        const px = this.sx(d.x), py = this.sy(d.y);
        if (px < -8 || px > this.W + 8 || py < -8 || py > this.H + 8) continue;
        ctx.beginPath(); ctx.arc(px, py, 5.5, 0, Math.PI * 2);
        ctx.fillStyle = d.filled ? FC.pieceColor(d.k) : '#fff'; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = d.filled ? '#fff' : FC.pieceColor(d.k); ctx.stroke();
        if (d.filled) { ctx.beginPath(); ctx.arc(px, py, 7.5, 0, Math.PI * 2); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(29,44,85,0.55)'; ctx.stroke(); }
      }
    }

    drawPrediction() {
      const ctx = this.ctx, an = this.data.an;
      const x = this.prediction;
      const seg = an.segments.find((s) => x >= s.x0 && x <= s.x1);
      if (!seg) return;
      const y = this.data.fn(x);
      const px = this.sx(x), py = this.sy(y);
      ctx.save();
      ctx.strokeStyle = '#8a55e6'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - 34); ctx.stroke();
      ctx.fillStyle = '#8a55e6';
      ctx.beginPath(); ctx.moveTo(px, py - 34); ctx.lineTo(px + 18, py - 28); ctx.lineTo(px, py - 22); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
      this.label('your guess', px, py - 46, '#5b2fb0', 'center', true);
      ctx.restore();
    }

    drawTrain() {
      const ctx = this.ctx, tr = this.data.track;
      const sim = this.sim;
      const poses = sim.carPoses();
      const kx = this.W / (this.view.x1 - this.view.x0), ky = this.H / (this.view.y1 - this.view.y0);
      const lead = poses[0];
      // helper lines at the lead car
      if (!lead.hidden && this.opts.tangent) this.drawCarGuides(lead, kx, ky);
      for (let i = poses.length - 1; i >= 0; i--) {
        const p = poses[i];
        if (p.hidden) continue;
        const px = this.sx(p.x), py = this.sy(p.y);
        const ang = Math.atan2(-(p.ty / tr.Sy) * ky, (p.tx / tr.Sx) * kx);
        ctx.save();
        ctx.translate(px, py); ctx.rotate(ang);
        ctx.translate(0, -8);
        // body
        ctx.fillStyle = CAR_COLORS[i % CAR_COLORS.length]; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.2;
        roundRect(ctx, -11, -5, 22, 10, 3); ctx.fill(); ctx.stroke();
        if (i === 0) { ctx.beginPath(); ctx.moveTo(11, -5); ctx.quadraticCurveTo(17, -2, 14, 5); ctx.lineTo(11, 5); ctx.closePath(); ctx.fill(); ctx.stroke(); }
        // riders
        const arms = sim.G < 0.5 || (p.ty < -0.5);
        for (const rx of [-5, 4]) {
          ctx.fillStyle = '#ffd9b3'; ctx.beginPath(); ctx.arc(rx, -8, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          if (arms) { ctx.beginPath(); ctx.moveTo(rx - 2, -9); ctx.lineTo(rx - 4, -15); ctx.moveTo(rx + 2, -9); ctx.lineTo(rx + 4, -15); ctx.stroke(); }
        }
        // wheels
        ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-6, 6, 2.4, 0, Math.PI * 2); ctx.arc(6, 6, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }

    drawCarGuides(p, kx, ky) {
      const ctx = this.ctx, tr = this.data.track;
      const px = this.sx(p.x), py = this.sy(p.y);
      const gy = FC.clamp(this.sy(0), 0, this.H), x0s = FC.clamp(this.sx(0), 0, this.W);
      ctx.save();
      // drop lines to the axes
      ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(35, 53, 95, 0.55)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, gy); ctx.moveTo(px, py); ctx.lineTo(x0s, py); ctx.stroke();
      ctx.setLineDash([]);
      // secant (average rate of change)
      if (this.opts.secant) {
        const s0 = this.data.an.start;
        const sx0 = this.sx(s0.x), sy0 = this.sy(s0.y);
        ctx.strokeStyle = '#e0a100'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]);
        ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(px, py); ctx.stroke(); ctx.setLineDash([]);
        if (Math.abs(p.x - s0.x) > 1e-9) {
          const avg = (p.y - s0.y) / (p.x - s0.x);
          this.label('avg rate = ' + FC.fmt(avg, 2), (sx0 + px) / 2, (sy0 + py) / 2 + 16, '#9a6d00', 'center', true);
        }
      }
      // tangent line (only on the track)
      if (!p.flying && !p.onGround && p.slope !== undefined) {
        const dxs = (p.tx / tr.Sx) * kx, dys = -(p.ty / tr.Sy) * ky;
        const L = Math.hypot(dxs, dys) || 1;
        const ux = dxs / L, uy = dys / L;
        ctx.strokeStyle = '#1d2c55'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(px - ux * 80, py - uy * 80); ctx.lineTo(px + ux * 80, py + uy * 80); ctx.stroke();
        const txt = 'slope = ' + FC.fmt(p.slope, 2);
        this.label(txt, px + ux * 80 + (ux >= 0 ? 6 : -6), py + uy * 80 - 12, '#1d2c55', ux >= 0 ? 'left' : 'right', true);
      }
      // coordinates on axes
      ctx.font = '800 11px Nunito, sans-serif';
      this.label(FC.fmt(p.x, 3), px, gy - 12 < 10 ? gy + 12 : Math.min(gy + 12, this.H - 10), '#1d2c55', 'center', true);
      this.label(FC.fmt(p.y, 3), x0s + 4, py, '#1d2c55', 'left', true);
      ctx.restore();
    }

    drawHover() {
      const ctx = this.ctx, an = this.data.an;
      const x = this.mx(this.hover.px);
      const seg = an.segments.find((s) => x >= s.x0 && x <= s.x1);
      ctx.save();
      ctx.strokeStyle = 'rgba(29, 44, 85, 0.35)'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(this.hover.px, 0); ctx.lineTo(this.hover.px, this.H); ctx.stroke(); ctx.setLineDash([]);
      if (seg) {
        const y = this.data.fn(x);
        if (isFinite(y)) {
          const py = this.sy(y);
          ctx.fillStyle = '#1d2c55'; ctx.beginPath(); ctx.arc(this.hover.px, py, 4.5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        }
      }
      ctx.restore();
    }

    drawPulse() {
      const p = this.pulse;
      const t = (performance.now() - p.t0) / 1000;
      if (t > 1.6) { this.pulse = null; return; }
      const ctx = this.ctx;
      const x = this.sx(p.x), y = this.sy(p.y);
      for (let k = 0; k < 2; k++) {
        const tt = (t + k * 0.4) % 0.8 / 0.8;
        ctx.beginPath(); ctx.arc(x, y, 6 + tt * 26, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 77, 109,' + (1 - tt) + ')'; ctx.lineWidth = 3; ctx.stroke();
      }
      this.dirty = true;
    }

    drawFooter() {
      const ctx = this.ctx;
      const tr = this.data.track;
      const txt = [];
      if (tr) txt.push('1 unit = ' + FC.fmt(tr.Sx, 3) + ' m' + (tr.Sy !== tr.Sx ? ' across, ' + FC.fmt(tr.Sy, 3) + ' m up' : ''));
      const ux = (this.view.x1 - this.view.x0) / this.W, uy = (this.view.y1 - this.view.y0) / this.H;
      if (Math.abs(ux / uy - 1) > 0.03) txt.push('axes not to scale — try “1:1”');
      if (this.colorMode() === 'pieces') txt.push('colors = pieces · ● included, ○ not included');
      if (this.opts.colorMode === 'slope') txt.push('green = increasing, red = decreasing');
      if (this.opts.colorMode === 'concavity') txt.push('blue = concave up ∪, orange = concave down ∩');
      if (this.opts.colorMode === 'speed') txt.push(this.speedProfile ? 'blue = slow → red = fast' : 'ride once to see speeds');
      ctx.font = '700 11px Nunito, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
      const s = txt.join('  ·  ');
      const w = ctx.measureText(s).width + 12;
      ctx.fillStyle = 'rgba(255,255,255,0.75)'; roundRect(ctx, this.W - w - 6, this.H - 22, w, 17, 6); ctx.fill();
      ctx.fillStyle = '#2a3a66'; ctx.fillText(s, this.W - 12, this.H - 8);
    }

    /** Record the speed profile of a ride to color the track. */
    setSpeedProfile(samples, a, b) {
      const bins = new Array(300).fill(null);
      let vmax = 0;
      for (const [x, v] of samples) {
        const i = Math.floor(((x - a) / (b - a)) * bins.length);
        if (i < 0 || i >= bins.length) continue;
        bins[i] = bins[i] === null ? v : Math.max(bins[i], v);
        vmax = Math.max(vmax, v);
      }
      // fill small holes
      for (let i = 1; i < bins.length - 1; i++) if (bins[i] === null && bins[i - 1] !== null && bins[i + 1] !== null) bins[i] = (bins[i - 1] + bins[i + 1]) / 2;
      this.speedProfile = { bins, vmax, a, b };
    }
  }

  function heat(t) {
    t = FC.clamp(t, 0, 1);
    const stops = [[0, [47, 127, 224]], [0.35, [21, 168, 107]], [0.65, [240, 180, 36]], [1, [230, 57, 86]]];
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
        const f = (t - t0) / (t1 - t0);
        return 'rgb(' + c0.map((c, k) => Math.round(c + (c1[k] - c) * f)).join(',') + ')';
      }
    }
    return 'rgb(230,57,86)';
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function marker(ctx, kind, x, y, color) {
    ctx.save();
    ctx.fillStyle = color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath();
    if (kind === 'circle') ctx.arc(x, y, 6, 0, Math.PI * 2);
    else if (kind === 'up') { ctx.moveTo(x, y - 9); ctx.lineTo(x + 7, y + 3); ctx.lineTo(x - 7, y + 3); ctx.closePath(); }
    else if (kind === 'down') { ctx.moveTo(x, y + 9); ctx.lineTo(x + 7, y - 3); ctx.lineTo(x - 7, y - 3); ctx.closePath(); }
    else if (kind === 'diamond') { ctx.moveTo(x, y - 7); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 6, y); ctx.closePath(); }
    else if (kind === 'square') ctx.rect(x - 5.5, y - 5.5, 11, 11);
    else if (kind === 'x') { ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); ctx.stroke(); ctx.restore(); return; }
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  Graph.heat = heat;
  Graph.COLORS = COLORS;
  Graph.CAR_COLORS = CAR_COLORS;
  return Graph;
})();
