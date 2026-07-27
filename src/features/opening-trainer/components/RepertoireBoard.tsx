import { Chessboard } from "react-chessboard";
import type { ReactNode } from "react";
import { useInteractiveBoardHints } from "../../../shared/chess/useInteractiveBoardHints";
import { useCheckWarning } from "../../../shared/chess/useCheckWarning";
import { turnColor } from "../model/tree";
import type { RepertoireColor } from "../types";
import type { RepertoireSession } from "../hooks/useRepertoireSession";

type RepertoireBoardProps = {
  session: RepertoireSession;
  color: RepertoireColor;
  onPieceDrop: (move: { sourceSquare: string; targetSquare: string | null }) => boolean;
};

export function RepertoireBoard({ session, color, onPieceDrop }: RepertoireBoardProps) {
  const interactionEnabled =
    !session.loading && !session.machineThinking && (session.status === "playing" || session.status === "free");
  // Ở phân tích tự do, cho điều khiển bên đang tới lượt (cả hai màu); mode luyện giữ đúng màu repertoire.
  const controlledColor = session.status === "free" ? turnColor(session.fen) : color;
  const boardHints = useInteractiveBoardHints({
    fen: session.fen,
    controlledColor,
    enabled: interactionEnabled,
  });
  const checkWarning = useCheckWarning(session.fen);
  const lastMove = session.lastMove;
  // Bên vừa đi = ngược với bên đang tới lượt. Dùng để chọn màu highlight (xanh
  // cho quân mình, đỏ cam cho quân đối phương).
  const lastMoveColor = lastMove ? (turnColor(session.fen) === "w" ? "b" : "w") : null;
  const sideLabel = color === "w" ? "Trắng" : "Đen";

  return (
    <div className="training-board">
      <div className={`training-side-indicator ${color === "w" ? "white" : "black"}`}>
        <span aria-hidden="true">{color === "w" ? "♔" : "♚"}</span>
        <div>
          <small>Bạn điều khiển</small>
          <strong>{sideLabel}</strong>
        </div>
      </div>
      <div className="training-board-surface" onMouseDownCapture={boardHints.handleBoardMouseDown}>
        <Chessboard
          options={{
            id: "opening-trainer-board",
            position: session.fen,
            boardOrientation: color === "w" ? "white" : "black",
            allowDragging: interactionEnabled,
            canDragPiece: boardHints.canDragPiece,
            onPieceClick: boardHints.onPieceClick,
            onPieceDrag: boardHints.onPieceDrag,
            onSquareClick: boardHints.onSquareClick,
            onSquareRightClick: boardHints.onSquareRightClick,
            onMouseOverSquare: boardHints.onMouseOverSquare,
            onMouseOutSquare: boardHints.onMouseOutSquare,
            onPieceDrop: (move) => {
              const moved = onPieceDrop(move);
              if (moved) boardHints.clearSelection();
              return checkWarning.handleDropResult(move, moved);
            },
            squareStyles: boardHints.squareStyles,
            squareRenderer: ({ square, children, piece }: { square: string; children?: ReactNode; piece?: { pieceType: string } | null }) => {
              const isLastMove = lastMove && (square === lastMove.from || square === lastMove.to);
              const isHoverTarget = square === boardHints.hoverTargetSquare;
              let highlight = "";
              if (isLastMove) {
                highlight = lastMoveColor === color ? " sq-hl sq-hl-own" : " sq-hl sq-hl-opp";
              } else if (isHoverTarget) {
                highlight = piece ? " sq-hl sq-hl-opp" : " sq-hl sq-hl-own";
              }
              return (
                <div
                  className={`training-square-content${highlight}${square === checkWarning.kingSquare ? ` checked-king-square${checkWarning.warningActive ? " check-warning-active" : ""}` : ""}`}
                  style={boardHints.squareStyles[square]}
                >
                  {children}
                </div>
              );
            },
            allowDrawingArrows: false,
            showAnimations: true,
            animationDurationInMs: 220,
            draggingPieceStyle: { filter: "drop-shadow(0 5px 2px rgba(0,0,0,.6)) drop-shadow(0 11px 7px rgba(0,0,0,.32))" },
            boardStyle: { borderRadius: "10px", overflow: "hidden" },
            darkSquareStyle: { backgroundColor: "#769656" },
            lightSquareStyle: { backgroundColor: "#eeeed2" },
          }}
        />
      </div>
    </div>
  );
}
