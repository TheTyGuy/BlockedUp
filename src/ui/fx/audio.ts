/**
 * Tiny Web Audio synth for sound effects — no audio files needed.
 * The AudioContext is created lazily on the first user gesture (required by
 * mobile browsers).
 */
import { store } from '../storage';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
}

interface Tone {
  freq: number;
  to?: number;
  type?: OscillatorType;
  dur: number;
  delay?: number;
  vol?: number;
}

function play(tones: Tone[]): void {
  if (!store.settings.sound || !ctx || !master) return;
  const now = ctx.currentTime;
  for (const t of tones) {
    const start = now + (t.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = t.type ?? 'sine';
    osc.frequency.setValueAtTime(t.freq, start);
    if (t.to) osc.frequency.exponentialRampToValueAtTime(t.to, start + t.dur);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(t.vol ?? 0.5, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + t.dur + 0.02);
  }
}

const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];

export const sfx = {
  pickup: () => play([{ freq: 520, to: 700, dur: 0.06, type: 'triangle', vol: 0.25 }]),
  place: () => play([{ freq: 180, to: 90, dur: 0.09, type: 'square', vol: 0.18 }]),
  invalid: () => play([{ freq: 160, to: 120, dur: 0.12, type: 'sawtooth', vol: 0.12 }]),
  clear: (lines: number, combo: number) => {
    const base = Math.min(combo, 4);
    const tones: Tone[] = [];
    for (let i = 0; i < Math.min(lines + 2, 6); i++) {
      tones.push({
        freq: NOTES[Math.min(i + base, NOTES.length - 1)],
        dur: 0.16,
        delay: i * 0.055,
        type: 'triangle',
        vol: 0.35,
      });
    }
    play(tones);
  },
  combo: (n: number) =>
    play([{ freq: 400 + n * 80, to: 900 + n * 120, dur: 0.22, type: 'sine', vol: 0.3 }]),
  deal: () => play([{ freq: 900, to: 1200, dur: 0.05, type: 'sine', vol: 0.12 }]),
  win: () =>
    play(
      [0, 2, 4, 7].map((n, i) => ({
        freq: NOTES[n],
        dur: 0.25,
        delay: i * 0.12,
        type: 'triangle' as const,
        vol: 0.4,
      })),
    ),
  lose: () =>
    play([
      { freq: 392, to: 370, dur: 0.25, type: 'triangle', vol: 0.3 },
      { freq: 330, to: 311, dur: 0.25, delay: 0.22, type: 'triangle', vol: 0.3 },
      { freq: 262, to: 196, dur: 0.5, delay: 0.44, type: 'triangle', vol: 0.3 },
    ]),
  click: () => play([{ freq: 660, dur: 0.04, type: 'triangle', vol: 0.15 }]),
};
