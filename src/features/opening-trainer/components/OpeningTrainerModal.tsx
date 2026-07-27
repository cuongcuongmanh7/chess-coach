import { BookOpen, CheckCircle2, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useAppControllerContext } from "../../../app/AppControllerContext";
import { RepertoireBoard } from "./RepertoireBoard";
import { RepertoirePicker } from "./RepertoirePicker";
import { DeviationPanel } from "./DeviationPanel";

export function OpeningTrainerModal() {
  const {
    openingTrainerOpen,
    closeOpeningTrainer,
    repertoires,
    selectedRepertoire,
    selectedRepertoireId,
    selectRepertoire,
    tree,
    openingTrainerLoading,
    openingTrainerBuilding,
    openingTrainerBuildProgress,
    openingTrainerError,
    buildFromHistory,
    repertoireSession,
    activeProfileLabel,
  } = useAppControllerContext();
  if (!openingTrainerOpen) return null;

  const { session, start, exit, onDrop, backToRepertoire, revealAndContinue, enterFreeMode, saveDeviationMove } =
    repertoireSession;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={closeOpeningTrainer}>
      <section
        className="modal-card training-modal opening-trainer-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="opening-trainer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={closeOpeningTrainer} aria-label="Đóng">
          <X size={20} />
        </button>
        <div className="training-heading">
          <div className="modal-icon">
            <BookOpen size={24} />
          </div>
          <div>
            <div className="eyebrow">OPENING TRAINER · {activeProfileLabel}</div>
            <h2 id="opening-trainer-title">Luyện khai cuộc của bạn</h2>
            <p>Repertoire dựng từ ván đã chơi; Stockfish là nguồn sự thật, hoàn toàn offline.</p>
          </div>
        </div>

        {openingTrainerError && <div className="error-message">{openingTrainerError}</div>}

        {session && selectedRepertoire ? (
          <div className="training-session">
            <RepertoireBoard session={session} color={selectedRepertoire.color} onPieceDrop={onDrop} />
            <div className="training-task">
              <div className="repertoire-status">
                <strong>{selectedRepertoire.name}</strong>
                <span className="repertoire-score">
                  ✓ {session.correct} · ✗ {session.wrong}
                </span>
              </div>
              {session.message && <p className="repertoire-message">{session.message}</p>}
              {session.loading && (
                <p className="repertoire-message">
                  <LoaderCircle className="spin" size={15} /> Đang lưu…
                </p>
              )}
              {session.machineThinking && !session.loading && (
                <p className="repertoire-message">
                  <LoaderCircle className="spin" size={15} /> Đối thủ đang đi…
                </p>
              )}

              {session.status === "deviation" && (
                <DeviationPanel
                  session={session}
                  onBack={backToRepertoire}
                  onReveal={revealAndContinue}
                  onFreeMode={enterFreeMode}
                  onSaveMove={saveDeviationMove}
                />
              )}

              {session.status === "complete" && (
                <div className="repertoire-complete">
                  <CheckCircle2 size={18} /> Hoàn thành biến này.
                </div>
              )}

              {session.status === "free" && (
                <p className="repertoire-message">
                  Đang phân tích tự do — đi thử thoải mái để hiểu thế cờ.
                </p>
              )}

              <div className="repertoire-session-actions">
                <button className="ghost-button" onClick={start}>
                  <RotateCcw size={15} /> Làm lại
                </button>
                <button className="ghost-button" onClick={exit}>
                  Chọn repertoire khác
                </button>
              </div>
            </div>
          </div>
        ) : (
          <RepertoirePicker
            repertoires={repertoires}
            selectedId={selectedRepertoireId}
            building={openingTrainerBuilding}
            buildProgress={openingTrainerBuildProgress}
            loading={openingTrainerLoading}
            onSelect={selectRepertoire}
            onBuild={buildFromHistory}
            onStart={start}
            canStart={Boolean(selectedRepertoire) && tree.length > 0}
          />
        )}
      </section>
    </div>
  );
}
