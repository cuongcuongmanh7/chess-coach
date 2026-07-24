import { useEffect, useRef } from "react";
import { GitBranch, LoaderCircle, X } from "lucide-react";
import { MoveQualityIcon } from "../../analysis/components/MoveQualityIcon";
import type { CandidateLabState } from "../types";

export function CandidateBranchTimeline({
  state,
  onSelect,
  onExit,
}: {
  state: CandidateLabState;
  onSelect: (index: number) => void;
  onExit: () => void;
}) {
  const movesRef = useRef<HTMLDivElement>(null);
  const previousMoveCountRef = useRef(state.moves.length);

  useEffect(() => {
    const moveAdded = state.moves.length > previousMoveCountRef.current;
    previousMoveCountRef.current = state.moves.length;
    const frame = window.requestAnimationFrame(() => {
      const scroller = movesRef.current;
      if (!scroller) return;
      const targetIndex = moveAdded ? state.moves.length - 1 : state.selectedIndex;
      const target = scroller.querySelector<HTMLElement>(
        `[data-candidate-index="${targetIndex}"]`,
      );
      if (!target) return;
      const scrollerBounds = scroller.getBoundingClientRect();
      const targetBounds = target.getBoundingClientRect();
      const targetLeft = targetBounds.left - scrollerBounds.left + scroller.scrollLeft;
      const left = moveAdded || targetIndex === state.moves.length - 1
        ? scroller.scrollWidth
        : targetLeft - (scroller.clientWidth - targetBounds.width) / 2;
      scroller.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [state.moves.length, state.selectedIndex]);

  if (!state.active) return null;
  return (
    <section className="candidate-branch-timeline" aria-label="Timeline biến nháp">
      <div className="candidate-branch-label">
        <GitBranch size={14} />
        <span><strong>Timeline biến nháp</strong> · {state.anchorLabel}</span>
        <small>Bạn cầm {state.userColor === "w" ? "Trắng" : "Đen"}</small>
      </div>
      <div className="candidate-branch-moves" ref={movesRef}>
        <button
          className={`candidate-branch-root ${state.selectedIndex === -1 ? "active" : ""}`}
          data-candidate-index="-1"
          onClick={() => onSelect(-1)}
          disabled={state.loading}
        >
          Điểm rẽ
        </button>
        {state.moves.map((move, index) => (
          <button
            className={`${move.actor} ${state.selectedIndex === index ? "active" : ""}`}
            data-candidate-index={index}
            key={`${index}-${move.moveUci}`}
            onClick={() => onSelect(index)}
            disabled={state.loading}
            title={`${move.actor === "user" ? "Nước của bạn" : "Nước Stockfish"}${move.evaluation ? ` · ${move.evaluation} · CPL ${Math.round(move.centipawnLoss || 0)}` : ""}`}
          >
            <span className="candidate-branch-actor">
              {move.actor === "user" ? "Bạn" : "Máy"}
            </span>
            <i>{move.step.moveNumber}{move.step.color === "b" ? "…" : "."}</i>
            <strong>{move.moveSan}</strong>
            {move.quality && <MoveQualityIcon quality={move.quality} />}
            {move.evaluation && (
              <small>{move.evaluation} · CPL {Math.round(move.centipawnLoss || 0)}</small>
            )}
          </button>
        ))}
        {state.loading && (
          <span className="candidate-branch-thinking">
            <LoaderCircle className="spin" size={13} /> Stockfish
          </span>
        )}
      </div>
      <button className="candidate-branch-exit" onClick={onExit}>
        <X size={13} /> Huỷ nhánh
      </button>
    </section>
  );
}
