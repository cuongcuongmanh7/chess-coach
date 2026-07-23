import type { AnalysisStep } from "../../analysis";
import type { EngineMoveAnalysis } from "../../stockfish";
import type {
  AdvantageState,
  GameStory,
  GameStoryPoint,
  KeyMoment,
  KeyMomentKind,
  StoryPerspective,
} from "./types";

export const CHART_LIMIT_PAWNS = 8;
export const ADVANTAGE_THRESHOLD_CP = 150;
export const SWING_THRESHOLD_CP = 150;
export const MAX_KEY_MOMENTS = 6;

type MomentReason = {
  kind: KeyMomentKind;
  title: string;
  description: string;
  severity: number;
};

const ERROR_QUALITIES = new Set(["inaccuracy", "mistake", "blunder"]);

export function advantageState(scoreCp: number): AdvantageState {
  if (scoreCp >= ADVANTAGE_THRESHOLD_CP) return "white";
  if (scoreCp <= -ADVANTAGE_THRESHOLD_CP) return "black";
  return "balanced";
}

export function isMateEvaluation(evaluation: string, scoreCp: number) {
  return evaluation.includes("M") || Math.abs(scoreCp) >= 90_000;
}

export function scoreForChart(scoreCp: number, mate: boolean) {
  if (mate) return scoreCp >= 0 ? CHART_LIMIT_PAWNS : -CHART_LIMIT_PAWNS;
  return Math.max(-CHART_LIMIT_PAWNS, Math.min(CHART_LIMIT_PAWNS, scoreCp / 100));
}

export function scoreForPerspective(score: number, perspective: StoryPerspective) {
  return perspective === "white" ? score : -score;
}

function normalizePlayerName(value?: string | null) {
  return value?.trim().replace(/^@/, "").normalize("NFKC").toLocaleLowerCase("en-US") || "";
}

export function resolveStoryPerspective(
  profileUsername?: string | null,
  whiteName?: string | null,
  blackName?: string | null,
): StoryPerspective {
  const profile = normalizePlayerName(profileUsername);
  if (!profile) return "white";
  if (profile === normalizePlayerName(blackName)) return "black";
  return "white";
}

export function evaluationForPerspective(
  evaluation: string,
  scoreCp: number,
  perspective: StoryPerspective,
) {
  if (perspective === "white") return evaluation;
  const perspectiveScore = scoreForPerspective(scoreCp, perspective);
  if (isMateEvaluation(evaluation, scoreCp)) {
    const mateDistance = evaluation.match(/M(\d+)/)?.[1] || "";
    return `${perspectiveScore < 0 ? "−" : ""}M${mateDistance}`;
  }
  const pawns = Math.abs(perspectiveScore / 100).toFixed(2);
  return perspectiveScore >= 0 ? `+${pawns}` : `−${pawns}`;
}

function moveLabel(step: AnalysisStep) {
  return `${step.moveNumber}${step.color === "w" ? "." : "…"} ${step.san}`;
}

function toPoint(
  step: AnalysisStep,
  engine: EngineMoveAnalysis,
  index: number,
): GameStoryPoint {
  const mate = isMateEvaluation(engine.evaluation, engine.whiteScoreCp);
  const quality = engine.displayQuality || engine.quality;
  const isError = ERROR_QUALITIES.has(quality);
  return {
    index,
    ply: step.ply,
    moveNumber: step.moveNumber,
    moveLabel: moveLabel(step),
    san: step.san,
    color: step.color,
    evaluation: engine.evaluation,
    rawCp: engine.whiteScoreCp,
    chartPawns: scoreForChart(engine.whiteScoreCp, mate),
    centipawnLoss: engine.centipawnLoss,
    quality,
    clockSeconds: step.clockSeconds,
    thinkTimeSeconds: step.thinkTimeSeconds,
    isQuickError: isError && step.isQuickMove,
    isPressureError: isError && step.isTimePressure,
    isMate: mate,
  };
}

function stateLabel(state: AdvantageState) {
  if (state === "white") return "Trắng có lợi thế";
  if (state === "black") return "Đen có lợi thế";
  return "Ván cờ trở lại cân bằng";
}

function stateDescription(state: AdvantageState) {
  if (state === "white") return "lợi thế cho Trắng";
  if (state === "black") return "lợi thế cho Đen";
  return "thế cân bằng";
}

function swingReason(previous: GameStoryPoint, current: GameStoryPoint): MomentReason {
  const changeCp = current.rawCp - previous.rawCp;
  const beneficiary = changeCp > 0 ? "Trắng" : "Đen";
  return {
    kind: "swing",
    title: `${beneficiary} tạo bước ngoặt`,
    description: `Evaluation đổi ${Math.abs(changeCp / 100).toFixed(1)} tốt sau ${current.moveLabel}.`,
    severity: Math.min(95, 70 + Math.round(Math.abs(changeCp) / 10)),
  };
}

