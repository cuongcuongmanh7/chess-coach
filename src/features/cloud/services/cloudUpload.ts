import {
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import type { CloudSyncBatch } from "../types";
import { requireFirestore } from "./firebaseClient";

type PendingChange = {
  document_id: string;
  deleted: boolean;
  data: unknown;
};

function collectionWrites(
  db: Firestore,
  uid: string,
  collectionName: string,
  changes: PendingChange[],
  schemaVersion: number,
) {
  return changes.map((change) => ({
    reference: doc(db, "users", uid, collectionName, change.document_id),
    value: change.deleted
      ? { deleted: true, schemaVersion, updatedAt: serverTimestamp() }
      : {
        ...(change.data as Record<string, unknown>),
        deleted: false,
        schemaVersion,
        updatedAt: serverTimestamp(),
      },
  }));
}

export async function uploadCloudChanges(uid: string, changes: CloudSyncBatch) {
  const db = requireFirestore();
  // Thứ tự quan trọng: repertoires trước nodes trước progress. uploadCloudChanges
  // commit nhiều batch, nên nếu một batch giữa thất bại thì máy khác vẫn nhận được
  // phần cha chứ không nhận node/progress mồ côi.
  const writes = [
    ...collectionWrites(db, uid, "profiles", changes.profiles, 2),
    ...collectionWrites(db, uid, "games", changes.games, 2),
    ...collectionWrites(db, uid, "trainingProgress", changes.training_progress, 2),
    ...collectionWrites(db, uid, "engineAnalyses", changes.engine_analyses, 1),
    ...collectionWrites(db, uid, "analysisManifests", changes.analysis_manifests, 1),
    ...collectionWrites(db, uid, "trainingAttempts", changes.training_attempts, 1),
    ...collectionWrites(db, uid, "aiExplanations", changes.ai_explanations, 1),
    ...collectionWrites(db, uid, "repertoires", changes.repertoires, 1),
    ...collectionWrites(db, uid, "repertoireNodes", changes.repertoire_nodes, 1),
    ...collectionWrites(db, uid, "repertoireProgress", changes.repertoire_progress, 1),
  ];

  let batch = writeBatch(db);
  let batchCount = 0;
  let estimatedBatchBytes = 0;
  for (const { reference, value } of writes) {
    const estimatedBytes = JSON.stringify(value).length;
    if (estimatedBytes > 900_000) {
      throw new Error("Một mục đồng bộ vượt quá giới hạn kích thước an toàn của Firestore.");
    }
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
    schemaVersion: 3,
    profileCount: deleteField(),
    gameCount: deleteField(),
    lastSyncAt: serverTimestamp(),
  }, { merge: true });
}
