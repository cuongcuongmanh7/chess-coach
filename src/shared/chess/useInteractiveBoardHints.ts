import { useCallback, useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from "react";
import type { Color } from "chess.js";
import { canControlPiece, getLegalMoveHints, toggleSquareHighlight } from "./boardHints";

const SELECTED_STYLE: CSSProperties = {
  boxShadow: "inset 0 0 0 999px rgba(246, 190, 73, .48), inset 0 0 0 3px rgba(255, 236, 179, .78)",
};

const MOVE_STYLE: CSSProperties = {
  backgroundImage: "radial-gradient(circle, rgba(20, 36, 30, .46) 0 17%, transparent 19%)",
};

const CAPTURE_STYLE: CSSProperties = {
  backgroundImage: "radial-gradient(circle, transparent 0 55%, rgba(20, 36, 30, .48) 57% 68%, transparent 70%)",
};

const MANUAL_HIGHLIGHT_STYLE: CSSProperties = {
  boxShadow: "inset 0 0 0 999px rgba(240, 71, 71, .48), inset 0 0 0 3px rgba(255, 157, 151, .72)",
};

type BoardHintOptions = {
  fen: string;
  controlledColor: Color;
  enabled: boolean;
};

export function useInteractiveBoardHints({
  fen,
  controlledColor,
  enabled,
}: BoardHintOptions) {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [highlightedSquares, setHighlightedSquares] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSelectedSquare(null);
    setHighlightedSquares(new Set());
  }, [enabled, fen]);

  const selectPiece = useCallback(({ square }: { square: string | null }) => {
    if (enabled && canControlPiece(fen, square, controlledColor)) {
      setSelectedSquare(square);
    }
  }, [controlledColor, enabled, fen]);

  const clearSelection = useCallback(() => setSelectedSquare(null), []);
  const clearAllHighlights = useCallback(() => {
    setSelectedSquare(null);
    setHighlightedSquares(new Set());
  }, []);
  const handleBoardMouseDown = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.button !== 1) return;
    event.preventDefault();
    clearAllHighlights();
  }, [clearAllHighlights]);
  const handleSquareRightClick = useCallback(({ square }: { square: string }) => {
    if (!enabled) return;
    setHighlightedSquares((current) => toggleSquareHighlight(current, square));
  }, [enabled]);

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    if (!enabled) return styles;

    for (const square of highlightedSquares) {
      styles[square] = MANUAL_HIGHLIGHT_STYLE;
    }
    if (!selectedSquare) return styles;

    styles[selectedSquare] = { ...styles[selectedSquare], ...SELECTED_STYLE };
    for (const hint of getLegalMoveHints(fen, selectedSquare, controlledColor)) {
      styles[hint.square] = {
        ...styles[hint.square],
        ...(hint.kind === "capture" ? CAPTURE_STYLE : MOVE_STYLE),
      };
    }
    return styles;
  }, [controlledColor, enabled, fen, highlightedSquares, selectedSquare]);

  const canDragPiece = useCallback(({ square }: { square: string | null }) => (
    enabled && canControlPiece(fen, square, controlledColor)
  ), [controlledColor, enabled, fen]);

  return {
    canDragPiece,
    clearAllHighlights,
    clearSelection,
    handleBoardMouseDown,
    onPieceClick: selectPiece,
    onPieceDrag: selectPiece,
    onSquareClick: selectPiece,
    onSquareRightClick: handleSquareRightClick,
    squareStyles,
  };
}
