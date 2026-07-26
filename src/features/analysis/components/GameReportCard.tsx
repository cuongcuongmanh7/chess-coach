import { useMemo } from "react";
import { GraduationCap, Info } from "lucide-react";
import type { AnalysisStep } from "../../../analysis";
import type { EngineMoveAnalysis } from "../../../stockfish";
import {
  buildReportCard,
  PHASE_ORDER,
  type PhaseReport,
} from "../reportCard";

const GRADE_LABELS: Record<string, string> = {
  A: "Xuất sắc",
  B: "Tốt",
  C: "Khá",
  D: "Cần chú ý",
  E: "Cần cải thiện",
};

function PhaseResult({
  phase,
  onJump,
}: {
  phase: PhaseReport;
  onJump: (index: number) => void;
}) {
  return (
    <button
      className={`report-phase ${phase.tone}`}
      onClick={() => onJump(phase.firstIndex)}
      title={`Tới ${phase.phase.toLowerCase()} · ${phase.moves} nước`}
    >
      <span className="report-phase-name">{phase.phase}</span>
      <span className="report-phase-result">
        <strong className="report-phase-grade">{phase.grade}</strong>
        <em>{GRADE_LABELS[phase.grade]}</em>
      </span>
      <span
        className="report-phase-acpl"
        title="Mất centipawn trung bình mỗi nước; càng thấp càng tốt."
      >
        ACPL {phase.acpl}
      </span>
    </button>
  );
}

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
          <span>Phiếu điểm · {playerName}</span>
          <em>{color === "w" ? "Trắng" : "Đen"}</em>
        </div>
        <div className="report-card-elo">
          <span title="Ước lượng từ ACPL của ván này, không phải Elo thật.">
            Elo ước lượng <Info size={11} />
          </span>
          <strong>{card.estimatedElo}</strong>
        </div>
      </div>
      <div className="report-card-phases">
        {PHASE_ORDER.map((phaseName) => {
          const phase = card.phases.find((item) => item.phase === phaseName);
          return phase
            ? <PhaseResult key={phaseName} phase={phase} onJump={onJump} />
            : (
              <div
                className="report-phase unavailable"
                key={phaseName}
                aria-label={`${phaseName}: Không đủ dữ liệu`}
              >
                <span className="report-phase-name">{phaseName}</span>
                <strong className="report-phase-grade">—</strong>
                <span className="report-phase-acpl">Không đủ dữ liệu</span>
              </div>
            );
        })}
      </div>
      <p className="report-card-summary">{card.summary}</p>
    </section>
  );
}
