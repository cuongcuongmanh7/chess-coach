import type { DisplayMoveQuality } from "../analysis/moveClassification";

export const STORY_QUALITY_COLORS: Record<DisplayMoveQuality, string> = {
  brilliant: "#50e3d1",
  best: "#79e4cf",
  good: "#43d9a3",
  inaccuracy: "#d8cf75",
  mistake: "#f6be49",
  blunder: "#f07167",
};

export const STORY_QUALITY_LABELS: Record<DisplayMoveQuality, string> = {
  brilliant: "Brilliant",
  best: "Best",
  good: "Tốt",
  inaccuracy: "Thiếu chính xác",
  mistake: "Sai lầm",
  blunder: "Blunder",
};
