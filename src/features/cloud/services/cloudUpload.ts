import {
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import type { CloudSyncBatch } from "../types";
import { requireFirestore } from "./firebaseClient";

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
    ...changes.training_progress.map((change) => ({
      reference: doc(db, "users", uid, "trainingProgress", change.document_id),
      value: change.deleted
        ? { deleted: true, schemaVersion: 2, updatedAt: serverTimestamp() }
        : { ...change.data, deleted: false, schemaVersion: 2, updatedAt: serverTimestamp() },
    })),
    ...changes.engine_analyses.map((change) => ({
      reference: doc(db, "users", uid, "engineAnalyses", change.document_id),
      value: change.deleted
        ? { deleted: true, schemaVersion: 1, updatedAt: serverTimestamp() }
        : { ...change.data, deleted: false, schemaVersion: 1, updatedAt: serverTimestamp() },
    })),
    ...changes.analysis_manifests.map((change) => ({
      reference: doc(db, "users", uid, "analysisManifests", change.document_id),
      value: change.deleted
        ? { deleted: true, schemaVersion: 1, updatedAt: serverTimestamp() }
        : { ...change.data, deleted: false, schemaVersion: 1, updatedAt: serverTimestamp() },
    })),
    ...changes.training_attempts.map((change) => ({
      reference: doc(db, "users", uid, "trainingAttempts", change.document_id),
      value: change.deleted
        ? { deleted: true, schemaVersion: 1, updatedAt: serverTimestamp() }
        : { ...change.data, deleted: false, schemaVersion: 1, updatedAt: serverTimestamp() },
    })),
    ...changes.ai_explanations.map((change) => ({
      reference: doc(db, "users", uid, "aiExplanations", change.document_id),
      value: change.deleted
        ? { deleted: true, schemaVersion: 1, updatedAt: serverTimestamp() }
        : { ...change.data, deleted: false, schemaVersion: 1, updatedAt: serverTimestamp() },
    })),
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
