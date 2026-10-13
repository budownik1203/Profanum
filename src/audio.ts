/**
 * Sound, all of it synthesized with WebAudio, nothing to download (design doc: Audio):
 * the dull boom of gunpowder, the hiss of the ramrod, blood, bells and breaking glass, and the
 * profaned church music: an organ and a wordless choir that turn into drums and dissonance once a
 * fight starts. Browsers only allow sound after the player touches a key or the mouse, so the engine
 * wakes up on the first input and stays silent (and harmless) until then.
 */
import type { GameEvent } from "./game/types.js";
import type { World } from "./game/world.js";
import type { Vec } from "./game/math.js";

export type MusicState = "silent" | "title" | "crypt" | "explore" | "combat" | "boss";


/** Layer loudness for each mood of the music. */
const MIX: Record<MusicState, { organ: number; choir: number; drums: number; bells: number; bpm: number }> = {
  silent: { organ: 0, choir: 0, drums: 0, bells: 0, bpm: 56 },
  title: { organ: 0.5, choir: 0.8, drums: 0, bells: 0.4, bpm: 52 },
  crypt: { organ: 0.32, choir: 0.5, drums: 0, bells: 0.35, bpm: 48 },
  explore: { organ: 0.42, choir: 0.32, drums: 0, bells: 0.25, bpm: 56 },
  combat: { organ: 0.55, choir: 0.22, drums: 0.85, bells: 0.2, bpm: 96 },
  boss: { organ: 0.65, choir: 0.5, drums: 1, bells: 0.6, bpm: 112 },
};

/** D minor with a Phrygian E-flat for dread: one chord a bar (MIDI notes, low to high). */
const PROG: number[][] = [
  [50, 57, 62, 65], // Dm
  [50, 57, 62, 65],
  [46, 53, 58, 62], // Bb
  [43, 50, 55, 58], // Gm
  [51, 58, 63, 67], // Eb
  [45, 52, 57, 61], // A
  [50, 57, 62, 65], // Dm
  [45, 52, 57, 61], // A
];

/** Drum patterns on a 16-step bar: K = timpani, S = frame drum. */
const DRUMS: Partial<Record<MusicState, { k: number[]; s: number[] }>> = {
  combat: { k: [0, 6, 8, 11], s: [4, 12] },
  boss: { k: [0, 3, 6, 8, 10, 11, 14], s: [4, 12, 15] },
};

const midi = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);
const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

export class GameAudio {
  private ctx: BaseAudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicBus!: GainNode;
  private musicDuck!: GainNode;
  private reverbIn!: GainNode;
  private noise!: AudioBuffer;
  private layers!: { organ: GainNode; choir: GainNode; drums: GainNode; bells: GainNode };
  private sfxVolume = 0.8;
  private musicVolume = 0.6;
  private last = new Map<string, number>();
  private voices = 0;
  // the music's clock
  private state: MusicState = "silent";
  private step = 0;
  private bar = 0;
  private nextStep = 0;

  // ---------------------------------------------------------------- setup
  /** For checks: "off" until the first input, then the AudioContext's state, and how many voices sound. */
  get status(): string {
    return this.ctx ? `${this.ctx.state}:${this.voices}` : "off";
  }

  /** Called on every key and click: the first one wakes the sound up. */
  unlock(): void {
    try {
      if (!this.ctx) this.build();
      if (this.ctx && this.ctx.state === "suspended" && this.ctx instanceof AudioContext) void this.ctx.resume();
    } catch {
      this.ctx = null; // no sound on this browser: the game goes on silently
    }
  }

  setVolumes(sfx: number, music: number): void {
    this.sfxVolume = sfx;
    this.musicVolume = music;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfx.gain.setTargetAtTime(sfx, t, 0.05);
    this.musicBus.gain.setTargetAtTime(music * 0.55, t, 0.1);
  }

