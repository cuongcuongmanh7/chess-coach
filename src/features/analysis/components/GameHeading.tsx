import { Clock3 } from "lucide-react";
import type { AnalysisStep } from "../../../analysis";
import type { OpeningInfo } from "../../../openings";
import { ChessTerm } from "../../../shared/components/ChessTerm";
import { formatSeconds } from "../../../shared/utils/format";
import { playerClocksAtStep } from "../playerClocks";

type PlayerColor = "w" | "b";

function PlayerHeading({
  color,
  name,
  elo,
  clock,
  showClock,
}: {
  color: PlayerColor;
  name: string;
  elo: string;
  clock: number | null;
  showClock: boolean;
}) {
  const isWhite = color === "w";
  const clockNode = showClock && (
    <span className={`player-clock ${clock === null ? "placeholder" : ""}`}>
      <Clock3 size={13} aria-hidden="true" />
      <strong>{clock === null ? "—:—" : formatSeconds(clock)}</strong>
    </span>
  );
  const statusNode = (
    <span className={`player-status-cluster ${isWhite ? "white-status" : "black-status"}`}>
      <i className="side-badge">{isWhite ? "Trắng" : "Đen"}</i>
      {clockNode}
    </span>
  );
  return (
    <div className={`matchup-player ${isWhite ? "white-player" : "black-player"}`}>
      {isWhite && statusNode}
      <span className="player-copy">
        <strong>{name}</strong>
        <small className="player-details">Elo {elo}</small>
      </span>
      {!isWhite && statusNode}
    </div>
  );
}

export function GameHeading({
  headers,
  currentOpening,
  steps,
  currentIndex,
}: {
  headers: Record<string, string>;
  currentOpening: OpeningInfo | null;
  steps: AnalysisStep[];
  currentIndex: number;
}) {
  const clocks = playerClocksAtStep(steps, currentIndex);
  const showClock = steps.some((step) => step.clockSeconds !== null);
  return (
    <section className="game-heading">
      <div className="eyebrow game-event">{headers.Event || "Ván cờ đã nhập"}</div>
      <div className="game-matchup">
        <PlayerHeading color="w" name={headers.White || "Trắng"} elo={headers.WhiteElo || "—"} clock={clocks.w} showClock={showClock} />
        <div className="matchup-center">
          <span className="match-result">{headers.Result || "*"}</span>
          <div className="match-context">
            <span className="match-opening-context">
              <ChessTerm term="eco">{currentOpening?.eco || headers.ECO || "ECO —"}</ChessTerm>
              {currentOpening && <span className="match-opening" title={currentOpening.name}>{currentOpening.name}</span>}
            </span>
            <span>{headers.TimeControl ? `${headers.TimeControl}s` : "Không rõ thời gian"}</span>
          </div>
        </div>
        <PlayerHeading color="b" name={headers.Black || "Đen"} elo={headers.BlackElo || "—"} clock={clocks.b} showClock={showClock} />
      </div>
    </section>
  );
}
