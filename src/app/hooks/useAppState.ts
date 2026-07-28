import { useRef, useState } from "react";
import { analyzePgn, type GameAnalysis } from "../../analysis";
import type { DashboardMoveRecord } from "../../dashboard";
import { DEMO_PGN } from "../../demo";
import {
  sfxEnabled as storedSfxEnabled,
} from "../../sfx";
import type { EngineMoveAnalysis } from "../../stockfish";
import type { User as FirebaseUser } from "../../firebase";
import { DEFAULT_MODELS } from "../constants";
import type {
  AutoExplainMode,
  BatchAnalysisState,
  FullAnalysisState,
  RetryState,
  SyncNotice,
  SyncProgress,
  VariationState,
} from "../types";
import type {
  AiExplanation,
  AiProvider,
  PlayerProfile,
  SavedGameSummary,
  SyncPlatform,
} from "../../shared/types/tauri";

const emptyFullAnalysis: FullAnalysisState = {
  running: false,
  complete: false,
  completed: 0,
  total: 0,
  error: "",
};

const emptyBatchAnalysis: BatchAnalysisState = {
  running: false,
  paused: false,
  finished: false,
  total: 0,
  done: 0,
  failed: 0,
  currentGameId: null,
  currentLabel: "",
  currentPly: 0,
  currentPlyTotal: 0,
};

