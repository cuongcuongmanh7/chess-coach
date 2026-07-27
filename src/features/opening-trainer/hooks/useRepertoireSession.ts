import { useCallback, useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { playMoveSfx } from "../../../sfx";
import { repertoireRepository } from "../services/repertoireRepository";
import {
  applyUci,
  childrenOf,
  epd,
  positionFen,
  START_FEN,
  turnColor,
} from "../model/tree";
import type { Repertoire, RepertoireNode } from "../types";

export type SessionStatus = "playing" | "deviation" | "complete" | "free";

export type RepertoireSession = {
  fen: string;
  parentId: string | null;
  status: SessionStatus;
  message: string;
  loading: boolean;
  // Máy (đối thủ) đang tự đi các nước đáp trả — khoá tương tác trong lúc animate.
  machineThinking: boolean;
  deviation: {
    playedSan: string;
    playedFen: string;
    positionFen: string;
    expected: RepertoireNode[];
  } | null;
  lastMove: { from: string; to: string } | null;
  correct: number;
  wrong: number;
};

// Một chặng animate: thế cờ sau nước đi + ô di chuyển + SAN (để phát tiếng động).
type SequenceStep = {
  fen: string;
  parentId: string | null;
  move: { from: string; to: string };
  san: string;
};

// Nhịp di chuyển quân của máy: dừng ngắn "suy nghĩ" trước nước đầu, rồi giãn cách
// giữa các nước để mỗi nước kịp animate trọn vẹn (animationDurationInMs = 220).
const THINK_MS = 300;
const STEP_MS = 340;

function uciSquares(uci: string) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4) };
}

type Dependencies = {
  activeProfileId: number | null;
  repertoire: Repertoire | null;
  tree: RepertoireNode[];
  reloadTree: () => Promise<void>;
  onProgressChanged: () => void;
  setError: (message: string) => void;
};

function initialSession(tree: RepertoireNode[]): RepertoireSession {
  return {
    fen: positionFen(tree, null, START_FEN),
    parentId: null,
    status: "playing",
    message: "",
    loading: false,
    machineThinking: false,
    deviation: null,
    lastMove: null,
    correct: 0,
    wrong: 0,
  };
}

