/**
 * Procedural Web Audio API Sound Engine
 * Synthesizes realistic arcade crane mechanics without external audio files.
 */

export class ArcadeAudio {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;
  private motorOsc: OscillatorNode | null = null;
  private motorGain: GainNode | null = null;
  private winchOsc: OscillatorNode | null = null;
  private winchGain: GainNode | null = null;

  constructor() {
    // Lazy initialized on first user gesture
  }

  public init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") {
        this.ctx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Continuous gantry servo motor hum
      this.motorOsc = this.ctx.createOscillator();
      this.motorOsc.type = "sawtooth";
      this.motorOsc.frequency.setValueAtTime(65, this.ctx.currentTime);

      const motorFilter = this.ctx.createBiquadFilter();
      motorFilter.type = "lowpass";
      motorFilter.frequency.setValueAtTime(280, this.ctx.currentTime);

      this.motorGain = this.ctx.createGain();
      this.motorGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

      this.motorOsc.connect(motorFilter);
      motorFilter.connect(this.motorGain);
      this.motorGain.connect(this.ctx.destination);
      this.motorOsc.start();

      // Winch mechanical whine
      this.winchOsc = this.ctx.createOscillator();
      this.winchOsc.type = "triangle";
      this.winchOsc.frequency.setValueAtTime(420, this.ctx.currentTime);

      const winchFilter = this.ctx.createBiquadFilter();
      winchFilter.type = "bandpass";
      winchFilter.frequency.setValueAtTime(540, this.ctx.currentTime);
      winchFilter.Q.setValueAtTime(3.5, this.ctx.currentTime);

      this.winchGain = this.ctx.createGain();
      this.winchGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);

      this.winchOsc.connect(winchFilter);
      winchFilter.connect(this.winchGain);
      this.winchGain.connect(this.ctx.destination);
      this.winchOsc.start();
    } catch (e) {
      console.warn("Web Audio API not supported:", e);
    }
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.muted) {
      if (this.motorGain && this.ctx) {
        this.motorGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      }
      if (this.winchGain && this.ctx) {
        this.winchGain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      }
    }
  }

  public updateMotor(speedNorm: number) {
    if (!this.ctx || !this.motorGain || !this.motorOsc) return;
    const now = this.ctx.currentTime;
    const targetGain = this.muted ? 0.0001 : Math.min(0.055, speedNorm * 0.055);
    this.motorGain.gain.setTargetAtTime(targetGain, now, 0.04);
    this.motorOsc.frequency.setTargetAtTime(65 + speedNorm * 75, now, 0.06);
  }

  public setWinch(dir: number) {
    if (!this.ctx || !this.winchGain || !this.winchOsc) return;
    const now = this.ctx.currentTime;
    const targetGain = this.muted || dir === 0 ? 0.0001 : 0.045;
    this.winchGain.gain.setTargetAtTime(targetGain, now, 0.05);
    const freq = dir > 0 ? 580 : 380;
    this.winchOsc.frequency.setTargetAtTime(freq, now, 0.08);
  }

  public playCoin() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    [1318.5, 1760].forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      gain.gain.setValueAtTime(0.12, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.36);
    });
  }

  public playButtonClick() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.05);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playClawClack(open: boolean) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.07);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.22));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(open ? 1800 : 950, now);
    filter.Q.setValueAtTime(4, now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);

    const osc = this.ctx.createOscillator();
    const og = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(open ? 820 : 440, now);
    osc.frequency.exponentialRampToValueAtTime(160, now + 0.05);
    og.gain.setValueAtTime(0.12, now);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    osc.connect(og);
    og.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  public playThud(intensity: number = 0.5) {
    if (!this.ctx || this.muted) return;
    const clamped = Math.min(1, Math.max(0.12, intensity));
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.09);
    gain.gain.setValueAtTime(clamped * 0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playTick(urgent: boolean = false) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(urgent ? 1046.5 : 659.25, now);
    gain.gain.setValueAtTime(urgent ? 0.14 : 0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  }

  public playWinFanfare() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5, 1318.5];
    const times = [0.0, 0.1, 0.2, 0.32, 0.46, 0.58, 0.72];
    const durs = [0.12, 0.12, 0.13, 0.15, 0.12, 0.15, 0.48];
    notes.forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc2.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, now + times[i]);
      osc2.frequency.setValueAtTime(freq * 1.004, now + times[i]);
      gain.gain.setValueAtTime(0.14, now + times[i]);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + times[i] + durs[i]);
      osc.connect(gain);
      osc2.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + times[i]);
      osc2.start(now + times[i]);
      osc.stop(now + times[i] + durs[i] + 0.02);
      osc2.stop(now + times[i] + durs[i] + 0.02);
    });
  }

  public playMiss() {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const notes = [349.23, 329.63, 293.66, 261.63];
    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0.08, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.22);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.24);
    });
  }
}

export const arcadeAudio = new ArcadeAudio();
