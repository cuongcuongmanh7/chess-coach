import type { AnalysisStep } from "../../analysis";
import type { DisplayMoveQuality } from "../analysis/moveClassification";
import type { EngineMoveAnalysis } from "../../stockfish";

export type CandidateMove = {
  step: AnalysisStep;
  moveUci: string;
  moveSan: string;
};

export type CandidateResult = {
  move: CandidateMove;
  engine: EngineMoveAnalysis;
  evaluationBefore: string;
};

export type CandidateBranchMove = CandidateMove & {
  actor: "user" | "engine";
  result?: CandidateResult;
  quality?: DisplayMoveQuality;
  evaluation?: string;
  whiteScoreCp?: number;
  centipawnLoss?: number;
};

export type CandidateLabState = {
  active: boolean;
  rootFen: string;
  anchorPly: number;
  anchorLabel: string;
  userColor: "w" | "b";
  fen: string;
  loading: boolean;
  attempts: number;
  moves: CandidateBranchMove[];
  selectedIndex: number;
  moveSquares: { from: string; to: string } | null;
  result: CandidateResult | null;
  gameOver: boolean;
  error: string;
};

export type CandidatePromotion = {
  from: string;
  to: string;
};
