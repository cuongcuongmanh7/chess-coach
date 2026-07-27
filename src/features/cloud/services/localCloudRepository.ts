import { invokeCommand } from "../../../shared/services/tauriClient";
import type {
  CloudSyncBatch,
  CloudSyncCursors,
} from "../types";
import type {
  CloudAckToken,
  CloudMergeResult,
  DatabaseActivationResult,
} from "../../../shared/types/tauri";

export const localCloudRepository = {
  activate(uid: string) {
    return invokeCommand<DatabaseActivationResult>("activate_cloud_account", { uid });
  },
  deactivate() {
    return invokeCommand<DatabaseActivationResult>("deactivate_cloud_account");
  },
  cursors(uid: string) {
    return invokeCommand<CloudSyncCursors>("get_cloud_sync_cursors", { uid });
  },
  merge(request: {
    profiles: unknown[];
    games: unknown[];
    training_progress: unknown[];
    engine_analyses: unknown[];
    analysis_manifests: unknown[];
    training_attempts: unknown[];
    ai_explanations: unknown[];
    repertoires: unknown[];
    repertoire_nodes: unknown[];
    repertoire_progress: unknown[];
  }) {
    return invokeCommand<CloudMergeResult>("merge_cloud_changes", { request });
  },
  setCursors(uid: string, cursors: CloudSyncCursors) {
    return invokeCommand<void>("set_cloud_sync_cursors", { uid, cursors });
  },
  exportChanges() {
    return invokeCommand<CloudSyncBatch>("export_cloud_changes");
  },
  /// Số thay đổi local còn chờ đẩy lên cloud. Rẻ hơn `exportChanges()` vì chỉ
  /// đếm hàng đợi thay vì dựng payload cho từng mục.
  pendingCount() {
    return invokeCommand<number>("count_pending_cloud_changes");
  },
  acknowledge(changes: CloudAckToken[]) {
    return invokeCommand<number>("acknowledge_cloud_changes", { tokens: changes });
  },
  markFailed(changes: CloudAckToken[], error: string) {
    return invokeCommand<void>("mark_cloud_changes_failed", { tokens: changes, error });
  },
};
