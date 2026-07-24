import type { DisplayMoveQuality } from "../analysis/moveClassification";

// Bảng màu phân loại nước đi theo chuẩn chess.com
export const STORY_QUALITY_COLORS: Record<DisplayMoveQuality, string> = {
  brilliant: "#26c2a3",
  best: "#96bc4b",
  good: "#96af8b",
  inaccuracy: "#f0c15c",
  mistake: "#e58f2a",
  blunder: "#fa412d",
};

export const STORY_QUALITY_LABELS: Record<DisplayMoveQuality, string> = {
  brilliant: "Brilliant",
  best: "Best",
  good: "Tốt",
  inaccuracy: "Thiếu chính xác",
  mistake: "Sai lầm",
  blunder: "Blunder",
};
