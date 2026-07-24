import type { AnalysisStep, Phase } from "../../analysis";
import type { EngineMoveAnalysis } from "../../stockfish";

export const PHASE_ORDER: Phase[] = ["Khai cuộc", "Trung cuộc", "Tàn cuộc"];

export type GradeTone = "good" | "warn" | "bad";

export type PhaseReport = {
  phase: Phase;
  moves: number;
  acpl: number;
  grade: string;
  tone: GradeTone;
  firstIndex: number;
};

export type ReportCard = {
  color: "w" | "b";
  moves: number;
  acpl: number;
  estimatedElo: number;
  overallGrade: string;
  overallTone: GradeTone;
  phases: PhaseReport[];
  summary: string;
};

const PHASE_SHORT: Record<Phase, string> = {
  "Khai cuộc": "khai cuộc",
  "Trung cuộc": "trung cuộc",
  "Tàn cuộc": "tàn cuộc",
};

// Ước lượng Elo từ ACPL của ván. Đây là heuristic đơn điệu giảm theo ACPL,
// hiệu chỉnh quanh nhóm 800–1800; KHÔNG phải Elo thật và có thể tinh chỉnh
// bằng cách đổi hai hằng số dưới đây. Luôn deterministic theo một giá trị ACPL.
export function estimateEloFromAcpl(acpl: number): number {
  const raw = 3720 - 598 * Math.log(Math.max(0, acpl) + 1);
  const rounded = Math.round(raw / 10) * 10;
  return Math.min(2850, Math.max(400, rounded));
}

export function gradeForAcpl(acpl: number): { grade: string; tone: GradeTone } {
  if (acpl <= 20) return { grade: "A", tone: "good" };
  if (acpl <= 40) return { grade: "B", tone: "good" };
  if (acpl <= 60) return { grade: "C", tone: "warn" };
  if (acpl <= 90) return { grade: "D", tone: "warn" };
  return { grade: "E", tone: "bad" };
}

function buildSummary(phases: PhaseReport[]): string {
  if (!phases.length) return "";
  if (phases.length === 1) {
    const only = phases[0];
    return `Chủ yếu diễn ra ở ${PHASE_SHORT[only.phase]} (hạng ${only.grade}).`;
  }
  const best = phases.reduce((left, right) => (right.acpl < left.acpl ? right : left));
  const worst = phases.reduce((left, right) => (right.acpl > left.acpl ? right : left));
  if (best.phase === worst.phase) {
    return `Phong độ đều giữa các giai đoạn (hạng ${best.grade}).`;
  }
  return `Tốt nhất ở ${PHASE_SHORT[best.phase]} (${best.grade}), cần cải thiện ${PHASE_SHORT[worst.phase]} (${worst.grade}).`;
}

// Dựng phiếu điểm cho một màu quân từ dữ liệu Stockfish đã lưu.
// Trả về null khi chưa có nước nào của màu đó được chấm (không đủ dữ liệu).
export function buildReportCard(
  steps: AnalysisStep[],
  engineCache: Record<number, EngineMoveAnalysis>,
  color: "w" | "b",
): ReportCard | null {
  const scored = steps
    .map((item, index) => ({ item, index, engine: engineCache[item.ply] }))
    .filter((entry): entry is { item: AnalysisStep; index: number; engine: EngineMoveAnalysis } =>
      entry.item.color === color && Boolean(entry.engine));
  if (!scored.length) return null;

  const totalLoss = scored.reduce((sum, { engine }) => sum + engine.centipawnLoss, 0);
  const acpl = Math.round(totalLoss / scored.length);
  const overall = gradeForAcpl(acpl);

  const phases: PhaseReport[] = PHASE_ORDER.flatMap((phase) => {
    const inPhase = scored.filter(({ item }) => item.phase === phase);
    if (!inPhase.length) return [];
    const loss = inPhase.reduce((sum, { engine }) => sum + engine.centipawnLoss, 0);
    const phaseAcpl = Math.round(loss / inPhase.length);
    const graded = gradeForAcpl(phaseAcpl);
    return [{
      phase,
      moves: inPhase.length,
      acpl: phaseAcpl,
      grade: graded.grade,
      tone: graded.tone,
      firstIndex: inPhase[0].index,
    }];
  });

  return {
    color,
    moves: scored.length,
    acpl,
    estimatedElo: estimateEloFromAcpl(acpl),
    overallGrade: overall.grade,
    overallTone: overall.tone,
    phases,
    summary: buildSummary(phases),
  };
}
