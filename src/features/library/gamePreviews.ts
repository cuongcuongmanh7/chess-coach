import { Chess } from "chess.js";
import type { GameAnalysis } from "../../analysis";
import type { GamePreviewUpdate, SavedGameSummary } from "../../shared/types/tauri";

export function finalFenFromAnalysis(analysis: GameAnalysis): string {
  return analysis.steps[analysis.steps.length - 1]?.fenAfter || "";
}

export function finalFenFromPgn(pgn: string): string {
  const chess = new Chess();
  chess.loadPgn(pgn, { strict: false });
  if (!chess.history().length) throw new Error("PGN không có nước đi.");
  return chess.fen();
}

export function hydrateGamePreviews(games: SavedGameSummary[]): {
  games: SavedGameSummary[];
  updates: GamePreviewUpdate[];
} {
  const updates: GamePreviewUpdate[] = [];
  const hydratedGames = games.map((game) => {
    if (game.final_fen || !game.preview_pgn) return game;
    try {
      const finalFen = finalFenFromPgn(game.preview_pgn);
      if (!finalFen) return game;
      updates.push({ id: game.id, final_fen: finalFen });
      return { ...game, final_fen: finalFen, preview_pgn: null };
    } catch {
      return game;
    }
  });
  return { games: hydratedGames, updates };
}
