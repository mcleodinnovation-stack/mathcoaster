/* =====================================================================
   FCWorld — the 3D amusement park (Three.js, loaded on demand)
   ===================================================================== */
var FCWorld = (function () {
  let THREE = null;
  const SOURCES = [
    'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js',
    'https://unpkg.com/three@0.160.0/build/three.module.min.js',
  ];

  async function load() {
    if (THREE) return THREE;
    const emb = document.getElementById('three-src');
    if (emb && emb.textContent.length > 1000) {
      try {
        const url = URL.createObjectURL(new Blob([emb.textContent], { type: 'text/javascript' }));
        THREE = await import(url);
        return THREE;
      } catch (e) { console.warn('Embedded 3D engine failed to start', e); }
    }
    let lastErr = null;
    for (const src of SOURCES) {
      try { THREE = await import(src); return THREE; } catch (e) { lastErr = e; console.warn('3D engine not reachable at', src); }
    }
    throw lastErr || new Error('3D engine unavailable');
  }

  const CAR_COLORS = [0xff4d6d, 0xffd166, 0x2ec4b6, 0xa06cf0, 0x4cc9f0];
  const SHIRTS = [0x3a86ff, 0xff006e, 0x8338ec, 0xfb5607, 0x06d6a0, 0xffbe0b];
  const SKIN = [0xffd9b3, 0xf1c27d, 0xc68642, 0x8d5524, 0xe0ac69];

  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 4;
    return t;
  }

  function grassTexture() {
    return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#6fbf52'; g.fillRect(0, 0, w, h);
      const rnd = FC.rng(7);
      for (let i = 0; i < 2600; i++) {
        const x = rnd() * w, y = rnd() * h;
        const l = 38 + rnd() * 26;
        g.fillStyle = `hsl(${95 + rnd() * 20}, ${45 + rnd() * 20}%, ${l}%)`;
        g.fillRect(x, y, 1.5 + rnd() * 2, 1.5 + rnd() * 3);
      }
      for (let i = 0; i < 30; i++) {
        g.fillStyle = `rgba(255,255,255,${0.02 + rnd() * 0.03})`;
        g.beginPath(); g.arc(rnd() * w, rnd() * h, 10 + rnd() * 30, 0, Math.PI * 2); g.fill();
      }
    }, true);
  }
  function earthTexture() {
    return canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#8b6a48'; g.fillRect(0, 0, w, h);
      const rnd = FC.rng(3);
      for (let y = 0; y < h; y += 8) { g.fillStyle = `rgba(${60 + rnd() * 40},${40 + rnd() * 30},${20 + rnd() * 20},0.35)`; g.fillRect(0, y, w, 3 + rnd() * 4); }
      for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(40,25,10,${rnd() * 0.3})`; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
    }, true);
  }
  function cloudTexture() {
    const t = canvasTex(256, 128, (g, w, h) => {
      const rnd = FC.rng(11);
      for (let i = 0; i < 18; i++) {
        const x = w * (0.2 + rnd() * 0.6), y = h * (0.45 + rnd() * 0.25), r = 20 + rnd() * 34;
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
    });
    return t;
  }

  function makeLabel(text, opts = {}) {
    const fs = 46;
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    const font = `800 ${fs}px Nunito, "Segoe UI", system-ui, sans-serif`;
    g.font = font;
    const tw = g.measureText(text).width;
    c.width = Math.ceil(tw + 44); c.height = fs + 34;
    g.font = font;
    const bg = opts.bg || 'rgba(255,255,255,0.94)', fg = opts.fg || '#1d2c55', border = opts.border || fg;
    g.fillStyle = bg;
    const r = 18, W = c.width, H = c.height;
    g.beginPath(); g.moveTo(r, 2); g.lineTo(W - r, 2); g.quadraticCurveTo(W - 2, 2, W - 2, r); g.lineTo(W - 2, H - r); g.quadraticCurveTo(W - 2, H - 2, W - r, H - 2);
    g.lineTo(r, H - 2); g.quadraticCurveTo(2, H - 2, 2, H - r); g.lineTo(2, r); g.quadraticCurveTo(2, 2, r, 2); g.closePath(); g.fill();
    g.lineWidth = 4; g.strokeStyle = border; g.globalAlpha = 0.55; g.stroke(); g.globalAlpha = 1;
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
    const sp = new THREE.Sprite(mat);
    const h = opts.size || 2;
    sp.scale.set((h * c.width) / c.height, h, 1);
    sp.center.set(0.5, opts.anchorBottom ? 0 : 0.5);
    sp.renderOrder = 5;
    sp.userData.label = true;
    return sp;
  }

  // ------------------------------------------------------------------------
  class World {
    constructor(host) {
      this.host = host;
      const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      host.appendChild(renderer.domElement);
      this.renderer = renderer;
      renderer.xr.enabled = true;
      // A modest pixel ratio and no camera shake for mobile standalone VR.
      this.xrActive = false;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 5000);
      this.camera.position.set(40, 30, 80);
      // WebXR's tracked camera inherits this moving origin. Moving the camera
      // alone is insufficient: the headset supplies its own per-eye transforms.
      this.vrRig = new THREE.Group();
      this.vrRig.name = 'Moving roller coaster VR seat';
      this.scene.add(this.vrRig);
      this.vrRig.add(this.camera);
      this.vrSeatForward = new THREE.Vector3(0, 1, 0);
      this.skyColors = { top: new THREE.Color(0x2f6fcb), horizon: new THREE.Color(0xd6ecff), bottom: new THREE.Color(0xb8d4ea) };
      this.scene.fog = new THREE.Fog(this.skyColors.horizon.clone(), 200, 1500);

      this.hemi = new THREE.HemisphereLight(0xdcefff, 0x5f7f3c, 1.35);
      this.scene.add(this.hemi);
      this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      this.sun.shadow.bias = -0.0004;
      this.sun.shadow.normalBias = 0.03;
      this.scene.add(this.sun, this.sun.target);
      this.sunDir = new THREE.Vector3(-0.45, 0.78, 0.44).normalize();

      this.makeSky();
      this.tex = { grass: grassTexture(), earth: earthTexture(), cloud: cloudTexture() };
      this.mats = {
        rail: new THREE.MeshStandardMaterial({ color: 0xe63956, metalness: 0.35, roughness: 0.35 }),
        spine: new THREE.MeshStandardMaterial({ color: 0xa3152e, metalness: 0.3, roughness: 0.5 }),
        tie: new THREE.MeshStandardMaterial({ color: 0x3b3f4a, metalness: 0.2, roughness: 0.7 }),
        support: new THREE.MeshStandardMaterial({ color: 0xf2f4f8, metalness: 0.15, roughness: 0.55 }),
        brace: new THREE.MeshStandardMaterial({ color: 0xc9d1de, metalness: 0.15, roughness: 0.6 }),
        earth: new THREE.MeshStandardMaterial({ map: this.tex.earth, roughness: 1, side: THREE.DoubleSide }),
        concrete: new THREE.MeshStandardMaterial({ color: 0xd9d4c7, roughness: 0.95 }),
        roof: new THREE.MeshStandardMaterial({ color: 0xff4d6d, roughness: 0.6 }),
        roof2: new THREE.MeshStandardMaterial({ color: 0xfff4dc, roughness: 0.7 }),
        wood: new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.9 }),
        leaf: new THREE.MeshStandardMaterial({ color: 0x3f9d4a, roughness: 0.9 }),
        trunk: new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1 }),
        mountain: new THREE.MeshStandardMaterial({ color: 0x6f8f86, roughness: 1, flatShading: true }),
        pole: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
        axis: new THREE.MeshStandardMaterial({ color: 0x23355f, roughness: 0.6 }),
        ghost: new THREE.MeshBasicMaterial({ color: 0xa06cf0, transparent: true, opacity: 0.38, depthWrite: false }),
        lamp: new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
      };
      this.trackGroup = new THREE.Group();
      this.sceneryGroup = new THREE.Group();
      this.ghostGroup = new THREE.Group();
      this.fxGroup = new THREE.Group();
      this.scene.add(this.trackGroup, this.sceneryGroup, this.ghostGroup, this.fxGroup);
      this.cars = this.makeTrain();
      this.camMode = 'orbit';
      this.orbit = { theta: -1.15, phi: 1.2, dist: 120, target: new THREE.Vector3(), auto: true, lastInteract: 0 };
      this.look = { yaw: 0, pitch: 0, dragging: false };
      this.blend = null;
      this.flightCount = 0;
      this.particles = [];
      this.bindControls();
      this.resize();
    }

    makeSky() {
      const uniforms = {
        top: { value: this.skyColors.top }, horizon: { value: this.skyColors.horizon }, bottom: { value: this.skyColors.bottom },
        sunDir: { value: new THREE.Vector3(-0.45, 0.78, 0.44).normalize() },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }',
        fragmentShader: [
          'uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; varying vec3 vDir;',
          'void main(){ vec3 d = normalize(vDir); float h = d.y;',
          ' vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h,0.0,1.0), 0.5)) : mix(horizon, bottom, pow(clamp(-h,0.0,1.0), 0.35));',
          ' float s = max(dot(d, normalize(sunDir)), 0.0);',
          ' col += vec3(1.0,0.92,0.75) * pow(s, 900.0) * 6.0 + vec3(1.0,0.85,0.6) * pow(s, 12.0) * 0.18;',
          ' gl_FragColor = vec4(col, 1.0);',
          ' #include <tonemapping_fragment>',
          ' #include <colorspace_fragment>',
          '}',
        ].join('\n'),
      });
      this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
      this.sky.frustumCulled = false;
      this.sky.renderOrder = -10;
      this.scene.add(this.sky);
    }

    // -------------------------------------------------------------- controls
    bindControls() {
      const el = this.renderer.domElement;
      let drag = null;
      el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId);
        drag = { x: e.clientX, y: e.clientY };
        this.orbit.lastInteract = performance.now();
        if (this.camMode === 'pov') this.look.dragging = true;
      });
      el.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.x = e.clientX; drag.y = e.clientY;
        this.orbit.lastInteract = performance.now();
        if (this.camMode === 'pov') {
          this.look.yaw = FC.clamp(this.look.yaw - dx * 0.006, -2.2, 2.2);
          this.look.pitch = FC.clamp(this.look.pitch - dy * 0.006, -1.1, 1.1);
          return;
        }
        if (this.camMode !== 'orbit') this.setCameraMode('orbit', true);
        this.orbit.theta -= dx * 0.006;
        this.orbit.phi = FC.clamp(this.orbit.phi - dy * 0.005, 0.12, 1.55);
        this.orbit.auto = false;
      });
      const end = () => { drag = null; this.look.dragging = false; };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (this.camMode !== 'orbit') this.setCameraMode('orbit', true);
        this.orbit.dist = FC.clamp(this.orbit.dist * Math.exp(e.deltaY * 0.0012), 3, this.maxDist || 3000);
        this.orbit.lastInteract = performance.now();
      }, { passive: false });
    }

    /** fromCamera: continue orbiting from wherever the camera is now (used when the user drags). */
    setCameraMode(mode, fromCamera) {
      if (mode === this.camMode) return;
      this.blend = { from: this.camera.position.clone(), q: this.camera.quaternion.clone(), t: 0, dur: 0.7 };
      if (mode === 'orbit' && fromCamera) {
        const off = this.camera.position.clone().sub(this.orbit.target);
        this.orbit.dist = FC.clamp(off.length(), 5, this.maxDist || 3000);
        this.orbit.phi = FC.clamp(Math.acos(FC.clamp(off.y / (off.length() || 1), -1, 1)), 0.12, 1.55);
        this.orbit.theta = Math.atan2(off.x, off.z);
        this.blend = null;
      } else if (mode === 'orbit' && this.homeOrbit) {
        // the overview button always frames the whole track
        Object.assign(this.orbit, { dist: this.homeOrbit.dist, phi: this.homeOrbit.phi, theta: this.homeOrbit.theta, auto: true });
        this.orbit.target.copy(this.homeOrbit.target);
      }
      this.camMode = mode;
      this.look.yaw = 0; this.look.pitch = 0;
      if (this.onCameraChange) this.onCameraChange(mode);
    }

    resize() {
      const r = this.host.getBoundingClientRect();
      const w = Math.max(10, r.width), h = Math.max(10, r.height);
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }

    // -------------------------------------------------------------- building
    disposeGroup(g) {
      g.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of ms) {
            if (Object.values(this.mats).includes(m)) continue;
            if (m.map && !Object.values(this.tex).includes(m.map)) m.map.dispose();
            m.dispose();
          }
        }
      });
      while (g.children.length) g.remove(g.children[0]);
    }

    build(track, an, opts = {}) {
      this.track = track;
      this.an = an;
      this.disposeGroup(this.trackGroup);
      this.disposeGroup(this.sceneryGroup);
      this.disposeGroup(this.fxGroup);
      this.particles = [];
      this.flightCount = 0;
      this.flightLines = [];
      const b = track.bounds;
      const cx = (b.minX + b.maxX) / 2;
      const ext = Math.max(b.maxX - b.minX, b.maxY - b.minY, 20);
      this.ext = ext;
      this.center = new THREE.Vector3(cx, (b.minY + b.maxY) / 2, 0);
      const labelSize = FC.clamp(ext * 0.028, 1.1, 14);
      this.labelSize = labelSize;
      if (opts.railColor) this.mats.rail.color.set(opts.railColor);

      // lights & fog
      const R = Math.max(700, ext * 4);
      this.worldR = R;
      this.scene.fog.near = ext * 1.2 + 60;
      this.scene.fog.far = R * 1.5;
      this.camera.far = R * 3;
      this.camera.updateProjectionMatrix();
      this.sky.scale.setScalar(R * 2.5);
      this.maxDist = R * 1.2;
      const sh = this.sun.shadow.camera;
      const half = Math.min(Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.75 + 40, 900);
      sh.left = -half; sh.right = half; sh.top = half; sh.bottom = -half;
      sh.near = 1; sh.far = half * 4 + 200;
      sh.updateProjectionMatrix();
      this.sun.position.copy(this.center).addScaledVector(this.sunDir, half * 2 + 60);
      this.sun.target.position.copy(this.center);

      // underground stretches
      const under = [];
      for (const seg of track.segs) {
        let cur = null;
        for (let i = 0; i < seg.X.length; i++) {
          if (seg.Y[i] < -0.05) { if (!cur) cur = { x0: seg.X[i], x1: seg.X[i], seg }; cur.x1 = seg.X[i]; }
          else if (cur) { under.push(cur); cur = null; }
        }
        if (cur) under.push(cur);
      }
      const startP = track.poseAt(track.segs[0], 0);
      const lastSeg = track.segs[track.segs.length - 1];
      const endP = track.poseAt(lastSeg, lastSeg.L);
      const heightRange = Math.max(1, b.maxY - b.minY);
      this.endsAtStation = Math.abs(endP.Y) <= Math.max(1.5, 0.03 * heightRange) || endP.Y < 0;
      // extend trenches under underground stations
      for (const u of under) {
        if (u.seg === track.segs[0] && Math.abs(u.x0 - startP.X) < 1e-6) u.x0 -= 16;
        if (u.seg === lastSeg && Math.abs(u.x1 - endP.X) < 1e-6) u.x1 += 30;
      }
      this.buildGround(b, under, R);
      this.buildTrench(track, under, startP, endP);
      for (const seg of track.segs) this.buildSegment(track, seg);
      this.buildSupports(track);
      this.buildStation(startP, -1);
      if (this.endsAtStation) this.buildStation(endP, 1);
      else this.buildEndFlag(endP);
      this.buildAxes(track, an, labelSize);
      this.buildLandmarks(track, an, labelSize);
      this.buildScenery(track, R, ext);
      this.placeTrainAtStart();

      // camera framing
      this.orbit.target.copy(this.center);
      const rad = 0.5 * Math.hypot(b.maxX - b.minX, b.maxY - b.minY) + 6;
      const fovV = (50 * Math.PI) / 180, fovH = 2 * Math.atan(Math.tan(fovV / 2) * Math.max(0.5, this.camera.aspect));
      this.orbit.dist = FC.clamp((rad / Math.sin(Math.min(fovV, fovH) / 2)) * 0.92, 18, this.maxDist);
      this.orbit.theta = -0.5; this.orbit.phi = 1.3;
      this.orbit.auto = true;
      this.homeOrbit = { dist: this.orbit.dist, phi: this.orbit.phi, theta: this.orbit.theta, target: this.orbit.target.clone() };
      this.blend = null;
      if (this.camMode === 'orbit') this.applyOrbit(1);
    }

    buildGround(b, under, R) {
      const P = R * 1.2;
      const shape = new THREE.Shape();
      shape.moveTo(-P + b.minX, -P); shape.lineTo(P + b.maxX, -P); shape.lineTo(P + b.maxX, P); shape.lineTo(-P + b.minX, P); shape.closePath();
      const W = 3.6;
      const merged = [];
      under.slice().sort((p, q) => p.x0 - q.x0).forEach((u) => {
        const a = u.x0 - 0.6, c = u.x1 + 0.6;
        const last = merged[merged.length - 1];
        if (last && a <= last.c + 0.5) last.c = Math.max(last.c, c); else merged.push({ a, c });
      });
      for (const m of merged) {
        const hole = new THREE.Path();
        hole.moveTo(m.a, -W); hole.lineTo(m.a, W); hole.lineTo(m.c, W); hole.lineTo(m.c, -W); hole.closePath();
        shape.holes.push(hole);
      }
      const geo = new THREE.ShapeGeometry(shape);
      geo.rotateX(-Math.PI / 2);
      // UVs in meters (8 m tiles)
      const pos = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 8, pos.getZ(i) / 8);
      const mat = new THREE.MeshStandardMaterial({ map: this.tex.grass, roughness: 1, metalness: 0 });
      const ground = new THREE.Mesh(geo, mat);
      ground.receiveShadow = true;
      this.sceneryGroup.add(ground);
      // a gravel walkway beside the track
      const path = new THREE.Mesh(new THREE.PlaneGeometry(b.maxX - b.minX + 30, 3.2), new THREE.MeshStandardMaterial({ color: 0xd9cba6, roughness: 1 }));
      path.rotation.x = -Math.PI / 2; path.position.set((b.minX + b.maxX) / 2, 0.02, 11);
      path.receiveShadow = true;
      this.sceneryGroup.add(path);
    }

    buildTrench(track, under) {
      const W = 3.6;
      for (const u of under) {
        const pts = [];
        const step = Math.max(0.8, (u.x1 - u.x0) / 400);
        for (let X = u.x0; X <= u.x1 + 1e-6; X += step) {
          const x = X / track.Sx + track.xc;
          let y = null;
          for (const s of track.segs) if (x >= s.x0 && x <= s.x1) { y = track.fn(x) * track.Sy; break; }
          if (y === null || !isFinite(y)) {
            // beyond the track (underground station) — use the nearest end height
            const s0 = track.segs[0], sL = track.segs[track.segs.length - 1];
            y = x < s0.x0 ? s0.Y[0] : sL.Y[sL.Y.length - 1];
          }
          pts.push([X, Math.min(y - 2.2, -0.5)]);
        }
        if (pts.length < 2) continue;
        const n = pts.length;
        for (const side of [-1, 1]) {
          const pos = new Float32Array(n * 2 * 3), uvs = new Float32Array(n * 2 * 2), idx = [];
          for (let i = 0; i < n; i++) {
            const [X, yb] = pts[i];
            pos.set([X, 0, side * W, X, yb, side * W], i * 6);
            uvs.set([X / 4, 0, X / 4, yb / 4], i * 4);
            if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
          g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
          g.setIndex(idx); g.computeVertexNormals();
          const m = new THREE.Mesh(g, this.mats.earth);
          m.receiveShadow = true;
          this.sceneryGroup.add(m);
        }
        // floor
        const pos = new Float32Array(n * 2 * 3), uvs = new Float32Array(n * 2 * 2), idx = [];
        for (let i = 0; i < n; i++) {
          const [X, yb] = pts[i];
          pos.set([X, yb, -W, X, yb, W], i * 6);
          uvs.set([X / 4, -1, X / 4, 1], i * 4);
          if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        g.setIndex(idx); g.computeVertexNormals();
        this.sceneryGroup.add(new THREE.Mesh(g, this.mats.earth));
        // lamps along the walls
        const lampGeo = new THREE.SphereGeometry(0.18, 8, 6);
        for (let i = 0; i < n; i += Math.max(1, Math.round(9 / step))) {
          for (const side of [-1, 1]) {
            const l = new THREE.Mesh(lampGeo, this.mats.lamp);
            l.position.set(pts[i][0], pts[i][1] + 2.8, side * (W - 0.15));
            this.sceneryGroup.add(l);
          }
        }
      }
    }

    resample(track, seg) {
      const step = Math.max(0.3, seg.L / 2600);
      const n = Math.max(2, Math.ceil(seg.L / step) + 1);
      const P = [], T = [], N = [];
      for (let i = 0; i < n; i++) {
        const p = track.poseAt(seg, (seg.L * i) / (n - 1));
        P.push(new THREE.Vector3(p.X, p.Y, 0)); T.push([p.tx, p.ty]); N.push([p.nx, p.ny]);
      }
      return { P, T, N, step: seg.L / (n - 1) };
    }

    tube(points, radius, radial, mat, cast = true) {
      if (points.length < 2) return null;
      const curve = new PolyCurve(points);
      const geo = new THREE.TubeGeometry(curve, Math.min(points.length - 1, 3200), radius, radial, false);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast; m.receiveShadow = true;
      return m;
    }

    pieceMat(k) {
      const key = 'piece' + (k % FC.PIECE_COLORS.length);
      if (!this.mats[key]) this.mats[key] = new THREE.MeshStandardMaterial({ color: new THREE.Color(FC.pieceColor(k)), metalness: 0.35, roughness: 0.35 });
      return this.mats[key];
    }

    buildSegment(track, seg) {
      const { P, T, N, step } = this.resample(track, seg);
      const railH = 0.32, gauge = 0.56;
      // piecewise tracks: one rail color per piece
      const info = this.an && this.an.pw;
      const runs = [];
      if (info) {
        let cur = null;
        for (let i = 0; i < P.length; i++) {
          const x = P[i].x / track.Sx + track.xc;
          const pc = info.pieceAt(x) || info.pieceAt(x - 1e-9 * (1 + Math.abs(x))) || info.pieceAt(x + 1e-9 * (1 + Math.abs(x)));
          const k = pc ? pc.k : (cur ? cur.k : 0);
          if (!cur || cur.k !== k) { if (cur) cur.i1 = i; cur = { k, i0: Math.max(0, i - 1), i1: i }; runs.push(cur); }
          cur.i1 = i;
        }
      } else runs.push({ k: -1, i0: 0, i1: P.length - 1 });
      for (const run of runs) {
        const mat = run.k < 0 ? this.mats.rail : this.pieceMat(run.k);
        for (const side of [-1, 1]) {
          const pts = [];
          for (let i = run.i0; i <= run.i1; i++) pts.push(new THREE.Vector3(P[i].x + N[i][0] * railH, P[i].y + N[i][1] * railH, side * gauge));
          const m = this.tube(pts, 0.1, 6, mat);
          if (m) this.trackGroup.add(m);
        }
      }
      // the thick center beam carries the piece color too, so pieces stand out from far away
      for (const run of runs) {
        const spine = [];
        for (let i = run.i0; i <= run.i1; i++) spine.push(new THREE.Vector3(P[i].x - N[i][0] * 0.05, P[i].y - N[i][1] * 0.05, 0));
        const sm = this.tube(spine, 0.26, 6, run.k < 0 ? this.mats.spine : this.pieceMat(run.k));
        if (sm) this.trackGroup.add(sm);
      }
      // ties
      const every = Math.max(1, Math.round(0.95 / step));
      const count = Math.floor((P.length - 1) / every) + 1;
      const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.12, 1.45), this.mats.tie, count);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), z = new THREE.Vector3(0, 0, 1), v = new THREE.Vector3();
      let k = 0;
      for (let i = 0; i < P.length && k < count; i += every) {
        q.setFromAxisAngle(z, Math.atan2(T[i][1], T[i][0]));
        v.set(P[i].x + N[i][0] * 0.2, P[i].y + N[i][1] * 0.2, 0);
        m4.compose(v, q, s); ties.setMatrixAt(k++, m4);
      }
      ties.count = k;
      ties.castShadow = true; ties.receiveShadow = true;
      this.trackGroup.add(ties);
      // end buffers at gaps
      const addBuffer = (i, dir) => {
        const bm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 1.8), new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.6 }));
        bm.position.set(P[i].x + N[i][0] * 0.7 + T[i][0] * dir * 0.3, P[i].y + N[i][1] * 0.7 + T[i][1] * dir * 0.3, 0);
        bm.rotation.z = Math.atan2(T[i][1], T[i][0]);
        bm.castShadow = true;
        this.trackGroup.add(bm);
      };
      if (seg.startKind !== 'domain') addBuffer(0, -1);
      if (seg.endKind !== 'domain') addBuffer(P.length - 1, 1);
    }

    buildSupports(track) {
      const b = track.bounds;
      const spacing = FC.clamp((b.maxX - b.minX) / 70, 4, 40);
      const cols = [], braces = [];
      for (const seg of track.segs) {
        const x0 = seg.X[0], x1 = seg.X[seg.X.length - 1];
        const n = Math.max(1, Math.floor((x1 - x0) / spacing));
        for (let i = 0; i <= n; i++) {
          const X = x0 + ((x1 - x0) * (i + 0.5)) / (n + 1);
          const x = X / track.Sx + track.xc;
          const y = track.fn(x) * track.Sy;
          if (!isFinite(y) || y < 1.2) continue;
          const d = track.an.d1(x, seg.x0, seg.x1) * track.Sy / track.Sx;
          const top = y - 0.35 - 0.25 * Math.min(Math.abs(d), 4);
          if (top < 0.8) continue;
          for (const zs of [-1.25, 1.25]) cols.push([X, top, zs]);
          braces.push([X, top, 0, 2.7]);
          for (let h = 9; h < top - 2; h += 9) braces.push([X, h, 0, 2.5]);
        }
      }
      if (cols.length) {
        const geo = new THREE.CylinderGeometry(0.2, 0.26, 1, 8);
        geo.translate(0, 0.5, 0);
        const im = new THREE.InstancedMesh(geo, this.mats.support, cols.length);
        const m4 = new THREE.Matrix4();
        cols.forEach((c, i) => { m4.makeScale(1, c[1], 1); m4.setPosition(c[0], 0, c[2]); im.setMatrixAt(i, m4); });
        im.castShadow = true; im.receiveShadow = true;
        this.trackGroup.add(im);
        // feet
        const feet = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.3, 0.9), this.mats.concrete, cols.length);
        cols.forEach((c, i) => { m4.makeTranslation(c[0], 0.15, c[2]); feet.setMatrixAt(i, m4); });
        feet.receiveShadow = true;
        this.trackGroup.add(feet);
      }
      if (braces.length) {
        const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.18, 1), this.mats.brace, braces.length);
        const m4 = new THREE.Matrix4();
        braces.forEach((c, i) => { m4.makeScale(1, 1, c[3]); m4.setPosition(c[0], c[1], c[2]); im.setMatrixAt(i, m4); });
        im.castShadow = true;
        this.trackGroup.add(im);
      }
    }

    buildStation(p, dir) {
      const g = new THREE.Group();
      const L = 13, Wd = 5.6;
      const floorY = p.Y - 0.9;
      const cx = p.X + dir * (L / 2 - 0.5);
      const plat = new THREE.Mesh(new THREE.BoxGeometry(L, 0.5, Wd), this.mats.concrete);
      plat.position.set(cx, floorY, 0);
      plat.receiveShadow = true; plat.castShadow = true;
      g.add(plat);
      // level rails in the station
      for (const side of [-1, 1]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(L, 0.14, 0.14), this.mats.rail);
        r.position.set(cx, p.Y + 0.32, side * 0.56);
        g.add(r);
      }
      const postGeo = new THREE.BoxGeometry(0.3, 4.4, 0.3);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, this.mats.wood);
        post.position.set(cx + sx * (L / 2 - 0.3), floorY + 2.4, sz * (Wd / 2 - 0.3));
        post.castShadow = true;
        g.add(post);
      }
      // striped roof
      for (let i = 0; i < 6; i++) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(L + 0.8, 0.35, (Wd + 1) / 6), i % 2 ? this.mats.roof2 : this.mats.roof);
        stripe.position.set(cx, floorY + 4.8 + Math.sin((i / 5) * Math.PI) * 0.6, -(Wd + 1) / 2 + (i + 0.5) * (Wd + 1) / 6);
        stripe.castShadow = true;
        g.add(stripe);
      }
      // supports under a raised station
      if (floorY > 0.4) {
        const legGeo = new THREE.CylinderGeometry(0.3, 0.35, floorY, 8);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const leg = new THREE.Mesh(legGeo, this.mats.support);
          leg.position.set(cx + sx * (L / 2 - 1), floorY / 2, sz * (Wd / 2 - 0.6));
          leg.castShadow = true;
          g.add(leg);
        }
      }
      const sign = makeLabel(dir < 0 ? '🎢 STATION' : '🏁 FINISH', { size: 1.6, bg: '#ffd166', fg: '#3b2500', border: '#3b2500', anchorBottom: true });
      sign.position.set(cx, floorY + 5.9, 0);
      g.add(sign);
      this.sceneryGroup.add(g);
    }

    buildEndFlag(p) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 6), this.mats.pole);
      pole.position.set(p.X, p.Y + 2.4, -1.2);
      this.sceneryGroup.add(pole);
      const lab = makeLabel('⚠ END OF TRACK', { size: 1.4, bg: '#ff4d6d', fg: '#fff', border: '#fff', anchorBottom: true });
      lab.position.set(p.X, p.Y + 4.5, -1.2);
      this.sceneryGroup.add(lab);
    }

    buildAxes(track, an, ls) {
      const b = track.bounds;
      // x-axis ruler on the ground beside the track
      const zr = -4.8;
      const x0 = b.minX - 6, x1 = b.maxX + 6;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.08, 0.35), this.mats.axis);
      bar.position.set((x0 + x1) / 2, 0.05, zr);
      bar.receiveShadow = true;
      this.sceneryGroup.add(bar);
      const span = an.b - an.a;
      const step = FC.niceStep(span, 7);
      const start = Math.ceil(an.a / step) * step;
      for (let v = start; v <= an.b + 1e-9; v += step) {
        const X = (v - track.xc) * track.Sx;
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.12), this.mats.axis);
        post.position.set(X, 0.6, zr);
        this.sceneryGroup.add(post);
        const lab = makeLabel('x = ' + FC.fmt(Math.abs(v) < step * 1e-6 ? 0 : v, 3), { size: ls * 0.75, anchorBottom: true, bg: 'rgba(255,255,255,0.9)' });
        lab.position.set(X, 1.3, zr);
        this.sceneryGroup.add(lab);
      }
      // y-axis tower at x = 0 (if 0 is near the track)
      const X0 = (0 - track.xc) * track.Sx;
      if (X0 >= b.minX - 30 && X0 <= b.maxX + 30) {
        const yTop = Math.max(an.yMax, 0), yBot = Math.min(an.yMin, 0);
        const Ytop = yTop * track.Sy + 4, Ybot = Math.max(yBot * track.Sy, -2);
        const zt = -7;
        const tower = new THREE.Mesh(new THREE.BoxGeometry(0.35, Ytop - Ybot, 0.35), this.mats.axis);
        tower.position.set(X0, (Ytop + Ybot) / 2, zt);
        tower.castShadow = true;
        this.sceneryGroup.add(tower);
        const ystep = FC.niceStep(yTop - yBot || 1, 6);
        for (let v = Math.ceil(yBot / ystep) * ystep; v <= yTop + 1e-9; v += ystep) {
          const Y = v * track.Sy;
          if (Y < -2) continue;
          const tick = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.1, 0.1), this.mats.axis);
          tick.position.set(X0, Y, zt);
          this.sceneryGroup.add(tick);
          const lab = makeLabel('y = ' + FC.fmt(Math.abs(v) < ystep * 1e-6 ? 0 : v, 3), { size: ls * 0.7 });
          lab.position.set(X0 - 1.3 - ls, Y, zt);
          lab.center.set(1, 0.5);
          this.sceneryGroup.add(lab);
        }
        const top = makeLabel('y-axis', { size: ls * 0.8, bg: '#23355f', fg: '#fff', border: '#fff', anchorBottom: true });
        top.position.set(X0, Ytop + 0.3, zt);
        this.sceneryGroup.add(top);
        if (an.yIntercept) {
          const Y = an.yIntercept.y * track.Sy;
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.14, 8, 20), new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x6b4a00 }));
          ring.position.set(X0, Y, zt); ring.rotation.x = Math.PI / 2;
          this.sceneryGroup.add(ring);
          const beam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, Math.abs(zt) - 0.8), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
          beam.position.set(X0, Y, zt / 2 - 0.4);
          this.sceneryGroup.add(beam);
        }
      }
    }

    buildLandmarks(track, an, ls) {
      const W = (x, y) => track.toWorld(x, y);
      const add = (o) => this.sceneryGroup.add(o);
      if (an.pw) {
        for (const p of an.pw.pieces) {
          const x = Math.max(p.lo, an.a);
          const y = p.f(isFinite(p.lo) && p.lo >= an.a ? p.lo : an.a);
          if (!isFinite(y) || x > an.b) continue;
          const q = W(x, y);
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 6), this.pieceMat(p.k));
          post.position.set(q.X, q.Y + 1.7, -2.8);
          add(post);
          const txt = 'piece ' + (p.k + 1) + ':  f(x) = ' + FCMath.toText(p.ast);
          const lab = makeLabel(txt.length > 48 ? txt.slice(0, 46) + '…' : txt, { size: ls * 0.7, bg: FC.pieceColor(p.k), fg: '#fff', border: '#fff', anchorBottom: true });
          lab.position.set(q.X, q.Y + 3.5, -2.8);
          add(lab);
        }
      }
      const coord = (x, y) => '(' + FC.fmtZ(x, 1, 2) + ', ' + FC.fmtZ(y, 1, 2) + ')';
      const flagGeo = new THREE.PlaneGeometry(1.6, 1.0);
      for (const m of an.maxima) {
        const p = W(m.x, m.y);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), this.mats.pole);
        pole.position.set(p.X, p.Y + 2.0, -1.0);
        add(pole);
        const flag = new THREE.Mesh(flagGeo, new THREE.MeshStandardMaterial({ color: 0xff4d6d, side: THREE.DoubleSide }));
        flag.position.set(p.X + 0.8, p.Y + 3.1, -1.0);
        flag.userData.wave = true;
        add(flag);
        const lab = makeLabel('⛰ MAX ' + coord(m.x, m.y), { size: ls, fg: '#b0183a', border: '#b0183a', anchorBottom: true });
        lab.position.set(p.X, p.Y + 3.9, -1.0);
        add(lab);
      }
      for (const m of an.minima) {
        const p = W(m.x, m.y);
        const lab = makeLabel('🕳 MIN ' + coord(m.x, m.y), { size: ls, fg: '#1f5fb8', border: '#1f5fb8' });
        lab.position.set(p.X, p.Y - 2.2, -2.2);
        add(lab);
      }
      for (const z of an.zeros) {
        const p = W(z.x, 0);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.2, 6), new THREE.MeshStandardMaterial({ color: 0x06d6a0 }));
        post.position.set(p.X, 1.1, -3.9);
        add(post);
        const disk = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.06, 24), new THREE.MeshStandardMaterial({ color: 0x06d6a0, emissive: 0x025c45 }));
        disk.position.set(p.X, 0.05, -3.9);
        add(disk);
        const lab = makeLabel('ZERO  x = ' + FC.fmt(z.x, 3), { size: ls * 0.9, fg: '#067a5b', border: '#067a5b', anchorBottom: true });
        lab.position.set(p.X, 2.3, -3.9);
        add(lab);
      }
      for (const m of an.inflections) {
        const p = W(m.x, m.y);
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.45), new THREE.MeshStandardMaterial({ color: 0xa06cf0, emissive: 0x3a1a70 }));
        gem.position.set(p.X, p.Y + 1.6, 1.6);
        gem.userData.spin = true;
        add(gem);
      }
      for (const g of an.gaps) {
        if (g.kind !== 'asymptote' || g.edge) continue;
        const X = (g.at - track.xc) * track.Sx;
        const h = Math.max(20, (track.bounds.maxY - track.bounds.minY) * 1.2);
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(0.4, h), new THREE.MeshBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
        wall.position.set(X, track.bounds.minY + h / 2 - 5, 0);
        wall.rotation.y = Math.PI / 2;
        add(wall);
        const lab = makeLabel('ASYMPTOTE  x ≈ ' + FC.fmt(g.at, 3), { size: ls, bg: '#ff4d6d', fg: '#fff', border: '#fff' });
        lab.position.set(X, Math.max(3, track.bounds.maxY * 0.6), -2);
        add(lab);
      }
    }

    buildScenery(track, R, ext) {
      const b = track.bounds;
      const rnd = FC.rng(FC.hashString(String(track.an.a) + ':' + track.an.b + ':' + track.an.yMax));
      // trees
      const N = 150;
      const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 1, 6).translate(0, 0.5, 0), this.mats.trunk, N);
      const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), this.mats.leaf, N);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const col = new THREE.Color();
      let k = 0;
      const span = Math.max(ext * 1.3, 120);
      for (let i = 0; i < N * 3 && k < N; i++) {
        const X = (b.minX + b.maxX) / 2 + (rnd() - 0.5) * 2 * span;
        const Z = (rnd() < 0.5 ? -1 : 1) * (14 + rnd() * span * 0.8);
        if (Math.abs(Z - 11) < 4) continue;
        const h = 4 + rnd() * 7;
        m4.compose(p.set(X, 0, Z), q.identity(), s.set(1, h * 0.35, 1)); trunk.setMatrixAt(k, m4);
        m4.compose(p.set(X, h * 0.3, Z), q.identity(), s.set(h * 0.32, h * 0.8, h * 0.32)); leaves.setMatrixAt(k, m4);
        leaves.setColorAt(k, col.setHSL(0.27 + rnd() * 0.08, 0.45 + rnd() * 0.2, 0.28 + rnd() * 0.12));
        k++;
      }
      trunk.count = k; leaves.count = k;
      trunk.castShadow = leaves.castShadow = true;
      this.sceneryGroup.add(trunk, leaves);
      // mountains
      const mR = R * 0.85;
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2 + rnd() * 0.2;
        const h = mR * (0.12 + rnd() * 0.18);
        const m = new THREE.Mesh(new THREE.ConeGeometry(h * (1.3 + rnd()), h, 6 + Math.floor(rnd() * 3)), this.mats.mountain);
        m.position.set((b.minX + b.maxX) / 2 + Math.cos(a) * mR, h / 2 - 2, Math.sin(a) * mR);
        m.rotation.y = rnd() * 3;
        this.sceneryGroup.add(m);
      }
      // clouds
      for (let i = 0; i < 16; i++) {
        const mat = new THREE.SpriteMaterial({ map: this.tex.cloud, transparent: true, depthWrite: false, opacity: 0.85, fog: false });
        const sp = new THREE.Sprite(mat);
        const sc = R * (0.12 + rnd() * 0.12);
        sp.scale.set(sc, sc / 2, 1);
        const a = rnd() * Math.PI * 2, r = R * (0.3 + rnd() * 0.5);
        sp.position.set((b.minX + b.maxX) / 2 + Math.cos(a) * r, Math.max(b.maxY, 40) + R * (0.12 + rnd() * 0.15), Math.sin(a) * r);
        sp.userData.drift = 0.5 + rnd();
        this.sceneryGroup.add(sp);
      }
      // a few colorful tents near the path
      const tentCols = [0xff4d6d, 0x4cc9f0, 0xffd166, 0xa06cf0];
      for (let i = 0; i < 5; i++) {
        const X = b.minX + (b.maxX - b.minX) * (0.1 + 0.8 * rnd());
        const tent = new THREE.Mesh(new THREE.ConeGeometry(2.4, 3.2, 8), new THREE.MeshStandardMaterial({ color: tentCols[i % 4], roughness: 0.7 }));
        tent.position.set(X, 1.6, 16 + rnd() * 6);
        tent.castShadow = true;
        this.sceneryGroup.add(tent);
      }
    }

    setGhost(track) {
      this.disposeGroup(this.ghostGroup);
      if (!track) return;
      for (const seg of track.segs) {
        const { P, N } = this.resample(track, seg);
        const pts = P.map((p, i) => new THREE.Vector3(p.x + N[i][0] * 0.3, p.y + N[i][1] * 0.3, 0));
        const m = this.tube(pts, 0.55, 8, this.mats.ghost, false);
        if (m) { m.receiveShadow = false; this.ghostGroup.add(m); }
      }
    }

    // -------------------------------------------------------------- train
    makeTrain() {
      const cars = [];
      const bodyShape = new THREE.Shape();
      bodyShape.moveTo(-1.2, 0); bodyShape.lineTo(1.1, 0); bodyShape.quadraticCurveTo(1.3, 0, 1.3, 0.25); bodyShape.lineTo(1.25, 0.55);
      bodyShape.lineTo(0.9, 0.62); bodyShape.lineTo(-1.1, 0.8); bodyShape.quadraticCurveTo(-1.25, 0.8, -1.25, 0.6); bodyShape.lineTo(-1.2, 0);
      const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, { depth: 1.5, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 });
      bodyGeo.translate(0, 0, -0.75);
      const noseShape = new THREE.Shape();
      noseShape.moveTo(0, 0); noseShape.lineTo(0.45, 0.04); noseShape.quadraticCurveTo(0.75, 0.2, 0.45, 0.42); noseShape.lineTo(0, 0.5); noseShape.lineTo(0, 0);
      const noseGeo = new THREE.ExtrudeGeometry(noseShape, { depth: 1.3, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
      noseGeo.translate(1.2, 0, -0.65);
      const wheelGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.16, 12); wheelGeo.rotateX(Math.PI / 2);
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
      const headGeo = new THREE.SphereGeometry(0.17, 12, 10);
      const torsoGeo = new THREE.BoxGeometry(0.3, 0.45, 0.32);
      const armGeo = new THREE.BoxGeometry(0.09, 0.5, 0.09); armGeo.translate(0, 0.25, 0);
      const barMat = new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: 0.4, roughness: 0.4 });
      const seatMat = new THREE.MeshStandardMaterial({ color: 0x1c1f2b, roughness: 0.8 });
      for (let i = 0; i < 3; i++) {
        const car = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: CAR_COLORS[i], metalness: 0.25, roughness: 0.4 });
        const body = new THREE.Mesh(bodyGeo, mat); body.castShadow = true; car.add(body);
        if (i === 0) {
          const nose = new THREE.Mesh(noseGeo, mat); nose.castShadow = true; car.add(nose);
          const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
          lamp.position.set(1.93, 0.24, 0); lamp.rotation.y = Math.PI / 2; car.add(lamp);
        }
        const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.1, 1.3), seatMat); seat.position.set(-0.2, 0.66, 0); car.add(seat);
        const riders = [];
        for (const z of [-0.36, 0.36]) {
          const r = new THREE.Group();
          const shirt = new THREE.MeshStandardMaterial({ color: SHIRTS[(i * 2 + (z > 0 ? 1 : 0)) % SHIRTS.length], roughness: 0.8 });
          const skin = new THREE.MeshStandardMaterial({ color: SKIN[(i * 3 + (z > 0 ? 2 : 0)) % SKIN.length], roughness: 0.7 });
          const torso = new THREE.Mesh(torsoGeo, shirt); torso.position.y = 0.22; r.add(torso);
          const head = new THREE.Mesh(headGeo, skin); head.position.y = 0.62; r.add(head);
          const armL = new THREE.Mesh(armGeo, shirt); armL.position.set(0, 0.4, -0.2); r.add(armL);
          const armR = new THREE.Mesh(armGeo, shirt); armR.position.set(0, 0.4, 0.2); r.add(armR);
          r.position.set(-0.25, 0.72, z);
          r.userData = { armL, armR };
          car.add(r); riders.push(r);
        }
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.2), barMat); bar.position.set(0.35, 1.05, 0); car.add(bar);
        for (const x of [-0.8, 0.8]) for (const z of [-0.62, 0.62]) {
          const w = new THREE.Mesh(wheelGeo, wheelMat); w.position.set(x, -0.08, z); car.add(w);
        }
        car.userData = { riders, arms: 0 };
        this.scene.add(car);
        cars.push(car);
      }
      return cars;
    }

    placeCar(car, p) {
      if (!p || p.hidden) { car.visible = false; return; }
      car.visible = true;
      const ang = Math.atan2(p.ty, p.tx);
      car.position.set(p.X - p.ty * 0.42, p.Y + p.tx * 0.42, 0);
      car.rotation.set(0, 0, ang);
    }

    placeTrainAtStart() {
      if (!this.track) return;
      const s0 = this.track.poseAt(this.track.segs[0], 0);
      for (let i = 0; i < this.cars.length; i++) {
        const u = -i * FCPhysics.CAR_SPACING;
        const X = s0.X + u;
        this.placeCar(this.cars[i], u === 0 ? s0 : { X, Y: s0.Y, tx: 1, ty: 0, hidden: u < -9 });
      }
    }

    // -------------------------------------------------------------- per frame
    update(dt, sim, state) {
      const t = performance.now() / 1000;
      let poses = null;
      if (sim && this.track) {
        poses = sim.carPoses(this.cars.length, FCPhysics.CAR_SPACING);
        poses.forEach((p, i) => this.placeCar(this.cars[i], p));
        // cheer: arms up when floating or plunging
        const thrill = sim.running !== false && (sim.Gdisp < 0.55 || (sim.pose && sim.pose.ty < -0.55 && Math.abs(sim.v) > 8));
        for (const car of this.cars) {
          car.userData.arms += ((thrill ? 1 : 0) - car.userData.arms) * Math.min(1, dt * 6);
          for (const r of car.userData.riders) {
            const a = FC.lerp(-0.35, -2.8, car.userData.arms);
            r.userData.armL.rotation.x = -a * 0.25; r.userData.armL.rotation.z = a;
            r.userData.armR.rotation.x = a * 0.25; r.userData.armR.rotation.z = a;
          }
        }
        // new flights → dashed paths
        const flights = sim.pieces.filter((p) => p.kind === 'flight');
        if (flights.length !== this.flightCount) {
          for (let i = this.flightCount; i < flights.length; i++) {
            const f = flights[i];
            const g = new THREE.BufferGeometry().setFromPoints(f.pts.map((q) => new THREE.Vector3(q[0], q[1], 0)));
            const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0xa06cf0, dashSize: 1.2, gapSize: 0.8 }));
            line.computeLineDistances();
            this.fxGroup.add(line);
          }
          this.flightCount = flights.length;
        }
      }
      const riderHide = this.camMode === 'pov' || this.renderer.xr.isPresenting;
      for (const r of this.cars[0].userData.riders) r.visible = !riderHide;
      // decorations; signs fade out when the camera is right on top of them
      const cp = this.camera.position;
      const near = this.camMode === 'pov' ? 14 : this.camMode === 'chase' ? 16 : 5;
      this.sceneryGroup.traverse((o) => {
        if (!o.userData.label || !o.material) return;
        const d = o.getWorldPosition(this._tmpV || (this._tmpV = new THREE.Vector3())).distanceTo(cp);
        o.material.opacity = FC.clamp((d - near * 0.35) / (near * 0.65), 0, 1);
        o.visible = o.material.opacity > 0.02;
      });
      this.sceneryGroup.children.forEach((o) => {
        if (o.userData.wave) o.rotation.y = Math.sin(t * 3 + o.position.x) * 0.25;
        if (o.userData.spin) o.rotation.y += dt * 1.5;
        if (o.userData.drift) { o.position.x += dt * o.userData.drift * 2; }
      });
      // particles
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const pr = this.particles[i];
        pr.life -= dt;
        if (pr.life <= 0) { this.fxGroup.remove(pr.mesh); pr.mesh.geometry.dispose(); pr.mesh.material.dispose(); this.particles.splice(i, 1); continue; }
        const pos = pr.mesh.geometry.attributes.position;
        for (let k = 0; k < pos.count; k++) {
          pr.vel[k * 3 + 1] -= 9.81 * dt * 0.4;
          pos.setXYZ(k, pos.getX(k) + pr.vel[k * 3] * dt, Math.max(0.05, pos.getY(k) + pr.vel[k * 3 + 1] * dt), pos.getZ(k) + pr.vel[k * 3 + 2] * dt);
        }
        pos.needsUpdate = true;
        pr.mesh.material.opacity = Math.max(0, pr.life / pr.max);
      }
      this.updateCamera(dt, sim, poses, state);
      this.sky.position.copy(this.camera.position);
    }

    burst(X, Y, color = 0xc9a97a, n = 70) {
      const pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        pos.set([X, Y + 0.3, (Math.random() - 0.5) * 2], i * 3);
        const a = Math.random() * Math.PI * 2, s = 3 + Math.random() * 9;
        vel.set([Math.cos(a) * s, 2 + Math.random() * 8, Math.sin(a) * s], i * 3);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const m = new THREE.PointsMaterial({ color, size: 0.6, transparent: true, opacity: 1, depthWrite: false });
      const pts = new THREE.Points(g, m);
      this.fxGroup.add(pts);
      this.particles.push({ mesh: pts, vel, life: 2.2, max: 2.2 });
    }

    applyOrbit(k) {
      const o = this.orbit;
      const pos = new THREE.Vector3(
        o.target.x + o.dist * Math.sin(o.phi) * Math.sin(o.theta),
        o.target.y + o.dist * Math.cos(o.phi),
        o.target.z + o.dist * Math.sin(o.phi) * Math.cos(o.theta),
      );
      pos.y = Math.max(pos.y, 1.5);
      this.camera.position.lerp(pos, k);
      this.camera.up.set(0, 1, 0);
      this.camera.lookAt(o.target);
    }

    updateCamera(dt, sim, poses, state) {
      const cam = this.camera;
      const mode = this.camMode;
      if (this.renderer.xr.isPresenting) {
        // The lead car's transform is authoritative, including when stopped.
        // Keep the horizon level for comfort, while steering the forward axis
        // along the horizontal projection of the track (+X for this 2D ride).
        const car = this.cars[0];
        if (car && car.visible) {
          // local-floor supplies headset eye height. The rig is placed at the
          // seat/floor origin, NOT at eye height (which would double-count it).
          this.vrRig.position.set(car.position.x, car.position.y + 0.35, car.position.z);
          this.vrRig.rotation.set(0, -Math.PI / 2, 0);
        } else if (this.track) {
          const p = this.track.poseAt(this.track.segs[0], 0);
          this.vrRig.position.set(p.X, p.Y + 0.77, 0);
          this.vrRig.rotation.set(0, -Math.PI / 2, 0);
        }
        this.blend = null;
        return;
      }
      const now = performance.now();
      let fov = 55;
      const tmp = new THREE.Vector3();
      const desired = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
      const lead = poses ? poses[0] : null;
      const leadPose = lead && !lead.hidden ? lead : (this.track ? Object.assign({ X: this.track.poseAt(this.track.segs[0], 0).X, Y: this.track.poseAt(this.track.segs[0], 0).Y, tx: 1, ty: 0 }) : null);
      if (mode === 'orbit' || !leadPose) {
        if (this.orbit.auto || now - this.orbit.lastInteract > 12000) { this.orbit.auto = true; this.orbit.theta += dt * 0.06; }
        const o = this.orbit;
        desired.pos.set(o.target.x + o.dist * Math.sin(o.phi) * Math.sin(o.theta), o.target.y + o.dist * Math.cos(o.phi), o.target.z + o.dist * Math.sin(o.phi) * Math.cos(o.theta));
        desired.pos.y = Math.max(desired.pos.y, 1.5);
        const m = new THREE.Matrix4().lookAt(desired.pos, o.target, new THREE.Vector3(0, 1, 0));
        desired.quat.setFromRotationMatrix(m);
        fov = 50;
      } else if (mode === 'pov') {
        const p = leadPose;
        const nx = -p.ty, ny = p.tx;
        desired.pos.set(p.X + nx * 2.05 + p.tx * 1.1, p.Y + ny * 2.05 + p.ty * 1.1, 0);
        // look ahead along the path
        let ahead = null;
        if (sim) ahead = sim.poseAtU(sim.u + 9);
        let fx = p.tx, fy = p.ty;
        if (ahead && !ahead.hidden) {
          const ax = ahead.X - p.X, ay = ahead.Y - p.Y;
          const L = Math.hypot(ax, ay) || 1;
          fx = FC.lerp(p.tx, ax / L, 0.55); fy = FC.lerp(p.ty, ay / L, 0.55);
          const L2 = Math.hypot(fx, fy) || 1; fx /= L2; fy /= L2;
        }
        const fwd = new THREE.Vector3(fx, fy, 0);
        const up = new THREE.Vector3(-fy, fx, 0);
        // look-around offsets
        if (!this.look.dragging) { this.look.yaw *= Math.exp(-dt * 2.5); this.look.pitch *= Math.exp(-dt * 2.5); }
        const right = new THREE.Vector3().crossVectors(fwd, up);
        fwd.applyAxisAngle(up, this.look.yaw);
        right.crossVectors(fwd, up).normalize();
        fwd.applyAxisAngle(right, this.look.pitch);
        up.crossVectors(right, fwd).normalize();
        const m = new THREE.Matrix4().lookAt(desired.pos, tmp.copy(desired.pos).add(fwd), up);
        desired.quat.setFromRotationMatrix(m);
        const sp = sim ? Math.abs(sim.v) : 0;
        fov = 72 + Math.min(16, sp * 0.35);
        // shake
        if (sim && sp > 6) {
          const a = Math.min(0.06, sp * 0.0012);
          desired.pos.x += (Math.random() - 0.5) * a; desired.pos.y += (Math.random() - 0.5) * a;
        }
      } else if (mode === 'chase') {
        const last = poses ? poses[poses.length - 1] : leadPose;
        const tail = last && !last.hidden ? last : leadPose;
        const back = new THREE.Vector3(-tail.tx, -tail.ty, 0).multiplyScalar(11);
        desired.pos.set(tail.X, tail.Y, 0).add(back).add(new THREE.Vector3(0, 4.5, 7.5));
        desired.pos.y = Math.max(desired.pos.y, 1.2);
        const tgt = new THREE.Vector3(leadPose.X + leadPose.tx * 4, leadPose.Y + leadPose.ty * 4 + 1, 0);
        const m = new THREE.Matrix4().lookAt(desired.pos, tgt, new THREE.Vector3(0, 1, 0));
        desired.quat.setFromRotationMatrix(m);
        fov = 60;
      } else if (mode === 'side') {
        const b = this.track.bounds;
        const D = 30 + Math.max(0, (b.maxY - b.minY)) * 0.55;
        desired.pos.set(leadPose.X, leadPose.Y + 3 + D * 0.08, D);
        const tgt = new THREE.Vector3(leadPose.X, leadPose.Y, 0);
        const m = new THREE.Matrix4().lookAt(desired.pos, tgt, new THREE.Vector3(0, 1, 0));
        desired.quat.setFromRotationMatrix(m);
        fov = 45;
      }
      // smoothing
      let kPos = mode === 'pov' ? 1 : 1 - Math.exp(-dt * 6);
      let kRot = mode === 'pov' ? 1 - Math.exp(-dt * 14) : 1 - Math.exp(-dt * 8);
      if (mode === 'orbit') { kPos = 1; kRot = 1; }
      if (this.blend) {
        this.blend.t += dt;
        const e = FC.smooth(FC.clamp(this.blend.t / this.blend.dur, 0, 1));
        cam.position.lerpVectors(this.blend.from, desired.pos, e);
        cam.quaternion.slerpQuaternions(this.blend.q, desired.quat, e);
        if (this.blend.t >= this.blend.dur) this.blend = null;
      } else {
        cam.position.lerp(desired.pos, kPos);
        cam.quaternion.slerp(desired.quat, kRot);
      }
      cam.near = mode === 'pov' ? 0.05 : 0.3;
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
    }

    render() { this.renderer.render(this.scene, this.camera); }
  }

  let PolyCurve = null;
  function defineCurve() {
    PolyCurve = class extends THREE.Curve {
      constructor(pts) { super(); this.pts = pts; }
      getPoint(t, target = new THREE.Vector3()) {
        const n = this.pts.length - 1;
        const f = FC.clamp(t, 0, 1) * n;
        const i = Math.min(Math.floor(f), n - 1);
        return target.copy(this.pts[i]).lerp(this.pts[i + 1], f - i);
      }
      getPointAt(u, target) { return this.getPoint(u, target); }
      getTangentAt(u, target) { return this.getTangent(u, target); }
      getUtoTmapping(u) { return u; }
    };
  }

  return {
    async create(host) {
      await load();
      defineCurve();
      return new World(host);
    },
    get THREE() { return THREE; },
  };
})();
