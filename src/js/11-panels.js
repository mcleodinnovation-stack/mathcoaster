/* =====================================================================
   Panels — Blueprint, Remix, Missions, Garage, results, modals
   ===================================================================== */
App.panels = (function () {
  const { $, $$, el, state, settings } = App;
  const fmt = FC.fmt;
  const esc = FC.escapeHTML;
  const yScale = () => (state.an ? Math.max(1, state.an.yMax - state.an.yMin) : 1);
  const P2 = (x, y) => '(' + fmt(x, 3) + ', ' + FC.fmtZ(y, yScale(), 3) + ')';
  const what = (key) => '<span class="what" role="button" tabindex="0" data-gloss="' + key + '" title="What does this mean?">?</span>';

  function iv(list) {
    if (!list.length) return '<span class="flat">none</span>';
    return list.map((r) => '(' + fmt(r.x0, 3) + ', ' + fmt(r.x1, 3) + ')').join(' ∪ ');
  }

  // ---------------------------------------------------------------- alt forms
  function numOrApprox(v) { return Math.abs(v - Math.round(v * 1000) / 1000) < 1e-9 ? fmt(v, 3) : '≈' + fmt(v, 3); }
  function linFactor(r, m) {
    let f;
    if (Math.abs(r) < 1e-12) f = '<i>x</i>';
    else f = '(<i>x</i> ' + (r > 0 ? '− ' : '+ ') + fmt(Math.abs(r), 3) + ')';
    return f + (m > 1 ? '<sup>' + m + '</sup>' : '');
  }
  function factoredHTML(pi) {
    let s = '';
    const lead = pi.lead;
    if (Math.abs(lead - 1) > 1e-12) s += Math.abs(lead + 1) < 1e-12 ? '−' : fmt(lead, 4);
    for (const r of pi.realRoots) s += linFactor(r.x, r.mult);
    for (const c of pi.complexRoots) {
      const b = -2 * c.re, cc = c.re * c.re + c.im * c.im;
      s += '(<i>x</i><sup>2</sup> ' + (Math.abs(b) < 1e-12 ? '' : (b < 0 ? '− ' : '+ ') + fmt(Math.abs(b), 3) + '<i>x</i> ') + '+ ' + fmt(cc, 3) + ')';
    }
    return s;
  }
  function vertexHTML(q) {
    const h = q.h, k = q.k;
    const inner = Math.abs(h) < 1e-12 ? '<i>x</i>' : '(<i>x</i> ' + (h > 0 ? '− ' : '+ ') + fmt(Math.abs(h), 3) + ')';
    const a = Math.abs(q.a - 1) < 1e-12 ? '' : Math.abs(q.a + 1) < 1e-12 ? '−' : fmt(q.a, 4);
    const kk = Math.abs(k) < 1e-12 ? '' : (k > 0 ? ' + ' : ' − ') + fmt(Math.abs(k), 4);
    return a + (Math.abs(h) < 1e-12 ? '<i>x</i><sup>2</sup>' : inner + '<sup>2</sup>') + kk;
  }

  // ---------------------------------------------------------------- Blueprint
  let bpRaf = 0;
  function renderBlueprint() {
    if (bpRaf) return;
    bpRaf = requestAnimationFrame(() => { bpRaf = 0; renderBlueprintNow(); });
  }
  function renderBlueprintNow() {
    const host = $('#tab-blueprint');
    const s = state, an = s.an;
    if (!an) { host.innerHTML = '<div class="empty">Type a function and press 🔨 Build track.</div>'; return; }
    const focusName = document.activeElement && document.activeElement.id === 'bpName';
    const scroll = host.scrollTop;
    const tr = s.track, S = tr.Sx;
    const fam = an.family || { label: 'Function' };
    const pi = an.poly;
    let h = '';
    // name + family
    h += '<div class="name-row"><input class="name-input" id="bpName" maxlength="40" aria-label="Coaster name" value="' + esc(s.name || '') + '"><span class="fam-badge">' + esc(fam.label) + '</span></div>';
    // function card
    const isPW = !!an.pw;
    h += '<div class="card"><div class="big-fn">f(<i>x</i>) = ' + FCMath.toHTML(s.parsed.ast, { stacked: isPW }) + '</div><div class="alt-forms">';
    if (pi && pi.degree >= 1) {
      const std = FCMath.poly.toHTML(pi.coeffs, 4);
      h += '<div><span>Standard form</span><span class="math">' + std + '</span></div>';
      if (pi.degree >= 2 && (pi.realRoots.length || pi.complexRoots.length)) h += '<div><span>Factored form</span><span class="math">' + factoredHTML(pi) + '</span></div>';
      if (pi.quadratic) h += '<div><span>Vertex form</span><span class="math">' + vertexHTML(pi.quadratic) + '</span></div>';
    }
    if (an.sinusoid) {
      const z = an.sinusoid;
      h += '<div><span>Wave facts ' + what('sinusoid') + '</span><span class="math wrap">amplitude ' + fmt(z.amplitude, 3) + ', period ' + fmt(z.period, 3) + (Math.abs(z.period / Math.PI - Math.round(z.period / Math.PI)) < 1e-9 ? ' (' + fmt(z.period / Math.PI, 3) + 'π)' : '') + ', midline <i>y</i> = ' + fmt(z.midline, 3) + '</span></div>';
    }
    if (an.expForm) {
      const e = an.expForm;
      h += '<div><span>Exponential ' + what('exponential') + '</span><span class="math wrap">' + (e.growth ? 'grows' : 'decays') + ' ×' + fmt(e.factor, 4) + ' per 1 step right; asymptote <i>y</i> = ' + fmt(e.D, 3) + '</span></div>';
    }
    if (an.absForm) {
      const v = an.absForm;
      h += '<div><span>Absolute value</span><span class="math wrap">vertex (' + fmt(v.h, 3) + ', ' + fmt(v.k, 3) + '), side slopes ±' + fmt(v.slope, 3) + '</span></div>';
    }
    h += '</div>';
    if (pi && !s.paramNames.length) {
      const stdText = FCMath.poly.toText(pi.coeffs, 6);
      if (stdText.replace(/\s/g, '') !== s.fText.replace(/\s/g, '')) h += '<div class="row" style="margin-top:8px"><button class="btn btn-small btn-ghost" data-act="standard">✏️ Rewrite in standard form</button></div>';
    }
    h += '</div>';

    if (isPW) h += pwBlueprintCard();

    // track facts
    const tileGround = Math.max(1, an.yMax - an.yMin) * 2e-3;
    const startGround = Math.abs(an.start.y) <= tileGround, endGround = Math.abs(an.end.y) <= tileGround;
    const heightRange = Math.max(1e-9, an.yMax - Math.min(an.yMin, 0));
    const endsAir = !(Math.abs(an.end.y) <= Math.max(1.5 / tr.Sy, 0.03 * heightRange) || an.end.y < 0);
    h += '<div class="card"><h3>📏 Track facts</h3><div class="tiles">';
    h += tile('Domain ' + what('domain'), '[' + fmt(an.a, 3) + ', ' + fmt(an.b, 3) + ']', 'width ' + fmt(an.width, 3) + ' → ' + fmt(an.width * S, 3) + ' m');
    h += tile('Range ' + what('range'), '[' + FC.fmtZ(an.yMin, yScale(), 3) + ', ' + FC.fmtZ(an.yMax, yScale(), 3) + ']', 'height ' + fmt(an.yMax - an.yMin, 3) + ' → ' + fmt((an.yMax - an.yMin) * tr.Sy, 3) + ' m');
    h += tile('Start height', 'f(' + fmt(an.start.x, 3) + ') = ' + FC.fmtZ(an.start.y, yScale(), 3), startGround ? '✓ ground level (a zero)' : an.start.y < 0 ? 'starts underground' : 'station on stilts', startGround ? 'good' : '');
    h += tile('End height', 'f(' + fmt(an.end.x, 3) + ') = ' + FC.fmtZ(an.end.y, yScale(), 3), endGround ? '✓ lands at ground level' : endsAir ? '⚠ ends in mid-air → it will fly off!' : 'close to the ground', endGround ? 'good' : endsAir ? 'warn' : '');
    h += tile('Track length', fmt(tr.totalLength, 3) + ' m', 'arc length ≈ ' + fmt(an.arcLength, 3) + ' units');
    h += tile('Scale', '1 unit = ' + fmt(S, 3) + ' m', tr.Sy !== tr.Sx ? 'vertical: 1 unit = ' + fmt(tr.Sy, 3) + ' m' : 'same across and up');
    h += '</div></div>';

    // landmarks
    h += '<div class="card"><h3>📍 Landmarks <span class="grow"></span><span class="note">tap to find</span></h3><div class="lm-list">';
    const lms = [];
    an.zeros.forEach((z) => lms.push({ ic: '🟢', cls: 'zero', t: 'Zero' + (z.mult > 1 ? ' (×' + z.mult + ')' : ''), d: z.kind === 'touch' ? 'touches the ground and bounces back ' + what('multiplicity') : z.endpoint === 'start' ? 'the track starts on the ground' : z.endpoint === 'end' ? 'the track ends on the ground' : 'crosses ground level ' + what('zero'), x: z.x, y: 0 }));
    if (an.yIntercept) lms.push({ ic: '🔷', cls: 'yint', t: 'y-intercept', d: 'crosses the y-axis ' + what('yint'), x: 0, y: an.yIntercept.y });
    an.maxima.forEach((m) => lms.push({ ic: '⛰️', cls: 'max', t: 'Local max (hilltop)', d: m.corner ? 'a sharp peak (corner)' : 'slope = 0 ' + what('max'), x: m.x, y: m.y }));
    an.minima.forEach((m) => lms.push({ ic: '🕳️', cls: 'min', t: 'Local min (valley)', d: m.corner ? 'a sharp V (corner)' : 'slope = 0 ' + what('min'), x: m.x, y: m.y }));
    an.inflections.forEach((m) => lms.push({ ic: '〰️', cls: 'inf', t: 'Inflection point', d: 'bend switches direction ' + what('inflection'), x: m.x, y: m.y }));
    an.flats.forEach((m) => lms.push({ ic: '⏸️', cls: 'inf', t: 'Flat spot', d: 'slope 0, but keeps going the same way', x: m.x, y: m.y }));
    an.corners.filter((c) => !c.isExtremum).forEach((c) => lms.push({ ic: '💥', cls: 'gap', t: 'Sharp corner', d: 'slope jumps from ' + fmt(c.leftSlope, 2) + ' to ' + fmt(c.rightSlope, 2), x: c.x, y: c.y }));
    an.gaps.forEach((g) => {
      const t = g.kind === 'asymptote' ? 'Vertical asymptote' : g.kind === 'jump' ? 'Jump' : 'Undefined';
      const d = g.kind === 'jump' ? 'jumps from ' + fmt(g.yL, 3) + ' to ' + fmt(g.yR, 3) + ' ' + what('discontinuity') : (g.why ? g.why : 'no real outputs') + ' ' + what(g.kind === 'asymptote' ? 'asymptote' : 'undefined');
      const where = g.kind === 'asymptote' ? '<i>x</i> ≈ ' + fmt(g.at, 4) : g.kind === 'jump' ? '<i>x</i> = ' + fmt(g.x0, 4) : fmt(g.x0, 3) + ' to ' + fmt(g.x1, 3);
      lms.push({ ic: g.kind === 'asymptote' ? '🧱' : g.kind === 'jump' ? '🪜' : '🚫', cls: 'gap', t, d, x: g.at !== undefined ? g.at : g.x0, y: null, where });
    });
    an.holes.forEach((ho) => lms.push({ ic: '⭕', cls: 'gap', t: 'Hole', d: (ho.why || 'undefined at one point') + ' — the coaster bumps over it', x: ho.x, y: ho.y }));
    lms.sort((p, q) => p.x - q.x);
    h += lms.map((l) => '<div class="lm" role="button" tabindex="0" data-x="' + l.x + '"' + (l.y !== null ? ' data-y="' + l.y + '"' : '') + '><span class="ic ' + l.cls + '">' + l.ic + '</span><span><div class="lt">' + l.t + '</div><div class="ld">' + l.d + '</div></span><span class="lc">' + (l.where || (l.y === null ? '<i>x</i> = ' + fmt(l.x, 3) : P2(l.x, l.y))) + '</span></div>').join('') || '<div class="note">No special points on this stretch — it\'s a smooth one-way ride.</div>';
    h += '</div></div>';

    // shape
    const inc = an.monotone.filter((m) => m.dir > 0), dec = an.monotone.filter((m) => m.dir < 0), flat = an.monotone.filter((m) => m.dir === 0);
    const cu = an.concavity.filter((m) => m.dir > 0), cd = an.concavity.filter((m) => m.dir < 0);
    h += '<div class="card"><h3>📈 Shape of the ride</h3><div class="intervals">';
    h += '<div><span class="up">▲ Increasing</span> ' + what('monotone') + ' on ' + iv(inc) + '</div>';
    h += '<div><span class="down">▼ Decreasing</span> on ' + iv(dec) + '</div>';
    if (flat.length) h += '<div><span class="flat">▬ Constant</span> on ' + iv(flat) + '</div>';
    h += '<div><span style="color:#4cc9f0">∪ Concave up</span> ' + what('concavity') + ' on ' + iv(cu) + '</div>';
    h += '<div><span style="color:#ff9f43">∩ Concave down</span> on ' + iv(cd) + '</div>';
    h += '</div><div class="kv" style="margin-top:8px">';
    const st = an.steepest;
    h += '<span class="k">Steepest point ' + what('slope') + '</span><span class="v">slope ' + fmt(st.slope, 3) + ' at <i>x</i> = ' + fmt(st.x, 3) + ' (' + st.angle.toFixed(1) + '°)</span>';
    h += '<span class="k">Average rate of change ' + what('avgrate') + '</span><span class="v">' + '<span class="m-frac"><span class="m-fn-num">' + FC.fmtZ(an.end.y, yScale(), 3) + ' − ' + (an.start.y < 0 ? '(' + FC.fmtZ(an.start.y, yScale(), 3) + ')' : FC.fmtZ(an.start.y, yScale(), 3)) + '</span><span class="m-fn-den">' + fmt(an.end.x, 3) + ' − ' + (an.start.x < 0 ? '(' + fmt(an.start.x, 3) + ')' : fmt(an.start.x, 3)) + '</span></span> = ' + FC.fmtZ(an.avgRate, yScale(), 3) + '</span>';
    const sym = an.symmetry;
    h += '<span class="k">Symmetry ' + what('symmetry') + '</span><span class="v">' + (sym.even ? 'even: <i>f</i>(−<i>x</i>) = <i>f</i>(<i>x</i>)' + (sym.domainSymmetric ? ' 🪞' : ' (domain isn\'t symmetric)') : sym.odd ? 'odd: <i>f</i>(−<i>x</i>) = −<i>f</i>(<i>x</i>)' + (sym.domainSymmetric ? ' 🔄' : ' (domain isn\'t symmetric)') : 'neither even nor odd') + '</span>';
    if (pi && pi.endBehavior && pi.degree >= 1) {
      const e = pi.endBehavior;
      const arrow = (sg) => (sg > 0 ? '+∞' : '−∞');
      h += '<span class="k">End behavior ' + what('endbehavior') + '</span><span class="v">x→−∞: f→' + arrow(e.left) + ' · x→+∞: f→' + arrow(e.right) + '</span>';
    }
    h += '</div></div>';

    // polynomial insights
    if (pi && pi.degree >= 1) {
      h += '<div class="card"><h3>🧮 Polynomial facts</h3>';
      if (pi.linear) {
        const L = pi.linear;
        h += '<div class="kv"><span class="k">Slope <i>m</i></span><span class="v">' + fmt(L.m, 4) + '</span><span class="k">y-intercept <i>b</i></span><span class="v">' + fmt(L.b, 4) + '</span><span class="k">x-intercept</span><span class="v">' + fmt(L.xInt, 4) + '</span></div>';
        h += '<div class="callout info">➖ A linear track is a straight ramp: the slope is ' + fmt(L.m, 3) + ' everywhere, so the rate of change never changes. No hills, no valleys!</div>';
      } else {
        const n = pi.degree;
        const realCount = pi.realRootCount, cpx = pi.complexRoots.length * 2;
        h += '<div class="kv">';
        h += '<span class="k">Degree</span><span class="v">' + n + ' (' + (n % 2 ? 'odd' : 'even') + ')</span>';
        h += '<span class="k">Leading coefficient</span><span class="v">' + fmt(pi.lead, 4) + (pi.lead > 0 ? ' (positive)' : ' (negative)') + '</span>';
        h += '<span class="k">Zeros (real) ' + what('zero') + '</span><span class="v">' + (pi.realRoots.length ? pi.realRoots.map((r) => numOrApprox(r.x) + (r.mult > 1 ? ' (×' + r.mult + ')' : '')).join(', ') : 'none') + '</span>';
        if (cpx) h += '<span class="k">Complex zeros ' + what('complex') + '</span><span class="v">' + pi.complexRoots.map((c) => fmt(c.re, 3) + ' ± ' + fmt(c.im, 3) + '<i>i</i>').join(', ') + '</span>';
        h += '<span class="k">Turning points</span><span class="v">' + an.turningPoints + ' on the track (at most ' + (n - 1) + ')</span>';
        h += '</div>';
        h += '<div class="callout info">🧠 Degree ' + n + ' → at most ' + n + ' zeros and ' + (n - 1) + ' turning points. Counting complex zeros (and repeats), there are exactly ' + n + ' zeros: ' + realCount + ' real' + (cpx ? ' + ' + cpx + ' complex' : '') + ' — the Fundamental Theorem of Algebra!' + (an.turningPoints === n - 1 && n > 1 ? ' Your track uses every turning point possible. ✓' : '') + '</div>';
        if (pi.quadratic) {
          const q = pi.quadratic;
          h += '<h4>Quadratic</h4><div class="kv">';
          h += '<span class="k">Vertex ' + what('vertex') + '</span><span class="v">' + P2(q.h, q.k) + '</span>';
          h += '<span class="k">Axis of symmetry</span><span class="v"><i>x</i> = ' + fmt(q.h, 4) + '</span>';
          h += '<span class="k">Opens</span><span class="v">' + (q.opensUp ? 'up ∪ (a > 0)' : 'down ∩ (a < 0)') + '</span>';
          h += '<span class="k">Discriminant ' + what('discriminant') + '</span><span class="v"><i>b</i>² − 4<i>ac</i> = ' + fmt(q.disc, 4) + ' → ' + (q.disc > 1e-12 ? '2 real zeros' : Math.abs(q.disc) <= 1e-12 ? '1 real zero (touches)' : 'no real zeros') + '</span>';
          h += '</div>';
        }
      }
      h += '</div>';
    }

    // physics: ride results or forecast
    h += physicsCard();
    h += '<div class="callout info">🔁 <span><b>Why no loops?</b> A loop would fail the <b>vertical line test</b> ' + what('vlt') + ' — a vertical line would hit it twice, so it couldn\'t be the graph of a function!</span></div>';
    host.innerHTML = h;
    host.scrollTop = scroll;
    const nameIn = $('#bpName');
    if (focusName) { nameIn.focus(); nameIn.setSelectionRange(nameIn.value.length, nameIn.value.length); }
  }
  function tile(label, value, sub, cls = '') {
    return '<div class="tile ' + cls + '"><div class="tl">' + label + '</div><div class="tv">' + value + '</div><div class="ts">' + (sub || '') + '</div></div>';
  }
  function ratingsHTML(rt) {
    const row = (cls, label, v, lab) => '<div class="rating ' + cls + '"><span class="rl">' + label + '</span><div class="rb"><div style="width:' + FC.clamp(v * 10, 0, 100) + '%"></div></div><span class="rv">' + (v >= 10 ? '10+' : v.toFixed(1)) + ' · ' + lab + '</span></div>';
    return '<div class="ratings">' + row('ex', '🎉 Excitement', rt.excitement, rt.labels.excitement) + row('in', '🔥 Intensity', rt.intensity, rt.labels.intensity) + row('na', '🤢 Nausea', rt.nausea, rt.labels.nausea) + '</div>';
  }
  function statsHTML(st) {
    const sp = App.speedParts(st.maxSpeed);
    const g = (v) => (v > 20 ? '20+' : v < -20 ? '−20−' : fmt(v, 2));
    const cells = [
      ['Top speed', sp.big + ' ' + sp.unit, sp.sub + ' at <i>x</i> = ' + fmt(st.maxSpeedX, 3)],
      ['Max G ' + what('gforce'), g(st.maxG) + ' G', 'at <i>x</i> = ' + fmt(st.maxGX, 3)],
      ['Min G', g(st.minG) + ' G', 'at <i>x</i> = ' + fmt(st.minGX, 3)],
      ['Floating', st.floatTime.toFixed(1) + ' s', 'airtime (below 0 G): ' + st.airtime.toFixed(1) + ' s'],
      ['Biggest drop', fmt(st.maxDrop, 3) + ' m', 'ride time ' + st.duration.toFixed(1) + ' s'],
    ];
    const fl = st.flights.reduce((s, f) => s + f.distance, 0);
    cells.push(st.flights.length ? ['Flight', fmt(fl, 3) + ' units', st.flights.length + ' jump' + (st.flights.length > 1 ? 's' : '')] : ['Distance', fmt(st.distance, 3) + ' m', st.reversals ? st.reversals + ' direction changes' : 'one way']);
    return '<div class="stat-grid">' + cells.map((c) => '<div class="stat"><div class="sl">' + c[0] + '</div><div class="sv">' + c[1] + '</div><div class="ss">' + c[2] + '</div></div>').join('') + '</div>';
  }
  function safetyHTML(sf) {
    if (!sf.notes.length) return '<div class="callout good">🦺 Safety inspector: all G-forces are in the comfortable range. Approved!</div>';
    return sf.notes.map((n) => '<div class="callout ' + (n.lvl === 'bad' ? 'bad' : 'warn') + '">' + (n.lvl === 'bad' ? '🚑' : '⚠️') + ' <span>' + esc(n.text) + '</span></div>').join('');
  }
  function outcomeLine(st) {
    switch (st.outcome) {
      case 'station': return '🏁 Made it to the station.';
      case 'crash-landing': return st.landingImpact > 6 ? '💥 Flew off the end and crash-landed.' : '🪂 Flew off the end and landed.';
      case 'wall': return '💥 Crashed into the next piece of track.';
      case 'rollback': return '😬 Rolled back into the station — not enough energy.';
      case 'fell-back': return '😬 Rolled back off the edge of a track piece.';
      case 'stuck': return '😵 Stuck in a valley near <i>x</i> = ' + fmt(st.endX, 3) + ' — not enough energy for the next hill.';
      default: return '⏱️ The ride went on and on…';
    }
  }
  function physicsCard() {
    const s = state;
    let h = '<div class="card"><h3>🎢 ' + (s.rideDone ? 'Your ride' : 'Ride forecast') + '<span class="grow"></span>';
    if (s.rideDone && s.stats) {
      h += '</h3><p>' + outcomeLine(s.stats) + '</p>' + ratingsHTML(s.ratings) + statsHTML(s.stats) + safetyHTML(s.ratings.safety);
      if (s.rideLog.length) h += '<h4>Ride log</h4><div class="ride-log">' + s.rideLog.map((l) => '<div><span class="t">' + l.t.toFixed(1) + 's</span>' + l.html + '</div>').join('') + '</div>';
    } else if (s.forecast) {
      const f = s.forecast;
      h += '<span class="note">' + esc(modeName(f.mode)) + '</span></h3><p class="note">A computer test-run of your track (press ▶ Ride to experience it):</p>';
      h += '<p>' + outcomeLine(f.stats) + '</p>' + ratingsHTML(f.ratings) + safetyHTML(f.ratings.safety);
      if (f.stats.maxG > 6 || f.stats.minG < -2) h += '<div class="callout info">💡 <span>G-forces come from the <b>shape</b>: at a valley, G ≈ 1 + 2 × (drop height) × (how sharply it curves). Building it bigger doesn\'t help — making the curves wider does. Try the 🧬 Remix tab! ' + what('curvature') + '</span></div>';
    } else h += '</h3><p class="note">Testing…</p>';
    return h + '</div>';
  }
  function modeName(m) { return { lift: '⛓️ chain lift', firstlift: '⛰️ one lift hill', launch: '🚀 launch', gravity: '🍃 gravity only' }[m] || m; }

  // ---------------------------------------------------------------- results overlay
  function showResults(st, rt, pred, badges) {
    const titles = { station: '🏁 Ride complete!', 'crash-landing': st.landingImpact > 6 ? '💥 Crash landing!' : '🪂 Touchdown!', wall: '💥 CRASH!', rollback: '😬 Rolled back!', 'fell-back': '😬 Fell back!', stuck: '😵 Stuck!', timeout: '⏱️ Time\'s up' };
    let h = '<div class="results-card"><h2>' + (titles[st.outcome] || 'Ride over') + '</h2><div class="sub">' + esc(state.name || '') + ' — ' + outcomeLine(st) + '</div>';
    h += ratingsHTML(rt) + statsHTML(st);
    if (rt.safety.notes.length) h += safetyHTML(rt.safety);
    if (st.flights.length && st.flights[st.flights.length - 1].parab) {
      const f = st.flights[st.flights.length - 1], p = f.parab;
      h += '<div class="callout info">🚀 <span>Flight path: <i>y</i> = ' + fmt(p.A, 3) + '(<i>x</i> − ' + fmt(p.h, 3) + ')² + ' + fmt(p.k, 3) + ' — a parabola! It ' + (f.landing === 'ground' ? 'landed at <i>x</i> = ' + fmt(f.toX, 3) + ', a zero of the flight parabola.' : 'came down on the track at <i>x</i> = ' + fmt(f.toX, 3) + '.') + '</span></div>';
    }
    if (pred) {
      const cls = pred.great ? 'good' : pred.close ? 'info' : 'warn';
      h += '<div class="callout ' + cls + '">🔮 <span>You guessed <i>x</i> = ' + fmt(pred.x, 3) + '; the top speed was at <i>x</i> = ' + fmt(pred.actual, 3) + ' (off by ' + (pred.err * 100).toFixed(1) + '% of the track). ' + (pred.great ? '<b>Spot on!</b>' : pred.close ? '<b>Close!</b>' : 'Hint: the coaster is fastest at the lowest point it reaches after its biggest drop — height turns into speed.') + '</span></div>';
    }
    if (badges && badges.length) h += '<div class="callout good">🏅 <span>New badge' + (badges.length > 1 ? 's' : '') + ': <b>' + badges.map((b) => b.icon + ' ' + esc(b.title)).join(', ') + '</b></span></div>';
    h += '<div class="actions"><button class="btn btn-small btn-ghost" data-act="close-results">Close</button><button class="btn btn-small btn-purple" data-act="to-remix">🧬 Improve it</button><button class="btn btn-small btn-teal" data-act="ride-again">▶ Ride again</button></div></div>';
    el.results.innerHTML = h;
    el.results.hidden = false;
  }

  // ---------------------------------------------------------------- Remix
  let remixDirty = true;
  function markRemixDirty() { remixDirty = true; if ($('#tab-remix').classList.contains('on')) renderRemix(); }
  function baseInfo() {
    const s = state;
    return { ast: s.parsed.ast, a: s.a, b: s.b, P: Object.assign({}, s.params), params: s.paramNames, an: s.an, coeffs: s.coeffs, f: s.fText };
  }
  function labSettings() {
    return { scale: settings.scale, vScale: settings.vScale, startMode: el.startMode.value, vLift: settings.vLift, friction: settings.friction, v0: +el.launchSpeed.value };
  }
  function renderRemix() {
    const host = $('#tab-remix');
    if (!state.an) { host.innerHTML = ''; return; }
    remixDirty = false;
    const scroll = host.scrollTop;
    const base = baseInfo();
    let h = '<div class="card"><h3>🧑‍🏫 Coach tips</h3><div id="coachTips">' + coachTipsHTML() + '</div></div>';
    // transformations
    const list = FCRemix.transforms(base);
    state._mutations = list;
    const origFn = state.fn;
    h += '<div class="card"><h3>🧬 Transform it ' + what('transform') + '</h3><p class="note">Each card shows the rule, what it does, and a preview (dashed = your track now).</p><div class="mut-grid">';
    list.forEach((m, i) => {
      let fnNew;
      try { fnNew = FCMath.compile(m.ast, base.P); } catch (e) { fnNew = () => NaN; }
      const svg = FCRemix.sparkSVG([{ fn: origFn, a: base.a, b: base.b, color: 'rgba(255,255,255,0.45)', dash: true, width: 1.5 }, { fn: fnNew, a: m.a, b: m.b, color: '#ffd166', width: 2.2 }]);
      h += '<button class="mut" data-mut="' + i + '" title="' + esc(m.f) + '"><span class="mh">' + m.icon + ' ' + esc(m.title) + '</span><span class="mr">' + m.rule + '</span>' + svg + '<span class="md">' + esc(m.desc) + '</span></button>';
    });
    h += '</div></div>';
    // thrill lab
    h += '<div class="card"><h3>🧪 Thrill Lab</h3><p class="note">The lab invents mutations of your track, test-rides each one with real physics, and shows the most exciting ones that are also safe.</p><div class="lab-row"><button class="btn btn-small btn-purple" data-act="lab">🧪 Run the lab</button><span class="gen" id="labStatus"></span></div><div id="labOut"></div></div>';
    // domain tools (a piecewise track's domain comes from its pieces instead)
    if (!state.an.pw) {
      h += '<div class="card"><h3>📐 Domain tools ' + what('domain') + '</h3><div class="row">';
      h += '<button class="btn btn-small btn-ghost" data-act="snap">⤓0 Snap ends to zeros</button>';
      if (state.an.maxima.length + state.an.minima.length) h += '<button class="btn btn-small btn-ghost" data-act="zoom-turns">🔍 Fit around the hills</button>';
      h += '<button class="btn btn-small btn-ghost" data-act="widen">↔ Longer ride (+50%)</button></div></div>';
    }
    // presets
    h += '<div class="card"><h3>📚 Track library</h3><div class="preset-list">';
    FCContent.PRESETS.forEach((p, i) => {
      let svg = '';
      try {
        const r = FCMath.parse(p.f);
        const fn = FCMath.compile(r.ast, p.params || {});
        const a = FCMath.evalConstExpr(p.a).value, b = FCMath.evalConstExpr(p.b).value;
        svg = FCRemix.sparkSVG([{ fn, a, b, color: '#ff4d6d', width: 2 }], 70, 40);
        p._html = FCMath.toHTML(r.ast);
      } catch (e) { /* ignore */ }
      h += '<button class="preset" data-preset="' + i + '">' + svg + '<span><div class="pn">' + esc(p.name) + '</div><div class="pf">' + (p._html || esc(p.f)) + '</div><div class="pt">' + p.tags.map((t) => '<span class="pill">' + esc(t) + '</span>').join('') + '</div></span></button>';
    });
    h += '</div></div>';
    h += '<div class="card"><h3>🧩 Piecewise coasters</h3><div class="preset-list">' + pwPresetList() + '</div></div>';
    host.innerHTML = h;
    host.scrollTop = scroll;
    paintLab();
    fillSafeStretchTip();
  }
  function coachTipsHTML() {
    const s = state, an = s.an;
    const tips = [];
    const f = s.forecast;
    if (f && (f.stats.maxG > 5 || f.stats.minG < -1.5)) {
      tips.push({ i: '🚑', h: '<b>Too intense!</b> The test-run hit ' + fmt(f.stats.maxG, 2) + ' G (max) and ' + fmt(f.stats.minG, 2) + ' G (min). Tight curves cause big G-forces. <span id="safeStretchTip">Looking for a safer stretch…</span>', a: [] });
    }
    if (f && !f.stats.reachedEnd) {
      const why = f.stats.outcome === 'rollback' ? 'rolls back to the station' : f.stats.outcome === 'stuck' ? 'gets stuck in a valley near x = ' + fmt(f.stats.endX, 3) : 'doesn\'t make it';
      const acts = [];
      if (el.startMode.value !== 'lift') acts.push(['⛓️ Use chain lift', 'mode-lift']);
      acts.push(['🚀 Find the launch speed', 'min-launch']);
      tips.push({ i: '🔋', h: '<b>Not enough energy:</b> with ' + modeName(f.mode) + ' the train ' + why + '. A hill higher than the starting energy can\'t be climbed — energy is conserved (and friction steals some).', a: acts });
    }
    if (an.pw && an.joints.length) {
      const bad = an.joints.filter((j) => j.kind !== 'smooth');
      if (bad.length) tips.push({ i: '🧩', h: '<b>Joints to fix:</b> ' + bad.map((j) => j.kind === 'gap' ? 'a gap after piece ' + (j.left + 1) : j.kind + ' at x = ' + fmt(j.x, 3)).join(', ') + '. Smooth joints need the same height AND the same slope on both sides.', a: [['🧩 Open the pieces', 'open-pieces']] });
      else tips.push({ i: '🧈', h: '<b>All joints are smooth</b> — the pieces meet at the same height and slope. Pro coaster design!', a: [] });
    }
    const heightRange = Math.max(1e-9, an.yMax - Math.min(an.yMin, 0));
    const endsAir = !(Math.abs(an.end.y) <= Math.max(1.5 / s.track.Sy, 0.03 * heightRange) || an.end.y < 0);
    if (endsAir) {
      if (an.pw) tips.push({ i: '🛬', h: '<b>Ends in mid-air</b> at height ' + fmt(an.end.y, 3) + '. The coaster will fly off along a parabola! For a smooth landing, make the last piece end at height 0.', a: [] });
      else tips.push({ i: '🛬', h: '<b>Ends in mid-air</b> at height ' + fmt(an.end.y, 3) + '. The coaster will fly off along a parabola! For a smooth landing, end the track at a zero instead.', a: [['⤓0 Snap ends to zeros', 'snap']] });
    }
    if (an.yMax < 0) tips.push({ i: '🚇', h: '<b>The whole ride is underground</b> (every output is negative). Raise it: add a constant, like <i>f</i>(<i>x</i>) + ' + fmt(FCRemix.niceNum(-an.yMin), 3) + '.', a: [['⬆️ Raise it', 'raise']] });
    if (an.corners.length && !an.pw) {
      const af = an.absForm;
      tips.push({ i: '💥', h: '<b>Sharp corner</b> at <i>x</i> = ' + fmt(an.corners[0].x, 3) + '. Real track must be smooth — the slope can\'t jump.' + (af ? ' Swap |<i>x</i> − ' + fmt(af.h, 3) + '| for √((<i>x</i> − ' + fmt(af.h, 3) + ')² + 0.5): a smooth V (it\'s a hyperbola!).' : ''), a: af ? [['✨ Smooth the V', 'smooth-abs']] : [] });
    }
    const b = s.track.bounds, tallness = (b.maxY - b.minY) / Math.max(1e-9, b.maxX - b.minX);
    if (tallness > 12) tips.push({ i: '😮', h: '<b>Super steep!</b> This track is ' + Math.round(tallness) + '× taller than it is wide — basically a wall. Try a smaller domain, squash it (a·f(<i>x</i>) with a &lt; 1), or stretch it wider.', a: [['↔ Stretch wider', 'safe-stretch-2']] });
    if (s.track.Sx !== 10 && settings.scale === 'auto') tips.push({ i: '📏', h: 'To fit in the park, this track uses <b>1 unit = ' + fmt(s.track.Sx, 3) + ' m</b> (usually it\'s 10 m). Change it in ⚙️ Settings.', a: [] });
    if (an.gaps.some((g) => !g.edge)) tips.push({ i: '🕳️', h: '<b>Broken track!</b> Where the function is undefined or jumps, the rails stop. The coaster will try to <b>jump the gap</b> — will it land?', a: [] });
    if (an.gaps.some((g) => g.edge)) tips.push({ i: '🚫', h: '<b>Part of your domain has no track</b> — the function is undefined there. The ride starts/ends where the outputs are real numbers.', a: [] });
    if (an.turningPoints === 0 && !an.gaps.length && f && f.ratings.excitement < 4) tips.push({ i: '😴', h: '<b>A bit tame.</b> No hills or valleys! Add a wave (<i>f</i>(<i>x</i>) + sin(<i>x</i>)) or use a higher-degree polynomial for more turning points.', a: [['〰️ Add wiggles', 'wiggle']] });
    if (f && f.stats.reachedEnd && f.stats.maxG <= 5 && f.stats.minG >= -1.5 && !f.stats.cornerHits) tips.push({ i: '✅', h: '<b>Safe design!</b> Excitement ' + f.ratings.excitement.toFixed(1) + '. Try the 🧪 Thrill Lab to find something even more exciting that stays safe.', a: [] });
    if (s.an.poly && s.an.poly.quadratic && !/\)\s*\^\s*2/.test(s.fText) && !s.paramNames.length) tips.push({ i: '🎯', h: 'Quadratic! In vertex form it\'s <span class="math">' + vertexHTML(s.an.poly.quadratic) + '</span> — the vertex (' + fmt(s.an.poly.quadratic.h, 3) + ', ' + fmt(s.an.poly.quadratic.k, 3) + ') is right there in the formula.', a: [['✏️ Use vertex form', 'vertex-form']] });
    if (!tips.length) tips.push({ i: '👍', h: 'Looking good! Ride it, then try a transformation below.', a: [] });
    return tips.map((t) => '<div class="tip"><div class="ti">' + t.i + '</div><div class="tt">' + t.h + (t.a.length ? '<div class="ta">' + t.a.map(([l, act]) => '<button class="btn btn-small btn-ghost" data-act="' + act + '">' + l + '</button>').join('') + '</div>' : '') + '</div></div>').join('');
  }
  let safeStretchToken = 0;
  function fillSafeStretchTip() {
    const slot = $('#safeStretchTip');
    if (!slot) return;
    const token = ++safeStretchToken;
    setTimeout(() => {
      if (token !== safeStretchToken || !state.parsed) return;
      const res = FCRemix.safeStretch(baseInfo(), labSettings());
      const slot2 = $('#safeStretchTip');
      if (!slot2) return;
      if (res) {
        state._safeStretch = res;
        slot2.innerHTML = 'Stretching it <b>×' + res.k + ' wider</b> (replace <i>x</i> with <i>x</i>/' + res.k + ') brings it to ' + fmt(res.ev.stats.maxG, 2) + ' G / ' + fmt(res.ev.stats.minG, 2) + ' G with excitement ' + res.ev.ratings.excitement.toFixed(1) + '. Curvature shrinks by ' + res.k + '² = ' + fmt(res.k * res.k, 3) + '×! <div class="ta"><button class="btn btn-small btn-teal" data-act="safe-stretch">↔️ Stretch ×' + res.k + '</button></div>';
      } else slot2.textContent = 'Try squashing it vertically (½·f(x)) and stretching it wider.';
    }, 30);
  }

  // lab results survive re-renders of the Remix tab (they belong to one specific track)
  function labKey() { return state.fText + '|' + state.aText + '|' + state.bText + '|' + JSON.stringify(state.params); }
  function paintLab() {
    const status = $('#labStatus'), out = $('#labOut');
    if (!status || !out) return;
    const L = state._labView;
    if (!L || L.key !== labKey()) { status.textContent = ''; out.innerHTML = ''; return; }
    status.textContent = L.status;
    out.innerHTML = L.html;
  }
  async function runLab() {
    if (state._labBusy) return;
    state._labBusy = true;
    const key = labKey();
    state._labView = { key, status: 'Test-riding mutations…', html: '' };
    paintLab();
    let res;
    try {
      res = await FCRemix.thrillLab(baseInfo(), labSettings(), 12, (p) => { if (state._labView && state._labView.key === key) { state._labView.status = 'Test-riding mutations… ' + Math.round(p * 100) + '%'; paintLab(); } });
    } finally { state._labBusy = false; }
    if (key !== labKey()) return;
    state._lab = res.top;
    const b = res.base;
    const status = b.ok ? 'Your track now: excitement ' + b.ratings.excitement.toFixed(1) + (FCRemix.isSafe(b.stats) ? ' (safe)' : ' (unsafe)') : '';
    const html = res.top.map((c, i) => {
      const st = c.ev.stats, rt = c.ev.ratings;
      let fn; try { fn = FCMath.compile(c.ast, baseInfo().P); } catch (e) { fn = () => NaN; }
      const svg = FCRemix.sparkSVG([{ fn: state.fn, a: state.a, b: state.b, color: 'rgba(255,255,255,0.45)', dash: true, width: 1.5 }, { fn, a: c.a, b: c.b, color: '#a06cf0', width: 2.2 }]);
      const d = b.ok ? rt.excitement - b.ratings.excitement : 0;
      return '<div class="mut" style="margin-bottom:8px"><span class="mh">#' + (i + 1) + ' · ' + esc(c.ops.join(' + ')) + '</span><span class="mr" style="white-space:normal">' + FCMath.toHTML(FCMath.parse(c.f).ast) + '</span>' + svg +
        '<span class="stats-row"><span class="pill ' + (d >= 0 ? 'good' : 'bad') + '">🎉 ' + rt.excitement.toFixed(1) + ' (' + (d >= 0 ? '+' : '') + d.toFixed(1) + ')</span><span class="pill ' + (st.maxG <= 5 ? 'good' : 'bad') + '">max ' + fmt(st.maxG, 1) + ' G</span><span class="pill ' + (st.minG >= -1.5 ? 'good' : 'bad') + '">min ' + fmt(st.minG, 1) + ' G</span><span class="pill ' + (c.safe ? 'good' : 'warn') + '">' + (c.safe ? '🦺 safe' : '⚠ unsafe') + '</span></span>' +
        '<span class="row"><button class="btn btn-small btn-purple" data-lab="' + i + '">Build it</button></span></div>';
    }).join('') || '<div class="note">No luck this time — run it again!</div>';
    state._labView = { key, status, html };
    paintLab();
  }

  // ---------------------------------------------------------------- Pieces tab (piecewise editor)
  const OPS = { '<=': '≤', '<': '&lt;' };
  function rowsFromAST(ast) {
    return ast.pieces.map((p) => ({
      f: p.src || FCMath.toText(p.ast),
      lo: p.lo ? FCMath.toText(p.lo.ast) : '',
      loOp: p.lo && !p.lo.incl ? '<' : '<=',
      hiOp: p.hi && p.hi.incl ? '<=' : '<',
      hi: p.hi ? FCMath.toText(p.hi.ast) : '',
    }));
  }
  function rowsToText(rows) {
    return '{' + rows.map((r) => {
      const lo = String(r.lo).trim(), hi = String(r.hi).trim();
      let cond = '';
      if (lo && hi) cond = lo + ' ' + r.loOp + ' x ' + r.hiOp + ' ' + hi;
      else if (lo) cond = 'x ' + (r.loOp === '<=' ? '>=' : '>') + ' ' + lo;
      else if (hi) cond = 'x ' + r.hiOp + ' ' + hi;
      return String(r.f).trim() + (cond ? ' if ' + cond : '');
    }).join('; ') + '}';
  }
  function showTab(name, scroll) {
    $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    $$('.tab-panel').forEach((p) => p.classList.toggle('on', p.id === 'tab-' + name));
    if (name === 'pieces') renderPieces();
    if (name === 'remix' && remixDirty) renderRemix();
    if (name === 'garage') renderGarage();
    if (name === 'missions') renderMissions();
    if (scroll && innerWidth <= 980) $('.sidebar').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  /** Called by build(): keep the editor rows in step with the function that was built. */
  function syncPieces(ast, chk, fromEditor) {
    if (!fromEditor) state.pieces = rowsFromAST(ast);
    if ($('#tab-pieces').classList.contains('on')) { if (fromEditor) renderPiecesStatus(chk, ast); else renderPieces(); }
  }
  function opSelect(field, val) {
    return '<select class="pw-op" data-field="' + field + '" aria-label="' + (field === 'loOp' ? 'start: included or not' : 'end: included or not') + '">' +
      Object.keys(OPS).map((o) => '<option value="' + o + '"' + (o === val ? ' selected' : '') + '>' + OPS[o] + '</option>').join('') + '</select>';
  }
  function renderPieces() {
    const host = $('#tab-pieces');
    const rows = state.pieces || [];
    let h = '<div class="card"><h3>🧩 Piecewise coaster ' + what('piecewise') + '</h3><div class="pw-big" id="pwBig"></div>' +
      '<p class="note">Each piece is one section of track, with its own formula and its own x-values. Neighbors should meet at the same height (<b>connected</b>) and the same slope (<b>smooth</b>). ' + what('smoothjoint') + '</p></div>';
    h += '<div class="pw-errors" id="pwErrors"></div><div class="pw-list" id="pwList">';
    rows.forEach((r, k) => {
      h += '<div class="pw-row" data-k="' + k + '" style="--pc:' + FC.pieceColor(k) + '">' +
        '<div class="pw-top"><span class="pw-num">' + (k + 1) + '</span><span class="pw-fx">f(<i>x</i>) =</span>' +
        '<input class="pw-f" data-field="f" value="' + esc(r.f) + '" spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="Piece ' + (k + 1) + ' formula">' +
        '<button class="pw-del" data-pwdel="' + k + '" title="Remove this piece" aria-label="Remove piece ' + (k + 1) + '">🗑</button></div>' +
        '<div class="pw-bot"><span>for</span><input class="pw-lim" data-field="lo" value="' + esc(r.lo) + '" spellcheck="false" aria-label="Piece ' + (k + 1) + ' starts at">' +
        opSelect('loOp', r.loOp) + '<i>x</i>' + opSelect('hiOp', r.hiOp) +
        '<input class="pw-lim" data-field="hi" value="' + esc(r.hi) + '" spellcheck="false" aria-label="Piece ' + (k + 1) + ' ends at">' +
        what('endpoints') + '<span class="pw-msg" id="pwMsg' + k + '"></span></div></div>' +
        '<div class="pw-joint" id="pwJoint' + k + '" hidden></div>';
    });
    h += '</div><div class="row"><button class="btn btn-small btn-ghost" data-act="pw-add">＋ Add a piece</button><button class="btn btn-small btn-build" data-act="pw-build">🔨 Build track</button></div>';
    h += '<div class="card" style="margin-top:12px"><h3>🔍 Evaluate ' + what('evaluatepw') + '</h3><div class="pw-eval">f( <input id="pwEvalX" value="' + esc(state.pwEvalX || '') + '" placeholder="x" spellcheck="false" aria-label="x value to evaluate"> ) = ?</div><div class="pw-eval-out" id="pwEvalOut"></div></div>';
    h += '<div class="card"><h3>📚 Piecewise examples</h3><div class="preset-list">' + pwPresetList() + '</div></div>';
    host.innerHTML = h;
    liveCheck();
    evalPW();
  }
  function pwPresetList() {
    return FCContent.PW_PRESETS.map((p, i) => {
      let svg = '', html = esc(p.f);
      try {
        const r = FCMath.parse(p.f);
        const fn = FCMath.compile(r.ast, p.params || {});
        const info = FCMath.compilePW(r.ast, p.params || {});
        const a = Math.min(...info.pieces.map((q) => q.lo)), b = Math.max(...info.pieces.map((q) => q.hi));
        svg = FCRemix.sparkSVG([{ fn, a, b, color: '#ffd166', width: 2 }], 70, 40);
        html = FCMath.toHTML(r.ast);
      } catch (e) { /* show the text */ }
      return '<button class="preset" data-pwpreset="' + i + '">' + svg + '<span><div class="pn">🧩 ' + esc(p.name) + '</div><div class="pf">' + html + '</div><div class="pt">' + p.tags.map((t) => '<span class="pill">' + esc(t) + '</span>').join('') + '</div></span></button>';
    }).join('');
  }
  let liveTimer = null;
  function scheduleLive() { clearTimeout(liveTimer); liveTimer = setTimeout(() => { liveCheck(); evalPW(); }, 160); }
  /** Re-read the rows, update the main input, and check every joint (without building). */
  function liveCheck() {
    const rows = state.pieces || [];
    const text = rowsToText(rows);
    el.fnInput.value = text;
    App.renderPreview();
    rows.forEach((r, k) => { const m = $('#pwMsg' + k); if (m) m.textContent = ''; const row = $('.pw-row[data-k="' + k + '"]'); if (row) row.classList.remove('err'); const j = $('#pwJoint' + k); if (j) j.hidden = true; });
    const errBox = $('#pwErrors');
    if (errBox) errBox.innerHTML = '';
    const r = FCMath.parse(text);
    const big = $('#pwBig');
    if (!r.ok) {
      if (r.piece !== undefined && $('#pwMsg' + r.piece)) {
        $('#pwMsg' + r.piece).textContent = '⚠️ ' + r.error.replace(/^Piece \d+: /, '');
        $('.pw-row[data-k="' + r.piece + '"]').classList.add('err');
      } else if (errBox) errBox.innerHTML = '<div class="callout bad">⚠️ ' + esc(r.error) + '</div>';
      return null;
    }
    const P = Object.assign({}, state.params);
    r.params.forEach((n) => { if (P[n] === undefined) P[n] = 1; });
    const chk = FCAnalysis.pwCheck(r.ast, P);
    if (big) big.innerHTML = 'f(<i>x</i>) = ' + FCMath.toHTML(r.ast, { stacked: true });
    renderPiecesStatus(chk, r.ast, P);
    return chk;
  }
  function renderPiecesStatus(chk, ast, P) {
    P = P || state.params;
    const errBox = $('#pwErrors');
    if (!errBox) return;
    errBox.innerHTML = chk.errors.map((e) => {
      let fix = '';
      if (e.kind === 'overlap') fix = '<button data-pwfix="trim" data-a="' + e.pieces[0] + '" data-b="' + e.pieces[1] + '">✂️ End piece ' + (e.pieces[0] + 1) + ' where piece ' + (e.pieces[1] + 1) + ' starts</button>';
      if (e.kind === 'double') fix = '<button data-pwfix="open" data-a="' + e.pieces[0] + '">Make piece ' + (e.pieces[0] + 1) + ' end with &lt;</button>';
      if (e.kind === 'empty') fix = '<button data-pwfix="swap" data-a="' + e.pieces[0] + '">↔ Swap its start and end</button>';
      e.pieces.forEach((k) => { const row = $('.pw-row[data-k="' + k + '"]'); if (row) row.classList.add('err'); });
      return '<div class="callout bad"><span>✋ ' + esc(e.msg) + (fix ? '<div class="pw-joint" style="border:0;margin:6px 0 0;padding:0"><div class="ja">' + fix + '</div></div>' : '') + '</span></div>';
    }).join('');
    for (const j of chk.joints) {
      const box = $('#pwJoint' + j.left);
      if (!box) continue;
      box.hidden = false;
      box.className = 'pw-joint ' + j.kind;
      box.innerHTML = jointEditorHTML(j, ast, P);
    }
  }
  function jointEditorHTML(j, ast, P) {
    const x = fmt(j.x, 4), tagL = App.pieceTag(j.left), tagR = App.pieceTag(j.right);
    if (j.kind === 'gap') {
      return '<span class="jt">↔ Gap: no piece covers ' + fmt(j.x0, 4) + ' &lt; <i>x</i> &lt; ' + fmt(j.x1, 4) + '</span><span>The train will have to fly across from ' + tagL + ' to ' + tagR + '!</span>' +
        '<div class="ja"><button data-pwfix="extend" data-a="' + j.left + '" data-b="' + j.right + '">Stretch ' + (j.left + 1) + ' to x = ' + fmt(j.x1, 4) + '</button></div>';
    }
    if (j.kind === 'undefined') return '<span class="jt">✗ A piece is undefined at x = ' + x + '</span><span>Check its formula there (square roots of negatives, dividing by zero…).</span>';
    if (j.kind === 'smooth') {
      return '<span class="jt">✓ Smooth joint at x = ' + x + '</span><span>' + tagL + ' ends and ' + tagR + ' starts at height <b>' + fmt(j.L, 4) + '</b>, both with slope <b>' + fmt(j.sL, 3) + '</b>.' +
        (j.exact ? '' : ' (They differ by ' + fmt(Math.abs(j.dy), 3) + ' — close enough for the track.)') +
        (j.hole ? ' But neither piece includes x = ' + x + ' (both use &lt;), so f(' + x + ') is undefined — a hole!' : '') + '</span>';
    }
    if (j.kind === 'corner') {
      return '<span class="jt">⚠ Connected at x = ' + x + ' — but it\'s a corner</span><span>Same height <b>' + fmt(j.L, 4) + '</b> ✓, but the slope jumps from <b>' + fmt(j.sL, 3) + '</b> to <b>' + fmt(j.sR, 3) + '</b>. Riders feel a jolt! For a smooth joint the slopes must match.</span>';
    }
    // jump
    const dy = j.L - j.R;
    let acts = '<button data-pwfix="shift" data-a="' + j.right + '" data-dy="' + dy + '">' + (dy > 0 ? '⬆ Move ' : '⬇ Move ') + (j.right + 1) + (dy > 0 ? ' up ' : ' down ') + fmt(Math.abs(dy), 4) + '</button>';
    const meet = crossingNear(ast, P, j);
    if (meet !== null) acts += '<button data-pwfix="meet" data-a="' + j.left + '" data-b="' + j.right + '" data-x="' + meet + '">↔ Move the joint to x ≈ ' + fmt(meet, 4) + ' (where they cross)</button>';
    const solve = solveForParam(ast, P, j);
    let solveHTML = '';
    if (solve) {
      const sub = (k) => FCMath.toHTML(FCMath.substitute(ast.pieces[k].ast, FCMath.N.num(j.x)));
      solveHTML = '<span>🔑 To connect, both formulas must give the same height at x = ' + x + ':</span><span class="eq">' + sub(j.left) + ' = ' + sub(j.right) + '</span>';
      acts += '<button data-pwfix="solve" data-p="' + solve.name + '" data-v="' + solve.value + '">Show me ' + solve.name + '</button>';
    }
    return '<span class="jt">✗ Jump at x = ' + x + '</span><span>' + tagL + ' ends at height <b>' + fmt(j.L, 4) + '</b>, but ' + tagR + ' starts at <b>' + fmt(j.R, 4) + '</b> — off by ' + fmt(Math.abs(j.dy), 4) + '. The train will ' + (j.R < j.L ? 'fly off and drop down' : 'slam into a wall') + '!</span>' + solveHTML + '<div class="ja">' + acts + '</div>';
  }
  /** Where do the two neighboring formulas cross near the joint? (Moving the joint there connects them.) */
  function crossingNear(ast, P, j) {
    try {
      const fa = FCMath.compile(ast.pieces[j.left].ast, P), fb = FCMath.compile(ast.pieces[j.right].ast, P);
      const g = (x) => fa(x) - fb(x);
      const info = FCMath.compilePW(ast, P);
      const A = info.pieces[j.left], B = info.pieces[j.right];
      const lo = isFinite(A.lo) ? A.lo : j.x - 10, hi = isFinite(B.hi) ? B.hi : j.x + 10;
      let best = null;
      const n = 400;
      let px = lo, pg = g(lo);
      for (let i = 1; i <= n; i++) {
        const x = lo + ((hi - lo) * i) / n, gx = g(x);
        if (isFinite(pg) && isFinite(gx) && pg * gx <= 0) {
          const root = pg === 0 ? px : FC.brent(g, px, x);
          if (isFinite(root) && root > lo && root < hi && (best === null || Math.abs(root - j.x) < Math.abs(best - j.x))) best = root;
        }
        px = x; pg = gx;
      }
      if (best === null || Math.abs(best - j.x) < 1e-6) return null;
      return Number(best.toPrecision(6));
    } catch (e) { return null; }
  }
  /** If one letter (like k) appears in the two pieces, find the value that makes them meet. */
  function solveForParam(ast, P, j) {
    const names = Array.from(new Set(FCMath.collectParams(ast.pieces[j.left].ast).concat(FCMath.collectParams(ast.pieces[j.right].ast))));
    if (names.length !== 1) return null;
    const name = names[0];
    const Q = Object.assign({}, P);
    const fa = FCMath.compile(ast.pieces[j.left].ast, Q), fb = FCMath.compile(ast.pieces[j.right].ast, Q);
    const g = (v) => { Q[name] = v; return fa(j.x) - fb(j.x); };
    let best = null, pv = -50, pg = g(-50);
    for (let i = 1; i <= 2000; i++) {
      const v = -50 + i * 0.05, gv = g(v);
      if (isFinite(pg) && isFinite(gv) && pg * gv <= 0) {
        const root = pg === 0 ? pv : FC.brent(g, pv, v);
        if (isFinite(root) && (best === null || Math.abs(root - P[name]) < Math.abs(best - P[name]))) best = root;
      }
      pv = v; pg = gv;
    }
    if (best === null) return null;
    return { name, value: Number(best.toPrecision(8)) };
  }
  function evalPW() {
    const out = $('#pwEvalOut'), inp = $('#pwEvalX');
    if (!out || !inp) return;
    const txt = inp.value.trim();
    state.pwEvalX = txt;
    if (!txt) { out.innerHTML = '<span class="note">Type an x value. You\'ll see which piece it uses and the height there.</span>'; return; }
    const r = FCMath.parse(el.fnInput.value);
    if (!r.ok || r.ast.type !== 'piecewise') { out.textContent = ''; return; }
    const P = Object.assign({}, state.params);
    r.params.forEach((n) => { if (P[n] === undefined) P[n] = 1; });
    const xv = FCMath.evalConstExpr(txt, P);
    if (!xv.ok) { out.textContent = '⚠️ ' + xv.error; return; }
    const x = xv.value;
    const info = FCMath.compilePW(r.ast, P);
    const p = info.pieceAt(x);
    if (!p) {
      const touching = info.pieces.filter((q) => q.lo === x || q.hi === x);
      let why = 'no piece\'s condition includes it';
      if (touching.length >= 2) why = 'it\'s exactly where two pieces meet, but both use &lt; there (open dots ○) — a hole';
      else if (x < Math.min(...info.pieces.map((q) => q.lo)) || x > Math.max(...info.pieces.map((q) => q.hi))) why = 'it\'s outside the track\'s domain';
      out.innerHTML = 'No piece covers <i>x</i> = ' + fmt(x, 4) + ', so <b><i>f</i>(' + fmt(x, 4) + ') is undefined</b> — ' + why + '.';
      return;
    }
    const pa = r.ast.pieces[p.k];
    const y = p.f(x);
    const other = info.pieces.find((q) => q !== p && (q.lo === x || q.hi === x));
    let note = '';
    if (other) note = '<br><span class="note">x = ' + fmt(x, 4) + ' is also an endpoint of piece ' + (other.k + 1) + ', but that piece uses &lt; there (open dot ○), so it doesn\'t count.</span>';
    const step = FCMath.containsVar(pa.ast) ? FCMath.toHTML(FCMath.substitute(pa.ast, FCMath.N.num(x))) + ' = ' : '';
    out.innerHTML = '<i>x</i> = ' + fmt(x, 4) + ' fits piece ' + App.pieceTag(p.k) + ' (' + FCMath.pwCondHTML(pa) + ')<br><span class="math"><i>f</i>(' + fmt(x, 4) + ') = ' + step + '<b>' + fmt(y, 4) + '</b></span>' + note;
    if (state.graph && isFinite(y) && state.an && x >= state.an.a && x <= state.an.b) { state.graph.pulse = { x, y, t0: performance.now() }; state.graph.dirty = true; }
  }
  /** Build from the editor rows (sorted left to right). */
  function buildFromPieces() {
    const rows = state.pieces || [];
    const key = (r) => { const v = FCMath.evalConstExpr(r.lo, state.params); return v.ok ? v.value : -Infinity; };
    const sorted = rows.map((r, i) => ({ r, i, k: key(r) })).sort((p, q) => p.k - q.k || p.i - q.i).map((o) => o.r);
    const moved = sorted.some((r, i) => r !== rows[i]);
    state.pieces = sorted;
    el.fnInput.value = rowsToText(sorted);
    if (moved) { renderPieces(); App.toast('↕️ I put the pieces in order from left to right.'); }
    const ok = App.build({ fromEditor: true });
    if (ok) renderPieces();
    return ok;
  }
  function addPiece() {
    const rows = state.pieces || (state.pieces = []);
    const last = rows[rows.length - 1];
    if (!last) { rows.push({ f: 'x', lo: '0', loOp: '<=', hiOp: '<=', hi: '4' }); renderPieces(); return; }
    const P = Object.assign({}, state.params);
    const hiV = FCMath.evalConstExpr(last.hi, P), loV = FCMath.evalConstExpr(last.lo, P);
    const width = hiV.ok && loV.ok ? Math.max(1, hiV.value - loV.value) : 4;
    let endY = 0;
    const r = FCMath.parseSingle(last.f);
    if (r.ok && hiV.ok) { const y = FCMath.compile(r.ast, P)(hiV.value); if (isFinite(y)) endY = Number(y.toPrecision(5)); }
    last.hiOp = '<';
    const start = hiV.ok ? FC.numText(hiV.value, 6) : last.hi;
    const end = hiV.ok ? FC.numText(hiV.value + width, 6) : '';
    rows.push({ f: FC.numText(endY, 5), lo: start, loOp: '<=', hiOp: '<=', hi: end });
    renderPieces();
    const inputs = $$('#pwList .pw-f');
    if (inputs.length) { const f = inputs[inputs.length - 1]; f.focus(); f.select(); }
    App.toast('＋ New piece ' + rows.length + ' starts where the last one ends, at the same height (' + fmt(endY, 4) + ') — so it connects. Now give it a formula!', '', 5500);
  }
  function applyFix(btn) {
    const d = btn.dataset, rows = state.pieces;
    const A = rows[+d.a], B = d.b !== undefined ? rows[+d.b] : null;
    switch (d.pwfix) {
      case 'shift': {
        const r = FCMath.parseSingle(A.f);
        if (!r.ok) return;
        A.f = FCMath.toText(FCMath.simplify(FCMath.N.add(r.ast, FCMath.N.num(Number((+d.dy).toPrecision(10))))));
        App.state.meta.pendingMutation = true;
        break;
      }
      case 'meet': A.hi = B.lo = FC.numText(+d.x, 6); break;
      case 'extend': A.hi = B.lo; A.hiOp = '<'; B.loOp = '<='; break;
      case 'trim': A.hi = B.lo; A.hiOp = '<'; break;
      case 'open': A.hiOp = '<'; break;
      case 'swap': { const t = A.lo; A.lo = A.hi; A.hi = t; break; }
      case 'solve': {
        if (!confirm('Try to solve it yourself first! Show the answer anyway?')) return;
        App.state.params[d.p] = +d.v;
        App.renderParamBar();
        App.toast('🔑 ' + d.p + ' = ' + fmt(+d.v, 6) + ' makes the pieces meet. Check it: plug it into both formulas at the joint!', '', 6500);
        App.state.meta.usedSlider = true;
        break;
      }
    }
    buildFromPieces();
  }
  function bindPieces() {
    const host = $('#tab-pieces');
    host.addEventListener('input', (e) => {
      const t = e.target;
      if (t.id === 'pwEvalX') { evalPW(); return; }
      const row = t.closest('.pw-row');
      if (!row || !t.dataset.field) return;
      state.pieces[+row.dataset.k][t.dataset.field] = t.value;
      scheduleLive();
    });
    host.addEventListener('change', (e) => {
      const t = e.target, row = t.closest('.pw-row');
      if (row && t.tagName === 'SELECT') { state.pieces[+row.dataset.k][t.dataset.field] = t.value; liveCheck(); }
    });
    host.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.closest('.pw-row')) { e.preventDefault(); buildFromPieces(); }
    });
    host.addEventListener('focusin', (e) => { if (e.target.classList.contains('pw-f')) state.lastPieceInput = e.target; });
    host.addEventListener('click', (e) => {
      const del = e.target.closest('[data-pwdel]');
      if (del) {
        if (state.pieces.length <= 1) { App.toast('A piecewise track needs at least one piece. Switch to ƒ One function to use a single formula.'); return; }
        state.pieces.splice(+del.dataset.pwdel, 1);
        renderPieces();
        return;
      }
      const fix = e.target.closest('[data-pwfix]');
      if (fix) { applyFix(fix); return; }
      const act = e.target.closest('[data-act]');
      if (act && act.dataset.act === 'pw-add') addPiece();
      if (act && act.dataset.act === 'pw-build') buildFromPieces();
    });
  }

  // ---------------------------------------------------------------- piecewise Blueprint card
  function pwBlueprintCard() {
    const an = state.an, info = an.pw, ast = state.parsed.ast;
    const ys = Math.max(1, an.yMax - an.yMin);
    let h = '<div class="card"><h3>🧩 Pieces & joints ' + what('piecewise') + '</h3><div class="piece-list">';
    info.sorted.forEach((p) => {
      const fam = an.family.pieceFamilies[p.k] || { label: '' };
      const lo = isFinite(p.lo) ? Math.max(p.lo, an.a) : an.a, hi = isFinite(p.hi) ? Math.min(p.hi, an.b) : an.b;
      h += '<div class="piece-item">' + App.pieceTag(p.k) + '<span><span class="math">' + FCMath.toHTML(p.ast) + '</span> for ' + FCMath.pwCondHTML(ast.pieces[p.k]) +
        '<br>' + esc(fam.label) + ' · from (' + fmt(lo, 3) + ', ' + FC.fmtZ(p.f(lo), ys, 3) + ') to (' + fmt(hi, 3) + ', ' + FC.fmtZ(p.f(hi), ys, 3) + ')</span></div>';
    });
    h += '</div><h4>Joints ' + what('continuity') + '</h4><div class="joint-list">';
    for (const j of an.joints) h += '<div class="joint-item">' + jointBlueprintHTML(j) + '</div>';
    if (!an.joints.length) h += '<div class="note">Just one piece so far — add more in the 🧩 Pieces tab.</div>';
    h += '</div>';
    const n = (k) => an.joints.filter((j) => j.kind === k).length;
    if (an.joints.length && n('smooth') === an.joints.length) h += '<div class="callout good">🧈 <span>Every joint is <b>connected and smooth</b> — that\'s exactly how real coaster track is designed.</span></div>';
    else if (an.joints.length) h += '<div class="callout info">🔧 <span>' + [n('jump') && n('jump') + ' jump' + (n('jump') > 1 ? 's' : ''), n('gap') && n('gap') + ' gap' + (n('gap') > 1 ? 's' : ''), n('corner') && n('corner') + ' corner' + (n('corner') > 1 ? 's' : '')].filter(Boolean).join(', ') + '. Fix them in the 🧩 Pieces tab — or ride it and see what happens!</span></div>';
    return h + '</div>';
  }
  function jointBlueprintHTML(j) {
    const x = fmt(j.x, 4);
    if (j.kind === 'gap') return '<b>Gap</b> for ' + fmt(j.x0, 4) + ' &lt; <i>x</i> &lt; ' + fmt(j.x1, 4) + ': no piece covers these x-values, so <i>f</i> is undefined there. <span class="warn">The train must fly across.</span>';
    if (j.kind === 'undefined') return '<b>At x = ' + x + '</b>: a piece is undefined here. <span class="bad">✗</span>';
    let h = '<b>At x = ' + x + '</b> (' + App.pieceTag(j.left) + ' → ' + App.pieceTag(j.right) + '): from the left the track reaches <b>' + fmt(j.L, 4) + '</b>; from the right it starts at <b>' + fmt(j.R, 4) + '</b>. ';
    if (j.kind === 'jump') h += '<span class="bad">✗ Not continuous: a jump of ' + fmt(Math.abs(j.dy), 4) + '.</span>';
    else h += '<span class="ok">✓ Continuous.</span> Slopes: ' + fmt(j.sL, 3) + ' (left), ' + fmt(j.sR, 3) + ' (right) → ' + (j.kind === 'smooth' ? '<span class="ok">✓ smooth</span>' : '<span class="warn">⚠ corner</span>') + '.';
    if (j.hole) h += ' <span class="warn">Neither piece includes x = ' + x + ' (open dots ○), so f(' + x + ') is undefined — a hole.</span>';
    else h += ' <i>f</i>(' + x + ') = ' + fmt(j.rightIncl ? j.R : j.L, 4) + ' (piece ' + ((j.rightIncl ? j.right : j.left) + 1) + ' includes it ●).';
    return h;
  }

  // ---------------------------------------------------------------- Missions
  function renderMissions() {
    const host = $('#tab-missions');
    const prog = FCStore.progress.get();
    const done = Object.keys(prog.missions).length, total = FCContent.MISSIONS.length;
    let h = '<div class="card"><h3>🏅 Badges <span class="grow"></span><span class="note">' + done + ' / ' + total + '</span></h3><div class="progress"><div style="width:' + (done / total) * 100 + '%"></div></div><p class="note">Each badge is a math idea. Badges unlock automatically when you build or ride a track that shows it.</p></div>';
    // match
    h += '<div class="card"><h3>🧩 Match the Track</h3><p class="note">A ghost track appears — write a function whose graph matches it. Look for the vertex, zeros and y-intercept!</p>';
    FCContent.MATCHES.forEach((m, i) => {
      const stars = prog.match[m.id] || 0;
      h += '<button class="match-level" data-match="' + i + '"><span><div class="ml-n">' + (i + 1) + '. ' + esc(m.name) + '</div><div class="ml-c">' + esc(m.concept) + '</div></span><span class="stars">' + '★'.repeat(stars) + '<span style="opacity:.25">' + '★'.repeat(3 - stars) + '</span></span></button>';
    });
    h += '</div>';
    // missions
    h += '<div class="card"><h3>🎯 Missions</h3>';
    FCContent.MISSIONS.forEach((m) => {
      const ok = !!prog.missions[m.id];
      h += '<div class="mission' + (ok ? ' done' : '') + '"><div class="mi">' + m.icon + '</div><div><div class="mc">' + esc(m.concept) + '</div><div class="mt">' + esc(m.title) + (ok ? ' ✓' : '') + '</div><div class="mdsc">' + esc(m.desc) + '</div><details><summary>Hint</summary>' + esc(m.hint) + '</details></div></div>';
    });
    h += '</div>';
    const p = prog.predictions;
    if (p.tries) h += '<div class="card"><h3>🔮 Predictions</h3><div class="kv"><span class="k">Tries</span><span class="v">' + p.tries + '</span><span class="k">Spot on (within 5%)</span><span class="v">' + p.great + '</span><span class="k">Best streak</span><span class="v">' + p.best + '</span></div></div>';
    host.innerHTML = h;
    App.updateMissionBadge();
  }

  // ---------------------------------------------------------------- Garage
  let garageFilter = '';
  function renderGarage() {
    const host = $('#tab-garage');
    if (!host.classList.contains('on')) { host.dataset.dirty = '1'; return; }
    host.dataset.dirty = '';
    const list = FCStore.history.all();
    const withStats = list.filter((t) => t.stats);
    const best = (key, fmtv, label, icon, dir = 1) => {
      let b = null;
      for (const t of withStats) { const v = t.stats[key]; if (v === undefined || v === null || !isFinite(v) || v <= 0) continue; if (!b || dir * v > dir * b.stats[key]) b = t; }
      return b ? '<button class="hof-item" data-load="' + b.id + '"><div class="hl">' + icon + ' ' + label + '</div><div class="hv">' + fmtv(b.stats[key]) + '</div><div class="hn">' + esc(b.name || b.f) + '</div></button>' : '';
    };
    let h = '';
    if (withStats.length) {
      h += '<div class="card"><h3>🏆 Hall of Fame</h3><div class="hof">';
      h += best('topSpeed', (v) => App.speedParts(v).big + ' ' + App.speedParts(v).unit, 'Fastest', '⚡');
      h += best('excitement', (v) => v.toFixed(1), 'Most exciting', '🎉');
      h += best('maxDrop', (v) => fmt(v, 3) + ' m', 'Biggest drop', '⬇️');
      h += best('floatTime', (v) => v.toFixed(1) + ' s', 'Most floating', '🪂');
      h += best('flightDist', (v) => fmt(v, 3) + ' units', 'Longest jump', '🚀');
      h += best('turningPoints', (v) => String(v), 'Most turning points', '🔄');
      h += '</div></div>';
    }
    h += '<div class="card"><h3>🗂️ Your tracks <span class="grow"></span><span class="note">' + list.length + '</span></h3>';
    h += '<input class="search" id="garageSearch" placeholder="Search by name or function…" value="' + esc(garageFilter) + '">';
    const q = garageFilter.toLowerCase();
    const shown = list.filter((t) => !q || (t.name || '').toLowerCase().includes(q) || t.f.toLowerCase().includes(q));
    if (!shown.length) h += '<div class="empty">' + (list.length ? 'No matches.' : 'Tracks you build are saved here automatically.') + '</div>';
    shown.slice(0, 80).forEach((t) => {
      let fhtml = esc(t.f);
      try { const r = FCMath.parse(t.f); if (r.ok) fhtml = FCMath.toHTML(r.ast); } catch (e) { /* keep text */ }
      const st = t.stats;
      const pills = st ? '<span class="pill">🎉 ' + st.excitement.toFixed(1) + '</span><span class="pill">' + App.speedParts(st.topSpeed).big + ' ' + App.speedParts(st.topSpeed).unit + '</span><span class="pill ' + (st.safe ? 'good' : 'bad') + '">' + (st.safe ? '🦺 safe' : '⚠ intense') + '</span>' : '<span class="pill">not ridden yet</span>';
      h += '<div class="hist' + (t.id === state.entryId ? ' current' : '') + '"><span data-load="' + t.id + '">' + FCRemix.thumbSVG(t.thumb || []) + '</span><div style="min-width:0"><div class="hn" data-load="' + t.id + '">' + (t.favorite ? '⭐ ' : '') + esc(t.name || 'Untitled') + '</div><div class="hf">f(<i>x</i>) = ' + fhtml + ' on [' + esc(t.a) + ', ' + esc(t.b) + ']</div><div class="hs">' + pills + '</div></div><div class="hb"><button class="' + (t.favorite ? 'fav' : '') + '" data-fav="' + t.id + '" title="Favorite">★</button><button data-code="' + t.id + '" title="Copy share code">🔗</button><button data-del="' + t.id + '" title="Delete">🗑</button></div></div>';
    });
    h += '</div>';
    h += '<div class="card"><h3>📤 Share & save</h3><p class="note">Tracks live in this browser. Share one track with a link or code, or export them all as a file (great for turning in work).</p><div class="row">';
    h += '<button class="btn btn-small btn-ghost" data-act="code-current">🔗 Share this track</button><button class="btn btn-small btn-ghost" data-act="load-code">📋 Load a code</button>';
    h += '<button class="btn btn-small btn-ghost" data-act="export">⬇️ Export all</button><button class="btn btn-small btn-ghost" data-act="import">⬆️ Import</button><button class="btn btn-small btn-ghost" data-act="clear-history">🧹 Clear (keeps ⭐)</button>';
    h += '</div><input type="file" id="importFile" accept=".json,application/json" hidden></div>';
    host.innerHTML = h;
    const search = $('#garageSearch');
    search.addEventListener('input', () => { garageFilter = search.value; const pos = search.selectionStart; renderGarage(); const s2 = $('#garageSearch'); s2.focus(); s2.setSelectionRange(pos, pos); });
    $('#importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      file.text().then((txt) => {
        try {
          const data = JSON.parse(txt);
          const n = FCStore.history.import(Array.isArray(data) ? data : data.tracks);
          App.toast('⬆️ Imported ' + n + ' new track' + (n === 1 ? '' : 's') + '.');
          renderGarage();
        } catch (err) { App.toast('⚠️ That file isn\'t a Function Coaster export.', 'err'); }
      });
    });
  }

  // ---------------------------------------------------------------- modals
  function openModal(html, cls = '') {
    const m = el.modal;
    $('.modal-body', m).innerHTML = html;
    $('.modal-card', m).className = 'modal-card ' + cls;
    m.hidden = false;
    $('.modal-card', m).scrollTop = 0;
    const f = $('.modal-body input, .modal-body textarea', m);
    setTimeout(() => (f || $('.modal-x', m)).focus({ preventScroll: true }), 30);
  }
  function closeModal() {
    el.modal.hidden = true;
    if (el.modal.dataset.welcome) { settings.welcomed = true; App.saveSettings(); el.modal.dataset.welcome = ''; }
    App.flushToasts();
  }
  function glossaryHTML(only) {
    const G = FCContent.GLOSSARY;
    const keys = only ? [only] : Object.keys(G);
    return '<dl class="gloss">' + keys.map((k) => '<dt>' + esc(G[k][0]) + '</dt><dd>' + esc(G[k][1]) + '</dd>').join('') + '</dl>';
  }
  function showGloss(key) {
    const G = FCContent.GLOSSARY[key];
    if (!G) return;
    openModal('<h2>' + esc(G[0]) + '</h2><p>' + esc(G[1]) + '</p><div class="modal-actions"><button class="btn btn-small btn-ghost" data-act="help-gloss">📖 All math words</button></div>');
  }
  function syntaxHTML() {
    const rows = [['piecewise (or use 🧩 Pieces)', '{2x if 0 <= x < 3; 6 if 3 <= x <= 5}'], ['x squared', 'x^2  or  x²'], ['times', '2x   3(x+1)   (x-1)(x+2)'], ['divide', '1/(x+2)'], ['square root', 'sqrt(x)  or  √x'], ['absolute value', '|x - 3|  or  abs(x-3)'], ['π and e', 'pi   e^x   2^x'], ['trig (radians)', 'sin(x)   cos(2x)   tan(x)'], ['logs', 'ln(x)   log(x)   log_2(x)'], ['rounding', 'floor(x)   ceil(x)   round(x)'], ['sliders!', 'a(x - h)^2 + k   a sin(b x)']];
    return '<div class="syntax">' + rows.map((r) => '<div><span>' + esc(r[0]) + '</span><code>' + esc(r[1]) + '</code></div>').join('') + '</div>';
  }
  function showHelp(section) {
    let h = '<h2>🎢 How to play</h2>';
    h += '<div class="steps"><div class="step"><div class="n">1</div><b>Type a function</b><p>Like <code>-2x^4 + 7x^3 - 4x^2 - 0.5x + 1</code>. The line under the box shows how it was read.</p></div><div class="step"><div class="n">2</div><b>Pick the domain</b><p>“from x = … to …” is where the track starts and ends. Ends on zeros = smooth landings.</p></div><div class="step"><div class="n">3</div><b>Build & ride!</b><p>Press 🔨 Build, then ▶ Ride. Study the 📐 Blueprint, remix it 🧬, and earn badges 🏅.</p></div></div>';
    h += '<h3>⌨️ Typing functions</h3>' + syntaxHTML();
    h += '<p>Keys: <code>Space</code> ride / pause · <code>R</code> reset · <code>1</code>–<code>4</code> cameras · <code>M</code> sound · <code>F</code> full screen. In the 3D view, drag to look around and scroll to zoom. In the graph, drag to pan, scroll to zoom, double-click to reset.</p>';
    h += '<h3>🧩 Piecewise coasters</h3><p>Switch the top-left toggle from <b>ƒ One function</b> to <b>🧩 Pieces</b>. Each piece gets its own formula and its own x-values, like <code>2x</code> for <code>0 ≤ x &lt; 3</code>. The <b>🧩 Pieces</b> tab checks every joint as you type: <b>✓ smooth</b> (same height and same slope), <b>⚠ corner</b> (connected, but the slope jumps — riders feel a jolt), <b>✗ jump</b> (the train flies… or crashes into a wall), or a <b>gap</b>. Overlapping pieces are refused: they would give one x two heights, which fails the vertical line test. The graph uses closed dots ● for included endpoints (≤) and open dots ○ for excluded ones (&lt;). Use a letter like <code>k</code> in a piece to get a slider, then find the k that connects the pieces.</p>';
    h += '<h3>🎢 The physics (really!)</h3><p>The train rolls under real gravity (9.81 m/s²) with a little friction. Height turns into speed (<b>v = √(2gh)</b>), so the train can never climb higher than its energy allows — use the chain lift or a launch. G-forces come from the track\'s curve: concave up (∪) presses you into your seat, concave down (∩) lifts you out of it. If the track ends in mid-air or has a gap, the train flies along a parabola!</p>';
    h += '<h3 id="gloss">📖 Math words</h3>' + glossaryHTML();
    h += '<h3>🍎 For teachers</h3><ul>';
    h += '<li><b>Predict, then ride:</b> turn on 🔮 Predict first — students click where they think the coaster will be fastest (energy ↔ height).</li>';
    h += '<li><b>Transformations:</b> the 🧬 Remix cards show each rule (f(x − h), a·f(x), f(bx)…) with a before/after preview.</li>';
    h += '<li><b>Match the Track</b> (🏅 tab): graph-to-equation practice from linear through sinusoids.</li>';
    h += '<li><b>Piecewise functions:</b> students build a coaster section by section in 🧩 Pieces mode. Ask them to <i>predict</i> whether each joint will be smooth, a corner or a jump before they press Build, then ride it. The “Find k!” and “Tangent Takeoff” examples are classic continuity problems, and the 🔍 Evaluate box shows which piece an x-value uses.</li>';
    h += '<li><b>Engineering challenge:</b> the “Safety Inspector” badge needs excitement ≥ 5 with G-forces between −1.5 and 5 — students must reason about shape, stretches and curvature.</li>';
    h += '<li><b>Collecting work:</b> students can copy a 🔗 track code or export all tracks (🗂️ Garage) and submit the file.</li>';
    h += '<li><b>Phones & Chromebooks:</b> share the web link <a href="' + FC.WEB_URL + '" target="_blank" rel="noopener">' + esc(FC.WEB_URL) + '</a> — phones can\'t run the app from a file sent by text or email.</li>';
    h += '<li>Everything runs in the browser. Progress is saved per browser.</li></ul>';
    openModal(h);
    if (section === 'gloss') setTimeout(() => { const g = $('#gloss'); if (g) g.scrollIntoView(); }, 50);
  }
  function showWelcome(sharedTrack) {
    el.modal.dataset.welcome = '1';
    const loaded = sharedTrack
      ? '<p>You opened a shared track: <b>' + esc(sharedTrack.name || 'a friend\'s coaster') + '</b> — <code>' + esc(sharedTrack.f) + '</code>. Press ▶ Ride to try it!</p>'
      : '<p>We loaded the <b>Teacher\'s Classic</b>: <code>-2x^4 + 7x^3 - 4x^2 - 0.5x + 1</code> from <i>x</i> = −0.40907 to 2.76854. It starts and ends on zeros… but is it safe to ride? 🤔</p>';
    openModal('<h2>🎢 Welcome to Function Coaster!</h2><p>Every roller coaster here is the <b>graph of a function</b>. Type a function, choose where the track starts and ends, and ride it — with real physics.</p>' +
      '<div class="steps"><div class="step"><div class="n">1</div><b>Type</b><p>a function of <i>x</i>, like <code>x^2 - 4</code></p></div><div class="step"><div class="n">2</div><b>Build</b><p>and study its zeros, hills, valleys and slopes</p></div><div class="step"><div class="n">3</div><b>Ride</b><p>then remix it, match tracks and earn badges</p></div></div>' +
      loaded +
      '<div class="modal-actions"><button class="btn btn-small btn-ghost" data-act="help">❓ Full guide</button><button class="btn btn-ride" data-act="welcome-ride">▶ Let\'s ride!</button></div>');
  }
  function showSettings() {
    const s = settings;
    const opt = (v, cur, label) => '<option value="' + v + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + label + '</option>';
    let h = '<h2>⚙️ Settings</h2><div class="settings-grid">';
    h += '<div><label for="setScale">Size of the coaster</label><div class="sd">Meters per graph unit. G-forces don\'t change with size — speeds do.</div></div><select id="setScale">' + opt('auto', s.scale, 'Auto (usually 10 m)') + [1, 2, 5, 10, 20, 50, 100].map((v) => opt(v, s.scale, '1 unit = ' + v + ' m')).join('') + '</select>';
    h += '<div><label for="setVScale">Vertical size</label><div class="sd">Advanced: stretch heights differently than widths.</div></div><select id="setVScale">' + opt('same', s.vScale, 'Same as across') + [1, 2, 5, 10, 20, 50].map((v) => opt(v, s.vScale, '1 unit up = ' + v + ' m')).join('') + '</select>';
    h += '<div><label for="setFriction">Friction</label><div class="sd">Ideal = perfect energy conservation.</div></div><select id="setFriction">' + opt('real', s.friction ? 'real' : 'ideal', 'Realistic') + opt('ideal', s.friction ? 'real' : 'ideal', 'Ideal (no friction)') + '</select>';
    h += '<div><label for="setLift">Chain lift speed</label><div class="sd">How fast the chain pulls the train (m/s).</div></div><span><input type="range" id="setLift" min="2" max="15" step="0.5" value="' + s.vLift + '"> <output id="setLiftOut">' + s.vLift + '</output></span>';
    h += '<div><label for="setUnits">Speed units</label></div><select id="setUnits">' + opt('mph', s.units, 'mph') + opt('kmh', s.units, 'km/h') + opt('mps', s.units, 'm/s') + '</select>';
    h += '<div><label for="setRail">Track color</label></div><input type="color" id="setRail" value="' + s.railColor + '">';
    h += '<div><label for="setSonify">Hear the graph</label><div class="sd">A tone whose pitch follows the height during the ride.</div></div><input type="checkbox" id="setSonify"' + (s.sonify ? ' checked' : '') + '>';
    h += '<div><label for="setShadows">Shadows</label><div class="sd">Turn off on slow computers.</div></div><input type="checkbox" id="setShadows"' + (s.shadows ? ' checked' : '') + '>';
    h += '</div><div class="modal-actions"><button class="btn btn-small btn-ghost" data-act="reset-progress">🧹 Reset badges & stars</button><button class="btn btn-small btn-ghost" data-act="welcome">👋 Show welcome</button><button class="btn btn-small btn-teal" data-act="close-modal">Done</button></div>';
    openModal(h);
    const on = (id, ev, fn) => $('#' + id).addEventListener(ev, fn);
    on('setScale', 'change', (e) => { s.scale = e.target.value; App.saveSettings(); App.build(); });
    on('setVScale', 'change', (e) => { s.vScale = e.target.value; App.saveSettings(); App.build(); });
    on('setFriction', 'change', (e) => { s.friction = e.target.value === 'real'; App.saveSettings(); App.forecastSoon(); });
    on('setLift', 'input', (e) => { s.vLift = +e.target.value; $('#setLiftOut').textContent = s.vLift; App.saveSettings(); });
    on('setLift', 'change', () => App.forecastSoon());
    on('setUnits', 'change', (e) => { s.units = e.target.value; App.saveSettings(); App.updateHUDIdle(); renderBlueprint(); renderGarage(); updateLaunchOut(); });
    on('setRail', 'input', (e) => { s.railColor = e.target.value; App.saveSettings(); if (state.world) state.world.mats.rail.color.set(s.railColor); });
    on('setSonify', 'change', (e) => { s.sonify = e.target.checked; App.saveSettings(); FCAudio.setSonify(s.sonify); });
    on('setShadows', 'change', (e) => { s.shadows = e.target.checked; App.saveSettings(); applyShadows(); });
  }
  function applyShadows() {
    if (!state.world) return;
    state.world.renderer.shadowMap.enabled = settings.shadows;
    state.world.sun.castShadow = settings.shadows;
    state.world.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }
  function showCode(code) {
    const onWeb = /^https?:$/.test(location.protocol);
    const link = onWeb ? location.origin + location.pathname + '#' + code : FC.WEB_URL + '#' + code;
    openModal('<h2>🔗 Share this track</h2><p><b>Link</b>: opens this exact track in any browser, phones too.</p><textarea class="code" readonly id="linkBox">' + esc(link) + '</textarea><div class="modal-actions" style="margin-top:6px"><button class="btn btn-small btn-teal" data-act="copy-link">📋 Copy link</button></div>' +
      '<p><b>Code</b>: paste it into “📋 Load a code” on another computer.</p><textarea class="code" readonly id="codeBox">' + esc(code) + '</textarea><div class="modal-actions" style="margin-top:6px"><button class="btn btn-small btn-ghost" data-act="copy-code">📋 Copy code</button></div>');
    const box = $('#linkBox'); box.focus(); box.select();
  }
  function showLoadCode() {
    openModal('<h2>📋 Load a track code</h2><p>Paste a code that starts with <code>FC1-</code>.</p><textarea class="code" id="codeIn" placeholder="FC1-…"></textarea><div class="modal-actions"><button class="btn btn-small btn-teal" data-act="load-code-go">🎢 Load track</button></div>');
  }
  function updateLaunchOut() {
    el.launchOut.textContent = App.speedParts(+el.launchSpeed.value).big + ' ' + App.speedParts(+el.launchSpeed.value).unit;
  }

  // ---------------------------------------------------------------- keypad
  function toggleKeypad() {
    const kp = el.keypad;
    if (!kp.hidden) { kp.hidden = true; return; }
    const keys = [['x²', '^2'], ['x³', '^3'], ['xⁿ', '^'], ['√', 'sqrt('], ['|x|', '|'], ['π', 'pi'], ['e', 'e'], ['( )', '()'], ['sin', 'sin('], ['cos', 'cos('], ['÷', '/'], ['·', '*'], ['a', 'a'], ['h', 'h'], ['k', 'k'], ['ln', 'ln('], ['2ˣ', '2^x'], ['⌫', 'BS']];
    kp.innerHTML = keys.map(([l, v]) => '<button data-k="' + esc(v) + '">' + l + '</button>').join('');
    const r = el.btnKeypad.getBoundingClientRect();
    kp.style.left = Math.max(8, Math.min(innerWidth - 340, r.left - 240)) + 'px';
    kp.style.top = r.bottom + 8 + 'px';
    kp.hidden = false;
  }
  function keypadInsert(v) {
    const inp = state.mode === 'pieces' && state.lastPieceInput && document.body.contains(state.lastPieceInput) ? state.lastPieceInput : el.fnInput;
    const s0 = inp.selectionStart != null ? inp.selectionStart : inp.value.length, s1 = inp.selectionEnd != null ? inp.selectionEnd : inp.value.length;
    let val = inp.value, caret;
    if (v === 'BS') { const from = s0 === s1 ? Math.max(0, s0 - 1) : s0; val = val.slice(0, from) + val.slice(s1); caret = from; }
    else if (v === '()') { val = val.slice(0, s0) + '(' + val.slice(s0, s1) + ')' + val.slice(s1); caret = s0 + 1 + (s1 - s0); }
    else { val = val.slice(0, s0) + v + val.slice(s1); caret = s0 + v.length; }
    inp.value = val;
    inp.focus(); inp.setSelectionRange(caret, caret);
    if (inp === el.fnInput) App.schedulePreview();
    else inp.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ---------------------------------------------------------------- graph chips
  function renderGraphTools() {
    const g = settings.graph;
    const cm = { plain: '🎨 Plain', slope: '🎨 Up/down', concavity: '🎨 Bend', speed: '🎨 Speed' };
    el.graphTools.innerHTML = [
      ['labels', '🏷️ Labels', g.labels], ['tangent', '📐 Tangent', g.tangent], ['secant', '📏 Avg rate', g.secant], ['color', cm[g.colorMode], g.colorMode !== 'plain'], ['equal', '⬜ 1:1', g.equal], ['fit', '⤢ Fit', false],
    ].map(([k, l, on]) => '<button class="chip' + (on ? ' on' : '') + '" data-chip="' + k + '" title="' + chipTitle(k) + '">' + l + '</button>').join('');
  }
  function chipTitle(k) {
    return { labels: 'Show coordinates of zeros, hills and valleys', tangent: 'Show the tangent line and slope at the coaster', secant: 'Show the average rate of change from the start to the coaster', color: 'Color the track by slope (up/down), bend (concavity) or speed', equal: 'Same scale on both axes — see the true shape', fit: 'Fit the whole track (or double-click the graph)' }[k];
  }
  function onChip(k) {
    const g = settings.graph;
    if (k === 'fit') { state.graph.resetView(); }
    else if (k === 'color') { const order = ['plain', 'slope', 'concavity', 'speed']; g.colorMode = order[(order.indexOf(g.colorMode) + 1) % order.length]; }
    else { g[k] = !g[k]; }
    Object.assign(state.graph.opts, g);
    if (k === 'equal') state.graph.resetView();
    App.saveSettings();
    renderGraphTools();
    state.graph.dirty = true;
  }

  return {
    renderBlueprint, renderRemix, markRemixDirty, renderMissions, renderGarage, showResults, runLab, openModal, closeModal, showHelp, showWelcome, showSettings, showGloss,
    showCode, showLoadCode, toggleKeypad, keypadInsert, renderGraphTools, onChip, updateLaunchOut, applyShadows, isRemixDirty: () => remixDirty, baseInfo, labSettings,
    showTab, syncPieces, renderPieces, bindPieces, buildFromPieces, rowsToText, rowsFromAST,
  };
})();
