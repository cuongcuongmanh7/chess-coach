import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { Chess } from "chess.js";
import { analyzeMoveWithStockfish } from "../../../stockfish";
import { trainingRepository } from "../services/trainingRepository";
import { canOpenTrainingSession } from "../timeline";
import type { TrainingCard, TrainingSession, TrainingStats } from "../types";

function newSession(index: number, card: TrainingCard): TrainingSession {
  return {
    index,
    fen: card.fen,
    startedAt: Date.now(),
    hintsUsed: 0,
    failedAttempts: 0,
    loading: false,
    feedback: null,
    attemptedMove: null,
    initialLoss: null,
    continuation: null,
  };
}

type SessionDependencies = {
  activeProfileId: number | null;
  cards: TrainingCard[];
  replaceCard: (card: TrainingCard) => void;
  setStats: Dispatch<SetStateAction<TrainingStats>>;
  setError: Dispatch<SetStateAction<string>>;
  onProgressChanged: () => void;
};

export function useTrainingSession({
  activeProfileId,
  cards,
  replaceCard,
  setStats,
  setError,
  onProgressChanged,
}: SessionDependencies) {
  const [trainingSession, setTrainingSession] = useState<TrainingSession | null>(null);
  const [trainingSessionHistory, setTrainingSessionHistory] = useState<Record<number, TrainingSession>>({});
  const [latestTrainingIndex, setLatestTrainingIndex] = useState(0);
  const currentTrainingCard = trainingSession ? cards[trainingSession.index] || null : null;

  useEffect(() => {
    if (!trainingSession) {
      setTrainingSessionHistory({});
      setLatestTrainingIndex(0);
      return;
    }
    setTrainingSessionHistory((history) => ({
      ...history,
      [trainingSession.index]: trainingSession,
    }));
  }, [trainingSession]);

  const startTraining = useCallback((index = 0) => {
    const card = cards[index];
    if (!card) return;
    setTrainingSessionHistory({});
    setLatestTrainingIndex(index);
    setTrainingSession(newSession(index, card));
  }, [cards]);

  const finishReview = useCallback(async (
    centipawnLoss: number,
    attemptedMove: string | null,
    message: string,
    hintsOverride?: number,
  ) => {
    if (!currentTrainingCard || !trainingSession) return;
    setTrainingSession((value) => value ? { ...value, loading: true } : value);
    try {
      const updated = await trainingRepository.review({
        card_id: currentTrainingCard.id,
        attempted_move: attemptedMove,
        centipawn_loss: centipawnLoss,
        hints_used: hintsOverride ?? trainingSession.hintsUsed,
        failed_attempts: trainingSession.failedAttempts,
        duration_ms: Math.max(0, Date.now() - trainingSession.startedAt),
      });
      replaceCard(updated);
      onProgressChanged();
      if (activeProfileId) setStats(await trainingRepository.stats(activeProfileId));
      setTrainingSession((value) => value ? {
        ...value,
        fen: value.continuation ? value.fen : currentTrainingCard.fen,
        loading: false,
        feedback: {
          kind: "complete",
          message,
          detail: `Lần ôn tới: ${new Date(updated.due_at).toLocaleString("vi-VN")}`,
        },
        continuation: null,
      } : value);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setTrainingSession((value) => value ? { ...value, loading: false } : value);
    }
  }, [activeProfileId, currentTrainingCard, onProgressChanged, replaceCard, setError, setStats, trainingSession]);

  const handleTrainingDrop = useCallback(({
    sourceSquare,
    targetSquare,
  }: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => {
    if (!targetSquare || !currentTrainingCard || !trainingSession
      || trainingSession.loading || trainingSession.feedback?.kind === "complete") return false;
    const chess = new Chess(trainingSession.fen);
    try {
      const move = chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (!move) return false;
      if (trainingSession.continuation) {
        const expected = trainingSession.continuation;
        if (move.from !== expected.from || move.to !== expected.to) {
          setTrainingSession((value) => value ? {
            ...value,
            failedAttempts: value.failedAttempts + 1,
            feedback: {
              kind: "wrong",
              message: "Chưa đúng cách tiếp tục.",
              detail: "Hãy tìm nước chủ động nhất sau phản ứng của đối thủ.",
            },
          } : value);
          return false;
        }
        setTrainingSession((value) => value ? { ...value, fen: chess.fen() } : value);
        void finishReview(
          trainingSession.initialLoss || 0,
          trainingSession.attemptedMove,
          "Hoàn thành chuỗi nước đúng.",
        );
        return true;
      }

      const nextFen = chess.fen();
      setTrainingSession((value) => value ? {
        ...value,
        fen: nextFen,
        loading: true,
        feedback: null,
        attemptedMove: move.san,
      } : value);
      analyzeMoveWithStockfish(currentTrainingCard.fen, nextFen, move.lan)
        .then((result) => {
          if (result.centipawnLoss > 35) {
            setTrainingSession((value) => value ? {
              ...value,
              fen: currentTrainingCard.fen,
              loading: false,
              failedAttempts: value.failedAttempts + 1,
              initialLoss: result.centipawnLoss,
              feedback: {
                kind: "wrong",
                message: `${move.san} chưa đạt ngưỡng Tốt.`,
                detail: `Mất ${Math.round(result.centipawnLoss)} cp. Hãy thử lại hoặc dùng gợi ý.`,
              },
            } : value);
            return;
          }
          const continuation = new Chess(nextFen);
          const reply = result.replyLineSan[0] ? continuation.move(result.replyLineSan[0]) : null;
          const expectedPosition = reply ? new Chess(continuation.fen()) : null;
          const expected = expectedPosition && result.replyLineSan[1]
            ? expectedPosition.move(result.replyLineSan[1])
            : null;
          if (reply && expected) {
            setTrainingSession((value) => value ? {
              ...value,
              fen: continuation.fen(),
              loading: false,
              initialLoss: result.centipawnLoss,
              continuation: { from: expected.from, to: expected.to, san: expected.san },
              feedback: {
                kind: "continuation",
                message: `${move.san} là nước tốt. Đối thủ đáp ${reply.san}.`,
                detail: "Hãy đi tiếp nước tốt nhất để hoàn tất bài.",
              },
            } : value);
          } else {
            setTrainingSession((value) => value ? { ...value, loading: false } : value);
            void finishReview(result.centipawnLoss, move.san, "Bạn đã tìm được nước tốt.");
          }
        })
        .catch((reason) => {
          setError(reason instanceof Error ? reason.message : String(reason));
          setTrainingSession((value) => value ? {
            ...value,
            fen: currentTrainingCard.fen,
            loading: false,
          } : value);
        });
      return true;
    } catch {
      return false;
    }
  }, [currentTrainingCard, finishReview, setError, trainingSession]);

  const requestTrainingHint = useCallback(() => {
    if (!currentTrainingCard || !trainingSession || trainingSession.loading) return;
    const nextLevel = Math.min(3, trainingSession.hintsUsed + 1);
    setTrainingSession((value) => value ? { ...value, hintsUsed: nextLevel } : value);
    if (nextLevel === 3) {
      void finishReview(0, null, `Nước tốt nhất là ${currentTrainingCard.best_move}.`, 3);
    }
  }, [currentTrainingCard, finishReview, trainingSession]);

  const finishTrainingWrong = useCallback(() => {
    void finishReview(
      999,
      trainingSession?.attemptedMove || null,
      "Bài được đưa về lịch ôn sau 10 phút.",
    );
  }, [finishReview, trainingSession?.attemptedMove]);

  const nextTrainingCard = useCallback(() => {
    if (!trainingSession) return;
    const nextIndex = trainingSession.index + 1;
    const card = cards[nextIndex];
    if (!card) {
      setTrainingSession(null);
      return;
    }
    const saved = trainingSessionHistory[nextIndex];
    setLatestTrainingIndex((current) => Math.max(current, nextIndex));
    setTrainingSession(saved || newSession(nextIndex, card));
  }, [cards, trainingSession, trainingSessionHistory]);

  const openTrainingSession = useCallback((index: number) => {
    const saved = trainingSessionHistory[index];
    if (!canOpenTrainingSession(saved, index, latestTrainingIndex)) return;
    setTrainingSession(saved);
  }, [latestTrainingIndex, trainingSessionHistory]);

  return {
    trainingSession,
    trainingSessionHistory,
    latestTrainingIndex,
    currentTrainingCard,
    setTrainingSession,
    startTraining,
    handleTrainingDrop,
    requestTrainingHint,
    finishTrainingWrong,
    nextTrainingCard,
    openTrainingSession,
  };
}
