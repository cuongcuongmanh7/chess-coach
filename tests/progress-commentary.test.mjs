import assert from "node:assert/strict";
import test from "node:test";
import {
  qualityCommentary,
  resultsCommentary,
  rhythmCommentary,
} from "../src/features/analysis/progressCommentary.ts";

const emptyStats = {
  games: 0, moves: 0, acpl: 0, bestGoodRate: 0, errors: 0,
  timeline: [], phases: [], colors: [], timeClasses: [], openings: [],
  weaknesses: [], timedMoves: 0, averageThinkTime: 0, quickErrors: 0, pressureErrors: 0,
};

test("qualityCommentary trả về rỗng khi chưa có nước nào", () => {
  assert.deepEqual(qualityCommentary(emptyStats), []);
});

test("qualityCommentary nêu ACPL, xu hướng, giai đoạn yếu và điểm yếu", () => {
  const stats = {
    ...emptyStats,
    games: 8, moves: 320, acpl: 45, bestGoodRate: 62, errors: 12,
    timeline: [
      { id: "1", date: "2026-01-01", acpl: 70 },
      { id: "2", date: "2026-01-02", acpl: 65 },
      { id: "3", date: "2026-01-03", acpl: 40 },
      { id: "4", date: "2026-01-04", acpl: 35 },
    ],
    phases: [
      { label: "Khai cuộc", moves: 120, acpl: 25, errors: 2 },
      { label: "Trung cuộc", moves: 140, acpl: 60, errors: 8 },
      { label: "Tàn cuộc", moves: 60, acpl: 40, errors: 2 },
    ],
    colors: [
      { label: "Cầm Trắng", moves: 160, acpl: 35, errors: 4 },
      { label: "Cầm Đen", moves: 160, acpl: 55, errors: 8 },
    ],
    weaknesses: [{ label: "Bỏ quân", count: 5 }, { label: "Bỏ lỡ chiếu hết", count: 3 }],
  };
  const lines = qualityCommentary(stats);
  assert.ok(lines[0].includes("45"), "phải nêu ACPL tổng");
  assert.ok(lines.some((line) => line.includes("tiến bộ")), "phải nhận ra xu hướng tiến bộ");
  assert.ok(lines.some((line) => line.includes("Trung cuộc") && line.includes("yếu nhất")), "phải chỉ ra giai đoạn yếu nhất");
  assert.ok(lines.some((line) => line.includes("Bỏ quân")), "phải liệt kê điểm yếu");
});

test("resultsCommentary đánh giá điểm số và khai cuộc", () => {
  const overall = { games: 20, wins: 12, draws: 3, losses: 5, scoreRate: 68 };
  const openings = [
    { key: "Sicilian", games: 8, wins: 6, draws: 1, losses: 1, scoreRate: 81 },
    { key: "French", games: 5, wins: 1, draws: 1, losses: 3, scoreRate: 30 },
  ];
  const lines = resultsCommentary(overall, openings);
  assert.ok(lines[0].includes("68%") && lines[0].includes("thắng nhiều hơn thua"));
  assert.ok(lines.some((line) => line.includes("Sicilian") && line.includes("French")));
});

test("rhythmCommentary cần đủ mẫu mỗi nhóm", () => {
  const hours = {
    available: true,
    buckets: [
      { hour: 9, games: 5, scoreRate: 70 },
      { hour: 23, games: 4, scoreRate: 35 },
    ],
  };
  const lengths = [
    { label: "Dưới 20 nước", games: 4, wins: 3, draws: 0, losses: 1, scoreRate: 75 },
    { label: "60+ nước", games: 3, wins: 0, draws: 1, losses: 2, scoreRate: 17 },
  ];
  const lines = rhythmCommentary(hours, lengths);
  assert.ok(lines.some((line) => line.includes("9h") && line.includes("23h")));
  assert.ok(lines.some((line) => line.includes("Dưới 20 nước") && line.includes("60+ nước")));
});