export function useAppState() {
  const [analysis, setAnalysis] = useState<GameAnalysis>(() => analyzePgn(DEMO_PGN));
  const [workspaceMode, setWorkspaceMode] = useState<"booting" | "empty" | "analysis">("booting");
  const [currentIndex, setCurrentIndex] = useState(7);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [importOpen, setImportOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("kypho-sidebar-collapsed") === "true",
  );
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(storedSfxEnabled);
  const [accountOpen, setAccountOpen] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [startupDataReady, setStartupDataReady] = useState(false);
  const [googleLoginPending, setGoogleLoginPending] = useState(false);
  const [cloudSyncing, setCloudSyncing] = useState(false);
  // Đang dựng lại Mistake Lab sau đồng bộ (hiển thị dòng trạng thái riêng).
  const [cloudRebuilding, setCloudRebuilding] = useState(false);
  // Khoá thao tác + không cho đóng modal tài khoản trong lúc đăng nhập → đồng bộ
  // → dựng lại thẻ, tránh người dùng sửa dữ liệu giữa chừng.
  const [accountSyncLocked, setAccountSyncLocked] = useState(false);
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<string | null>(null);
  // Số thay đổi local còn chờ đẩy lên cloud; 0 nghĩa là đã an toàn để đổi máy.
  const [pendingCloudChanges, setPendingCloudChanges] = useState(0);
  const [currentGameId, setCurrentGameId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savedGames, setSavedGames] = useState<SavedGameSummary[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [dashboardRecords, setDashboardRecords] = useState<DashboardMoveRecord[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);
  const [profilesInitialized, setProfilesInitialized] = useState(false);
  const [profilesError, setProfilesError] = useState("");
  const [activeCloudDatabaseUid, setActiveCloudDatabaseUid] = useState<string | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<number | null>(null);
  const [newProfilePlatform, setNewProfilePlatform] = useState<SyncPlatform>("chesscom");
  const [newProfileUsername, setNewProfileUsername] = useState("");
  const [importMode, setImportMode] = useState<"single" | "sync">("single");
  const [syncTimeClass, setSyncTimeClass] = useState("all");
  const [syncMode, setSyncMode] = useState<"incremental" | "count">("incremental");
  const [syncLimit, setSyncLimit] = useState(50);
  const [syncStatus, setSyncStatus] = useState("");
  const [syncNotice, setSyncNotice] = useState<SyncNotice | null>(null);
  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [engineCache, setEngineCache] = useState<Record<number, EngineMoveAnalysis>>({});
  const [engineLoading, setEngineLoading] = useState(false);
  const [engineError, setEngineError] = useState("");
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const [promotionPending, setPromotionPending] = useState<{ from: string; to: string } | null>(null);
  const [variationState, setVariationState] = useState<VariationState | null>(null);
  const [variationPlaying, setVariationPlaying] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [fullAnalysis, setFullAnalysis] = useState<FullAnalysisState>(emptyFullAnalysis);
  const [batchAnalysis, setBatchAnalysis] = useState<BatchAnalysisState>(emptyBatchAnalysis);
  const [batchSheetOpen, setBatchSheetOpen] = useState(false);
  const [gameCoachSummary, setGameCoachSummary] = useState<AiExplanation | null>(null);
  const [gameCoachLoading, setGameCoachLoading] = useState(false);
  const [gameCoachError, setGameCoachError] = useState("");
  const [aiCache, setAiCache] = useState<Record<string, AiExplanation>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [hasApiKeys, setHasApiKeys] = useState<Record<AiProvider, boolean>>({
    openai: false,
    gemini: false,
  });
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [provider, setProvider] = useState<AiProvider>(
    () => localStorage.getItem("kypho-ai-provider") as AiProvider || "openai",
  );
  const [model, setModel] = useState(
    () => localStorage.getItem(`kypho-ai-model-${provider}`) || DEFAULT_MODELS[provider],
  );
  const [autoExplainMode, setAutoExplainMode] = useState<AutoExplainMode>(
    () => localStorage.getItem("kypho-ai-auto-mode") as AutoExplainMode || "mistakes",
  );
  const aiInFlightRef = useRef(false);
  const cacheLookupsRef = useRef(new Set<string>());
  const cacheMissesRef = useRef(new Set<string>());
  const autoAttemptsRef = useRef(new Set<string>());
  const fullAnalysisAbortRef = useRef<AbortController | null>(null);
  const batchAnalysisAbortRef = useRef<AbortController | null>(null);
  const batchPausedRef = useRef(false);
  const timelineScrollerRef = useRef<HTMLDivElement | null>(null);
  const coachScrollerRef = useRef<HTMLDivElement | null>(null);
  const cloudSyncInFlightRef = useRef(false);
  const cloudSyncPendingRef = useRef(false);
  const cloudRetryTimerRef = useRef<number | null>(null);
  const cloudRetryAttemptRef = useRef(0);
  const cloudRetryHandlerRef = useRef<() => void>(() => undefined);
  // Gán sau khi training controller khởi tạo; syncCloud gọi để dựng lại Mistake
  // Lab ngay sau khi hợp nhất dữ liệu cloud.
  const cloudRebuildHandlerRef = useRef<() => Promise<unknown>>(() => Promise.resolve());
  const cloudSyncedUserRef = useRef<string | null>(null);
  const activeProfileStorageKeyRef = useRef("kypho-active-profile-id:guest");
  const previousMoveIndexRef = useRef<number | null>(null);
  const modalWasOpenRef = useRef(false);
  const analysisWasCompleteRef = useRef(false);

  return {
    analysis, setAnalysis, workspaceMode, setWorkspaceMode,
    currentIndex, setCurrentIndex, orientation, setOrientation,
    importOpen, setImportOpen, libraryOpen, setLibraryOpen, sidebarCollapsed, setSidebarCollapsed,
    dashboardOpen, setDashboardOpen, profilesOpen, setProfilesOpen, settingsOpen, setSettingsOpen,
    sfxEnabled, setSfxEnabled, accountOpen, setAccountOpen, firebaseUser, setFirebaseUser,
    authLoading, setAuthLoading, startupDataReady, setStartupDataReady,
    googleLoginPending, setGoogleLoginPending,
    cloudSyncing, setCloudSyncing, cloudRebuilding, setCloudRebuilding,
    accountSyncLocked, setAccountSyncLocked,
    lastCloudSyncAt, setLastCloudSyncAt,
    pendingCloudChanges, setPendingCloudChanges,
    currentGameId, setCurrentGameId, input, setInput, error, setError, loading, setLoading,
    savedGames, setSavedGames, libraryLoading, setLibraryLoading, libraryError, setLibraryError,
    dashboardRecords, setDashboardRecords, dashboardLoading, setDashboardLoading,
    dashboardError, setDashboardError, profiles, setProfiles, profilesLoading, setProfilesLoading,
    profilesInitialized, setProfilesInitialized, profilesError, setProfilesError,
    activeCloudDatabaseUid, setActiveCloudDatabaseUid, activeProfileId, setActiveProfileId,
    newProfilePlatform, setNewProfilePlatform, newProfileUsername, setNewProfileUsername,
    importMode, setImportMode, syncTimeClass, setSyncTimeClass,
    syncMode, setSyncMode, syncLimit, setSyncLimit, syncStatus, setSyncStatus,
    syncNotice, setSyncNotice, syncProgress, setSyncProgress, engineCache, setEngineCache,
    engineLoading, setEngineLoading, engineError, setEngineError, retryState, setRetryState,
    promotionPending, setPromotionPending, variationState, setVariationState,
    variationPlaying, setVariationPlaying, summaryOpen, setSummaryOpen, fullAnalysis,
    setFullAnalysis, batchAnalysis, setBatchAnalysis, batchSheetOpen, setBatchSheetOpen,
    gameCoachSummary, setGameCoachSummary, gameCoachLoading,
    setGameCoachLoading, gameCoachError, setGameCoachError, aiCache, setAiCache,
    aiLoading, setAiLoading, aiError, setAiError, hasApiKeys, setHasApiKeys,
    apiKeyInput, setApiKeyInput, settingsError, setSettingsError, provider, setProvider,
    model, setModel, autoExplainMode, setAutoExplainMode, aiInFlightRef, cacheLookupsRef,
    cacheMissesRef, autoAttemptsRef, fullAnalysisAbortRef, batchAnalysisAbortRef,
    batchPausedRef, timelineScrollerRef,
    coachScrollerRef, cloudSyncInFlightRef, cloudSyncPendingRef, cloudRetryTimerRef,
    cloudRetryAttemptRef, cloudRetryHandlerRef, cloudRebuildHandlerRef, cloudSyncedUserRef,
    activeProfileStorageKeyRef, previousMoveIndexRef, modalWasOpenRef, analysisWasCompleteRef,
  };
}

export type AppState = ReturnType<typeof useAppState>;
