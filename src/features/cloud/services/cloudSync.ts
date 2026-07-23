import {
  collection,
  deleteField,
  doc,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  writeBatch,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from "firebase/firestore";
import type {
  CloudDownloadResult,
  CloudPlayerProfile,
  CloudSavedGame,
  CloudSyncBatch,
  CloudSyncCursor,
  CloudSyncCursors,
} from "../types";
import { requireFirestore } from "./firebaseClient";

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
