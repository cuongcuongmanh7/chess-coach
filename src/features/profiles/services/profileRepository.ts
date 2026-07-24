import { invokeCommand } from "../../../shared/services/tauriClient";
import type {
  PlayerProfile,
  SyncPlatform,
} from "../../../shared/types/tauri";

export const profileRepository = {
  list() {
    return invokeCommand<PlayerProfile[]>("list_player_profiles");
  },
  add(platform: SyncPlatform, username: string) {
    return invokeCommand<PlayerProfile>("add_player_profile", { platform, username });
  },
  remove(profileId: number) {
    return invokeCommand<void>("delete_player_profile", { profileId });
  },
  markSynced(profileId: number) {
    return invokeCommand<void>("mark_profile_synced", { profileId });
  },
  setSyncState(profileId: number, watermark: string | null, gap: boolean) {
    return invokeCommand<void>("set_profile_sync_state", { profileId, watermark, gap });
  },
};
