// Analytics hành vi dựng hoàn toàn từ savedGames (kết quả ván, giờ chơi, opening,
// độ dài) — không cần engine, không gọi AI. Hàm thuần để test dễ.

export type InsightsGame = {
  white: string | null;
  black: string | null;
  result: string | null;
  opening: string | null;
  eco: string | null;
  time_class: string | null;
  played_at: string | null;
  ply_count: number | null;
};

export type Outcome = "win" | "draw" | "loss" | "unknown";

export type OutcomeTotals = {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  scoreRate: number;
};

export type OpeningInsight = OutcomeTotals & { key: string };
export type HourInsight = { hour: number; games: number; scoreRate: number };
export type LengthInsight = OutcomeTotals & { label: string };

export function colorForUsername(
  white: string | null,
  black: string | null,
  username: string | null | undefined,
): "w" | "b" | null {
  const normalized = username?.trim().toLocaleLowerCase();
  if (!normalized) return null;
  if (white?.trim().toLocaleLowerCase() === normalized) return "w";
  if (black?.trim().toLocaleLowerCase() === normalized) return "b";
  return null;
}

export function outcomeFor(result: string | null, color: "w" | "b" | null): Outcome {
  if (!color || !result) return "unknown";
  if (result === "1/2-1/2") return "draw";
  if (result === "1-0") return color === "w" ? "win" : "loss";
  if (result === "0-1") return color === "b" ? "win" : "loss";
  return "unknown";
}

function totals(outcomes: Outcome[]): OutcomeTotals {
  const wins = outcomes.filter((item) => item === "win").length;
  const draws = outcomes.filter((item) => item === "draw").length;
  const losses = outcomes.filter((item) => item === "loss").length;
  const games = wins + draws + losses;
  return {
    games,
    wins,
    draws,
    losses,
    scoreRate: games ? Math.round(((wins + draws * 0.5) / games) * 100) : 0,
  };
}

// Giờ địa phương từ played_at dạng "YYYY-MM-DD HH:MM:SS" (UTC). Trả null nếu
// chuỗi chỉ có ngày (không suy ra được giờ).
export function localHourFromPlayedAt(playedAt: string | null): number | null {
  if (!playedAt || playedAt.trim().length <= 10) return null;
  const parsed = new Date(`${playedAt.replace(" ", "T")}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getHours();
}

function decided(
  games: InsightsGame[],
  username: string | null | undefined,
): Array<{ game: InsightsGame; outcome: Outcome }> {
  return games
    .map((game) => ({ game, outcome: outcomeFor(game.result, colorForUsername(game.white, game.black, username)) }))
    .filter((entry) => entry.outcome !== "unknown");
}

export function overallTotals(games: InsightsGame[], username: string | null | undefined): OutcomeTotals {
  return totals(decided(games, username).map((entry) => entry.outcome));
}

export function openingInsights(
  games: InsightsGame[],
  username: string | null | undefined,
  limit = 8,
): OpeningInsight[] {
  const groups = new Map<string, Outcome[]>();
  decided(games, username).forEach(({ game, outcome }) => {
    const key = game.opening || game.eco || "Không rõ khai cuộc";
    groups.set(key, [...(groups.get(key) || []), outcome]);
  });
  return [...groups.entries()]
    .map(([key, outcomes]) => ({ key, ...totals(outcomes) }))
    .sort((left, right) => right.games - left.games)
    .slice(0, limit);
}

export function hourInsights(
  games: InsightsGame[],
  username: string | null | undefined,
): { available: boolean; buckets: HourInsight[] } {
  const byHour = new Map<number, Outcome[]>();
  decided(games, username).forEach(({ game, outcome }) => {
    const hour = localHourFromPlayedAt(game.played_at);
    if (hour === null) return;
    byHour.set(hour, [...(byHour.get(hour) || []), outcome]);
  });
  const buckets = [...byHour.entries()]
    .map(([hour, outcomes]) => ({ hour, ...totals(outcomes) }))
    .map(({ hour, games: count, scoreRate }) => ({ hour, games: count, scoreRate }))
    .sort((left, right) => left.hour - right.hour);
  return { available: buckets.length > 0, buckets };
}

export function lengthInsights(
  games: InsightsGame[],
  username: string | null | undefined,
): LengthInsight[] {
  const buckets: Array<{ label: string; max: number }> = [
    { label: "Dưới 20 nước", max: 20 },
    { label: "20–39 nước", max: 40 },
    { label: "40–59 nước", max: 60 },
    { label: "60+ nước", max: Infinity },
  ];
  const grouped = buckets.map((bucket) => ({ bucket, outcomes: [] as Outcome[] }));
  decided(games, username).forEach(({ game, outcome }) => {
    const moves = Math.ceil((game.ply_count || 0) / 2);
    const target = grouped.find((entry) => moves < entry.bucket.max) || grouped[grouped.length - 1];
    target.outcomes.push(outcome);
  });
  return grouped
    .filter((entry) => entry.outcomes.length > 0)
    .map((entry) => ({ label: entry.bucket.label, ...totals(entry.outcomes) }));
}
