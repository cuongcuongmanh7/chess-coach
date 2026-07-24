import { Star } from "lucide-react";
import type { DisplayMoveQuality } from "../moveClassification";
import { BOARD_MOVE_BADGES } from "../boardUtils";

function BlunderMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.2">
        <path d="M2.8 7.2C2.8 5.3 4.3 4 6.4 4s3.6 1.2 3.6 3.1c0 1.4-.7 2.2-1.9 2.9-.9.6-1.3 1.1-1.3 2.1v.3" />
        <path d="M13.1 7.2c0-1.9 1.5-3.2 3.6-3.2s3.6 1.2 3.6 3.1c0 1.4-.7 2.2-1.9 2.9-.9.6-1.3 1.1-1.3 2.1v.3" />
      </g>
      <g fill="currentColor">
        <circle cx="6.8" cy="16.8" r="1.25" />
        <circle cx="17.1" cy="16.8" r="1.25" />
      </g>
    </svg>
  );
}

export function MoveQualityIcon({
  quality,
  title,
}: {
  quality: DisplayMoveQuality;
  title?: string;
}) {
  const badge = BOARD_MOVE_BADGES[quality];
  return (
    <span
      className={`move-quality-badge ${quality}`}
      aria-label={title || badge.label}
      title={title || badge.label}
    >
      {quality === "best"
        ? <Star aria-hidden="true" fill="currentColor" strokeWidth={2.2} />
        : quality === "blunder"
          ? <BlunderMark />
          : <b aria-hidden="true">{badge.symbol}</b>}
    </span>
  );
}
