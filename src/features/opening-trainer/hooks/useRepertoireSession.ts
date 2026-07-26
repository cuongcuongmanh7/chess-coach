import { useCallback, useState } from "react";
import { Chess } from "chess.js";
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

  // Tự đi các nước đối thủ (side != color) cho tới lượt người dùng hoặc hết biến.
  const autoAdvance = useCallback(
    (
      fen: string,
      parentId: string | null,
      entryMove: { from: string; to: string } | null = null,
    ): Partial<RepertoireSession> => {
      if (!repertoire) return { fen, parentId, status: "complete", lastMove: entryMove };
      let currentFen = fen;
      let currentParent = parentId;
      let lastMove = entryMove;
      for (let guard = 0; guard < 200; guard += 1) {
        const options = childrenOf(tree, currentParent);
        if (options.length === 0) {
          return {
            fen: currentFen,
            parentId: currentParent,
            status: "complete",
            message: "Hoàn thành biến. Làm lại hoặc chọn repertoire khác.",
            lastMove,
          };
        }
        if (turnColor(currentFen) === repertoire.color) {
          return { fen: currentFen, parentId: currentParent, status: "playing", message: "", lastMove };
        }
        const reply = [...options].sort((a, b) => b.frequency - a.frequency)[0];
        const applied = applyUci(currentFen, reply.move_uci);
        if (!applied) {
          return { fen: currentFen, parentId: currentParent, status: "playing", message: "", lastMove };
        }
        currentFen = applied.fen;
        currentParent = reply.id;
        lastMove = uciSquares(reply.move_uci);
      }
      return { fen: currentFen, parentId: currentParent, status: "playing", message: "", lastMove };
    },
    [repertoire, tree],
  );

  const start = useCallback(() => {
    const base = initialSession(tree);
    setSession({ ...base, ...autoAdvance(base.fen, null) });
  }, [autoAdvance, tree]);

  const exit = useCallback(() => setSession(null), []);

  const onDrop = useCallback(
    ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
      if (!targetSquare || !session || !repertoire || session.loading) return false;
      if (session.status === "complete" || session.status === "deviation") return false;
      const chess = new Chess(session.fen);
      let move;
      try {
        move = chess.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      } catch {
        return false;
      }
      if (!move) return false;

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
        setSession((value) => (value ? { ...value, loading: true } : value));
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
          setSession((value) => {
            if (!value) return value;
            const advanced = autoAdvance(chess.fen(), matched.id, { from: move.from, to: move.to });
            return {
              ...value,
              loading: false,
              correct: value.correct + 1,
              deviation: null,
              ...advanced,
            };
          });
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
    [activeProfileId, autoAdvance, onProgressChanged, repertoire, session, setError, tree],
  );

  const backToRepertoire = useCallback(() => {
    setSession((value) =>
      value && value.deviation
        ? {
            ...value,
            fen: value.deviation.positionFen,
            status: "playing",
            message: "",
            deviation: null,
            lastMove: null,
          }
        : value,
    );
  }, []);

  const revealAndContinue = useCallback(() => {
    setSession((value) => {
      if (!value || !value.deviation) return value;
      const best = [...value.deviation.expected].sort((a, b) => b.frequency - a.frequency)[0];
      if (!best) return value;
      const applied = applyUci(value.deviation.positionFen, best.move_uci);
      if (!applied) return value;
      const advanced = autoAdvance(applied.fen, best.id, uciSquares(best.move_uci));
      return { ...value, deviation: null, ...advanced };
    });
  }, [autoAdvance]);

  const enterFreeMode = useCallback(() => {
    setSession((value) =>
      value && value.deviation
        ? {
            ...value,
            fen: value.deviation.playedFen,
            status: "free",
            message: "Chế độ phân tích tự do — đi thử thoải mái.",
            deviation: null,
          }
        : value,
    );
  }, []);

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
        setSession((value) => {
          if (!value) return value;
          const advanced = autoAdvance(chess.fen(), createdId ?? parentId, {
            from: move.from,
            to: move.to,
          });
          return { ...value, loading: false, deviation: null, ...advanced };
        });
      })();
    },
    [autoAdvance, onProgressChanged, reloadTree, repertoire, session, setError],
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
