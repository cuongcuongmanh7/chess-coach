import { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import type { AnalysisStep } from "../../../analysis";
import { playMoveSfx, playSfx } from "../../../sfx";
import type { EngineMoveAnalysis } from "../../../stockfish";
import {
  candidateRequiresPromotion,
  prepareCandidateMoveFromFen,
} from "../model";
import {
  candidateMoveLabel,
  completeCandidateTurn,
  createCandidateSessionState,
  failCandidateTurn,
  lastCandidateUserResult,
} from "../branchState";
import {
  createCandidateBranchAnalyzer,
  type CandidateBranchAnalyzer,
} from "../services/candidateAnalysis";
import { useCandidateBranchKeyboard } from "./useCandidateBranchKeyboard";
import type {
  CandidateBranchMove,
  CandidateLabState,
  CandidatePromotion,
} from "../types";

type CandidateLabDependencies = {
  step: AnalysisStep;
  engine: EngineMoveAnalysis | undefined;
  gameKey: string;
  blocked: boolean;
  playerElos: Record<"w" | "b", number>;
  onBegin: (color: "w" | "b") => void;
};

export function useCandidateLabController({
  step,
  engine,
  gameKey,
  blocked,
  playerElos,
  onBegin,
}: CandidateLabDependencies) {
  const [candidateState, setCandidateState] = useState<CandidateLabState>(
    () => createCandidateSessionState(
      step.fenBefore,
      step.ply - 1,
      `Trước ${candidateMoveLabel(step)}`,
      false,
    ),
  );
  const [candidatePromotion, setCandidatePromotion] =
    useState<CandidatePromotion | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const analyzerRef = useRef<Promise<CandidateBranchAnalyzer> | null>(null);
  const sessionRef = useRef(0);
  const available = Boolean(engine && !blocked);

  const cancelSessionWork = () => {
    sessionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    const analyzer = analyzerRef.current;
    analyzerRef.current = null;
    void analyzer?.then((value) => value.terminate()).catch(() => undefined);
  };

  const ensureAnalyzer = () => {
    if (!analyzerRef.current) {
      const controller = new AbortController();
      abortRef.current = controller;
      analyzerRef.current = createCandidateBranchAnalyzer(controller.signal);
    }
    return analyzerRef.current;
  };

  const activateSession = (session: CandidateLabState) => {
    cancelSessionWork();
    onBegin(session.userColor);
    setCandidatePromotion(null);
    setCandidateState(session);
    return session;
  };

  const buttonSession = () => createCandidateSessionState(
    step.fenBefore,
    step.ply - 1,
    `Trước ${candidateMoveLabel(step)}`,
  );

  const mainlineSession = () => createCandidateSessionState(
    step.fenAfter,
    step.ply,
    `Sau ${candidateMoveLabel(step)}`,
  );

  const exitCandidateLab = () => {
    cancelSessionWork();
    playSfx("tap");
    setCandidatePromotion(null);
    setCandidateState(
      createCandidateSessionState(
        step.fenBefore,
        step.ply - 1,
        `Trước ${candidateMoveLabel(step)}`,
        false,
      ),
    );
  };

  const beginCandidateLab = () => {
    if (!available) return;
    activateSession(buttonSession());
    playSfx("open");
  };

  const evaluateCandidateMove = (
    from: string,
    to: string,
    promotion?: string,
    startingSession?: CandidateLabState,
  ) => {
    const session = startingSession
      || (candidateState.active ? candidateState : activateSession(mainlineSession()));
    if (!engine || blocked || session.loading || session.gameOver) return false;

    const prefix = session.moves.slice(0, session.selectedIndex + 1);
    const fenBefore = prefix[prefix.length - 1]?.step.fenAfter || session.rootFen;
    if (new Chess(fenBefore).turn() !== session.userColor) return false;
    const candidate = prepareCandidateMoveFromFen(
      step,
      fenBefore,
      from,
      to,
      promotion,
      session.anchorPly + prefix.length + 1,
    );
    if (!candidate) return false;

    const userMove: CandidateBranchMove = { ...candidate, actor: "user" };
    const pendingMoves = [...prefix, userMove];
    const requestSession = sessionRef.current;
    playMoveSfx(candidate.moveSan);
    setCandidatePromotion(null);
    setCandidateState({
      ...session,
      fen: candidate.step.fenAfter,
      loading: true,
      attempts: session.attempts + 1,
      moves: pendingMoves,
      selectedIndex: pendingMoves.length - 1,
      moveSquares: { from: candidate.step.from, to: candidate.step.to },
      result: null,
      gameOver: new Chess(candidate.step.fenAfter).isGameOver(),
      error: "",
    });

    void ensureAnalyzer()
      .then((analyzer) => analyzer.analyze(
        candidate,
        Math.max(1, engine.depth),
        playerElos[session.userColor],
      ))
      .then((result) => {
        if (sessionRef.current !== requestSession) return;
        const completed = completeCandidateTurn(
          step,
          session,
          prefix,
          userMove,
          result,
        );
        const reply = completed.moves[completed.moves.length - 1];
        if (reply?.actor === "engine") playMoveSfx(reply.moveSan);
        setCandidateState(completed);
      })
      .catch((reason) => {
        if (sessionRef.current !== requestSession) return;
        playSfx("error");
        setCandidateState(failCandidateTurn(session, prefix, fenBefore, reason));
      });
    return true;
  };

  const handleCandidateDrop = ({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => {
    if (!targetSquare || !available) return false;
    const enteringCandidate = !candidateState.active;
    const session = candidateState.active
      ? candidateState
      : activateSession(mainlineSession());
    if (enteringCandidate) playSfx("open");
    const prefix = session.moves.slice(0, session.selectedIndex + 1);
    const fen = prefix[prefix.length - 1]?.step.fenAfter || session.rootFen;
    if (
      session.loading
      || session.gameOver
      || new Chess(fen).turn() !== session.userColor
    ) {
      return false;
    }
    if (candidateRequiresPromotion(fen, sourceSquare, targetSquare)) {
      setCandidatePromotion({ from: sourceSquare, to: targetSquare });
      return false;
    }
    return evaluateCandidateMove(sourceSquare, targetSquare, undefined, session);
  };

  const tryAnotherCandidate = () => {
    if (!candidateState.active) return;
    playSfx("tap");
    activateSession(createCandidateSessionState(
      candidateState.rootFen,
      candidateState.anchorPly,
      candidateState.anchorLabel,
    ));
  };

  const selectCandidateBranchMove = (index: number) => {
    if (
      candidateState.loading
      || index === candidateState.selectedIndex
      || index < -1
      || index >= candidateState.moves.length
    ) {
      return;
    }
    const selected = index >= 0 ? candidateState.moves[index] : null;
    const fen = selected?.step.fenAfter || candidateState.rootFen;
    const result = lastCandidateUserResult(
      candidateState.moves.slice(0, index + 1),
    );
    playSfx("tap");
    setCandidatePromotion(null);
    setCandidateState((value) => ({
      ...value,
      fen,
      selectedIndex: index,
      moveSquares: selected
        ? { from: selected.step.from, to: selected.step.to }
        : null,
      result,
      gameOver: new Chess(fen).isGameOver(),
      error: "",
    }));
  };

  useCandidateBranchKeyboard(
    candidateState,
    selectCandidateBranchMove,
    exitCandidateLab,
  );

  useEffect(() => {
    cancelSessionWork();
    setCandidatePromotion(null);
    setCandidateState(
      createCandidateSessionState(
        step.fenBefore,
        step.ply - 1,
        `Trước ${candidateMoveLabel(step)}`,
        false,
      ),
    );
    return cancelSessionWork;
  }, [gameKey, step.fenBefore, step.ply]);

  return {
    candidateState,
    candidatePromotion,
    candidateAvailable: available,
    beginCandidateLab,
    exitCandidateLab,
    evaluateCandidateMove,
    handleCandidateDrop,
    tryAnotherCandidate,
    selectCandidateBranchMove,
    cancelCandidatePromotion: () => setCandidatePromotion(null),
  };
}
