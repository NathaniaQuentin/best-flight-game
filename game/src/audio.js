// Synthesized sound for Meridian Airlift: engine hum, wind, chimes, fanfares and a
// small music loop, all made with WebAudio oscillators — no audio files at all.

/** Chord pads for the music loop: Am — F — C — G, one bar each. */
const CHORDS = [
  [220.0, 261.63, 329.63],
  [174.61, 220.0, 261.63],
  [196.0, 246.94, 329.63],
  [164.81, 196.0, 246.94],
];
const BASSLINE = [55, 55, 65.41, 49, 55, 55, 65.41, 73.42];
const BAR_SECONDS = 2.4;

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.windGain = null;
    this.musicTimer = null;
    this.bar = 0;
  }

  /** Start audio after a user gesture; safe to call twice. */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    const ctx = this.ctx;
    // Engine: a low sawtooth through a lowpass, pitch follows the throttle.
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 62;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(filter).connect(this.engineGain).connect(ctx.destination);
    this.engineOsc.start();
    // Wind: looped noise through a bandpass, loudness follows speed.
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 700;
    band.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    noise.connect(band).connect(this.windGain).connect(ctx.destination);
    noise.start();
    this.startMusic();
  }

  /** A quiet looping pad + bass, one bar at a time. */
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const playBar = () => {
      if (this.muted || !this.ctx) return;
      const ctx = this.ctx;
      const t0 = ctx.currentTime + 0.05;
      const chord = CHORDS[this.bar % CHORDS.length];
      for (const freq of chord) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0, t0);
        g.gain.linearRampToValueAtTime(0.035, t0 + 0.4);
        g.gain.linearRampToValueAtTime(0.0, t0 + BAR_SECONDS);
        osc.connect(g).connect(ctx.destination);
        osc.start(t0);
        osc.stop(t0 + BAR_SECONDS + 0.1);
      }
      const bass = BASSLINE[this.bar % BASSLINE.length];
      const b = ctx.createOscillator();
      b.type = 'sine';
      b.frequency.value = bass;
      const bg = ctx.createGain();
      bg.gain.setValueAtTime(0.0, t0);
      bg.gain.linearRampToValueAtTime(0.06, t0 + 0.1);
      bg.gain.linearRampToValueAtTime(0.0, t0 + BAR_SECONDS * 0.9);
      b.connect(bg).connect(ctx.destination);
      b.start(t0);
      b.stop(t0 + BAR_SECONDS);
      this.bar += 1;
    };
    playBar();
    this.musicTimer = setInterval(playBar, BAR_SECONDS * 1000);
  }

  /** Continuous engine/wind levels from the plane's state. */
  update(plane) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const throttle = plane ? plane.throttle : 0;
    const speed = plane ? plane.speed : 0;
    this.engineOsc.frequency.setTargetAtTime(58 + throttle * 70, t, 0.1);
    this.engineGain.gain.setTargetAtTime(0.045 + throttle * 0.05, t, 0.1);
    this.windGain.gain.setTargetAtTime(Math.min(0.09, speed * 0.0007), t, 0.2);
  }

  /** A short tone: frequency, seconds, type, volume, optional slide to a second frequency. */
  tone(freq, seconds, type = 'sine', volume = 0.12, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + seconds);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0, t0);
    g.gain.linearRampToValueAtTime(volume, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + seconds);
    osc.connect(g).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.05);
  }

  /** A burst of filtered noise, for crashes and thuds. */
  noiseBurst(seconds, volume = 0.25, freq = 900) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start();
  }

  ring() {
    this.tone(880, 0.18, 'sine', 0.14);
    this.tone(1318.5, 0.26, 'sine', 0.12, null, 0.09);
    this.tone(1760, 0.3, 'sine', 0.09, null, 0.18);
  }

  crate() {
    this.tone(660, 0.1, 'square', 0.07);
    this.tone(990, 0.16, 'square', 0.07, null, 0.08);
  }

  balloon() {
    this.noiseBurst(0.25, 0.2, 500);
    this.tone(140, 0.3, 'sawtooth', 0.12, 60);
  }

  crash() {
    this.noiseBurst(0.8, 0.35, 700);
    this.tone(90, 0.7, 'sawtooth', 0.18, 40);
  }

  land() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, 0.35, 'triangle', 0.12, null, i * 0.11));
  }

  win() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568];
    notes.forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.12, null, i * 0.13));
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) {
      const t = this.ctx.currentTime;
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.06, t, 0.05);
      if (this.windGain) this.windGain.gain.setTargetAtTime(0, t, 0.05);
    }
    return this.muted;
  }
}
