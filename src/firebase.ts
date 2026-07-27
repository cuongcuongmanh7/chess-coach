// Cửa vào duy nhất của feature cloud cho phần còn lại của app.
//
// Chỉ re-export từ các module KHÔNG import firebase (`firebaseConfig`,
// `firebaseErrors`) và từ lớp lazy (`lazyCloud`). Không được re-export trực tiếp
// `auth`/`cloudSync`/`cloudPreferences` ở đây, vì làm vậy sẽ kéo SDK firebase trở
// lại chunk khởi động.
export { firebaseConfigured } from "./features/cloud/services/firebaseConfig";
export {
  firebaseErrorMessage,
  isGoogleSignInCancelled,
} from "./features/cloud/services/firebaseErrors";
export {
  cancelGoogleSignIn,
  downloadCloudChanges,
  observeFirebaseUser,
  signInWithGoogle,
  signOutFirebase,
  syncCloudPreferences,
  uploadCloudChanges,
  type User,
} from "./features/cloud/services/lazyCloud";
export type {
  CloudDownloadResult,
  CloudAiExplanation,
  CloudAnalysisManifest,
  CloudEngineAnalysis,
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
  CloudTrainingAttempt,
  CloudPendingTrainingProgressChange,
  CloudRemoteTrainingProgressChange,
} from "./features/cloud/types";
