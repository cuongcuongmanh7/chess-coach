import { Chess } from "chess.js";
import type { AnalysisStep } from "../../analysis";
import type { EngineMoveAnalysis } from "../../stockfish";
import { playerEloForColor } from "../../features/analysis/moveClassification";
import { useCandidateLabController } from "../../features/candidate-lab/hooks/useCandidateLabController";
import type { AppState } from "./useAppState";

export function useCandidateLabComposition(
  state: AppState,
  {
    step,
    engine,
  }: {
    step: AnalysisStep;
    engine: EngineMoveAnalysis | undefined;
  },
) {
  const {
    analysis,
    currentGameId,
    engineLoading,
    fullAnalysis,
    batchAnalysis,
    retryState,
    setRetryState,
    setPromotionPending,
    variationState,
    setVariationState,
    setVariationPlaying,
    setOrientation,
  } = state;
  const controller = useCandidateLabController({
    step,
    engine,
    gameKey: currentGameId || analysis.rawPgn,
    blocked: engineLoading || fullAnalysis.running || batchAnalysis.running || Boolean(retryState?.loading),
    playerElos: {
      w: playerEloForColor(analysis.headers, "w"),
      b: playerEloForColor(analysis.headers, "b"),
    },
    onBegin: (color) => {
      setRetryState(null);
      setPromotionPending(null);
      setVariationState(null);
      setVariationPlaying(false);
      setOrientation(color === "w" ? "white" : "black");
    },
  });
  const candidateCanMove = controller.candidateState.active
    && !controller.candidateState.loading
    && !controller.candidateState.gameOver
    && new Chess(controller.candidateState.fen).turn()
      === controller.candidateState.userColor
    && controller.candidateAvailable;
  const candidateCanStartFromMainline = !controller.candidateState.active
    && !retryState
    && !variationState
    && controller.candidateAvailable;
  const candidateControlledColor = controller.candidateState.active
    ? controller.candidateState.userColor
    : new Chess(step.fenAfter).turn();
  const boardPosition = retryState?.fen
    || (variationState
      ? variationState.positions[variationState.index]
      : controller.candidateState.active
        ? controller.candidateState.fen
        : step.fenAfter);
  const boardInteractionMode: "main" | "retry" | "variation" | "candidate" =
    retryState
      ? "retry"
      : variationState
        ? "variation"
        : controller.candidateState.active ? "candidate" : "main";
  const variationMoveSquares = variationState && variationState.index > 0
    ? variationState.moveSquares[variationState.index - 1]
    : null;

  return {
    ...controller,
    candidateCanMove,
    candidateCanStartFromMainline,
    candidateControlledColor,
    boardPosition,
    boardInteractionMode,
    variationMoveSquares,
  };
}
