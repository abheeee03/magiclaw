/**
 * Procedural Web Audio API Sound Engine (MAGICLAW)
 * Synthesizes arcade cabinet power-on, neon hum, gantry, winch, pneumatic claw,
 * box clacks, coin drop, and win/miss chimes without external audio files.
 */

export class ArcadeAudio {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;
  private motorOsc: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private winchOsc: OscillatorNode | null = null;
  private winchGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private roomPower: number = 0;

  public init() {
    if (typeof window === "undefined") return;
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.setupContinuousNodes();
    } catch (err) {
      console.warn("Web Audio unavailable:", err);
    }
  }

  private setupContinuousNodes() {
    if (!this.ctx) return;

    // Gantry stepper whir
    this.motorOsc = this.ctx.createOscillator();
    this.motorOsc.type = "sawtooth";
    this.motorOsc.frequency.value = 112;

    const mFilter = this.ctx.createBiquadFilter();
    mFilter.type = "bandpass";
    mFilter.frequency.value = 340;
    mFilter.Q.value = 3.0;

    this.motorGain = this.ctx.createGain();
    this.motorGain.gain.value = 0.0001;

    this.motorOsc.connect(mFilter);
    mFilter.connect(this.motorGain);
    this.motorGain.connect(this.ctx.destination);
    this.motorOsc.start();

    // Winch motor hum
    this.winchOsc = this.ctx.createOscillator();
    this.winchOsc.type = "triangle";
    this.winchOsc.frequency.value = 210;

    const wFilter = this.ctx.createBiquadFilter();
    wFilter.type = "lowpass";
    wFilter.frequency.value = 680;

    this.winchGain = this.ctx.createGain();
    this.winchGain.gain.value = 0.0001;

    this.winchOsc.connect(wFilter);
    wFilter.connect(this.winchGain);
    this.winchGain.connect(this.ctx.destination);
    this.winchOsc.start();

    // Subtle warm neon arcade room hum
    const ambOsc = this.ctx.createOscillator();
    ambOsc.type = "sine";
    ambOsc.frequency.value = 60;
    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.0001;
    ambOsc.connect(this.ambientGain);
    this.ambientGain.connect(this.ctx.destination);
    ambOsc.start();
  }

  public setRoomPower(level: number) {
    this.roomPower = Math.min(1, Math.max(0, level));
    if (!this.ctx || !this.ambientGain) return;
    const now = this.ctx.currentTime;
    const target = this.muted
      ? 0.0001
      : Math.max(0.0001, 0.014 * this.roomPower);
    this.ambientGain.gain.setTargetAtTime(target, now, 0.08);
  }

  public setMuted(m: boolean) {
    this.muted = m;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.ambientGain) {
      this.ambientGain.gain.setTargetAtTime(
        m ? 0.0001 : Math.max(0.0001, 0.014 * this.roomPower),
        now,
        0.08
      );
    }
    if (m) {
      this.updateMotor(0);
      this.setWinch(0);
    }
  }

  public updateMotor(speedNorm: number) {
    if (!this.ctx || !this.motorGain || !this.motorOsc) return;
    const now = this.ctx.currentTime;
    const clamped = this.muted ? 0 : Math.min(1, Math.max(0, speedNorm));
    const targetGain = clamped > 0.02 ? 0.025 + clamped * 0.045 : 0.0001;
    this.motorGain.gain.setTargetAtTime(targetGain, now, 0.04);
    this.motorOsc.frequency.setTargetAtTime(102 + clamped * 58, now, 0.05);
  }

  public setWinch(dir: number) {
    if (!this.ctx || !this.winchGain || !this.winchOsc) return;
    const now = this.ctx.currentTime;
    if (this.muted || dir === 0) {
      this.winchGain.gain.setTargetAtTime(0.0001, now, 0.04);
      return;
    }
    this.winchOsc.frequency.setTargetAtTime(dir > 0 ? 255 : 185, now, 0.05);
    this.winchGain.gain.setTargetAtTime(0.045, now, 0.04);
  }

  public playCoin() {
    this.init();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    [1567.98, 2093.0].forEach((freq, i) => {
      if (!this.ctx) return;
      const t0 = now + i * 0.075;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(0.11, t0 + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.24);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.26);
    });
  }

  public playBreakerSwitch() {
    if (!this.ctx || this.muted || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const thud = this.ctx.createOscillator();
    const thudGain = this.ctx.createGain();
    thud.type = "triangle";
    thud.frequency.setValueAtTime(165, now);
    thud.frequency.exponentialRampToValueAtTime(38, now + 0.09);
    thudGain.gain.setValueAtTime(0.28, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    thud.connect(thudGain);
    thudGain.connect(this.ctx.destination);
    thud.start(now);
    thud.stop(now + 0.12);

    const bufLen = Math.floor(this.ctx.sampleRate * 0.045);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.18));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1450;
    bp.Q.value = 1.6;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.22, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    noise.connect(bp);
    bp.connect(ng);
    ng.connect(this.ctx.destination);
    noise.start(now);
  }

  public playFluorescentFlicker(intensity: number = 0.7) {
    if (!this.ctx || this.muted || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const dur = 0.07;
    const bufLen = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.35));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "bandpass";
    hp.frequency.value = 2600 + Math.random() * 900;
    hp.Q.value = 2.4;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.11 * intensity, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.ctx.destination);
    src.start(now);

    const hum = this.ctx.createOscillator();
    const hg = this.ctx.createGain();
    hum.type = "sawtooth";
    hum.frequency.setValueAtTime(120, now);
    hg.gain.setValueAtTime(0.045 * intensity, now);
    hg.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    hum.connect(hg);
    hg.connect(this.ctx.destination);
    hum.start(now);
    hum.stop(now + 0.15);
  }

  public playNeonBuzz(baseFreq: number = 120) {
    if (!this.ctx || this.muted || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const filt = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.linearRampToValueAtTime(baseFreq * 1.03, now + 0.16);
    filt.type = "bandpass";
    filt.frequency.value = 560;
    filt.Q.value = 2.2;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.065, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.connect(filt);
    filt.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  }

  public playBootChime() {
    if (!this.ctx || this.muted || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    const freqs = [392.0, 523.25, 659.25, 783.99, 1046.5];
    freqs.forEach((f, i) => {
      if (!this.ctx) return;
      const t0 = now + i * 0.075;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = i === freqs.length - 1 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(f, t0);
      gain.gain.setValueAtTime(0.001, t0);
      gain.gain.linearRampToValueAtTime(0.09, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(
        0.0008,
        t0 + (i === freqs.length - 1 ? 0.55 : 0.22)
      );
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.6);
    });
  }

  public playButtonClick() {
    this.init();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(720, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.045);
    gain.gain.setValueAtTime(0.075, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playPneumaticSnap(opening: boolean = false) {
    this.init();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const bufLen = Math.floor(this.ctx.sampleRate * 0.075);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.24));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const filt = this.ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = opening ? 1650 : 940;
    filt.Q.value = 1.9;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    noise.connect(filt);
    filt.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);

    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(opening ? 820 : 520, now);
    osc.frequency.exponentialRampToValueAtTime(opening ? 540 : 210, now + 0.075);
    og.gain.setValueAtTime(0.095, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
    osc.connect(og);
    og.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public playClawClack(open: boolean) {
    this.playPneumaticSnap(open);
  }

  public playBoxClack(intensity: number = 0.5) {
    if (!this.ctx || this.muted) return;
    const amp = Math.min(1, Math.max(0.1, intensity));
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(240 + Math.random() * 90, now);
    osc.frequency.exponentialRampToValueAtTime(85, now + 0.055);
    gain.gain.setValueAtTime(0.07 * amp, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playThud(intensity: number = 0.5) {
    this.playBoxClack(intensity);
  }

  public playTick(urgent: boolean = false) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(urgent ? 1080 : 780, now);
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playWinJingle() {
    this.init();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 880.0, 1046.5, 1318.5, 1567.98];
    const times = [0.0, 0.09, 0.18, 0.28, 0.4, 0.5, 0.62, 0.76];
    const durs = [0.11, 0.11, 0.12, 0.14, 0.12, 0.14, 0.18, 0.46];
    notes.forEach((f, idx) => {
      if (!this.ctx) return;
      const o1 = this.ctx.createOscillator();
      const o2 = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o1.type = "triangle";
      o2.type = "square";
      o1.frequency.setValueAtTime(f, now + times[idx]);
      o2.frequency.setValueAtTime(f * 1.003, now + times[idx]);
      g.gain.setValueAtTime(0.001, now + times[idx]);
      g.gain.linearRampToValueAtTime(0.095, now + times[idx] + 0.014);
      g.gain.exponentialRampToValueAtTime(0.001, now + times[idx] + durs[idx]);
      o1.connect(g);
      o2.connect(g);
      g.connect(this.ctx.destination);
      o1.start(now + times[idx]);
      o2.start(now + times[idx]);
      o1.stop(now + times[idx] + durs[idx] + 0.03);
      o2.stop(now + times[idx] + durs[idx] + 0.03);
    });
  }

  public playWinFanfare() {
    this.playWinJingle();
  }

  public playMiss() {
    this.init();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    [370, 330, 294, 247].forEach((f, i) => {
      if (!this.ctx) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = "triangle";
      o.frequency.setValueAtTime(f, now + i * 0.12);
      g.gain.setValueAtTime(0.065, now + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.15);
      o.connect(g);
      g.connect(this.ctx.destination);
      o.start(now + i * 0.12);
      o.stop(now + i * 0.12 + 0.17);
    });
  }
}

export const arcadeAudio = new ArcadeAudio();
