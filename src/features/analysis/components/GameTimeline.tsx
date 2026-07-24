import type { Dispatch, RefObject, SetStateAction } from "react";
import { BookOpen, CheckCircle2, LoaderCircle, TriangleAlert } from "lucide-react";
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
  fullAnalysis: {
    running: boolean;
    complete: boolean;
    completed: number;
    total: number;
    error: string;
  };
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
  fullAnalysis,
  qualityLabels,
}: GameTimelineProps) {
  return (
    <section className="timeline-section">
      <div className="timeline-header">
        <div><BookOpen size={17} /><strong>Timeline nước đi</strong><span>{totalMoves} nước · {steps.length} lượt</span></div>
        <div className="timeline-summary-actions">
          <div
            className={`timeline-analysis-status ${fullAnalysis.complete ? "complete" : fullAnalysis.error ? "error" : ""}`}
            title={fullAnalysis.error || undefined}
          >
            {fullAnalysis.running
              ? <LoaderCircle className="spin" size={12} />
              : fullAnalysis.complete
                ? <CheckCircle2 size={12} />
                : fullAnalysis.error
                  ? <TriangleAlert size={12} />
                  : null}
            {fullAnalysis.running
              ? `${fullAnalysis.completed}/${fullAnalysis.total} lượt`
              : fullAnalysis.complete
                ? "Đã phân tích toàn ván"
                : fullAnalysis.error
                  ? "Phân tích cần thử lại"
                  : "Chưa phân tích toàn ván"}
          </div>
          <div className="timeline-key">
            <span><MoveQualityIcon quality="brilliant" /> Brilliant</span>
            <span><MoveQualityIcon quality="best" /> Best</span>
            <span><MoveQualityIcon quality="good" /> Tốt</span>
            <span><MoveQualityIcon quality="inaccuracy" /> Thiếu CX</span>
            <span><MoveQualityIcon quality="mistake" /> Sai</span>
            <span><MoveQualityIcon quality="blunder" /> Blunder</span>
          </div>
        </div>
      </div>
      <div className="timeline-scroller" ref={scrollerRef}>
        {movePairs.map((pair) => (
          <div className="move-pair" key={pair.number}>
            <span className="move-number">{pair.number}.</span>
            {[pair.white, pair.black].map((stepIndex, colorIndex) => {
              if (stepIndex === undefined) return null;
              const item = steps[stepIndex];
              const engine = engineCache[item.ply];
              const itemQuality = engine?.displayQuality || engine?.quality || item.quality;
              return (
                <button
                  key={stepIndex}
                  data-step-index={stepIndex}
                  className={`timeline-move ${itemQuality} ${currentIndex === stepIndex ? "active" : ""}`}
                  onClick={() => setCurrentIndex(stepIndex)}
                  title={`${qualityLabels[itemQuality]} — ${item.title}`}
                >
                  <i className={`piece-dot ${colorIndex === 0 ? "white-piece" : "black-piece"}`} />
                  {item.san}<MoveQualityIcon quality={itemQuality} title={qualityLabels[itemQuality]} />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
