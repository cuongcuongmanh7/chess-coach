import { Dumbbell, Lightbulb, LoaderCircle } from "lucide-react";
import type { AnalysisStep } from "../../../analysis";
import { QUALITY_LABELS } from "../../../app/constants";
import type { RetryState } from "../../../app/types";
import type { EngineMoveAnalysis } from "../../../stockfish";

export function RetryPanel({
  state,
  step,
  engine,
  bestPiece,
  onTryAgain,
  onHint,
  onExit,
}: {
  state: RetryState;
  step: AnalysisStep;
  engine: EngineMoveAnalysis | undefined;
  bestPiece: string;
  onTryAgain: () => void;
  onHint: () => void;
  onExit: () => void;
}) {
  return (
    <div className={`retry-panel ${state.feedback?.quality || ""}`}>
      <div className="retry-heading">
        <Dumbbell size={15} />
        <strong>Luyện tìm nước tốt nhất</strong>
        <span>Lần thử {state.attempts}</span>
      </div>
      {state.loading && (
        <p><LoaderCircle className="spin" size={14} /> Stockfish đang chấm nước của bạn…</p>
      )}
      {!state.loading && state.feedback && (
        <div className="retry-feedback">
          <strong>{QUALITY_LABELS[state.feedback.quality]} · {state.feedback.moveSan}</strong>
          <span>{state.feedback.quality === "best"
            ? "Bạn đã tìm được nước tốt nhất."
            : `Mất ${state.feedback.loss} cp · Stockfish chọn ${state.feedback.bestMoveSan}.`}</span>
        </div>
      )}
      {!state.loading && !state.feedback && (
        <p>Kéo quân trên bàn cờ để thử nước của bạn.</p>
      )}
      {state.hintLevel > 0 && (
        <div className="retry-hint"><Lightbulb size={13} />{
          state.hintLevel === 1
            ? `Tập trung vào ý tưởng: ${step.tags[0] || step.phase}.`
            : state.hintLevel === 2
              ? `Hãy cân nhắc di chuyển ${bestPiece}.`
              : `Nước tốt nhất là ${engine?.bestMoveSan || "—"}.`
        }</div>
      )}
      <div className="retry-actions">
        {state.feedback && state.feedback.quality !== "best" && (
          <button onClick={onTryAgain}>Thử lại lần nữa</button>
        )}
        {state.hintLevel < 3 && (
          <button onClick={onHint}>
            <Lightbulb size={13} /> Gợi ý {state.hintLevel + 1}
          </button>
        )}
        <button onClick={onExit}>Thoát luyện tập</button>
      </div>
    </div>
  );
}
