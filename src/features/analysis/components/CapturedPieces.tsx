import type { Color, PieceSymbol } from "chess.js";
import { PIECE_GLYPHS } from "../../../shared/chess/pieces";

/**
 * Dải quân đã ăn của một người chơi + badge chênh lệch vật chất "+N" (chỉ hiện
 * ở bên đang dẫn, giống chess.com). `pieceColor` là màu của các quân bị ăn.
 */
export function CapturedPieces({
  pieceColor,
  pieces,
  advantage,
}: {
  pieceColor: Color;
  pieces: PieceSymbol[];
  advantage?: number;
}) {
  if (!pieces.length && !advantage) return null;
  return (
    <div className="captured-pieces" aria-label="Quân đã ăn">
      {pieces.length > 0 && (
        <span className="captured-glyphs">
          {pieces.map((type, index) => (
            <i key={`${type}-${index}`} aria-hidden="true">
              {PIECE_GLYPHS[pieceColor][type]}
            </i>
          ))}
        </span>
      )}
      {advantage ? <span className="material-diff">+{advantage}</span> : null}
    </div>
  );
}
