import type { CloudSyncBatch } from "./types";
import type { CloudAckToken, CloudMergeResult } from "../../shared/types/tauri";

export function emptyCloudMergeResult(): CloudMergeResult {
  return {
    profiles_added: 0,
    games_added: 0,
    profiles_deleted: 0,
    games_deleted: 0,
    training_progress_merged: 0,
    engine_analyses_merged: 0,
    analysis_manifests_merged: 0,
    training_attempts_merged: 0,
    ai_explanations_merged: 0,
  };
}

export function accumulateCloudMerge(target: CloudMergeResult, value: CloudMergeResult) {
  for (const key of Object.keys(target) as Array<keyof CloudMergeResult>) {
    target[key] += value[key];
  }
}

export function cloudBatchMaxAttempts(batch: CloudSyncBatch) {
  return Math.max(0, ...[
    batch.profiles,
    batch.games,
    batch.training_progress,
    batch.engine_analyses,
    batch.analysis_manifests,
    batch.training_attempts,
    batch.ai_explanations,
  ].flatMap((changes) => changes.map((change) => change.attempts)));
}

export function cloudMergedCount(result: CloudMergeResult) {
  return result.profiles_added
    + result.games_added
    + result.training_progress_merged
    + result.engine_analyses_merged
    + result.analysis_manifests_merged
    + result.training_attempts_merged
    + result.ai_explanations_merged;
}

export function cloudAckTokens(batch: CloudSyncBatch): CloudAckToken[] {
  return [
    ...batch.profiles.map((change) => ({
      entity_type: "profile" as const,
      entity_id: change.document_id,
      generation: change.generation,
    })),
    ...batch.games.map((change) => ({
      entity_type: "game" as const,
      entity_id: change.document_id,
      generation: change.generation,
    })),
    ...batch.training_progress.map((change) => ({
      entity_type: "training_progress" as const,
      entity_id: change.document_id,
      generation: change.generation,
    })),
    ...batch.engine_analyses.map((change) => ({
      entity_type: "engine_analysis" as const,
      entity_id: change.document_id,
      generation: change.generation,
    })),
    ...batch.analysis_manifests.map((change) => ({
      entity_type: "analysis_manifest" as const,
      entity_id: change.document_id,
      generation: change.generation,
    })),
    ...batch.training_attempts.map((change) => ({
      entity_type: "training_attempt" as const,
      entity_id: change.document_id,
      generation: change.generation,
    })),
    ...batch.ai_explanations.map((change) => ({
      entity_type: "ai_explanation" as const,
      entity_id: change.document_id,
      generation: change.generation,
    })),
  ];
}
