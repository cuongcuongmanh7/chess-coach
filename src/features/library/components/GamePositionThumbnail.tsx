import { Chess, type Color, type PieceSymbol } from "chess.js";

const PIECES: Record<Color, Record<PieceSymbol, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

type GamePositionThumbnailProps = {
  fen: string;
  orientation: Color;
};

export function GamePositionThumbnail({ fen, orientation }: GamePositionThumbnailProps) {
  let squares;
  try {
    squares = new Chess(fen).board().flat();
  } catch {
    return null;
  }
  if (orientation === "b") squares.reverse();

  return (
    <span className="game-position-thumbnail" aria-hidden="true" title="Vị trí sau nước cuối">
      {squares.map((piece, index) => (
        <i className={(Math.floor(index / 8) + index) % 2 === 0 ? "light" : "dark"} key={index}>
          {piece ? PIECES[piece.color][piece.type] : ""}
        </i>
      ))}
    </span>
  );
}
