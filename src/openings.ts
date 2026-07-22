import openingPositions from "./data/openings.json";
import type { AnalysisStep } from "./analysis";

export type OpeningInfo = {
  eco: string;
  name: string;
  family: string;
  variation: string | null;
};

const book = openingPositions as Record<string, { eco: string; name: string }>;

function toEpd(fen: string) {
  return fen.split(" ").slice(0, 4).join(" ");
}

function toOpeningInfo(opening: { eco: string; name: string }): OpeningInfo {
  const separator = opening.name.indexOf(":");
  return {
    ...opening,
    family: separator < 0 ? opening.name : opening.name.slice(0, separator),
    variation: separator < 0 ? null : opening.name.slice(separator + 1).trim(),
  };
}

export function openingAtFen(fen: string): OpeningInfo | null {
  const opening = book[toEpd(fen)];
  return opening ? toOpeningInfo(opening) : null;
}

export function openingTimeline(steps: AnalysisStep[]) {
  let lastKnown: OpeningInfo | null = null;
  return steps.map((step) => {
    lastKnown = openingAtFen(step.fenAfter) || lastKnown;
    return lastKnown;
  });
}

export function lastKnownOpening(steps: AnalysisStep[]) {
  const timeline = openingTimeline(steps);
  return timeline[timeline.length - 1] || null;
}
