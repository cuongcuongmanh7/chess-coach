import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from "firebase/firestore";
import type {
  CloudDownloadResult,
  CloudAiExplanation,
  CloudAnalysisManifest,
  CloudEngineAnalysis,
  CloudPlayerProfile,
  CloudSavedGame,
  CloudTrainingAttempt,
  CloudTrainingProgress,
  CloudSyncCursor,
  CloudSyncCursors,
} from "../types";
import { requireFirestore } from "./firebaseClient";
export { uploadCloudChanges } from "./cloudUpload";

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
  collectionName:
    | "profiles"
    | "games"
    | "trainingProgress"
    | "engineAnalyses"
    | "analysisManifests"
    | "trainingAttempts"
    | "aiExplanations",
  cursor: CloudSyncCursor,
  maximumDocuments: number,
  expectedSchemaVersion: number,
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
        needs_upgrade: raw.schemaVersion !== expectedSchemaVersion || !updatedAt,
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
  const [
    profiles,
    games,
    trainingProgress,
    engineAnalyses,
    analysisManifests,
    trainingAttempts,
    aiExplanations,
  ] = await Promise.all([
    downloadCollectionChanges<CloudPlayerProfile>(uid, "profiles", cursors.profiles, 1_000, 2),
    downloadCollectionChanges<CloudSavedGame>(uid, "games", cursors.games, 10_000, 2),
    downloadCollectionChanges<CloudTrainingProgress>(
      uid,
      "trainingProgress",
      cursors.training_progress,
      50_000,
      2,
    ),
    downloadCollectionChanges<CloudEngineAnalysis>(
      uid,
      "engineAnalyses",
      cursors.engine_analyses,
      500_000,
      1,
    ),
    downloadCollectionChanges<CloudAnalysisManifest>(
      uid,
      "analysisManifests",
      cursors.analysis_manifests,
      10_000,
      1,
    ),
    downloadCollectionChanges<CloudTrainingAttempt>(
      uid,
      "trainingAttempts",
      cursors.training_attempts,
      200_000,
      1,
    ),
    downloadCollectionChanges<CloudAiExplanation>(
      uid,
      "aiExplanations",
      cursors.ai_explanations,
      100_000,
      1,
    ),
  ]);
  return {
    changes: {
      profiles: profiles.changes,
      games: games.changes,
      training_progress: trainingProgress.changes,
      engine_analyses: engineAnalyses.changes,
      analysis_manifests: analysisManifests.changes,
      training_attempts: trainingAttempts.changes,
      ai_explanations: aiExplanations.changes,
    },
    cursors: {
      profiles: profiles.cursor,
      games: games.cursor,
      training_progress: trainingProgress.cursor,
      engine_analyses: engineAnalyses.cursor,
      analysis_manifests: analysisManifests.cursor,
      training_attempts: trainingAttempts.cursor,
      ai_explanations: aiExplanations.cursor,
    },
  };
}