function mateReason(previous: GameStoryPoint | undefined, current: GameStoryPoint): MomentReason {
  if (!previous?.isMate && current.isMate) {
    const moverBenefits = (current.rawCp > 0 && current.color === "w")
      || (current.rawCp < 0 && current.color === "b");
    return {
      kind: "mate",
      title: moverBenefits ? "Xuất hiện thế chiếu hết" : "Cho phép thế chiếu hết",
      description: `Stockfish đánh giá ${current.evaluation} sau ${current.moveLabel}.`,
      severity: 100,
    };
  }

  const sideWithMate = previous!.rawCp > 0 ? "w" : "b";
  const missedByMover = current.color === sideWithMate;
  return {
    kind: "mate",
    title: missedByMover ? "Bỏ lỡ cơ hội chiếu hết" : "Thoát khỏi lưới chiếu hết",
    description: `Thế ${previous!.evaluation} biến mất sau ${current.moveLabel}.`,
    severity: 96,
  };
}

function addReason(
  reasonsByIndex: Map<number, MomentReason[]>,
  index: number,
  reason: MomentReason,
) {
  const reasons = reasonsByIndex.get(index) || [];
  if (!reasons.some((item) => item.kind === reason.kind)) reasons.push(reason);
  reasonsByIndex.set(index, reasons);
}

function buildKeyMoments(points: GameStoryPoint[], steps: AnalysisStep[]) {
  const reasonsByIndex = new Map<number, MomentReason[]>();

  points.forEach((point, pointIndex) => {
    const previous = points[pointIndex - 1];
    const step = steps[point.index];
    if (previous) {
      if (
        !previous.isMate
        && !point.isMate
        && Math.abs(point.rawCp - previous.rawCp) >= SWING_THRESHOLD_CP
      ) {
        addReason(reasonsByIndex, point.index, swingReason(previous, point));
      }
      const previousState = advantageState(previous.rawCp);
      const currentState = advantageState(point.rawCp);
      if (previousState !== currentState) {
        addReason(reasonsByIndex, point.index, {
          kind: "state-change",
          title: stateLabel(currentState),
          description: `Cục diện chuyển từ ${stateDescription(previousState)} sang ${stateDescription(currentState)}.`,
          severity: 72,
        });
      }
      if (previous.isMate !== point.isMate) {
        addReason(reasonsByIndex, point.index, mateReason(previous, point));
      }
    } else if (point.isMate) {
      addReason(reasonsByIndex, point.index, mateReason(undefined, point));
    }

    if (step.san.includes("=")) {
      addReason(reasonsByIndex, point.index, {
        kind: "promotion",
        title: "Phong cấp",
        description: `${point.moveLabel} đưa tốt về hàng cuối.`,
        severity: 82,
      });
    }
    if (step.tags.some((tag) => tag.toLocaleLowerCase("vi").includes("tốt thông"))) {
      addReason(reasonsByIndex, point.index, {
        kind: "passed-pawn",
        title: "Tốt thông trở nên nguy hiểm",
        description: `${point.moveLabel} tạo sức ép phong cấp đáng chú ý.`,
        severity: 66,
      });
    }
  });

  const moments = [...reasonsByIndex.entries()]
    .map(([index, reasons]): KeyMoment => {
      const point = points.find((item) => item.index === index)!;
      const ordered = [...reasons].sort((left, right) => right.severity - left.severity);
      return {
        index,
        ply: point.ply,
        moveLabel: point.moveLabel,
        evaluation: point.evaluation,
        title: ordered[0].title,
        description: ordered.map((item) => item.description).join(" "),
        kinds: ordered.map((item) => item.kind),
        severity: ordered[0].severity,
      };
    });
  return moments
    .sort((left, right) => right.severity - left.severity || left.index - right.index)
    .slice(0, MAX_KEY_MOMENTS)
    .sort((left, right) => left.index - right.index);
}

export function buildGameStory(
  steps: AnalysisStep[],
  engineCache: Record<number, EngineMoveAnalysis>,
): GameStory {
  const points = steps.flatMap((step, index) => {
    const engine = engineCache[step.ply];
    return engine ? [toPoint(step, engine, index)] : [];
  });
  return {
    points,
    keyMoments: buildKeyMoments(points, steps),
    hasTimeData: points.some((point) => point.thinkTimeSeconds !== null),
  };
}
