export type SfxName = "tap" | "move" | "open" | "success" | "error";

const STORAGE_KEY = "kypho-sfx-enabled";
let audioContext: AudioContext | null = null;
let enabled = typeof window !== "undefined" && window.localStorage.getItem(STORAGE_KEY) !== "false";
const lastPlayed = new Map<SfxName, number>();

function context() {
  if (audioContext) return audioContext;
  const AudioContextClass = window.AudioContext
    || (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  audioContext = new AudioContextClass();
  return audioContext;
}

function tone(
  target: AudioContext,
  frequency: number,
  delay: number,
  duration: number,
  volume: number,
  type: OscillatorType = "sine",
  endFrequency = frequency,
) {
  const start = target.currentTime + delay;
  const oscillator = target.createOscillator();
  const gain = target.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.012, duration / 3));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(target.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export function sfxEnabled() {
  return enabled;
}

export function setSfxEnabled(value: boolean) {
  enabled = value;
  window.localStorage.setItem(STORAGE_KEY, String(value));
}

export function playSfx(name: SfxName) {
  if (!enabled || typeof window === "undefined") return;
  const now = Date.now();
  if (now - (lastPlayed.get(name) || 0) < 35) return;
  lastPlayed.set(name, now);

  try {
    const target = context();
    if (!target) return;
    if (target.state === "suspended") void target.resume();
    if (name === "tap") {
      tone(target, 520, 0, 0.035, 0.018, "sine", 430);
    } else if (name === "move") {
      tone(target, 185, 0, 0.045, 0.025, "triangle", 145);
      tone(target, 760, 0.012, 0.028, 0.012, "square", 620);
    } else if (name === "open") {
      tone(target, 310, 0, 0.08, 0.018, "sine", 470);
      tone(target, 465, 0.035, 0.085, 0.014, "sine", 620);
    } else if (name === "success") {
      tone(target, 523.25, 0, 0.11, 0.025);
      tone(target, 659.25, 0.07, 0.12, 0.024);
      tone(target, 783.99, 0.14, 0.16, 0.022);
    } else {
      tone(target, 210, 0, 0.13, 0.028, "sawtooth", 145);
      tone(target, 155, 0.08, 0.18, 0.022, "triangle", 105);
    }
  } catch {
    // Audio is decorative; browser policy or missing hardware must never block the app.
  }
}
