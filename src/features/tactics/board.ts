import {
  Chess,
  SQUARES,
  type Color,
  type Move,
  type PieceSymbol,
  type Square,
} from "chess.js";

export const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 100,
};

export const opposite = (color: Color): Color => (color === "w" ? "b" : "w");

export function applyUci(position: Chess, uci: string): Move | null {
  if (!uci || uci.length < 4) return null;
  try {
    return position.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || undefined,
    });
  } catch {
    return null;
  }
}

export function applySanLine(fen: string, line: string[], limit = 5) {
  const position = new Chess(fen);
  const moves: Move[] = [];
  for (const san of line.slice(0, limit)) {
    try {
      const move = position.move(san);
      if (!move) break;
      moves.push(move);
    } catch {
      break;
    }
  }
  return { position, moves };
}

export function pieces(position: Chess, color?: Color) {
  return SQUARES.flatMap((square) => {
    const piece = position.get(square);
    if (!piece || (color && piece.color !== color)) return [];
    return [{ square, piece }];
  });
}

export function attackedTargets(
  position: Chess,
  attackerSquare: Square,
  attackerColor: Color,
) {
  return pieces(position, opposite(attackerColor)).filter(({ square }) =>
    position.attackers(square, attackerColor).includes(attackerSquare),
  );
}

export function isPassedPawn(position: Chess, square: Square, color: Color) {
  const pawn = position.get(square);
  if (!pawn || pawn.type !== "p" || pawn.color !== color) return false;
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  return !pieces(position, opposite(color)).some(({ square: enemySquare, piece }) => {
    if (piece.type !== "p") return false;
    const enemyFile = enemySquare.charCodeAt(0) - 97;
    const enemyRank = Number(enemySquare[1]);
    const inFront = color === "w" ? enemyRank > rank : enemyRank < rank;
    return inFront && Math.abs(enemyFile - file) <= 1;
  });
}

const fileRank = (square: Square) => ({
  file: square.charCodeAt(0) - 97,
  rank: Number(square[1]) - 1,
});

export function squaresBetween(from: Square, to: Square) {
  const start = fileRank(from);
  const end = fileRank(to);
  const fileDelta = end.file - start.file;
  const rankDelta = end.rank - start.rank;
  const diagonal = Math.abs(fileDelta) === Math.abs(rankDelta);
  const straight = fileDelta === 0 || rankDelta === 0;
  if (!diagonal && !straight) return [];
  const fileStep = Math.sign(fileDelta);
  const rankStep = Math.sign(rankDelta);
  const result: Square[] = [];
  let file = start.file + fileStep;
  let rank = start.rank + rankStep;
  while (file !== end.file || rank !== end.rank) {
    result.push(`${String.fromCharCode(97 + file)}${rank + 1}` as Square);
    file += fileStep;
    rank += rankStep;
  }
  return result;
}

export function sliderSupportsRay(piece: PieceSymbol, from: Square, to: Square) {
  const start = fileRank(from);
  const end = fileRank(to);
  const diagonal = Math.abs(end.file - start.file) === Math.abs(end.rank - start.rank);
  const straight = end.file === start.file || end.rank === start.rank;
  return piece === "q" || (piece === "b" && diagonal) || (piece === "r" && straight);
}
