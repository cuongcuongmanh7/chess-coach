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
  deleteField,
  doc,
  documentId,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
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

export type CloudRemoteProfileChange = {
  document_id: string;
  deleted: boolean;
  needs_upgrade: boolean;
  data: CloudPlayerProfile | null;
};

export type CloudRemoteGameChange = {
  document_id: string;
  deleted: boolean;
  needs_upgrade: boolean;
  data: CloudSavedGame | null;
};

export type CloudPendingProfileChange = {
  document_id: string;
  generation: number;
  attempts: number;
  deleted: boolean;
  data: CloudPlayerProfile | null;
};

export type CloudPendingGameChange = {
  document_id: string;
  generation: number;
  attempts: number;
  deleted: boolean;
  data: CloudSavedGame | null;
};

export type CloudSyncBatch = {
  profiles: CloudPendingProfileChange[];
  games: CloudPendingGameChange[];
};

export type CloudSyncCursor = {
  initialized: boolean;
  updated_at_seconds: number | null;
  updated_at_nanoseconds: number | null;
  document_id: string | null;
};

export type CloudSyncCursors = {
  profiles: CloudSyncCursor;
  games: CloudSyncCursor;
};

export type CloudDownloadResult = {
  changes: {
    profiles: CloudRemoteProfileChange[];
    games: CloudRemoteGameChange[];
  };
  cursors: CloudSyncCursors;
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

function cursorTimestamp(cursor: CloudSyncCursor) {
  if (
    cursor.updated_at_seconds === null
    || cursor.updated_at_nanoseconds === null
    || !cursor.document_id
  ) return null;
  return new Timestamp(cursor.updated_at_seconds, cursor.updated_at_nanoseconds);
}

function laterCursor(
  current: CloudSyncCursor,
  timestamp: Timestamp,
  documentIdValue: string,
): CloudSyncCursor {
  const currentTimestamp = cursorTimestamp(current);
  if (
    currentTimestamp
    && (
      timestamp.seconds < currentTimestamp.seconds
      || (
        timestamp.seconds === currentTimestamp.seconds
        && timestamp.nanoseconds < currentTimestamp.nanoseconds
      )
      || (
        timestamp.seconds === currentTimestamp.seconds
        && timestamp.nanoseconds === currentTimestamp.nanoseconds
        && documentIdValue <= (current.document_id || "")
      )
    )
  ) return current;
  return {
    initialized: true,
    updated_at_seconds: timestamp.seconds,
    updated_at_nanoseconds: timestamp.nanoseconds,
    document_id: documentIdValue,
  };
}

async function downloadCollectionChanges<T>(
  uid: string,
  collectionName: "profiles" | "games",
  cursor: CloudSyncCursor,
  maximumDocuments: number,
) {
  const db = requireFirestore();
  const reference = collection(db, "users", uid, collectionName);
  const incrementalTimestamp = cursorTimestamp(cursor);
  let pageCursor = cursor;
  let initialPageAfter: string | null = null;
  const changes: Array<{
    document_id: string;
    deleted: boolean;
    needs_upgrade: boolean;
    data: T | null;
  }> = [];

  while (true) {
    const pageQuery: Query<DocumentData> = incrementalTimestamp
      ? query(
        reference,
        orderBy("updatedAt"),
        orderBy(documentId()),
        startAfter(
          new Timestamp(
            pageCursor.updated_at_seconds!,
            pageCursor.updated_at_nanoseconds!,
          ),
          pageCursor.document_id,
        ),
        limit(250),
      )
      : query(
        reference,
        orderBy(documentId()),
        ...(initialPageAfter ? [startAfter(initialPageAfter)] : []),
        limit(250),
      );
    const page: QuerySnapshot<DocumentData> = await getDocs(pageQuery);
    for (const item of page.docs) {
      const raw = item.data();
      const updatedAt = raw.updatedAt instanceof Timestamp ? raw.updatedAt : null;
      const deleted = raw.deleted === true;
      const {
        deleted: _deleted,
        schemaVersion: _schemaVersion,
        updatedAt: _updatedAt,
        ...payload
      } = raw;
      changes.push({
        document_id: item.id,
        deleted,
        needs_upgrade: raw.schemaVersion !== 2 || !updatedAt,
        data: deleted ? null : payload as T,
      });
      if (updatedAt) pageCursor = laterCursor(pageCursor, updatedAt, item.id);
    }
    if (changes.length > maximumDocuments) {
      throw new Error(`Dữ liệu ${collectionName} trên cloud vượt quá giới hạn an toàn.`);
    }
    if (page.size < 250) break;
    const last: QueryDocumentSnapshot<DocumentData> = page.docs[page.docs.length - 1];
    if (incrementalTimestamp) {
      const updatedAt = last.data().updatedAt;
      if (!(updatedAt instanceof Timestamp)) {
        throw new Error(`Mốc đồng bộ ${collectionName} trên cloud không hợp lệ.`);
      }
      pageCursor = laterCursor(pageCursor, updatedAt, last.id);
    } else {
      initialPageAfter = last.id;
    }
  }

  return {
    changes,
    cursor: {
      ...pageCursor,
      initialized: true,
    },
  };
}

export async function downloadCloudChanges(
  uid: string,
  cursors: CloudSyncCursors,
): Promise<CloudDownloadResult> {
  const [profiles, games] = await Promise.all([
    downloadCollectionChanges<CloudPlayerProfile>(uid, "profiles", cursors.profiles, 1_000),
    downloadCollectionChanges<CloudSavedGame>(uid, "games", cursors.games, 10_000),
  ]);
  return {
    changes: {
      profiles: profiles.changes,
      games: games.changes,
    },
    cursors: {
      profiles: profiles.cursor,
      games: games.cursor,
    },
  };
}

export async function uploadCloudChanges(uid: string, changes: CloudSyncBatch) {
  const db = requireFirestore();
  const writes = [
    ...changes.profiles.map((change) => ({
      reference: doc(db, "users", uid, "profiles", change.document_id),
      value: change.deleted
        ? { deleted: true, schemaVersion: 2, updatedAt: serverTimestamp() }
        : { ...change.data, deleted: false, schemaVersion: 2, updatedAt: serverTimestamp() },
    })),
    ...changes.games.map((change) => ({
      reference: doc(db, "users", uid, "games", change.document_id),
      value: change.deleted
        ? { deleted: true, schemaVersion: 2, updatedAt: serverTimestamp() }
        : { ...change.data, deleted: false, schemaVersion: 2, updatedAt: serverTimestamp() },
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
    batch.set(reference, value);
    batchCount += 1;
    estimatedBatchBytes += estimatedBytes;
  }
  if (batchCount) await batch.commit();

  await setDoc(doc(db, "users", uid), {
    schemaVersion: 2,
    profileCount: deleteField(),
    gameCount: deleteField(),
    lastSyncAt: serverTimestamp(),
  }, { merge: true });
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
