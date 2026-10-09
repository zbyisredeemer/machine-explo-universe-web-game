export const SOUND_PALETTES = [
  { root: 55, notes: [0, 7, 12, 4, 7, 16], pace: 2.4 },
  { root: 65.406, notes: [0, 3, 7, 10, 12, 7], pace: 2.8 },
  { root: 73.416, notes: [0, 7, 14, 12, 9, 7], pace: 3.2 },
  { root: 82.407, notes: [0, 5, 12, 19, 16, 12], pace: 2.6 },
];
export class Sound {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.chapter = 0;
    this.phrase = 0;
    this.noteTime = 1;
    this.oscillators = [];
  }
  start() {
    if (!this.ctx) {
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return;
      this.ctx = new Context();
      this.master = this.ctx.createGain();
      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -12;
      this.compressor.ratio.value = 5;
      this.master.connect(this.compressor);
      this.compressor.connect(this.ctx.destination);
      this.effects = this.ctx.createGain();
      this.effects.connect(this.master);
      this.music = this.ctx.createGain();
      this.music.connect(this.master);
      this.drone = this.ctx.createGain();
      this.drone.gain.value = 0.016;
      this.drone.connect(this.music);
      for (const frequency of [55, 82.41, 110.2]) {
        const oscillator = this.ctx.createOscillator();
        oscillator.frequency.value = frequency;
        oscillator.type = 'sine';
        oscillator.connect(this.drone);
        oscillator.start();
        this.oscillators.push(oscillator);
      }
    }
    this.setChapter(this.chapter);
    this.ctx.resume().catch(() => {});
    this.volume();
  }
  volume() {
    if (!this.master) return;
    this.master.gain.setTargetAtTime(this.settings.volume / 100, this.ctx.currentTime, 0.06);
    this.effects.gain.setTargetAtTime(
      (this.settings.effectsVolume ?? 80) / 100,
      this.ctx.currentTime,
      0.06,
    );
    this.music.gain.setTargetAtTime(
      (this.audible ? (this.settings.musicVolume ?? 35) : 0) / 100,
      this.ctx.currentTime,
      0.3,
    );
  }
  tone(frequency, duration, type = 'sine', gain = 0.05, end = frequency, music = false) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const oscillator = this.ctx.createOscillator(),
      envelope = this.ctx.createGain(),
      now = this.ctx.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, end), now + duration);
    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(envelope);
    envelope.connect(music ? this.music : this.effects);
    oscillator.start();
    oscillator.stop(now + duration);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
  }
  setChapter(index) {
    this.chapter = Math.max(0, Math.min(3, Number(index) || 0));
    this.phrase = 0;
    this.noteTime = 1;
    const root = SOUND_PALETTES[this.chapter].root;
    this.oscillators.forEach((oscillator, i) =>
      oscillator.frequency.setTargetAtTime(root * [1, 1.5, 2.002][i], this.ctx.currentTime, 1.2),
    );
  }
  update(dt, playing) {
    const audible = playing && !document.hidden;
    if (audible !== this.audible) {
      this.audible = audible;
      this.volume();
    }
    if (!audible || !this.ctx || this.ctx.state !== 'running' || this.settings.musicVolume === 0)
      return;
    this.noteTime -= dt;
    if (this.noteTime > 0) return;
    const palette = SOUND_PALETTES[this.chapter];
    const note = palette.notes[this.phrase++ % palette.notes.length];
    const frequency = palette.root * 4 * 2 ** (note / 12);
    this.tone(frequency, 1.8, 'sine', 0.045, frequency * 1.002, true);
    this.tone(frequency / 2, 2.2, 'triangle', 0.012, frequency / 2, true);
    this.noteTime = this.combat ? palette.pace * 0.65 : palette.pace;
  }
  noise(duration = 0.12, gain = 0.025) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    if (!this.noiseBuffer) {
      this.noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate / 2, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const source = this.ctx.createBufferSource(),
      filter = this.ctx.createBiquadFilter(),
      envelope = this.ctx.createGain();
    source.buffer = this.noiseBuffer;
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(this.effects);
    const now = this.ctx.currentTime;
    envelope.gain.setValueAtTime(gain, now);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.start();
    source.stop(now + duration);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      envelope.disconnect();
    };
  }
  setActivity(playing, combat) {
    this.combat = combat;
    if (!this.ctx || !this.drone) return;
    const target = playing ? (combat ? 0.023 : 0.016) : 0.004;
    if (target === this.activity) return;
    this.activity = target;
    this.drone.gain.setTargetAtTime(target, this.ctx.currentTime, 0.5);
  }
  play(id) {
    if (['shot', 'lance', 'land', 'impact', 'kill'].includes(id))
      this.noise(id === 'kill' ? 0.25 : 0.08, id === 'shot' ? 0.012 : 0.035);
    if (id === 'discovery' || id === 'clear') {
      for (const [i, frequency] of [440, 554.37, 659.25].entries())
        this.tone(frequency, 0.4 + i * 0.15, 'sine', 0.035);
    }
    if (id === 'footstep') {
      this.tone(105, 0.045, 'triangle', 0.025, 48);
      this.tone(720, 0.025, 'sine', 0.012, 220);
    }
    if (id === 'land') {
      this.tone(70, 0.14, 'triangle', 0.07, 30);
      this.tone(340, 0.08, 'sine', 0.025, 80);
    }
    if (id === 'shot') {
      this.tone(720, 0.055, 'triangle', 0.04, 190);
      this.tone(110, 0.07, 'sine', 0.055, 48);
    }
    if (id === 'lance') {
      this.tone(960, 0.16, 'sawtooth', 0.025, 130);
      this.tone(85, 0.2, 'sine', 0.075, 30);
    }
    if (id === 'confirm') this.tone(1350, 0.035, 'sine', 0.022, 880);
    if (id === 'slash') this.tone(170, 0.15, 'sawtooth', 0.025, 42);
    if (id === 'dash') this.tone(210, 0.21, 'triangle', 0.05, 650);
    if (id === 'hit') this.tone(88, 0.16, 'square', 0.035, 35);
    if (id === 'hurt') this.tone(65, 0.25, 'sawtooth', 0.055, 32);
    if (id === 'interact') {
      this.tone(540, 0.18, 'sine', 0.05, 780);
      setTimeout(() => this.tone(810, 0.28, 'sine', 0.045), 100);
    }
    if (id === 'ability') this.tone(110, 0.55, 'triangle', 0.08, 880);
    if (id === 'ability-anchor') {
      this.tone(430, 0.5, 'triangle', 0.065, 65);
      this.tone(75, 0.65, 'sine', 0.07, 38);
    }
    if (id === 'ability-bloom') {
      this.tone(330, 0.5, 'sine', 0.05, 660);
      this.tone(495, 0.7, 'sine', 0.04, 990);
    }
    if (id === 'ability-time') {
      this.tone(880, 0.65, 'sine', 0.045, 220);
      this.tone(1320, 0.3, 'triangle', 0.025, 440);
    }
    if (id === 'ability-phase') {
      this.tone(180, 0.12, 'sawtooth', 0.035, 1200);
      this.tone(680, 0.35, 'triangle', 0.05, 90);
    }
    if (id === 'kill') this.tone(180, 0.26, 'triangle', 0.06, 38);
    if (id === 'warning') this.tone(230, 0.22, 'sine', 0.04, 270);
    if (id === 'impact') {
      this.tone(62, 0.12, 'triangle', 0.12, 28);
      this.tone(950, 0.045, 'sawtooth', 0.02, 160);
    }
    if (id === 'lock') {
      this.tone(720, 0.08, 'sine', 0.04);
      setTimeout(() => this.tone(1080, 0.12, 'sine', 0.04), 70);
    }
    if (id === 'dodge') {
      this.tone(440, 0.22, 'triangle', 0.08, 880);
      this.tone(660, 0.3, 'sine', 0.04, 1320);
    }
  }
}
