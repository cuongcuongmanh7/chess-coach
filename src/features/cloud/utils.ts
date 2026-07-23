import type { CloudSyncBatch } from "./types";
import type { CloudAckToken } from "../../shared/types/tauri";

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
  ];
}
