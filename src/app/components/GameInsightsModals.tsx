import { Chessboard } from "react-chessboard";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Bot,
  BrainCircuit,
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
import { useAppControllerContext } from "../AppControllerContext";
import { DEMO_PGN } from "../../demo";
import { firebaseConfigured } from "../../firebase";
import type { AutoExplainMode } from "../types";
import type { AiProvider } from "../../shared/types/tauri";

export function GameInsightsModals() {
  const {
    analysis,
    setCurrentIndex,
    setImportOpen,
    dashboardOpen,
    setDashboardOpen,
    error,
    dashboardLoading,
    dashboardError,
    setImportMode,
    summaryOpen,
    setSummaryOpen,
    gameCoachSummary,
    gameCoachLoading,
    gameCoachError,
    provider,
    model,
    engine,
    quality,
    headers,
    gameOpening,
    hasApiKey,
    providerLabel,
    dashboardStats,
    activeProfile,
    activeProfileLabel,
    fullGameSummary,
    gameSummaryRequest,
    summarizeGameWithAi,
  } = useAppControllerContext();
  return (
    <>
      {summaryOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSummaryOpen(false)}>
          <section className="modal-card summary-modal" role="dialog" aria-modal="true" aria-labelledby="summary-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSummaryOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="summary-heading">
              <div className="modal-icon"><BarChart3 size={24} /></div>
              <div>
                <div className="eyebrow">STOCKFISH · DEPTH 11 · TOÀN VÁN</div>
                <h2 id="summary-title">Tổng kết ván đấu</h2>
                <p>{gameOpening ? `${gameOpening.eco} · ${gameOpening.name}` : headers.ECO || "Không rõ khai cuộc"} · {analysis.steps.length} lượt</p>
              </div>
            </div>

            <div className="summary-players">
              {([
                { side: "white", label: "Trắng", name: headers.White || "Trắng", elo: headers.WhiteElo, stats: fullGameSummary.white },
                { side: "black", label: "Đen", name: headers.Black || "Đen", elo: headers.BlackElo, stats: fullGameSummary.black },
              ] as const).map((player) => (
                <article className={`summary-player ${player.side}`} key={player.side}>
                  <div className="summary-player-name"><i className={`side-badge ${player.side === "white" ? "white-side" : "black-side"}`}>{player.label}</i><strong>{player.name}</strong><span>{player.elo ? `Elo ${player.elo}` : "Elo —"}</span></div>
                  <div className="summary-metrics">
                    <div><strong>{player.stats.acpl}</strong><span>ACPL</span></div>
                    <div><strong>{player.stats.bestGoodRate}%</strong><span>Best / Tốt</span></div>
                    <div><strong>{player.stats.moves}</strong><span>Nước đã tính</span></div>
                  </div>
                  <div className="quality-counts">
                    {QUALITY_ORDER.map((item) => <span className={item} key={item}><i className={`dot ${item}`} />{QUALITY_LABELS[item]} <strong>{player.stats.counts[item]}</strong></span>)}
                  </div>
                </article>
              ))}
            </div>

            {fullGameSummary.time.available && (
              <div className="time-summary-card">
                <div><Clock size={17} /><strong>Quản lý thời gian</strong></div>
                <span><strong>{fullGameSummary.time.average}s</strong> trung bình mỗi nước</span>
                <span><strong>{fullGameSummary.time.quickErrors}</strong> lỗi khi đi ≤ 3 giây</span>
                <span><strong>{fullGameSummary.time.pressureErrors}</strong> lỗi dưới áp lực thời gian</span>
              </div>
            )}

            <div className={`game-coach-card ${gameCoachSummary ? "ready" : ""}`}>
              <div className="game-coach-heading">
                <div><BrainCircuit size={17} /><strong>Nhận xét của HLV AI</strong></div>
                {gameCoachSummary && <span>{PROVIDER_LABELS[gameCoachSummary.provider]} · {gameCoachSummary.model}{gameCoachSummary.cached ? " · Đã lưu" : ""}</span>}
              </div>
              {gameCoachSummary ? (
                <>
                  <GameCoachSummaryView text={gameCoachSummary.text} />
                  <button className="refresh-ai-button" onClick={() => void summarizeGameWithAi(true)} disabled={gameCoachLoading}>
                    {gameCoachLoading ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />} Đánh giá lại toàn ván
                  </button>
                </>
              ) : (
                <div className="game-coach-empty">
                  <p>Dựa trên ACPL, tỷ lệ nước tốt và các vị trí then chốt để nêu điểm mạnh, điểm cần cải thiện của cả hai bên.</p>
                  <button className="summary-ai-button" onClick={() => void summarizeGameWithAi(false)} disabled={gameCoachLoading || !gameSummaryRequest}>
                    {gameCoachLoading ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />}
                    {gameCoachLoading ? `${providerLabel} đang tổng kết…` : hasApiKey ? `HLV ${providerLabel} đánh giá ván đấu` : `Cấu hình ${providerLabel} để đánh giá`}
                  </button>
                </div>
              )}
              {gameCoachError && <div className="inline-error">{gameCoachError}</div>}
            </div>

            <div className="critical-section">
              <div className="critical-heading"><Target size={16} /><strong>Vị trí then chốt</strong><span>{fullGameSummary.critical.length} Mistake/Blunder</span></div>
              <div className="critical-list">
                {fullGameSummary.critical.length ? fullGameSummary.critical.map(({ item, index, engine: result }) => (
                  <button key={item.ply} onClick={() => { setCurrentIndex(index); setSummaryOpen(false); }}>
                    <span className={`critical-quality ${result?.quality}`}>{result ? QUALITY_LABELS[result.quality] : "—"}</span>
                    <strong>{item.moveNumber}{item.color === "w" ? "." : "…"} {item.san}</strong>
                    <span>{item.color === "w" ? headers.White || "Trắng" : headers.Black || "Đen"}</span>
                    <span className="critical-loss">−{Math.round(result?.centipawnLoss || 0)} cp</span>
                    <ChevronRight size={15} />
                  </button>
                )) : <div className="empty-critical">Không có Mistake hoặc Blunder trong ván này.</div>}
              </div>
            </div>
          </section>
        </div>
      )}

      {dashboardOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setDashboardOpen(false)}>
          <section className="modal-card dashboard-modal" role="dialog" aria-modal="true" aria-labelledby="dashboard-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setDashboardOpen(false)} aria-label="Đóng"><X size={20} /></button>
            <div className="summary-heading">
              <div className="modal-icon"><BarChart3 size={24} /></div>
              <div>
                <div className="eyebrow">HỒ SƠ NGƯỜI HỌC · {activeProfileLabel}</div>
                <h2 id="dashboard-title">Tiến bộ của bạn</h2>
                <p>Chỉ dùng các ván đã hoàn tất phân tích Stockfish.</p>
              </div>
            </div>
            {dashboardError && <div className="error-message">{dashboardError}</div>}
            {dashboardLoading ? (
              <div className="dashboard-empty"><LoaderCircle className="spin" size={24} /> Đang tổng hợp dữ liệu…</div>
            ) : dashboardStats.games === 0 ? (
              <div className="dashboard-empty">
                <Database size={30} />
                <strong>Chưa có ván đã phân tích cho {activeProfile?.username || "hồ sơ này"}</strong>
                <span>Đồng bộ ván, mở từng ván và chọn “Phân tích toàn ván” để xây dựng dashboard.</span>
                <button className="primary-button" onClick={() => { setDashboardOpen(false); setImportMode("sync"); setImportOpen(true); }}><Download size={15} /> Đồng bộ 20 ván</button>
              </div>
            ) : (
              <div className="dashboard-content">
                <div className="dashboard-metrics">
                  <div><strong>{dashboardStats.games}</strong><span>Ván đã phân tích</span></div>
                  <div><strong>{dashboardStats.acpl}</strong><span>ACPL cá nhân</span></div>
                  <div><strong>{dashboardStats.bestGoodRate}%</strong><span>Best / Tốt</span></div>
                  <div><strong>{dashboardStats.errors}</strong><span>Sai lầm / Blunder</span></div>
                </div>

                <section className="dashboard-section">
                  <h3>ACPL theo 20 ván gần nhất</h3>
                  <div className="acpl-chart">
                    {dashboardStats.timeline.map((item) => {
                      const max = Math.max(1, ...dashboardStats.timeline.map((point) => point.acpl));
                      return <div className="acpl-column" key={item.id} title={`${formatVietnamDate(item.date)} · ACPL ${item.acpl}`}><span>{item.acpl}</span><i style={{ height: `${Math.max(8, (item.acpl / max) * 100)}%` }} /></div>;
                    })}
                  </div>
                </section>

                <div className="dashboard-grid">
                  {[
                    { title: "Theo giai đoạn", items: dashboardStats.phases },
                    { title: "Theo màu quân", items: dashboardStats.colors },
                    { title: "Theo thể loại", items: dashboardStats.timeClasses },
                    { title: "Khai cuộc thường gặp", items: dashboardStats.openings },
                  ].map((group) => (
                    <section className="dashboard-breakdown" key={group.title}>
                      <h3>{group.title}</h3>
                      {group.items.map((item) => (
                        <div key={item.label}><span title={item.label}>{item.label}</span><strong>{item.acpl} ACPL</strong><i>{item.errors} lỗi / {item.moves} nước</i></div>
                      ))}
                    </section>
                  ))}
                </div>

                <div className="dashboard-grid bottom">
                  <section className="dashboard-breakdown">
                    <h3>Chủ đề cần ưu tiên</h3>
                    {dashboardStats.weaknesses.length ? dashboardStats.weaknesses.map((item) => (
                      <div key={item.label}><span>{item.label}</span><strong>{item.count} lần</strong></div>
                    )) : <p>Chưa có nhóm lỗi lặp lại.</p>}
                  </section>
                  {dashboardStats.timedMoves > 0 && (
                    <section className="dashboard-breakdown time-dashboard">
                      <h3><Clock size={14} /> Quản lý thời gian</h3>
                      <div><span>Thời gian nghĩ trung bình</span><strong>{dashboardStats.averageThinkTime}s</strong></div>
                      <div><span>Lỗi khi đi ≤ 3 giây</span><strong>{dashboardStats.quickErrors}</strong></div>
                      <div><span>Lỗi dưới áp lực</span><strong>{dashboardStats.pressureErrors}</strong></div>
                    </section>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
