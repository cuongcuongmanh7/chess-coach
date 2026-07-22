export type SfxName = "tap" | "move" | "capture" | "check" | "castle" | "open" | "success" | "error";

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

function woodImpact(
  target: AudioContext,
  delay: number,
  volume: number,
  pitch = 1,
  duration = 0.085,
) {
  const start = target.currentTime + delay;
  const frameCount = Math.ceil(target.sampleRate * duration);
  const buffer = target.createBuffer(1, frameCount, target.sampleRate);
  const samples = buffer.getChannelData(0);

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / target.sampleRate;
    const click = (Math.random() * 2 - 1) * Math.exp(-time * 105) * 0.68;
    const grain = (Math.random() * 2 - 1) * Math.exp(-time * 42) * 0.12;
    const lowBody = Math.sin(Math.PI * 2 * 185 * pitch * time) * Math.exp(-time * 35) * 0.28;
    const highBody = Math.sin(Math.PI * 2 * 515 * pitch * time) * Math.exp(-time * 58) * 0.1;
    samples[index] = Math.max(-1, Math.min(1, click + grain + lowBody + highBody));
  }

  const source = target.createBufferSource();
  const filter = target.createBiquadFilter();
  const gain = target.createGain();
  source.buffer = buffer;
  source.playbackRate.value = 0.985 + Math.random() * 0.03;
  filter.type = "lowpass";
  filter.frequency.value = 4300;
  filter.Q.value = 0.72;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.0025);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(target.destination);
  source.start(start);
  source.stop(start + duration + 0.02);
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
      woodImpact(target, 0, 0.115, 1);
    } else if (name === "capture") {
      woodImpact(target, 0, 0.145, 0.88, 0.105);
      woodImpact(target, 0.017, 0.075, 1.16, 0.062);
    } else if (name === "check") {
      woodImpact(target, 0, 0.125, 0.96);
      tone(target, 1040, 0.035, 0.045, 0.01, "sine", 820);
    } else if (name === "castle") {
      woodImpact(target, 0, 0.105, 0.94);
      woodImpact(target, 0.072, 0.115, 1.04);
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
