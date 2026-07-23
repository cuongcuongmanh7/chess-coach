import { useMemo, type KeyboardEvent } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatSeconds } from "../../../shared/utils/format";
import {
  CHART_LIMIT_PAWNS,
  evaluationForPerspective,
  scoreForPerspective,
} from "../model";
import { STORY_QUALITY_COLORS, STORY_QUALITY_LABELS } from "../presentation";
import type { GameStoryPoint, StoryPerspective } from "../types";

type GameStoryChartProps = {
  points: GameStoryPoint[];
  perspective: StoryPerspective;
  currentIndex: number;
  showTime: boolean;
  showQuickErrors: boolean;
  showPressureErrors: boolean;
  onSelectIndex: (index: number) => void;
  onOpenIndex: (index: number) => void;
};

type StoryDotProps = {
  cx?: number;
  cy?: number;
  payload?: GameStoryPoint;
};

function StoryDot({ cx, cy, payload }: StoryDotProps) {
  if (cx === undefined || cy === undefined || !payload) return null;
  const isError = ["inaccuracy", "mistake", "blunder"].includes(payload.quality);
  return (
    <circle
      cx={cx}
      cy={cy}
      r={isError ? 4 : 2.4}
      fill={STORY_QUALITY_COLORS[payload.quality]}
      stroke="#0c1512"
      strokeWidth={isError ? 1.7 : 1}
    />
  );
}

function StoryTooltip({ active, payload }: TooltipContentProps) {
  const point = payload?.[0]?.payload as GameStoryPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="game-story-tooltip">
      <div>
        <strong>{point.moveLabel}</strong>
        <span className={point.quality}>{STORY_QUALITY_LABELS[point.quality]}</span>
      </div>
      <dl>
        <div><dt>Evaluation</dt><dd>{point.evaluation}</dd></div>
        <div><dt>CPL</dt><dd>{Math.round(point.centipawnLoss)}</dd></div>
        {point.thinkTimeSeconds !== null && (
          <div><dt>Suy nghĩ</dt><dd>{formatSeconds(point.thinkTimeSeconds)}</dd></div>
        )}
        {point.clockSeconds !== null && (
          <div><dt>Còn lại</dt><dd>{formatSeconds(point.clockSeconds)}</dd></div>
        )}
      </dl>
      {(point.isQuickError || point.isPressureError) && (
        <p>{point.isQuickError ? "Lỗi khi đi nhanh" : "Lỗi dưới áp lực thời gian"}</p>
      )}
    </div>
  );
}

function formatEvaluationTick(value: number) {
  if (value === 0) return "0";
  return `${value > 0 ? "+" : "−"}${Math.abs(value)}`;
}

export function GameStoryChart({
  points,
  perspective,
  currentIndex,
  showTime,
  showQuickErrors,
  showPressureErrors,
  onSelectIndex,
  onOpenIndex,
}: GameStoryChartProps) {
  const displayPoints = useMemo(() => points.map((point) => ({
    ...point,
    evaluation: evaluationForPerspective(point.evaluation, point.rawCp, perspective),
    chartPawns: scoreForPerspective(point.chartPawns, perspective),
  })), [perspective, points]);
  const currentPoint = displayPoints.find((point) => point.index === currentIndex);
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const activePosition = Math.max(0, points.findIndex((point) => point.index === currentIndex));
    const delta = event.key === "ArrowLeft" ? -1 : 1;
    const next = points[Math.max(0, Math.min(points.length - 1, activePosition + delta))];
    if (next) onSelectIndex(next.index);
  };

  return (
    <div
      className="game-story-chart"
      tabIndex={0}
      role="application"
      aria-label="Biểu đồ evaluation. Dùng phím trái và phải để đổi nước."
      onKeyDown={handleKeyDown}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={displayPoints}
          margin={{ top: 12, right: showTime ? 34 : 12, bottom: 2, left: 0 }}
          onClick={(state) => {
            const point = points[Number(state.activeIndex)];
            if (point) onOpenIndex(point.index);
          }}
        >
          <defs>
            <linearGradient id="whiteAdvantage" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e7eee9" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#43d9a3" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#26372f" strokeDasharray="3 5" />
          <XAxis
            dataKey="ply"
            axisLine={false}
            tickLine={false}
            minTickGap={25}
            tick={{ fill: "#657970", fontSize: 9 }}
            tickFormatter={(ply) => String(Math.ceil(Number(ply) / 2))}
          />
          <YAxis
            yAxisId="evaluation"
            domain={[-CHART_LIMIT_PAWNS, CHART_LIMIT_PAWNS]}
            ticks={[-8, -4, 0, 4, 8]}
            width={28}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#71857b", fontSize: 9 }}
            tickFormatter={formatEvaluationTick}
          />
          <YAxis
            yAxisId="time"
            orientation="right"
            hide={!showTime}
            width={31}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#6285aa", fontSize: 8 }}
            tickFormatter={(value) => `${Math.round(Number(value))}s`}
          />
          <ReferenceLine yAxisId="evaluation" y={0} stroke="#7f9188" strokeOpacity={0.55} />
          {currentPoint && (
            <ReferenceLine
              yAxisId="evaluation"
              x={currentPoint.ply}
              stroke="#f6be49"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
          )}
          {showTime && (
            <Bar
              yAxisId="time"
              dataKey="thinkTimeSeconds"
              fill="#67a7ff"
              fillOpacity={0.16}
              maxBarSize={9}
              isAnimationActive={false}
            />
          )}
          <Area
            yAxisId="evaluation"
            type="linear"
            dataKey="chartPawns"
            stroke="#d9e5df"
            strokeWidth={2}
            fill="url(#whiteAdvantage)"
            isAnimationActive={false}
          />
          <Line
            yAxisId="evaluation"
            type="linear"
            dataKey="chartPawns"
            stroke="transparent"
            dot={<StoryDot />}
            activeDot={{ r: 6, fill: "#f6be49", stroke: "#fff1c7", strokeWidth: 2 }}
            isAnimationActive={false}
          />
          {showQuickErrors && displayPoints.filter((point) => point.isQuickError).map((point) => (
            <ReferenceDot
              key={`quick-${point.ply}`}
              yAxisId="evaluation"
              x={point.ply}
              y={point.chartPawns}
              r={7}
              fill="transparent"
              stroke="#67a7ff"
              strokeWidth={1.6}
            />
          ))}
          {showPressureErrors && displayPoints.filter((point) => point.isPressureError).map((point) => (
            <ReferenceDot
              key={`pressure-${point.ply}`}
              yAxisId="evaluation"
              x={point.ply}
              y={point.chartPawns}
              r={9}
              fill="transparent"
              stroke="#c58cff"
              strokeWidth={1.4}
              strokeDasharray="3 2"
            />
          ))}
          <Tooltip
            content={StoryTooltip}
            cursor={{ stroke: "#f6be49", strokeOpacity: 0.45 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="game-story-axis-labels" aria-hidden="true">
        <span>{perspective === "white" ? "TRẮNG" : "ĐEN"}</span>
        <span>{perspective === "white" ? "ĐEN" : "TRẮNG"}</span>
      </div>
    </div>
  );
}
