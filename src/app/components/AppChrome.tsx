import { Chessboard } from "react-chessboard";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  ClipboardPaste,
  Clock,
  Database,
  Download,
  Dumbbell,
  Cpu,
  Eye,
  Lightbulb,
  LogIn,
  LogOut,
  KeyRound,
  Library,
  Link2,
  ListChecks,
  LoaderCircle,
  RotateCcw,
  RefreshCw,
  Play,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TriangleAlert,
  Trash2,
  Upload,
  UserPlus,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import appIcon from "../../../src-tauri/icons/128x128.png";
import {
  APP_VERSION,
  GEMINI_MODELS,
  OPENAI_MODELS,
  PROVIDER_LABELS,
  QUALITY_LABELS,
  QUALITY_ORDER,
} from "../constants";
import { BOARD_MOVE_BADGES } from "../../features/analysis/boardUtils";
import { GameLibraryList } from "../../features/library/components/GameLibraryList";
import {
  CoachExplanation,
  GameCoachSummaryView,
} from "../../features/coach/components/CoachExplanation";
import { formatSeconds, formatVietnamDate } from "../../shared/utils/format";
import { AccountAvatar, BrandIcon } from "../../shared/components/BrandIdentity";
import { ChessTerm } from "../../shared/components/ChessTerm";
import { useAppControllerContext } from "../AppControllerContext";

