import { invokeCommand } from "../../../shared/services/tauriClient";
import type {
  FetchRecentGamesRequest,
  SaveGameRequest,
  SavedGameDetail,
  SavedGameSummary,
} from "../../../shared/types/tauri";

export const gameRepository = {
  list(profileId: number | null) {
    return invokeCommand<SavedGameSummary[]>("list_saved_games", { profileId });
  },
  open(id: string) {
    return invokeCommand<SavedGameDetail>("open_saved_game", { id });
  },
  save(request: SaveGameRequest) {
    return invokeCommand<string>("save_game", { request });
  },
  remove(id: string) {
    return invokeCommand<boolean>("delete_saved_game", { id });
  },
  fetchChessComGame(gameUrl: string) {
    return invokeCommand<string>("fetch_chess_com_game", { gameUrl });
  },
  fetchRecent(request: FetchRecentGamesRequest) {
    return invokeCommand<string[]>("fetch_recent_games", { request });
  },
};
