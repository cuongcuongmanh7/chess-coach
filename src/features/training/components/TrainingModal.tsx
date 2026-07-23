import {
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Dumbbell,
  EyeOff,
  Filter,
  Flame,
  Lightbulb,
  LoaderCircle,
  Play,
  RotateCcw,
  Star,
  Target,
  X,
} from "lucide-react";
import { useAppControllerContext } from "../../../app/AppControllerContext";
import type { TrainingCard, TrainingFilters, TrainingQueue } from "../types";
import { uniqueTrainingValues } from "../utils";
import { TrainingBoard } from "./TrainingBoard";
import { TrainingTimeline } from "./TrainingTimeline";

const QUEUES: Array<{ id: TrainingQueue; label: string }> = [
  { id: "due", label: "Đến hạn" },
  { id: "new", label: "Mới" },
  { id: "mastered", label: "Đã thuộc" },
  { id: "starred", label: "Đánh dấu sao" },
  { id: "suspended", label: "Tạm ẩn" },
  { id: "all", label: "Tất cả" },
];

function hintText(card: TrainingCard, level: number) {
  if (level === 1) {
    return card.tags[0]
      ? `Ý tưởng cần tìm: ${card.tags[0]}.`
      : `Hãy tìm một nước cải thiện thế ${card.phase.toLowerCase()}.`;
  }
  if (level === 2) {
    const symbol = card.best_move.replace(/[+#=].*$/, "").charAt(0);
    const piece = ({ K: "vua", Q: "hậu", R: "xe", B: "tượng", N: "mã" } as Record<string, string>)[symbol] || "tốt";
    return `Hãy cân nhắc di chuyển ${piece}.`;
  }
  return "";
}

function FilterSelect({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Tất cả</option>
        {values.map((item) => <option value={item} key={item}>{item}</option>)}
      </select>
    </label>
  );
}

export function TrainingModal() {
  const {
    trainingOpen,
    closeTraining,
    trainingQueue,
    setTrainingQueue,
    trainingCards,
    trainingStats,
    trainingFilters,
    setTrainingFilters,
    trainingLoading,
    trainingError,
    trainingSession,
    trainingSessionHistory,
    latestTrainingIndex,
    filteredTrainingCards,
    currentTrainingCard,
    includeInaccuracies,
    setIncludeInaccuracies,
    startTraining,
    handleTrainingDrop,
    requestTrainingHint,
    finishTrainingWrong,
    nextTrainingCard,
    openTrainingSession,
    updateTrainingCard,
    activeProfileLabel,
  } = useAppControllerContext();
  if (!trainingOpen) return null;

  const updateFilter = (key: keyof TrainingFilters, value: string) => {
    setTrainingFilters((filters) => ({ ...filters, [key]: value }));
  };
  const phases = uniqueTrainingValues(trainingCards, (card) => card.phase);
  const openings = uniqueTrainingValues(trainingCards, (card) => card.opening);
  const tags = Array.from(new Set(trainingCards.flatMap((card) => card.tags))).sort();
  const timeClasses = uniqueTrainingValues(trainingCards, (card) => card.time_class);
  const complete = trainingSession?.feedback?.kind === "complete";

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={closeTraining}>
      <section
        className="modal-card training-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="training-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="modal-close" onClick={closeTraining} aria-label="Đóng"><X size={20} /></button>
        <div className="training-heading">
          <div className="modal-icon"><BrainCircuit size={24} /></div>
          <div>
            <div className="eyebrow">MISTAKE LAB · {activeProfileLabel}</div>
            <h2 id="training-title">Luyện lại lỗi của bạn</h2>
            <p>Stockfish chấm nước đi; lịch ôn được lưu hoàn toàn trên máy.</p>
          </div>
        </div>

        {trainingError && <div className="error-message">{trainingError}</div>}
        {trainingLoading ? (
          <div className="training-empty"><LoaderCircle className="spin" size={26} /> Đang mở kho bài tập…</div>
        ) : trainingSession && currentTrainingCard ? (
          <div className="training-session">
            <TrainingBoard
              card={currentTrainingCard}
              session={trainingSession}
              complete={complete}
              onPieceDrop={handleTrainingDrop}
            />
            <div className="training-task">
              <div className="training-card-meta">
                <span className={`training-quality ${currentTrainingCard.quality}`}>{currentTrainingCard.quality === "blunder" ? "Blunder" : currentTrainingCard.quality === "mistake" ? "Sai lầm" : "Thiếu chính xác"}</span>
                <span>Bài {trainingSession.index + 1}/{filteredTrainingCards.length}</span>
                <button
                  className={currentTrainingCard.starred ? "active" : ""}
                  onClick={() => void updateTrainingCard(currentTrainingCard, { starred: !currentTrainingCard.starred })}
                  aria-label="Đánh dấu sao"
                ><Star size={15} /></button>
              </div>
              <TrainingTimeline
                count={filteredTrainingCards.length}
                sessions={trainingSessionHistory}
                latestIndex={latestTrainingIndex}
                viewedIndex={trainingSession.index}
                disabled={trainingSession.loading}
                onSelect={openTrainingSession}
              />
              <h3>Tìm nước tốt hơn</h3>
              <p>
                Bạn đang điều khiển <strong>{currentTrainingCard.side_to_move === "w" ? "Trắng" : "Đen"}</strong>.
                {" "}Vị trí trước <strong>{currentTrainingCard.played_move}</strong>. Hãy tìm nước đạt ngưỡng Best hoặc Tốt.
              </p>
              <div className="training-context">
                <span><Target size={14} /> {currentTrainingCard.phase}</span>
                <span><RotateCcw size={14} /> Đã ôn {currentTrainingCard.attempts} lần</span>
                <span><CalendarClock size={14} /> Chu kỳ {currentTrainingCard.interval_days} ngày</span>
              </div>

              {trainingSession.loading && <div className="training-feedback working"><LoaderCircle className="spin" size={17} /> Stockfish đang chấm…</div>}
              {trainingSession.feedback && (
                <div className={`training-feedback ${trainingSession.feedback.kind}`}>
                  {complete ? <CheckCircle2 size={18} /> : <Target size={18} />}
                  <div><strong>{trainingSession.feedback.message}</strong>{trainingSession.feedback.detail && <span>{trainingSession.feedback.detail}</span>}</div>
                </div>
              )}
              {trainingSession.hintsUsed > 0 && trainingSession.hintsUsed < 3 && (
                <div className="training-hint"><Lightbulb size={16} /> {hintText(currentTrainingCard, trainingSession.hintsUsed)}</div>
              )}

              <div className="training-task-actions">
                {complete ? (
                  <button className="primary-button" onClick={nextTrainingCard}>
                    {trainingSession.index + 1 < filteredTrainingCards.length ? "Bài tiếp theo" : "Hoàn tất buổi luyện"}
                  </button>
                ) : (
                  <>
                    <button className="ghost-button" onClick={requestTrainingHint} disabled={trainingSession.loading || trainingSession.hintsUsed >= 3}>
                      <Lightbulb size={15} /> Gợi ý {Math.min(3, trainingSession.hintsUsed + 1)}
                    </button>
                    {trainingSession.failedAttempts > 0 && (
                      <button className="ghost-button danger" onClick={finishTrainingWrong} disabled={trainingSession.loading}>
                        Ghi nhận sai
                      </button>
                    )}
                  </>
                )}
              </div>
              <button
                className="training-suspend"
                onClick={() => void updateTrainingCard(currentTrainingCard, { suspended: !currentTrainingCard.suspended })}
              ><EyeOff size={14} /> {currentTrainingCard.suspended ? "Đưa lại vào kho" : "Tạm ẩn bài này"}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="training-metrics">
              <div><Clock3 size={17} /><strong>{trainingStats.due}</strong><span>Đến hạn</span></div>
              <div><Dumbbell size={17} /><strong>{trainingStats.attempts}</strong><span>Lượt làm</span></div>
              <div><Target size={17} /><strong>{Math.round(trainingStats.first_try_correct_rate * 100)}%</strong><span>Đúng lần đầu</span></div>
              <div><Flame size={17} /><strong>{trainingStats.streak_days}</strong><span>Ngày streak</span></div>
            </div>

            <div className="training-toolbar">
              <div className="training-queues">
                {QUEUES.map((queue) => (
                  <button className={trainingQueue === queue.id ? "active" : ""} key={queue.id} onClick={() => setTrainingQueue(queue.id)}>
                    {queue.label}
                  </button>
                ))}
              </div>
              <label className="training-inaccuracy-toggle">
                <input type="checkbox" checked={includeInaccuracies} onChange={(event) => setIncludeInaccuracies(event.target.checked)} />
                Tạo thêm bài Thiếu chính xác
              </label>
            </div>

            <div className="training-filters">
              <div className="training-filter-title"><Filter size={14} /> Bộ lọc</div>
              <FilterSelect label="Giai đoạn" value={trainingFilters.phase} values={phases} onChange={(value) => updateFilter("phase", value)} />
              <FilterSelect label="Màu quân" value={trainingFilters.color} values={["w", "b"]} onChange={(value) => updateFilter("color", value)} />
              <FilterSelect label="Khai cuộc" value={trainingFilters.opening} values={openings} onChange={(value) => updateFilter("opening", value)} />
              <FilterSelect label="Nhãn" value={trainingFilters.tag} values={tags} onChange={(value) => updateFilter("tag", value)} />
              <FilterSelect label="Thể loại" value={trainingFilters.timeClass} values={timeClasses} onChange={(value) => updateFilter("timeClass", value)} />
              <label><span>Từ ngày</span><input type="date" value={trainingFilters.dateFrom} onChange={(event) => updateFilter("dateFrom", event.target.value)} /></label>
              <label><span>Đến ngày</span><input type="date" value={trainingFilters.dateTo} onChange={(event) => updateFilter("dateTo", event.target.value)} /></label>
            </div>

            {filteredTrainingCards.length ? (
              <div className="training-ready">
                <div><strong>{filteredTrainingCards.length} bài phù hợp</strong><span>{trainingStats.mastered}/{trainingStats.total} bài đã thuộc · trung bình {trainingStats.average_hints.toFixed(1)} gợi ý</span></div>
                <button className="primary-button" onClick={() => startTraining(0)}><Play size={16} /> Bắt đầu luyện</button>
              </div>
            ) : (
              <div className="training-empty">
                <BrainCircuit size={30} />
                <strong>Chưa có bài trong nhóm này</strong>
                <span>Phân tích toàn ván thuộc hồ sơ đang chọn để tự tạo bài Mistake/Blunder.</span>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
