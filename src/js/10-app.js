/* =====================================================================
   App core — state, building tracks, riding, HUD, narration
   ===================================================================== */
var App = (function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const fmt = FC.fmt;

  const settings = FCStore.settings.get();
  const state = {
    params: {}, paramNames: [], parsed: null, fn: null, coeffs: null, an: null, track: null, a: 0, b: 1,
    fText: '', aText: '', bText: '', name: '', entryId: null, lastFnKey: '',
    sim: null, riding: false, paused: false, rideDone: false, stats: null, ratings: null,
    warp: 1, prediction: null, awaitingPrediction: false, match: null,
    meta: { usedMutation: false, usedSlider: false, predictionGreat: false, matchesDone: 0, pendingMutation: false },
    rideLog: [], speedSamples: [], forecast: null, world: null, graph: null, worldFailed: false,
    narrQueue: [], narrLast: 0, chip: null, chipUntil: 0,
    mode: 'single', pieces: [], pwCheck: null, savedSingle: null, savedPieces: null,
  };

  const el = {};
  function grabElements() {
    ['fnInput', 'fnPreview', 'domA', 'domB', 'btnBuild', 'btnSurprise', 'btnSound', 'btnSettings', 'btnHelp', 'btnKeypad', 'btnSnap', 'paramBar', 'matchBar',
      'view3d', 'c3dHost', 'vignette', 'hud', 'hudSpeed', 'hudSpeedUnit', 'hudSpeedSub', 'hudSpeedBar', 'hudX', 'hudY', 'hudSlope', 'gmNeedle', 'hudG', 'enPE', 'enKE', 'enHeat',
      'camSeg', 'btnFull', 'statusChip', 'narration', 'results', 'fallback3d', 'loading3d', 'btnRide', 'btnReset', 'startMode', 'launchCtl', 'launchSpeed', 'launchOut', 'btnMinLaunch',
      'warpSeg', 'chkPredict', 'viewSeg', 'view2d', 'c2d', 'graphTools', 'graphReadout', 'predictPrompt', 'missionBadge', 'modal', 'keypad', 'toasts', 'confetti',
      'modeSeg', 'pwSummary', 'tabBtnPieces', 'hudPieceRow', 'hudPiece',
    ].forEach((id) => { el[id] = document.getElementById(id); });
    el.domField = $('.dom-field');
    el.stage = $('.stage');
    el.fnField = $('.fn-field');
  }

  function saveSettings() { FCStore.settings.set(settings); }

  // ---------------------------------------------------------------- units
  function speedParts(v) {
    const u = settings.units;
    const a = Math.abs(v);
    if (u === 'kmh') return { big: (a * 3.6).toFixed(0), unit: 'km/h', sub: a.toFixed(1) + ' m/s' };
    if (u === 'mps') return { big: a.toFixed(1), unit: 'm/s', sub: (a * 2.23694).toFixed(0) + ' mph' };
    return { big: (a * 2.23694).toFixed(0), unit: 'mph', sub: a.toFixed(1) + ' m/s' };
  }
  function speedText(v) { const p = speedParts(v); return p.big + ' ' + p.unit + ' (' + p.sub + ')'; }

  // ---------------------------------------------------------------- live preview & params
  let previewTimer = null;
  function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 120); }
  function renderPreview() {
    const src = el.fnInput.value;
    const r = FCMath.parse(src);
    if (!r.ok) {
      el.fnPreview.className = 'fn-preview err';
      el.fnPreview.textContent = '⚠️ ' + r.error;
      el.fnField.classList.add('err');
      return r;
    }
    el.fnField.classList.remove('err');
    el.fnPreview.className = 'fn-preview';
    const P = Object.assign({}, state.params);
    r.params.forEach((n) => { if (P[n] === undefined) P[n] = 1; });
    const coeffs = FCMath.toPoly(r.ast, P);
    const fam = FCMath.classify(r.ast, P, coeffs);
    let html = '<span class="lbl">reads as</span><span class="expr">f(<i>x</i>) = ' + FCMath.toHTML(r.ast) + '</span><span class="fam">' + FC.escapeHTML(fam.label) + '</span>';
    el.fnPreview.innerHTML = html;
    return r;
  }

  function syncParams(names) {
    // add new params with defaults, drop missing ones
    const P = {};
    for (const n of names) P[n] = state.params[n] !== undefined ? state.params[n] : 1;
    state.params = P;
    state.paramNames = names.slice();
    renderParamBar();
  }
  function renderParamBar() {
    const bar = el.paramBar;
    if (!state.paramNames.length) { bar.innerHTML = ''; return; }
    bar.innerHTML = state.paramNames.map((n) => {
      const v = state.params[n];
      const lo = Math.min(-10, v), hi = Math.max(10, v);
      return '<div class="param" data-p="' + n + '"><span class="pname">' + n + '</span>' +
        '<input type="range" min="' + lo + '" max="' + hi + '" step="0.05" value="' + v + '" aria-label="parameter ' + n + '">' +
        '<input class="pval" type="text" value="' + FC.numText(v, 4) + '" aria-label="value of ' + n + '">' +
        '<button class="pplay" title="Animate ' + n + '" aria-label="Animate ' + n + '">▶</button></div>';
    }).join('');
    $$('.param', bar).forEach((row) => {
      const n = row.dataset.p;
      const range = $('input[type=range]', row), val = $('.pval', row), play = $('.pplay', row);
      range.addEventListener('input', () => { setParam(n, +range.value); val.value = FC.numText(+range.value, 4); });
      range.addEventListener('change', () => finalizeParamChange());
      val.addEventListener('change', () => {
        const r = FCMath.evalConstExpr(val.value, state.params);
        if (r.ok) { setParam(n, r.value); range.value = r.value; finalizeParamChange(); } else toast('⚠️ ' + r.error, 'err');
      });
      play.addEventListener('click', () => toggleAnimate(n, play, range, val));
    });
  }
  let paramTimer = null, lastWorldBuild = 0, animating = null;
  function setParam(n, v) {
    state.params[n] = v;
    state.meta.usedSlider = true;
    // quick rebuild (2D immediately, 3D throttled)
    const now = performance.now();
    const do3d = now - lastWorldBuild > 220;
    if (build({ quick: true, skip3d: !do3d })) { if (do3d) lastWorldBuild = now; }
    clearTimeout(paramTimer);
    paramTimer = setTimeout(() => finalizeParamChange(), 450);
  }
  function finalizeParamChange() {
    clearTimeout(paramTimer);
    build({ quick: false });
  }
  function toggleAnimate(n, btn, range, val) {
    if (animating && animating.n === n) { cancelAnimationFrame(animating.raf); animating = null; btn.classList.remove('on'); btn.textContent = '▶'; finalizeParamChange(); return; }
    if (animating) { cancelAnimationFrame(animating.raf); $$('.pplay').forEach((b) => { b.classList.remove('on'); b.textContent = '▶'; }); }
    const lo = +range.min, hi = +range.max;
    const v0 = state.params[n];
    animating = { n, t0: performance.now(), raf: 0 };
    btn.classList.add('on'); btn.textContent = '⏸';
    const center = v0, amp = Math.max(1, Math.min(hi - v0, v0 - lo, 4));
    const step = () => {
      const t = (performance.now() - animating.t0) / 1000;
      const v = +(center + amp * Math.sin(t * 0.9)).toFixed(3);
      state.params[n] = v; range.value = v; val.value = FC.numText(v, 4);
      state.meta.usedSlider = true;
      const now = performance.now();
      const do3d = now - lastWorldBuild > 200;
      build({ quick: true, skip3d: !do3d });
      if (do3d) lastWorldBuild = now;
      if (animating) animating.raf = requestAnimationFrame(step);
    };
    animating.raf = requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- build
  function currentScale(an) {
    const S = settings.scale === 'auto' ? FCPhysics.autoScale(an) : +settings.scale;
    const Sy = settings.vScale === 'same' ? S : +settings.vScale;
    return { S, Sy };
  }

  /**
   * Build the track from the inputs.
   * opts.quick: slider drag (no history/missions); opts.skip3d: don't rebuild 3D now.
   */
  function build(opts = {}) {
    const r = renderPreview();
    if (!r.ok) { if (!opts.quick) toast('⚠️ ' + r.error, 'err'); return false; }
    if (!opts.quick) syncParams(r.params); else r.params.forEach((n) => { if (state.params[n] === undefined) state.params[n] = 1; });
    const P = state.params;
    el.domA.classList.remove('err'); el.domB.classList.remove('err');
    // piecewise: the pieces must make a function, and they set the domain
    const isPW = r.ast.type === 'piecewise';
    let pwc = null, pwLo = NaN, pwHi = NaN;
    if (isPW) {
      pwc = FCAnalysis.pwCheck(r.ast, P);
      state.pwCheck = pwc;
      if (App.panels) App.panels.syncPieces(r.ast, pwc, !!opts.fromEditor || !!opts.quick);
      if (pwc.errors.length) {
        if (!opts.quick) { toast('✋ ' + pwc.errors[0].msg, 'err', 7000); setModeUI('pieces'); if (App.panels) App.panels.showTab('pieces'); }
        return false;
      }
      pwLo = Math.min(...pwc.info.pieces.map((q) => q.lo)); pwHi = Math.max(...pwc.info.pieces.map((q) => q.hi));
    }
    const needBox = (v) => !isPW || !isFinite(v);
    const A = needBox(pwLo) ? FCMath.evalConstExpr(el.domA.value, P) : { ok: true, value: pwLo };
    const B = needBox(pwHi) ? FCMath.evalConstExpr(el.domB.value, P) : { ok: true, value: pwHi };
    if (!A.ok) { el.domA.classList.add('err'); if (!opts.quick) toast('⚠️ Start of track: ' + A.error, 'err'); return false; }
    if (!B.ok) { el.domB.classList.add('err'); if (!opts.quick) toast('⚠️ End of track: ' + B.error, 'err'); return false; }
    if (isPW) { if (isFinite(pwLo)) el.domA.value = FC.numText(pwLo, 8); if (isFinite(pwHi)) el.domB.value = FC.numText(pwHi, 8); }
    let a = A.value, b = B.value;
    if (a === b) { el.domB.classList.add('err'); toast('⚠️ The start and end are the same — the track needs some length!', 'err'); return false; }
    if (a > b) { const t = el.domA.value; el.domA.value = el.domB.value; el.domB.value = t; [a, b] = [b, a]; if (!opts.quick) toast('↔️ I swapped the ends so the track runs left to right.'); }
    if (b - a > 1e6 || Math.abs(a) > 1e7 || Math.abs(b) > 1e7) { toast('⚠️ That domain is enormous — try something between −1000 and 1000.', 'err'); return false; }
    const fn = FCMath.compile(r.ast, P);
    const coeffs = FCMath.toPoly(r.ast, P);
    const an = FCAnalysis.analyze({ fn, a, b, coeffs, ast: r.ast, P, pw: pwc, samples: opts.quick ? 1400 : 2400 });
    if (!an.ok) {
      if (!opts.quick) { toast('⚠️ ' + an.error, 'err'); el.fnPreview.className = 'fn-preview err'; el.fnPreview.textContent = '⚠️ ' + an.error; }
      return false;
    }
    const { S, Sy } = currentScale(an);
    const track = FCPhysics.buildTrack(an, fn, { Sx: S, Sy });
    stopRide(true);
    Object.assign(state, { parsed: r, fn, coeffs, an, track, a, b, fText: el.fnInput.value.trim(), aText: el.domA.value.trim(), bText: el.domB.value.trim() });
    if (!isPW) state.pwCheck = null;
    setModeUI(isPW ? 'pieces' : 'single');
    state.prediction = null;
    state.graph.prediction = null;
    state.graph.extraPts = null;
    state.graph.setData({ an, track, fn });
    state.graph.dirty = true;
    if (state.world && !opts.skip3d) {
      state.world.build(track, an, { railColor: settings.railColor });
      state.pendingWorld = false;
      if (state.match) refreshGhost();
      if (!opts.quick && state.world.camMode !== 'orbit') setCamera('orbit');
    }
    else if (state.world) state.pendingWorld = true;
    updateHUDIdle();
    if (state.match) updateMatchScore(!opts.quick);
    if (opts.quick) { App.panels && App.panels.renderBlueprint(true); return true; }

    // name: new function → new name (unless a saved entry has one)
    const fnKey = FCMath.toText(r.ast);
    if (fnKey !== state.lastFnKey || !state.name) state.name = opts.name || FCContent.nameFor(fnKey, an.family);
    if (opts.name) state.name = opts.name;
    state.lastFnKey = fnKey;
    const entry = FCStore.history.upsert({ f: state.fText, a: state.aText, b: state.bText, params: Object.assign({}, P), name: state.name, thumb: an.thumb, family: an.family && an.family.label });
    state.name = entry.name || state.name;
    state.entryId = entry.id;
    if (state.meta.pendingMutation) { state.meta.usedMutation = true; state.meta.pendingMutation = false; }
    try { history.replaceState(null, '', '#' + FCStore.encodeTrack({ f: state.fText, a: state.aText, b: state.bText, params: P })); } catch (e) { /* file:// may refuse */ }
    if (App.panels) {
      App.panels.renderBlueprint();
      App.panels.markRemixDirty();
      App.panels.renderGarage();
    }
    if (!opts.noMissions) checkMissions('build');
    forecastSoon();
    el.btnRide.classList.add('pulse');
    return true;
  }

  // ---------------------------------------------------------------- one function ⇄ pieces
  function setModeUI(mode) {
    state.mode = mode;
    const pw = mode === 'pieces';
    el.fnField.classList.toggle('pw-mode', pw);
    el.pwSummary.hidden = !pw;
    $$('button', el.modeSeg).forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    const unbounded = pw && state.pwCheck && state.pwCheck.domain.unbounded;
    el.domField.hidden = pw && !unbounded;
    el.tabBtnPieces.hidden = !pw;
    $('.tabs').classList.toggle('five', pw);
    el.hudPieceRow.hidden = !pw;
    if (!pw && $('#tab-pieces').classList.contains('on') && App.panels) App.panels.showTab('blueprint');
    if (pw) {
      const n = state.pwCheck ? state.pwCheck.info.pieces.length : (state.pieces || []).length;
      const d = state.pwCheck && state.pwCheck.domain;
      el.pwSummary.innerHTML = '🧩 ' + n + ' piece' + (n === 1 ? '' : 's') + (d && d.lo !== null && d.hi !== null ? ' · ' + fmt(d.lo, 3) + ' ≤ <i>x</i> ≤ ' + fmt(d.hi, 3) : '') + '<span class="edit">✏️ edit pieces</span>';
    }
  }
  /** The ƒ / 🧩 switch in the header. */
  function switchMode(mode) {
    if (mode === state.mode) { if (mode === 'pieces' && App.panels) App.panels.showTab('pieces', true); return; }
    if (state.match && mode === 'pieces') {
      loadTrack({ f: '{' + 'x if ' + state.aText + ' <= x <= ' + state.bText + '}', a: state.aText, b: state.bText }, { keepMatch: true });
      if (App.panels) App.panels.showTab('pieces', true);
      return;
    }
    if (mode === 'pieces') {
      state.savedSingle = { f: state.fText, a: state.aText, b: state.bText, params: Object.assign({}, state.params), name: state.name };
      const src = state.savedPieces || { f: FCContent.PW_STARTER.f, name: FCContent.PW_STARTER.name, params: {} };
      loadTrack({ f: src.f, a: '', b: '', params: src.params || {}, name: src.name });
      if (App.panels) App.panels.showTab('pieces', true);
      toast('🧩 <b>Piecewise mode</b>: build your coaster from pieces in the 🧩 Pieces tab. Each joint is checked: does it connect? is it smooth?', '', 6500);
    } else {
      state.savedPieces = { f: state.fText, params: Object.assign({}, state.params), name: state.name };
      loadTrack(state.savedSingle || FCContent.PRESETS[0]);
    }
  }
  function pieceNear(x) {
    const info = state.an && state.an.pw;
    if (!info) return null;
    return info.pieceAt(x) || info.pieceAt(x - 1e-9 * (1 + Math.abs(x))) || info.pieceAt(x + 1e-9 * (1 + Math.abs(x)));
  }
  function pieceTag(k) { return '<span class="pw-num" style="--pc:' + FC.pieceColor(k) + ';display:inline-grid;width:18px;height:18px;font-size:11px;vertical-align:middle">' + (k + 1) + '</span>'; }

  // physics forecast (headless) for coach tips and the blueprint
  let forecastTimer = null;
  function forecastSoon() {
    clearTimeout(forecastTimer);
    state.forecast = null;
    forecastTimer = setTimeout(() => {
      if (!state.track) return;
      const opts = rideOptions();
      const stats = FCPhysics.simulate(state.track, opts, 180, 1 / 120);
      state.forecast = { stats, ratings: FCPhysics.ratings(stats), mode: opts.mode };
      if (App.panels) { App.panels.renderBlueprint(true); App.panels.markRemixDirty(); }
    }, 60);
  }

  function rideOptions() {
    return { mode: el.startMode.value, v0: +el.launchSpeed.value, vLift: settings.vLift, friction: settings.friction };
  }

  // ---------------------------------------------------------------- ride control
  function startRide() {
    if (!state.track) return;
    FCAudio.init();
    if (el.chkPredict.checked && state.prediction === null) { beginPrediction(); return; }
    stopRide(true);
    state.sim = new FCPhysics.Sim(state.track, rideOptions());
    state.riding = true; state.paused = false; state.rideDone = false;
    state.rideLog = []; state.speedSamples = []; state.narrQueue = [];
    el.narration.innerHTML = '';
    state.graph.sim = state.sim; state.graph.riding = true;
    el.results.hidden = true;
    el.btnRide.classList.remove('pulse');
    setRideButton();
    if (state.world && state.world.camMode === 'orbit' && !state.userPickedOrbit) setCamera('pov');
    if (el.startMode.value === 'launch') FCAudio.whoosh(1.1);
  }
  function togglePause() {
    if (!state.riding) return;
    state.paused = !state.paused;
    setRideButton();
  }
  function stopRide(silent) {
    state.riding = false; state.paused = false; state.rideDone = false;
    state.sim = null;
    if (state.graph) { state.graph.sim = null; state.graph.riding = false; state.graph.dirty = true; }
    if (state.world) state.world.placeTrainAtStart();
    el.results.hidden = true;
    el.statusChip.hidden = true;
    el.vignette.style.opacity = 0;
    if (!silent) el.narration.innerHTML = '';
    setRideButton();
    updateHUDIdle();
  }
  function setRideButton() {
    const b = el.btnRide;
    if (state.riding && !state.paused) b.textContent = '⏸ Pause';
    else if (state.riding && state.paused) b.textContent = '▶ Resume';
    else if (state.rideDone) b.textContent = '▶ Ride again';
    else b.textContent = '▶ Ride!';
  }
  function onRideButton() {
    if (state.riding) togglePause();
    else startRide();
  }

  // ---------------------------------------------------------------- prediction
  function beginPrediction() {
    state.awaitingPrediction = true;
    el.predictPrompt.hidden = false;
    state.graph.pickMode = true;
    if (el.stage.classList.contains('only3d')) setLayout('both');
    say('🔮 Before you ride: click the track in the graph where you think the coaster will go <b>fastest</b>.');
  }
  function onGraphPick(x) {
    if (!state.an) return;
    if (state.awaitingPrediction) {
      const an = state.an;
      const segs = an.segments;
      let xx = FC.clamp(x, an.start.x, an.end.x);
      if (!segs.some((s) => xx >= s.x0 && xx <= s.x1)) {
        let best = null, bd = Infinity;
        for (const s of segs) for (const e of [s.x0, s.x1]) if (Math.abs(e - xx) < bd) { bd = Math.abs(e - xx); best = e; }
        xx = best;
      }
      state.prediction = xx;
      state.graph.prediction = xx;
      state.graph.pickMode = false;
      state.awaitingPrediction = false;
      el.predictPrompt.hidden = true;
      state.graph.dirty = true;
      startRide();
      return;
    }
    // otherwise: highlight the point
    const y = state.fn(x);
    if (isFinite(y)) { state.graph.pulse = { x, y, t0: performance.now() }; state.graph.dirty = true; }
  }

  // ---------------------------------------------------------------- per-frame
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    const sim = state.sim;
    if (sim && state.riding && !state.paused) {
      let t = dt * state.warp;
      const h = 1 / 240;
      let guard = 0;
      while (t > 1e-9 && !sim.done && guard++ < 2000) { const d = Math.min(h, t); sim.step(d); t -= d; }
      handleEvents(sim.drainEvents());
      if (sim.pose && sim.piece().kind === 'track') state.speedSamples.push([sim.pose.x, Math.abs(sim.v)]);
      if (sim.done && !state.rideDone) finishRide();
      updateHUD();
      state.graph.dirty = true;
    }
    if (state.pendingWorld && state.world && !animating && performance.now() - lastWorldBuild > 300 && !state.riding) {
      state.world.build(state.track, state.an, { railColor: settings.railColor });
      if (state.match) refreshGhost();
      state.pendingWorld = false; lastWorldBuild = performance.now();
    }
    FCAudio.update(dt, {
      riding: !!(sim && state.riding && !state.paused && !sim.done),
      speed: sim ? sim.v : 0,
      lifting: sim ? sim.lifting : false,
      onTrack: sim ? sim.piece().kind === 'track' : false,
      heightFrac: sim && state.an ? (sim.pose.y - state.an.yMin) / Math.max(1e-9, state.an.yMax - state.an.yMin) : 0,
    });
    updateVignette(dt);
    updateNarration(now);
    if (state.graph.dirty || state.graph.pulse) state.graph.draw();
    if (state.world && !el.stage.classList.contains('only2d')) {
      state.world.update(dt, state.sim);
      state.world.render();
    }
    // In immersive VR, WebXR owns the frame loop via renderer.setAnimationLoop.
    if (!state.world || !state.world.renderer.xr.isPresenting) requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- HUD
  function setHUD(speed, x, y, slope, G, energy) {
    const sp = speedParts(speed);
    el.hudSpeed.textContent = sp.big;
    el.hudSpeedUnit.textContent = sp.unit;
    el.hudSpeedSub.textContent = sp.sub;
    el.hudSpeedBar.style.width = FC.clamp(Math.abs(speed) / 50, 0, 1) * 100 + '%';
    el.hudX.textContent = x === null ? '—' : fmt(x, 3);
    el.hudY.textContent = y === null ? '—' : FC.fmtZ(y, state.an ? Math.max(1, state.an.yMax - state.an.yMin) : 1, 3);
    if (slope === null || slope === undefined) el.hudSlope.textContent = '—';
    else {
      const ang = Math.atan(slope * (state.track ? state.track.Sy / state.track.Sx : 1)) * 180 / Math.PI;
      el.hudSlope.textContent = fmt(slope, 2) + (Math.abs(slope) < 1e-3 ? ' →' : slope > 0 ? ' ↗' : ' ↘') + ' ' + Math.abs(ang).toFixed(0) + '°';
    }
    if (state.mode === 'pieces' && x !== null) {
      const pc = pieceNear(x);
      el.hudPiece.innerHTML = pc ? pieceTag(pc.k) : '—';
    }
    const g = FC.clamp(G, -3, 8);
    el.gmNeedle.style.left = ((g + 3) / 11) * 100 + '%';
    el.hudG.textContent = (G > 9.95 ? '10+' : G < -2.95 ? '−3−' : fmt(G, 1).replace(/^(-?\d+)$/, '$1.0')) + ' G';
    if (energy) {
      const tot = Math.max(1e-6, energy.pe + energy.ke + energy.heat);
      el.enPE.style.width = (energy.pe / tot) * 100 + '%';
      el.enKE.style.width = (energy.ke / tot) * 100 + '%';
      el.enHeat.style.width = (energy.heat / tot) * 100 + '%';
    }
  }
  function updateHUDIdle() {
    if (!state.track || !state.an) return;
    const p = state.track.poseAt(state.track.segs[0], 0);
    setHUD(0, p.x, p.y, p.slope, 1, { pe: 1, ke: 0, heat: 0 });
  }
  function updateHUD() {
    const sim = state.sim;
    if (!sim) return;
    const p = sim.pose;
    const onTrack = sim.piece().kind === 'track';
    setHUD(sim.v, p.x, p.y, onTrack ? p.slope : null, sim.Gdisp, sim.energy);
    // status chip
    let chip = null;
    const pk = sim.piece().kind;
    if (pk === 'flight') chip = ['🚀 AIRBORNE', 'fly'];
    else if (pk === 'station') chip = ['🏁 BRAKES', 'lift'];
    else if (pk === 'ground') chip = ['💥 SKIDDING', 'heavy'];
    else if (sim.G < 0) chip = ['🪂 AIRTIME!', 'air'];
    else if (sim.Gdisp > 3.5) chip = ['💪 HEAVY G!', 'heavy'];
    else if (sim.lifting) chip = ['⛓️ LIFT HILL', 'lift'];
    else if (sim.v < -0.05) chip = ['⏪ ROLLING BACK', 'heavy'];
    if (chip) { el.statusChip.hidden = false; el.statusChip.textContent = chip[0]; el.statusChip.className = 'status-chip ' + chip[1]; }
    else el.statusChip.hidden = true;
  }
  let vigG = 1;
  function updateVignette(dt) {
    const pov = state.world && state.world.camMode === 'pov';
    const G = state.sim && state.riding ? state.sim.Gdisp : 1;
    vigG += (G - vigG) * Math.min(1, dt * 5);
    let css = '', op = 0;
    if (pov && vigG > 4) { op = Math.min(0.9, (vigG - 4) / 5); css = 'radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.95) 100%)'; }
    else if (pov && vigG < -1) { op = Math.min(0.75, (-1 - vigG) / 3); css = 'radial-gradient(ellipse at center, rgba(255,0,40,0.15) 20%, rgba(200,0,30,0.9) 100%)'; }
    if (css) el.vignette.style.background = css;
    el.vignette.style.opacity = op;
  }

  // ---------------------------------------------------------------- narration
  function say(html, prio = 1) {
    state.narrQueue.push({ html, prio });
    if (state.narrQueue.length > 4) state.narrQueue.sort((p, q) => q.prio - p.prio).splice(4);
  }
  function log(html) {
    const t = state.sim ? state.sim.t : 0;
    state.rideLog.push({ t, html });
  }
  function updateNarration(now) {
    if (state.narrQueue.length && now - state.narrLast > 1100) {
      const item = state.narrQueue.shift();
      state.narrLast = now;
      const div = document.createElement('div');
      div.className = 'narr-line';
      div.innerHTML = item.html;
      el.narration.appendChild(div);
      while (el.narration.children.length > 2) el.narration.removeChild(el.narration.firstChild);
      setTimeout(() => div.classList.add('fade'), 4200);
      setTimeout(() => div.remove(), 5000);
    }
  }
  const P2 = (x, y) => '(' + fmt(x, 3) + ', ' + FC.fmtZ(y, state.an ? Math.max(1, state.an.yMax - state.an.yMin) : 1, 3) + ')';
  function handleEvents(evts) {
    const an = state.an;
    for (const e of evts) {
      let msg = null, prio = 1;
      switch (e.type) {
        case 'start': {
          const z = Math.abs(e.y) < 2e-3 * Math.max(1, an.yMax - an.yMin);
          msg = '🎢 Starting at <i>x</i> = ' + fmt(e.x, 3) + ', height <i>f</i>(<i>x</i>) = ' + FC.fmtZ(e.y, 1, 3) + (z ? ' — ground level (a zero!)' : '') + '.';
          if (e.mode === 'launch') msg += ' 🚀 Launch at ' + speedText(e.v) + '!';
          const pc0 = pieceNear(e.x);
          if (pc0) msg += ' First up: piece ' + pieceTag(pc0.k) + ' <i>f</i>(<i>x</i>) = ' + FCMath.toHTML(pc0.ast) + '.';
          break;
        }
        case 'lift-on': {
          if (state._liftSaid) break;
          const sl = state.an.d1(e.x);
          if (isFinite(sl) && Math.abs(sl) < 0.02) msg = '⛓️ Flat track (slope 0) — booster wheels keep the train rolling.';
          else msg = '⛓️ Chain lift: the track is <b>increasing</b> here (slope &gt; 0), so the chain pulls us up.';
          state._liftSaid = true;
          break;
        }
        case 'landmark': {
          if (!e.first) break;
          FCAudio.landmark(e.lm.type);
          const lm = e.lm;
          if (lm.type === 'zero') msg = lm.data && lm.data.kind === 'touch' ? '🟢 Touching the ground at <i>x</i> = ' + fmt(lm.x, 3) + ' — a double zero: the track bounces back up.' : '🟢 Ground level! <i>x</i> = ' + fmt(lm.x, 3) + ' is a zero: <i>f</i>(' + fmt(lm.x, 3) + ') = 0.';
          else if (lm.type === 'max') msg = '⛰️ Hilltop! Local maximum at ' + P2(lm.x, lm.y) + (lm.data && lm.data.corner ? ' — a sharp peak.' : ' — the slope is 0 here.') + (e.G < 0.4 ? ' You feel light: ' + fmt(e.G, 1) + ' G.' : '');
          else if (lm.type === 'min') msg = '🕳️ Valley floor: local minimum at ' + P2(lm.x, lm.y) + '. Concave up → ' + fmt(e.G, 1) + ' G pressing you into the seat.';
          else if (lm.type === 'inflection') msg = '〰️ Inflection point at <i>x</i> = ' + fmt(lm.x, 3) + ': the track switches which way it bends.';
          else if (lm.type === 'yint') msg = '🔷 Crossing the y-axis: <i>f</i>(0) = ' + FC.fmtZ(lm.y, 1, 3) + ' is the y-intercept.';
          else if (lm.type === 'steepest') msg = (lm.data.slope < 0 ? '⬇️ Steepest drop' : '⬆️ Steepest climb') + ': slope ' + fmt(lm.data.slope, 2) + ' (' + lm.data.angle.toFixed(0) + '°)!';
          else if (lm.type === 'joint') {
            const j = lm.data, pa = state.parsed.ast.pieces[j.right];
            msg = '🧩 Piece ' + pieceTag(j.right) + ' begins: <i>f</i>(<i>x</i>) = ' + FCMath.toHTML(pa.ast) + ' for ' + FCMath.pwCondHTML(pa) + (j.kind === 'smooth' ? ' — a smooth joint ✓' : ' — the slope jumps from ' + fmt(j.sL, 2) + ' to ' + fmt(j.sR, 2) + '!');
            prio = 2;
          }
          prio = lm.type === 'inflection' ? 0 : 1;
          break;
        }
        case 'airtime': if (!state._airSaid) { msg = '🪂 AIRTIME! Concave-down hill + speed = floating out of your seat (' + fmt(e.G, 1) + ' G).'; state._airSaid = true; prio = 2; } break;
        case 'heavy': if (!state._heavySaid) { msg = '💪 Heavy! The valley bends up (concave up) — you feel ' + fmt(e.G, 1) + ' G.'; state._heavySaid = true; } break;
        case 'rollback': {
          const need = state.sim.stats.maxHeight / state.track.Sy;
          msg = '😬 Out of energy — rolling back! The coaster can\'t climb higher than its energy allows (about height ' + fmt(need, 2) + ').';
          prio = 2;
          break;
        }
        case 'takeoff': {
          FCAudio.whoosh(0.8);
          const p = e.parab;
          const eq = p ? 'y = ' + fmt(p.A, 3) + '(x − ' + fmt(p.h, 3) + ')² + ' + fmt(p.k, 3) : '';
          let why = e.offEnd ? '🚀 The track ends in mid-air! Flying along the parabola ' : '🕳️ Gap in the track — jumping it! Flight path: ';
          const jt = !e.offEnd && state.an.joints ? state.an.joints.find((q) => (q.kind === 'jump' && Math.abs(q.x - e.x) < 1e-6 * (1 + Math.abs(q.x))) || (q.kind === 'gap' && Math.abs(q.x0 - e.x) < 1e-6 * (1 + Math.abs(q.x0)))) : null;
          if (jt && jt.kind === 'jump') why = '🦘 Jump discontinuity! Piece ' + pieceTag(jt.left) + ' ends at height ' + fmt(jt.L, 3) + ' but piece ' + pieceTag(jt.right) + ' starts at ' + fmt(jt.R, 3) + '. Flying along ';
          else if (jt) why = '🦘 No piece covers ' + fmt(jt.x0, 3) + ' &lt; <i>x</i> &lt; ' + fmt(jt.x1, 3) + ' — flying across the gap along ';
          msg = why + '<i>' + eq.replace('− −', '+ ').replace('+ −', '− ') + '</i>';
          prio = 3;
          if (e.landing) {
            const pts = (state.graph.extraPts || []).concat([{ x: e.landing.X / state.track.Sx + state.track.xc, y: e.landing.Y / state.track.Sy }]);
            if (p && p.A < 0 && p.h > e.x) pts.push({ x: p.h, y: p.k });
            state.graph.includePoints(pts);
          }
          break;
        }
        case 'land':
          FCAudio.thud();
          if (state.world) state.world.burst(e.x !== undefined ? (e.x - state.track.xc) * state.track.Sx : 0, e.y * state.track.Sy);
          msg = e.onto === 'ground' ? '💥 Landed at <i>x</i> = ' + fmt(e.x, 3) + ' — right where the flight parabola has a zero (height 0)!' : '🛬 Landed back on the track at <i>x</i> = ' + fmt(e.x, 3) + (e.impact > 6 ? ' — hard landing!' : '.');
          if (e.onto !== 'ground') { const pl = pieceNear(e.x); if (pl) msg += ' Now on piece ' + pieceTag(pl.k) + '.'; }
          prio = 3;
          break;
        case 'crash': FCAudio.thud(); msg = '💥 CRASH! The coaster hit the side of the next piece of track.'; prio = 3; break;
        case 'station': msg = '🏁 Pulling into the station at ' + speedText(e.v) + (Math.abs(e.slope) > 1.5 ? ' — coming in steep! A real coaster would curve out of the dive first.' : '.'); prio = 2; break;
        case 'corner': FCAudio.thud(); msg = '💥 OUCH! Sharp corner at <i>x</i> = ' + fmt(e.x, 3) + ': the slope changes instantly. Real track must be smooth.'; prio = 3; break;
      }
      if (msg) { say(msg, prio); log(msg); }
    }
  }

  function finishRide() {
    const sim = state.sim;
    state.rideDone = true;
    state.riding = false; // the sim stays, so the train stays where it ended
    state.paused = false;
    state.graph.riding = false;
    const st = sim.stats;
    const rt = FCPhysics.ratings(st);
    state.stats = st; state.ratings = rt;
    state.graph.setSpeedProfile(state.speedSamples, state.an.a, state.an.b);
    if (st.reachedEnd) FCAudio.fanfare();
    // prediction
    let pred = null;
    if (state.prediction !== null) {
      const err = Math.abs(state.prediction - st.maxSpeedX) / Math.max(1e-9, state.an.width);
      pred = { err, great: err <= 0.05, close: err <= 0.15, x: state.prediction, actual: st.maxSpeedX };
      FCStore.progress.patch((p) => {
        p.predictions.tries++;
        if (pred.great) { p.predictions.great++; p.predictions.streak++; p.predictions.best = Math.max(p.predictions.best, p.predictions.streak); } else p.predictions.streak = 0;
      });
      if (pred.great) state.meta.predictionGreat = true;
    }
    state.lastPrediction = pred;
    // history
    if (state.entryId) {
      const flightDist = st.flights.reduce((s, f) => s + f.distance, 0);
      FCStore.history.update(state.entryId, {
        stats: {
          excitement: +rt.excitement.toFixed(2), intensity: +rt.intensity.toFixed(2), nausea: +rt.nausea.toFixed(2), topSpeed: +st.maxSpeed.toFixed(2), maxG: +st.maxG.toFixed(2), minG: +st.minG.toFixed(2),
          floatTime: +st.floatTime.toFixed(2), maxDrop: +st.maxDrop.toFixed(1), duration: +st.duration.toFixed(1), flightDist: +flightDist.toFixed(2), completed: st.reachedEnd, outcome: st.outcome,
          turningPoints: state.an.turningPoints, safe: FCRemix.isSafe(st), scale: state.track.Sx, mode: sim.o.mode,
        },
      });
    }
    const newBadges = checkMissions('ride');
    setRideButton();
    updateHUD();
    el.statusChip.hidden = true;
    if (App.panels) { App.panels.showResults(st, rt, pred, newBadges); App.panels.renderBlueprint(true); App.panels.renderGarage(); App.panels.markRemixDirty(); }
    state.prediction = null;
  }

  // ---------------------------------------------------------------- missions
  function missionCtx() {
    const prog = FCStore.progress.get();
    state.meta.matchesDone = Object.values(prog.match || {}).filter((s) => s >= 2).length;
    return { an: state.an, poly: state.an && state.an.poly, fn: state.fn, ride: state.rideDone ? state.stats : null, ratings: state.rideDone ? state.ratings : null, meta: state.meta, params: state.paramNames || [] };
  }
  function checkMissions(when) {
    if (!state.an) return [];
    const ctx = missionCtx();
    const prog = FCStore.progress.get();
    const fresh = [];
    for (const m of FCContent.MISSIONS) {
      if (prog.missions[m.id]) continue;
      if (m.when === 'ride' && when !== 'ride') continue;
      let ok = false;
      try { ok = !!m.check(ctx); } catch (e) { ok = false; }
      if (ok) { prog.missions[m.id] = Date.now(); fresh.push(m); }
    }
    if (fresh.length) {
      FCStore.progress.set(prog);
      fresh.forEach((m, i) => setTimeout(() => { toast('<div class="tt">' + m.icon + ' Badge earned: ' + m.title + '</div>' + m.concept + ' — ' + m.desc, 'badge-toast', 6000); FCAudio.fanfare(); }, i * 900));
      confetti();
      if (App.panels) App.panels.renderMissions();
    }
    updateMissionBadge();
    return fresh;
  }
  function updateMissionBadge() {
    const prog = FCStore.progress.get();
    const n = Object.keys(prog.missions).length;
    el.missionBadge.textContent = n ? String(n) : '';
    el.missionBadge.title = n + ' of ' + FCContent.MISSIONS.length + ' badges earned';
  }

  // ---------------------------------------------------------------- match mode
  function enterMatch(level) {
    const r = FCMath.parse(level.f);
    const fn = FCMath.compile(r.ast, {});
    const an = FCAnalysis.analyze({ fn, a: level.a, b: level.b, coeffs: FCMath.toPoly(r.ast, {}), ast: r.ast });
    state.match = { level, fn, an, hints: false, best: 0 };
    el.domA.value = FC.numText(level.a, 6); el.domB.value = FC.numText(level.b, 6);
    el.domA.readOnly = el.domB.readOnly = true;
    el.fnInput.value = 'x';
    if (r.ast.type === 'piecewise') {
      // same intervals as the target; the formulas are the puzzle
      el.fnInput.value = '{' + r.ast.pieces.map((q) => '0 if ' + FCMath.pwCondText(q)).join('; ') + '}';
    }
    state.params = {};
    el.matchBar.hidden = false;
    renderMatchBar();
    build({ noMissions: true });
    state.graph.setTarget({ an, fn, hints: null });
    state.graph.resetView();
    refreshGhost();
    updateMatchScore(false);
    el.fnInput.focus(); el.fnInput.select();
    toast('🧩 <b>' + level.name + '</b>: type a function whose track matches the purple ghost track.', '', 5000);
  }
  function refreshGhost() {
    const m = state.match;
    if (!m || !state.track) return;
    m.track = FCPhysics.buildTrack(m.an, m.fn, { Sx: state.track.Sx, Sy: state.track.Sy });
    if (state.world) state.world.setGhost(m.track);
  }
  function exitMatch() {
    state.match = null;
    el.matchBar.hidden = true;
    el.domA.readOnly = el.domB.readOnly = false;
    state.graph.setTarget(null);
    state.graph.resetView();
    if (state.world) state.world.setGhost(null);
    state.graph.dirty = true;
  }
  function renderMatchBar() {
    const m = state.match;
    if (!m) return;
    el.matchBar.innerHTML = '<span class="mt">🧩 ' + FC.escapeHTML(m.level.name) + '</span><span class="hint">' + FC.escapeHTML(m.level.concept) + '</span>' +
      '<div class="meter"><div id="matchMeter" style="width:0%"></div></div><span class="pct" id="matchPct">0%</span>' +
      '<button class="btn btn-small btn-ghost" id="btnMatchHint">💡 Hint</button><button class="btn btn-small btn-ghost" id="btnMatchExit">✕ Exit</button>' +
      (m.hints ? '<span class="hint" style="flex-basis:100%">💡 ' + FC.escapeHTML(m.level.hint) + '</span>' : '');
    $('#btnMatchHint').addEventListener('click', () => {
      m.hints = true;
      state.graph.target.hints = m.level.keys.map(([x, y]) => ({ x, y }));
      state.graph.dirty = true;
      renderMatchBar(); updateMatchScore(false);
    });
    $('#btnMatchExit').addEventListener('click', exitMatch);
  }
  function updateMatchScore(celebrate) {
    const m = state.match;
    if (!m || !state.fn) return;
    const n = 240, lv = m.level;
    const range = Math.max(1, m.an.yMax - m.an.yMin);
    let se = 0;
    for (let i = 0; i <= n; i++) {
      const x = lv.a + ((lv.b - lv.a) * i) / n;
      const t = m.fn(x), u = state.fn(x);
      const d = isFinite(u) && isFinite(t) ? (u - t) / range : 1;
      se += Math.min(1, d * d);
    }
    const sim = Math.max(0, 1 - Math.sqrt(se / (n + 1)));
    const pct = sim * 100;
    const meter = $('#matchMeter'), pctEl = $('#matchPct');
    if (meter) meter.style.width = pct.toFixed(1) + '%';
    if (pctEl) pctEl.textContent = (pct >= 99.95 ? '100' : pct.toFixed(1)) + '%';
    const stars = sim >= 0.995 ? 3 : sim >= 0.97 ? 2 : sim >= 0.9 ? 1 : 0;
    if (celebrate && stars >= 2) {
      const prog = FCStore.progress.get();
      const prev = prog.match[lv.id] || 0;
      if (stars > prev) {
        prog.match[lv.id] = stars; FCStore.progress.set(prog);
        toast('<div class="tt">' + '⭐'.repeat(stars) + ' ' + FC.escapeHTML(lv.name) + ' matched!</div>' + (stars === 3 ? 'Perfect match!' : 'Great match — can you make it perfect?'), 'badge-toast', 5000);
        confetti(); FCAudio.fanfare();
        checkMissions('match');
        if (App.panels) App.panels.renderMissions();
      }
    }
  }

  // ---------------------------------------------------------------- camera, layout
  function setCamera(mode) {
    if (!state.world) return;
    state.world.setCameraMode(mode);
    $$('button', el.camSeg).forEach((b) => b.classList.toggle('on', b.dataset.cam === mode));
  }
  function setLayout(v) {
    el.stage.classList.toggle('only3d', v === '3d');
    el.stage.classList.toggle('only2d', v === '2d');
    $$('button', el.viewSeg).forEach((b) => b.classList.toggle('on', b.dataset.v === v));
    settings.view = v; saveSettings();
    requestAnimationFrame(() => { resizeAll(); });
  }
  function resizeAll() {
    state.graph.resize(); state.graph.dirty = true;
    if (state.world) state.world.resize();
  }

  // ---------------------------------------------------------------- toasts & confetti
  const pendingToasts = [];
  function toast(html, cls = '', ms = 3800) {
    // badge pop-ups wait while a dialog (like the welcome screen) is open
    if (cls === 'badge-toast' && !el.modal.hidden) { pendingToasts.push([html, cls, ms]); return; }
    const d = document.createElement('div');
    d.className = 'toast ' + cls;
    d.innerHTML = html;
    el.toasts.appendChild(d);
    while (el.toasts.children.length > 4) el.toasts.removeChild(el.toasts.firstChild);
    setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 450); }, ms);
  }
  function flushToasts() {
    const list = pendingToasts.splice(0);
    list.forEach((t, i) => setTimeout(() => toast(t[0], t[1], t[2]), 300 + i * 700));
    if (list.length) setTimeout(confetti, 300);
  }
  function confetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = el.confetti, ctx = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight;
    const cols = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#a06cf0', '#ff9f43'];
    const parts = Array.from({ length: 160 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.35, vx: (Math.random() - 0.5) * 14, vy: -6 - Math.random() * 10, r: 4 + Math.random() * 5, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6, va: (Math.random() - 0.5) * 0.3 }));
    const t0 = performance.now();
    const step = (now) => {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const p of parts) {
        p.vy += 0.35; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.globalAlpha = Math.max(0, 1 - t / 2.8);
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore();
      }
      if (t < 2.8) requestAnimationFrame(step); else ctx.clearRect(0, 0, cv.width, cv.height);
    };
    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------- loading tracks
  function loadTrack(t, opts = {}) {
    if (state.match && !opts.keepMatch) exitMatch();
    el.fnInput.value = t.f;
    el.domA.value = t.a; el.domB.value = t.b;
    state.params = Object.assign({}, t.params || {});
    const r = FCMath.parse(t.f);
    if (r.ok) syncParams(r.params);
    if (opts.mutation) state.meta.pendingMutation = true;
    const ok = build({ name: t.name || undefined });
    if (ok && opts.ride) startRide();
    return ok;
  }

  function snapToZeros() {
    if (!state.fn) { build(); if (!state.fn) return; }
    const an = state.an, w = an.width;
    let zs;
    if (an.poly && an.poly.realRoots.length) zs = an.poly.realRoots.map((r) => r.x);
    else zs = FCAnalysis.findZeros(state.fn, an.a - w, an.b + w, 6000);
    if (zs.length < 2) { toast('🤔 I couldn\'t find two zeros near your track to snap to. Try shifting the function down (− k) so it crosses the ground.', 'err', 5000); return; }
    const near = (x) => zs.reduce((best, z) => (Math.abs(z - x) < Math.abs(best - x) ? z : best), zs[0]);
    let za = near(an.a), zb = near(an.b);
    if (za === zb) {
      const others = zs.filter((z) => z !== za);
      const alt = others.reduce((best, z) => (Math.abs(z - (za === near(an.a) ? an.b : an.a)) < Math.abs(best - an.b) ? z : best), others[0]);
      if (alt < za) { zb = za; za = alt; } else zb = alt;
    }
    if (za > zb) [za, zb] = [zb, za];
    el.domA.value = FC.numText(za, 6); el.domB.value = FC.numText(zb, 6);
    build();
    toast('⤓ Both ends now sit on zeros: x = ' + fmt(za, 4) + ' and x = ' + fmt(zb, 4) + '.');
  }

  return {
    $, $$, el, state, settings, saveSettings, grabElements, build, renderPreview, schedulePreview, startRide, stopRide, togglePause, onRideButton,
    setCamera, setLayout, resizeAll, toast, flushToasts, confetti, loadTrack, snapToZeros, enterMatch, exitMatch, checkMissions, updateMissionBadge, frame, onGraphPick, refreshGhost,
    speedText, speedParts, rideOptions, forecastSoon, syncParams, renderParamBar, missionCtx, updateHUDIdle, setRideButton, handleEvents,
    switchMode, setModeUI, pieceNear, pieceTag,
  };
})();