  private build(given?: BaseAudioContext): void {
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC && !given) return;
    const ctx = given ?? new AC!();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    // a gentle limiter so a big explosion never clips
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 8;
    comp.ratio.value = 6;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVolume;
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicVolume * 0.55;
    this.musicDuck = ctx.createGain();
    this.musicDuck.connect(this.musicBus).connect(this.master);
    // the cathedral: a long convolution reverb from decaying noise
    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(2.8);
    this.reverbIn = ctx.createGain();
    this.reverbIn.gain.value = 0.5;
    this.reverbIn.connect(conv).connect(this.master);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const layer = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.musicDuck);
      const send = ctx.createGain();
      send.gain.value = 0.55;
      g.connect(send).connect(this.reverbIn);
      return g;
    };
    this.layers = { organ: layer(), choir: layer(), drums: layer(), bells: layer() };
    this.nextStep = ctx.currentTime + 0.1;
  }

  private impulse(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // early reflections, then a dark, long tail
        const early = i < ctx.sampleRate * 0.08 && Math.random() < 0.002 ? 1 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) + early) * 0.5;
      }
    }
    return buf;
  }

  /**
   * For checks without ears: renders each mood of the music and each sound offline and reports how
   * loud it got (peak and RMS, 0..1). Nothing is played.
   */
  static async measure(): Promise<Record<string, { peak: number; rms: number }>> {
    const out: Record<string, { peak: number; rms: number }> = {};
    const sr = 22050;
    const stats = (buf: AudioBuffer) => {
      let peak = 0;
      let sum = 0;
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < d.length; i++) {
          const v = Math.abs(d[i]);
          if (v > peak) peak = v;
          sum += v * v;
        }
      }
      return { peak: Math.round(peak * 1000) / 1000, rms: Math.round(Math.sqrt(sum / (buf.length * buf.numberOfChannels)) * 1000) / 1000 };
    };
    for (const st of ["title", "crypt", "explore", "combat", "boss"] as MusicState[]) {
      const ctx = new OfflineAudioContext(2, sr * 8, sr);
      const a = new GameAudio();
      a.build(ctx);
      a.state = st;
      for (const k of ["organ", "choir", "drums", "bells"] as const) a.layers[k].gain.value = MIX[st][k];
      for (let t = 0.05; t < 7.5; t += 60 / MIX[st].bpm / 4) a.playStep(t);
      out[`music.${st}`] = stats(await ctx.startRendering());
    }
    const sounds: [string, (a: GameAudio) => void][] = [
      ["shot", (a) => a.gunshot(0, 0.8, 0.25, false)],
      ["shot.heavy", (a) => a.gunshot(0, 0.8, 1, false)],
      ["shot.enemy", (a) => a.gunshot(0, 0.55, 0.3, true)],
      ["crossbow", (a) => a.twang(0, 0.7)],
      ["occult", (a) => a.whisper(0, 0.8)],
      ["hit", (a) => a.flesh(0, 0.75, false)],
      ["death", (a) => a.flesh(0, 1, true)],
      ["pain", (a) => a.pain(0.9)],
      ["raise", (a) => a.rise(0, 0.8)],
      ["bell", (a) => a.bell(0, 1, midi(38))],
      ["explosion", (a) => a.boom(0, 1, 1)],
      ["crash", (a) => a.crash(0, 1)],
      ["glass", (a) => a.glass(0, 0.8)],
      ["doors", (a) => a.clank(0, 0.9)],
      ["roar", (a) => a.roar(0, 0.9)],
      ["dread", (a) => a.dread(0, 0.7)],
      ["chime", (a) => a.chime(0, 0.55, [69, 74, 77, 81], 0.07)],
    ];
    for (const [name, play] of sounds) {
      const ctx = new OfflineAudioContext(2, sr * 3, sr);
      const a = new GameAudio();
      a.build(ctx);
      play(a);
      out[name] = stats(await ctx.startRendering());
    }
    return out;
  }

  // ---------------------------------------------------------------- building blocks
  /** An output for one sound: gain → stereo pan → effects bus (+ some reverb). */
  private out(pan: number, vol: number, wet = 0.25, bus?: GainNode): GainNode {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = vol;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(bus ?? this.sfx);
    if (wet > 0) {
      const s = ctx.createGain();
      s.gain.value = wet;
      p.connect(s).connect(this.reverbIn);
    }
    return g;
  }

  /** Attack-decay envelope on a gain. */
  private env(g: GainNode, t: number, a: number, d: number, peak: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private noiseBurst(dest: AudioNode, t: number, a: number, d: number, peak: number, filter?: { type: BiquadFilterType; f0: number; f1?: number; q?: number }): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const g = ctx.createGain();
    this.env(g, t, a, d, peak);
    let head: AudioNode = src;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type;
      f.frequency.setValueAtTime(filter.f0, t);
      if (filter.f1 !== undefined) f.frequency.exponentialRampToValueAtTime(Math.max(20, filter.f1), t + a + d);
      if (filter.q !== undefined) f.Q.value = filter.q;
      head.connect(f);
      head = f;
    }
    head.connect(g).connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + a + d + 0.05);
    this.track(src);
  }

  private tone(dest: AudioNode, type: OscillatorType, t: number, f0: number, f1: number, a: number, d: number, peak: number, glide = a + d): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + glide);
    const g = ctx.createGain();
    this.env(g, t, a, d, peak);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + a + d + 0.05);
    this.track(o);
  }

  private track(n: AudioScheduledSourceNode): void {
    this.voices += 1;
    n.onended = () => (this.voices -= 1);
  }

  /** Too many of the same sound at once only makes noise. */
  private allow(key: string, gap: number): boolean {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if ((this.last.get(key) ?? -1) + gap > now) return false;
    if (this.voices > 90) return false;
    this.last.set(key, now);
    return true;
  }

  // ---------------------------------------------------------------- the sounds
  private gunshot(pan: number, vol: number, heavy: number, far: boolean): void {
    const t = this.ctx!.currentTime + 0.002;
    const o = this.out(pan, vol * 1.6, far ? 0.6 : 0.3);
    this.noiseBurst(o, t, 0.002, 0.16 + 0.3 * heavy, 0.9, { type: "lowpass", f0: 4200, f1: 300 + 200 * heavy });
    this.tone(o, "sine", t, 130 - 30 * heavy, 42, 0.003, 0.18 + 0.25 * heavy, 0.85);
    this.noiseBurst(o, t, 0.001, 0.03, 0.35, { type: "highpass", f0: 2600 });
  }

  private twang(pan: number, vol: number): void {
    const t = this.ctx!.currentTime;
    const o = this.out(pan, vol * 2.5, 0.15);
    this.tone(o, "triangle", t, 460, 170, 0.002, 0.14, 0.5, 0.08);
    this.noiseBurst(o, t, 0.001, 0.025, 0.25, { type: "highpass", f0: 3000 });
  }

  private whisper(pan: number, vol: number): void {
    const t = this.ctx!.currentTime;
    const o = this.out(pan, vol, 0.6);
    this.noiseBurst(o, t, 0.04, 0.4, 0.5, { type: "bandpass", f0: 700, f1: 1500, q: 5 });
    this.tone(o, "sine", t, 110, 82, 0.03, 0.45, 0.4);
  }

  private flesh(pan: number, vol: number, big: boolean): void {
    const t = this.ctx!.currentTime;
    const o = this.out(pan, vol * 2, 0.12);
    this.noiseBurst(o, t, 0.002, big ? 0.28 : 0.09, 0.6, { type: "lowpass", f0: big ? 1200 : 750 });
    this.tone(o, "sine", t, big ? 120 : 190, big ? 40 : 90, 0.002, big ? 0.3 : 0.09, 0.55);
    // the wet part
    this.noiseBurst(o, t + 0.01, 0.01, big ? 0.3 : 0.1, 0.32, { type: "bandpass", f0: 300, f1: big ? 1300 : 900, q: 2.2 });
  }

  private bell(pan: number, vol: number, f0: number, bus?: GainNode): void {
    const t = this.ctx!.currentTime + 0.01;
    const o = this.out(pan, vol, 0.5, bus);
    const partials = [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011, 4.166, 5.433];
    const amps = [0.6, 1, 0.5, 0.45, 0.4, 0.25, 0.2, 0.18, 0.12, 0.08];
    const decay = Math.min(1.6, 220 / f0);
    partials.forEach((p, i) => this.tone(o, "sine", t, f0 * p, f0 * p, 0.004, (6 - i * 0.5) * decay, amps[i] * 0.22));
    this.noiseBurst(o, t, 0.001, 0.04, 0.2, { type: "bandpass", f0: f0 * 4, q: 2 });
  }

  private chime(pan: number, vol: number, notes: number[], gap: number): void {
    const t = this.ctx!.currentTime;
    const o = this.out(pan, vol, 0.5);
    notes.forEach((n, i) => this.tone(o, "sine", t + i * gap, midi(n), midi(n), 0.005, 0.6, 0.16));
  }

  private boom(pan: number, vol: number, size: number): void {
    const t = this.ctx!.currentTime;
    const o = this.out(pan, vol, 0.45);
    this.noiseBurst(o, t, 0.004, 0.5 + 0.6 * size, 1, { type: "lowpass", f0: 2000, f1: 180 });
    this.tone(o, "sine", t, 85, 28, 0.004, 0.6 + 0.4 * size, 1);
    for (let i = 0; i < 8; i++) this.noiseBurst(o, t + rnd(0.05, 0.7), 0.001, 0.02, 0.18, { type: "highpass", f0: 1800 });
  }

  private puff(pan: number, vol: number): void {
    const t = this.ctx!.currentTime;
    const o = this.out(pan, vol, 0.2);
    this.noiseBurst(o, t, 0.004, 0.12, 0.3, { type: "highpass", f0: 1400 });
    this.noiseBurst(o, t, 0.01, 0.2, 0.16, { type: "lowpass", f0: 400 });
  }

  private glass(pan: number, vol: number): void {
    const t = this.ctx!.currentTime;
    const o = this.out(pan, vol * 1.5, 0.5);
    this.noiseBurst(o, t, 0.002, 0.35, 0.35, { type: "highpass", f0: 3000 });
    for (let i = 0; i < 16; i++) {
      const f = rnd(2400, 7200);
      this.tone(o, "sine", t + rnd(0, 0.4), f, f, 0.002, rnd(0.06, 0.25), 0.1);
    }
  }

  private crash(pan: number, vol: number): void {
    const t = this.ctx!.currentTime;
    const o = this.out(pan, vol, 0.5);
    this.noiseBurst(o, t, 0.003, 1.1, 0.9, { type: "lowpass", f0: 3200, f1: 600 });
    for (const f of [523, 811, 1187, 1543, 2219, 3011]) this.noiseBurst(o, t, 0.002, rnd(1.2, 2.2), 0.22, { type: "bandpass", f0: f, q: 30 });
    this.tone(o, "sine", t, 62, 32, 0.004, 0.6, 1);
  }

  private clank(pan: number, vol: number): void {
    const t = this.ctx!.currentTime;
    const o = this.out(pan, vol, 0.35);
    this.tone(o, "sine", t, 72, 44, 0.004, 0.4, 0.9);
    this.noiseBurst(o, t, 0.002, 0.5, 0.25, { type: "bandpass", f0: 900, q: 12 });
    this.noiseBurst(o, t, 0.002, 0.2, 0.3, { type: "lowpass", f0: 600 });
  }

  private click(vol: number, f = 900): void {
    const t = this.ctx!.currentTime;
    const o = this.out(0, vol, 0);
    this.tone(o, "square", t, f, f * 0.8, 0.001, 0.03, 0.12);
    this.noiseBurst(o, t, 0.001, 0.02, 0.1, { type: "bandpass", f0: 2500, q: 2 });
  }

  private rise(pan: number, vol: number): void {
    // the dead getting up: a dark chord opening up, and whispers
    const t = this.ctx!.currentTime;
    const ctx = this.ctx!;
    const o = this.out(pan, vol, 0.6);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + 0.8);
    f.connect(o);
    for (const n of [43, 50, 56]) {
      this.tone(f, "sawtooth", t, midi(n) * 0.995, midi(n) * 1.03, 0.3, 0.9, 0.12);
      this.tone(f, "sawtooth", t, midi(n) * 1.006, midi(n) * 1.035, 0.3, 0.9, 0.1);
    }
    this.noiseBurst(o, t, 0.25, 0.6, 0.18, { type: "bandpass", f0: 1800, f1: 2600, q: 3 });
  }

  private roar(pan: number, vol: number): void {
    const t = this.ctx!.currentTime;
    const o = this.out(pan, vol, 0.55);
    this.noiseBurst(o, t, 0.2, 1.0, 0.8, { type: "lowpass", f0: 300, f1: 1400 });
    this.tone(o, "sawtooth", t, 55, 41, 0.15, 1.0, 0.35);
    this.tone(o, "sawtooth", t, 82, 61, 0.15, 1.0, 0.2);
  }

  private horn(pan: number, vol: number): void {
    const t = this.ctx!.currentTime;
    const ctx = this.ctx!;
    const o = this.out(pan, vol, 0.5);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 900;
    f.connect(o);
    this.tone(f, "sawtooth", t, midi(50), midi(50), 0.08, 0.7, 0.25);
    this.tone(f, "sawtooth", t + 0.02, midi(57), midi(57), 0.08, 0.65, 0.18);
  }

  private whoosh(pan: number, vol: number): void {
    const t = this.ctx!.currentTime;
    this.noiseBurst(this.out(pan, vol, 0.2), t, 0.05, 0.28, 0.35, { type: "bandpass", f0: 300, f1: 2400, q: 1.2 });
  }

  private creak(pan: number, vol: number): void {
    const t = this.ctx!.currentTime;
    const ctx = this.ctx!;
    const o = this.out(pan, vol, 0.3);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 900;
    f.Q.value = 8;
    f.connect(o);
    this.tone(f, "sawtooth", t, 90, 150, 0.05, 0.5, 0.4);
  }

  private coins(pan: number, vol: number, n: number): void {
    const t = this.ctx!.currentTime;
    const o = this.out(pan, vol, 0.25);
    for (let i = 0; i < n; i++) {
      const f = rnd(1900, 2900);
      this.tone(o, "sine", t + i * 0.06 + rnd(0, 0.02), f, f, 0.002, 0.14, 0.14);
    }
  }

  private shimmer(pan: number, vol: number): void {
    this.chime(pan, vol, [74, 77, 81, 84, 88], 0.05);
  }

  private dread(pan: number, vol: number): void {
    const t = this.ctx!.currentTime;
    const ctx = this.ctx!;
    const o = this.out(pan, vol, 0.7);
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 500;
    f.connect(o);
    for (const n of [38, 45, 51]) this.tone(f, "sawtooth", t, midi(n), midi(n), 0.4, 2, 0.16);
    this.bell(pan, vol * 0.5, midi(50));
  }

  private bark(pan: number, vol: number): void {
    const t = this.ctx!.currentTime;
    const o = this.out(pan, vol, 0.3);
    for (const dt of [0, 0.16]) {
      this.noiseBurst(o, t + dt, 0.005, 0.08, 0.4, { type: "bandpass", f0: 700, q: 3 });
      this.tone(o, "sawtooth", t + dt, 320, 190, 0.005, 0.09, 0.2);
    }
  }

  private sizzle(pan: number, vol: number): void {
    const t = this.ctx!.currentTime;
    this.noiseBurst(this.out(pan, vol, 0.2), t, 0.02, 0.4, 0.3, { type: "highpass", f0: 2200 });
  }

  private pain(vol: number): void {
    const t = this.ctx!.currentTime;
    const o = this.out(0, vol, 0.15);
    this.tone(o, "sine", t, 95, 48, 0.003, 0.28, 0.9);
    this.noiseBurst(o, t, 0.002, 0.15, 0.4, { type: "lowpass", f0: 900 });
    this.tone(o, "sawtooth", t, 140, 90, 0.01, 0.2, 0.12);
  }

  private scrape(pan: number, vol: number): void {
    const t = this.ctx!.currentTime;
    const o = this.out(pan, vol, 0.1);
    for (let i = 0; i < 3; i++) this.noiseBurst(o, t + i * 0.12, 0.01, 0.07, 0.22, { type: "bandpass", f0: 1400, f1: 600, q: 3 });
  }

  // ---------------------------------------------------------------- events → sounds
  /** Play what this simulation step sounded like, heard from where the necromancer stands. */
  hear(events: GameEvent[], w: World): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    const me = w.player.pos;
    const at = (p: Vec): [number, number] => {
      const dx = p.x - me.x;
      const d = Math.hypot(dx, p.y - me.y);
      return [dx / 900, Math.max(0.12, 1 - d / 1700)];
    };
    for (const e of events) {
      switch (e.type) {
        case "shot": {
          const [pan, vol] = at(e.pos);
          const heavy = e.weapon === "hakownica" || e.weapon === "headsman" || e.weapon === "organ" || e.weapon === "martyrs" || e.weapon === "arquebus" || e.weapon === "mortar" ? 1 : e.weapon === "blunderbuss" || e.weapon === "lament" || e.weapon === "petronel" ? 0.6 : 0.25;
          if (!e.fromPlayer) {
            if (this.allow("eshot", 0.05)) this.gunshot(pan, vol * 0.55, 0.3, true);
          } else if (e.weapon === "crossbow" || e.weapon === "inqcrossbow") {
            if (this.allow("twang", 0.04)) this.twang(pan, 0.7);
          } else if (e.weapon === "howler" || e.weapon === "ashbook" || e.weapon === "bonestaff") {
            if (this.allow("occult", 0.05)) this.whisper(pan, 0.8);
          } else if (this.allow("shot", 0.03)) {
            this.gunshot(pan, 0.8, heavy, false);
          }
          break;
        }
        case "reloadStart":
          if (this.allow("reload", 0.2)) this.scrape(0, 0.6);
          break;
        case "reloadDone":
          if (this.allow("reloaded", 0.1)) this.click(0.7, 2200);
          break;
        case "weaponSwitch":
          if (this.allow("switch", 0.08)) this.click(0.6, 1200);
          break;
        case "empty":
        case "noSouls":
          if (this.allow("empty", 0.2)) this.click(0.5, 300);
          break;
        case "enemyHit": {
          const [pan, vol] = at(e.pos);
          if (this.allow("hit", 0.035)) this.flesh(pan, vol * 0.75, false);
          break;
        }
        case "enemyDeath": {
          const [pan, vol] = at(e.pos);
          if (this.allow("death", 0.05)) this.flesh(pan, vol, true);
          break;
        }
        case "minionHit": {
          const [pan, vol] = at(e.pos);
          if (this.allow("mhit", 0.06)) this.flesh(pan, vol * 0.5, false);
          break;
        }
        case "minionDeath": {
          const [pan, vol] = at(e.pos);
          if (this.allow("mdeath", 0.08)) this.puff(pan, vol * 0.8);
          break;
        }
        case "playerHit":
          if (this.allow("pain", 0.1)) this.pain(0.9);
          break;
        case "playerDeath":
          this.pain(1);
          this.bell(0, 0.8, midi(38));
          break;
        case "dodge":
          if (this.allow("dodge", 0.1)) this.whoosh(at(e.pos)[0], 0.6);
          break;
        case "raise": {
          const [pan, vol] = at(e.pos);
          if (this.allow("raise", 0.15)) this.rise(pan, vol * 0.8);
          break;
        }
        case "soulPickup":
          if (this.allow("soul", 0.08)) this.chime(0, 0.5, [86, 93], 0.05);
          break;
        case "heal":
        case "shrine":
          if (this.allow("heal", 0.3)) this.chime(0, 0.5, [74, 78, 81], 0.08);
          break;
        case "lightOut":
        case "lightHit": {
          const [pan, vol] = at(e.pos);
          if (this.allow("light", 0.05)) this.puff(pan, vol * (e.type === "lightOut" ? 0.8 : 0.45));
          break;
        }
        case "relight": {
          const [pan, vol] = at(e.pos);
          if (this.allow("relight", 0.2)) this.whoosh(pan, vol * 0.35);
          break;
        }
        case "chandelierFall":
          if (this.allow("chain", 0.2)) this.chime(at(e.pos)[0], 0.4, [96, 101], 0.03);
          break;
        case "chandelierCrash":
          this.crash(at(e.pos)[0], 1);
          break;
        case "windowBreak":
          if (this.allow("glass", 0.1)) this.glass(at(e.pos)[0], 0.8);
          break;
        case "explosion": {
          const [pan, vol] = at(e.pos);
          if (this.allow("boom", 0.06)) this.boom(pan, vol, Math.min(1, e.radius / 160));
          break;
        }
        case "fire":
          if (this.allow("fire", 0.15)) this.whoosh(at(e.pos)[0], 0.4);
          break;
        case "burn":
          if (this.allow("burn", 0.3)) this.sizzle(0, 0.6);
          break;
        case "coverFlip":
        case "coverBreak": {
          const [pan, vol] = at(e.pos);
          if (this.allow("cover", 0.08)) this.clank(pan, vol * 0.5);
          break;
        }
        case "doorsShut":
          this.clank(0, 0.9);
          break;
        case "trap":
          this.clank(at(e.pos)[0], 0.8);
          this.click(0.5, 1800);
          break;
        case "bell":
          if (e.done) this.bell(at(e.pos)[0], 0.7, midi(57));
          else if (this.allow("ring", 0.4)) this.chime(at(e.pos)[0], 0.25, [93], 0);
          break;
        case "alarm":
          if (this.allow("alarm", 1.5)) this.horn(at(e.pos)[0], 0.6);
          break;
        case "bark":
          if (this.allow("bark", 0.6)) this.bark(at(e.pos)[0], 0.6);
          break;
        case "pickup":
          if (e.kind === "gold" && this.allow("coin", 0.05)) this.coins(0, 0.5, 2);
          else if (e.kind !== "gold" && this.allow("pickup", 0.1)) this.chime(0, 0.4, [81, 88], 0.06);
          break;
        case "buy":
          this.coins(0, 0.6, 4);
          break;
        case "hatch":
          this.creak(0, 0.8);
          this.clank(0, 0.4);
          break;
        case "chestOpen":
          this.creak(at(e.pos)[0], 0.6);
          this.coins(at(e.pos)[0], 0.4, 3);
          break;
        case "chestBreak":
          this.clank(at(e.pos)[0], 0.6);
          break;
        case "mimic":
          this.roar(at(e.pos)[0], 0.5);
          break;
        case "itemGet":
          this.chime(0, 0.55, [69, 74, 77, 81], 0.07);
          break;
        case "relicUse":
          this.shimmer(0, 0.7);
          break;
        case "relicReady":
          this.chime(0, 0.35, [81, 86], 0.08);
          break;
        case "legend":
        case "ritual":
        case "synergy":
          this.dread(0, 0.7);
          break;
        case "abomination":
          this.flesh(at(e.pos)[0], 0.9, true);
          this.roar(at(e.pos)[0], 0.4);
          break;
        case "secretOpen":
          this.boom(at(e.pos)[0], 0.5, 0.2);
          break;
        case "exorcism":
          if (!e.warn && this.allow("exorcism", 0.3)) this.chime(at(e.pos)[0], 0.5, [81, 88, 93], 0.02);
          break;
        case "telegraph":
          if (w.units.some((u) => u.id === e.enemy && u.def.boss) && this.allow("warn", 0.3)) {
            const t = this.ctx.currentTime;
            this.tone(this.out(0, 0.5, 0.4), "sine", t, 70, 55, 0.02, 0.35, 0.5);
          }
          break;
        case "roomCleared":
          this.bell(0, 0.35, midi(45));
          break;
        case "bossIntro":
          this.bell(0, 1, midi(38));
          break;
        case "bossPhase":
          this.roar(0, 0.9);
          break;
        case "bossDeath":
          this.boom(0, 1, 1);
          this.bell(0, 0.9, midi(43));
          break;
        case "command":
          if (this.allow("command", 0.3)) this.tone(this.out(0, 0.3, 0.3), "sine", this.ctx.currentTime, 220, 330, 0.02, 0.2, 0.3);
          break;
        case "special":
          this.whoosh(0, 0.6);
          break;
        // a squad leader's word: a drum stroke for "Fire!", a horn for the charge, a low bell for the chant
        case "squadOrder": {
          const [pan, vol] = at(e.pos);
          if (!this.allow(`order-${e.order}`, 0.4)) break;
          if (e.order === "volley") {
            this.boom(pan, vol * 0.35, 0.25);
            this.tone(this.out(pan, vol * 0.25, 0.2), "square", this.ctx.currentTime, 140, 95, 0.005, 0.12, 0.3);
          } else if (e.order === "charge") this.horn(pan, vol * 0.7);
          else this.bell(pan, vol * 0.5, midi(45));
          break;
        }
        case "squadBroken": {
          const [pan, vol] = at(e.pos);
          this.scrape(pan, vol * 0.5);
          break;
        }
        case "corpseBurned": {
          const [pan, vol] = at(e.pos);
          this.whoosh(pan, vol * 0.6);
          this.sizzle(pan, vol * 0.5);
          break;
        }
        case "pavise": {
          const [pan, vol] = at(e.pos);
          this.boom(pan, vol * 0.3, 0.2);
          this.clank(pan, vol * 0.4);
          break;
        }
        default:
          break;
      }
    }
  }

  /** Menu sounds. */
  ui(kind: "move" | "accept"): void {
    if (!this.ctx || this.ctx.state !== "running") return;
    if (kind === "move" && this.allow("uimove", 0.04)) this.click(0.25, 700);
    if (kind === "accept" && this.allow("uiaccept", 0.05)) this.click(0.4, 1100);
  }

  // ---------------------------------------------------------------- music
  /** Called every frame: keeps the music scheduled a little ahead and follows the mood. */
  update(state: MusicState, paused: boolean): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    if (state !== this.state) {
      this.state = state;
      const m = MIX[state];
      for (const k of ["organ", "choir", "drums", "bells"] as const) this.layers[k].gain.setTargetAtTime(m[k], t, k === "drums" ? 0.25 : 0.8);
    }
    this.musicDuck.gain.setTargetAtTime(paused ? 0.35 : 1, t, 0.2);
    if (this.nextStep < t - 0.5) this.nextStep = t + 0.05; // we fell asleep (a hidden tab): start fresh
    while (this.nextStep < t + 0.25) {
      this.playStep(this.nextStep);
      this.nextStep += 60 / MIX[this.state].bpm / 4;
    }
  }

  private playStep(t: number): void {
    const st = this.state;
    const s = this.step;
    const beat = 60 / MIX[st].bpm;
    const barLen = beat * 4;
    const chord = PROG[this.bar % PROG.length];
    if (st !== "silent") {
      if (s === 0) {
        // the organ holds the chord for the bar, the choir sings above it
        for (const n of chord) this.organ(t, n, barLen * 1.02, 0.11);
        this.organ(t, chord[0] - 12, barLen * 1.02, 0.12); // the pedal
        if (this.bar % 2 === 0 || st === "boss" || st === "title") for (const n of chord.slice(1)) this.choir(t, n + 12, barLen * 2);
        if ((this.bar % 4 === 0 && st !== "combat") || st === "boss") this.musicBell(t, midi(chord[0] - 12));
        // the dread chord: a minor second rubbing against the root at the end of every other bar
        if ((st === "combat" || st === "boss") && this.bar % 2 === 1) this.organ(t + beat * 3, chord[0] + 13, beat, 0.08);
      }
      // in a fight the organ stabs on the beat
      if ((st === "combat" || st === "boss") && (s === 0 || s === 8)) for (const n of chord) this.organ(t, n, beat * 0.6, 0.08);
      const d = DRUMS[st];
      if (d) {
        if (d.k.includes(s)) this.timpani(t, s === 0 ? 1 : 0.75);
        if (d.s.includes(s)) this.frameDrum(t);
      }
    }
    this.step = (s + 1) % 16;
    if (this.step === 0) this.bar += 1;
  }

  private organ(t: number, note: number, dur: number, vel: number): void {
    const ctx = this.ctx!;
    const f = midi(note);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.12);
    g.gain.setValueAtTime(vel, t + Math.max(0.13, dur - 0.3));
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.3);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = this.state === "crypt" ? 900 : 2200;
    g.connect(lp).connect(this.layers.organ);
    // a flue pipe: a few sine harmonics, slightly detuned against each other
    for (const [mul, amp, det] of [[1, 1, 0], [2, 0.45, 3], [3, 0.2, -2], [4, 0.12, 4], [0.5, 0.35, 0]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f * mul;
      o.detune.value = det;
      const a = ctx.createGain();
      a.gain.value = amp;
      o.connect(a).connect(g);
      o.start(t);
      o.stop(t + dur + 0.4);
      this.track(o);
    }
  }

  private choir(t: number, note: number, dur: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + Math.min(1.2, dur * 0.3));
    g.gain.setValueAtTime(0.05, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(this.layers.choir);
    // a wordless "aah": a buzzing voice through three formants, with a slow vibrato
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = midi(note);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.8 + Math.random();
    const depth = ctx.createGain();
    depth.gain.value = 9;
    lfo.connect(depth).connect(o.detune);
    for (const [f, q, a] of [[720, 7, 1], [1150, 9, 0.6], [2600, 12, 0.3]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = f;
      bp.Q.value = q;
      const amp = ctx.createGain();
      amp.gain.value = a;
      o.connect(bp).connect(amp).connect(g);
    }
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.1);
    lfo.stop(t + dur + 0.1);
    this.track(o);
  }

  private musicBell(t: number, f0: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    g.connect(this.layers.bells);
    const partials = [0.5, 1, 1.183, 1.506, 2, 2.514, 3.011];
    const amps = [0.5, 1, 0.45, 0.4, 0.35, 0.2, 0.15];
    partials.forEach((p, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = f0 * p;
      const a = ctx.createGain();
      a.gain.setValueAtTime(0.0001, t);
      a.gain.linearRampToValueAtTime(amps[i] * 0.12, t + 0.005);
      a.gain.exponentialRampToValueAtTime(0.0001, t + 5 - i * 0.5);
      o.connect(a).connect(g);
      o.start(t);
      o.stop(t + 5.2);
      this.track(o);
    });
  }

  private timpani(t: number, vel: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = vel;
    g.connect(this.layers.drums);
    this.tone(g, "sine", t, 78, 46, 0.003, 0.45, 0.6, 0.3);
    this.noiseBurst(g, t, 0.001, 0.06, 0.25, { type: "lowpass", f0: 350 });
  }

  private frameDrum(t: number): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0.8;
    g.connect(this.layers.drums);
    this.noiseBurst(g, t, 0.001, 0.14, 0.3, { type: "bandpass", f0: 1100, q: 0.9 });
    this.tone(g, "triangle", t, 190, 140, 0.002, 0.08, 0.2);
  }
}
