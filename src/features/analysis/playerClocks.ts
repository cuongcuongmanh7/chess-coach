import type { AnalysisStep } from "../../analysis";

export type PlayerClocks = Record<"w" | "b", number | null>;

export function playerClocksAtStep(
  steps: AnalysisStep[],
  currentIndex: number,
): PlayerClocks {
  const clocks: PlayerClocks = { w: null, b: null };
  steps.slice(0, currentIndex + 1).forEach((step) => {
    if (step.clockSeconds !== null) clocks[step.color] = step.clockSeconds;
  });
  return clocks;
}
