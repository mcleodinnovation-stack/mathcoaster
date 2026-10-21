/* =====================================================================
   FCStore — saved tracks, progress and settings (browser localStorage)
   ===================================================================== */
var FCStore = (function () {
  const KEY = { history: 'fcoaster.history.v1', progress: 'fcoaster.progress.v1', settings: 'fcoaster.settings.v1' };
  const MAX_HISTORY = 150;
  let mem = {};

  function read(k, fallback) {
    try {
      const raw = localStorage.getItem(k);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* storage unavailable */ }
    return mem[k] !== undefined ? mem[k] : fallback;
  }
  function write(k, v) {
    mem[k] = v;
    try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; }
  }

  function trackKey(t) { return [t.f.trim().replace(/\s+/g, ''), String(t.a).trim(), String(t.b).trim(), JSON.stringify(t.params || {})].join('|'); }

  const history = {
    all() { return read(KEY.history, []); },
    save(list) { write(KEY.history, list.slice(0, MAX_HISTORY)); },
    /** Add or refresh a built track. Returns the entry. */
    upsert(entry) {
      const list = history.all();
      const key = trackKey(entry);
      let e = list.find((x) => trackKey(x) === key);
      const now = Date.now();
      if (e) {
        Object.assign(e, entry, { id: e.id, favorite: e.favorite, name: e.name || entry.name, updatedAt: now, builds: (e.builds || 1) + 1, stats: entry.stats || e.stats });
        list.splice(list.indexOf(e), 1);
      } else {
        e = Object.assign({ id: FC.uid(), createdAt: now, updatedAt: now, favorite: false, builds: 1 }, entry);
      }
      list.unshift(e);
      // keep favorites, trim the rest
      const favs = list.filter((x) => x.favorite), rest = list.filter((x) => !x.favorite);
      history.save(favs.concat(rest).sort((p, q) => q.updatedAt - p.updatedAt).slice(0, MAX_HISTORY));
      return e;
    },
    update(id, patch) {
      const list = history.all();
      const e = list.find((x) => x.id === id);
      if (e) { Object.assign(e, patch); history.save(list); }
      return e;
    },
    remove(id) { history.save(history.all().filter((x) => x.id !== id)); },
    clear(keepFavorites = true) { history.save(keepFavorites ? history.all().filter((x) => x.favorite) : []); },
    import(list) {
      if (!Array.isArray(list)) throw new Error('Not a track list');
      const cur = history.all();
      const keys = new Set(cur.map(trackKey));
      let added = 0;
      for (const t of list) {
        if (!t || typeof t.f !== 'string' || t.a === undefined || t.b === undefined) continue;
        if (keys.has(trackKey(t))) continue;
        cur.push(Object.assign({ id: FC.uid(), createdAt: Date.now(), updatedAt: Date.now() }, t, { id: FC.uid() }));
        keys.add(trackKey(t));
        added++;
      }
      history.save(cur.sort((p, q) => q.updatedAt - p.updatedAt));
      return added;
    },
  };

  const progress = {
    get() { return read(KEY.progress, { missions: {}, match: {}, predictions: { tries: 0, great: 0, streak: 0, best: 0 }, used: {} }); },
    set(p) { write(KEY.progress, p); },
    patch(fn) { const p = progress.get(); fn(p); progress.set(p); return p; },
    reset() { write(KEY.progress, { missions: {}, match: {}, predictions: { tries: 0, great: 0, streak: 0, best: 0 }, used: {} }); },
  };

  const settings = {
    defaults: { scale: 'auto', vScale: 'same', friction: true, vLift: 6, units: 'mph', sound: true, sonify: false, shadows: true, welcomed: false, startMode: 'lift', warp: 1, graph: { labels: true, tangent: true, secant: false, colorMode: 'plain', equal: false }, railColor: '#e63956', view: 'both' },
    get() {
      const s = read(KEY.settings, {});
      const d = JSON.parse(JSON.stringify(settings.defaults));
      return Object.assign(d, s, { graph: Object.assign(d.graph, s.graph || {}) });
    },
    set(s) { write(KEY.settings, s); },
  };

  /** Short shareable text code for a track. */
  function encodeTrack(t) {
    const o = { f: t.f, a: t.a, b: t.b };
    if (t.params && Object.keys(t.params).length) o.p = t.params;
    if (t.name) o.n = t.name;
    const json = JSON.stringify(o);
    // URL-safe base64 so the code survives inside links (decodeTrack accepts both alphabets)
    const b64 = btoa(unescape(encodeURIComponent(json))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
    return 'FC1-' + b64;
  }
  function decodeTrack(code) {
    const m = /FC1-([A-Za-z0-9+/_-]+)/.exec(String(code).trim());
    if (!m) throw new Error('That doesn\'t look like a track code (they start with FC1-).');
    let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const o = JSON.parse(decodeURIComponent(escape(atob(b64))));
    if (typeof o.f !== 'string') throw new Error('Broken track code.');
    return { f: o.f, a: String(o.a), b: String(o.b), params: o.p || {}, name: o.n || '' };
  }

  return { history, progress, settings, encodeTrack, decodeTrack, trackKey };
})();
