import { Chess, type Color } from "chess.js";
import { PIECE_GLYPHS } from "../../../shared/chess/pieces";

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
          {piece ? PIECE_GLYPHS[piece.color][piece.type] : ""}
        </i>
      ))}
    </span>
  );
}
