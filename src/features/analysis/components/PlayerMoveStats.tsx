import { QUALITY_LABELS } from "../../../app/constants";
import { MoveQualityIcon } from "./MoveQualityIcon";
import {
  PLAYER_MOVE_QUALITY_ORDER,
  type PlayerMoveStats as PlayerMoveStatsValue,
} from "../playerMoveStats";

type PlayerMoveStatsProps = {
  playerName: string;
  stats: PlayerMoveStatsValue;
};

const SHORT_QUALITY_LABELS = {
  brilliant: "Brilliant",
  best: "Best",
  good: "Tốt",
  inaccuracy: "Thiếu CX",
  mistake: "Sai",
  blunder: "Blunder",
} satisfies typeof QUALITY_LABELS;

export function PlayerMoveStats({ playerName, stats }: PlayerMoveStatsProps) {
  const visible = PLAYER_MOVE_QUALITY_ORDER.filter((quality) => stats[quality] > 0);
  if (!visible.length) return null;
  return (
    <section className="player-move-stats" aria-label={`Thống kê nước đi của ${playerName}`}>
      <div className="player-move-stats-track">
        {visible.map((quality) => (
          <span className="player-move-stat" key={quality}>
            <MoveQualityIcon quality={quality} />
            <strong>{stats[quality]}</strong>
            <em className="player-move-stat-label-full">{QUALITY_LABELS[quality]}</em>
            <em className="player-move-stat-label-short" aria-hidden="true">
              {SHORT_QUALITY_LABELS[quality]}
            </em>
          </span>
        ))}
      </div>
    </section>
  );
}
