import type { MoveQuality } from "../analysis";
import type { DisplayMoveQuality } from "../features/analysis/moveClassification";

export type AutoExplainMode = "off" | "mistakes" | "visited";
export type PlayerSummary = {
  moves: number;
  acpl: number;
  bestGoodRate: number;
  counts: Record<DisplayMoveQuality, number>;
};

export type RetryState = {
  fen: string;
  attempts: number;
  hintLevel: number;
  loading: boolean;
  feedback: {
    quality: MoveQuality;
    moveSan: string;
    bestMoveSan: string;
    loss: number;
  } | null;
};

export type VariationState = {
  rank: number;
  title: string;
  moves: string[];
  positions: string[];
  moveSquares: Array<{ from: string; to: string }>;
  index: number;
};

export type SyncNotice = {
  type: "success" | "info" | "error";
  message: string;
};

export type SyncProgress = {
  phase: "fetching" | "saving";
  completed: number;
  total: number;
};

export type FullAnalysisState = {
  running: boolean;
  complete: boolean;
  completed: number;
  total: number;
  error: string;
};
