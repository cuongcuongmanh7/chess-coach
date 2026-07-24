import { Chessboard } from "react-chessboard";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  ClipboardPaste,
  Clock,
  Cloud,
  CloudOff,
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
import { isTauri } from "../../shared/services/tauriClient";
import { AccountAvatar, BrandIcon } from "../../shared/components/BrandIdentity";
import { useAppControllerContext } from "../AppControllerContext";
import { DEMO_PGN } from "../../demo";
import { firebaseConfigured } from "../../firebase";
import type { AutoExplainMode } from "../types";
import type { AiProvider } from "../../shared/types/tauri";

export function LibraryAccountModals() {
  const {
    setImportOpen,
    libraryOpen,
    setLibraryOpen,
    profilesOpen,
    setProfilesOpen,
    accountOpen,
    setAccountOpen,
    firebaseUser,
    authLoading,
    googleLoginPending,
    cloudSyncing,
    lastCloudSyncAt,
    currentGameId,
    input,
    error,
    loading,
    savedGames,
    libraryLoading,
    libraryError,
    profiles,
    profilesLoading,
    profilesError,
    activeProfileId,
    newProfilePlatform,
    setNewProfilePlatform,
    newProfileUsername,
    setNewProfileUsername,
    provider,
    activeProfile,
    activeProfileLabel,
    accountInitial,
    accountSwitchBusy,
    syncCloud,
    handleGoogleLogin,
    handleCancelGoogleLogin,
    handleGoogleLogout,
    changeActiveProfile,
    addPlayerProfile,
    removePlayerProfile,
    openStoredGame,
    removeStoredGame,
  } = useAppControllerContext();
  return (
    <>
      {libraryOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setLibraryOpen(false)}>
          <section className="modal-card library-modal" role="dialog" aria-modal="true" aria-labelledby="library-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setLibraryOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="library-heading">
              <div className="modal-icon"><Library size={24} /></div>
              <div>
                <div className="eyebrow">LƯU CỤC BỘ · KHÔNG ĐỒNG BỘ CLOUD</div>
                <h2 id="library-title">Kho ván</h2>
                <p>{savedGames.length ? `${savedGames.length} ván của ${activeProfileLabel} · mới thi đấu gần đây trước` : `Chưa có ván cho ${activeProfileLabel}.`}</p>
              </div>
            </div>
            <GameLibraryList
              games={savedGames}
              activeGameId={currentGameId}
              activeProfileUsername={activeProfile?.username}
              loading={libraryLoading}
              error={libraryError}
              variant="modal"
              onOpen={(id) => void openStoredGame(id)}
              onDelete={(game) => void removeStoredGame(game)}
            />
            <div className="modal-actions library-actions">
              <span>PGN chỉ được lưu trong database trên máy này.</span>
              <button className="primary-button" onClick={() => { setLibraryOpen(false); setImportOpen(true); }}><Upload size={15} /> Nạp ván mới</button>
            </div>
          </section>
        </div>
      )}

      {profilesOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setProfilesOpen(false)}>
          <section className="modal-card profiles-modal" role="dialog" aria-modal="true" aria-labelledby="profiles-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setProfilesOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="library-heading">
              <div className="modal-icon"><UserRound size={24} /></div>
              <div>
                <div className="eyebrow">CHESS.COM · LICHESS</div>
                <h2 id="profiles-title">Hồ sơ ván đấu</h2>
                <p>Chọn hồ sơ để lọc Kho ván, Dashboard và đồng bộ 20 ván gần nhất.</p>
              </div>
            </div>

            {profilesError && <div className="error-message">{profilesError}</div>}
            <div className="profile-list">
              {profiles.map((profile) => {
                const selected = profile.id === activeProfileId;
                return (
                  <article className={`profile-item ${selected ? "active" : ""}`} key={profile.id}>
                    <button className="profile-select" onClick={() => changeActiveProfile(profile.id)}>
                      <span className={`profile-platform ${profile.platform}`}>{profile.platform === "chesscom" ? "Chess.com" : "Lichess"}</span>
                      <strong>{profile.username}</strong>
                      <small>{profile.game_count} ván{profile.last_sync_at ? ` · Đồng bộ ${formatVietnamDate(profile.last_sync_at, true)}` : " · Chưa đồng bộ"}</small>
                      {selected && <span className="profile-active-label">Đang dùng</span>}
                    </button>
                    <button className="profile-delete" onClick={() => void removePlayerProfile(profile)} disabled={profilesLoading || profiles.length <= 1} aria-label={`Xoá hồ sơ ${profile.username}`} title={profiles.length <= 1 ? "Cần giữ lại ít nhất một hồ sơ" : "Xoá hồ sơ"}><Trash2 size={15} /></button>
                  </article>
                );
              })}
              {profilesLoading && !profiles.length && <div className="library-empty"><LoaderCircle className="spin" size={22} /> Đang đọc hồ sơ…</div>}
            </div>

            <div className="profile-add-form">
              <h3>Thêm hồ sơ</h3>
              <div className="provider-switch" role="group" aria-label="Nền tảng hồ sơ mới">
                <button className={newProfilePlatform === "chesscom" ? "active" : ""} onClick={() => setNewProfilePlatform("chesscom")}>Chess.com</button>
                <button className={newProfilePlatform === "lichess" ? "active" : ""} onClick={() => setNewProfilePlatform("lichess")}>Lichess</button>
              </div>
              <div className="profile-add-row">
                <input value={newProfileUsername} onChange={(event) => setNewProfileUsername(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void addPlayerProfile(); }} placeholder="Nhập username" aria-label="Username hồ sơ mới" />
                <button className="primary-button" onClick={() => void addPlayerProfile()} disabled={profilesLoading || !newProfileUsername.trim()}><UserPlus size={15} /> Thêm</button>
              </div>
            </div>
            <div className="modal-note">Xoá hồ sơ chỉ bỏ liên kết với tài khoản; các ván đã tải vẫn được giữ trên máy.</div>
          </section>
        </div>
      )}

      {accountOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setAccountOpen(false)}>
          <section className="modal-card account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setAccountOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="modal-icon"><Cloud size={24} /></div>
            <div className="eyebrow">GOOGLE · FIREBASE · SQLITE</div>
            <h2 id="account-title">Tài khoản & đồng bộ</h2>
            <p>Đăng nhập Google để sao lưu hồ sơ và kho ván, rồi tiếp tục trên máy khác. SQLite vẫn là bản dữ liệu offline trên máy này.</p>

            {firebaseUser ? (
              <>
                <div className="account-identity">
                  <AccountAvatar photoUrl={firebaseUser.photoURL} fallback={accountInitial} className="account-avatar" />
                  <div>
                    <strong>{firebaseUser.displayName || "Tài khoản Google"}</strong>
                    <span>{firebaseUser.email}</span>
                  </div>
                  <i><CheckCircle2 size={13} /> Đã kết nối</i>
                </div>
                <div className="cloud-summary">
                  <div><Database size={16} /><span><strong>{profiles.length} hồ sơ · {savedGames.length} ván đang hiển thị</strong><small>Dữ liệu local sẵn sàng khi offline</small></span></div>
                  <div><RefreshCw size={16} /><span><strong>{lastCloudSyncAt ? `Đồng bộ ${formatVietnamDate(lastCloudSyncAt, true)}` : "Chưa đồng bộ lần đầu"}</strong><small>Hợp nhất hai chiều, không tạo ván trùng</small></span></div>
                </div>
                <div className="security-note"><ShieldCheck size={15} /> Mỗi Firebase UID có vùng Firestore và file SQLite riêng. Kết quả Stockfish, lịch luyện và cache HLV được hợp nhất; API key AI luôn chỉ nằm trong Credential Manager của máy.</div>
                <div className="modal-actions account-actions">
                  <button className="danger-ghost" onClick={() => void handleGoogleLogout()} disabled={accountSwitchBusy}><LogOut size={15} /> Đăng xuất</button>
                  <button className="primary-button large" onClick={() => void syncCloud(firebaseUser, true)} disabled={cloudSyncing}>
                    {cloudSyncing ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}
                    {cloudSyncing ? "Đang đồng bộ…" : "Đồng bộ ngay"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="account-signin-card">
                  <div className="google-mark"><BrandIcon brand="google" size={22} /></div>
                  <div><strong>Đăng nhập bằng Google</strong><span>Firebase dùng tài khoản này để tách riêng dữ liệu của mày.</span></div>
                </div>
                {!firebaseConfigured && <div className="error-message">Bản build này chưa có Firebase Web App config. Điền các biến VITE_FIREBASE_* rồi build lại.</div>}
                <div className="security-note"><ShieldCheck size={15} /> App chỉ nhận tên, email và mã UID từ Google. Mật khẩu không đi qua Chess Coach.</div>
                <div className="modal-actions">
                  <button className="ghost-button" onClick={() => setAccountOpen(false)}>Để sau</button>
                  {googleLoginPending && isTauri() ? (
                    <button className="danger-ghost large" onClick={() => void handleCancelGoogleLogin()}>
                      <X size={16} /> Hủy đăng nhập
                    </button>
                  ) : (
                    <button className="primary-button large" onClick={() => void handleGoogleLogin()} disabled={!firebaseConfigured || authLoading || accountSwitchBusy}>
                      {authLoading ? <LoaderCircle className="spin" size={16} /> : <LogIn size={16} />}
                      {googleLoginPending ? "Đang mở Google…" : authLoading ? "Đang khởi tạo…" : "Tiếp tục với Google"}
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}
