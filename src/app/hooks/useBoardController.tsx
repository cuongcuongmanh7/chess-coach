import { useMemo, type ReactNode } from "react";
import { Chess, type Square } from "chess.js";
import type { AnalysisStep } from "../../analysis";
import { buildVariation } from "../../features/analysis/boardUtils";
import { useInteractiveBoardHints } from "../../shared/chess/useInteractiveBoardHints";
import { analyzeMoveWithStockfish, type EngineMoveAnalysis } from "../../stockfish";
import type { AppState } from "./useAppState";

type BoardDependencies = {
  step: AnalysisStep;
  engine: EngineMoveAnalysis | undefined;
  boardPosition: string;
  boardInteractionMode: "main" | "retry" | "variation";
  variationMoveSquares: { from: string; to: string } | null;
};

export function useBoardController(
  state: AppState,
  {
    step,
    engine,
    boardPosition,
    boardInteractionMode,
    variationMoveSquares,
  }: BoardDependencies,
) {
  const {
    analysis,
    orientation,
    setOrientation,
    loading,
    setEngineError,
    retryState,
    setRetryState,
    setPromotionPending,
    setVariationState,
    setVariationPlaying,
  } = state;
  const boardHints = useInteractiveBoardHints({
    fen: boardPosition,
    controlledColor: step.color,
    enabled: Boolean(retryState && !retryState.loading && !retryState.feedback),
  });
  const arrows = useMemo(() => {
    const result = [...step.arrows];
    engine?.variations.slice(0, 2).forEach((variation, index) => {
      if (!variation.moveUci || variation.moveUci === step.lan) return;
      result.push({
        startSquare: variation.moveUci.slice(0, 2),
        endSquare: variation.moveUci.slice(2, 4),
        color: index === 0 ? "#43d9a3" : "#67a7ff",
      });
    });
    return result;
  }, [engine?.variations, step.arrows, step.lan]);

  const beginRetry = () => {
    if (!engine) return;
    setVariationState(null);
    setVariationPlaying(false);
    setOrientation(step.color === "w" ? "white" : "black");
    setRetryState({
      fen: step.fenBefore,
      attempts: 0,
      hintLevel: 0,
      loading: false,
      feedback: null,
    });
  };

  const evaluateRetryMove = (from: string, to: string, promotion?: string) => {
    if (!retryState || retryState.loading || retryState.feedback) return false;
    const chess = new Chess(step.fenBefore);
    try {
      const move = chess.move({ from, to, promotion: promotion || undefined });
      if (!move) return false;
      const nextFen = chess.fen();
      setPromotionPending(null);
      setRetryState((value) => value ? {
        ...value,
        fen: nextFen,
        attempts: value.attempts + 1,
        loading: true,
        feedback: null,
      } : value);
      analyzeMoveWithStockfish(step.fenBefore, nextFen, move.lan)
        .then((result) => setRetryState((value) => value ? {
          ...value,
          loading: false,
          feedback: {
            quality: result.quality,
            moveSan: move.san,
            bestMoveSan: result.bestMoveSan,
            loss: Math.round(result.centipawnLoss),
          },
        } : value))
        .catch((reason) => {
          setEngineError(reason instanceof Error ? reason.message : String(reason));
          setRetryState((value) => value ? { ...value, fen: step.fenBefore, loading: false } : value);
        });
      return true;
    } catch {
      return false;
    }
  };

  const handleRetryDrop = ({ sourceSquare, targetSquare }: { sourceSquare: string; targetSquare: string | null }) => {
    if (!targetSquare || !retryState || retryState.loading || retryState.feedback) return false;
    const chess = new Chess(step.fenBefore);
    const piece = chess.get(sourceSquare as Square);
    const promotes = piece?.type === "p" && (targetSquare.endsWith("8") || targetSquare.endsWith("1"));
    if (promotes) {
      setPromotionPending({ from: sourceSquare, to: targetSquare });
      return false;
    }
    return evaluateRetryMove(sourceSquare, targetSquare);
  };

  const openVariation = (rank: number, lineSan: string[]) => {
    const next = buildVariation(step.fenBefore, lineSan, rank, rank === 1 ? "Phương án tốt nhất" : "Phương án số 2");
    if (!next) return;
    setRetryState(null);
    setVariationPlaying(false);
    setVariationState(next);
  };

  const retryBestPiece = useMemo(() => {
    if (!engine?.bestMoveUci) return "quân phù hợp";
    const chess = new Chess(step.fenBefore);
    const piece = chess.get(engine.bestMoveUci.slice(0, 2) as Square);
    return piece ? ({ p: "tốt", n: "mã", b: "tượng", r: "xe", q: "hậu", k: "vua" } as const)[piece.type] : "quân phù hợp";
  }, [engine?.bestMoveUci, step.fenBefore]);

  const chessboardOptions = {
    id: "analysis-board",
    position: boardPosition,
    boardOrientation: orientation,
    allowDragging: Boolean(retryState && !retryState.loading && !retryState.feedback),
    canDragPiece: boardHints.canDragPiece,
    onPieceClick: boardHints.onPieceClick,
    onPieceDrag: boardHints.onPieceDrag,
    onSquareClick: boardHints.onSquareClick,
    onSquareRightClick: boardHints.onSquareRightClick,
    onPieceDrop: (move: { sourceSquare: string; targetSquare: string | null }) => {
      const moved = handleRetryDrop(move);
      if (moved) boardHints.clearSelection();
      return moved;
    },
    squareStyles: boardHints.squareStyles,
    allowDrawingArrows: false,
    showAnimations: true,
    animationDurationInMs: 220,
    arrows: boardInteractionMode === "main" ? arrows : [],
    boardStyle: {
      borderRadius: "10px",
      boxShadow: "0 30px 80px rgba(0, 0, 0, 0.42)",
      overflow: "hidden",
    },
    darkSquareStyle: { backgroundColor: "#315f50" },
    lightSquareStyle: { backgroundColor: "#d9d4c4" },
    squareRenderer: ({ square, children }: { square: string; children?: ReactNode }) => (
      <div
        className={`analysis-square-content${boardInteractionMode === "main" && square === step.from ? " last-move-from" : ""}${boardInteractionMode === "main" && square === step.to ? " last-move-to" : ""}${boardInteractionMode === "variation" && square === variationMoveSquares?.from ? " variation-move-from" : ""}${boardInteractionMode === "variation" && square === variationMoveSquares?.to ? " variation-move-to" : ""}`}
        style={boardHints.squareStyles[square]}
      >
        {children}
      </div>
    ),
    darkSquareNotationStyle: { color: "#d9d4c4", fontSize: "11px", fontWeight: 700 },
    lightSquareNotationStyle: { color: "#315f50", fontSize: "11px", fontWeight: 700 },
    alphaNotationStyle: { zIndex: 50, right: "3px", bottom: "2px", fontSize: "11px", fontWeight: 900, lineHeight: 1, textShadow: "0 1px 2px rgba(0,0,0,.95), 0 0 2px rgba(255,255,255,.38)", pointerEvents: "none" },
    numericNotationStyle: { zIndex: 50, top: "3px", left: "3px", fontSize: "11px", fontWeight: 900, lineHeight: 1, textShadow: "0 1px 2px rgba(0,0,0,.95), 0 0 2px rgba(255,255,255,.38)", pointerEvents: "none" },
  } as const;



  return {
    arrows,
    beginRetry,
    evaluateRetryMove,
    handleRetryDrop,
    openVariation,
    retryBestPiece,
    chessboardOptions,
    handleBoardMouseDown: boardHints.handleBoardMouseDown,
  };
}
