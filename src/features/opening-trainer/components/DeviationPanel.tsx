import { useState } from "react";
import { Compass, CornerUpLeft, Lightbulb, Plus } from "lucide-react";
import type { RepertoireSession } from "../hooks/useRepertoireSession";

type DeviationPanelProps = {
  session: RepertoireSession;
  onBack: () => void;
  onReveal: () => void;
  onFreeMode: () => void;
  onSaveMove: (comment: string | null) => void;
};

export function DeviationPanel({
  session,
  onBack,
  onReveal,
  onFreeMode,
  onSaveMove,
}: DeviationPanelProps) {
  const [comment, setComment] = useState("");
  if (!session.deviation) return null;
  const expected = session.deviation.expected;

  return (
    <div className="repertoire-deviation">
      <div className="repertoire-deviation-head">
        <Compass size={16} /> Bạn đi <strong>{session.deviation.playedSan}</strong> — lệch repertoire
      </div>
      {expected.length > 0 && (
        <p className="repertoire-deviation-expected">
          Nước trong repertoire:{" "}
          {expected
            .slice()
            .sort((a, b) => b.frequency - a.frequency)
            .map((node) => node.move_san)
            .join(" · ")}
          {expected[0]?.comment ? ` — ${expected[0].comment}` : ""}
        </p>
      )}
      <div className="repertoire-deviation-actions">
        <button className="ghost-button" onClick={onBack}>
          <CornerUpLeft size={15} /> Quay lại repertoire
        </button>
        <button className="ghost-button" onClick={onReveal}>
          <Lightbulb size={15} /> Xem nước đúng &amp; đi tiếp
        </button>
        <button className="ghost-button" onClick={onFreeMode}>
          <Compass size={15} /> Phân tích tự do
        </button>
      </div>
      <div className="repertoire-deviation-save">
        <input
          type="text"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Ghi chú cho biến phụ (tùy chọn)"
          aria-label="Ghi chú biến phụ"
        />
        <button
          className="primary-button"
          onClick={() => onSaveMove(comment.trim() || null)}
          disabled={session.loading}
        >
          <Plus size={15} /> Lưu thành biến phụ
        </button>
      </div>
    </div>
  );
}
