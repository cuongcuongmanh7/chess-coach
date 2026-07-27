// Cờ "cấu hình học đã đổi ở máy này", tách khỏi `cloudPreferences.ts` để các call
// site chỉ ghi localStorage không phải kéo SDK firebase vào chunk khởi động.
const DIRTY_KEY = "kypho-sync-preferences-dirty";

export function markSyncedPreferencesChanged() {
  localStorage.setItem(DIRTY_KEY, "true");
}

export function isSyncedPreferencesDirty() {
  return localStorage.getItem(DIRTY_KEY) === "true";
}

export function clearSyncedPreferencesDirty() {
  localStorage.removeItem(DIRTY_KEY);
}
