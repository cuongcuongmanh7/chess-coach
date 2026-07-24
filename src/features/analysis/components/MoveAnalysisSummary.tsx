import { ChevronDown, Cpu, LoaderCircle, TriangleAlert } from "lucide-react";
import { useState } from "react";
import type { AnalysisStep } from "../../../analysis";
import type { EngineMoveAnalysis } from "../../../stockfish";
import { ChessTerm } from "../../../shared/components/ChessTerm";
import { formatSeconds } from "../../../shared/utils/format";
import type { DisplayMoveQuality } from "../moveClassification";
import { MoveQualityIcon } from "./MoveQualityIcon";

export function MoveAnalysisSummary({
  step,
  headers,
  quality,
  qualityLabel,
  engine,
  engineLoading,
  engineError,
}: {
  step: AnalysisStep;
  headers: Record<string, string>;
  quality: DisplayMoveQuality;
  qualityLabel: string;
  engine?: EngineMoveAnalysis;
  engineLoading: boolean;
  engineError: string;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const playerName = step.color === "w"
    ? headers.White || "Người chơi"
    : headers.Black || "Người chơi";
  return (
    <section className="move-summary">
      <div className="move-summary-top">
        <div className="move-badges">
          <div className={`quality-badge ${quality}`}>
            <MoveQualityIcon quality={quality} />
            <ChessTerm term={quality}>{qualityLabel}</ChessTerm>
          </div>
          <div className={`turn-badge ${step.color === "w" ? "white-turn" : "black-turn"}`}>
            {step.color === "w" ? "Trắng" : "Đen"} · {playerName}
          </div>
        </div>
        <button
          className="move-summary-toggle"
          onClick={() => setDetailsOpen((value) => !value)}
          aria-expanded={detailsOpen}
        >
          Chi tiết <ChevronDown size={13} />
        </button>
      </div>
      <div className="move-summary-main">
        <strong className="move-summary-san">
          {step.moveNumber}{step.color === "w" ? "." : "…"} {step.san}
        </strong>
        <span>
          <b>{step.title}</b>
          <small aria-live="polite">
            {engine
              ? `${engine.evaluation} · CPL ${Math.round(engine.centipawnLoss)} · Best ${engine.bestMoveSan}`
              : engineError || "Stockfish đang chấm nước đi…"}
          </small>
        </span>
      </div>
      {detailsOpen && (
        <div className="move-summary-details">
          <p>{step.comment}</p>
          <div className={`engine-verdict ${engine ? quality : "loading"}`} aria-live="polite">
            {engine ? (
              <>
                <Cpu size={13} />
                <strong>Stockfish:</strong>
                <span>{quality === "brilliant"
                  ? "nước hy sinh gần tối ưu theo tiêu chí Kỳ Phổ"
                  : quality === "best"
                    ? "nước tốt nhất"
                    : quality === "good"
                      ? `nước tốt · mất ${Math.round(engine.centipawnLoss)} cp`
                      : `mất ${Math.round(engine.centipawnLoss)} cp · tốt nhất ${engine.bestMoveSan}`}</span>
                <i>{engine.evaluation}</i>
                {engineLoading && <LoaderCircle className="spin" size={12} />}
              </>
            ) : engineError ? (
              <><TriangleAlert size={13} /><span>{engineError}</span></>
            ) : (
              <><LoaderCircle className="spin" size={13} /><span>Stockfish đang chấm nước đi…</span></>
            )}
          </div>
          {step.clockSeconds !== null && (
            <div className="move-time-strip">
              <span>Suy nghĩ {formatSeconds(step.thinkTimeSeconds)}</span>
              {step.isQuickMove && <i>Đi nhanh</i>}
              {step.isTimePressure && <i>Áp lực thời gian</i>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
