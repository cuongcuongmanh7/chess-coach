import { BookOpen, LoaderCircle, Play, Sparkles } from "lucide-react";
import type { Repertoire, RepertoireColor } from "../types";

type RepertoirePickerProps = {
  repertoires: Repertoire[];
  selectedId: string | null;
  building: RepertoireColor | null;
  buildProgress: { done: number; total: number } | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onBuild: (color: RepertoireColor) => void;
  onStart: () => void;
  canStart: boolean;
};

export function RepertoirePicker({
  repertoires,
  selectedId,
  building,
  buildProgress,
  loading,
  onSelect,
  onBuild,
  onStart,
  canStart,
}: RepertoirePickerProps) {
  const progressPercent =
    buildProgress && buildProgress.total > 0
      ? Math.round((buildProgress.done / buildProgress.total) * 100)
      : 0;
  return (
    <div className="repertoire-picker">
      <div className="repertoire-build">
        <div className="repertoire-build-copy">
          <strong>Repertoire từ ván đã chơi</strong>
          <span>Tự dựng theo từng khai cuộc bạn hay đi, hoàn toàn offline.</span>
        </div>
        <div className="repertoire-build-actions">
          <button
            className="primary-button"
            onClick={() => onBuild("w")}
            disabled={building !== null}
          >
            {building === "w" ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
            Cập nhật Trắng
          </button>
          <button
            className="primary-button"
            onClick={() => onBuild("b")}
            disabled={building !== null}
          >
            {building === "b" ? <LoaderCircle className="spin" size={16} /> : <Sparkles size={16} />}
            Cập nhật Đen
          </button>
        </div>
      </div>

      {building && (
        <div className="repertoire-build-progress" role="status" aria-live="polite">
          <div className="repertoire-build-progress-head">
            <span>
              <LoaderCircle className="spin" size={15} /> Đang dựng repertoire cho bên{" "}
              {building === "w" ? "Trắng" : "Đen"}
            </span>
            {buildProgress && (
              <span className="repertoire-build-progress-count">
                {buildProgress.done}/{buildProgress.total} ván
              </span>
            )}
          </div>
          <div className="batch-progress">
            <b style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="repertoire-build-progress-sub">
            Phân tích khai cuộc từ các ván đã lưu — chỉ Stockfish, không gọi AI.
          </div>
        </div>
      )}

      <div className="repertoire-list">
        {loading && repertoires.length === 0 ? (
          <div className="repertoire-empty">Đang tải…</div>
        ) : repertoires.length === 0 ? (
          <div className="repertoire-empty">
            <BookOpen size={26} />
            <p>Chưa có repertoire. Hãy dựng từ ván của bạn ở trên.</p>
          </div>
        ) : (
          repertoires.map((item) => (
            <button
              key={item.id}
              className={`repertoire-card ${item.id === selectedId ? "active" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              <span className={`repertoire-card-color ${item.color === "w" ? "white" : "black"}`}>
                {item.color === "w" ? "♔" : "♚"}
              </span>
              <span className="repertoire-card-body">
                <strong>{item.name}</strong>
                <small>
                  {item.eco ? `${item.eco} · ` : ""}
                  {item.node_count} nước
                </small>
                <span className="repertoire-card-status">
                  {item.new_count > 0 && (
                    <span className="repertoire-badge new">{item.new_count} cần học</span>
                  )}
                  {item.due_count > 0 && (
                    <span className="repertoire-badge due">{item.due_count} đến hạn</span>
                  )}
                  {item.new_count === 0 && item.due_count === 0 && (
                    <span className="repertoire-badge done">Đã thuộc</span>
                  )}
                </span>
              </span>
            </button>
          ))
        )}
      </div>

      <div className="repertoire-picker-footer">
        <button className="primary-button large" onClick={onStart} disabled={!canStart}>
          <Play size={17} /> Bắt đầu luyện
        </button>
      </div>
    </div>
  );
}
