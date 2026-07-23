import { Chessboard } from "react-chessboard";
import {
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
} from "../constants";
import { BOARD_MOVE_BADGES } from "../../features/analysis/boardUtils";
import { FullGameAnalysisAction } from "../../features/analysis/components/FullGameAnalysisAction";
import { GameTimeline } from "../../features/analysis/components/GameTimeline";
import { GameLibraryList } from "../../features/library/components/GameLibraryList";
import {
  CoachExplanation,
  GameCoachSummaryView,
} from "../../features/coach/components/CoachExplanation";
import { formatSeconds, formatVietnamDate } from "../../shared/utils/format";
import { BrandIcon } from "../../shared/components/BrandIdentity";
import { ChessTerm } from "../../shared/components/ChessTerm";
import { useAppControllerContext } from "../AppControllerContext";

export function AnalysisWorkspace() {
  const {
    analysis,
    currentIndex,
    setCurrentIndex,
    orientation,
    setOrientation,
    error,
    loading,
    engineCache,
    engineLoading,
    engineError,
    retryState,
    setRetryState,
    promotionPending,
    setPromotionPending,
    variationState,
    setVariationState,
    variationPlaying,
    setVariationPlaying,
    fullAnalysis,
    aiLoading,
    aiError,
    model,
    timelineScrollerRef,
    coachScrollerRef,
    step,
    engine,
    aiExplanation,
    quality,
    headers,
    currentOpening,
    totalMoves,
    provider,
    providerLabel,
    whiteEvaluationPercent,
    evaluationLeader,
    evaluationScoreAtTop,
    boardMoveBadge,
    boardMoveBadgePosition,
    boardInteractionMode,
    movePairs,
    startFullGameAnalysis,
    explainWithAi,
    beginRetry,
    evaluateRetryMove,
    openVariation,
    retryBestPiece, chessboardOptions, handleBoardMouseDown,
  } = useAppControllerContext();
  return (
    <>
      <main className="workspace">
        <section className="game-heading">
          <div className="eyebrow game-event">{headers.Event || "Ván cờ đã nhập"}</div>
          <div className="game-matchup">
            <div className="matchup-player white-player">
              <i className="side-badge white-side">Trắng</i>
              <span className="player-copy"><strong>{headers.White || "Trắng"}</strong><small>Elo {headers.WhiteElo || "—"}</small></span>
            </div>
            <div className="matchup-center">
              <span className="match-result">{headers.Result || "*"}</span>
              <div className="match-context">
                <span className="match-opening-context">
                  <ChessTerm term="eco">{currentOpening?.eco || headers.ECO || "ECO —"}</ChessTerm>
                  {currentOpening && (
                    <span className="match-opening" title={currentOpening.name}>
                      {currentOpening.name}
                    </span>
                  )}
                </span>
                <span>{headers.TimeControl ? `${headers.TimeControl}s` : "Không rõ thời gian"}</span>
              </div>
            </div>
            <div className="matchup-player black-player">
              <span className="player-copy"><strong>{headers.Black || "Đen"}</strong><small>Elo {headers.BlackElo || "—"}</small></span>
              <i className="side-badge black-side">Đen</i>
            </div>
          </div>
        </section>

        <section className="analysis-grid">
          <div className="board-column">
            <div className="board-toolbar">
              <div className="board-status"><span className="phase-dot" /><strong>{step.phase}</strong><span>Nước {step.moveNumber}{step.color === "b" ? "…" : "."}</span>{currentOpening && <span className="opening-live" title={`${currentOpening.eco} · ${currentOpening.name}`}><BookOpen size={12} /><b>{currentOpening.family}</b>{currentOpening.variation && <em>: {currentOpening.variation}</em>}</span>}</div>
              <div className="board-tools">
                <div className="evaluation-chip">
                  <CircleGauge size={15} />
                  <ChessTerm term="evaluation">{engineLoading ? "…" : engine?.evaluation || "—"}</ChessTerm>
                </div>
                <button className="icon-button" onClick={() => setOrientation((value) => (value === "white" ? "black" : "white"))} aria-label="Xoay bàn cờ" title="Xoay bàn cờ">
                  <RotateCcw size={17} />
                </button>
              </div>
            </div>

            <div className="board-stage">
              <div
                className={`evaluation-bar orientation-${orientation}`}
                role="meter"
                aria-label={`Đánh giá vị trí: ${engine?.evaluation || "đang tính"}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(whiteEvaluationPercent)}
                title={`Trắng ${Math.round(whiteEvaluationPercent)}% · Đen ${Math.round(100 - whiteEvaluationPercent)}%`}
              >
                <div className="evaluation-bar-side black" style={{ height: `${100 - whiteEvaluationPercent}%` }} />
                <div className="evaluation-bar-side white" style={{ height: `${whiteEvaluationPercent}%` }} />
                <span className={`evaluation-bar-score ${evaluationLeader} ${evaluationScoreAtTop ? "top" : "bottom"}`}>
                  {engineLoading ? "…" : engine?.evaluation || "0.00"}
                </span>
              </div>
              <div className="board-wrap" onMouseDownCapture={handleBoardMouseDown}>
                {boardInteractionMode !== "main" && (
                  <div className={`board-mode-badge ${boardInteractionMode}`}>
                    {boardInteractionMode === "retry" ? <><Dumbbell size={13} /> Chế độ thử lại</> : <><Eye size={13} /> {variationState?.title}</>}
                  </div>
                )}
                <Chessboard options={chessboardOptions} />
                {boardInteractionMode === "main" && boardMoveBadge && (
                  <div className="board-move-badge-square" style={boardMoveBadgePosition}>
                    <span
                      className={`board-move-badge ${boardMoveBadge}`}
                      aria-label={BOARD_MOVE_BADGES[boardMoveBadge].label}
                      title={BOARD_MOVE_BADGES[boardMoveBadge].label}
                    >
                      {boardMoveBadge === "best"
                        ? <Star aria-hidden="true" fill="currentColor" strokeWidth={2.2} />
                        : BOARD_MOVE_BADGES[boardMoveBadge].symbol}
                    </span>
                  </div>
                )}
                {promotionPending && (
                  <div className="promotion-picker">
                    <span>Phong cấp thành</span>
                    <div>{(["q", "r", "b", "n"] as const).map((piece) => (
                      <button key={piece} onClick={() => evaluateRetryMove(promotionPending.from, promotionPending.to, piece)}>
                        {{ q: "Hậu", r: "Xe", b: "Tượng", n: "Mã" }[piece]}
                      </button>
                    ))}</div>
                    <button className="promotion-cancel" onClick={() => setPromotionPending(null)}>Huỷ</button>
                  </div>
                )}
              </div>
            </div>

            {variationState && (
              <div className="variation-player">
                <button onClick={() => setVariationState((value) => value ? { ...value, index: Math.max(0, value.index - 1) } : value)} disabled={variationState.index === 0}><ChevronLeft size={15} /></button>
                <button onClick={() => setVariationPlaying((value) => !value)}>{variationPlaying ? <RotateCcw size={14} /> : <Play size={14} />}{variationPlaying ? "Dừng" : "Tự chạy"}</button>
                <span>{variationState.index === 0 ? "Vị trí ban đầu" : `${variationState.index}. ${variationState.moves[variationState.index - 1]}`}</span>
                <button onClick={() => setVariationState((value) => value ? { ...value, index: Math.min(value.positions.length - 1, value.index + 1) } : value)} disabled={variationState.index === variationState.positions.length - 1}><ChevronRight size={15} /></button>
                <button className="variation-exit" onClick={() => { setVariationState(null); setVariationPlaying(false); }}>Quay lại ván chính</button>
              </div>
            )}

            {retryState && (
              <div className={`retry-panel ${retryState.feedback?.quality || ""}`}>
                <div className="retry-heading"><Dumbbell size={15} /><strong>Tìm nước tốt hơn</strong><span>Lần thử {retryState.attempts}</span></div>
                {retryState.loading && <p><LoaderCircle className="spin" size={14} /> Stockfish đang chấm nước của bạn…</p>}
                {!retryState.loading && retryState.feedback && (
                  <div className="retry-feedback">
                    <strong>{QUALITY_LABELS[retryState.feedback.quality]} · {retryState.feedback.moveSan}</strong>
                    <span>{retryState.feedback.quality === "best" ? "Bạn đã tìm được nước tốt nhất." : `Mất ${retryState.feedback.loss} cp · Stockfish chọn ${retryState.feedback.bestMoveSan}.`}</span>
                  </div>
                )}
                {!retryState.loading && !retryState.feedback && <p>Kéo quân trên bàn cờ để thử nước của bạn.</p>}
                {retryState.hintLevel > 0 && (
                  <div className="retry-hint"><Lightbulb size={13} />{
                    retryState.hintLevel === 1
                      ? `Tập trung vào ý tưởng: ${step.tags[0] || step.phase}.`
                      : retryState.hintLevel === 2
                        ? `Hãy cân nhắc di chuyển ${retryBestPiece}.`
                        : `Nước tốt nhất là ${engine?.bestMoveSan || "—"}.`
                  }</div>
                )}
                <div className="retry-actions">
                  {retryState.feedback && retryState.feedback.quality !== "best" && <button onClick={() => setRetryState((value) => value ? { ...value, fen: step.fenBefore, feedback: null } : value)}>Thử lại lần nữa</button>}
                  {retryState.hintLevel < 3 && <button onClick={() => setRetryState((value) => value ? { ...value, hintLevel: value.hintLevel + 1 } : value)}><Lightbulb size={13} /> Gợi ý {retryState.hintLevel + 1}</button>}
                  <button onClick={() => { setRetryState(null); setPromotionPending(null); }}>Thoát luyện tập</button>
                </div>
              </div>
            )}

            <div className="arrow-legend">
              <span><i className="legend-line gold" /> Nước vừa đi</span>
              <span><i className="legend-line green" /> Best move</span>
              <span><i className="legend-line blue" /> Phương án 2</span>
              <span><i className="legend-line red" /> Phản đòn</span>
              <span className="keyboard-hint">← → chuyển nước</span>
            </div>
          </div>

          <aside className="coach-panel">
            <div className="coach-scroll-content">
            <div className="coach-fixed-content">
            <div className="coach-progress">
              <span>PHÂN TÍCH NƯỚC ĐI</span>
              <span className={`coach-engine-inline ${engineLoading ? "working" : ""}`} title={engineError || `Stockfish 18 Lite${engine ? ` · depth ${engine.depth} · CPL ${Math.round(engine.centipawnLoss)}` : " đang tính"}`}>
                <Cpu size={13} /> STOCKFISH 18 LITE
                {engineLoading && <LoaderCircle size={12} />}
                {engine && <i><ChessTerm term="cpl">CPL</ChessTerm> {Math.round(engine.centipawnLoss)}</i>}
              </span>
              <span>{currentIndex + 1} / {analysis.steps.length}</span>
            </div>
            <div className="progress-track"><div style={{ width: `${((currentIndex + 1) / analysis.steps.length) * 100}%` }} /></div>
            <FullGameAnalysisAction
              analysis={fullAnalysis}
              onAnalyze={startFullGameAnalysis}
            />

            <div className="move-hero">
              <div className="move-badges">
                <div className={`quality-badge ${quality}`}>
                  <span className="quality-icon">
                    {quality === "brilliant" ? "!!" : quality === "best" ? "★" : quality === "good" ? "✓" : "!"}
                  </span>
                  <ChessTerm term={quality}>{QUALITY_LABELS[quality]}</ChessTerm>
                </div>
                <div className={`turn-badge ${step.color === "w" ? "white-turn" : "black-turn"}`}>
                  {step.color === "w" ? "Trắng" : "Đen"} · {step.color === "w" ? headers.White || "Người chơi" : headers.Black || "Người chơi"}
                </div>
              </div>
              <div className="san-display">{step.moveNumber}{step.color === "w" ? "." : "…"} {step.san}</div>
              <h2>{step.title}</h2>
              <p>{step.comment}</p>
              <div className={`engine-verdict ${engine ? quality : "loading"}`} aria-live="polite">
                {engine ? (
                  <>
                    <Cpu size={13} />
                    <strong>Stockfish:</strong>
                    <span>{quality === "brilliant"
                      ? "nước hy sinh gần tối ưu theo tiêu chí Kỳ Phổ"
                      : quality === "best"
                        ? "nước tốt nhất"
                      : quality === "good"
                        ? `nước tốt · mất ${Math.round(engine.centipawnLoss)} cp`
                        : `mất ${Math.round(engine.centipawnLoss)} cp · tốt nhất ${engine.bestMoveSan}`}</span>
                    <i>{engine.evaluation}</i>
                    {engineLoading && <LoaderCircle className="spin" size={12} />}
                  </>
                ) : engineError ? (
                  <><TriangleAlert size={13} /><span>{engineError}</span></>
                ) : (
                  <><LoaderCircle className="spin" size={13} /><span>Stockfish đang chấm nước đi…</span></>
                )}
              </div>
              {step.clockSeconds !== null && (
                <div className="move-time-strip">
                  <span><Clock size={13} /> Còn {formatSeconds(step.clockSeconds)}</span>
                  <span>Suy nghĩ {formatSeconds(step.thinkTimeSeconds)}</span>
                  {step.isQuickMove && <i>Đi nhanh</i>}
                  {step.isTimePressure && <i>Áp lực thời gian</i>}
                </div>
              )}
            </div>

            <button className={`training-start-button ${quality === "mistake" || quality === "blunder" ? "recommended" : ""}`} onClick={beginRetry} disabled={!engine || engineLoading}>
              <Dumbbell size={15} /> Thử tìm nước tốt hơn
            </button>

            {engine ? (
              <div className="best-line-card">
                <div className="best-line-label">HAI PHƯƠNG ÁN TỐT NHẤT</div>
                <div className="variation-list">
                  {engine.variations.slice(0, 2).map((variation) => (
                    <button className="variation-row" key={`${variation.rank}-${variation.moveUci}`} onClick={() => openVariation(variation.rank, variation.lineSan)}>
                      <span className={`variation-rank rank-${variation.rank}`}>{variation.rank === 1 ? "BEST" : "#2"}</span>
                      <span className="variation-eval">{variation.evaluation}</span>
                      <span className="best-line-moves">
                        {variation.lineSan.length ? variation.lineSan.map((move, moveIndex) => (
                          <span
                            className={`variation-move-token${variationState?.rank === variation.rank && variationState.index === moveIndex + 1 ? " active" : ""}`}
                            key={`${variation.rank}-${moveIndex}-${move}`}
                          >{move}</span>
                        )) : <span className="variation-move-token">{variation.moveSan}</span>}
                      </span>
                      <Eye size={13} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="best-line-card best-line-loading" aria-label="Stockfish đang tìm phương án">
                <div className="best-line-label">HAI PHƯƠNG ÁN TỐT NHẤT</div>
                <div className="best-line-skeleton"><span /><span /></div>
              </div>
            )}

            </div>
            <div className="coach-insight-scroll" ref={coachScrollerRef} role="region" aria-label="Góc nhìn HLV">
            <div className={`insight-card ${aiExplanation ? "ai-ready" : ""}`}>
              <div className="insight-title">
                <BrandIcon brand={provider} size={17} /> {aiExplanation ? `${providerLabel} · ${model}` : "Góc nhìn HLV"}
                {aiExplanation?.cached && <span className="saved-badge">Đã lưu</span>}
              </div>
              {aiExplanation ? <CoachExplanation text={aiExplanation.text} /> : <p>{step.insight}</p>}
              {aiError && <div className="inline-error">{aiError}</div>}
              {!aiExplanation && (
                <button className="ai-button" onClick={() => void explainWithAi(false)} disabled={!engine || aiLoading}>
                  {aiLoading ? <LoaderCircle className="spin" size={16} /> : <BrandIcon brand={provider} size={16} />}
                  {aiLoading ? `${providerLabel} đang giải thích…` : `Giải thích bằng ${providerLabel}`}
                </button>
              )}
              {aiExplanation && (
                <button className="refresh-ai-button" onClick={() => void explainWithAi(true)} disabled={aiLoading}>
                  {aiLoading ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />} Phân tích lại
                </button>
              )}
            </div>

            <div className="tag-row">
              {step.tags.map((tag) => <span key={tag}>{tag}</span>)}
              {engine && <span className="engine-tag">Stockfish xác thực</span>}
            </div>
            <div className="coach-spacer" />
            </div>
            </div>

            <div className="step-controls">
              <button onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))} disabled={currentIndex === 0}><ChevronLeft size={19} /> Trước</button>
              <div className="move-coordinate">{step.from} → {step.to}</div>
              <button className="next-button" onClick={() => setCurrentIndex((value) => Math.min(analysis.steps.length - 1, value + 1))} disabled={currentIndex === analysis.steps.length - 1}>Tiếp <ChevronRight size={19} /></button>
            </div>
          </aside>
        </section>

        <GameTimeline
          steps={analysis.steps}
          engineCache={engineCache}
          currentIndex={currentIndex}
          setCurrentIndex={setCurrentIndex}
          movePairs={movePairs}
          totalMoves={totalMoves}
          scrollerRef={timelineScrollerRef}
          fullAnalysis={fullAnalysis}
          qualityLabels={QUALITY_LABELS}
        />
      </main>
    </>
  );
}
