import { useCallback } from "react";
import { analyzePgn } from "../../analysis";
import { DEMO_PGN } from "../../demo";
import {
  downloadCloudChanges,
  firebaseErrorMessage,
  signInWithGoogle,
  signOutFirebase,
  uploadCloudChanges,
  type User as FirebaseUser,
} from "../../firebase";
import { cloudAckTokens } from "../../features/cloud/utils";
import { localCloudRepository } from "../../features/cloud/services/localCloudRepository";
import { gameRepository } from "../../features/library/services/gameRepository";
import { profileRepository } from "../../features/profiles/services/profileRepository";
import { isTauri } from "../../shared/services/tauriClient";
import type { CloudAckToken, CloudMergeResult } from "../../shared/types/tauri";
import type { AppState } from "./useAppState";

export function useCloudController(state: AppState, accountSwitchBusy: boolean) {
  const {
    setAnalysis,
    setCurrentIndex,
    setAccountOpen,
    firebaseUser,
    setFirebaseUser,
    authLoading,
    setAuthLoading,
    setCloudSyncing,
    setLastCloudSyncAt,
    setCurrentGameId,
    error,
    setSavedGames,
    setLibraryLoading,
    setLibraryError,
    setDashboardRecords,
    profiles,
    setProfiles,
    setProfilesLoading,
    setProfilesError,
    activeProfileId,
    setActiveProfileId,
    setSyncNotice,
    setEngineCache,
    setFullAnalysis,
    setGameCoachSummary,
    setAiCache,
    fullAnalysisAbortRef,
    cloudSyncInFlightRef,
    cloudSyncPendingRef,
    cloudRetryTimerRef,
    cloudRetryAttemptRef,
    cloudRetryHandlerRef,
    cloudSyncedUserRef,
    activeProfileStorageKeyRef,
  } = state;
  const refreshProfiles = useCallback(async (preferredId?: number) => {
    if (!isTauri()) return;
    setProfilesLoading(true);
    setProfilesError("");
    try {
      const nextProfiles = await profileRepository.list();
      setProfiles(nextProfiles);
      setActiveProfileId((current) => {
        const savedId = Number(localStorage.getItem(activeProfileStorageKeyRef.current));
        const candidate = preferredId || current || savedId;
        const nextId = nextProfiles.some((profile) => profile.id === candidate)
          ? candidate
          : nextProfiles[0]?.id || null;
        if (nextId) localStorage.setItem(activeProfileStorageKeyRef.current, String(nextId));
        return nextId;
      });
    } catch (reason) {
      setProfilesError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setProfilesLoading(false);
    }
  }, []);

  const refreshSavedGames = useCallback(async () => {
    if (!isTauri()) return;
    setLibraryLoading(true);
    setLibraryError("");
    try {
      setSavedGames(await gameRepository.list(activeProfileId));
    } catch (reason) {
      setLibraryError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLibraryLoading(false);
    }
  }, [activeProfileId]);

  const resetForDatabaseSwitch = useCallback(() => {
    fullAnalysisAbortRef.current?.abort();
    fullAnalysisAbortRef.current = null;
    setAnalysis(analyzePgn(DEMO_PGN));
    setCurrentIndex(7);
    setCurrentGameId(null);
    setProfiles([]);
    setSavedGames([]);
    setDashboardRecords([]);
    setActiveProfileId(null);
    setEngineCache({});
    setAiCache({});
    setGameCoachSummary(null);
    setFullAnalysis({ running: false, complete: false, completed: 0, total: 0, error: "" });
  }, []);

  const syncCloud = useCallback(async (
    targetUser: FirebaseUser | null = firebaseUser,
    showSuccess = true,
  ) => {
    if (!targetUser) return;
    if (cloudSyncInFlightRef.current) {
      cloudSyncPendingRef.current = true;
      return;
    }
    if (!isTauri()) {
      setSyncNotice({ type: "error", message: "Đồng bộ cloud cần chạy trong ứng dụng desktop." });
      return;
    }
    if (cloudRetryTimerRef.current !== null) {
      window.clearTimeout(cloudRetryTimerRef.current);
      cloudRetryTimerRef.current = null;
    }
    cloudSyncInFlightRef.current = true;
    setCloudSyncing(true);
    let activeTokens: CloudAckToken[] = [];
    let activeRetryAttempt = 0;
    let uploaded = 0;
    const mergedTotal: CloudMergeResult = {
      profiles_added: 0,
      games_added: 0,
      profiles_deleted: 0,
      games_deleted: 0,
    };
    try {
      let rounds = 0;
      do {
        cloudSyncPendingRef.current = false;
        const activation = await localCloudRepository.activate(targetUser.uid);
        if (activation.changed) {
          activeProfileStorageKeyRef.current = `kypho-active-profile-id:${targetUser.uid}`;
          resetForDatabaseSwitch();
        }
        const cursors = await localCloudRepository.cursors(targetUser.uid);
        const remote = await downloadCloudChanges(targetUser.uid, cursors);
        const merged = await localCloudRepository.merge(remote.changes);
        mergedTotal.profiles_added += merged.profiles_added;
        mergedTotal.games_added += merged.games_added;
        mergedTotal.profiles_deleted += merged.profiles_deleted;
        mergedTotal.games_deleted += merged.games_deleted;
        await localCloudRepository.setCursors(targetUser.uid, remote.cursors);

        const localChanges = await localCloudRepository.exportChanges();
        activeTokens = cloudAckTokens(localChanges);
        activeRetryAttempt = Math.max(
          0,
          ...localChanges.profiles.map((change) => change.attempts),
          ...localChanges.games.map((change) => change.attempts),
        );
        if (activeTokens.length) {
          await uploadCloudChanges(targetUser.uid, localChanges);
          uploaded += activeTokens.length;
          const remaining = await localCloudRepository.acknowledge(activeTokens);
          activeTokens = [];
          if (remaining > 0) cloudSyncPendingRef.current = true;
        }
        rounds += 1;
      } while (cloudSyncPendingRef.current && rounds < 4);

      cloudRetryAttemptRef.current = 0;
      const completedAt = new Date().toISOString();
      localStorage.setItem(`kypho-cloud-last-sync:${targetUser.uid}`, completedAt);
      setLastCloudSyncAt(completedAt);
      await Promise.all([refreshProfiles(), refreshSavedGames()]);
      if (showSuccess) {
        const imported = mergedTotal.profiles_added + mergedTotal.games_added;
        const deleted = mergedTotal.profiles_deleted + mergedTotal.games_deleted;
        setSyncNotice({
          type: "success",
          message: imported || deleted || uploaded
            ? `Cloud đã cập nhật: nhận ${imported} mục mới, áp dụng ${deleted} mục đã xoá và gửi ${uploaded} thay đổi local.`
            : "Dữ liệu trên máy và Firebase đã đồng bộ.",
        });
      }
    } catch (reason) {
      const message = firebaseErrorMessage(reason);
      if (activeTokens.length) {
        await localCloudRepository.markFailed(activeTokens, message).catch(() => undefined);
      }
      cloudRetryAttemptRef.current = Math.max(
        cloudRetryAttemptRef.current,
        activeRetryAttempt,
      ) + 1;
      const retryDelays = [2_000, 5_000, 15_000, 60_000, 300_000];
      const retryDelay = retryDelays[Math.min(
        cloudRetryAttemptRef.current - 1,
        retryDelays.length - 1,
      )];
      cloudRetryTimerRef.current = window.setTimeout(() => {
        cloudRetryTimerRef.current = null;
        cloudRetryHandlerRef.current();
      }, retryDelay);
      setSyncNotice({
        type: "error",
        message: `${message} Ứng dụng sẽ tự thử lại.`,
      });
    } finally {
      cloudSyncInFlightRef.current = false;
      setCloudSyncing(false);
      if (cloudSyncPendingRef.current && cloudRetryTimerRef.current === null) {
        window.setTimeout(() => cloudRetryHandlerRef.current(), 0);
      }
    }
  }, [firebaseUser, refreshProfiles, refreshSavedGames, resetForDatabaseSwitch]);

  cloudRetryHandlerRef.current = () => {
    if (firebaseUser) void syncCloud(firebaseUser, false);
  };

  const handleGoogleLogin = async () => {
    if (authLoading || accountSwitchBusy) {
      if (accountSwitchBusy) {
        setSyncNotice({ type: "info", message: "Hãy chờ phân tích hiện tại hoàn tất trước khi đổi kho tài khoản." });
      }
      return;
    }
    setAuthLoading(true);
    setSyncNotice(null);
    try {
      const user = await signInWithGoogle();
      cloudSyncedUserRef.current = user.uid;
      setFirebaseUser(user);
      setAccountOpen(true);
      await syncCloud(user, true);
    } catch (reason) {
      setSyncNotice({ type: "error", message: firebaseErrorMessage(reason) });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogout = async () => {
    if (accountSwitchBusy) {
      setSyncNotice({ type: "info", message: "Hãy chờ phân tích hiện tại hoàn tất trước khi đăng xuất." });
      return;
    }
    try {
      await signOutFirebase();
      await localCloudRepository.deactivate();
      activeProfileStorageKeyRef.current = "kypho-active-profile-id:guest";
      if (cloudRetryTimerRef.current !== null) {
        window.clearTimeout(cloudRetryTimerRef.current);
        cloudRetryTimerRef.current = null;
      }
      cloudSyncPendingRef.current = false;
      cloudRetryAttemptRef.current = 0;
      cloudSyncedUserRef.current = null;
      setFirebaseUser(null);
      setLastCloudSyncAt(null);
      resetForDatabaseSwitch();
      await refreshProfiles();
      setSyncNotice({ type: "info", message: "Đã đăng xuất. Kho tài khoản được giữ riêng và app đã quay về dữ liệu local." });
    } catch (reason) {
      setSyncNotice({ type: "error", message: firebaseErrorMessage(reason) });
    }
  };


  return {
    refreshProfiles,
    refreshSavedGames,
    resetForDatabaseSwitch,
    syncCloud,
    handleGoogleLogin,
    handleGoogleLogout,
  };
}