export function useRepertoireSession({
  activeProfileId,
  repertoire,
  tree,
  reloadTree,
  onProgressChanged,
  setError,
}: Dependencies) {
  const [session, setSession] = useState<RepertoireSession | null>(null);
  // Bộ đếm thế hệ + danh sách timer để huỷ chuỗi animate cũ khi có tương tác mới.
  const sequenceGenRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  const cancelSequence = useCallback(() => {
    sequenceGenRef.current += 1;
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  // Huỷ mọi timer còn treo khi unmount.
  useEffect(() => cancelSequence, [cancelSequence]);

  // Tính chuỗi nước đối thủ (side != color) từ một thế cờ cho tới lượt người dùng
  // hoặc hết biến. Hàm thuần — chỉ đọc tree/repertoire, không đụng state.
  const computeMachineChain = useCallback(
    (fen: string, parentId: string | null): { steps: SequenceStep[]; status: SessionStatus; message: string } => {
      const steps: SequenceStep[] = [];
      if (!repertoire) return { steps, status: "complete", message: "" };
      let currentFen = fen;
      let currentParent = parentId;
      for (let guard = 0; guard < 200; guard += 1) {
        const options = childrenOf(tree, currentParent);
        if (options.length === 0) {
          return { steps, status: "complete", message: "Hoàn thành biến. Làm lại hoặc chọn repertoire khác." };
        }
        if (turnColor(currentFen) === repertoire.color) {
          return { steps, status: "playing", message: "" };
        }
        const reply = [...options].sort((a, b) => b.frequency - a.frequency)[0];
        const applied = applyUci(currentFen, reply.move_uci);
        if (!applied) return { steps, status: "playing", message: "" };
        currentFen = applied.fen;
        currentParent = reply.id;
        steps.push({ fen: currentFen, parentId: currentParent, move: uciSquares(reply.move_uci), san: applied.san });
      }
      return { steps, status: "playing", message: "" };
    },
    [repertoire, tree],
  );

  // Hiển thị ngay thế cờ "tức thời" (thường là sau nước của người dùng), rồi animate
  // lần lượt từng nước trong `steps` để bàn cờ di chuyển tự nhiên thay vì nhảy phát.
  const runSteps = useCallback(
    (
      immediateFen: string,
      immediateParent: string | null,
      immediateMove: { from: string; to: string } | null,
      steps: SequenceStep[],
      finalStatus: SessionStatus,
      finalMessage: string,
    ): Partial<RepertoireSession> => {
      cancelSequence();
      const gen = sequenceGenRef.current;
      if (steps.length === 0) {
        return {
          fen: immediateFen,
          parentId: immediateParent,
          lastMove: immediateMove,
          status: finalStatus,
          message: finalMessage,
          machineThinking: false,
        };
      }
      let delay = 0;
      steps.forEach((entry, index) => {
        delay += index === 0 ? THINK_MS : STEP_MS;
        const isLast = index === steps.length - 1;
        const timer = window.setTimeout(() => {
          if (sequenceGenRef.current !== gen) return;
          playMoveSfx(entry.san);
          setSession((value) =>
            value
              ? {
                  ...value,
                  fen: entry.fen,
                  parentId: entry.parentId,
                  lastMove: entry.move,
                  ...(isLast ? { status: finalStatus, message: finalMessage, machineThinking: false } : {}),
                }
              : value,
          );
        }, delay);
        timersRef.current.push(timer);
      });
      return {
        fen: immediateFen,
        parentId: immediateParent,
        lastMove: immediateMove,
        status: "playing",
        message: "",
        machineThinking: true,
      };
    },
    [cancelSequence],
  );

  const start = useCallback(() => {
    const base = initialSession(tree);
    const chain = computeMachineChain(base.fen, null);
    const advanced = runSteps(base.fen, null, null, chain.steps, chain.status, chain.message);
    setSession({ ...base, ...advanced });
  }, [computeMachineChain, runSteps, tree]);

  const exit = useCallback(() => {
    cancelSequence();
    setSession(null);
  }, [cancelSequence]);

  const onDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
      if (!targetSquare || !session || !repertoire || session.loading || session.machineThinking) return false;
      if (session.status === "complete" || session.status === "deviation") return false;
      const chess = new Chess(session.fen);
      let move;
      try {
        move = chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      } catch {
        return false;
      }
      if (!move) return false;
      playMoveSfx(move.san);

      // Chế độ phân tích tự do: đi thoải mái, không chấm điểm.
      if (session.status === "free") {
        setSession((value) =>
          value ? { ...value, fen: chess.fen(), lastMove: { from: move.from, to: move.to } } : value,
        );
        return true;
      }

      const options = childrenOf(tree, session.parentId).filter((node) => node.is_user_move);
      const matched = options.find((node) => node.move_uci === move.lan);
      if (matched) {
        // Hiện ngay nước của người dùng, rồi để máy đáp trả tuần tự có animation.
        const userMove = { from: move.from, to: move.to };
        const chain = computeMachineChain(chess.fen(), matched.id);
        const advanced = runSteps(chess.fen(), matched.id, userMove, chain.steps, chain.status, chain.message);
        setSession((value) =>
          value ? { ...value, loading: false, correct: value.correct + 1, deviation: null, ...advanced } : value,
        );
        // Ghi nhận review chạy nền, không chặn nước đáp của máy.
        void (async () => {
          try {
            if (activeProfileId) {
              await repertoireRepository.review({
                node_id: matched.id,
                profile_id: activeProfileId,
                correct: true,
                hints_used: 0,
                failed_attempts: 0,
                duration_ms: 0,
                centipawn_loss: matched.avg_cpl ?? 0,
              });
              onProgressChanged();
            }
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
          }
        })();
        return true;
      }

      // Lệch repertoire — KHÔNG kết thúc session.
      const expected = options;
      void (async () => {
        try {
          if (activeProfileId && expected[0]) {
            await repertoireRepository.review({
              node_id: expected[0].id,
              profile_id: activeProfileId,
              correct: false,
              hints_used: 0,
              failed_attempts: 1,
              duration_ms: 0,
              centipawn_loss: 0,
            });
            onProgressChanged();
          }
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })();
      setSession((value) =>
        value
          ? {
              ...value,
              wrong: value.wrong + 1,
              status: "deviation",
              message: "Nước này đi lệch repertoire.",
              lastMove: { from: move.from, to: move.to },
              deviation: {
                playedSan: move.san,
                playedFen: chess.fen(),
                positionFen: session.fen,
                expected,
              },
            }
          : value,
      );
      return true;
    },
    [activeProfileId, computeMachineChain, onProgressChanged, repertoire, runSteps, session, setError, tree],
  );

  const backToRepertoire = useCallback(() => {
    cancelSequence();
    setSession((value) =>
      value && value.deviation
        ? {
            ...value,
            fen: value.deviation.positionFen,
            status: "playing",
            message: "",
            machineThinking: false,
            deviation: null,
            lastMove: null,
          }
        : value,
    );
  }, [cancelSequence]);

  const revealAndContinue = useCallback(() => {
    if (!session || !session.deviation) return;
    const best = [...session.deviation.expected].sort((a, b) => b.frequency - a.frequency)[0];
    if (!best) return;
    const applied = applyUci(session.deviation.positionFen, best.move_uci);
    if (!applied) return;
    // Animate cả nước gợi ý (của người dùng) lẫn các nước đáp của máy.
    const revealed: SequenceStep = {
      fen: applied.fen,
      parentId: best.id,
      move: uciSquares(best.move_uci),
      san: applied.san,
    };
    const chain = computeMachineChain(applied.fen, best.id);
    const advanced = runSteps(
      session.deviation.positionFen,
      session.parentId,
      null,
      [revealed, ...chain.steps],
      chain.status,
      chain.message,
    );
    setSession((value) => (value ? { ...value, deviation: null, ...advanced } : value));
  }, [computeMachineChain, runSteps, session]);

  const enterFreeMode = useCallback(() => {
    cancelSequence();
    setSession((value) =>
      value && value.deviation
        ? {
            ...value,
            fen: value.deviation.playedFen,
            status: "free",
            message: "Chế độ phân tích tự do — đi thử thoải mái.",
            machineThinking: false,
            deviation: null,
          }
        : value,
    );
  }, [cancelSequence]);

  const saveDeviationMove = useCallback(
    (comment: string | null) => {
      if (!session || !session.deviation || !repertoire) return;
      const { playedSan, positionFen: fenBefore } = session.deviation;
      const chess = new Chess(fenBefore);
      let move;
      try {
        move = chess.move(playedSan);
      } catch {
        return;
      }
      if (!move) return;
      setSession((value) => (value ? { ...value, loading: true } : value));
      const parentId = session.parentId;
      void (async () => {
        let createdId: string | null = null;
        try {
          const created = await repertoireRepository.addMove({
            repertoire_id: repertoire.id,
            parent_id: parentId,
            position_key: epd(fenBefore),
            fen: fenBefore,
            move_san: move.san,
            move_uci: move.lan,
            side_to_move: repertoire.color,
            comment,
          });
          createdId = created.id;
          await reloadTree();
          onProgressChanged();
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
        // Animate nước vừa lưu rồi tới các nước đáp của máy.
        const savedFen = chess.fen();
        const savedParent = createdId ?? parentId;
        const savedStep: SequenceStep = {
          fen: savedFen,
          parentId: savedParent,
          move: { from: move.from, to: move.to },
          san: move.san,
        };
        const chain = computeMachineChain(savedFen, savedParent);
        const advanced = runSteps(
          fenBefore,
          parentId,
          null,
          [savedStep, ...chain.steps],
          chain.status,
          chain.message,
        );
        setSession((value) => (value ? { ...value, loading: false, deviation: null, ...advanced } : value));
      })();
    },
    [computeMachineChain, onProgressChanged, reloadTree, repertoire, runSteps, session, setError],
  );

  return {
    session,
    start,
    exit,
    onDrop,
    backToRepertoire,
    revealAndContinue,
    enterFreeMode,
    saveDeviationMove,
  };
}
