import { Chess } from "chess.js";
import type { GameAnalysis } from "../../analysis";
import type { GamePreviewUpdate, SavedGameSummary } from "../../shared/types/tauri";

export function finalFenFromAnalysis(analysis: GameAnalysis): string {
  return analysis.steps[analysis.steps.length - 1]?.fenAfter || "";
}

export function previewFromPgn(pgn: string): {
  finalFen: string;
  plyCount: number;
} {
  const chess = new Chess();
  chess.loadPgn(pgn, { strict: false });
  const plyCount = chess.history().length;
  if (!plyCount) throw new Error("PGN không có nước đi.");
  return { finalFen: chess.fen(), plyCount };
}

export function finalFenFromPgn(pgn: string): string {
  return previewFromPgn(pgn).finalFen;
}

export function hydrateGamePreviews(games: SavedGameSummary[]): {
  games: SavedGameSummary[];
  updates: GamePreviewUpdate[];
} {
  const updates: GamePreviewUpdate[] = [];
  const hydratedGames = games.map((game) => {
    if ((game.final_fen && game.ply_count != null) || !game.preview_pgn) return game;
    try {
      const preview = previewFromPgn(game.preview_pgn);
      updates.push({
        id: game.id,
        final_fen: preview.finalFen,
        ply_count: preview.plyCount,
      });
      return {
        ...game,
        final_fen: preview.finalFen,
        ply_count: preview.plyCount,
        preview_pgn: null,
      };
    } catch {
      return game;
    }
  });
  return { games: hydratedGames, updates };
}
