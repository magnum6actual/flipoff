import { FLAP_AUDIO_BASE64 } from './flapAudio.js';

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.soundProfile = 'authentic';
    this._initialized = false;
    this._audioBuffer = null;
    this._activeSources = new Set();
    this._tickSlices = [];
    this._jokeBuffers = { squeak: null, fart: null };
    this._jokeSlices = { squeak: [], fart: [] };
    this._masterInput = null;
    this._masterOutput = null;
  }

  async init() {
    if (this._initialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._setupMasterChain();
    this._initialized = true;

    try {
      const binaryStr = atob(FLAP_AUDIO_BASE64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const [mainBuffer, squeakBuffer, fartBuffer] = await Promise.all([
        this.ctx.decodeAudioData(bytes.buffer),
        this._loadExternalAudioBuffer(new URL('../ass-ets/audio/mixkit-rubber-duck-squeak-1014.wav', import.meta.url)),
        this._loadExternalAudioBuffer(new URL('../ass-ets/audio/farrrt.wav', import.meta.url))
      ]);

      this._audioBuffer = mainBuffer;
      this._tickSlices = this._extractTickSlices(this._audioBuffer);
      this._jokeBuffers.squeak = squeakBuffer;
      this._jokeBuffers.fart = fartBuffer;
      this._jokeSlices.squeak = this._extractJokeSlices(squeakBuffer, 0.14);
      this._jokeSlices.fart = this._extractJokeSlices(fartBuffer, 0.24);
    } catch (e) {
      console.warn('Failed to decode flap audio:', e);
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) this._stopActiveSources();
    this._emitSoundModeChange();
    return this.muted;
  }

  setSoundProfile(profile) {
    this.soundProfile = ['soft', 'authentic', 'joke'].includes(profile) ? profile : 'soft';
    this._emitSoundModeChange();
  }

  cycleSoundMode() {
    // Cycle: Authentic -> Soft -> Joke -> Mute -> Authentic
    if (this.muted) {
      this.muted = false;
      this.soundProfile = 'authentic';
    } else if (this.soundProfile === 'authentic') {
      this.soundProfile = 'soft';
    } else if (this.soundProfile === 'soft') {
      this.soundProfile = 'joke';
    } else {
      this.muted = true;
      this._stopActiveSources();
    }
    const state = this.getSoundState();
    this._emitSoundModeChange();
    return state;
  }

  getSoundState() {
    return {
      muted: this.muted,
      profile: this.soundProfile,
      mode: this.muted ? 'mute' : this.soundProfile,
      label: this.muted ? 'Mute' : ({ soft: 'Soft', authentic: 'Authentic', joke: 'Joke' }[this.soundProfile] || 'Soft')
    };
  }

  playTransition(soundEvents = []) {
    if (!this.ctx || !this._audioBuffer || this.muted) return;
    this.resume();
    this._stopActiveSources();

    if (!soundEvents.length || this._tickSlices.length === 0) {
      this._playFallbackTransition();
      return;
    }

    const baseTime = this.ctx.currentTime + 0.015;
    const clusteredEvents = this._clusterSoundEvents(soundEvents);

    if (this.soundProfile === 'joke' && this._jokeSlices.squeak.length > 0) {
      this._playJokeTransition(clusteredEvents, baseTime);
      return;
    }

    clusteredEvents.forEach((event, index) => {
      this._playTickCluster(event, baseTime, index);
    });
  }

  getTransitionDuration() {
    return this._audioBuffer ? this._audioBuffer.duration * 1000 : 3800;
  }

  scheduleFlaps(soundEvents = []) {
    this.playTransition(soundEvents);
  }

  _playFallbackTransition() {
    this._playSlice({
      when: this.ctx.currentTime, buffer: this._audioBuffer,
      offset: 0, duration: this._audioBuffer.duration,
      gainValue: this.soundProfile === 'soft' ? 0.42 : 0.75,
      playbackRate: this.soundProfile === 'soft' ? 0.97 : 1, panValue: 0
    });
  }

  _playTickCluster(event, baseTime, index) {
    const profile = this._getProfileSettings();
    const repetitions = Math.min(profile.maxRepetitions, Math.max(1, Math.round(event.density / profile.densityDivisor)));
    for (let i = 0; i < repetitions; i++) {
      const slice = this._tickSlices[(index + i) % this._tickSlices.length];
      const timeOffset = event.at + (i * profile.repeatSpacingMs);
      const gainValue = Math.min(profile.maxGain, profile.baseGain + (event.intensity * profile.intensityGain) + (event.density * profile.densityGain) - (i * profile.repeatDecay));
      const playbackRate = profile.basePlaybackRate + (((index + i) % 5) * profile.playbackStep);
      const panValue = Math.max(-profile.maxPan, Math.min(profile.maxPan, event.pan + (i * profile.panSpread)));
      this._playSlice({ when: baseTime + (timeOffset / 1000), buffer: this._audioBuffer, offset: slice.offset, duration: slice.duration, gainValue, playbackRate, panValue });
    }
  }

  _playJokeTransition(clusteredEvents, baseTime) {
    const lastIndex = clusteredEvents.length - 1;
    clusteredEvents.forEach((event, index) => {
      const slice = this._jokeSlices.squeak[index % this._jokeSlices.squeak.length];
      const isBigFinish = index === lastIndex && event.hasFinal && (event.density >= 3 || clusteredEvents.length >= 8);
      this._playSlice({
        when: baseTime + (event.at / 1000), buffer: this._jokeBuffers.squeak,
        offset: slice.offset, duration: slice.duration,
        gainValue: Math.min(0.34, 0.14 + (event.density * 0.03)),
        playbackRate: 0.9 + ((index % 4) * 0.03),
        panValue: Math.max(-0.42, Math.min(0.42, event.pan)), attackMs: 4, releaseMs: 70
      });
      if (isBigFinish && this._jokeSlices.fart.length > 0 && this._jokeBuffers.fart) {
        const fartSlice = this._jokeSlices.fart[index % this._jokeSlices.fart.length];
        this._playSlice({
          when: baseTime + ((event.at + 70) / 1000), buffer: this._jokeBuffers.fart,
          offset: fartSlice.offset, duration: fartSlice.duration,
          gainValue: 0.22, playbackRate: 0.95, panValue: 0, attackMs: 8, releaseMs: 120
        });
      }
    });
  }

  _playSlice({ when, buffer, offset, duration, gainValue, playbackRate, panValue, attackMs = null, releaseMs = null }) {
    if (!buffer) return;
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    const gain = this.ctx.createGain();
    const profile = this._getProfileSettings();
    const attack = (attackMs ?? profile.attackMs) / 1000;
    const release = (releaseMs ?? profile.releaseMs) / 1000;
    const safeDuration = Math.max(duration, attack + release + 0.01);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(gainValue, when + attack);
    gain.gain.setValueAtTime(gainValue, when + Math.max(attack, safeDuration - release));
    gain.gain.linearRampToValueAtTime(0.0001, when + safeDuration);
    if (typeof this.ctx.createStereoPanner === 'function') {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = panValue;
      source.connect(gain);
      gain.connect(panner);
      panner.connect(this._masterInput || this.ctx.destination);
    } else {
      source.connect(gain);
      gain.connect(this._masterInput || this.ctx.destination);
    }
    source.start(when, offset, safeDuration);
    this._registerSource(source);
  }

  _registerSource(source) {
    this._activeSources.add(source);
    source.onended = () => this._activeSources.delete(source);
  }

  _stopActiveSources() {
    this._activeSources.forEach((s) => { try { s.stop(); } catch {} });
    this._activeSources.clear();
  }

  _clusterSoundEvents(soundEvents) {
    const sorted = [...soundEvents].sort((a, b) => a.at - b.at);
    const clustered = [];
    const mergeWindow = this.soundProfile === 'soft' ? 28 : 18;
    for (const event of sorted) {
      const last = clustered[clustered.length - 1];
      if (last && Math.abs(event.at - last.at) <= mergeWindow) {
        const nd = last.density + 1;
        last.at = ((last.at * last.density) + event.at) / nd;
        last.intensity = Math.max(last.intensity, event.intensity);
        last.pan = ((last.pan * last.density) + event.pan) / nd;
        last.hasFinal = last.hasFinal || Boolean(event.isFinal);
        last.density = nd;
        continue;
      }
      clustered.push({ at: event.at, intensity: event.intensity, pan: event.pan, hasFinal: Boolean(event.isFinal), density: 1 });
    }
    return clustered;
  }

  _extractTickSlices(buffer) {
    const samples = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const windowSize = Math.max(512, Math.floor(sampleRate * 0.018));
    const hopSize = Math.max(256, Math.floor(windowSize / 2));
    const minSpacing = Math.floor(sampleRate * 0.11);
    const windows = [];
    let maxLevel = 0;
    for (let start = 0; start + windowSize < samples.length; start += hopSize) {
      let level = 0;
      for (let i = start; i < start + windowSize; i++) level += Math.abs(samples[i]);
      const avg = level / windowSize;
      windows.push({ start, level: avg });
      maxLevel = Math.max(maxLevel, avg);
    }
    const threshold = maxLevel * 0.62;
    const peaks = [];
    for (let i = 1; i < windows.length - 1; i++) {
      const cur = windows[i];
      if (cur.level < threshold || cur.level < windows[i - 1].level || cur.level <= windows[i + 1].level) continue;
      const center = cur.start + Math.floor(windowSize / 2);
      const lastPeak = peaks[peaks.length - 1];
      if (lastPeak && center - lastPeak.center < minSpacing) {
        if (cur.level > lastPeak.level) { lastPeak.center = center; lastPeak.level = cur.level; }
        continue;
      }
      peaks.push({ center, level: cur.level });
    }
    const slices = peaks.slice(0, 10).map((p) => {
      const offset = Math.max(0, (p.center / sampleRate) - 0.016);
      return { offset, duration: Math.min(0.085, buffer.duration - offset) };
    }).filter((s) => s.duration > 0.03);
    if (slices.length > 0) return slices;
    return [0.78, 0.93, 1.41, 1.68, 2.16, 2.82, 3.24]
      .filter((o) => o < buffer.duration - 0.03)
      .map((o) => ({ offset: o, duration: Math.min(0.085, buffer.duration - o) }));
  }

  _extractJokeSlices(buffer, duration) {
    if (!buffer) return [];
    const slices = this._extractTickSlices(buffer)
      .map((s) => ({ offset: s.offset, duration: Math.min(duration, buffer.duration - s.offset) }))
      .filter((s) => s.duration > 0.05);
    return slices.length > 0 ? slices : [{ offset: 0, duration: Math.min(duration, buffer.duration) }];
  }

  async _loadExternalAudioBuffer(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch ${url}`);
      const data = await response.arrayBuffer();
      return await this.ctx.decodeAudioData(data);
    } catch (error) {
      console.warn('Failed to load external audio buffer:', url.toString(), error);
      return null;
    }
  }

  _setupMasterChain() {
    if (!this.ctx || this._masterInput) return;
    const input = this.ctx.createGain();
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 2200; tone.Q.value = 0.5;
    const body = this.ctx.createBiquadFilter();
    body.type = 'peaking'; body.frequency.value = 420; body.Q.value = 0.9; body.gain.value = 1.5;
    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -24; compressor.knee.value = 18; compressor.ratio.value = 3;
    compressor.attack.value = 0.003; compressor.release.value = 0.15;
    const output = this.ctx.createGain();
    output.gain.value = 0.9;
    input.connect(tone); tone.connect(body); body.connect(compressor); compressor.connect(output); output.connect(this.ctx.destination);
    this._masterInput = input; this._masterOutput = output;
  }

  _getProfileSettings() {
    if (this.soundProfile === 'authentic') return { maxRepetitions: 2, densityDivisor: 2, repeatSpacingMs: 9, baseGain: 0.14, intensityGain: 0.1, densityGain: 0.05, repeatDecay: 0.03, maxGain: 0.46, basePlaybackRate: 0.94, playbackStep: 0.025, panSpread: 0.08, maxPan: 0.6, attackMs: 2, releaseMs: 18 };
    if (this.soundProfile === 'joke') return { maxRepetitions: 1, densityDivisor: 3, repeatSpacingMs: 16, baseGain: 0.12, intensityGain: 0.08, densityGain: 0.03, repeatDecay: 0.02, maxGain: 0.3, basePlaybackRate: 0.92, playbackStep: 0.02, panSpread: 0.04, maxPan: 0.42, attackMs: 4, releaseMs: 65 };
    return { maxRepetitions: 1, densityDivisor: 3, repeatSpacingMs: 12, baseGain: 0.08, intensityGain: 0.07, densityGain: 0.025, repeatDecay: 0.02, maxGain: 0.24, basePlaybackRate: 0.9, playbackStep: 0.015, panSpread: 0.04, maxPan: 0.38, attackMs: 5, releaseMs: 28 };
  }

  _emitSoundModeChange() {
    if (typeof document === 'undefined') return;
    document.dispatchEvent(new CustomEvent('soundmodechange', { detail: this.getSoundState() }));
  }
}
