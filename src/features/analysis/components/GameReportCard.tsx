import { useMemo } from "react";
import { GraduationCap, Info } from "lucide-react";
import type { AnalysisStep } from "../../../analysis";
import type { EngineMoveAnalysis } from "../../../stockfish";
import { buildReportCard } from "../reportCard";

export function GameReportCard({
  steps,
  engineCache,
  color,
  playerName,
  onJump,
}: {
  steps: AnalysisStep[];
  engineCache: Record<number, EngineMoveAnalysis>;
  color: "w" | "b";
  playerName: string;
  onJump: (index: number) => void;
}) {
  const card = useMemo(
    () => buildReportCard(steps, engineCache, color),
    [steps, engineCache, color],
  );
  if (!card) return null;
  return (
    <section className="report-card" aria-label="Phiếu điểm ván đấu">
      <div className="report-card-head">
        <div className="report-card-title">
          <i><GraduationCap size={17} /></i>
          <span>Phiếu điểm · {color === "w" ? "Trắng" : "Đen"} · {playerName}</span>
        </div>
        <div className={`report-card-elo ${card.overallTone}`}>
          <strong>≈ {card.estimatedElo}</strong>
          <span title="Ước lượng từ ACPL của ván này, không phải Elo thật.">
            Elo ước lượng <Info size={11} />
          </span>
        </div>
      </div>
      <div className="report-card-phases">
        {card.phases.map((phase) => (
          <button
            key={phase.phase}
            className={`report-phase ${phase.tone}`}
            onClick={() => onJump(phase.firstIndex)}
            title={`Tới ${phase.phase.toLowerCase()} · ${phase.moves} nước`}
          >
            <span className="report-phase-name">{phase.phase}</span>
            <strong className="report-phase-grade">{phase.grade}</strong>
            <span className="report-phase-acpl">{phase.acpl} ACPL</span>
          </button>
        ))}
      </div>
      <p className="report-card-summary">{card.summary}</p>
    </section>
  );
}
