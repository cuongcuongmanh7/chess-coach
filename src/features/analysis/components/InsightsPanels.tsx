import { useMemo } from "react";
import { Clock } from "lucide-react";
import {
  hourInsights,
  lengthInsights,
  openingInsights,
  overallTotals,
  type InsightsGame,
} from "../insights";

function scoreTone(score: number): string {
  if (score >= 55) return "good";
  if (score <= 45) return "bad";
  return "warn";
}

function WdlBar({ wins, draws, losses, games }: { wins: number; draws: number; losses: number; games: number }) {
  const width = (value: number) => (games ? `${(value / games) * 100}%` : "0%");
  return (
    <span className="insights-bar" aria-hidden="true">
      <b className="win" style={{ width: width(wins) }} />
      <b className="draw" style={{ width: width(draws) }} />
      <b className="loss" style={{ width: width(losses) }} />
    </span>
  );
}

export function InsightsResultsPanel({ games, username }: { games: InsightsGame[]; username?: string | null }) {
  const overall = useMemo(() => overallTotals(games, username), [games, username]);
  const openings = useMemo(() => openingInsights(games, username), [games, username]);
  if (!overall.games) {
    return <p className="insights-empty">Chưa xác định được kết quả ván cho hồ sơ này. Kết quả cần tên người chơi khớp header PGN.</p>;
  }
  return (
    <div className="insights-panel">
      <div className="insights-overall">
        <div><strong>{overall.games}</strong><span>Ván tính kết quả</span></div>
        <div><strong className="win">{overall.wins}</strong><span>Thắng</span></div>
        <div><strong>{overall.draws}</strong><span>Hòa</span></div>
        <div><strong className="loss">{overall.losses}</strong><span>Bại</span></div>
        <div><strong>{overall.scoreRate}%</strong><span>Điểm số</span></div>
      </div>
      <section className="dashboard-section">
        <h3>Khai cuộc theo kết quả</h3>
        <div className="insights-table">
          {openings.map((row) => (
            <div className="insights-row" key={row.key}>
              <span className="insights-open" title={row.key}>{row.key}</span>
              <span className="insights-wdl"><i className="win">{row.wins}</i>·<i>{row.draws}</i>·<i className="loss">{row.losses}</i></span>
              <WdlBar wins={row.wins} draws={row.draws} losses={row.losses} games={row.games} />
              <strong className={`insights-score ${scoreTone(row.scoreRate)}`}>{row.scoreRate}%</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function InsightsRhythmPanel({ games, username }: { games: InsightsGame[]; username?: string | null }) {
  const hours = useMemo(() => hourInsights(games, username), [games, username]);
  const lengths = useMemo(() => lengthInsights(games, username), [games, username]);
  const maxHourGames = Math.max(1, ...hours.buckets.map((bucket) => bucket.games));
  return (
    <div className="insights-panel">
      <section className="dashboard-section">
        <h3><Clock size={14} /> Điểm số theo khung giờ (giờ máy)</h3>
        {hours.available ? (
          <div className="insights-hours">
            {hours.buckets.map((bucket) => (
              <div className="insights-hour" key={bucket.hour} title={`${bucket.hour}h · ${bucket.games} ván · ${bucket.scoreRate}%`}>
                <i className={scoreTone(bucket.scoreRate)} style={{ height: `${Math.max(6, bucket.scoreRate)}%`, opacity: 0.35 + (bucket.games / maxHourGames) * 0.65 }} />
                <span>{bucket.hour}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="insights-empty">Các ván không kèm giờ (PGN thiếu UTCTime), nên chưa vẽ được biểu đồ theo khung giờ.</p>
        )}
      </section>
      <section className="dashboard-section">
        <h3>Kết quả theo độ dài ván</h3>
        <div className="insights-table">
          {lengths.map((row) => (
            <div className="insights-row" key={row.label}>
              <span className="insights-open">{row.label}</span>
              <span className="insights-wdl"><i className="win">{row.wins}</i>·<i>{row.draws}</i>·<i className="loss">{row.losses}</i></span>
              <WdlBar wins={row.wins} draws={row.draws} losses={row.losses} games={row.games} />
              <strong className={`insights-score ${scoreTone(row.scoreRate)}`}>{row.scoreRate}%</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
