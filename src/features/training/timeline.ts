import type { TrainingSession } from "./types";

export type TrainingTimelineState = "assisted" | "completed" | "current" | "pending";

export function getTrainingTimelineState(
  session: TrainingSession | undefined,
  index: number,
  latestIndex: number,
): TrainingTimelineState {
  const completed = session?.feedback?.kind === "complete";
  if (completed && (session.hintsUsed > 0 || session.failedAttempts > 0)) return "assisted";
  if (completed) return "completed";
  return index === latestIndex ? "current" : "pending";
}

export function canOpenTrainingSession(
  session: TrainingSession | undefined,
  index: number,
  latestIndex: number,
) {
  return Boolean(session && (session.feedback?.kind === "complete" || index === latestIndex));
}
