import type { CSSProperties, Dispatch, RefObject, SetStateAction } from "react";
import { BookOpen } from "lucide-react";
import type { AnalysisStep } from "../../../analysis";
import type { DisplayMoveQuality } from "../moveClassification";
import type { EngineMoveAnalysis } from "../../../stockfish";
import { MoveQualityIcon } from "./MoveQualityIcon";

type MovePair = {
  number: number;
  white?: number;
  black?: number;
};

type GameTimelineProps = {
  steps: AnalysisStep[];
  engineCache: Record<number, EngineMoveAnalysis>;
  currentIndex: number;
  setCurrentIndex: Dispatch<SetStateAction<number>>;
  movePairs: MovePair[];
  totalMoves: number;
  scrollerRef: RefObject<HTMLDivElement | null>;
  qualityLabels: Record<DisplayMoveQuality, string>;
};

export function GameTimeline({
  steps,
  engineCache,
  currentIndex,
  setCurrentIndex,
  movePairs,
  totalMoves,
  scrollerRef,
  qualityLabels,
}: GameTimelineProps) {
  const hasEval = steps.some((item) => engineCache[item.ply]);
  return (
    <section className="timeline-section" aria-label="Timeline nước đi">
      <div className="timeline-label">
        <BookOpen size={14} />
        <strong>Timeline nước đi</strong>
        <small>{totalMoves} nước · {steps.length} lượt</small>
      </div>
      {hasEval && (
        <div className="timeline-eval-strip" aria-label="Diễn biến lợi thế cả ván">
          {steps.map((item, stepIndex) => {
            const engine = engineCache[item.ply];
            const cp = engine?.whiteScoreCp;
            const frac = cp === undefined ? 0 : Math.max(-1, Math.min(1, cp / 600));
            return (
              <button
                key={item.ply}
                className={`timeline-eval-bar ${frac >= 0 ? "white-adv" : "black-adv"} ${currentIndex === stepIndex ? "active" : ""}`}
                style={{ "--frac": Math.abs(frac) } as CSSProperties}
                onClick={() => setCurrentIndex(stepIndex)}
                title={`${item.moveNumber}${item.color === "w" ? "." : "…"} ${item.san}${engine ? ` · ${engine.evaluation}` : ""}`}
              />
            );
          })}
        </div>
      )}
      <div className="timeline-scroller" ref={scrollerRef}>
        {movePairs.map((pair) => (
          [pair.white, pair.black].map((stepIndex, colorIndex) => {
            if (stepIndex === undefined) return null;
            const item = steps[stepIndex];
            const engine = engineCache[item.ply];
            const itemQuality = engine?.displayQuality || engine?.quality || item.quality;
            return (
              <button
                key={stepIndex}
                data-step-index={stepIndex}
                className={`timeline-move ${colorIndex === 0 ? "white" : "black"} ${itemQuality} ${currentIndex === stepIndex ? "active" : ""}`}
                onClick={() => setCurrentIndex(stepIndex)}
                title={`${qualityLabels[itemQuality]} — ${item.title}`}
              >
                <i>{pair.number}{colorIndex === 0 ? "." : "…"}</i>
                <strong>{item.san}</strong>
                <MoveQualityIcon quality={itemQuality} title={qualityLabels[itemQuality]} />
              </button>
            );
          })
        ))}
      </div>
    </section>
  );
}
