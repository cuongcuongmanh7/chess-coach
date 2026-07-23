import type { DisplayMoveQuality } from "../analysis/moveClassification";

export type AdvantageState = "white" | "balanced" | "black";
export type StoryPerspective = "white" | "black";

export type GameStoryPoint = {
  index: number;
  ply: number;
  moveNumber: number;
  moveLabel: string;
  san: string;
  color: "w" | "b";
  evaluation: string;
  rawCp: number;
  chartPawns: number;
  centipawnLoss: number;
  quality: DisplayMoveQuality;
  clockSeconds: number | null;
  thinkTimeSeconds: number | null;
  isQuickError: boolean;
  isPressureError: boolean;
  isMate: boolean;
};

export type KeyMomentKind =
  | "swing"
  | "state-change"
  | "mate"
  | "promotion"
  | "passed-pawn";

export type KeyMoment = {
  index: number;
  ply: number;
  moveLabel: string;
  evaluation: string;
  title: string;
  description: string;
  kinds: KeyMomentKind[];
  severity: number;
};

export type GameStory = {
  points: GameStoryPoint[];
  keyMoments: KeyMoment[];
  hasTimeData: boolean;
};
