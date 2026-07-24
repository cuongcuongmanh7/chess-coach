import type { ComponentProps, CSSProperties } from "react";
import { Chessboard } from "react-chessboard";
import type { EngineMoveAnalysis } from "../../stockfish";
import {
  getBoardBadgePosition,
  type BoardMoveBadge,
} from "../../features/analysis/boardUtils";
import { MoveQualityIcon } from "../../features/analysis/components/MoveQualityIcon";
import type { CandidateBranchMove, CandidatePromotion } from "../../features/candidate-lab/types";
import { CandidatePromotionPicker } from "../../features/candidate-lab/components/CandidateLabControls";
import { evaluationToWhitePercent } from "../../shared/utils/format";
import { BoardModeBadge } from "./BoardModeBadge";

type BoardMode = "main" | "retry" | "variation" | "candidate";

export function AnalysisBoard({
  orientation,
  whiteEvaluationPercent,
  evaluationLeader,
  evaluationScoreAtTop,
  engine,
  engineLoading,
  mode,
  variationTitle,
  candidateColor,
  chessboardOptions,
  onMouseDownCapture,
  boardMoveBadge,
  boardMoveBadgePosition,
  candidateMove,
  candidateLoading,
  retryPromotion,
  onRetryPromotion,
  onCancelRetryPromotion,
  candidatePromotion,
  onCandidatePromotion,
  onCancelCandidatePromotion,
}: {
  orientation: "white" | "black";
  whiteEvaluationPercent: number;
  evaluationLeader: "white" | "black";
  evaluationScoreAtTop: boolean;
  engine: EngineMoveAnalysis | undefined;
  engineLoading: boolean;
  mode: BoardMode;
  variationTitle?: string;
  candidateColor?: "w" | "b";
  chessboardOptions: ComponentProps<typeof Chessboard>["options"];
  onMouseDownCapture: ComponentProps<"div">["onMouseDownCapture"];
  boardMoveBadge: BoardMoveBadge | null;
  boardMoveBadgePosition: CSSProperties;
  candidateMove?: CandidateBranchMove;
  candidateLoading?: boolean;
  retryPromotion: { from: string; to: string } | null;
  onRetryPromotion: (piece: string) => void;
  onCancelRetryPromotion: () => void;
  candidatePromotion: CandidatePromotion | null;
  onCandidatePromotion: (piece: string) => void;
  onCancelCandidatePromotion: () => void;
}) {
  const candidateBadge = candidateMove?.quality || null;
  const visibleBadge = mode === "candidate" ? candidateBadge : boardMoveBadge;
  const visibleBadgePosition = mode === "candidate" && candidateMove
    ? getBoardBadgePosition(candidateMove.step.to, orientation)
    : boardMoveBadgePosition;
  const candidateWhitePercent = evaluationToWhitePercent(candidateMove?.whiteScoreCp);
  const visibleWhitePercent = mode === "candidate"
    ? candidateWhitePercent
    : whiteEvaluationPercent;
  const visibleLeader = mode === "candidate"
    ? (candidateMove?.whiteScoreCp || 0) >= 0 ? "white" : "black"
    : evaluationLeader;
  const visibleScoreAtTop = mode === "candidate"
    ? visibleLeader !== orientation
    : evaluationScoreAtTop;
  const visibleEvaluation = mode === "candidate"
    ? candidateMove?.evaluation || "—"
    : engine?.evaluation || "—";
  const visibleLoading = mode === "candidate" ? candidateLoading : engineLoading;
  return (
    <div className="board-stage">
      <div
        className={`evaluation-bar orientation-${orientation}`}
        role="meter"
        aria-label={`Đánh giá vị trí: ${visibleLoading ? "đang tính" : visibleEvaluation}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(visibleWhitePercent)}
        title={`Trắng ${Math.round(visibleWhitePercent)}% · Đen ${Math.round(100 - visibleWhitePercent)}%`}
      >
        <div className="evaluation-bar-side black" style={{ height: `${100 - visibleWhitePercent}%` }} />
        <div className="evaluation-bar-side white" style={{ height: `${visibleWhitePercent}%` }} />
        <span className={`evaluation-bar-score ${visibleLeader} ${visibleScoreAtTop ? "top" : "bottom"}`}>
          {visibleLoading ? "…" : visibleEvaluation}
        </span>
      </div>
      <div className="board-wrap" onMouseDownCapture={onMouseDownCapture}>
        {mode !== "main" && (
          <BoardModeBadge
            mode={mode}
            variationTitle={variationTitle}
            candidateColor={candidateColor}
          />
        )}
        <Chessboard options={chessboardOptions} />
        {(mode === "main" || mode === "candidate") && visibleBadge && (
          <div className="board-move-badge-square" style={visibleBadgePosition}>
            <MoveQualityIcon quality={visibleBadge} />
          </div>
        )}
        {retryPromotion && (
          <div className="promotion-picker">
            <span>Phong cấp thành</span>
            <div>{(["q", "r", "b", "n"] as const).map((piece) => (
              <button key={piece} onClick={() => onRetryPromotion(piece)}>
                {{ q: "Hậu", r: "Xe", b: "Tượng", n: "Mã" }[piece]}
              </button>
            ))}</div>
            <button className="promotion-cancel" onClick={onCancelRetryPromotion}>Huỷ</button>
          </div>
        )}
        {candidatePromotion && (
          <CandidatePromotionPicker
            promotion={candidatePromotion}
            onChoose={onCandidatePromotion}
            onCancel={onCancelCandidatePromotion}
          />
        )}
      </div>
    </div>
  );
}
