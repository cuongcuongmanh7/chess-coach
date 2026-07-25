import { FirebaseError } from "firebase/app";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  firebaseConfigured,
  optionalAuth,
  requireAuth,
} from "./firebaseClient";
import { invokeCommand } from "../../../shared/services/tauriClient";
import {
  CLOUD_OWNER_ONLY_MESSAGE,
  isCloudOwner,
} from "./ownerAccess";

export { firebaseConfigured };
export type { User };

export function observeFirebaseUser(callback: (user: User | null) => void) {
  const auth = optionalAuth();
  if (!auth) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, (user) => {
    if (!user || isCloudOwner(user)) {
      callback(user);
      return;
    }
    callback(null);
    void signOut(auth).catch(() => undefined);
  });
}

async function requireCloudOwner(user: User) {
  if (isCloudOwner(user)) return user;
  await signOut(requireAuth());
  throw new Error(CLOUD_OWNER_ONLY_MESSAGE);
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  if ("__TAURI_INTERNALS__" in window) {
    const accessToken = await invokeCommand<string>("begin_google_oauth");
    const credential = GoogleAuthProvider.credential(null, accessToken);
    const user = (await signInWithCredential(requireAuth(), credential)).user;
    return requireCloudOwner(user);
  }
  const user = (await signInWithPopup(requireAuth(), provider)).user;
  return requireCloudOwner(user);
}

export async function cancelGoogleSignIn() {
  if ("__TAURI_INTERNALS__" in window) {
    await invokeCommand<void>("cancel_google_oauth");
  }
}

export function isGoogleSignInCancelled(reason: unknown) {
  return String(reason).includes("Đăng nhập đã được hủy.");
}

export async function signOutFirebase() {
  await signOut(requireAuth());
}

export function firebaseErrorMessage(reason: unknown) {
  if (!(reason instanceof FirebaseError)) {
    return reason instanceof Error ? reason.message : String(reason);
  }
  switch (reason.code) {
    case "auth/popup-closed-by-user":
      return "Cửa sổ đăng nhập đã bị đóng trước khi hoàn tất.";
    case "auth/popup-blocked":
      return "Cửa sổ Google bị chặn. Hãy cho phép popup rồi thử lại.";
    case "auth/invalid-credential":
      return "Google không chấp nhận phiên đăng nhập vừa nhận. Hãy thử đăng nhập lại.";
    case "auth/unauthorized-domain":
      return "Domain hiện tại chưa được cho phép trong Firebase Authentication.";
    case "auth/operation-not-allowed":
      return "Google Sign-In chưa được bật trong Firebase Console.";
    case "permission-denied":
      return "Tài khoản này không có quyền đọc hoặc ghi dữ liệu Firestore.";
    case "unavailable":
      return "Firebase đang mất kết nối. Dữ liệu trên máy vẫn an toàn.";
    default:
      return reason.message;
  }
}
