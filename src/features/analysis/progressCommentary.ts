// Bình luận/kết luận cho modal "Tiến bộ" — sinh hoàn toàn client-side từ số liệu
// đã tính (DashboardStats + insights), không gọi AI. Giọng HLV ngắn gọn, luôn dùng
// chữ số. Hàm thuần để dễ test, khớp phong cách insights.ts.

import type { DashboardStats } from "../../dashboard";
import type { HourInsight, LengthInsight, OpeningInsight, OutcomeTotals } from "./insights";

function acplBand(acpl: number): string {
  if (acpl < 30) return "rất tốt";
  if (acpl < 60) return "khá ổn";
  if (acpl < 100) return "cần cải thiện";
  return "còn nhiều sai sót";
}

function averageAcpl(points: Array<{ acpl: number }>): number {
  if (!points.length) return 0;
  return Math.round(points.reduce((sum, point) => sum + point.acpl, 0) / points.length);
}

export function qualityCommentary(stats: DashboardStats): string[] {
  const lines: string[] = [];
  if (stats.moves === 0) return lines;

  lines.push(
    `ACPL cá nhân trung bình ${stats.acpl} (${acplBand(stats.acpl)}), tỉ lệ nước hay/tốt đạt ${stats.bestGoodRate}% trên ${stats.games} ván (${stats.moves} nước).`,
  );

  if (stats.timeline.length >= 4) {
    const mid = Math.floor(stats.timeline.length / 2);
    const early = averageAcpl(stats.timeline.slice(0, mid));
    const late = averageAcpl(stats.timeline.slice(mid));
    const diff = early - late;
    if (diff >= 8) lines.push(`Xu hướng đang tiến bộ: ACPL giảm từ ${early} xuống ${late} ở nửa gần đây.`);
    else if (diff <= -8) lines.push(`Cần chú ý: ACPL tăng từ ${early} lên ${late} ở nửa gần đây.`);
    else lines.push(`Phong độ đi ngang: ACPL quanh mức ${late} ở các ván gần đây.`);
  }

  const phases = stats.phases.filter((phase) => phase.moves > 0);
  if (phases.length >= 2) {
    const worst = phases.reduce((acc, phase) => (phase.acpl > acc.acpl ? phase : acc));
    const best = phases.reduce((acc, phase) => (phase.acpl < acc.acpl ? phase : acc));
    lines.push(
      `Chắc nhất ở ${best.label} (${best.acpl} ACPL), yếu nhất ở ${worst.label} (${worst.acpl} ACPL) — nên ưu tiên luyện ${worst.label.toLowerCase()}.`,
    );
  }

  const colors = stats.colors.filter((color) => color.moves > 0);
  if (colors.length === 2) {
    const [worse, better] = colors[0].acpl >= colors[1].acpl ? [colors[0], colors[1]] : [colors[1], colors[0]];
    if (worse.acpl - better.acpl >= 10) {
      lines.push(`Khi ${worse.label.toLowerCase()} chơi kém hơn rõ (${worse.acpl} ACPL so với ${better.acpl}).`);
    }
  }

  const openings = stats.openings.filter((opening) => opening.moves >= 10);
  if (openings.length) {
    const worstOpening = openings.reduce((acc, opening) => (opening.acpl > acc.acpl ? opening : acc));
    if (worstOpening.acpl >= 60) {
      lines.push(`Khai cuộc gặp khó nhất: ${worstOpening.label} (${worstOpening.acpl} ACPL trên ${worstOpening.moves} nước).`);
    }
  }

  if (stats.weaknesses.length) {
    const top = stats.weaknesses.slice(0, 3).map((item) => `${item.label} (${item.count} lần)`).join(", ");
    lines.push(`Chủ đề cần ưu tiên luyện tập: ${top}.`);
  }

  if (stats.timedMoves > 0) {
    const issues: string[] = [];
    if (stats.quickErrors > 0) issues.push(`${stats.quickErrors} lỗi do đi vội (≤ 3 giây)`);
    if (stats.pressureErrors > 0) issues.push(`${stats.pressureErrors} lỗi dưới áp lực thời gian`);
    if (issues.length) {
      lines.push(`Quản lý thời gian: ${issues.join(" và ")}; thời gian nghĩ trung bình ${stats.averageThinkTime}s/nước.`);
    } else {
      lines.push(`Quản lý thời gian tốt: gần như không mắc lỗi khi đi vội hay dưới áp lực (trung bình ${stats.averageThinkTime}s/nước).`);
    }
  }

  return lines;
}

