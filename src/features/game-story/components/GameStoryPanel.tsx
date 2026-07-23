import { useMemo, useState } from "react";
import { Activity, ChevronRight, Clock3, Gauge, Sparkles, Timer, Zap } from "lucide-react";
import type { AnalysisStep } from "../../../analysis";
import type { DisplayMoveQuality } from "../../analysis/moveClassification";
import type { EngineMoveAnalysis } from "../../../stockfish";
import { buildGameStory, evaluationForPerspective } from "../model";
import { STORY_QUALITY_COLORS, STORY_QUALITY_LABELS } from "../presentation";
import type { StoryPerspective } from "../types";
import { GameStoryChart } from "./GameStoryChart";

type GameStoryPanelProps = {
  steps: AnalysisStep[];
  engineCache: Record<number, EngineMoveAnalysis>;
  initialPerspective: StoryPerspective;
  currentIndex: number;
  onSelectIndex: (index: number) => void;
  onOpenIndex: (index: number) => void;
};

export function GameStoryPanel({
  steps,
  engineCache,
  initialPerspective,
  currentIndex,
  onSelectIndex,
  onOpenIndex,
}: GameStoryPanelProps) {
  const story = useMemo(() => buildGameStory(steps, engineCache), [engineCache, steps]);
  const [showTime, setShowTime] = useState(story.hasTimeData);
  const [showQuickErrors, setShowQuickErrors] = useState(true);
  const [showPressureErrors, setShowPressureErrors] = useState(true);
  const [perspective, setPerspective] = useState<StoryPerspective>(initialPerspective);
  if (!story.points.length) return null;

  return (
    <section className="game-story" aria-labelledby="game-story-title">
      <header className="game-story-header">
        <div>
          <i><Activity size={18} /></i>
          <span>
            <strong id="game-story-title">Game Story</strong>
            <small>{story.keyMoments.length} thời điểm đáng chú ý · góc nhìn {perspective === "white" ? "Trắng" : "Đen"}</small>
          </span>
        </div>
        <div className="game-story-toolbar">
          <div className="perspective-switch" role="group" aria-label="Góc nhìn biểu đồ">
            <span>Góc nhìn</span>
            {(["white", "black"] as const).map((side) => (
              <button
                key={side}
                className={perspective === side ? "active" : ""}
                onClick={() => setPerspective(side)}
                aria-pressed={perspective === side}
              >
                {side === "white" ? "Trắng" : "Đen"}
              </button>
            ))}
          </div>
          <div className="game-story-controls" aria-label="Tùy chọn biểu đồ">
            <button
              className={showTime ? "active" : ""}
              onClick={() => setShowTime((value) => !value)}
              disabled={!story.hasTimeData}
              aria-pressed={showTime}
            >
              <Clock3 size={13} /> Thời gian
            </button>
            <button
              className={showQuickErrors ? "active" : ""}
              onClick={() => setShowQuickErrors((value) => !value)}
              disabled={!story.hasTimeData}
              aria-pressed={showQuickErrors}
            >
              <Zap size={13} /> Đi nhanh
            </button>
            <button
              className={showPressureErrors ? "active" : ""}
              onClick={() => setShowPressureErrors((value) => !value)}
              disabled={!story.hasTimeData}
              aria-pressed={showPressureErrors}
            >
              <Timer size={13} /> Áp lực
            </button>
          </div>
        </div>
      </header>

      <div className="game-story-layout">
        <GameStoryChart
          points={story.points}
          perspective={perspective}
          currentIndex={currentIndex}
          showTime={showTime}
          showQuickErrors={showQuickErrors}
          showPressureErrors={showPressureErrors}
          onSelectIndex={onSelectIndex}
          onOpenIndex={onOpenIndex}
        />

        <aside className="key-moments" aria-label="Các thời điểm đáng chú ý">
          <div className="key-moments-heading">
            <span><Sparkles size={14} /> Key moments</span>
            <small>Chọn để mở trên bàn cờ</small>
          </div>
          <div className="key-moments-list">
            {story.keyMoments.length ? story.keyMoments.map((moment) => (
              <button
                key={moment.ply}
                className={currentIndex === moment.index ? "active" : ""}
                onClick={() => onOpenIndex(moment.index)}
              >
                <span className="key-moment-index">{moment.moveLabel}</span>
                <span className="key-moment-copy">
                  <strong>{moment.title}</strong>
                  <small>{moment.description}</small>
                </span>
                <i>{evaluationForPerspective(
                  moment.evaluation,
                  story.points.find((point) => point.index === moment.index)?.rawCp || 0,
                  perspective,
                )}</i>
                <ChevronRight size={14} />
              </button>
            )) : (
              <div className="key-moments-empty">
                <Gauge size={20} />
                <span>Ván đấu không có biến động lớn theo các ngưỡng hiện tại.</span>
              </div>
            )}
          </div>
        </aside>
      </div>

      <footer className="game-story-legend">
        {(Object.keys(STORY_QUALITY_COLORS) as DisplayMoveQuality[]).map((quality) => (
          <span key={quality}><i style={{ background: STORY_QUALITY_COLORS[quality] }} />{STORY_QUALITY_LABELS[quality]}</span>
        ))}
        <em>Click biểu đồ để mở vị trí · ← → để duyệt</em>
      </footer>
    </section>
  );
}
