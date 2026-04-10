import { SOUND_PROFILES } from './constants.js';

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this._initialized = false;
    this.profile = 'soft';
    this.volume = 0.8;
    this.noiseBuffer = null;
  }

  async init() {
    if (this._initialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._initialized = true;
    this.noiseBuffer = this._createNoiseBuffer();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  applyConfig(config) {
    if (!config) {
      return;
    }
    this.profile = SOUND_PROFILES.includes(config.profile) ? config.profile : 'soft';
    this.volume = Number.isFinite(config.volume) ? config.volume : 0.8;
  }

  cycleProfile() {
    const currentIndex = SOUND_PROFILES.indexOf(this.profile);
    const nextProfile = SOUND_PROFILES[(currentIndex + 1) % SOUND_PROFILES.length];
    this.profile = nextProfile;
    return nextProfile;
  }

  getProfileLabel() {
    return this.profile.toUpperCase();
  }

  scheduleTransition(events, meta = {}) {
    if (!this.ctx || this.profile === 'mute' || !events.length) {
      return;
    }

    this.resume();
    const baseTime = this.ctx.currentTime + 0.02;

    events.forEach((event) => {
      const scheduledTime = baseTime + (event.atMs / 1000);
      switch (this.profile) {
        case 'authentic':
          this._scheduleAuthenticClick(scheduledTime, event.weight);
          break;
        case 'joke':
          this._scheduleDuckSqueak(scheduledTime, event.weight);
          break;
        case 'soft':
        default:
          this._scheduleSoftClick(scheduledTime, event.weight);
          break;
      }
    });

    if (this.profile === 'joke' && Number.isFinite(meta.finalAtMs)) {
      this._scheduleFart(baseTime + (meta.finalAtMs / 1000) + 0.02);
    }
  }

  _createNoiseBuffer() {
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.18, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) {
      data[index] = (Math.random() * 2) - 1;
    }
    return buffer;
  }

  _scheduleSoftClick(time, weight = 1) {
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.035 * this.volume * Math.min(2.5, weight), time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
    gain.connect(this.ctx.destination);

    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(950, time);
    source.connect(filter);
    filter.connect(gain);
    source.start(time);
    source.stop(time + 0.09);
  }

  _scheduleAuthenticClick(time, weight = 1) {
    this._scheduleSoftClick(time, weight * 1.15);

    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(1480, time);
    osc.frequency.exponentialRampToValueAtTime(620, time + 0.045);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.018 * this.volume * Math.min(2.8, weight), time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.055);
  }

  _scheduleDuckSqueak(time, weight = 1) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, time);
    osc.frequency.exponentialRampToValueAtTime(1320, time + 0.03);
    osc.frequency.exponentialRampToValueAtTime(760, time + 0.075);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.03 * this.volume * Math.min(2, weight), time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.085);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, time);
    filter.Q.value = 6;

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + 0.09);
  }

  _scheduleFart(time) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, time);
    osc.frequency.exponentialRampToValueAtTime(52, time + 0.42);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.055 * this.volume, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.45);

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01 * this.volume, time + 0.03);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.4);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, time);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    osc.start(time);
    osc.stop(time + 0.46);
    noise.start(time);
    noise.stop(time + 0.41);
  }
}
