import { invokeCommand } from "../../../shared/services/tauriClient";
import type {
  AiExplanation,
  AiProvider,
  ExplainGameRequest,
  ExplainMoveRequest,
} from "../../../shared/types/tauri";

export const coachRepository = {
  hasApiKey(provider: AiProvider) {
    return invokeCommand<boolean>("has_api_key", { provider });
  },
  setApiKey(provider: AiProvider, apiKey: string) {
    return invokeCommand<void>("set_api_key", { provider, apiKey });
  },
  clearApiKey(provider: AiProvider) {
    return invokeCommand<void>("clear_api_key", { provider });
  },
  clearCache() {
    return invokeCommand<number>("clear_ai_cache");
  },
  cached(provider: AiProvider, model: string, request: ExplainMoveRequest) {
    return invokeCommand<AiExplanation | null>("get_cached_explanation", {
      provider,
      model,
      request,
    });
  },
  explain(
    provider: AiProvider,
    model: string,
    request: ExplainMoveRequest,
    forceRefresh: boolean,
  ) {
    return invokeCommand<AiExplanation>("explain_move", {
      provider,
      model,
      request,
      forceRefresh,
    });
  },
  summarize(
    provider: AiProvider,
    model: string,
    request: ExplainGameRequest,
    forceRefresh: boolean,
  ) {
    return invokeCommand<AiExplanation>("summarize_game", {
      provider,
      model,
      request,
      forceRefresh,
    });
  },
};
