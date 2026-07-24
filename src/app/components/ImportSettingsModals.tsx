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
  CloudOff,
  Database,
  Download,
  Dumbbell,
  Cpu,
  Eye,
  Lightbulb,
  LogIn,
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
import { useAppControllerContext } from "../AppControllerContext";
import { DEMO_PGN } from "../../demo";
import { firebaseConfigured } from "../../firebase";
import type { AutoExplainMode } from "../types";
import type { AiProvider } from "../../shared/types/tauri";

export function ImportSettingsModals() {
  const {
    importOpen,
    setImportOpen,
    setProfilesOpen,
    settingsOpen,
    setSettingsOpen,
    sfxEnabled,
    firebaseUser,
    input,
    setInput,
    error,
    setError,
    loading,
    profiles,
    activeProfileId,
    importMode,
    setImportMode,
    syncTimeClass,
    setSyncTimeClass,
    syncStatus,
    syncProgress,
    hasApiKeys,
    apiKeyInput,
    setApiKeyInput,
    settingsError,
    provider,
    model,
    autoExplainMode,
    setAutoExplainMode,
    hasApiKey,
    providerLabel,
    models,
    activeProfile,
    accountInitial,
    toggleSfx,
    changeActiveProfile,
    loadAnalysis,
    handleImport,
    syncRecentGames,
    saveApiSettings,
    clearApiKey,
    clearSavedExplanations,
    changeProvider,
    changeModel,
  } = useAppControllerContext();
  return (
    <>
      {importOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setImportOpen(false)}>
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setImportOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="modal-icon">{importMode === "single" ? <ClipboardPaste size={24} /> : <Download size={24} />}</div>
            <div className="eyebrow">BẮT ĐẦU PHÂN TÍCH</div>
            <h2 id="import-title">Nạp ván cờ</h2>
            <div className="import-tabs" role="tablist" aria-label="Cách nạp ván">
              <button className={importMode === "single" ? "active" : ""} onClick={() => { setImportMode("single"); setError(""); }}><ClipboardPaste size={14} /> Một ván</button>
              <button className={importMode === "sync" ? "active" : ""} onClick={() => { setImportMode("sync"); setError(""); }}><Download size={14} /> Đồng bộ gần đây</button>
            </div>

            {importMode === "single" ? (
              <>
                <p>Dán toàn bộ PGN hoặc link ván đấu đã kết thúc trên Chess.com.</p>
                <div className="input-labels"><span><ClipboardPaste size={14} /> PGN</span><span><Link2 size={14} /> Chess.com</span></div>
                <textarea autoFocus value={input} onChange={(event) => setInput(event.target.value)} placeholder={'[Event "Live Chess"]\n[White "Tên người chơi"]\n\n1. e4 e5 2. Nf3...\n\nhoặc https://www.chess.com/game/live/...'} />
              </>
            ) : (
              <div className="sync-form">
                <p>Tải 20 ván cờ tiêu chuẩn gần nhất từ hồ sơ công khai. Ván trùng sẽ tự động được bỏ qua.</p>
                <label className="field-label" htmlFor="sync-profile">Hồ sơ cần đồng bộ</label>
                <div className="sync-profile-row">
                  <select id="sync-profile" value={activeProfileId || ""} onChange={(event) => changeActiveProfile(Number(event.target.value))}>
                    {profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.platform === "chesscom" ? "Chess.com" : "Lichess"} · {profile.username}</option>)}
                  </select>
                  <button className="ghost-button" onClick={() => { setImportOpen(false); setProfilesOpen(true); }}><UserPlus size={14} /> Quản lý</button>
                </div>
                <label className="field-label" htmlFor="sync-time-class">Thể loại</label>
                <select id="sync-time-class" value={syncTimeClass} onChange={(event) => setSyncTimeClass(event.target.value)}>
                  <option value="all">Tất cả thể loại</option>
                  <option value="bullet">Bullet</option>
                  <option value="blitz">Blitz</option>
                  <option value="rapid">Rapid</option>
                  <option value="classical">Classical</option>
                </select>
                {syncProgress && (
                  <div className="sync-progress" role="status" aria-live="polite">
                    <div className="sync-progress-icon"><LoaderCircle size={20} /></div>
                    <div className="sync-progress-copy">
                      <strong>{syncProgress.phase === "fetching" ? "Đang tải danh sách ván…" : `Đang lưu ${syncProgress.completed}/${syncProgress.total} ván`}</strong>
                      <span>{syncProgress.phase === "fetching" ? `Đang tìm tối đa ${syncProgress.total} ván mới nhất` : "Đang nhận diện khai cuộc và sắp xếp theo thời gian thi đấu"}</span>
                      <i><b style={{ width: `${syncProgress.phase === "fetching" ? 12 : (syncProgress.completed / Math.max(1, syncProgress.total)) * 100}%` }} /></i>
                    </div>
                  </div>
                )}
                {syncStatus && <div className="sync-success">{syncStatus}</div>}
              </div>
            )}
            {error && <div className="error-message">{error}</div>}
            <div className="modal-note">PGN và kết quả Stockfish được lưu cục bộ trên máy.</div>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => loadAnalysis(DEMO_PGN)}>Mở ván demo</button>
              {importMode === "single" ? (
                <button className="primary-button large" onClick={handleImport} disabled={loading || !input.trim()}>{loading ? "Đang tải ván…" : "Phân tích ngay"} <ArrowRight size={17} /></button>
              ) : (
                <button className="primary-button large" onClick={() => void syncRecentGames()} disabled={loading || !activeProfile}>{syncProgress?.phase === "saving" ? `Đang lưu ${syncProgress.completed}/${syncProgress.total}` : loading ? "Đang đồng bộ…" : "Đồng bộ 20 ván"} {loading ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}</button>
              )}
            </div>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="modal-card settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSettingsOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="modal-icon"><Settings size={24} /></div>
            <div className="eyebrow">OPENAI · GEMINI · CACHE CỤC BỘ</div>
            <h2 id="settings-title">Cấu hình HLV AI</h2>
            <p>Chọn dịch vụ AI và cách app tự giải thích. Kết quả được lưu trên máy để lần sau hiện ngay, không gọi API lại.</p>

            <label className="field-label">Nhà cung cấp</label>
            <div className="provider-switch" role="group" aria-label="Nhà cung cấp AI">
              {(["gemini", "openai"] as AiProvider[]).map((item) => (
                <button key={item} className={provider === item ? "active" : ""} onClick={() => changeProvider(item)}>
                  <BrandIcon brand={item} size={15} /> {PROVIDER_LABELS[item]}
                  {hasApiKeys[item] && <span className="provider-ready">Sẵn sàng</span>}
                </button>
              ))}
            </div>

            <label className="field-label" htmlFor="model">Model</label>
            <select id="model" value={model} onChange={(event) => changeModel(event.target.value)}>
              {models.map((item) => <option value={item.value} key={item.value}>{item.label} — {item.detail}</option>)}
            </select>

            <label className="field-label" htmlFor="auto-mode">Tự động giải thích</label>
            <select id="auto-mode" value={autoExplainMode} onChange={(event) => setAutoExplainMode(event.target.value as AutoExplainMode)}>
              <option value="mistakes">Chỉ Sai lầm + Blunder — khuyên dùng</option>
              <option value="visited">Mọi nước được mở xem</option>
              <option value="off">Tắt — chỉ phân tích khi bấm nút</option>
            </select>

            <label className="field-label">Âm thanh giao diện</label>
            <div className="sfx-setting">
              <span>{sfxEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}<span><strong>{sfxEnabled ? "Đang bật SFX" : "Đã tắt SFX"}</strong><small>Chuyển nước, mở bảng, hoàn tất và báo lỗi</small></span></span>
              <button type="button" className={sfxEnabled ? "active" : ""} onClick={toggleSfx} aria-pressed={sfxEnabled}>{sfxEnabled ? "Bật" : "Tắt"}</button>
            </div>

            <label className="field-label" htmlFor="api-key">{providerLabel} API key</label>
            <div className="key-field">
              <KeyRound size={17} />
              <input id="api-key" type="password" autoComplete="off" value={apiKeyInput} onChange={(event) => setApiKeyInput(event.target.value)} placeholder={hasApiKey ? `${providerLabel} key đã được lưu an toàn` : provider === "gemini" ? "AIza…" : "sk-…"} />
            </div>
            <div className="security-note"><ShieldCheck size={15} /> Key được lưu trong Windows Credential Manager và giữ lại khi nâng cấp ứng dụng. Có thể ưu tiên biến môi trường {provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"}. Key không được lưu trong SQLite hoặc tải lên cloud.</div>
            {settingsError && <div className="error-message">{settingsError}</div>}

            <div className="modal-actions settings-actions">
              <div className="settings-secondary-actions">
                {hasApiKey && <button className="danger-ghost" onClick={clearApiKey}><Trash2 size={15} /> Xoá key</button>}
                <button className="ghost-button" onClick={clearSavedExplanations}><Trash2 size={15} /> Xoá dữ liệu AI</button>
              </div>
              <button className="primary-button large" onClick={saveApiSettings}>Lưu cài đặt <ArrowRight size={17} /></button>
            </div>
          </section>
        </div>
      )}

      <footer>
        <span className="footer-services">
          Chess Coach v{APP_VERSION} · Stockfish 18 Lite ·
          <BrandIcon brand="openai" size={11} /> OpenAI +
          <BrandIcon brand="gemini" size={11} /> Gemini
        </span>
        {firebaseUser ? (
          <span className="footer-account-status">
            <AccountAvatar photoUrl={firebaseUser.photoURL} fallback={accountInitial} className="footer-account-avatar" />
            PGN + phân tích + lịch luyện được sao lưu · API key vẫn cục bộ
          </span>
        ) : (
          <span className="footer-account-status">
            <BrandIcon brand="google" size={13} /> PGN ở lại trên máy · Đăng nhập Google để sao lưu
          </span>
        )}
      </footer>
    </>
  );
}
