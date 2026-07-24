import {
  FlaskConical,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react";
import { QUALITY_LABELS } from "../../../app/constants";
import { MoveQualityIcon } from "../../analysis/components/MoveQualityIcon";
import { tacticLabel } from "../../tactics/presentation";
import type {
  CandidateLabState,
  CandidatePromotion,
} from "../types";

export function CandidateLabLaunch({
  available,
  blockedReason,
  onStart,
}: {
  available: boolean;
  blockedReason?: string;
  onStart: () => void;
}) {
  return (
    <button
      className="candidate-launch"
      onClick={onStart}
      disabled={!available}
      title={blockedReason}
    >
      <FlaskConical size={15} /> Phân tích nước đi tự chọn
    </button>
  );
}

export function CandidatePromotionPicker({
  promotion,
  onChoose,
  onCancel,
}: {
  promotion: CandidatePromotion;
  onChoose: (piece: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="promotion-picker candidate-promotion-picker">
      <span>Phong cấp candidate thành</span>
      <div>{(["q", "r", "b", "n"] as const).map((piece) => (
        <button key={piece} onClick={() => onChoose(piece)}>
          {{ q: "Hậu", r: "Xe", b: "Tượng", n: "Mã" }[piece]}
        </button>
      ))}</div>
      <button className="promotion-cancel" onClick={onCancel}>Huỷ</button>
    </div>
  );
}

export function CandidateLabPanel({
  state,
  onTryAnother,
  onExit,
}: {
  state: CandidateLabState;
  onTryAnother: () => void;
  onExit: () => void;
}) {
  if (!state.active) return null;
  const result = state.result;
  const loss = Math.round(result?.engine.centipawnLoss || 0);
  const userMoveIndex = result
    ? state.moves.findIndex((move) => (
      move.actor === "user"
      && move.step.ply === result.move.step.ply
      && move.moveUci === result.move.moveUci
    ))
    : -1;
  const userMove = userMoveIndex >= 0 ? state.moves[userMoveIndex] : null;
  const engineReply = state.moves[userMoveIndex + 1]?.actor === "engine"
    ? state.moves[userMoveIndex + 1]
    : null;
  const userQuality = result?.engine.displayQuality || result?.engine.quality;
  return (
    <section className="candidate-panel" aria-live="polite">
      <header>
        <span><FlaskConical size={16} /><strong>Phân tích nước đi tự chọn</strong></span>
        <small>Depth {result?.engine.depth || "—"} · {state.moves.length} lượt nhánh</small>
      </header>

      {state.loading && (
        <p className="candidate-status">
          <LoaderCircle className="spin" size={15} />
          Stockfish đang chấm nước của bạn và chọn nước đáp…
        </p>
      )}
      {!state.loading && !result && !state.error && (
        <p className="candidate-status">
          Kéo một nước hợp lệ. Stockfish sẽ tự động đáp trả.
        </p>
      )}
      {state.error && <p className="candidate-error">{state.error}</p>}

      {result && (
        <>
          <div className="candidate-move-evaluations">
            <div className="candidate-move-evaluation user">
              <small>Bạn đi</small>
              <strong>{userMove?.moveSan || result.move.moveSan}</strong>
              {userQuality && <MoveQualityIcon quality={userQuality} />}
              <span>{userQuality ? QUALITY_LABELS[userQuality] : "Đang chấm"}</span>
              <em>{result.evaluationBefore} → {result.engine.evaluation}</em>
              <b>CPL {loss}</b>
            </div>
            <div className="candidate-move-evaluation engine">
              <small>Stockfish đáp</small>
              <strong>{engineReply?.moveSan || result.engine.bestReplySan || "Hết ván"}</strong>
              {engineReply?.quality && <MoveQualityIcon quality={engineReply.quality} />}
              <span>{engineReply ? "Best move" : "Kết thúc"}</span>
              <em>{engineReply?.evaluation || result.engine.evaluation}</em>
              <b>CPL {engineReply?.centipawnLoss ?? 0}</b>
            </div>
          </div>
          <p className="candidate-comparison">
            {loss === 0
              ? `Trùng phương án tốt nhất: ${result.engine.bestMoveSan}.`
              : `Kém best move ${result.engine.bestMoveSan} khoảng ${loss} cp.`}
          </p>
          {result.engine.replyLineSan.length > 0 && (
            <p className="candidate-line">
              <small>Biến kiểm chứng</small>
              {result.engine.replyLineSan.join(" ")}
            </p>
          )}
          {Boolean(result.engine.tactics?.tags.length) && (
            <div className="candidate-tags">
              {result.engine.tactics!.tags.map((tag) => (
                <span key={tag.motif}>{tacticLabel(tag.motif)}</span>
              ))}
            </div>
          )}
          <p className="candidate-status">
            {state.gameOver
              ? "Nhánh đã kết thúc."
              : state.selectedIndex < state.moves.length - 1
                ? "Đang xem lại nhánh. Chọn một vị trí hợp lệ để rẽ tiếp."
                : "Đến lượt bạn đi tiếp."}
          </p>
        </>
      )}

      <div className="candidate-actions">
        {(state.moves.length > 0 || state.error) && (
          <button onClick={onTryAnother}><RotateCcw size={13} /> Làm lại nhánh</button>
        )}
        <button onClick={onExit}><X size={13} /> Về mainline</button>
      </div>
    </section>
  );
}
