export function evaluationToWhitePercent(whiteScoreCp?: number) {
  if (whiteScoreCp === undefined) return 50;
  const clampedScore = Math.max(-2000, Math.min(2000, whiteScoreCp));
  const probability = 100 / (1 + Math.exp(-0.00368208 * clampedScore));
  return Math.max(3, Math.min(97, probability));
}

export function formatVietnamDate(
  value?: string | null,
  includeTime = Boolean(value?.includes(":")),
) {
  if (!value) return "—";
  const dateOnly = value.trim().match(/^(\d{4})[.-](\d{2})[.-](\d{2})$/);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;

  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
  const normalized = value.trim().replace(" ", "T") + (hasTimezone ? "" : "Z");
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return value;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(parsed).map((part) => [part.type, part.value]));
  return `${parts.day}/${parts.month}/${parts.year}${includeTime ? ` ${parts.hour}:${parts.minute}` : ""}`;
}

export function formatSeconds(value: number | null) {
  if (value === null) return "—";
  if (value < 60) return `${Math.round(value)} giây`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
