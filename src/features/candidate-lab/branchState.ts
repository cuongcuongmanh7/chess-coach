import { Chess } from "chess.js";
import type { AnalysisStep } from "../../analysis";
import { prepareCandidateMoveFromFen } from "./model.ts";
import type {
  CandidateBranchMove,
  CandidateLabState,
  CandidateResult,
} from "./types";

export function candidateMoveLabel(step: AnalysisStep) {
  return `${step.moveNumber}${step.color === "b" ? "…" : "."}${step.san}`;
}

export function createCandidateSessionState(
  rootFen: string,
  anchorPly: number,
  anchorLabel: string,
  active = true,
): CandidateLabState {
  const userColor = new Chess(rootFen).turn();
  return {
    active,
    rootFen,
    anchorPly,
    anchorLabel,
    userColor,
    fen: rootFen,
    loading: false,
    attempts: 0,
    moves: [],
    selectedIndex: -1,
    moveSquares: null,
    result: null,
    gameOver: new Chess(rootFen).isGameOver(),
    error: "",
  };
}

export function lastCandidateUserResult(moves: CandidateBranchMove[]) {
  for (let index = moves.length - 1; index >= 0; index -= 1) {
    if (moves[index].actor === "user") return moves[index].result || null;
  }
  return null;
}

export function completeCandidateTurn(
  source: AnalysisStep,
  session: CandidateLabState,
  prefix: CandidateBranchMove[],
  userMove: CandidateBranchMove,
  result: CandidateResult,
): CandidateLabState {
  const completedUserMove: CandidateBranchMove = {
    ...userMove,
    result,
    quality: result.engine.displayQuality || result.engine.quality,
    evaluation: result.engine.evaluation,
    whiteScoreCp: result.engine.whiteScoreCp,
    centipawnLoss: result.engine.centipawnLoss,
  };
  const nextMoves = [...prefix, completedUserMove];
  let finalFen = userMove.step.fenAfter;
  let moveSquares = { from: userMove.step.from, to: userMove.step.to };
  const userEndedGame = new Chess(finalFen).isGameOver();

  if (!userEndedGame && result.engine.bestReplyUci) {
    const replyUci = result.engine.bestReplyUci;
    const reply = prepareCandidateMoveFromFen(
      source,
      finalFen,
      replyUci.slice(0, 2),
      replyUci.slice(2, 4),
      replyUci[4],
      session.anchorPly + nextMoves.length + 1,
    );
    if (reply) {
      nextMoves.push({
        ...reply,
        actor: "engine",
        quality: "best",
        evaluation: result.engine.evaluation,
        whiteScoreCp: result.engine.whiteScoreCp,
        centipawnLoss: 0,
      });
      finalFen = reply.step.fenAfter;
      moveSquares = { from: reply.step.from, to: reply.step.to };
    }
  }

  return {
    ...session,
    fen: finalFen,
    loading: false,
    attempts: session.attempts + 1,
    moves: nextMoves,
    selectedIndex: nextMoves.length - 1,
    moveSquares,
    result,
    gameOver: new Chess(finalFen).isGameOver(),
    error: "",
  };
}

export function failCandidateTurn(
  session: CandidateLabState,
  prefix: CandidateBranchMove[],
  fenBefore: string,
  reason: unknown,
): CandidateLabState {
  const previous = prefix[prefix.length - 1];
  return {
    ...session,
    fen: fenBefore,
    loading: false,
    attempts: session.attempts + 1,
    moves: prefix,
    selectedIndex: prefix.length - 1,
    moveSquares: previous
      ? { from: previous.step.from, to: previous.step.to }
      : null,
    result: lastCandidateUserResult(prefix),
    gameOver: new Chess(fenBefore).isGameOver(),
    error: reason instanceof Error ? reason.message : String(reason),
  };
}
