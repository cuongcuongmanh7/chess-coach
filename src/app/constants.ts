import type { DisplayMoveQuality } from "../features/analysis/moveClassification";
import type { AiProvider } from "../shared/types/tauri";

export const QUALITY_LABELS: Record<DisplayMoveQuality, string> = {
  brilliant: "Brilliant",
  best: "Best move",
  good: "Nước tốt",
  inaccuracy: "Thiếu chính xác",
  mistake: "Sai lầm",
  blunder: "Blunder",
};

export const QUALITY_ORDER: DisplayMoveQuality[] = [
  "brilliant",
  "best",
  "good",
  "inaccuracy",
  "mistake",
  "blunder",
];

export const OPENAI_MODELS = [
  { value: "gpt-5.6-sol", label: "GPT-5.6 Sol", detail: "Chất lượng cao nhất" },
  { value: "gpt-5.6-terra", label: "GPT-5.6 Terra", detail: "Cân bằng chi phí" },
  { value: "gpt-5.6-luna", label: "GPT-5.6 Luna", detail: "Nhanh và tiết kiệm" },
];

export const GEMINI_MODELS = [
  { value: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash-Lite", detail: "Nhanh và tiết kiệm" },
  { value: "gemini-3.6-flash", label: "Gemini 3.6 Flash", detail: "Lý giải sâu hơn" },
];

export const PROVIDER_LABELS: Record<AiProvider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
};

export const COACH_LABELS: Record<AiProvider, string> = {
  openai: "HLV ChatGPT",
  gemini: "HLV Gemini",
};

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-5.6-sol",
  gemini: "gemini-3.5-flash-lite",
};
