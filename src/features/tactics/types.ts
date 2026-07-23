import type { AnalysisArrow } from "../../analysis";

export const TACTICS_VERSION = 1;

export type TacticalMotif =
  | "check-mate-threat"
  | "missed-capture"
  | "hanging-piece"
  | "fork"
  | "absolute-pin"
  | "skewer"
  | "discovered-attack"
  | "back-rank"
  | "passed-pawn"
  | "removal-of-defender";

export type TacticalEvidence = {
  source: "played-position" | "best-line";
  squares: string[];
  line: string[];
  description: string;
};

export type TacticalTag = {
  motif: TacticalMotif;
  confidence: number;
  evidence: TacticalEvidence;
};

export type ThreatViewData = {
  arrow: AnalysisArrow | null;
  dangerSquares: string[];
  defenderSquares: string[];
  summary: string;
};

export type TacticalAnalysis = {
  version: number;
  tags: TacticalTag[];
  threat: ThreatViewData;
};
