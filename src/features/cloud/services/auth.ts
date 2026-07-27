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

export async function signOutFirebase() {
  await signOut(requireAuth());
}
