import { invokeCommand } from "../../../shared/services/tauriClient";
import type { DashboardMoveRecord } from "../../../dashboard";
import type {
  SaveEngineAnalysisRequest,
  StoredEngineAnalysis,
} from "../../../shared/types/tauri";

export const analysisRepository = {
  save(request: SaveEngineAnalysisRequest) {
    return invokeCommand<void>("save_engine_analysis", { request });
  },
  list(gameId: string) {
    return invokeCommand<StoredEngineAnalysis[]>("list_engine_analyses", { gameId });
  },
  markComplete(gameId: string) {
    return invokeCommand<void>("mark_game_analysis_complete", { gameId });
  },
  dashboard(profileId: number) {
    return invokeCommand<DashboardMoveRecord[]>("get_dashboard_records", { profileId });
  },
};
