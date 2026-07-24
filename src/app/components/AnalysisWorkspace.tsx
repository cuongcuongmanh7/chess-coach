import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Cpu,
  LoaderCircle,
  RotateCcw,
  Play,
} from "lucide-react";
import {
  COACH_LABELS,
  QUALITY_LABELS,
} from "../constants";
import {
  CandidateLabLaunch,
  CandidateLabPanel,
} from "../../features/candidate-lab/components/CandidateLabControls";
import { CandidateBranchTimeline } from "../../features/candidate-lab/components/CandidateBranchTimeline";
import { CandidateNavigationControls } from "../../features/candidate-lab/components/CandidateNavigationControls";
import { AnalysisBoard } from "./AnalysisBoard";
import { RetryPanel } from "../../features/training/components/RetryPanel";
import { FullGameAnalysisAction } from "../../features/analysis/components/FullGameAnalysisAction";
import { EngineLinesAccordion } from "../../features/analysis/components/EngineLinesAccordion";
import { GameHeading } from "../../features/analysis/components/GameHeading";
import { GameTimeline } from "../../features/analysis/components/GameTimeline";
import { MoveAnalysisSummary } from "../../features/analysis/components/MoveAnalysisSummary";
import { CoachExplanation } from "../../features/coach/components/CoachExplanation";
import { BrandIcon } from "../../shared/components/BrandIdentity";
import { ChessTerm } from "../../shared/components/ChessTerm";
import { useAppControllerContext } from "../AppControllerContext";
import { ThreatViewToggle } from "../../features/tactics/components/ThreatViewToggle";
import { TacticalInsights } from "../../features/tactics/components/TacticalInsights";
import { PlayerMoveStats } from "../../features/analysis/components/PlayerMoveStats";

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
    evaluateRetryMove,
    openVariation,
    retryBestPiece, chessboardOptions, handleBoardMouseDown,
    tacticalAnalysis,
    playerMoveSummary,
    threatViewAvailable,
    threatViewEnabled,
    toggleThreatView,
    candidateState,
    candidatePromotion,
    candidateAvailable,
    beginCandidateLab,
    exitCandidateLab,
    evaluateCandidateMove,
    tryAnotherCandidate,
    selectCandidateBranchMove,
    cancelCandidatePromotion,
  } = useAppControllerContext();
  return (
    <>
      <main className="workspace">
        <GameHeading
          headers={headers}
          currentOpening={currentOpening}
          steps={analysis.steps}
          currentIndex={currentIndex}
        />

        <section className="analysis-grid">
          <div className="board-column">
            <div className="board-toolbar">
              <div className="board-status" inert={candidateState.active}><span className="phase-dot" /><strong>{step.phase}</strong><span>Nước {step.moveNumber}{step.color === "b" ? "…" : "."}</span>{currentOpening && <span className="opening-live" title={`${currentOpening.eco} · ${currentOpening.name}`}><BookOpen size={12} /><b>{currentOpening.family}</b>{currentOpening.variation && <em>: {currentOpening.variation}</em>}</span>}</div>
              <div className="board-tools">
                <span className="board-tools-analysis" style={{ display: "contents" }} inert={candidateState.active}>
                  <ThreatViewToggle available={threatViewAvailable} enabled={threatViewEnabled} onToggle={toggleThreatView} />
                  <div className="evaluation-chip">
                    <CircleGauge size={15} />
                    <ChessTerm term="evaluation">{engineLoading ? "…" : engine?.evaluation || "—"}</ChessTerm>
                  </div>
                </span>
                <button className="icon-button" onClick={() => setOrientation((value) => (value === "white" ? "black" : "white"))} aria-label="Xoay bàn cờ" title="Xoay bàn cờ">
                  <RotateCcw size={17} />
                </button>
              </div>
            </div>

            <AnalysisBoard
              orientation={orientation}
              whiteEvaluationPercent={whiteEvaluationPercent}
              evaluationLeader={evaluationLeader}
              evaluationScoreAtTop={evaluationScoreAtTop}
              engine={engine}
              engineLoading={engineLoading}
              mode={boardInteractionMode}
              variationTitle={variationState?.title}
              candidateColor={candidateState.userColor}
              chessboardOptions={chessboardOptions}
              onMouseDownCapture={handleBoardMouseDown}
              boardMoveBadge={boardMoveBadge}
              boardMoveBadgePosition={boardMoveBadgePosition}
              candidateMove={candidateState.moves[candidateState.selectedIndex]}
              candidateLoading={candidateState.loading}
              retryPromotion={promotionPending}
              onRetryPromotion={(piece) => evaluateRetryMove(
                promotionPending!.from,
                promotionPending!.to,
                piece,
              )}
              onCancelRetryPromotion={() => setPromotionPending(null)}
              candidatePromotion={candidatePromotion}
              onCandidatePromotion={(piece) => evaluateCandidateMove(
                candidatePromotion!.from,
                candidatePromotion!.to,
                piece,
              )}
              onCancelCandidatePromotion={cancelCandidatePromotion}
            />
            {!candidateState.active && playerMoveSummary && (
              <PlayerMoveStats playerName={playerMoveSummary.playerName} stats={playerMoveSummary.stats} />
            )}
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
              <RetryPanel
                state={retryState}
                step={step}
                engine={engine}
                bestPiece={retryBestPiece}
                onTryAgain={() => setRetryState((value) => value
                  ? { ...value, fen: step.fenBefore, feedback: null }
                  : value)}
                onHint={() => setRetryState((value) => value
                  ? { ...value, hintLevel: value.hintLevel + 1 }
                  : value)}
                onExit={() => { setRetryState(null); setPromotionPending(null); }}
              />
            )}
            {!candidateState.active && (
              <div className="arrow-legend">
                <span><i className="legend-line gold" /> Nước vừa đi</span>
                <span><i className="legend-line green" /> Best move</span>
                <span><i className="legend-line blue" /> Phương án 2</span>
                <span><i className="legend-line red" /> Phản đòn</span>
                <span className="keyboard-hint">← → chuyển nước</span>
              </div>
            )}
          </div>
          <aside className="coach-panel">
            {candidateState.active ? (
              <div className="candidate-side-panel">
                <CandidateLabPanel
                  state={candidateState}
                  onTryAnother={tryAnotherCandidate}
                  onExit={exitCandidateLab}
                />
              </div>
            ) : (
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
            <div className="analysis-primary-actions">
              <FullGameAnalysisAction
                analysis={fullAnalysis}
                onAnalyze={startFullGameAnalysis}
                disabled={candidateState.active}
              />
              <CandidateLabLaunch
                available={candidateAvailable}
                blockedReason={fullAnalysis.running
                  ? "Hãy chờ phân tích toàn ván hoàn tất."
                  : retryState?.loading
                    ? "Hãy chờ Stockfish chấm lượt thử lại."
                    : engineLoading ? "Hãy chờ Stockfish chấm vị trí hiện tại." : undefined}
                onStart={beginCandidateLab}
              />
            </div>

            <MoveAnalysisSummary
              key={analysis.rawPgn}
              step={step}
              headers={headers}
              quality={quality}
              qualityLabel={QUALITY_LABELS[quality]}
              engine={engine}
              engineLoading={engineLoading}
              engineError={engineError}
            />

            </div>
            <div className="coach-insight-scroll" ref={coachScrollerRef} role="region" aria-label="Góc nhìn HLV">
            <div className={`insight-card ${aiExplanation ? "ai-ready" : ""}`}>
              <div className="insight-title">
                <BrandIcon brand={aiExplanation?.provider || provider} size={17} /> {aiExplanation ? COACH_LABELS[aiExplanation.provider] : "Góc nhìn HLV"}
                {aiExplanation?.cached && <span className="saved-badge">Đã lưu</span>}
              </div>
              {aiExplanation ? <CoachExplanation text={aiExplanation.text} /> : <p>{step.insight}</p>}
              {aiError && <div className="inline-error">{aiError}</div>}
              {!aiExplanation && (
                <button className="ai-button" onClick={() => void explainWithAi(false)} disabled={!engine || aiLoading}>
                  {aiLoading ? <LoaderCircle className="spin" size={16} /> : <BrandIcon brand={provider} size={16} />}
                  {aiLoading ? `${COACH_LABELS[provider]} đang giải thích…` : `Giải thích bằng ${COACH_LABELS[provider]}`}
                </button>
              )}
              {aiExplanation && (
                <button className="refresh-ai-button" onClick={() => void explainWithAi(true)} disabled={aiLoading}>
                  {aiLoading ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />} Phân tích lại
                </button>
              )}
            </div>
            <div className="tag-row">
              {step.tags.map((tag) => <span className="guidance-tag" key={tag}>{tag}</span>)}
            </div>
            <TacticalInsights
              analysis={tacticalAnalysis}
              threatViewEnabled={threatViewEnabled}
            />
            <EngineLinesAccordion
              key={analysis.rawPgn}
              engine={engine}
              activeRank={variationState?.rank}
              activeIndex={variationState?.index}
              onOpenVariation={openVariation}
            />
            <div className="coach-spacer" />
            </div>
            </div>
            )}
            {candidateState.active
              ? <CandidateNavigationControls state={candidateState} onSelect={selectCandidateBranchMove} />
              : <div className="step-controls">
                <button onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))} disabled={currentIndex === 0}><ChevronLeft size={19} /> Trước</button>
                <div className="move-coordinate">{step.from} → {step.to}</div>
                <button className="next-button" onClick={() => setCurrentIndex((value) => Math.min(analysis.steps.length - 1, value + 1))} disabled={currentIndex === analysis.steps.length - 1}>Tiếp <ChevronRight size={19} /></button>
              </div>}
          </aside>
        </section>
        {!candidateState.active && (
          <GameTimeline
            steps={analysis.steps}
            engineCache={engineCache}
            currentIndex={currentIndex}
            setCurrentIndex={setCurrentIndex}
            movePairs={movePairs}
            totalMoves={totalMoves}
            scrollerRef={timelineScrollerRef}
            qualityLabels={QUALITY_LABELS}
          />
        )}
        <CandidateBranchTimeline state={candidateState} onSelect={selectCandidateBranchMove} onExit={exitCandidateLab} />
      </main>
    </>
  );
}
