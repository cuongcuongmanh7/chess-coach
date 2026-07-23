import { Chess, type Color, type Move, type Square } from "chess.js";
import type { AnalysisStep } from "../../analysis";
import type { EngineMoveAnalysis } from "../../stockfish";
import {
  PIECE_VALUES,
  applySanLine,
  opposite,
  pieces,
  sliderSupportsRay,
  squaresBetween,
} from "./board.ts";

const RAY_DIRECTIONS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
] as const;

function squareAt(file: number, rank: number) {
  if (file < 0 || file > 7 || rank < 1 || rank > 8) return null;
  return `${String.fromCharCode(97 + file)}${rank}` as Square;
}

function rayPieces(position: Chess, from: Square, fileStep: number, rankStep: number) {
  const result: Array<{ square: Square; color: Color; type: string }> = [];
  let file = from.charCodeAt(0) - 97 + fileStep;
  let rank = Number(from[1]) + rankStep;
  while (true) {
    const square = squareAt(file, rank);
    if (!square) break;
    const piece = position.get(square);
    if (piece) result.push({ square, color: piece.color, type: piece.type });
    file += fileStep;
    rank += rankStep;
  }
  return result;
}

function sliderDirections(type: string) {
  if (type === "b") return RAY_DIRECTIONS.slice(4);
  if (type === "r") return RAY_DIRECTIONS.slice(0, 4);
  return type === "q" ? RAY_DIRECTIONS : [];
}

export function absolutePin(position: Chess, attackerColor: Color) {
  for (const attacker of pieces(position, attackerColor)) {
    for (const [fileStep, rankStep] of sliderDirections(attacker.piece.type)) {
      const occupied = rayPieces(position, attacker.square, fileStep, rankStep);
      if (
        occupied.length >= 2
        && occupied[0].color !== attackerColor
        && occupied[0].type !== "k"
        && occupied[1].color !== attackerColor
        && occupied[1].type === "k"
      ) {
        return [attacker.square, occupied[0].square, occupied[1].square];
      }
    }
  }
  return null;
}

export function skewer(position: Chess, attackerColor: Color) {
  for (const attacker of pieces(position, attackerColor)) {
    for (const [fileStep, rankStep] of sliderDirections(attacker.piece.type)) {
      const occupied = rayPieces(position, attacker.square, fileStep, rankStep);
      if (occupied.length < 2 || occupied[0].color === attackerColor || occupied[1].color === attackerColor) {
        continue;
      }
      const firstValue = PIECE_VALUES[occupied[0].type as keyof typeof PIECE_VALUES] || 0;
      const secondValue = PIECE_VALUES[occupied[1].type as keyof typeof PIECE_VALUES] || 0;
      if (occupied[0].type === "k" || firstValue > secondValue) {
        return [attacker.square, occupied[0].square, occupied[1].square];
      }
    }
  }
  return null;
}

export function discoveredAttack(
  before: Chess,
  after: Chess,
  move: Move,
  attackerColor: Color,
) {
  for (const attacker of pieces(after, attackerColor)) {
    if (!["b", "r", "q"].includes(attacker.piece.type)) continue;
    for (const target of pieces(after, opposite(attackerColor))) {
      if (PIECE_VALUES[target.piece.type] < 3 && target.piece.type !== "k") continue;
      if (!sliderSupportsRay(attacker.piece.type, attacker.square, target.square)) continue;
      const between = squaresBetween(attacker.square, target.square);
      if (!between.includes(move.from) || between.some((square) => after.get(square))) continue;
      if (before.attackers(target.square, attackerColor).includes(attacker.square)) continue;
      return [attacker.square, move.from, target.square];
    }
  }
  return null;
}

export function removalOfDefender(step: AnalysisStep, engine: EngineMoveAnalysis) {
  const replay = applySanLine(step.fenBefore, engine.bestLineSan, 3);
  const [capture, reply, followUp] = replay.moves;
  if (!capture?.captured || !followUp?.captured || capture.color !== followUp.color || !reply) {
    return null;
  }
  const before = new Chess(step.fenBefore);
  const target = before.get(followUp.to);
  if (!target || PIECE_VALUES[target.type] < 3) return null;
  const defenderColor = opposite(capture.color);
  if (!before.attackers(followUp.to, defenderColor).includes(capture.to)) return null;
  return [capture.from, capture.to, followUp.to];
}
