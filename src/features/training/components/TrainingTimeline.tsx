import { Check, Circle, Lightbulb, Play } from "lucide-react";
import type { TrainingSession } from "../types";
import { canOpenTrainingSession, getTrainingTimelineState } from "../timeline";

type TrainingTimelineProps = {
  count: number;
  sessions: Record<number, TrainingSession>;
  latestIndex: number;
  viewedIndex: number;
  disabled: boolean;
  onSelect: (index: number) => void;
};

export function TrainingTimeline({
  count,
  sessions,
  latestIndex,
  viewedIndex,
  disabled,
  onSelect,
}: TrainingTimelineProps) {
  return (
    <div className="training-timeline">
      <div className="training-timeline-heading">
        <strong>Buổi luyện</strong>
        <span>{Object.values(sessions).filter((session) => session.feedback?.kind === "complete").length}/{count} đã làm</span>
        {viewedIndex !== latestIndex && (
          <button disabled={disabled} onClick={() => onSelect(latestIndex)}>Về bài hiện tại</button>
        )}
      </div>
      <div className="training-timeline-track" aria-label="Các bài trong buổi luyện">
        {Array.from({ length: count }, (_, index) => {
          const session = sessions[index];
          const state = getTrainingTimelineState(session, index, latestIndex);
          const selectable = canOpenTrainingSession(session, index, latestIndex);
          const icon = state === "completed"
            ? <Check size={12} />
            : state === "assisted"
              ? <Lightbulb size={11} />
              : state === "current"
                ? <Play size={11} />
                : <Circle size={8} />;
          return (
            <button
              className={`training-timeline-step ${state}${index === viewedIndex ? " viewed" : ""}`}
              disabled={disabled || !selectable}
              key={index}
              onClick={() => onSelect(index)}
              title={`Bài ${index + 1}${state === "assisted" ? " · hoàn tất có hỗ trợ" : state === "completed" ? " · hoàn tất sạch" : state === "current" ? " · đang luyện" : " · chưa làm"}`}
            >
              <span className="training-timeline-node">{icon}</span>
              <span className="training-timeline-index">{index + 1}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
