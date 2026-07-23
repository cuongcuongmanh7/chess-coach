import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { useInteractiveBoardHints } from "../../../shared/chess/useInteractiveBoardHints";
import type { TrainingCard, TrainingSession } from "../types";

type TrainingBoardProps = {
  card: TrainingCard;
  session: TrainingSession;
  complete: boolean;
  onPieceDrop: (move: {
    sourceSquare: string;
    targetSquare: string | null;
  }) => boolean;
};

export function TrainingBoard({
  card,
  session,
  complete,
  onPieceDrop,
}: TrainingBoardProps) {
  const interactionEnabled = !session.loading && !complete;
  const boardHints = useInteractiveBoardHints({
    fen: session.fen,
    controlledColor: card.side_to_move,
    enabled: interactionEnabled,
  });
  const bestArrow = session.hintsUsed === 3
    ? (() => {
      try {
        const move = new Chess(card.fen).move(card.best_move);
        return move ? [{
          startSquare: move.from,
          endSquare: move.to,
          color: "#f6be49",
        }] : [];
      } catch {
        return [];
      }
    })()
    : [];
  const sideLabel = card.side_to_move === "w" ? "Trắng" : "Đen";

  return (
    <div className="training-board">
      <div className={`training-side-indicator ${card.side_to_move === "w" ? "white" : "black"}`}>
        <span aria-hidden="true">{card.side_to_move === "w" ? "♔" : "♚"}</span>
        <div><small>Bạn điều khiển</small><strong>{sideLabel}</strong></div>
      </div>
      <div className="training-board-surface" onMouseDownCapture={boardHints.handleBoardMouseDown}>
        <Chessboard
          options={{
            id: "mistake-lab-board",
            position: session.fen,
            boardOrientation: card.side_to_move === "w" ? "white" : "black",
            allowDragging: interactionEnabled,
            canDragPiece: boardHints.canDragPiece,
            onPieceClick: boardHints.onPieceClick,
            onPieceDrag: boardHints.onPieceDrag,
            onSquareClick: boardHints.onSquareClick,
            onSquareRightClick: boardHints.onSquareRightClick,
            onPieceDrop: (move) => {
              const moved = onPieceDrop(move);
              if (moved) boardHints.clearSelection();
              return moved;
            },
            squareStyles: boardHints.squareStyles,
            allowDrawingArrows: false,
            showAnimations: true,
            animationDurationInMs: 220,
            arrows: bestArrow,
            boardStyle: { borderRadius: "10px", overflow: "hidden" },
            darkSquareStyle: { backgroundColor: "#315f50" },
            lightSquareStyle: { backgroundColor: "#d9d4c4" },
          }}
        />
      </div>
    </div>
  );
}
