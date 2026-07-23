import type { OpeningInfo } from "../../openings";
import type {
  SavedGameSummary,
  SyncPlatform,
} from "../../shared/types/tauri";

export type GameOutcome = {
  kind: "win" | "loss" | "draw" | "unknown";
  label: "Thắng" | "Thua" | "Hòa" | "Chưa rõ";
  side: "Trắng" | "Đen" | null;
};

export function gameOutcomeForProfile(
  game: SavedGameSummary,
  username?: string,
): GameOutcome {
  const normalizedUsername = username?.trim().toLocaleLowerCase();
  const isWhite = Boolean(
    normalizedUsername && game.white.trim().toLocaleLowerCase() === normalizedUsername,
  );
  const isBlack = Boolean(
    normalizedUsername && game.black.trim().toLocaleLowerCase() === normalizedUsername,
  );
  const side = isWhite ? "Trắng" : isBlack ? "Đen" : null;

  if (["1/2-1/2", "½-½", "0.5-0.5"].includes(game.result || "")) {
    return { kind: "draw", label: "Hòa", side };
  }
  if (game.result === "1-0") {
    if (isWhite) return { kind: "win", label: "Thắng", side };
    if (isBlack) return { kind: "loss", label: "Thua", side };
  }
  if (game.result === "0-1") {
    if (isBlack) return { kind: "win", label: "Thắng", side };
    if (isWhite) return { kind: "loss", label: "Thua", side };
  }
  return { kind: "unknown", label: "Chưa rõ", side };
}

export function getPgnPlayedAt(headers: Record<string, string>) {
  const rawDate = headers.UTCDate || headers.EndDate || headers.Date;
  const dateMatch = rawDate?.match(/^(\d{4})[.-](\d{2})[.-](\d{2})$/);
  if (!dateMatch) return null;
  const date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  const rawTime = headers.UTCTime || headers.EndTime || headers.StartTime;
  const timeMatch = rawTime?.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
  return timeMatch
    ? `${date} ${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3] || "00"}`
    : date;
}

export function openingFromHeaders(
  headers: Record<string, string>,
): OpeningInfo | null {
  const name = headers.Opening;
  if (!name) return null;
  const separator = name.indexOf(":");
  return {
    eco: headers.ECO || "ECO —",
    name,
    family: separator < 0 ? name : name.slice(0, separator),
    variation: separator < 0 ? null : name.slice(separator + 1).trim(),
  };
}

export function inferTimeClass(timeControl?: string) {
  const match = timeControl?.match(/^(\d+)(?:\+(\d+))?$/);
  if (!match) return null;
  const estimated = Number(match[1]) + Number(match[2] || 0) * 40;
  if (estimated < 180) return "bullet";
  if (estimated < 600) return "blitz";
  if (estimated < 1800) return "rapid";
  return "classical";
}

export function inferSourcePlatform(
  value?: string | null,
): SyncPlatform | null {
  if (!value) return null;
  if (/lichess\.org/i.test(value)) return "lichess";
  if (/chess\.com/i.test(value)) return "chesscom";
  return null;
}

export function isChessComLink(value: string) {
  return /^https?:\/\/(?:www\.)?chess\.com\/game\/(?:live|daily)\/\d+/i.test(value.trim());
}
