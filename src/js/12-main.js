/* =====================================================================
   Start-up and event wiring
   ===================================================================== */
(function () {
  const { $, $$, el, state, settings } = App;
  const panels = App.panels;

  function init() {
    App.grabElements();
    // 2D graph
    state.graph = new FCGraph(el.c2d);
    Object.assign(state.graph.opts, settings.graph);
    state.graph.onPick = (x) => App.onGraphPick(x);
    state.graph.onHover = (x) => showReadout(x);
    panels.renderGraphTools();
    // controls from settings
    el.startMode.value = settings.startMode || 'lift';
    el.launchSpeed.value = 30;
    el.launchCtl.hidden = el.startMode.value !== 'launch';
    panels.updateLaunchOut();
    state.warp = settings.warp || 1;
    $$('button', el.warpSeg).forEach((b) => b.classList.toggle('on', +b.dataset.w === state.warp));
    FCAudio.setEnabled(settings.sound);
    FCAudio.setSonify(settings.sonify);
    el.btnSound.textContent = settings.sound ? '🔊' : '🔇';
    if (settings.view && settings.view !== 'both') App.setLayout(settings.view);
    bind();
    App.resizeAll();

    // first track: shared link in the URL → last track → the teacher's classic
    let first = trackFromHash(), shared = !!first;
    const hist = FCStore.history.all();
    if (!first && hist.length) first = hist[0];
    if (!first) first = FCContent.PRESETS[0];
    // welcome first, so badges earned while loading wait until it's closed
    if (!settings.welcomed) panels.showWelcome(shared ? first : null);
    App.loadTrack(first);
    panels.renderMissions();
    App.updateMissionBadge();
    requestAnimationFrame(App.frame);
    load3D();
  }

  function trackFromHash() {
    let h = '';
    try { h = decodeURIComponent(location.hash || ''); } catch (e) { h = location.hash || ''; }
    const m = /FC1-[A-Za-z0-9+/_-]+/.exec(h);
    if (!m) return null;
    try { return FCStore.decodeTrack(m[0]); } catch (e) { return null; }
  }

  async function load3D() {
    try {
      state.world = await FCWorld.create(el.c3dHost);
      state.world.onCameraChange = (mode) => $$('button', el.camSeg).forEach((b) => b.classList.toggle('on', b.dataset.cam === mode));
      state.world.renderer.shadowMap.enabled = settings.shadows;
      state.world.sun.castShadow = settings.shadows;
      state.world.resize();
      if (state.track) state.world.build(state.track, state.an, { railColor: settings.railColor });
      if (state.match) App.refreshGhost();
      setupVR(state.world);
      el.loading3d.hidden = true;
    } catch (e) {
      console.warn(e);
      state.worldFailed = true;
      el.loading3d.hidden = true;
      el.fallback3d.hidden = false;
      el.fallback3d.innerHTML = '<h3>🌐 The 3D park needs an internet connection</h3><p>Everything else works! The ride runs in the graph below.</p><p class="note">(The 3D engine loads from a free CDN. Connect to the internet and reload to ride in 3D.)</p>';
      $$('.hud-right', el.view3d).forEach((h) => { h.hidden = true; });
      if (innerWidth > 980) App.setLayout('both');
    }
  }

  // ---------------------------------------------------------------- Meta Quest 3 / WebXR
  function setupVR(world) {
    const button = document.getElementById('btnEnterVR');
    if (!button) return;
    const xr = navigator.xr;
    if (!xr || !window.isSecureContext) return;
    xr.isSessionSupported('immersive-vr').then((supported) => {
      if (!supported) return;
      button.hidden = false;
      let session = null;
      let lastSelect = 0;
      button.addEventListener('click', async () => {
        if (session) { await session.end(); return; }
        try {
          // Must happen from a user gesture, not on page load.
          session = await xr.requestSession('immersive-vr', {
            optionalFeatures: ['local-floor', 'bounded-floor']
          });
          const active = session;
          const renderer = world.renderer;
          renderer.setPixelRatio(1);
          // Turn shadows off while headset is active for Quest performance.
          world.sun.castShadow = false;
          renderer.shadowMap.enabled = false;
          world.setCameraMode('pov');
          App.stopRide(true); // begin from a stationary position
          button.textContent = 'Exit VR';
          const onSelect = () => {
            const now = performance.now();
            if (now - lastSelect < 350) return;
            lastSelect = now;
            App.onRideButton();
          };
          active.addEventListener('select', onSelect);
          active.addEventListener('end', () => {
            renderer.setAnimationLoop(null);
            session = null;
            button.textContent = '🥽 Enter VR';
            world.sun.castShadow = App.settings.shadows;
            renderer.shadowMap.enabled = App.settings.shadows;
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            // Restore the normal desktop camera coordinate system.
            world.vrRig.position.set(0, 0, 0);
            world.vrRig.rotation.set(0, 0, 0);
            world.camera.position.set(40, 30, 80);
            world.camera.quaternion.identity();
            world.blend = null;
            world.resize();
            if (App.state.riding && !App.state.paused) App.togglePause();
            requestAnimationFrame(App.frame);
          }, { once: true });
          // Keep headset tracking relative to the moving car, not world (0,0,0).
          renderer.xr.setReferenceSpaceType('local-floor');
          world.camera.position.set(0, 0, 0);
          world.camera.quaternion.identity();
          world.vrRig.position.set(0, 0, 0);
          world.vrRig.rotation.set(0, 0, 0);
          await renderer.xr.setSession(active);
          renderer.setAnimationLoop((time) => App.frame(time));
          App.toast('🥽 VR ready! Press the Quest trigger to start or pause. Use the headset menu to exit.', '', 6500);
        } catch (err) {
          console.warn('VR session failed', err);
          App.toast('Could not enter VR: ' + (err.message || err), 'err', 6500);
          button.textContent = '🥽 Enter VR';
        }
      });
    }).catch((e) => console.warn('WebXR availability check failed', e));
  }

  function showReadout(x) {
    const r = el.graphReadout;
    if (x === null || !state.an || state.riding) { r.textContent = ''; return; }
    const seg = state.an.segments.find((s) => x >= s.x0 && x <= s.x1);
    if (!seg) { r.innerHTML = '<i>x</i> = ' + FC.fmt(x, 3) + ' · no track here'; return; }
    const y = state.fn(x), d = state.an.d1(x, seg.x0, seg.x1);
    r.innerHTML = '<i>x</i> = ' + FC.fmt(x, 3) + ' · <i>f</i>(<i>x</i>) = ' + FC.fmt(y, 3) + ' · slope = ' + FC.fmt(d, 3);
  }

  function bind() {
    // function form
    $('#fnForm').addEventListener('submit', (e) => { e.preventDefault(); App.build(); });
    el.fnInput.addEventListener('input', App.schedulePreview);
    el.btnSurprise.addEventListener('click', async () => {
      el.btnSurprise.disabled = true;
      const prev = el.btnSurprise.innerHTML;
      el.btnSurprise.innerHTML = '🎲<span class="txt-wide"> Rolling…</span>';
      try {
        if (state.match) App.exitMatch();
        const pw = state.mode === 'pieces';
        const s = pw ? await FCRemix.surprisePW(panels.labSettings()) : await FCRemix.surprise(panels.labSettings());
        if (s) {
          App.loadTrack({ f: s.f, a: s.a, b: s.b });
          if (pw) panels.showTab('pieces');
          App.toast('🎲 Surprise! <b>' + FC.escapeHTML(state.name) + '</b> — excitement ' + s.ev.ratings.excitement.toFixed(1) + (pw ? '. Every joint is smooth — check the 🧩 Pieces tab to see how.' : '. Press ▶ Ride!'));
        }
      } finally { el.btnSurprise.disabled = false; el.btnSurprise.innerHTML = prev; }
    });
    el.btnSnap.addEventListener('click', () => App.snapToZeros());
    el.btnKeypad.addEventListener('click', (e) => { e.stopPropagation(); panels.toggleKeypad(); });
    el.keypad.addEventListener('click', (e) => { const b = e.target.closest('button[data-k]'); if (b) panels.keypadInsert(b.dataset.k); });
    document.addEventListener('click', (e) => { if (!el.keypad.hidden && !el.keypad.contains(e.target) && e.target !== el.btnKeypad) el.keypad.hidden = true; });
    el.btnSound.addEventListener('click', toggleSound);
    el.btnSettings.addEventListener('click', () => panels.showSettings());
    el.btnHelp.addEventListener('click', () => panels.showHelp());

    // ride controls
    el.btnRide.addEventListener('click', () => App.onRideButton());
    el.btnReset.addEventListener('click', () => App.stopRide());
    el.startMode.addEventListener('change', () => {
      settings.startMode = el.startMode.value; App.saveSettings();
      el.launchCtl.hidden = el.startMode.value !== 'launch';
      if (!state.riding) App.stopRide(true);
      App.forecastSoon();
    });
    el.launchSpeed.addEventListener('input', panels.updateLaunchOut);
    el.launchSpeed.addEventListener('change', () => App.forecastSoon());
    el.btnMinLaunch.addEventListener('click', findMinLaunch);
    el.warpSeg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-w]'); if (!b) return;
      state.warp = +b.dataset.w; settings.warp = state.warp; App.saveSettings();
      $$('button', el.warpSeg).forEach((x) => x.classList.toggle('on', x === b));
    });
    el.chkPredict.addEventListener('change', () => { if (!el.chkPredict.checked) { state.awaitingPrediction = false; el.predictPrompt.hidden = true; state.graph.pickMode = false; } });
    el.viewSeg.addEventListener('click', (e) => { const b = e.target.closest('button[data-v]'); if (b) App.setLayout(b.dataset.v); });
    el.camSeg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-cam]'); if (!b) return;
      state.userPickedOrbit = b.dataset.cam === 'orbit';
      App.setCamera(b.dataset.cam);
    });
    el.btnFull.addEventListener('click', toggleFullscreen);
    el.graphTools.addEventListener('click', (e) => { const b = e.target.closest('button[data-chip]'); if (b) panels.onChip(b.dataset.chip); });

    // tabs
    $('.tabs').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-tab]'); if (!b) return;
      panels.showTab(b.dataset.tab);
    });
    // one function ⇄ piecewise
    el.modeSeg.addEventListener('click', (e) => { const b = e.target.closest('button[data-mode]'); if (b) App.switchMode(b.dataset.mode); });
    el.pwSummary.addEventListener('click', () => panels.showTab('pieces', true));
    panels.bindPieces();

    // delegated actions across panels, results and modals
    document.addEventListener('click', onAction);
    document.addEventListener('change', (e) => {
      if (e.target.id === 'bpName') {
        state.name = e.target.value.trim() || state.name;
        if (state.entryId) FCStore.history.update(state.entryId, { name: state.name });
        panels.renderGarage();
      }
    });
    $('.modal-x').addEventListener('click', () => panels.closeModal());
    el.modal.addEventListener('click', (e) => { if (e.target === el.modal) panels.closeModal(); });

    // keyboard
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role=button]')) { e.preventDefault(); e.target.click(); return; }
      if (e.key === 'Escape') {
        if (!el.modal.hidden) panels.closeModal();
        el.keypad.hidden = true;
        if (!el.results.hidden) el.results.hidden = true;
        return;
      }
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.metaKey || e.ctrlKey || e.altKey || !el.modal.hidden) return;
      if (e.key === ' ') { e.preventDefault(); App.onRideButton(); }
      else if (e.key === 'r' || e.key === 'R') App.stopRide();
      else if (e.key === 'm' || e.key === 'M') toggleSound();
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      else if ('1234'.includes(e.key) && e.key.length === 1) { const mode = ['pov', 'chase', 'side', 'orbit'][+e.key - 1]; state.userPickedOrbit = mode === 'orbit'; App.setCamera(mode); }
    });
    // a shared link clicked while the app is already open only changes the #hash
    window.addEventListener('hashchange', () => {
      const t = trackFromHash();
      if (!t) return;
      const same = t.f === state.fText && t.a === state.aText && t.b === state.bText && JSON.stringify(t.params || {}) === JSON.stringify(state.params || {});
      if (!same) { App.loadTrack(t); App.toast('🔗 Opened a shared track: <b>' + FC.escapeHTML(state.name) + '</b>'); }
    });
    window.addEventListener('resize', () => App.resizeAll());
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => App.resizeAll());
      ro.observe(el.view2d); ro.observe(el.view3d);
    }
    // stop runaway audio when hidden
    document.addEventListener('visibilitychange', () => { if (document.hidden && state.riding && !state.paused) App.togglePause(); });
  }

  function onAction(e) {
    const t = e.target.closest('[data-act],[data-mut],[data-lab],[data-preset],[data-pwpreset],[data-match],[data-load],[data-fav],[data-code],[data-del],[data-gloss],.lm');
    if (!t) return;
    const d = t.dataset;
    if (d.gloss) { panels.showGloss(d.gloss); return; }
    if (t.classList.contains('lm')) {
      const x = +d.x;
      const y = d.y !== undefined ? +d.y : (isFinite(state.fn(x)) ? state.fn(x) : 0);
      state.graph.pulse = { x, y, t0: performance.now() };
      state.graph.dirty = true;
      if (el.stage.classList.contains('only3d')) App.setLayout('both');
      return;
    }
    if (d.mut !== undefined) {
      const m = state._mutations && state._mutations[+d.mut];
      if (m) { App.loadTrack({ f: m.f, a: FC.numText(m.a, 6), b: FC.numText(m.b, 6), params: state.params }, { mutation: true }); App.toast(m.icon + ' <b>' + FC.escapeHTML(m.title) + '</b>: ' + m.rule + ' — ' + FC.escapeHTML(m.concept)); }
      return;
    }
    if (d.lab !== undefined) {
      const c = state._lab && state._lab[+d.lab];
      if (c) App.loadTrack({ f: c.f, a: FC.numText(c.a, 6), b: FC.numText(c.b, 6), params: state.params }, { mutation: true });
      return;
    }
    if (d.preset !== undefined) {
      const p = FCContent.PRESETS[+d.preset];
      App.loadTrack({ f: p.f, a: p.a, b: p.b, params: p.params || {}, name: p.name });
      App.toast('📚 <b>' + FC.escapeHTML(p.name) + '</b> — ' + FC.escapeHTML(p.blurb), '', 6000);
      return;
    }
    if (d.pwpreset !== undefined) {
      const p = FCContent.PW_PRESETS[+d.pwpreset];
      if (state.match) App.exitMatch();
      App.loadTrack({ f: p.f, a: '', b: '', params: p.params || {}, name: p.name });
      panels.showTab('pieces', true);
      App.toast('🧩 <b>' + FC.escapeHTML(p.name) + '</b> — ' + FC.escapeHTML(p.blurb), '', 7000);
      return;
    }
    if (d.match !== undefined) { App.enterMatch(FCContent.MATCHES[+d.match]); return; }
    if (d.load) { const t2 = FCStore.history.all().find((x) => x.id === d.load); if (t2) App.loadTrack(t2); return; }
    if (d.fav) { const t2 = FCStore.history.all().find((x) => x.id === d.fav); if (t2) { FCStore.history.update(t2.id, { favorite: !t2.favorite }); panels.renderGarage(); } return; }
    if (d.code) { const t2 = FCStore.history.all().find((x) => x.id === d.code); if (t2) panels.showCode(FCStore.encodeTrack(t2)); return; }
    if (d.del) { if (confirm('Delete this track from your garage?')) { FCStore.history.remove(d.del); panels.renderGarage(); } return; }
    switch (d.act) {
      case 'standard': App.loadTrack({ f: FCMath.poly.toText(state.an.poly.coeffs, 6), a: state.aText, b: state.bText }); break;
      case 'vertex-form': {
        const q = state.an.poly.quadratic;
        const f = FCRemix.textOf(FCMath.N.add(FCMath.N.mul(FCMath.N.num(q.a), FCMath.N.pow(FCMath.N.sub(FCMath.N.x(), FCMath.N.num(q.h)), FCMath.N.num(2))), FCMath.N.num(q.k)), {}, true);
        App.loadTrack({ f, a: state.aText, b: state.bText });
        break;
      }
      case 'open-pieces': panels.showTab('pieces', true); break;
      case 'close-results': el.results.hidden = true; break;
      case 'ride-again': el.results.hidden = true; App.startRide(); break;
      case 'to-remix': el.results.hidden = true; $('.tabs button[data-tab="remix"]').click(); break;
      case 'lab': panels.runLab(); break;
      case 'snap': App.snapToZeros(); break;
      case 'zoom-turns': {
        const an = state.an;
        const xs = an.maxima.concat(an.minima).map((p) => p.x);
        const lo = Math.min(...xs), hi = Math.max(...xs);
        const pad = Math.max((hi - lo) * 0.35, an.width * 0.05);
        el.domA.value = FC.numText(Math.max(an.a, lo - pad), 5); el.domB.value = FC.numText(Math.min(an.b, hi + pad) === hi + pad ? hi + pad : Math.min(an.b, hi + pad), 5);
        App.build();
        break;
      }
      case 'widen': {
        const w = state.b - state.a;
        el.domA.value = FC.numText(state.a - w / 4, 5); el.domB.value = FC.numText(state.b + w / 4, 5);
        App.build();
        break;
      }
      case 'safe-stretch': { const r = state._safeStretch; if (r) App.loadTrack({ f: r.f, a: FC.numText(r.a, 6), b: FC.numText(r.b, 6), params: state.params }, { mutation: true }); break; }
      case 'safe-stretch-2': { const m = state._mutations && state._mutations.find((x) => x.id === 'wider'); if (m) App.loadTrack({ f: m.f, a: FC.numText(m.a, 6), b: FC.numText(m.b, 6), params: state.params }, { mutation: true }); break; }
      case 'mode-lift': el.startMode.value = 'lift'; el.startMode.dispatchEvent(new Event('change')); break;
      case 'min-launch': findMinLaunch(); break;
      case 'raise': { const k = FCRemix.niceNum(-state.an.yMin * 1.1) || 1; const m = FCMath.N.add(FCMath.clone(state.parsed.ast), FCMath.N.num(k)); App.loadTrack({ f: FCMath.toText(FCMath.simplify(m)), a: state.aText, b: state.bText, params: state.params }, { mutation: true }); break; }
      case 'wiggle': { const m = state._mutations && state._mutations.find((x) => x.id === 'wiggle'); if (m) App.loadTrack({ f: m.f, a: state.aText, b: state.bText, params: state.params }, { mutation: true }); break; }
      case 'smooth-abs': {
        const af = state.an.absForm;
        if (!af) break;
        const txt = state.fText.replace(/\|([^|]+)\|/, (all, inner) => 'sqrt((' + inner.trim() + ')^2 + 0.5)');
        if (txt !== state.fText) App.loadTrack({ f: txt, a: state.aText, b: state.bText, params: state.params }, { mutation: true });
        else App.toast('Replace |x − h| with sqrt((x − h)^2 + 0.5) to smooth the corner.');
        break;
      }
      case 'code-current': panels.showCode(FCStore.encodeTrack({ f: state.fText, a: state.aText, b: state.bText, params: state.params, name: state.name })); break;
      case 'copy-link':
      case 'copy-code': {
        const box = $(d.act === 'copy-link' ? '#linkBox' : '#codeBox');
        if (navigator.clipboard) navigator.clipboard.writeText(box.value).then(() => App.toast('📋 Copied!'), () => { box.select(); document.execCommand('copy'); App.toast('📋 Copied!'); });
        else { box.select(); document.execCommand('copy'); App.toast('📋 Copied!'); }
        break;
      }
      case 'load-code': panels.showLoadCode(); break;
      case 'load-code-go': {
        try { const t2 = FCStore.decodeTrack($('#codeIn').value); panels.closeModal(); App.loadTrack(t2); App.toast('🎢 Loaded <b>' + FC.escapeHTML(state.name) + '</b>!'); } catch (err) { App.toast('⚠️ ' + err.message, 'err'); }
        break;
      }
      case 'export': {
        const data = { app: 'Function Coaster', version: 1, exported: new Date().toISOString(), tracks: FCStore.history.all() };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'function-coaster-tracks.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        break;
      }
      case 'import': $('#importFile').click(); break;
      case 'clear-history': if (confirm('Clear your saved tracks? (Favorites ⭐ are kept.)')) { FCStore.history.clear(true); panels.renderGarage(); } break;
      case 'help': panels.showHelp(); break;
      case 'help-gloss': panels.showHelp('gloss'); break;
      case 'welcome': panels.showWelcome(); break;
      case 'welcome-ride': panels.closeModal(); App.startRide(); break;
      case 'close-modal': panels.closeModal(); break;
      case 'reset-progress': if (confirm('Reset all badges, match stars and prediction stats?')) { FCStore.progress.reset(); panels.renderMissions(); App.toast('🧹 Progress reset.'); } break;
    }
  }

  function findMinLaunch() {
    if (!state.track) return;
    const v = FCPhysics.minLaunchSpeed(state.track, { friction: settings.friction });
    if (v === null) { App.toast('🤔 Even a huge launch can\'t get this track to the end — maybe it has a gap or a wall.', 'err'); return; }
    const rise = Math.max(0, state.track.bounds.trackMaxY - state.track.segs[0].Y[0]);
    const ideal = Math.sqrt(2 * 9.81 * rise);
    const pick = Math.ceil(v * 1.05 * 2) / 2;
    el.startMode.value = 'launch'; settings.startMode = 'launch'; App.saveSettings();
    el.launchCtl.hidden = false;
    el.launchSpeed.max = Math.max(100, Math.ceil(pick / 10) * 10);
    el.launchSpeed.value = pick;
    panels.updateLaunchOut();
    App.stopRide(true);
    App.forecastSoon();
    App.toast('🚀 Minimum launch ≈ <b>' + App.speedText(v) + '</b>. Energy check: to rise ' + FC.fmt(rise, 3) + ' m you need at least v = √(2·9.81·' + FC.fmt(rise, 3) + ') ≈ ' + FC.fmt(ideal, 3) + ' m/s — a bit more because of friction. Set to ' + FC.fmt(pick, 3) + ' m/s.', '', 8000);
  }
  function toggleSound() {
    settings.sound = !settings.sound; App.saveSettings();
    FCAudio.init(); FCAudio.setEnabled(settings.sound);
    el.btnSound.textContent = settings.sound ? '🔊' : '🔇';
  }
  function toggleFullscreen() {
    const v = el.view3d;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (v.requestFullscreen) v.requestFullscreen().then(() => setTimeout(App.resizeAll, 100), () => {});
  }

  /** If start-up fails, show the "can't run here" banner with the error instead of a blank app. */
  function safeInit() {
    try { init(); } catch (err) {
      console.error(err);
      document.documentElement.classList.remove('js');
      const d = document.getElementById('nojsDetail');
      if (d) d.textContent = 'Error while starting: ' + (err && err.message ? err.message : err);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeInit);
  else safeInit();
})();
