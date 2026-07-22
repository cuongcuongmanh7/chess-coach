import { FirebaseError, initializeApp, type FirebaseApp } from "firebase/app";
import { invoke } from "@tauri-apps/api/core";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

export type CloudPlayerProfile = {
  platform: "chesscom" | "lichess";
  username: string;
  last_sync_at: string | null;
  created_at: string;
};

export type CloudSavedGame = {
  id: string;
  pgn: string;
  white: string;
  black: string;
  white_elo: string | null;
  black_elo: string | null;
  result: string | null;
  event: string | null;
  date: string | null;
  played_at: string | null;
  eco: string | null;
  opening: string | null;
  time_control: string | null;
  time_class: string | null;
  source_url: string | null;
  source_platform: "chesscom" | "lichess" | null;
  created_at: string;
  last_opened_at: string;
  profile_keys: string[];
};

export type CloudSyncSnapshot = {
  profiles: CloudPlayerProfile[];
  games: CloudSavedGame[];
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey
  && firebaseConfig.authDomain
  && firebaseConfig.projectId
  && firebaseConfig.appId,
);

let firebaseApp: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;

if (firebaseConfigured) {
  firebaseApp = initializeApp(firebaseConfig);
  auth = getAuth(firebaseApp);
  auth.useDeviceLanguage();
  firestore = getFirestore(firebaseApp);
}

function requireAuth() {
  if (!auth) throw new Error("Firebase chưa được cấu hình cho bản build này.");
  return auth;
}

function requireFirestore() {
  if (!firestore) throw new Error("Cloud Firestore chưa được cấu hình cho bản build này.");
  return firestore;
}

export function observeFirebaseUser(callback: (user: User | null) => void) {
  if (!auth) {
    callback(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  if ("__TAURI_INTERNALS__" in window) {
    const accessToken = await invoke<string>("begin_google_oauth");
    const credential = GoogleAuthProvider.credential(null, accessToken);
    return (await signInWithCredential(requireAuth(), credential)).user;
  }
  return (await signInWithPopup(requireAuth(), provider)).user;
}

export async function signOutFirebase() {
  await signOut(requireAuth());
}

export async function downloadCloudSnapshot(uid: string): Promise<CloudSyncSnapshot> {
  const db = requireFirestore();
  const [profileResult, gameResult] = await Promise.all([
    getDocs(collection(db, "users", uid, "profiles")),
    getDocs(collection(db, "users", uid, "games")),
  ]);
  return {
    profiles: profileResult.docs.map((item) => item.data() as CloudPlayerProfile),
    games: gameResult.docs.map((item) => item.data() as CloudSavedGame),
  };
}

function profileDocumentId(profile: CloudPlayerProfile) {
  return `${profile.platform}_${profile.username.toLowerCase()}`;
}

export async function uploadCloudSnapshot(uid: string, snapshot: CloudSyncSnapshot) {
  const db = requireFirestore();
  const writes = [
    ...snapshot.profiles.map((profile) => ({
      reference: doc(db, "users", uid, "profiles", profileDocumentId(profile)),
      value: profile,
    })),
    ...snapshot.games.map((game) => ({
      reference: doc(db, "users", uid, "games", game.id),
      value: game,
    })),
  ];

  let batch = writeBatch(db);
  let batchCount = 0;
  let estimatedBatchBytes = 0;
  for (const { reference, value } of writes) {
    const estimatedBytes = JSON.stringify(value).length;
    if (batchCount > 0 && (batchCount >= 400 || estimatedBatchBytes + estimatedBytes > 8_000_000)) {
      await batch.commit();
      batch = writeBatch(db);
      batchCount = 0;
      estimatedBatchBytes = 0;
    }
    batch.set(reference, value, { merge: true });
    batchCount += 1;
    estimatedBatchBytes += estimatedBytes;
  }
  if (batchCount) await batch.commit();

  await setDoc(doc(db, "users", uid), {
    schemaVersion: 1,
    profileCount: snapshot.profiles.length,
    gameCount: snapshot.games.length,
    lastSyncAt: serverTimestamp(),
  }, { merge: true });
}

export async function deleteCloudGame(uid: string, gameId: string) {
  await deleteDoc(doc(requireFirestore(), "users", uid, "games", gameId));
}

export async function deleteCloudProfile(uid: string, profile: CloudPlayerProfile) {
  await deleteDoc(doc(
    requireFirestore(),
    "users",
    uid,
    "profiles",
    profileDocumentId(profile),
  ));
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

export type { User };
