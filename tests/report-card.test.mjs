import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReportCard,
  estimateEloFromAcpl,
  gradeForAcpl,
} from "../src/features/analysis/reportCard.ts";

test("estimated Elo giảm đơn điệu theo ACPL và bị chặn trong biên", () => {
  assert.ok(estimateEloFromAcpl(10) > estimateEloFromAcpl(40));
  assert.ok(estimateEloFromAcpl(40) > estimateEloFromAcpl(90));
  assert.equal(estimateEloFromAcpl(0), 2850);
  assert.ok(estimateEloFromAcpl(1000) >= 400);
  assert.equal(estimateEloFromAcpl(30), estimateEloFromAcpl(30));
});

test("hạng theo ACPL đúng ở các ngưỡng", () => {
  assert.equal(gradeForAcpl(20).grade, "A");
  assert.equal(gradeForAcpl(40).grade, "B");
  assert.equal(gradeForAcpl(60).grade, "C");
  assert.equal(gradeForAcpl(90).grade, "D");
  assert.equal(gradeForAcpl(91).grade, "E");
  assert.equal(gradeForAcpl(91).tone, "bad");
});

test("trả về null khi không có nước nào của màu được chấm", () => {
  const steps = [{ ply: 1, color: "w", phase: "Khai cuộc" }];
  assert.equal(buildReportCard(steps, {}, "w"), null);
  assert.equal(buildReportCard(steps, { 1: { centipawnLoss: 10, quality: "best" } }, "b"), null);
});

test("chỉ tính nước của đúng màu, gộp theo giai đoạn và lấy đúng firstIndex", () => {
  const steps = [
    { ply: 1, color: "w", phase: "Khai cuộc" },
    { ply: 2, color: "b", phase: "Khai cuộc" },
    { ply: 3, color: "w", phase: "Khai cuộc" },
    { ply: 4, color: "b", phase: "Trung cuộc" },
    { ply: 5, color: "w", phase: "Trung cuộc" },
    { ply: 6, color: "b", phase: "Trung cuộc" },
    { ply: 7, color: "w", phase: "Tàn cuộc" },
  ];
  const engineCache = {
    1: { centipawnLoss: 0, quality: "best" },
    3: { centipawnLoss: 20, quality: "good" },
    5: { centipawnLoss: 100, quality: "blunder" },
    7: { centipawnLoss: 40, quality: "inaccuracy" },
  };

  const card = buildReportCard(steps, engineCache, "w");
  assert.ok(card);
  assert.equal(card.moves, 4);
  assert.equal(card.acpl, 40);
  assert.equal(card.phases.length, 3);

  const opening = card.phases.find((phase) => phase.phase === "Khai cuộc");
  assert.equal(opening.moves, 2);
  assert.equal(opening.acpl, 10);
  assert.equal(opening.firstIndex, 0);

  const middle = card.phases.find((phase) => phase.phase === "Trung cuộc");
  assert.equal(middle.moves, 1);
  assert.equal(middle.acpl, 100);
  assert.equal(middle.grade, "E");
  assert.equal(middle.firstIndex, 4);
});

test("chỉ hiện các giai đoạn có dữ liệu và dựng tóm tắt best/worst", () => {
  const steps = [
    { ply: 1, color: "w", phase: "Khai cuộc" },
    { ply: 2, color: "w", phase: "Trung cuộc" },
  ];
  const engineCache = {
    1: { centipawnLoss: 5, quality: "best" },
    2: { centipawnLoss: 120, quality: "blunder" },
  };
  const card = buildReportCard(steps, engineCache, "w");
  assert.equal(card.phases.length, 2);
  assert.match(card.summary, /Tốt nhất ở khai cuộc/);
  assert.match(card.summary, /cần cải thiện trung cuộc/);
});