export function AppChrome() {
  const {
    setImportOpen,
    setLibraryOpen,
    sidebarCollapsed,
    setProfilesOpen,
    setSettingsOpen,
    setAccountOpen,
    firebaseUser,
    authLoading,
    cloudSyncing,
    currentGameId,
    error,
    loading,
    savedGames,
    libraryLoading,
    libraryError,
    profiles,
    profilesLoading,
    activeProfileId,
    syncNotice,
    setSyncNotice,
    engine,
    hasApiKey,
    provider,
    providerLabel,
    activeProfile,
    accountInitial,
    cloudAccountLabel,
    accountSwitchBusy,
    toggleSidebar,
    refreshSavedGames,
    openDashboard,
    openTraining,
    setBatchSheetOpen,
    handleGoogleLogout,
    changeActiveProfile,
    openStoredGame,
    removeStoredGame,
    candidateState,
  } = useAppControllerContext();
  const analyzedGamesCount = savedGames.filter((game) => game.analysis_complete).length;
  return (
    <>
      {syncNotice && (
        <div className={`sync-toast ${syncNotice.type}`} role={syncNotice.type === "error" ? "alert" : "status"} aria-live="polite">
          {syncNotice.type === "error" ? <TriangleAlert size={19} /> : <CheckCircle2 size={19} />}
          <div><strong>{syncNotice.type === "error" ? "Không thể đồng bộ" : syncNotice.type === "success" ? "Đồng bộ thành công" : "Đồng bộ hoàn tất"}</strong><span>{syncNotice.message}</span></div>
          <button onClick={() => setSyncNotice(null)} aria-label="Đóng thông báo"><X size={16} /></button>
        </div>
      )}
      <aside className="app-sidebar" aria-label="Điều hướng và Kho ván" inert={candidateState.active}>
        <div className="sidebar-fixed-header">
          <div className="sidebar-brand-row">
            <div className="brand">
              <div className="brand-mark"><img src={appIcon} alt="" aria-hidden="true" /></div>
              <div className="brand-copy">
                <div className="brand-name">Chess Coach <span className="version-badge">v{APP_VERSION}</span></div>
                <div className="brand-subtitle">HLV CỜ VUA · STOCKFISH + AI</div>
              </div>
            </div>
            <button className="sidebar-collapse-button" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Mở rộng thanh bên" : "Thu gọn thanh bên"} title={sidebarCollapsed ? "Mở rộng" : "Thu gọn"}>
              {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          </div>

          <div className="sidebar-account-controls">
            <div className="sidebar-profile-switcher">
              <UserRound size={16} />
              <select
                aria-label="Hồ sơ đang dùng"
                value={activeProfileId || ""}
                onChange={(event) => changeActiveProfile(Number(event.target.value))}
                disabled={profilesLoading || !profiles.length}
              >
                {!profiles.length && <option value="">Đang tải hồ sơ…</option>}
                {profiles.map((profile) => (
                  <option value={profile.id} key={profile.id}>
                    {profile.platform === "chesscom" ? "Chess.com" : "Lichess"} · {profile.username}
                  </option>
                ))}
              </select>
              <button onClick={() => setProfilesOpen(true)} aria-label="Quản lý hồ sơ" title="Quản lý hồ sơ"><UserPlus size={16} /></button>
            </div>
          </div>
        </div>

        <button className="sidebar-library-collapsed-button" onClick={toggleSidebar} aria-label={`Mở Kho ván, ${savedGames.length} ván`} title="Mở Kho ván">
          <Library size={20} />
          {savedGames.length > 0 && <span className="library-count">{savedGames.length}</span>}
        </button>

        <section className="sidebar-library" aria-labelledby="sidebar-library-title">
          <div className="sidebar-library-heading">
            <div><span>THƯ VIỆN</span><h2 id="sidebar-library-title">Kho ván</h2></div>
            <div className="sidebar-library-heading-actions">
              <span
                className="library-count library-analyzed-count"
                title={`Đã phân tích toàn ván ${analyzedGamesCount}/${savedGames.length} ván`}
              >
                <Check size={10} strokeWidth={3} aria-hidden="true" />
                {analyzedGamesCount}/{savedGames.length}
              </span>
              <button onClick={() => void refreshSavedGames()} disabled={libraryLoading} aria-label="Làm mới Kho ván" title="Làm mới"><RefreshCw className={libraryLoading ? "spin" : ""} size={15} /></button>
            </div>
          </div>
          <GameLibraryList
            games={savedGames}
            activeGameId={currentGameId}
            activeProfileUsername={activeProfile?.username}
            loading={libraryLoading}
            error={libraryError}
            variant="sidebar"
            onOpen={(id) => void openStoredGame(id)}
            onDelete={(game) => void removeStoredGame(game)}
          />
        </section>

        <div className="sidebar-library-footer">
          <div className={`sidebar-cloud-account ${firebaseUser ? "signed-in" : ""}`}>
            <button
              className={`cloud-account-button sidebar-cloud-button ${firebaseUser ? "signed-in" : ""}`}
              onClick={() => setAccountOpen(true)}
              aria-label={firebaseUser ? `Tài khoản cloud ${cloudAccountLabel}` : "Đăng nhập Google để đồng bộ"}
              title={firebaseUser ? `Đã đăng nhập: ${cloudAccountLabel}` : "Đăng nhập Google để đồng bộ"}
            >
              {authLoading || cloudSyncing
                ? <LoaderCircle className="spin" size={16} />
                : firebaseUser ? <AccountAvatar photoUrl={firebaseUser.photoURL} fallback={accountInitial} className="cloud-avatar" /> : <BrandIcon brand="google" size={16} />}
              <span>{cloudSyncing ? "Đang đồng bộ" : cloudAccountLabel}</span>
            </button>
            {firebaseUser && (
              <button
                className="sidebar-cloud-logout"
                disabled={accountSwitchBusy}
                onClick={() => void handleGoogleLogout()}
                aria-label={`Đăng xuất ${cloudAccountLabel}`}
                title={`Đăng xuất ${cloudAccountLabel}`}
              >
                <LogOut size={15} />
              </button>
            )}
          </div>
          <button className="sidebar-settings-button" onClick={() => setSettingsOpen(true)} aria-label="Cài đặt" title="Cài đặt"><Settings size={17} /></button>
          <button className="sidebar-add-button" onClick={() => setImportOpen(true)} aria-label="Nạp ván mới" title="Nạp ván mới"><Plus size={19} /></button>
        </div>
      </aside>

      <header className="topbar" inert={candidateState.active}>
        <div className="brand mobile-brand">
          <div className="brand-mark"><img src={appIcon} alt="" aria-hidden="true" /></div>
          <div className="brand-copy">
            <div className="brand-name">Chess Coach <span className="version-badge">v{APP_VERSION}</span></div>
            <div className="brand-subtitle">HLV CỜ VUA · STOCKFISH + AI</div>
          </div>
        </div>

        <div className="top-actions">
          <button className="icon-button mobile-sidebar-action" onClick={() => setProfilesOpen(true)} aria-label="Quản lý hồ sơ"><UserRound size={17} /></button>
          <button className={`icon-button mobile-sidebar-action ${firebaseUser ? "signed-in" : ""}`} onClick={() => setAccountOpen(true)} aria-label={firebaseUser ? `Tài khoản cloud ${cloudAccountLabel}` : "Đăng nhập Google để đồng bộ"}>
            {authLoading || cloudSyncing ? <LoaderCircle className="spin" size={15} /> : firebaseUser ? <AccountAvatar photoUrl={firebaseUser.photoURL} fallback={accountInitial} className="cloud-avatar" /> : <BrandIcon brand="google" size={16} />}
          </button>
          <div className={`service-pill ${engine ? "online" : "working"}`}>
            <Cpu size={14} />
            {engine
              ? <ChessTerm term="depth">{`Stockfish d${engine.depth}`}</ChessTerm>
              : "Stockfish đang tính"}
          </div>
          <div className={`service-pill ${hasApiKey ? "online" : ""}`}>
            <BrandIcon brand={provider} size={14} /> {hasApiKey ? `${providerLabel} sẵn sàng` : `${providerLabel}: chưa có key`}
          </div>
          <button className="ghost-button dashboard-button" onClick={() => void openDashboard()}>
            <BarChart3 size={16} /> Tiến bộ
          </button>
          <button className="ghost-button dashboard-button" onClick={openTraining}>
            <Dumbbell size={16} /> Mistake Lab
          </button>
          <button className="ghost-button dashboard-button" onClick={() => setBatchSheetOpen(true)}>
            <ListChecks size={16} /> Phân tích loạt
          </button>
          <button className="ghost-button library-button mobile-library-button" onClick={() => { setLibraryOpen(true); void refreshSavedGames(); }}>
            <Library size={16} /> Kho ván {savedGames.length > 0 && <span className="library-count">{savedGames.length}</span>}
          </button>
          <button className="icon-button top-icon mobile-sidebar-action" onClick={() => setSettingsOpen(true)} aria-label="Cài đặt">
            <Settings size={17} />
          </button>
          <button className="primary-button" onClick={() => setImportOpen(true)}>
            <Upload size={16} /> Nạp ván cờ
          </button>
        </div>
      </header>
    </>
  );
}
