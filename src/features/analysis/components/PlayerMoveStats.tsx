import type { DisplayMoveQuality } from "../moveClassification";
import {
  PLAYER_MOVE_QUALITY_ORDER,
  type PlayerMoveStats as PlayerMoveStatsValue,
} from "../playerMoveStats";

const PRESENTATION: Record<DisplayMoveQuality, { label: string; symbol: string }> = {
  brilliant: { label: "Tuyệt vời", symbol: "!" },
  best: { label: "Tốt nhất", symbol: "★" },
  good: { label: "Tốt", symbol: "✓" },
  inaccuracy: { label: "Thiếu chính xác", symbol: "?!" },
  mistake: { label: "Lỗi", symbol: "×" },
  blunder: { label: "Blunder", symbol: "××" },
};

type PlayerMoveStatsProps = {
  playerName: string;
  stats: PlayerMoveStatsValue;
};

export function PlayerMoveStats({ playerName, stats }: PlayerMoveStatsProps) {
  const visible = PLAYER_MOVE_QUALITY_ORDER.filter((quality) => stats[quality] > 0);
  if (!visible.length) return null;
  return (
    <section className="player-move-stats" aria-label={`Thống kê nước đi của ${playerName}`}>
      {visible.map((quality) => {
        const item = PRESENTATION[quality];
        return (
          <span className={`player-move-stat ${quality}`} key={quality}>
            <i aria-hidden="true"><b>{item.symbol}</b></i>
            <strong>{stats[quality]}</strong>
            <em>{item.label}</em>
          </span>
        );
      })}
    </section>
  );
}
