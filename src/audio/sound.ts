/**
 * The show's sound, made on the spot with WebAudio — no audio files, nothing
 * to download. Footsteps, doors, the lights clunking on, an audience, a drum
 * roll and a heartbeat for the verdict, the POP, and a small theme tune.
 *
 * A browser only plays sound after a tap, so the engine wakes on "Show starten".
 */

export class SoundEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private crowd!: GainNode;
  private noise!: AudioBuffer;
  private themeTimer: ReturnType<typeof setInterval> | null = null;
  private nextBeat = 0;
  private beat = 0;
  muted = false;

  wake() {
    if (!this.ctx) {
      const Engine = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Engine) return;
      const ctx = new Engine();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 3;
      this.master.connect(comp).connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.connect(this.master);
      this.music = ctx.createGain();
      this.music.gain.value = 0;
      this.music.connect(this.master);
      this.crowd = ctx.createGain();
      this.crowd.gain.value = 0;
      this.crowd.connect(this.master);
      const length = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      this.startCrowdBed();
    }
    void this.ctx.resume().catch(() => {});
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  private get t() {
    return this.ctx!.currentTime;
  }

  private noiseSource(at: number, duration: number) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start(at, Math.random() * 1.5);
    src.stop(at + duration + 0.05);
    return src;
  }

  private env(at: number, attack: number, hold: number, release: number, peak: number) {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    g.gain.setValueAtTime(Math.max(0.0002, peak), at + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
    return g;
  }

  private tone(type: OscillatorType, freq: number, at: number, duration: number, peak: number, out: AudioNode, slideTo?: number) {
    const osc = this.ctx!.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + duration);
    const g = this.env(at, 0.008, duration * 0.2, duration * 0.8, peak);
    osc.connect(g).connect(out);
    osc.start(at);
    osc.stop(at + duration + 0.05);
  }

  private filteredNoise(at: number, duration: number, type: BiquadFilterType, freq: number, q: number, peak: number, out: AudioNode, attack = 0.005) {
    const src = this.noiseSource(at, duration);
    const filter = this.ctx!.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.env(at, attack, 0, duration, peak);
    src.connect(filter).connect(g).connect(out);
    return filter;
  }

  // --- the room -----------------------------------------------------------

  /** A murmuring audience, always there underneath, faded by the director. */
  private startCrowdBed() {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const low = ctx.createBiquadFilter();
    low.type = 'bandpass';
    low.frequency.value = 520;
    low.Q.value = 0.6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35;
    const depth = ctx.createGain();
    depth.gain.value = 0.25;
    const level = ctx.createGain();
    level.gain.value = 0.5;
    lfo.connect(depth).connect(level.gain);
    src.connect(low).connect(level).connect(this.crowd);
    src.start();
    lfo.start();
  }

  crowdLevel(level: number) {
    if (this.ctx) this.crowd.gain.setTargetAtTime(level * 0.08, this.t, 0.6);
  }

  /** Applause: many short claps, swelling and fading. */
  applause(duration = 3, level = 1) {
    if (!this.ctx) return;
    const start = this.t;
    const claps = Math.floor(duration * 70 * level);
    for (let i = 0; i < claps; i += 1) {
      const k = Math.random();
      const at = start + k * duration;
      const shape = Math.sin(Math.PI * Math.min(1, k * 1.3)) * level;
      this.filteredNoise(at, 0.03 + Math.random() * 0.03, 'bandpass', 1100 + Math.random() * 1800, 1.2, 0.05 * shape + 0.01, this.sfx, 0.002);
    }
    const bed = this.filteredNoise(start, duration, 'bandpass', 1500, 0.5, 0.06 * level, this.sfx, duration * 0.25);
    bed.frequency.setValueAtTime(1500, start);
  }

  /** "Ooooh" from the audience: a falling vowel. */
  ooh() {
    if (!this.ctx) return;
    const at = this.t;
    for (const f of [220, 277, 330]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f * 1.15, at);
      osc.frequency.exponentialRampToValueAtTime(f * 0.82, at + 1.3);
      const formant = this.ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.value = 600;
      formant.Q.value = 2;
      const g = this.env(at, 0.25, 0.4, 0.8, 0.035);
      osc.connect(formant).connect(g).connect(this.sfx);
      osc.start(at);
      osc.stop(at + 1.6);
    }
  }

  // --- the corridor ---------------------------------------------------------

  step() {
    if (!this.ctx) return;
    this.filteredNoise(this.t, 0.09, 'lowpass', 380, 0.7, 0.16, this.sfx);
    this.tone('sine', 85, this.t, 0.08, 0.08, this.sfx, 55);
  }

  clunk() {
    if (!this.ctx) return;
    this.tone('sine', 72, this.t, 0.22, 0.32, this.sfx, 40);
    this.filteredNoise(this.t, 0.05, 'highpass', 2500, 0.7, 0.12, this.sfx);
  }

  door() {
    if (!this.ctx) return;
    const f = this.filteredNoise(this.t, 1.3, 'bandpass', 300, 0.8, 0.22, this.sfx, 0.15);
    f.frequency.exponentialRampToValueAtTime(2400, this.t + 1.2);
    this.tone('sine', 55, this.t, 1.1, 0.18, this.sfx, 42);
  }

  whoosh(duration = 0.7, level = 1) {
    if (!this.ctx) return;
    const f = this.filteredNoise(this.t, duration, 'bandpass', 400, 1.4, 0.16 * level, this.sfx, duration * 0.45);
    f.frequency.exponentialRampToValueAtTime(3200, this.t + duration);
  }

  boot() {
    if (!this.ctx) return;
    this.filteredNoise(this.t, 0.6, 'highpass', 3000, 0.5, 0.1, this.sfx);
    this.tone('square', 980, this.t + 0.05, 0.12, 0.04, this.sfx);
  }

  // --- the show ---------------------------------------------------------------

  /** The jingle when a round starts or the logo comes up. */
  sting() {
    if (!this.ctx) return;
    const at = this.t;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone('triangle', f, at + i * 0.07, 0.5, 0.12, this.sfx));
    this.tone('sine', 110, at, 0.35, 0.3, this.sfx, 45);
    this.filteredNoise(at + 0.28, 0.6, 'highpass', 6000, 0.5, 0.08, this.sfx);
  }

  tick(urgent = false) {
    if (!this.ctx) return;
    this.tone('square', urgent ? 1560 : 1180, this.t, 0.05, urgent ? 0.07 : 0.045, this.sfx);
  }

  /** The spotlight jumping to somebody else. */
  hop() {
    if (!this.ctx) return;
    this.tone('triangle', 880 + Math.random() * 120, this.t, 0.05, 0.05, this.sfx);
  }

  drumroll(duration = 2.7) {
    if (!this.ctx) return;
    const start = this.t;
    let at = start;
    while (at < start + duration) {
      const k = (at - start) / duration;
      this.filteredNoise(at, 0.06, 'bandpass', 1800, 0.9, 0.05 + k * 0.12, this.sfx, 0.002);
      at += 0.045 - k * 0.012;
    }
    this.filteredNoise(start + duration, 1.6, 'highpass', 5000, 0.4, 0.14, this.sfx);
    this.tone('sine', 70, start + duration, 0.5, 0.3, this.sfx, 40);
  }

  heartbeat() {
    if (!this.ctx) return;
    this.tone('sine', 62, this.t, 0.16, 0.42, this.sfx, 42);
    this.tone('sine', 58, this.t + 0.2, 0.18, 0.32, this.sfx, 40);
  }

  pop() {
    if (!this.ctx) return;
    const at = this.t;
    this.filteredNoise(at, 0.18, 'highpass', 900, 0.6, 0.55, this.sfx, 0.001);
    this.tone('sine', 420, at, 0.25, 0.4, this.sfx, 70);
    this.tone('square', 2200, at, 0.03, 0.08, this.sfx);
  }

  /** The sad slide as somebody goes down through the floor. */
  sink() {
    if (!this.ctx) return;
    this.tone('triangle', 520, this.t, 1.1, 0.1, this.sfx, 130);
    this.tone('triangle', 390, this.t + 0.05, 1.1, 0.07, this.sfx, 98);
  }

  allStay() {
    if (!this.ctx) return;
    const at = this.t;
    [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this.tone('triangle', f, at + i * 0.09, 0.45, 0.11, this.sfx));
  }

  fanfare() {
    if (!this.ctx) return;
    const at = this.t;
    const chords = [
      [523.25, 659.25, 783.99],
      [587.33, 739.99, 880],
      [659.25, 830.61, 987.77],
      [783.99, 987.77, 1174.66, 1567.98],
    ];
    chords.forEach((chord, i) =>
      chord.forEach((f) => {
        const osc = this.ctx!.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        const lp = this.ctx!.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(800, at + i * 0.22);
        lp.frequency.exponentialRampToValueAtTime(4200, at + i * 0.22 + 0.15);
        const g = this.env(at + i * 0.22, 0.02, i === 3 ? 0.9 : 0.12, i === 3 ? 1.2 : 0.18, 0.045);
        osc.connect(lp).connect(g).connect(this.sfx);
        osc.start(at + i * 0.22);
        osc.stop(at + i * 0.22 + 2.5);
      }),
    );
    this.filteredNoise(at + 0.66, 2, 'highpass', 6000, 0.4, 0.12, this.sfx);
  }

  // --- the theme tune --------------------------------------------------------

  /** A light four-to-the-floor pop loop under the show. `level` 0 fades it out. */
  theme(level: number) {
    if (!this.ctx) return;
    this.music.gain.setTargetAtTime(level * 0.55, this.t, level > 0 ? 0.4 : 0.8);
    if (level > 0 && !this.themeTimer) {
      this.nextBeat = this.t + 0.05;
      this.themeTimer = setInterval(() => this.schedule(), 25);
    }
  }

  private schedule() {
    if (!this.ctx) return;
    const spb = 60 / 116;
    // Chords: F maj7, G6, E m7, A m7 — bright and a little wistful.
    const roots = [87.31, 98.0, 82.41, 110.0];
    const chords = [
      [349.23, 440, 523.25, 659.25],
      [392, 493.88, 587.33, 659.25],
      [329.63, 392, 493.88, 587.33],
      [440, 523.25, 659.25, 783.99],
    ];
    while (this.nextBeat < this.t + 0.12) {
      const at = this.nextBeat;
      const bar = Math.floor(this.beat / 4) % 4;
      const inBar = this.beat % 4;
      // Kick.
      this.tone('sine', 120, at, 0.22, 0.5, this.music, 42);
      // Clap on two and four.
      if (inBar % 2 === 1) this.filteredNoise(at, 0.14, 'bandpass', 1500, 0.8, 0.16, this.music, 0.002);
      // Off-beat hats.
      this.filteredNoise(at + spb / 2, 0.05, 'highpass', 7000, 0.6, 0.07, this.music, 0.001);
      // Bass on the beat.
      this.tone('sawtooth', roots[bar], at, spb * 0.45, 0.07, this.music);
      // A chord stab on the off-beat.
      chords[bar].forEach((f) => this.tone('triangle', f, at + spb / 2, spb * 0.35, 0.022, this.music));
      this.nextBeat += spb;
      this.beat += 1;
    }
  }

  stopTheme() {
    if (this.themeTimer) clearInterval(this.themeTimer);
    this.themeTimer = null;
  }
}

export const sound = new SoundEngine();
