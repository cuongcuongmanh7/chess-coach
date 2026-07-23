export {
  firebaseConfigured,
  firebaseErrorMessage,
  observeFirebaseUser,
  signInWithGoogle,
  signOutFirebase,
  type User,
} from "./features/cloud/services/auth";
export {
  downloadCloudChanges,
  uploadCloudChanges,
} from "./features/cloud/services/cloudSync";
export type {
  CloudDownloadResult,
  CloudPendingGameChange,
  CloudPendingProfileChange,
  CloudPlayerProfile,
  CloudRemoteGameChange,
  CloudRemoteProfileChange,
  CloudSavedGame,
  CloudSyncBatch,
  CloudSyncCursor,
  CloudSyncCursors,
} from "./features/cloud/types";
