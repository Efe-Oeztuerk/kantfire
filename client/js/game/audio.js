// Komplett synthetisierter Sound (WebAudio) mit räumlicher HRTF-Wiedergabe.
// Keine fremden Audiodateien nötig – alle Geräusche werden zur Laufzeit erzeugt.
import { settings, onSettings } from '../settings.js';

class Audio {
  constructor() { this.ctx = null; this.buses = {}; this.musicOn = false; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.connect(ctx.destination);
    for (const b of ['music', 'weapons', 'steps', 'ambient', 'ui']) { this.buses[b] = ctx.createGain(); this.buses[b].connect(this.master); }
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    onSettings(() => this.applyVolumes());
  }
  applyVolumes() {
    if (!this.ctx) return;
    const a = settings.audio;
    this.master.gain.value = a.master;
    for (const b of Object.keys(this.buses)) this.buses[b].gain.value = a[b];
  }

  setListener(pos, fwd) {
    if (!this.ctx) return;
    const l = this.ctx.listener, t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos[0], t); l.positionY.setValueAtTime(pos[1], t); l.positionZ.setValueAtTime(pos[2], t);
      l.forwardX.setValueAtTime(fwd[0], t); l.forwardY.setValueAtTime(fwd[1], t); l.forwardZ.setValueAtTime(fwd[2], t);
      l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t);
    } else { l.setPosition(...pos); l.setOrientation(...fwd, 0, 1, 0); }
  }

  out(bus, pos, ref = 3) {
    const g = this.ctx.createGain();
    if (pos) {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 1.1; p.maxDistance = 200;
      p.positionX ? (p.positionX.value = pos[0], p.positionY.value = pos[1], p.positionZ.value = pos[2]) : p.setPosition(...pos);
      g.connect(p); p.connect(this.buses[bus]);
    } else g.connect(this.buses[bus]);
    return g;
  }

  noiseHit({ bus = 'weapons', pos = null, dur = 0.15, freq = 1200, q = 0.8, type = 'bandpass', gain = 0.8, attack = 0.002, ref = 3, pitchEnd = null }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (pitchEnd) f.frequency.exponentialRampToValueAtTime(pitchEnd, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.out(bus, pos, ref));
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  tone({ bus = 'ui', pos = null, freq = 800, end = null, dur = 0.1, type = 'sine', gain = 0.3, delay = 0 }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (end) o.frequency.exponentialRampToValueAtTime(end, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.005); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.out(bus, pos));
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------- Spielgeräusche
  gun(cat, pos, wid) {
    if (!this.ctx) return;
    const P = {
      pistol: { f: 1800, d: 0.18, th: 140, g: 0.7 }, smg: { f: 2200, d: 0.14, th: 120, g: 0.55 }, rifle: { f: 1400, d: 0.24, th: 90, g: 0.8 },
      shotgun: { f: 900, d: 0.4, th: 70, g: 0.95 }, dmr: { f: 1200, d: 0.35, th: 80, g: 0.85 }, sniper: { f: 900, d: 0.7, th: 55, g: 1 }, heavy: { f: 1300, d: 0.26, th: 80, g: 0.85 },
    }[cat] || { f: 1500, d: 0.2, th: 100, g: 0.7 };
    const ref = pos ? 6 : 3;
    this.noiseHit({ pos, dur: P.d, freq: P.f, q: 0.6, gain: P.g, ref });
    this.noiseHit({ pos, dur: P.d * 2.2, freq: 500, q: 0.4, type: 'lowpass', gain: P.g * 0.5, ref, pitchEnd: 120 });
    this.tone({ bus: 'weapons', pos, freq: P.th, end: 40, dur: 0.12, type: 'triangle', gain: P.g * 0.7 });
  }
  dry() { this.tone({ bus: 'weapons', freq: 2400, dur: 0.03, type: 'square', gain: 0.1 }); }
  reload(pos) {
    this.noiseHit({ pos, dur: 0.05, freq: 3000, q: 4, gain: 0.35 });
    setTimeout(() => this.noiseHit({ pos, dur: 0.06, freq: 2200, q: 4, gain: 0.4 }), 450);
    setTimeout(() => this.noiseHit({ pos, dur: 0.05, freq: 3500, q: 5, gain: 0.35 }), 800);
  }
  swing(pos) { this.noiseHit({ pos, dur: 0.18, freq: 1500, q: 1, gain: 0.3, attack: 0.05, pitchEnd: 600 }); }
  step(mat, pos, own = false) {
    const m = { cont: [3200, 6, 0.35], plat: [2600, 4, 0.3], shelf: [2600, 4, 0.3], crate: [700, 2, 0.35], crate2: [700, 2, 0.35], floor: [900, 1.2, 0.3] }[mat] || [900, 1.2, 0.3];
    const sand = mat === 'sand';
    this.noiseHit({ bus: 'steps', pos, dur: sand ? 0.12 : 0.07, freq: sand ? 500 : m[0], q: m[1], gain: (own ? 0.18 : 0.6) * m[2] * 3, ref: 2.5 });
  }
  land(pos, own) { this.noiseHit({ bus: 'steps', pos, dur: 0.12, freq: 300, q: 1, type: 'lowpass', gain: own ? 0.3 : 0.6 }); }
  jump(pos, own) { this.noiseHit({ bus: 'steps', pos, dur: 0.06, freq: 800, q: 1, gain: own ? 0.12 : 0.35 }); }
  hit(head) {
    if (head) { this.tone({ bus: 'ui', freq: 2600, dur: 0.25, type: 'sine', gain: 0.35 }); this.tone({ bus: 'ui', freq: 3900, dur: 0.2, type: 'sine', gain: 0.2 }); }
    else this.tone({ bus: 'ui', freq: 1400, dur: 0.05, type: 'square', gain: 0.12 });
  }
  hurt() { this.noiseHit({ bus: 'ui', dur: 0.12, freq: 300, q: 1, type: 'lowpass', gain: 0.5 }); }
  kill() { this.tone({ bus: 'ui', freq: 880, end: 1760, dur: 0.18, type: 'triangle', gain: 0.3 }); this.tone({ bus: 'ui', freq: 1320, dur: 0.25, type: 'sine', gain: 0.2, delay: 0.08 }); }
  boom(pos) {
    this.noiseHit({ pos, dur: 1.4, freq: 900, q: 0.4, type: 'lowpass', gain: 1, ref: 8, pitchEnd: 60 });
    this.tone({ bus: 'weapons', pos, freq: 90, end: 25, dur: 1, type: 'sine', gain: 0.9 });
  }
  bounce(pos) { this.noiseHit({ pos, dur: 0.04, freq: 2500, q: 3, gain: 0.25 }); }
  beep(pos) { this.tone({ bus: 'weapons', pos, freq: 1900, dur: 0.09, type: 'square', gain: 0.18 }); }
  plantTick(pos) { this.tone({ bus: 'weapons', pos, freq: 1200, dur: 0.05, type: 'square', gain: 0.12 }); }
  smoke(pos) { this.noiseHit({ pos, dur: 2.5, freq: 1800, q: 0.3, gain: 0.3, attack: 0.2, pitchEnd: 400 }); }
  ui(kind = 'click') {
    if (kind === 'click') this.tone({ freq: 900, dur: 0.05, gain: 0.15 });
    else if (kind === 'buy') { this.tone({ freq: 700, dur: 0.06, gain: 0.2 }); this.tone({ freq: 1100, dur: 0.08, gain: 0.2, delay: 0.05 }); }
    else if (kind === 'error') this.tone({ freq: 200, dur: 0.15, type: 'square', gain: 0.12 });
    else if (kind === 'round') { [523, 659, 784].forEach((f, i) => this.tone({ freq: f, dur: 0.3, type: 'triangle', gain: 0.25, delay: i * 0.12 })); }
    else if (kind === 'lose') { [392, 330, 262].forEach((f, i) => this.tone({ freq: f, dur: 0.35, type: 'triangle', gain: 0.25, delay: i * 0.14 })); }
    else if (kind === 'level') { [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, dur: 0.25, type: 'triangle', gain: 0.25, delay: i * 0.08 })); }
  }

  // ---------------------------------------------------------- Musik & Atmosphäre
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    const ctx = this.ctx;
    const chords = [[220, 277, 330], [196, 247, 294], [174.6, 220, 262], [196, 247, 330]];
    const bus = this.buses.music;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(bus);
    this.musicNode = lp;
    let i = 0;
    const play = () => {
      if (!this.musicOn) return;
      const t = ctx.currentTime;
      const ch = chords[i++ % chords.length];
      for (const f of ch) for (const det of [-4, 4]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.025, t + 0.8); g.gain.linearRampToValueAtTime(0, t + 4);
        o.connect(g); g.connect(lp); o.start(t); o.stop(t + 4.1);
      }
      for (let n = 0; n < 8; n++) {
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = ch[n % 3] * 2;
        const g = ctx.createGain(); const st = t + n * 0.5;
        g.gain.setValueAtTime(0, st); g.gain.linearRampToValueAtTime(0.04, st + 0.01); g.gain.exponentialRampToValueAtTime(0.001, st + 0.4);
        o.connect(g); g.connect(lp); o.start(st); o.stop(st + 0.45);
      }
      const k = ctx.createOscillator(); k.frequency.setValueAtTime(110, t); k.frequency.exponentialRampToValueAtTime(40, t + 0.3);
      const kg = ctx.createGain(); kg.gain.setValueAtTime(0.15, t); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      k.connect(kg); kg.connect(lp); k.start(t); k.stop(t + 0.4);
      this.musicTimer = setTimeout(play, 4000);
    };
    play();
  }
  stopMusic() { this.musicOn = false; clearTimeout(this.musicTimer); }

  startAmbient(kind) {
    if (!this.ctx) return;
    this.stopAmbient();
    const src = this.ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'indoor' ? 180 : kind === 'city' ? 600 : 400;
    const g = this.ctx.createGain(); g.gain.value = kind === 'city' ? 0.18 : 0.1;
    src.connect(f); f.connect(g); g.connect(this.buses.ambient);
    src.start();
    // langsames Wind-LFO
    const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lg = this.ctx.createGain(); lg.gain.value = 0.05; lfo.connect(lg); lg.connect(g.gain); lfo.start();
    this.amb = [src, lfo];
  }
  stopAmbient() { if (this.amb) { this.amb.forEach((n) => { try { n.stop(); } catch {} }); this.amb = null; } }
}

export const audio = new Audio();
