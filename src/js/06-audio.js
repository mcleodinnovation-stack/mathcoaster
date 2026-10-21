/* =====================================================================
   FCAudio — synthesized ride sounds (no audio files needed)
   ===================================================================== */
var FCAudio = (function () {
  let ctx = null, master = null, windGain = null, windFilter = null, rumbleGain = null, tone = null, toneGain = null;
  let enabled = true, sonify = false, clackTimer = 0;
  let volume = 0.7;

  function noiseBuffer(c, seconds = 2) {
    const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.6 + last * 3; }
    return b;
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = enabled ? volume : 0; master.connect(ctx.destination);
    const nb = noiseBuffer(ctx);
    const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
    windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 500; windFilter.Q.value = 0.7;
    windGain = ctx.createGain(); windGain.gain.value = 0;
    src.connect(windFilter).connect(windGain).connect(master);
    const src2 = ctx.createBufferSource(); src2.buffer = nb; src2.loop = true; src2.playbackRate.value = 0.5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
    rumbleGain = ctx.createGain(); rumbleGain.gain.value = 0;
    src2.connect(lp).connect(rumbleGain).connect(master);
    src.start(); src2.start();
    tone = ctx.createOscillator(); tone.type = 'triangle'; tone.frequency.value = 330;
    toneGain = ctx.createGain(); toneGain.gain.value = 0;
    tone.connect(toneGain).connect(master); tone.start();
  }

  function setEnabled(on) {
    enabled = on;
    if (master) master.gain.setTargetAtTime(on ? volume : 0, ctx.currentTime, 0.05);
  }
  function setSonify(on) { sonify = on; if (!on && toneGain) toneGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); }

  /** Continuous ride sound. speed m/s, heightFrac 0..1, lifting bool, riding bool. */
  function update(dt, s) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const v = s.riding ? Math.abs(s.speed) : 0;
    windGain.gain.setTargetAtTime(Math.min(0.5, (v * v) / 2600), t, 0.08);
    windFilter.frequency.setTargetAtTime(300 + v * 38, t, 0.1);
    rumbleGain.gain.setTargetAtTime(s.riding && s.onTrack ? Math.min(0.45, 0.06 + v / 70) : 0, t, 0.1);
    if (sonify && s.riding) {
      toneGain.gain.setTargetAtTime(0.07, t, 0.05);
      tone.frequency.setTargetAtTime(196 * Math.pow(2, 2.5 * FC.clamp(s.heightFrac, 0, 1)), t, 0.03);
    } else toneGain.gain.setTargetAtTime(0, t, 0.05);
    if (s.riding && s.lifting) {
      clackTimer -= dt;
      if (clackTimer <= 0) { clack(); clackTimer = 0.22; }
    }
  }

  function env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function clack() {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 900 + Math.random() * 200;
    const g = ctx.createGain(); env(g, t, 0.002, 0.04, 0.12);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 600;
    o.connect(f).connect(g).connect(master); o.start(t); o.stop(t + 0.06);
  }
  function blip(freq = 880, dur = 0.12, type = 'sine', vol = 0.18, delay = 0) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    const g = ctx.createGain(); env(g, t, 0.01, dur, vol);
    o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function whoosh(dur = 0.9) {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, 1.2);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2600, t + dur);
    const g = ctx.createGain(); env(g, t, 0.05, dur, 0.4);
    src.connect(f).connect(g).connect(master); src.start(t); src.stop(t + dur + 0.1);
  }
  function thud() {
    if (!ctx || !enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    const g = ctx.createGain(); env(g, t, 0.005, 0.45, 0.7);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.5);
    whoosh(0.35);
  }
  function fanfare() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, 0.22, 'triangle', 0.16, i * 0.11));
  }
  function landmark(type) {
    const f = { zero: 660, max: 988, min: 523, inflection: 740, yint: 880, corner: 220, steepest: 587 }[type] || 700;
    blip(f, 0.1, 'sine', 0.1);
  }

  return {
    init, update, setEnabled, setSonify, blip, whoosh, thud, fanfare, landmark, clack,
    get enabled() { return enabled; }, get sonify() { return sonify; },
    setVolume(v) { volume = v; if (master && enabled) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05); },
  };
})();
