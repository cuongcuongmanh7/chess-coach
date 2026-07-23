export {
  firebaseConfigured,
  firebaseErrorMessage,
  cancelGoogleSignIn,
  isGoogleSignInCancelled,
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
  CloudTrainingProgress,
  CloudPendingTrainingProgressChange,
  CloudRemoteTrainingProgressChange,
} from "./features/cloud/types";
