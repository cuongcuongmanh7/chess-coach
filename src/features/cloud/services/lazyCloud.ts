import type { CloudDownloadResult, CloudSyncBatch, CloudSyncCursors } from "../types";
import type { SyncedPreferences } from "./cloudPreferences";
import { firebaseConfigured } from "./firebaseConfig";

/// Ranh giới lazy duy nhất của feature cloud.
///
/// Mọi module có `import "firebase/*"` chỉ được với tới qua `import()` động ở đây,
/// nên Rollup dồn cả SDK firebase (~0,7 MB) vào một chunk async thay vì chunk khởi
/// động. Các module đó giữ nguyên không sửa — logic watermark trong `cloudSync.ts`
/// là phần dễ vỡ nhất nên không chạm vào.
///
/// Chunk chỉ được nạp khi app thực sự dùng cloud: quan sát trạng thái đăng nhập
/// (và chỉ khi đã cấu hình firebase), đăng nhập, hoặc đồng bộ.
const authModule = () => import("./auth");
const syncModule = () => import("./cloudSync");
const preferencesModule = () => import("./cloudPreferences");

export type { User } from "firebase/auth";

/// Giữ chữ ký đồng bộ của `onAuthStateChanged`: trả về hàm huỷ ngay lập tức, còn
/// việc nạp SDK diễn ra ở nền. Huỷ trước khi nạp xong thì không đăng ký nữa.
export function observeFirebaseUser(
  callback: (user: import("firebase/auth").User | null) => void,
) {
  if (!firebaseConfigured) {
    callback(null);
    return () => undefined;
  }
  let cancelled = false;
  let unsubscribe: (() => void) | null = null;
  void authModule()
    .then((module) => {
      if (cancelled) return;
      unsubscribe = module.observeFirebaseUser(callback);
    })
    .catch(() => callback(null));
  return () => {
    cancelled = true;
    unsubscribe?.();
    unsubscribe = null;
  };
}

export async function signInWithGoogle() {
  return (await authModule()).signInWithGoogle();
}

export async function signOutFirebase() {
  return (await authModule()).signOutFirebase();
}

export async function cancelGoogleSignIn() {
  return (await authModule()).cancelGoogleSignIn();
}

export async function downloadCloudChanges(
  uid: string,
  cursors: CloudSyncCursors,
): Promise<CloudDownloadResult> {
  return (await syncModule()).downloadCloudChanges(uid, cursors);
}

export async function uploadCloudChanges(uid: string, changes: CloudSyncBatch) {
  return (await syncModule()).uploadCloudChanges(uid, changes);
}

export async function syncCloudPreferences(uid: string): Promise<SyncedPreferences> {
  return (await preferencesModule()).syncCloudPreferences(uid);
}