export function resultsCommentary(overall: OutcomeTotals, openings: OpeningInsight[]): string[] {
  const lines: string[] = [];
  if (!overall.games) return lines;

  const tone = overall.scoreRate >= 55
    ? "đang thắng nhiều hơn thua"
    : overall.scoreRate <= 45
      ? "đang thua nhiều hơn thắng"
      : "khá cân bằng";
  lines.push(
    `Điểm số tổng ${overall.scoreRate}% trên ${overall.games} ván (${overall.wins} thắng · ${overall.draws} hòa · ${overall.losses} bại) — ${tone}.`,
  );

  const enough = openings.filter((opening) => opening.games >= 3);
  if (enough.length >= 2) {
    const best = enough.reduce((acc, opening) => (opening.scoreRate > acc.scoreRate ? opening : acc));
    const worst = enough.reduce((acc, opening) => (opening.scoreRate < acc.scoreRate ? opening : acc));
    if (best.key !== worst.key) {
      lines.push(
        `Hiệu quả nhất với ${best.key} (${best.scoreRate}% / ${best.games} ván); khó khăn nhất với ${worst.key} (${worst.scoreRate}% / ${worst.games} ván).`,
      );
    }
  } else if (enough.length === 1) {
    lines.push(`Khai cuộc có đủ mẫu để đánh giá: ${enough[0].key} (${enough[0].scoreRate}% / ${enough[0].games} ván).`);
  }

  return lines;
}

export function rhythmCommentary(
  hours: { available: boolean; buckets: HourInsight[] },
  lengths: LengthInsight[],
): string[] {
  const lines: string[] = [];

  const hourBuckets = hours.buckets.filter((bucket) => bucket.games >= 3);
  if (hourBuckets.length >= 2) {
    const best = hourBuckets.reduce((acc, bucket) => (bucket.scoreRate > acc.scoreRate ? bucket : acc));
    const worst = hourBuckets.reduce((acc, bucket) => (bucket.scoreRate < acc.scoreRate ? bucket : acc));
    if (best.hour !== worst.hour) {
      lines.push(
        `Chơi hiệu quả nhất quanh ${best.hour}h (${best.scoreRate}% / ${best.games} ván) và kém nhất quanh ${worst.hour}h (${worst.scoreRate}% / ${worst.games} ván).`,
      );
    }
  }

  const lengthBuckets = lengths.filter((bucket) => bucket.games >= 3);
  if (lengthBuckets.length >= 2) {
    const best = lengthBuckets.reduce((acc, bucket) => (bucket.scoreRate > acc.scoreRate ? bucket : acc));
    const worst = lengthBuckets.reduce((acc, bucket) => (bucket.scoreRate < acc.scoreRate ? bucket : acc));
    if (best.label !== worst.label) {
      lines.push(
        `Theo độ dài ván: mạnh nhất ở nhóm “${best.label}” (${best.scoreRate}%), yếu nhất ở nhóm “${worst.label}” (${worst.scoreRate}%).`,
      );
    }
  }

  if (!lines.length && (hours.available || lengths.length > 0)) {
    lines.push("Chưa đủ dữ liệu theo khung giờ/độ dài để rút ra kết luận rõ ràng (cần thêm ván ở mỗi nhóm).");
  }

  return lines;
}
