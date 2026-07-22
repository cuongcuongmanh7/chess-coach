import type { MoveQuality, Phase } from "./analysis";

export type DashboardMoveRecord = {
  game_id: string;
  date: string | null;
  eco: string | null;
  opening: string | null;
  time_control: string | null;
  time_class: string | null;
  player_color: "w" | "b";
  phase: Phase;
  quality: MoveQuality;
  centipawn_loss: number;
  think_time_seconds: number | null;
  is_quick: boolean;
  is_time_pressure: boolean;
  tags: string[];
};

type Breakdown = {
  label: string;
  moves: number;
  acpl: number;
  errors: number;
};

export type DashboardStats = {
  games: number;
  moves: number;
  acpl: number;
  bestGoodRate: number;
  errors: number;
  timeline: Array<{ id: string; date: string; acpl: number }>;
  phases: Breakdown[];
  colors: Breakdown[];
  timeClasses: Breakdown[];
  openings: Breakdown[];
  weaknesses: Array<{ label: string; count: number }>;
  timedMoves: number;
  averageThinkTime: number;
  quickErrors: number;
  pressureErrors: number;
};

const isError = (quality: MoveQuality) => quality === "mistake" || quality === "blunder";

function summarize(label: string, records: DashboardMoveRecord[]): Breakdown {
  return {
    label,
    moves: records.length,
    acpl: records.length
      ? Math.round(records.reduce((sum, item) => sum + item.centipawn_loss, 0) / records.length)
      : 0,
    errors: records.filter((item) => isError(item.quality)).length,
  };
}
function groupBreakdown(
  records: DashboardMoveRecord[],
  labelFor: (record: DashboardMoveRecord) => string,
  limit = 8,
) {
  const groups = new Map<string, DashboardMoveRecord[]>();
  records.forEach((record) => {
    const label = labelFor(record);
    groups.set(label, [...(groups.get(label) || []), record]);
  });
  return [...groups.entries()]
    .map(([label, items]) => summarize(label, items))
    .sort((left, right) => right.moves - left.moves)
    .slice(0, limit);
}

export function buildDashboardStats(records: DashboardMoveRecord[]): DashboardStats {
  const games = new Map<string, DashboardMoveRecord[]>();
  records.forEach((record) => games.set(record.game_id, [...(games.get(record.game_id) || []), record]));
  const errors = records.filter((item) => isError(item.quality));
  const timed = records.filter((item) => item.think_time_seconds !== null);
  const weaknessCounts = new Map<string, number>();
  errors.forEach((record) => record.tags.forEach((tag) => weaknessCounts.set(tag, (weaknessCounts.get(tag) || 0) + 1)));

  const timeline = [...games.entries()]
    .map(([id, items]) => ({
      id,
      date: items[0]?.date || "Không rõ ngày",
      acpl: Math.round(items.reduce((sum, item) => sum + item.centipawn_loss, 0) / Math.max(1, items.length)),
    }))
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-20);

  const bestGood = records.filter((item) => item.quality === "best" || item.quality === "good").length;
  return {
    games: games.size,
    moves: records.length,
    acpl: records.length
      ? Math.round(records.reduce((sum, item) => sum + item.centipawn_loss, 0) / records.length)
      : 0,
    bestGoodRate: records.length ? Math.round((bestGood / records.length) * 100) : 0,
    errors: errors.length,
    timeline,
    phases: groupBreakdown(records, (item) => item.phase, 3),
    colors: groupBreakdown(records, (item) => item.player_color === "w" ? "Cầm Trắng" : "Cầm Đen", 2),
    timeClasses: groupBreakdown(records, (item) => item.time_class || item.time_control || "Không rõ"),
    openings: groupBreakdown(records, (item) => item.opening || item.eco || "Không rõ khai cuộc", 6),
    weaknesses: [...weaknessCounts.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 6),
    timedMoves: timed.length,
    averageThinkTime: timed.length
      ? Math.round(timed.reduce((sum, item) => sum + (item.think_time_seconds || 0), 0) / timed.length)
      : 0,
    quickErrors: errors.filter((item) => item.is_quick).length,
    pressureErrors: errors.filter((item) => item.is_time_pressure).length,
  };
}
