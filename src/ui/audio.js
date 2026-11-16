// Synthesized WebAudio: paddle pops, bounces, net, crowd bed + cheers, whistle, UI clicks. No assets.
export function createAudio() {
  let ctx = null, master = null, sfx = null, crowdGain = null, noiseBuf = null;
  let muted = false, volume = 0.8, started = false, crowdOn = true, hold = false;
  const api = { get ready() { return !!ctx; }, get state() { return ctx ? ctx.state : 'none'; }, log: [] };

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : volume; master.connect(ctx.destination);
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
      comp.connect(master);
      sfx = ctx.createGain(); sfx.gain.value = 1; sfx.connect(comp);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      let b0 = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.97 * b0 + 0.03 * w; d[i] = w * 0.6 + b0 * 4; }
      crowdGain = ctx.createGain(); crowdGain.gain.value = 0; crowdGain.connect(comp);
    } catch (e) { ctx = null; }
    return ctx;
  }

  function startCrowd() {
    if (!ensure() || started) return;
    started = true;
    try {
      const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.4;
      const g = ctx.createGain(); g.gain.value = 0.05;
      src.connect(lp); lp.connect(bp); bp.connect(g); g.connect(crowdGain);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13;
      const lg = ctx.createGain(); lg.gain.value = 0.02; lfo.connect(lg); lg.connect(g.gain); lfo.start();
      src.start();
      crowdGain.gain.setTargetAtTime(crowdOn ? 1 : 0, ctx.currentTime, 1.5);
    } catch (e) { /* ignore */ }
  }

  function pan(node, x) {
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-0.8, Math.min(0.8, x / 5)); node.connect(p); p.connect(sfx); } else node.connect(sfx);
  }
  function noiseBurst(t, dur, freq, q, gain, x = 0, type = 'bandpass') {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); pan(g, x);
    s.start(t, Math.random() * 1.5, dur + 0.05);
  }
  function tone(t, f0, f1, dur, gain, type = 'sine', x = 0) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); pan(g, x); o.start(t); o.stop(t + dur + 0.03);
  }

  const needsResume = () => ctx && (ctx.state === 'suspended' || ctx.state === 'interrupted');   // Safari reports 'interrupted' after tab switches / calls
  // Called on any keydown / pointerdown: creates the context, wakes it from 'suspended' / 'interrupted' (unless we paused it on purpose).
  // iOS Safari only lets a context start from touchend / click (not touchstart / pointerdown), so main.js calls this from all of them;
  // the first successful call also plays a 1-sample silent buffer (the classic unlock) and asks iOS 17+ to use the "playback" audio
  // session so the ringer switch does not mute the game.
  // iOS: the hardware ringer switch mutes WebAudio unless the page is in the "playback" audio session. iOS 17+ has an API for it;
  // older iOS only switches when an HTML <audio> element is playing, so we loop a silent one there.
  const setSession = () => { try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ } };
  let silentEl = null;
  function silentWavUrl() {
    const n = 4000, buf = new ArrayBuffer(44 + n), v = new DataView(buf);   // 0.5 s of 8 kHz 8-bit mono silence
    const str = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
    new Uint8Array(buf, 44).fill(128);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  const isIOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  function keepAlive(on) {
    if (!isIOS || navigator.audioSession) return;
    try {
      if (on) {
        if (!silentEl) { silentEl = new Audio(silentWavUrl()); silentEl.loop = true; silentEl.setAttribute('playsinline', ''); silentEl.preload = 'auto'; }
        if (silentEl.paused) { const pr = silentEl.play(); if (pr && pr.catch) pr.catch(() => {}); }
      } else if (silentEl && !silentEl.paused) silentEl.pause();
    } catch (e) { /* ignore */ }
  }
  function prime() {
    if (!ctx) return;
    setSession();
    try { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) { /* ignore */ }
  }
  // evType: the DOM event that triggered the call. pointerdown / touchstart are not accepted by iOS as a gesture for audio, and a
  // context created there can stay stuck, so we wait for the touchend / click / keydown that follows.
  api.unlock = (evType) => {
    try {
      if (evType === 'pointerdown' || evType === 'touchstart') { if (!ctx) return; }
      setSession();
      if (!ensure()) return;
      if (!hold) keepAlive(true);
      if (!hold && needsResume()) { ctx.resume().catch(() => {}); prime(); }
      startCrowd();
    } catch (e) { /* audio must never break input handling */ }
  };
  /** Crowd bed on/off (off while the pause screen is up). */
  api.setCrowd = (on) => { crowdOn = !!on; if (crowdGain) crowdGain.gain.setTargetAtTime(crowdOn ? 1 : 0, ctx.currentTime, 0.12); };
  api.setMuted = (m) => { muted = !!m; if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.02); };
  api.setVolume = (v) => { volume = v; if (master && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02); };
  api.suspend = () => { hold = true; keepAlive(false); if (ctx && ctx.state === 'running') ctx.suspend().catch(() => {}); };
  api.resume = () => { hold = false; if (needsResume()) ctx.resume().catch(() => {}); };

  api.pop = (power = 0.5, x = 0, smash = false) => {
    if (!ensure() || ctx.state !== 'running') return;
    const t = ctx.currentTime, p = Math.max(0, Math.min(1, power));
    const base = 1250 + 800 * (1 - p) - (smash ? 350 : 0);
    tone(t, base * 1.5, base * 0.62, 0.07, 0.34 + 0.3 * p, 'triangle', x);
    tone(t, base * 3.1, base * 1.8, 0.03, 0.12 + 0.12 * p, 'square', x);
    noiseBurst(t, 0.045, 2600 + 1200 * p, 1.2, 0.35 + 0.3 * p, x);
    if (smash) { tone(t, 180, 60, 0.18, 0.4, 'sine', x); noiseBurst(t, 0.12, 900, 0.7, 0.4, x); }
  };
  api.bounce = (speed = 5, x = 0) => {
    if (!ensure() || ctx.state !== 'running') return;
    const t = ctx.currentTime, v = Math.min(1, speed / 14);
    tone(t, 300, 150, 0.05, 0.12 + 0.2 * v, 'sine', x);
    noiseBurst(t, 0.03, 1800, 0.8, 0.07 + 0.12 * v, x);
  };
  api.net = () => {
    if (!ensure() || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    noiseBurst(t, 0.22, 380, 0.5, 0.5, 0); tone(t, 140, 70, 0.2, 0.3, 'sine', 0);
  };
  api.click = () => {
    if (!ensure() || ctx.state !== 'running') return;
    const t = ctx.currentTime; tone(t, 880, 620, 0.05, 0.12, 'triangle'); tone(t + 0.02, 1320, 1000, 0.05, 0.07, 'sine');
  };
  api.hover = () => {
    if (!ensure() || ctx.state !== 'running') return;
    tone(ctx.currentTime, 1100, 1000, 0.025, 0.035, 'sine');
  };
  api.whistle = () => {
    if (!ensure() || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    for (const [off, dur] of [[0, 0.16], [0.2, 0.3]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(2750, t + off);
      const l = ctx.createOscillator(); l.frequency.value = 38; const lg = ctx.createGain(); lg.gain.value = 70; l.connect(lg); lg.connect(o.frequency);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t + off); g.gain.exponentialRampToValueAtTime(0.16, t + off + 0.02); g.gain.exponentialRampToValueAtTime(0.0005, t + off + dur);
      o.connect(g); g.connect(sfx); o.start(t + off); l.start(t + off); o.stop(t + off + dur + 0.05); l.stop(t + off + dur + 0.05);
    }
  };
  api.cheer = (amount = 0.5) => {
    if (!ensure() || ctx.state !== 'running') return;
    const t = ctx.currentTime, a = Math.max(0.1, Math.min(1.5, amount));
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(900 + 300 * a, t + 0.5); f.Q.value = 0.7;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18 * a, t + 0.35); g.gain.exponentialRampToValueAtTime(0.0005, t + 1.2 + a * 1.2);
    s.connect(f); f.connect(g); g.connect(sfx); s.start(t, Math.random(), 3);
  };
  api.jingle = (win) => {
    if (!ensure() || ctx.state !== 'running') return;
    const t = ctx.currentTime, notes = win ? [523, 659, 784, 1046] : [392, 349, 311, 262];
    notes.forEach((f, i) => tone(t + i * 0.13, f, f * 0.99, 0.3, 0.16, 'triangle'));
  };

  // route sim events to sounds
  api.onEvents = (events) => {
    for (const e of events) {
      switch (e.type) {
        case 'hit': api.pop(e.isServe ? 0.35 : (e.power ?? 0.5), e.pos ? e.pos.x : 0, e.shot === 'smash'); break;
        case 'bounce': api.bounce(e.speed, e.pos ? e.pos.x : 0); break;
        case 'netTouch': api.net(); break;
        case 'fault': api.whistle(); break;
        case 'rallyEnd': api.cheer(e.highlight ? 1.2 : 0.5); break;
        case 'gameOver': api.cheer(1.5); api.jingle(e.winnerTeam === 0); break;
        default: break;
      }
    }
  };
  return api;
}
